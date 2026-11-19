import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../utils/envUtils";
import { resolvePayloadDependencies } from "../utils/stagingCrypto";
import { useLexicon } from "../LexiconContext";
import { supabase, submitThreatManifestToSpoke } from "../supabase";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import {
  deriveHumanReadableVersion,
  formatVersionRangesLabel,
  getFileLabel,
  getModIcon,
  SidePanel,
  stripPriorityTierPrefix,
  resolveModHighlanderSlot,
} from "../shared";
import { formatCleanModTitle } from "./CommandIncompatiblePanel";
import {
  checkDnaHashVerification,
  recordVerifiedCertificate,
  verifyKnownTier0CloudHashes,
} from "../components/LabVerificationGate";
import { groupModVersionPoolItems, ModVersionBinaryGroup } from "./VaultSidePanels";
import { fetchModLabReports } from "../components/KnownExceptionRules";
import { getModFallbackUrl, handleOpenUrl } from "../shared";
import type { MasonReleaseChannel } from "../utils/blueprintLockfile";
import {
  extractCleanUuid,
  isPlaceholderVersionStr,
  pickFirstValidAuthor,
  MOD_SELECT,
  spokeMetadataCache,
  getDossierTargetCacheKey,
  fetchSpokeModMetadata,
  buildVaultModIndex,
  mergeHydratedMod,
} from "../mod-dossier/dossierHelpersAndFetch";

import { useModDossierRelations } from "../hooks/useModDossierRelations";
import { useModDossierEquipAlerts } from "../hooks/useModDossierEquipAlerts";
import { buildModDossierHeaderActions, ModDossierMainContent } from "../components/mod-dossier/ModDossierMainContent";
import { ModDossierSecondaryDrawers } from "../components/mod-dossier/ModDossierSecondaryDrawers";
let cachedDossierVersionPoolItems: any[] | null = null;
let cachedDossierVersionPoolTimestamp = 0;

