import { useState, useMemo } from 'react';
import { isSupportedExtension } from '../shared';

export function useModFiltering(displayModList: any[], playSets: any[], activeSetName: string, activeGameSchema: any, t: any) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [equipFilter, setEquipFilter] = useState("ALL");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);

  const filteredMods = useMemo(() => {
    return displayModList.reduce((acc: any[], mod: any) => {
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
          name.includes(searchQuery.toLowerCase()) ||
          author.includes(searchQuery.toLowerCase());
        const activeSetMods =
          playSets.find((s: any) => s.name === activeSetName)?.mods || [];
        const isActuallyEquipped = activeSetMods.includes(m.name);
        const matchesEquip =
          equipFilter === "ALL" ||
          equipFilter === "ARCHIVES" ||
          (equipFilter === "EQUIPPED" && isActuallyEquipped) ||
          (equipFilter === "UNEQUIPPED" && !isActuallyEquipped);
        const modType = (m.category_override || m.type || "NONE").toUpperCase();
        const matchesCategory =
          activeCategory === "ALL" || modType === activeCategory.toUpperCase();
        const subType = (m.sub_type || "").toUpperCase();
        const matchesSubType =
          activeSubType === "ALL" || subType === activeSubType.toUpperCase();
        const rawStatus = (m.status || "").toLowerCase();
        const strVerified = (t("status_verified")).toLowerCase();
        const strReview = (t("status_under_review")).toLowerCase();
        const strUnverified = (t("status_unverified")).toLowerCase();
        const strLocal = (t("status_local_only")).toLowerCase();
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
  }, [displayModList, searchQuery, filterStatus, equipFilter, activeCategory, activeSubType, playSets, activeSetName, activeGameSchema, t]);

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
