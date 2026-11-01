import React from 'react';
import { createPortal } from 'react-dom';
import { ViewHeader, formatDisplayName, isVersionMatch, getHighestVersion, getExtensionRegex, getModIcon, isSupportedExtension, stripPriorityTierPrefix, deduplicateBlueprintArtifacts } from "./shared";
import { formatCleanModTitle } from "./side-panels/CommandIncompatiblePanel";
import { useLexicon } from './LexiconContext';
import { CommandScreenLayout, CommandScreenBody, CommandScreenMain, CommandScreenSectionHeading, CommandScreenSidebar, CommandScreenQuickLink } from "./hub-components/SharedCommandScreenLayout";

import { VaultFilters } from "./hub-components/vault/VaultFilters";
import { VaultGrid } from "./hub-components/vault/VaultGrid";
import { VaultTabs } from "./hub-components/vault/VaultTabs";
import { VaultModals } from "./hub-components/vault/VaultModals";
import { invoke } from '@tauri-apps/api/core';
import { DynamicArtifactPreviewBanner } from './chameleon-components/ThemeCard';
import { useStore } from './store';
import {
  VaultToolsSidePanel,
  VaultLocalFolderEditorSidePanel,
  VaultVersionPoolSidePanel,
  ModVersionHistorySidePanel,
  ModVersionBinaryGroup,
  groupModVersionPoolItems,
  matchVersionGroupsForMod,
} from './side-panels/VaultSidePanels';
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { supabase } from "./supabase";


