import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import {
  ViewHeader,
  CustomDropdown,
  getFileLabel,
  getExtensionRegex,
  compareVersions,
  isVersionMatch,
  enrichBlueprintsWithPremiumStatus,
  ActionPill,
  fetchAllPaginated,
} from "../shared";
import {
  NEXUS_CACHE_SCHEMA_REV,
  NEXUS_CACHE_TTL_MS,
  NEXUS_ELIGIBLE_MOD_STATUSES,
  isStrictTier0Value,
  isNexusTier0EligibleMod,
  buildGroupedNexusTier0Artifacts,
  invalidateNexusCatalogCache,
  fetchNexusTier0CatalogSummary,
} from "../utils/nexusCatalogStats";
import { useLexicon } from "../LexiconContext";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { auditBlueprintsTier0Compliance } from '../side-panels/NexusSidePanels';
import { useTheme } from "../ThemeContext";
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from "../utils/envUtils";
import { loadInstalledTemplatesVersionMap, writeLocalTemplateFile } from "../utils/localTemplateInspector";
import { DashboardStatTile, StatTileCarousel } from "../hub-components/SharedCommandScreenLayout";
import { uploadThemeAssetsToCloud } from "../chameleon-components/ChameleonShared";
import { useVerifiedMasonOrStaff } from "../utils/hubCommandCache";



if (!window.__sanctuaryCache) {
  window.__sanctuaryCache = {} as any;
}
if (!window.__sanctuaryCache!.nexus || (window.__sanctuaryCache!.nexus as any).schemaRev !== NEXUS_CACHE_SCHEMA_REV) {
  window.__sanctuaryCache!.nexus = {
    nexusItems: null,
    lastNexusFetch: 0,
    assetResultsMap: {},
    lastAssetFetch: 0,
    homeStats: null,

    recentFeed: [],
    lastHomeFetch: 0,
    schemaRev: NEXUS_CACHE_SCHEMA_REV,
  } as any;
}

import { useNexusContextMenus } from "../components/nexus/useNexusContextMenus";
import { NexusHomeAndModsTabs } from "../components/nexus/NexusHomeAndModsTabs";
import { NexusAssetTabs, NexusModals } from "../components/nexus/NexusAssetTabsAndModals";
const CACHE_TTL = NEXUS_CACHE_TTL_MS;
let nexusFetchPromise: Promise<void> | null = null;
let assetsFetchPromise: Promise<void> | null = null;

interface NexusProps {
  ownedHashes: string[];
  onSetStatus: (msg: string) => void;
  onOpenMasonProfile?: (id: string) => void;
  onOpenDossier?: (mod: any) => void;
  syncBlueprintByCode?: (code: string) => void;
}

const cleanModName = (raw: string) => {
  if (!raw) return { name: "Unknown Mod", ext: "UNKNOWN" };
  const parts = raw.split(/[/\\]/);
  const filename = parts[parts.length - 1];
  let ext = "PACKAGE";
  let name = filename;
  const activeSchema = useStore.getState().activeGameSchema;
  const extRegex = getExtensionRegex(activeSchema);
  if (getFileLabel(filename, activeSchema) === "SCRIPT") {
    ext = "SCRIPT";
    name = filename.replace(extRegex, "").replace(/\.[^.]+$/, "");
  } else if (getFileLabel(filename, activeSchema) === "PACKAGE") {
    name = filename.replace(extRegex, "").replace(/\.[^.]+$/, "");
  } else if (filename.includes('.')) {
    const splitExt = filename.split('.');
    ext = splitExt[splitExt.length - 1].toUpperCase();
    name = splitExt.slice(0, -1).join('.');
  }
  return { name: name.replace(/_/g, ' '), ext };
};

