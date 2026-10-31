import { useState, useMemo, useDeferredValue } from 'react';
import { isSupportedExtension } from '../shared';

export function useModFiltering(displayModList: any[], _playSets: any[], _activeSetName: string, activeGameSchema: any, t: any, isActive = true) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [equipFilter, setEquipFilter] = useState("OVERVIEW");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);

  const filteredMods = useMemo(() => {
    if (!isActive) return displayModList;
    const searchLower = deferredSearchQuery.toLowerCase();
    const activeCatUpper = activeCategory.toUpperCase();
    const activeSubUpper = activeSubType.toUpperCase();
    const strStable = (t("status_stable", "STABLE")).toLowerCase();
    const strReview = (t("status_dd_review", "Under Review")).toLowerCase();
    const strUnverified = (t("unverified", "Unverified")).toLowerCase();
    const strLocal = (t("badge_local", "Local")).toLowerCase();

    const res = displayModList.reduce((acc: any[], mod: any) => {
      if (!mod) return acc;
      if (mod.isVirtual && (mod.hash?.startsWith("local_set_") || mod.name?.startsWith("LOCAL_SET_"))) {
        const dbIdStr = String(mod.dbId || "");
        if (!dbIdStr.startsWith("f_") && !dbIdStr.startsWith("local_")) {
          return acc;
        }
      }
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
          !searchLower ||
          name.includes(searchLower) ||
          author.includes(searchLower);
        const modType = (m.category_override || m.type || "NONE").toUpperCase();
        const matchesCategory =
          activeCategory === "ALL" || (activeCategory === "LOCAL_FOLDERS" ? ((m.isVirtual || mod.isVirtual) && (m.hash?.startsWith('local_set_') || mod.hash?.startsWith('local_set_')) && !(m.isCollection || mod.isCollection)) : modType === activeCatUpper);
        const subType = (m.sub_type || "").toUpperCase();
        const matchesSubType =
          activeSubType === "ALL" || subType === activeSubUpper;
        const rawStatus = (m.status || "").toLowerCase();
        
        let matchesStatus = false;
        if (filterStatus === "ALL") {
          matchesStatus = true;
        } else if (filterStatus === "STABLE") {
          matchesStatus =
            rawStatus.includes(strStable) && !rawStatus.includes(strUnverified);
        } else if (filterStatus === "REVIEW") {
          matchesStatus = rawStatus.includes(strReview);
        } else if (filterStatus === "UNVERIFIED") {
          matchesStatus =
            rawStatus.includes(strUnverified) || rawStatus.includes(strLocal);
        }
        return (
          matchesSearch &&
          matchesStatus &&
          matchesCategory &&
          matchesSubType
        );
      };
      if (mod.isVirtual) {
        const matchingFlavors = (mod.flavors || []).filter((f: any) => checkMatch(f));
        const selfMatches = checkMatch(mod);
        if (matchingFlavors.length > 0 || selfMatches) {
          acc.push({
            ...mod,
            flavors: matchingFlavors.length > 0 ? matchingFlavors : (mod.flavors || []),
          });
        }
      } else {
        if (checkMatch(mod)) {
          acc.push(mod);
        }
      }
      return acc;
    }, []);
    return res;
  }, [isActive, displayModList, deferredSearchQuery, filterStatus, activeCategory, activeSubType, activeGameSchema, t]);

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
