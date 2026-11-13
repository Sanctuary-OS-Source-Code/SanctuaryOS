import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { ViewHeader, CustomDropdown, getFileLabel, getExtensionRegex, isScriptExtension, formatDisplayName, getModIcon, compareVersions, enrichBlueprintsWithPremiumStatus, AccordionDrawer, DeferredRender, ActionPill, HoverTooltip, EmptyState, countBlueprintArtifacts, toHighlanderSlotSlug, formatHighlanderSlotLabel } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import { MarketUploadPanel, MarketReportPanel, MarketBlueprintPanel, auditBlueprintsTier0Compliance } from './side-panels/NexusSidePanels';
import { useTheme } from "./ThemeContext";
import { readDir, readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from "./utils/envUtils";
import BlueprintMatrix from "./BlueprintMatrix";
import { CommandScreenLayout, CommandScreenSectionHeading, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, DashboardStatTile, CommandScreenQuickLink, StatTileCarousel } from "./hub-components/SharedCommandScreenLayout";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
  DynamicBlueprintPreviewBanner,
  DynamicTemplatePreviewBanner,
  DynamicArtifactPreviewBanner,
  resolveThemePreviewData,
} from "./chameleon-components/ThemeCard";
import { uploadThemeAssetsToCloud, getLuminance } from "./chameleon-components/ChameleonShared";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "./ContextMenu";
import { useVerifiedMasonOrStaff } from "./utils/hubCommandCache";



if (!window.__sanctuaryCache) {
  window.__sanctuaryCache = {} as any;
}
if (!window.__sanctuaryCache!.nexus || (window.__sanctuaryCache!.nexus as any).schemaRev !== 4) {
  window.__sanctuaryCache!.nexus = {
    nexusItems: null,
    lastNexusFetch: 0,
    assetResultsMap: {},
    lastAssetFetch: 0,
    homeStats: null,

    recentFeed: [],
    lastHomeFetch: 0,
    schemaRev: 4,
  } as any;
}

