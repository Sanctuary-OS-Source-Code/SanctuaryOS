import React from 'react';
import { createPortal } from 'react-dom';
import { ViewHeader, CustomDropdown, formatDisplayName, isVersionMatch, getHighestVersion, getLowestVersion, mapDlcCode, HubTabButton, standardButtonClass, standardDangerButtonClass, standardSuccessButtonClass, SidePanel, SidebarActionButton, getFileLabel, isSupportedExtension, getExtensionRegex, HoverTooltip, EmptyState, cleanSearchName, ActionButton } from "./shared";
import { useLexicon } from './LexiconContext';
import { CommandScreenLayout, CommandScreenStats, DashboardStatTile, CommandScreenBody, CommandScreenMain, CommandScreenSectionHeading, CommandScreenSidebar, CommandScreenQuickLink } from "./hub-components/SharedCommandScreenLayout";

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
      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
      />
      {localValue && (
        <button onClick={() => { setLocalValue(""); onChange(""); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
          <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
        </button>
      )}
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
  const localFolderCount = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]").length;
  const unverifiedCount = React.useMemo(() => displayModList.filter((m: any) => !m.isVirtual && !m.verified).length, [displayModList]);
  const selectedVersion = useStore((state) => state.selectedVersion);

  const [archiveVersionFilter, setArchiveVersionFilter] = React.useState<string>("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [hideGhostCards, setHideGhostCards] = React.useState(false);
  const [purgeTargetFiles, setPurgeTargetFiles] = React.useState<string[] | null>(null);
  const [activeLocalFolder, setActiveLocalFolder] = React.useState<string>("");
  const [isLocalFolderEditorOpen, setIsLocalFolderEditorOpen] = React.useState(false);
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
    return displayModList.filter((m: any) => {
      const isNormal = activeSetModsMemo.includes(m.name);
      if (isNormal) return true;
      return activeSetModsMemo.some((sm: string) =>
        sm.replace(/^(sanctuary[/\\])+/i, '') === m.name
      );
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
      const stored = localStorage.getItem("sanctuary_local_conflicts");
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

    const parsedActiveSetMods = activeSetMods.map((n: string) => {
      const cleanNLookup = n.replace(/^(sanctuary[/\\])+/i, '');
      const mData = modListIndex.byName.get(cleanNLookup) || modListIndex.namesAndDisplayNames.find((ne: any) => ne.name === cleanNLookup)?.orig;
      const cleanN = n.split(/[\\/]/).pop()?.replace(extRegex, "").toUpperCase();
      return { n, cleanNLookup, cleanN, mData };
    });

    return visibleMods.filter((mod: any) => {
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
              return parsedActiveSetMods.some(({ cleanNLookup, cleanN, mData }: any) => {
                if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
                if (c.enemy_name) {
                  const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase();
                  if (cleanN === targetClean || mData?.displayName?.toUpperCase() === targetClean) return true;
                }
                return false;
              });
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
          if (typeof mod.requiredDLC === 'string') rawDLC.push(...mod.requiredDLC.split(',').map((s: string) => s.trim()));
          else if (Array.isArray(mod.requiredDLC)) rawDLC.push(...mod.requiredDLC);
        }
        if (mod.flavors) {
          mod.flavors.forEach((f: any) => {
            if (f.requiredDLC) {
              const fDLC = typeof f.requiredDLC === 'string' ? f.requiredDLC.split(',').map((s: string) => s.trim()) : f.requiredDLC;
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
              return (mod.flavors || []).some((f: any) =>
                parsedActiveSetMods.some(({ n, cleanNLookup }: any) => n === f.name || cleanNLookup === f.name),
              );
            }
            if (anchor) {
              return equippedDisplayMods.some(
                (m: any) =>
                  !m.isVirtual &&
                  m.name &&
                  (String(m.familyId) === String(anchor) ||
                    String(m.dbId) === String(anchor) ||
                    String(m.setId) === String(anchor))
              );
            }
            return (mod.flavors || []).some((f: any) =>
              parsedActiveSetMods.some(({ n, cleanNLookup }: any) => n === f.name || cleanNLookup === f.name),
            );
          })()
          : parsedActiveSetMods.some(({ n, cleanNLookup }: any) => n === mod.name || cleanNLookup === mod.name);

        if (equipFilter === "EQUIPPED" && !isEquipped) return false;
        if (equipFilter === "UNEQUIPPED") {
          if (mod.isParent) {
            const allEquipped = mod.flavors?.every((f: any) => parsedActiveSetMods.some(({ n, cleanNLookup }: any) => n === f.name || cleanNLookup === f.name));
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

    // Create fast lookup maps for equipped mods
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

      // 1. Requirements
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

            // Fuzzy match: check all equipped mods
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

      // 2. Addons
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
        title={t("vault_title") || "YOUR VAULT"}
        subtitle={t("vault_subtitle") || "LOCAL LIBRARY, SECURED ASSETS, AND INSTALLED ARTIFACTS"}
        icon={t("icon_account_balance") || "account_balance"}
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
        <ActionButton
          icon={t("icon_checklist") || "checklist_rtl"}
          label={t("btn_select_assets") || "SELECT ASSETS"}
          onClick={() => { setEquipFilter("ALL"); setFilterStatus("ALL"); setIsBulkMode(true); }}
          className="h-12 px-6"
        />
      </ViewHeader>

      <VaultTabs t={t} equipFilter={equipFilter} setEquipFilter={setEquipFilter} />

      {equipFilter === "OVERVIEW" ? (
        <div className="mt-6">
          <CommandScreenLayout>
            <CommandScreenStats>
              <DashboardStatTile
                icon={<span className="material-symbols-outlined !text-4xl">inventory_2</span>}
                number={displayModList.length}
                label={t("title_artifacts") || "ALL SCHEMATICS"}
                colorClass="border-cyan-500/30 text-cyan-400 hover:border-cyan-500/60 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.05)]"
                onClick={() => { setEquipFilter("ALL"); setFilterStatus("ALL"); setActiveCategory("ALL"); setActiveSubType("ALL"); }}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined !text-4xl">check_circle</span>}
                number={equippedDisplayMods.length}
                label={t("filter_equipped") || "IN BLUEPRINT"}
                colorClass="border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] cursor-pointer"
                onClick={() => { setEquipFilter("EQUIPPED"); setFilterStatus("ALL"); setActiveCategory("ALL"); setActiveSubType("ALL"); }}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined !text-4xl">help</span>}
                number={unverifiedCount}
                label={t("status_unverified") || "UNVERIFIED"}
                colorClass="border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] hover:border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] cursor-pointer"
                onClick={() => { setEquipFilter("ALL"); setFilterStatus("UNVERIFIED"); setActiveCategory("ALL"); setActiveSubType("ALL"); }}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined !text-4xl">account_tree</span>}
                number={localFolderCount}
                label={t("local_folders") || "LOCAL NODES"}
                colorClass="border-purple-500/30 text-purple-400 hover:border-purple-500/60 bg-purple-500/10 hover:bg-purple-500/20 cursor-pointer shadow-[0_0_15px_rgba(168,85,247,0.05)]"
                onClick={() => { setEquipFilter("ALL"); setActiveCategory("LOCAL_FOLDERS"); }}
              />
            </CommandScreenStats>

            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading title="RECENT ARTIFACT INJECTIONS" icon="history" />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    {displayModList.filter((m: any) => !m.isVirtual).slice(0, 10).map((item: any, idx: number) => (
                      <div key={`recent-${idx}`} className="theme-glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col gap-4 hover:bg-white/5 hover:border-[var(--accent)]/30 transition-colors cursor-pointer group shadow-lg" onClick={() => { if (setActiveDossier) setActiveDossier(item); }}>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)]">
                            <span className="material-symbols-outlined !text-[24px]">
                              inventory_2
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[11px] font-black text-[var(--text)] truncate uppercase tracking-widest">{formatDisplayName(item.meta_name || item.name || item.title || "")}</span>
                            <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1">{item.meta_author || item.author || "SANCTUARY OS"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("quick_actions") || "QUICK ACTIONS"} icon="bolt">
                <div className="flex flex-col gap-4">
                  <CommandScreenQuickLink
                    icon={t("icon_checklist") || "checklist"}
                    title={t("bulk_override") || "BULK OVERRIDE"}
                    subtitle={t("bulk_desc") || "MASS SELECTION AND ACTION TARGETING"}
                    onClick={() => { setEquipFilter("ALL"); setFilterStatus("ALL"); setIsBulkMode(true); }}
                    textColorClass="text-emerald-500"
                    hoverTextColorClass="group-hover:text-emerald-400"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)] text-emerald-500"
                    iconBorderHoverClass="group-hover:border-emerald-500/30"
                  />

                  <CommandScreenQuickLink
                    icon={t("icon_delete_sweep") || "delete_sweep"}
                    title={t("purge_archives") || "PURGE ARCHIVES"}
                    subtitle={t("purge_desc") || "INITIATE IRREVERSIBLE PURGE OF THE SELECTED ARCHIVES FROM LOCAL STORAGE? THIS ACTION CANNOT BE ABORTED."}
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
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(244,63,94,0.5)] text-rose-500"
                    iconBorderHoverClass="group-hover:border-rose-500/30"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_auto_awesome") || "auto_awesome"}
                    title={t("nexus") || "NEXUS"}
                    subtitle={t("nexus_core") || "NEXUS CORE"}
                    onClick={() => useStore.getState().setView("nexus")}
                      textColorClass="text-amber-500"
                    hoverTextColorClass="group-hover:text-amber-400"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] text-amber-500"
                    iconBorderHoverClass="group-hover:border-amber-500/30"
                  />
                </div>
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>
      ) : (
        <div className="flex flex-col gap-6 w-full mt-6">
          <div className="flex flex-col xl:flex-row xl:items-center gap-4 shrink-0 border-b border-white/5 w-full">
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
            />
          </div>



          <VaultGrid
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
          />
        </div>
      )}

      <VaultModals
        isBulkMode={isBulkMode}
        setIsBulkMode={setIsBulkMode}
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
    </div>  );
});

export default Vault;
