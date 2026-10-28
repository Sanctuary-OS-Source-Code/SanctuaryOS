import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
  handleOpenUrl,
  ActionPill,
  ActionButton,
  DashboardStatTile,
  SidePanelHeroCard,
  UniversalGroup,
  getModIcon,
  standardAccentGlassButtonClass,
  VAULT_CHIP_CLASS,
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

export function SignatureQueueSidePanel({
  equipPlaySet,
  onOpenDossier,
}: {
  equipPlaySet?: (index: number) => Promise<void> | void;
  onOpenDossier?: (mod: any) => void;
}) {
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
    setNexusPreviewAsset,
  } = useModalStore();

  const [filterTab, setFilterTab] = useState<"ALL" | "OWNED" | "MISSING">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditingBpTitle, setIsEditingBpTitle] = useState(false);
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
          handleOpenUrl(u);
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
            t("status_sig_queue_deployed", "{Citizen} Signature verified: {Blueprint} deployed & cloud staging record shredded!"),
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
              : t("status_sig_queue_browser_launched", "{Citizen} Signature verified: Launching creator download pages & shredding cloud record!"),
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
            ? "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
            : "border-[color-mix(in_srgb,var(--text)_6%,transparent)] opacity-55"
        }`}
      >
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
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

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUrl(targetUrl);
              }}
              className="w-8 h-8 shrink-0 flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] rounded-xl transition-all group/btn relative cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[15px]">
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
              className="w-8 h-8 shrink-0 flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] rounded-xl transition-all group/btn relative cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[15px]">
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

        <div className="flex items-center gap-1.5 flex-wrap pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          {isBpMode && (
            <span className={`${VAULT_CHIP_CLASS} font-mono`}>
              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                {t("icon_tag", "tag")}
              </span>
              <span>#{String((mod.load_order_index ?? idx) + 1).padStart(3, "0")}</span>
            </span>
          )}

          {isNexusAsset ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                {t("icon_bolt", "bolt")}
              </span>
              <span>{t("sig_queue_badge_direct_install", "Direct OS Install")}</span>
            </span>
          ) : mod.isOwned ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                {t("icon_check_circle", "check_circle")}
              </span>
              <span>{t("status_in_vault", "In {Vault}")}</span>
            </span>
          ) : (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
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
                ? t("sig_queue_btn_deploy_blueprint", "Sign & Deploy {Blueprint}")
                : t("sig_queue_btn_continue_browser", "Continue to Creator Pages")
            }
            variant="success"
            disabled={isProcessing || selectedItems.length === 0}
            onClick={() => handleSignAndExecute(true)}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-3.5 mt-2 relative z-10 w-full pb-8">
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
          badge={t("sig_queue_encrypted_badge", "AES-256-GCM DECRYPTED")}
          badgeIcon={t("icon_encrypted", "encrypted")}
          badges={
            depsCount > 0
              ? [
                  {
                    label: `${depsCount} ${t("section_deps_title", "Deps")}`,
                    icon: t("icon_account_tree", "account_tree"),
                  },
                ]
              : undefined
          }
          variant="accent"
        />

        {/* Filter Tiles & Search Bar */}
        <div className="flex flex-col gap-3 w-full">
          <div className="grid grid-cols-3 gap-3 w-full">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_list", "list")}
              label={t("filter_all", "All")}
              number={resolvedItems.length.toString()}
              isActive={filterTab === "ALL"}
              onClick={() => setFilterTab("ALL")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_check_circle", "check_circle")}
              label={t("sig_queue_filter_owned", "In Vault")}
              number={resolvedItems.filter((i) => i.isOwned).length.toString()}
              isActive={filterTab === "OWNED"}
              onClick={() => setFilterTab("OWNED")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_download", "download")}
              label={t("filter_missing", "Missing")}
              number={resolvedItems.filter((i) => !i.isOwned).length.toString()}
              isActive={filterTab === "MISSING"}
              onClick={() => setFilterTab("MISSING")}
            />
          </div>
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("search_ph", "Search {mods}...")}
          />
        </div>

        {/* Item-by-Item Diff Queue */}
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
              {premiumItems.map((m, i) => renderArtifactRow(m, i))}
            </div>
          </UniversalGroup>
        )}

        {standardItems.length > 0 && (
          <UniversalGroup
            title={`${t("standard_artifacts", "Standard {Mods}")} (${standardItems.length})`}
            icon={t("icon_extension", "extension")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {standardItems.map((m, i) => renderArtifactRow(m, i))}
            </div>
          </UniversalGroup>
        )}

        {/* Citizen Signature & Zero-Trace Shredding Footer Card */}
        <UniversalGroup
          title={t("sig_queue_title", "Citizen Signature")}
          icon={t("icon_verified_user", "verified_user")}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[10px] font-black text-[var(--accent)] uppercase tracking-widest">
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_verified_user", "verified_user")}
                </span>
                {t("sig_queue_shred_notice", "Approving or rejecting immediately shreds and wipes the temporary staging record from the cloud database.")}
              </div>
              {missingSelected.length > 0 && (
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-75 leading-relaxed">
                  {t("sig_queue_no_asset_hosting_note", "No Silent Downloads: Approved missing {mods} open directly on the creators' original download pages in the Side Panel Browser.")}
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
                    ? t("sig_queue_btn_deploy_and_download", "Deploy {Blueprint} & Open Missing Downloads")
                    : t("sig_queue_btn_deploy_blueprint", "Sign & Deploy {Blueprint}")}
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_save", "save")}
                    disabled={isProcessing || selectedItems.length === 0}
                    onClick={() => handleSignAndExecute(false)}
                    className="w-full justify-center !py-3"
                  >
                    {t("sig_queue_btn_save_blueprint_only", "Save {Blueprint} Only")}
                  </ActionButton>

                  <ActionButton
                    variant="danger"
                    icon={t("icon_delete_forever", "delete_forever")}
                    disabled={isProcessing}
                    onClick={handleRejectAndShred}
                    className="w-full justify-center !py-3"
                  >
                    {t("sig_queue_btn_reject_shred", "Reject & Shred")}
                  </ActionButton>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] w-full">
                <ActionButton
                  variant="danger"
                  icon={t("icon_delete_forever", "delete_forever")}
                  disabled={isProcessing}
                  onClick={handleRejectAndShred}
                  className="w-full justify-center !py-3.5"
                >
                  {t("sig_queue_btn_reject_shred", "Reject & Shred")}
                </ActionButton>

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
        </UniversalGroup>
      </div>
    </SidePanel>,
    document.body
  );
}
