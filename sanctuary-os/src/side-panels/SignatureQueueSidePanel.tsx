import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { supabase } from "../supabase";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { isDesktop } from "../utils/envUtils";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  HoverTooltip,
  cleanSearchName,
  getExtensionRegex,
  getModFallbackUrl,
  getModFallbackAuthor,
  ActionPill,
  GlassSegmentedControl,
  standardAccentGlassButtonClass,
  standardDangerButtonClass,
} from "../shared";
import { unpackBlueprintLoadOrder } from "../hooks/usePlaySetLogic";
import {
  deriveUserStagingToken,
  decryptStagingPayload,
  resolvePayloadDependencies,
  shredCloudStagingRow,
  ResolvedStagedArtifact,
  ResolvedStagedPayload,
} from "../utils/stagingCrypto";

export function SignatureQueueSidePanel({ equipPlaySet }: { equipPlaySet?: (index: number) => Promise<void> | void }) {
  const { t, importLexicon } = useLexicon();
  const { importTheme } = useTheme();
  const session = useStore((state) => state.session);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const vaultPath = useStore((state) => state.vaultPath);
  const modList = useStore((state) => state.modList) || [];
  const playSets = useStore((state) => state.playSets) || [];
  const setPlaySets = useStore((state) => state.setPlaySets);
  const activeGameSchema = useStore((state) => state.activeGameSchema);

  const {
    volatileSignatureQueue,
    setVolatileSignatureQueue,
    isSignatureQueueOpen,
    setIsSignatureQueueOpen,
    useInternalBrowser,
    setIsSideBrowserOpen,
    setSideBrowserUrl,
    setBrowserTabs,
    setActiveBrowserTabId,
  } = useModalStore();

  const [filterTab, setFilterTab] = useState<"ALL" | "OWNED" | "MISSING">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const notifiedRowIdsRef = useRef<Set<string>>(new Set());

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
    if (!session?.user?.id || !activeWorkspaceId || activeWorkspaceId === "default_workspace") {
      return;
    }

    try {
      const userToken = await deriveUserStagingToken(session.user.id, session.user.email);
      const { data, error } = await supabase
        .from("citizen_staging_queue")
        .select("*")
        .eq("user_token", userToken)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) return;

      if (!data || data.length === 0) {
        if (useModalStore.getState().volatileSignatureQueue) {
          setVolatileSignatureQueue(null);
        }
        return;
      }

      const row = data[0];
      const currentQueue = useModalStore.getState().volatileSignatureQueue as ResolvedStagedPayload | null;
      if (currentQueue && currentQueue.rowId === row.id) {
        return;
      }

      const decrypted = await decryptStagingPayload(
        row.encrypted_payload,
        row.iv,
        row.salt,
        session.user.id,
        session.user.email
      );

      if (!decrypted || !Array.isArray(decrypted.items)) return;

      // Resolve child dependencies in volatile memory
      const { mergedItems } = await resolvePayloadDependencies(decrypted.items);

      // Enrich missing metadata (url, author, paid, early_access) from Spoke DB in RAM
      const enrichedItems = [...mergedItems];
      const hashesToFetch = enrichedItems
        .filter((m) => m.hash && (!m.url || typeof m.is_paid === "undefined"))
        .map((m) => m.hash as string);

      if (hashesToFetch.length > 0) {
        const { data: vData } = await supabase
          .from("mod_versions")
          .select("dna_hash, mods(id, is_paid, is_early_access, url, master_author)")
          .in("dna_hash", hashesToFetch.slice(0, 60));

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

      const resolvedItems = matchItemsAgainstLocalVault(enrichedItems);
      const volatilePayload: ResolvedStagedPayload = {
        rowId: row.id,
        createdAt: row.created_at || decrypted.stagedAt || new Date().toISOString(),
        payload: {
          ...decrypted,
          items: enrichedItems,
        },
        resolvedItems,
      };

      setVolatileSignatureQueue(volatilePayload);

      if (isDesktop() && !notifiedRowIdsRef.current.has(row.id)) {
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
    } catch (err) {
      console.warn("Signature queue poll error:", err);
    }
  }, [session?.user?.id, session?.user?.email, activeWorkspaceId, matchItemsAgainstLocalVault, setVolatileSignatureQueue, t]);

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
  const ownedSelected = useMemo(
    () => selectedItems.filter((i) => i.isOwned && !i.asset_type),
    [selectedItems]
  );
  const missingSelected = useMemo(
    () => selectedItems.filter((i) => !i.isOwned && !i.asset_type),
    [selectedItems]
  );
  const depsCount = useMemo(() => resolvedItems.filter((i) => i.isDependency).length, [resolvedItems]);

  const filteredItems = useMemo(() => {
    return resolvedItems.filter((item) => {
      if (filterTab === "OWNED" && !item.isOwned && !item.asset_type) return false;
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

  const premiumItems = useMemo(
    () => filteredItems.filter((m) => m.is_paid || m.is_early_access),
    [filteredItems]
  );
  const standardItems = useMemo(
    () => filteredItems.filter((m) => !m.is_paid && !m.is_early_access),
    [filteredItems]
  );

  const openCreatorUrlsInBrowser = useCallback(
    (itemsToAcquire: ResolvedStagedArtifact[]) => {
      const urls: string[] = [];
      const seen = new Set<string>();

      itemsToAcquire
        .filter((m) => !m.asset_type)
        .forEach((mod) => {
          const targetUrl = getModFallbackUrl(
            mod.displayName || mod.name,
            mod.hash,
            activeGameSchema,
            { url: mod.url, author: mod.author }
          );
          if (targetUrl && !seen.has(targetUrl)) {
            seen.add(targetUrl);
            urls.push(targetUrl);
          }
        });

      if (urls.length === 0) return;

      if (useInternalBrowser && isDesktop()) {
        const newTabs = urls.slice(0, 12).map((u, idx) => ({
          id: `${Date.now()}_${idx}`,
          url: u,
          title: u,
          sleeping: idx !== 0,
        }));
        setBrowserTabs((prev: any[]) => [...prev, ...newTabs]);
        setActiveBrowserTabId(newTabs[0].id);
        setSideBrowserUrl(newTabs[0].url);
        setIsSideBrowserOpen(true);
      } else {
        urls.slice(0, 5).forEach((u) => {
          openUrl(u);
        });
      }
    },
    [activeGameSchema, useInternalBrowser, setBrowserTabs, setActiveBrowserTabId, setSideBrowserUrl, setIsSideBrowserOpen]
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
            const templatesDir = `${vaultPath}\\Data\\Templates`;
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

  const handleRejectAndShred = async () => {
    if (!queue) return;
    setIsProcessing(true);
    await shredCloudStagingRow(queue.rowId, session);
    setVolatileSignatureQueue(null);
    setIsSignatureQueueOpen(false);
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

      // 1. Immediately shred the cloud staging table record (Zero-Trace Guarantee)
      await shredCloudStagingRow(queue.rowId, session);

      // 2. Directly install any staged Nexus Assets (Lexicons, Chameleons, Templates)
      const installedAssetCount = await installStagedNexusAssets(stagedAssetItems);

      const nonAssetSelected = selectedItems.filter((i) => !i.asset_type);

      if (isBp && nonAssetSelected.length > 0) {
        let baseName = (queue.payload.blueprintName || "Staged Blueprint").trim();
        let finalName = baseName;
        let copyIndex = 1;
        while (playSets.some((s: any) => s.name.toLowerCase() === finalName.toLowerCase())) {
          finalName = `${baseName} (${copyIndex})`;
          copyIndex++;
        }

        const nameRemap = new Map<string, string>();
        const rawAvailableMods: string[] = [];
        const nextModHashes: Record<string, string> = {};
        const nextModMeta: Record<string, { url?: string; author?: string }> = {};

        nonAssetSelected.forEach((item) => {
          const cleanArtifactFile = (item.name || "").split(/[\\/]/).pop() || item.name;
          if (item.isOwned && item.localModName) {
            const resolvedClean = item.localModName.split(/[\\/]/).pop() || item.localModName;
            if (cleanArtifactFile) {
              nameRemap.set(cleanArtifactFile.toLowerCase(), resolvedClean);
            }
            rawAvailableMods.push(item.localModName);
            if (item.localHash) nextModHashes[item.localModName] = item.localHash;
          } else {
            if (item.hash) nextModHashes[item.name] = item.hash;
            if (item.url || item.author) {
              nextModMeta[item.name] = { url: item.url, author: item.author };
            }
          }
        });

        const { loadRules, modTiers, loadOrder, formatModWithTier } = unpackBlueprintLoadOrder(
          {
            mods: nonAssetSelected,
            load_rules: queue.payload.loadRules,
            mod_tiers: queue.payload.modTiers,
            load_order: queue.payload.loadOrder,
          },
          nameRemap,
          activeGameSchema
        );

        const availableMods = rawAvailableMods.map((mName) => formatModWithTier(mName));
        const readySet = {
          name: finalName,
          mods: availableMods,
          code: queue.payload.blueprintCode || undefined,
          modHashes: nextModHashes,
          modMeta: nextModMeta,
          loadRules,
          modTiers,
          loadOrder,
          ignoredGhosts: [],
        };

        const updatedSets = [...playSets, readySet];
        const newSetIndex = updatedSets.length - 1;
        setPlaySets(updatedSets);

        if (deployImmediately && equipPlaySet && availableMods.length > 0 && isDesktop()) {
          await equipPlaySet(newSetIndex);
        }

        if (missingSelected.length > 0) {
          openCreatorUrlsInBrowser(missingSelected);
        }

        useStore
          .getState()
          .pushStatus(
            t(
              "status_sig_queue_deployed",
              "Citizen Signature verified: Play Set deployed & cloud staging record shredded!"
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
              : t(
                  "status_sig_queue_browser_launched",
                  "Citizen Signature verified: Launching creator download pages & shredding cloud record!"
                ),
            "success"
          );
      }

      setVolatileSignatureQueue(null);
      setIsSignatureQueueOpen(false);
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

    return (
      <div
        key={`${mod.id}_${idx}`}
        className={`flex justify-between items-center glass-surface border p-4 rounded-2xl transition-all group shadow-md flex-wrap sm:flex-nowrap gap-3 ${
          mod.selected
            ? "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            : "border-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-50"
        }`}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => toggleItemSelection(mod.id)}
            className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
              mod.selected
                ? "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[var(--accent)] text-[var(--accent)]"
                : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-transparent"
            }`}
          >
            <span className="material-symbols-outlined !text-[14px]">
              {t("icon_check", "check")}
            </span>
          </button>

          {isBpMode && (
            <span className="px-2 py-1 rounded-md bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[9px] font-mono font-black text-[var(--subtext)] shrink-0">
              #{String((mod.load_order_index ?? idx) + 1).padStart(3, "0")}
            </span>
          )}

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-[var(--text)] capitalize truncate group-hover:theme-text-accent transition-colors">
                {cleanSearchName(mod.displayName || mod.name, activeGameSchema)}
              </span>

              {isNexusAsset ? (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-[8px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                  <span className="material-symbols-outlined !text-[10px]">
                    {t("icon_bolt", "bolt")}
                  </span>
                  {t("sig_queue_badge_direct_install", "Direct OS Install")}
                </span>
              ) : mod.isOwned ? (
                <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[8px] font-black text-[var(--success)] uppercase tracking-widest flex items-center gap-1 shrink-0">
                  <span className="material-symbols-outlined !text-[10px]">
                    {t("icon_check_circle", "check_circle")}
                  </span>
                  {t("sig_queue_badge_owned", "IN VAULT")}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[8px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1 shrink-0">
                  <span className="material-symbols-outlined !text-[10px]">
                    {t("icon_download", "download")}
                  </span>
                  {t("sig_queue_badge_missing", "ACQUIRE")}
                </span>
              )}

              {mod.isDependency && (
                <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/35 text-[8px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                  <span className="material-symbols-outlined !text-[10px]">
                    {t("icon_account_tree", "account_tree")}
                  </span>
                  {t("staging_badge_dependency", "Dependency")}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest">
                {customAuthor || t("unknown_mason", "Unknown Creator")}
              </span>
              {mod.dependencyOf && (
                <span className="text-[8px] font-bold text-cyan-400/80 capitalize tracking-wider">
                  • {t("staging_dep_of_prefix", "Required by")} {mod.dependencyOf}
                </span>
              )}
            </div>

            {(mod.is_paid || mod.is_early_access) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {mod.is_early_access && (
                  <div className="px-2 py-1 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-lg flex items-center gap-1 shadow-md">
                    <span className="material-symbols-outlined !text-[10px] text-purple-500">
                      {t("icon_science", "science")}
                    </span>
                    <span className="text-[8px] font-black capitalize tracking-[0.1em] text-purple-500">
                      {t("badge_early_access", "Early Access")}
                    </span>
                  </div>
                )}
                {mod.is_paid && (
                  <div className="px-2 py-1 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-lg flex items-center gap-1 shadow-md">
                    <span className="material-symbols-outlined !text-[10px] text-yellow-500">
                      {t("icon_monetization_on", "monetization_on")}
                    </span>
                    <span className="text-[8px] font-black capitalize tracking-[0.1em] text-yellow-500">
                      {t("badge_paid", "Paid")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => removeItemFromQueue(mod.id)}
            className="w-9 h-9 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-danger hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[16px]">
              {t("icon_close", "close")}
            </span>
            <HoverTooltip
              title={t("defcon_btn_skip", "Skip")}
              variant="danger"
              className="group-hover/btn:flex z-[200]"
            />
          </button>

          <button
            type="button"
            onClick={() => {
              if (useInternalBrowser && isDesktop()) {
                setSideBrowserUrl(targetUrl);
                setIsSideBrowserOpen(true);
              } else {
                openUrl(targetUrl);
              }
            }}
            className="w-9 h-9 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-accent hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[16px]">
              {t("icon_open_in_new", "open_in_new")}
            </span>
            <HoverTooltip
              title={t("import_intel", "Open Creator Page")}
              variant="default"
              className="group-hover/btn:flex z-[200]"
            />
          </button>
        </div>
      </div>
    );
  };

  return createPortal(
    <SidePanel
      isOpen={true}
      onClose={() => setIsSignatureQueueOpen(false)}
      title={t("sig_queue_title", "Signature Queue")}
      subtitle={t("sig_queue_subtitle", "Volatile In-Memory Resolution • Awaiting Citizen's Signature")}
      icon={t("icon_draw", "draw")}
      widthClass="w-full max-w-3xl"
      backdropZ="z-[100000]"
      panelZ="z-[100001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_delete_forever", "delete_forever")}
            tooltip={t("sig_queue_btn_reject_shred", "Reject & Shred")}
            variant="danger"
            disabled={isProcessing}
            onClick={handleRejectAndShred}
          />
          <PanelHeaderButton
            icon={isBpMode ? t("icon_rocket_launch", "rocket_launch") : t("icon_open_in_new", "open_in_new")}
            tooltip={
              isBpMode
                ? t("sig_queue_btn_deploy_blueprint", "Sign & Deploy Play Set")
                : t("sig_queue_btn_continue_browser", "Continue to Creator Pages")
            }
            variant="success"
            disabled={isProcessing || selectedItems.length === 0}
            onClick={() => handleSignAndExecute(true)}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Volatile Memory & Encryption Header Card */}
        <div className="glass-panel p-5 md:p-6 rounded-3xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex flex-col gap-4 relative overflow-hidden shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[9px] font-black text-[var(--success)] tracking-widest uppercase flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_memory", "memory")}
                </span>
                {t("sig_queue_volatile_badge", "VOLATILE RAM ONLY • 0 BYTES ON DISK")}
              </span>
              <span className="px-3 py-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[9px] font-black text-[var(--accent)] tracking-widest uppercase flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_encrypted", "encrypted")}
                </span>
                {t("sig_queue_encrypted_badge", "AES-256-GCM DECRYPTED")}
              </span>
            </div>
            <span className="text-[9px] font-bold text-[var(--subtext)] opacity-70 uppercase tracking-widest flex items-center gap-1">
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_phonelink", "phonelink")}
              </span>
              {queue.payload.sourceDevice || "PWA / Web"}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <input
                type="text"
                value={queue.payload.blueprintName || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setVolatileSignatureQueue((prev: ResolvedStagedPayload | null) =>
                    prev ? { ...prev, payload: { ...prev.payload, blueprintName: val } } : null
                  );
                }}
                placeholder={t("staging_payload_name_ph", "e.g. Weekend Loadout...")}
                className="bg-transparent text-2xl md:text-3xl font-black text-[var(--text)] tracking-tight focus:outline-none border-b border-transparent focus:border-[var(--accent)] transition-colors"
              />
              {queue.payload.notes && (
                <p className="text-xs text-[var(--subtext)] opacity-80 italic mt-1">
                  "{queue.payload.notes}"
                </p>
              )}
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-2 shrink-0 w-max">
              <span className="material-symbols-outlined !text-[16px]">
                {isBpMode ? t("icon_map", "map") : t("icon_download", "download")}
              </span>
              {isBpMode
                ? t("staging_mode_blueprint", "Curated Blueprint")
                : t("staging_mode_mod_queue", "Mod Download Queue")}
            </div>
          </div>

          {/* 3-Column Diff Summary */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="glass-surface p-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--success)_25%,transparent)] flex flex-col gap-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70">
                {t("sig_queue_stat_owned", "Owned in Vault")}
              </span>
              <span className="text-xl font-black text-[var(--success)] flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                {ownedSelected.length}
              </span>
            </div>

            <div className="glass-surface p-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex flex-col gap-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70">
                {t("sig_queue_stat_missing", "Missing Artifacts")}
              </span>
              <span className="text-xl font-black text-[var(--accent)] flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_download", "download")}
                </span>
                {missingSelected.length}
              </span>
            </div>

            <div className="glass-surface p-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70">
                {t("sig_queue_stat_deps", "Child Dependencies")}
              </span>
              <span className="text-xl font-black text-cyan-400 flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_account_tree", "account_tree")}
                </span>
                {depsCount}
              </span>
            </div>
          </div>

          {/* Clear Step-by-Step Explanation Box */}
          <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_info", "info")}
              </span>
              {t("sig_queue_what_happens_title", "What Happens When You Approve")}
            </span>
            <div className="flex flex-col gap-1.5 text-[11px] font-bold text-[var(--subtext)] leading-relaxed">
              {isBpMode && (
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined !text-[15px] text-[var(--success)] shrink-0 mt-0.5">
                    {t("icon_check_circle", "check_circle")}
                  </span>
                  <span>
                    {t(
                      "sig_queue_step_blueprint_desc",
                      "Saves this Play Set on your PC and automatically links any mods already in your Library."
                    )}
                  </span>
                </div>
              )}
              {stagedAssetItems.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined !text-[15px] text-emerald-400 shrink-0 mt-0.5">
                    {t("icon_bolt", "bolt")}
                  </span>
                  <span>
                    {t(
                      "sig_queue_step_assets_desc",
                      "Automatically installs selected Themes, Lexicons, and Templates directly into Sanctuary OS."
                    )}
                  </span>
                </div>
              )}
              {missingSelected.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0 mt-0.5">
                    {t("icon_open_in_new", "open_in_new")}
                  </span>
                  <span>
                    {t(
                      "sig_queue_step_browser_desc",
                      "Opens missing mods in the Side Panel Browser to their creators' official download pages."
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search & Filter Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <ActionPill
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchPlaceholder={t("search_artifacts", "Query Artifacts...")}
            />
          </div>
          <GlassSegmentedControl
            activeTab={filterTab}
            setTab={setFilterTab}
            options={[
              { id: "ALL", label: `${t("sig_queue_filter_all", "All")} (${resolvedItems.length})` },
              {
                id: "OWNED",
                label: `${t("sig_queue_filter_owned", "In Vault")} (${resolvedItems.filter((i) => i.isOwned).length})`,
              },
              {
                id: "MISSING",
                label: `${t("filter_missing", "Missing")} (${resolvedItems.filter((i) => !i.isOwned).length})`,
              },
            ]}
            className="shrink-0"
          />
        </div>

        {/* Premium / Early Access Notice Banner (Matches MissingImportsAlert) */}
        {premiumItems.some((m) => m.selected) && (
          <div className="flex items-center gap-3 p-4 glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-2xl bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] shadow-md">
            <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-yellow-500">
              <span className="material-symbols-outlined !text-[20px]">
                {t("icon_auto_fix_high", "auto_fix_high")}
              </span>
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-xs font-black text-yellow-500 capitalize tracking-widest">
                {t("premium_detected", "Premium Artifacts Detected")}
              </span>
              <span className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-wider opacity-80">
                {premiumItems.filter((m) => m.is_paid).length} {t("badge_paid", "Paid")},{" "}
                {premiumItems.filter((m) => m.is_early_access).length}{" "}
                {t("badge_early_access", "Early Access")}
              </span>
            </div>
            <button
              type="button"
              onClick={skipAllPremium}
              className="px-3 py-1.5 flex items-center gap-2 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-yellow-500 border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-xl transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_skip_next", "skip_next")}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest">
                {t("btn_skip_premium", "Skip Premium")}
              </span>
            </button>
          </div>
        )}

        {/* Item-by-Item Diff Queue */}
        <div className="flex flex-col gap-3">
          {premiumItems.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {premiumItems.map((m, i) => renderArtifactRow(m, i))}
            </div>
          )}

          {standardItems.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {premiumItems.length > 0 && (
                <div className="flex items-center gap-4 mt-2 mb-1">
                  <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                  <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest opacity-60">
                    {t("standard_artifacts", "Standard Artifacts")}
                  </span>
                  <div className="h-[1px] flex-1 bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] via-transparent to-transparent" />
                </div>
              )}
              {standardItems.map((m, i) => renderArtifactRow(m, i))}
            </div>
          )}
        </div>

        {/* Citizen Signature & Zero-Trace Shredding Footer Card */}
        <div className="glass-panel p-5 rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[10px] font-black text-[var(--accent)] uppercase tracking-widest">
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_verified_user", "verified_user")}
              </span>
              {t("sig_queue_shred_notice", "Approving or rejecting immediately shreds and wipes the temporary staging record from the cloud database.")}
            </div>
            {missingSelected.length > 0 && (
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-75 leading-relaxed">
                {t(
                  "sig_queue_no_asset_hosting_note",
                  "Zero Asset Hosting: Approved missing artifacts launch the integrated Side Panel Browser directly to the creators' official pages."
                )}
              </p>
            )}
          </div>

          {isBpMode ? (
            <div className="flex flex-col gap-2.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] w-full">
              <button
                type="button"
                disabled={isProcessing || selectedItems.length === 0}
                onClick={() => handleSignAndExecute(true)}
                className={`w-full py-3.5 px-6 rounded-xl font-black text-[10.5px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 shadow-lg ${standardAccentGlassButtonClass}`}
              >
                <span className="material-symbols-outlined !text-[17px]">
                  {t("icon_rocket_launch", "rocket_launch")}
                </span>
                {missingSelected.length > 0
                  ? t(
                      "sig_queue_btn_deploy_and_download",
                      "Deploy Play Set & Open Missing Downloads"
                    )
                  : t("sig_queue_btn_deploy_blueprint", "Sign & Deploy Blueprint")}
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                <button
                  type="button"
                  disabled={isProcessing || selectedItems.length === 0}
                  onClick={() => handleSignAndExecute(false)}
                  className="w-full py-3 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[var(--accent)] text-[var(--text)] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40"
                >
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                    {t("icon_save", "save")}
                  </span>
                  {t("sig_queue_btn_save_blueprint_only", "Save Play Set Only")}
                </button>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRejectAndShred}
                  className={`w-full py-3 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer ${standardDangerButtonClass}`}
                >
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_delete_forever", "delete_forever")}
                  </span>
                  {t("sig_queue_btn_reject_shred", "Reject & Shred")}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] w-full">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleRejectAndShred}
                className={`w-full py-3.5 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer ${standardDangerButtonClass}`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_delete_forever", "delete_forever")}
                </span>
                {t("sig_queue_btn_reject_shred", "Reject & Shred")}
              </button>

              <button
                type="button"
                disabled={isProcessing || selectedItems.length === 0}
                onClick={() => handleSignAndExecute(true)}
                className={`w-full py-3.5 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 shadow-lg ${standardAccentGlassButtonClass}`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_open_in_new", "open_in_new")}
                </span>
                {t("sig_queue_btn_continue_browser", "Continue to Creator Pages")}
              </button>
            </div>
          )}
        </div>
      </div>
    </SidePanel>,
    document.body
  );
}

