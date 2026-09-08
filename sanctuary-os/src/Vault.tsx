import React from 'react';
import { createPortal } from 'react-dom';
import { ViewHeader, CustomDropdown, formatDisplayName, isVersionMatch, getHighestVersion, getLowestVersion, mapDlcCode, HubTabButton, standardButtonClass, standardDangerButtonClass, standardSuccessButtonClass, SidePanel, SidebarActionButton, getFileLabel, isSupportedExtension, getExtensionRegex, HoverTooltip, EmptyState, cleanSearchName, ActionButton, getModIcon, SearchBar, DashboardStatTile } from "./shared";
import { useLexicon } from './LexiconContext';
import { CommandScreenLayout, CommandScreenStats, CommandScreenBody, CommandScreenMain, CommandScreenSectionHeading, CommandScreenSidebar, CommandScreenQuickLink } from "./hub-components/SharedCommandScreenLayout";

import { VaultFilters } from "./hub-components/vault/VaultFilters";
import { VaultGrid } from "./hub-components/vault/VaultGrid";
import { VaultStats } from "./hub-components/vault/VaultStats";
import { VaultSidebar } from "./hub-components/vault/VaultSidebar";

import { VaultTabs } from "./hub-components/vault/VaultTabs";
import { VaultModals } from "./hub-components/vault/VaultModals";
import { invoke } from '@tauri-apps/api/core';
import { ModCard } from './ModCard';
import { useStore } from './store';
import { VaultToolsSidePanel, VaultLocalFolderEditorSidePanel } from './side-panels/VaultSidePanels';
import ConflictResolutionSidebar from "./side-panels/ConflictResolutionSidebar";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { supabase } from "./supabase";

