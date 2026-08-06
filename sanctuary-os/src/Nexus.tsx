import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { ViewHeader, CustomDropdown, HubTabButton, standardButtonClass, standardAccentGlassButtonClass, standardDangerButtonClass, getFileLabel, isSupportedExtension, formatDisplayName, getExtensionRegex, getModIcon, compareVersions, cleanSearchName, ActionButton, enrichBlueprintsWithPremiumStatus, FilterTabs } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { MarketUploadPanel, MarketReportPanel, MarketBlueprintPanel } from './side-panels/NexusSidePanels';
import { useTheme } from "./ThemeContext";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir } from "@tauri-apps/api/path";
import { invoke } from '@tauri-apps/api/core';
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import BlueprintMatrix from "./BlueprintMatrix";
import { CommandScreenLayout, CommandScreenSectionHeading, CommandScreenStats, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, DashboardStatTile, CommandScreenQuickLink } from "./hub-components/SharedCommandScreenLayout";

let cachedNexusItems: any[] | null = null;
let lastNexusFetch = 0;
const CACHE_TTL = 1000 * 60 * 5;

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
  if (getFileLabel(filename, activeSchema) === "SCRIPT") {
    ext = "SCRIPT";
    name = filename.substring(0, filename.length - 10);
  } else if (getFileLabel(filename, activeSchema) === "PACKAGE") {
    name = filename.substring(0, filename.length - 8);
  } else if (filename.includes('.')) {
    const splitExt = filename.split('.');
    ext = splitExt[splitExt.length - 1].toUpperCase();
    name = splitExt.slice(0, -1).join('.');
  }
  return { name: name.replace(/_/g, ' '), ext };
};

const getSearchUrl = (mod: any) => {
  return `https://www.google.com/search?q=${encodeURIComponent(cleanSearchName(mod.name || mod.displayName, useStore.getState().activeGameSchema) + ' ' + (useStore.getState().activeGameSchema?.display_name || "Game") + ' mod')}`;
};

