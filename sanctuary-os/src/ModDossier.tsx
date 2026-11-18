import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./utils/envUtils";
import { resolvePayloadDependencies } from "./utils/stagingCrypto";
import { useLexicon } from "./LexiconContext";
import { supabase, submitThreatManifestToSpoke } from "./supabase";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import { GameVersionMultiSelect, deriveHumanReadableVersion, CustomDatePicker, CustomDropdown, CustomClassificationDropdown, CustomComplianceDropdown, getHighestVersion, formatVersionRangesLabel, getFileLabel, getExtensionRegex, getModIcon, isVersionMatch, mapDlcCode, parseStringArray, cleanSearchName, formatDisplayName, SidePanel, SidePanelHeroCard, SidePanelTitleInput, SidePanelPillToggle, UniversalGroup, StatBox, ActionButton, DashboardStatTile, SidePanelFilterBar, getModFallbackUrl, handleOpenUrl, PanelHeaderGroup, PanelHeaderButton, VAULT_CHIP_CLASS, stripPriorityTierPrefix, ActionPill, isScriptExtension, resolveModHighlanderSlot } from "./shared";
import { normalizeModGroupTitle, formatCleanModTitle } from "./side-panels/CommandIncompatiblePanel";
import { LabVerificationGate, LabVerificationBadge, checkDnaHashVerification, recordVerifiedCertificate, verifyKnownTier0CloudHashes } from "./components/LabVerificationGate";
import { groupModVersionPoolItems, ModVersionHistorySidePanel, ModVersionBinaryGroup } from "./side-panels/VaultSidePanels";
import { UniversalTextArea } from "./components/universal/UniversalLayout";
import { fetchModLabReports, LabReportDiagnosticCards } from "./components/KnownExceptionRules";
import { UUID_REGEX, getComplianceTierDisplay, extractCleanUuid, collectAllCandidateUuids, isPlaceholderAuthorStr, isPlaceholderVersionStr, pickFirstValidAuthor, MOD_SELECT, spokeMetadataCache, getDossierTargetCacheKey, getCachedGroupTitles, DossierFilterSection, fetchSpokeModMetadata, normTitleForMatch, buildVaultModIndex, mergeHydratedMod } from "./mod-dossier/dossierHelpersAndFetch";
import { DossierModuleCard } from "./mod-dossier/DossierModuleCard";

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

  const buildGroupedCollectionModules = React.useCallback(
    (localItems: any[], dbCollectionChildren: any[]): any[] => {
      const combinedSource = [
        ...(Array.isArray(localItems) ? localItems : []),
        ...(Array.isArray(dbCollectionChildren) ? dbCollectionChildren : []),
      ];
      if (combinedSource.length === 0) return [];

      const map = new Map<string, any>();

      for (const rawKid of combinedSource) {
        if (!rawKid) continue;
        const kidUuid = extractCleanUuid(rawKid.dbId, rawKid.id).toLowerCase();
        const kidHash =
          rawKid.hash && !/^(virtual_|set_|local_)/i.test(String(rawKid.hash))
            ? String(rawKid.hash).toLowerCase()
            : "";

        const matchedSet = new Set<any>();
        const addMatches = (arr?: any[]) => {
          if (!arr) return;
          for (let i = 0; i < arr.length; i++) {
            matchedSet.add(arr[i]);
          }
        };

        if (kidHash) {
          addMatches(vaultIndex.physicalByHash.get(kidHash));
        }
        if (Array.isArray(rawKid.mod_versions)) {
          for (let i = 0; i < rawKid.mod_versions.length; i++) {
            const vHash = String(
              rawKid.mod_versions[i]?.dna_hash || rawKid.mod_versions[i]?.hash || ""
            )
              .trim()
              .toLowerCase();
            if (vHash) addMatches(vaultIndex.physicalByHash.get(vHash));
          }
        }
        if (kidUuid) {
          addMatches(vaultIndex.physicalByUuid.get(kidUuid));
        }
        if (
          rawKid.name &&
          typeof rawKid.name === "string" &&
          !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(rawKid.name) &&
          !UUID_REGEX.test(rawKid.name.split("@")[0])
        ) {
          addMatches(vaultIndex.physicalByName.get(rawKid.name));
          addMatches(vaultIndex.physicalByName.get(rawKid.name.toLowerCase()));
        }
        if (matchedSet.size === 0) {
          const fallbackTitle = normTitleForMatch(
            rawKid.displayName || rawKid.name
          );
          if (fallbackTitle) {
            addMatches(vaultIndex.physicalByNormTitle.get(fallbackTitle));
          }
        }

        const matchedPhysical = Array.from(matchedSet);
        const isKidInstalled = matchedPhysical.length > 0;
        const dbMeta = kidUuid ? combinedDbMap[kidUuid] || rawKid : rawKid;
        const hydratedKid = mergeHydratedMod(
          isKidInstalled ? matchedPhysical[0] : rawKid,
          dbMeta,
          vaultIndex,
          t
        );

        const resolvedSubMods = isKidInstalled
          ? matchedPhysical.map((pm: any) =>
            mergeHydratedMod(pm, dbMeta, vaultIndex, t)
          )
          : [hydratedKid];

        const rawTitle = (
          (hydratedKid.displayName &&
            !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(hydratedKid.displayName)) &&
            !UUID_REGEX.test(String(hydratedKid.displayName).split("@")[0])
            ? hydratedKid.displayName
            : (hydratedKid.name || "")
              .replace(/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i, "")
              .split(/[/\\]/)
              .pop()) || ""
        )
          .replace(/_/g, " ")
          .replace(/\.[^/.]+$/, "");
        const { groupTitle } = getCachedGroupTitles(rawTitle);
        const groupKey = groupTitle.toLowerCase();

        if (!map.has(groupKey)) {
          map.set(groupKey, {
            ...hydratedKid,
            displayName: groupTitle,
            _groupedTitle: groupTitle,
            _groupedMods: [...resolvedSubMods],
            _groupedIds: collectAllCandidateUuids(hydratedKid),
            isInstalled: isKidInstalled,
            relationType: "manifest" as const,
          });
        } else {
          const existing = map.get(groupKey);
          if (isKidInstalled && !existing.isInstalled) {
            existing.isInstalled = true;
            existing._groupedMods = [...resolvedSubMods];
          } else if (isKidInstalled === existing.isInstalled) {
            for (const rsm of resolvedSubMods) {
              const alreadyHas = existing._groupedMods.some(
                (gm: any) =>
                  (gm.name && rsm.name && gm.name === rsm.name) ||
                  (gm.hash && rsm.hash && gm.hash === rsm.hash) ||
                  (extractCleanUuid(gm.dbId, gm.id) &&
                    extractCleanUuid(gm.dbId, gm.id) ===
                    extractCleanUuid(rsm.dbId, rsm.id))
              );
              if (!alreadyHas) {
                existing._groupedMods.push(rsm);
              }
            }
          }
          for (const cid of collectAllCandidateUuids(hydratedKid)) {
            if (!existing._groupedIds.includes(cid)) {
              existing._groupedIds.push(cid);
            }
          }
          if (
            isPlaceholderAuthorStr(existing.author, t) &&
            !isPlaceholderAuthorStr(hydratedKid.author, t)
          ) {
            existing.author = hydratedKid.author;
          }
          if (!existing.description && hydratedKid.description) {
            existing.description = hydratedKid.description;
          }
          if (!existing.url && hydratedKid.url) {
            existing.url = hydratedKid.url;
          }
          if (!existing.created_at && hydratedKid.created_at) {
            existing.created_at = hydratedKid.created_at;
          }
          if (!existing.updated_at && hydratedKid.updated_at) {
            existing.updated_at = hydratedKid.updated_at;
          }
          if (
            (!existing.version ||
              /^(v\.?local|local|unknown)$/i.test(String(existing.version))) &&
            hydratedKid.version &&
            !/^(v\.?local|local|unknown)$/i.test(String(hydratedKid.version))
          ) {
            existing.version = hydratedKid.version;
          }
        }
      }

      return Array.from(map.values());
    },
    [vaultIndex, combinedDbMap, t]
  );

  const groupedKids = useMemo(() => {
    if (!mod) return [];
    const localKids = mod.flavors || [];
    if (
      (Array.isArray(localKids) && localKids.length > 0) ||
      mod.isVirtual ||
      mod.isParent ||
      mod.isCollection
    ) {
      return buildGroupedCollectionModules(
        localKids,
        mod.hydratedCollectionChildren || []
      );
    }
    return [];
  }, [mod, buildGroupedCollectionModules]);

  const inVaultKidsCount = useMemo(
    () => groupedKids.filter((k: any) => k.isInstalled !== false).length,
    [groupedKids]
  );
  const missingKidsCount = useMemo(
    () => groupedKids.filter((k: any) => k.isInstalled === false).length,
    [groupedKids]
  );

  const isKidGroupEquipped = React.useCallback(
    (k: any): boolean => {
      if (!k || k.isInstalled === false) return false;
      const gMods =
        Array.isArray(k._groupedMods) && k._groupedMods.length > 0
          ? k._groupedMods
          : [k];
      return gMods.some(
        (gm: any) => gm?.name && isModNameEquipped(gm.name)
      );
    },
    [isModNameEquipped]
  );

  const resolveKidCategoryKey = React.useCallback((k: any): string => {
    const gMods =
      Array.isArray(k?._groupedMods) && k._groupedMods.length > 0
        ? k._groupedMods
        : [k];
    const explicitCat = String(
      k?.category_override || k?.category || ""
    ).trim();
    if (
      explicitCat &&
      !/^(package|module|script|collection|folder|local|unknown|mod)$/i.test(explicitCat)
    ) {
      return explicitCat;
    }
    const hasScript = gMods.some((gm: any) =>
      isScriptExtension(
        String(gm?.name || gm?.file_extension || gm?._originalSetName || ""),
        useStore.getState().activeGameSchema
      )
    );
    if (hasScript) return "Script";
    return explicitCat || "Module";
  }, []);

  const availableCollectionCategories = useMemo(() => {
    const set = new Set<string>();
    for (const k of groupedKids) {
      const cat = resolveKidCategoryKey(k);
      if (cat) set.add(cat);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [groupedKids, resolveKidCategoryKey]);

  const filteredGroupedKids = useMemo(() => {
    const normSearch = deferredCollectionSearch
      .trim()
      .toLowerCase()
      .replace(/[_.\-/\\]+/g, " ")
      .replace(/\s+/g, " ");

    return groupedKids.filter((k: any) => {
      if (collectionFilter === "in_vault" && k.isInstalled === false) return false;
      if (collectionFilter === "missing" && k.isInstalled !== false) return false;

      if (collectionEquipFilter === "EQUIPPED" && !isKidGroupEquipped(k)) {
        return false;
      }
      if (collectionEquipFilter === "UNEQUIPPED" && isKidGroupEquipped(k)) {
        return false;
      }

      if (collectionCategoryFilter !== "ALL") {
        const cat = resolveKidCategoryKey(k);
        if (cat.toLowerCase() !== collectionCategoryFilter.toLowerCase()) {
          return false;
        }
      }

      if (collectionStatusFilter !== "ALL") {
        const rawStatus = String(k.status || "").toLowerCase();
        const isLocalOnly =
          !k.dbId ||
          rawStatus === "local" ||
          rawStatus === "unverified" ||
          String(k.version || "").toLowerCase() === "v.local";
        if (collectionStatusFilter === "UNVERIFIED") {
          if (!isLocalOnly) return false;
        } else if (rawStatus !== collectionStatusFilter.toLowerCase()) {
          return false;
        }
      }

      if (normSearch) {
        const gMods =
          Array.isArray(k._groupedMods) && k._groupedMods.length > 0
            ? k._groupedMods
            : [k];
        const titleStr = String(
          k._groupedTitle || k.displayName || k.name || ""
        )
          .toLowerCase()
          .replace(/[_.\-/\\]+/g, " ");
        const authorStr = String(k.author || k.master_author || "")
          .toLowerCase()
          .replace(/[_.\-/\\]+/g, " ");
        const catStr = resolveKidCategoryKey(k).toLowerCase();
        const matchesSubFile = gMods.some((gm: any) =>
          String(gm?.name || gm?.displayName || "")
            .toLowerCase()
            .replace(/[_.\-/\\]+/g, " ")
            .includes(normSearch)
        );
        if (
          !titleStr.includes(normSearch) &&
          !authorStr.includes(normSearch) &&
          !catStr.includes(normSearch) &&
          !matchesSubFile
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    groupedKids,
    collectionFilter,
    collectionEquipFilter,
    collectionCategoryFilter,
    collectionStatusFilter,
    deferredCollectionSearch,
    isKidGroupEquipped,
    resolveKidCategoryKey,
  ]);

  useEffect(() => {
    setVisibleKidsLimit(30);
  }, [
    collectionFilter,
    collectionEquipFilter,
    collectionCategoryFilter,
    collectionStatusFilter,
    deferredCollectionSearch,
  ]);

  useEffect(() => {
    if (visibleKidsLimit >= filteredGroupedKids.length) return;
    const node = kidsSentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          React.startTransition(() => {
            setVisibleKidsLimit((prev) =>
              Math.min(filteredGroupedKids.length, prev + 36)
            );
          });
        }
      },
      { rootMargin: "420px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleKidsLimit, filteredGroupedKids.length]);

  const visibleGroupedKids = useMemo(
    () =>
      filteredGroupedKids.length > visibleKidsLimit
        ? filteredGroupedKids.slice(0, visibleKidsLimit)
        : filteredGroupedKids,
    [filteredGroupedKids, visibleKidsLimit]
  );

  const hasActiveCollectionFilters =
    collectionEquipFilter !== "ALL" ||
    collectionCategoryFilter !== "ALL" ||
    collectionStatusFilter !== "ALL";

  const collectionFilterPopoverContent = useMemo(
    () => (
      <div className="flex flex-col w-[440px] p-4 max-w-[calc(100vw-40px)] text-left">
        {!isNexusView && (
          <DossierFilterSection
            t={t}
            title={t("blueprint", "{Blueprint}")}
            value={collectionEquipFilter}
            onChange={(val: "ALL" | "EQUIPPED" | "UNEQUIPPED") =>
              setCollectionEquipFilter(val)
            }
            options={[
              { id: "ALL", label: t("filter_all", "All") },
              {
                id: "EQUIPPED",
                label: t("filter_in_blueprint", "In {Blueprint}"),
              },
              {
                id: "UNEQUIPPED",
                label: t("filter_not_equipped", "Not Equipped"),
              },
            ]}
          />
        )}

        {availableCollectionCategories.length > 1 && (
          <DossierFilterSection
            t={t}
            title={t("filter_category", "Filter Category")}
            value={collectionCategoryFilter}
            onChange={(val: string) => setCollectionCategoryFilter(val)}
            options={[
              { id: "ALL", label: t("filter_all", "All") },
              ...availableCollectionCategories.map((cat) => ({
                id: cat,
                label:
                  cat === "Script"
                    ? t("type_script", "Script")
                    : cat === "Module" || cat === "Package"
                      ? t("type_package", "Module")
                      : cat,
              })),
            ]}
          />
        )}

        <DossierFilterSection
          t={t}
          title={t("filter_status", "Filter Status")}
          value={collectionStatusFilter}
          onChange={(val: string) => setCollectionStatusFilter(val)}
          options={[
            { id: "ALL", label: t("filter_all", "All") },
            { id: "stable", label: t("status_stable", "STABLE") },
            { id: "UNVERIFIED", label: t("unverified", "Unverified") },
            { id: "unstable", label: t("label_unstable", "Unstable") },
            { id: "corrupted", label: t("status_corrupted", "Corrupted") },
          ]}
        />

        {hasActiveCollectionFilters && (
          <button
            type="button"
            onClick={() => {
              setCollectionEquipFilter("ALL");
              setCollectionCategoryFilter("ALL");
              setCollectionStatusFilter("ALL");
            }}
            className="mt-1 px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[11px] font-bold text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
              {t("icon_filter_alt_off", "filter_alt_off")}
            </span>
            <span>{t("btn_clear", "Clear Filters")}</span>
          </button>
        )}
      </div>
    ),
    [
      isNexusView,
      t,
      collectionEquipFilter,
      availableCollectionCategories,
      collectionCategoryFilter,
      collectionStatusFilter,
      hasActiveCollectionFilters,
    ]
  );

  const groupedRelations = useMemo(() => {
    if (!mod) return [];
    const rawReqs = [
      ...(mod.requirements || mod.requires || []),
      ...(mod.isVirtual && Array.isArray(mod.flavors)
        ? mod.flavors.flatMap((fl: any) => fl?.requirements || fl?.requires || [])
        : []),
    ];
    const rawTwins = [
      ...(mod.twins || []),
      ...(mod.isVirtual && Array.isArray(mod.flavors)
        ? mod.flavors.flatMap((fl: any) => fl?.twins || [])
        : []),
    ];
    if (rawReqs.length === 0 && rawTwins.length === 0) return [];

    const selfUuids = new Set<string>(
      mod.isVirtual && Array.isArray(mod.flavors) && mod.flavors.length > 0
        ? mod.flavors.flatMap((fl: any) => collectAllCandidateUuids(fl))
        : [extractCleanUuid(mod.dbId, mod.id).toLowerCase()].filter(Boolean)
    );
    const selfNames = new Set<string>(
      mod.isVirtual && Array.isArray(mod.flavors) && mod.flavors.length > 0
        ? mod.flavors
          .map((fl: any) => String(fl?.name || "").toLowerCase())
          .filter(Boolean)
        : [String(mod.name || "").toLowerCase()].filter(Boolean)
    );

    const combinedEntries: Array<{ rawItem: any; relType: "requirement" | "twin" }> = [
      ...rawReqs.map((r: any) => ({ rawItem: r, relType: "requirement" as const })),
      ...rawTwins.map((tw: any) => ({ rawItem: tw, relType: "twin" as const })),
    ];

    const map = new Map<string, any>();

    for (const { rawItem, relType } of combinedEntries) {
      if (!rawItem) continue;
      const rawId =
        typeof rawItem === "string"
          ? rawItem
          : rawItem.id || rawItem.dbId || rawItem.hash || "";
      const cleanId = extractCleanUuid(rawId).toLowerCase();
      const rawHash = (
        typeof rawItem === "object" && rawItem?.hash
          ? String(rawItem.hash)
          : !cleanId && typeof rawId === "string"
            ? rawId
            : ""
      ).toLowerCase();

      if (cleanId && selfUuids.has(cleanId)) continue;

      const matchedSet = new Set<any>();
      if (cleanId) {
        const byId = vaultIndex.physicalByUuid.get(cleanId);
        if (byId) byId.forEach((pm) => matchedSet.add(pm));
      }
      if (rawHash) {
        const byHash = vaultIndex.physicalByHash.get(rawHash);
        if (byHash) byHash.forEach((pm) => matchedSet.add(pm));
      }
      const matchedPhysical = Array.from(matchedSet);

      if (
        matchedPhysical.length > 0 &&
        matchedPhysical.every((pm: any) =>
          selfNames.has(String(pm.name || "").toLowerCase())
        )
      ) {
        continue;
      }

      const dbHydrated = cleanId ? combinedDbMap[cleanId] : null;
      const virtualMatch = cleanId
        ? vaultIndex.virtualByUuid.get(cleanId) || null
        : null;

      let primaryMatch: any = null;
      let isInstalled = false;
      let resolvedModules: any[] = [];

      if (matchedPhysical.length > 0) {
        isInstalled = true;
        resolvedModules = matchedPhysical.map((pm: any) =>
          mergeHydratedMod(pm, dbHydrated, vaultIndex, t)
        );
        primaryMatch = resolvedModules[0];
      } else if (virtualMatch) {
        const nonSelfFlavors = (virtualMatch.flavors || []).filter(
          (fl: any) => !selfNames.has(String(fl?.name || "").toLowerCase())
        );
        if (nonSelfFlavors.length === 0 && mod.isVirtual) continue;
        isInstalled = true;
        resolvedModules =
          nonSelfFlavors.length > 0
            ? nonSelfFlavors.map((fl: any) =>
              mergeHydratedMod(fl, dbHydrated, vaultIndex, t)
            )
            : [mergeHydratedMod(virtualMatch, dbHydrated, vaultIndex, t)];
        primaryMatch = mergeHydratedMod(
          { ...virtualMatch, ...(resolvedModules[0] || {}) },
          dbHydrated,
          vaultIndex,
          t
        );
      } else {
        isInstalled = false;
        const fallbackBase =
          typeof rawItem === "string"
            ? {
              id: rawItem,
              dbId: cleanId || undefined,
              name: dbHydrated?.name || rawItem,
              displayName: dbHydrated?.name || rawItem,
            }
            : {
              ...rawItem,
              dbId: cleanId || rawItem.dbId || rawItem.id,
              name: dbHydrated?.name || rawItem.name || rawItem.displayName || String(rawId),
              displayName:
                dbHydrated?.name || rawItem.displayName || rawItem.name || String(rawId),
            };
        primaryMatch = mergeHydratedMod(fallbackBase, dbHydrated, vaultIndex, t);
        resolvedModules = [primaryMatch];
      }

      const rawDisplay =
        dbHydrated?.name ||
        (primaryMatch.displayName &&
          !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(primaryMatch.displayName))
          ? primaryMatch.displayName
          : "") ||
        (typeof rawItem === "object" && (rawItem.displayName || rawItem.name)) ||
        primaryMatch.name ||
        String(rawId);

      const cleanedRaw =
        String(rawDisplay)
          .replace(/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i, "")
          .split(/[/\\]/)
          .pop()
          ?.replace(/_/g, " ")
          .replace(/\.[^/.]+$/, "")
          .trim() || String(rawDisplay);

      const cleanTitle = formatCleanModTitle(cleanedRaw) || cleanedRaw;
      const groupTitle = normalizeModGroupTitle(cleanTitle) || cleanTitle;
      const groupKey = groupTitle.toLowerCase();

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          ...primaryMatch,
          displayName: groupTitle,
          _groupedTitle: groupTitle,
          _groupedMods: [...resolvedModules],
          _groupedIds: cleanId
            ? Array.from(new Set([cleanId, ...collectAllCandidateUuids(primaryMatch)]))
            : collectAllCandidateUuids(primaryMatch),
          isInstalled,
          relationType: relType,
        });
      } else {
        const existing = map.get(groupKey);
        if (isInstalled) existing.isInstalled = true;
        if (relType === "requirement") existing.relationType = "requirement";

        for (const rm of resolvedModules) {
          const alreadyHas = existing._groupedMods.some(
            (gm: any) =>
              (gm.name && rm.name && gm.name === rm.name) ||
              (gm.hash && rm.hash && gm.hash === rm.hash) ||
              (extractCleanUuid(gm.dbId, gm.id) &&
                extractCleanUuid(gm.dbId, gm.id) === extractCleanUuid(rm.dbId, rm.id))
          );
          if (!alreadyHas) {
            existing._groupedMods.push(rm);
          }
        }
        if (cleanId && !existing._groupedIds.includes(cleanId)) {
          existing._groupedIds.push(cleanId);
        }
        for (const cid of collectAllCandidateUuids(primaryMatch)) {
          if (!existing._groupedIds.includes(cid)) {
            existing._groupedIds.push(cid);
          }
        }
        if (
          isPlaceholderAuthorStr(existing.author, t) &&
          !isPlaceholderAuthorStr(primaryMatch.author, t)
        ) {
          existing.author = primaryMatch.author;
        }
        if (!existing.description && primaryMatch.description) {
          existing.description = primaryMatch.description;
        }
        if (!existing.url && primaryMatch.url) {
          existing.url = primaryMatch.url;
        }
        if (!existing.created_at && primaryMatch.created_at) {
          existing.created_at = primaryMatch.created_at;
        }
        if (!existing.updated_at && primaryMatch.updated_at) {
          existing.updated_at = primaryMatch.updated_at;
        }
        if (
          (!existing.version || /^(v\.?local|local|unknown)$/i.test(String(existing.version))) &&
          primaryMatch.version &&
          !/^(v\.?local|local|unknown)$/i.test(String(primaryMatch.version))
        ) {
          existing.version = primaryMatch.version;
        }
      }
    }

    return Array.from(map.values());
  }, [mod, vaultIndex, combinedDbMap, t]);
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

  const getBatchCasualties = (
    targetNames: string[],
    rootLabel?: string
  ): string[] => {
    if (!targetNames || targetNames.length === 0) return [];
    const extRegex = getExtensionRegex(activeGameSchema);
    const getBaseNoScript = (raw: string) =>
      String(raw || "")
        .split(/[\\/]/)
        .pop()
        ?.replace(extRegex, "")
        .toUpperCase()
        .replace(/_SCRIPT(S)?$/i, "") || "";
    const normLookup = (s: string) =>
      stripPriorityTierPrefix(String(s || ""), activeGameSchema)
        .replace(/\\/g, "/")
        .toLowerCase();

    // Build fast O(1) lookup structures over vaultIndex.physicalMods once per batch
    const byBaseNoScript = new Map<string, any[]>();
    const byNormRel = new Map<string, any>();
    const byNormBase = new Map<string, any>();
    const equippedWithReqs: any[] = [];

    for (const pm of vaultIndex.physicalMods) {
      if (!pm?.name) continue;
      const bns = getBaseNoScript(pm.name);
      if (bns) {
        let arr = byBaseNoScript.get(bns);
        if (!arr) {
          arr = [];
          byBaseNoScript.set(bns, arr);
        }
        arr.push(pm);
      }
      const nr = normLookup(pm.name);
      if (nr && !byNormRel.has(nr)) byNormRel.set(nr, pm);
      const nb = nr.split("/").pop() || "";
      if (nb && !byNormBase.has(nb)) byNormBase.set(nb, pm);

      if (isModNameEquipped(pm.name)) {
        const hasReqs =
          (Array.isArray(pm.requirements) && pm.requirements.length > 0) ||
          (Array.isArray(pm.requires) && pm.requires.length > 0) ||
          (Array.isArray(pm.twins) && pm.twins.length > 0);
        if (hasReqs) equippedWithReqs.push(pm);
      }
    }

    const resolveTargetMod = (tName: string): any => {
      const direct =
        vaultIndex.physicalByName.get(tName)?.[0] ||
        vaultIndex.physicalByName.get(tName.toLowerCase())?.[0];
      if (direct) return direct;
      const tNorm = normLookup(tName);
      const tBase = tNorm.split("/").pop() || tNorm;
      return (
        byNormRel.get(tNorm) ||
        byNormBase.get(tBase) ||
        (mod?.name === tName || normLookup(mod?.name || "") === tNorm ? mod : null)
      );
    };

    const initialTargets: any[] = [];
    const initialNameSet = new Set<string>(targetNames);
    for (const tn of targetNames) {
      const found = resolveTargetMod(tn);
      if (found) {
        if (found.isVirtual && Array.isArray(found.flavors) && found.flavors.length > 0) {
          for (const fl of found.flavors) {
            if (fl?.name) {
              initialTargets.push(fl);
              initialNameSet.add(fl.name);
            }
          }
        } else {
          initialTargets.push(found);
          if (found.name) initialNameSet.add(found.name);
        }
      }
    }
    if (initialTargets.length === 0) return [];

    const toDelete = new Set<string>();
    const deletedModMap = new Map<string, any>();
    const deletedUuids = new Set<string>();
    const deletedDbIds = new Set<string>();
    const deletedHashes = new Set<string>();
    const deletedDispUpperList: string[] = [];

    const registerDeletedMod = (mObj: any) => {
      if (!mObj?.name || toDelete.has(mObj.name)) return;
      toDelete.add(mObj.name);
      deletedModMap.set(mObj.name, mObj);
      collectAllCandidateUuids(mObj).forEach((u) => deletedUuids.add(u));
      if (mObj.dbId) deletedDbIds.add(String(mObj.dbId));
      if (mObj.hash) deletedHashes.add(String(mObj.hash).toLowerCase());
      const dispUpper = String(mObj.displayName || mObj.name || "").toUpperCase();
      if (dispUpper) {
        deletedDispUpperList.push(dispUpper);
        const spaced = dispUpper.replace(/_/g, " ");
        if (spaced !== dispUpper) deletedDispUpperList.push(spaced);
      }
    };

    const localSets = Array.isArray(storePlaySets) ? storePlaySets : [];

    for (const mItem of initialTargets) {
      if (!mItem?.name) continue;
      registerDeletedMod(mItem);

      const mItemBase = getBaseNoScript(mItem.name);
      if (mItemBase) {
        const sameBase = byBaseNoScript.get(mItemBase);
        if (sameBase) {
          for (const cand of sameBase) {
            if (cand?.name && cand.name !== mItem.name && isModNameEquipped(cand.name)) {
              registerDeletedMod(cand);
            }
          }
        }
      }

      // Only expand family/archetype siblings when checking a single item/module,
      // or if not already covered by the batch target list
      if (targetNames.length <= 4) {
        const familyAnchor = mItem.familyId || mItem.dbId;
        const isMaster = mItem.dbId && String(mItem.dbId) === String(familyAnchor);
        const isArchMember = localSets.some(
          (s: any) =>
            s?.archetypes?.core === mItem.hash ||
            s?.archetypes?.twins?.includes(mItem.hash)
        );
        if (
          mItem.isVirtual ||
          isMaster ||
          isArchMember ||
          mItem.relationshipType === "twin" ||
          mItem.relationshipType === "core" ||
          mItem.relationshipType === "beta"
        ) {
          const anchorUuid = extractCleanUuid(familyAnchor, mItem.dbId).toLowerCase();
          const famCands = anchorUuid ? vaultIndex.byUuid.get(anchorUuid) || [] : [];
          for (const fm of famCands) {
            if (fm?.name && !fm.isVirtual && isModNameEquipped(fm.name)) {
              registerDeletedMod(fm);
            }
          }
        }
      }
    }

    let keepChecking = true;
    while (keepChecking) {
      keepChecking = false;
      for (const m of equippedWithReqs) {
        if (!m?.name || toDelete.has(m.name)) continue;
        const allModReqs = [
          ...(Array.isArray(m.requirements) ? m.requirements : []),
          ...(Array.isArray(m.requires) ? m.requires : []),
          ...(Array.isArray(m.twins) ? m.twins : []),
        ];
        const isDependent = allModReqs.some((r: any) => {
          if (!r) return false;
          const rawReqId =
            typeof r === "string" ? r : r.id || r.dbId || r.hash || "";
          const cleanReqUuid = extractCleanUuid(rawReqId).toLowerCase();
          if (cleanReqUuid && deletedUuids.has(cleanReqUuid)) return true;
          if (rawReqId) {
            if (deletedDbIds.has(String(rawReqId))) return true;
            if (deletedHashes.has(String(rawReqId).toLowerCase())) return true;
          }
          const reqName =
            typeof r === "string"
              ? r.split("@").pop() || r
              : r.name || r.displayName || r.id || "";
          const isReqNumeric = !isNaN(Number(reqName));
          if (!isReqNumeric) {
            const reqBaseName = String(reqName)
              .split(/[\\/]/)
              .pop()
              ?.replace(extRegex, "")
              .toUpperCase()
              .replace(/_SCRIPT(S)?$/i, "");
            if (reqBaseName && reqBaseName.length > 2) {
              const reqSpaced = reqBaseName.replace(/_/g, " ");
              if (
                deletedDispUpperList.some(
                  (d) => d.includes(reqBaseName) || d.includes(reqSpaced)
                )
              ) {
                return true;
              }
            }
          }
          return false;
        });

        if (isDependent) {
          registerDeletedMod(m);
          keepChecking = true;
        }
      }
    }

    initialNameSet.forEach((n) => toDelete.delete(n));
    if (toDelete.size === 0) return [];

    const firstTarget = initialTargets[0];
    const cleanTarget =
      rootLabel ||
      (
        firstTarget?.displayName ||
        (firstTarget?.name || targetNames[0] || "").split(/[\\/]/).pop() ||
        ""
      )
        .replace(/_/g, " ")
        .replace(/\.[^/.]+$/, "");

    const cleanDeps = Array.from(toDelete).map((delName) => {
      const d =
        deletedModMap.get(delName) ||
        vaultIndex.physicalByName.get(delName)?.[0];
      if (!d)
        return (delName.split(/[\\/]/).pop() || delName)
          .replace(/_/g, " ")
          .replace(/\.[^/.]+$/, "");
      return (d.displayName || (d.name || "").split(/[\\/]/).pop() || "")
        .replace(/_/g, " ")
        .replace(/\.[^/.]+$/, "");
    });

    return [cleanTarget, ...Array.from(new Set(cleanDeps))];
  };

  const getCasualties = (targetName: string): string[] =>
    getBatchCasualties([targetName]);

  const evaluatePreEquipAlerts = (
    targetNames: string[],
    explicitItems: any[] = []
  ) => {
    const extRegex = getExtensionRegex(activeGameSchema);
    const resolvedTargets: any[] = [];
    const seenNames = new Set<string>();
    const targetNameSet = new Set<string>(targetNames);

    const addTargetObj = (obj: any) => {
      if (!obj) return;
      const key = String(obj.name || obj.hash || obj.dbId || "");
      if (key && seenNames.has(key)) return;
      if (key) seenNames.add(key);
      resolvedTargets.push(obj);
    };

    explicitItems.forEach(addTargetObj);
    const flavorByName = new Map<string, any>();
    if (Array.isArray(mod?.flavors)) {
      mod.flavors.forEach((f: any) => {
        if (f?.name) flavorByName.set(f.name, f);
      });
    }
    targetNames.forEach((n) => {
      const found =
        vaultIndex.physicalByName.get(n)?.[0] ||
        vaultIndex.physicalByName.get(n.toLowerCase())?.[0] ||
        flavorByName.get(n) ||
        (mod?.name === n ? mod : null);
      if (found) addTargetObj(found);
    });
    if (resolvedTargets.length === 0 && mod) {
      addTargetObj(mod);
    }

    // 1. Game Version Mismatch
    const mismatchedTargets = selectedVersion
      ? resolvedTargets.filter((tm) => {
          const vList = getVersions(tm).filter(Boolean);
          return vList.length > 0 && !isVersionMatch(vList, selectedVersion);
        })
      : [];
    const mismatchedVersionsList = Array.from(
      new Set(mismatchedTargets.flatMap((tm) => getVersions(tm)).filter(Boolean))
    );
    const effectiveTargetVer =
      mismatchedVersionsList.length > 0
        ? formatVersionRangesLabel(mismatchedVersionsList)
        : familyVersion;

    const isGameVersionMismatch = mismatchedTargets.length > 0;

    // 2. Missing DLC
    const rawDlcSet = new Set<string>();
    const collectDlc = (item: any) => {
      if (!item?.requiredDLC) return;
      parseStringArray(item.requiredDLC).forEach((d: string) => {
        const code = d.split(" ")[0].toUpperCase().trim();
        if (code && code !== "BASE") rawDlcSet.add(d.trim());
      });
    };
    collectDlc(mod);
    resolvedTargets.forEach(collectDlc);
    const missingPacks = Array.from(rawDlcSet).filter((p: string) => {
      const baseCode = p.split(" ")[0].toUpperCase().trim();
      return (
        !effectiveOwnedDLC.includes(baseCode) ||
        effectiveMaskedDLC.includes(baseCode)
      );
    });

    // 3. Missing Dependencies & Twins
    const missingDeps: any[] = [];
    const seenMissingKeys = new Set<string>();
    const selfUuids = new Set<string>();
    const selfBaseNames = new Set<string>();
    [mod, ...resolvedTargets, ...(mod?.flavors || [])].forEach((item) => {
      if (!item) return;
      collectAllCandidateUuids(item).forEach((u) => selfUuids.add(u));
      if (item.name) {
        selfBaseNames.add(
          String(item.name)
            .split(/[\\/]/)
            .pop()
            ?.replace(extRegex, "")
            .toLowerCase() || ""
        );
      }
    });

    groupedRelations.forEach((rel: any) => {
      if (rel && rel.isInstalled === false) {
        const key = String(rel.dbId || rel.hash || rel._groupedTitle || "").toLowerCase();
        if (key && !seenMissingKeys.has(key)) {
          seenMissingKeys.add(key);
          missingDeps.push(rel);
        }
      }
    });

    resolvedTargets.forEach((tm) => {
      const reqList = [
        ...(Array.isArray(tm?.requirements) ? tm.requirements : []),
        ...(Array.isArray(tm?.requires) ? tm.requires : []),
        ...(Array.isArray(tm?.twins) ? tm.twins : []),
      ];
      reqList.forEach((req: any) => {
        if (!req) return;
        const rawId =
          typeof req === "string" ? req : req.id || req.dbId || req.hash || "";
        const cleanId = extractCleanUuid(rawId).toLowerCase();
        const rawName =
          typeof req === "string"
            ? req.split("@").pop() || req
            : req.name || req.displayName || String(rawId);
        const baseName =
          String(rawName)
            .split(/[\\/]/)
            .pop()
            ?.replace(extRegex, "")
            .toLowerCase() || "";

        if (cleanId && selfUuids.has(cleanId)) return;
        if (baseName && selfBaseNames.has(baseName)) return;

        let installedMatch: any = null;
        if (cleanId) {
          installedMatch =
            vaultIndex.physicalByUuid.get(cleanId)?.[0] ||
            vaultIndex.virtualByUuid.get(cleanId) ||
            null;
        }
        if (!installedMatch && rawId) {
          installedMatch =
            vaultIndex.physicalByHash.get(String(rawId).toLowerCase())?.[0] ||
            null;
        }
        if (!installedMatch && baseName && isNaN(Number(baseName))) {
          const normTitle = normTitleForMatch(rawName);
          if (normTitle) {
            installedMatch = vaultIndex.physicalByNormTitle.get(normTitle)?.[0] || null;
          }
          if (!installedMatch) {
            installedMatch = vaultIndex.physicalMods.find((m: any) => {
              const mDisp = String(m.displayName || m.name || "").toLowerCase();
              return (
                mDisp.includes(baseName) ||
                mDisp.replace(/_/g, " ").includes(baseName.replace(/_/g, " "))
              );
            });
          }
        }
        if (!installedMatch) {
          const dedupKey = cleanId || baseName || String(rawId).toLowerCase();
          if (dedupKey && !seenMissingKeys.has(dedupKey)) {
            seenMissingKeys.add(dedupKey);
            missingDeps.push(
              typeof req === "object"
                ? req
                : { id: cleanId || rawId, name: cleanSearchName(rawName, activeGameSchema) }
            );
          }
        }
      });
    });

    // 4. Broken / Corrupted Status
    const getIsBrokenMod = (m: any) => {
      if (!m) return false;
      const st = String(m.status || "").toLowerCase();
      let broken = st === "broken" || st === "corrupted";
      if (
        broken &&
        st === "broken" &&
        m.compatible_versions &&
        m.compatible_versions.length > 0 &&
        selectedVersion
      ) {
        if (selectedVersion !== getHighestVersion(getVersions(m))) {
          broken = false;
        }
      }
      return broken;
    };
    const brokenMods = resolvedTargets.filter(getIsBrokenMod);
    if (brokenMods.length === 0 && getIsBrokenMod(mod) && !mod.isVirtual) {
      brokenMods.push(mod);
    }

    // 5. Flavor / Beta Swap Rivals & 6. Severity 4 / Severity 3 Collisions
    const flavorRivals: any[] = [];
    const fatalConflicts: any[] = [];
    const tier3Conflicts: any[] = [];
    const seenRivals = new Set<string>();
    const seenFatal = new Set<string>();
    const seenTier3 = new Set<string>();

    const getModBaseFamilyKey = (x: any): string =>
      String(x?.baseFamilyId || x?.familyId || x?.dbId || x?.name || "")
        .split("@")[0]
        .trim()
        .toLowerCase();

    const equippedModObjects = vaultIndex.physicalMods.filter(
      (m: any) => m?.name && !targetNameSet.has(m.name) && isModNameEquipped(m.name)
    );
    const equippedRivalCandidates = equippedModObjects.filter(
      (eq: any) =>
        resolveModHighlanderSlot(eq) != null ||
        eq.relationshipType === "flavor" ||
        eq.communityGroupId != null ||
        eq.relationshipType === "beta"
    );
    const equippedWithConflicts = equippedModObjects.filter(
      (eq: any) => Array.isArray(eq.conflicts) && eq.conflicts.length > 0
    );
    const equippedByUuid = new Map<string, any>();
    const equippedByCleanName = new Map<string, any>();
    for (const eq of equippedModObjects) {
      collectAllCandidateUuids(eq).forEach((u) => {
        if (!equippedByUuid.has(u)) equippedByUuid.set(u, eq);
      });
      const eqBase =
        String(eq.name || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(extRegex, "")
          .toUpperCase()
          .replace(/_SCRIPT(S)?$/i, "") || "";
      if (eqBase && !equippedByCleanName.has(eqBase)) {
        equippedByCleanName.set(eqBase, eq);
      }
      const eqDisp = String(eq.displayName || "").toUpperCase();
      if (eqDisp && !equippedByCleanName.has(eqDisp)) {
        equippedByCleanName.set(eqDisp, eq);
      }
    }

    const matchedExclusiveSlots: string[] = [];

    resolvedTargets.forEach((tm) => {
      if (!tm) return;
      if (anarchyRules?.highlander !== false) {
        const allowParentSlotFallback =
          tm.relationshipType !== "addon" && tm.relationshipType !== "flavor";
        const tmSlot =
          resolveModHighlanderSlot(tm) ||
          (allowParentSlotFallback ? resolveModHighlanderSlot(mod) : null);
        const tmBaseFam = getModBaseFamilyKey(tm);
        if (
          tmSlot != null ||
          tm.relationshipType === "flavor" ||
          tm.communityGroupId != null ||
          tm.relationshipType === "beta" ||
          equippedRivalCandidates.length > 0
        ) {
          equippedRivalCandidates.forEach((eq: any) => {
            if (eq.name === tm.name) return;
            const eqSlot = resolveModHighlanderSlot(eq);
            const eqBaseFam = getModBaseFamilyKey(eq);
            const eqCleanId = String(eq.dbId || eq.id || "").trim();
            const isExplicitTwin =
              tm.relationshipType === "twin" ||
              eq.relationshipType === "twin" ||
              (Array.isArray(tm.interchangeableIds) &&
                eqCleanId &&
                tm.interchangeableIds.map(String).includes(eqCleanId));
            const areSameModTwins = Boolean(
              tmBaseFam && eqBaseFam === tmBaseFam && isExplicitTwin
            );
            const isHighlanderSlotRival = Boolean(
              tmSlot &&
              eqSlot &&
              tmSlot.key === eqSlot.key &&
              !areSameModTwins
            );
            const isIntraFamilyFlavorRival = Boolean(
              tm.relationshipType === "flavor" &&
              eq.relationshipType === "flavor" &&
              tmBaseFam &&
              eqBaseFam === tmBaseFam
            );
            const isCommunityRival = Boolean(
              tm.communityGroupId &&
              eq.communityGroupId &&
              String(tm.communityGroupId) === String(eq.communityGroupId)
            );
            const isBetaRival =
              ((tm.relationshipType === "beta" && eq.relationshipType !== "beta") ||
                (tm.relationshipType !== "beta" && eq.relationshipType === "beta")) &&
              (tm.familyId || tm.dbId) &&
              (String(eq.familyId) === String(tm.familyId || tm.dbId) ||
                String(eq.dbId) === String(tm.familyId || tm.dbId));

            if (
              isHighlanderSlotRival ||
              isIntraFamilyFlavorRival ||
              isCommunityRival ||
              isBetaRival
            ) {
              const isModuleScoped =
                eq.relationshipType === "addon" ||
                eq.relationshipType === "flavor" ||
                (tmBaseFam && eqBaseFam === tmBaseFam);
              const rivalKey =
                isHighlanderSlotRival && !isModuleScoped ? eqBaseFam || eq.name : eq.name;
              if (!seenRivals.has(rivalKey)) {
                seenRivals.add(rivalKey);
                let displayTitle = eq.displayName || eq.name || "";
                if (isHighlanderSlotRival && !isModuleScoped && (eq.familyId || eq.dbId)) {
                  const parentCandidates =
                    vaultIndex.byUuid.get(
                      extractCleanUuid(eq.baseFamilyId, eq.familyId, eq.dbId).toLowerCase()
                    ) || [];
                  const virtualParent = parentCandidates.find((p: any) => p?.isVirtual && p?.displayName);
                  if (virtualParent?.displayName) {
                    displayTitle = virtualParent.displayName;
                  }
                }
                if (
                  isHighlanderSlotRival &&
                  tmSlot?.label &&
                  !matchedExclusiveSlots.includes(tmSlot.label)
                ) {
                  matchedExclusiveSlots.push(tmSlot.label);
                }
                flavorRivals.push({
                  ...eq,
                  _displayTitle: displayTitle,
                  _slotLabel: isHighlanderSlotRival ? tmSlot?.label : undefined,
                });
              }
            }
          });
        }
      }

      const tmBase =
        String(tm.name || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(extRegex, "")
          .toUpperCase()
          .replace(/_SCRIPT(S)?$/i, "") || "";
      const tmDispUpper = String(tm.displayName || "").toUpperCase();
      const tmUuidSet = new Set(collectAllCandidateUuids(tm));

      const allTargetConflicts = [
        ...(Array.isArray(tm.conflicts) ? tm.conflicts : []),
        ...(Array.isArray(mod?.conflicts) ? mod.conflicts : []),
      ];

      allTargetConflicts.forEach((c: any) => {
        if (!c) return;
        const rank = Number(c.severity_rank || 4);
        const enemyId = c.enemy_id ? extractCleanUuid(c.enemy_id).toLowerCase() : "";
        const enemyClean = c.enemy_name
          ? String(c.enemy_name)
            .replace(/\.[^/.]+$/i, "")
            .toUpperCase()
            .replace(/_SCRIPT(S)?$/i, "")
          : "";

        const matchedEquipped =
          (enemyId ? equippedByUuid.get(enemyId) : null) ||
          (enemyClean ? equippedByCleanName.get(enemyClean) : null);

        if (matchedEquipped) {
          if (rank === 4 && anarchyRules?.intercept !== false) {
            if (!seenFatal.has(matchedEquipped.name)) {
              seenFatal.add(matchedEquipped.name);
              fatalConflicts.push(matchedEquipped);
            }
          } else if (rank === 3) {
            if (!seenTier3.has(matchedEquipped.name)) {
              seenTier3.add(matchedEquipped.name);
              tier3Conflicts.push(matchedEquipped);
            }
          }
        }
      });

      equippedWithConflicts.forEach((eq: any) => {
        eq.conflicts.forEach((c: any) => {
          if (!c) return;
          const rank = Number(c.severity_rank || 4);
          const enemyId = c.enemy_id ? extractCleanUuid(c.enemy_id).toLowerCase() : "";
          const enemyClean = c.enemy_name
            ? String(c.enemy_name)
              .replace(/\.[^/.]+$/i, "")
              .toUpperCase()
              .replace(/_SCRIPT(S)?$/i, "")
            : "";
          const isMatch =
            (enemyId && tmUuidSet.has(enemyId)) ||
            (enemyClean && (tmBase === enemyClean || tmDispUpper === enemyClean));
          if (isMatch) {
            if (rank === 4 && anarchyRules?.intercept !== false) {
              if (!seenFatal.has(eq.name)) {
                seenFatal.add(eq.name);
                fatalConflicts.push(eq);
              }
            } else if (rank === 3) {
              if (!seenTier3.has(eq.name)) {
                seenTier3.add(eq.name);
                tier3Conflicts.push(eq);
              }
            }
          }
        });
      });
    });

    const hasAnyAlert =
      isGameVersionMismatch ||
      missingPacks.length > 0 ||
      missingDeps.length > 0 ||
      brokenMods.length > 0 ||
      flavorRivals.length > 0 ||
      fatalConflicts.length > 0 ||
      tier3Conflicts.length > 0;

    return {
      hasAnyAlert,
      isGameVersionMismatch,
      requiredGameVersion: effectiveTargetVer,
      missingPacks,
      missingDeps,
      brokenMods,
      flavorRivals,
      exclusiveSlotName: matchedExclusiveSlots[0] || "",
      fatalConflicts,
      tier3Conflicts,
    };
  };

  const allEquippableManifestNames = (() => {
    const set = new Set<string>();
    const addValidName = (n: any) => {
      if (
        n &&
        typeof n === "string" &&
        !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
      ) {
        set.add(n);
      }
    };

    if (groupedKids.length > 0) {
      groupedKids.forEach((kidGroup: any) => {
        if (kidGroup?.isInstalled === false) return;
        const gMods: any[] =
          Array.isArray(kidGroup?._groupedMods) &&
            kidGroup._groupedMods.length > 0
            ? kidGroup._groupedMods
            : [kidGroup];
        gMods.forEach((gm: any) => addValidName(gm?.name));
      });
    } else if (kids.length > 0) {
      kids.forEach((k: any) => addValidName(k?.name));
    } else if (!mod.isVirtual) {
      addValidName(mod.name);
    }

    return Array.from(set);
  })();

  const allEquipped =
    allEquippableManifestNames.length > 0 &&
    allEquippableManifestNames.every((n) => isModNameEquipped(n));

  const triggerYeetCascadeAlert = (
    casualties: string[],
    onConfirm: () => void
  ) => {
    setDossierAlertPending({
      mode: "yeet_cascade",
      casualties,
      onConfirm,
    });
  };

  const safeToggle = (targetName: string, forceMode?: "add" | "remove") => {
    if (!targetName) return;
    const isCurrentlyEquipped = isModNameEquipped(targetName);
    const shouldRemove =
      forceMode === "remove"
        ? true
        : forceMode === "add"
          ? false
          : isCurrentlyEquipped;
    const doToggle = (swapOpts?: {
      confirmedSwap?: boolean;
      skipHighlanderSwap?: boolean;
    }) => {
      onToggleInActiveSet(
        targetName,
        false,
        shouldRemove,
        !shouldRemove,
        swapOpts
      );
      if (
        selectedKid &&
        selectedKid.name === targetName &&
        shouldRemove
      ) {
        setSelectedKid(null);
      }
    };

    if (shouldRemove) {
      const c = getCasualties(targetName);
      if (c.length > 0) {
        triggerYeetCascadeAlert(c, () => doToggle());
        return;
      }
    } else {
      const alerts = evaluatePreEquipAlerts([targetName]);
      if (alerts.hasAnyAlert) {
        setDossierAlertPending({
          mode: "pre_equip",
          targetLabel: formatDisplayName(targetName),
          ...alerts,
          onConfirm: () => doToggle({ confirmedSwap: true }),
          onKeepBoth:
            alerts.flavorRivals.length > 0
              ? () => doToggle({ skipHighlanderSwap: true })
              : undefined,
        });
        return;
      }
    }
    doToggle({ confirmedSwap: true });
  };

  const safeToggleGroup = (groupItem: any) => {
    const groupMods: any[] =
      Array.isArray(groupItem?._groupedMods) && groupItem._groupedMods.length > 0
        ? groupItem._groupedMods
        : Array.isArray(groupItem?.flavors) && groupItem.flavors.length > 0
          ? groupItem.flavors
          : [groupItem];
    const validNames = Array.from(
      new Set(
        groupMods
          .map((gm: any) => gm?.name)
          .filter(
            (n: any) =>
              n &&
              typeof n === "string" &&
              !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
          )
      )
    );
    if (validNames.length === 0) {
      if (groupItem?.name) safeToggle(groupItem.name);
      return;
    }

    const isGroupEquipped = validNames.some((n) => isModNameEquipped(n));
    const performGroupToggle = (swapOpts?: {
      confirmedSwap?: boolean;
      skipHighlanderSwap?: boolean;
    }) => {
      if (isGroupEquipped) {
        const toRem = validNames.filter((n) => isModNameEquipped(n));
        if (toRem.length > 0) {
          onToggleInActiveSet(toRem, false, true, false);
        }
      } else {
        onToggleInActiveSet(validNames, false, false, true, swapOpts);
      }
    };

    const groupLabel =
      groupItem?._groupedTitle ||
      groupItem?.displayName ||
      formatDisplayName(validNames[0]);

    if (isGroupEquipped) {
      const c = getBatchCasualties(validNames, groupLabel);
      if (c.length > 0) {
        triggerYeetCascadeAlert(c, () => performGroupToggle());
        return;
      }
    } else {
      const alerts = evaluatePreEquipAlerts(validNames, [groupItem, ...groupMods]);
      if (alerts.hasAnyAlert) {
        setDossierAlertPending({
          mode: "pre_equip",
          targetLabel: groupLabel,
          ...alerts,
          onConfirm: () => performGroupToggle({ confirmedSwap: true }),
          onKeepBoth:
            alerts.flavorRivals.length > 0
              ? () => performGroupToggle({ skipHighlanderSwap: true })
              : undefined,
        });
        return;
      }
    }

    performGroupToggle({ confirmedSwap: true });
  };

  const handleToggleAll = () => {
    if (allEquippableManifestNames.length === 0) {
      if (mod?.name) safeToggle(mod.name);
      return;
    }

    const rootLabel =
      mod.displayName ||
      (mod.name || "").replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "");

    if (allEquipped) {
      const equippedNames = allEquippableManifestNames.filter((n) =>
        isModNameEquipped(n)
      );
      const doRemoveAll = () => {
        if (equippedNames.length > 0) {
          onToggleInActiveSet(equippedNames, false, true, false);
        }
      };

      const c = getBatchCasualties(equippedNames, rootLabel);
      if (c.length > 0) {
        triggerYeetCascadeAlert(c, doRemoveAll);
        return;
      }
      doRemoveAll();
    } else {
      const unequippedNames = allEquippableManifestNames.filter(
        (n) => !isModNameEquipped(n)
      );
      const doEquipAll = (swapOpts?: {
        confirmedSwap?: boolean;
        skipHighlanderSwap?: boolean;
      }) => {
        if (unequippedNames.length > 0) {
          onToggleInActiveSet(unequippedNames, false, false, true, swapOpts);
        }
      };
      const alerts = evaluatePreEquipAlerts(unequippedNames, [mod]);
      if (alerts.hasAnyAlert) {
        setDossierAlertPending({
          mode: "pre_equip",
          targetLabel: rootLabel,
          ...alerts,
          onConfirm: () => doEquipAll({ confirmedSwap: true }),
          onKeepBoth:
            alerts.flavorRivals.length > 0
              ? () => doEquipAll({ skipHighlanderSwap: true })
              : undefined,
        });
        return;
      }
      doEquipAll({ confirmedSwap: true });
    }
  };

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
        headerActions={(() => {
          if (editMode) {
            return (
              <PanelHeaderGroup>
                {!isCorrecting && (
                  <>
                    <PanelHeaderButton
                      icon={t("hub_save", "save")}
                      tooltip={
                        isSaving
                          ? t("dossier_btn_saving", "Saving...")
                          : t("btn_save_local", "Save")
                      }
                      variant="success"
                      onClick={handleSave}
                      disabled={isSaving}
                    />
                    <PanelHeaderButton
                      icon={t("icon_refresh", "refresh")}
                      tooltip={t("btn_reset", "Reset")}
                      variant="danger"
                      onClick={() => {
                        if (onResetMetadata) onResetMetadata(mod.hash);
                        handleClose();
                      }}
                    />
                  </>
                )}
                {isCorrecting &&
                  session &&
                  Number(mod.compliance_tier || 0) === 0 && (
                    <PanelHeaderButton
                      icon={
                        mustPassLabForScout && !isModLabVerified
                          ? t("icon_lock", "lock")
                          : t("icon_send", "send")
                      }
                      tooltip={
                        isSaving
                          ? t("btn_submitting", "Submitting...")
                          : t("btn_submit_corrections", "Submit")
                      }
                      variant="success"
                      onClick={handleSubmitToVault}
                      disabled={
                        isSaving || (mustPassLabForScout && !isModLabVerified)
                      }
                    />
                  )}
                <PanelHeaderButton
                  icon={t("icon_close", "close")}
                  tooltip={t("cancel", "Cancel")}
                  onClick={() => {
                    setEditMode(false);
                    setIsCorrecting(false);
                  }}
                />
              </PanelHeaderGroup>
            );
          }

          const resolvedMasonId = mod.mason_id || hydratedMeta?.mason_id;
          const canViewMasonProfile = Boolean(resolvedMasonId && onOpenMasonProfile);
          const canEquipMain = Boolean(
            !isNexusView && allEquippableManifestNames.length > 0
          );
          const canSyncSandbox = Boolean(mod.hash?.startsWith("dev_sandbox_") && isDesktop());
          const canExportRelease = Boolean(
            (mod.hash?.startsWith("dev_sandbox_") ||
              mod._isLocalSandbox ||
              mod.isSandbox ||
              String(mod.status || "").toLowerCase().includes("sandbox")) &&
            !mod.isVirtual &&
            !isNexusView &&
            !mod.name?.startsWith("LOCAL_SET_") &&
            isDesktop()
          );
          const canEditDesktop = Boolean(isDesktop());
          const canShredMalware = Boolean(
            userRole === "oversight" && mod.compliance_tier === 5
          );
          const validLocalSha256 = /^[0-9a-f]{64}$/i.test(
            String(mod?.hash || "").trim()
          );
          const canFlagMod = Boolean(
            !(Number(mod.compliance_tier || 0) >= 1 && Number(mod.compliance_tier || 0) <= 4) &&
            (targetDbId || validLocalSha256) &&
            !mod?.isVirtual &&
            !String(mod?.hash || "").startsWith("dev_sandbox_") &&
            session &&
            !isBanned
          );

          if (
            !canViewMasonProfile &&
            !canEquipMain &&
            !canSyncSandbox &&
            !canExportRelease &&
            !canEditDesktop &&
            !canShredMalware &&
            !canFlagMod
          ) {
            return undefined;
          }

          return (
            <PanelHeaderGroup>
              {canViewMasonProfile && (
                <PanelHeaderButton
                  icon={t("icon_person", "person")}
                  tooltip={t("btn_view_profile", "View Profile")}
                  onClick={() => {
                    onOpenMasonProfile?.(resolvedMasonId);
                  }}
                />
              )}
              {canEquipMain && (
                <PanelHeaderButton
                  icon={
                    allEquipped
                      ? t("icon_remove", "remove")
                      : t("icon_add", "add")
                  }
                  tooltip={
                    allEquipped
                      ? t("btn_unequip", "Unequip {Mod}")
                      : t("btn_equip", "Equip {Mod}")
                  }
                  variant={allEquipped ? "danger" : "success"}
                  onClick={handleToggleAll}
                />
              )}
              {canSyncSandbox && (
                <PanelHeaderButton
                  icon={t("icon_cloud_sync", "cloud_sync")}
                  tooltip={t("btn_sync_network", "Sync Network")}
                  variant="success"
                  onClick={() => {
                    if (onSyncToNetwork) onSyncToNetwork(mod);
                    else setEditMode(true);
                  }}
                />
              )}
              {canExportRelease && (
                <PanelHeaderButton
                  icon={t("icon_rocket_launch", "rocket_launch")}
                  tooltip={t("btn_export_release", "Export Release")}
                  onClick={handleExportLocalRelease}
                  disabled={isSaving}
                />
              )}
              {mod.name?.startsWith("LOCAL_SET_")
                ? canEditDesktop && (
                  <PanelHeaderButton
                    icon={t("icon_tune", "tune")}
                    tooltip={t("local_folders_edit", "Edit Folder")}
                    variant="warning"
                    onClick={() => {
                      handleClose();
                      window.dispatchEvent(
                        new CustomEvent("openLocalFolderEditor", {
                          detail: mod.dbId,
                        })
                      );
                    }}
                  />
                )
                : canEditDesktop && (
                  <PanelHeaderButton
                    icon={t("icon_edit", "edit")}
                    tooltip={
                      isCorrecting
                        ? t("btn_submit_corrections", "Submit Corrections")
                        : t("btn_edit", "Edit")
                    }
                    variant="warning"
                    onClick={() => setEditMode(true)}
                  />
                )}
              {canShredMalware && (
                <PanelHeaderButton
                  icon={t("icon_delete_forever", "delete_forever")}
                  tooltip={t("malware_alert_btn_shred", "Shred")}
                  variant="danger"
                  onClick={() => {
                    handleClose();
                    onSecureShred(mod.name);
                  }}
                />
              )}
              {canFlagMod && (
                <PanelHeaderButton
                  icon={t("icon_flag", "flag")}
                  tooltip={t("btn_flag", "Flag {Mod}")}
                  variant="warning"
                  onClick={() => setShowFlagModal(true)}
                />
              )}
            </PanelHeaderGroup>
          );
        })()}
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={statusIcon}
            overline={t("system_status", "System Status")}
            title={statusLabel}
            description={
              (mod.status_reason &&
                !/^\[ARCHITECT\b/i.test(String(mod.status_reason).trim())
                ? mod.status_reason
                : "") ||
              mod._alert_reason ||
              `${cleanArtifactTitle} • ${mod.author || t("unknown", "Unknown")}`
            }
            badge={
              mod.name?.includes(".")
                ? `.${(mod.name || "").split(".").pop()?.toUpperCase()}`
                : isCollection
                  ? t("collection", "Collection")
                  : mod.isParent
                    ? t("folder", "Folder")
                    : localCategory || t("label_artifact", "{Mod}")
            }
            badgeIcon={t("icon_inventory_2", "inventory_2")}
            badges={[
              ...(resolveModHighlanderSlot(mod)
                ? [
                  {
                    label: `${t("highlander_exclusive_slot", "Exclusive Slot")}: ${resolveModHighlanderSlot(mod)!.name}`,
                    icon: t("icon_swap_horiz", "swap_horiz"),
                    colorClass: "text-[var(--accent)]",
                  },
                ]
                : []),
              ...((editMode ? metaInputs.is_early_access : mod.is_early_access)
                ? [
                  {
                    label: t("badge_early_access", "Early Access"),
                    icon: t("icon_science", "science"),
                  },
                ]
                : []),
              ...((editMode ? metaInputs.is_paid : mod.is_paid)
                ? [
                  {
                    label: t("badge_paid", "Paid"),
                    icon: t("icon_monetization_on", "monetization_on"),
                    colorClass: "text-[var(--warning)]",
                  },
                ]
                : []),
            ]}
            variant={statusVariant}
          >
            <div className="flex flex-col gap-3">
              {hasValidCover && (
                <div className="w-full h-40 rounded-xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] glass-surface relative">
                  <img
                    src={coverImageUrl}
                    className="w-full h-full object-cover opacity-80"
                    alt={t("cc_cover_url", "Cover")}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                {!mod.isVirtual && mod.hash && (
                  <div className="flex flex-wrap items-center gap-2">
                    <LabVerificationBadge
                      dnaHash={mod.hash}
                      required={requireScoutLabTest && isCorrecting}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  {!editMode && !isNexusView && allEquippableManifestNames.length > 0 && (
                    <ActionButton
                      variant={allEquipped ? "danger" : "success"}
                      icon={
                        allEquipped
                          ? t("icon_remove_circle_outline", "remove_circle_outline")
                          : t("icon_add_circle_outline", "add_circle_outline")
                      }
                      label={
                        allEquipped
                          ? groupedKids.length > 1
                            ? t("remove_all", "Remove All")
                            : t("btn_unequip", "Unequip {Mod}")
                          : groupedKids.length > 1
                            ? t("add_all", "Add All")
                            : t("btn_equip", "Equip {Mod}")
                      }
                      onClick={handleToggleAll}
                    />
                  )}
                  {!editMode && !isDesktop() && (
                    <ActionButton
                      variant={isModStaged ? "accent" : "glass"}
                      icon={
                        isModStaged
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_phonelink", "phonelink")
                      }
                      label={
                        isModStaged
                          ? t("staging_btn_staged", "Staged")
                          : t("staging_btn_stage_mod", "Stage to PC")
                      }
                      onClick={() => handleStageTargetToPc(mod, isModStaged)}
                    />
                  )}
                  {!editMode &&
                    Number(mod.compliance_tier || 0) === 0 &&
                    isDesktop() && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_science", "science")}
                        label={t("btn_send_to_lab", "Send to Lab")}
                        onClick={() => {
                          handleClose();
                          onSendToLab();
                        }}
                      />
                    )}
                  {!editMode && !isNexusView && isDesktop() && versionPoolItems.length > 0 && (
                    <ActionButton
                      variant="glass"
                      icon={t("icon_history", "history")}
                      label={t("version_pool_btn_versions", "Versions")}
                      onClick={() => {
                        const mainVersionGroups = filterVersionGroupsForTarget(mod);
                        setActiveVersionModalGroups(mainVersionGroups);
                        setSelectedVersionGroupKeys(
                          mainVersionGroups.map((g) => g.key)
                        );
                      }}
                    />
                  )}
                  {!editMode && (
                    <ActionButton
                      variant="glass"
                      icon={
                        !isDesktop()
                          ? mod.url || hasOverrides
                            ? t("icon_open_in_new", "open_in_new")
                            : t("icon_search", "search")
                          : mod.url || hasOverrides
                            ? t("icon_download", "download")
                            : t("icon_search", "search")
                      }
                      label={
                        !isDesktop()
                          ? mod.url || hasOverrides
                            ? t("btn_view", "View")
                            : t("btn_search_web", "Search Web")
                          : mod.url || hasOverrides
                            ? t("btn_download", "Download")
                            : t("btn_search_web", "Search Web")
                      }
                      onClick={() => {
                        const url = getModFallbackUrl(
                          mod.displayName || mod.name || "",
                          mod.hash,
                          activeGameSchema,
                          { url: mod.url }
                        );
                        handleOpenUrl(url);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </SidePanelHeroCard>

          {editMode && (
            <SidePanelTitleInput
              value={metaInputs.name}
              onChange={setMetaInputs.name}
              placeholder={t("mod_name", "Artifact Name")}
              label={t("mod_name", "Artifact Name")}
              icon={t("icon_deployed_code", "deployed_code")}
            />
          )}

          {!mod.isVirtual &&
            !isNexusView &&
            mod.hash &&
            Number(mod.compliance_tier || 0) === 0 &&
            editMode &&
            isCorrecting && (
              <LabVerificationGate
                dnaHash={mod.hash}
                modName={mod.displayName || mod.name || "Artifact"}
                physicalPath={mod.physical_path || mod.name}
                roleContext="scout"
                isGateRequired={mustPassLabForScout}
                onStatusChange={(st) => setIsModLabVerified(st.verified)}
                onOpenInFullLab={
                  onSendToLab
                    ? () => {
                      handleClose();
                      onSendToLab();
                    }
                    : undefined
                }
              />
            )}

          <UniversalGroup
            title={t("tab_metadata", "Metadata & Telemetry")}
            icon={t("icon_analytics", "analytics")}
          >
            {!editMode ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatBox
                    label={t("mason", "{Mason}")}
                    value={mod.author || t("unknown", "Unknown")}
                    icon={t("icon_person", "person")}
                    iconColorClass="text-[var(--accent)]"
                    onClick={
                      (mod.mason_id || hydratedMeta?.mason_id) && onOpenMasonProfile
                        ? () => {
                          onOpenMasonProfile(mod.mason_id || hydratedMeta?.mason_id);
                        }
                        : undefined
                    }
                  />
                  <StatBox
                    label={t("revision", "Revision")}
                    value={resolvedVersion}
                    icon={t("icon_tag", "tag")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("label_game_version", "Game Version")}
                    value={
                      familyVersion === "Unknown" ||
                        familyVersion === "ALL" ||
                        familyVersion === ""
                        ? t("any", "Any")
                        : familyVersion
                    }
                    icon={t("icon_sports_esports", "sports_esports")}
                    iconColorClass="text-[var(--success)]"
                  />
                  <StatBox
                    label={t("label_mod_category", "{Mod} Category")}
                    value={
                      isCollection
                        ? t("collection", "Collection")
                        : mod.isParent
                          ? t("folder", "Folder")
                          : localCategory || t("uncategorized", "Uncategorized")
                    }
                    icon={t("icon_category", "category")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  {resolveModHighlanderSlot(mod) && (
                    <StatBox
                      label={t("highlander_exclusive_slot", "Exclusive Slot")}
                      value={resolveModHighlanderSlot(mod)!.name}
                      icon={t("icon_swap_horiz", "swap_horiz")}
                      iconColorClass="text-[var(--accent)]"
                    />
                  )}
                  <StatBox
                    label={t("tab_compliance", "Compliance")}
                    value={getComplianceTierDisplay(mod, isNexusView, t).value}
                    icon={t("icon_shield", "shield")}
                    iconColorClass={getComplianceTierDisplay(mod, isNexusView, t).color}
                  />
                  <StatBox
                    label={t("badge_early_access", "Access Tier")}
                    value={
                      mod.is_early_access
                        ? t("badge_early_access", "Early Access")
                        : mod.is_paid
                          ? t("badge_paid", "Paid")
                          : t("badge_free", "Free")
                    }
                    icon={
                      mod.is_early_access
                        ? t("icon_science", "science")
                        : mod.is_paid
                          ? t("icon_monetization_on", "monetization_on")
                          : t("icon_public", "public")
                    }
                    iconColorClass={
                      mod.is_paid
                        ? "text-[var(--warning)]"
                        : mod.is_early_access
                          ? "text-[var(--accent)]"
                          : "text-[var(--success)]"
                    }
                  />
                  <StatBox
                    label={t("label_uploaded", "Uploaded")}
                    value={resolvedCreatedAt}
                    icon={t("icon_calendar_today", "calendar_today")}
                  />
                  <StatBox
                    label={t("updated_date", "Updated")}
                    value={resolvedUpdatedAt}
                    icon={t("icon_update", "update")}
                  />
                </div>

                {(metaInputs.manifest_url || mod.manifest_url) && (
                  <div className="flex items-center justify-between gap-4 p-3.5 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_network_wifi", "network_wifi")}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">
                          {t(
                            "label_static_manifest_linked",
                            "Static Edge Manifest Linked"
                          )}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--subtext)] truncate">
                          {metaInputs.manifest_url || mod.manifest_url}
                        </span>
                      </div>
                    </div>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_sync", "sync")}
                      label={t("btn_poll_manifest", "Poll Manifest")}
                      onClick={() =>
                        onSaveMetadata({
                          manifest_url:
                            metaInputs.manifest_url || mod.manifest_url,
                        })
                      }
                    />
                  </div>
                )}

                {(() => {
                  const rawReason = String(mod.status_reason || "").trim();
                  const cleanStatusReason =
                    rawReason && !/^\[ARCHITECT\b/i.test(rawReason) ? rawReason : "";
                  const modStatusLower = String(mod.status || "").toLowerCase();
                  const hasIssueStatus =
                    modStatusLower === "broken" ||
                    modStatusLower === "corrupted" ||
                    modStatusLower === "unstable";
                  if (
                    !hasIssueStatus &&
                    !cleanStatusReason &&
                    dossierLabReports.length === 0
                  ) {
                    return null;
                  }
                  const isCorruptedStatus =
                    modStatusLower === "broken" || modStatusLower === "corrupted";
                  const statusToneClass = isCorruptedStatus
                    ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
                    : modStatusLower === "unstable"
                      ? "text-[var(--warning)] border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
                      : "text-[var(--accent)] border-[color-mix(in_srgb,var(--text)_14%,transparent)]";

                  return (
                    <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                            {t("icon_science", "science")}
                          </span>
                          {t(
                            "dossier_issues_lab_title",
                            "Issues, Causes & {Lab} Diagnostics"
                          )}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md bg-transparent border text-[9px] font-black uppercase tracking-widest ${statusToneClass}`}
                        >
                          {isCorruptedStatus
                            ? t("status_corrupted", "Corrupted")
                            : modStatusLower === "unstable"
                              ? t("status_unstable", "Unstable")
                              : t("tab_lab_reports", "Lab Reports")}
                        </span>
                      </div>

                      {cleanStatusReason && (
                        <div className="rounded-xl p-3 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t(
                              "label_issue_cause_summary",
                              "Documented Issue & Cause"
                            )}
                          </span>
                          <p className="text-xs font-semibold text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words">
                            {cleanStatusReason}
                          </p>
                        </div>
                      )}

                      <LabReportDiagnosticCards
                        reports={dossierLabReports}
                        activeGameSchema={activeGameSchema}
                      />
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("mason", "{Mason}")}
                    </label>
                    <input
                      value={metaInputs.author}
                      onChange={(e) => setMetaInputs.author(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t("author_placeholder", "{Mason} Name...")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("revision", "Revision")}
                    </label>
                    <input
                      value={metaInputs.version || ""}
                      onChange={(e) => setMetaInputs.version(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t("unknown", "1.0.0")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_mod_category", "{Mod} Category")}
                    </label>
                    <CustomClassificationDropdown
                      value={localCategory || "Script"}
                      onChange={(val: string) => setLocalCategory(val)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_game_version", "Game Version")}
                    </label>
                    <GameVersionMultiSelect
                      selectedVersions={localCompatibleVersions || []}
                      onChange={(v) => setLocalCompatibleVersions(v)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_uploaded", "Uploaded")}
                    </label>
                    <CustomDatePicker
                      value={localCreatedAt}
                      onChange={setLocalCreatedAt}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("updated_date", "Updated")}
                    </label>
                    <CustomDatePicker
                      value={localUpdatedAt}
                      onChange={setLocalUpdatedAt}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("registry_label_status", "Verification Status")}
                    </label>
                    <CustomDropdown
                      disableTint={true}
                      value={(() => {
                        const s = String(metaInputs.status || mod.status || "")
                          .toLowerCase()
                          .trim();
                        if (s === "corrupted" || s === "broken") return "corrupted";
                        if (s === "unstable") return "unstable";
                        return "stable";
                      })()}
                      onChange={(val: string) =>
                        setMetaInputs.status && setMetaInputs.status(val)
                      }
                      options={[
                        { id: "stable", label: t("status_stable", "Stable") },
                        { id: "unstable", label: t("label_unstable", "Unstable") },
                        { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label
                      className={`text-[10px] font-black uppercase tracking-wider px-1 flex items-center gap-1.5 ${String(metaInputs.status || mod.status || "").toLowerCase() ===
                        "corrupted" ||
                        String(metaInputs.status || mod.status || "").toLowerCase() ===
                        "broken"
                        ? "text-[var(--danger)]"
                        : String(metaInputs.status || mod.status || "").toLowerCase() ===
                          "unstable"
                          ? "text-[var(--warning)]"
                          : "text-[var(--subtext)]"
                        }`}
                    >
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_report_problem", "report_problem")}
                      </span>
                      {t(
                        "label_status_issue_details",
                        "Issue & Cause Details (Corrupted / Unstable)"
                      )}
                    </label>
                    <textarea
                      value={metaInputs.statusMsg || ""}
                      onChange={(e) =>
                        setMetaInputs.statusMsg &&
                        setMetaInputs.statusMsg(e.target.value)
                      }
                      placeholder={t(
                        "ph_status_issue_details",
                        "Explain what the issue is and what is causing it (shown on {Citizen} Alerts & {Mod} Dossier)..."
                      )}
                      className="w-full min-h-[72px] glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl p-3 text-xs font-semibold text-[var(--text)] resize-y focus:outline-none transition-all custom-scrollbar"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SidePanelPillToggle
                    checked={metaInputs.is_paid || false}
                    onChange={(val) => setMetaInputs.is_paid(val)}
                    icon={
                      metaInputs.is_paid
                        ? t("icon_monetization_on", "monetization_on")
                        : t("icon_money_off", "money_off")
                    }
                    label={`${t("label_is_paid", "Paid {Mod}")}: ${metaInputs.is_paid
                      ? t("badge_paid", "Paid")
                      : t("badge_free", "Free")
                      }`}
                    activeColor="var(--warning)"
                  />
                  <SidePanelPillToggle
                    checked={metaInputs.is_early_access || false}
                    onChange={(val) => setMetaInputs.is_early_access(val)}
                    icon={
                      metaInputs.is_early_access
                        ? t("icon_science", "science")
                        : t("icon_public", "public")
                    }
                    label={`${t("badge_early_access", "Early Access")}: ${metaInputs.is_early_access
                      ? t("badge_early_access", "Early Access")
                      : t("badge_standard", "Standard")
                      }`}
                    activeColor="var(--accent)"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("external_url_placeholder", "External URL")}
                    </label>
                    <input
                      value={metaInputs.url}
                      onChange={(e) => setMetaInputs.url(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("cc_cover_url", "Cover Image URL")}
                    </label>
                    <input
                      value={metaInputs.image}
                      onChange={(e) => setMetaInputs.image(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-[var(--accent)] uppercase tracking-wider px-1">
                      {t(
                        "edge_manifest_url_label",
                        "Static Edge Manifest URL (.sanctuary.manifest.json)"
                      )}
                    </label>
                    <input
                      value={metaInputs.manifest_url || ""}
                      onChange={(e) =>
                        setMetaInputs.manifest_url &&
                        setMetaInputs.manifest_url(e.target.value)
                      }
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t(
                        "placeholder_static_manifest_url",
                        "https://your-domain.com/.sanctuary.manifest.json"
                      )}
                    />
                  </div>
                </div>
              </div>
            )}
          </UniversalGroup>

          <UniversalGroup
            title={t("log_manifest", "{Mod} Description")}
            icon={t("icon_description", "description")}
          >
            {editMode ? (
              <textarea
                value={metaInputs.desc}
                onChange={(e) => setMetaInputs.desc(e.target.value)}
                className="w-full h-36 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl p-3.5 text-xs font-medium text-[var(--text)] resize-none focus:outline-none transition-all custom-scrollbar"
                placeholder={t("local_desc_placeholder", "Enter description...")}
              />
            ) : (
              <div className="text-xs text-[var(--text)] opacity-90 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] whitespace-pre-wrap">
                {mod.description || t("no_desc_manifest", "No description provided for this {Mod}.")}
              </div>
            )}
          </UniversalGroup>

          {groupedKids.length > 0 && (
            <UniversalGroup
              title={`${t("manifest", "Manifest")} (${groupedKids.length})`}
              icon={t("icon_inventory_2", "inventory_2")}
              headerAction={
                !isNexusView && (
                  <button
                    type="button"
                    onClick={handleToggleAll}
                    className={`h-7 px-3 rounded-lg glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${allEquipped
                      ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                      : "text-[var(--success)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)]"
                      }`}
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {allEquipped
                        ? t("icon_remove_circle_outline", "remove_circle_outline")
                        : t("icon_add_circle_outline", "add_circle_outline")}
                    </span>
                    <span>
                      {allEquipped
                        ? t("remove_all", "Remove All")
                        : t("add_all", "Add All")}
                    </span>
                  </button>
                )
              }
            >
              <SidePanelFilterBar className="grid-cols-3 gap-2.5 mb-3">
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={t("icon_inventory_2", "inventory_2")}
                  label={t("filter_all", "All")}
                  number={groupedKids.length}
                  colorClass="text-[var(--accent)]"
                  isActive={collectionFilter === "all"}
                  onClick={() => setCollectionFilter("all")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={t("icon_check_circle", "check_circle")}
                  label={t("status_in_vault", "In {Vault}")}
                  number={inVaultKidsCount}
                  colorClass="text-[var(--success)]"
                  isActive={collectionFilter === "in_vault"}
                  onClick={() => setCollectionFilter("in_vault")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={t("icon_error", "error")}
                  label={t("status_missing", "Missing")}
                  number={missingKidsCount}
                  colorClass="text-[var(--danger)]"
                  isActive={collectionFilter === "missing"}
                  onClick={() => setCollectionFilter("missing")}
                />
              </SidePanelFilterBar>

              <div className="mb-3">
                <ActionPill
                  searchQuery={collectionSearchQuery}
                  setSearchQuery={setCollectionSearchQuery}
                  searchPlaceholder={t("search_ph", "Search {mods}...")}
                  primaryPopover={{
                    icon: t("icon_tune", "tune"),
                    label: t("filters", "Filters"),
                    content: collectionFilterPopoverContent,
                  }}
                />
              </div>

              {filteredGroupedKids.length === 0 ? (
                <div className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-center">
                  {t("registry_no_mods", "No {Mods} Found")}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {visibleGroupedKids.map((kidGroup: any, kidIndex: number) => (
                    <DossierModuleCard
                      key={
                        kidGroup.hash ||
                        kidGroup.dbId ||
                        `${kidGroup._groupedTitle}_${kidIndex}`
                      }
                      item={kidGroup}
                      activeMods={activeMods}
                      isModNameEquipped={isModNameEquipped}
                      isNexusView={isNexusView}
                      activeGameSchema={activeGameSchema}
                      showImages={showImages}
                      t={t}
                      onInspect={handleInspectKid}
                      onToggleGroup={safeToggleGroup}
                      onToggleSingle={safeToggle}
                      isSingleItemStaged={isSingleItemStaged}
                      handleStageTargetToPc={handleStageTargetToPc}
                    />
                  ))}
                  {visibleKidsLimit < filteredGroupedKids.length && (
                    <div ref={kidsSentinelRef} className="col-span-full h-2" />
                  )}
                </div>
              )}
            </UniversalGroup>
          )}

          {(groupedRelations.length > 0 || conflicts.length > 0) && (
            <UniversalGroup
              title={t("network_protocols", "Required {Mods}")}
              icon={t("auto_extension", "extension")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupedRelations.map((relItem: any, i: number) => (
                  <DossierModuleCard
                    key={
                      relItem.dbId ||
                      relItem.hash ||
                      `${relItem._groupedTitle}_${i}`
                    }
                    item={relItem}
                    activeMods={activeMods}
                    isModNameEquipped={isModNameEquipped}
                    isNexusView={isNexusView}
                    activeGameSchema={activeGameSchema}
                    showImages={showImages}
                    t={t}
                    onInspect={handleInspectKid}
                    onToggleGroup={safeToggleGroup}
                    onToggleSingle={safeToggle}
                    isSingleItemStaged={isSingleItemStaged}
                    handleStageTargetToPc={handleStageTargetToPc}
                  />
                ))}
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      {kidToRender &&
        (() => {
          const rawKidTitle =
            kidToRender._groupedTitle ||
            (kidToRender.displayName &&
              !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(kidToRender.displayName))
              ? kidToRender.displayName
              : (kidToRender.name || "")
                .replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "")
                .split(/[/\\]/)
                .pop() || "");
          const cleanKidTitle =
            formatCleanModTitle(
              String(rawKidTitle).replace(/_/g, " ").replace(/\.[^/.]+$/, "")
            ) || String(rawKidTitle);

          const kidAuthor =
            pickFirstValidAuthor(t, kidToRender, mod) ||
            t("unknown", "Unknown");

          const kidVerCandidates = [
            ...(Array.isArray(kidToRender.mod_versions)
              ? kidToRender.mod_versions.map((mv: any) => mv?.version_label)
              : []),
            kidToRender.latest_version,
            kidToRender.version,
            resolvedVersion,
          ];
          const kidResolvedVersion =
            kidVerCandidates.find((v) => !isPlaceholderVersionStr(v, t)) ||
            t("unknown", "Unknown");

          const kidCompat = getVersions(kidToRender);
          const kidHighestVer =
            kidCompat.length > 0 ? formatVersionRangesLabel(kidCompat) : familyVersion;
          const kidGameVersionLabel =
            kidHighestVer === "Unknown" ||
              kidHighestVer === "ALL" ||
              kidHighestVer === ""
              ? t("any", "Any")
              : kidHighestVer;

          const kidCreatedDt =
            kidToRender.created_at ||
            kidToRender.mod_versions?.[0]?.created_at ||
            kidToRender._groupedMods?.find((gm: any) => gm?.created_at)?.created_at ||
            kidToRender.flavors?.find((fl: any) => fl?.created_at)?.created_at ||
            mod.created_at ||
            mod.mod_versions?.[0]?.created_at;
          const kidResolvedCreatedAt = kidCreatedDt
            ? new Date(kidCreatedDt).toLocaleDateString()
            : t("source_local", "Local");

          const kidUpdatedDt =
            kidToRender.updated_at ||
            kidToRender.mod_versions?.[0]?.created_at ||
            kidToRender.created_at ||
            kidToRender._groupedMods?.find(
              (gm: any) => gm?.updated_at || gm?.created_at
            )?.updated_at ||
            kidToRender.flavors?.find(
              (fl: any) => fl?.updated_at || fl?.created_at
            )?.updated_at ||
            mod.updated_at ||
            mod.created_at;
          const kidResolvedUpdatedAt = kidUpdatedDt
            ? new Date(kidUpdatedDt).toLocaleDateString()
            : t("source_local", "Local");

          const kidModules: any[] =
            Array.isArray(kidToRender._groupedMods) &&
              kidToRender._groupedMods.length > 0
              ? kidToRender._groupedMods
              : Array.isArray(kidToRender.flavors) &&
                kidToRender.flavors.length > 0
                ? kidToRender.flavors
                : [kidToRender];

          const groupedKidModules =
            kidModules.length > 1 ||
              kidToRender.isVirtual ||
              kidToRender.isParent ||
              kidToRender.isCollection ||
              (Array.isArray(kidToRender.hydratedCollectionChildren) &&
                kidToRender.hydratedCollectionChildren.length > 1)
              ? buildGroupedCollectionModules(
                kidModules,
                kidToRender.hydratedCollectionChildren || []
              )
              : [];

          const kidInVaultCount = groupedKidModules.filter(
            (k: any) => k.isInstalled !== false
          ).length;
          const kidMissingCount = groupedKidModules.filter(
            (k: any) => k.isInstalled === false
          ).length;

          const normKidSearch = deferredKidSearch
            .trim()
            .toLowerCase()
            .replace(/[_.\-/\\]+/g, " ")
            .replace(/\s+/g, " ");

          const filteredKidModules = groupedKidModules.filter((k: any) => {
            if (kidCollectionFilter === "in_vault" && k.isInstalled === false)
              return false;
            if (kidCollectionFilter === "missing" && k.isInstalled !== false)
              return false;
            if (kidEquipFilter === "EQUIPPED" && !isKidGroupEquipped(k))
              return false;
            if (kidEquipFilter === "UNEQUIPPED" && isKidGroupEquipped(k))
              return false;
            if (kidCategoryFilter !== "ALL") {
              const cat = resolveKidCategoryKey(k);
              if (cat.toLowerCase() !== kidCategoryFilter.toLowerCase())
                return false;
            }
            if (kidStatusFilter !== "ALL") {
              const rawStatus = String(k.status || "").toLowerCase();
              const isLocalOnly =
                !k.dbId ||
                rawStatus === "local" ||
                rawStatus === "unverified" ||
                String(k.version || "").toLowerCase() === "v.local";
              if (kidStatusFilter === "UNVERIFIED") {
                if (!isLocalOnly) return false;
              } else if (rawStatus !== kidStatusFilter.toLowerCase()) {
                return false;
              }
            }
            if (normKidSearch) {
              const gMods =
                Array.isArray(k._groupedMods) && k._groupedMods.length > 0
                  ? k._groupedMods
                  : [k];
              const titleStr = String(
                k._groupedTitle || k.displayName || k.name || ""
              )
                .toLowerCase()
                .replace(/[_.\-/\\]+/g, " ");
              const authorStr = String(k.author || k.master_author || "")
                .toLowerCase()
                .replace(/[_.\-/\\]+/g, " ");
              const matchesSub = gMods.some((gm: any) =>
                String(gm?.name || gm?.displayName || "")
                  .toLowerCase()
                  .replace(/[_.\-/\\]+/g, " ")
                  .includes(normKidSearch)
              );
              if (
                !titleStr.includes(normKidSearch) &&
                !authorStr.includes(normKidSearch) &&
                !matchesSub
              ) {
                return false;
              }
            }
            return true;
          });

          const kidEquippableNames = kidModules
            .map((km: any) => km?.name)
            .filter(
              (n: any) =>
                n &&
                typeof n === "string" &&
                !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
            );
          const isKidEquipped =
            kidEquippableNames.length > 0 &&
            kidEquippableNames.some((n: string) => isModNameEquipped(n));

          const rawKidName = String(kidToRender.name || "");

          const kidHeroDescription =
            kidToRender.status_reason || `${cleanKidTitle} • ${kidAuthor}`;

          const hasScriptKid = kidModules.some((km: any) =>
            isScriptExtension(
              String(km?.name || km?.file_extension || ""),
              activeGameSchema
            )
          );
          const kidCategoryLabel =
            kidToRender.category_override ||
            kidToRender.type ||
            (hasScriptKid
              ? t("type_script", "Script")
              : getFileLabel(rawKidName, activeGameSchema));

          const kidStatusRaw = String(kidToRender.status || "stable")
            .toLowerCase()
            .replace(/[\[\]]/g, "");
          const kidStatusLabel =
            kidStatusRaw === "broken" || kidStatusRaw === "corrupted"
              ? t("status_corrupted", "Broken")
              : kidStatusRaw === "unstable"
                ? t("label_unstable", "Unstable")
                : t("status_stable", "Stable");

          return (
            <SidePanel
              isOpen={!!selectedKid}
              onClose={() => setSelectedKid(null)}
              title={cleanKidTitle}
              subtitle={`${kidAuthor} • ${kidStatusLabel}`}
              icon={getModIcon(kidToRender, activeGameSchema, t)}
              iconColorClass="text-[var(--accent)]"
              widthClass="w-[660px] max-w-[100vw]"
              backdropZ="z-[120004]"
              panelZ="z-[120005]"
              headerActions={(() => {
                const hasKidEquip = !isNexusView && kidEquippableNames.length > 0;
                if (!hasKidEquip) return undefined;
                return (
                  <PanelHeaderGroup>
                    {hasKidEquip && (
                      <PanelHeaderButton
                        icon={
                          isKidEquipped
                            ? t("icon_remove", "remove")
                            : t("icon_add", "add")
                        }
                        tooltip={
                          isKidEquipped
                            ? t("btn_unequip", "Unequip {Mod}")
                            : t("btn_equip", "Equip {Mod}")
                        }
                        variant={isKidEquipped ? "danger" : "success"}
                        onClick={() => {
                          safeToggleGroup(kidToRender);
                          if (!isKidEquipped) setSelectedKid(null);
                        }}
                      />
                    )}
                  </PanelHeaderGroup>
                );
              })()}
            >
              <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                <SidePanelHeroCard
                  icon={getModIcon(kidToRender, activeGameSchema, t)}
                  overline={kidAuthor}
                  title={cleanKidTitle}
                  description={kidHeroDescription}
                  badge={kidResolvedVersion}
                  badgeIcon={t("icon_tag", "tag")}
                  variant="accent"
                >
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {!isNexusView && kidEquippableNames.length > 0 && (
                      <ActionButton
                        variant={isKidEquipped ? "danger" : "success"}
                        icon={
                          isKidEquipped
                            ? t("icon_remove_circle_outline", "remove_circle_outline")
                            : t("icon_add_circle_outline", "add_circle_outline")
                        }
                        label={
                          isKidEquipped
                            ? groupedKidModules.length > 1
                              ? t("remove_all", "Remove All")
                              : t("btn_unequip", "Unequip {Mod}")
                            : groupedKidModules.length > 1
                              ? t("add_all", "Add All")
                              : t("btn_equip", "Equip {Mod}")
                        }
                        onClick={() => safeToggleGroup(kidToRender)}
                      />
                    )}
                    {!isDesktop() && (
                      <ActionButton
                        variant={
                          isSingleItemStaged(kidToRender) ? "accent" : "glass"
                        }
                        icon={
                          isSingleItemStaged(kidToRender)
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_phonelink", "phonelink")
                        }
                        label={
                          isSingleItemStaged(kidToRender)
                            ? t("staging_btn_staged", "Staged")
                            : t("staging_btn_stage_mod", "Stage to PC")
                        }
                        onClick={() =>
                          handleStageTargetToPc(
                            { ...kidToRender, _stageSingle: true },
                            isSingleItemStaged(kidToRender)
                          )
                        }
                      />
                    )}
                    {!isNexusView && isDesktop() && versionPoolItems.length > 0 && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_history", "history")}
                        label={t("version_pool_btn_versions", "Versions")}
                        onClick={() => {
                          const kidVersionGroups = filterVersionGroupsForTarget(kidToRender);
                          setActiveVersionModalGroups(kidVersionGroups);
                          setSelectedVersionGroupKeys(
                            kidVersionGroups.map((g) => g.key)
                          );
                        }}
                      />
                    )}
                    <ActionButton
                      variant="glass"
                      icon={
                        !isDesktop()
                          ? kidToRender.url || mod.url
                            ? t("icon_open_in_new", "open_in_new")
                            : t("icon_search", "search")
                          : kidToRender.url || mod.url
                            ? t("icon_download", "download")
                            : t("icon_search", "search")
                      }
                      label={
                        !isDesktop()
                          ? kidToRender.url || mod.url
                            ? t("btn_view", "View")
                            : t("btn_search_web", "Search Web")
                          : kidToRender.url || mod.url
                            ? t("btn_download", "Download")
                            : t("btn_search_web", "Search Web")
                      }
                      onClick={() => {
                        const url = getModFallbackUrl(
                          cleanKidTitle || kidToRender.name || "",
                          kidToRender.hash,
                          activeGameSchema,
                          { url: kidToRender.url || mod.url }
                        );
                        handleOpenUrl(url);
                      }}
                    />
                  </div>
                </SidePanelHeroCard>

                <UniversalGroup
                  title={t("tab_metadata", "Metadata & Telemetry")}
                  icon={t("icon_analytics", "analytics")}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <StatBox
                      label={t("mason", "{Mason}")}
                      value={kidAuthor}
                      icon={t("icon_person", "person")}
                      iconColorClass="text-[var(--accent)]"
                      onClick={
                        kidToRender.mason_id && onOpenMasonProfile
                          ? () => {
                            onOpenMasonProfile(kidToRender.mason_id);
                          }
                          : undefined
                      }
                    />
                    <StatBox
                      label={t("revision", "Revision")}
                      value={kidResolvedVersion}
                      icon={t("icon_tag", "tag")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    <StatBox
                      label={t("label_game_version", "Game Version")}
                      value={kidGameVersionLabel}
                      icon={t("icon_sports_esports", "sports_esports")}
                      iconColorClass="text-[var(--success)]"
                    />
                    <StatBox
                      label={t("label_mod_category", "{Mod} Category")}
                      value={kidCategoryLabel}
                      icon={t("icon_category", "category")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    <StatBox
                      label={t("tab_compliance", "Compliance")}
                      value={getComplianceTierDisplay(kidToRender, isNexusView, t).value}
                      icon={t("icon_shield", "shield")}
                      iconColorClass={getComplianceTierDisplay(kidToRender, isNexusView, t).color}
                    />
                    <StatBox
                      label={t("badge_early_access", "Access Tier")}
                      value={
                        kidToRender.is_early_access
                          ? t("badge_early_access", "Early Access")
                          : kidToRender.is_paid
                            ? t("badge_paid", "Paid")
                            : t("badge_free", "Free")
                      }
                      icon={
                        kidToRender.is_early_access
                          ? t("icon_science", "science")
                          : kidToRender.is_paid
                            ? t("icon_monetization_on", "monetization_on")
                            : t("icon_public", "public")
                      }
                      iconColorClass={
                        kidToRender.is_paid
                          ? "text-[var(--warning)]"
                          : kidToRender.is_early_access
                            ? "text-[var(--accent)]"
                            : "text-[var(--success)]"
                      }
                    />
                    <StatBox
                      label={t("label_uploaded", "Uploaded")}
                      value={kidResolvedCreatedAt}
                      icon={t("icon_calendar_today", "calendar_today")}
                    />
                    <StatBox
                      label={t("updated_date", "Updated")}
                      value={kidResolvedUpdatedAt}
                      icon={t("icon_update", "update")}
                    />
                  </div>
                </UniversalGroup>

                <UniversalGroup
                  title={t("log_manifest", "{Mod} Description")}
                  icon={t("icon_description", "description")}
                >
                  <div className="text-xs text-[var(--text)] opacity-90 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] whitespace-pre-wrap">
                    {kidToRender.description ||
                      mod.description ||
                      t(
                        "no_desc_sub",
                        "No specific local description provided for this sub-{mod}."
                      )}
                  </div>
                </UniversalGroup>

                {groupedKidModules.length > 1 && (
                  <UniversalGroup
                    title={`${t("manifest", "Manifest")} (${groupedKidModules.length})`}
                    icon={t("icon_inventory_2", "inventory_2")}
                    headerAction={
                      !isNexusView &&
                      kidEquippableNames.length > 0 && (
                        <button
                          type="button"
                          onClick={() => safeToggleGroup(kidToRender)}
                          className={`h-7 px-3 rounded-lg glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${isKidEquipped
                            ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                            : "text-[var(--success)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)]"
                            }`}
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {isKidEquipped
                              ? t("icon_remove_circle_outline", "remove_circle_outline")
                              : t("icon_add_circle_outline", "add_circle_outline")}
                          </span>
                          <span>
                            {isKidEquipped
                              ? t("remove_all", "Remove All")
                              : t("add_all", "Add All")}
                          </span>
                        </button>
                      )
                    }
                  >
                    <SidePanelFilterBar className="grid-cols-3 gap-2.5 mb-3">
                      <DashboardStatTile
                        variant="filter"
                        className="!w-full"
                        icon={t("icon_inventory_2", "inventory_2")}
                        label={t("filter_all", "All")}
                        number={groupedKidModules.length}
                        colorClass="text-[var(--accent)]"
                        isActive={kidCollectionFilter === "all"}
                        onClick={() => setKidCollectionFilter("all")}
                      />
                      <DashboardStatTile
                        variant="filter"
                        className="!w-full"
                        icon={t("icon_check_circle", "check_circle")}
                        label={t("status_in_vault", "In {Vault}")}
                        number={kidInVaultCount}
                        colorClass="text-[var(--success)]"
                        isActive={kidCollectionFilter === "in_vault"}
                        onClick={() => setKidCollectionFilter("in_vault")}
                      />
                      <DashboardStatTile
                        variant="filter"
                        className="!w-full"
                        icon={t("icon_error", "error")}
                        label={t("status_missing", "Missing")}
                        number={kidMissingCount}
                        colorClass="text-[var(--danger)]"
                        isActive={kidCollectionFilter === "missing"}
                        onClick={() => setKidCollectionFilter("missing")}
                      />
                    </SidePanelFilterBar>

                    <div className="mb-3">
                      <ActionPill
                        searchQuery={kidSearchQuery}
                        setSearchQuery={setKidSearchQuery}
                        searchPlaceholder={t("search_ph", "Search {mods}...")}
                        primaryPopover={{
                          icon: t("icon_tune", "tune"),
                          label: t("filters", "Filters"),
                          content: (
                            <div className="flex flex-col w-[440px] p-4 max-w-[calc(100vw-40px)] text-left">
                              {!isNexusView && (
                                <DossierFilterSection
                                  t={t}
                                  title={t("blueprint", "{Blueprint}")}
                                  value={kidEquipFilter}
                                  onChange={(val: "ALL" | "EQUIPPED" | "UNEQUIPPED") =>
                                    setKidEquipFilter(val)
                                  }
                                  options={[
                                    { id: "ALL", label: t("filter_all", "All") },
                                    {
                                      id: "EQUIPPED",
                                      label: t("filter_in_blueprint", "In {Blueprint}"),
                                    },
                                    {
                                      id: "UNEQUIPPED",
                                      label: t("filter_not_equipped", "Not Equipped"),
                                    },
                                  ]}
                                />
                              )}
                              <DossierFilterSection
                                t={t}
                                title={t("filter_status", "Filter Status")}
                                value={kidStatusFilter}
                                onChange={(val: string) => setKidStatusFilter(val)}
                                options={[
                                  { id: "ALL", label: t("filter_all", "All") },
                                  { id: "stable", label: t("status_stable", "STABLE") },
                                  { id: "UNVERIFIED", label: t("unverified", "Unverified") },
                                  { id: "unstable", label: t("label_unstable", "Unstable") },
                                  { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                                ]}
                              />
                            </div>
                          ),
                        }}
                      />
                    </div>

                    {filteredKidModules.length === 0 ? (
                      <div className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-center">
                        {t("registry_no_mods", "No {Mods} Found")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredKidModules.map((kmGroup: any, kmIdx: number) => (
                          <DossierModuleCard
                            key={
                              kmGroup?.hash ||
                              kmGroup?.dbId ||
                              `${kmGroup?._groupedTitle}_${kmIdx}`
                            }
                            item={kmGroup}
                            activeMods={activeMods}
                            isModNameEquipped={isModNameEquipped}
                            isNexusView={isNexusView}
                            activeGameSchema={activeGameSchema}
                            showImages={showImages}
                            t={t}
                            onInspect={handleInspectKid}
                            onToggleGroup={safeToggleGroup}
                            onToggleSingle={safeToggle}
                            isSingleItemStaged={isSingleItemStaged}
                            handleStageTargetToPc={handleStageTargetToPc}
                          />
                        ))}
                      </div>
                    )}
                  </UniversalGroup>
                )}
              </div>
            </SidePanel>
          );
        })()}

      <ModVersionHistorySidePanel
        groups={selectedVersionGroups}
        isOpen={selectedVersionGroups.length > 0}
        onClose={() => {
          setSelectedVersionGroupKeys([]);
          setActiveVersionModalGroups([]);
        }}
        onActivateVersion={handleActivateDossierVersion}
        onDeleteVersion={handleDeleteDossierVersion}
        onRefresh={() => loadDossierVersionPool(true)}
        runRadarSweep={() => window.dispatchEvent(new CustomEvent("runRadarSweep"))}
        setStatus={(msg: string) => useStore.getState().pushStatus(msg)}
        parentTitle={cleanArtifactTitle}
      />

      {showFlagModal && (
        <SidePanel
          isOpen={showFlagModal}
          onClose={() => setShowFlagModal(false)}
          title={t("flag_title", "Flag {Mod}")}
          subtitle={t("flag_desc", "Route {Mod} compliance or metadata issues for review.")}
          icon={t("icon_flag", "flag")}
          iconColorClass="text-[var(--warning)]"
          widthClass="w-[520px] max-w-[100vw]"
          backdropZ="z-[120008]"
          panelZ="z-[120009]"
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_flag", "flag")}
              overline={t("flag_title", "Flag {Mod}")}
              title={cleanArtifactTitle}
              description={t(
                "nexus_compliance_flag_desc",
                "Tier 1–4 compliance flags route directly to Oversight Compliance as Pending until verified by Oversight or Wayfinder staff."
              )}
              variant="warning"
            />

            <UniversalGroup
              title={t("compliance_tier", "Compliance Tier (Tier 1–4)")}
              icon={t("icon_policy", "policy")}
            >
              <div className="space-y-3">
                <CustomComplianceDropdown
                  value={Math.min(4, Math.max(1, Number(flagComplianceTier || 1)))}
                  onChange={(val) => setFlagComplianceTier(val)}
                  minTier={1}
                  maxTier={4}
                />
                <UniversalTextArea
                  label={t("reason", "Reason")}
                  value={flagReasonNotes}
                  onChange={(val) => setFlagReasonNotes(val)}
                  placeholder={t(
                    "placeholder_provide_specific_details_or_context",
                    "Provide specific details or context..."
                  )}
                  rows={3}
                />
                <ActionButton
                  variant="warning"
                  icon={t("icon_policy", "policy")}
                  label={
                    isSubmittingFlag
                      ? t("submitting", "Submitting...")
                      : t("submit_compliance_flag_btn", "Submit to Oversight Compliance")
                  }
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("compliance", flagComplianceTier)}
                  className="!w-full !h-11 !justify-center"
                />
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("metadata_and_security", "Metadata & Security")}
              icon={t("icon_edit_note", "edit_note")}
            >
              <div className="flex flex-col gap-2.5">
                <ActionButton
                  variant="glass"
                  icon={t("icon_history", "history")}
                  label={t("dossier_flag_outdated", "Outdated Information")}
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("Outdated Information")}
                  className="!w-full !h-11 !justify-start !px-4"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_edit_note", "edit_note")}
                  label={t("flag_inaccurate", "Inaccurate Information")}
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("Inaccurate Information")}
                  className="!w-full !h-11 !justify-start !px-4"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_gpp_bad", "gpp_bad")}
                  label={t("flag_malware", "Suspected Malware")}
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("Suspected Malware")}
                  className="!w-full !h-11 !justify-start !px-4 !text-[var(--danger)]"
                />
              </div>
            </UniversalGroup>
          </div>
        </SidePanel>
      )}

      {dossierAlertPending &&
        (() => {
          const isCascade = dossierAlertPending.mode === "yeet_cascade";
          const handleConfirmDossierAlert = () => {
            const cb = dossierAlertPending.onConfirm;
            setDossierAlertPending(null);
            cb?.();
          };

          const handleKeepBothDossierAlert = () => {
            const cb = dossierAlertPending.onKeepBoth;
            setDossierAlertPending(null);
            cb?.();
          };

          if (isCascade) {
            const casualties: string[] = Array.isArray(
              dossierAlertPending.casualties
            )
              ? dossierAlertPending.casualties
              : [];
            return (
              <SidePanel
                isOpen={true}
                onClose={() => setDossierAlertPending(null)}
                title={t("yeet_cascade_detected", "Cascade Removal Detected")}
                subtitle={t(
                  "yeet_removing_following",
                  "Removing the following dependent artifacts"
                )}
                icon={t("icon_warning_amber", "warning")}
                iconColorClass="text-[var(--danger)] animate-pulse"
                backdropZ="z-[125000]"
                panelZ="z-[125001]"
                widthClass="w-[90vw] md:w-[620px]"
                headerActions={
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={t("icon_delete", "delete")}
                      tooltip={t("yeet_btn_confirm", "Confirm Removal")}
                      variant="danger"
                      onClick={handleConfirmDossierAlert}
                    />
                  </PanelHeaderGroup>
                }
              >
                <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                  <SidePanelHeroCard
                    icon={t("icon_warning_amber", "warning")}
                    overline={t("protocol_override", "Protocol Override")}
                    title={t(
                      "yeet_cascade_detected",
                      "Cascade Removal Detected"
                    )}
                    description={t(
                      "yeet_removing_following",
                      "These dependent artifacts require the target module and will also be unequipped."
                    )}
                    badge={`${casualties.length} ${t("term_mods", "Items")}`}
                    badgeIcon={t("icon_delete", "delete")}
                    variant="danger"
                  >
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <ActionButton
                        variant="glass"
                        icon={t("icon_close", "close")}
                        label={t("cancel", "Cancel")}
                        onClick={() => setDossierAlertPending(null)}
                      />
                      <ActionButton
                        variant="danger"
                        icon={t("icon_delete", "delete")}
                        label={t("yeet_btn_confirm", "Confirm Removal")}
                        onClick={handleConfirmDossierAlert}
                      />
                    </div>
                  </SidePanelHeroCard>

                  <UniversalGroup
                    title={`${t("yeet_removing_following", "Affected Artifacts")} (${casualties.length})`}
                    icon={t("icon_delete", "delete")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {casualties.map((c: any, i: number) => (
                        <div
                          key={i}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_delete", "delete")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {String(c).replace(/_/g, " ")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                              {t("icon_link_off", "link_off")}
                            </span>
                            <span>{t("protocol_override", "Dependent")}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                </div>
              </SidePanel>
            );
          }

          const {
            targetLabel,
            isGameVersionMismatch,
            requiredGameVersion,
            missingPacks = [],
            missingDeps = [],
            brokenMods = [],
            flavorRivals = [],
            exclusiveSlotName = "",
            fatalConflicts = [],
            tier3Conflicts = [],
          } = dossierAlertPending;

          const swapSlotTitle = exclusiveSlotName
            ? `${t("highlander_exclusive_slot", "Exclusive Slot")}: ${exclusiveSlotName}`
            : t("flavor_swap", "Flavor Swap");

          const primaryTitle = isGameVersionMismatch
            ? t("unsupported_version", "Unsupported Game Version")
            : missingDeps.length > 0
              ? t("missing_artifacts", "Missing {Mods}")
              : missingPacks.length > 0
                ? t("missing_dlc", "Missing DLC")
                : brokenMods.length > 0
                  ? t("broken_artifacts", "Corrupted {Mods}")
                  : fatalConflicts.length > 0
                    ? t("fatal_conflict", "Severity 4 Collision")
                    : flavorRivals.length > 0
                      ? swapSlotTitle
                      : t("tier3_conflict", "Severity 3 Collision");

          const primaryIcon = isGameVersionMismatch
            ? t("icon_sports_esports", "sports_esports")
            : missingDeps.length > 0
              ? t("icon_extension", "extension")
              : missingPacks.length > 0
                ? t("icon_currency_exchange", "currency_exchange")
                : brokenMods.length > 0
                  ? t("icon_broken_image", "broken_image")
                  : fatalConflicts.length > 0
                    ? t("icon_crisis_alert", "crisis_alert")
                    : flavorRivals.length > 0
                      ? t("icon_swap_horiz", "swap_horiz")
                      : t("icon_tune", "tune");

          const primaryVariant: "danger" | "warning" | "accent" =
            isGameVersionMismatch ||
              missingDeps.length > 0 ||
              missingPacks.length > 0 ||
              brokenMods.length > 0 ||
              fatalConflicts.length > 0
              ? "danger"
              : flavorRivals.length > 0
                ? "accent"
                : "warning";

          const isSwapPrimary = primaryVariant === "accent" && flavorRivals.length > 0;
          const primaryConfirmLabel =
            flavorRivals.length > 0
              ? t("btn_swap_mods", "Swap {Mods}")
              : t("btn_equip", "Equip {Mod}");

          return (
            <SidePanel
              isOpen={true}
              onClose={() => setDossierAlertPending(null)}
              title={primaryTitle}
              subtitle={targetLabel || cleanArtifactTitle}
              icon={primaryIcon}
              iconColorClass={
                primaryVariant === "danger"
                  ? "text-[var(--danger)]"
                  : primaryVariant === "accent"
                    ? "text-[var(--accent)]"
                    : "text-[var(--warning)]"
              }
              backdropZ="z-[125000]"
              panelZ="z-[125001]"
              widthClass="w-[90vw] md:w-[620px]"
              headerActions={
                <PanelHeaderGroup>
                  <PanelHeaderButton
                    icon={
                      isSwapPrimary
                        ? t("icon_swap_horiz", "swap_horiz")
                        : t("icon_check", "check")
                    }
                    tooltip={primaryConfirmLabel}
                    variant={
                      primaryVariant === "danger"
                        ? "danger"
                        : primaryVariant === "accent"
                          ? "accent"
                          : "warning"
                    }
                    onClick={handleConfirmDossierAlert}
                  />
                </PanelHeaderGroup>
              }
            >
              <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                <SidePanelHeroCard
                  icon={primaryIcon}
                  overline={
                    isSwapPrimary
                      ? t("highlander_exclusive_slot", "Exclusive Slot")
                      : t("protocol_override", "Protocol Override")
                  }
                  title={primaryTitle}
                  description={
                    isSwapPrimary
                      ? t(
                        "highlander_swap_prompt_desc",
                        "Another {mod} in this exclusive slot is already equipped. Swap to replace it cleanly, or keep both equipped and track the overlap in Conflict Radar."
                      )
                      : targetLabel || cleanArtifactTitle
                  }
                  badge={
                    exclusiveSlotName
                      ? exclusiveSlotName
                      : selectedVersion
                        ? `${t("label_game_version", "Game Version")}: ${selectedVersion}`
                        : undefined
                  }
                  badgeIcon={
                    exclusiveSlotName
                      ? t("icon_swap_horiz", "swap_horiz")
                      : t("icon_sports_esports", "sports_esports")
                  }
                  variant={primaryVariant}
                >
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_close", "close")}
                      label={t("cancel", "Cancel")}
                      onClick={() => setDossierAlertPending(null)}
                    />
                    {flavorRivals.length > 0 && dossierAlertPending.onKeepBoth && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_layers", "layers")}
                        label={t("btn_keep_both", "Keep Both")}
                        onClick={handleKeepBothDossierAlert}
                      />
                    )}
                    <ActionButton
                      variant={
                        primaryVariant === "danger"
                          ? "danger"
                          : primaryVariant === "accent"
                            ? "accent"
                            : "warning"
                      }
                      icon={
                        flavorRivals.length > 0
                          ? t("icon_swap_horiz", "swap_horiz")
                          : t("icon_add_circle_outline", "add_circle_outline")
                      }
                      label={primaryConfirmLabel}
                      onClick={handleConfirmDossierAlert}
                    />
                  </div>
                </SidePanelHeroCard>

                {isGameVersionMismatch && (
                  <UniversalGroup
                    title={t("unsupported_version", "Unsupported Game Version")}
                    icon={t("icon_sports_esports", "sports_esports")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <StatBox
                        label={t("required_version", "Required Game Version")}
                        value={requiredGameVersion || familyVersion}
                        icon={t("icon_sports_esports", "sports_esports")}
                        iconColorClass="text-[var(--danger)]"
                      />
                      <StatBox
                        label={t("label_game_version", "Game Version")}
                        value={selectedVersion || t("unknown", "Unknown")}
                        icon={t("icon_verified", "verified")}
                        iconColorClass="text-[var(--accent)]"
                      />
                    </div>
                  </UniversalGroup>
                )}

                {missingPacks.length > 0 && (
                  <UniversalGroup
                    title={`${t("missing_dlc", "Missing DLC")} (${missingPacks.length})`}
                    icon={t("icon_currency_exchange", "currency_exchange")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {missingPacks.map((p: string) => (
                        <div
                          key={p}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_currency_exchange", "currency_exchange")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {mapDlcCode(p)}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {p.split(" ")[0].toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {missingDeps.length > 0 && (
                  <UniversalGroup
                    title={`${t("missing_artifacts", "Missing {Mods}")} (${missingDeps.length})`}
                    icon={t("icon_extension", "extension")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {missingDeps.map((dep: any, idx: number) => {
                        const depTitle =
                          dep?._groupedTitle ||
                          dep?.displayName ||
                          dep?.name ||
                          String(dep?.id || dep || "");
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setDossierAlertPending(null);
                              handleInspectKid(dep);
                            }}
                            className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-between gap-3 cursor-pointer transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-[15px]">
                                  {t("icon_extension", "extension")}
                                </span>
                              </div>
                              <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                                {formatDisplayName(depTitle)}
                              </span>
                            </div>
                            <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                                {t("icon_error", "error")}
                              </span>
                              <span>{t("status_missing", "Missing")}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </UniversalGroup>
                )}

                {brokenMods.length > 0 && (
                  <UniversalGroup
                    title={`${t("broken_artifacts", "Corrupted {Mods}")} (${brokenMods.length})`}
                    icon={t("icon_broken_image", "broken_image")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {brokenMods.map((bm: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_broken_image", "broken_image")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(bm.displayName || bm.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("status_corrupted", "Corrupted")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {flavorRivals.length > 0 && (
                  <UniversalGroup
                    title={`${swapSlotTitle} (${flavorRivals.length})`}
                    icon={t("icon_swap_horiz", "swap_horiz")}
                    headerColorClass="text-[var(--accent)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {flavorRivals.map((rv: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_swap_horiz", "swap_horiz")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(rv._displayTitle || rv.displayName || rv.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("flavor_replaced", "Will Replace")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {fatalConflicts.length > 0 && (
                  <UniversalGroup
                    title={`${t("fatal_conflict", "Severity 4 Collision")} (${fatalConflicts.length})`}
                    icon={t("icon_crisis_alert", "crisis_alert")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {fatalConflicts.map((fc: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_crisis_alert", "crisis_alert")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(fc.displayName || fc.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("artifact_removed", "Will {Remove}")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {tier3Conflicts.length > 0 && (
                  <UniversalGroup
                    title={`${t("tier3_conflict", "Severity 3 Collision")} (${tier3Conflicts.length})`}
                    icon={t("icon_tune", "tune")}
                    headerColorClass="text-[var(--warning)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {tier3Conflicts.map((tc: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--warning)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_tune", "tune")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(tc.displayName || tc.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("tier3_conflict", "Severity 3 Collision")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}
              </div>
            </SidePanel>
          );
        })()}
    </>
  );
}