const CACHE_TTL = 1000 * 60 * 15;
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
    return localStorage.getItem('sanctuary_hide_installed_assets') === 'true';
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
          setRecentFeed(cachedFeed.filter((item: any) => item.is_public !== false));
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
            { count: artifactsCount },
            { count: blueprintsCount },
            { count: lexiconsCount },
            { count: chameleonsCount },
            { count: templatesCount },
            { data: recentModsRawData },
            { data: recentBps },
            { data: recentAssets }
          ] = await Promise.all([
            supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 0).in('status', ['stable', 'verified', 'unstable', 'corrupted', 'pending']),
            supabase.from('blueprints').select('*', { count: 'exact', head: true }).eq('is_public', true).eq('is_market_listed', true).eq('compliance_tier', 0),
            supabase.from('nexus_assets').select('*', { count: 'exact', head: true }).eq('asset_type', 'lexicon').or('is_public.eq.true,is_public.is.null'),
            supabase.from('nexus_assets').select('*', { count: 'exact', head: true }).eq('asset_type', 'chameleon').or('is_public.eq.true,is_public.is.null'),
            supabase.from('nexus_assets').select('*', { count: 'exact', head: true }).eq('asset_type', 'workbench_template').or('is_public.eq.true,is_public.is.null'),
            supabase
              .from('mods')
              .select(selectFields)
              .eq('compliance_tier', 0)
              .in('status', ['stable', 'verified', 'unstable', 'corrupted', 'pending'])
              .order('created_at', { ascending: false })
              .limit(100),
            supabase.from('blueprints').select('id, name, created_at, mason_id, compliance_tier, is_public, is_locked, is_market_listed, game_version, is_paid, is_early_access, downloads, artifacts').eq('is_public', true).eq('is_market_listed', true).eq('compliance_tier', 0).order('created_at', { ascending: false }).limit(20),
            supabase.from('nexus_assets').select('id, asset_type, name, author, description, downloads, created_at, language, lexicon_type, theme_mode, is_community_default, version, release_notes, is_public, is_paid, is_early_access, json_data').or('is_public.eq.true,is_public.is.null').order('created_at', { ascending: false }).limit(20)
          ]);

          const newStats = {
            artifacts: artifactsCount || 0,
            blueprints: blueprintsCount || 0,
            lexicons: lexiconsCount || 0,
            chameleons: chameleonsCount || 0,
            templates: templatesCount || 0
          };

          setStats(newStats);
          window.__sanctuaryCache!.nexus!.homeStats = newStats;

          let recentModsRaw = recentModsRawData ? recentModsRawData.filter(m => !m.name?.toLowerCase().includes('manual flag')).slice(0, 50) : [];

          let processedRecentMods: any[] = [];
          if (recentModsRaw && recentModsRaw.length > 0) {
            const modIds = recentModsRaw.map(m => m.id);
            const [{ data: relationsAsChild }, { data: relationsAsParent }, { data: collections }] = await Promise.all([
              supabase.from('mod_relationships').select('child_id, parent_id').in('child_id', modIds).in('relationship_type', ['twin', 'addon', 'flavor', 'set_item', 'beta']),
              supabase.from('mod_relationships').select('child_id, parent_id').in('parent_id', modIds).in('relationship_type', ['twin', 'addon', 'flavor', 'set_item', 'beta']),
              supabase.from('collection_members').select('mod_id, set_id, collections(*)').in('mod_id', modIds)
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
                    .neq('status', 'unverified')
                : Promise.resolve({ data: [] as any[] }),
              allParentIds.length > 0 ? supabase.from('mod_relationships').select('child_id, parent_id').in('parent_id', allParentIds).in('relationship_type', ['twin', 'addon', 'flavor', 'set_item', 'beta']) : Promise.resolve({ data: [] as any[] }),
              allSetIds.length > 0 ? supabase.from('collection_members').select('mod_id, set_id').in('set_id', allSetIds) : Promise.resolve({ data: [] as any[] })
            ]);
            const fetchedParents: any[] = fetchedParentsRes.data || [];

            const siblingIdsToFetch = Array.from(new Set(
              (allSiblings || [])
                .map((s: any) => s.child_id)
                .filter((id: any) => id && !modIds.includes(id) && !parentIdsToFetch.includes(id))
            ));
            let fetchedSiblings: any[] = [];
            if (siblingIdsToFetch.length > 0) {
              const { data: sibData } = await supabase
                .from('mods')
                .select(selectFields)
                .in('id', siblingIdsToFetch.slice(0, 200))
                .eq('compliance_tier', 0)
                .neq('status', 'unverified');
              fetchedSiblings = sibData || [];
            }

            const trueFamilyCounts = new Map();
            allSiblings?.forEach((s: any) => {
              trueFamilyCounts.set(s.parent_id, (trueFamilyCounts.get(s.parent_id) || 0) + 1);
            });
            const trueSetCounts = new Map();
            allSetMembers?.forEach((s: any) => {
              trueSetCounts.set(s.set_id, (trueSetCounts.get(s.set_id) || 0) + 1);
            });

            const allModsForFeed = [...recentModsRaw, ...fetchedParents, ...fetchedSiblings];
            const modMap = new Map(allModsForFeed.map(m => [m.id, m]));
            const groupedMods = new Map();

            const pushUniqueFlavor = (flavorsArr: any[], candidate: any) => {
              if (!candidate) return;
              const cid = String(candidate.id || "");
              if (cid && flavorsArr.some((f: any) => String(f.id || "") === cid)) return;
              flavorsArr.push(candidate);
            };

            recentModsRaw.forEach(mod => {
              const colMember = collections?.find(c => c.mod_id === mod.id);
              if (colMember && colMember.collections) {
                const col = colMember.collections as any;
                if (!groupedMods.has(`collection_${col.id}`)) {
                  groupedMods.set(`collection_${col.id}`, {
                    id: `collection_${col.id}`,
                    name: col.name,
                    category_override: "Collection",
                    image_url: col.image_url,
                    master_author: col.creator_name || "Unknown Creator",
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
                  } else {
                    groupedMods.set(mod.id, mod);
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
            ...(recentBps || []).map((b: any) => ({ ...b, feed_type: 'blueprint' })),
            ...(recentAssets || []).map((a: any) => ({ ...a, feed_type: a.asset_type === 'workbench_template' ? 'template' : a.asset_type }))
          ];

          combined = combined.filter((item: any) => {
            if (item.is_public === false) return false;
            if (item.feed_type === 'artifact') {
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
        const vaultPath = config.vault_path;
        if (!vaultPath) return;
        const templatesDir = `${vaultPath}\\Templates`;
        if (await exists(templatesDir)) {
          const files = await readDir(templatesDir);
          const map: Record<string, string> = {};
          for (const file of files) {
            if (file.name?.endsWith('.json')) {
              try {
                const content = await readTextFile(`${templatesDir}\\${file.name}`);
                const parsed = JSON.parse(content);
                const data = Array.isArray(parsed) ? parsed[0] : parsed;
                if (data.name) {
                  const currentVersion = map[data.name] || '0.0.0';
                  const parsedVersion = data.template_version || data.version || '1.0.0';
                  if (compareVersions(parsedVersion, currentVersion) >= 0) {
                    map[data.name] = parsedVersion;
                  }
                }
              } catch { }
            }
          }
          setInstalledTemplates(map);
        }
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
          { data: blueprints, error: bpError },
          { data: allAssets, error: assetError },
          { data: masonData }
        ] = await Promise.all([
          supabase.from('blueprints').select('id, name, created_at, mason_id, compliance_tier, is_public, is_locked, is_market_listed, game_version, is_paid, is_early_access, downloads, artifacts').eq('is_market_listed', true).eq('compliance_tier', 0).order('created_at', { ascending: false }).limit(1000),
          supabase.from('nexus_assets').select('id, asset_type, name, author, description, downloads, created_at, language, lexicon_type, theme_mode, is_community_default, version, release_notes, is_public, is_paid, is_early_access, json_data').or('is_public.eq.true,is_public.is.null').order('created_at', { ascending: false }).limit(1000),
          supabase.from('masons').select('id, name, is_verified')
        ]);

        if (bpError) throw bpError;
        if (assetError) throw assetError;

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
        const { themeData } = await uploadThemeAssetsToCloud(finalContent, supabase);
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
      if (reportState.assetType === 'mod') {
        const tierToFlag = Math.min(4, Math.max(1, Number(reportState.complianceTier || 1)));
        const { error } = await supabase.rpc('flag_mod_for_compliance', {
          p_mod_id: String(reportState.assetId),
          p_tier: tierToFlag,
          p_reason: reportState.reason.trim(),
        });
        if (error) throw error;
        onSetStatus(t("mod_flagged_compliance_pending", "{Mod} flagged for Oversight Compliance review."));
      } else if (reportState.assetType === 'blueprint') {
        const { error } = await supabase.from('blueprint_reports').insert([{
          blueprint_id: reportState.assetId,
          reporter_name: session?.user?.user_metadata?.username || 'Anonymous',
          reporter_id: session?.user?.id,
          reason: reportState.reason.trim(),
          status: 'pending'
        }]);
        if (error) throw error;
        onSetStatus(t("report_submitted_success", "Report submitted successfully."));
      } else {
        const { error } = await supabase.from('nexus_reports').insert([{
          asset_id: reportState.assetId,
          reporter_name: session?.user?.user_metadata?.username || 'Anonymous',
          reporter_id: session?.user?.id,
          reason: reportState.reason.trim(),
          status: 'pending'
        }]);
        if (error) throw error;
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

      const templatesDir = `${vaultPath}\\Templates`;
      if (!(await exists(templatesDir))) {
        await mkdir(templatesDir, { recursive: true });
      }

      await writeTextFile(`${templatesDir}\\${templateId}_template.json`, JSON.stringify(parsed, null, 2));
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
          "id, name, created_at, category_override, sub_type, file_extension, master_author, compliance_tier, highlander_group_id, image_url, description, url, compatible_versions, requiredDLC, is_official, status, status_reason, is_paid, is_early_access, mod_versions(dna_hash, version_label), masons(id, name)";

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
            .in('status', ['stable', 'verified', 'unstable', 'corrupted', 'pending'])
            .range(0, BATCH_SIZE - 1),
          supabase.from('masons').select('name, is_verified'),
          supabase.from("flavor_groups").select("*"),
          supabase.from("collections").select("*, masons(id, name)"),
          supabase.from("mod_relationships").select("parent_id, child_id, relationship_type").in("relationship_type", ["twin", "addon", "flavor", "set_item", "beta"]),
          supabase.from("flavor_group_members").select("group_id, mod_hash"),
          supabase.from("collection_members").select("set_id, mod_id")
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
                .in('status', ['stable', 'verified', 'unstable', 'corrupted', 'pending'])
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
        if (allMods) {
          allMods = allMods.map(m => ({ ...m, is_verified: verifiedMap[m.master_author] || false }));
        }

        const modsData = allMods;
        const flavorGroups = flavorGroupsRes.data;
        const collections = collectionsRes.data;
        const relationships = relationshipsRes.data;
        const allFlavorMembers = flavorMembersRes.data;
        const allSetMembers = setMembersRes.data;

        let allItems: any[] = [];

        const highlanderGroupMap = new Map<string, any>();
        if (Array.isArray(flavorGroups)) {
          for (const fg of flavorGroups) {
            if (fg?.id) highlanderGroupMap.set(String(fg.id), fg);
          }
        }
        const legacyHashToGroupId = new Map<string, string>();
        if (Array.isArray(allFlavorMembers)) {
          for (const fm of allFlavorMembers) {
            if (fm?.mod_hash && fm?.group_id && !legacyHashToGroupId.has(String(fm.mod_hash))) {
              legacyHashToGroupId.set(String(fm.mod_hash), String(fm.group_id));
            }
          }
        }

        const modsById = new Map<string, any>();
        const hashToModMap = new Map<string, { modId: string; mod: any }>();
        if (modsData) {
          modsData.forEach((rawMod: any) => {
            if (rawMod.compliance_tier > 0) return;
            let resolvedGroupId = rawMod.highlander_group_id ? String(rawMod.highlander_group_id) : "";
            if (!resolvedGroupId && Array.isArray(rawMod.mod_versions)) {
              for (const v of rawMod.mod_versions) {
                const hit = v?.dna_hash ? legacyHashToGroupId.get(String(v.dna_hash)) : undefined;
                if (hit) {
                  resolvedGroupId = hit;
                  break;
                }
              }
            }
            const groupObj = resolvedGroupId ? highlanderGroupMap.get(resolvedGroupId) : null;
            const slotKey = groupObj ? toHighlanderSlotSlug(groupObj.slug || groupObj.name) : "";
            const mod = groupObj
              ? {
                  ...rawMod,
                  highlanderGroupId: resolvedGroupId,
                  highlanderSlotKey: slotKey,
                  highlanderSlotName: groupObj.name || formatHighlanderSlotLabel(slotKey),
                }
              : rawMod;
            const strId = String(mod.id);
            modsById.set(strId, mod);
            if (Array.isArray(mod.mod_versions)) {
              for (const v of mod.mod_versions) {
                if (v?.dna_hash && !hashToModMap.has(v.dna_hash)) {
                  hashToModMap.set(v.dna_hash, { modId: strId, mod });
                }
              }
            }
          });
        }

        const familyMap = new Map<string, Set<string>>();
        const processedMods = new Set<string>();

        if (relationships) {
          const parentRelsByChild = new Map<string, any[]>();
          relationships.forEach((rel: any) => {
            const parentId = String(rel.parent_id);
            const childId = String(rel.child_id);
            if (!modsById.has(parentId) || !modsById.has(childId)) return;
            if (!parentRelsByChild.has(childId)) parentRelsByChild.set(childId, []);
            parentRelsByChild.get(childId)!.push(rel);
          });

          const resolveRootParentId = (startId: string): string => {
            let cur = startId;
            let hops = 0;
            while (hops < 5) {
              const rels = parentRelsByChild.get(cur) || [];
              const nextRel =
                rels.find((r: any) => r.relationship_type === "addon") ||
                rels.find((r: any) => r.relationship_type === "set_item") ||
                rels.find((r: any) => r.relationship_type === "twin") ||
                rels.find((r: any) => r.relationship_type === "beta") ||
                rels[0];
              if (nextRel && String(nextRel.parent_id) !== cur && modsById.has(String(nextRel.parent_id))) {
                cur = String(nextRel.parent_id);
                hops++;
              } else {
                break;
              }
            }
            return cur;
          };

          relationships.forEach((rel: any) => {
            const rawParentId = String(rel.parent_id);
            const childId = String(rel.child_id);

            if (modsById.has(rawParentId) && modsById.has(childId)) {
              const rootParentId = resolveRootParentId(rawParentId);
              if (!familyMap.has(rootParentId)) {
                familyMap.set(rootParentId, new Set([rootParentId]));
              }
              familyMap.get(rootParentId)!.add(rawParentId);
              familyMap.get(rootParentId)!.add(childId);
            }
          });

          familyMap.forEach((memberIds, parentId) => {
            if (memberIds.size > 1) {
              const rawMembers = Array.from(memberIds)
                .map(id => modsById.get(id))
                .filter(Boolean);

              const seenMemberKeys = new Set<string>();
              const members = rawMembers.filter((m: any) => {
                const normName = String(m?.name || "").trim().toLowerCase();
                if (!normName) return false;
                const ext = String(m?.file_extension || "").trim().toLowerCase();
                const memberKey = `${normName}::${ext || m?.id}`;
                if (seenMemberKeys.has(memberKey)) return false;
                seenMemberKeys.add(memberKey);
                return true;
              });

              const parentMod = modsById.get(parentId);
              const isValidName = parentMod?.name && !parentMod.name.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

              if (members.length > 1 && parentMod && isValidName) {
                allItems.push({
                  ...parentMod,
                  isVirtual: true,
                  isParent: true,
                  familyId: parentId,
                  flavors: members,
                  familyCount: members.length
                });

                memberIds.forEach(id => processedMods.add(id));
              }
            }
          });
        }

        if (collections) {
          const membersBySet = new Map<string, any[]>();
          if (allSetMembers) {
            for (const sm of allSetMembers) {
              if (!membersBySet.has(sm.set_id)) membersBySet.set(sm.set_id, []);
              membersBySet.get(sm.set_id)!.push(sm);
            }
          }

          for (const set of collections) {
            const setMembers = membersBySet.get(set.id) || [];

            const members = setMembers
              .map((sm: any) => modsById.get(String(sm.mod_id)))
              .filter(Boolean) || [];

            if (setMembers.length > 0) {
              setMembers.forEach((sm: any) => processedMods.add(String(sm.mod_id)));
            }

            if (members.length > 0) {
              const setMasonName = Array.isArray(set.masons) ? set.masons[0]?.name : set.masons?.name;
              const resolvedSetAuthor =
                setMasonName ||
                set.creator_name ||
                members.find((m: any) => m?.master_author && m.master_author !== "Unknown")?.master_author ||
                "Unknown Creator";
              allItems.push({
                id: `collection_${set.id}`,
                name: set.name,
                category_override: "Collection",
                image_url: set.image_url || null,
                master_author: resolvedSetAuthor,
                is_verified: Boolean(resolvedSetAuthor && verifiedMap[resolvedSetAuthor]),
                description: null,
                created_at: set.created_at,
                url: set.url || null,
                isCollection: true,
                collectionId: set.id,
                flavors: members,
                familyCount: members.length,
                isVirtual: true,
                isParent: true
              });
            }
          }
        }

        modsById.forEach((mod, id) => {
          if (!processedMods.has(id)) {
            allItems.push(mod);
          }
        });

        const nameMap = new Map<string, any>();
        allItems.forEach(item => {
          const name = item.name?.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!name) return;

          const existing = nameMap.get(name);
          if (!existing) {
            nameMap.set(name, item);
          } else {
            if ((existing.isVirtual || existing.isParent) && (item.isVirtual || item.isParent)) {
              return;
            }

            if (item.isVirtual || item.isParent) {
              nameMap.set(name, item);
            } else if (existing.isVirtual || existing.isParent) {
              return;
            } else {
              const existingVersions = existing.compatible_versions || [];
              const itemVersions = item.compatible_versions || [];
              const mergedVersions = Array.from(new Set([...existingVersions, ...itemVersions]));
              existing.compatible_versions = mergedVersions;
            }
          }
        });

        allItems = Array.from(nameMap.values());
        allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        window.__sanctuaryCache!.nexus!.nexusItems = allItems;
        window.__sanctuaryCache!.nexus!.lastNexusFetch = performance.now();

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

      if (isOwned) return false;

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
          return versions.some((v: string) => v === selectedGameVersion);
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
  }, [results, ownedHashesSet, hidePaid, hideEarlyAccess, hideMissingDLC, ownedDLC, maskedDLC, searchQuery, categoryFilter, selectedGameVersion, dlcFilter, sortBy, t]);

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

  const handleNexusModContextMenu = (
    e: React.MouseEvent,
    mod: any,
    mainKey?: string,
    isFolder?: boolean
  ) => {
    const cleanedTitle = cleanModName(mod.name || mod.title || mod.id).name;
    const authorName = mod.master_author || mod.author || t("unknown_mason", "Unknown {Mason}");
    const isModOrSuiteStaged =
      isFolder && Array.isArray(mod.flavors) && mod.flavors.length > 0
        ? mod.flavors.every(
            (f: any) =>
              stagedModKeys.has(String(f.id)) || (f.hash && stagedModKeys.has(String(f.hash)))
          )
        : stagedModKeys.has(String(mod.id)) || (mod.hash && stagedModKeys.has(String(mod.hash)));

    const items: SanctuaryContextMenuItem[] = [
      {
        id: "inspect",
        label: t("btn_inspect", "Inspect {Mod}"),
        icon: t("icon_open_in_new", "open_in_new"),
        variant: "accent",
        onClick: () => onOpenDossier && onOpenDossier({ ...mod, isNexusView: true }),
      },
    ];

    if (isFolder && mainKey) {
      const isExpanded = expandedFolder === mainKey;
      const modCount = mod.familyCount || (mod.flavors?.length || 0);
      items.push({
        id: "explore",
        label: isExpanded
          ? t("btn_close", "Close")
          : `${t("nav_exploring", "Exploring")} (${modCount})`,
        icon: t("icon_account_tree", "account_tree"),
        onClick: () =>
          setExpandedFolder((prev: string | null) => (prev === mainKey ? null : mainKey)),
      });
    }

    if (!isDesktop()) {
      items.push({
        id: "stage",
        label: isModOrSuiteStaged
          ? t("staging_btn_unstage_mod", "Remove from Staging")
          : isFolder
            ? t("staging_btn_stage_suite", "Stage Suite")
            : t("nexus_btn_stage_compact", "Stage to Desktop"),
        icon: isModOrSuiteStaged
          ? t("icon_playlist_add_check", "playlist_add_check")
          : t("icon_playlist_add", "playlist_add"),
        variant: isModOrSuiteStaged ? "warning" : "success",
        onClick: () => {
          toggleModInStagingDraft(mod);
          onSetStatus(
            isModOrSuiteStaged
              ? t("status_staging_item_removed", "Removed from Remote Staging Queue.")
              : t("status_staging_item_added", "Added to Remote Staging Queue.")
          );
        },
      });
    }

    const resolvedMasonId = mod.mason_id || masonMap[String(authorName).toLowerCase()];
    if (resolvedMasonId && onOpenMasonProfile) {
      items.push({
        id: "profile",
        label: t("btn_view_profile", "View Profile"),
        icon: t("icon_person", "person"),
        dividerBefore: true,
        onClick: () => onOpenMasonProfile(resolvedMasonId),
      });
    }

    items.push({
      id: "report",
      label: t("report_title", "Report Asset"),
      icon: t("icon_flag", "flag"),
      variant: "danger",
      dividerBefore: true,
      onClick: () =>
        setReportState({
          isOpen: true,
          assetId: mod.id,
          assetType: "mod",
          reason: "",
        }),
    });

    openSanctuaryContextMenu(e, {
      title: cleanedTitle,
      subtitle: authorName,
      statusLabel: mod.latest_version || mod.version || undefined,
      icon: getModIcon(mod, useStore.getState().activeGameSchema, t),
      items,
    });
  };

  const handleNexusAssetContextMenu = (
    e: React.MouseEvent,
    asset: any,
    resolvedTab: string
  ) => {
    const tabUpper = resolvedTab.toUpperCase();
    const isBp = tabUpper === "BLUEPRINTS" || tabUpper === "BLUEPRINT";
    const isLex = tabUpper === "LEXICONS" || tabUpper === "LEXICON";
    const isCham = tabUpper === "CHAMELEONS" || tabUpper === "CHAMELEON";
    const isTmpl = tabUpper === "TEMPLATES" || tabUpper === "TEMPLATE" || tabUpper === "WORKBENCH_TEMPLATE";
    const authorName = asset.author || asset.master_author || t("unknown_mason", "Unknown {Mason}");

    const items: SanctuaryContextMenuItem[] = [
      {
        id: "inspect",
        label: t("btn_view", "View"),
        icon: t("icon_open_in_new", "open_in_new"),
        variant: "accent",
        onClick: () => {
          if (isBp) setSelectedBlueprint(asset);
          else if (isLex) setPreviewAsset({ id: asset.id, type: "lexicon" });
          else if (isCham) setPreviewAsset({ id: asset.id, type: "chameleon" });
          else if (isTmpl) setPreviewAsset({ id: asset.id, type: "workbench_template" });
          else if (onOpenDossier) onOpenDossier({ ...asset, isNexusView: true });
        },
      },
    ];

    if (isCham || isLex) {
      const previewKey = `nexus_${isCham ? "CHAMELEONS" : "LEXICONS"}_${asset.id}`;
      const isPreviewingThis = isCham
        ? previewThemeId === previewKey
        : previewLexiconId === previewKey;
      items.push({
        id: "preview",
        label: isPreviewingThis
          ? t("btn_stop_preview", "Stop Preview")
          : t("preview", "Preview"),
        icon: isPreviewingThis
          ? t("icon_visibility_off", "visibility_off")
          : t("icon_visibility", "visibility"),
        onClick: () => {
          if (isPreviewingThis) {
            if (isCham) stopThemePreview();
            else stopLexiconPreview();
            onSetStatus(t("status_preview_stopped", "Preview ended — restored active settings."));
          } else {
            const parsedData =
              typeof asset.json_data === "string"
                ? JSON.parse(asset.json_data)
                : asset.json_data || {};
            if (isCham) {
              startThemePreview(previewKey, {
                ...parsedData,
                name: asset.name || parsedData.name || "Chameleon",
              });
            } else {
              startLexiconPreview(
                previewKey,
                parsedData,
                asset.name || parsedData._meta_name || "Lexicon"
              );
            }
            onSetStatus(
              t(
                "status_previewing_asset",
                "Previewing {0} — click Stop Preview or Install when done."
              ).replace("{0}", asset.name || "")
            );
          }
        },
      });
    }

    if (isBp) {
      if (!isDesktop()) {
        items.push({
          id: "stage_bp",
          label: t("nexus_btn_stage_compact", "Stage to Desktop"),
          icon: t("icon_phonelink", "phonelink"),
          variant: "success",
          onClick: () => {
            stageBlueprintToDraft(asset);
            onSetStatus(
              t("status_staging_blueprint_loaded", "Blueprint loaded into Payload Editor.")
            );
            useStore.getState().setView("playsets");
          },
        });
      }
    } else if (isCham || isLex || isTmpl) {
      const assetTypeKey = isLex ? "lexicon" : isCham ? "chameleon" : "workbench_template";
      items.push({
        id: "install",
        label: isInstalled(asset)
          ? isOutdated(asset)
            ? t("btn_update", "Update")
            : t("btn_reinstall", "Reinstall")
          : t("update_panel_install", "Install"),
        icon: isInstalled(asset)
          ? isOutdated(asset)
            ? t("icon_update", "update")
            : t("icon_refresh", "refresh")
          : t("icon_download", "download"),
        variant: "success",
        onClick: async () => {
          const parsedData =
            typeof asset.json_data === "string"
              ? JSON.parse(asset.json_data)
              : asset.json_data || {};
          if (isCham) {
            importTheme({
              ...parsedData,
              name: asset.name || parsedData.name || "Chameleon",
              version: asset.version || parsedData.version || "1.0.0",
              author: asset.author || parsedData.author || "Citizen",
              _meta_version: asset.version || parsedData._meta_version || "1.0.0",
            });
          } else if (isTmpl) {
            const versionToSave = getAssetDisplayVersion(asset);
            await importTemplate({ ...parsedData, version: versionToSave });
            setInstalledTemplates((prev) => ({ ...prev, [asset.name]: versionToSave }));
          } else {
            importLexicon(
              {
                ...parsedData,
                _meta_language: asset.language || "Custom",
                _meta_version: asset.version || "1.0.0",
              },
              asset.name
            );
          }
          if (!isDesktop()) {
            toggleModInStagingDraft({
              ...asset,
              asset_type: assetTypeKey,
              asset_id: asset.id,
            });
          }
          onSetStatus(`${t("update_panel_install", "Install")}: ${asset.name}`);
        },
      });
    }

    const resolvedMasonId = asset.mason_id || masonMap[String(authorName).toLowerCase()];
    if (resolvedMasonId && onOpenMasonProfile) {
      items.push({
        id: "profile",
        label: t("btn_view_profile", "View Profile"),
        icon: t("icon_person", "person"),
        dividerBefore: true,
        onClick: () => onOpenMasonProfile(resolvedMasonId),
      });
    }

    items.push({
      id: "report",
      label: t("report_title", "Report Asset"),
      icon: t("icon_flag", "flag"),
      variant: "danger",
      dividerBefore: true,
      onClick: () =>
        setReportState({
          isOpen: true,
          assetId: asset.id,
          assetType: isBp
            ? "blueprint"
            : isLex
              ? "lexicon"
              : isCham
                ? "chameleon"
                : "workbench_template",
          reason: "",
        }),
    });

    openSanctuaryContextMenu(e, {
      title: asset.name || asset.title || t("unknown", "Unknown"),
      subtitle: authorName,
      statusLabel: `v${String(getAssetDisplayVersion(asset) || "1.0.0").replace(/^v/i, "")}`,
      icon: isBp
        ? t("icon_map", "map")
        : isLex
          ? t("icon_translate", "translate")
          : isTmpl
            ? t("icon_draw", "draw")
            : t("icon_palette", "palette"),
      items,
    });
  };

  return (
    <>
      <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <ViewHeader
          title={t("market_title", "The {Nexus}")}
          subtitle={`${t("subtitle_suffix", "Community index, {mod} discovery, and metadata links")}`}
          icon={t("icon_hub", "hub")}
          iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
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
                            { id: "ALL", label: "ALL CATEGORIES" },
                            ...categories.filter(c => c !== "ALL").map(cat => ({ id: cat, label: cat }))
                          ]}
                        />
                      )}

                      {(marketTab === 'LEXICONS' || marketTab === 'TEMPLATES') && (
                        <FilterSection
                          title={marketTab === 'LEXICONS' ? t("tab_lexicons", "Language") : (t("ql_templates", "Templates"))}
                          value={languageFilter}
                          onChange={(val: string) => { setLanguageFilter(val); setCurrentPage(1); }}
                          options={[
                            { id: "all", label: "All Languages" },
                            ...availableLanguages.map(l => ({ id: l, label: l }))
                          ]}
                        />
                      )}

                      {marketTab === 'LEXICONS' && (
                        <FilterSection
                          title={t("filter_type", "Type") || "Type"}
                          value={lexiconTypeFilter}
                          onChange={(val: string) => { setLexiconTypeFilter(val); setCurrentPage(1); }}
                          options={[
                            { id: "all", label: "All Types" },
                            { id: "Default", label: t("type_default", "Default") },
                            { id: "Theme", label: t("chameleon", "Theme") }
                          ]}
                        />
                      )}

                      {marketTab === 'CHAMELEONS' && (
                        <FilterSection
                          title={t("filter_mode", "Theme Mode") || "Theme Mode"}
                          value={themeModeFilter}
                          onChange={(val: string) => { setThemeModeFilter(val); setCurrentPage(1); }}
                          options={[
                            { id: "all", label: "All Modes" },
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
                        options={viewFilterOptions.filter(o => o.id !== 'hide_installed')}
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

        <div className={marketTab === 'HOME' ? 'flex-1 flex flex-col relative' : 'hidden'}>
          <CommandScreenLayout>
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading
                    title={t("recent_activity", "Recent Activity")}
                    icon={t("icon_history", "history")}
                  />
                  <div className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6 w-full">
                    {loadingHome ? (
                      <EmptyState
                        icon={t("icon_sync", "sync")}
                        title={t("loading", "Loading")}
                        className="col-span-full"
                      />
                    ) : recentFeed.length > 0 ? recentFeed.map((item, index) => {
                      const mainKey = item.id || `${item.feed_type}_${index}`;
                      const isFolder = item.feed_type === 'artifact' && (item.isVirtual || item.isParent || item.familyCount > 1);
                      const chipClass =
                        "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

                      const rawStatus = String(item?.status || "stable").toLowerCase().replace(/_/g, " ").replace(/[^\w\s-]/gi, "").trim();
                      const statusMeta = (() => {
                        if (rawStatus === "corrupted" || rawStatus === "broken") {
                          return { label: t("status_corrupted", "Corrupted"), icon: t("icon_error", "error"), iconColor: "text-[var(--danger)]" };
                        }
                        if (rawStatus === "unstable") {
                          return { label: t("label_unstable", "Unstable"), icon: t("icon_warning", "warning"), iconColor: "text-[var(--warning)]" };
                        }
                        if (rawStatus === "under review" || rawStatus === "pending") {
                          return { label: t("status_dd_review", "Under Review"), icon: t("icon_schedule", "schedule"), iconColor: "text-[var(--accent)]" };
                        }
                        if (item.feed_type !== 'artifact' || rawStatus === "synced") {
                          return { label: t("synced_badge", "Synced"), icon: t("icon_cloud_done", "cloud_done"), iconColor: "text-[var(--success)]" };
                        }
                        return { label: t("status_stable", "Stable"), icon: t("icon_verified", "verified"), iconColor: "text-[var(--success)]" };
                      })();

                      const typeBadgeIcon = item.feed_type === 'artifact'
                        ? (String(item.category_override || item.name || "").toLowerCase().includes("script") ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code"))
                        : item.feed_type === 'blueprint'
                          ? t("icon_map", "map")
                          : item.feed_type === 'lexicon'
                            ? t("icon_translate", "translate")
                            : item.feed_type === 'template'
                              ? t("icon_draw", "draw")
                              : t("icon_palette", "palette");

                      const typeBadgeColor = item.feed_type === 'artifact' ? "text-[var(--subtext)]" : "text-[var(--accent)]";
                      const bannerIcon = item.feed_type === 'artifact'
                        ? (item.isCollection ? t("icon_folder_special", "folder_special") : item.isParent ? t("icon_account_tree", "account_tree") : t("icon_deployed_code", "deployed_code"))
                        : item.feed_type === 'blueprint'
                          ? t("icon_map", "map")
                          : item.feed_type === 'lexicon'
                            ? t("icon_translate", "translate")
                            : item.feed_type === 'template'
                              ? t("icon_draw", "draw")
                              : t("icon_palette", "palette");

                      const renderedCard = (
                        <div key={mainKey} className={`relative flex flex-col h-full glass-panel rounded-[var(--radius)] transition-colors duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_35%,rgba(255,255,255,0.35))] group ${expandedFolder === mainKey ? 'ring-2 ring-[color-mix(in_srgb,var(--accent)_50%,transparent)]' : ''}`} onClick={() => {
                          if (item.feed_type === 'artifact') {
                            if (onOpenDossier) onOpenDossier({ ...item, isNexusView: true });
                          } else if (item.feed_type === 'blueprint') {
                            setSelectedBlueprint(item);
                          } else if (item.feed_type === 'lexicon') {
                            setPreviewAsset({ id: item.id, type: 'lexicon' });
                          } else if (item.feed_type === 'chameleon') {
                            setPreviewAsset({ id: item.id, type: 'chameleon' });
                          } else if (item.feed_type === 'template') {
                            setPreviewAsset({ id: item.id, type: 'workbench_template' });
                          }
                        }} onContextMenu={(e) => {
                          if (item.feed_type === 'artifact') {
                            handleNexusModContextMenu(e, item, mainKey, isFolder);
                          } else {
                            handleNexusAssetContextMenu(e, item, item.feed_type || 'asset');
                          }
                        }}>
                          <div
                            className="relative z-20 h-32 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                            style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                          >
                            <div className="absolute top-3 left-3 z-30">
                              <div className={chipClass}>
                                <span className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColor}`}>
                                  {statusMeta.icon}
                                </span>
                                <span>{statusMeta.label}</span>
                              </div>
                            </div>
                            {(showImages !== false && item.image_url) ? (
                              <img
                                src={item.image_url}
                                alt={item.name || item.title}
                                loading="lazy"
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-700"
                                style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : item.feed_type === 'chameleon' ? (
                              <div className="w-full h-full">
                                <DynamicThemePreviewBanner
                                  data={{ ...item, ...(typeof item.json_data === 'object' ? item.json_data : {}), name: item.name || item.title, previewImage: showImages !== false ? (item.image_url || item.json_data?.previewImage) : undefined }}
                                  heightClass="h-full"
                                />
                              </div>
                            ) : item.feed_type === 'lexicon' ? (
                              <div className="w-full h-full">
                                <DynamicLexiconPreviewBanner data={item} heightClass="h-full" />
                              </div>
                            ) : item.feed_type === 'blueprint' ? (
                              <div className="w-full h-full">
                                <DynamicBlueprintPreviewBanner data={item} heightClass="h-full" />
                              </div>
                            ) : item.feed_type === 'template' ? (
                              <div className="w-full h-full">
                                <DynamicTemplatePreviewBanner data={item} heightClass="h-full" />
                              </div>
                            ) : (
                              <div className="w-full h-full">
                                <DynamicArtifactPreviewBanner
                                  data={item}
                                  icon={bannerIcon}
                                  heightClass="h-full"
                                />
                              </div>
                            )}
                          </div>

                          <div className="p-5 flex flex-col flex-1">
                            <h3 className="text-[15px] font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                              {cleanModName(item.name || item.title || item.id).name}
                            </h3>
                            <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate mb-2">
                              BY {item.master_author || item.author || "Citizen"}
                            </p>

                            <div className="flex flex-wrap items-center gap-2 mt-1 mb-3">
                              <div className={chipClass}>
                                <span className={`material-symbols-outlined !text-[12px] ${typeBadgeColor}`}>
                                  {typeBadgeIcon}
                                </span>
                                <span className={item.feed_type === 'artifact' ? "text-[var(--subtext)]" : ""}>
                                  {item.category_override || item.feed_type}
                                </span>
                              </div>
                            </div>

                            <div className="mt-auto pt-3 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative">
                              <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest pointer-events-auto z-10">
                                {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                              </span>

                              {isFolder && (
                                <button
                                  type="button"
                                  className="group/hitbox relative z-20 flex items-center gap-1.5 font-black text-[9px] uppercase tracking-wider text-[var(--text)] hover:text-[var(--accent)] transition-colors pointer-events-auto cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedFolder((prev: string | null) => prev === mainKey ? null : mainKey);
                                  }}
                                >
                                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                                    {t("icon_account_tree", "account_tree")}
                                  </span>
                                  <span>+{item.familyCount || (item.flavors?.length || 0)} {t("badge_modules_count", "Modules")}</span>
                                  <span className={`material-symbols-outlined !text-[14px] transition-transform duration-300 ${expandedFolder === mainKey ? 'rotate-180 text-[var(--accent)]' : ''}`}>
                                    {t("icon_expand_more", "expand_more")}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );

                      return (
                        <React.Fragment key={mainKey}>
                          <div className="contents">
                            {renderedCard}
                          </div>

                          <AccordionDrawer isOpen={expandedFolder === mainKey}>
                            <div
                              className="w-full glass-panel rounded-3xl p-4 sm:p-6 md:p-8 border border-[color-mix(in_srgb,var(--accent)_25%,rgba(255,255,255,0.16))] shadow-[0_24px_60px_rgba(0,0,0,0.45)] flex flex-col gap-5 md:gap-6 relative isolate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Header */}
                              <div className="flex flex-wrap gap-3 sm:gap-4 items-center justify-between pb-4 sm:pb-5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-20 w-full">
                                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)]">{t("icon_folder_open", "folder_open")}</span>
                                  </div>
                                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                    <h3 className="text-base sm:text-xl md:text-2xl font-black text-[var(--text)] tracking-tight leading-tight truncate">
                                      {formatDisplayName(item.displayName || item.name || item.title)}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_account_tree", "account_tree")}</span>
                                        <span>
                                          {t("nav_exploring", "Exploring")} {(item.flavors || []).length} {t("term_mods", "Mods")}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2.5 sm:gap-3 w-full md:w-auto relative z-30">
                                  <div
                                    className="relative flex-1 md:w-72 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex items-center px-3.5 gap-2.5 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-70 shrink-0">
                                      {t("icon_search", "search")}
                                    </span>
                                    <input
                                      type="text"
                                      value={drawerSearchQuery}
                                      onChange={(e) => setDrawerSearchQuery(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === "Escape") setDrawerSearchQuery("");
                                      }}
                                      placeholder={t("search_ph", "Search {mods}...")}
                                      className="w-full bg-transparent border-none outline-none text-xs font-bold text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-50"
                                    />
                                    {drawerSearchQuery && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDrawerSearchQuery("");
                                        }}
                                        className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors shrink-0"
                                      >
                                        <span className="material-symbols-outlined !text-[14px]">
                                          {t("icon_close", "close")}
                                        </span>
                                      </button>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDrawerSearchQuery("");
                                      setExpandedFolder(null);
                                    }}
                                    className="w-10 h-10 rounded-xl glass-surface hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] transition-colors shrink-0 cursor-pointer pointer-events-auto"
                                  >
                                    <span className="material-symbols-outlined !text-[20px]">
                                      {t("icon_close", "close")}
                                    </span>
                                  </button>
                                </div>
                              </div>

                              {/* Content Area */}
                              <div className="w-full relative z-10">
                                <DeferredRender>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[520px] xl:max-h-[600px] overflow-y-auto custom-scrollbar pr-1 pt-1 pb-2">
                                    {(item.flavors || [])
                                      .filter((flavor: any) => {
                                        if (!drawerSearchQuery) return true;
                                        const query = drawerSearchQuery.toLowerCase().replace(/[_\-\.\/]+/g, ' ').replace(/\s+/g, ' ').trim();
                                        const target = `${flavor.displayName || ""} ${flavor.name || ""} ${flavor.master_author || flavor.author || ""}`.toLowerCase().replace(/[_\-\.\/]+/g, ' ').replace(/\s+/g, ' ');
                                        return target.includes(query);
                                      })
                                      .map((flavor: any, subIdx: number) => {
                                        const flavorIsScript =
                                          String(flavor.file_extension || "").toLowerCase().includes("script") ||
                                          String(flavor.category_override || "").toLowerCase() === "script" ||
                                          String(flavor.sub_type || "").toLowerCase() === "script" ||
                                          isScriptExtension(String(flavor.name || flavor.file_extension || ""), activeGameSchema);
                                        return (
                                          <div
                                            key={`sub-${flavor.id || flavor.hash || flavor.name}-${subIdx}`}
                                            onClick={() => onOpenDossier && onOpenDossier({ ...flavor, isNexusView: true })}
                                            className="relative flex flex-col h-full glass-panel rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group"
                                          >
                                            <div
                                              className="relative z-20 h-28 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                                              style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                                            >
                                              {(showImages !== false && flavor.image_url) ? (
                                                <img
                                                  src={flavor.image_url}
                                                  alt={flavor.name}
                                                  loading="lazy"
                                                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-700"
                                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                              ) : (
                                                <DynamicArtifactPreviewBanner
                                                  data={flavor}
                                                  icon={getModIcon(flavor, useStore.getState().activeGameSchema, t)}
                                                  compact={true}
                                                  heightClass="h-full"
                                                />
                                              )}
                                            </div>
                                            <div className="p-4 flex flex-col flex-1">
                                              <h3 className="text-xs font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                                                {cleanModName(flavor.name || flavor.id).name}
                                              </h3>
                                              <p className="text-[8px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2">
                                                {flavor.master_author || item.master_author || "Unknown Creator"}{(flavor.latest_version || flavor.version) ? ` • ${flavor.latest_version || flavor.version}` : ""}
                                              </p>
                                              <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-2">
                                                <div className={chipClass}>
                                                  <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                                    {flavorIsScript ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                                                  </span>
                                                  <span className="text-[var(--subtext)]">
                                                    {flavorIsScript ? t("type_script", "Script") : t("type_package", "Package")}
                                                  </span>
                                                </div>
                                              </div>
                                              {!isDesktop() && (
                                                <div className="mt-auto pt-2 flex justify-end">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      const wasStaged = stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash)));
                                                      toggleModInStagingDraft(flavor);
                                                      onSetStatus(wasStaged ? t("status_staging_item_removed", "Removed from Remote Staging Queue.") : t("status_staging_item_added", "Added to Remote Staging Queue."));
                                                    }}
                                                    className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 transition-all ${
                                                      (stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                        ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]'
                                                        : 'glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]'
                                                    }`}
                                                  >
                                                    <span className="material-symbols-outlined !text-[12px]">
                                                      {(stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                        ? t("icon_playlist_add_check", "playlist_add_check")
                                                        : t("icon_playlist_add", "playlist_add")}
                                                    </span>
                                                    <span>
                                                      {(stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                        ? t("staging_btn_staged", "Staged")
                                                        : t("staging_btn_stage_mod", "Stage to PC")}
                                                    </span>
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </DeferredRender>
                              </div>
                            </div>
                          </AccordionDrawer>
                        </React.Fragment>
                      );
                    }) : (
                      <EmptyState
                        icon={t("icon_history", "history")}
                        title={t("no_recent_activity", "No Recent Activity")}
                        className="col-span-full"
                      />
                    )}
                  </div>
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("wf_quick_links", "Quick Links")} icon={t("icon_bolt", "bolt")}>
                <div className="flex flex-col gap-4">
                  <CommandScreenQuickLink
                    icon={t("icon_extension", "extension")}
                    title={t("tab_mods", "{Mods}")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.artifacts} ${t("tab_mods", "{Mods}")}`}
                    onClick={() => setMarketTab('MODS')}
                    textColorClass="text-emerald-500"
                    hoverTextColorClass="group-hover:text-emerald-400"
                    iconShadowClass="drop-shadow-md text-emerald-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_map", "map")}
                    title={t("tab_blueprints", "{Blueprints}")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.blueprints} ${t("tab_blueprints", "{Blueprints}")}`}
                    onClick={() => setMarketTab('BLUEPRINTS')}
                    textColorClass="text-blue-500"
                    hoverTextColorClass="group-hover:text-blue-400"
                    iconShadowClass="drop-shadow-md text-blue-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_translate", "translate")}
                    title={t("tab_lexicons", "Language")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.lexicons} ${t("tab_lexicons", "Language")}`}
                    onClick={() => setMarketTab('LEXICONS')}
                    textColorClass="text-purple-500"
                    hoverTextColorClass="group-hover:text-purple-400"
                    iconShadowClass="drop-shadow-md text-purple-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_palette", "palette")}
                    title={t("tab_chameleons", "Chameleons")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.chameleons} ${t("tab_chameleons", "Chameleons")}`}
                    onClick={() => setMarketTab('CHAMELEONS')}
                    textColorClass="text-rose-500"
                    hoverTextColorClass="group-hover:text-rose-400"
                    iconShadowClass="drop-shadow-md text-rose-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_draw", "draw")}
                    title={t("tab_templates", "Templates")}
                    subtitle={`${t("btn_browse", "Browse")} ${t("filter_all", "All")} ${stats.templates} ${t("tab_templates", "Templates")}`}
                    onClick={() => setMarketTab('TEMPLATES')}
                    textColorClass="text-amber-500"
                    hoverTextColorClass="group-hover:text-amber-400"
                    iconShadowClass="drop-shadow-md text-amber-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                  />
                </div>
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>

        <div className={marketTab === 'MODS' ? 'flex-1 flex flex-col relative' : 'hidden'}>
          <>
            {/*  removed in favor of ViewHeader filters */}

            <div className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-8 mt-6">
              {loadingMods ? (
                <EmptyState
                  icon={t("icon_sync", "sync")}
                  title={t("searching", "Searching The {Nexus}...")}
                  className="col-span-full"
                />
              ) : paginatedResults.length > 0 ? (
                <>
                  {paginatedResults.map((mod: any, index: number) => {
                    const mainKey = mod.id || `${mod.name}_${index}`;
                    const isFolder = mod.isVirtual || mod.isParent || mod.familyCount > 1;
                    const chipClass =
                      "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

                    const rawStatus = (mod.status || 'UNVERIFIED').toLowerCase().replace(/[\[\]]/g, "").replace(/_/g, " ").trim();
                    const statusMeta = (() => {
                      if (rawStatus === 'broken' || rawStatus === 'corrupted') {
                        return { label: t("status_corrupted", "Corrupted"), icon: t("icon_error", "error"), iconColor: "text-[var(--danger)]" };
                      }
                      if (rawStatus === 'unstable') {
                        return { label: t("label_unstable", "Unstable"), icon: t("icon_warning", "warning"), iconColor: "text-[var(--warning)]" };
                      }
                      if (rawStatus === 'under review' || rawStatus === 'pending') {
                        return { label: t("status_dd_review", "Under Review"), icon: t("icon_schedule", "schedule"), iconColor: "text-[var(--accent)]" };
                      }
                      if (rawStatus === 'synced') {
                        return { label: t("synced_badge", "Synced"), icon: t("icon_cloud_done", "cloud_done"), iconColor: "text-[var(--success)]" };
                      }
                      if (rawStatus === 'stable' || rawStatus === 'verified') {
                        return { label: t("status_stable", "Stable"), icon: t("icon_verified", "verified"), iconColor: "text-[var(--success)]" };
                      }
                      if (rawStatus === 'early access') {
                        return { label: t("badge_early_access", "Early Access"), icon: t("icon_science", "science"), iconColor: "text-purple-400" };
                      }
                      if (rawStatus === 'paid') {
                        return { label: t("badge_paid", "Paid"), icon: t("icon_monetization_on", "monetization_on"), iconColor: "text-amber-400" };
                      }
                      return { label: rawStatus.toUpperCase() || t("unverified", "Unverified"), icon: t("icon_science", "science"), iconColor: "text-[var(--accent)]" };
                    })();

                    const isScriptMod = String(mod.category_override || mod.name || "").toLowerCase().includes("script");

                    const renderedCard = (
                      <div
                        key={mainKey}
                        onClick={() => onOpenDossier && onOpenDossier({ ...mod, isNexusView: true })}
                        onContextMenu={(e) => handleNexusModContextMenu(e, mod, mainKey, isFolder)}
                        className={`relative flex flex-col h-full glass-panel rounded-2xl transition-colors duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_35%,rgba(255,255,255,0.35))] group ${expandedFolder === mainKey ? 'ring-2 ring-[color-mix(in_srgb,var(--accent)_50%,transparent)]' : ''}`}
                      >
                        <div
                          className="relative z-20 h-32 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                          style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                        >
                          <div className="absolute top-3 left-3 z-30">
                            <div className={chipClass}>
                              <span className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColor}`}>
                                {statusMeta.icon}
                              </span>
                              <span>{statusMeta.label}</span>
                            </div>
                          </div>
                          {(showImages !== false && mod.image_url) ? (
                            <img
                              src={mod.image_url}
                              alt={mod.name}
                              loading="lazy"
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-700"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <DynamicArtifactPreviewBanner
                              data={mod}
                              icon={getModIcon(mod, useStore.getState().activeGameSchema, t)}
                              heightClass="h-full"
                            />
                          )}
                        </div>

                        <div className="p-5 flex flex-col flex-1">
                          <h3 className="text-[15px] font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                            {cleanModName(mod.name || mod.id).name}
                          </h3>
                          <p className="text-[9px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2">
                            {mod.master_author || t("unknown_mason", "Unknown {Mason}")}{(mod.latest_version) ? ` • ${mod.latest_version}` : ""}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 mt-1 mb-3">
                            <div className={chipClass}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                {isScriptMod ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                              </span>
                              <span className="text-[var(--subtext)]">
                                {mod.category_override || t("label_artifact", "{Mod}")}
                              </span>
                            </div>

                            {mod.is_early_access && (
                              <div className={chipClass}>
                                <span className="material-symbols-outlined !text-[12px] text-purple-400">
                                  {t("icon_science", "science")}
                                </span>
                                <span>{t("badge_early_access", "Early Access")}</span>
                              </div>
                            )}
                            {mod.is_paid && (
                              <div className={chipClass}>
                                <span className="material-symbols-outlined !text-[12px] text-amber-400">
                                  {t("icon_monetization_on", "monetization_on")}
                                </span>
                                <span>{t("badge_paid", "Paid")}</span>
                              </div>
                            )}
                          </div>

                          {mod.description && (
                            <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                              {mod.description}
                            </p>
                          )}

                          <div className="mt-auto pt-3.5 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative gap-2">
                            {isFolder ? (
                              <button
                                type="button"
                                className="group/hitbox relative z-20 flex items-center gap-1.5 font-black text-[9px] uppercase tracking-wider text-[var(--text)] hover:text-[var(--accent)] transition-colors pointer-events-auto cursor-pointer whitespace-nowrap"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedFolder((prev: string | null) => prev === mainKey ? null : mainKey);
                                }}
                              >
                                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                                  {t("icon_account_tree", "account_tree")}
                                </span>
                                <span>+{mod.familyCount || (mod.flavors?.length || 0)} {t("badge_modules_count", "Modules")}</span>
                                <span className={`material-symbols-outlined !text-[14px] transition-transform duration-300 ${expandedFolder === mainKey ? 'rotate-180 text-[var(--accent)]' : ''}`}>
                                  {t("icon_expand_more", "expand_more")}
                                </span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[var(--subtext)] opacity-65 tracking-wider pointer-events-auto z-10 whitespace-nowrap">
                                <span className="material-symbols-outlined !text-[12px] opacity-75">{t("icon_calendar", "event")}</span>
                                {mod.created_at ? new Date(mod.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : t("date_unknown", "Unknown Date")}
                              </span>
                            )}

                            {!isDesktop() && (() => {
                              const isModOrSuiteStaged = isFolder && Array.isArray(mod.flavors) && mod.flavors.length > 0
                                ? mod.flavors.every((f: any) => stagedModKeys.has(String(f.id)) || (f.hash && stagedModKeys.has(String(f.hash))))
                                : (stagedModKeys.has(String(mod.id)) || (mod.hash && stagedModKeys.has(String(mod.hash))));
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleModInStagingDraft(mod);
                                    onSetStatus(
                                      isModOrSuiteStaged
                                        ? t("status_staging_item_removed", "Removed from Remote Staging Queue.")
                                        : t("status_staging_item_added", "Added to Remote Staging Queue.")
                                    );
                                  }}
                                  className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all pointer-events-auto z-20 cursor-pointer ${
                                    isModOrSuiteStaged
                                      ? 'sa-glass-active text-[var(--accent)]'
                                      : 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]'
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {isModOrSuiteStaged
                                      ? t("icon_playlist_add_check", "playlist_add_check")
                                      : t("icon_playlist_add", "playlist_add")}
                                  </span>
                                  <span>
                                    {isModOrSuiteStaged
                                      ? t("staging_btn_staged", "Staged")
                                      : isFolder
                                        ? t("staging_btn_stage_suite", "Stage Suite")
                                        : t("nexus_btn_stage_compact", "Stage to Desktop")}
                                  </span>
                                  <HoverTooltip
                                    title={
                                      isModOrSuiteStaged
                                        ? t("staging_btn_unstage_mod", "Remove from Staging")
                                        : isFolder
                                          ? t("staging_btn_stage_suite", "Stage Suite")
                                          : t("nexus_btn_stage_compact", "Stage to Desktop")
                                    }
                                  />
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );

                    return (
                      <React.Fragment key={mainKey}>
                        <div className="contents">
                          {renderedCard}
                        </div>

                        <AccordionDrawer isOpen={expandedFolder === mainKey}>
                          <div
                            className="w-full glass-panel rounded-3xl p-4 sm:p-6 md:p-8 border border-[color-mix(in_srgb,var(--accent)_25%,rgba(255,255,255,0.16))] shadow-[0_24px_60px_rgba(0,0,0,0.45)] flex flex-col gap-5 md:gap-6 relative isolate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Header */}
                            <div className="flex flex-wrap gap-3 sm:gap-4 items-center justify-between pb-4 sm:pb-5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-20 w-full">
                              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] text-[var(--accent)]">{t("icon_folder_open", "folder_open")}</span>
                                </div>
                                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                  <h3 className="text-base sm:text-xl md:text-2xl font-black text-[var(--text)] tracking-tight leading-tight truncate">
                                    {formatDisplayName(mod.displayName || mod.name)}
                                  </h3>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_account_tree", "account_tree")}</span>
                                      <span>
                                        {t("nav_exploring", "Exploring")} {(mod.flavors || []).length} {t("term_mods", "Mods")}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2.5 sm:gap-3 w-full md:w-auto relative z-30">
                                <div
                                  className="relative flex-1 md:w-72 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex items-center px-3.5 gap-2.5 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-70 shrink-0">
                                    {t("icon_search", "search")}
                                  </span>
                                  <input
                                    type="text"
                                    value={drawerSearchQuery}
                                    onChange={(e) => setDrawerSearchQuery(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      e.stopPropagation();
                                      if (e.key === "Escape") setDrawerSearchQuery("");
                                    }}
                                    placeholder={t("search_ph", "Search {mods}...")}
                                    className="w-full bg-transparent border-none outline-none text-xs font-bold text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-50"
                                  />
                                  {drawerSearchQuery && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDrawerSearchQuery("");
                                      }}
                                      className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors shrink-0"
                                    >
                                      <span className="material-symbols-outlined !text-[14px]">
                                        {t("icon_close", "close")}
                                      </span>
                                    </button>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawerSearchQuery("");
                                    setExpandedFolder(null);
                                  }}
                                  className="w-10 h-10 rounded-xl glass-surface hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] transition-colors shrink-0 cursor-pointer pointer-events-auto"
                                >
                                  <span className="material-symbols-outlined !text-[20px]">
                                    {t("icon_close", "close")}
                                  </span>
                                </button>
                              </div>
                            </div>

                            {/* Content Area */}
                            <div className="w-full relative z-10">
                              <DeferredRender>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[520px] xl:max-h-[600px] overflow-y-auto custom-scrollbar pr-1 pt-1 pb-2">
                                  {(mod.flavors || [])
                                    .filter((flavor: any) => {
                                      if (!drawerSearchQuery) return true;
                                      const query = drawerSearchQuery.toLowerCase().replace(/[_\-\.\/]+/g, ' ').replace(/\s+/g, ' ').trim();
                                      const target = `${flavor.displayName || ""} ${flavor.name || ""} ${flavor.master_author || flavor.author || ""}`.toLowerCase().replace(/[_\-\.\/]+/g, ' ').replace(/\s+/g, ' ');
                                      return target.includes(query);
                                    })
                                    .map((flavor: any, subIdx: number) => {
                                      const flavorIsScript =
                                        String(flavor.file_extension || "").toLowerCase().includes("script") ||
                                        String(flavor.category_override || "").toLowerCase() === "script" ||
                                        String(flavor.sub_type || "").toLowerCase() === "script" ||
                                        isScriptExtension(String(flavor.name || flavor.file_extension || ""), activeGameSchema);
                                      return (
                                        <div
                                          key={`sub-${flavor.id || flavor.hash || flavor.name}-${subIdx}`}
                                          onClick={() => onOpenDossier && onOpenDossier({ ...flavor, isNexusView: true })}
                                          className="relative flex flex-col h-full glass-panel rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group"
                                        >
                                          <div
                                            className="relative z-20 h-28 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                                            style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                                          >
                                            {(showImages !== false && flavor.image_url) ? (
                                              <img
                                                src={flavor.image_url}
                                                alt={flavor.name}
                                                loading="lazy"
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-700"
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                              />
                                            ) : (
                                              <DynamicArtifactPreviewBanner
                                                data={flavor}
                                                icon={getModIcon(flavor, useStore.getState().activeGameSchema, t)}
                                                compact={true}
                                                heightClass="h-full"
                                              />
                                            )}
                                          </div>
                                          <div className="p-4 flex flex-col flex-1">
                                            <h3 className="text-xs font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                                              {cleanModName(flavor.name || flavor.id).name}
                                            </h3>
                                            <p className="text-[8px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2">
                                              {flavor.master_author || mod.master_author || "Unknown Creator"}{(flavor.latest_version || flavor.version) ? ` • ${flavor.latest_version || flavor.version}` : ""}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-2">
                                              <div className={chipClass}>
                                                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                                  {flavorIsScript ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                                                </span>
                                                <span className="text-[var(--subtext)]">
                                                  {flavorIsScript ? t("type_script", "Script") : t("type_package", "Package")}
                                                </span>
                                              </div>
                                            </div>
                                            {!isDesktop() && (
                                              <div className="mt-auto pt-2 flex justify-end">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    const wasStaged = stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash)));
                                                    toggleModInStagingDraft(flavor);
                                                    onSetStatus(wasStaged ? t("status_staging_item_removed", "Removed from Remote Staging Queue.") : t("status_staging_item_added", "Added to Remote Staging Queue."));
                                                  }}
                                                  className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 transition-all ${
                                                    (stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                      ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]'
                                                      : 'glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]'
                                                  }`}
                                                >
                                                  <span className="material-symbols-outlined !text-[12px]">
                                                    {(stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                      ? t("icon_playlist_add_check", "playlist_add_check")
                                                      : t("icon_playlist_add", "playlist_add")}
                                                  </span>
                                                  <span>
                                                    {(stagedModKeys.has(String(flavor.id)) || (flavor.hash && stagedModKeys.has(String(flavor.hash))))
                                                      ? t("staging_btn_staged", "Staged")
                                                      : t("staging_btn_stage_mod", "Stage to PC")}
                                                  </span>
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </DeferredRender>
                            </div>
                          </div>
                        </AccordionDrawer>
                      </React.Fragment>
                    );
                  })}
                </>
              ) : (
                <EmptyState
                  icon={t("icon_hub", "hub")}
                  title={t("empty_title", "No new {mods} detected.")}
                  subtitle={t("empty_desc", "Everything in The {Nexus} is already in Your {Vault}.")}
                  className="col-span-full py-16"
                />
              )}
            </div>

            {totalPages > 1 && !loadingMods && (
              <div className="flex justify-center items-center gap-4 mt-4 mb-20">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-6 py-3 glass-surface rounded-xl font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-border-accent"
                >
                  {t("nav_prev", "PREV")}
                </button>
                <span className="text-[12px] font-black capitalize tracking-widest text-[var(--subtext)] px-4">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-6 py-3 glass-surface rounded-xl font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-border-accent"
                >
                  {t("nav_next", "NEXT")}
                </button>
              </div>
            )}
          </>
        </div>

        <div className={['BLUEPRINTS', 'LEXICONS', 'CHAMELEONS', 'TEMPLATES'].includes(marketTab) ? 'flex-1 flex flex-col relative' : 'hidden'}>
          <div className="flex flex-col">
            {/*  removed in favor of ViewHeader filters */}

            <div className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-8 mt-6">
              {loadingAssets ? (
                <EmptyState
                  icon={t("icon_sync", "sync")}
                  title={t("searching", "Searching The {Nexus}...")}
                  className="col-span-full"
                />
              ) : assetPaginatedResults.length > 0 ? (
                assetPaginatedResults.map((asset: any, index: number) => (
                  <div
                    key={asset.id || `${asset.name}_${index}`}
                    onClick={() => {
                      if (marketTab === 'BLUEPRINTS') setSelectedBlueprint(asset);
                      else if (marketTab === 'LEXICONS') setPreviewAsset({ id: asset.id, type: 'lexicon' });
                      else if (marketTab === 'CHAMELEONS') setPreviewAsset({ id: asset.id, type: 'chameleon' });
                      else if (marketTab === 'TEMPLATES') setPreviewAsset({ id: asset.id, type: 'workbench_template' });
                      else if (onOpenDossier) onOpenDossier({ ...asset, isNexusView: true });
                    }}
                    onContextMenu={(e) => handleNexusAssetContextMenu(e, asset, marketTab)}
                    className="relative flex flex-col h-full glass-panel rounded-2xl transition-colors duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_35%,rgba(255,255,255,0.35))] group"
                  >
                    <div
                      className="relative z-20 h-32 border-b border-[color-mix(in_srgb,var(--text)_5%,rgba(255,255,255,0.14))] shrink-0 flex items-center justify-center transition-colors duration-500 overflow-hidden"
                      style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', background: 'var(--glass-card-banner-bg)' }}
                    >
                      <div className="absolute top-3 left-3 z-30">
                        <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                          <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                            {t("icon_cloud_done", "cloud_done")}
                          </span>
                          <span>{t("synced_badge", "Synced")}</span>
                        </div>
                      </div>
                      {marketTab === 'CHAMELEONS' ? (
                        <div className="w-full h-full">
                          <DynamicThemePreviewBanner
                            data={{ ...asset, ...(typeof asset.json_data === 'object' ? asset.json_data : {}), name: asset.name, previewImage: showImages !== false ? (asset.image_url || asset.json_data?.previewImage) : undefined }}
                            heightClass="h-full"
                          />
                        </div>
                      ) : marketTab === 'LEXICONS' ? (
                        <div className="w-full h-full">
                          <DynamicLexiconPreviewBanner data={asset} heightClass="h-full" />
                        </div>
                      ) : marketTab === 'BLUEPRINTS' ? (
                        <div className="w-full h-full">
                          <DynamicBlueprintPreviewBanner data={asset} heightClass="h-full" />
                        </div>
                      ) : marketTab === 'TEMPLATES' ? (
                        <div className="w-full h-full">
                          <DynamicTemplatePreviewBanner data={asset} heightClass="h-full" />
                        </div>
                      ) : (
                        <div
                          className="w-16 h-16 rounded-2xl border flex items-center justify-center transition-all duration-500 group-hover:scale-105"
                          style={{
                            backgroundColor: 'var(--glass-card-icon-bg)',
                            borderColor: 'var(--glass-card-icon-border)',
                            boxShadow: 'var(--glass-card-icon-shadow)',
                          }}
                        >
                          <span className="material-symbols-outlined !text-[34px] text-[var(--text)] opacity-85 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all duration-500 drop-shadow-sm">
                            {marketTab === 'BLUEPRINTS' ? t("icon_map", "map") : marketTab === 'TEMPLATES' ? t("icon_draw", "draw") : t("icon_translate", "translate")}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="text-[15px] font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                        {asset.name}
                      </h3>
                      {masonMap[asset.author?.toLowerCase()] ? (
                        <p
                          onClick={(e) => { e.stopPropagation(); onOpenMasonProfile?.(masonMap[asset.author.toLowerCase()]); }}
                          className="text-[9px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2 cursor-pointer hover:underline hover:text-[var(--text)] transition-colors"
                        >
                          {asset.author} • v{String(getAssetDisplayVersion(asset) || '1.0.0').replace(/^v/i, '')}
                        </p>
                      ) : (
                        <p className="text-[9px] font-black text-[color-mix(in_srgb,var(--text)_30%,transparent)] capitalize tracking-widest truncate mb-2">
                          {asset.author || "Citizen"} • v{String(getAssetDisplayVersion(asset) || '1.0.0').replace(/^v/i, '')}
                        </p>
                      )}

                      {asset.description && !/^(language|theme)\s+pack:/i.test(String(asset.description).trim()) && (
                        <p className="text-[10px] text-[var(--subtext)] opacity-75 line-clamp-2 leading-relaxed mb-3">
                          {asset.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1 pb-3">
                        {marketTab === 'CHAMELEONS' && (() => {
                          const resolvedTheme = resolveThemePreviewData(asset);
                          const isDark = getLuminance(resolvedTheme?.bg || '#060b14') < 0.5;
                          return (
                            <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {isDark ? t("icon_dark_mode", "dark_mode") : t("icon_light_mode", "light_mode")}
                              </span>
                              <span>{isDark ? t("mode_dark", "Dark") : t("mode_light", "Light")}</span>
                            </div>
                          );
                        })()}

                        {marketTab === 'LEXICONS' && (
                          <>
                            <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_language", "language")}
                              </span>
                              <span>{asset.language || "English"}</span>
                            </div>
                            {asset.lexicon_type && (
                              <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                  {t("icon_translate", "translate")}
                                </span>
                                <span>{asset.lexicon_type}</span>
                              </div>
                            )}
                          </>
                        )}

                        {marketTab === 'BLUEPRINTS' && countBlueprintArtifacts(asset.json_data?.artifacts) > 0 && (
                          <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_account_tree", "account_tree")}
                            </span>
                            <span>
                              +{countBlueprintArtifacts(asset.json_data?.artifacts)} {t("badge_modules_count", "Modules")}
                            </span>
                          </div>
                        )}

                        {marketTab === 'TEMPLATES' && (() => {
                          const parsedTpl = (() => {
                            try {
                              const raw = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : (asset.json_data || asset);
                              return Array.isArray(raw) ? raw[0] || {} : raw || {};
                            } catch {
                              return {};
                            }
                          })();
                          const targetFile = String(parsedTpl?.target_file || asset.name || 'settings.cfg').split(/[\\/]/).pop();
                          return (
                            <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                {t("icon_tune", "tune")}
                              </span>
                              <span>{targetFile}</span>
                            </div>
                          );
                        })()}

                        {asset.is_early_access && (
                          <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_science", "science")}
                            </span>
                            <span>{t("badge_early_access", "Early Access")}</span>
                          </div>
                        )}

                        {asset.is_paid && (
                          <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                            <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                              {t("icon_monetization_on", "monetization_on")}
                            </span>
                            <span>{t("badge_paid", "Paid")}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10 pointer-events-auto">
                        <div className="flex items-center gap-2.5 text-[9px] font-bold text-[var(--subtext)] opacity-65 tracking-wider whitespace-nowrap min-w-0 truncate">
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined !text-[12px] opacity-75">{t("icon_calendar", "event")}</span>
                            {asset.created_at
                              ? new Date(asset.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                              : t("date_unknown", "Unknown Date")}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined !text-[12px] opacity-75">{t("icon_download", "download")}</span>
                            {asset.downloads || 0}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {(session?.user?.id &&
                            (String(asset.author_id || asset.mason_id || "") === String(session.user.id) ||
                              session?.user?.user_metadata?.username === asset.author) &&
                            (marketTab === 'BLUEPRINTS' || canPublishNexusAssets)) && (
                            <button
                              type="button"
                              onClick={(e) => handleEditAsset(e, asset)}
                              className="relative group/editbtn w-8 h-8 rounded-xl border flex items-center justify-center transition-all glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] cursor-pointer shrink-0"
                            >
                              <span className="material-symbols-outlined !text-[14px]">
                                {t("icon_edit", "edit")}
                              </span>
                              <HoverTooltip title={t("edit", "Edit")} className="group-hover/editbtn:flex z-[200]" />
                            </button>
                          )}
                          {(marketTab === 'CHAMELEONS' || marketTab === 'LEXICONS') && (() => {
                            const isPreviewingThis =
                              marketTab === 'CHAMELEONS'
                                ? String(previewThemeId || '') === String(asset.id)
                                : String(previewLexiconId || '') === String(asset.id);
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isPreviewingThis) {
                                    if (marketTab === 'CHAMELEONS') stopThemePreview();
                                    else stopLexiconPreview();
                                    onSetStatus(
                                      t(
                                        "status_preview_stopped",
                                        "Preview stopped — restored your active settings."
                                      )
                                    );
                                  } else {
                                    if (marketTab === 'CHAMELEONS') {
                                      startThemePreview(String(asset.id), asset.name, asset);
                                    } else {
                                      startLexiconPreview(String(asset.id), asset.name, asset);
                                    }
                                    onSetStatus(
                                      t(
                                        "status_previewing_asset",
                                        "Previewing {0} — click Stop Preview or Install when done."
                                      ).replace("{0}", asset.name || "")
                                    );
                                  }
                                }}
                                className={`relative group/prevbtn w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                                  isPreviewingThis
                                    ? 'sa-glass-active text-[var(--accent)]'
                                    : 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]'
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {isPreviewingThis
                                    ? t("icon_visibility_off", "visibility_off")
                                    : t("icon_visibility", "visibility")}
                                </span>
                                <HoverTooltip
                                  title={
                                    isPreviewingThis
                                      ? t("btn_stop_preview", "Stop Preview")
                                      : t("preview", "Preview")
                                  }
                                  className="group-hover/prevbtn:flex z-[200]"
                                />
                              </button>
                            );
                          })()}
                          {marketTab === 'BLUEPRINTS' ? (() => {
                            const isInstalledBp = playSets.some((p: any) => p.code && asset.json_data?.code && p.code === asset.json_data.code);
                            if (!isDesktop()) {
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    stageBlueprintToDraft(asset);
                                    onSetStatus(t("status_staging_blueprint_loaded", "Blueprint loaded into Payload Editor."));
                                    useStore.getState().setView('playsets');
                                  }}
                                  className="h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t("icon_phonelink", "phonelink")}
                                  </span>
                                  <span>{t("nexus_btn_stage_compact", "Stage to Desktop")}</span>
                                </button>
                              );
                            }
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBlueprint(asset);
                                }}
                                className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                                  isInstalledBp
                                    ? 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]'
                                    : 'glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)]'
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_download", "download")}
                                </span>
                                <span>
                                  {isInstalledBp ? t("btn_install_copy", "Install Copy") : t("update_panel_install", "Install")}
                                </span>
                              </button>
                            );
                          })() : (() => {
                            const assetTypeKey = marketTab === 'LEXICONS' ? 'lexicon' : marketTab === 'CHAMELEONS' ? 'chameleon' : 'workbench_template';
                            const assetStagingId = `asset_${assetTypeKey}_${asset.id}`;
                            const isAssetStaged = stagedModKeys.has(assetStagingId.toLowerCase());

                            if (!isDesktop()) {
                              if (marketTab === 'TEMPLATES') {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleModInStagingDraft({
                                        ...asset,
                                        asset_type: assetTypeKey,
                                        asset_id: asset.id,
                                      });
                                      onSetStatus(
                                        isAssetStaged
                                          ? t("status_staging_item_removed", "Removed from Remote Staging Queue.")
                                          : t("status_staging_item_added", "Added to Remote Staging Queue.")
                                      );
                                    }}
                                    className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                                      isAssetStaged
                                        ? 'sa-glass-active text-[var(--accent)]'
                                        : 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]'
                                    }`}
                                  >
                                    <span className="material-symbols-outlined !text-[14px]">
                                      {isAssetStaged ? t("icon_playlist_add_check", "playlist_add_check") : t("icon_playlist_add", "playlist_add")}
                                    </span>
                                    <span>
                                      {isAssetStaged ? t("staging_btn_staged", "Staged") : t("nexus_btn_stage_compact", "Stage to Desktop")}
                                    </span>
                                  </button>
                                );
                              }

                              // Web / Mobile PWA unified action for Lexicons & Chameleons: Apply locally AND stage to Desktop Queue
                              return (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (isAssetStaged) {
                                      toggleModInStagingDraft({
                                        ...asset,
                                        asset_type: assetTypeKey,
                                        asset_id: asset.id,
                                      });
                                      onSetStatus(t("status_staging_item_removed", "Removed from Remote Staging Queue."));
                                      return;
                                    }

                                    const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : (asset.json_data || {});
                                    if (marketTab === 'CHAMELEONS') {
                                      importTheme({
                                        ...parsedData,
                                        name: asset.name || parsedData.name || "Chameleon",
                                        version: asset.version || parsedData.version || '1.0.0',
                                        author: asset.author || parsedData.author || "Citizen",
                                        _meta_version: asset.version || parsedData._meta_version || '1.0.0',
                                      });
                                    } else {
                                      importLexicon(
                                        {
                                          ...parsedData,
                                          _meta_language: asset.language || "Custom",
                                          _meta_version: asset.version || '1.0.0',
                                        },
                                        asset.name
                                      );
                                    }

                                    toggleModInStagingDraft({
                                      ...asset,
                                      asset_type: assetTypeKey,
                                      asset_id: asset.id,
                                    });
                                    onSetStatus(t("status_staging_applied_and_queued", "Applied locally & added to Desktop Staging Queue."));

                                    try {
                                      await supabase.rpc('increment_asset_downloads', { asset_id: asset.id });
                                    } catch (err) {
                                      console.error("Could not increment downloads", err);
                                    }
                                    setAssetResultsMap(prev => {
                                      const newMap = { ...prev, [marketTab]: (prev[marketTab] || []).map(a => a.id === asset.id ? { ...a, downloads: (a.downloads || 0) + 1 } : a) };
                                      if (window.__sanctuaryCache!.nexus) window.__sanctuaryCache!.nexus.assetResultsMap = newMap;
                                      return newMap;
                                    });
                                  }}
                                  className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                                    isAssetStaged
                                      ? 'sa-glass-active text-[var(--accent)]'
                                      : 'glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)]'
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {isAssetStaged
                                      ? t("icon_playlist_add_check", "playlist_add_check")
                                      : isInstalled(asset) && isOutdated(asset)
                                        ? t("icon_update", "update")
                                        : t("icon_download", "download")}
                                  </span>
                                  <span>
                                    {isAssetStaged
                                      ? t("staging_btn_staged", "Staged")
                                      : isInstalled(asset) && isOutdated(asset)
                                        ? t("btn_update", "Update")
                                        : t("nexus_btn_stage_apply_compact", "Apply & Stage")}
                                  </span>
                                </button>
                              );
                            }

                            return (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (marketTab === 'CHAMELEONS') {
                                    const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : (asset.json_data || {});
                                    importTheme({
                                      ...parsedData,
                                      name: asset.name || parsedData.name || "Chameleon",
                                      version: asset.version || parsedData.version || '1.0.0',
                                      author: asset.author || parsedData.author || "Citizen",
                                      _meta_version: asset.version || parsedData._meta_version || '1.0.0',
                                    });
                                    onSetStatus(`Successfully Installed Theme: ${asset.name}`);
                                  } else if (marketTab === 'TEMPLATES') {
                                    const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                                    const versionToSave = getAssetDisplayVersion(asset);
                                    await importTemplate({ ...parsedData, version: versionToSave });
                                    setInstalledTemplates(prev => ({ ...prev, [asset.name]: versionToSave }));
                                    onSetStatus(`Successfully Installed Template: ${asset.name}`);
                                  } else {
                                    const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                                    importLexicon({ ...parsedData, _meta_language: asset.language || "Custom", _meta_version: asset.version || '1.0.0' }, asset.name);
                                    onSetStatus(`Successfully Installed Lexicon: ${asset.name}`);
                                  }
                                  try {
                                    await supabase.rpc('increment_asset_downloads', { asset_id: asset.id });
                                  } catch (e) { console.error("Could not increment downloads", e); }
                                  setAssetResultsMap(prev => {
                                    const newMap = { ...prev, [marketTab]: (prev[marketTab] || []).map(a => a.id === asset.id ? { ...a, downloads: (a.downloads || 0) + 1 } : a) };
                                    if (window.__sanctuaryCache!.nexus) window.__sanctuaryCache!.nexus.assetResultsMap = newMap;
                                    return newMap;
                                  });
                                }}
                                className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                                  isInstalled(asset) && !isOutdated(asset)
                                    ? 'glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]'
                                    : 'glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)]'
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {isInstalled(asset) ? (isOutdated(asset) ? t("icon_update", "update") : t("icon_refresh", "refresh")) : t("icon_download", "download")}
                                </span>
                                <span>
                                  {isInstalled(asset) ? (isOutdated(asset) ? t("btn_update", "Update") : t("btn_reinstall", "Reinstall")) : t("update_panel_install", "Install")}
                                </span>
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={
                    marketTab === 'BLUEPRINTS'
                      ? t("icon_map", "map")
                      : marketTab === 'TEMPLATES'
                        ? t("icon_draw", "draw")
                        : t("icon_palette", "palette")
                  }
                  title={
                    marketTab === 'CHAMELEONS'
                      ? t("empty_title_chameleons", "No {Chameleon} found.")
                      : marketTab === 'TEMPLATES'
                        ? t("empty_title_templates", "No Templates Found")
                        : marketTab === 'BLUEPRINTS'
                          ? t("bp_no_blueprints_found", "No {Blueprints} Found")
                          : t("empty_title_lexicons", "No {Lexicons} found.")
                  }
                  subtitle={t("empty_desc", "Everything in The {Nexus} is already in Your {Vault}.")}
                  className="col-span-full py-16"
                />
              )}
            </div>

            {assetTotalPages > 1 && !loadingAssets && (
              <div className="flex justify-center items-center gap-4 mt-4 mb-20">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-6 py-3 glass-surface rounded-xl font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-border-accent"
                >
                  {t("nav_prev", "PREV")}
                </button>
                <span className="text-[12px] font-black capitalize tracking-widest text-[var(--subtext)] px-4">
                  {currentPage} / {assetTotalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(assetTotalPages, p + 1))}
                  disabled={currentPage === assetTotalPages}
                  className="px-6 py-3 glass-surface rounded-xl font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-border-accent"
                >
                  {t("nav_next", "NEXT")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <MarketUploadPanel
        uploadState={uploadState}
        setUploadState={setUploadState}
        marketTab={marketTab}
        availableLanguages={availableLanguages}
        submitUpload={submitUpload}
      />

      <MarketReportPanel
        reportState={reportState}
        setReportState={setReportState}
        handleReportSubmit={handleReportSubmit}
      />
      <MarketBlueprintPanel
        selectedBlueprint={selectedBlueprint}
        setSelectedBlueprint={setSelectedBlueprint}
        onOpenDossier={onOpenDossier}
        cleanModName={cleanModName}
        syncBlueprintByCode={syncBlueprintByCode}
        onDownloadSuccess={(id: any) => setAssetResultsMap(prev => {
          const newMap = { ...prev, [marketTab]: (prev[marketTab] || []).map(a => a.id === id ? { ...a, downloads: (a.downloads || 0) + 1 } : a) };
          if (window.__sanctuaryCache!.nexus) window.__sanctuaryCache!.nexus.assetResultsMap = newMap;
          return newMap;
        })}
      />

      {matrixBlueprintAsset && (
        <BlueprintMatrix
          isOpen={true}
          onClose={() => setMatrixBlueprintAsset(null)}
          playSet={{
            ...matrixBlueprintAsset.json_data,
            mods: matrixBlueprintAsset.json_data?.artifacts?.map((a: any) => a.name) || matrixBlueprintAsset.json_data?.mods || [],
            name: matrixBlueprintAsset.name,
            code: matrixBlueprintAsset.json_data?.code || matrixBlueprintAsset.code
          }}
          modList={useStore.getState().modList}
          onUpload={async (isPublic: boolean, _isLocked: boolean, _allowedMods: any[], isMarketListed: boolean) => {
            try {
              const { error } = await supabase.from('blueprints').update({
                is_public: isPublic,
                is_locked: false,
                is_market_listed: isPublic ? isMarketListed : false
              }).eq('id', matrixBlueprintAsset.id);
              if (error) throw error;
              fetchNexusAssets();
              return matrixBlueprintAsset.json_data?.code || matrixBlueprintAsset.code || "UPDATED";
            } catch (err) {
              console.error(err);
              return null;
            }
          }}
          onUpdatePlaySet={() => { }}
        />
      )}

      {previewAsset && (
        <AssetPreviewSidebar
          assetType={previewAsset.type}
          assetId={previewAsset.id}
          onClose={() => setPreviewAsset(null)}
        />
      )}
    </>
  );
}