export default function ModDossier({
  mod: rawMod,
  modList,
  ownedDLC,
  maskedDLC,
  activePlaySet,
  onToggleInActiveSet,
  onShowYeetAlert,
  onClose,
  metaInputs,
  setMetaInputs,
  onSaveMetadata,
  onResetMetadata,
  onOpenMasonProfile,
  editMode,
  setEditMode,
  onSendToLab,
  onSecureShred,
  isCorrecting,
  setIsCorrecting,
  onSyncToNetwork,
}: any) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const storeModList = useStore((state: any) => state.modList);
  const selectedVersion = useStore((state: any) => state.selectedVersion);
  const storePlaySets = useStore((state: any) => state.playSets);
  const anarchyRules = useStore((state: any) => state.anarchyRules);
  const storeOwnedDLC = useStore((state: any) => state.ownedDLC);
  const storeMaskedDLC = useStore((state: any) => state.maskedDLC);
  const effectiveOwnedDLC: string[] = Array.isArray(ownedDLC) ? ownedDLC : Array.isArray(storeOwnedDLC) ? storeOwnedDLC : [];
  const effectiveMaskedDLC: string[] = Array.isArray(maskedDLC) ? maskedDLC : Array.isArray(storeMaskedDLC) ? storeMaskedDLC : [];
  const [dossierAlertPending, setDossierAlertPending] = useState<any | null>(null);
  const allAvailableMods = useMemo(() => {
    const combined: any[] = [];
    const seen = new Set<string>();
    for (const src of [modList || [], storeModList || []]) {
      for (const m of src) {
        if (!m) continue;
        const key = `${m.name || ""}::${m.hash || ""}::${m.dbId || ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(m);
        }
      }
    }
    return combined;
  }, [modList, storeModList]);

  const vaultIndex = useMemo(
    () => buildVaultModIndex(allAvailableMods),
    [allAvailableMods]
  );

  const requireScoutLabTest =
    activeGameSchema?.lab_verification?.require_for_scout_approval !== false;
  const mustPassLabForScout =
    Boolean(rawMod?.is_unknown || !rawMod?.isSynced) || requireScoutLabTest;
  const session = useStore((state) => state.session);
  const [isDossierOpen, setIsDossierOpen] = useState(true);
  const [isModLabVerified, setIsModLabVerified] = useState<boolean>(false);
  const [hydratedMeta, setHydratedMeta] = useState<any | null>(() => {
    const k = getDossierTargetCacheKey(rawMod);
    return k ? spokeMetadataCache.get(k) || null : null;
  });
  const [kidHydratedMeta, setKidHydratedMeta] = useState<any | null>(null);
  const [relationDbMap, setRelationDbMap] = useState<Record<string, any>>({});
  const [collectionFilter, setCollectionFilter] = useState<"all" | "in_vault" | "missing">("all");
  const [collectionSearchQuery, setCollectionSearchQuery] = useState<string>("");
  const deferredCollectionSearch = React.useDeferredValue(collectionSearchQuery);
  const [collectionEquipFilter, setCollectionEquipFilter] = useState<"ALL" | "EQUIPPED" | "UNEQUIPPED">("ALL");
  const [collectionCategoryFilter, setCollectionCategoryFilter] = useState<string>("ALL");
  const [collectionStatusFilter, setCollectionStatusFilter] = useState<string>("ALL");

  const [kidCollectionFilter, setKidCollectionFilter] = useState<"all" | "in_vault" | "missing">("all");
  const [kidSearchQuery, setKidSearchQuery] = useState<string>("");
  const deferredKidSearch = React.useDeferredValue(kidSearchQuery);
  const [kidEquipFilter, setKidEquipFilter] = useState<"ALL" | "EQUIPPED" | "UNEQUIPPED">("ALL");
  const [kidCategoryFilter, setKidCategoryFilter] = useState<string>("ALL");
  const [kidStatusFilter, setKidStatusFilter] = useState<string>("ALL");

  const [versionPoolItems, setVersionPoolItems] = useState<any[]>(
    () => cachedDossierVersionPoolItems || []
  );
  const [selectedVersionGroupKeys, setSelectedVersionGroupKeys] = useState<string[]>([]);
  const [visibleKidsLimit, setVisibleKidsLimit] = useState<number>(30);
  const kidsSentinelRef = React.useRef<HTMLDivElement | null>(null);

  const loadDossierVersionPool = React.useCallback(async (forceRefresh = false) => {
    if (!isDesktop()) return;
    if (
      !forceRefresh &&
      cachedDossierVersionPoolItems &&
      Date.now() - cachedDossierVersionPoolTimestamp < 60000
    ) {
      setVersionPoolItems(cachedDossierVersionPoolItems);
      return;
    }
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (vaultPath) {
        const res: any = await invoke("get_mod_version_pool_status", { vaultPath });
        if (res && Array.isArray(res.items)) {
          cachedDossierVersionPoolItems = res.items;
          cachedDossierVersionPoolTimestamp = Date.now();
          React.startTransition(() => {
            setVersionPoolItems(res.items);
          });
        }
      }
    } catch { }
  }, []);

  useEffect(() => {
    if (isDossierOpen && isDesktop()) {
      const timer = setTimeout(() => {
        loadDossierVersionPool(false);
      }, 220);
      return () => clearTimeout(timer);
    } else if (!isDossierOpen) {
      setSelectedVersionGroupKeys([]);
    }
  }, [isDossierOpen, rawMod?.id, rawMod?.dbId, rawMod?.hash, rawMod?.name, loadDossierVersionPool]);

  const handleActivateDossierVersion = async (relPath: string, dnaHash: string) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("activate_archived_mod_version", {
        vaultPath,
        relPath,
        dnaHash,
      });
      await loadDossierVersionPool(true);
    } catch { }
  };

  const handleDeleteDossierVersion = async (relPath: string, dnaHash: string) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("delete_archived_mod_version", {
        vaultPath,
        relPath,
        dnaHash,
      });
      await loadDossierVersionPool(true);
    } catch { }
  };

  const filterVersionGroupsForTarget = React.useCallback(
    (targetObj: any): ModVersionBinaryGroup[] => {
      if (!targetObj || versionPoolItems.length === 0) return [];
      const relPaths = new Set<string>();
      const fileNames = new Set<string>();
      const hashes = new Set<string>();

      const registerCandidate = (item: any) => {
        if (!item) return;
        if (item.hash) hashes.add(String(item.hash).toLowerCase());
        const rawName = String(item.name || "");
        if (rawName && !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(rawName)) {
          const normRel = rawName.replace(/\\/g, "/").toLowerCase();
          relPaths.add(normRel);
          const base = normRel.split("/").pop();
          if (base) fileNames.add(base);
        }
      };

      registerCandidate(targetObj);
      if (Array.isArray(targetObj.flavors)) targetObj.flavors.forEach(registerCandidate);
      if (Array.isArray(targetObj._groupedMods)) targetObj._groupedMods.forEach(registerCandidate);

      if (relPaths.size === 0 && fileNames.size === 0 && hashes.size === 0) {
        return [];
      }

      const matchedPoolItems = versionPoolItems.filter((item: any) => {
        if (!item) return false;
        const h = item.dna_hash ? String(item.dna_hash).toLowerCase() : "";
        if (h && hashes.has(h)) return true;
        const rawRel = String(item.rel_path || "").replace(/\\/g, "/").toLowerCase();
        if (rawRel && relPaths.has(rawRel)) return true;
        const base = rawRel.split("/").pop() || rawRel;
        return Boolean(base && fileNames.has(base));
      });

      if (matchedPoolItems.length === 0) return [];
      return groupModVersionPoolItems(matchedPoolItems, t);
    },
    [versionPoolItems, t]
  );

  const [activeVersionModalGroups, setActiveVersionModalGroups] = useState<ModVersionBinaryGroup[]>([]);

  const selectedVersionGroups = useMemo(() => {
    if (selectedVersionGroupKeys.length === 0) return [];
    const matchedFromActive = activeVersionModalGroups.filter((g) =>
      selectedVersionGroupKeys.includes(g.key)
    );
    if (matchedFromActive.length > 0) return matchedFromActive;
    const rawMatched = versionPoolItems.filter((item: any) => {
      const rawRel = String(item?.rel_path || "").replace(/\\/g, "/");
      const fileName = (rawRel.split("/").pop() || rawRel).toLowerCase();
      return selectedVersionGroupKeys.includes(fileName);
    });
    return groupModVersionPoolItems(rawMatched, t);
  }, [selectedVersionGroupKeys, activeVersionModalGroups, versionPoolItems, t]);

  useEffect(() => {
    const cached = getDossierTargetCacheKey(rawMod)
      ? spokeMetadataCache.get(getDossierTargetCacheKey(rawMod)) || null
      : null;
    setHydratedMeta(cached);
    setCollectionFilter("all");
    setCollectionSearchQuery("");
    setCollectionEquipFilter("ALL");
    setCollectionCategoryFilter("ALL");
    setCollectionStatusFilter("ALL");
    setVisibleKidsLimit(30);
    if (!rawMod || cached) return;
    let cancelled = false;
    fetchSpokeModMetadata(rawMod, t)
      .then((res) => {
        if (!cancelled && res) {
          React.startTransition(() => {
            setHydratedMeta(res);
          });
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [rawMod?.id, rawMod?.dbId, rawMod?.hash, rawMod?.name]);

  const mod = useMemo(
    () => mergeHydratedMod(rawMod, hydratedMeta, vaultIndex, t),
    [rawMod, hydratedMeta, vaultIndex, t]
  );

  const combinedDbMap = useMemo(
    () => ({
      ...(hydratedMeta?.hydratedByIdMap || {}),
      ...relationDbMap,
    }),
    [hydratedMeta?.hydratedByIdMap, relationDbMap]
  );

  useEffect(() => {
    if (!mod?.hash) {
      setIsModLabVerified(false);
      return;
    }
    checkDnaHashVerification(mod.hash).then((res) => {
      setIsModLabVerified(res.verified);
    });
  }, [mod?.hash]);

  const handleClose = () => {
    setIsDossierOpen(false);
    setTimeout(() => {
      if (onClose) onClose();
    }, 500);
  };

  const [selectedKid, setSelectedKid] = useState<any | null>(null);
  const [displayedKid, setDisplayedKid] = useState<any | null>(null);
  useEffect(() => {
    if (selectedKid) setDisplayedKid(selectedKid);
  }, [selectedKid]);
  const rawKidToRender = selectedKid || displayedKid;

  const handleInspectKid = React.useCallback((target: any) => {
    setSelectedKid(target);
  }, []);

  useEffect(() => {
    const cached = getDossierTargetCacheKey(rawKidToRender)
      ? spokeMetadataCache.get(getDossierTargetCacheKey(rawKidToRender)) || null
      : null;
    setKidHydratedMeta(cached);
    setKidCollectionFilter("all");
    setKidSearchQuery("");
    setKidEquipFilter("ALL");
    setKidCategoryFilter("ALL");
    setKidStatusFilter("ALL");
    if (!rawKidToRender || cached) return;
    let cancelled = false;
    fetchSpokeModMetadata(rawKidToRender, t)
      .then((res) => {
        if (!cancelled && res) {
          React.startTransition(() => {
            setKidHydratedMeta(res);
          });
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [
    rawKidToRender?.id,
    rawKidToRender?.dbId,
    rawKidToRender?.hash,
    rawKidToRender?.name,
    rawKidToRender?._groupedTitle,
  ]);

  const kidToRender = useMemo(() => {
    if (!rawKidToRender) return null;
    const preHydratedId = extractCleanUuid(
      rawKidToRender.dbId,
      rawKidToRender.id,
      rawKidToRender.baseFamilyId,
      rawKidToRender.name
    );
    const fromRelMap = preHydratedId ? combinedDbMap[preHydratedId.toLowerCase()] : null;
    return mergeHydratedMod(
      rawKidToRender,
      kidHydratedMeta || fromRelMap,
      vaultIndex,
      t
    );
  }, [rawKidToRender, kidHydratedMeta, combinedDbMap, vaultIndex, t]);
  const [isSaving, setIsSaving] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [canReconfigureInstaller, setCanReconfigureInstaller] = useState(false);
  const [isReconfiguringInstaller, setIsReconfiguringInstaller] = useState(false);
  const [isResolvingDeps, setIsResolvingDeps] = useState(false);
  const [subscribedChannel, setSubscribedChannel] = useState<MasonReleaseChannel>(
    () => (mod?.subscribed_channel as MasonReleaseChannel) || "stable"
  );
  const isNexusView = mod?.isNexusView;
  const targetDbId =
    mod?.dbId ||
    (isNexusView &&
      mod?.id &&
      String(mod.id).match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
      ? mod.id
      : null);
  const [isBanned, setIsBanned] = useState(false);
  const [, setBanReason] = useState("");

  useEffect(() => {
    if (session?.user?.id) {
      supabase
        .from("profiles")
        .select("is_comm_banned, comm_blacklist_reason")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          if (data?.is_comm_banned) {
            setIsBanned(true);
            setBanReason(data.comm_blacklist_reason || "Communications Ban");
          }
        });
    }
  }, [session]);

  const [localCreatedAt, setLocalCreatedAt] = useState<string | null>(
    mod?.created_at || null
  );
  const [localUpdatedAt, setLocalUpdatedAt] = useState<string | null>(
    mod?.updated_at || null
  );
  const showImages = useStore((state: any) => state.showImages);
  const [localCategory, setLocalCategory] = useState<string>(
    mod?.category_override || mod?.category || mod?.type || ""
  );
  const [localCompatibleVersions, setLocalCompatibleVersions] = useState<
    string[]
  >(mod?.compatible_versions || []);

  useEffect(() => {
    if (mod) {
      setLocalCreatedAt(mod.created_at || null);
      setLocalUpdatedAt(mod.updated_at || null);
      setLocalCategory(mod.category_override || mod.category || mod.type || "");
      setLocalCompatibleVersions(mod.compatible_versions || []);
    }
  }, [mod]);

  const userRole = useStore((state: any) => state.userRole);
  const {
    stagingDraftItems,
    setStagingDraftItems,
    toggleModInStagingDraft,
  } = useModalStore(
    useShallow((s) => ({
      stagingDraftItems: s.stagingDraftItems,
      setStagingDraftItems: s.setStagingDraftItems,
      toggleModInStagingDraft: s.toggleModInStagingDraft,
    }))
  );

  const [dossierLabReports, setDossierLabReports] = useState<any[]>([]);

  useEffect(() => {
    const cleanId = extractCleanUuid(
      mod?.dbId || mod?.cloudModId || mod?.mod_id || mod?.id || ""
    );
    if (!cleanId) {
      setDossierLabReports([]);
      return;
    }
    let cancelled = false;
    fetchModLabReports(cleanId, 5).then((rows) => {
      if (!cancelled) setDossierLabReports(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [mod?.dbId, mod?.cloudModId, mod?.mod_id, mod?.id]);

  useEffect(() => {
    if (!mod) {
      setRelationDbMap({});
      return;
    }
    const alreadyHydrated = hydratedMeta?.hydratedByIdMap || {};
    const candidateSet = new Set<string>();
    const addEntry = (item: any) => {
      if (!item) return;
      const raw =
        typeof item === "string" ? item : item.id || item.dbId || item.hash || "";
      const u = extractCleanUuid(raw);
      if (u) {
        const lower = u.toLowerCase();
        if (!alreadyHydrated[lower] && !vaultIndex.byUuid.has(lower)) {
          candidateSet.add(lower);
        }
      }
    };
    (mod.requirements || mod.requires || []).forEach(addEntry);
    (mod.twins || []).forEach(addEntry);
    if (Array.isArray(mod.flavors)) {
      mod.flavors.forEach((fl: any) => {
        (fl?.requirements || fl?.requires || []).forEach(addEntry);
        (fl?.twins || []).forEach(addEntry);
      });
    }
    const uuids = Array.from(candidateSet).slice(0, 40);
    if (uuids.length === 0) return;

    let cancelled = false;
    supabase
      .from("mods")
      .select(MOD_SELECT)
      .in("id", uuids)
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return;
        const map: Record<string, any> = {};
        for (const row of data) {
          if (!row?.id) continue;
          const latestVer =
            Array.isArray(row.mod_versions) && row.mod_versions.length > 0
              ? row.mod_versions[0]
              : null;
          const resolvedAuthor = pickFirstValidAuthor(t, row) || undefined;
          map[String(row.id).toLowerCase()] = {
            dbId: row.id,
            name: row.name,
            hash: latestVer?.dna_hash || undefined,
            author: resolvedAuthor,
            master_author: resolvedAuthor,
            mason_id: row.mason_id || undefined,
            category_override: row.category_override || undefined,
            description: row.description || undefined,
            url: row.url || undefined,
            image_url: row.image_url || undefined,
            compatible_versions: row.compatible_versions || undefined,
            created_at: row.created_at || latestVer?.created_at || undefined,
            updated_at: latestVer?.created_at || row.created_at || undefined,
            version: latestVer?.version_label || undefined,
            status: row.status || "stable",
            status_reason: row.status_reason || undefined,
            compliance_tier: row.compliance_tier ?? undefined,
            is_paid: Boolean(row.is_paid),
            is_early_access: Boolean(row.is_early_access),
            mod_versions: row.mod_versions || undefined,
          };
        }
        React.startTransition(() => {
          setRelationDbMap(map);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [mod?.dbId, mod?.id, mod?.hash, mod?.requirements, mod?.twins, mod?.flavors, hydratedMeta?.hydratedByIdMap, vaultIndex, t]);

  const activeMods = activePlaySet?.mods || [];

  const equippedLookup = useMemo(() => {
    const exact = new Set<string>();
    const lowerRel = new Set<string>();
    const baseNames = new Set<string>();
    for (const rawEntry of activeMods) {
      if (!rawEntry || typeof rawEntry !== "string") continue;
      exact.add(rawEntry);
      const norm = rawEntry.replace(/\\/g, "/").toLowerCase();
      lowerRel.add(norm);
      const stripped = stripPriorityTierPrefix(rawEntry, activeGameSchema);
      if (stripped) {
        exact.add(stripped);
        lowerRel.add(stripped.replace(/\\/g, "/").toLowerCase());
      }
      const base = (rawEntry.split(/[\\/]/).pop() || rawEntry).toLowerCase();
      if (base) baseNames.add(base);
    }
    return { exact, lowerRel, baseNames };
  }, [activeMods, activeGameSchema]);

  const isModNameEquipped = React.useCallback(
    (name: any): boolean => {
      if (!name || typeof name !== "string") return false;
      if (/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(name)) return false;
      if (equippedLookup.exact.has(name)) return true;
      const norm = name.replace(/\\/g, "/").toLowerCase();
      if (equippedLookup.lowerRel.has(norm)) return true;
      const stripped = stripPriorityTierPrefix(name, activeGameSchema);
      if (
        stripped &&
        (equippedLookup.exact.has(stripped) ||
          equippedLookup.lowerRel.has(stripped.replace(/\\/g, "/").toLowerCase()))
      ) {
        return true;
      }
      const base = (name.split(/[\\/]/).pop() || name).toLowerCase();
      if (base && base.includes(".") && equippedLookup.baseNames.has(base)) {
        return true;
      }
      return false;
    },
    [equippedLookup, activeGameSchema]
  );

  const {
    buildGroupedCollectionModules,
    groupedKids,
    inVaultKidsCount,
    missingKidsCount,
    isKidGroupEquipped,
    resolveKidCategoryKey,
    filteredGroupedKids,
    visibleGroupedKids,
    collectionFilterPopoverContent,
    groupedRelations,
  } = useModDossierRelations({
    t,
    vaultIndex,
    collectionFilter,
    deferredCollectionSearch,
    collectionEquipFilter,
    setCollectionEquipFilter,
    collectionCategoryFilter,
    setCollectionCategoryFilter,
    collectionStatusFilter,
    setCollectionStatusFilter,
    setVisibleKidsLimit,
    visibleKidsLimit,
    kidsSentinelRef,
    mod,
    combinedDbMap,
    isNexusView,
    isModNameEquipped,
  });
  const isSingleItemStaged = (target: any) => {
    if (!target) return false;
    const targetId = String(target.id || target.dbId || "").toLowerCase();
    const targetHash = String(
      target.hash || target.mod_versions?.[0]?.dna_hash || ""
    ).toLowerCase();
    const targetName = String(target.name || target.displayName || "").toLowerCase();
    return stagingDraftItems.some((item: any) => {
      const itemId = String(item.id || item.dbId || item.mod_id || "").toLowerCase();
      const itemHash = String(item.hash || item.dna_hash || "").toLowerCase();
      const itemName = String(item.name || item.displayName || "").toLowerCase();
      return (
        (targetId && itemId === targetId) ||
        (targetHash && itemHash && itemHash === targetHash) ||
        (targetName && itemName === targetName)
      );
    });
  };

  const isModStaged = (() => {
    if (!mod) return false;
    const childList = Array.isArray(mod.flavors) ? mod.flavors : [];
    if (
      (mod.isParent || mod.isVirtual || mod.isCollection || childList.length > 1) &&
      childList.length > 0
    ) {
      return childList.every((c: any) => isSingleItemStaged(c));
    }
    return isSingleItemStaged(mod);
  })();

  const handleStageTargetToPc = async (target: any, currentlyStaged: boolean) => {
    const added = toggleModInStagingDraft(target);
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
        return;
      }
    }
    useStore
      .getState()
      .pushStatus(
        currentlyStaged
          ? t("status_staging_item_removed", "Removed from Remote Staging Queue.")
          : t("status_staging_item_added", "Added to Remote Staging Queue.")
      );
  };

  useEffect(() => {
    if (!isDesktop() || isNexusView || !mod || mod.isVirtual) {
      setCanReconfigureInstaller(false);
      return;
    }
    const vaultPath = useStore.getState().vaultPath;
    const modRelPath = String(mod.physical_path || mod.name || "").trim();
    if (!vaultPath || !modRelPath) {
      setCanReconfigureInstaller(false);
      return;
    }
    let cancelled = false;
    invoke<boolean>("can_reconfigure_mod_installer", {
      vaultPath,
      modRelPath,
    })
      .then((res) => {
        if (!cancelled) setCanReconfigureInstaller(Boolean(res));
      })
      .catch(() => {
        if (!cancelled) setCanReconfigureInstaller(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mod?.name, mod?.physical_path, mod?.isVirtual, isNexusView]);

  const edgeManifestUrlResolved = useMemo(() => {
    if (metaInputs?.manifest_url?.trim()) return metaInputs.manifest_url.trim();
    if (mod?.manifest_url) return String(mod.manifest_url).trim();
    if (mod?.static_manifest_url) return String(mod.static_manifest_url).trim();
    try {
      const edgeLogic = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      if (mod?.hash && edgeLogic[mod.hash]?.manifest_url) {
        return String(edgeLogic[mod.hash].manifest_url).trim();
      }
    } catch {}
    return "";
  }, [metaInputs?.manifest_url, mod?.manifest_url, mod?.static_manifest_url, mod?.hash]);

  const hasEdgeChannelSupport = Boolean(
    isDesktop() && !isNexusView && (edgeManifestUrlResolved || mod?.channels)
  );

  const handleChangeSubscribedChannel = async (nextCh: MasonReleaseChannel) => {
    setSubscribedChannel(nextCh);
    const vaultPath = useStore.getState().vaultPath;
    const artifactId = String(mod?.id || mod?.hash || mod?.name || "").trim();
    if (!vaultPath || !artifactId) return;
    try {
      await invoke("set_edge_subscribed_channel", {
        vaultPath,
        artifactId,
        channel: nextCh,
      });
      await invoke("fetch_and_sync_edge_manifest", {
        vaultPath,
        artifactId,
      }).catch(() => null);
      useStore
        .getState()
        .pushStatus(
          `${t("release_notes_meta_channel", "Channel")}: ${nextCh}`,
          "success"
        );
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    }
  };

  const handleReconfigureInstaller = async () => {
    const vaultPath = useStore.getState().vaultPath;
    const modRelPath = String(mod?.physical_path || mod?.name || "").trim();
    if (!isDesktop() || !vaultPath || !modRelPath || isReconfiguringInstaller) return;
    setIsReconfiguringInstaller(true);
    try {
      const plan = await invoke<any>("reopen_mod_installer_wizard", {
        vaultPath,
        modRelPath,
      });
      if (plan) {
        useModalStore.getState().enqueueInstallerWizard(plan);
        handleClose();
      }
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    } finally {
      setIsReconfiguringInstaller(false);
    }
  };

  const unresolvedRequirements = useMemo(() => {
    return (groupedRelations || []).filter((rel: any) => {
      if (rel?.relationType !== "requirement") return false;
      if (!rel?.isInstalled) return true;
      const kidsArr = Array.isArray(rel?._groupedMods) ? rel._groupedMods : [rel];
      return kidsArr.some((gm: any) => gm?.name && !isModNameEquipped(gm.name));
    });
  }, [groupedRelations, isModNameEquipped]);

  const handleResolveDependencies = async () => {
    if (isResolvingDeps || unresolvedRequirements.length === 0) return;
    setIsResolvingDeps(true);
    try {
      const toDownload: any[] = [];
      for (const rel of unresolvedRequirements) {
        if (rel.isInstalled) {
          await safeToggleGroup(rel);
        } else {
          const targetUrl =
            String(rel.download_url || "").trim() ||
            getModFallbackUrl(rel.name || rel.displayName || "", rel.hash, activeGameSchema, {
              url: rel.url,
              author: rel.author,
            });
          toDownload.push({
            id: String(rel.dbId || rel.hash || rel.name || rel._groupedTitle),
            name: String(rel.displayName || rel.name || rel._groupedTitle || "Dependency"),
            download_url: targetUrl,
            fallback_url: targetUrl,
            expected_sha256: rel.hash || null,
            target_folder: null,
            force_replace: false,
            fomod_selections: null,
            hidden_files: null,
          });
        }
      }

      if (toDownload.length > 0) {
        if (!isDesktop()) {
          handleOpenUrl(toDownload[0].download_url);
        } else {
          const report = await invoke<{
            hydrated_ids: string[];
            wizard_plans: any[];
            gated_browser_items: { id: string; name: string; url: string; reason: string }[];
            failed_items: { id: string; name: string; reason: string }[];
          }>("hydrate_blueprint_lockfile_batch", {
            items: toDownload,
            configDeltas: null,
            concurrency: 4,
          });

          const mStore = useModalStore.getState();
          if (Array.isArray(report?.wizard_plans)) {
            for (const wp of report.wizard_plans) {
              mStore.enqueueInstallerWizard(wp);
            }
          }
          if (report?.hydrated_ids?.length > 0) {
            window.dispatchEvent(new CustomEvent("sanctuary-trigger-radar-sweep"));
            useStore
              .getState()
              .pushStatus(
                `${t("resolved", "Resolved")}: ${report.hydrated_ids.length}`,
                "success"
              );
          }
          if (Array.isArray(report?.gated_browser_items) && report.gated_browser_items.length > 0) {
            mStore.startGuidedBrowserQueue(
              report.gated_browser_items.map((g) => ({
                id: g.id,
                name: g.name,
                url: g.url,
                status: "pending" as const,
              }))
            );
            mStore.setIsSideBrowserOpen(true);
          }
        }
      }
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    } finally {
      setIsResolvingDeps(false);
    }
  };

  if (!mod) return null;

  const hasExplicitStatus =
    mod.status &&
    mod.status.trim() !== "" &&
    mod.status.toLowerCase() !== "local folder" &&
    mod.status.toLowerCase() !== "local node";
  const statusType = hasExplicitStatus
    ? mod.status.toLowerCase()
    : !mod.dbId || mod.version?.toLowerCase() === "v.local"
      ? "local"
      : (mod.status || "").toLowerCase();

  const kids = mod.flavors || [];
  const isCollection = mod.isCollection;

  const localOverrides = JSON.parse(
    localStorage.getItem("sanctuary_local_overrides") || "{}"
  );
  const hasOverrides = !!localOverrides[mod.hash];

  const getVersions = (target: any) => {
    const v = target.compatible_versions;
    return typeof v === "string"
      ? v.split(",").map((s: string) => s.trim())
      : v || [];
  };

  const modVersionsList = getVersions(mod);
  let familyVersion = "Unknown";
  if (mod.isVirtual) {
    const flavorRules = (mod.flavors || [])
      .flatMap((f: any) => getVersions(f))
      .filter(
        (v: string) =>
          v &&
          v !== "Unknown" &&
          v !== "ALL" &&
          v !== "ANY" &&
          v.toLowerCase() !== "global"
      );
    familyVersion =
      flavorRules.length > 0
        ? formatVersionRangesLabel(flavorRules)
        : modVersionsList.length > 0
          ? formatVersionRangesLabel(modVersionsList)
          : "Unknown";
  } else {
    familyVersion =
      modVersionsList.length > 0
        ? formatVersionRangesLabel(modVersionsList)
        : "Unknown";
  }

  const {
    allEquippableManifestNames,
    allEquipped,
    safeToggle,
    safeToggleGroup,
    handleToggleAll,
  } = useModDossierEquipAlerts({
    onToggleInActiveSet,
    activeGameSchema,
    selectedVersion,
    storePlaySets,
    anarchyRules,
    effectiveOwnedDLC,
    effectiveMaskedDLC,
    setDossierAlertPending,
    vaultIndex,
    mod,
    selectedKid,
    setSelectedKid,
    isModNameEquipped,
    groupedKids,
    groupedRelations,
    kids,
    getVersions,
    familyVersion,
  });

  const handleSave = async () => {
    setIsSaving(true);
    const normStatus = String(metaInputs.status || "").toLowerCase().trim();
    await onSaveMetadata({
      created_at: localCreatedAt,
      updated_at: localUpdatedAt,
      category_override: localCategory,
      compatible_versions: localCompatibleVersions,
      manifest_url: metaInputs.manifest_url?.trim() || undefined,
      is_paid: metaInputs.is_paid || false,
      is_early_access: metaInputs.is_early_access || false,
      status_reason: metaInputs.statusMsg?.trim() || "",
      ...(normStatus === "corrupted" ||
        normStatus === "broken" ||
        normStatus === "unstable" ||
        normStatus === "stable"
        ? { status: normStatus === "broken" ? "corrupted" : normStatus }
        : {}),
    });
    setIsSaving(false);
    setEditMode(false);
    setIsCorrecting(false);
  };

  const handleExportLocalRelease = async () => {
    const vaultPath = useStore.getState().vaultPath;
    if (!vaultPath || !mod?.name) return;
    setIsSaving(true);
    try {
      const localOvr = JSON.parse(
        localStorage.getItem("sanctuary_local_overrides") || "{}"
      );
      const edgeLogic = JSON.parse(
        localStorage.getItem("sanctuary_edge_logic") || "{}"
      );
      const existingManifestUrl =
        metaInputs.manifest_url?.trim() ||
        mod.manifest_url ||
        (mod.hash && localOvr[mod.hash]?.manifest_url) ||
        (mod.hash && edgeLogic[mod.hash]?.manifest_url) ||
        "https://your-domain.com/.sanctuary.manifest.json";

      const cleanModName = (
        mod.displayName ||
        mod.name.split(/[\\/]/).pop() ||
        "local_mod"
      ).trim();
      const artifactId = cleanModName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");
      const previousHashes = Array.from(
        new Set(
          [
            ...(Array.isArray(mod.flavors)
              ? mod.flavors.map((f: any) => f.hash)
              : []),
            ...(Array.isArray(edgeLogic[mod.hash]?.previous_hashes)
              ? edgeLogic[mod.hash].previous_hashes
              : []),
          ].filter((h: any) => h && h !== mod.hash)
        )
      );

      const manifestPayload = {
        schema_version: "1.0",
        artifact: {
          id: artifactId,
          name: cleanModName,
          author: (metaInputs.author || mod.author || "Local Mason").trim(),
          version:
            (metaInputs.version || mod.version || "1.0.0")
              .replace(/^v\.?/i, "")
              .trim() || "1.0.0",
          game_version:
            (Array.isArray(localCompatibleVersions) &&
              localCompatibleVersions[0]) ||
            useStore.getState().selectedVersion ||
            "Any",
          release_date: new Date().toISOString(),
          game_id:
            useStore.getState().activeWorkspaceId ||
            useStore.getState().activeGameSchema?.id ||
            "universal",
        },
        payload: {
          download_url: (
            metaInputs.url ||
            mod.url ||
            existingManifestUrl
          ).trim(),
          sha256: mod.hash || "",
          archive_type: "zip",
        },
        atomic_logic: {
          required_dlc:
            Array.isArray(metaInputs.requiredDLC) &&
              metaInputs.requiredDLC.length > 0
              ? metaInputs.requiredDLC
              : Array.isArray(mod.requiredDLC)
                ? mod.requiredDLC
                : [],
          dependencies: Array.isArray(mod.requirements)
            ? mod.requirements.map((r: any) => ({
              hash: String(r.hash || r.id || r),
              min_version: r.min_version || null,
            }))
            : [],
          twins: Array.isArray(mod.twins)
            ? mod.twins.map((tw: any) => String(tw.hash || tw.id || tw))
            : [],
          addons: [],
          conflicts: Array.isArray(mod.conflicts)
            ? mod.conflicts.map((c: any) => ({
              hash: String(c.enemy_id || c.enemy_name || ""),
              severity: Number(c.severity_rank || 3),
              description: c.resolution_note || undefined,
            }))
            : [],
          flavors: Array.isArray(mod.flavors)
            ? mod.flavors.map((f: any) => f.hash).filter(Boolean)
            : [],
          ...(resolveModHighlanderSlot(mod)
            ? {
              highlander_group: {
                slug: resolveModHighlanderSlot(mod)!.key,
                name: resolveModHighlanderSlot(mod)!.name,
              },
            }
            : {}),
        },
        virtual_filesystem: {
          overrides: [],
          injected_folders: [],
        },
        changelog: metaInputs.desc
          ? [metaInputs.desc]
          : [t("label_initial_edge_release", "Static Edge Release")],
        previous_hashes: previousHashes,
      };

      const targetFolderOrFile = mod.physical_path || mod.name;
      await invoke("export_edge_release", {
        vaultPath,
        sandboxModName: targetFolderOrFile,
        manifest: manifestPayload,
        customUrl: existingManifestUrl,
      });

      useStore
        .getState()
        .pushStatus(
          t("msg_export_release_success", "Exported .sanctuary.manifest.json, .sanctuary.override.json, and release .zip to {mod} folder!")
        );
    } catch (err: any) {
      console.error("Failed to export edge release from Dossier:", err);
      useStore.getState().pushStatus(`Export failed: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const [flagComplianceTier, setFlagComplianceTier] = useState<number>(1);
  const [flagReasonNotes, setFlagReasonNotes] = useState<string>("");
  const [isSubmittingFlag, setIsSubmittingFlag] = useState<boolean>(false);

  const handleFlagMod = async (reason: string, customTier?: number) => {
    if (
      reason === "Outdated Information" ||
      reason === "Inaccurate Information"
    ) {
      setShowFlagModal(false);
      setIsCorrecting(true);
      setEditMode(true);
      return;
    }

    const validLocalSha256 = /^[0-9a-f]{64}$/i.test(String(mod?.hash || "").trim())
      ? String(mod.hash).trim().toLowerCase()
      : "";

    if (!targetDbId && !validLocalSha256) {
      useStore.getState().pushStatus(t("auto_cannot_flag_local_32", "Cannot flag a local-only {mod}."));
      return;
    }

    if (!session) {
      useStore.getState().pushStatus(t("auto_guest_mode_active_45", "Authentication required."));
      return;
    }

    setIsSubmittingFlag(true);
    try {
      if (reason === "Suspected Malware") {
        const { error: reportError } = await submitThreatManifestToSpoke(
          {
            artifact_name: mod.name || t("unknown", "Unknown"),
            detected_hash: mod.hash || "unknown-hash",
            signature: flagReasonNotes.trim()
              ? `User Flagged: Suspected Malware — ${flagReasonNotes.trim()}`
              : "User Flagged: Suspected Malware",
            status: "pending",
            original_exists: true,
            original_shredded: false,
          },
          { isAuto: false, defaultSignature: "User Flagged: Suspected Malware" }
        );
        if (reportError) {
          useStore
            .getState()
            .pushStatus(`${t("err_flag_mod_failed", "Failed to flag {mod}:")} ${reportError.message}`);
          return;
        }
        useStore
          .getState()
          .pushStatus(
            t(
              "msg_malware_flag_routed",
              "Suspected malware signature routed to Oversight Malware Queue for verification."
            )
          );
        setShowFlagModal(false);
        setFlagReasonNotes("");
        return;
      }

      const resolvedTier = Math.min(
        4,
        Math.max(
          1,
          customTier ??
          (reason === "adult" ? 2 : reason === "NSFW" ? 1 : flagComplianceTier || 1)
        )
      );
      const cleanNotes =
        flagReasonNotes.trim() ||
        t("compliance_flag_default_reason", "Flagged for Oversight Compliance review (Tier {tier}).").replace(
          "{tier}",
          String(resolvedTier)
        );

      const { error } = await supabase.rpc("flag_mod_for_compliance", {
        p_mod_id: targetDbId || undefined,
        p_dna_hash: validLocalSha256 || undefined,
        p_mod_name: mod?.displayName || mod?.name || undefined,
        p_tier: resolvedTier,
        p_reason: cleanNotes,
      });

      if (!error) {
        window.dispatchEvent(new CustomEvent("sanctuary-compliance-updated"));
        useStore
          .getState()
          .pushStatus(
            t(
              "nexus_mod_flagged_compliance_toast",
              "{Mod} flagged for Oversight Compliance review (Pending)."
            )
          );
        setShowFlagModal(false);
        setFlagReasonNotes("");
        onClose();
      } else {
        useStore
          .getState()
          .pushStatus(`${t("err_flag_mod_failed", "Failed to flag {mod}:")} ${error.message}`);
      }
    } finally {
      setIsSubmittingFlag(false);
    }
  };

  const handleSubmitToVault = async () => {
    if (!session) {
      useStore.getState().pushStatus(t("auto_guest_mode_active_45", "Authentication required."));
      return;
    }

    if (Number(mod?.compliance_tier || 0) !== 0) {
      useStore
        .getState()
        .pushStatus(
          t(
            "alert_architect_known_tier0_only",
            "Only Tier 0 {mods} can be submitted to Architects. Unknown Tier 0 {mods} require a passing {Lab} test."
          ),
          "error"
        );
      return;
    }

    const cleanHash = String(mod?.hash || "").trim();
    if (!cleanHash || cleanHash === "calculating") {
      useStore
        .getState()
        .pushStatus(
          t("err_missing_mod_hash", "Valid SHA-256 hash required before submitting."),
          "error"
        );
      return;
    }

    const knownCloudCheck = await verifyKnownTier0CloudHashes([cleanHash]);
    const isUnknownHashUpload = !knownCloudCheck.allowed;
    const verRes = await checkDnaHashVerification(cleanHash);

    if ((isUnknownHashUpload || requireScoutLabTest) && (!verRes.verified || verRes.failed)) {
      useStore
        .getState()
        .pushStatus(
          t(
            "lab_gate_locked_scout_msg",
            "Submission Locked: Unknown Tier 0 Scout Queue uploads require a passing timed {Lab} test before submission."
          ),
          "error"
        );
      return;
    }

    if (isUnknownHashUpload && isDesktop()) {
      try {
        const coords: any = await invoke("get_saved_coordinates");
        const hasHardwareCert = await invoke<boolean>("verify_lab_certificate_exists", {
          vaultPath: coords?.vault_path || "",
          dnaHash: cleanHash,
        });
        if (!hasHardwareCert) {
          useStore
            .getState()
            .pushStatus(
              t(
                "lab_gate_locked_scout_msg",
                "Submission Locked: Unknown Tier 0 Scout Queue uploads require a passing timed {Lab} test before submission."
              ),
              "error"
            );
          return;
        }
      } catch {
        useStore
          .getState()
          .pushStatus(
            t(
              "lab_gate_locked_scout_msg",
              "Submission Locked: Unknown Tier 0 Scout Queue uploads require a passing timed {Lab} test before submission."
            ),
            "error"
          );
        return;
      }
    }

    let bondedHash = metaInputs.lineage || null;
    if (bondedHash) {
      const parentMod = (modList || []).find(
        (m: any) =>
          (m.displayName || (m.name || "").split(/[\\/]/).pop() || m.name) ===
          bondedHash
      );
      if (parentMod && parentMod.hash) {
        bondedHash = parentMod.hash;
      }
    }

    setIsSaving(true);
    const { error } = await supabase.from("scout_suggestions").insert([
      {
        dna_hash: cleanHash,
        suggested_name: metaInputs.name,
        suggested_author: metaInputs.author,
        suggested_url: metaInputs.url,
        suggested_type: localCategory || mod.type || "FILE",
        suggested_bonded_to: bondedHash,
        suggested_version:
          metaInputs.version || deriveHumanReadableVersion(mod.name, cleanHash),
        suggested_sub_type:
          getFileLabel(mod.name || "", activeGameSchema) === "SCRIPT"
            ? "Script"
            : "Module",
        suggested_game_versions:
          localCompatibleVersions.length > 0 ? localCompatibleVersions : null,
        submitter_id: null,
        description: metaInputs.desc || null,
        image_url: metaInputs.image || null,
        compliance_tier: 0,
        is_paid: metaInputs.is_paid || false,
        is_early_access: metaInputs.is_early_access || false,
        status: "pending",
        ...(verRes?.cert ? { _lab_cert_proof: verRes.cert } : {}),
      } as any,
    ]);

    if (error) {
      useStore
        .getState()
        .pushStatus(`Failed to submit to Vault: ${error.message}`);
    } else {
      if (verRes?.cert) {
        await recordVerifiedCertificate(verRes.cert);
      }
      const submitted = JSON.parse(
        localStorage.getItem("sanctuary_submitted_hashes") || "[]"
      );
      if (cleanHash && !submitted.includes(cleanHash)) {
        submitted.push(cleanHash);
        localStorage.setItem(
          "sanctuary_submitted_hashes",
          JSON.stringify(submitted)
        );
      }
      useStore
        .getState()
        .pushStatus(t("auto_successfully_submitted_to_45", "Successfully submitted to Scout Queue."));
      setEditMode(false);
    }
    setIsSaving(false);
  };

  const conflicts = mod.conflicts || [];

  const rawArtifactTitle = (
    (mod.displayName && !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(mod.displayName))
      ? mod.displayName
      : (mod.name || "").replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "").split(/[/\\]/).pop()) || ""
  )
    .replace(/_/g, " ")
    .replace(/\.[^/.]+$/, "");
  const cleanArtifactTitle = formatCleanModTitle(rawArtifactTitle) || rawArtifactTitle;

  const statusLabel = (() => {
    if (
      !hasExplicitStatus &&
      (!mod.dbId || mod.version?.toLowerCase() === "v.local")
    )
      return t("badge_local", "Unlinked");
    const raw = mod.status || "";
    const cleaned = raw.replace(/[\[\]]/g, "").toLowerCase();
    if (cleaned === "broken") return t("status_corrupted", "Broken");
    if (cleaned === "stable") return t("status_stable", "Stable");
    if (cleaned === "unverified") return t("unverified", "Unverified");
    if (cleaned === "local folder" || cleaned === "local node")
      return t("local_node", "Local Node");
    if (cleaned.includes("sandbox")) return t("filter_dev", "Sandbox");
    const translated = cleaned.includes("status_")
      ? t(cleaned, cleaned.replace(/_/g, " "))
      : cleaned.replace(/_/g, " ");
    return translated || t("badge_local", "Unlinked");
  })();

  const statusVariant: "accent" | "success" | "warning" | "danger" =
    statusType === "stable"
      ? "success"
      : statusType === "broken" || statusType === "corrupted"
        ? "danger"
        : statusType === "unstable" || statusType === "paid"
          ? "warning"
          : "accent";

  const statusIcon =
    statusType === "stable"
      ? t("icon_verified_user", "verified_user")
      : statusType === "unstable"
        ? t("icon_warning", "warning")
        : statusType === "broken" || statusType === "corrupted"
          ? t("icon_pest_control", "pest_control")
          : statusType === "under review"
            ? t("icon_science", "science")
            : statusType === "pending"
              ? t("icon_pending", "pending")
              : statusType === "early access"
                ? t("icon_experiment", "experiment")
                : statusType === "paid"
                  ? t("icon_monetization_on", "monetization_on")
                  : getModIcon(mod, activeGameSchema, t);

  const resolvedVersion = (() => {
    if (mod.isLocalOverride && mod.version && !isPlaceholderVersionStr(mod.version, t)) {
      return mod.version;
    }
    const candidates = [
      ...(Array.isArray(mod.mod_versions) ? mod.mod_versions.map((mv: any) => mv?.version_label) : []),
      mod.latest_version,
      mod.version,
      ...(Array.isArray(mod.flavors)
        ? mod.flavors.flatMap((f: any) => [
          f?.isLocalOverride ? f?.version : undefined,
          ...(Array.isArray(f?.mod_versions) ? f.mod_versions.map((mv: any) => mv?.version_label) : []),
          f?.latest_version,
          f?.version,
        ])
        : []),
    ];
    const valid = candidates.find((v) => !isPlaceholderVersionStr(v, t));
    return valid ? String(valid).trim() : t("unknown", "Unknown");
  })();

  const resolvedCreatedAt = (() => {
    let dt = mod.created_at || mod.mod_versions?.[0]?.created_at;
    if (!dt && mod.isVirtual && mod.flavors) {
      const dates = mod.flavors
        .map((f: any) => f.created_at || f.mod_versions?.[0]?.created_at)
        .filter(Boolean)
        .sort()
        .reverse();
      if (dates.length > 0) dt = dates[0];
    }
    return dt ? new Date(dt).toLocaleDateString() : t("source_local", "Local");
  })();

  const resolvedUpdatedAt = (() => {
    let dt = mod.updated_at || mod.mod_versions?.[0]?.created_at || mod.created_at;
    if (!dt && mod.isVirtual && mod.flavors) {
      const dates = mod.flavors
        .map((f: any) => f.updated_at || f.mod_versions?.[0]?.created_at || f.created_at)
        .filter(Boolean)
        .sort()
        .reverse();
      if (dates.length > 0) dt = dates[0];
    }
    return dt ? new Date(dt).toLocaleDateString() : t("source_local", "Local");
  })();

  const coverImageUrl =
    metaInputs.image || mod.image_url || mod.imageUrl || "";
  const hasValidCover =
    (showImages || editMode) &&
    coverImageUrl &&
    String(coverImageUrl) !== "null" &&
    String(coverImageUrl).trim() !== "";

  return (
    <>
      <SidePanel
        isOpen={isDossierOpen}
        onClose={handleClose}
        title={cleanArtifactTitle}
        subtitle={`${mod.author || t("unknown", "Unknown")} • ${statusLabel}`}
        icon={getModIcon(mod, activeGameSchema, t)}
        iconColorClass={
          statusVariant === "danger"
            ? "text-[var(--danger)]"
            : statusVariant === "warning"
              ? "text-[var(--warning)]"
              : statusVariant === "success"
                ? "text-[var(--success)]"
                : "text-[var(--accent)]"
        }
        widthClass="w-[820px] max-w-[100vw]"
        backdropZ="z-[120000]"
        panelZ="z-[120001]"
        headerActions={buildModDossierHeaderActions({
          onResetMetadata,
          onOpenMasonProfile,
          editMode,
          setEditMode,
          onSecureShred,
          isCorrecting,
          setIsCorrecting,
          onSyncToNetwork,
          t,
          mustPassLabForScout,
          session,
          isModLabVerified,
          hydratedMeta,
          mod,
          handleClose,
          isSaving,
          setShowFlagModal,
          isNexusView,
          targetDbId,
          isBanned,
          userRole,
          allEquippableManifestNames,
          allEquipped,
          handleToggleAll,
          handleSave,
          handleExportLocalRelease,
          handleSubmitToVault,
          canReconfigureInstaller,
          isReconfiguringInstaller,
          handleReconfigureInstaller,
        })}
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <ModDossierMainContent
            metaInputs={metaInputs}
            setMetaInputs={setMetaInputs}
            onSaveMetadata={onSaveMetadata}
            onOpenMasonProfile={onOpenMasonProfile}
            editMode={editMode}
            onSendToLab={onSendToLab}
            isCorrecting={isCorrecting}
            t={t}
            activeGameSchema={activeGameSchema}
            requireScoutLabTest={requireScoutLabTest}
            mustPassLabForScout={mustPassLabForScout}
            setIsModLabVerified={setIsModLabVerified}
            hydratedMeta={hydratedMeta}
            collectionFilter={collectionFilter}
            setCollectionFilter={setCollectionFilter}
            collectionSearchQuery={collectionSearchQuery}
            setCollectionSearchQuery={setCollectionSearchQuery}
            versionPoolItems={versionPoolItems}
            setSelectedVersionGroupKeys={setSelectedVersionGroupKeys}
            visibleKidsLimit={visibleKidsLimit}
            kidsSentinelRef={kidsSentinelRef}
            filterVersionGroupsForTarget={filterVersionGroupsForTarget}
            setActiveVersionModalGroups={setActiveVersionModalGroups}
            mod={mod}
            handleClose={handleClose}
            handleInspectKid={handleInspectKid}
            isNexusView={isNexusView}
            localCreatedAt={localCreatedAt}
            setLocalCreatedAt={setLocalCreatedAt}
            localUpdatedAt={localUpdatedAt}
            setLocalUpdatedAt={setLocalUpdatedAt}
            showImages={showImages}
            localCategory={localCategory}
            setLocalCategory={setLocalCategory}
            localCompatibleVersions={localCompatibleVersions}
            setLocalCompatibleVersions={setLocalCompatibleVersions}
            dossierLabReports={dossierLabReports}
            activeMods={activeMods}
            isModNameEquipped={isModNameEquipped}
            groupedKids={groupedKids}
            inVaultKidsCount={inVaultKidsCount}
            missingKidsCount={missingKidsCount}
            filteredGroupedKids={filteredGroupedKids}
            visibleGroupedKids={visibleGroupedKids}
            collectionFilterPopoverContent={collectionFilterPopoverContent}
            groupedRelations={groupedRelations}
            isSingleItemStaged={isSingleItemStaged}
            isModStaged={isModStaged}
            handleStageTargetToPc={handleStageTargetToPc}
            isCollection={isCollection}
            hasOverrides={hasOverrides}
            familyVersion={familyVersion}
            allEquippableManifestNames={allEquippableManifestNames}
            allEquipped={allEquipped}
            safeToggle={safeToggle}
            safeToggleGroup={safeToggleGroup}
            handleToggleAll={handleToggleAll}
            conflicts={conflicts}
            cleanArtifactTitle={cleanArtifactTitle}
            statusLabel={statusLabel}
            statusVariant={statusVariant}
            statusIcon={statusIcon}
            resolvedVersion={resolvedVersion}
            resolvedCreatedAt={resolvedCreatedAt}
            resolvedUpdatedAt={resolvedUpdatedAt}
            coverImageUrl={coverImageUrl}
            hasValidCover={hasValidCover}
            canReconfigureInstaller={canReconfigureInstaller}
            isReconfiguringInstaller={isReconfiguringInstaller}
            handleReconfigureInstaller={handleReconfigureInstaller}
            unresolvedRequirementsCount={unresolvedRequirements.length}
            isResolvingDeps={isResolvingDeps}
            handleResolveDependencies={handleResolveDependencies}
            hasEdgeChannelSupport={hasEdgeChannelSupport}
            subscribedChannel={subscribedChannel}
            handleChangeSubscribedChannel={handleChangeSubscribedChannel}
          />
        </div>
      </SidePanel>
      <ModDossierSecondaryDrawers
        onOpenMasonProfile={onOpenMasonProfile}
        t={t}
        activeGameSchema={activeGameSchema}
        selectedVersion={selectedVersion}
        dossierAlertPending={dossierAlertPending}
        setDossierAlertPending={setDossierAlertPending}
        kidCollectionFilter={kidCollectionFilter}
        setKidCollectionFilter={setKidCollectionFilter}
        kidSearchQuery={kidSearchQuery}
        setKidSearchQuery={setKidSearchQuery}
        deferredKidSearch={deferredKidSearch}
        kidEquipFilter={kidEquipFilter}
        setKidEquipFilter={setKidEquipFilter}
        kidCategoryFilter={kidCategoryFilter}
        kidStatusFilter={kidStatusFilter}
        setKidStatusFilter={setKidStatusFilter}
        versionPoolItems={versionPoolItems}
        setSelectedVersionGroupKeys={setSelectedVersionGroupKeys}
        loadDossierVersionPool={loadDossierVersionPool}
        handleActivateDossierVersion={handleActivateDossierVersion}
        handleDeleteDossierVersion={handleDeleteDossierVersion}
        filterVersionGroupsForTarget={filterVersionGroupsForTarget}
        setActiveVersionModalGroups={setActiveVersionModalGroups}
        selectedVersionGroups={selectedVersionGroups}
        mod={mod}
        selectedKid={selectedKid}
        setSelectedKid={setSelectedKid}
        handleInspectKid={handleInspectKid}
        kidToRender={kidToRender}
        showFlagModal={showFlagModal}
        setShowFlagModal={setShowFlagModal}
        isNexusView={isNexusView}
        showImages={showImages}
        activeMods={activeMods}
        isModNameEquipped={isModNameEquipped}
        buildGroupedCollectionModules={buildGroupedCollectionModules}
        isKidGroupEquipped={isKidGroupEquipped}
        resolveKidCategoryKey={resolveKidCategoryKey}
        isSingleItemStaged={isSingleItemStaged}
        handleStageTargetToPc={handleStageTargetToPc}
        getVersions={getVersions}
        familyVersion={familyVersion}
        safeToggle={safeToggle}
        safeToggleGroup={safeToggleGroup}
        flagComplianceTier={flagComplianceTier}
        setFlagComplianceTier={setFlagComplianceTier}
        flagReasonNotes={flagReasonNotes}
        setFlagReasonNotes={setFlagReasonNotes}
        isSubmittingFlag={isSubmittingFlag}
        handleFlagMod={handleFlagMod}
        cleanArtifactTitle={cleanArtifactTitle}
        resolvedVersion={resolvedVersion}
      />
    </>
  );
}

