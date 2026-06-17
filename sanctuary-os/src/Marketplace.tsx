import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { ViewHeader, CustomDropdown, HubTabButton, standardButtonClass, standardAccentGlassButtonClass, standardDangerButtonClass } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { useTheme } from "./ThemeContext";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import AssetPreviewSidebar from "./AssetPreviewSidebar";

interface MarketplaceProps {
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
  if (filename.toLowerCase().endsWith('.ts4script')) {
    ext = "SCRIPT";
    name = filename.substring(0, filename.length - 10);
  } else if (filename.toLowerCase().endsWith('.package')) {
    name = filename.substring(0, filename.length - 8);
  } else if (filename.includes('.')) {
    const splitExt = filename.split('.');
    ext = splitExt[splitExt.length - 1].toUpperCase();
    name = splitExt.slice(0, -1).join('.');
  }
  return { name: name.replace(/_/g, ' '), ext };
};

const getModUrl = (mod: any) => {
  if (mod.url && mod.url.trim() !== '') return mod.url;
  const parts = (mod.name || "").split(/[/\\]/);
  const filename = parts[parts.length - 1] || "";
  const searchName = filename.replace(/\.(package|ts4script)$/i, '').replace(/_/g, ' ') || mod.name;
  return `https://www.google.com/search?q=${encodeURIComponent(searchName + ' sims 4 mod')}`;
};