function DebouncedSearchInput({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder: string }) {
  const [localValue, setLocalValue] = React.useState(value);
  const { t } = useLexicon();

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (localValue !== value) onChange(localValue);
    }, 300);
    return () => clearTimeout(handler);
  }, [localValue, onChange, value]);

  return (
    <div className="relative flex-1 min-w-[200px] w-full xl:max-w-[300px]">
      <SearchBar
        value={localValue}
        onChange={(v) => { setLocalValue(v); if (v === "") onChange(""); }}
        placeholder={placeholder}
        className="h-10 rounded-[calc(var(--radius)-4px)] w-full"
      />
    </div>
  );
}
const Vault = React.memo(function Vault(props: any) {
  const [isSidePanelOpen, setIsSidePanelOpen] = React.useState(false);
  const [activeTier3Conflict, setActiveTier3Conflict] = React.useState<any>(null);






  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const { applyConflictOverride } = usePlaySetLogic();
  const {
    isBulkMode, setIsBulkMode, selectedMods, setSelectedMods, setConfirmDialog,
    setStatus, runRadarSweep, setIsDropzoneOpen, setLocalFolderModal, playSets,
    equipFilter, setEquipFilter, searchQuery, setSearchQuery, filterStatus,
    setFilterStatus, activeCategory, setActiveCategory, activeSubType, setActiveSubType,
    visibleMods, displayModList, activePlaySetIndex, toggleInActiveSet,
    openUrl, setLocalFolderName, setLocalFolderType, executeHotSwap, equipPlaySet, setMetaNameInput,
    setMetaAuthorInput, setMetaVersionInput, setMetaUrlInput, setActiveDossier, setDrawerConfirmHash,
    quarantineList, restoreMod, purgeMod, ownedDLC, maskedDLC, setMetaDescInput,
    setMetaImageInput, setMetaAllowWriteInput, expandedFolder, setExpandedFolder,
    drawerConfirmHash,
    modList,
    anarchyRules,
    setBulkModal
  } = props;
  const { t } = useLexicon();
  const localFolderCount = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]").filter((s: any) => !s.isCollection).length;
  const unverifiedCount = React.useMemo(() => displayModList.filter((m: any) => !m.isVirtual && !m.verified).length, [displayModList]);
  const selectedVersion = useStore((state) => state.selectedVersion);
  const showImages = useStore((state: any) => state.showImages);


  const [archiveVersionFilter, setArchiveVersionFilter] = React.useState<string>("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [hideGhostCards, setHideGhostCards] = React.useState(false);
  const [vaultLayout, setVaultLayout] = React.useState<"standard" | "compact" | "list">("standard");
  const [purgeTargetFiles, setPurgeTargetFiles] = React.useState<{ file: string, name: string }[] | null>(null);
  const [activeLocalFolder, setActiveLocalFolder] = React.useState<string>("");
  const [bulkAddTarget, setBulkAddTarget] = React.useState<string | null>(null);
  const [isLocalFolderEditorOpen, setIsLocalFolderEditorOpen] = React.useState(false);
  const [vaultContextMenu, setVaultContextMenu] = React.useState<{ x: number, y: number, mod: any } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = React.useState<'blueprint' | 'folder' | null>(null);

  React.useEffect(() => {
    const handleOpenEditor = (e: any) => {
      setActiveLocalFolder(e.detail);
      setIsLocalFolderEditorOpen(true);
    };
    const handleOpenContextMenu = (e: any) => {
      setVaultContextMenu({ mod: e.detail.mod, x: e.detail.x, y: e.detail.y });
    };

    window.addEventListener('openLocalFolderEditor', handleOpenEditor);
    window.addEventListener('openVaultContextMenu', handleOpenContextMenu);

    const closeContextMenu = () => setVaultContextMenu(null);
    window.addEventListener('click', closeContextMenu);

    return () => {
      window.removeEventListener('openLocalFolderEditor', handleOpenEditor);
      window.removeEventListener('openVaultContextMenu', handleOpenContextMenu);
      window.removeEventListener('click', closeContextMenu);
    };
  }, []);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [renameFolderInput, setRenameFolderInput] = React.useState("");
  const itemsPerPage = 50;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [equipFilter, activeCategory, activeSubType, searchQuery, filterStatus, isBulkMode]);

  const activeSetModsMemo = React.useMemo(() => {
    return playSets[activePlaySetIndex]?.mods || [];
  }, [playSets, activePlaySetIndex]);

  const equippedDisplayMods = React.useMemo(() => {
    const normalSet = new Set(activeSetModsMemo);
    const cleanedSet = new Set(activeSetModsMemo.map((sm: string) => sm.replace(/^(sanctuary[/\\])+/i, '')));

    return displayModList.filter((m: any) => {
      return normalSet.has(m.name) || cleanedSet.has(m.name);
    });
  }, [displayModList, activeSetModsMemo]);

  const virtualFolderIds = React.useMemo(() => {
    const ids = new Set<string>();
    displayModList.forEach((v: any) => {
      if (v.isVirtual && v.dbId) {
        ids.add(String(v.dbId));
      }
    });
    return ids;
  }, [displayModList]);

  const localConflictsMemo = React.useMemo(() => {
    try {
      const stored = null;
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((lc: any) => ({
          ...lc,
          modAUpper: String(lc.modA || lc.mod_a || "").toUpperCase(),
          modBUpper: String(lc.modB || lc.mod_b || "").toUpperCase()
        }));
      }
    } catch (e) { }
    return [];
  }, []);

  const uppercaseEquippedMods = React.useMemo(() => {
    return equippedDisplayMods.map((mData: any) => {
      const nameRaw = String(mData.name || "").toUpperCase();
      return {
        mData,
        emClean: nameRaw,
        emBaseClean: nameRaw.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/i, "") || nameRaw,
        emDisp: String(mData.displayName || "").toUpperCase()
      };
    });
  }, [equippedDisplayMods]);

  const modListIndex = React.useMemo(() => {
    const byDbId = new Map();
    const byHash = new Map();
    const byInterchangeableId = new Map();
    const byName = new Map();
    const namesAndDisplayNames: { name: string, displayNameUpper: string, displayNameSpaced: string, orig: any, hash: string }[] = [];

    let hasMcCmdPkg = false;
    let hasMcCmdScript = false;

    modList.forEach((ml: any) => {
      if (!ml.isVirtual) {
        if (ml.dbId) byDbId.set(String(ml.dbId), ml);
        if (ml.hash) byHash.set(ml.hash, ml);
        if (ml.name) byName.set(ml.name, ml);
        if (ml.interchangeableIds) {
          ml.interchangeableIds.forEach((id: string) => {
            byInterchangeableId.set(String(id), ml);
          });
        }

        const dn = ml.displayName || "";
        namesAndDisplayNames.push({
          name: ml.name || "",
          displayNameUpper: dn.toUpperCase(),
          displayNameSpaced: dn.toUpperCase().replace(/_/g, " "),
          hash: ml.hash,
          orig: ml
        });
      }

      if (ml.name?.toLowerCase().includes("mc_cmd_center")) {
        if (ml.name.toLowerCase().endsWith(".package")) hasMcCmdPkg = true;
        if (ml.name.toLowerCase().endsWith(".ts4script")) hasMcCmdScript = true;
      }
    });

    return { byDbId, byHash, byInterchangeableId, byName, namesAndDisplayNames, mcCmdCenter: { hasPkg: hasMcCmdPkg, hasScript: hasMcCmdScript } };
  }, [modList]);


  const finalVisibleMods = React.useMemo(() => {
    const activeSetMods = playSets[activePlaySetIndex]?.mods || [];
    const extRegex = getExtensionRegex(activeGameSchema);

    const parsedActiveSetModIds = new Set();
    const parsedActiveSetModNames = new Set();
    const parsedActiveSetModNamespaces = new Set();

    const parsedActiveSetMods = activeSetMods.map((n: string) => {
      const cleanNLookup = n.replace(/^(sanctuary[/\\])+/i, '');
      const mData = modListIndex.byName.get(cleanNLookup) || modListIndex.namesAndDisplayNames.find((ne: any) => ne.name === cleanNLookup)?.orig;
      const cleanN = n.split(/[\\/]/).pop()?.replace(extRegex, "").toUpperCase();

      if (mData?.dbId) parsedActiveSetModIds.add(String(mData.dbId));
      if (cleanN) parsedActiveSetModNames.add(cleanN);
      if (mData?.displayName) parsedActiveSetModNames.add(mData.displayName.toUpperCase());

      parsedActiveSetModNamespaces.add(n);
      parsedActiveSetModNamespaces.add(cleanNLookup);

      return { n, cleanNLookup, cleanN, mData };
    });

    const equippedDisplayModFamilies = new Set();
    const equippedDisplayModDbIds = new Set();
    const equippedDisplayModSetIds = new Set();
    equippedDisplayMods.forEach((m: any) => {
      if (!m.isVirtual && m.name) {
        if (m.familyId) equippedDisplayModFamilies.add(String(m.familyId));
        if (m.dbId) equippedDisplayModDbIds.add(String(m.dbId));
        if (m.setId) equippedDisplayModSetIds.add(String(m.setId));
      }
    });

    return visibleMods.filter((mod: any) => {
      const modNameUpper = String(mod.displayName || mod.meta_name || mod.name || mod.title || "").toUpperCase().trim();
      const baseModName = modNameUpper.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || modNameUpper;
      if (baseModName === "FILTERS") return false;

      let modGameVersions: string[] = [];
      if (mod.isVirtual) {
        modGameVersions = Array.from(new Set((mod.flavors || []).flatMap((f: any) => {
          const v = f.compatible_versions;
          if (!v) return [];
          if (typeof v === 'string') return v.split(',').map((s: string) => s.trim()).filter(Boolean);
          return Array.isArray(v) ? v : [];
        }))).filter(Boolean) as string[];
      } else {
        const v = mod.compatible_versions;
        if (typeof v === 'string') {
          modGameVersions = v.split(',').map((s: string) => s.trim()).filter(Boolean);
        } else {
          modGameVersions = Array.isArray(v) ? v : [];
        }
      }

      let isCompatibleWithOS = true;
      if (selectedVersion && selectedVersion !== "") {
        if (mod.isVirtual && mod.isLocalOverride && (!mod.flavors || mod.flavors.length === 0)) {
          isCompatibleWithOS = true;
        } else {
          isCompatibleWithOS = isVersionMatch(modGameVersions, selectedVersion);
        }
      }

      if (hideGhostCards) {
        if (!isCompatibleWithOS) return false;
        if (mod.isGhosted) return false;
        if (mod.missingReqs && mod.missingReqs.length > 0) return false;

        let isBroken = false;
        const checkBroken = (mObj: any) => {
          let broken = typeof mObj.status === 'string' && mObj.status.toLowerCase() === 'broken';
          if (broken && mObj.compatible_versions && mObj.compatible_versions.length > 0 && selectedVersion) {
            if (selectedVersion !== getHighestVersion(typeof mObj.compatible_versions === 'string' ? mObj.compatible_versions.split(',').map((s: string) => s.trim()) : mObj.compatible_versions)) {
              broken = false;
            }
          }
          return broken;
        };

        if (mod.isVirtual && mod.flavors) {
          if (mod.flavors.length > 0 && mod.flavors.every(checkBroken)) isBroken = true;
        } else {
          isBroken = checkBroken(mod);
        }

        if (isBroken) return false;

        let hasTier4Conflict = false;

        const checkConflictsFilter = (mObj: any) => {
          if (mObj.conflicts && mObj.conflicts.length > 0) {
            const hasConflict = mObj.conflicts.some((c: any) => {
              if (c.severity_rank != 4) return false;
              if (c.enemy_id && parsedActiveSetModIds.has(String(c.enemy_id))) return true;
              if (c.enemy_name) {
                const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase();
                if (parsedActiveSetModNames.has(targetClean)) return true;
              }
              return false;
            });
            if (hasConflict) hasTier4Conflict = true;
          }
        };

        checkConflictsFilter(mod);
        if (mod.isVirtual && mod.flavors) {
          mod.flavors.forEach(checkConflictsFilter);
        }

        if (hasTier4Conflict) return false;

        let rawDLC: string[] = [];
        if (mod.requiredDLC) {
          if (typeof mod.requiredDLC === 'string') {
            try { rawDLC.push(...JSON.parse(mod.requiredDLC)); }
            catch { rawDLC.push(...mod.requiredDLC.replace(/[\{\}\[\]]/g, '').split(',').map((s: string) => s.replace(/^"/, '').replace(/"$/, '').trim())); }
          }
          else if (Array.isArray(mod.requiredDLC)) rawDLC.push(...mod.requiredDLC);
        }
        if (mod.flavors) {
          mod.flavors.forEach((f: any) => {
            if (f.requiredDLC) {
              let fDLC = f.requiredDLC;
              if (typeof f.requiredDLC === 'string') {
                try { fDLC = JSON.parse(f.requiredDLC); }
                catch { fDLC = f.requiredDLC.replace(/[\{\}\[\]]/g, '').split(',').map((s: string) => s.replace(/^"/, '').replace(/"$/, '').trim()); }
              }
              if (Array.isArray(fDLC)) fDLC.forEach((d: string) => { if (!rawDLC.includes(d)) rawDLC.push(d); });
            }
          });
        }
        const missingPacks = rawDLC.filter((p: string) => {
          const baseCode = p.split(' ')[0].toUpperCase();
          return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
        });
        if (missingPacks.length > 0) return false;
      }

      const isSandboxMod = mod.hash?.startsWith('dev_vault_') || (typeof mod.status === 'string' && mod.status.toUpperCase().includes('SANDBOX')) || (mod.physical_path && (mod.physical_path.toLowerCase().includes('/dev/') || mod.physical_path.toLowerCase().includes('\\dev\\')));
      if (equipFilter === "DEV") {
        if (!isSandboxMod) return false;
      } else if (equipFilter !== "EQUIPPED" && isSandboxMod) {
        return false;
      }

      if (equipFilter === "ARCHIVES") {
        if (isCompatibleWithOS) return false;
        if (archiveVersionFilter && archiveVersionFilter !== "") {
          let highestArchiveVer = "0.0.0";
          if (mod.isVirtual) {
            const highestPerFlavor = (mod.flavors || []).map((f: any) => {
              const v = f.compatible_versions;
              const arr = typeof v === 'string' ? v.split(',').map((s: string) => s.trim()) : (v || []);
              return getHighestVersion(arr);
            });
            highestArchiveVer = getLowestVersion(highestPerFlavor);
          } else {
            highestArchiveVer = getHighestVersion(modGameVersions);
          }

          const isCompatibleWithArchive = isVersionMatch([highestArchiveVer], archiveVersionFilter);
          if (!isCompatibleWithArchive) return false;
        }
      } else {
        if (!isCompatibleWithOS) return false;
      }

      if (equipFilter === "EQUIPPED" || equipFilter === "UNEQUIPPED") {
        const isEquipped = mod.isParent
          ? (() => {
            const anchor = mod.dbId || mod.familyId;
            if (mod.isFlavorFolder) {
              return (mod.flavors || []).some((f: any) => parsedActiveSetModNamespaces.has(f.name));
            }
            if (anchor) {
              const sAnchor = String(anchor);
              return equippedDisplayModFamilies.has(sAnchor) || equippedDisplayModDbIds.has(sAnchor) || equippedDisplayModSetIds.has(sAnchor);
            }
            return (mod.flavors || []).some((f: any) => parsedActiveSetModNamespaces.has(f.name));
          })()
          : parsedActiveSetModNamespaces.has(mod.name);

        if (equipFilter === "EQUIPPED" && !isEquipped) return false;
        if (equipFilter === "UNEQUIPPED") {
          if (mod.isParent) {
            const allEquipped = mod.flavors?.every((f: any) => parsedActiveSetModNamespaces.has(f.name));
            if (allEquipped) return false;
          } else {
            if (isEquipped) return false;
          }
        }
      }

      if (mod.isVirtual) return true;
      const folderExists = (mod.familyId && virtualFolderIds.has(String(mod.familyId))) || (mod.setId && virtualFolderIds.has(String(mod.setId)));
      return !folderExists;
    });
  }, [visibleMods, selectedVersion, hideGhostCards, playSets, activePlaySetIndex, activeGameSchema, equipFilter, archiveVersionFilter, ownedDLC, maskedDLC, virtualFolderIds, equippedDisplayMods, modListIndex]);

  const totalPages = Math.max(1, Math.ceil(finalVisibleMods.length / itemsPerPage));
  const dependencyGraph = React.useMemo(() => {
    const tStart = performance.now();
    const graph = new Map<string, any[]>();

    const equippedByName = new Map<string, any>();
    const equippedById = new Map<string, any>();
    const equippedByHash = new Map<string, any>();
    const equippedByFuzzy = new Map<string, any>();
    const equippedByFamily = new Map<string, any>();

    equippedDisplayMods.forEach((m: any) => {
      equippedByName.set(m.name, m);
      if (m.dbId) equippedById.set(String(m.dbId), m);
      if (m.hash) equippedByHash.set(m.hash, m);
      if (m.familyId) equippedByFamily.set(String(m.familyId), m);
      if (m.interchangeableIds) {
        m.interchangeableIds.forEach((id: string) => equippedById.set(String(id), m));
      }
      if (m.displayName) {
        const upper = m.displayName.toUpperCase();
        equippedByFuzzy.set(upper, m);
        equippedByFuzzy.set(upper.replace(/_/g, " "), m);
      }
    });

    equippedDisplayMods.forEach((m: any) => {
      let deps = new Set<any>();

      if (m.requirements) {
        m.requirements.forEach((r: any) => {
          const reqIdStr = typeof r === 'string' ? r : r.id || r.dbId;
          const reqName = typeof r === 'string' ? r : r.name;
          let provider = null;

          if (reqIdStr) {
            provider = equippedById.get(String(reqIdStr)) || equippedByHash.get(String(reqIdStr));
          }

          if (!provider && reqName && isNaN(Number(reqName))) {
            const reqBaseName = reqName.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "").toUpperCase();

            for (const [key, p] of equippedByFuzzy.entries()) {
              if (key.includes(reqBaseName)) {
                provider = p;
                break;
              }
            }
          }

          if (provider && provider.name !== m.name) deps.add(provider);
        });
      }

      if (m.relationshipType === 'addon' && m.familyId) {
        const provider = equippedByFamily.get(String(m.familyId));
        if (provider && provider.relationshipType !== 'addon' && provider.name !== m.name) {
          deps.add(provider);
        }
      }

      deps.forEach((provider: any) => {
        let arr = graph.get(provider.name);
        if (!arr) { arr = []; graph.set(provider.name, arr); }
        arr.push(m);
      });
    });
    return graph;
  }, [equippedDisplayMods]);

  const paginatedMods = finalVisibleMods.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex-1 overflow-visible pr-4 relative">
      <ViewHeader
        title={t("vault_title")}
        subtitle={t("vault_subtitle")}
        icon={<span className="material-symbols-outlined !text-3xl text-[var(--accent)]">{t("icon_account_balance")}</span>}
        breadcrumb={equipFilter !== "OVERVIEW" ? (t(`filter_${equipFilter.toLowerCase()}`) || equipFilter) : undefined}
        onTitleClick={() => setEquipFilter("OVERVIEW")}
      >
        {equipFilter !== "OVERVIEW" && (
          <VaultFilters
            t={t}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            activeSubType={activeSubType}
            setActiveSubType={setActiveSubType}
            activeGameSchema={activeGameSchema}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            equipFilter={equipFilter}
            setEquipFilter={setEquipFilter}
            archiveVersionFilter={archiveVersionFilter}
            setArchiveVersionFilter={setArchiveVersionFilter}
            displayModList={displayModList}
            selectedVersion={selectedVersion}
            hideGhostCards={hideGhostCards}
            setHideGhostCards={setHideGhostCards}
            vaultLayout={vaultLayout}
            setVaultLayout={setVaultLayout}
            onCreateLocalFolder={() => {
              const localSets = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]");
              const newId = `f_${Date.now()}`;
              localSets.push({
                id: newId,
                name: "",
                items: [],
                isCollection: false
              });
              localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(localSets));
              setActiveLocalFolder(newId);
              setIsLocalFolderEditorOpen(true);
              runRadarSweep(true);
            }}
            setSelectedMods={setSelectedMods}
          />
        )}
      </ViewHeader>

      <VaultTabs t={t} equipFilter={equipFilter} setEquipFilter={setEquipFilter} />

      {equipFilter === "OVERVIEW" ? (
        <div className="mt-6">
          <CommandScreenLayout>
            <CommandScreenStats>
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_inventory_2")}</span>}
                number={displayModList.length}
                label={t("title_artifacts")}
                colorClass="text-cyan-400 cursor-pointer"
                onClick={() => { setEquipFilter("ALL"); setFilterStatus("ALL"); setActiveCategory("ALL"); setActiveSubType("ALL"); }}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_check_circle")}</span>}
                number={equippedDisplayMods.length}
                label={t("filter_equipped")}
                colorClass="text-[var(--success)] cursor-pointer"
                onClick={() => { setEquipFilter("EQUIPPED"); setFilterStatus("ALL"); setActiveCategory("ALL"); setActiveSubType("ALL"); }}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_warning")}</span>}
                number={unverifiedCount}
                label={t("status_unverified")}
                colorClass="text-[var(--warning)] cursor-pointer"
                onClick={() => { setEquipFilter("ALL"); setFilterStatus("UNVERIFIED"); setActiveCategory("ALL"); setActiveSubType("ALL"); }}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined ">{t("icon_folder_shared")}</span>}
                number={localFolderCount}
                label={t("local_folders")}
                colorClass="text-purple-400 cursor-pointer"
                onClick={() => { setEquipFilter("ALL"); setActiveCategory("LOCAL_FOLDERS"); }}
              />
            </CommandScreenStats>

            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading title="Recent Artifact Injections" icon="history" />

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6 w-full">
                    {displayModList.filter((mod: any) => {
                      const modNameUpper = String(mod.displayName || mod.meta_name || mod.name || mod.title || "").toUpperCase().trim();
                      const baseModName = modNameUpper.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || modNameUpper;
                      if (baseModName === "FILTERS") return false;

                      if (mod.isVirtual) {
                        if (["DATA", "SCRIPTS", "CFG", "CONFIG", "MOD", "MODS"].includes(modNameUpper)) return false;
                        if (modNameUpper.startsWith("FOLDER LOCAL DIR")) return false;

                        if (mod.isCollection) return true;
                        if (mod.isParent && mod.flavors && mod.flavors.some((f: any) => ["twin", "beta", "addon"].includes(f.relationshipType))) return true;
                        return false;
                      }
                      const folderExists = (mod.familyId && virtualFolderIds.has(String(mod.familyId))) || (mod.setId && virtualFolderIds.has(String(mod.setId)));
                      return !folderExists;
                    }).slice(0, 20).map((item: any, idx: number) => (
                      <div key={`recent-${idx}`} className="relative flex flex-col h-full glass-panel rounded-[inherit] transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group" onClick={() => {
                        if (item.isVirtual && item.isLocalOverride && !item.isCollection) {
                          const targetId = item.dbId || item.familyId || item.setId;
                          if (targetId) window.dispatchEvent(new CustomEvent('openLocalFolderEditor', { detail: targetId }));
                        } else if (setActiveDossier) {
                          setActiveDossier(item);
                        }
                      }}>
                        <div
                          className="relative z-20 h-32 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden [transform:translateZ(0)]"
                          style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' }}
                        >
                          {(showImages !== false && (item.meta_image || item.image_url)) ? (
                            <img
                              src={item.meta_image || item.image_url}
                              alt={item.meta_name || item.name || item.title}
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700"
                              style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '80px' }}>
                              {getModIcon(item, activeGameSchema, t)}
                            </span>
                          )}

                          <div className="absolute top-3 right-3 flex gap-2 z-30">
                            <span className="text-[8px] font-black px-2 py-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[3px] rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] capitalize tracking-widest">
                              {t("tab_mods")}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 flex flex-col flex-1">
                          <h3 className="text-[11px] font-black truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                            {formatDisplayName(item.displayName || item.meta_name || item.name || item.title || "")}
                          </h3>
                          <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate mb-2">
                            BY {item.meta_author || item.author || t("unknown_mason")}
                          </p>

                          <div className="mt-auto pt-3 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                            <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">
                              {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                            </span>
                            <span className="text-[9px] font-black theme-text-accent capitalize opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">{t("btn_view")} &rarr;</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("quick_actions")} icon="bolt">
                <div className="flex flex-col gap-4">
                  <CommandScreenQuickLink
                    icon={t("icon_create_new_folder")}
                    title={t("quick_create_node")}
                    subtitle={t("quick_create_node_desc")}
                    onClick={() => {
                      const localSets = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]");
                      const newId = `f_${Date.now()}`;
                      localSets.push({
                        id: newId,
                        name: "",
                        items: [],
                        isCollection: false
                      });
                      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(localSets));
                      setActiveLocalFolder(newId);
                      setIsLocalFolderEditorOpen(true);
                      runRadarSweep(true);
                    }}
                    textColorClass="text-purple-500"
                    hoverTextColorClass="group-hover:text-purple-400"
                    iconShadowClass="drop-shadow-md text-purple-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                  />

                  <CommandScreenQuickLink
                    icon={t("icon_delete_sweep")}
                    title={t("purge_archives")}
                    subtitle={t("purge_desc")}
                    onClick={() => {
                      const allFilesToPurge = new Map<string, string>();
                      displayModList.forEach((mod: any) => {
                        let modGameVersions: string[] = [];
                        if (mod.isVirtual) {
                          modGameVersions = Array.from(new Set((mod.flavors || []).flatMap((f: any) => {
                            const v = f.compatible_versions;
                            if (!v) return [];
                            if (typeof v === 'string') return v.split(',').map((s: string) => s.trim()).filter(Boolean);
                            return Array.isArray(v) ? v : [];
                          }))).filter(Boolean) as string[];
                        } else {
                          const v = mod.compatible_versions;
                          if (typeof v === 'string') {
                            modGameVersions = v.split(',').map((s: string) => s.trim()).filter(Boolean);
                          } else {
                            modGameVersions = Array.isArray(v) ? v : [];
                          }
                        }

                        let isCompatibleWithOS = true;
                        if (selectedVersion && selectedVersion !== "") {
                          isCompatibleWithOS = isVersionMatch(modGameVersions, selectedVersion);
                        }

                        if (!isCompatibleWithOS || mod.status === 'outdated' || mod.status === 'unverified') {
                          if (mod.isVirtual && mod.flavors) {
                            mod.flavors.forEach((f: any) => {
                              if (f.name) allFilesToPurge.set(f.name, mod.displayName || mod.name);
                            });
                          } else if (mod.name) {
                            allFilesToPurge.set(mod.name, mod.displayName || mod.name);
                          }
                        }
                      });
                      setPurgeTargetFiles(Array.from(allFilesToPurge.entries()).map(([file, name]) => ({ file, name })) as any);
                    }}
                    danger={true}
                    textColorClass="text-rose-500"
                    hoverTextColorClass="group-hover:text-rose-400"
                    iconShadowClass="drop-shadow-md text-rose-500"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_auto_awesome")}
                    title={t("nexus")}
                    subtitle={t("nexus_core")}
                    onClick={() => useStore.getState().setView("nexus")}
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
      ) : (
        <div className="flex flex-col gap-4 w-full mt-2">
          <VaultGrid
            vaultLayout={vaultLayout}
            paginatedMods={paginatedMods}
            t={t}
            playSets={playSets}
            activePlaySetIndex={activePlaySetIndex}
            activeGameSchema={activeGameSchema}
            anarchyRules={anarchyRules}
            isBulkMode={isBulkMode}
            selectedMods={selectedMods}
            setDrawerConfirmHash={setDrawerConfirmHash}
            toggleInActiveSet={toggleInActiveSet}
            isVersionMatch={isVersionMatch}
            selectedVersion={selectedVersion}
            setMetaNameInput={setMetaNameInput}
            setMetaAuthorInput={setMetaAuthorInput}
            setMetaVersionInput={setMetaVersionInput}
            setMetaDescInput={setMetaDescInput}
            setMetaImageInput={setMetaImageInput}
            setMetaAllowWriteInput={setMetaAllowWriteInput}
            setActiveDossier={setActiveDossier}
            drawerConfirmHash={drawerConfirmHash}
            setIsDropzoneOpen={setIsDropzoneOpen}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            totalPages={Math.max(1, Math.ceil(finalVisibleMods.length / itemsPerPage))}
            equippedDisplayMods={equippedDisplayMods}
            modListIndex={modListIndex}
            dependencyGraph={dependencyGraph}
            uppercaseEquippedMods={uppercaseEquippedMods}
            localConflictsMemo={localConflictsMemo}
            ownedDLC={ownedDLC}
            maskedDLC={maskedDLC}
            displayModList={displayModList}
            supabase={supabase}
            setMetaUrlInput={setMetaUrlInput}
            applyConflictOverride={applyConflictOverride}
            setActiveTier3Conflict={setActiveTier3Conflict}
            expandedFolder={expandedFolder}
            setExpandedFolder={setExpandedFolder}
            hideGhostCards={hideGhostCards}
            setSelectedMods={setSelectedMods}
            setActiveLocalFolder={setActiveLocalFolder}
            setIsLocalFolderEditorOpen={setIsLocalFolderEditorOpen}
            onContextMenu={(e: any, mod: any) => {
              setVaultContextMenu({ x: e.clientX, y: e.clientY, mod });
            }}
          />
        </div>
      )}

      <VaultToolsSidePanel
        activeTier3Conflict={activeTier3Conflict}
        setActiveTier3Conflict={setActiveTier3Conflict}
        applyConflictOverride={applyConflictOverride}
      />

      <VaultLocalFolderEditorSidePanel
        isOpen={isLocalFolderEditorOpen}
        onClose={() => setIsLocalFolderEditorOpen(false)}
        activeLocalFolder={activeLocalFolder}
        setActiveLocalFolder={setActiveLocalFolder}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        renameFolderInput={renameFolderInput}
        setRenameFolderInput={setRenameFolderInput}
        runRadarSweep={runRadarSweep}
        displayModList={displayModList}
        setIsBulkMode={setIsBulkMode}
        setBulkAddTarget={setBulkAddTarget}
      />

      <VaultModals
        isBulkMode={isBulkMode}
        setIsBulkMode={setIsBulkMode}
        bulkAddTarget={bulkAddTarget}
        setBulkAddTarget={setBulkAddTarget}
        t={t}
        selectedMods={selectedMods}
        setSelectedMods={setSelectedMods}
        displayModList={displayModList}
        setBulkModal={setBulkModal}
        setLocalFolderModal={setLocalFolderModal}
        finalVisibleMods={finalVisibleMods}
        setPurgeTargetFiles={setPurgeTargetFiles}
        purgeTargetFiles={purgeTargetFiles}
        setStatus={setStatus}
        runRadarSweep={runRadarSweep}
        isLocalFolderEditorOpen={isLocalFolderEditorOpen}
        setIsLocalFolderEditorOpen={setIsLocalFolderEditorOpen}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        renameFolderInput={renameFolderInput}
        setRenameFolderInput={setRenameFolderInput}
        activeLocalFolder={activeLocalFolder}
        setActiveLocalFolder={setActiveLocalFolder}
        activeTier3Conflict={activeTier3Conflict}
        setActiveTier3Conflict={setActiveTier3Conflict}
        applyConflictOverride={applyConflictOverride}
        playSets={playSets}
        activePlaySetIndex={activePlaySetIndex}
      />

      {vaultContextMenu && createPortal(
        <div
          style={{
            position: "fixed",
            left: Math.min(vaultContextMenu.x, window.innerWidth - 320),
            top: Math.min(vaultContextMenu.y, window.innerHeight - 300),
            zIndex: 120000
          }}
          className="flex flex-col min-w-[240px] max-w-[320px] animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div className="absolute inset-0 rounded-[inherit] -z-10">
            <div className="w-full h-full glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl rounded-xl" />
          </div>
          <div className="py-1 flex flex-col w-full h-full">
            {(() => {
              const targetMods = selectedMods.includes(vaultContextMenu.mod.name) ? selectedMods : [vaultContextMenu.mod.name];
              const count = targetMods.length;
              const openSubmenuLeft = vaultContextMenu.x > window.innerWidth - 480;
              return (
                <>
                  <div className="px-4 py-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] mb-2 overflow-hidden">
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-60 truncate block w-full">
                      {count > 1 ? `${count} ARTIFACTS SELECTED` : (vaultContextMenu.mod.displayName || vaultContextMenu.mod.name)}
                    </span>
                  </div>

                  {vaultContextMenu.mod.name?.startsWith('LOCAL_SET_') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const setId = vaultContextMenu.mod.name.replace('LOCAL_SET_', '');
                        setActiveLocalFolder(setId);
                        setIsLocalFolderEditorOpen(true);
                        setVaultContextMenu(null);
                      }}
                      className="w-[calc(100%-8px)] mx-1 rounded-md text-left px-3 py-2 hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[11px] font-black capitalize tracking-widest text-[var(--accent)] flex items-center gap-3 transition-colors mb-1"
                    >
                      <span className="material-symbols-outlined !text-[16px]">edit</span>
                      {t("manage_node")}
                    </button>
                  )}

                  <div
                    className="relative"
                    onMouseEnter={() => setActiveSubmenu('blueprint')}
                    onMouseLeave={() => setActiveSubmenu(null)}
                  >
                    <button className="w-[calc(100%-8px)] mx-1 rounded-md text-left px-3 py-2 hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[11px] font-bold capitalize tracking-widest text-[var(--text)] flex items-center justify-start transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_architecture")}</span>
                        {t("add_to_blueprint")}
                      </div>
                      <span className="material-symbols-outlined !text-[16px] opacity-50">{t("icon_chevron_right")}</span>
                    </button>
                    {activeSubmenu === 'blueprint' && (
                      <div className={`absolute top-0 w-56 pt-0 z-50 ${openSubmenuLeft ? 'right-full pr-1' : 'left-full pl-1'}`}>
                        <div className="w-full h-full glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl rounded-xl py-1 animate-in fade-in zoom-in-95 duration-100">
                          <button onClick={(e) => { e.stopPropagation(); setVaultContextMenu(null); setActiveSubmenu(null); setBulkModal(true); }} className="w-[calc(100%-8px)] mx-1 rounded-md text-left px-3 py-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-3"><span className="material-symbols-outlined !text-[14px]">{t("icon_add")}</span>{t("context_new_blueprint")}</button>
                          <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] my-1" />
                          {playSets.map((ps: any, index: number) => (
                            <button key={index} onClick={(e) => { e.stopPropagation(); setVaultContextMenu(null); setActiveSubmenu(null); invoke('add_to_play_set', { index, modNames: targetMods }).then(() => runRadarSweep(true)); }} className="w-[calc(100%-8px)] mx-1 rounded-md text-left px-3 py-2 hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[10px] font-bold capitalize tracking-widest text-[var(--accent)] truncate block">{ps.name}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    className="relative"
                    onMouseEnter={() => setActiveSubmenu('folder')}
                    onMouseLeave={() => setActiveSubmenu(null)}
                  >
                    <button className="w-[calc(100%-8px)] mx-1 rounded-md text-left px-3 py-2 hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[11px] font-bold capitalize tracking-widest text-[var(--text)] flex items-center justify-start transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">{t("icon_folder")}</span>
                        {t("btn_group_folder")}
                      </div>
                      <span className="material-symbols-outlined !text-[16px] opacity-50">{t("icon_chevron_right")}</span>
                    </button>
                    {activeSubmenu === 'folder' && (
                      <div className={`absolute top-0 w-56 pt-0 z-50 ${openSubmenuLeft ? 'right-full pr-1' : 'left-full pl-1'}`}>
                        <div className="w-full h-full glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl rounded-xl py-1 animate-in fade-in zoom-in-95 duration-100">
                          <button onClick={(e) => {
                            e.stopPropagation(); setVaultContextMenu(null); setActiveSubmenu(null);
                            const localSts = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]");
                            const newId = `f_${Date.now()}`;
                            localSts.push({ id: newId, name: "", items: [], isCollection: false });
                            localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(localSts));
                            setActiveLocalFolder(newId);
                            setIsLocalFolderEditorOpen(true);
                            runRadarSweep(true);
                          }} className="w-[calc(100%-8px)] mx-1 rounded-md text-left px-3 py-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-3"><span className="material-symbols-outlined !text-[14px]">{t("icon_add")}</span>{t("context_new_folder")}</button>
                          <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] my-1" />
                          {(() => {
                            const localSts = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]");
                            if (localSts.length === 0) return <div className="px-4 py-2 text-[9px] font-bold text-[var(--subtext)] opacity-50">{t("local_folders_empty")}</div>;
                            return localSts.map((ls: any) => (
                              <button key={ls.id} onClick={(e) => {
                                e.stopPropagation();
                                const newHashes = targetMods.map((name: string) => displayModList.find((m: any) => m.name === name)?.hash).filter(Boolean);
                                const updatedSets = localSts.map((s: any) => s.id === ls.id ? { ...s, items: Array.from(new Set([...s.items, ...newHashes])) } : s);
                                localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(updatedSets));
                                setVaultContextMenu(null);
                                setActiveSubmenu(null);
                                runRadarSweep(true);
                              }} className="w-[calc(100%-8px)] mx-1 rounded-md text-left px-3 py-2 hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[10px] font-bold capitalize tracking-widest text-[var(--success)] truncate block">{ls.name}</button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {!(vaultContextMenu.mod.isVirtual && vaultContextMenu.mod.isLocalOverride && !vaultContextMenu.mod.isCollection) && (
                    <>
                      <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_5%,transparent)] my-2" />
                      <button
                        onClick={() => {
                          setVaultContextMenu(null);
                          const allFilesToPurge = new Map<string, string>();
                          targetMods.forEach((modName: string) => {
                            const modObj = displayModList.find((m: any) => m.name === modName);
                            if (modObj && modObj.isVirtual && modObj.flavors) {
                              modObj.flavors.forEach((f: any) => { if (f.name) allFilesToPurge.set(f.name, modObj.displayName || modObj.name); });
                            } else {
                              allFilesToPurge.set(modName, modObj?.displayName || modName);
                            }
                          });
                          setPurgeTargetFiles(Array.from(allFilesToPurge.entries()).map(([file, name]) => ({ file, name })));
                        }}
                        className="w-[calc(100%-8px)] mx-1 rounded-md text-left px-3 py-2 hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[11px] font-bold capitalize tracking-widest text-[var(--danger)] flex items-center gap-3 transition-colors"
                      >
                        <span className="material-symbols-outlined !text-[16px]">{t("icon_delete_forever")}</span>
                        {t("context_purge")} {count > 1 ? t("context_artifacts") : t("context_artifact")}
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>, document.body
      )}
    </div>);
});

export default Vault;