const Vault = React.memo(function Vault(props: any) {
  const [activeTier3Conflict, setActiveTier3Conflict] = React.useState<any>(null);






  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const { applyConflictOverride } = usePlaySetLogic();
  const { isBulkMode, setIsBulkMode, selectedMods, setSelectedMods, setStatus, runRadarSweep, setIsDropzoneOpen, setLocalFolderModal, playSets, setPlaySets, equipPlaySet, equipFilter, setEquipFilter, searchQuery, setSearchQuery, filterStatus, setFilterStatus, activeCategory, setActiveCategory, activeSubType, setActiveSubType, visibleMods, displayModList, activePlaySetIndex, toggleInActiveSet, setMetaNameInput, setMetaAuthorInput, setMetaVersionInput, setMetaUrlInput, setActiveDossier, setDrawerConfirmHash, ownedDLC, maskedDLC, setMetaDescInput, setMetaImageInput, setMetaAllowWriteInput, expandedFolder, setExpandedFolder, drawerConfirmHash, modList, anarchyRules, setBulkModal } = props;
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const localFolderCount = React.useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(`sanctuary_${activeWorkspaceId}_playsets`) || "[]").filter(
        (s: any) =>
          s &&
          s.id &&
          (String(s.id).startsWith("f_") || String(s.id).startsWith("local_")) &&
          Array.isArray(s.items) &&
          !Array.isArray(s.mods) &&
          !s.isCollection
      ).length;
    } catch {
      return 0;
    }
  }, [activeWorkspaceId, displayModList]);
  const selectedVersion = useStore((state) => state.selectedVersion);
  const showImages = useStore((state: any) => state.showImages);

  const [currentPage, setCurrentPage] = React.useState(1);
  const [hideGhostCards, setHideGhostCards] = React.useState(false);
  const [vaultLayout, setVaultLayout] = React.useState<"standard" | "compact" | "list">("standard");
  const [purgeTargetFiles, setPurgeTargetFiles] = React.useState<{ file: string, name: string }[] | null>(null);
  const [activeLocalFolder, setActiveLocalFolder] = React.useState<string>("");
  const [bulkAddTarget, setBulkAddTarget] = React.useState<string | null>(null);
  const [isLocalFolderEditorOpen, setIsLocalFolderEditorOpen] = React.useState(false);
  const [isVersionPoolOpen, setIsVersionPoolOpen] = React.useState(false);
  const [contextVersionTarget, setContextVersionTarget] = React.useState<any | null>(null);
  const [contextVersionGroups, setContextVersionGroups] = React.useState<ModVersionBinaryGroup[]>([]);
  const [vaultContextMenu, setVaultContextMenu] = React.useState<{ x: number, y: number, mod: any } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = React.useState<'blueprint' | 'folder' | null>(null);

  const openVersionsForMod = React.useCallback(async (targetMod: any) => {
    try {
      let vPath = useStore.getState().vaultPath;
      if (!vPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vPath = cfg?.vault_path || "";
      }
      if (!vPath) return;
      const res: any = await invoke("get_mod_version_pool_status", { vaultPath: vPath });
      const allGroups = groupModVersionPoolItems(res?.items || [], t);
      const matched = matchVersionGroupsForMod(targetMod, allGroups);
      if (matched.length > 0) {
        setContextVersionTarget(targetMod);
        setContextVersionGroups(matched);
      } else {
        setIsVersionPoolOpen(true);
      }
    } catch {
      setIsVersionPoolOpen(true);
    }
  }, [t]);

  const handleActivateContextVersion = React.useCallback(async (relPath: string, dnaHash: string) => {
    try {
      let vPath = useStore.getState().vaultPath;
      if (!vPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vPath = cfg?.vault_path || "";
      }
      if (!vPath) return;
      await invoke("activate_archived_mod_version", { vaultPath: vPath, relPath, dnaHash });
      if (contextVersionTarget) {
        await openVersionsForMod(contextVersionTarget);
      }
      runRadarSweep(false);
    } catch {}
  }, [contextVersionTarget, openVersionsForMod, runRadarSweep]);

  const handleDeleteContextVersion = React.useCallback(async (relPath: string, dnaHash: string) => {
    try {
      let vPath = useStore.getState().vaultPath;
      if (!vPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vPath = cfg?.vault_path || "";
      }
      if (!vPath) return;
      await invoke("delete_archived_mod_version", { vaultPath: vPath, relPath, dnaHash });
      if (contextVersionTarget) {
        const res: any = await invoke("get_mod_version_pool_status", { vaultPath: vPath });
        const allGroups = groupModVersionPoolItems(res?.items || [], t);
        const matched = matchVersionGroupsForMod(contextVersionTarget, allGroups);
        setContextVersionGroups(matched);
        if (matched.length === 0) setContextVersionTarget(null);
      }
    } catch {}
  }, [contextVersionTarget, t]);

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
    const cleanedSet = new Set<string>();
    const cleanFileLowerSet = new Set<string>();
    for (let i = 0; i < activeSetModsMemo.length; i++) {
      const sm = activeSetModsMemo[i];
      if (!sm || typeof sm !== "string") continue;
      const stripped = stripPriorityTierPrefix(sm, activeGameSchema);
      if (stripped) cleanedSet.add(stripped);
      const baseFile = (sm.split(/[\\/]/).pop() || sm).toLowerCase();
      if (baseFile) cleanFileLowerSet.add(baseFile);
    }

    return displayModList.filter((m: any) => {
      if (!m?.name) return false;
      if (normalSet.has(m.name) || cleanedSet.has(m.name)) return true;
      const mFileLower = (m.name.split(/[\\/]/).pop() || m.name).toLowerCase();
      return Boolean(mFileLower && cleanFileLowerSet.has(mFileLower));
    });
  }, [displayModList, activeSetModsMemo, activeGameSchema]);

  const virtualFolderIds = React.useMemo(() => {
    const ids = new Set<string>();
    displayModList.forEach((v: any) => {
      if (!v?.isVirtual || !v.dbId) return;
      const dbIdStr = String(v.dbId);
      if (dbIdStr === "undefined" || dbIdStr === "null") return;
      if (
        (v.hash?.startsWith("local_set_") || v.name?.startsWith("LOCAL_SET_")) &&
        !dbIdStr.startsWith("f_") &&
        !dbIdStr.startsWith("local_")
      ) {
        return;
      }
      ids.add(dbIdStr);
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
      const emBaseClean = nameRaw.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/i, "") || nameRaw;
      const emDisp = String(mData.displayName || "").toUpperCase();
      return {
        mData,
        emClean: nameRaw,
        emBaseClean,
        emBaseNoScript: emBaseClean.replace(/_SCRIPT(S)?$/i, ""),
        emDisp,
        emDispNoScript: emDisp.replace(/_SCRIPT(S)?$/i, ""),
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


  const activeSetEquipContext = React.useMemo(() => {
    const activeSetMods = playSets[activePlaySetIndex]?.mods || [];
    const extRegex = getExtensionRegex(activeGameSchema);

    const parsedActiveSetModIds = new Set<string>();
    const parsedActiveSetModNames = new Set<string>();
    const parsedActiveSetModNamespaces = new Set<string>();

    activeSetMods.forEach((n: string) => {
      if (!n || typeof n !== "string") return;
      const cleanNLookup = stripPriorityTierPrefix(n, activeGameSchema);
      const cleanFile = n.split(/[\\/]/).pop() || n;
      const mData =
        modListIndex.byName.get(cleanNLookup) ||
        modListIndex.byName.get(n) ||
        modListIndex.namesAndDisplayNames.find(
          (ne: any) =>
            ne.name === cleanNLookup ||
            (ne.name.split(/[\\/]/).pop() || ne.name).toLowerCase() === cleanFile.toLowerCase()
        )?.orig;
      const cleanN = cleanFile.replace(extRegex, "").toUpperCase();

      if (mData?.dbId) parsedActiveSetModIds.add(String(mData.dbId));
      if (cleanN) parsedActiveSetModNames.add(cleanN);
      if (mData?.displayName) parsedActiveSetModNames.add(mData.displayName.toUpperCase());

      parsedActiveSetModNamespaces.add(n);
      parsedActiveSetModNamespaces.add(cleanNLookup);
      if (mData?.name) parsedActiveSetModNamespaces.add(mData.name);
    });

    const equippedDisplayModFamilies = new Set<string>();
    const equippedDisplayModDbIds = new Set<string>();
    const equippedDisplayModSetIds = new Set<string>();
    equippedDisplayMods.forEach((m: any) => {
      if (!m.isVirtual && m.name) {
        if (m.familyId) equippedDisplayModFamilies.add(String(m.familyId));
        if (m.dbId) equippedDisplayModDbIds.add(String(m.dbId));
        if (m.setId) equippedDisplayModSetIds.add(String(m.setId));
      }
    });

    const isModCardEquipped = (mod: any): boolean => {
      if (mod.isParent || mod.isVirtual) {
        if (
          Array.isArray(mod.flavors) &&
          mod.flavors.some((f: any) => f?.name && parsedActiveSetModNamespaces.has(f.name))
        ) {
          return true;
        }
        if (!mod.isFlavorFolder) {
          const anchor = mod.dbId || mod.familyId || mod.setId;
          if (anchor) {
            const sAnchor = String(anchor);
            if (
              equippedDisplayModFamilies.has(sAnchor) ||
              equippedDisplayModDbIds.has(sAnchor) ||
              equippedDisplayModSetIds.has(sAnchor)
            ) {
              return true;
            }
          }
        }
        return false;
      }
      return Boolean(mod.name && parsedActiveSetModNamespaces.has(mod.name));
    };

    return {
      parsedActiveSetModIds,
      parsedActiveSetModNames,
      parsedActiveSetModNamespaces,
      isModCardEquipped,
    };
  }, [playSets, activePlaySetIndex, activeGameSchema, modListIndex, equippedDisplayMods]);

  const classifyVaultMod = React.useCallback(
    (mod: any): "EQUIPPED" | "UNEQUIPPED" | "DEV" | "ARCHIVES" | "ARCHIVES_FILTERED_OUT" | null => {
      if (!mod) return null;
      if (mod.isVirtual && (mod.hash?.startsWith("local_set_") || mod.name?.startsWith("LOCAL_SET_"))) {
        const dbIdStr = String(mod.dbId || "");
        if (!dbIdStr.startsWith("f_") && !dbIdStr.startsWith("local_")) return null;
      }

      const isFileVaultVisible = (m: any) => {
        if (!m?.isVirtual && m?.name) {
          if (!isSupportedExtension(m.name, activeGameSchema)) return false;
          if (activeGameSchema?.extensions?.vault_visible) {
            const isVaultVisible = activeGameSchema.extensions.vault_visible.some((ext: string) =>
              m.name.toLowerCase().endsWith(ext.toLowerCase())
            );
            if (!isVaultVisible) return false;
          }
        }
        return true;
      };

      if (!mod.isVirtual && !isFileVaultVisible(mod)) return null;

      const modNameUpper = String(mod.displayName || mod.meta_name || mod.name || mod.title || "").toUpperCase().trim();
      const baseModName = modNameUpper.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || modNameUpper;
      if (baseModName === "FILTERS") return null;

      if (!mod.isVirtual) {
        const folderExists =
          (mod.familyId && virtualFolderIds.has(String(mod.familyId))) ||
          (mod.setId && virtualFolderIds.has(String(mod.setId)));
        if (folderExists) return null;
      }

      const { parsedActiveSetModIds, parsedActiveSetModNames, isModCardEquipped } = activeSetEquipContext;

      let modGameVersions: string[] = [];
      if (mod.isVirtual) {
        const visibleFlavors = (mod.flavors || []).filter(isFileVaultVisible);
        const sourceFlavors = visibleFlavors.length > 0 ? visibleFlavors : (mod.flavors || []);
        modGameVersions = Array.from(
          new Set(
            sourceFlavors.flatMap((f: any) => {
              const v = f.compatible_versions;
              if (!v) return [];
              if (typeof v === "string") return v.split(",").map((s: string) => s.trim()).filter(Boolean);
              return Array.isArray(v) ? v : [];
            })
          )
        ).filter(Boolean) as string[];
      } else {
        const v = mod.compatible_versions;
        if (typeof v === "string") {
          modGameVersions = v.split(",").map((s: string) => s.trim()).filter(Boolean);
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
        if (mod.isGhosted) return null;
        if (mod.missingReqs && mod.missingReqs.length > 0) return null;

        let isBroken = false;
        const checkBroken = (mObj: any) => {
          let broken = typeof mObj.status === "string" && mObj.status.toLowerCase() === "broken";
          if (broken && mObj.compatible_versions && mObj.compatible_versions.length > 0 && selectedVersion) {
            if (
              selectedVersion !==
              getHighestVersion(
                typeof mObj.compatible_versions === "string"
                  ? mObj.compatible_versions.split(",").map((s: string) => s.trim())
                  : mObj.compatible_versions
              )
            ) {
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

        if (isBroken) return null;

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

        if (hasTier4Conflict) return null;

        const rawDLC: string[] = [];
        if (mod.requiredDLC) {
          if (typeof mod.requiredDLC === "string") {
            try {
              rawDLC.push(...JSON.parse(mod.requiredDLC));
            } catch {
              rawDLC.push(
                ...mod.requiredDLC
                  .replace(/[\{\}\[\]]/g, "")
                  .split(",")
                  .map((s: string) => s.replace(/^"/, "").replace(/"$/, "").trim())
              );
            }
          } else if (Array.isArray(mod.requiredDLC)) {
            rawDLC.push(...mod.requiredDLC);
          }
        }
        if (mod.flavors) {
          mod.flavors.forEach((f: any) => {
            if (f.requiredDLC) {
              let fDLC = f.requiredDLC;
              if (typeof f.requiredDLC === "string") {
                try {
                  fDLC = JSON.parse(f.requiredDLC);
                } catch {
                  fDLC = f.requiredDLC
                    .replace(/[\{\}\[\]]/g, "")
                    .split(",")
                    .map((s: string) => s.replace(/^"/, "").replace(/"$/, "").trim());
                }
              }
              if (Array.isArray(fDLC)) {
                fDLC.forEach((d: string) => {
                  if (!rawDLC.includes(d)) rawDLC.push(d);
                });
              }
            }
          });
        }
        const missingPacks = rawDLC.filter((p: string) => {
          const baseCode = p.split(" ")[0].toUpperCase();
          return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
        });
        if (missingPacks.length > 0) return null;
      }

      if (!isCompatibleWithOS) {
        return "ARCHIVES";
      }

      const isSandboxMod =
        mod.hash?.startsWith("dev_vault_") ||
        (typeof mod.status === "string" && mod.status.toUpperCase().includes("SANDBOX")) ||
        (mod.physical_path &&
          (mod.physical_path.toLowerCase().includes("/dev/") || mod.physical_path.toLowerCase().includes("\\dev\\")));

      if (isSandboxMod) {
        return "DEV";
      }

      return isModCardEquipped(mod) ? "EQUIPPED" : "UNEQUIPPED";
    },
    [
      activeGameSchema,
      virtualFolderIds,
      activeSetEquipContext,
      selectedVersion,
      hideGhostCards,
      ownedDLC,
      maskedDLC,
    ]
  );

  const unverifiedCount = React.useMemo(() => {
    const strUnverified = t("unverified", "Unverified").toLowerCase();
    const strLocal = t("badge_local", "Local").toLowerCase();
    const isUnverifiedMod = (m: any) => {
      const rawStatus = String(m?.status || "").toLowerCase();
      return (
        rawStatus.includes(strUnverified) ||
        rawStatus.includes(strLocal) ||
        rawStatus.includes("unverified") ||
        rawStatus.includes("local") ||
        rawStatus.includes("unknown")
      );
    };
    let count = 0;
    for (let i = 0; i < displayModList.length; i++) {
      const mod = displayModList[i];
      const bucket = classifyVaultMod(mod);
      if (bucket !== "EQUIPPED" && bucket !== "UNEQUIPPED") continue;
      if (mod.isVirtual) {
        const hasMatch =
          isUnverifiedMod(mod) ||
          (Array.isArray(mod.flavors) && mod.flavors.some((f: any) => isUnverifiedMod(f)));
        if (hasMatch) count++;
      } else if (isUnverifiedMod(mod)) {
        count++;
      }
    }
    return count;
  }, [displayModList, classifyVaultMod, t]);

  const vaultTabCounts = React.useMemo(() => {
    const list = visibleMods || displayModList || [];
    let all = 0;
    let equipped = 0;
    let unequipped = 0;
    let dev = 0;
    let archives = 0;

    for (let i = 0; i < list.length; i++) {
      const bucket = classifyVaultMod(list[i]);
      if (!bucket || bucket === "ARCHIVES_FILTERED_OUT") continue;
      if (bucket === "ARCHIVES") {
        archives++;
      } else if (bucket === "DEV") {
        dev++;
      } else if (bucket === "EQUIPPED") {
        all++;
        equipped++;
      } else if (bucket === "UNEQUIPPED") {
        all++;
        unequipped++;
      }
    }

    return {
      total: all + dev + archives,
      all,
      equipped,
      unequipped,
      dev,
      archives,
    };
  }, [equipFilter, displayModList, visibleMods, classifyVaultMod]);

  const finalVisibleMods = React.useMemo(() => {
    return visibleMods.filter((mod: any) => {
      const bucket = classifyVaultMod(mod);
      if (!bucket || bucket === "ARCHIVES_FILTERED_OUT") return false;
      if (equipFilter === "ARCHIVES") return bucket === "ARCHIVES";
      if (equipFilter === "DEV") return bucket === "DEV";
      if (equipFilter === "EQUIPPED") return bucket === "EQUIPPED";
      if (equipFilter === "UNEQUIPPED") return bucket === "UNEQUIPPED";
      return bucket === "EQUIPPED" || bucket === "UNEQUIPPED";
    });
  }, [visibleMods, equipFilter, classifyVaultMod]);
  const dependencyGraph = React.useMemo(() => {
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

  const paginatedMods = React.useMemo(
    () => finalVisibleMods.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [finalVisibleMods, currentPage, itemsPerPage]
  );

  const recentOverviewMods = React.useMemo(() => {
    if (equipFilter !== "OVERVIEW") return [];
    return displayModList.filter((mod: any) => {
      if (!mod) return false;
      if (mod.isVirtual && (mod.hash?.startsWith("local_set_") || mod.name?.startsWith("LOCAL_SET_"))) {
        const dbIdStr = String(mod.dbId || "");
        if (!dbIdStr.startsWith("f_") && !dbIdStr.startsWith("local_")) return false;
      }
      if (!mod.isVirtual && mod.name) {
        if (!isSupportedExtension(mod.name, activeGameSchema)) return false;
        if (activeGameSchema?.extensions?.vault_visible) {
          const isVaultVisible = activeGameSchema.extensions.vault_visible.some((ext: string) =>
            mod.name.toLowerCase().endsWith(ext.toLowerCase())
          );
          if (!isVaultVisible) return false;
        }
      }
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
    }).slice(0, 20);
  }, [equipFilter, displayModList, virtualFolderIds, activeGameSchema]);

  const handleCreateLocalFolder = React.useCallback(() => {
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
  }, [runRadarSweep]);

  const handleVaultContextMenu = React.useCallback((e: any, mod: any) => {
    setVaultContextMenu({ x: e.clientX, y: e.clientY, mod });
  }, []);

  return (
    <div className="flex-1 overflow-visible pr-4 relative">
      <ViewHeader
        title={t("vault_title", "Your {Vault}")}
        subtitle={t("vault_subtitle", "Local library, secured assets, and installed {mods}")}
        icon={<span className="material-symbols-outlined !text-3xl text-[var(--accent)]">{t("icon_account_balance", "account_balance")}</span>}
        breadcrumb={equipFilter !== "OVERVIEW" ? t(`filter_${equipFilter.toLowerCase()}`, equipFilter) : undefined}
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
            displayModList={displayModList}
            selectedVersion={selectedVersion}
            hideGhostCards={hideGhostCards}
            setHideGhostCards={setHideGhostCards}
            vaultLayout={vaultLayout}
            setVaultLayout={setVaultLayout}
            onCreateLocalFolder={handleCreateLocalFolder}
            onOpenVersionPool={() => setIsVersionPoolOpen(true)}
            setSelectedMods={setSelectedMods}
          />
        )}
      </ViewHeader>

      <VaultTabs t={t} equipFilter={equipFilter} setEquipFilter={setEquipFilter} vaultTabCounts={vaultTabCounts} finalVisibleMods={finalVisibleMods} equippedDisplayMods={equippedDisplayMods} visibleMods={visibleMods} displayModList={displayModList} selectedVersion={selectedVersion} />

      {equipFilter === "OVERVIEW" ? (
        <div>
          <CommandScreenLayout>


            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading title={t("recent_injections", "Recent {Mod} Injections")} icon={t("icon_history", "history")} />

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6 w-full">
                    {recentOverviewMods.map((item: any, idx: number) => {
                      const chipClass =
                        "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";
                      const rawStatus = String(item?.status || "").toLowerCase().replace(/_/g, " ").replace(/[^\w\s-]/gi, "").trim();
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
                        if (rawStatus === "synced") {
                          return { label: t("synced_badge", "Synced"), icon: t("icon_cloud_done", "cloud_done"), iconColor: "text-[var(--success)]" };
                        }
                        if (rawStatus === "stable" || rawStatus === "verified") {
                          return { label: t("status_stable", "Stable"), icon: t("icon_verified", "verified"), iconColor: "text-[var(--success)]" };
                        }
                        return { label: t("badge_local", "Unlinked"), icon: t("icon_science", "science"), iconColor: "text-[var(--accent)]" };
                      })();
                      const rawFileName = String(item?.file_extension || item?.name || "").toLowerCase();
                      const isScript = rawFileName.includes("ts4script") || String(item?.type || "").toLowerCase().includes("script");
                      const typeLabel = item?.isCollection
                        ? t("tab_cc", "Collection")
                        : isScript
                          ? t("type_script", "Script")
                          : t("type_package", "Package");
                      const modulesCount = Array.isArray(item?.flavors) && item.flavors.length > 1 ? item.flavors.length : 0;

                      return (
                        <div key={`recent-${idx}`} className="relative flex flex-col h-full glass-panel rounded-[var(--radius)] transition-colors duration-300 shadow-xl hover:shadow-2xl cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_35%,rgba(255,255,255,0.35))] group" onClick={() => {
                          if (item.isVirtual && item.isLocalOverride && !item.isCollection) {
                            const targetId = item.dbId || item.familyId || item.setId;
                            if (targetId) window.dispatchEvent(new CustomEvent('openLocalFolderEditor', { detail: targetId }));
                          } else if (setActiveDossier) {
                            setActiveDossier(item);
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
                            {(showImages !== false && (item.meta_image || item.image_url)) ? (
                              <img
                                src={item.meta_image || item.image_url}
                                alt={item.meta_name || item.name || item.title}
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                                style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <DynamicArtifactPreviewBanner
                                data={item}
                                icon={getModIcon(item, activeGameSchema, t)}
                                heightClass="h-full"
                              />
                            )}
                          </div>

                          <div className="p-5 flex flex-col flex-1">
                            <h3 className="text-[15px] font-bold truncate capitalize tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                              {formatDisplayName(item.displayName || item.meta_name || item.name || item.title || "")}
                            </h3>
                            <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate mb-2">
                              BY {item.meta_author || item.author || t("unknown_mason", "Unknown {Mason}")}
                            </p>

                            <div className="flex flex-wrap items-center gap-2 mt-1 mb-3">
                              <div className={chipClass}>
                                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                  {item?.isCollection ? t("icon_folder_special", "folder_special") : isScript ? t("icon_terminal", "terminal") : t("icon_deployed_code", "deployed_code")}
                                </span>
                                <span className="text-[var(--subtext)]">{typeLabel}</span>
                              </div>
                            </div>

                            <div className="mt-auto pt-3 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                              {modulesCount > 0 ? (
                                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text)]">
                                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                                    {t("icon_account_tree", "account_tree")}
                                  </span>
                                  <span>+{modulesCount} {t("badge_modules_count", "Modules")}</span>
                                </div>
                              ) : (
                                <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 capitalize tracking-widest">
                                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                                </span>
                              )}
                              <span className="text-[9px] font-black theme-text-accent capitalize opacity-0 group-hover:opacity-100 transition-opacity duration-300">{t("btn_view", "View")} &rarr;</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("quick_actions", "Quick Actions")} icon="bolt">
                <div className="flex flex-col gap-4">
                  <CommandScreenQuickLink
                    icon={t("icon_warning", "warning")}
                    title={t("unverified", "Unverified")}
                    subtitle={`${unverifiedCount} ${t("tab_mods", "{Mods}")}`}
                    hoverTextColorClass="group-hover:text-[var(--warning)]"
                    iconShadowClass="drop-shadow-md text-[var(--warning)]"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                    onClick={() => { setEquipFilter("ALL"); setFilterStatus("UNVERIFIED"); setActiveCategory("ALL"); setActiveSubType("ALL"); }}
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_folder_shared", "folder_shared")}
                    title={t("local_folders", "Local Folders")}
                    subtitle={`${localFolderCount} ${t("title_artifacts", "Your {Mods}")}`}
                    hoverTextColorClass="group-hover:text-purple-400"
                    iconShadowClass="drop-shadow-md text-purple-400"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                    onClick={() => { setEquipFilter("ALL"); setActiveCategory("LOCAL_FOLDERS"); }}
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_create_new_folder", "create_new_folder")}
                    title={t("quick_create_node", "Create Local Folder")}
                    subtitle={t("quick_create_node_desc", "Create a new local folder to organize your {mods}.")}
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
                    icon={t("icon_history", "history")}
                    title={t("version_pool_title", "{Mod} Version {Backups}")}
                    subtitle={t("version_pool_subtitle", "Manage archived {mod} versions and auto-version matching")}
                    onClick={() => setIsVersionPoolOpen(true)}
                    textColorClass="text-cyan-400"
                    hoverTextColorClass="group-hover:text-cyan-300"
                    iconShadowClass="drop-shadow-md text-cyan-400"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                  />

                  <CommandScreenQuickLink
                    icon={t("icon_delete_sweep", "delete_sweep")}
                    title={t("purge_archives", "Purge Archives")}
                    subtitle={t("purge_desc", "Initiate irreversible purge of the selected archives from local storage. this action cannot be aborted.")}
                    onClick={() => {
                      const allFilesToPurge = new Map<string, string>();
                      displayModList.forEach((mod: any) => {
                        if (classifyVaultMod(mod) === "ARCHIVES") {
                          if (mod.isVirtual && mod.flavors) {
                            mod.flavors.forEach((f: any) => {
                              if (f.name) allFilesToPurge.set(f.name, f.displayName || mod.displayName || f.name);
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
                    icon={t("icon_auto_awesome", "auto_awesome")}
                    title={t("nexus", "Nexus")}
                    subtitle={t("nexus_core", "Nexus Integration")}
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
            hasActiveFilters={Boolean(searchQuery?.trim() || activeCategory !== "ALL" || activeSubType !== "ALL" || filterStatus !== "ALL" || hideGhostCards)}
            onResetFilters={() => {
              setSearchQuery("");
              setActiveCategory("ALL");
              setActiveSubType("ALL");
              setFilterStatus("ALL");
              setHideGhostCards(false);
            }}
            setSelectedMods={setSelectedMods}
            setActiveLocalFolder={setActiveLocalFolder}
            setIsLocalFolderEditorOpen={setIsLocalFolderEditorOpen}
            onContextMenu={handleVaultContextMenu}
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

      <VaultVersionPoolSidePanel
        isOpen={isVersionPoolOpen}
        onClose={() => setIsVersionPoolOpen(false)}
        runRadarSweep={runRadarSweep}
        setStatus={setStatus}
        displayModList={displayModList}
      />

      <ModVersionHistorySidePanel
        groups={contextVersionGroups}
        isOpen={contextVersionGroups.length > 0}
        onClose={() => {
          setContextVersionGroups([]);
          setContextVersionTarget(null);
        }}
        onActivateVersion={handleActivateContextVersion}
        onDeleteVersion={handleDeleteContextVersion}
        onRefresh={() => {
          if (contextVersionTarget) openVersionsForMod(contextVersionTarget);
        }}
        runRadarSweep={runRadarSweep}
        setStatus={setStatus}
        parentTitle={
          contextVersionTarget
            ? formatCleanModTitle(
                formatDisplayName(contextVersionTarget.displayName || contextVersionTarget.name || "")
              ) || formatDisplayName(contextVersionTarget.displayName || contextVersionTarget.name || "")
            : undefined
        }
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
            left: Math.max(12, Math.min(vaultContextMenu.x, window.innerWidth - 312)),
            top: Math.max(12, Math.min(vaultContextMenu.y, window.innerHeight - 430)),
            zIndex: 120000,
          }}
          className="flex flex-col w-[292px] animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div
            style={{ overflow: "visible" }}
            className="w-full h-full glass-panel portal-glass-fix sa-dropdown-popover !overflow-visible rounded-2xl p-2 border border-[color-mix(in_srgb,var(--text)_14%,rgba(255,255,255,0.22))] shadow-[0_24px_60px_rgba(0,0,0,0.65)] flex flex-col gap-1"
          >
            {(() => {
            const ctxMod = vaultContextMenu.mod;
            const targetMods = selectedMods.includes(ctxMod.name)
              ? selectedMods
              : [ctxMod.name];
            const resolvedFileNamesSet = new Set<string>();
            const resolvedHashesSet = new Set<string>();
            targetMods.forEach((modName: string) => {
              const found =
                displayModList.find((m: any) => m.name === modName) ||
                modList?.find((m: any) => m.name === modName) ||
                (ctxMod.name === modName ? ctxMod : null);
              if (
                found &&
                found.isVirtual &&
                Array.isArray(found.flavors) &&
                found.flavors.length > 0
              ) {
                found.flavors.forEach((f: any) => {
                  if (
                    f?.name &&
                    !String(f.name).startsWith("FOLDER_") &&
                    !String(f.name).startsWith("LOCAL_SET_")
                  ) {
                    resolvedFileNamesSet.add(f.name);
                  }
                  if (f?.hash && !String(f.hash).startsWith("virtual_")) {
                    resolvedHashesSet.add(f.hash);
                  }
                });
              } else {
                if (
                  modName &&
                  !String(modName).startsWith("FOLDER_") &&
                  !String(modName).startsWith("LOCAL_SET_")
                ) {
                  resolvedFileNamesSet.add(modName);
                }
                if (found?.hash && !String(found.hash).startsWith("virtual_")) {
                  resolvedHashesSet.add(found.hash);
                }
              }
            });
            const targetFileNames = Array.from(resolvedFileNamesSet);
            const targetHashes = Array.from(resolvedHashesSet);

            const count = targetMods.length;
            const openSubmenuLeft = vaultContextMenu.x > window.innerWidth - 560;
            const isLocalFolderCard = Boolean(
              ctxMod.name?.startsWith("LOCAL_SET_") ||
                (ctxMod.isVirtual && ctxMod.isLocalOverride && !ctxMod.isCollection)
            );
            const isCtxEquipped = activeSetEquipContext.isModCardEquipped(ctxMod);
            const rawTitle = formatDisplayName(ctxMod.displayName || ctxMod.name || "");
            const cleanTitle = formatCleanModTitle(rawTitle) || rawTitle;
            const rawAuthor = ctxMod.author || "";
            const cleanAuthor =
              !rawAuthor || String(rawAuthor).trim().toLowerCase() === "unknown"
                ? t("unknown", "Unknown")
                : String(rawAuthor).trim();
            const isParentFolder = Boolean(
              ctxMod.isParent && Array.isArray(ctxMod.flavors) && ctxMod.flavors.length > 1
            );
            const cardGridIndex = paginatedMods.findIndex(
              (m: any) => (m.hash || m.name) === (ctxMod.hash || ctxMod.name)
            );
            const mainCardKey =
              cardGridIndex >= 0 ? `${ctxMod.hash || ctxMod.name}-${cardGridIndex}` : null;
            const isCurrentlyExpanded = Boolean(mainCardKey && expandedFolder === mainCardKey);
            const isTargetSelected = selectedMods.includes(ctxMod.name);

            const menuBtnClass =
              "w-full rounded-xl text-left px-2.5 py-2 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-xs font-bold text-[var(--text)] flex items-center justify-between gap-2.5 transition-all cursor-pointer group/ctxitem";
            const iconWellClass =
              "w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors";

            return (
              <>
                {/* Liquid Glass Context Header Card */}
                <div className="flex items-center gap-3 p-2.5 mb-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <div
                    className={`w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                      isCtxEquipped ? "text-[var(--success)]" : "text-[var(--accent)]"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[18px]">
                      {count > 1
                        ? t("icon_checklist", "checklist")
                        : getModIcon(ctxMod, activeGameSchema, t)}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                    <span className="text-xs font-black text-[var(--text)] tracking-tight truncate">
                      {count > 1
                        ? `${count} ${t("term_mods", "Mods")} ${t("btn_selected", "Selected")}`
                        : cleanTitle}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--subtext)] min-w-0">
                      <span className="truncate">{cleanAuthor}</span>
                      <span className="opacity-40 shrink-0">•</span>
                      <span
                        className={`shrink-0 ${
                          isCtxEquipped ? "text-[var(--success)]" : "opacity-80"
                        }`}
                      >
                        {isCtxEquipped
                          ? t("filter_equipped", "In {Blueprint}")
                          : t("filter_unequipped", "Not Equipped")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Primary Action: Inspect Dossier or Manage Local Folder */}
                {isLocalFolderCard ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const setId =
                        ctxMod.dbId || String(ctxMod.name || "").replace("LOCAL_SET_", "");
                      setActiveLocalFolder(setId);
                      setIsLocalFolderEditorOpen(true);
                      setVaultContextMenu(null);
                    }}
                    className={menuBtnClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${iconWellClass} text-[var(--accent)]`}>
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_edit", "edit")}
                        </span>
                      </div>
                      <span className="truncate">{t("manage_node", "Manage Folder")}</span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVaultContextMenu(null);
                      setMetaNameInput(ctxMod.displayName || ctxMod.name);
                      setMetaAuthorInput(ctxMod.author || "");
                      setMetaDescInput(ctxMod.description || "");
                      setMetaImageInput(ctxMod.image_url || ctxMod.imageUrl || "");
                      if (setMetaUrlInput) setMetaUrlInput(ctxMod.url || "");
                      if (setMetaVersionInput)
                        setMetaVersionInput(ctxMod.latest_version || ctxMod.version || "");
                      setMetaAllowWriteInput(ctxMod.allow_write || false);
                      setActiveDossier(ctxMod);
                    }}
                    className={menuBtnClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${iconWellClass} text-[var(--accent)]`}>
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_open_in_new", "open_in_new")}
                        </span>
                      </div>
                      <span className="truncate">{t("btn_inspect", "Inspect {Mod}")}</span>
                    </div>
                  </button>
                )}

                {/* Equip / Yeet (Unequip / Remove from Active Blueprint) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setVaultContextMenu(null);
                    if (count > 1) {
                      targetMods.forEach((mName: string) => toggleInActiveSet(mName, false));
                    } else {
                      toggleInActiveSet(ctxMod.name, false);
                    }
                  }}
                  className={menuBtnClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`${iconWellClass} ${
                        isCtxEquipped ? "text-[var(--warning)]" : "text-[var(--success)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[15px]">
                        {isCtxEquipped
                          ? t("icon_do_not_disturb_on", "do_not_disturb_on")
                          : t("icon_add_circle", "add_circle")}
                      </span>
                    </div>
                    <span className="truncate">
                      {isCtxEquipped
                        ? `${t("btn_remove", "{Remove}")} ${
                            count > 1 ? t("term_mods", "{Mods}") : t("label_artifact", "{Mod}")
                          }`
                        : t("btn_equip", "Equip {Mod}")}
                    </span>
                  </div>
                </button>

                {/* Explore Folder Modules (if Parent Suite/Folder on Grid) */}
                {isParentFolder && mainCardKey && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVaultContextMenu(null);
                      setExpandedFolder((prev: string | null) =>
                        prev === mainCardKey ? null : mainCardKey
                      );
                    }}
                    className={menuBtnClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${iconWellClass} text-[var(--accent)]`}>
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_account_tree", "account_tree")}
                        </span>
                      </div>
                      <span className="truncate">
                        {isCurrentlyExpanded
                          ? t("btn_close", "Close")
                          : `${t("nav_exploring", "Exploring")} (${ctxMod.flavors.length})`}
                      </span>
                    </div>
                  </button>
                )}

                {/* Mod Version History / Time Capsule */}
                {!isLocalFolderCard && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVaultContextMenu(null);
                      openVersionsForMod(ctxMod);
                    }}
                    className={menuBtnClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${iconWellClass} text-[var(--accent)]`}>
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_history", "history")}
                        </span>
                      </div>
                      <span className="truncate">
                        {t("version_pool_btn_versions", "Versions")}
                      </span>
                    </div>
                  </button>
                )}

                <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent my-0.5" />

                {/* Add to Blueprint Submenu */}
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu("blueprint")}
                  onMouseLeave={() => setActiveSubmenu(null)}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSubmenu((prev) => (prev === "blueprint" ? null : "blueprint"));
                    }}
                    className={menuBtnClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${iconWellClass} text-[var(--accent)]`}>
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_architecture", "architecture")}
                        </span>
                      </div>
                      <span className="truncate">
                        {t("add_to_blueprint", "Add to {Blueprint}")}
                      </span>
                    </div>
                    <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-60 shrink-0">
                      {t("icon_chevron_right", "chevron_right")}
                    </span>
                  </button>
                  {activeSubmenu === "blueprint" && (
                    <div
                      className={`absolute top-0 w-64 pt-0 z-50 ${
                        openSubmenuLeft ? "right-full pr-1.5" : "left-full pl-1.5"
                      }`}
                    >
                      <div className="w-full glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl p-2 border border-[color-mix(in_srgb,var(--text)_14%,rgba(255,255,255,0.22))] shadow-[0_24px_60px_rgba(0,0,0,0.65)] flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVaultContextMenu(null);
                            setActiveSubmenu(null);
                            if (targetFileNames.length > 0) {
                              setSelectedMods(targetFileNames);
                            } else {
                              setSelectedMods(targetMods);
                            }
                            setBulkModal(true);
                          }}
                          className={menuBtnClass}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`${iconWellClass} text-[var(--accent)]`}>
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_add", "add")}
                              </span>
                            </div>
                            <span className="truncate">
                              {t("context_new_blueprint", "New {Blueprint}")}
                            </span>
                          </div>
                        </button>
                        <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent my-0.5" />
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
                          {playSets.map((ps: any, index: number) => (
                            <button
                              key={index}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setVaultContextMenu(null);
                                setActiveSubmenu(null);
                                const modsToAdd =
                                  targetFileNames.length > 0 ? targetFileNames : targetMods;
                                if (modsToAdd.length === 0) return;
                                if (setPlaySets) {
                                  const nextSets = playSets.map((s: any, idx: number) => {
                                    if (idx !== index) return s;
                                    const existingMods = Array.isArray(s.mods) ? s.mods : [];
                                    const merged = deduplicateBlueprintArtifacts([
                                      ...existingMods,
                                      ...modsToAdd,
                                    ]);
                                    return { ...s, mods: merged };
                                  });
                                  setPlaySets(nextSets);
                                  if (index === activePlaySetIndex && equipPlaySet) {
                                    equipPlaySet(ps.name, nextSets);
                                  } else if (setStatus) {
                                    setStatus(
                                      `${t("add_to_blueprint", "Add to {Blueprint}")}: ${ps.name}`
                                    );
                                  }
                                }
                              }}
                              className={menuBtnClass}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`${iconWellClass} ${
                                    index === activePlaySetIndex
                                      ? "text-[var(--success)]"
                                      : "text-[var(--subtext)]"
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[15px]">
                                    {index === activePlaySetIndex
                                      ? t("icon_check_circle", "check_circle")
                                      : t("icon_architecture", "architecture")}
                                  </span>
                                </div>
                                <span className="truncate">{ps.name}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Add to Local Folder Submenu */}
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu("folder")}
                  onMouseLeave={() => setActiveSubmenu(null)}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSubmenu((prev) => (prev === "folder" ? null : "folder"));
                    }}
                    className={menuBtnClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${iconWellClass} text-[var(--success)]`}>
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_folder", "folder")}
                        </span>
                      </div>
                      <span className="truncate">
                        {t("btn_group_folder", "Add to Local Folder")}
                      </span>
                    </div>
                    <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-60 shrink-0">
                      {t("icon_chevron_right", "chevron_right")}
                    </span>
                  </button>
                  {activeSubmenu === "folder" && (
                    <div
                      className={`absolute top-0 w-64 pt-0 z-50 ${
                        openSubmenuLeft ? "right-full pr-1.5" : "left-full pl-1.5"
                      }`}
                    >
                      <div className="w-full glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl p-2 border border-[color-mix(in_srgb,var(--text)_14%,rgba(255,255,255,0.22))] shadow-[0_24px_60px_rgba(0,0,0,0.65)] flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVaultContextMenu(null);
                            setActiveSubmenu(null);
                            const localSts = JSON.parse(
                              localStorage.getItem(
                                `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`
                              ) || "[]"
                            );
                            const newId = `f_${Date.now()}`;
                            localSts.push({
                              id: newId,
                              name: "",
                              items: targetHashes,
                              isCollection: false,
                            });
                            localStorage.setItem(
                              `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                              JSON.stringify(localSts)
                            );
                            setActiveLocalFolder(newId);
                            setIsLocalFolderEditorOpen(true);
                            runRadarSweep(true);
                          }}
                          className={menuBtnClass}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`${iconWellClass} text-[var(--success)]`}>
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_create_new_folder", "create_new_folder")}
                              </span>
                            </div>
                            <span className="truncate">
                              {t("context_new_folder", "New Folder")}
                            </span>
                          </div>
                        </button>
                        <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent my-0.5" />
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
                          {(() => {
                            const localSts = JSON.parse(
                              localStorage.getItem(
                                `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`
                              ) || "[]"
                            ).filter(
                              (s: any) =>
                                s &&
                                s.id &&
                                (String(s.id).startsWith("f_") ||
                                  String(s.id).startsWith("local_")) &&
                                Array.isArray(s.items) &&
                                !s.isCollection
                            );
                            if (localSts.length === 0) {
                              return (
                                <div className="px-3 py-2 text-[11px] font-semibold text-[var(--subtext)] opacity-60">
                                  {t("local_folders_empty", "Folder Is Empty")}
                                </div>
                              );
                            }
                            return localSts.map((ls: any) => (
                              <button
                                key={ls.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const allRawSets = JSON.parse(
                                    localStorage.getItem(
                                      `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`
                                    ) || "[]"
                                  );
                                  const updatedSets = allRawSets.map((s: any) =>
                                    s.id === ls.id
                                      ? {
                                          ...s,
                                          items: Array.from(
                                            new Set([...(s.items || []), ...targetHashes])
                                          ),
                                        }
                                      : s
                                  );
                                  localStorage.setItem(
                                    `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                                    JSON.stringify(updatedSets)
                                  );
                                  setVaultContextMenu(null);
                                  setActiveSubmenu(null);
                                  if (setStatus) {
                                    setStatus(
                                      `${t("btn_group_folder", "Add to Local Folder")}: ${
                                        ls.name || t("folder", "Folder")
                                      }`
                                    );
                                  }
                                  runRadarSweep(true);
                                }}
                                className={menuBtnClass}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`${iconWellClass} text-[var(--success)]`}>
                                    <span className="material-symbols-outlined !text-[15px]">
                                      {t("icon_folder", "folder")}
                                    </span>
                                  </div>
                                  <span className="truncate">
                                    {ls.name || t("folder", "Folder")}
                                  </span>
                                </div>
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bulk Select Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setVaultContextMenu(null);
                    if (!isBulkMode) {
                      setIsBulkMode(true);
                      setSelectedMods([ctxMod.name]);
                    } else {
                      setSelectedMods((prev: string[]) =>
                        prev.includes(ctxMod.name)
                          ? prev.filter((n: string) => n !== ctxMod.name)
                          : [...prev, ctxMod.name]
                      );
                    }
                  }}
                  className={menuBtnClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`${iconWellClass} text-[var(--accent)]`}>
                      <span className="material-symbols-outlined !text-[15px]">
                        {isTargetSelected
                          ? t("icon_check_box", "check_box")
                          : t("icon_checklist", "checklist")}
                      </span>
                    </div>
                    <span className="truncate">
                      {isTargetSelected
                        ? t("btn_deselect_all", "Deselect All")
                        : t("btn_select_assets", "Select Assets")}
                    </span>
                  </div>
                </button>

                {/* Danger Action: Purge Artifact (Hard Delete) */}
                {!isLocalFolderCard && (
                  <>
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--danger)_25%,transparent)] to-transparent my-0.5" />
                    <button
                      type="button"
                      onClick={() => {
                        setVaultContextMenu(null);
                        const allFilesToPurge = new Map<string, string>();
                        targetMods.forEach((modName: string) => {
                          const modObj =
                            displayModList.find((m: any) => m.name === modName) ||
                            (ctxMod.name === modName ? ctxMod : null);
                          if (modObj && modObj.isVirtual && modObj.flavors) {
                            modObj.flavors.forEach((f: any) => {
                              if (f.name)
                                allFilesToPurge.set(
                                  f.name,
                                  f.displayName || modObj.displayName || f.name
                                );
                            });
                          } else {
                            allFilesToPurge.set(
                              modName,
                              modObj?.displayName || ctxMod?.displayName || modName
                            );
                          }
                        });
                        setPurgeTargetFiles(
                          Array.from(allFilesToPurge.entries()).map(([file, name]) => ({
                            file,
                            name,
                          }))
                        );
                      }}
                      className="w-full rounded-xl text-left px-2.5 py-2 hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-xs font-bold text-[var(--danger)] flex items-center justify-between gap-2.5 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`${iconWellClass} text-[var(--danger)]`}>
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_delete_forever", "delete_forever")}
                          </span>
                        </div>
                        <span className="truncate">
                          {`${t("purge", "{Delete}")} ${
                            count > 1 ? t("term_mods", "{Mods}") : t("label_artifact", "{Mod}")
                          }`}
                        </span>
                      </div>
                    </button>
                  </>
                )}
              </>
            );
          })()}
          </div>
        </div>,
        document.body
      )}
    </div>);
});

export default Vault;