export default function Nexus({ ownedHashes, onSetStatus, onOpenMasonProfile, onOpenDossier, syncBlueprintByCode }: NexusProps) {
  const {
    t,
    importLexicon,
    registry,
    previewLexiconId,
    startLexiconPreview,
    stopLexiconPreview,
  } = useLexicon();
  const session = useStore((state) => state.session);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const marketTab = useStore(state => state.marketTab);
  const canPublishNexusAssets = useVerifiedMasonOrStaff();
  const setMarketTab = useStore(state => state.setMarketTab);
  const selectedVersion = useStore(state => state.selectedVersion);
  const showImages = useStore(state => state.showImages);
  const marketSearchQuery = useStore(state => state.marketSearchQuery);
  const ownedDLC = useStore(state => state.ownedDLC) || [];
  const maskedDLC = useStore(state => state.maskedDLC) || [];
  const playSets = useStore(state => state.playSets) || [];
  const {
    importTheme,
    CORE_THEMES,
    customThemes,
    previewThemeId,
    startThemePreview,
    stopThemePreview,
  } = useTheme();
  const [assetResultsMap, setAssetResultsMap] = useState<Record<string, any[]>>(window.__sanctuaryCache!.nexus?.assetResultsMap || {});
  const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);
  const {
    nexusPreviewAsset: previewAsset,
    setNexusPreviewAsset: setPreviewAsset,
    stagingDraftItems,
    toggleModInStagingDraft,
    stageBlueprintToDraft,
  } = useModalStore(
    useShallow((s) => ({
      nexusPreviewAsset: s.nexusPreviewAsset,
      setNexusPreviewAsset: s.setNexusPreviewAsset,
      stagingDraftItems: s.stagingDraftItems,
      toggleModInStagingDraft: s.toggleModInStagingDraft,
      stageBlueprintToDraft: s.stageBlueprintToDraft,
    }))
  );
  const stagedModKeys = useMemo(() => {
    const s = new Set<string>();
    stagingDraftItems.forEach((item) => {
      const key = String(item.mod_id || item.dna_hash || item.id || item.name || "");
      if (key) {
        s.add(key);
        s.add(key.toLowerCase());
      }
      if (item.id) {
        s.add(String(item.id));
        s.add(String(item.id).toLowerCase());
      }
      if (item.dbId) {
        s.add(String(item.dbId));
        s.add(String(item.dbId).toLowerCase());
      }
      if (item.hash) {
        s.add(String(item.hash));
        s.add(String(item.hash).toLowerCase());
      }
      if (item.dna_hash) s.add(String(item.dna_hash));
      if (item.mod_id) s.add(String(item.mod_id));
    });
    return s;
  }, [stagingDraftItems]);
  const [results, setResults] = useState<any[]>(() => window.__sanctuaryCache!.nexus?.nexusItems || []);
  const [loadingMods, setLoadingMods] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [gameVersions, setGameVersions] = useState<any[]>([]);
  const [installedTemplates, setInstalledTemplates] = useState<Record<string, string>>({});
  const [selectedGameVersion, setSelectedGameVersion] = useState<string>(selectedVersion || "all");
  const [dlcFilter] = useState<string>("all");
  const [, setDlcRegistry] = useState<any[]>([]);
  const [hidePaid, setHidePaid] = useState<boolean>(() => {
    return localStorage.getItem('sanctuary_hide_paid') === 'true';
  });
  const [hideEarlyAccess, setHideEarlyAccess] = useState<boolean>(() => {
    return localStorage.getItem('sanctuary_hide_ea') === 'true';
  });
  const [hideMissingDLC, setHideMissingDLC] = useState<boolean>(() => {
    return localStorage.getItem('sanctuary_hide_missing_dlc') === 'true';
  });
  const [hideInstalled, setHideInstalled] = useState<boolean>(() => {
    return localStorage.getItem('sanctuary_hide_installed_assets') !== 'false';
  });

  const [assetSearchQuery, setAssetSearchQuery] = useState(marketSearchQuery);
  const [assetSortBy, setAssetSortBy] = useState("newest");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [lexiconTypeFilter, setLexiconTypeFilter] = useState("all");
  const [themeModeFilter, setThemeModeFilter] = useState("all");
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [masonMap, setMasonMap] = useState<Record<string, string>>({});
  const [uploadState, setUploadState] = useState({
    isOpen: false,
    isEdit: false,
    editId: null as number | null,
    fileContent: null as any,
    fileName: '',
    name: '',
    version: '1.0.0',
    description: '',
    releaseNotes: '',
    language: 'English',
    newLanguage: '',
    lexiconType: 'Theme',
    themeMode: 'Dark'
  });

  const [reportState, setReportState] = useState<{
    isOpen: boolean;
    assetId: string | number | null;
    assetType: string | null;
    reason: string;
    complianceTier?: number;
  }>({
    isOpen: false,
    assetId: null,
    assetType: null,
    reason: '',
    complianceTier: 1,
  });

  const [matrixBlueprintAsset, setMatrixBlueprintAsset] = useState<any>(null);

  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState("");

  const [isOffline, setIsOffline] = useState(!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true");

  const [stats, setStats] = useState(
    () => window.__sanctuaryCache!.nexus?.homeStats || { artifacts: 0, blueprints: 0, lexicons: 0, chameleons: 0, templates: 0 }
  );
  const [recentFeed, setRecentFeed] = useState<any[]>(
    () => (window.__sanctuaryCache!.nexus?.recentFeed || []).filter((item: any) => item.is_public !== false)
  );
  const [loadingHome, setLoadingHome] = useState(() => !window.__sanctuaryCache!.nexus?.homeStats);

  useEffect(() => {
    if (marketSearchQuery) {
      setSearchQuery(marketSearchQuery);
      setAssetSearchQuery(marketSearchQuery);
    }
  }, [marketSearchQuery]);

  useEffect(() => {
    const syncFreshCatalogSummary = () => {
      invalidateNexusCatalogCache({ dispatchEvent: false });
      if (!isOffline) {
        fetchNexusTier0CatalogSummary(supabase, { forceRefresh: true })
          .then((s) => {
            setStats({
              artifacts: s.artifacts,
              blueprints: s.blueprints,
              lexicons: s.lexicons,
              chameleons: s.chameleons,
              templates: s.templates,
            });
          })
          .catch(() => {});
        if (marketTab === "MODS") {
          fetchNexus(true, false);
        } else if (marketTab !== "HOME") {
          fetchNexusAssets(true, false);
        }
      }
    };
    const onFlagged = (e: any) => {
      const targetType = String(e?.detail?.targetType || "").toLowerCase();
      const targetId = e?.detail?.targetId;
      if (!targetId) return;
      const idStr = String(targetId);
      invalidateNexusCatalogCache({ dispatchEvent: false });
      setRecentFeed((prev) => prev.filter((item: any) => String(item?.id) !== idStr));
      if (window.__sanctuaryCache?.nexus?.recentFeed) {
        window.__sanctuaryCache.nexus.recentFeed = window.__sanctuaryCache.nexus.recentFeed.filter(
          (item: any) => String(item?.id) !== idStr
        );
      }
      if (targetType === "mod") {
        setResults((prev) => prev.filter((m: any) => String(m?.id) !== idStr));
        if (window.__sanctuaryCache?.nexus?.nexusItems) {
          window.__sanctuaryCache.nexus.nexusItems = window.__sanctuaryCache.nexus.nexusItems.filter(
            (m: any) => String(m?.id) !== idStr
          );
        }
        setStats((prev: any) => ({
          ...prev,
          artifacts: Math.max(0, (prev.artifacts || 0) - 1),
        }));
      } else {
        setAssetResultsMap((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (Array.isArray(next[k])) {
              next[k] = next[k].filter((a: any) => String(a?.id) !== idStr);
            }
          }
          if (window.__sanctuaryCache?.nexus) {
            window.__sanctuaryCache.nexus.assetResultsMap = next;
          }
          return next;
        });
      }
      if (!isOffline) {
        fetchNexusTier0CatalogSummary(supabase, { forceRefresh: true })
          .then((s) => {
            setStats({
              artifacts: s.artifacts,
              blueprints: s.blueprints,
              lexicons: s.lexicons,
              chameleons: s.chameleons,
              templates: s.templates,
            });
          })
          .catch(() => {});
      }
    };
    window.addEventListener("sanctuary-content-flagged", onFlagged);
    window.addEventListener("sanctuary-compliance-updated", syncFreshCatalogSummary);
    return () => {
      window.removeEventListener("sanctuary-content-flagged", onFlagged);
      window.removeEventListener("sanctuary-compliance-updated", syncFreshCatalogSummary);
    };
  }, [isOffline, marketTab]);

  useEffect(() => {
    if (isOffline || marketTab === "HOME") return;
    const cache = window.__sanctuaryCache?.nexus as any;
    if (cache?.schemaRev === NEXUS_CACHE_SCHEMA_REV && cache?.homeStats) return;
    fetchNexusTier0CatalogSummary(supabase)
      .then((s) => {
        setStats({
          artifacts: s.artifacts,
          blueprints: s.blueprints,
          lexicons: s.lexicons,
          chameleons: s.chameleons,
          templates: s.templates,
        });
      })
      .catch(() => {});
  }, [isOffline, marketTab]);

  useEffect(() => {
    if (marketTab === 'HOME' && !isOffline) {
      const fetchHomeData = async () => {
        const cachedFeed = window.__sanctuaryCache!.nexus!.recentFeed || [];
        const hasIncompleteSuiteCache = cachedFeed.some(
          (item: any) => (item.familyCount || 0) > 1 && (item.flavors?.length || 0) < 2
        );
        const isCacheFresh =
          !hasIncompleteSuiteCache &&
          window.__sanctuaryCache!.nexus!.homeStats &&
          window.__sanctuaryCache!.nexus!.lastHomeFetch > 0 &&
          (performance.now() - window.__sanctuaryCache!.nexus!.lastHomeFetch < CACHE_TTL);

        // Stale-While-Revalidate: Show cache immediately if we have it
        if (window.__sanctuaryCache!.nexus!.homeStats && !hasIncompleteSuiteCache) {
          setStats(window.__sanctuaryCache!.nexus!.homeStats);
          setRecentFeed(cachedFeed.filter((item: any) => item.is_public !== false && item?.has_pending_flag !== true));
          setLoadingHome(false);
        }

        if (isCacheFresh) {
          fetchNexus(false, true);
          fetchNexusAssets(false, true);
          return;
        }

        if (!window.__sanctuaryCache!.nexus!.homeStats) setLoadingHome(true);
        try {
          const selectFields = "*";
          const [
            catalogSummary,
            { data: recentModsRawData },
            { data: recentBps },
            { data: recentAssets }
          ] = await Promise.all([
            fetchNexusTier0CatalogSummary(supabase, { forceRefresh: true }),
            supabase
              .from('mods')
              .select(selectFields)
              .eq('compliance_tier', 0)
              .eq('has_pending_flag', false)
              .in('status', [...NEXUS_ELIGIBLE_MOD_STATUSES])
              .order('created_at', { ascending: false })
              .limit(100),
            supabase.from('blueprints').select('*').eq('is_public', true).eq('is_market_listed', true).eq('compliance_tier', 0).eq('has_pending_flag', false).order('created_at', { ascending: false }).limit(20),
            supabase.from('nexus_assets').select('*').eq('has_pending_flag', false).or('is_public.eq.true,is_public.is.null').order('created_at', { ascending: false }).limit(20)
          ]);

          const visibleRecentBps = (recentBps || []).filter((b: any) => b?.has_pending_flag !== true && isStrictTier0Value(b?.compliance_tier));
          const visibleRecentAssets = (recentAssets || []).filter((a: any) => a?.has_pending_flag !== true && a?.is_public !== false);

          const newStats = {
            artifacts: catalogSummary.artifacts,
            blueprints: catalogSummary.blueprints || visibleRecentBps.length || 0,
            lexicons: catalogSummary.lexicons,
            chameleons: catalogSummary.chameleons,
            templates: catalogSummary.templates
          };

          setStats(newStats);
          window.__sanctuaryCache!.nexus!.homeStats = newStats;
          (window.__sanctuaryCache!.nexus as any).schemaRev = NEXUS_CACHE_SCHEMA_REV;

          let recentModsRaw = recentModsRawData ? recentModsRawData.filter(m => isNexusTier0EligibleMod(m)).slice(0, 50) : [];

          let processedRecentMods: any[] = [];
          if (recentModsRaw && recentModsRaw.length > 0) {
            const modIds = recentModsRaw.map(m => m.id);
            const [{ data: relationsAsChild }, { data: relationsAsParent }, { data: collections }] = await Promise.all([
              supabase.from('mod_relationships').select('child_id, parent_id').in('child_id', modIds).in('relationship_type', ['twin', 'addon', 'flavor', 'set_item', 'beta']),
              supabase.from('mod_relationships').select('child_id, parent_id').in('parent_id', modIds).in('relationship_type', ['twin', 'addon', 'flavor', 'set_item', 'beta']),
              supabase.from('collection_members').select('mod_id, set_id, collections(*, masons(name))').in('mod_id', modIds)
            ]);
            const relations = [...(relationsAsChild || []), ...(relationsAsParent || [])];

            const parentIdsToFetch = relationsAsChild?.map(r => r.parent_id).filter(id => !modIds.includes(id as any)) || [];
            const allParentIds = Array.from(new Set(relations.map(r => r.parent_id)));
            const allSetIds = Array.from(new Set(collections?.map(c => c.set_id) || []));

            const [fetchedParentsRes, { data: allSiblings }, { data: allSetMembers }] = await Promise.all([
              parentIdsToFetch.length > 0
                ? supabase
                    .from('mods')
                    .select(selectFields)
                    .in('id', parentIdsToFetch)
                    .eq('compliance_tier', 0)
                    .eq('has_pending_flag', false)
                    .in('status', [...NEXUS_ELIGIBLE_MOD_STATUSES])
                : Promise.resolve({ data: [] as any[] }),
              allParentIds.length > 0 ? supabase.from('mod_relationships').select('child_id, parent_id').in('parent_id', allParentIds).in('relationship_type', ['twin', 'addon', 'flavor', 'set_item', 'beta']) : Promise.resolve({ data: [] as any[] }),
              allSetIds.length > 0 ? supabase.from('collection_members').select('mod_id, set_id, mods(id, name, master_author, mason_id, compliance_tier, has_pending_flag, status)').in('set_id', allSetIds) : Promise.resolve({ data: [] as any[] })
            ]);
            const fetchedParents: any[] = (fetchedParentsRes.data || []).filter((p: any) => isNexusTier0EligibleMod(p));

            const siblingIdsToFetch = Array.from(new Set(
              (allSiblings || [])
                .map((s: any) => s.child_id)
                .filter((id: any) => id && !modIds.includes(id) && !parentIdsToFetch.includes(id))
            ));
            let fetchedSiblings: any[] = [];
            if (siblingIdsToFetch.length > 0) {
              const siblingChunks: any[] = [];
              for (let i = 0; i < siblingIdsToFetch.length; i += 200) {
                siblingChunks.push(
                  supabase
                    .from('mods')
                    .select(selectFields)
                    .in('id', siblingIdsToFetch.slice(i, i + 200))
                    .eq('compliance_tier', 0)
                    .eq('has_pending_flag', false)
                    .in('status', [...NEXUS_ELIGIBLE_MOD_STATUSES])
                );
              }
              const sibResponses = await Promise.all(siblingChunks);
              for (const sr of sibResponses) {
                if (Array.isArray(sr?.data)) {
                  fetchedSiblings.push(...sr.data.filter((m: any) => isNexusTier0EligibleMod(m)));
                }
              }
            }

            const allModsForFeed = [...recentModsRaw, ...fetchedParents, ...fetchedSiblings];
            const modMap = new Map(allModsForFeed.map(m => [m.id, m]));

            const trueFamilyCounts = new Map<string, number>();
            const seenFamilyPairs = new Set<string>();
            allSiblings?.forEach((s: any) => {
              if (!modMap.has(s.parent_id) || !modMap.has(s.child_id)) return;
              const pairKey = `${s.parent_id}::${s.child_id}`;
              if (seenFamilyPairs.has(pairKey)) return;
              seenFamilyPairs.add(pairKey);
              trueFamilyCounts.set(s.parent_id, (trueFamilyCounts.get(s.parent_id) || 0) + 1);
            });
            const trueSetCounts = new Map<string, number>();
            allSetMembers?.forEach((s: any) => {
              const rm = Array.isArray(s?.mods) ? s.mods[0] : s?.mods;
              if (!isNexusTier0EligibleMod(rm)) return;
              trueSetCounts.set(s.set_id, (trueSetCounts.get(s.set_id) || 0) + 1);
            });

            const groupedMods = new Map();

            const pushUniqueFlavor = (flavorsArr: any[], candidate: any) => {
              if (!candidate) return;
              const cid = String(candidate.id || "");
              if (cid && flavorsArr.some((f: any) => String(f.id || "") === cid)) return;
              flavorsArr.push(candidate);
            };

            recentModsRaw.forEach(mod => {
              const colMember = collections?.find(c => c.mod_id === mod.id);
              const rawCol = Array.isArray(colMember?.collections) ? colMember?.collections[0] : colMember?.collections;
              if (colMember && rawCol && isStrictTier0Value((rawCol as any)?.compliance_tier) && (rawCol as any)?.has_pending_flag !== true) {
                const col = rawCol as any;
                const colMasonName = Array.isArray(col?.masons) ? col.masons[0]?.name : col?.masons?.name;
                if (!groupedMods.has(`collection_${col.id}`)) {
                  groupedMods.set(`collection_${col.id}`, {
                    id: `collection_${col.id}`,
                    name: col.name,
                    category_override: "Collection",
                    status: "stable",
                    compliance_tier: 0,
                    image_url: col.image_url,
                    master_author: colMasonName || col.creator_name || mod.master_author || "Unknown Creator",
                    description: col.description || null,
                    created_at: mod.created_at,
                    isCollection: true,
                    isVirtual: true,
                    isParent: true,
                    familyCount: trueSetCounts.get(col.id) || 1,
                    flavors: [mod]
                  });
                } else {
                  pushUniqueFlavor(groupedMods.get(`collection_${col.id}`).flavors, mod);
                }
              } else {
                const rel = relationsAsChild?.find(r => r.child_id === mod.id);
                if (rel) {
                  const parent = modMap.get(rel.parent_id);
                  if (parent) {
                    if (!groupedMods.has(parent.id)) {
                      const initFlavors: any[] = [];
                      pushUniqueFlavor(initFlavors, { ...parent });
                      pushUniqueFlavor(initFlavors, mod);
                      groupedMods.set(parent.id, {
                        ...parent,
                        created_at: mod.created_at,
                        isParent: true,
                        isVirtual: true,
                        familyCount: (trueFamilyCounts.get(parent.id) || 0) + 1,
                        flavors: initFlavors
                      });
                    } else {
                      const existingParent = groupedMods.get(parent.id);
                      if (!existingParent.flavors) {
                        existingParent.flavors = [{ ...existingParent }];
                        existingParent.isParent = true;
                        existingParent.isVirtual = true;
                      }
                      pushUniqueFlavor(existingParent.flavors, mod);
                    }
                  }
                } else {
                  const isParentMod = relationsAsParent?.some(r => r.parent_id === mod.id);
                  if (isParentMod) {
                    if (!groupedMods.has(mod.id)) {
                      groupedMods.set(mod.id, {
                        ...mod,
                        isParent: true,
                        isVirtual: true,
                        familyCount: (trueFamilyCounts.get(mod.id) || 0) + 1,
                        flavors: [{ ...mod }]
                      });
                    } else {
                      const existingParent = groupedMods.get(mod.id);
                      if (!existingParent.flavors) {
                        existingParent.flavors = [];
                      }
                      if (!existingParent.flavors.some((f: any) => String(f.id) === String(mod.id))) {
                        existingParent.flavors.unshift({ ...mod });
                      }
                    }
                  } else {
                    if (!groupedMods.has(mod.id)) groupedMods.set(mod.id, mod);
                  }
                }
              }
            });

            allSiblings?.forEach((s: any) => {
              const parentEntry = groupedMods.get(s.parent_id);
              const sibMod = modMap.get(s.child_id);
              if (parentEntry && parentEntry.flavors && sibMod) {
                pushUniqueFlavor(parentEntry.flavors, sibMod);
              }
            });

            const nameMap = new Map();
            Array.from(groupedMods.values()).forEach(item => {
              const name = item.name?.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (!name) return;
              const existing = nameMap.get(name);
              if (!existing) {
                nameMap.set(name, item);
              } else {
                if ((existing.isVirtual || existing.isParent) && !(item.isVirtual || item.isParent)) {
                  // keep existing
                } else if (!(existing.isVirtual || existing.isParent) && (item.isVirtual || item.isParent)) {
                  nameMap.set(name, item);
                }
              }
            });

            processedRecentMods = Array.from(nameMap.values()).slice(0, 20);
          }

          let combined = [
            ...(processedRecentMods).map((m: any) => ({ ...m, feed_type: 'artifact' })),
            ...visibleRecentBps.map((b: any) => ({ ...b, feed_type: 'blueprint' })),
            ...visibleRecentAssets.map((a: any) => ({ ...a, feed_type: a.asset_type === 'workbench_template' ? 'template' : a.asset_type }))
          ];

          combined = combined.filter((item: any) => {
            if (item.is_public === false || item.has_pending_flag === true) return false;
            if (item.feed_type === 'blueprint' && !isStrictTier0Value(item.compliance_tier)) return false;
            if (item.feed_type === 'artifact') {
              if (!isStrictTier0Value(item.compliance_tier)) return false;
              if (!item.isCollection && !isNexusTier0EligibleMod(item)) return false;
              return !item.name?.toLowerCase().includes("manual flag");
            }
            return true;
          });

          combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          const finalFeed = combined.slice(0, 20);
          setRecentFeed(finalFeed);
          window.__sanctuaryCache!.nexus!.recentFeed = finalFeed;
          window.__sanctuaryCache!.nexus!.lastHomeFetch = performance.now();

        } catch (err) {
          console.error("NEXUS LOG ERROR: Failed to fetch home data:", err);
        } finally {
          setLoadingHome(false);
          fetchNexus(false, true);
          fetchNexusAssets(false, true);
        }
      };
      fetchHomeData();
    }
  }, [marketTab, isOffline]);

  useEffect(() => {
    const fetchLocalTemplates = async () => {
      if (!isDesktop()) return;
      try {
        const config: any = await invoke('get_saved_coordinates');
        const map = await loadInstalledTemplatesVersionMap(config?.vault_path);
        setInstalledTemplates(map);
      } catch { }
    };
    fetchLocalTemplates();
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(localStorage.getItem("sanctuary_local_only") === "true");
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const itemsPerPage = 50;

  useEffect(() => {
    fetchGameVersions();
    fetchDlcRegistry();
  }, []);

  useEffect(() => {
    if (!isOffline && marketTab !== 'HOME') {
      fetchNexusAssets();
    }
  }, [isOffline, marketTab]);

  useEffect(() => {
    if (marketTab === 'MODS') {
      fetchNexus();
    }
  }, [marketTab]);

  useEffect(() => {
    if (marketSearchQuery) {
      if (marketTab === 'MODS') {
        setSearchQuery(marketSearchQuery);
      } else {
        setAssetSearchQuery(marketSearchQuery);
      }
    }
  }, [marketSearchQuery]);

  async function fetchNexusAssets(forceRefresh = false, isSilent = false) {
    if (isOffline) {
      if (!isSilent) setLoadingAssets(false);
      return;
    }

    const hasCache = Object.keys(window.__sanctuaryCache!.nexus!.assetResultsMap).length > 0;
    const isCacheFresh = !forceRefresh && hasCache && (performance.now() - window.__sanctuaryCache!.nexus!.lastAssetFetch < CACHE_TTL);

    // Stale-While-Revalidate: Show cache immediately if we have it
    if (hasCache && !isSilent) {
      if (Object.keys(assetResultsMap).length === 0) setAssetResultsMap(window.__sanctuaryCache!.nexus!.assetResultsMap);
      setLoadingAssets(false);
    }

    if (isCacheFresh) {
      return;
    }

    if (assetsFetchPromise) {
      if (!hasCache && !isSilent) setLoadingAssets(true);
      try { await assetsFetchPromise; } catch (e) { }
      if (!isSilent) {
        if (Object.keys(window.__sanctuaryCache!.nexus!.assetResultsMap).length > 0) {
          setAssetResultsMap(window.__sanctuaryCache!.nexus!.assetResultsMap);
        }
        setLoadingAssets(false);
      }
      return;
    }

    if (!hasCache && !isSilent) setLoadingAssets(true);
    assetsFetchPromise = (async () => {
      try {
        const [
          { data: rawBlueprints, error: bpError },
          { data: rawAllAssets, error: assetError },
          { data: masonData }
        ] = await Promise.all([
          supabase.from('blueprints').select('*').eq('is_public', true).eq('is_market_listed', true).eq('compliance_tier', 0).eq('has_pending_flag', false).order('created_at', { ascending: false }).limit(1000),
          supabase.from('nexus_assets').select('*').eq('has_pending_flag', false).or('is_public.eq.true,is_public.is.null').order('created_at', { ascending: false }).limit(1000),
          supabase.from('masons').select('id, name, is_verified')
        ]);

        if (bpError) throw bpError;
        if (assetError) throw assetError;

        const blueprints = (rawBlueprints || []).filter(
          (b: any) => b?.is_public !== false && b?.has_pending_flag !== true && isStrictTier0Value(b?.compliance_tier)
        );
        const allAssets = (rawAllAssets || []).filter(
          (a: any) => a?.has_pending_flag !== true && a?.is_public !== false
        );

        let premiumMap: Record<string, any> = {};
        let verifiedCompliantBlueprints = blueprints || [];
        if (blueprints && blueprints.length > 0) {
          const [pMap, auditMap] = await Promise.all([
            enrichBlueprintsWithPremiumStatus(supabase, blueprints),
            auditBlueprintsTier0Compliance(supabase, blueprints, { autoFlagInDb: true })
          ]);
          premiumMap = pMap;
          verifiedCompliantBlueprints = blueprints.filter((b: any) => {
            const audit = auditMap.get(b.id);
            return !audit || audit.isCompliant;
          });
        }

        if (masonData) {
          setMasonMap(masonData.reduce((acc: any, m: any) => { if (m.is_verified && m.name) acc[m.name.toLowerCase()] = m.id; return acc; }, {}));
        }

        const processedBlueprints = verifiedCompliantBlueprints.map(b => {
          const premiumInfo = premiumMap[b.id];
          const isPaid = premiumInfo?.is_paid || b.is_paid;
          const isEarlyAccess = premiumInfo?.is_early_access || b.is_early_access;
          const artifactsList = b.artifacts || [];
          return {
            id: b.id,
            name: b.name,
            author: masonData?.find((m: any) => m.id === b.mason_id)?.name || "Citizen",
            description: artifactsList.length > 0 ? `${artifactsList.length} ${t("term_mods", "Mods")}` : (t("tab_blueprints", "{Blueprints}")),
            created_at: b.created_at,
            asset_type: 'blueprint',
            is_paid: isPaid,
            is_early_access: isEarlyAccess,
            downloads: b.downloads,
            game_version: b.game_version,
            originalBlueprint: b
          };
        }) || [];

        const lexicons = allAssets?.filter((a: any) => a.asset_type === 'lexicon') || [];
        const chameleons = allAssets?.filter((a: any) => a.asset_type === 'chameleon') || [];
        const templates = allAssets?.filter((a: any) => a.asset_type === 'workbench_template') || [];

        const newMap: Record<string, any[]> = {
          'BLUEPRINTS': processedBlueprints || [],
          'LEXICONS': lexicons,
          'CHAMELEONS': chameleons,
          'TEMPLATES': templates,
          'MASON_DATA': masonData || []
        };

        window.__sanctuaryCache!.nexus!.assetResultsMap = newMap;
        window.__sanctuaryCache!.nexus!.lastAssetFetch = performance.now();

        setStats((prev: any) => {
          const updated = {
            ...prev,
            blueprints: processedBlueprints.length,
            lexicons: lexicons.length,
            chameleons: chameleons.length,
            templates: templates.length,
          };
          if (window.__sanctuaryCache?.nexus) {
            window.__sanctuaryCache.nexus.homeStats = updated;
          }
          return updated;
        });

        if (!isSilent || marketTab !== 'HOME' && marketTab !== 'MODS') {
          if (Object.keys(assetResultsMap).length === 0 || forceRefresh) {
            setAssetResultsMap(newMap);
          }
        }

        const dbLangs = allAssets?.map((d: any) => d.language).filter(Boolean) || [];
        const commonLangs = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Russian", "Japanese", "Korean", "Chinese"];
        const langs = Array.from(new Set([...commonLangs, ...dbLangs])) as string[];
        setAvailableLanguages(langs);

      } catch (err: any) {
        console.error("NEXUS LOG ERROR: Asset fetch error:", err);
        // Only clear if we don't have cache to fall back on
        if (Object.keys(window.__sanctuaryCache!.nexus!.assetResultsMap).length === 0) {
          setAssetResultsMap({});
        }
        throw err;
      }
    })();

    try {
      await assetsFetchPromise;
    } catch (err) {
      // handled inside promise
    } finally {
      assetsFetchPromise = null;
      if (!isSilent) setLoadingAssets(false);
    }
  }

  const handleEditAsset = (e: React.MouseEvent, asset: any) => {
    e.stopPropagation();
    if (marketTab === 'BLUEPRINTS') {
      setMatrixBlueprintAsset(asset);
      return;
    }
    if (!canPublishNexusAssets) {
      useStore.getState().pushStatus(
        t(
          "nexus_upload_verified_mason_only",
          "Publishing Templates, {Lexicons}, and {Chameleons} to {Nexus} requires a Verified {Mason} studio. Local JSON export remains unrestricted."
        ),
        "warning"
      );
      return;
    }
    const parsedContent = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
    const v = asset.version || '1.0.0';
    setUploadState({
      isOpen: true,
      isEdit: true,
      editId: asset.id,
      fileContent: parsedContent,
      fileName: asset.name,
      name: asset.name,
      version: v,
      description: asset.description || '',
      releaseNotes: asset.release_notes || '',
      language: asset.language || (availableLanguages.length > 0 ? availableLanguages[0] : 'English'),
      newLanguage: '',
      lexiconType: asset.lexicon_type || 'Theme',
      themeMode: asset.theme_mode || 'Dark'
    });
  };

  const submitUpload = async () => {
    try {
      if (!session?.user?.id) {
        useStore.getState().pushStatus(t("auto_guest_mode_active_45", "Guest Mode Active") || "Login required to upload.");
        return;
      }
      if (!canPublishNexusAssets) {
        useStore.getState().pushStatus(
          t(
            "nexus_upload_verified_mason_only",
            "Publishing Templates, {Lexicons}, and {Chameleons} to {Nexus} requires a Verified {Mason} studio. Local JSON export remains unrestricted."
          ),
          "warning"
        );
        return;
      }
      const finalLanguage = uploadState.language === 'add_new' ? uploadState.newLanguage : uploadState.language;
      let existingJsonData: Record<string, any> = {};
      if (uploadState.isEdit && uploadState.editId) {
        const currentList = assetResultsMap[marketTab] || [];
        const existingAsset = currentList.find((a: any) => String(a.id) === String(uploadState.editId));
        if (existingAsset?.json_data) {
          existingJsonData =
            typeof existingAsset.json_data === 'string'
              ? JSON.parse(existingAsset.json_data)
              : existingAsset.json_data;
        }
      }
      const finalContent = {
        ...existingJsonData,
        ...(uploadState.fileContent || {}),
        version: uploadState.version,
        _meta_version: uploadState.version,
      };

      let syncedContent = finalContent;
      if (marketTab === 'CHAMELEONS') {
        const { themeData } = await uploadThemeAssetsToCloud(finalContent, supabase, { t });
        syncedContent = themeData;
      }

      const payload: any = {
        asset_type: marketTab === 'CHAMELEONS' ? 'chameleon' : marketTab === 'TEMPLATES' ? 'workbench_template' : 'lexicon',
        name: uploadState.name,
        version: uploadState.version,
        author: session?.user?.user_metadata?.username || 'Citizen',
        author_id: session?.user?.id,
        description: uploadState.description,
        release_notes: uploadState.releaseNotes,
        json_data: syncedContent,
        language: marketTab === 'LEXICONS' ? finalLanguage : null,
        lexicon_type: marketTab === 'LEXICONS' ? uploadState.lexiconType : null,
        theme_mode: marketTab === 'CHAMELEONS' ? uploadState.themeMode : null
      };

      if (uploadState.isEdit && uploadState.editId) {
        const { error } = await supabase.from('nexus_assets').update(payload).eq('id', uploadState.editId);
        if (error) throw error;
        onSetStatus('Update Successful!');
      } else {
        const { error } = await supabase.from('nexus_assets').insert([payload]);
        if (error) throw error;
        onSetStatus('Upload Successful!');
      }

      setUploadState(s => ({ ...s, isOpen: false }));
      fetchNexusAssets();
    } catch (err: any) {
      useStore.getState().pushStatus(`Upload failed: ${err.message || err}`);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) {
      useStore.getState().pushStatus(t("auto_guest_mode_active_45", "Guest Mode Active") || "Login required to submit reports.");
      return;
    }
    if (!reportState.assetId || !reportState.reason.trim()) return;
    try {
      const normalizedAssetId = String(reportState.assetId || "").replace(/^collection_/, "");
      const isCollectionAsset =
        reportState.assetType === "collection" ||
        String(reportState.assetId || "").startsWith("collection_");

      if (isCollectionAsset) {
        const { error } = await supabase.from("content_flags").insert([
          {
            content_type: "collection",
            content_id: normalizedAssetId,
            reporter_id: null,
            reason: reportState.reason.trim(),
            status: "pending",
          },
        ]);
        if (error) throw error;
        window.dispatchEvent(
          new CustomEvent("sanctuary-content-flagged", {
            detail: { targetType: "collection", targetId: normalizedAssetId },
          })
        );
        onSetStatus(t("report_submitted_success", "Report submitted successfully."));
      } else if (reportState.assetType === 'mod') {
        const tierToFlag = Math.min(4, Math.max(1, Number(reportState.complianceTier || 1)));
        const { error } = await supabase.rpc('flag_mod_for_compliance', {
          p_mod_id: normalizedAssetId,
          p_tier: tierToFlag,
          p_reason: reportState.reason.trim(),
        });
        if (error) throw error;
        window.dispatchEvent(new CustomEvent("sanctuary-compliance-updated"));
        window.dispatchEvent(new CustomEvent("sanctuary-content-flagged", { detail: { targetType: 'mod', targetId: normalizedAssetId } }));
        onSetStatus(t("mod_flagged_compliance_pending", "{Mod} flagged for Oversight Compliance review."));
      } else if (reportState.assetType === 'blueprint') {
        const { error } = await supabase.from('blueprint_reports').insert([{
          blueprint_id: normalizedAssetId,
          reporter_name: 'Anonymous',
          reporter_id: null,
          reason: reportState.reason.trim(),
          status: 'pending'
        }]);
        if (error) throw error;
        window.dispatchEvent(new CustomEvent("sanctuary-content-flagged", { detail: { targetType: 'blueprint', targetId: normalizedAssetId } }));
        onSetStatus(t("report_submitted_success", "Report submitted successfully."));
      } else {
        const { error } = await supabase.from('nexus_reports').insert([{
          asset_id: normalizedAssetId,
          reporter_name: 'Anonymous',
          reporter_id: null,
          reason: reportState.reason.trim(),
          status: 'pending'
        }]);
        if (error) throw error;
        window.dispatchEvent(new CustomEvent("sanctuary-content-flagged", { detail: { targetType: String(reportState.assetType || 'asset'), targetId: normalizedAssetId } }));
        onSetStatus(t("report_submitted_success", "Report submitted successfully."));
      }
    } catch (err: any) {
      console.error(err);
      onSetStatus(`${t("report_failed_prefix", "Report failed:")} ${err.message}`);
    }
    setReportState({ isOpen: false, assetId: null, assetType: null, reason: '', complianceTier: 1 });
  };

  const getLocalVersion = (asset: any) => {
    if (marketTab === 'CHAMELEONS') {
      const theme = Object.values({ ...CORE_THEMES, ...customThemes }).find((th: any) => th.name === asset.name) as any;
      return theme?.version || '1.0.0';
    } else if (marketTab === 'TEMPLATES') {
      return installedTemplates[asset.name];
    } else {
      const lex = registry?.[asset.name];
      return lex?._meta_version || '1.0.0';
    }
  };

  const isInstalled = (asset: any) => {
    if (marketTab === 'CHAMELEONS') {
      return Object.values({ ...CORE_THEMES, ...customThemes }).some((th: any) => th.name === asset.name);
    } else if (marketTab === 'TEMPLATES') {
      return !!installedTemplates[asset.name];
    } else {
      return !!registry?.[asset.name];
    }
  };

  const getAssetDisplayVersion = (asset: any) => {
    let version = asset.version || '1.0.0';
    if (asset.asset_type === 'workbench_template' && asset.json_data) {
      try {
        const parsedRaw = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
        const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
        if (parsed && parsed.template_version) {
          version = parsed.template_version;
        }
      } catch (e) { }
    }
    return version;
  };

  const isOutdated = (asset: any) => {
    if (!isInstalled(asset)) return false;
    const localVersion = getLocalVersion(asset);
    return compareVersions(getAssetDisplayVersion(asset), localVersion) > 0;
  };

  const importTemplate = async (templateJson: any) => {
    if (!isDesktop()) {
      if (onSetStatus) onSetStatus(t("error_web_feature_disabled", "Desktop App Required") || "Not available on Web");
      return;
    }
    try {
      const config: any = await invoke('get_saved_coordinates');
      const vaultPath = config.vault_path;
      if (!vaultPath) throw new Error("Vault path not configured.");

      let parsed = typeof templateJson === 'string' ? JSON.parse(templateJson) : templateJson;
      const displayData = Array.isArray(parsed) ? parsed[0] : parsed;
      const templateId = displayData?.template_id || "vlocal";

      await writeLocalTemplateFile(vaultPath, `${templateId}_template.json`, parsed);
    } catch (err) {
      console.error("Failed to install template", err);
      throw err;
    }
  };

  async function fetchGameVersions() {
    if (isOffline) return;
    try {
      const { data } = await supabase
        .from('game_versions')
        .select('version')
        .order('version', { ascending: false });

      if (data && data.length > 0) {
        setGameVersions(data.map(v => v.version));
        setSelectedGameVersion(prev => {
          if (prev !== 'all') return prev;
          const currentStoreVersion = useStore.getState().selectedVersion;
          return currentStoreVersion || data[0].version;
        });
      }
    } catch (err) {
      console.error("Failed to fetch game versions:", err);
    }
  }

  async function fetchDlcRegistry() {
    if (isOffline) return;
    try {
      const { data } = await supabase
        .from('dlc_registry')
        .select('*')
        .order('name', { ascending: true });

      if (data) {
        setDlcRegistry(data);
      }
    } catch (err) {
      console.error("Failed to fetch DLC registry:", err);
    }
  }

  async function fetchNexus(forceRefresh = false, isSilent = false) {
    if (isOffline) {
      if (!isSilent) setLoadingMods(false);
      return;
    }

    const isCacheFresh = !forceRefresh && window.__sanctuaryCache!.nexus!.nexusItems && (performance.now() - window.__sanctuaryCache!.nexus!.lastNexusFetch < CACHE_TTL);

    // Stale-While-Revalidate: Show cache immediately if we have it
    if (window.__sanctuaryCache!.nexus!.nexusItems && !isSilent) {
      setResults(window.__sanctuaryCache!.nexus!.nexusItems);
      setCurrentPage(1);
      setLoadingMods(false);
    }

    if (isCacheFresh) {
      return;
    }

    if (nexusFetchPromise) {
      if (!isSilent && !window.__sanctuaryCache!.nexus!.nexusItems) setLoadingMods(true);
      try { await nexusFetchPromise; } catch (e) { }
      if (!isSilent) {
        if (window.__sanctuaryCache!.nexus!.nexusItems) setResults(window.__sanctuaryCache!.nexus!.nexusItems);
        setCurrentPage(1);
        setLoadingMods(false);
      }
      return;
    }

    if (!isSilent && !window.__sanctuaryCache!.nexus!.nexusItems) setLoadingMods(true);
    nexusFetchPromise = (async () => {
      try {
        const BATCH_SIZE = 1000;
        const modSelectCols =
          "*, mod_versions(dna_hash, version_label), masons(id, name)";

        const [
          firstModsRes,
          verifiedAuthorsRes,
          flavorGroupsRes,
          collectionsRes,
          relationshipsRes,
          flavorMembersRes,
          setMembersRes
        ] = await Promise.all([
          supabase
            .from("mods")
            .select(modSelectCols, { count: "exact" })
            .eq('compliance_tier', 0)
            .eq('has_pending_flag', false)
            .in('status', [...NEXUS_ELIGIBLE_MOD_STATUSES])
            .order('id', { ascending: true })
            .range(0, BATCH_SIZE - 1),
          fetchAllPaginated(() => supabase.from('masons').select('id, name, is_verified').order('id', { ascending: true })),
          fetchAllPaginated(() => supabase.from("flavor_groups").select("*").order('id', { ascending: true })),
          fetchAllPaginated(() => supabase.from("collections").select("*, masons(id, name)").order('id', { ascending: true })),
          fetchAllPaginated(() => supabase.from("mod_relationships").select("id, parent_id, child_id, relationship_type").in("relationship_type", ["twin", "addon", "flavor", "set_item", "beta"]).order('id', { ascending: true })),
          fetchAllPaginated(() =>
            supabase
              .from("flavor_group_members")
              .select("group_id, mod_hash")
              .order("group_id", { ascending: true })
              .order("mod_hash", { ascending: true })
          ),
          fetchAllPaginated(() => supabase.from("collection_members").select("id, set_id, mod_id").order('id', { ascending: true }))
        ]);

        if (firstModsRes.error) throw firstModsRes.error;

        let allMods: any[] = firstModsRes.data || [];
        const totalCount = firstModsRes.count || allMods.length;
        const pages = Math.ceil(totalCount / BATCH_SIZE);

        if (pages > 1) {
          const remainingPagePromises = [];
          for (let i = 1; i < pages; i++) {
            remainingPagePromises.push(
              supabase
                .from("mods")
                .select(modSelectCols)
                .eq('compliance_tier', 0)
                .eq('has_pending_flag', false)
                .in('status', [...NEXUS_ELIGIBLE_MOD_STATUSES])
                .order('id', { ascending: true })
                .range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
            );
          }
          const remainingResponses = await Promise.all(remainingPagePromises);
          for (const res of remainingResponses) {
            if (res.error) throw res.error;
            if (res.data) allMods = allMods.concat(res.data);
          }
        }

        const verifiedMap: Record<string, boolean> = {};
        verifiedAuthorsRes.data?.forEach((p: any) => {
          if (p.name) verifiedMap[p.name] = p.is_verified;
        });

        const allItems = buildGroupedNexusTier0Artifacts({
          modsData: allMods,
          relationships: relationshipsRes.data || [],
          collections: collectionsRes.data || [],
          collectionMembers: setMembersRes.data || [],
          flavorGroups: flavorGroupsRes.data || [],
          flavorGroupMembers: flavorMembersRes.data || [],
          verifiedMap,
        });

        window.__sanctuaryCache!.nexus!.nexusItems = allItems;
        (window.__sanctuaryCache!.nexus as any).schemaRev = NEXUS_CACHE_SCHEMA_REV;
        window.__sanctuaryCache!.nexus!.lastNexusFetch = performance.now();
        setStats((prev: any) => ({ ...prev, artifacts: allItems.length }));
        if (window.__sanctuaryCache?.nexus?.homeStats) {
          window.__sanctuaryCache.nexus.homeStats = {
            ...window.__sanctuaryCache.nexus.homeStats,
            artifacts: allItems.length,
          };
        }

        if (!isSilent || useStore.getState().marketTab === 'MODS') {
          setResults(allItems);
          setCurrentPage(1);
        }
      } catch (err: any) {
        console.error(err);
        if (!isSilent) useStore.getState().pushStatus(t("error_nexus_load", "Failed to load Nexus items."));
        throw err;
      }
    })();

    try {
      await nexusFetchPromise;
    } catch (err) {
      // handled inside promise
    } finally {
      nexusFetchPromise = null;
      if (!isSilent) setLoadingMods(false);
    }
  }

  const categories = useMemo(() => [t("filter_all", "All"), ...Array.from(new Set(results.map((m: any) => m.category_override || "Uncategorized").filter(Boolean)))], [results, t]);

  const ownedHashesSet = useMemo(() => new Set(ownedHashes), [ownedHashes]);
  const filteredResults = useMemo(() => {
    let filtered = results.filter((mod: any) => {
      const isOwned = (() => {
        if (mod.isVirtual || mod.isParent) {
          return mod.flavors?.some((f: any) =>
            ownedHashesSet.has(f.hash) ||
            f.mod_versions?.some((v: any) => ownedHashesSet.has(v.dna_hash))
          );
        }
        return ownedHashesSet.has(mod.hash) ||
          mod.mod_versions?.some((v: any) => ownedHashesSet.has(v.dna_hash));
      })();

      if (hideInstalled && isOwned) return false;

      if (hidePaid && mod.is_paid) return false;
      if (hideEarlyAccess && mod.is_early_access) return false;

      if (hideMissingDLC) {
        let rawDLC: string[] = [];
        if (mod.requiredDLC) {
          if (typeof mod.requiredDLC === 'string') {
            rawDLC = mod.requiredDLC.split(',').map((s: string) => s.trim());
          } else if (Array.isArray(mod.requiredDLC)) {
            rawDLC = [...mod.requiredDLC];
          }
        }
        if (mod.flavors) {
          mod.flavors.forEach((f: any) => {
            if (f.requiredDLC) {
              let fDLC = f.requiredDLC;
              if (typeof fDLC === 'string') fDLC = fDLC.split(',').map((s: string) => s.trim());
              if (Array.isArray(fDLC)) {
                fDLC.forEach((d: string) => { if (!rawDLC.includes(d)) rawDLC.push(d); });
              }
            }
          });
        }
        let missingPacks = rawDLC.filter((p: string) => {
          const baseCode = p.split(' ')[0].toUpperCase();
          return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
        });
        if (missingPacks.length > 0) return false;
      }

      const masonName = Array.isArray(mod.masons) ? mod.masons[0]?.name : mod.masons?.name;
      const searchText = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        (mod.name || "").toLowerCase().includes(searchText) ||
        (mod.master_author || "").toLowerCase().includes(searchText) ||
        (masonName || "").toLowerCase().includes(searchText) ||
        (mod.description || "").toLowerCase().includes(searchText);

      const matchesCategory = categoryFilter === (t("filter_all", "All")) ||
        categoryFilter === "ALL" ||
        mod.category_override === categoryFilter;
      let matchesGameVersion = false;
      if (selectedGameVersion === "all") {
        matchesGameVersion = true;
      } else {
        const modsToCheck = (mod.isVirtual || mod.isParent) && mod.flavors ? mod.flavors : [mod];
        matchesGameVersion = modsToCheck.some((m: any) => {
          const versions = Array.isArray(m.compatible_versions) ? m.compatible_versions : [];
          if (versions.length === 0) return true;
          return isVersionMatch(versions, selectedGameVersion);
        });
      }

      let matchesDlc = false;
      if (dlcFilter === "all") {
        matchesDlc = true;
      } else {
        const modsToCheck = (mod.isVirtual || mod.isParent) && mod.flavors ? mod.flavors : [mod];
        if (dlcFilter === "base_game_only") {
          matchesDlc = modsToCheck.every((m: any) => {
            const dlcs = Array.isArray(m.requiredDLC) ? m.requiredDLC : [];
            return dlcs.length === 0;
          });
        } else {
          matchesDlc = modsToCheck.some((m: any) => {
            const dlcs = Array.isArray(m.requiredDLC) ? m.requiredDLC : [];
            return dlcs.includes(dlcFilter);
          });
        }
      }

      return matchesSearch && matchesCategory && matchesGameVersion && matchesDlc;
    });

    return filtered.sort((a: any, b: any) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case "oldest":
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        case "author":
          return (a.master_author || "").localeCompare(b.master_author || "");
        default:
          return 0;
      }
    });
  }, [results, ownedHashesSet, hideInstalled, hidePaid, hideEarlyAccess, hideMissingDLC, ownedDLC, maskedDLC, searchQuery, categoryFilter, selectedGameVersion, dlcFilter, sortBy, t]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / itemsPerPage));
  const paginatedResults = useMemo(() => filteredResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredResults, currentPage, itemsPerPage]);

  const filteredAssetResults = useMemo(() => {
    let currentResults = assetResultsMap[marketTab] || [];
    let filtered = currentResults.filter((asset: any) => {
      const search = assetSearchQuery.toLowerCase();
      const matchesSearch = !assetSearchQuery ||
        (asset.name || "").toLowerCase().includes(search) ||
        (asset.author || "").toLowerCase().includes(search) ||
        (asset.description || "").toLowerCase().includes(search);

      let matchesLang = true;
      let matchesType = true;
      let matchesMode = true;
      let matchesPaid = true;
      let matchesEA = true;
      let matchesDLC = true;
      let matchesInstalled = true;
      let matchesGameVersion = true;

      if (hideInstalled) {
        if (marketTab === 'BLUEPRINTS') {
          if (playSets.some((p: any) => p.code && asset.json_data?.code && p.code === asset.json_data.code)) {
            matchesInstalled = false;
          }
        } else {
          if (isInstalled(asset)) {
            matchesInstalled = false;
          }
        }
      }

      if (marketTab === 'BLUEPRINTS') {
        if (hidePaid && asset.is_paid) matchesPaid = false;
        if (hideEarlyAccess && asset.is_early_access) matchesEA = false;
        if (selectedGameVersion && selectedGameVersion !== 'ALL' && selectedGameVersion !== 'all') {
          if (asset.game_version !== selectedGameVersion) matchesGameVersion = false;
        }

        if (hideMissingDLC && asset.json_data && asset.json_data.artifacts) {
          const activeDLC = ownedDLC.filter((d: string) => !maskedDLC.includes(d));
          for (const mod of asset.json_data.artifacts) {
            if (mod.requiredDLC) {
              let rawDLC: string[] = [];
              if (typeof mod.requiredDLC === 'string') rawDLC = mod.requiredDLC.split(',').map((s: string) => s.trim());
              else if (Array.isArray(mod.requiredDLC)) rawDLC = [...mod.requiredDLC];

              const isMissing = rawDLC.some((req: string) => {
                const cleanReq = req.replace(/['"]/g, '').trim().toUpperCase();
                return !activeDLC.some((owned: string) => owned.toUpperCase() === cleanReq);
              });
              if (isMissing) {
                matchesDLC = false;
                break;
              }
            }
          }
        }
      } else if (marketTab === 'LEXICONS' || marketTab === 'TEMPLATES') {
        if (languageFilter !== 'all') matchesLang = asset.language === languageFilter;
        if (marketTab === 'LEXICONS' && lexiconTypeFilter !== 'all') matchesType = asset.lexicon_type === lexiconTypeFilter;
      } else if (marketTab === 'CHAMELEONS') {
        if (themeModeFilter !== 'all') matchesMode = asset.theme_mode === themeModeFilter;
      }

      return matchesSearch && matchesLang && matchesType && matchesMode && matchesPaid && matchesEA && matchesDLC && matchesInstalled && matchesGameVersion;
    });

    return filtered.sort((a: any, b: any) => {
      const aOutdated = isOutdated(a) ? 1 : 0;
      const bOutdated = isOutdated(b) ? 1 : 0;
      if (bOutdated !== aOutdated) return bOutdated - aOutdated;

      switch (assetSortBy) {
        case "newest":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case "oldest":
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        case "author":
          return (a.author || "").localeCompare(b.author || "");
        default:
          return 0;
      }
    });
  }, [assetResultsMap, assetSearchQuery, marketTab, hidePaid, hideEarlyAccess, hideMissingDLC, hideInstalled, playSets, ownedDLC, maskedDLC, languageFilter, lexiconTypeFilter, themeModeFilter, assetSortBy, isOutdated, selectedGameVersion]);

  const assetTotalPages = Math.max(1, Math.ceil(filteredAssetResults.length / itemsPerPage));
  const assetPaginatedResults = useMemo(() => filteredAssetResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredAssetResults, currentPage, itemsPerPage]);

  if (isOffline) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-300 gap-6">
        <span className="material-symbols-outlined !text-[6rem] opacity-20 text-[var(--text)] drop-shadow-lg">{t("icon_wifi_off", "wifi_off")}</span>
        <h2 className="text-2xl font-black capitalize tracking-[0.2em] opacity-50">{t("offline_mode_title", "Offline Mode")}</h2>
        <p className="text-xs font-bold capitalize tracking-widest opacity-40 text-center max-w-md">{t("offline_mode_desc", "This module requires a secure network connection. Please restore your connection or disable Local Network Only mode in preferences.")}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-8 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-xl hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]  active:scale-95 transition-all flex items-center gap-3 text-[10px] font-black capitalize tracking-widest group"
        >
          <span className="material-symbols-outlined !text-lg opacity-60 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-500">{t("icon_refresh", "refresh")}</span>
          {t("loading", "Loading")}
        </button>
      </div>
    );
  }

  const viewFilterOptions = useMemo(() => [
    { id: "hide_installed", label: <span className="flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">{t("icon_download_done", "download_done")}</span> {t("filter_hide_installed", "Hide Installed")}</span> },
    { id: "hide_paid", label: <span className="flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">{t("icon_monetization_on", "monetization_on")}</span> {t("filter_hide_paid", "Hide Paid")}</span> },
    { id: "hide_ea", label: <span className="flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">{t("icon_science", "science")}</span> {t("filter_hide_early_access", "Hide Early Access")}</span> },
    { id: "hide_missing_dlc", label: <span className="flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">{t("icon_extension", "extension")}</span> {t("filter_hide_dlc", "Hide Missing DLC")}</span> }
  ], [t]);

  const activeViewFilters = useMemo(() => {
    const arr: string[] = [];
    if (hideInstalled) arr.push("hide_installed");
    if (hidePaid) arr.push("hide_paid");
    if (hideEarlyAccess) arr.push("hide_ea");
    if (hideMissingDLC) arr.push("hide_missing_dlc");
    return arr;
  }, [hideInstalled, hidePaid, hideEarlyAccess, hideMissingDLC]);

  const handleViewFiltersChange = (newVals: string[]) => {
    const nInstalled = newVals.includes("hide_installed");
    const nPaid = newVals.includes("hide_paid");
    const nEa = newVals.includes("hide_ea");
    const nDlc = newVals.includes("hide_missing_dlc");

    if (hideInstalled !== nInstalled) { setHideInstalled(nInstalled); localStorage.setItem('sanctuary_hide_installed_assets', String(nInstalled)); }
    if (hidePaid !== nPaid) { setHidePaid(nPaid); localStorage.setItem('sanctuary_hide_paid', String(nPaid)); }
    if (hideEarlyAccess !== nEa) { setHideEarlyAccess(nEa); localStorage.setItem('sanctuary_hide_ea', String(nEa)); }
    if (hideMissingDLC !== nDlc) { setHideMissingDLC(nDlc); localStorage.setItem('sanctuary_hide_missing_dlc', String(nDlc)); }
    setCurrentPage(1);
  };

  const FilterSection = ({ title, options, value, onChange, multiSelect }: any) => {
    if (!options || options.length === 0) return null;
    return (
      <div className="flex flex-col mb-4 w-full last:mb-0">
        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-90 mb-2.5 px-1.5 flex items-center gap-2">
          <span className="text-[var(--text)] opacity-90">{title}</span>
          <div className="h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_30%,transparent)] via-[color-mix(in_srgb,var(--text)_12%,transparent)] to-transparent flex-1"></div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {options.map((opt: any) => {
            const active = multiSelect ? (value || []).includes(opt.id) : value === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  if (multiSelect) {
                    if ((value || []).includes(opt.id)) onChange((value || []).filter((v: string) => v !== opt.id));
                    else onChange([...(value || []), opt.id]);
                  } else {
                    onChange(opt.id);
                  }
                }}
                className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                  active ? "is-selected font-bold" : "font-semibold"
                }`}
              >
                <span className="truncate flex items-center gap-2 min-w-0">
                  {opt.label}
                </span>
                {active && (
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                    {t("icon_check", "check")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const {
    handleNexusModContextMenu,
    handleNexusAssetContextMenu,
  } = useNexusContextMenus({
    cleanModName,
    onOpenDossier,
    onSetStatus,
    onOpenMasonProfile,
    t,
    importLexicon,
    previewLexiconId,
    startLexiconPreview,
    stopLexiconPreview,
    importTheme,
    previewThemeId,
    startThemePreview,
    stopThemePreview,
    setSelectedBlueprint,
    setPreviewAsset,
    toggleModInStagingDraft,
    stageBlueprintToDraft,
    stagedModKeys,
    setInstalledTemplates,
    masonMap,
    setReportState,
    expandedFolder,
    setExpandedFolder,
    isInstalled,
    getAssetDisplayVersion,
    isOutdated,
    importTemplate,
  });

  return (
    <>
      <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <ViewHeader
          title={t("market_title", "The {Nexus}")}
          subtitle={`${t("subtitle_suffix", "Community index, {mod} discovery, and metadata links")}`}
          icon={t("icon_hub", "hub")}
          iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
          breadcrumb={marketTab !== 'HOME' ? (marketTab === 'HOME' ? t('tab_overview', 'Overview') : marketTab === 'STAGING' ? t('tab_staging', 'Staging') : t(`tab_${marketTab.toLowerCase()}`, marketTab)) : undefined}
          onTitleClick={() => setMarketTab('HOME')}
        >
          {marketTab !== 'HOME' && marketTab !== 'STAGING' && (
            <div className="animate-in slide-in-from-top-4 duration-500 relative z-20 w-full xl:w-auto overflow-hidden">
              <ActionPill
                searchQuery={marketTab === 'MODS' ? searchQuery : assetSearchQuery}
                setSearchQuery={(val: string) => {
                  if (marketTab === 'MODS') setSearchQuery(val);
                  else setAssetSearchQuery(val);
                  setCurrentPage(1);
                }}
                searchPlaceholder={
                  marketTab === 'MODS' ? (t("search_placeholder", "Search {Mods} or {Masons}...") as string) :
                    marketTab === 'LEXICONS' ? (t("search_lexicons", "Search {Lexicons} or {Masons}...") as string) :
                      marketTab === 'TEMPLATES' ? (t("search_tmpl", "Search Templates...") as string) :
                        marketTab === 'BLUEPRINTS' ? (t("search_blueprints", "Search {Blueprints}...") as string) :
                          (t("search_chameleons", "Search {Chameleons} or {Masons}...") as string)
                }
                primaryPopover={{
                  icon: t("icon_tune", "tune"),
                  label: t("filters", "Filters") || "Filters",
                  content: (
                    <div className="flex flex-col w-[500px] p-4 max-w-[calc(100vw-40px)]">
                      <FilterSection
                        title={t("sort_by", "Sort By") || "Sort By"}
                        value={marketTab === 'MODS' ? sortBy : assetSortBy}
                        onChange={(val: string) => {
                          if (marketTab === 'MODS') setSortBy(val);
                          else setAssetSortBy(val);
                          setCurrentPage(1);
                        }}
                        options={[
                          { id: "newest", label: t("sort_newest", "Newest") },
                          { id: "oldest", label: t("sort_oldest", "Oldest First") },
                          { id: "name", label: t("sort_name", "Name (A-z)") },
                          { id: "author", label: t("sort_author", "{Mason} (A-z)") }
                        ]}
                      />

                      {marketTab === 'MODS' && (
                        <FilterSection
                          title={t("filter_category", "Filter Category") || "Category"}
                          value={categoryFilter}
                          onChange={(val: string) => {
                            setCategoryFilter(val);
                            setCurrentPage(1);
                          }}
                          options={[
                            { id: "ALL", label: t("all_categories", "All Categories") },
                            ...categories.filter(c => c !== "ALL").map(cat => ({ id: cat, label: cat }))
                          ]}
                        />
                      )}

                      {(marketTab === 'LEXICONS' || marketTab === 'TEMPLATES') && (
                        <FilterSection
                          title={marketTab === 'LEXICONS' ? t("language", "Language") : (t("ql_templates", "Templates"))}
                          value={languageFilter}
                          onChange={(val: string) => { setLanguageFilter(val); setCurrentPage(1); }}
                          options={[
                            { id: "all", label: t("all_languages", "All Languages") },
                            ...availableLanguages.map(l => ({ id: l, label: l }))
                          ]}
                        />
                      )}

                      {marketTab === 'LEXICONS' && (
                        <FilterSection
                          title={t("filter_type", "Type")}
                          value={lexiconTypeFilter}
                          onChange={(val: string) => { setLexiconTypeFilter(val); setCurrentPage(1); }}
                          options={[
                            { id: "all", label: t("all_types", "All Types") },
                            { id: "Default", label: t("lexicon_type_standard", "Standard") },
                            { id: "Theme", label: t("lexicon_type_thematic", "Thematic") }
                          ]}
                        />
                      )}

                      {marketTab === 'CHAMELEONS' && (
                        <FilterSection
                          title={t("filter_mode", "Theme Mode")}
                          value={themeModeFilter}
                          onChange={(val: string) => { setThemeModeFilter(val); setCurrentPage(1); }}
                          options={[
                            { id: "all", label: t("all_modes", "All Modes") },
                            { id: "Dark", label: t("mode_dark", "Dark") },
                            { id: "Light", label: t("mode_light", "Light") }
                          ]}
                        />
                      )}

                      <FilterSection
                        title={t("filter_view_options", "View Options") || "View Options"}
                        multiSelect={true}
                        value={activeViewFilters}
                        onChange={handleViewFiltersChange}
                        options={viewFilterOptions}
                      />

                      {(marketTab === 'MODS' || (marketTab === 'BLUEPRINTS' && gameVersions.length > 0)) && (
                        <div className="flex flex-col mb-5 w-full last:mb-0">
                          <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                            {t("label_game_version", "Game Version") || "Game Version"}
                            <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
                          </div>
                          <div className="h-10 w-full relative z-[60]">
                            <CustomDropdown disableTint={true}
                              flat={true}
                              variant="pill"
                              value={selectedGameVersion}
                              onChange={(val: string[]) => {
                                setSelectedGameVersion(val[0]);
                                setCurrentPage(1);
                              }}
                              options={[
                                { id: "all", label: t("filter_all_versions", "All Versions") || "ALL VERSIONS" },
                                ...(selectedGameVersion !== "all" && !gameVersions.includes(selectedGameVersion) ? [{ id: selectedGameVersion, label: selectedGameVersion }] : []),
                                ...gameVersions.map(v => ({ id: v, label: v }))
                              ]}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }}
              />
            </div>
          )}
        </ViewHeader>

        <div className="flex flex-col w-full gap-3 mb-8 md:mb-10 relative z-10 animate-in slide-in-from-top-4 duration-500 shrink-0">
          <StatTileCarousel>
            {['HOME', 'MODS', 'BLUEPRINTS', 'LEXICONS', 'CHAMELEONS', 'TEMPLATES'].map((tab) => (
              <DashboardStatTile
                key={tab}
                variant="tab"
                icon={tab === 'HOME' ? 'dashboard' : tab === 'MODS' ? "extension" : tab === 'BLUEPRINTS' ? "map" : tab === 'LEXICONS' ? "translate" : tab === 'TEMPLATES' ? "draw" : "palette"}
                label={tab === 'HOME' ? t('tab_overview', 'Overview') : t(`tab_${tab.toLowerCase()}`, tab)}
                number={tab === 'HOME' ? (stats.artifacts + stats.blueprints + stats.lexicons + stats.chameleons + stats.templates) : tab === 'MODS' ? stats.artifacts : tab === 'BLUEPRINTS' ? stats.blueprints : tab === 'LEXICONS' ? stats.lexicons : tab === 'CHAMELEONS' ? stats.chameleons : tab === 'TEMPLATES' ? stats.templates : ""}
                onClick={() => setMarketTab(tab as any)}
                isActive={marketTab === tab}
              />
            ))}
          </StatTileCarousel>
        </div>

        <NexusHomeAndModsTabs
          cleanModName={cleanModName}
          onOpenDossier={onOpenDossier}
          onSetStatus={onSetStatus}
          t={t}
          activeGameSchema={activeGameSchema}
          marketTab={marketTab}
          setMarketTab={setMarketTab}
          selectedVersion={selectedVersion}
          showImages={showImages}
          setSelectedBlueprint={setSelectedBlueprint}
          setPreviewAsset={setPreviewAsset}
          toggleModInStagingDraft={toggleModInStagingDraft}
          stagedModKeys={stagedModKeys}
          results={results}
          loadingMods={loadingMods}
          searchQuery={searchQuery}
          setCurrentPage={setCurrentPage}
          currentPage={currentPage}
          categoryFilter={categoryFilter}
          selectedGameVersion={selectedGameVersion}
          dlcFilter={dlcFilter}
          hidePaid={hidePaid}
          hideEarlyAccess={hideEarlyAccess}
          hideMissingDLC={hideMissingDLC}
          hideInstalled={hideInstalled}
          setHideInstalled={setHideInstalled}
          expandedFolder={expandedFolder}
          setExpandedFolder={setExpandedFolder}
          drawerSearchQuery={drawerSearchQuery}
          setDrawerSearchQuery={setDrawerSearchQuery}
          stats={stats}
          recentFeed={recentFeed}
          loadingHome={loadingHome}
          totalPages={totalPages}
          paginatedResults={paginatedResults}
          handleNexusModContextMenu={handleNexusModContextMenu}
          handleNexusAssetContextMenu={handleNexusAssetContextMenu}
        />
        <NexusAssetTabs
          onOpenDossier={onOpenDossier}
          onOpenMasonProfile={onOpenMasonProfile}
          onSetStatus={onSetStatus}
          t={t}
          importLexicon={importLexicon}
          previewLexiconId={previewLexiconId}
          startLexiconPreview={startLexiconPreview}
          stopLexiconPreview={stopLexiconPreview}
          session={session}
          marketTab={marketTab}
          canPublishNexusAssets={canPublishNexusAssets}
          showImages={showImages}
          playSets={playSets}
          importTheme={importTheme}
          previewThemeId={previewThemeId}
          startThemePreview={startThemePreview}
          stopThemePreview={stopThemePreview}
          setAssetResultsMap={setAssetResultsMap}
          setSelectedBlueprint={setSelectedBlueprint}
          setPreviewAsset={setPreviewAsset}
          toggleModInStagingDraft={toggleModInStagingDraft}
          stageBlueprintToDraft={stageBlueprintToDraft}
          stagedModKeys={stagedModKeys}
          loadingAssets={loadingAssets}
          setCurrentPage={setCurrentPage}
          currentPage={currentPage}
          setInstalledTemplates={setInstalledTemplates}
          masonMap={masonMap}
          handleEditAsset={handleEditAsset}
          isInstalled={isInstalled}
          getAssetDisplayVersion={getAssetDisplayVersion}
          isOutdated={isOutdated}
          importTemplate={importTemplate}
          assetTotalPages={assetTotalPages}
          assetPaginatedResults={assetPaginatedResults}
          handleNexusAssetContextMenu={handleNexusAssetContextMenu}
        />
      </div>

      <NexusModals
        cleanModName={cleanModName}
        onOpenDossier={onOpenDossier}
        syncBlueprintByCode={syncBlueprintByCode}
        marketTab={marketTab}
        setAssetResultsMap={setAssetResultsMap}
        selectedBlueprint={selectedBlueprint}
        setSelectedBlueprint={setSelectedBlueprint}
        previewAsset={previewAsset}
        setPreviewAsset={setPreviewAsset}
        availableLanguages={availableLanguages}
        uploadState={uploadState}
        setUploadState={setUploadState}
        reportState={reportState}
        setReportState={setReportState}
        matrixBlueprintAsset={matrixBlueprintAsset}
        setMatrixBlueprintAsset={setMatrixBlueprintAsset}
        fetchNexusAssets={fetchNexusAssets}
        submitUpload={submitUpload}
        handleReportSubmit={handleReportSubmit}
      />
    </>
  );
}