export default function Nexus({ ownedHashes, onSetStatus, onOpenMasonProfile, onOpenDossier, syncBlueprintByCode }: NexusProps) {
  const activeGameSchema = useStore(state => state.activeGameSchema);
  const { t, importLexicon, registry } = useLexicon();
  const session = useStore((state) => state.session);
  const marketTab = useStore(state => state.marketTab);
  const setMarketTab = useStore(state => state.setMarketTab);
  const selectedVersion = useStore(state => state.selectedVersion);
  const showImages = useStore(state => state.showImages);
  const marketSearchQuery = useStore(state => state.marketSearchQuery);
  const setMarketSearchQuery = useStore(state => state.setMarketSearchQuery);
  const ownedDLC = useStore(state => state.ownedDLC) || [];
  const maskedDLC = useStore(state => state.maskedDLC) || [];
  const playSets = useStore(state => state.playSets) || [];
  const { importTheme, CORE_THEMES, customThemes } = useTheme();
  const [assetResults, setAssetResults] = useState<any[]>([]);
  const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);
  const [previewAsset, setPreviewAsset] = useState<{ id: string, type: string } | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [gameVersions, setGameVersions] = useState<any[]>([]);
  const [installedTemplates, setInstalledTemplates] = useState<Record<string, string>>({});
  const [selectedGameVersion, setSelectedGameVersion] = useState<string>(selectedVersion || "all");
  const [dlcFilter, setDlcFilter] = useState<string>("all");
  const [dlcRegistry, setDlcRegistry] = useState<any[]>([]);
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
    language: 'English',
    newLanguage: '',
    lexiconType: 'Theme',
    themeMode: 'Dark'
  });

  const [reportState, setReportState] = useState({
    isOpen: false,
    assetId: null as string | number | null,
    assetType: null as string | null,
    reason: ''
  });

  const [matrixBlueprintAsset, setMatrixBlueprintAsset] = useState<any>(null);

  const [isOffline, setIsOffline] = useState(!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true");

  const [stats, setStats] = useState({ artifacts: 0, blueprints: 0, lexicons: 0, chameleons: 0, templates: 0 });
  const [recentFeed, setRecentFeed] = useState<any[]>([]);

  useEffect(() => {
    if (marketSearchQuery) {
      setSearchQuery(marketSearchQuery);
      setAssetSearchQuery(marketSearchQuery);
    }
  }, [marketSearchQuery]);

  useEffect(() => {
    if (marketTab === 'HOME' && !isOffline) {
      const fetchHomeData = async () => {
        try {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const isoDate = thirtyDaysAgo.toISOString();

          const [
            { count: artifactsCount },
            { count: blueprintsCount },
            { count: lexiconsCount },
            { count: chameleonsCount },
            { count: templatesCount }
          ] = await Promise.all([
            supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 0),
            supabase.from('blueprints').select('*', { count: 'exact', head: true }).eq('is_public', true),
            supabase.from('nexus_assets').select('*', { count: 'exact', head: true }).eq('asset_type', 'lexicon').or('is_public.eq.true,is_public.is.null'),
            supabase.from('nexus_assets').select('*', { count: 'exact', head: true }).eq('asset_type', 'chameleon').or('is_public.eq.true,is_public.is.null'),
            supabase.from('nexus_assets').select('*', { count: 'exact', head: true }).eq('asset_type', 'workbench_template').or('is_public.eq.true,is_public.is.null')
          ]);

          setStats({
            artifacts: artifactsCount || 0,
            blueprints: blueprintsCount || 0,
            lexicons: lexiconsCount || 0,
            chameleons: chameleonsCount || 0,
            templates: templatesCount || 0
          });

          const [
            { data: recentMods },
            { data: recentBps },
            { data: recentAssets }
          ] = await Promise.all([
            supabase.from('mods').select('*').order('created_at', { ascending: false }).limit(20),
            supabase.from('blueprints').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(20),
            supabase.from('nexus_assets').select('*').order('created_at', { ascending: false }).limit(20)
          ]);

          const combined = [
            ...(recentMods || []).map(m => ({ ...m, feed_type: 'artifact' })),
            ...(recentBps || []).map(b => ({ ...b, feed_type: 'blueprint' })),
            ...(recentAssets || []).map(a => ({ ...a, feed_type: a.asset_type === 'workbench_template' ? 'template' : a.asset_type }))
          ];

          combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setRecentFeed(combined.slice(0, 20));
        } catch (err) {
          console.error("Failed to fetch home data:", err);
        }
      };
      fetchHomeData();
    }
  }, [marketTab, isOffline]);

  useEffect(() => {
    const fetchLocalTemplates = async () => {
      try {
        const config: any = await invoke('get_saved_coordinates');
        const vaultPath = config.vault_path;
        if (!vaultPath) return;
        const templatesDir = `${vaultPath}\\Data\\Templates`;
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
    if (marketTab === 'MODS') {
      if (gameVersions.length > 0) fetchNexus();
    } else {
      fetchNexusAssets();
    }
  }, [marketTab, gameVersions, selectedGameVersion, hidePaid, hideEarlyAccess]);

  useEffect(() => {
    if (marketSearchQuery) {
      if (marketTab === 'MODS') {
        setSearchQuery(marketSearchQuery);
      } else {
        setAssetSearchQuery(marketSearchQuery);
      }
    }
  }, [marketSearchQuery]);

  async function fetchNexusAssets() {
    if (isOffline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (marketTab === 'BLUEPRINTS') {
        let query = supabase
          .from('blueprints')
          .select('*')
          .eq('is_market_listed', true)
          .order('created_at', { ascending: false });

        if (selectedGameVersion && selectedGameVersion !== 'ALL' && selectedGameVersion !== 'all') {
          query = query.eq('game_version', selectedGameVersion);
        }

        const { data, error } = await query;
        if (error) throw error;

        let premiumMap: Record<string, any> = {};
        if (data && data.length > 0) {
          premiumMap = await enrichBlueprintsWithPremiumStatus(supabase, data);
        }

        const { data: masonData } = await supabase.from('masons').select('id, name');
        if (masonData) {
          setMasonMap(masonData.reduce((acc: any, m: any) => { acc[m.name.toLowerCase()] = m.id; return acc; }, {}));
        }

        setAssetResults(data?.map(b => {
          let parsedData = b.json_data;
          if (typeof b.json_data === 'string') {
            try { parsedData = JSON.parse(b.json_data); } catch { }
          }
          const artifacts = parsedData?.artifacts || b.artifacts || [];
          const premiumInfo = premiumMap[b.id];
          const isPaid = premiumInfo?.is_paid || b.is_paid || artifacts.some((a: any) => a.is_paid);
          const isEarlyAccess = premiumInfo?.is_early_access || b.is_early_access || artifacts.some((a: any) => a.is_early_access);
          return {
            id: b.id,
            name: parsedData?.name || b.name,
            author: masonData?.find((m: any) => m.id === b.mason_id)?.name || "Citizen",
            description: (artifacts.length || 0) + " " + (t("items")),
            created_at: b.created_at,
            asset_type: 'blueprint',
            is_paid: isPaid,
            is_early_access: isEarlyAccess,
            downloads: b.downloads,
            json_data: parsedData || b
          };
        }) || []);
      } else {
        let query = supabase
          .from('nexus_assets')
          .select('*')
          .eq('asset_type', marketTab === 'CHAMELEONS' ? 'chameleon' : marketTab === 'TEMPLATES' ? 'workbench_template' : 'lexicon')
          .or('is_public.eq.true,is_public.is.null')
          .order('created_at', { ascending: false });

        if (hidePaid) {
          query = query.or('is_paid.is.null,is_paid.eq.false');
        }
        if (hideEarlyAccess) {
          query = query.or('is_early_access.is.null,is_early_access.eq.false');
        }

        const { data, error } = await query;
        if (error) throw error;
        setAssetResults(data || []);

        const { data: masonData } = await supabase.from('masons').select('id, name');
        if (masonData) {
          setMasonMap(masonData.reduce((acc: any, m: any) => { acc[m.name.toLowerCase()] = m.id; return acc; }, {}));
        }

        if (marketTab === 'LEXICONS' || marketTab === 'TEMPLATES') {
          const dbLangs = data?.map(d => d.language).filter(Boolean) || [];
          const commonLangs = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Russian", "Japanese", "Korean", "Chinese"];
          const langs = Array.from(new Set([...commonLangs, ...dbLangs])) as string[];
          setAvailableLanguages(langs);
        }
      }
    } catch (err) {
      console.error('Asset fetch error:', err);
      setAssetResults([]);
    } finally {
      setLoading(false);
    }
  }

  const handleUploadAsset = async () => {
    try {
      if (session?.user?.id) {
        const { data: profileData } = await supabase.from('user_profiles').select('allow_upload').eq('id', session.user.id).maybeSingle();
        if (profileData && profileData.allow_upload === false) {
          useStore.getState().pushStatus(t("upload_banned"));
          return;
        }
      }

      setUploadState({
        isOpen: true,
        isEdit: false,
        editId: null,
        fileContent: null,
        fileName: '',
        name: '',
        version: '1.0.0',
        description: '',
        language: availableLanguages.length > 0 ? availableLanguages[0] : 'English',
        newLanguage: '',
        lexiconType: 'Theme',
        themeMode: 'Dark'
      });
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleEditAsset = (e: React.MouseEvent, asset: any) => {
    e.stopPropagation();
    if (marketTab === 'BLUEPRINTS') {
      setMatrixBlueprintAsset(asset);
      return;
    }
    setUploadState({
      isOpen: true,
      isEdit: true,
      editId: asset.id,
      fileContent: typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data,
      fileName: asset.name,
      name: asset.name,
      version: asset.version || '1.0.0',
      description: asset.description || '',
      language: asset.language || (availableLanguages.length > 0 ? availableLanguages[0] : 'English'),
      newLanguage: '',
      lexiconType: asset.lexicon_type || 'Theme',
      themeMode: asset.theme_mode || 'Dark'
    });
  };

  const submitUpload = async () => {
    try {
      const finalLanguage = uploadState.language === 'add_new' ? uploadState.newLanguage : uploadState.language;
      const finalContent = { ...uploadState.fileContent, version: uploadState.version, _meta_version: uploadState.version };
      const payload = {
        asset_type: marketTab === 'CHAMELEONS' ? 'chameleon' : marketTab === 'TEMPLATES' ? 'workbench_template' : 'lexicon',
        name: uploadState.name,
        version: uploadState.version,
        author: session?.user?.user_metadata?.username || 'Citizen',
        description: uploadState.description,
        json_data: finalContent,
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
    if (!reportState.assetId || !reportState.reason.trim()) return;
    try {
      if (reportState.assetType === 'blueprint') {
        const { error } = await supabase.from('blueprint_reports').insert([{
          blueprint_id: reportState.assetId,
          reporter_name: session?.user?.user_metadata?.username || 'Anonymous',
          reason: reportState.reason.trim(),
          status: 'pending'
        }]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('nexus_reports').insert([{
          asset_id: reportState.assetId,
          reporter_name: session?.user?.user_metadata?.username || 'Anonymous',
          reason: reportState.reason.trim(),
          status: 'pending'
        }]);
        if (error) throw error;
      }
      onSetStatus("Report submitted successfully.");
    } catch (err: any) {
      console.error(err);
      onSetStatus(`Report failed: ${err.message}`);
    }
    setReportState({ isOpen: false, assetId: null, assetType: null, reason: '' });
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
    try {
      const config: any = await invoke('get_saved_coordinates');
      const vaultPath = config.vault_path;
      if (!vaultPath) throw new Error("Vault path not configured.");

      let parsed = typeof templateJson === 'string' ? JSON.parse(templateJson) : templateJson;
      const displayData = Array.isArray(parsed) ? parsed[0] : parsed;
      const templateId = displayData?.template_id || "vlocal";

      const templatesDir = `${vaultPath}\\Data\\Templates`;
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

  async function fetchNexus(forceRefresh = false) {
    if (isOffline) {
      setLoading(false);
      return;
    }
    if (!forceRefresh && cachedNexusItems && (performance.now() - lastNexusFetch < CACHE_TTL)) {
      setResults(cachedNexusItems);
      setCurrentPage(1);
      return;
    }

    setLoading(true);
    const startFetch = performance.now();
    try {
      const { count, error: countError } = await supabase
        .from("mods")
        .select("id", { count: "exact", head: true });

      if (countError) throw countError;

      const BATCH_SIZE = 1000;
      const pages = Math.ceil((count || 0) / BATCH_SIZE);
      const modsPromises = [];

      for (let i = 0; i < pages; i++) {
        modsPromises.push(
          supabase
            .from("mods")
            .select("id, name, created_at, category_override, master_author, compliance_tier, image_url, description, url, compatible_versions, requiredDLC, is_official, status, status_reason, is_paid, is_early_access, mod_versions(dna_hash, version_label), masons(id, name)")
            .range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
        );
      }

      const [
        modsResultsArray,
        flavorGroupsRes,
        collectionsRes,
        relationshipsRes,
        flavorMembersRes,
        setMembersRes
      ] = await Promise.all([
        Promise.all(modsPromises),
        supabase.from("flavor_groups").select("*"),
        supabase.from("collections").select("*"),
        supabase.from("mod_relationships").select("parent_id, child_id, relationship_type").in("relationship_type", ["twin", "addon", "flavor", "set_item", "beta"]),
        supabase.from("flavor_group_members").select("group_id, mod_hash"),
        supabase.from("collection_members").select("set_id, mod_id")
      ]);

      let allMods: any[] = [];
      for (const res of modsResultsArray) {
        if (res.error) throw res.error;
        if (res.data) allMods = [...allMods, ...res.data];
      }

      const modsData = allMods;
      const midFetch = performance.now();

      const flavorGroups = flavorGroupsRes.data;
      const collections = collectionsRes.data;
      const relationships = relationshipsRes.data;
      const allFlavorMembers = flavorMembersRes.data;
      const allSetMembers = setMembersRes.data;

      let allItems: any[] = [];

      const modsById = new Map<string, any>();
      if (modsData) {
        modsData.forEach((mod: any) => {
          if (mod.compliance_tier > 0) return;
          modsById.set(String(mod.id), mod);
        });
      }

      const familyMap = new Map<string, Set<string>>();
      const processedMods = new Set<string>();

      if (relationships) {
        relationships.forEach((rel: any) => {
          const parentId = String(rel.parent_id);
          const childId = String(rel.child_id);

          if (modsById.has(parentId) && modsById.has(childId)) {
            if (!familyMap.has(parentId)) {
              familyMap.set(parentId, new Set([parentId]));
            }
            familyMap.get(parentId)!.add(childId);
          }
        });

        familyMap.forEach((memberIds, parentId) => {
          if (memberIds.size > 1) {
            const members = Array.from(memberIds)
              .map(id => modsById.get(id))
              .filter(Boolean);

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

      if (flavorGroups) {
        const membersByGroup = new Map<string, any[]>();
        if (allFlavorMembers) {
          for (const fm of allFlavorMembers) {
            if (!membersByGroup.has(fm.group_id)) membersByGroup.set(fm.group_id, []);
            membersByGroup.get(fm.group_id)!.push(fm);
          }
        }

        for (const group of flavorGroups) {
          const flavorMembers = membersByGroup.get(group.id) || [];

          const members: any[] = [];
          const memberIds = new Set<string>();

          if (flavorMembers.length > 0) {
            for (const fm of flavorMembers) {
              for (const [modId, mod] of modsById.entries()) {
                if (mod.mod_versions?.some((v: any) => v.dna_hash === fm.mod_hash)) {
                  if (!memberIds.has(modId)) {
                    members.push(mod);
                    memberIds.add(modId);
                    processedMods.add(modId);
                  }
                  break;
                }
              }
            }
          }

          if (members.length > 0) {
            allItems.push({
              id: `flavor_${group.id}`,
              name: group.name,
              category_override: "Exclusives",
              image_url: group.image_url || null,
              master_author: "Flavor Group",
              description: null,
              created_at: group.created_at,
              isFlavorGroup: true,
              flavorGroupId: group.id,
              flavors: members,
              familyCount: members.length,
              isVirtual: true,
              isParent: true
            });
          }
        }
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
            allItems.push({
              id: `ccset_${set.id}`,
              name: set.name,
              category_override: "Collection",
              image_url: set.image_url || null,
              master_author: set.creator_name || "Unknown Creator",
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

            if (itemVersions.length > existingVersions.length) {
              nameMap.set(name, { ...item, compatible_versions: mergedVersions });
            } else {
              nameMap.set(name, { ...existing, compatible_versions: mergedVersions });
            }
          }
        }
      });

      cachedNexusItems = Array.from(nameMap.values());
      lastNexusFetch = performance.now();

      setResults(cachedNexusItems);
      setCurrentPage(1);
    } catch (err: any) {
      console.error("Nexus error:", err);
      onSetStatus(`${t("error_prefix")}${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(() => [t("ql_all"), ...Array.from(new Set(results.map((m: any) => m.category_override || "Uncategorized").filter(Boolean)))], [results, t]);

  const ownedHashesSet = useMemo(() => new Set(ownedHashes), [ownedHashes]);
  const filteredResults = useMemo(() => {
    let filtered = results.filter((mod: any) => {
      const modName = (mod.name || "").toLowerCase().trim();
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

      const matchesCategory = categoryFilter === (t("ql_all")) ||
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
    let filtered = assetResults.filter((asset: any) => {
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

      return matchesSearch && matchesLang && matchesType && matchesMode && matchesPaid && matchesEA && matchesDLC && matchesInstalled;
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
  }, [assetResults, assetSearchQuery, marketTab, hidePaid, hideEarlyAccess, hideMissingDLC, hideInstalled, playSets, ownedDLC, maskedDLC, languageFilter, lexiconTypeFilter, themeModeFilter, assetSortBy, isOutdated]);

  const assetTotalPages = Math.max(1, Math.ceil(filteredAssetResults.length / itemsPerPage));
  const assetPaginatedResults = useMemo(() => filteredAssetResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredAssetResults, currentPage, itemsPerPage]);

  if (isOffline) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-300 gap-6">
        <span className="material-symbols-outlined !text-[6rem] opacity-20 text-[var(--text)] drop-shadow-lg">wifi_off</span>
        <h2 className="text-2xl font-black uppercase tracking-[0.2em] opacity-50">{t("offline_mode_title")}</h2>
        <p className="text-xs font-bold uppercase tracking-widest opacity-40 text-center max-w-md">{t("offline_mode_desc")}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-8 py-4 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-xl hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 text-[10px] font-black uppercase tracking-widest group"
        >
          <span className="material-symbols-outlined !text-lg opacity-60 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-500">refresh</span>
          {t("offline_mode_refresh")}
        </button>
      </div>
    );
  }

  const viewFilterOptions = useMemo(() => [
    { id: "hide_installed", label: <span className="flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">download_done</span> {t("filter_hide_installed") || "Hide Installed"}</span> },
    { id: "hide_paid", label: <span className="flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">monetization_on</span> {t("filter_hide_paid") || "Hide Paid"}</span> },
    { id: "hide_ea", label: <span className="flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">science</span> {t("filter_hide_early_access") || "Hide Early Access"}</span> },
    { id: "hide_missing_dlc", label: <span className="flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">extension</span> {t("filter_hide_dlc") || "Hide Missing DLC"}</span> }
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



  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader
        title={t("market_title")}
        subtitle={`${t("subtitle_suffix")}`}
        icon={t("icon_hub")}
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
        <ActionButton
          icon={t("icon_refresh") || "refresh"}
          label={t("ui_btn_refresh") || "Refresh"}
          onClick={() => {
            if (marketTab === 'MODS') fetchNexus(true);
            else fetchNexusAssets();
          }}
          className="h-12 px-6"
        />
      </ViewHeader>

      <div className="flex flex-col">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 mb-6 w-full">
          <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
            {['HOME', 'MODS', 'BLUEPRINTS', 'LEXICONS', 'CHAMELEONS', 'TEMPLATES'].map((tab) => (
              <HubTabButton
                key={tab}
                id={tab}
                activeTab={marketTab}
                setTab={setMarketTab}
                label={tab === 'HOME' ? t('tab_overview') || 'Overview' : t(`tab_${tab.toLowerCase()}`) || tab}
                icon={tab === 'HOME' ? 'dashboard' : tab === 'MODS' ? "extension" : tab === 'BLUEPRINTS' ? "map" : tab === 'LEXICONS' ? "translate" : tab === 'TEMPLATES' ? "draw" : "palette"}
              />
            ))}
          </div>
        </div>

        {marketTab === 'HOME' ? (
          <CommandScreenLayout>
            <CommandScreenStats>
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">extension</span>} number={stats.artifacts} label={t("tab_mods") || "Artifacts"} colorClass="border-cyan-500/30 text-cyan-400 hover:border-cyan-500/60 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.05)]" onClick={() => setMarketTab('MODS')} />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">map</span>} number={stats.blueprints} label={t("tab_blueprints") || "Blueprints"} colorClass="border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] cursor-pointer" onClick={() => setMarketTab('BLUEPRINTS')} />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">translate</span>} number={stats.lexicons} label={t("tab_lexicons") || "Lexicons"} colorClass="border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] hover:border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] cursor-pointer" onClick={() => setMarketTab('LEXICONS')} />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">palette</span>} number={stats.chameleons} label={t("tab_chameleons") || "Chameleons"} colorClass="border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] cursor-pointer" onClick={() => setMarketTab('CHAMELEONS')} />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">draw</span>} number={stats.templates} label={t("tab_templates") || "Templates"} colorClass="border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] cursor-pointer" onClick={() => setMarketTab('TEMPLATES')} />
            </CommandScreenStats>

            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading
                    title={t("recent_activity") || "RECENT ACTIVITY"}
                    icon="history"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                    {recentFeed.length > 0 ? recentFeed.map(item => (
                      <div key={`${item.feed_type}-${item.id}`} className="theme-glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4 hover:bg-white/5 hover:border-white/10 transition-colors cursor-pointer group shadow-lg" onClick={() => {
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
                      }}>
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)]">
                            <span className="material-symbols-outlined !text-[28px]">
                              {item.feed_type === 'artifact' ? 'extension' : item.feed_type === 'blueprint' ? 'map' : item.feed_type === 'lexicon' ? 'translate' : item.feed_type === 'template' ? 'draw' : 'palette'}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[12px] font-black text-[var(--text)] truncate uppercase tracking-widest">{item.name || item.title}</span>
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1">BY {item.author || "Citizen"} • {new Date(item.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="theme-glass-panel p-8 rounded-2xl border border-white/5 border-dashed flex flex-col items-center justify-center gap-3 text-center opacity-70">
                        <span className="material-symbols-outlined !text-4xl text-[var(--subtext)]">history</span>
                        <span className="text-xs font-black uppercase tracking-widest text-[var(--subtext)]">{t("no_recent_activity") || "NO RECENT ACTIVITY FOUND"}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("wf_quick_links") || "QUICK LINKS"} icon="bolt">
                <div className="flex flex-col gap-4">
                  <CommandScreenQuickLink
                    icon="extension"
                    title={t("tab_mods") || "Artifacts"}
                    subtitle={`${t("btn_browse") || "BROWSE"} ${t("ql_all") || "ALL"} ${stats.artifacts} ${t("tab_mods") || "ARTIFACTS"}`}
                    onClick={() => setMarketTab('MODS')}
                    textColorClass="text-emerald-500"
                    hoverTextColorClass="group-hover:text-emerald-400"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)] text-emerald-500"
                    iconBorderHoverClass="group-hover:border-emerald-500/30"
                  />
                  <CommandScreenQuickLink
                    icon="map"
                    title={t("tab_blueprints") || "Blueprints"}
                    subtitle={`${t("btn_browse") || "BROWSE"} ${t("ql_all") || "ALL"} ${stats.blueprints} ${t("tab_blueprints") || "BLUEPRINTS"}`}
                    onClick={() => setMarketTab('BLUEPRINTS')}
                    textColorClass="text-blue-500"
                    hoverTextColorClass="group-hover:text-blue-400"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] text-blue-500"
                    iconBorderHoverClass="group-hover:border-blue-500/30"
                  />
                  <CommandScreenQuickLink
                    icon="translate"
                    title={t("tab_lexicons") || "Lexicons"}
                    subtitle={`${t("btn_browse") || "BROWSE"} ${t("ql_all") || "ALL"} ${stats.lexicons} ${t("tab_lexicons") || "LEXICONS"}`}
                    onClick={() => setMarketTab('LEXICONS')}
                    textColorClass="text-purple-500"
                    hoverTextColorClass="group-hover:text-purple-400"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(168,85,247,0.5)] text-purple-500"
                    iconBorderHoverClass="group-hover:border-purple-500/30"
                  />
                  <CommandScreenQuickLink
                    icon="palette"
                    title={t("tab_chameleons") || "Chameleons"}
                    subtitle={`${t("btn_browse") || "BROWSE"} ${t("ql_all") || "ALL"} ${stats.chameleons} ${t("tab_chameleons") || "CHAMELEONS"}`}
                    onClick={() => setMarketTab('CHAMELEONS')}
                    textColorClass="text-rose-500"
                    hoverTextColorClass="group-hover:text-rose-400"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(244,63,94,0.5)] text-rose-500"
                    iconBorderHoverClass="group-hover:border-rose-500/30"
                  />
                  <CommandScreenQuickLink
                    icon="draw"
                    title={t("tab_templates") || "Templates"}
                    subtitle={`${t("btn_browse") || "BROWSE"} ${t("ql_all") || "ALL"} ${stats.templates} ${t("tab_templates") || "TEMPLATES"}`}
                    onClick={() => setMarketTab('TEMPLATES')}
                    textColorClass="text-amber-500"
                    hoverTextColorClass="group-hover:text-amber-400"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] text-amber-500"
                    iconBorderHoverClass="group-hover:border-amber-500/30"
                  />
                </div>
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        ) : marketTab === 'MODS' ? (
          <>
            <div className="flex flex-col xl:flex-row xl:items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full mb-8 relative z-20 animate-in slide-in-from-top-4 duration-500">
              <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] hidden xl:flex items-center gap-3 shrink-0">
                <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">extension</span>
                </div>
                <span className="truncate">{t("tab_mods") || "ARTIFACTS"}</span>
              </h2>

              <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
                <div className="relative flex-1 min-w-[200px] w-full xl:max-w-[300px]">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
                  <input
                    type="text"
                    placeholder={t("search_placeholder")}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(""); setCurrentPage(1); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
                      <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
                    </button>
                  )}
                </div>

                <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[51] h-12">
                  <CustomDropdown disableTint={true}
                    value={selectedGameVersion}
                    onChange={(val: string[]) => {
                      setSelectedGameVersion(val[0]);
                      setCurrentPage(1);
                    }}
                    options={[
                      { id: "all", label: "ALL VERSIONS" },
                      ...(selectedGameVersion !== "all" && !gameVersions.includes(selectedGameVersion) ? [{ id: selectedGameVersion, label: selectedGameVersion }] : []),
                      ...gameVersions.map(v => ({ id: v, label: v }))
                    ]}
                  />
                </div>

                <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[50] h-12">
                  <CustomDropdown disableTint={true}
                    value={sortBy}
                    onChange={(val: string[]) => setSortBy(val[0])}
                    options={[
                      { id: "newest", label: t("sort_newest") },
                      { id: "oldest", label: t("sort_oldest") },
                      { id: "name", label: t("sort_name") },
                      { id: "author", label: t("sort_author") }
                    ]}
                  />
                </div>

                <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[49] h-12">
                  <CustomDropdown disableTint={true}
                    value={categoryFilter}
                    onChange={(val: string[]) => {
                      setCategoryFilter(val[0]);
                      setCurrentPage(1);
                    }}
                    options={[
                      { id: "ALL", label: "ALL CATEGORIES" },
                      ...categories.filter(c => c !== "ALL").map(cat => ({ id: cat, label: cat }))
                    ]}
                  />
                </div>

                {(marketTab === 'MODS' || marketTab === 'BLUEPRINTS') && (
                  <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[48] h-12">
                    <CustomDropdown
                      disableTint={true}
                      multiSelect={true}
                      placeholder={t("filter_view_options") || "View Options"}
                      value={activeViewFilters}
                      selectedValues={activeViewFilters}
                      onChange={handleViewFiltersChange}
                      options={viewFilterOptions.filter(o => o.id !== 'hide_installed')}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-8 mt-6">
              {loading ? (
                <div className="col-span-full py-20 text-center opacity-50 font-black uppercase tracking-widest animate-pulse">
                  {t("searching")}
                </div>
              ) : paginatedResults.length > 0 ? (
                <>
                  {paginatedResults.map((mod: any, index: number) => (
                    <div
                      key={mod.id || `${mod.name}_${index}`}
                      onClick={() => onOpenDossier && onOpenDossier({ ...mod, isNexusView: true })}
                      className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group"
                    >
                      <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                        {(showImages !== false && mod.image_url) ? (
                          <img
                            src={mod.image_url}
                            alt={mod.name}
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>
                            {getModIcon(mod, useStore.getState().activeGameSchema, t)}
                          </span>
                        )}

                        <div className="absolute top-4 left-4 z-30 pointer-events-auto">
                          <div className={`backdrop-blur-[3px] border px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 transition-all ${mod.status === 'verified' ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)]' : 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]'}`}>

                            <span className={`text-[8px] font-black uppercase tracking-widest ${mod.status === 'verified' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                              {(mod.status || 'UNVERIFIED').replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>

                        <div className="absolute top-4 right-4 flex gap-2 z-30">
                          <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[3px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">
                            {mod.category_override || t("label_artifact") || "MOD"}
                          </span>
                        </div>

                        {(mod.isVirtual || mod.isParent || mod.familyCount > 1) && (
                          <div className="absolute bottom-3 left-3 z-30 pointer-events-auto group/badge">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-lg transition-all group-hover/badge:bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)] drop-shadow-sm">{t("icon_layers")}</span>
                              <span className="text-[9px] font-black text-[var(--text)] uppercase tracking-widest drop-shadow-sm">
                                {mod.familyCount || (mod.flavors?.length || 0)} {t("items")}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="absolute bottom-3 right-3 flex items-center gap-2 z-30 pointer-events-auto">
                          {mod.is_early_access && (
                            <div className="backdrop-blur-md bg-purple-500/10 border border-purple-500/30 px-2 py-1 rounded-lg shadow-2xl flex items-center gap-1">
                              <span className="material-symbols-outlined !text-[10px] text-purple-500">science</span>
                              <span className="text-[7px] font-black uppercase tracking-widest text-purple-500">{t("badge_early_access") || "Early Access"}</span>
                            </div>
                          )}
                          {mod.is_paid && (
                            <div className="backdrop-blur-md bg-yellow-500/10 border border-yellow-500/30 px-2 py-1 rounded-lg shadow-2xl flex items-center gap-1">
                              <span className="material-symbols-outlined !text-[10px] text-yellow-500">monetization_on</span>
                              <span className="text-[7px] font-black uppercase tracking-widest text-yellow-500">{t("badge_paid") || "Paid"}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-5 flex flex-col flex-1">
                        <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                          {cleanModName(mod.name || mod.id).name}
                        </h3>
                        <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                          {mod.master_author || t("unknown_mason") || "Unknown Creator"}{(mod.latest_version) ? ` • ${mod.latest_version}` : ""}
                        </p>
                        {mod.description && (
                          <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                            {mod.description}
                          </p>
                        )}

                        <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                          <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                            {mod.created_at ? new Date(mod.created_at).toLocaleDateString() : t("date_unknown")}
                          </span>
                          <span className="text-[10px] font-black theme-text-accent uppercase opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">{t("btn_view")} &rarr;</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="col-span-full py-20 text-center opacity-50 flex flex-col items-center justify-center">
                  <div className="w-24 h-24 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-50">{t("icon_hub")}</span>
                  </div>
                  <p className="font-black uppercase tracking-widest text-xl mb-2">{t("empty_title")}</p>
                  <p className="text-[10px] text-[var(--subtext)] opacity-60 mt-2">{t("empty_desc")}</p>
                </div>
              )}
            </div>

            {totalPages > 1 && !loading && (
              <div className="flex justify-center items-center gap-4 mt-4 mb-20">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent"
                >
                  {t("nav_prev")}
                </button>
                <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent"
                >
                  {t("nav_next")}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col">
            <div className="flex flex-col xl:flex-row xl:items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full mb-8 relative z-20 animate-in slide-in-from-top-4 duration-500">
              <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] hidden xl:flex items-center gap-3 shrink-0">
                <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">
                    {marketTab === 'BLUEPRINTS' ? 'map' : marketTab === 'LEXICONS' ? 'translate' : marketTab === 'TEMPLATES' ? 'draw' : 'palette'}
                  </span>
                </div>
                <span className="truncate">{t(`tab_${marketTab.toLowerCase()}`) || marketTab}</span>
              </h2>

              <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
                <div className="relative flex-1 min-w-[200px] w-full xl:max-w-[300px]">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
                  <input
                    type="text"
                    placeholder={marketTab === 'LEXICONS' ? (t("search_lexicons")) : marketTab === 'TEMPLATES' ? (t("search_tmpl")) : marketTab === 'BLUEPRINTS' ? (t("search_blueprints")) : (t("search_chameleons"))}
                    value={assetSearchQuery}
                    onChange={(e) => {
                      setAssetSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                  />
                  {assetSearchQuery && (
                    <button onClick={() => { setAssetSearchQuery(""); setCurrentPage(1); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
                      <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
                    </button>
                  )}
                </div>

                {marketTab === 'BLUEPRINTS' && gameVersions.length > 0 && (
                  <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[51] h-12">
                    <CustomDropdown disableTint={true}
                      value={selectedGameVersion}
                      onChange={(val: string[]) => {
                        setSelectedGameVersion(val[0]);
                        setCurrentPage(1);
                      }}
                      options={[
                        { id: "all", label: "ALL VERSIONS" },
                        ...(selectedGameVersion !== "all" && !gameVersions.includes(selectedGameVersion) ? [{ id: selectedGameVersion, label: selectedGameVersion }] : []),
                        ...gameVersions.map(v => ({ id: v, label: v }))
                      ]}
                    />
                  </div>
                )}

                {(marketTab === 'LEXICONS' || marketTab === 'TEMPLATES') && (
                  <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[51] h-12">
                    <CustomDropdown disableTint={true}
                      value={languageFilter}
                      onChange={(val: string[]) => { setLanguageFilter(val[0]); setCurrentPage(1); }}
                      options={[
                        { id: "all", label: marketTab === 'LEXICONS' ? t("tab_lexicons") : (t("ql_templates") || "Templates") },
                        ...availableLanguages.map(l => ({ id: l, label: l }))
                      ]}
                    />
                  </div>
                )}
                {marketTab === 'LEXICONS' && (
                  <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[50] h-12">
                    <CustomDropdown disableTint={true}
                      value={lexiconTypeFilter}
                      onChange={(val: string[]) => { setLexiconTypeFilter(val[0]); setCurrentPage(1); }}
                      options={[
                        { id: "all", label: t("filter_type") },
                        { id: "Default", label: t("type_default") },
                        { id: "Theme", label: t("type_theme") }
                      ]}
                    />
                  </div>
                )}

                {marketTab === 'CHAMELEONS' && (
                  <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[50] h-12">
                    <CustomDropdown disableTint={true}
                      value={themeModeFilter}
                      onChange={(val: string[]) => { setThemeModeFilter(val[0]); setCurrentPage(1); }}
                      options={[
                        { id: "all", label: t("filter_mode") },
                        { id: "Dark", label: t("mode_dark") },
                        { id: "Light", label: t("mode_light") }
                      ]}
                    />
                  </div>
                )}

                <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[49] h-12">
                  <CustomDropdown disableTint={true}
                    value={assetSortBy}
                    onChange={(val: string[]) => setAssetSortBy(val[0])}
                    options={[
                      { id: "newest", label: t("sort_newest") },
                      { id: "oldest", label: t("sort_oldest") },
                      { id: "name", label: t("sort_name") },
                      { id: "author", label: t("sort_author") }
                    ]}
                  />
                </div>

                {marketTab !== 'MODS' && (
                  <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[48] h-12">
                    <CustomDropdown
                      disableTint={true}
                      multiSelect={true}
                      placeholder={t("filter_view_options") || "View Options"}
                      value={activeViewFilters}
                      selectedValues={activeViewFilters}
                      onChange={handleViewFiltersChange}
                      options={viewFilterOptions.filter(o => marketTab === 'BLUEPRINTS' ? true : o.id === 'hide_installed')}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-8">
              {loading ? (
                <div className="col-span-full py-20 text-center opacity-50 font-black uppercase tracking-widest animate-pulse">
                  {t("searching")}
                </div>
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
                    className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group"
                  >
                    <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                      <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>
                        {marketTab === 'BLUEPRINTS' ? "map" : marketTab === 'CHAMELEONS' ? "palette" : marketTab === 'TEMPLATES' ? "draw" : "translate"}
                      </span>
                      <div className="absolute top-4 left-4 flex flex-col items-start gap-2 z-30">
                        {(asset.is_early_access || asset.is_paid) && (
                          <div className="flex flex-col gap-1.5 items-start">
                            {asset.is_early_access && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[color-mix(in_srgb,#a855f7_15%,transparent)] border border-[color-mix(in_srgb,#a855f7_30%,transparent)] rounded-lg backdrop-blur-sm shadow-md">
                                <span className="material-symbols-outlined !text-[10px] text-[#d8b4fe]">science</span>
                                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#d8b4fe]">{t("badge_early_access") || "Early Access"}</span>
                              </div>
                            )}
                            {asset.is_paid && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[color-mix(in_srgb,#eab308_15%,transparent)] border border-[color-mix(in_srgb,#eab308_30%,transparent)] rounded-lg backdrop-blur-sm shadow-md">
                                <span className="material-symbols-outlined !text-[10px] text-[#fef08a]">monetization_on</span>
                                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#fef08a]">{t("badge_paid") || "Paid"}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-30">
                        <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[3px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest shadow-lg">
                          {marketTab === 'BLUEPRINTS' ? (t("type_blueprint")) : marketTab === 'CHAMELEONS' ? (t("type_theme")) : marketTab === 'TEMPLATES' ? (t("type_template")) : (t("tab_lexicons"))}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                        {asset.name}
                      </h3>
                      {masonMap[asset.author?.toLowerCase()] ? (
                        <p
                          onClick={(e) => { e.stopPropagation(); onOpenMasonProfile?.(masonMap[asset.author.toLowerCase()]); }}
                          className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2 cursor-pointer hover:underline hover:text-[var(--text)] transition-colors"
                        >
                          {asset.author}
                        </p>
                      ) : (
                        <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                          {asset.author || "Citizen"}
                        </p>
                      )}
                      {asset.description && (
                        <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                          {asset.description}
                        </p>
                      )}

                      <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                        <div className="flex flex-col justify-center gap-1.5">
                          <div className="flex flex-col gap-1.5 items-start">
                            {asset.created_at && (
                              <span className="flex items-center gap-1 text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                                <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_calendar") || "event"}</span>
                                {t("updated_date") || "LAST UPDATED"}: {new Date(asset.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[10px] font-black text-[var(--accent)] uppercase tracking-widest">
                              <span className="material-symbols-outlined !text-[14px]">download</span>
                              {asset.downloads || 0} <span className="opacity-70">{t("auto_dl")}</span>
                            </span>
                          </div>

                        </div>
                        <div className="flex gap-2">
                          {session?.user?.user_metadata?.username === asset.author && (
                            <button
                              onClick={(e) => handleEditAsset(e, asset)}
                              className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              {t("emote_edit")}
                            </button>
                          )}
                          {marketTab === 'BLUEPRINTS' ? (() => {
                            const isInstalled = playSets.some((p: any) => p.code && asset.json_data?.code && p.code === asset.json_data.code);
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBlueprint(asset);
                                }}
                                className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105"
                              >
                                {isInstalled ? (t("btn_install_copy") || "INSTALL COPY") : (t("update_panel_install"))}
                              </button>
                            );
                          })() : (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (marketTab === 'CHAMELEONS') {
                                  const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                                  importTheme({ ...parsedData, version: asset.version || '1.0.0' });
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
                                  if (marketTab === 'BLUEPRINTS') {
                                    await supabase.rpc('increment_blueprint_downloads', { blueprint_id: asset.id });
                                  } else {
                                    await supabase.rpc('increment_asset_downloads', { asset_id: asset.id });
                                  }
                                } catch (e) { console.error("Could not increment downloads", e); }
                                setAssetResults(prev => prev.map(a => a.id === asset.id ? { ...a, downloads: (a.downloads || 0) + 1 } : a));
                              }}
                              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 ${isInstalled(asset) ? isOutdated(asset) ? 'bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] border border-[color-mix(in_srgb,#3b82f6_30%,transparent)] text-[#3b82f6] hover:bg-[color-mix(in_srgb,#3b82f6_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--subtext)_10%,transparent)] border border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--subtext)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--subtext)_15%,transparent)] backdrop-blur-md' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'}`}
                            >
                              {isInstalled(asset) ? isOutdated(asset) ? "UPDATE" : (t("btn_reinstall")) : (t("update_panel_install"))}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-20 text-center opacity-50 flex flex-col items-center justify-center">
                  <div className="w-24 h-24 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-50">{marketTab === 'BLUEPRINTS' ? (t("icon_map")) : marketTab === 'TEMPLATES' ? "draw" : (t("icon_palette"))}</span>
                  </div>
                  <p className="font-black uppercase tracking-widest text-xl mb-2">
                    {marketTab === 'CHAMELEONS'
                      ? (t("empty_title_chameleons"))
                      : marketTab === 'TEMPLATES'
                        ? (t("empty_title_templates"))
                        : marketTab === 'BLUEPRINTS'
                          ? (t("bp_no_blueprints_found"))
                          : (t("empty_title_lexicons"))}
                  </p>
                  <p className="text-[10px] text-[var(--subtext)] opacity-60 mt-2">{t("empty_desc")}</p>
                </div>
              )}
            </div>

            {assetTotalPages > 1 && !loading && (
              <div className="flex justify-center items-center gap-4 mt-4 mb-20">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent"
                >
                  {t("nav_prev")}
                </button>
                <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
                  {currentPage} / {assetTotalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(assetTotalPages, p + 1))}
                  disabled={currentPage === assetTotalPages}
                  className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent"
                >
                  {t("nav_next")}
                </button>
              </div>
            )}
          </div>
        )}
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
        onDownloadSuccess={(id: any) => setAssetResults(prev => prev.map(a => a.id === id ? { ...a, downloads: (a.downloads || 0) + 1 } : a))}
      />

      {previewAsset && (
        <AssetPreviewSidebar
          assetId={previewAsset.id}
          assetType={previewAsset.type}
          onClose={() => setPreviewAsset(null)}
          onFlag={(id, type) => setReportState({ isOpen: true, assetId: id, assetType: type, reason: '' })}
        />
      )}

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
          onUpload={async (isPublic: boolean, isLocked: boolean, allowedMods: any[], isMarketListed: boolean) => {
            try {
              const { error } = await supabase.from('blueprints').update({
                is_public: isPublic,
                is_locked: isLocked,
                is_market_listed: isMarketListed
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
    </div>
  );
}