export default function Marketplace({ ownedHashes, onSetStatus, onOpenMasonProfile, onOpenDossier, syncBlueprintByCode }: MarketplaceProps) {
  const { t, importLexicon, registry } = useLexicon();
  const session = useStore((state) => state.session);
  const marketTab = useStore(state => state.marketTab);
  const setMarketTab = useStore(state => state.setMarketTab);
  const selectedVersion = useStore(state => state.selectedVersion);
  const showImages = useStore(state => state.showImages);
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
  const [selectedGameVersion, setSelectedGameVersion] = useState<string>(selectedVersion || "all");
  const [dlcFilter, setDlcFilter] = useState<string>("all");
  const [dlcRegistry, setDlcRegistry] = useState<any[]>([]);
  
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
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

  const itemsPerPage = 50;

  useEffect(() => {
    fetchGameVersions();
    fetchDlcRegistry();
  }, []);

  useEffect(() => {
    if (marketTab === 'MODS') {
      if (gameVersions.length > 0) fetchMarketplace();
    } else {
      fetchMarketplaceAssets();
    }
  },[marketTab, gameVersions, selectedGameVersion]);

  async function fetchMarketplaceAssets() {
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
        
        const { data: masonData } = await supabase.from('masons').select('id, name');
        if (masonData) {
          setMasonMap(masonData.reduce((acc: any, m: any) => { acc[m.name.toLowerCase()] = m.id; return acc; }, {}));
        }

        setAssetResults(data?.map(b => ({
            id: b.id,
            name: b.name,
            author: masonData?.find((m: any) => m.id === b.mason_id)?.name || "Citizen",
            description: (b.artifacts?.length || 0) + " " + (t("modcard_artifacts") || "Mods"),
            created_at: b.created_at,
            asset_type: 'blueprint',
            json_data: b
        })) || []);
      } else {
        const { data, error } = await supabase
          .from('marketplace_assets')
          .select('*')
          .eq('asset_type', marketTab === 'CHAMELEONS' ? 'chameleon' : 'lexicon')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setAssetResults(data || []);

        const { data: masonData } = await supabase.from('masons').select('id, name');
        if (masonData) {
          setMasonMap(masonData.reduce((acc: any, m: any) => { acc[m.name.toLowerCase()] = m.id; return acc; }, {}));
        }

        if (marketTab === 'LEXICONS') {
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
          alert(t("market_upload_banned") || "Upload access has been revoked.");
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
    setUploadState({
      isOpen: true,
      isEdit: true,
      editId: asset.id,
      fileContent: typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data,
      fileName: asset.name,
      name: asset.name,
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
      const payload = {
        asset_type: marketTab === 'CHAMELEONS' ? 'chameleon' : 'lexicon',
        name: uploadState.name,
        author: session?.user?.user_metadata?.username || 'Citizen',
        description: uploadState.description,
        json_data: uploadState.fileContent,
        language: marketTab === 'LEXICONS' ? finalLanguage : null,
        lexicon_type: marketTab === 'LEXICONS' ? uploadState.lexiconType : null,
        theme_mode: marketTab === 'CHAMELEONS' ? uploadState.themeMode : null
      };
      
      if (uploadState.isEdit && uploadState.editId) {
        const { error } = await supabase.from('marketplace_assets').update(payload).eq('id', uploadState.editId);
        if (error) throw error;
        onSetStatus('Update Successful!');
      } else {
        const { error } = await supabase.from('marketplace_assets').insert([payload]);
        if (error) throw error;
        onSetStatus('Upload Successful!');
      }
      
      setUploadState(s => ({ ...s, isOpen: false }));
      fetchMarketplaceAssets();
    } catch (err: any) {
      alert(`Upload failed: ${err.message || err}`);
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
        const { error } = await supabase.from('marketplace_reports').insert([{
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

  const isInstalled = (asset: any) => {
    if (marketTab === 'CHAMELEONS') {
      return Object.values({ ...CORE_THEMES, ...customThemes }).some((th: any) => th.name === asset.name);
    } else {
      return !!registry?.[asset.name];
    }
  };

  async function fetchGameVersions() {
    try {
      const { data } = await supabase
        .from('game_versions')
        .select('version')
        .order('version', { ascending: false });
      
      if (data && data.length > 0) {
        setGameVersions(data.map(v => v.version));
        // Default to installed game version, or latest if not set
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

  async function fetchMarketplace() {
    setLoading(true);
    try {
      // Fetch all mods with pagination to get ALL records
      let allMods: any[] = [];
      let from = 0;
      const step = 999;
      
      while (true) {
        const { data, error } = await supabase
          .from("mods")
          .select("*, mod_versions(dna_hash, version_label), masons(id, name)")
          .range(from, from + step);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allMods = [...allMods, ...data];
        if (data.length <= step) break;
        from += step + 1;
      }

      const modsData = allMods;

      // Fetch flavor groups
      const { data: flavorGroups } = await supabase
        .from("flavor_groups")
        .select("*");

      // Fetch CC sets
      const { data: ccSets } = await supabase
        .from("cc_sets")
        .select("*");

      let allItems: any[] = [];

      // Create a map of all clean mods by ID
      const modsById = new Map<string, any>();
      if (modsData) {
        modsData.forEach((mod: any) => {
          // Always hide NSFW (1), explicit (2) and malware (3) from marketplace
          if (mod.compliance_tier > 0) return;
          modsById.set(String(mod.id), mod);
        });
      }

      // Query mod_relationships to find twins and addons for grouping
      const { data: relationships } = await supabase
        .from("mod_relationships")
        .select("parent_id, child_id, relationship_type")
        .in("relationship_type", ["twin", "addon", "flavor", "set_item", "beta"]);

      // Build family groups from relationships
      const familyMap = new Map<string, Set<string>>();
      const processedMods = new Set<string>();
      
      if (relationships) {
        // Build the family map
        relationships.forEach((rel: any) => {
          const parentId = String(rel.parent_id);
          const childId = String(rel.child_id);
          
          // Only process if both parent and child exist in our clean mods
          if (modsById.has(parentId) && modsById.has(childId)) {
            if (!familyMap.has(parentId)) {
              familyMap.set(parentId, new Set([parentId]));
            }
            familyMap.get(parentId)!.add(childId);
          }
        });

        // Create virtual folders for families with 2+ members
        familyMap.forEach((memberIds, parentId) => {
          if (memberIds.size > 1) {
            const members = Array.from(memberIds)
              .map(id => modsById.get(id))
              .filter(Boolean);
            
            // Only create folder if we have valid members AND the parent mod exists with a proper name (not a UUID)
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
              
              // Mark all members as processed
              memberIds.forEach(id => processedMods.add(id));
            }
          }
        });
      }

      // Add flavor groups as virtual cards with their members
      if (flavorGroups) {
        for (const group of flavorGroups) {
          // Fetch members of this flavor group using mod_hash
          const { data: flavorMembers } = await supabase
            .from("flavor_group_members")
            .select("mod_hash")
            .eq("group_id", group.id);
          
          // Map mod_hash to mod IDs by finding matching versions
          const members: any[] = [];
          const memberIds = new Set<string>();
          
          if (flavorMembers) {
            for (const fm of flavorMembers) {
              // Find the mod that has a version with this hash
              for (const [modId, mod] of modsById.entries()) {
                if (mod.mod_versions?.some((v: any) => v.dna_hash === fm.mod_hash)) {
                  // Only add if we haven't already added this mod
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
          
          // Only add flavor group if it has members
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

      // Add CC sets as virtual cards with their members
      if (ccSets) {
        for (const set of ccSets) {
          // Fetch members of this CC set
          const { data: setMembers } = await supabase
            .from("cc_set_members")
            .select("mod_id")
            .eq("set_id", set.id);
          
          const members = setMembers
            ?.map(sm => modsById.get(String(sm.mod_id)))
            .filter(Boolean) || [];
          
          // Mark CC set members as processed so they don't appear standalone
          if (setMembers) {
            setMembers.forEach(sm => processedMods.add(String(sm.mod_id)));
          }
          
          // Only add CC set if it has members
          if (members.length > 0) {
            allItems.push({
              id: `ccset_${set.id}`,
              name: set.name,
              category_override: "CC Set",
              image_url: set.image_url || null,
              master_author: set.creator_name || "Unknown Creator",
              description: null,
              created_at: set.created_at,
              url: set.url || null,
              isCCSet: true,
              ccSetId: set.id,
              flavors: members,
              familyCount: members.length,
              isVirtual: true,
              isParent: true
            });
          }
        }
      }

      // Add remaining standalone mods (not in any family, flavor group, or CC set)
      modsById.forEach((mod, id) => {
        if (!processedMods.has(id)) {
          allItems.push(mod);
        }
      });

      // Deduplicate mods with the same name - merge their compatible versions
      const nameMap = new Map<string, any>();
      allItems.forEach(item => {
        const name = item.name?.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!name) return;
        
        const existing = nameMap.get(name);
        if (!existing) {
          nameMap.set(name, item);
        } else {
          // If both are grouped, keep the existing one
          if ((existing.isVirtual || existing.isParent) && (item.isVirtual || item.isParent)) {
            return;
          }
          
          // If one is grouped, keep the grouped one
          if (item.isVirtual || item.isParent) {
            nameMap.set(name, item);
          } else if (existing.isVirtual || existing.isParent) {
            // Keep existing grouped item
            return;
          } else {
            // Neither is grouped - merge their compatible versions
            const existingVersions = existing.compatible_versions || [];
            const itemVersions = item.compatible_versions || [];
            const mergedVersions = Array.from(new Set([...existingVersions, ...itemVersions]));
            
            // Keep the one with more versions, but update its compatible_versions to include both
            if (itemVersions.length > existingVersions.length) {
              nameMap.set(name, { ...item, compatible_versions: mergedVersions });
            } else {
              nameMap.set(name, { ...existing, compatible_versions: mergedVersions });
            }
          }
        }
      });

      setResults(Array.from(nameMap.values()));
      setCurrentPage(1);
    } catch (err: any) {
      console.error("Marketplace error:", err);
      onSetStatus(`${t("market_error_prefix")}${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Get unique categories from category_override field
  const categories = [t("market_filter_all") || "ALL", ...Array.from(new Set(results.map((m: any) => m.category_override || "Uncategorized").filter(Boolean)))];

  // Apply filters and sorting
  let filteredResults = results.filter((mod: any) => {
    // Already owned filter - check if user has ANY version of this mod
    const modName = (mod.name || "").toLowerCase().trim();
    const isOwned = ownedHashes.some((hash: string) => {
      // Check if the hash matches this mod or any of its variants
      if (mod.isVirtual || mod.isParent) {
        return mod.flavors?.some((f: any) => 
          f.hash === hash || 
          f.mod_versions?.some((v: any) => v.dna_hash === hash)
        );
      }
      return mod.hash === hash || 
        mod.mod_versions?.some((v: any) => v.dna_hash === hash);
    });
    
    if (isOwned) return false; // Hide mods the user already owns
    
    // Search filter
    const masonName = Array.isArray(mod.masons) ? mod.masons[0]?.name : mod.masons?.name;
    const searchText = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      (mod.name || "").toLowerCase().includes(searchText) || 
      (mod.master_author || "").toLowerCase().includes(searchText) ||
      (masonName || "").toLowerCase().includes(searchText) ||
      (mod.description || "").toLowerCase().includes(searchText);
    
    // Category filter
    const matchesCategory = categoryFilter === (t("market_filter_all") || "ALL") || 
      categoryFilter === "ALL" || 
      mod.category_override === categoryFilter;
    
    // Game version filter: For grouped items, check all members' versions
    let matchesGameVersion = false;
    if (selectedGameVersion === "all") {
      matchesGameVersion = true;
    } else {
      // Check if this mod or any of its flavors match the version
      const modsToCheck = (mod.isVirtual || mod.isParent) && mod.flavors ? mod.flavors : [mod];
      matchesGameVersion = modsToCheck.some((m: any) => {
        const versions = Array.isArray(m.compatible_versions) ? m.compatible_versions : [];
        // Show if no versions specified OR if any version matches
        if (versions.length === 0) return true;
        // Check if any of the mod's versions match the selected version
        return versions.some((v: string) => v === selectedGameVersion);
      });
    }
    
    // DLC filter: For grouped items, check all members' DLC requirements
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

  // Sort results
  filteredResults = filteredResults.sort((a: any, b: any) => {
    switch(sortBy) {
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

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / itemsPerPage));
  const paginatedResults = filteredResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Sort and filter assetResults
  let filteredAssetResults = assetResults.filter((asset: any) => {
    const search = assetSearchQuery.toLowerCase();
    const matchesSearch = !assetSearchQuery || 
      (asset.name || "").toLowerCase().includes(search) || 
      (asset.author || "").toLowerCase().includes(search) ||
      (asset.description || "").toLowerCase().includes(search);
    
    let matchesLang = true;
    let matchesType = true;
    let matchesMode = true;

    if (marketTab === 'LEXICONS') {
      if (languageFilter !== 'all') matchesLang = asset.language === languageFilter;
      if (lexiconTypeFilter !== 'all') matchesType = asset.lexicon_type === lexiconTypeFilter;
    } else if (marketTab === 'CHAMELEONS') {
      if (themeModeFilter !== 'all') matchesMode = asset.theme_mode === themeModeFilter;
    }

    return matchesSearch && matchesLang && matchesType && matchesMode;
  });

  filteredAssetResults = filteredAssetResults.sort((a: any, b: any) => {
    switch(assetSortBy) {
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

  const assetTotalPages = Math.max(1, Math.ceil(filteredAssetResults.length / itemsPerPage));
  const assetPaginatedResults = filteredAssetResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (!session) {
    return (
      <div className="flex flex-col gap-8 items-center justify-center h-full text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 rounded-[2rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex items-center justify-center mb-4">
          <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-50">lock</span>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tighter text-[var(--text)]">{t("market_access_denied") || "ACCESS DENIED"}</h2>
        <p className="text-xs font-black text-[var(--subtext)] uppercase tracking-widest">{t("market_access_denied_desc") || "Login required"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader 
        title={t("market_title")} 
        subtitle={`${t("market_subtitle_suffix") || "ARTIFACTS AVAILABLE"}`} 
        icon={t("ui_icon_hub") || "hub"} 
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30" 
      >
        <div className="flex items-center theme-glass-panel rounded-2xl p-1 border border-white/10 shadow-inner">
          <button
            onClick={marketTab === 'MODS' ? fetchMarketplace : fetchMarketplaceAssets}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black"
          >
            <span className="material-symbols-outlined text-xl normal-case">{t("ui_icon_refresh") || "refresh"}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_refresh") || "REFRESH"}</span>
          </button>
          
          {marketTab !== 'MODS' && marketTab !== 'BLUEPRINTS' && (
            <>
              <div className="w-px h-6 bg-white/10 mx-2" />
              <button
                onClick={handleUploadAsset}
                className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black"
              >
                <span className="material-symbols-outlined text-xl normal-case">{t("ui_icon_upload") || "upload"}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{t("market_btn_upload") || "UPLOAD"}</span>
              </button>
            </>
          )}
        </div>
      </ViewHeader>

      <div className="flex flex-col">
        {/* TAB NAVIGATION */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 mb-8">
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar p-1 theme-glass-panel rounded-2xl border border-white/5 shadow-inner shrink-0">
            {['MODS', 'BLUEPRINTS', 'LEXICONS', 'CHAMELEONS'].map((tab) => (
              <HubTabButton 
                key={tab} 
                id={tab} 
                activeTab={marketTab}
                setTab={setMarketTab}
                label={t(`market_tab_${tab.toLowerCase()}`) || tab}
                icon={tab === 'MODS' ? "extension" : tab === 'BLUEPRINTS' ? "map" : tab === 'LEXICONS' ? "translate" : "palette"}
              />
            ))}
          </div>
        </div>

      {marketTab === 'MODS' ? (
      <>
      {/* Search and Filters Section */}
      <div className="theme-glass-panel p-6 rounded-[2rem] shadow-xl border border-white/10 mb-8 animate-in slide-in-from-top-4 duration-500 flex flex-wrap gap-4 items-center relative z-20">
        {/* Search Bar */}
        <div className="flex-1 min-w-[250px] relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text)] opacity-50 flex items-center justify-center">
            <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_search") || "search"}</span>
          </div>
          <input 
            type="text" 
            placeholder={t("market_search_placeholder") || "Search artifacts, creators, descriptions..."} 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full theme-glass-inner rounded-2xl pl-12 pr-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all shadow-inner"
          />
        </div>

        {/* Game Version Filter */}
        <div className="w-[180px]">
          <CustomDropdown disableTint={true}  
            value={selectedGameVersion}
            onChange={(val: string[]) => {
              setSelectedGameVersion(val[0]);
              setCurrentPage(1);
            }}
            options={[
              { id: "all", label: "ALL VERSIONS" },
              ...gameVersions.map(v => ({ id: v, label: v }))
            ]}
          />
        </div>

        {/* DLC Filter */}
        <div className="w-[180px]">
          <CustomDropdown disableTint={true}  
            value={dlcFilter}
            onChange={(val: string[]) => {
              setDlcFilter(val[0]);
              setCurrentPage(1);
            }}
            options={[
              { id: "all", label: "ALL DLC" },
              { id: "base_game_only", label: "BASE GAME ONLY" },
              ...dlcRegistry.map(dlc => ({ id: dlc.code || dlc.name, label: dlc.name }))
            ]}
          />
        </div>

        {/* Sort Dropdown */}
        <div className="w-[180px]">
          <CustomDropdown disableTint={true}  
            value={sortBy}
            onChange={(val: string[]) => setSortBy(val[0])}
            options={[
              { id: "newest", label: t("market_sort_newest") || "NEWEST" },
              { id: "oldest", label: t("market_sort_oldest") || "OLDEST" },
              { id: "name", label: t("market_sort_name") || "NAME" },
              { id: "author", label: t("market_sort_author") || "AUTHOR" }
            ]}
          />
        </div>

        {/* Category Dropdown */}
        <div className="w-[180px]">
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
      </div>

      {/* Marketplace Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8 mt-6">
        {loading ? (
          <div className="col-span-full py-20 text-center opacity-50 font-black uppercase tracking-widest animate-pulse">
            {t("market_searching") || "SCANNING MARKETPLACE..."}
          </div>
        ) : paginatedResults.length > 0 ? (
          <>
            {paginatedResults.map((mod: any, index: number) => (
              <div 
                key={mod.id || `${mod.name}_${index}`} 
                onClick={() => onOpenDossier && onOpenDossier({ ...mod, isMarketplaceView: true })}
                className="relative flex flex-col h-full theme-glass-panel rounded-[2.5rem] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group"
              >
                {/* Image Header */}
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
                      {mod.category_override === "Script" ? "code" : mod.category_override === "CAS" ? "checkroom" : mod.category_override === "BuildBuy" ? "chair" : "extension"}
                    </span>
                  )}
                  
                  <div className="absolute top-4 left-4 z-30 pointer-events-auto">
                    <div className={`backdrop-blur-[3px] border px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 transition-all ${mod.status === 'verified' ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)]' : 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${mod.status === 'verified' ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
                      <span className={`text-[8px] font-black uppercase tracking-widest ${mod.status === 'verified' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                        {(mod.status || 'UNVERIFIED').replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="absolute top-4 right-4 flex gap-2 z-30">
                    <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[3px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">
                      {mod.category_override || "MOD"}
                    </span>
                  </div>

                  {(mod.isVirtual || mod.isParent || mod.familyCount > 1) && (
                    <div className="absolute bottom-3 left-3 z-30 pointer-events-auto group/badge">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-lg transition-all group-hover/badge:bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)] drop-shadow-sm">layers</span>
                        <span className="text-[9px] font-black text-[var(--text)] uppercase tracking-widest drop-shadow-sm">
                          {mod.familyCount || (mod.flavors?.length || 0)} {t("market_variants") || "VARIANTS"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                    {cleanModName(mod.name || mod.id).name}
                  </h3>
                  <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                    {mod.master_author || t("market_unknown_creator") || "Unknown Creator"}{(mod.latest_version) ? ` • ${mod.latest_version}` : ""}
                  </p>
                  {mod.description && (
                    <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                      {mod.description}
                    </p>
                  )}
                  
                  <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                      {mod.created_at ? new Date(mod.created_at).toLocaleDateString() : t("market_date_unknown")}
                    </span>
                    <span className="text-[10px] font-black theme-text-accent uppercase opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">VIEW &rarr;</span>
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="col-span-full py-20 text-center opacity-50 flex flex-col items-center justify-center">
            <div className="w-24 h-24 rounded-[2rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex items-center justify-center mb-6">
              <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-50">{t("ui_icon_marketplace") || "storefront"}</span>
            </div>
            <p className="font-black uppercase tracking-widest text-xl mb-2">{t("market_empty_title") || "NO ARTIFACTS FOUND"}</p>
            <p className="text-[10px] text-[var(--subtext)] opacity-60 mt-2">{t("market_empty_desc") || "Try adjusting your filters or search query"}</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="flex justify-center items-center gap-4 mt-4 mb-20">
          <button 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent"
          >
            {t("nav_prev") || "← PREV"}
          </button>
          <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
            {currentPage} / {totalPages}
          </span>
          <button 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent"
          >
            {t("nav_next") || "NEXT →"}
          </button>
        </div>
      )}
      </>
      ) : (
        <div className="flex flex-col">
          {/* Asset Search & Filters */}
          <div className="theme-glass-panel p-6 rounded-[2rem] shadow-xl border border-white/10 mb-8 animate-in slide-in-from-top-4 duration-500 flex flex-wrap gap-4 items-center relative z-20">
            {/* Search Bar */}
            <div className="flex-1 min-w-[250px] relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text)] opacity-50 flex items-center justify-center">
                <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_search") || "search"}</span>
              </div>
              <input 
                type="text" 
                placeholder={marketTab === 'LEXICONS' ? (t("market_search_lexicons") || "Search lexicons, creators...") : marketTab === 'BLUEPRINTS' ? (t("market_search_blueprints") || "Search Blueprints...") : (t("market_search_chameleons") || "Search chameleons, creators...")} 
                value={assetSearchQuery}
                onChange={(e) => {
                  setAssetSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full theme-glass-inner rounded-2xl pl-12 pr-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all shadow-inner"
              />
            </div>

            {marketTab === 'BLUEPRINTS' && gameVersions.length > 0 && (
              <div className="w-[180px]">
                <CustomDropdown disableTint={true}  
                  value={selectedGameVersion}
                  onChange={(val: string[]) => {
                    setSelectedGameVersion(val[0]);
                    setCurrentPage(1);
                  }}
                  options={[
                    { id: "all", label: "ALL VERSIONS" },
                    ...gameVersions.map(v => ({ id: v, label: v }))
                  ]}
                />
              </div>
            )}

            {marketTab === 'LEXICONS' && (
              <>
                <div className="w-[180px]">
                  <CustomDropdown disableTint={true}  
                    value={languageFilter}
                    onChange={(val: string[]) => { setLanguageFilter(val[0]); setCurrentPage(1); }}
                    options={[
                      { id: "all", label: t("market_filter_language") || "LANGUAGE" },
                      ...availableLanguages.map(l => ({ id: l, label: l }))
                    ]}
                  />
                </div>
                <div className="w-[180px]">
                  <CustomDropdown disableTint={true}  
                    value={lexiconTypeFilter}
                    onChange={(val: string[]) => { setLexiconTypeFilter(val[0]); setCurrentPage(1); }}
                    options={[
                      { id: "all", label: t("market_filter_type") || "TYPE" },
                      { id: "Default", label: t("market_type_default") || "Default" },
                      { id: "Theme", label: t("market_type_theme") || "Theme" }
                    ]}
                  />
                </div>
              </>
            )}

            {marketTab === 'CHAMELEONS' && (
              <div className="w-[180px]">
                <CustomDropdown disableTint={true}  
                  value={themeModeFilter}
                  onChange={(val: string[]) => { setThemeModeFilter(val[0]); setCurrentPage(1); }}
                  options={[
                    { id: "all", label: t("market_filter_mode") || "THEME MODE" },
                    { id: "Dark", label: t("market_mode_dark") || "Dark" },
                    { id: "Light", label: t("market_mode_light") || "Light" }
                  ]}
                />
              </div>
            )}

            <div className="w-[180px]">
              <CustomDropdown disableTint={true}  
                value={assetSortBy}
                onChange={(val: string[]) => setAssetSortBy(val[0])}
                options={[
                  { id: "newest", label: t("market_sort_newest") || "NEWEST" },
                  { id: "oldest", label: t("market_sort_oldest") || "OLDEST" },
                  { id: "name", label: t("market_sort_name") || "NAME" },
                  { id: "author", label: t("market_sort_author") || "AUTHOR" }
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
            {loading ? (
              <div className="col-span-full py-20 text-center opacity-50 font-black uppercase tracking-widest animate-pulse">
                {t("market_searching") || "SCANNING MARKETPLACE..."}
              </div>
            ) : assetPaginatedResults.length > 0 ? (
              assetPaginatedResults.map((asset: any, index: number) => (
                <div 
                  key={asset.id || `${asset.name}_${index}`} 
                  onClick={() => {
                    if (marketTab === 'BLUEPRINTS') setSelectedBlueprint(asset);
                    else if (marketTab === 'LEXICONS') setPreviewAsset({ id: asset.id, type: 'lexicon' });
                    else if (marketTab === 'CHAMELEONS') setPreviewAsset({ id: asset.id, type: 'chameleon' });
                    else if (onOpenDossier) onOpenDossier({ ...asset, isMarketplaceView: true });
                  }}
                  className="relative flex flex-col h-full theme-glass-panel rounded-[2.5rem] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group"
                >
                  {/* Image Header */}
                  <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                    <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>
                      {marketTab === 'BLUEPRINTS' ? "map" : marketTab === 'CHAMELEONS' ? "palette" : "translate"}
                    </span>
                    <div className="absolute top-4 right-4 flex gap-2 z-30">
                      <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[3px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">
                        {marketTab === 'BLUEPRINTS' ? (t("market_type_blueprint") || "BLUEPRINT") : marketTab === 'CHAMELEONS' ? (t("market_type_theme") || "THEME") : (t("market_type_lexicon") || "LANGUAGE")}
                      </span>
                    </div>
                  </div>
                  
                  {/* Content */}
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
                      <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                        {asset.downloads || 0} DL
                      </span>
                      <div className="flex gap-2">
                        {session?.user?.user_metadata?.username === asset.author && (
                          <button 
                            onClick={(e) => handleEditAsset(e, asset)}
                            className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          >
                            {t("market_btn_edit") || "EDIT"}
                          </button>
                        )}
                        {marketTab === 'BLUEPRINTS' ? (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBlueprint(asset);
                            }}
                            className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105"
                          >
                            {t("market_btn_download_install") || "DOWNLOAD"}
                          </button>
                        ) : (
                          <button 
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (marketTab === 'CHAMELEONS') {
                                importTheme(asset.json_data);
                                onSetStatus(`Successfully Installed Theme: ${asset.name}`);
                              } else {
                                const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                                importLexicon({ ...parsedData, _meta_language: asset.language || "Custom" }, asset.name);
                                onSetStatus(`Successfully Installed Lexicon: ${asset.name}`);
                              }
                              await supabase.rpc('increment_asset_downloads', { asset_id: asset.id });
                              setAssetResults(prev => prev.map(a => a.id === asset.id ? { ...a, downloads: (a.downloads || 0) + 1 } : a));
                            }}
                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 ${isInstalled(asset) ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]'}`}
                          >
                            {isInstalled(asset) ? (t("market_btn_reinstall") || "REINSTALL") : (t("market_btn_download_install") || "DOWNLOAD")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-20 text-center opacity-50 flex flex-col items-center justify-center">
                <div className="w-24 h-24 rounded-[2rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-50">{marketTab === 'BLUEPRINTS' ? (t("ui_icon_map") || "map") : (t("ui_icon_theme") || "palette")}</span>
                </div>
                <p className="font-black uppercase tracking-widest text-xl mb-2">
                  {marketTab === 'CHAMELEONS' 
                    ? (t("market_empty_title_chameleons") || "NO CHAMELEONS FOUND") 
                    : marketTab === 'BLUEPRINTS'
                    ? (t("market_empty_title_blueprints") || "NO BLUEPRINTS FOUND")
                    : (t("market_empty_title_lexicons") || "NO LEXICONS FOUND")}
                </p>
                <p className="text-[10px] text-[var(--subtext)] opacity-60 mt-2">{t("market_empty_desc") || "Try adjusting your filters or search query"}</p>
              </div>
            )}
          </div>

          {/* Asset Pagination */}
          {assetTotalPages > 1 && !loading && (
            <div className="flex justify-center items-center gap-4 mt-4 mb-20">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent"
              >
                {t("nav_prev") || "← PREV"}
              </button>
              <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
                {currentPage} / {assetTotalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(assetTotalPages, p + 1))}
                disabled={currentPage === assetTotalPages}
                className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent"
              >
                {t("nav_next") || "NEXT →"}
              </button>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Upload Modal */}
      {uploadState.isOpen && createPortal(
        <>
          <div className="fixed top-0 right-0 bottom-10 z-[15000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setUploadState(s => ({ ...s, isOpen: false }))}></div>
          <div className="fixed top-0 right-0 bottom-10 w-[500px] max-w-[100vw] theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[15001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px]" onClick={(e) => e.stopPropagation()}>
            <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0">
              <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                <span className="material-symbols-outlined text-white" style={{ fontSize: '120px' }}>{marketTab === 'LEXICONS' ? 'translate' : 'palette'}</span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--accent)_30%,transparent)] to-transparent" />
              <button type="button" onClick={() => setUploadState(s => ({ ...s, isOpen: false }))} className="absolute top-12 right-6 z-50 w-10 h-10 bg-black/40 backdrop-blur-[3px] hover:theme-bg-danger text-white/70 hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_close") || "close"}</span>
              </button>
            </div>
            
            <div className="px-6 pt-6 pb-2 relative flex-shrink-0">
              <h3 className="text-2xl font-black text-[var(--text)] uppercase truncate">
                {marketTab === 'LEXICONS' 
                  ? (t("market_upload_lexicon_title") || "Upload Lexicon")
                  : (t("market_upload_chameleon_title") || "Upload Chameleon")}
              </h3>
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">Upload New Asset</p>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative z-10">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("market_upload_file") || "File Content"}</label>
                  <div className="flex items-center gap-4">
                    <div className={`flex-1 theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold truncate transition-all ${uploadState.fileName ? 'border-l-4 border-l-[var(--accent)] text-[var(--text)] opacity-100' : 'text-[var(--subtext)] opacity-60 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] border-dashed'}`}>
                      {uploadState.fileName || "No file selected"}
                    </div>
                    <button onClick={async () => {
                      try {
                        const selected = await open({ filters:[{ name: 'JSON', extensions: ['json'] }] });
                        if (!selected) return;
                        const content = await readTextFile(selected as string);
                        const parsed = JSON.parse(content);
                        setUploadState(s => ({ ...s, fileContent: parsed, fileName: selected as string, name: s.name || parsed.name || 'Unknown' }));
                      } catch (err: any) {
                        alert(`${t("alert_import_failed") || "Error reading file:"} ${err.message || err}`);
                      }
                    }} className={`px-6 py-3 font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-lg whitespace-nowrap ${standardAccentGlassButtonClass}`}>
                      {uploadState.fileName ? (t("ui_btn_replace") || "REPLACE") : (t("marketplace_btn_import") || "IMPORT")}
                    </button>
                  </div>
                </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">
                  {marketTab === 'LEXICONS' 
                    ? (t("market_upload_lexicon_name") || "Lexicon Name")
                    : (t("market_upload_chameleon_name") || "Chameleon Name")}
                </label>
                <input 
                  type="text" 
                  value={uploadState.name}
                  onChange={e => setUploadState(s => ({ ...s, name: e.target.value }))}
                  className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("market_upload_desc") || "Description"}</label>
                <textarea 
                  value={uploadState.description}
                  onChange={e => setUploadState(s => ({ ...s, description: e.target.value }))}
                  className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[100px] text-[var(--text)]"
                />
              </div>

              {marketTab === 'LEXICONS' && (
                <>
                  <div className="flex flex-col gap-2 relative z-[60]">
                    <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("market_upload_language") || "Language"}</label>
                    <CustomDropdown disableTint={true}  
                      value={uploadState.language}
                      onChange={(val: string[]) => setUploadState(s => ({ ...s, language: val[0] }))}
                      options={[
                        ...availableLanguages.map(l => ({ id: l, label: l })),
                        { id: "add_new", label: t("market_upload_add_language") || "Add New Language..." }
                      ]}
                    />
                  </div>
                  {uploadState.language === 'add_new' && (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
                      <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("market_upload_new_language") || "New Language Name"}</label>
                      <input 
                        type="text" 
                        value={uploadState.newLanguage}
                        onChange={e => setUploadState(s => ({ ...s, newLanguage: e.target.value }))}
                        className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all border-l-4 border-l-[var(--accent)] text-[var(--text)]"
                        placeholder="e.g. French"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-2 relative z-[50]">
                    <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("market_filter_type") || "Type"}</label>
                    <CustomDropdown disableTint={true}  
                      value={uploadState.lexiconType}
                      onChange={(val: string[]) => setUploadState(s => ({ ...s, lexiconType: val[0] }))}
                      options={[
                        { id: "Theme", label: t("market_type_theme") || "Theme" },
                        { id: "Default", label: t("market_type_default") || "Default" }
                      ]}
                    />
                  </div>
                </>
              )}

              {marketTab === 'CHAMELEONS' && (
                <div className="flex flex-col gap-2 relative z-[60]">
                  <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("market_filter_mode") || "Theme Mode"}</label>
                  <CustomDropdown disableTint={true}  
                    value={uploadState.themeMode}
                    onChange={(val: string[]) => setUploadState(s => ({ ...s, themeMode: val[0] }))}
                    options={[
                      { id: "Dark", label: t("market_mode_dark") || "Dark" },
                      { id: "Light", label: t("market_mode_light") || "Light" }
                    ]}
                  />
                </div>
              )}

              </div>
            </div>
            <div className="p-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex justify-end gap-4 mt-auto relative z-10 shrink-0">
              <button 
                onClick={() => setUploadState(s => ({ ...s, isOpen: false }))}
                className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/5 hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--text)]"
              >
                {t("market_upload_cancel") || "Cancel"}
              </button>
              <button 
                onClick={submitUpload}
                disabled={!uploadState.name || (uploadState.language === 'add_new' && !uploadState.newLanguage)}
                className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${standardAccentGlassButtonClass} disabled:opacity-50 disabled:hover:scale-100 disabled:pointer-events-none`}
              >
                {uploadState.isEdit ? (t("market_upload_btn_update") || "UPDATE LISTING") : (t("market_upload_submit") || "SUBMIT UPLOAD")}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Report Modal */}
      {reportState.isOpen && createPortal(
        <>
          <div className="fixed top-0 right-0 bottom-10 z-[65000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setReportState({ isOpen: false, assetId: null, assetType: null, reason: '' })} />
          <div className="fixed top-0 right-0 bottom-10 w-[500px] max-w-[100vw] theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[65001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px]" onClick={e => e.stopPropagation()}>
            <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0">
              <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                <span className="material-symbols-outlined text-white" style={{ fontSize: '120px' }}>{t("ui_icon_flag") || "flag"}</span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--danger)_30%,transparent)] to-transparent" />
              <button type="button" onClick={() => setReportState({ isOpen: false, assetId: null, assetType: null, reason: '' })} className="absolute top-12 right-6 z-50 w-10 h-10 bg-black/40 backdrop-blur-[3px] hover:theme-bg-danger text-white/70 hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_close") || "close"}</span>
              </button>
            </div>
            
            <div className="px-6 pt-6 pb-2 relative flex-shrink-0">
              <h3 className="text-2xl font-black text-[var(--text)] uppercase truncate">{t("market_report_title") || "Flag Asset"}</h3>
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">{t("market_report_desc") || "Submit a report"}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative z-10">
              <form onSubmit={handleReportSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("market_report_reason") || "Reason"}</label>
                  <textarea 
                    required
                    value={reportState.reason}
                    placeholder={t("market_report_placeholder") || "Please fill out this form"}
                    title={t("market_report_placeholder") || "Please fill out this form"}
                    onChange={(e) => setReportState({...reportState, reason: e.target.value})}
                    className="h-48 theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold resize-none focus:outline-none focus:theme-border-accent"
                  />
                </div>

                <div className="flex gap-3 pt-2 shrink-0">
                  <button type="button" onClick={() => setReportState({ isOpen: false, assetId: null, assetType: null, reason: '' })} className={standardButtonClass + " flex-1"}>
                    {t("market_upload_cancel") || "CANCEL"}
                  </button>
                  <button type="submit" className={standardDangerButtonClass + " flex-1"}>
                    {t("market_report_submit") || "SUBMIT"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>,
        document.body
      )}
      {/* Blueprint Details Drawer */}
      {selectedBlueprint && createPortal(
        <>
          <div className="fixed top-0 right-0 bottom-10 z-[15000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setSelectedBlueprint(null)}></div>
          <div className="fixed top-0 right-0 bottom-10 w-full max-w-4xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[15001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px]" onClick={(e) => e.stopPropagation()}>
            <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0">
              <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                <span className="material-symbols-outlined text-white" style={{ fontSize: '120px' }}>{t("ui_icon_map") || "map"}</span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--accent)_30%,transparent)] to-transparent" />
              <button onClick={() => setSelectedBlueprint(null)} className="absolute top-12 right-6 z-50 w-10 h-10 bg-black/40 backdrop-blur-[3px] hover:theme-bg-danger text-white/70 hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_close") || "close"}</span>
              </button>
            </div>

            <div className="px-10 pt-8 pb-4 relative shrink-0">
              <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">{selectedBlueprint.name}</h3>
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2 flex gap-4">
                <span>{selectedBlueprint.author || "Citizen"} &bull; {new Date(selectedBlueprint.created_at).toLocaleDateString()}</span>
                <span className="text-[var(--accent)] font-mono">{selectedBlueprint.json_data.game_version ? `${t("market_blueprint_verified") || "Verified Version: "} ${selectedBlueprint.json_data.game_version}` : (t("market_blueprint_verified_unknown") || "Verified Version: Unknown")}</span>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-8 relative z-10">
               {selectedBlueprint.description && (
                 <div className="theme-glass-inner p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                   <p className="text-sm font-medium text-[var(--text)] leading-relaxed whitespace-pre-wrap">{selectedBlueprint.description}</p>
                 </div>
               )}
                 
                 <div className="flex flex-col gap-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] opacity-80 flex items-center gap-2">
                      <span className="theme-text-accent">{selectedBlueprint.json_data.artifacts?.length || 0}</span> {t("market_blueprint_included") || "Included Mods"}
                    </h3>
                    <div className="flex flex-col gap-2">
                      {(selectedBlueprint.json_data.artifacts || []).map((mod: any, i: number) => (
                        <div key={i} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-4 rounded-2xl hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all group">
                           <button 
                             onClick={() => onOpenDossier?.({ ...mod, isMarketplaceView: true })}
                             className="flex flex-col items-start hover:theme-text-accent transition-colors text-left"
                           >
                             <span className="text-sm font-black text-[var(--text)] uppercase tracking-tight">{cleanModName(mod.name || mod.id).name}</span>
                             <span className="text-[9px] font-mono theme-text-accent tracking-[0.2em] uppercase opacity-70 mt-1">{cleanModName(mod.name || mod.id).ext}</span>
                           </button>
                           {mod.author && <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-4 shrink-0">{mod.author}</span>}
                        </div>
                      ))}
                      </div>
                   </div>
                </div>
                <div className="p-10 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] flex justify-between gap-4 shrink-0">
                   <button 
                      onClick={() => {
                        if (syncBlueprintByCode) syncBlueprintByCode(selectedBlueprint.json_data.code);
                        setSelectedBlueprint(null);
                      }}
                      className={standardAccentGlassButtonClass + " w-full"}
                   >
                      {t("market_btn_download_install") || "DOWNLOAD"}
                   </button>
                 </div>
              </div>
        </>,
        document.body
      )}

      {previewAsset && (
        <AssetPreviewSidebar 
          assetId={previewAsset.id} 
          assetType={previewAsset.type} 
          onClose={() => setPreviewAsset(null)}
          onFlag={(id, type) => setReportState({ isOpen: true, assetId: id, assetType: type, reason: '' })}
        />
      )}
    </div>
  );
}
