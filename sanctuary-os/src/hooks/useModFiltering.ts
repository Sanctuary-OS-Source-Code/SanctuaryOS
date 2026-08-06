import { useState, useMemo } from 'react';
import { isSupportedExtension } from '../shared';

export function useModFiltering(displayModList: any[], playSets: any[], activeSetName: string, activeGameSchema: any, t: any) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [equipFilter, setEquipFilter] = useState("OVERVIEW");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);

  const lookupMaps = useMemo(() => {
    const modMap = new Map();
    const fallbackMap = new Map<string, string>();
    const extRegex = activeGameSchema?.extensions?.game_file ? new RegExp(`\\.(${activeGameSchema.extensions.game_file.join('|')})$`, 'i') : /\\.package$/i;
    
    displayModList.forEach((m: any) => {
      if (m.isVirtual) {
        if (m.flavors) {
          m.flavors.forEach((f: any) => {
            if (!f.name) return;
            const lowerName = f.name.toLowerCase();
            modMap.set(lowerName, f);
            modMap.set(lowerName.replace(/\\/g, '/'), f);
            modMap.set(lowerName.replace(/\//g, '\\'), f);
            const mBase = f.name.split(/[\\/]/).pop()?.replace(extRegex, '')?.toLowerCase();
            const mExt = f.name.split('.').pop()?.toLowerCase();
            if (mBase && mExt) fallbackMap.set(`${mBase}___${mExt}`, f.name);
          });
        }
        return;
      }
      if (!m.name) return;
      const lowerName = m.name.toLowerCase();
      modMap.set(lowerName, m);
      modMap.set(lowerName.replace(/\\/g, '/'), m);
      modMap.set(lowerName.replace(/\//g, '\\'), m);
      
      const mBase = m.name.split(/[\\/]/).pop()?.replace(extRegex, '')?.toLowerCase();
      const mExt = m.name.split('.').pop()?.toLowerCase();
      if (mBase && mExt) {
        fallbackMap.set(`${mBase}___${mExt}`, m.name);
      }
    });

    return { modMap, fallbackMap, extRegex };
  }, [displayModList, activeGameSchema]);

  const activeSetMods = useMemo(() => {
    const rawSetMods = playSets.find((s: any) => s.name === activeSetName)?.mods || [];
    const rawNames = rawSetMods.map((m: any) => typeof m === 'string' ? m : (m?.name || m?.path || ''));
    const { modMap, fallbackMap, extRegex } = lookupMaps;

    const names = rawNames.map((modName: string) => {
      if (!modName) return '';
      const lowerModName = modName.toLowerCase();
      if (modMap.has(lowerModName)) return modMap.get(lowerModName).name;
      
      const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, '')?.toLowerCase();
      const targetExt = modName.split('.').pop()?.toLowerCase();
      
      const fallbackMatch = fallbackMap.get(`${targetBase}___${targetExt}`);
      if (fallbackMatch) return fallbackMatch;
      
      return modName;
    });
    return new Set(names);
  }, [playSets, activeSetName, lookupMaps]);

  const filteredMods = useMemo(() => {
    const mfStart = performance.now();
    const searchLower = searchQuery.toLowerCase();
    const activeCatUpper = activeCategory.toUpperCase();
    const activeSubUpper = activeSubType.toUpperCase();
    const strVerified = (t("verified") || "verified").toLowerCase();
    const strReview = (t("status_dd_review") || "review").toLowerCase();
    const strUnverified = (t("unverified") || "unverified").toLowerCase();
    const strLocal = (t("unlinked_badge") || "local").toLowerCase();

    const res = displayModList.reduce((acc: any[], mod: any) => {
      if (!mod) return acc;
      const checkMatch = (m: any) => {
        if (!m.isVirtual && m.name) {
          if (!isSupportedExtension(m.name, activeGameSchema)) {
            return false;
          }
          if (activeGameSchema?.extensions?.vault_visible) {
            const isVaultVisible = activeGameSchema.extensions.vault_visible.some((ext: string) => 
              m.name.toLowerCase().endsWith(ext.toLowerCase())
            );
            if (!isVaultVisible) return false;
          }
        }
        const name = (m.displayName || m.name || "").toLowerCase();
        const author = (m.author || "").toLowerCase();
        const matchesSearch =
          name.includes(searchLower) ||
          author.includes(searchLower);
        const isActuallyEquipped = activeSetMods.has(m.name);
        const matchesEquip =
          equipFilter === "ALL" ||
          equipFilter === "ARCHIVES" ||
          equipFilter === "DEV" ||
          (equipFilter === "EQUIPPED" && isActuallyEquipped) ||
          (equipFilter === "UNEQUIPPED" && !isActuallyEquipped);
        const modType = (m.category_override || m.type || "NONE").toUpperCase();
        const matchesCategory =
          activeCategory === "ALL" || (activeCategory === "LOCAL_FOLDERS" ? (m.isVirtual || mod.isVirtual) : modType === activeCatUpper);
        const subType = (m.sub_type || "").toUpperCase();
        const matchesSubType =
          activeSubType === "ALL" || subType === activeSubUpper;
        const rawStatus = (m.status || "").toLowerCase();
        
        let matchesStatus = false;
        if (filterStatus === "ALL") {
          matchesStatus = true;
        } else if (filterStatus === "VERIFIED") {
          matchesStatus =
            rawStatus.includes(strVerified) && !rawStatus.includes(strUnverified);
        } else if (filterStatus === "REVIEW") {
          matchesStatus = rawStatus.includes(strReview);
        } else if (filterStatus === "UNVERIFIED") {
          matchesStatus =
            rawStatus.includes(strUnverified) || rawStatus.includes(strLocal);
        }
        return (
          matchesSearch &&
          matchesEquip &&
          matchesStatus &&
          matchesCategory &&
          matchesSubType
        );
      };
      if (mod.isVirtual) {
        const matchingFlavors = (mod.flavors || []).filter((f: any) => checkMatch(f));
        if (matchingFlavors.length > 0) {
          acc.push({ ...mod, flavors: matchingFlavors });
        }
      } else {
        if (checkMatch(mod)) {
          acc.push(mod);
        }
      }
      return acc;
    }, []);
    return res;
  }, [displayModList, searchQuery, filterStatus, equipFilter, activeCategory, activeSubType, activeSetMods, activeGameSchema, t]);

  return {
    searchQuery, setSearchQuery,
    filterStatus, setFilterStatus,
    equipFilter, setEquipFilter,
    activeCategory, setActiveCategory,
    activeSubType, setActiveSubType,
    expandedFolder, setExpandedFolder,
    filteredMods
  };
}
