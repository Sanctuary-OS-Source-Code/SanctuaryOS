import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../supabase";
import {
  ViewHeader,
  HoverTabDrawer,
  VerticalTabButton,
  DashboardStatTile,
  ActionPill,
} from "../shared";
import {
  getExtensionRegex,
  formatDisplayName,
  getFileLabel,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { usePlaySetLogic, compileLoadOrder, LoadOrderRule } from "../hooks/usePlaySetLogic";
import { useStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { useVirtualWindow } from "../hooks/useVirtualWindow";
import { parseConflictPairNames } from "../hooks/playset/conflictPrecomputer";
import { StatTileCarousel } from "../hub-components/SharedCommandScreenLayout";

import { ScoutCommandAndConflictTabs } from "../components/scout/ScoutCommandAndConflictTabs";
import { ScoutOverridesAndLoadOrderTabs } from "../components/scout/ScoutOverridesAndLoadOrderTabs";
import { ScoutSidePanels } from "../components/scout/ScoutSidePanels";
const isCloneConflict = (modA: string, modB: string) => {
    if (!modA || !modB) return false;
    const clean = (s: string) => {
        const file = s.split(/[\\/]/).pop() || s;
        const extRegex = getExtensionRegex(useStore.getState().activeGameSchema);
        const extMatch = file.match(extRegex);
        const ext = extMatch ? extMatch[1].toLowerCase() : '';
        const withoutExt = file.replace(extRegex, '');
        const cleaned = withoutExt.toLowerCase().replace(/(_v\d+|_alt|_remake|remake|\.[a-zA-Z0-9]+)/g, '').replace(/[^a-z0-9]/g, '');
        return cleaned + "_" + ext;
    };
    return clean(modA) === clean(modB);
};

export const ArtifactScout = () => {
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
    const [isLoadOrderPanelOpen, setIsLoadOrderPanelOpen] = useState(false);
    const [selectedLoadOrderMod, setSelectedLoadOrderMod] = useState<string>("");
    const { t } = useLexicon();
    const {
        applyConflictOverride,
        setModPriorityTier,
        addLoadOrderRule,
        removeLoadOrderRule,
        flipLoadOrderRule,
        moveModInLoadOrder,
        autoSortBlueprintLoadOrder,
        equipPlaySet,
    } = usePlaySetLogic();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasScanned, setHasScanned] = useState(false);
    const [showUndoPanel, setShowUndoPanel] = useState(false);
    const [stats, setStats] = useState({ packages: 0, totalClashes: 0 });

    const {
        playSets,
        setPlaySets,
        activePlaySetIndex,
        activeGameSchema,
        setActiveGameSchema,
        modList,
        setStatus,
        showImages,
    } = useStore(
        useShallow((s) => ({
            playSets: s.playSets,
            setPlaySets: s.setPlaySets,
            activePlaySetIndex: s.activePlaySetIndex,
            activeGameSchema: s.activeGameSchema,
            setActiveGameSchema: s.setActiveGameSchema,
            modList: s.modList,
            setStatus: s.setStatus,
            showImages: s.showImages,
        }))
    );
    const defaultScope = playSets && playSets.length > 0 ? (playSets[activePlaySetIndex]?.name || playSets[0].name) : "";
    const [scanScope, setScanScope] = useState(defaultScope);

    useEffect(() => {
        if (!scanScope && playSets && playSets.length > 0) {
            setScanScope(playSets[activePlaySetIndex]?.name || playSets[0].name);
        }
    }, [playSets, activePlaySetIndex, scanScope]);

    const ignoredPairs = useStore((state) => state.ignoredGlobal);
    const setIgnoredPairs = useStore((state) => state.setIgnoredGlobal);

    const [fatalConflicts, setFatalConflicts] = useState<any[]>([]);
    const [tuningConflicts, setTuningConflicts] = useState<any[]>([]);
    const [cloneConflicts, setCloneConflicts] = useState<any[]>([]);
    const [softConflicts, setSoftConflicts] = useState<any[]>([]);

    const [activeTab, setActiveTab] = useState<string>("COMMAND");
    const [overrideTab, setOverrideTab] = useState<"ACTIVE" | "IGNORED" | "ALL">("ALL");
    const [conflictSearch, setConflictSearch] = useState("");
    const [overrideSearch, setOverrideSearch] = useState("");
    const [loadOrderSearch, setLoadOrderSearch] = useState("");
    const [blueprintSearch, setBlueprintSearch] = useState("");
    const [activeConflictSeverity, setActiveConflictSeverity] = useState<number | null>(null);
    // Load Order Rule Builder & Filter state
    const [ruleModA, setRuleModA] = useState<string>("");
    const [ruleModB, setRuleModB] = useState<string>("");
    const [ruleDirection, setRuleDirection] = useState<"after" | "before">("after");
    const [loadOrderSubFilter, setLoadOrderSubFilter] = useState<"ALL" | "TIER_1" | "TIER_2" | "TIER_3">("ALL");
    const [pendingTierFolder, setPendingTierFolder] = useState<string | null>(null);
    const [inspectorMode, setInspectorMode] = useState<"PRIORITY" | "RULE" | "REORDER">("PRIORITY");
    const [inspectorModSearch, setInspectorModSearch] = useState<string>("");
    const [visiblePickerMods, setVisiblePickerMods] = useState<number>(24);
    const [showModPickerInInspector, setShowModPickerInInspector] = useState<boolean>(false);
    const [collapsedTiers, setCollapsedTiers] = useState<Record<string, boolean>>({});
    const [draggedLoadMod, setDraggedLoadMod] = useState<string | null>(null);
    const [dragOverTier, setDragOverTier] = useState<string | null>(null);
    const [dragOverMod, setDragOverMod] = useState<string | null>(null);
    const [pointerDragGhost, setPointerDragGhost] = useState<{
        mod: string;
        label: string;
        x: number;
        y: number;
        targetTier: string;
        targetIdx: number;
    } | null>(null);
    const pointerDragCandidateRef = useRef<{
        startX: number;
        startY: number;
        mod: string;
        label: string;
        tierFolder: string;
        startIdx: number;
        targetTier: string;
        targetIdx: number;
        active: boolean;
    } | null>(null);
    const didPointerDragRef = useRef<boolean>(false);
    const [editingOrderMod, setEditingOrderMod] = useState<string | null>(null);
    const [editingOrderVal, setEditingOrderVal] = useState<string>("");

    useEffect(() => {
        setVisiblePickerMods(24);
    }, [inspectorModSearch, isLoadOrderPanelOpen]);

    const stripKnownModExt = (rawName: string) => {
        return String(rawName || "")
            .replace(getExtensionRegex(activeGameSchema), "")
            .trim();
    };

    const getAgnosticTierMeta = (tierFolder: string, tierIdx: number) => {
        if (!tierFolder || tierIdx <= 0) {
            return {
                roleLabel: t("lo_role_base", "Standard Load"),
                shortLabel: t("lo_role_base_short", "Standard"),
                roleDesc: t("lo_role_base_desc", "Loads first • Default tier"),
                icon: t("icon_layers", "layers"),
                isElevated: false,
            };
        }
        if (tierIdx === 1) {
            return {
                roleLabel: t("lo_role_tier1", "Late Load (Tier 1)"),
                shortLabel: t("lo_role_tier1_short", "Tier 1 Override"),
                roleDesc: t("lo_role_tier1_desc", "Overrides Standard {Mods}"),
                icon: t("icon_low_priority", "low_priority"),
                isElevated: true,
            };
        }
        if (tierIdx === 2) {
            return {
                roleLabel: t("lo_role_tier2", "High Priority (Tier 2)"),
                shortLabel: t("lo_role_tier2_short", "Tier 2 Override"),
                roleDesc: t("lo_role_tier2_desc", "Overrides Standard & Tier 1 {Mods}"),
                icon: t("icon_upgrade", "upgrade"),
                isElevated: true,
            };
        }
        return {
            roleLabel: t("lo_role_tier3", "Final Override (Always Wins)"),
            shortLabel: t("lo_role_tier3_short", "Tier 3 Override"),
            roleDesc: t("lo_role_tier3_desc", "Loads last • Wins all resource overlaps"),
            icon: t("icon_workspace_premium", "workspace_premium"),
            isElevated: true,
        };
    };

    const activeBlueprintObj = useMemo(() => {
        return playSets.find((s: any) => s.name === scanScope) || playSets[activePlaySetIndex] || playSets[0] || null;
    }, [playSets, scanScope, activePlaySetIndex]);

    const compiledOrder = useMemo(() => {
        if (!activeBlueprintObj) {
            return compileLoadOrder([], [], {}, [], activeGameSchema, []);
        }
        return compileLoadOrder(
            activeBlueprintObj.mods || [],
            activeBlueprintObj.loadRules || [],
            activeBlueprintObj.modTiers || {},
            activeBlueprintObj.loadOrder || [],
            activeGameSchema,
            modList
        );
    }, [activeBlueprintObj, activeGameSchema, modList.length]);

    const activeBlueprintRules: LoadOrderRule[] = activeBlueprintObj?.loadRules || [];
    const ruleLinkedSet = useMemo(() => {
        const set = new Set<string>();
        for (const r of activeBlueprintRules) {
            if (r.modA) set.add(r.modA.toLowerCase());
            if (r.modB) set.add(r.modB.toLowerCase());
        }
        return set;
    }, [activeBlueprintRules]);

    const elevatedModsCount = useMemo(
        () => compiledOrder.items.filter((it) => !!it.tierFolder).length,
        [compiledOrder.items]
    );
    const standaloneElevatedMods = useMemo(
        () => compiledOrder.items.filter((it) => !!it.tierFolder),
        [compiledOrder.items]
    );
    const customLoadOrderCount = elevatedModsCount;
    const activeScopeOverridesCount = activeBlueprintRules.length + ignoredPairs.length;

    const isSequentialStrategy = compiledOrder.strategy !== "folder_priority";

    const reorderModInTierSection = (
        targetCleanName: string,
        newZeroBasedIndexInTier: number,
        targetTierFolder: string
    ) => {
        if (!targetCleanName) return;
        const schemaTiers = activeGameSchema?.load_order?.priority_tiers || [];
        const knownFoldersLower = new Set(
            schemaTiers.map((pt: any) => (pt.folder || "").toLowerCase()).filter(Boolean)
        );
        const cleanTargetLow = (targetCleanName.split(/[\\/]/).pop() || targetCleanName).toLowerCase();

        setPlaySets((prevSets: any[]) => {
            const idx = prevSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
            if (idx === -1) return prevSets;
            const updatedSets = [...prevSets];
            const currentSet = { ...updatedSets[idx] };
            const nextMods = [...(currentSet.mods || [])];
            const nextModTiers = { ...(currentSet.modTiers || {}) };

            let canonicalFile = targetCleanName.split(/[\\/]/).pop() || targetCleanName;
            for (let i = 0; i < nextMods.length; i++) {
                const strM = typeof nextMods[i] === "string" ? nextMods[i] : nextMods[i]?.name || nextMods[i]?.path || "";
                const fileM = strM.split(/[\\/]/).pop() || strM;
                if (fileM.toLowerCase() === cleanTargetLow) {
                    canonicalFile = fileM;
                    const segs = strM.replace(/\\/g, "/").split("/");
                    if (segs.length > 1 && knownFoldersLower.has(segs[0].toLowerCase())) {
                        segs.shift();
                    }
                    const baseRel = segs.join("/");
                    const nextPath = targetTierFolder ? `${targetTierFolder}/${baseRel}` : baseRel;
                    if (typeof nextMods[i] === "string") {
                        nextMods[i] = nextPath;
                    } else {
                        nextMods[i] = { ...nextMods[i], name: nextPath, path: nextPath };
                    }
                }
            }

            Object.keys(nextModTiers).forEach((k) => {
                if (k.toLowerCase() === cleanTargetLow) {
                    delete nextModTiers[k];
                }
            });
            if (targetTierFolder) {
                nextModTiers[canonicalFile] = targetTierFolder;
            }

            const compiled = compileLoadOrder(
                nextMods,
                currentSet.loadRules || [],
                nextModTiers,
                currentSet.loadOrder || [],
                activeGameSchema,
                []
            );

            const folderLow = (targetTierFolder || "").toLowerCase();
            const tierList = compiled.items
                .filter((it) => (it.tierFolder || "").toLowerCase() === folderLow && it.cleanName.toLowerCase() !== cleanTargetLow)
                .map((it) => it.cleanName);

            const clampedIdx = Math.max(0, Math.min(tierList.length, newZeroBasedIndexInTier));
            tierList.splice(clampedIdx, 0, canonicalFile);

            let tierCursor = 0;
            const nextOrder: string[] = [];
            const seen = new Set<string>();
            for (const it of compiled.items) {
                const itFolderLow = (it.tierFolder || "").toLowerCase();
                if (itFolderLow === folderLow) {
                    if (tierCursor < tierList.length) {
                        const nextName = tierList[tierCursor++];
                        nextOrder.push(nextName);
                        seen.add(nextName.toLowerCase());
                    }
                } else if (it.cleanName.toLowerCase() !== cleanTargetLow) {
                    nextOrder.push(it.cleanName);
                    seen.add(it.cleanName.toLowerCase());
                }
            }
            while (tierCursor < tierList.length) {
                const rem = tierList[tierCursor++];
                if (!seen.has(rem.toLowerCase())) {
                    nextOrder.push(rem);
                    seen.add(rem.toLowerCase());
                }
            }

            currentSet.mods = nextMods;
            currentSet.modTiers = nextModTiers;
            currentSet.loadOrder = nextOrder;
            updatedSets[idx] = currentSet;
            return updatedSets;
        });
    };

    const reorderModRef = useRef(reorderModInTierSection);
    reorderModRef.current = reorderModInTierSection;

    const buildPreviewTierList = <T extends { cleanName: string }>(baseTierMods: T[], folder: string): T[] => {
        if (!pointerDragGhost) return baseTierMods;
        const dragModLow = pointerDragGhost.mod.toLowerCase();
        const folderLow = (folder || "").toLowerCase();
        const targetFolderLow = (pointerDragGhost.targetTier || "").toLowerCase();
        const withoutDragged = baseTierMods.filter((it) => it.cleanName.toLowerCase() !== dragModLow);

        if (folderLow !== targetFolderLow) {
            return withoutDragged;
        }

        const draggedItem =
            baseTierMods.find((it) => it.cleanName.toLowerCase() === dragModLow) ||
            (compiledOrder.items.find((it) => it.cleanName.toLowerCase() === dragModLow) as unknown as T | undefined);
        if (!draggedItem) return baseTierMods;

        const nextList = [...withoutDragged];
        const clampedIdx = Math.max(0, Math.min(nextList.length, pointerDragGhost.targetIdx));
        nextList.splice(clampedIdx, 0, draggedItem);
        return nextList;
    };

    const beginPointerDragCandidate = (
        e: React.PointerEvent,
        modCleanName: string,
        modDisplayLabel: string,
        currentTierFolder: string,
        currentIdxInTier: number = 0
    ) => {
        if (e.button !== 0 || !modCleanName) return;
        const targetEl = e.target as HTMLElement | null;
        if (targetEl) {
            if (targetEl.closest("input, textarea, select, a, [data-no-drag]")) return;
            const btn = targetEl.closest("button");
            if (btn && !btn.hasAttribute("data-drag-handle")) return;
        }
        pointerDragCandidateRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            mod: modCleanName,
            label: modDisplayLabel,
            tierFolder: currentTierFolder,
            startIdx: currentIdxInTier,
            targetTier: currentTierFolder,
            targetIdx: currentIdxInTier,
            active: false,
        };
    };

    useEffect(() => {
        const handlePointerMove = (ev: PointerEvent) => {
            const cand = pointerDragCandidateRef.current;
            if (!cand) return;
            const dist = Math.hypot(ev.clientX - cand.startX, ev.clientY - cand.startY);
            if (!cand.active) {
                if (dist < 5) return;
                cand.active = true;
                didPointerDragRef.current = true;
                setDraggedLoadMod(cand.mod);
            }

            const hits = document.elementsFromPoint(ev.clientX, ev.clientY);
            let hoveredSlotEl: HTMLElement | null = null;
            let hoveredTierSectionEl: HTMLElement | null = null;

            for (const el of hits) {
                if (!hoveredSlotEl) {
                    const slotCard = (el as HTMLElement).closest?.("[data-lo-slot-idx]") as HTMLElement | null;
                    if (slotCard) {
                        hoveredSlotEl = slotCard;
                    }
                }
                if (!hoveredTierSectionEl) {
                    const tierSec = (el as HTMLElement).closest?.("[data-lo-tier-section]") as HTMLElement | null;
                    if (tierSec) {
                        hoveredTierSectionEl = tierSec;
                    }
                }
                if (hoveredSlotEl && hoveredTierSectionEl) break;
            }

            if (hoveredSlotEl) {
                const slotIdx = parseInt(hoveredSlotEl.getAttribute("data-lo-slot-idx") || "0", 10);
                const slotTier = hoveredSlotEl.getAttribute("data-lo-slot-tier") ?? cand.targetTier;
                if (!Number.isNaN(slotIdx)) {
                    cand.targetIdx = slotIdx;
                }
                cand.targetTier = slotTier;
                setDragOverTier(null);
            } else if (hoveredTierSectionEl) {
                const secId = hoveredTierSectionEl.getAttribute("data-lo-tier-section");
                const secFolder = hoveredTierSectionEl.getAttribute("data-lo-tier-folder") ?? "";
                const secCount = parseInt(hoveredTierSectionEl.getAttribute("data-lo-tier-count") || "0", 10);
                if (secFolder.toLowerCase() !== cand.targetTier.toLowerCase()) {
                    cand.targetTier = secFolder;
                    cand.targetIdx = Number.isNaN(secCount) ? 0 : secCount;
                }
                setDragOverTier(secId);
            } else {
                setDragOverTier(null);
            }

            setPointerDragGhost({
                mod: cand.mod,
                label: cand.label,
                x: ev.clientX,
                y: ev.clientY,
                targetTier: cand.targetTier,
                targetIdx: cand.targetIdx,
            });
        };

        const finishPointerDrag = () => {
            const cand = pointerDragCandidateRef.current;
            if (!cand) return;
            pointerDragCandidateRef.current = null;
            if (!cand.active) return;

            if (
                cand.targetTier.toLowerCase() !== cand.tierFolder.toLowerCase() ||
                cand.targetIdx !== cand.startIdx
            ) {
                reorderModRef.current(cand.mod, cand.targetIdx, cand.targetTier);
            }

            setDraggedLoadMod(null);
            setDragOverMod(null);
            setDragOverTier(null);
            setPointerDragGhost(null);
            window.setTimeout(() => {
                didPointerDragRef.current = false;
            }, 140);
        };

        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        window.addEventListener("pointerup", finishPointerDrag, { passive: true });
        window.addEventListener("pointercancel", finishPointerDrag, { passive: true });
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", finishPointerDrag);
            window.removeEventListener("pointercancel", finishPointerDrag);
        };
    }, []);

    const loadOrderIndexMap = useMemo(() => {
        const map = new Map<
            string,
            {
                index: number;
                tierFolder: string;
                tierLabel: string;
                tierPriority: number;
                shortTierLabel: string;
            }
        >();
        compiledOrder.items.forEach((it) => {
            const tierIdx = compiledOrder.priorityTiers.findIndex(
                (pt) => (pt.folder || "").toLowerCase() === (it.tierFolder || "").toLowerCase()
            );
            const tierMeta = getAgnosticTierMeta(it.tierFolder, tierIdx >= 0 ? tierIdx : 0);
            const entry = {
                index: it.index,
                tierFolder: it.tierFolder,
                tierLabel: it.tierLabel,
                tierPriority: it.tierPriority,
                shortTierLabel: tierMeta.shortLabel,
            };
            map.set(it.cleanName.toLowerCase(), entry);
            map.set(stripKnownModExt(it.cleanName).toLowerCase(), entry);
        });
        return map;
    }, [compiledOrder.items, compiledOrder.priorityTiers, t]);

    const vaultModLookupMap = useMemo(() => {
        const map = new Map<string, any>();
        if (!Array.isArray(modList)) return map;
        for (const m of modList) {
            const rawLeaf = String(m?.name || m?.path || "").split(/[\\/]/).pop() || "";
            if (!rawLeaf) continue;
            map.set(rawLeaf.toLowerCase(), m);
            map.set(stripKnownModExt(rawLeaf).toLowerCase(), m);
            const fmtName = stripKnownModExt(formatDisplayName(rawLeaf, undefined, activeGameSchema)).toLowerCase();
            if (fmtName) map.set(fmtName, m);
        }
        return map;
    }, [modList, activeGameSchema]);

    const resolveVaultMod = (rawName: string): any | null => {
        if (!rawName) return null;
        const leaf = stripPriorityPrefix(rawName).split(/[\\/]/).pop() || rawName;
        return (
            vaultModLookupMap.get(leaf.toLowerCase()) ||
            vaultModLookupMap.get(stripKnownModExt(leaf).toLowerCase()) ||
            vaultModLookupMap.get(stripKnownModExt(formatDisplayName(leaf, undefined, activeGameSchema)).toLowerCase()) ||
            null
        );
    };

    const openLoadOrderInspector = (
        modCleanName?: string,
        targetTierFolder?: string,
        mode?: "PRIORITY" | "RULE" | "REORDER"
    ) => {
        const clean = modCleanName || "";
        const resolvedMode = mode || (activeTab === "OVERRIDES" ? "RULE" : "PRIORITY");
        setInspectorMode(resolvedMode);
        setInspectorModSearch("");
        setSelectedLoadOrderMod(clean);
        setPendingTierFolder(targetTierFolder !== undefined ? targetTierFolder : null);
        setShowModPickerInInspector(!clean && resolvedMode === "PRIORITY");
        if (clean) {
            setRuleModA(clean);
        }
        setIsLoadOrderPanelOpen(true);
    };

    const updateSchemaLoadOrderEngine = async (patch: Partial<{ strategy: string; direction: string; manifest_file: string; prefix_format: string }>) => {
        if (!activeGameSchema) return;
        const nextLoadOrder = {
            ...(activeGameSchema.load_order || {}),
            ...patch,
        };
        const nextSchema = {
            ...activeGameSchema,
            load_order: nextLoadOrder,
        };
        setActiveGameSchema(nextSchema);
        try {
            await invoke("update_active_game_schema", { schema: nextSchema });
            setStatus(`${t("icon_check_circle", "check_circle")} ${t("schema_load_engine", "Load Order Engine")}: ${nextLoadOrder.strategy}`);
        } catch (e) {
            console.error("Failed to sync schema load order engine:", e);
        }
    };

    useEffect(() => {
        if (hasScanned && scanScope) {
            try {
                localStorage.setItem(`radar_stats_${scanScope}`, JSON.stringify({ fatal: fatalConflicts.length, tuning: tuningConflicts.length, clone: cloneConflicts.length, soft: softConflicts.length }));
            } catch (e) { }
        }
    }, [fatalConflicts, tuningConflicts, cloneConflicts, softConflicts, hasScanned, scanScope]);

    const [selectedForVault, setSelectedForVault] = useState<string[]>([]);
    const [, setResolvingScript] = useState<string | null>(null);
    const [confirmMassVault, setConfirmMassVault] = useState(false);
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [activeConflictRes, setActiveConflictRes] = useState<any>(null);

    const hydrateCachedScope = (scopeName: string, currentIgnored: string[] = ignoredPairs): boolean => {
        if (!scopeName) return false;
        try {
            const raw = localStorage.getItem(`sanctuary_radar_cache_${scopeName}`);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || parsed.schemaVersion !== 3) return false;
            const rawFatal = Array.isArray(parsed.fatal) ? parsed.fatal : [];
            const rawTuning = Array.isArray(parsed.tuning) ? parsed.tuning : [];
            const rawClone = Array.isArray(parsed.clone) ? parsed.clone : [];
            const rawSoft = Array.isArray(parsed.soft) ? parsed.soft : [];

            const fatal = rawFatal.filter((c: any) => !currentIgnored.includes(c.mod_pair));
            const tuning = rawTuning.filter((c: any) => !currentIgnored.includes(c.mod_pair));
            const clone = rawClone.filter((c: any) => !currentIgnored.includes(c.mod_pair));
            const soft = rawSoft.filter((c: any) => !currentIgnored.includes(c.mod_pair));
            const actionableClashes = fatal.length + tuning.length + clone.length;

            setFatalConflicts(fatal);
            setTuningConflicts(tuning);
            setCloneConflicts(clone);
            setSoftConflicts(soft);
            setStats({ packages: parsed.packages || 0, totalClashes: actionableClashes });
            setHasScanned(true);
            setLoading(false);
            setError(null);
            return true;
        } catch {
            return false;
        }
    };

    const runRadar = async (targetScope?: string | any, opts?: { switchTab?: boolean }) => {
        const resolvedTarget = typeof targetScope === "string" ? targetScope : undefined;
        const shouldSwitchTab = opts?.switchTab !== false;
        setIsSidePanelOpen(false);
        setLoading(true);
        setError(null);
        setSelectedForVault([]);
        setResolvingScript(null);
        setConfirmMassVault(false);
        try {
            const config: any = await invoke("get_saved_coordinates");
            const storeState = useStore.getState();
            let targetPath =
                storeState.modsPath ||
                config.mods_path ||
                config.live_path ||
                config.vault_path ||
                "";
            let targetFiles: string[] | null = null;

            const scopeToUse = resolvedTarget || scanScope || (playSets.length > 0 ? playSets[0].name : "");
            const set = playSets.find((s: any) => s.name === scopeToUse);
            if (set) {
                targetFiles = set.mods.map((m: any) => typeof m === 'string' ? m : (m.name || m.path || '')).filter(Boolean);
            }

            const report = await invoke<any>("run_conflict_radar", {
                modsPath: targetPath,
                targetFiles,
                gameSchema: activeGameSchema,
            });

            const rawFatal: any[] = [];
            const rawTuning: any[] = [];
            const rawClone: any[] = [];
            const rawSoft: any[] = [];

            report.conflicts.forEach((c: any) => {
                const [modA, modBRaw] = parseConflictPairNames(c);
                const modB = modBRaw || t("unknown_overlap", "Unknown Overlap");
                const enrichedConflict = { ...c, modA, modB };

                if (isCloneConflict(modA, modB)) { rawClone.push(enrichedConflict); }
                else if (c.severity_rank == 4) { rawFatal.push(enrichedConflict); }
                else if (c.severity_rank == 3) { rawTuning.push(enrichedConflict); }
                else { rawSoft.push(enrichedConflict); }
            });

            if (report.installed_mods) {
                const { data: hitList, error: dbError } = await supabase.from('logical_conflicts').select(`
          *,
          mod_a_rel:mods!logical_conflicts_mod_a_id_fkey(name),
          mod_b_rel:mods!logical_conflicts_mod_b_id_fkey(name)
        `);
                if (hitList && !dbError) {
                    hitList.forEach((hit: any) => {
                        const modAName = hit.mod_a_rel?.name || hit.mod_a;
                        const modBName = hit.mod_b_rel?.name || hit.mod_b;

                        if (!modAName || !modBName) return;

                        const actualA = report.installed_mods.find((m: string) => m && m.toLowerCase().includes(modAName.toLowerCase()));
                        const actualB = report.installed_mods.find((m: string) => m && m.toLowerCase().includes(modBName.toLowerCase()));

                        if (actualA && actualB) {
                            const ghostPair = `${actualA} 👻 ${actualB}`;
                            const ghostConflict = { mod_pair: ghostPair, modA: actualA, modB: actualB, is_ghost: true, resolution_note: hit.resolution_note, severity_rank: hit.severity_rank };
                            if (Number(hit.severity_rank) === 4) rawFatal.push(ghostConflict);
                            else if (Number(hit.severity_rank) === 3) rawTuning.push(ghostConflict);
                        }
                    });
                }
            }

            const fatal = rawFatal.filter((c: any) => !ignoredPairs.includes(c.mod_pair));
            const tuning = rawTuning.filter((c: any) => !ignoredPairs.includes(c.mod_pair));
            const clone = rawClone.filter((c: any) => !ignoredPairs.includes(c.mod_pair));
            const soft = rawSoft.filter((c: any) => !ignoredPairs.includes(c.mod_pair));
            const actionableClashes = fatal.length + tuning.length + clone.length;

            if (scopeToUse) {
                try {
                    const cachePayload = {
                        schemaVersion: 3,
                        fatal: rawFatal,
                        tuning: rawTuning,
                        clone: rawClone,
                        soft: rawSoft,
                        packages: report.total_packages,
                        totalClashes: rawFatal.length + rawTuning.length + rawClone.length,
                        timestamp: Date.now(),
                    };
                    localStorage.setItem(`sanctuary_radar_cache_${scopeToUse}`, JSON.stringify(cachePayload));
                    localStorage.setItem(`radar_stats_${scopeToUse}`, JSON.stringify({ fatal: fatal.length, tuning: tuning.length, clone: clone.length, soft: soft.length }));
                    window.dispatchEvent(new CustomEvent("sanctuary-radar-cache-updated", { detail: { scope: scopeToUse, payload: cachePayload } }));
                } catch {}
            }

            setStats({ packages: report.total_packages, totalClashes: actionableClashes });
            setFatalConflicts(fatal);
            setTuningConflicts(tuning);
            setCloneConflicts(clone);
            setSoftConflicts(soft);

        } catch (err) {
            setError(String(err));
        }
        setHasScanned(true);
        setLoading(false);
        if (shouldSwitchTab) {
            setActiveTab("CONFLICTS");
        }
    };

    useEffect(() => {
        if (!scanScope) return;
        const hydrated = hydrateCachedScope(scanScope, ignoredPairs);
        if (!hydrated) {
            runRadar(scanScope, { switchTab: false });
        }
    }, [scanScope, ignoredPairs]);

    useEffect(() => {
        const handleCacheUpdated = (e: any) => {
            const updatedScope = e?.detail?.scope;
            if (!updatedScope || updatedScope === scanScope) {
                hydrateCachedScope(scanScope, ignoredPairs);
            }
        };
        window.addEventListener("sanctuary-radar-cache-updated", handleCacheUpdated);
        return () => window.removeEventListener("sanctuary-radar-cache-updated", handleCacheUpdated);
    }, [scanScope, ignoredPairs]);

    const ignoreConflict = (modPair: string) => {
        const updated = [...ignoredPairs, modPair];
        setIgnoredPairs(updated);
        localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(updated));
        setFatalConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
        setTuningConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
        setCloneConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
        setSoftConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
        setStats((prev) => ({ ...prev, totalClashes: prev.totalClashes - 1 }));
    };

    const unignoreConflict = async (modPair: string) => {
        const updated = ignoredPairs.filter(p => p !== modPair);
        setIgnoredPairs(updated);
        if (updated.length === 0) {
            localStorage.removeItem("sanctuary_ignored_conflicts");
        } else {
            localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(updated));
        }
    };

    const toggleTarget = (selectedMod: string, otherMod: string) => {
        setSelectedForVault((prev: string[]) => {
            let newSelected = [...prev];
            if (!newSelected.includes(selectedMod)) {
                newSelected = newSelected.filter(m => m !== otherMod);
                newSelected.push(selectedMod);
            } else {
                newSelected = newSelected.filter(m => m !== selectedMod);
            }
            return newSelected;
        });
        setConfirmMassVault(false);
    };

    const executeMassVault = async () => {
        if (selectedForVault.length === 0) return;
        setLoading(true);
        setConfirmMassVault(false);
        try {
            const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
            if (playSetIndex !== -1) {
                const updatedSets = [...playSets];
                const currentSet = updatedSets[playSetIndex];

                currentSet.mods = currentSet.mods.filter((m: string) => {
                    const cleanM = m.replace(getExtensionRegex(activeGameSchema), "");
                    return !selectedForVault.some((target: string) => {
                        const cleanTarget = target.replace(getExtensionRegex(activeGameSchema), "");
                        return cleanM === cleanTarget || cleanM.endsWith(`/${cleanTarget}`) || cleanM.endsWith(`\\${cleanTarget}`);
                    });
                });

                setPlaySets(updatedSets);

            }
            setSelectedForVault([]);
            setIsBulkMode(false);
            await runRadar();
        } catch (err) { useStore.getState().pushStatus(`Mass Yeet Error: ${err}`); setLoading(false); }
    };

    const vaultSingleScript = async (modName: string) => {
        try {
            if (activeConflictRes || modName) {
                const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
                if (playSetIndex !== -1) {
                    const updatedSets = [...playSets];
                    const currentSet = updatedSets[playSetIndex];
                    const cleanMod = modName.replace(getExtensionRegex(activeGameSchema), "");
                    currentSet.mods = currentSet.mods.filter((m: string) => {
                        const cleanM = m.replace(getExtensionRegex(activeGameSchema), "");
                        return cleanM !== cleanMod && !cleanM.endsWith(`/${cleanMod}`) && !cleanM.endsWith(`\\${cleanMod}`);
                    });
                    setPlaySets(updatedSets);

                }

                setFatalConflicts((prev) => prev.filter((c) => c.modA !== modName && c.modB !== modName));
                setTuningConflicts((prev) => prev.filter((c) => c.modA !== modName && c.modB !== modName));
                setCloneConflicts((prev) => prev.filter((c) => c.modA !== modName && c.modB !== modName));
                setSoftConflicts((prev) => prev.filter((c) => c.modA !== modName && c.modB !== modName));
                setStats((prev: any) => ({ ...prev, totalClashes: Math.max(0, prev.totalClashes - 1) }));
                setActiveConflictRes(null);
            }
        } catch (err) { useStore.getState().pushStatus(`Error: ${err}`); }
    };

    const applyOverride = async (winnerName: string, modPair: string, targetTierFolder?: string, loserName?: string) => {
        try {
            if (activeConflictRes || winnerName) {
                applyConflictOverride(winnerName, modPair, scanScope, targetTierFolder, loserName);
            }

            const updatedIgnored = [...ignoredPairs, modPair];
            setIgnoredPairs(updatedIgnored);

            setTuningConflicts((prev: any[]) => prev.filter((c: any) => c.mod_pair !== modPair));
            setStats((prev: any) => ({ ...prev, totalClashes: Math.max(0, prev.totalClashes - 1) }));
            setActiveConflictRes(null);
        } catch (err) { useStore.getState().pushStatus(`Error: ${err}`); }
    };

    const priorityFoldersSet = useMemo(() => {
        const tiers = activeGameSchema?.load_order?.priority_tiers || [];
        const folders = tiers.map((pt: any) => (pt.folder || "").toLowerCase()).filter(Boolean);
        return new Set<string>(folders);
    }, [activeGameSchema]);

    const stripPriorityPrefix = (rawPath: string) => {
        const segs = String(rawPath || "").replace(/\\/g, "/").split("/");
        if (segs.length > 1 && priorityFoldersSet.has(segs[0].toLowerCase())) {
            segs.shift();
        }
        return segs.join("/");
    };

    const hasPriorityPrefix = (rawPath: string) => {
        const segs = String(rawPath || "").replace(/\\/g, "/").split("/");
        return segs.length > 1 && priorityFoldersSet.has(segs[0].toLowerCase());
    };

    const totalOverridesCount = useMemo(() => {
        return playSets.reduce(
            (acc: number, bp: any) =>
                acc +
                (bp.mods
                    ? bp.mods.filter((m: any) =>
                          hasPriorityPrefix(typeof m === "string" ? m : m.name || m.path || "")
                      ).length
                    : 0),
            0
        );
    }, [playSets, priorityFoldersSet]);

    const undoOverride = async (winnerName: string) => {
        try {
            const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
            const cleanWinnerFile = stripPriorityPrefix(winnerName).split(/[\\/]/).pop() || winnerName;
            const cleanWinner = cleanWinnerFile.replace(getExtensionRegex(activeGameSchema), "").toLowerCase();

            if (playSetIndex !== -1) {
                const updatedSets = [...playSets];
                const currentSet = { ...updatedSets[playSetIndex] };
                currentSet.mods = currentSet.mods.map((m: any) => {
                    const strM = typeof m === 'string' ? m : (m.name || m.path || '');
                    const stripped = stripPriorityPrefix(strM);
                    const cleanM = stripped.replace(getExtensionRegex(activeGameSchema), "").toLowerCase();
                    if (hasPriorityPrefix(strM) && (cleanM === cleanWinner || cleanM.endsWith(`/${cleanWinner}`))) {
                        if (typeof m === 'string') return stripped;
                        return { ...m, name: stripped, path: stripPriorityPrefix(m.path || '') };
                    }
                    return m;
                });
                if (currentSet.modTiers) {
                    const nextTiers = { ...currentSet.modTiers };
                    delete nextTiers[cleanWinnerFile];
                    delete nextTiers[cleanWinnerFile.toLowerCase()];
                    currentSet.modTiers = nextTiers;
                }
                if (Array.isArray(currentSet.loadRules)) {
                    currentSet.loadRules = currentSet.loadRules.filter(
                        (r: LoadOrderRule) =>
                            r.modA.toLowerCase() !== cleanWinnerFile.toLowerCase() &&
                            r.modA.replace(getExtensionRegex(activeGameSchema), "").toLowerCase() !== cleanWinner
                    );
                }
                if (Array.isArray(currentSet.ignoredConflicts)) {
                    currentSet.ignoredConflicts = currentSet.ignoredConflicts.filter(
                        (pair: string) => !pair.toLowerCase().includes(cleanWinner)
                    );
                }
                updatedSets[playSetIndex] = currentSet;
                setPlaySets(updatedSets);

                window.dispatchEvent(new Event("storage"));
            }

            const updatedIgnored = ignoredPairs.filter(pair => !pair.toLowerCase().includes(cleanWinner));
            setIgnoredPairs(updatedIgnored);
            if (updatedIgnored.length > 0) {
                localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(updatedIgnored));
            } else {
                localStorage.removeItem("sanctuary_ignored_conflicts");
            }

            await runRadar();
            setActiveConflictRes(null);
        } catch (err) { useStore.getState().pushStatus(`Undo Error: ${err}`); }
    };

    const clearAllOverrides = async () => {
        try {
            const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
            if (playSetIndex !== -1) {
                const updatedSets = [...playSets];
                const currentSet = { ...updatedSets[playSetIndex] };
                currentSet.mods = currentSet.mods.map((m: any) => {
                    if (typeof m === 'string') return stripPriorityPrefix(m);
                    return { ...m, name: stripPriorityPrefix(m.name || ''), path: stripPriorityPrefix(m.path || '') };
                });
                currentSet.modTiers = {};
                currentSet.loadRules = [];
                currentSet.ignoredConflicts = [];
                updatedSets[playSetIndex] = currentSet;
                setPlaySets(updatedSets);

                window.dispatchEvent(new Event("storage"));
            }
        } catch (err) { useStore.getState().pushStatus(`Undo Error: ${err}`); }
    };

    const searchFilter = (c: any, searchStr: string) => {
        if (!searchStr) return true;
        const term = searchStr.toLowerCase();
        const modA = (c.modA || '').toLowerCase();
        const modB = (c.modB || '').toLowerCase();
        const pair = (c.mod_pair || '').toLowerCase();
        return modA.includes(term) || modB.includes(term) || pair.includes(term);
    };

    const filteredFatal = useMemo(() => fatalConflicts.filter(c => searchFilter(c, conflictSearch)), [fatalConflicts, conflictSearch]);
    const filteredTuning = useMemo(() => tuningConflicts.filter(c => searchFilter(c, conflictSearch)), [tuningConflicts, conflictSearch]);
    const filteredClone = useMemo(() => cloneConflicts.filter(c => searchFilter(c, conflictSearch)), [cloneConflicts, conflictSearch]);
    const filteredSoft = useMemo(() => softConflicts.filter(c => searchFilter(c, conflictSearch)), [softConflicts, conflictSearch]);

    const overridesViewModel = useMemo(() => {
        if (activeTab !== "OVERRIDES") {
            return { allActiveOverrides: [] as any[], trueIgnoredPairs: [] as string[] };
        }
        const activeSetMods = activeBlueprintObj?.mods || [];
        const manualOverrides = activeSetMods
            .filter((m: any) => hasPriorityPrefix(typeof m === "string" ? m : (m.name || m.path || "")))
            .map((m: any) => typeof m === "string" ? m : (m.name || m.path || ""));

        const resolvedOverrides = ignoredPairs.map((pair: string) => {
            const [left, right] = parseConflictPairNames(pair);
            if (!right) return null;

            const leftClean = stripPriorityPrefix(left).toLowerCase();
            const rightClean = stripPriorityPrefix(right).toLowerCase();

            const leftIsWinner = manualOverrides.some((m: string) => {
                const p = stripPriorityPrefix(m).toLowerCase();
                return p === leftClean || p.endsWith(`/${leftClean}`) || p.endsWith(`\\${leftClean}`);
            });

            const rightIsWinner = manualOverrides.some((m: string) => {
                const p = stripPriorityPrefix(m).toLowerCase();
                return p === rightClean || p.endsWith(`/${rightClean}`) || p.endsWith(`\\${rightClean}`);
            });

            if (leftIsWinner || rightIsWinner) {
                return {
                    pair,
                    winnerPath: leftIsWinner ? left : right,
                    loserPath: leftIsWinner ? right : left,
                    isManual: false,
                };
            }
            return null;
        }).filter(Boolean) as any[];

        const ruleOverrides = activeBlueprintRules.map((r) => ({
            id: r.id,
            pair: `${r.modA} vs ${r.modB}`,
            winnerPath: r.type === "after" ? r.modA : r.modB,
            loserPath: r.type === "after" ? r.modB : r.modA,
            isRule: true,
            isManual: false,
        }));

        const dedupedResolvedOverrides = resolvedOverrides.filter((res) => {
            const wClean = (stripPriorityPrefix(res.winnerPath).split(/[\\/]/).pop() || res.winnerPath).toLowerCase();
            const lClean = (stripPriorityPrefix(res.loserPath).split(/[\\/]/).pop() || res.loserPath).toLowerCase();
            return !ruleOverrides.some((ro) => {
                const rw = (stripPriorityPrefix(ro.winnerPath).split(/[\\/]/).pop() || ro.winnerPath).toLowerCase();
                const rl = (stripPriorityPrefix(ro.loserPath).split(/[\\/]/).pop() || ro.loserPath).toLowerCase();
                return (rw === wClean && rl === lClean) || (rw === lClean && rl === wClean);
            });
        });

        const searchLow = overrideSearch.toLowerCase();
        const allActiveOverrides = [...ruleOverrides, ...dedupedResolvedOverrides].filter(
            (o) =>
                !overrideSearch ||
                o.winnerPath.toLowerCase().includes(searchLow) ||
                (o.loserPath && o.loserPath.toLowerCase().includes(searchLow))
        );
        const resolvedPairSet = new Set(resolvedOverrides.map((res) => res.pair));
        const trueIgnoredPairs = ignoredPairs
            .filter((pair: string) => !resolvedPairSet.has(pair))
            .filter((pair: string) => !overrideSearch || pair.toLowerCase().includes(searchLow));

        return { allActiveOverrides, trueIgnoredPairs };
    }, [activeTab, activeBlueprintObj, ignoredPairs, activeBlueprintRules, overrideSearch]);

    const hasExplicitRuleBetween = (cleanA: string, cleanB: string) => {
        const baseA = stripKnownModExt(cleanA);
        const baseB = stripKnownModExt(cleanB);
        return activeBlueprintRules.some((r) => {
            const ra = (r.modA || "").toLowerCase();
            const rb = (r.modB || "").toLowerCase();
            const rBaseA = stripKnownModExt(ra);
            const rBaseB = stripKnownModExt(rb);
            return (
                (ra === cleanA && rb === cleanB) ||
                (ra === cleanB && rb === cleanA) ||
                (rBaseA === baseA && rBaseB === baseB) ||
                (rBaseA === baseB && rBaseB === baseA)
            );
        });
    };

    const getConflictLoadOrderInfo = (c: any) => {
        if (!c) return undefined;
        const cleanA = stripPriorityPrefix(c.modA || "").split(/[\\/]/).pop()?.toLowerCase() || "";
        const cleanB = stripPriorityPrefix(c.modB || "").split(/[\\/]/).pop()?.toLowerCase() || "";
        const infoA = loadOrderIndexMap.get(cleanA) || loadOrderIndexMap.get(stripKnownModExt(cleanA));
        const infoB = loadOrderIndexMap.get(cleanB) || loadOrderIndexMap.get(stripKnownModExt(cleanB));
        let winner: "A" | "B" | null = null;
        if (infoA && infoB && infoA.index !== infoB.index) {
            const hasExplicitOrder =
                infoA.tierPriority !== infoB.tierPriority ||
                hasExplicitRuleBetween(cleanA, cleanB) ||
                (isSequentialStrategy && (activeBlueprintObj?.loadOrder || []).length > 0);
            if (hasExplicitOrder) {
                winner = infoA.index > infoB.index ? "A" : "B";
            }
        }
        return {
            elevatedTierA: infoA?.tierFolder ? infoA.shortTierLabel : undefined,
            elevatedTierB: infoB?.tierFolder ? infoB.shortTierLabel : undefined,
            tierLabelA: infoA?.tierLabel,
            tierLabelB: infoB?.tierLabel,
            winner,
        };
    };

    const modOverlapMap = useMemo(() => {
        const map = new Map<
            string,
            {
                winsCount: number;
                yieldsCount: number;
                highestSeverity: number;
                entries: Array<{
                    enemyRaw: string;
                    enemyClean: string;
                    enemyDisplay: string;
                    enemyIndex?: number;
                    enemyTierLabel?: string;
                    severity: number;
                    sharedAssets: number;
                    isWinning: boolean;
                    isOverridden: boolean;
                    conflict: any;
                }>;
            }
        >();

        const allClashes = [
            ...fatalConflicts.map((c) => ({ ...c, _sev: 4 })),
            ...tuningConflicts.map((c) => ({ ...c, _sev: 3 })),
            ...cloneConflicts.map((c) => ({ ...c, _sev: 2 })),
            ...softConflicts.map((c) => ({ ...c, _sev: 1 })),
        ];

        const ensureEntry = (key: string) => {
            let e = map.get(key);
            if (!e) {
                e = { winsCount: 0, yieldsCount: 0, highestSeverity: 0, entries: [] };
                map.set(key, e);
            }
            return e;
        };

        allClashes.forEach((c) => {
            const cleanA = (stripPriorityPrefix(c.modA || "").split(/[\\/]/).pop() || c.modA || "").toLowerCase();
            const cleanB = (stripPriorityPrefix(c.modB || "").split(/[\\/]/).pop() || c.modB || "").toLowerCase();
            if (!cleanA || !cleanB) return;

            const infoA = loadOrderIndexMap.get(cleanA) || loadOrderIndexMap.get(stripKnownModExt(cleanA));
            const infoB = loadOrderIndexMap.get(cleanB) || loadOrderIndexMap.get(stripKnownModExt(cleanB));
            const hasExplicitOrder =
                infoA !== undefined &&
                infoB !== undefined &&
                (infoA.tierPriority !== infoB.tierPriority ||
                    hasExplicitRuleBetween(cleanA, cleanB) ||
                    (isSequentialStrategy && (activeBlueprintObj?.loadOrder || []).length > 0));
            const aWins = hasExplicitOrder && infoA && infoB ? infoA.index > infoB.index : false;
            const bWins = hasExplicitOrder && infoA && infoB ? infoB.index > infoA.index : false;
            const sev = Number(c.severity_rank || c._sev || 3);
            const shared = Number(c.shared_assets || 1);

            const recA = ensureEntry(cleanA);
            if (sev > recA.highestSeverity) recA.highestSeverity = sev;
            if (aWins) recA.winsCount += 1;
            else if (bWins) recA.yieldsCount += 1;
            recA.entries.push({
                enemyRaw: c.modB,
                enemyClean: stripPriorityPrefix(c.modB || "").split(/[\\/]/).pop() || c.modB,
                enemyDisplay: stripKnownModExt(formatDisplayName(c.modB, undefined, activeGameSchema)),
                enemyIndex: infoB?.index,
                enemyTierLabel: infoB?.tierFolder ? infoB.shortTierLabel : undefined,
                severity: sev,
                sharedAssets: shared,
                isWinning: aWins,
                isOverridden: bWins,
                conflict: c,
            });

            const recB = ensureEntry(cleanB);
            if (sev > recB.highestSeverity) recB.highestSeverity = sev;
            if (bWins) recB.winsCount += 1;
            else if (aWins) recB.yieldsCount += 1;
            recB.entries.push({
                enemyRaw: c.modA,
                enemyClean: stripPriorityPrefix(c.modA || "").split(/[\\/]/).pop() || c.modA,
                enemyDisplay: stripKnownModExt(formatDisplayName(c.modA, undefined, activeGameSchema)),
                enemyIndex: infoA?.index,
                enemyTierLabel: infoA?.tierFolder ? infoA.shortTierLabel : undefined,
                severity: sev,
                sharedAssets: shared,
                isWinning: bWins,
                isOverridden: aWins,
                conflict: c,
            });
        });

        return map;
    }, [fatalConflicts, tuningConflicts, cloneConflicts, softConflicts, loadOrderIndexMap, activeGameSchema, activeBlueprintRules, isSequentialStrategy, activeBlueprintObj]);

    const filteredQueue = useMemo(() => {
        const q = loadOrderSearch ? loadOrderSearch.trim().toLowerCase() : "";
        return compiledOrder.items
            .filter((it) => {
                if (!q) return false;
                const keyLower = it.cleanName.toLowerCase();
                return (
                    keyLower.includes(q) ||
                    it.displayName.toLowerCase().includes(q) ||
                    (it.tierFolder && it.tierFolder.toLowerCase().includes(q))
                );
            })
            .map((it) => {
                const tierIdx = compiledOrder.priorityTiers.findIndex(
                    (pt) => (pt.folder || "").toLowerCase() === (it.tierFolder || "").toLowerCase()
                );
                return {
                    ...it,
                    cleanDisplayTitle: stripKnownModExt(it.displayName),
                    extLabel: getFileLabel(it.cleanName, activeGameSchema),
                    tierMeta: getAgnosticTierMeta(it.tierFolder, tierIdx >= 0 ? tierIdx : 0),
                    overlapInfo: modOverlapMap.get(it.cleanName.toLowerCase()),
                };
            });
    }, [compiledOrder.items, compiledOrder.priorityTiers, modOverlapMap, loadOrderSearch, activeGameSchema, t]);

    const fatalVirtual = useVirtualWindow({ count: filteredFatal.length, estimateSize: 280, gap: 24, threshold: 60 });
    const tuningVirtual = useVirtualWindow({ count: filteredTuning.length, estimateSize: 280, gap: 24, threshold: 60 });
    const cloneVirtual = useVirtualWindow({ count: filteredClone.length, estimateSize: 280, gap: 24, threshold: 60 });
    const softVirtual = useVirtualWindow({ count: filteredSoft.length, estimateSize: 280, gap: 24, threshold: 60 });
    const queueVirtual = useVirtualWindow({ count: filteredQueue.length, estimateSize: 280, gap: 24, threshold: 60 });

    return (
        <>
            <div className="flex flex-col gap-0 pb-32 w-full relative z-10">
                <ViewHeader
                    title={t("radar_title", "Conflict Scanner")}
                    subtitle={t("radar_subtitle", "Load-order scans, duplicates, and override conflicts")}
                    icon={t("icon_crisis_alert", "crisis_alert")}
                    iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                    breadcrumb={
                        activeTab !== "COMMAND"
                            ? activeTab === "LOAD_ORDER"
                                ? t("tab_load_order", "Load Order")
                                : t(`tab_${activeTab.toLowerCase()}`, activeTab)
                            : undefined
                    }
                    onTitleClick={() => setActiveTab("COMMAND")}
                >
                    {activeTab === "COMMAND" && (
                        <ActionPill
                            hideSearch={true}
                            searchQuery=""
                            setSearchQuery={() => {}}
                            actions={[
                                {
                                    id: "radar_engine_settings",
                                    icon: t("icon_tune", "tune"),
                                    label: t("radar_engine_title", "Radar & Load Order Engine"),
                                    onClick: () => setIsSidePanelOpen(true),
                                },
                            ]}
                        />
                    )}
                    {activeTab === "CONFLICTS" && (
                        <ActionPill
                            searchQuery={conflictSearch}
                            setSearchQuery={setConflictSearch}
                            searchPlaceholder={t("search_ph", "Search {mods}...") as string}
                            primaryPopover={{
                                icon: t("icon_tune", "tune"),
                                label: (activeConflictSeverity !== null
                                    ? `${t("filters", "Filters")} (1)`
                                    : t("filters", "Filters")) as string,
                                content: (
                                    <div className="flex flex-col w-[380px] p-4 max-w-[calc(100vw-40px)] text-left gap-2">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1 px-1 flex items-center gap-2">
                                            {t("severity", "Severity")}
                                            <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-1">
                                            {[
                                                { id: null, label: `${t("all", "All")} (${compiledOrder.cycles.length + fatalConflicts.length + tuningConflicts.length + cloneConflicts.length + softConflicts.length})` },
                                                { id: 5, label: `${t("tier5_short", "Severity 5 • Loops")} (${compiledOrder.cycles.length})` },
                                                { id: 4, label: `${t("total_severity_4", "Severity 4 • Fatal")} (${fatalConflicts.length})` },
                                                { id: 3, label: `${t("total_severity_3", "Severity 3 • Tuning")} (${tuningConflicts.length})` },
                                                { id: 2, label: `${t("total_clones", "Severity 2 • Clones")} (${cloneConflicts.length})` },
                                                { id: 1, label: `${t("total_soft", "Severity 1 • Visual")} (${softConflicts.length})` },
                                            ].map((opt) => {
                                                const active = activeConflictSeverity === opt.id;
                                                return (
                                                    <button
                                                        key={String(opt.id)}
                                                        type="button"
                                                        onClick={() => setActiveConflictSeverity(opt.id)}
                                                        className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                                                            active ? "is-selected font-bold" : "font-semibold"
                                                        }`}
                                                    >
                                                        <span className="truncate">{opt.label}</span>
                                                        {active && (
                                                            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                                                                {t("icon_check", "check")}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ),
                            }}
                            actions={[
                                {
                                    id: "rescan_blueprint",
                                    icon: t("icon_sync", "sync"),
                                    label: t("btn_sweep", "Scan {Blueprint}"),
                                    onClick: () => runRadar(scanScope, { switchTab: false }),
                                },
                                {
                                    id: "radar_engine_settings",
                                    icon: t("icon_settings", "settings"),
                                    label: t("radar_engine_title", "Radar & Load Order Engine"),
                                    onClick: () => setIsSidePanelOpen(true),
                                },
                            ]}
                        />
                    )}
                    {activeTab === "OVERRIDES" && (
                        <ActionPill
                            searchQuery={overrideSearch}
                            setSearchQuery={setOverrideSearch}
                            searchPlaceholder={t("search_ph", "Search {mods}...") as string}
                            primaryPopover={{
                                icon: t("icon_tune", "tune"),
                                label: (overrideTab !== "ALL"
                                    ? `${t("filters", "Filters")} (1)`
                                    : t("filters", "Filters")) as string,
                                content: (
                                    <div className="flex flex-col w-[320px] p-4 max-w-[calc(100vw-40px)] text-left gap-2">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1 px-1 flex items-center gap-2">
                                            {t("filter_status", "Filter Status")}
                                            <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-1">
                                            {[
                                                { id: "ALL" as const, label: t("all", "All") },
                                                { id: "ACTIVE" as const, label: t("load_order_rules", "Load Order Rules") },
                                                { id: "IGNORED" as const, label: t("ignored_conflicts", "Ignored Conflicts") },
                                            ].map((opt) => {
                                                const active = overrideTab === opt.id;
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => setOverrideTab(opt.id)}
                                                        className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                                                            active ? "is-selected font-bold" : "font-semibold"
                                                        }`}
                                                    >
                                                        <span className="truncate">{opt.label}</span>
                                                        {active && (
                                                            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                                                                {t("icon_check", "check")}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ),
                            }}
                            actions={[
                                {
                                    id: "add_load_rule",
                                    icon: t("icon_add", "add"),
                                    label: t("lo_add_rule", "Add Load Rule"),
                                    onClick: () => openLoadOrderInspector(""),
                                    activeClassName: "text-[var(--accent)]",
                                },
                                {
                                    id: "radar_engine_settings",
                                    icon: t("icon_settings", "settings"),
                                    label: t("radar_engine_title", "Radar & Load Order Engine"),
                                    onClick: () => setIsSidePanelOpen(true),
                                },
                            ]}
                        />
                    )}
                    {activeTab === "LOAD_ORDER" && (
                        <ActionPill
                            searchQuery={loadOrderSearch}
                            setSearchQuery={setLoadOrderSearch}
                            searchPlaceholder={t("search_ph", "Search {mods}...") as string}
                            primaryPopover={{
                                icon: t("icon_tune", "tune"),
                                label: (loadOrderSubFilter !== "ALL"
                                    ? `${t("filters", "Filters")} (1)`
                                    : t("filters", "Filters")) as string,
                                content: (
                                    <div className="flex flex-col w-[340px] p-4 max-w-[calc(100vw-40px)] text-left gap-2">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1 px-1 flex items-center gap-2">
                                            {t("lo_priority_tier", "Priority Tier")}
                                            <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-1">
                                            {[
                                                { id: "ALL" as const, label: `${t("all", "All")} (${standaloneElevatedMods.length})` },
                                                {
                                                    id: "TIER_1" as const,
                                                    label: `${t("lo_role_tier1", "Late Load (Tier 1)")} (${
                                                        standaloneElevatedMods.filter(
                                                            (it) =>
                                                                (it.tierFolder || "").toLowerCase() ===
                                                                (compiledOrder.priorityTiers[1]?.folder || "").toLowerCase()
                                                        ).length
                                                    })`,
                                                },
                                                {
                                                    id: "TIER_2" as const,
                                                    label: `${t("lo_role_tier2", "High Priority (Tier 2)")} (${
                                                        standaloneElevatedMods.filter(
                                                            (it) =>
                                                                (it.tierFolder || "").toLowerCase() ===
                                                                (compiledOrder.priorityTiers[2]?.folder || "").toLowerCase()
                                                        ).length
                                                    })`,
                                                },
                                                {
                                                    id: "TIER_3" as const,
                                                    label: `${t("lo_role_tier3", "Final Override (Always Wins)")} (${
                                                        standaloneElevatedMods.filter(
                                                            (it) =>
                                                                (it.tierFolder || "").toLowerCase() ===
                                                                (compiledOrder.priorityTiers[3]?.folder || "").toLowerCase()
                                                        ).length
                                                    })`,
                                                },
                                            ].map((opt) => {
                                                const active = loadOrderSubFilter === opt.id;
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => setLoadOrderSubFilter(opt.id)}
                                                        className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                                                            active ? "is-selected font-bold" : "font-semibold"
                                                        }`}
                                                    >
                                                        <span className="truncate">{opt.label}</span>
                                                        {active && (
                                                            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                                                                {t("icon_check", "check")}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ),
                            }}
                            actions={[
                                {
                                    id: "select_mod_tier",
                                    icon: t("icon_add", "add"),
                                    label: t("lo_select_target_mod", "Select {Mod} to Configure"),
                                    onClick: () => openLoadOrderInspector(""),
                                    activeClassName: "text-[var(--accent)]",
                                },
                                {
                                    id: "auto_sort_queue",
                                    icon: t("icon_swap_vert", "swap_vert"),
                                    label: t("lo_auto_sort", "Auto-Sort Queue"),
                                    onClick: () => autoSortBlueprintLoadOrder(scanScope),
                                },
                                {
                                    id: "apply_load_order",
                                    icon: t("icon_check_circle", "check_circle"),
                                    label: t("lo_apply_order_btn", "Apply Load Order"),
                                    onClick: () => equipPlaySet(scanScope),
                                },
                                {
                                    id: "radar_engine_settings",
                                    icon: t("icon_settings", "settings"),
                                    label: t("radar_engine_title", "Radar & Load Order Engine"),
                                    onClick: () => setIsSidePanelOpen(true),
                                },
                            ]}
                        />
                    )}
                </ViewHeader>
                <div className="md:hidden">
                    <HoverTabDrawer title={t("radar_title", "Conflict Scanner")} activeTab={activeTab} setTab={setActiveTab}>
                        <VerticalTabButton id="COMMAND" icon={t("icon_dashboard", "dashboard")} label={t("overview", "Overview")} activeTab={activeTab} setTab={setActiveTab} />
                        <VerticalTabButton
                            id="CONFLICTS"
                            icon={t("icon_warning", "warning")}
                            label={t("conflicts", "Conflicts")}
                            activeTab={activeTab}
                            setTab={setActiveTab}
                            badge={(fatalConflicts.length + tuningConflicts.length) > 0 ? (fatalConflicts.length + tuningConflicts.length) : null}
                            activeColorClass={fatalConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] shadow-md' : tuningConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] shadow-md' : undefined}
                            inactiveColorClass={fatalConflicts.length > 0 ? 'text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-80 hover:opacity-100' : tuningConflicts.length > 0 ? 'text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-80 hover:opacity-100' : undefined}
                            badgeColorClass={fatalConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]' : tuningConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)]' : undefined}
                        />
                        <VerticalTabButton id="OVERRIDES" icon={t("icon_rule", "rule")} label={t("overrides", "Overrides")} activeTab={activeTab} setTab={setActiveTab} badge={activeScopeOverridesCount > 0 ? activeScopeOverridesCount : null} />
                        <VerticalTabButton
                            id="LOAD_ORDER"
                            icon={t("icon_low_priority", "low_priority")}
                            label={t("tab_load_order", "Load Order")}
                            activeTab={activeTab}
                            setTab={setActiveTab}
                            badge={customLoadOrderCount > 0 ? customLoadOrderCount : null}
                        />
                    </HoverTabDrawer>
                </div>

                <div className="flex flex-col w-full gap-3 mb-8 md:mb-10">
                    <StatTileCarousel>
                        <DashboardStatTile variant="tab" icon={t("icon_dashboard", "dashboard")} label={t("overview", "Overview")} number={scanScope || ""} onClick={() => setActiveTab("COMMAND")} isActive={activeTab === "COMMAND"} />
                        <DashboardStatTile variant="tab"
                            icon={t("icon_warning", "warning")}
                            label={t("conflicts", "Conflicts")}
                            number={(fatalConflicts.length + tuningConflicts.length) > 0 ? (fatalConflicts.length + tuningConflicts.length) : 0}
                            colorClass={fatalConflicts.length > 0 ? 'text-[var(--danger)]' : tuningConflicts.length > 0 ? 'text-[var(--warning)]' : undefined}
                            onClick={() => setActiveTab("CONFLICTS")}
                            isActive={activeTab === "CONFLICTS"}
                        />
                        <DashboardStatTile variant="tab" icon={t("icon_rule", "rule")} label={t("overrides", "Overrides")} number={activeScopeOverridesCount} onClick={() => setActiveTab("OVERRIDES")} isActive={activeTab === "OVERRIDES"} />
                        <DashboardStatTile
                            variant="tab"
                            icon={t("icon_low_priority", "low_priority")}
                            label={t("tab_load_order", "Load Order")}
                            number={
                                compiledOrder.cycles.length > 0
                                    ? `${compiledOrder.cycles.length} !`
                                    : customLoadOrderCount
                            }
                            colorClass={compiledOrder.cycles.length > 0 ? "text-[var(--danger)]" : customLoadOrderCount > 0 ? "text-[var(--accent)]" : undefined}
                            onClick={() => setActiveTab("LOAD_ORDER")}
                            isActive={activeTab === "LOAD_ORDER"}
                        />
                    </StatTileCarousel>
                </div>

                <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">

                    <ScoutCommandAndConflictTabs
                        t={t}
                        removeLoadOrderRule={removeLoadOrderRule}
                        loading={loading}
                        error={error}
                        hasScanned={hasScanned}
                        setShowUndoPanel={setShowUndoPanel}
                        stats={stats}
                        playSets={playSets}
                        activeGameSchema={activeGameSchema}
                        scanScope={scanScope}
                        setScanScope={setScanScope}
                        ignoredPairs={ignoredPairs}
                        fatalConflicts={fatalConflicts}
                        tuningConflicts={tuningConflicts}
                        cloneConflicts={cloneConflicts}
                        softConflicts={softConflicts}
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        setOverrideTab={setOverrideTab}
                        blueprintSearch={blueprintSearch}
                        setBlueprintSearch={setBlueprintSearch}
                        activeConflictSeverity={activeConflictSeverity}
                        stripKnownModExt={stripKnownModExt}
                        compiledOrder={compiledOrder}
                        selectedForVault={selectedForVault}
                        setConfirmMassVault={setConfirmMassVault}
                        confirmMassVault={confirmMassVault}
                        isBulkMode={isBulkMode}
                        setIsBulkMode={setIsBulkMode}
                        setActiveConflictRes={setActiveConflictRes}
                        hydrateCachedScope={hydrateCachedScope}
                        runRadar={runRadar}
                        ignoreConflict={ignoreConflict}
                        toggleTarget={toggleTarget}
                        executeMassVault={executeMassVault}
                        vaultSingleScript={vaultSingleScript}
                        applyOverride={applyOverride}
                        totalOverridesCount={totalOverridesCount}
                        filteredFatal={filteredFatal}
                        filteredTuning={filteredTuning}
                        filteredClone={filteredClone}
                        filteredSoft={filteredSoft}
                        getConflictLoadOrderInfo={getConflictLoadOrderInfo}
                        fatalVirtual={fatalVirtual}
                        tuningVirtual={tuningVirtual}
                        cloneVirtual={cloneVirtual}
                        softVirtual={softVirtual}
                    />
                    <ScoutOverridesAndLoadOrderTabs
                        isLoadOrderPanelOpen={isLoadOrderPanelOpen}
                        selectedLoadOrderMod={selectedLoadOrderMod}
                        t={t}
                        setModPriorityTier={setModPriorityTier}
                        removeLoadOrderRule={removeLoadOrderRule}
                        flipLoadOrderRule={flipLoadOrderRule}
                        activeGameSchema={activeGameSchema}
                        showImages={showImages}
                        scanScope={scanScope}
                        activeTab={activeTab}
                        overrideTab={overrideTab}
                        loadOrderSearch={loadOrderSearch}
                        setLoadOrderSearch={setLoadOrderSearch}
                        loadOrderSubFilter={loadOrderSubFilter}
                        collapsedTiers={collapsedTiers}
                        setCollapsedTiers={setCollapsedTiers}
                        draggedLoadMod={draggedLoadMod}
                        setDraggedLoadMod={setDraggedLoadMod}
                        dragOverTier={dragOverTier}
                        setDragOverTier={setDragOverTier}
                        setDragOverMod={setDragOverMod}
                        dragOverMod={dragOverMod}
                        pointerDragGhost={pointerDragGhost}
                        didPointerDragRef={didPointerDragRef}
                        editingOrderMod={editingOrderMod}
                        setEditingOrderMod={setEditingOrderMod}
                        editingOrderVal={editingOrderVal}
                        setEditingOrderVal={setEditingOrderVal}
                        stripKnownModExt={stripKnownModExt}
                        getAgnosticTierMeta={getAgnosticTierMeta}
                        compiledOrder={compiledOrder}
                        activeBlueprintRules={activeBlueprintRules}
                        ruleLinkedSet={ruleLinkedSet}
                        standaloneElevatedMods={standaloneElevatedMods}
                        isSequentialStrategy={isSequentialStrategy}
                        reorderModInTierSection={reorderModInTierSection}
                        buildPreviewTierList={buildPreviewTierList}
                        beginPointerDragCandidate={beginPointerDragCandidate}
                        resolveVaultMod={resolveVaultMod}
                        openLoadOrderInspector={openLoadOrderInspector}
                        setActiveConflictRes={setActiveConflictRes}
                        runRadar={runRadar}
                        unignoreConflict={unignoreConflict}
                        stripPriorityPrefix={stripPriorityPrefix}
                        undoOverride={undoOverride}
                        overridesViewModel={overridesViewModel}
                        modOverlapMap={modOverlapMap}
                        filteredQueue={filteredQueue}
                        queueVirtual={queueVirtual}
                    />
                </div>
            </div>
            <ScoutSidePanels
                isSidePanelOpen={isSidePanelOpen}
                setIsSidePanelOpen={setIsSidePanelOpen}
                isLoadOrderPanelOpen={isLoadOrderPanelOpen}
                setIsLoadOrderPanelOpen={setIsLoadOrderPanelOpen}
                selectedLoadOrderMod={selectedLoadOrderMod}
                setSelectedLoadOrderMod={setSelectedLoadOrderMod}
                t={t}
                setModPriorityTier={setModPriorityTier}
                addLoadOrderRule={addLoadOrderRule}
                removeLoadOrderRule={removeLoadOrderRule}
                flipLoadOrderRule={flipLoadOrderRule}
                moveModInLoadOrder={moveModInLoadOrder}
                autoSortBlueprintLoadOrder={autoSortBlueprintLoadOrder}
                equipPlaySet={equipPlaySet}
                showUndoPanel={showUndoPanel}
                setShowUndoPanel={setShowUndoPanel}
                playSets={playSets}
                activeGameSchema={activeGameSchema}
                scanScope={scanScope}
                setScanScope={setScanScope}
                ignoredPairs={ignoredPairs}
                fatalConflicts={fatalConflicts}
                tuningConflicts={tuningConflicts}
                cloneConflicts={cloneConflicts}
                ruleModA={ruleModA}
                setRuleModA={setRuleModA}
                ruleModB={ruleModB}
                setRuleModB={setRuleModB}
                setRuleDirection={setRuleDirection}
                ruleDirection={ruleDirection}
                pendingTierFolder={pendingTierFolder}
                setPendingTierFolder={setPendingTierFolder}
                inspectorMode={inspectorMode}
                setInspectorMode={setInspectorMode}
                inspectorModSearch={inspectorModSearch}
                setInspectorModSearch={setInspectorModSearch}
                visiblePickerMods={visiblePickerMods}
                setVisiblePickerMods={setVisiblePickerMods}
                setShowModPickerInInspector={setShowModPickerInInspector}
                showModPickerInInspector={showModPickerInInspector}
                draggedLoadMod={draggedLoadMod}
                setDraggedLoadMod={setDraggedLoadMod}
                dragOverMod={dragOverMod}
                setDragOverMod={setDragOverMod}
                pointerDragGhost={pointerDragGhost}
                didPointerDragRef={didPointerDragRef}
                editingOrderMod={editingOrderMod}
                setEditingOrderMod={setEditingOrderMod}
                editingOrderVal={editingOrderVal}
                setEditingOrderVal={setEditingOrderVal}
                stripKnownModExt={stripKnownModExt}
                getAgnosticTierMeta={getAgnosticTierMeta}
                activeBlueprintObj={activeBlueprintObj}
                compiledOrder={compiledOrder}
                activeBlueprintRules={activeBlueprintRules}
                elevatedModsCount={elevatedModsCount}
                customLoadOrderCount={customLoadOrderCount}
                isSequentialStrategy={isSequentialStrategy}
                reorderModInTierSection={reorderModInTierSection}
                buildPreviewTierList={buildPreviewTierList}
                beginPointerDragCandidate={beginPointerDragCandidate}
                resolveVaultMod={resolveVaultMod}
                openLoadOrderInspector={openLoadOrderInspector}
                updateSchemaLoadOrderEngine={updateSchemaLoadOrderEngine}
                activeConflictRes={activeConflictRes}
                setActiveConflictRes={setActiveConflictRes}
                hydrateCachedScope={hydrateCachedScope}
                runRadar={runRadar}
                vaultSingleScript={vaultSingleScript}
                applyOverride={applyOverride}
                stripPriorityPrefix={stripPriorityPrefix}
                undoOverride={undoOverride}
                clearAllOverrides={clearAllOverrides}
                getConflictLoadOrderInfo={getConflictLoadOrderInfo}
                modOverlapMap={modOverlapMap}
            />
        </>
    );
};







