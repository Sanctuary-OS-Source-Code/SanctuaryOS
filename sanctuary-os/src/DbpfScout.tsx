import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { ViewHeader, CustomDropdown, HoverTooltip, EmptyState, SidePanel, ActionButton, HoverTabDrawer, VerticalTabButton, DashboardStatTile, ActionPill, PanelHeaderGroup, PanelHeaderButton, StatBox, openModDossier } from "./shared";
import { getExtensionRegex, formatDisplayName, getFileLabel } from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";
import { UniversalGroup, SidePanelHeroCard } from "./components/layouts/ElevatedHubLayout";
import { useLexicon } from "./LexiconContext";
import { usePlaySetLogic, compileLoadOrder, LoadOrderRule } from "./hooks/usePlaySetLogic";
import { useStore } from "./store";
import ConflictCard, { RadarPairPreviewBanner } from "./ConflictCard";
import ConflictResolutionSidebar from "./side-panels/ConflictResolutionSidebar";
import UndoWinnersPanel from "./side-panels/UndoWinnersPanel";
import { CommandScreenLayout, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, CommandScreenQuickLink, CommandScreenSectionHeading, StatTileCarousel } from "./hub-components/SharedCommandScreenLayout";

const VAULT_CHIP_CLASS =
    "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

const isCloneConflict = (modA: string, modB: string) => {
    if (!modA || !modB) return false;
    const clean = (s: string) => {
        const file = s.split(/[\\/]/).pop() || s;
        const extMatch = file.match(getExtensionRegex(useStore.getState().activeGameSchema));
        const ext = extMatch ? extMatch[1].toLowerCase() : '';
        const cleaned = file.toLowerCase().replace(/(_hq|_nonhq|_v\d+|_alt|_remake|remake|\\.[a-zA-Z0-9]+)/g, '').replace(/[^a-z0-9]/g, '');
        return cleaned + "_" + ext;
    };
    return clean(modA) === clean(modB);
};

export const DbpfScout = () => {
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

    const { playSets, setPlaySets, activePlaySetIndex, activeGameSchema, setActiveGameSchema, modList, setStatus, showImages } = useStore();
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

    const [visibleFatal, setVisibleFatal] = useState(50);
    const [visibleTuning, setVisibleTuning] = useState(50);
    const [visibleClone, setVisibleClone] = useState(50);
    const [visibleSoft, setVisibleSoft] = useState(50);
    const [visibleLoadOrder, setVisibleLoadOrder] = useState(60);
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
        setVisibleLoadOrder(60);
    }, [loadOrderSearch, loadOrderSubFilter, scanScope]);

    useEffect(() => {
        setVisiblePickerMods(24);
    }, [inspectorModSearch, isLoadOrderPanelOpen]);

    const stripKnownModExt = (rawName: string) => {
        return String(rawName || "")
            .replace(/\.(package|ts4script|pak|archive|esp|esm|esl|rpf|asi|zip)$/i, "")
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
            ["sanctuary", "sanctuary2", "sanctuary3", ...schemaTiers.map((pt: any) => (pt.folder || "").toLowerCase())].filter(Boolean)
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
        setVisibleFatal(50);
        setVisibleTuning(50);
        setVisibleClone(50);
        setVisibleSoft(50);
        try {
            const config: any = await invoke("get_saved_coordinates");
            let targetPath = `${config.vault_path}/Mods`;
            let targetFiles: string[] | null = null;

            const scopeToUse = resolvedTarget || scanScope || (playSets.length > 0 ? playSets[0].name : "");
            const set = playSets.find((s: any) => s.name === scopeToUse);
            if (set) {
                targetFiles = set.mods.map((m: any) => typeof m === 'string' ? m : (m.name || m.path || '')).filter(Boolean);
            }

            const report = await invoke<any>("run_conflict_radar", { modsPath: targetPath, targetFiles });

            const rawFatal: any[] = [];
            const rawTuning: any[] = [];
            const rawClone: any[] = [];
            const rawSoft: any[] = [];

            report.conflicts.forEach((c: any) => {
                const parts = c.mod_pair.split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
                const modA = parts[0];
                const modB = parts.length > 1 ? parts[1] : "Unknown Overlap";
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
    const targetHq = () => {
        let newTargets: string[] = [...selectedForVault];
        cloneConflicts.forEach((c: any) => {
            const aIsHq = /_hq/i.test(c.modA);
            const bIsHq = /_hq/i.test(c.modB);
            let target = null;
            let nonTarget = null;
            if (aIsHq && !bIsHq) { target = c.modA; nonTarget = c.modB; }
            else if (bIsHq && !aIsHq) { target = c.modB; nonTarget = c.modA; }

            if (target) {
                newTargets = newTargets.filter(m => m !== nonTarget);
                if (!newTargets.includes(target)) newTargets.push(target);
            }
        });
        setSelectedForVault(newTargets);
        setConfirmMassVault(false);
    };

    const targetNonHq = () => {
        let newTargets: string[] = [...selectedForVault];
        cloneConflicts.forEach((c: any) => {
            const aIsHq = /_hq/i.test(c.modA);
            const bIsHq = /_hq/i.test(c.modB);
            const aIsNonHq = /_nonhq/i.test(c.modA);
            const bIsNonHq = /_nonhq/i.test(c.modB);

            let target = null;
            let nonTarget = null;
            if (aIsNonHq && !bIsNonHq) { target = c.modA; nonTarget = c.modB; }
            else if (bIsNonHq && !aIsNonHq) { target = c.modB; nonTarget = c.modA; }
            else if (!aIsHq && bIsHq) { target = c.modA; nonTarget = c.modB; }
            else if (!bIsHq && aIsHq) { target = c.modB; nonTarget = c.modA; }

            if (target) {
                newTargets = newTargets.filter(m => m !== nonTarget);
                if (!newTargets.includes(target)) newTargets.push(target);
            }
        });
        setSelectedForVault(newTargets);
        setConfirmMassVault(false);
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
            if (activeConflictRes) {
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
                setStats((prev: any) => ({ ...prev, totalClashes: prev.totalClashes - 1 }));
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
        const folders = ["sanctuary", "sanctuary2", "sanctuary3", ...tiers.map((pt: any) => (pt.folder || "").toLowerCase())].filter(Boolean);
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

    const filteredFatal = fatalConflicts.filter(c => searchFilter(c, conflictSearch));
    const filteredTuning = tuningConflicts.filter(c => searchFilter(c, conflictSearch));
    const filteredClone = cloneConflicts.filter(c => searchFilter(c, conflictSearch));
    const filteredSoft = softConflicts.filter(c => searchFilter(c, conflictSearch));

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

    return (
        <>
            <div className="flex flex-col gap-0 pb-32 w-full relative z-10">
                <ViewHeader
                    title={t("radar_title", "Conflict Scanner")}
                    subtitle={t("radar_subtitle", "Load-order scans, duplicates, and override conflicts")}
                    icon="crisis_alert"
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
                        <VerticalTabButton id="COMMAND" icon="dashboard" label={t("overview", "Overview")} activeTab={activeTab} setTab={setActiveTab} />
                        <VerticalTabButton
                            id="CONFLICTS"
                            icon="warning"
                            label={t("conflicts", "Conflicts")}
                            activeTab={activeTab}
                            setTab={setActiveTab}
                            badge={(fatalConflicts.length + tuningConflicts.length) > 0 ? (fatalConflicts.length + tuningConflicts.length) : null}
                            activeColorClass={fatalConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] shadow-md' : tuningConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] shadow-md' : undefined}
                            inactiveColorClass={fatalConflicts.length > 0 ? 'text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-80 hover:opacity-100' : tuningConflicts.length > 0 ? 'text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-80 hover:opacity-100' : undefined}
                            badgeColorClass={fatalConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]' : tuningConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)]' : undefined}
                        />
                        <VerticalTabButton id="OVERRIDES" icon="rule" label={t("overrides", "Overrides")} activeTab={activeTab} setTab={setActiveTab} badge={activeScopeOverridesCount > 0 ? activeScopeOverridesCount : null} />
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
                        <DashboardStatTile variant="tab" icon="dashboard" label={t("overview", "Overview")} number={scanScope || ""} onClick={() => setActiveTab("COMMAND")} isActive={activeTab === "COMMAND"} />
                        <DashboardStatTile variant="tab"
                            icon="warning"
                            label={t("conflicts", "Conflicts")}
                            number={(fatalConflicts.length + tuningConflicts.length) > 0 ? (fatalConflicts.length + tuningConflicts.length) : 0}
                            colorClass={fatalConflicts.length > 0 ? 'text-[var(--danger)]' : tuningConflicts.length > 0 ? 'text-[var(--warning)]' : undefined}
                            onClick={() => setActiveTab("CONFLICTS")}
                            isActive={activeTab === "CONFLICTS"}
                        />
                        <DashboardStatTile variant="tab" icon="rule" label={t("overrides", "Overrides")} number={activeScopeOverridesCount} onClick={() => setActiveTab("OVERRIDES")} isActive={activeTab === "OVERRIDES"} />
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

                    {activeTab === "COMMAND" && (
                        <CommandScreenLayout>

                            <CommandScreenBody>
                                <CommandScreenMain>

                                    <div className="flex flex-col gap-4 w-full">
                                        <CommandScreenSectionHeading
                                            title={t("select_blueprint", "Select {Blueprint}")}
                                            icon="map"
                                            rightContent={
                                                <div className="w-full">
                                                    <ActionPill
                                                        searchQuery={blueprintSearch}
                                                        setSearchQuery={setBlueprintSearch}
                                                        searchPlaceholder={t("search_blueprints", "Search {Blueprints}...") as string}
                                                    />
                                                </div>
                                            }
                                        />
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                            {playSets.filter((bp: any) => !blueprintSearch || bp.name.toLowerCase().includes(blueprintSearch.toLowerCase())).map((blueprint: any) => {
                                                const isTarget = scanScope === blueprint.name;
                                                const modCount = blueprint.mods ? blueprint.mods.length : 0;
                                                let bpStats: { fatal: number; tuning: number; clone: number } | null = null;
                                                try {
                                                    const rawStats = localStorage.getItem(`radar_stats_${blueprint.name}`);
                                                    if (rawStats) bpStats = JSON.parse(rawStats);
                                                } catch {}
                                                const bpConflictCount = isTarget && hasScanned
                                                    ? fatalConflicts.length + tuningConflicts.length + cloneConflicts.length
                                                    : bpStats
                                                    ? (bpStats.fatal || 0) + (bpStats.tuning || 0) + (bpStats.clone || 0)
                                                    : null;
                                                const bpFatalCount = isTarget && hasScanned ? fatalConflicts.length : bpStats?.fatal || 0;

                                                return (
                                                    <UniversalCard
                                                        key={blueprint.name}
                                                        layout="vertical"
                                                        isActive={isTarget}
                                                        onClick={() => {
                                                            setScanScope(blueprint.name);
                                                            if (hydrateCachedScope(blueprint.name, ignoredPairs)) {
                                                                setActiveTab("CONFLICTS");
                                                            } else {
                                                                runRadar(blueprint.name);
                                                            }
                                                        }}
                                                        icon={isTarget ? t("icon_verified_user", "verified_user") : t("icon_map", "map")}
                                                        title={blueprint.name}
                                                        subtitle={isTarget ? t("btn_deployed", "Deployed") : t("term_blueprint", "{Blueprint}")}
                                                        imageOverlay={
                                                            <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-20 pointer-events-none">
                                                                <span className={VAULT_CHIP_CLASS}>
                                                                    <span className={`material-symbols-outlined !text-[12px] ${isTarget ? "text-[var(--success)]" : "text-[var(--subtext)]"}`}>
                                                                        {isTarget ? t("icon_verified_user", "verified_user") : t("icon_schedule", "schedule")}
                                                                    </span>
                                                                    <span>
                                                                        {isTarget ? t("status_active", "Active") : t("status_standby", "Standby")}
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        }
                                                        badges={
                                                            <>
                                                                <span className={VAULT_CHIP_CLASS}>
                                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                        {t("icon_extension", "extension")}
                                                                    </span>
                                                                    <span>
                                                                        {modCount} {t("artifacts_linked", "{Mods} Linked")}
                                                                    </span>
                                                                </span>
                                                                {bpConflictCount !== null && (
                                                                    <span className={VAULT_CHIP_CLASS}>
                                                                        <span
                                                                            className={`material-symbols-outlined !text-[12px] ${
                                                                                bpFatalCount > 0
                                                                                    ? "text-[var(--danger)]"
                                                                                    : bpConflictCount > 0
                                                                                    ? "text-[var(--warning)]"
                                                                                    : "text-[var(--success)]"
                                                                            }`}
                                                                        >
                                                                            {bpFatalCount > 0
                                                                                ? t("icon_error", "error")
                                                                                : bpConflictCount > 0
                                                                                ? t("icon_warning", "warning")
                                                                                : t("icon_verified", "verified")}
                                                                        </span>
                                                                        <span>
                                                                            {bpConflictCount > 0
                                                                                ? `${bpConflictCount} ${t("conflicts", "Conflicts")}`
                                                                                : t("tier_clean", "Clean")}
                                                                        </span>
                                                                    </span>
                                                                )}
                                                            </>
                                                        }
                                                        footer={
                                                            <div className="flex items-center justify-between w-full">
                                                                <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                                                                    {isTarget ? t("radar_target_selected", "Active Scan Scope") : t("analyze_blueprint_desc", "Analyze the selected {blueprint}")}
                                                                </span>
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                                                                    {bpConflictCount !== null ? t("conflicts", "Conflicts") : t("btn_sweep", "Scan {Blueprint}")}
                                                                    <span className="material-symbols-outlined !text-[14px]">
                                                                        {t("icon_arrow_forward", "arrow_forward")}
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        }
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                </CommandScreenMain>

                                <CommandScreenSidebar title={t("quick_actions", "Quick Actions")} icon="bolt">
                                    <CommandScreenQuickLink
                                        icon="warning"
                                        title={t("total_conflicts", "Total Conflicts") || "Total Conflicts"}
                                        subtitle={`${fatalConflicts.length + tuningConflicts.length + cloneConflicts.length + softConflicts.length} ${t("conflicts", "Conflicts")}`}
                                        onClick={() => setActiveTab("CONFLICTS")}
                                        textColorClass={(fatalConflicts.length + tuningConflicts.length) > 0 ? "text-[var(--warning)]" : "text-[var(--text)]"}
                                        hoverTextColorClass="group-hover:text-[var(--warning)]"
                                        iconShadowClass="drop-shadow-md"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon="rule"
                                        title={t("total_overrides", "Total Overrides") || "Total Overrides"}
                                        subtitle={`${totalOverridesCount} ${t("overrides", "Overrides")}`}
                                        onClick={() => setActiveTab("OVERRIDES")}
                                        textColorClass="text-[var(--accent)]"
                                        hoverTextColorClass="group-hover:text-[var(--accent)]"
                                        iconShadowClass="drop-shadow-md text-[var(--accent)]"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon={t("icon_low_priority", "low_priority")}
                                        title={t("schema_load_engine", "Load Order Engine")}
                                        subtitle={`${
                                            compiledOrder.strategy === "manifest_list"
                                                ? t("lo_strategy_manifest", "Manifest List (loadorder.txt)")
                                                : compiledOrder.strategy === "numeric_prefix"
                                                ? t("lo_strategy_prefix", "Numeric Prefix (001_)")
                                                : compiledOrder.strategy === "timestamp"
                                                ? t("lo_strategy_timestamp", "Timestamp Order")
                                                : t("lo_strategy_folder", "Folder Priority (Resource.cfg)")
                                        }`}
                                        onClick={() => setActiveTab("LOAD_ORDER")}
                                        textColorClass="text-[var(--accent)]"
                                        hoverTextColorClass="group-hover:text-[var(--accent)]"
                                        iconShadowClass="drop-shadow-md text-[var(--accent)]"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon="visibility_off"
                                        title={t("total_ignores", "Total Ignored") || "Total Ignored"}
                                        subtitle={`${ignoredPairs.length} ${t("ignored", "Ignored")}`}
                                        onClick={() => { setActiveTab("OVERRIDES"); setOverrideTab("IGNORED"); }}
                                        textColorClass="text-[var(--subtext)]"
                                        hoverTextColorClass="group-hover:text-[var(--text)]"
                                        iconShadowClass="drop-shadow-md text-[var(--subtext)]"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon={loading ? "sync" : "track_changes"}
                                        title={t("btn_sweep", "Scan {Blueprint}")}
                                        subtitle={t("analyze_blueprint_desc", "Analyze the selected {blueprint}")}
                                        onClick={runRadar}
                                        dotColorClass="bg-[var(--accent)] shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]"
                                        textColorClass="text-[var(--accent)]"
                                        hoverTextColorClass="group-hover:text-[var(--accent)]"
                                        iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon="undo"
                                        title={t("revert", "revert")}
                                        subtitle={t("undo_overrides_desc", "Undo overrides")}
                                        onClick={() => setShowUndoPanel(true)}
                                        dotColorClass="bg-[color-mix(in_srgb,var(--text)_50%,transparent)] shadow-md"
                                        textColorClass="text-[var(--text)]"
                                        hoverTextColorClass="group-hover:text-white"
                                        iconShadowClass="drop-shadow-md"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                                    />
                                </CommandScreenSidebar>
                            </CommandScreenBody>
                        </CommandScreenLayout>
                    )}

                    {activeTab === "CONFLICTS" && (
                        <CommandScreenLayout>
                            <CommandScreenBody>
                                <CommandScreenMain>
                                    <div className="flex flex-col gap-6 w-full">

                                        {!hasScanned && !loading && !error && (
                                            <EmptyState
                                                icon={t("icon_track_changes", "track_changes")}
                                                title={t("landing_title", "System Standby")}
                                                subtitle={t("landing_desc", "Deploy the Conflict Scanner to scan your active load order for fatal structural clashes, tuning data overlaps, and duplicate asset clones. Neutralize threats before they destabilize your environment.")}
                                                action={
                                                    <ActionButton
                                                        variant="accent"
                                                        icon={t("icon_track_changes", "track_changes")}
                                                        label={t("btn_sweep", "Scan {Blueprint}")}
                                                        onClick={() => runRadar()}
                                                    />
                                                }
                                            />
                                        )}

                                        {loading && (
                                            <EmptyState
                                                icon={t("icon_track_changes", "track_changes")}
                                                title={t("scanning_title", "Scanning {Blueprint}...")}
                                                subtitle={t("scanning_desc", "Please stand by. Analyzing target {blueprint} for duplicate assets and logical conflicts.")}
                                            />
                                        )}

                                        {hasScanned && stats.totalClashes === 0 && compiledOrder.cycles.length === 0 && !loading && (
                                            <EmptyState
                                                icon={t("icon_verified", "verified")}
                                                title={t("clear_title", "{Blueprint} Clear")}
                                                subtitle={t("clear_desc", "No conflicts were detected in your deployed {blueprint}.")}
                                            />
                                        )}

                                        {/* Severity 5: Circular Load Rule Loops */}
                                        {compiledOrder.cycles.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 5) && (
                                            <section className="space-y-6">
                                                <CommandScreenSectionHeading
                                                    title={t("tier5_title", "Severity 5 • Circular Load Loops")}
                                                    subtitle={t("lo_cycle_desc", "Two or more {mods} are locked in an infinite load-order loop. Break one rule below to restore topological sorting.")}
                                                    icon={t("icon_sync_problem", "sync_problem")}
                                                    iconColorClass="text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                                                />
                                                <div className="flex flex-col gap-3">
                                                    {compiledOrder.cycles.map((cyc, cIdx) => (
                                                        <div
                                                            key={`cycle_conf_${cIdx}`}
                                                            className="p-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] flex items-center justify-between gap-4 flex-wrap"
                                                        >
                                                            <div className="flex items-center gap-2 flex-wrap text-xs font-mono font-bold text-[var(--text)]">
                                                                {cyc.chain.map((node, nIdx) => (
                                                                    <span key={`${node}_${nIdx}`} className="flex items-center gap-2">
                                                                        <span className="px-2.5 py-1 rounded-lg bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]">
                                                                            {stripKnownModExt(formatDisplayName(node, undefined, activeGameSchema))}
                                                                        </span>
                                                                        {nIdx < cyc.chain.length - 1 && (
                                                                            <span className="text-[var(--subtext)] opacity-60">➔</span>
                                                                        )}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (cyc.ruleIds[0]) {
                                                                        removeLoadOrderRule(scanScope, cyc.ruleIds[0]);
                                                                    }
                                                                }}
                                                                className="px-4 py-2 rounded-xl bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] text-[10px] font-black uppercase tracking-widest transition-all"
                                                            >
                                                                {t("lo_break_cycle", "Break Loop")}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {hasScanned && filteredFatal.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 4) && (
                                            <section className="space-y-6">
                                                <CommandScreenSectionHeading
                                                    title={t("tier4_title", "Severity 4 Collisions")}
                                                    subtitle={t("tier4_desc", "Core Python or Binary overlaps detected. Overrides impossible.")}
                                                    icon={t("icon_warning_amber", "warning_amber")}
                                                    iconColorClass="text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                                                />

                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                    {filteredFatal.slice(0, visibleFatal).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={4} loadOrderInfo={getConflictLoadOrderInfo(c)} onClick={() => setActiveConflictRes(c)} />
                                                    ))}
                                                </div>
                                                {fatalConflicts.length > visibleFatal && (
                                                    <div className="flex justify-center mt-8">
                                                        <button onClick={() => setVisibleFatal(v => v + 100)} className="px-6 py-3 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-xl">
                                                            {t("load_more", "Load More")} ({fatalConflicts.length - visibleFatal})
                                                        </button>
                                                    </div>
                                                )}
                                            </section>
                                        )}

                                        {hasScanned && filteredTuning.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 3) && (
                                            <section className="space-y-6 mt-12">
                                                <CommandScreenSectionHeading
                                                    title={t("tier3_title", "Severity 3 Collisions")}
                                                    subtitle={t("tier3_desc", "XML / SimData overlaps detected. Neutralize via Override.")}
                                                    icon={t("icon_tune", "tune")}
                                                    iconColorClass="text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                                                />

                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                    {filteredTuning.slice(0, visibleTuning).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={3} loadOrderInfo={getConflictLoadOrderInfo(c)} onClick={() => setActiveConflictRes(c)} />
                                                    ))}
                                                </div>
                                                {tuningConflicts.length > visibleTuning && (
                                                    <div className="flex justify-center mt-8">
                                                        <button onClick={() => setVisibleTuning(v => v + 100)} className="px-6 py-3 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-xl">
                                                            {t("load_more", "Load More")} ({tuningConflicts.length - visibleTuning})
                                                        </button>
                                                    </div>
                                                )}
                                            </section>
                                        )}

                                        {hasScanned && filteredClone.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 2) && (
                                            <section className="space-y-6 mt-12">
                                                <CommandScreenSectionHeading
                                                    title={t("duplicate_clones", "Severity 2 Collision")}
                                                    subtitle={t("identical_assets", "Identical asset signatures. Purge redundant files.")}
                                                    icon={t("icon_all_inclusive", "all_inclusive")}
                                                    iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                                    actions={
                                                        <div className="flex items-center gap-3">
                                                            {isBulkMode && (
                                                                <>
                                                                    <button onClick={targetHq} className="h-[42px] px-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black capitalize tracking-widest transition-all">
                                                                        {t("btn_select_hq", "Select Hq")}
                                                                    </button>
                                                                    <button onClick={targetNonHq} className="h-[42px] px-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black capitalize tracking-widest transition-all">
                                                                        {t("btn_select_nonhq", "Select Non-hq")}
                                                                    </button>
                                                                </>
                                                            )}
                                                            <button
                                                                onClick={() => {
                                                                    if (!isBulkMode) setIsBulkMode(true);
                                                                    else if (selectedForVault.length > 0) setConfirmMassVault(true);
                                                                    else setIsBulkMode(false);
                                                                }}
                                                                className={`h-[42px] px-6 rounded-2xl text-[10px] font-black capitalize tracking-widest transition-all flex items-center justify-center border ${isBulkMode
                                                                    ? (selectedForVault.length > 0 ? "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] shadow-lg" : "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] shadow-lg")
                                                                    : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                                                                    }`}
                                                            >
                                                                {isBulkMode ? (selectedForVault.length > 0 ? `${t("purge", "Purge")} (${selectedForVault.length})` : t("btn_cancel_selection", "Cancel Selection")) : (t("btn_select_assets", "Select Assets"))}
                                                            </button>
                                                        </div>
                                                    }
                                                />

                                                {confirmMassVault && (
                                                    <div className="animate-in slide-in-from-top-2 p-6 glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl flex flex-col md:flex-row gap-6 items-center justify-start shadow-xl mb-6">
                                                        <p className="text-sm font-black theme-text-danger capitalize tracking-widest">
                                                            {t("secure_quarantine", "SECURE {count} TARGETS IN QUARANTINE") || `Yeet ${selectedForVault.length} duplicates to the Vault?`}
                                                        </p>
                                                        <div className="flex gap-4">
                                                            <button onClick={executeMassVault} className="px-8 py-3 bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] transition-all text-[10px] tracking-widest font-black rounded-xl">
                                                                {t("confirm_purge", "Confirm Purge")}
                                                            </button>
                                                            <button onClick={() => setConfirmMassVault(false)} className="px-8 py-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all text-[10px] tracking-widest font-black rounded-xl">
                                                                {t("cancel", "Cancel")}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                    {filteredClone.slice(0, visibleClone).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={2} loadOrderInfo={getConflictLoadOrderInfo(c)} isSelectedA={selectedForVault.includes(c.modA)} isSelectedB={selectedForVault.includes(c.modB)} onKeepA={() => toggleTarget(c.modA, c.modB)} onKeepB={() => toggleTarget(c.modB, c.modA)} onClick={() => setActiveConflictRes(c)} />
                                                    ))}
                                                </div>
                                                {cloneConflicts.length > visibleClone && (
                                                    <div className="flex justify-center mt-8">
                                                        <button onClick={() => setVisibleClone(v => v + 100)} className="px-6 py-3 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-xl">
                                                            {t("load_more", "Load More")} ({cloneConflicts.length - visibleClone})
                                                        </button>
                                                    </div>
                                                )}
                                            </section>
                                        )}

                                        {hasScanned && filteredSoft.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 1) && (
                                            <details className="group space-y-6 glass-surface p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer mt-12 mb-32 transition-all hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                                <summary className="flex flex-col gap-1 list-none outline-none">
                                                    <div className="flex justify-start items-center w-full">
                                                        <h3 className="text-sm font-black text-[var(--subtext)] opacity-80 capitalize tracking-widest flex items-center gap-3 group-open:text-[var(--text)] transition-colors">
                                                            <span className="material-symbols-outlined !text-xl">{t("icon_info", "info")}</span> {t("tier1_title", "Severity 1 Collisions").replace("{count}", String(softConflicts.length))}
                                                        </h3>
                                                        <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center text-[var(--subtext)] opacity-60 group-open:rotate-180 transition-transform shrink-0">
                                                            <span className="material-symbols-outlined !text-[20px]">{t("icon_expand_more", "expand_more")}</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-[9px] font-bold text-gray-600 capitalize tracking-widest ml-9">{t("safe_textures", "Usually safe textures or low-impact overrides")}</p>
                                                </summary>
                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] mt-4">
                                                    {filteredSoft.slice(0, visibleSoft).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={1} loadOrderInfo={getConflictLoadOrderInfo(c)} onClick={() => setActiveConflictRes(c)} onIgnore={() => ignoreConflict(c.mod_pair)} />
                                                    ))}
                                                </div>
                                                {softConflicts.length > visibleSoft && (
                                                    <div className="flex justify-center mt-6">
                                                        <button onClick={() => setVisibleSoft(v => v + 100)} className="px-6 py-3 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-xl">
                                                            {t("load_more", "Load More")} ({softConflicts.length - visibleSoft})
                                                        </button>
                                                    </div>
                                                )}
                                            </details>
                                        )}
                                    </div>
                                </CommandScreenMain>

                            </CommandScreenBody>
                        </CommandScreenLayout>
                    )}

                    {activeTab === "OVERRIDES" && (() => {
                        const activeSetMods = playSets.find((s: any) => s.name === scanScope)?.mods || [];
                        const manualOverrides = activeSetMods
                            .filter((m: any) => hasPriorityPrefix(typeof m === "string" ? m : (m.name || m.path || "")))
                            .map((m: any) => typeof m === "string" ? m : (m.name || m.path || ""));

                        const resolvedOverrides = ignoredPairs.map((pair: string) => {
                            const parts = pair.split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
                            const left = parts[0] || pair;
                            const right = parts[1];
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

                        // Deduplicate resolvedOverrides that already have an explicit rule in ruleOverrides
                        const dedupedResolvedOverrides = resolvedOverrides.filter((res) => {
                            const wClean = (stripPriorityPrefix(res.winnerPath).split(/[\\/]/).pop() || res.winnerPath).toLowerCase();
                            const lClean = (stripPriorityPrefix(res.loserPath).split(/[\\/]/).pop() || res.loserPath).toLowerCase();
                            return !ruleOverrides.some((ro) => {
                                const rw = (stripPriorityPrefix(ro.winnerPath).split(/[\\/]/).pop() || ro.winnerPath).toLowerCase();
                                const rl = (stripPriorityPrefix(ro.loserPath).split(/[\\/]/).pop() || ro.loserPath).toLowerCase();
                                return (rw === wClean && rl === lClean) || (rw === lClean && rl === wClean);
                            });
                        });

                        const allActiveOverrides = [...ruleOverrides, ...dedupedResolvedOverrides].filter(
                            (o) =>
                                !overrideSearch ||
                                o.winnerPath.toLowerCase().includes(overrideSearch.toLowerCase()) ||
                                (o.loserPath && o.loserPath.toLowerCase().includes(overrideSearch.toLowerCase()))
                        );
                        const trueIgnoredPairs = ignoredPairs
                            .filter((pair: string) => !resolvedOverrides.some((res) => res.pair === pair))
                            .filter((pair: string) => !overrideSearch || pair.toLowerCase().includes(overrideSearch.toLowerCase()));

                        return (
                            <CommandScreenLayout>
                                <CommandScreenBody>
                                    <CommandScreenMain>
                                        <div className="flex flex-col gap-10 w-full">
                                            {(overrideTab === "ALL" || overrideTab === "ACTIVE") && (
                                                <div className="flex flex-col gap-5 w-full">
                                                    <CommandScreenSectionHeading
                                                        title={t("load_order_rules", "Load Order Rules")}
                                                        subtitle={t(
                                                            "lo_rule_builder_desc",
                                                            "Lock explicit load order dependencies between two {mods}."
                                                        )}
                                                        icon={t("icon_rule", "rule")}
                                                    />

                                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                        {/* LEADING CREATE NEW RULE CARD (Settings > Perks Alert Card Style) */}
                                                        <div className="glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] h-full">
                                                            <div
                                                                className="pointer-events-none absolute inset-0 rounded-[inherit]"
                                                                style={{
                                                                    background:
                                                                        "radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 62%)",
                                                                }}
                                                            />
                                                            <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--accent)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
                                                                {t("icon_rule", "rule")}
                                                            </span>

                                                            <div className="flex items-center justify-between gap-3 relative z-10">
                                                                <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                                                    <span className="material-symbols-outlined !text-[22px]">
                                                                        {t("icon_rule", "rule")}
                                                                    </span>
                                                                </div>
                                                                <span className={VAULT_CHIP_CLASS}>
                                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                        {t("icon_verified", "verified")}
                                                                    </span>
                                                                    <span>
                                                                        {allActiveOverrides.length} • {t("load_order_rules", "Load Order Rules")}
                                                                    </span>
                                                                </span>
                                                            </div>

                                                            <div className="flex flex-col gap-1 relative z-10">
                                                                <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--accent)] leading-snug">
                                                                    {t("load_order_rules", "Load Order Rules")}
                                                                </span>
                                                                <h3 className="text-[15px] md:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                                                                    {t("lo_add_rule", "Add Load Rule")}
                                                                </h3>
                                                            </div>

                                                            <p className="text-xs font-medium text-[var(--subtext)] opacity-85 leading-relaxed m-0 relative z-10">
                                                                {t(
                                                                    "lo_no_rules_desc",
                                                                    "Add a load rule or pick a conflict winner to automatically lock load order dependencies."
                                                                )}
                                                            </p>

                                                            <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10 w-full">
                                                                <ActionButton
                                                                    variant="glass"
                                                                    icon={t("icon_add", "add")}
                                                                    label={t("lo_add_rule", "Add Load Rule")}
                                                                    onClick={() => openLoadOrderInspector("", undefined, "RULE")}
                                                                    className="w-full"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* ACTIVE LOAD ORDER RULES & OVERRIDES (Mason Workshop > Artifacts Card Size & Style) */}
                                                        {allActiveOverrides.map((override: any, idx: number) => {
                                                            const cleanWinnerPath = stripPriorityPrefix(override.winnerPath);
                                                            const displayWinnerName = stripKnownModExt(
                                                                formatDisplayName(cleanWinnerPath, activeGameSchema)
                                                            );
                                                            const cleanLoserPath = stripPriorityPrefix(override.loserPath);
                                                            const displayLoserName = override.isManual
                                                                ? cleanLoserPath
                                                                : stripKnownModExt(formatDisplayName(cleanLoserPath, activeGameSchema));
                                                            const vaultWinner = resolveVaultMod(cleanWinnerPath);
                                                            const vaultLoser = resolveVaultMod(cleanLoserPath);

                                                            return (
                                                                <UniversalCard
                                                                    key={override.id || `active_${idx}`}
                                                                    layout="vertical"
                                                                    title={
                                                                        <span className="text-base md:text-[17px] font-black text-[var(--text)] leading-snug line-clamp-2 break-words">
                                                                            {displayWinnerName}
                                                                        </span>
                                                                    }
                                                                    subtitle={`${t("lo_loads_after_wins", "Loads After (Wins)")} • ${displayLoserName}`}
                                                                    image={
                                                                        showImages && (vaultWinner?.image_url || vaultWinner?.image)
                                                                            ? vaultWinner.image_url || vaultWinner.image
                                                                            : undefined
                                                                    }
                                                                    icon={t("icon_rule", "rule")}
                                                                    customIcon={
                                                                        <RadarPairPreviewBanner
                                                                            leftIcon={t("icon_rule", "rule")}
                                                                            leftPrimary={
                                                                                override.isRule
                                                                                    ? t("lo_rule_badge", "Rule")
                                                                                    : t("active", "Active")
                                                                            }
                                                                            leftSecondary={`#${idx + 1}`}
                                                                            accentColorVar="var(--accent)"
                                                                            topIcon={t("icon_workspace_premium", "workspace_premium")}
                                                                            topLabel={displayWinnerName}
                                                                            topRightLabel={t("lo_badge_wins_override", "Wins Override")}
                                                                            topRightIcon={t("icon_verified", "verified")}
                                                                            bottomIcon={t("icon_schedule", "schedule")}
                                                                            bottomLabel={displayLoserName}
                                                                        />
                                                                    }
                                                                    imageOverlay={
                                                                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[78%] z-30 pointer-events-none">
                                                                            <div className={VAULT_CHIP_CLASS}>
                                                                                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                                                                    {t("icon_verified", "verified")}
                                                                                </span>
                                                                                <span>
                                                                                    {override.isRule
                                                                                        ? t("lo_rule_badge", "Rule")
                                                                                        : t("active", "Active")}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    }
                                                                    onClick={() => openLoadOrderInspector(cleanWinnerPath, undefined, "RULE")}
                                                                    footer={
                                                                        <div
                                                                            className="flex items-center justify-between w-full gap-2 text-xs text-[var(--subtext)] font-bold"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => openModDossier(vaultWinner || cleanWinnerPath)}
                                                                                    className="group/dosbtn relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                                >
                                                                                    <span className="material-symbols-outlined !text-[14px]">
                                                                                        {t("icon_open_in_new", "open_in_new")}
                                                                                    </span>
                                                                                    <HoverTooltip
                                                                                        title={t("btn_inspect", "Inspect {Mod}")}
                                                                                        className="z-[200]"
                                                                                    />
                                                                                </button>
                                                                                {override.isRule && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => flipLoadOrderRule(scanScope, override.id)}
                                                                                        className="group/flipbtn relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                                    >
                                                                                        <span className="material-symbols-outlined !text-[14px]">
                                                                                            {t("icon_swap_vert", "swap_vert")}
                                                                                        </span>
                                                                                        <HoverTooltip
                                                                                            title={t("lo_flip_rule", "Invert Rule Direction")}
                                                                                            className="z-[200]"
                                                                                        />
                                                                                    </button>
                                                                                )}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        if (override.isRule) {
                                                                                            removeLoadOrderRule(scanScope, override.id);
                                                                                        } else if (override.isManual) {
                                                                                            undoOverride(cleanWinnerPath).then(() => runRadar());
                                                                                        } else {
                                                                                            unignoreConflict(override.pair).then(() =>
                                                                                                undoOverride(cleanWinnerPath).then(() => runRadar())
                                                                                            );
                                                                                        }
                                                                                    }}
                                                                                    className="group/rmbtn relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                                >
                                                                                    <span className="material-symbols-outlined !text-[14px]">
                                                                                        {override.isRule
                                                                                            ? t("icon_delete", "delete")
                                                                                            : t("icon_undo", "undo")}
                                                                                    </span>
                                                                                    <HoverTooltip
                                                                                        title={
                                                                                            override.isRule
                                                                                                ? t("remove", "Remove")
                                                                                                : t("revert_override", "Revert Override")
                                                                                        }
                                                                                        variant="danger"
                                                                                        className="z-[200]"
                                                                                    />
                                                                                </button>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    openLoadOrderInspector(cleanWinnerPath, undefined, "RULE")
                                                                                }
                                                                                className="text-[10px] font-black text-[var(--text)] opacity-85 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                                                                            >
                                                                                <span>{t("edit", "Edit")}</span>
                                                                                <span className="text-base leading-none">&rarr;</span>
                                                                            </button>
                                                                        </div>
                                                                    }
                                                                >
                                                                    {/* In-Card Overridden Rival Callout (2-line layout so name is never cut off) */}
                                                                    <div
                                                                        className="rounded-xl px-3 py-2.5 glass-surface border border-[color-mix(in_srgb,var(--accent)_26%,transparent)] flex items-center justify-between gap-2.5"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                            <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0">
                                                                                <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                                                                                    {t("icon_rule", "rule")}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                                                <span className="text-[8.5px] font-mono font-black uppercase tracking-wider text-[var(--accent)] leading-none">
                                                                                    {t("overridden_file", "Overridden File")}
                                                                                </span>
                                                                                <span className="text-[11.5px] font-bold text-[var(--text)] opacity-95 leading-snug break-words">
                                                                                    {displayLoserName}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openModDossier(vaultLoser || cleanLoserPath)}
                                                                            className="group/dosloser relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center shrink-0 transition-all cursor-pointer"
                                                                        >
                                                                            <span className="material-symbols-outlined !text-[13px]">
                                                                                {t("icon_open_in_new", "open_in_new")}
                                                                            </span>
                                                                            <HoverTooltip
                                                                                title={`${t("btn_inspect", "Inspect {Mod}")}: ${displayLoserName}`}
                                                                                className="z-[200]"
                                                                            />
                                                                        </button>
                                                                    </div>
                                                                </UniversalCard>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {(overrideTab === "ALL" || overrideTab === "IGNORED") && trueIgnoredPairs.length > 0 && (
                                                <div className="flex flex-col gap-5 w-full">
                                                    <CommandScreenSectionHeading
                                                        title={t("ignored_conflicts", "Ignored Conflicts")}
                                                        subtitle={t("total_ignores", "Total Ignored")}
                                                        icon={t("icon_visibility_off", "visibility_off")}
                                                    />

                                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                        {trueIgnoredPairs.map((pair: string, i: number) => {
                                                            const parts = pair.split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
                                                            const left = parts[0] || pair;
                                                            const right = parts[1] || t("unknown_file", "Unknown File");
                                                            const leftName = left.split(/[/\\]/).pop() || "";
                                                            const rightName = right.split(/[/\\]/).pop() || "";
                                                            const leftDisplay = stripKnownModExt(
                                                                formatDisplayName(leftName || "", activeGameSchema)
                                                            );
                                                            const rightDisplay = stripKnownModExt(
                                                                formatDisplayName(rightName || "", activeGameSchema)
                                                            );
                                                            const vaultLeft = resolveVaultMod(leftName);
                                                            const vaultRight = resolveVaultMod(rightName);

                                                            return (
                                                                <UniversalCard
                                                                    key={`ignored_${i}`}
                                                                    layout="vertical"
                                                                    title={
                                                                        <span className="text-base md:text-[17px] font-black text-[var(--text)] leading-snug line-clamp-2 break-words">
                                                                            {leftDisplay}
                                                                        </span>
                                                                    }
                                                                    subtitle={`${t("vs", "VS")} • ${rightDisplay}`}
                                                                    image={
                                                                        showImages && (vaultLeft?.image_url || vaultLeft?.image)
                                                                            ? vaultLeft.image_url || vaultLeft.image
                                                                            : undefined
                                                                    }
                                                                    icon={t("icon_visibility_off", "visibility_off")}
                                                                    customIcon={
                                                                        <RadarPairPreviewBanner
                                                                            leftIcon={t("icon_visibility_off", "visibility_off")}
                                                                            leftPrimary={t("ignored", "Ignored")}
                                                                            leftSecondary={`#${i + 1}`}
                                                                            accentColorVar="var(--warning)"
                                                                            topLabel={leftDisplay}
                                                                            bottomLabel={rightDisplay}
                                                                        />
                                                                    }
                                                                    imageOverlay={
                                                                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[78%] z-30 pointer-events-none">
                                                                            <div className={VAULT_CHIP_CLASS}>
                                                                                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                                                                    {t("icon_visibility_off", "visibility_off")}
                                                                                </span>
                                                                                <span>{t("ignored", "Ignored")}</span>
                                                                            </div>
                                                                        </div>
                                                                    }
                                                                    footer={
                                                                        <div
                                                                            className="flex items-center justify-between w-full gap-2 text-xs text-[var(--subtext)] font-bold"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <div className="flex items-center gap-1.5">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => openModDossier(vaultLeft || leftName)}
                                                                                    className="group/dosig relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                                                                                >
                                                                                    <span className="material-symbols-outlined !text-[14px]">
                                                                                        {t("icon_open_in_new", "open_in_new")}
                                                                                    </span>
                                                                                    <HoverTooltip
                                                                                        title={`${t("btn_inspect", "Inspect {Mod}")}: ${leftDisplay}`}
                                                                                        className="z-[200]"
                                                                                    />
                                                                                </button>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => unignoreConflict(pair).then(() => runRadar())}
                                                                                className="text-[10px] font-black text-[var(--text)] opacity-85 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                                                                            >
                                                                                <span>{t("unignore_conflict", "Unignore Conflict")}</span>
                                                                                <span className="text-base leading-none">&rarr;</span>
                                                                            </button>
                                                                        </div>
                                                                    }
                                                                >
                                                                    <div
                                                                        className="rounded-xl px-3 py-2.5 glass-surface border border-[color-mix(in_srgb,var(--warning)_26%,transparent)] flex items-center justify-between gap-2.5"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                            <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] flex items-center justify-center shrink-0">
                                                                                <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                                                                                    {t("icon_visibility_off", "visibility_off")}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                                                <span className="text-[8.5px] font-mono font-black uppercase tracking-wider text-[var(--warning)] leading-none">
                                                                                    {t("ignored_conflicts", "Ignored Conflicts")}
                                                                                </span>
                                                                                <span className="text-[11.5px] font-bold text-[var(--text)] opacity-95 leading-snug break-words">
                                                                                    {rightDisplay}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openModDossier(vaultRight || rightName)}
                                                                            className="group/dosigr relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center shrink-0 transition-all cursor-pointer"
                                                                        >
                                                                            <span className="material-symbols-outlined !text-[13px]">
                                                                                {t("icon_open_in_new", "open_in_new")}
                                                                            </span>
                                                                            <HoverTooltip
                                                                                title={`${t("btn_inspect", "Inspect {Mod}")}: ${rightDisplay}`}
                                                                                className="z-[200]"
                                                                            />
                                                                        </button>
                                                                    </div>
                                                                </UniversalCard>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {overrideTab === "IGNORED" && trueIgnoredPairs.length === 0 && (
                                                <EmptyState
                                                    icon={t("icon_visibility_off", "visibility_off")}
                                                    title={t("no_overrides_title", "NO OVERRIDES")}
                                                    subtitle={t(
                                                        "no_overrides_desc",
                                                        "No conflicts have been resolved or ignored for this blueprint."
                                                    )}
                                                />
                                            )}
                                        </div>
                                    </CommandScreenMain>
                                </CommandScreenBody>
                            </CommandScreenLayout>
                        );
                    })()}

                    {activeTab === "LOAD_ORDER" && (() => {
                        const visibleQueueSlice = filteredQueue.slice(0, visibleLoadOrder);
                        const elevatedTierDefs = compiledOrder.priorityTiers.slice(1);
                        const cycleTierFolder = (currentFolder: string) => {
                            const tiers = compiledOrder.priorityTiers;
                            if (!tiers || tiers.length === 0) return "";
                            const currIdx = tiers.findIndex(
                                (pt) => (pt.folder || "").toLowerCase() === (currentFolder || "").toLowerCase()
                            );
                            const nextIdx = (currIdx + 1) % tiers.length;
                            return tiers[nextIdx]?.folder || "";
                        };

                        return (
                            <CommandScreenLayout>
                                <CommandScreenBody>
                                    <CommandScreenMain>
                                        <div className="flex flex-col gap-10 w-full">
                                            {/* Circular Dependency Alert Banner (Severity 5) */}
                                            {compiledOrder.cycles.length > 0 && (
                                                <div className="p-5 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] shadow-[0_0_30px_rgba(239,68,68,0.15)] flex flex-col gap-4 animate-in fade-in duration-300">
                                                    <div className="flex items-center justify-between flex-wrap gap-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--danger)]">
                                                                <span className="material-symbols-outlined !text-[20px]">
                                                                    {t("icon_sync_problem", "sync_problem")}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--danger)]">
                                                                    {t("lo_cycle_detected", "Circular Load Rule Detected")}
                                                                </h3>
                                                                <p className="text-xs text-[var(--subtext)] font-bold">
                                                                    {t(
                                                                        "lo_cycle_desc",
                                                                        "Two or more {mods} are locked in an infinite load-order loop. Break one rule below to restore topological sorting."
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        {compiledOrder.cycles.map((cyc, cIdx) => (
                                                            <div
                                                                key={`cycle_${cIdx}`}
                                                                className="p-3 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] flex items-center justify-between gap-4 flex-wrap"
                                                            >
                                                                <div className="flex items-center gap-2 flex-wrap text-xs font-mono font-bold text-[var(--text)]">
                                                                    {cyc.chain.map((node, nIdx) => (
                                                                        <span key={`${node}_${nIdx}`} className="flex items-center gap-2">
                                                                            <span className="px-2.5 py-1 rounded-lg bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]">
                                                                                {stripKnownModExt(
                                                                                    formatDisplayName(node, undefined, activeGameSchema)
                                                                                )}
                                                                            </span>
                                                                            {nIdx < cyc.chain.length - 1 && (
                                                                                <span className="text-[var(--subtext)] opacity-60">➔</span>
                                                                            )}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (cyc.ruleIds[0]) {
                                                                            removeLoadOrderRule(scanScope, cyc.ruleIds[0]);
                                                                        }
                                                                    }}
                                                                    className="px-4 py-2 rounded-xl bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] text-[10px] font-black uppercase tracking-widest transition-all"
                                                                >
                                                                    {t("lo_break_cycle", "Break Loop")}
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* ========================================================================== */}
                                            {/* SEARCH-TO-PROMOTE RESULTS (Only shown when searching in the top ActionPill) */}
                                            {/* ========================================================================== */}
                                            {loadOrderSearch.trim().length > 0 && (
                                                <div className="flex flex-col gap-4 w-full">
                                                    <CommandScreenSectionHeading
                                                        title={t("search", "Search")}
                                                        subtitle={`${filteredQueue.length} ${t("term_mods", "{Mods}")}`}
                                                        icon={t("icon_search", "search")}
                                                        rightContent={
                                                            <button
                                                                type="button"
                                                                onClick={() => setLoadOrderSearch("")}
                                                                className="h-9 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                                                            >
                                                                <span className="material-symbols-outlined !text-[14px]">
                                                                    {t("icon_close", "close")}
                                                                </span>
                                                                <span>{t("clear", "Clear")}</span>
                                                            </button>
                                                        }
                                                    />
                                                    {filteredQueue.length === 0 ? (
                                                        <EmptyState
                                                            icon={t("icon_search_off", "search_off")}
                                                            title={t("none", "None")}
                                                            subtitle={t("search_ph", "Search {mods}...")}
                                                        />
                                                    ) : (
                                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                            {visibleQueueSlice.map((item) => {
                                                                const isSelected =
                                                                    selectedLoadOrderMod.toLowerCase() === item.cleanName.toLowerCase() &&
                                                                    isLoadOrderPanelOpen;
                                                                const hasRule =
                                                                    ruleLinkedSet.has(item.cleanName.toLowerCase()) || item.autoPromoted;
                                                                const isScript =
                                                                    String(item.extLabel).toUpperCase().includes("SCRIPT") ||
                                                                    item.cleanName.toLowerCase().endsWith(".ts4script");
                                                                const vaultMod = resolveVaultMod(item.cleanName);
                                                                const topOverlap = item.overlapInfo?.entries?.[0] || null;

                                                                return (
                                                                    <UniversalCard
                                                                        key={item.cleanName}
                                                                        layout="vertical"
                                                                        isActive={isSelected}
                                                                        onClick={() => openLoadOrderInspector(item.cleanName, undefined, "PRIORITY")}
                                                                        title={
                                                                            <span className="text-base md:text-[17px] font-black text-[var(--text)] leading-snug line-clamp-2 break-words">
                                                                                {item.cleanDisplayTitle}
                                                                            </span>
                                                                        }
                                                                        subtitle={
                                                                            vaultMod?.author || vaultMod?.creator_name
                                                                                ? `${t("by_prefix", "By")} ${vaultMod.author || vaultMod.creator_name}`
                                                                                : item.tierMeta.roleLabel
                                                                        }
                                                                        image={
                                                                            showImages && (vaultMod?.image_url || vaultMod?.image)
                                                                                ? vaultMod.image_url || vaultMod.image
                                                                                : undefined
                                                                        }
                                                                        icon={
                                                                            isScript
                                                                                ? t("icon_code", "code")
                                                                                : t("icon_deployed_code", "deployed_code")
                                                                        }
                                                                        customIcon={
                                                                            <RadarPairPreviewBanner
                                                                                leftIcon={item.tierMeta.icon}
                                                                                leftPrimary={item.tierMeta.shortLabel}
                                                                                accentColorVar="var(--accent)"
                                                                                topIcon={
                                                                                    isScript
                                                                                        ? t("icon_code", "code")
                                                                                        : t("icon_deployed_code", "deployed_code")
                                                                                }
                                                                                topLabel={item.cleanDisplayTitle}
                                                                                topRightLabel={
                                                                                    item.tierFolder
                                                                                        ? t("lo_badge_wins_override", "Wins Override")
                                                                                        : undefined
                                                                                }
                                                                                topRightIcon={t("icon_workspace_premium", "workspace_premium")}
                                                                                bottomLabel={
                                                                                    topOverlap
                                                                                        ? topOverlap.enemyDisplay
                                                                                        : item.tierMeta.roleDesc
                                                                                }
                                                                            />
                                                                        }
                                                                        imageOverlay={
                                                                            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[78%] z-30 pointer-events-none">
                                                                                <span className={VAULT_CHIP_CLASS}>
                                                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                                        {item.tierMeta.icon}
                                                                                    </span>
                                                                                    <span>{item.tierMeta.shortLabel}</span>
                                                                                </span>
                                                                            </div>
                                                                        }
                                                                        badges={
                                                                            hasRule ? (
                                                                                <span className={VAULT_CHIP_CLASS}>
                                                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                                        {t("icon_rule", "rule")}
                                                                                    </span>
                                                                                    <span>{t("lo_rule_badge", "Rule")}</span>
                                                                                </span>
                                                                            ) : undefined
                                                                        }
                                                                        footer={
                                                                            <div
                                                                                className="flex items-center justify-between w-full gap-2 text-xs text-[var(--subtext)] font-bold"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => openModDossier(vaultMod || item.cleanName)}
                                                                                        className="relative group/dosbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                                    >
                                                                                        <span className="material-symbols-outlined !text-[14px]">
                                                                                            {t("icon_open_in_new", "open_in_new")}
                                                                                        </span>
                                                                                        <HoverTooltip
                                                                                            title={t("btn_inspect", "Inspect {Mod}")}
                                                                                            className="z-[200]"
                                                                                        />
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            setModPriorityTier(
                                                                                                scanScope,
                                                                                                item.cleanName,
                                                                                                cycleTierFolder(item.tierFolder)
                                                                                            )
                                                                                        }
                                                                                        className="relative group/tierbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                                    >
                                                                                        <span className="material-symbols-outlined !text-[14px]">
                                                                                            {t("icon_low_priority", "low_priority")}
                                                                                        </span>
                                                                                        <HoverTooltip
                                                                                            title={t("lo_priority_tier", "Priority Tier")}
                                                                                            className="z-[200]"
                                                                                        />
                                                                                    </button>
                                                                                    {item.tierFolder && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() =>
                                                                                                setModPriorityTier(scanScope, item.cleanName, "")
                                                                                            }
                                                                                            className="relative group/rstbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                                        >
                                                                                            <span className="material-symbols-outlined !text-[14px]">
                                                                                                {t("icon_undo", "undo")}
                                                                                            </span>
                                                                                            <HoverTooltip
                                                                                                title={t("lo_reset_to_standard", "Reset to Standard Tier")}
                                                                                                variant="danger"
                                                                                                className="z-[200]"
                                                                                            />
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        openLoadOrderInspector(item.cleanName, undefined, "PRIORITY")
                                                                                    }
                                                                                    className="text-[10px] font-black text-[var(--text)] opacity-85 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                                                                                >
                                                                                    <span>{t("edit", "Edit")}</span>
                                                                                    <span className="text-base leading-none">&rarr;</span>
                                                                                </button>
                                                                            </div>
                                                                        }
                                                                    >
                                                                        {topOverlap ? (
                                                                            <div className="rounded-xl px-3 py-2.5 glass-surface border border-[color-mix(in_srgb,var(--warning)_26%,transparent)] flex items-center gap-2.5">
                                                                                <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] flex items-center justify-center shrink-0">
                                                                                    <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                                                                                        {t("icon_tune", "tune")}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                                                    <span className="text-[8.5px] font-mono font-black uppercase tracking-wider text-[var(--warning)] leading-none">
                                                                                        {topOverlap.isWinning
                                                                                            ? t("lo_badge_wins_override", "Wins Override")
                                                                                            : topOverlap.isOverridden
                                                                                            ? t("lo_badge_overridden", "Overridden")
                                                                                            : t("vs", "VS")}
                                                                                    </span>
                                                                                    <span className="text-[11.5px] font-bold text-[var(--text)] opacity-95 leading-snug break-words">
                                                                                        {topOverlap.enemyDisplay}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="rounded-xl px-3 py-2.5 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-2.5">
                                                                                <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                                                                                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                                                                                        {item.tierMeta.icon}
                                                                                    </span>
                                                                                </div>
                                                                                <span className="text-[11px] font-semibold text-[var(--text)] opacity-90 leading-snug break-words">
                                                                                    {item.tierMeta.roleDesc}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </UniversalCard>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    {filteredQueue.length > visibleLoadOrder && (
                                                        <div className="flex justify-center mt-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setVisibleLoadOrder((prev) => prev + 60)}
                                                                className="px-6 py-3 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-xl cursor-pointer"
                                                            >
                                                                {t("load_more", "Load More")} ({filteredQueue.length - visibleLoadOrder})
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ========================================================================== */}
                                            {/* PRIORITY TIERS 1-3: 3 COLLAPSIBLE ROWS WITH MASONHUB-SIZED CARDS & DRAG    */}
                                            {/* ========================================================================== */}
                                            {elevatedTierDefs.map((pt, idx) => {
                                                const tierNumber = idx + 1;
                                                const filterId = `TIER_${tierNumber}` as "TIER_1" | "TIER_2" | "TIER_3";
                                                if (loadOrderSubFilter !== "ALL" && loadOrderSubFilter !== filterId) {
                                                    return null;
                                                }

                                                const tierMeta = getAgnosticTierMeta(pt.folder, tierNumber);
                                                const tierMods = standaloneElevatedMods.filter(
                                                    (it) => (it.tierFolder || "").toLowerCase() === (pt.folder || "").toLowerCase()
                                                );
                                                const displayTierMods = buildPreviewTierList(tierMods, pt.folder);
                                                const isCollapsed = !!collapsedTiers[pt.id];
                                                const isDropTarget = dragOverTier === pt.id;
                                                const canReorderWithinSection = isSequentialStrategy || displayTierMods.length > 1;

                                                return (
                                                    <section
                                                        key={pt.id}
                                                        data-lo-tier-section={pt.id}
                                                        data-lo-tier-folder={pt.folder}
                                                        data-lo-tier-count={String(tierMods.length)}
                                                        onDragOver={(e) => {
                                                            e.preventDefault();
                                                            if (dragOverTier !== pt.id) {
                                                                setDragOverTier(pt.id);
                                                            }
                                                        }}
                                                        onDragLeave={() => {
                                                            if (dragOverTier === pt.id) {
                                                                setDragOverTier(null);
                                                            }
                                                        }}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            setDragOverTier(null);
                                                            const droppedMod =
                                                                draggedLoadMod || e.dataTransfer.getData("text/plain");
                                                            if (droppedMod) {
                                                                reorderModInTierSection(droppedMod, tierMods.length, pt.folder);
                                                                setDraggedLoadMod(null);
                                                            }
                                                        }}
                                                        className={`flex flex-col gap-5 w-full rounded-3xl transition-all ${
                                                            isDropTarget
                                                                ? "ring-1 ring-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] p-3 -m-3"
                                                                : ""
                                                        }`}
                                                    >
                                                        <CommandScreenSectionHeading
                                                            title={tierMeta.roleLabel}
                                                            subtitle={tierMeta.roleDesc}
                                                            icon={tierMeta.icon}
                                                            rightContent={
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                                                        <span>{tierMods.length}</span>
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setCollapsedTiers((prev) => ({
                                                                                ...prev,
                                                                                [pt.id]: !prev[pt.id],
                                                                            }))
                                                                        }
                                                                        className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                    >
                                                                        <span
                                                                            className={`material-symbols-outlined !text-[18px] transition-transform duration-200 ${
                                                                                isCollapsed ? "" : "rotate-180"
                                                                            }`}
                                                                        >
                                                                            {t("icon_expand_more", "expand_more")}
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                            }
                                                        />

                                                        {!isCollapsed && (
                                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                                {/* LEADING CREATE NEW / SELECT {MOD} CARD FOR THIS PRIORITY TIER */}
                                                                <div className="glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] h-full">
                                                                    <div
                                                                        className="pointer-events-none absolute inset-0 rounded-[inherit]"
                                                                        style={{
                                                                            background:
                                                                                "radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 62%)",
                                                                        }}
                                                                    />
                                                                    <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--accent)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
                                                                        {tierMeta.icon}
                                                                    </span>

                                                                    <div className="flex items-center justify-between gap-3 relative z-10">
                                                                        <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                                                            <span className="material-symbols-outlined !text-[22px]">
                                                                                {tierMeta.icon}
                                                                            </span>
                                                                        </div>
                                                                        <span className={VAULT_CHIP_CLASS}>
                                                                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                                {tierMeta.icon}
                                                                            </span>
                                                                            <span>
                                                                                {tierMods.length} • {tierMeta.shortLabel}
                                                                            </span>
                                                                        </span>
                                                                    </div>

                                                                    <div className="flex flex-col gap-1 relative z-10">
                                                                        <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--accent)] leading-snug">
                                                                            {tierMeta.roleLabel}
                                                                        </span>
                                                                        <h3 className="text-[15px] md:text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                                                                            {t("lo_select_target_mod", "Select {Mod} to Configure")}
                                                                        </h3>
                                                                    </div>

                                                                    <p className="text-xs font-medium text-[var(--subtext)] opacity-85 leading-relaxed m-0 relative z-10">
                                                                        {tierMeta.roleDesc}
                                                                    </p>

                                                                    <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-2 relative z-10 w-full">
                                                                        <ActionButton
                                                                            variant="glass"
                                                                            icon={t("icon_add", "add")}
                                                                            label={t("lo_select_target_mod", "Select {Mod} to Configure")}
                                                                            onClick={() => openLoadOrderInspector("", pt.folder, "PRIORITY")}
                                                                            className="w-full"
                                                                        />
                                                                        <ActionButton
                                                                            variant="glass"
                                                                            icon={t("icon_swap_vert", "swap_vert")}
                                                                            label={t("lo_reorder_tier_btn", "Reorder Load Order")}
                                                                            onClick={() => openLoadOrderInspector("", pt.folder, "REORDER")}
                                                                            className="w-full"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {displayTierMods.map((it, modIdxInTier) => {
                                                                    const cleanTitle = stripKnownModExt(it.displayName);
                                                                    const extLabel = getFileLabel(it.cleanName, activeGameSchema);
                                                                    const isScript =
                                                                        String(extLabel).toUpperCase().includes("SCRIPT") ||
                                                                        it.cleanName.toLowerCase().endsWith(".ts4script");
                                                                    const isSelected =
                                                                        selectedLoadOrderMod.toLowerCase() ===
                                                                            it.cleanName.toLowerCase() && isLoadOrderPanelOpen;
                                                                    const isEditingNum =
                                                                        editingOrderMod?.toLowerCase() === it.cleanName.toLowerCase();
                                                                    const vaultMod = resolveVaultMod(it.cleanName);
                                                                    const overlapInfo = modOverlapMap.get(it.cleanName.toLowerCase());
                                                                    const topOverlap = overlapInfo?.entries?.[0] || null;
                                                                    const modRule = activeBlueprintRules.find(
                                                                        (r) =>
                                                                            r.modA.toLowerCase() === it.cleanName.toLowerCase() ||
                                                                            r.modB.toLowerCase() === it.cleanName.toLowerCase()
                                                                    );
                                                                    const otherRuleModDisplay = modRule
                                                                        ? stripKnownModExt(
                                                                              formatDisplayName(
                                                                                  modRule.modA.toLowerCase() === it.cleanName.toLowerCase()
                                                                                      ? modRule.modB
                                                                                      : modRule.modA,
                                                                                  undefined,
                                                                                  activeGameSchema
                                                                              )
                                                                          )
                                                                        : "";
                                                                    const hasRule =
                                                                        ruleLinkedSet.has(it.cleanName.toLowerCase()) || it.autoPromoted;
                                                                    const isBeingDragged =
                                                                        Boolean(pointerDragGhost) &&
                                                                        pointerDragGhost?.mod.toLowerCase() === it.cleanName.toLowerCase();

                                                                    return (
                                                                        <div
                                                                            key={it.cleanName}
                                                                            data-lo-slot-idx={String(modIdxInTier)}
                                                                            data-lo-slot-tier={pt.folder}
                                                                            data-lo-drop-mod={it.cleanName}
                                                                            data-lo-drop-idx={String(modIdxInTier)}
                                                                            data-lo-drop-tier={pt.folder}
                                                                            onPointerDown={(e) =>
                                                                                beginPointerDragCandidate(
                                                                                    e,
                                                                                    it.cleanName,
                                                                                    cleanTitle,
                                                                                    pt.folder,
                                                                                    modIdxInTier
                                                                                )
                                                                            }
                                                                            draggable={true}
                                                                            onDragStart={(e) => {
                                                                                setDraggedLoadMod(it.cleanName);
                                                                                e.dataTransfer.setData("text/plain", it.cleanName);
                                                                                e.dataTransfer.effectAllowed = "move";
                                                                            }}
                                                                            onDragEnd={() => {
                                                                                setDraggedLoadMod(null);
                                                                                setDragOverTier(null);
                                                                                setDragOverMod(null);
                                                                            }}
                                                                            onDragOver={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                if (dragOverMod !== it.cleanName) {
                                                                                    setDragOverMod(it.cleanName);
                                                                                }
                                                                            }}
                                                                            onDragLeave={() => {
                                                                                if (dragOverMod === it.cleanName) {
                                                                                    setDragOverMod(null);
                                                                                }
                                                                            }}
                                                                            onDrop={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                setDragOverTier(null);
                                                                                setDragOverMod(null);
                                                                                const droppedMod =
                                                                                    draggedLoadMod ||
                                                                                    e.dataTransfer.getData("text/plain");
                                                                                if (droppedMod) {
                                                                                    reorderModInTierSection(
                                                                                        droppedMod,
                                                                                        modIdxInTier,
                                                                                        pt.folder
                                                                                    );
                                                                                    setDraggedLoadMod(null);
                                                                                }
                                                                            }}
                                                                            className={`h-full flex flex-col cursor-grab active:cursor-grabbing select-none rounded-[var(--radius)] transition-all relative ${
                                                                                isBeingDragged
                                                                                    ? "border border-dashed border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.24))] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] opacity-85"
                                                                                    : ""
                                                                            }`}
                                                                        >
                                                                            <UniversalCard
                                                                                layout="vertical"
                                                                                isActive={isSelected}
                                                                                onClick={() => {
                                                                                    if (didPointerDragRef.current) return;
                                                                                    openLoadOrderInspector(it.cleanName, undefined, "PRIORITY");
                                                                                }}
                                                                                className="h-full"
                                                                                title={
                                                                                    <span className="text-base md:text-[17px] font-black text-[var(--text)] leading-snug line-clamp-2 break-words">
                                                                                        {cleanTitle}
                                                                                    </span>
                                                                                }
                                                                                subtitle={
                                                                                    vaultMod?.author || vaultMod?.creator_name
                                                                                        ? `${t("by_prefix", "By")} ${vaultMod.author || vaultMod.creator_name}`
                                                                                        : tierMeta.roleLabel
                                                                                }
                                                                                image={
                                                                                    showImages && (vaultMod?.image_url || vaultMod?.image)
                                                                                        ? vaultMod.image_url || vaultMod.image
                                                                                        : undefined
                                                                                }
                                                                                icon={
                                                                                    isScript
                                                                                        ? t("icon_code", "code")
                                                                                        : t("icon_deployed_code", "deployed_code")
                                                                                }
                                                                                customIcon={
                                                                                    <RadarPairPreviewBanner
                                                                                        leftIcon={tierMeta.icon}
                                                                                        leftPrimary={`T${tierNumber}`}
                                                                                        leftSecondary={`#${String(modIdxInTier + 1).padStart(2, "0")}`}
                                                                                        accentColorVar="var(--accent)"
                                                                                        topIcon={
                                                                                            isScript
                                                                                                ? t("icon_code", "code")
                                                                                                : t("icon_deployed_code", "deployed_code")
                                                                                        }
                                                                                        topLabel={cleanTitle}
                                                                                        topRightLabel={t("lo_badge_wins_override", "Wins Override")}
                                                                                        topRightIcon={t("icon_workspace_premium", "workspace_premium")}
                                                                                        bottomLabel={
                                                                                            topOverlap
                                                                                                ? topOverlap.enemyDisplay
                                                                                                : otherRuleModDisplay || tierMeta.roleDesc
                                                                                        }
                                                                                    />
                                                                                }
                                                                                imageOverlay={
                                                                                    <div
                                                                                        className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 max-w-[85%] z-30"
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                    >
                                                                                        <span className={VAULT_CHIP_CLASS}>
                                                                                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                                                {tierMeta.icon}
                                                                                            </span>
                                                                                            <span>{tierMeta.shortLabel}</span>
                                                                                        </span>

                                                                                        {canReorderWithinSection && (
                                                                                            isEditingNum ? (
                                                                                                <input
                                                                                                    type="number"
                                                                                                    min={1}
                                                                                                    max={Math.max(1, tierMods.length)}
                                                                                                    autoFocus
                                                                                                    value={editingOrderVal}
                                                                                                    onChange={(e) =>
                                                                                                        setEditingOrderVal(e.target.value)
                                                                                                    }
                                                                                                    onBlur={() => {
                                                                                                        const parsed = parseInt(
                                                                                                            editingOrderVal,
                                                                                                            10
                                                                                                        );
                                                                                                        if (!Number.isNaN(parsed)) {
                                                                                                            reorderModInTierSection(
                                                                                                                it.cleanName,
                                                                                                                parsed - 1,
                                                                                                                pt.folder
                                                                                                            );
                                                                                                        }
                                                                                                        setEditingOrderMod(null);
                                                                                                    }}
                                                                                                    onKeyDown={(e) => {
                                                                                                        if (e.key === "Enter") {
                                                                                                            const parsed = parseInt(
                                                                                                                editingOrderVal,
                                                                                                                10
                                                                                                            );
                                                                                                            if (!Number.isNaN(parsed)) {
                                                                                                                reorderModInTierSection(
                                                                                                                    it.cleanName,
                                                                                                                    parsed - 1,
                                                                                                                    pt.folder
                                                                                                                );
                                                                                                            }
                                                                                                            setEditingOrderMod(null);
                                                                                                        } else if (e.key === "Escape") {
                                                                                                            setEditingOrderMod(null);
                                                                                                        }
                                                                                                    }}
                                                                                                    className="w-14 h-6 px-2 rounded-lg glass-surface border border-[var(--accent)] text-[10px] font-mono font-black text-[var(--text)] bg-transparent outline-none text-center"
                                                                                                />
                                                                                            ) : (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    data-drag-handle="true"
                                                                                                    onClick={() => {
                                                                                                        if (didPointerDragRef.current) return;
                                                                                                        setEditingOrderMod(it.cleanName);
                                                                                                        setEditingOrderVal(
                                                                                                            String(modIdxInTier + 1)
                                                                                                        );
                                                                                                    }}
                                                                                                    className={`${VAULT_CHIP_CLASS} font-mono hover:border-[var(--accent)] cursor-grab active:cursor-grabbing relative group/seqbtn`}
                                                                                                >
                                                                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                                                        {t(
                                                                                                            "icon_drag_indicator",
                                                                                                            "drag_indicator"
                                                                                                        )}
                                                                                                    </span>
                                                                                                    <span>
                                                                                                        #
                                                                                                        {String(modIdxInTier + 1).padStart(
                                                                                                            2,
                                                                                                            "0"
                                                                                                        )}
                                                                                                    </span>
                                                                                                    <HoverTooltip
                                                                                                        title={t(
                                                                                                            "lo_sequence_position",
                                                                                                            "Queue Sequence"
                                                                                                        )}
                                                                                                        className="z-[200]"
                                                                                                    />
                                                                                                </button>
                                                                                            )
                                                                                        )}
                                                                                    </div>
                                                                                }
                                                                                badges={
                                                                                    hasRule ? (
                                                                                        <span className={VAULT_CHIP_CLASS}>
                                                                                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                                                {t("icon_rule", "rule")}
                                                                                            </span>
                                                                                            <span>{t("lo_rule_badge", "Rule")}</span>
                                                                                        </span>
                                                                                    ) : undefined
                                                                                }
                                                                                footer={
                                                                                    <div
                                                                                        className="flex items-center justify-between w-full gap-2 text-xs text-[var(--subtext)] font-bold"
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                    >
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => openModDossier(vaultMod || it.cleanName)}
                                                                                                className="relative group/dosbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                                            >
                                                                                                <span className="material-symbols-outlined !text-[14px]">
                                                                                                    {t("icon_open_in_new", "open_in_new")}
                                                                                                </span>
                                                                                                <HoverTooltip
                                                                                                    title={t("btn_inspect", "Inspect {Mod}")}
                                                                                                    className="z-[200]"
                                                                                                />
                                                                                            </button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() =>
                                                                                                    setModPriorityTier(
                                                                                                        scanScope,
                                                                                                        it.cleanName,
                                                                                                        cycleTierFolder(it.tierFolder)
                                                                                                    )
                                                                                                }
                                                                                                className="relative group/tierbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                                            >
                                                                                                <span className="material-symbols-outlined !text-[14px]">
                                                                                                    {t("icon_low_priority", "low_priority")}
                                                                                                </span>
                                                                                                <HoverTooltip
                                                                                                    title={t("lo_priority_tier", "Priority Tier")}
                                                                                                    className="z-[200]"
                                                                                                />
                                                                                            </button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() =>
                                                                                                    setModPriorityTier(
                                                                                                        scanScope,
                                                                                                        it.cleanName,
                                                                                                        ""
                                                                                                    )
                                                                                                }
                                                                                                className="relative group/rstbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                                            >
                                                                                                <span className="material-symbols-outlined !text-[14px]">
                                                                                                    {t("icon_undo", "undo")}
                                                                                                </span>
                                                                                                <HoverTooltip
                                                                                                    title={t(
                                                                                                        "lo_reset_to_standard",
                                                                                                        "Reset to Standard Tier"
                                                                                                    )}
                                                                                                    variant="danger"
                                                                                                    className="z-[200]"
                                                                                                />
                                                                                            </button>
                                                                                        </div>

                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() =>
                                                                                                openLoadOrderInspector(
                                                                                                    it.cleanName,
                                                                                                    undefined,
                                                                                                    "PRIORITY"
                                                                                                )
                                                                                            }
                                                                                            className="text-[10px] font-black text-[var(--text)] opacity-85 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                                                                                        >
                                                                                            <span>{t("edit", "Edit")}</span>
                                                                                            <span className="text-base leading-none">&rarr;</span>
                                                                                        </button>
                                                                                    </div>
                                                                                }
                                                                            >
                                                                                {/* In-Card Conflict / Override Status Callout (2-line layout so name is never cut off) */}
                                                                                {topOverlap ? (
                                                                                    <div
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setActiveConflictRes(topOverlap.conflict);
                                                                                        }}
                                                                                        className="rounded-xl px-3 py-2.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-between gap-2.5 cursor-pointer transition-colors"
                                                                                    >
                                                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                                            <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                                                                                                <span
                                                                                                    className={`material-symbols-outlined !text-[14px] ${
                                                                                                        topOverlap.severity >= 4
                                                                                                            ? "text-[var(--danger)]"
                                                                                                            : topOverlap.isWinning
                                                                                                            ? "text-[var(--success)]"
                                                                                                            : "text-[var(--warning)]"
                                                                                                    }`}
                                                                                                >
                                                                                                    {topOverlap.severity >= 4
                                                                                                        ? t("icon_crisis_alert", "crisis_alert")
                                                                                                        : topOverlap.isWinning
                                                                                                        ? t("icon_verified", "verified")
                                                                                                        : t("icon_tune", "tune")}
                                                                                                </span>
                                                                                            </div>
                                                                                            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                                                                <span
                                                                                                    className={`text-[8.5px] font-mono font-black uppercase tracking-wider leading-none ${
                                                                                                        topOverlap.severity >= 4
                                                                                                            ? "text-[var(--danger)]"
                                                                                                            : topOverlap.isWinning
                                                                                                            ? "text-[var(--success)]"
                                                                                                            : "text-[var(--warning)]"
                                                                                                    }`}
                                                                                                >
                                                                                                    {topOverlap.severity >= 4
                                                                                                        ? t("lo_badge_core_clash", "S4 Core Clash")
                                                                                                        : topOverlap.isWinning
                                                                                                        ? t("lo_badge_wins_override", "Wins Override")
                                                                                                        : t("lo_badge_overridden", "Overridden")}
                                                                                                </span>
                                                                                                <span className="text-[11.5px] font-bold text-[var(--text)] opacity-95 leading-snug break-words">
                                                                                                    {topOverlap.enemyDisplay}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                ) : modRule ? (
                                                                                    <div className="rounded-xl px-3 py-2.5 glass-surface border border-[color-mix(in_srgb,var(--accent)_26%,transparent)] flex items-center gap-2.5">
                                                                                        <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0">
                                                                                            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                                                                                                {t("icon_rule", "rule")}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                                                            <span className="text-[8.5px] font-mono font-black uppercase tracking-wider text-[var(--accent)] leading-none">
                                                                                                {t("overridden_file", "Overridden File")}
                                                                                            </span>
                                                                                            <span className="text-[11.5px] font-bold text-[var(--text)] opacity-95 leading-snug break-words">
                                                                                                {otherRuleModDisplay}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="rounded-xl px-3 py-2.5 glass-surface border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] flex items-center gap-2.5">
                                                                                        <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-center shrink-0">
                                                                                            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                                                                                                {tierMeta.icon}
                                                                                            </span>
                                                                                        </div>
                                                                                        <span className="text-[11px] font-semibold text-[var(--text)] opacity-90 leading-snug break-words">
                                                                                            {tierMeta.roleDesc}
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                            </UniversalCard>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </section>
                                                );
                                            })}
                                        </div>
                                    </CommandScreenMain>
                                </CommandScreenBody>
                            </CommandScreenLayout>
                        );
                    })()}
                </div>
            </div>
            {activeConflictRes && (
                <ConflictResolutionSidebar
                    conflict={activeConflictRes}
                    loadOrderInfo={getConflictLoadOrderInfo(activeConflictRes)}
                    onClose={() => setActiveConflictRes(null)}
                    onVault={vaultSingleScript}
                    onOverride={applyOverride}
                    onUndo={undoOverride}
                    onOpenLoadOrder={(modName) => {
                        const cleanLeaf = stripPriorityPrefix(modName).split(/[\\/]/).pop() || modName;
                        setActiveConflictRes(null);
                        openLoadOrderInspector(cleanLeaf, undefined, "PRIORITY");
                    }}
                />
            )}

            <UndoWinnersPanel
                isOpen={showUndoPanel}
                onClose={() => setShowUndoPanel(false)}
                scanScope={scanScope}
                onUndoComplete={runRadar}
                onUndo={undoOverride}
                onClearAll={clearAllOverrides}
            />

            {/* Load Order & Rules Inspector SidePanel */}
            {(() => {
                const selectedItem = selectedLoadOrderMod
                    ? compiledOrder.items.find((it) => it.cleanName.toLowerCase() === selectedLoadOrderMod.toLowerCase()) || null
                    : null;
                const selectedCleanTitle = selectedItem
                    ? stripKnownModExt(selectedItem.displayName)
                    : "";
                const selectedTierIndex = selectedItem
                    ? Math.max(
                          0,
                          compiledOrder.priorityTiers.findIndex(
                              (pt) => (pt.folder || "").toLowerCase() === (selectedItem.tierFolder || "").toLowerCase()
                          )
                      )
                    : pendingTierFolder !== null
                    ? Math.max(
                          0,
                          compiledOrder.priorityTiers.findIndex(
                              (pt) => (pt.folder || "").toLowerCase() === (pendingTierFolder || "").toLowerCase()
                          )
                      )
                    : 0;
                const selectedTierMeta = selectedItem
                    ? getAgnosticTierMeta(
                          selectedItem.tierFolder,
                          selectedTierIndex
                      )
                    : pendingTierFolder !== null
                    ? getAgnosticTierMeta(
                          pendingTierFolder,
                          selectedTierIndex
                      )
                    : null;
                const selectedOverlapInfo = selectedItem
                    ? modOverlapMap.get(selectedItem.cleanName.toLowerCase()) || null
                    : null;

                const modDropdownOptions = isLoadOrderPanelOpen
                    ? compiledOrder.items.map((it) => ({
                          id: it.cleanName,
                          label: isSequentialStrategy
                              ? `#${String(it.index + 1).padStart(3, "0")} • ${stripKnownModExt(it.displayName)}`
                              : stripKnownModExt(it.displayName),
                      }))
                    : [];
                const activeModRules = selectedItem
                    ? activeBlueprintRules.filter(
                          (r) =>
                              r.modA.toLowerCase() === selectedItem.cleanName.toLowerCase() ||
                              r.modB.toLowerCase() === selectedItem.cleanName.toLowerCase()
                      )
                    : activeBlueprintRules;

                const normalizedRuleModA = selectedItem
                    ? selectedItem.cleanName
                    : Array.isArray(ruleModA)
                    ? String(ruleModA[0] || "")
                    : String(ruleModA || "");
                const normalizedRuleModB = Array.isArray(ruleModB) ? String(ruleModB[0] || "") : String(ruleModB || "");

                const sourceDropdownOptions = modDropdownOptions.filter(
                    (opt) => !normalizedRuleModB || opt.id.toLowerCase() !== normalizedRuleModB.toLowerCase()
                );
                const targetDropdownOptions = modDropdownOptions.filter(
                    (opt) => !normalizedRuleModA || opt.id.toLowerCase() !== normalizedRuleModA.toLowerCase()
                );

                const isPriorityPickerMode = inspectorMode === "PRIORITY";
                const isReorderMode = inspectorMode === "REORDER";

                const activeReorderTierFolder =
                    pendingTierFolder !== null
                        ? pendingTierFolder
                        : selectedItem?.tierFolder ||
                          compiledOrder.priorityTiers.find((pt) => !!pt.folder)?.folder ||
                          "Sanctuary";
                const activeReorderTierIdx = compiledOrder.priorityTiers.findIndex(
                    (pt) => (pt.folder || "").toLowerCase() === activeReorderTierFolder.toLowerCase()
                );
                const activeReorderTierMeta = getAgnosticTierMeta(
                    activeReorderTierFolder,
                    activeReorderTierIdx >= 0 ? activeReorderTierIdx : 1
                );
                const reorderTierMods = compiledOrder.items.filter(
                    (it) => (it.tierFolder || "").toLowerCase() === activeReorderTierFolder.toLowerCase()
                );

                const pickerFilteredMods = isLoadOrderPanelOpen
                    ? compiledOrder.items.filter((it) => {
                          const q = inspectorModSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                              it.cleanName.toLowerCase().includes(q) ||
                              it.displayName.toLowerCase().includes(q)
                          );
                      })
                    : [];

                return (
                    <SidePanel
                        isOpen={isLoadOrderPanelOpen}
                        onClose={() => setIsLoadOrderPanelOpen(false)}
                        title={
                            isReorderMode
                                ? t("lo_reorder_tier_btn", "Reorder Load Order")
                                : selectedItem
                                ? selectedCleanTitle
                                : isPriorityPickerMode
                                ? selectedTierMeta?.roleLabel || t("lo_select_target_mod", "Select {Mod} to Configure")
                                : t("load_order_rules", "Load Order Rules")
                        }
                        subtitle={
                            isReorderMode
                                ? `${activeReorderTierMeta.roleLabel} • ${t("lo_reorder_tier_desc", "Drag & drop compact cards or edit sequence numbers to reorder {mods} within this priority tier.")}`
                                : selectedItem
                                ? isSequentialStrategy
                                    ? `#${String(selectedItem.index + 1).padStart(3, "0")} • ${getFileLabel(selectedItem.cleanName, activeGameSchema)} • ${selectedTierMeta?.shortLabel || ""}`
                                    : `${getFileLabel(selectedItem.cleanName, activeGameSchema)} • ${selectedTierMeta?.shortLabel || ""}`
                                : isPriorityPickerMode
                                ? selectedTierMeta?.roleDesc || t("lo_tier_select_desc", "Assign this {mod} to an elevated priority tier so it loads later and wins conflicts.")
                                : t("lo_rule_builder_desc", "Lock explicit load order dependencies between two {mods}.")
                        }
                        icon={
                            isReorderMode
                                ? t("icon_swap_vert", "swap_vert")
                                : isPriorityPickerMode
                                ? t("icon_low_priority", "low_priority")
                                : t("icon_rule", "rule")
                        }
                        widthClass="w-[90vw] md:w-[680px]"
                        headerActions={
                            <PanelHeaderGroup>
                                {selectedItem && (
                                    <PanelHeaderButton
                                        icon={t("icon_open_in_new", "open_in_new")}
                                        tooltip={t("btn_inspect", "Inspect {Mod}")}
                                        onClick={() => openModDossier(resolveVaultMod(selectedItem.cleanName) || selectedItem.cleanName)}
                                    />
                                )}
                                {selectedItem && (
                                    <PanelHeaderButton
                                        icon={t("icon_swap_horiz", "swap_horiz")}
                                        tooltip={t("lo_switch_mod", "Switch {Mod}")}
                                        onClick={() => setShowModPickerInInspector((prev) => !prev)}
                                    />
                                )}
                                <PanelHeaderButton
                                    icon={t("icon_swap_vert", "swap_vert")}
                                    tooltip={t("lo_auto_sort", "Auto-Sort Queue")}
                                    onClick={() => autoSortBlueprintLoadOrder(scanScope)}
                                />
                                <PanelHeaderButton
                                    icon={t("icon_check_circle", "check_circle")}
                                    tooltip={`${t("btn_deployed", "Deployed")} (${scanScope})`}
                                    onClick={() => equipPlaySet(scanScope)}
                                />
                            </PanelHeaderGroup>
                        }
                    >
                        <div className="flex flex-col gap-5 pb-8">
                            <SidePanelHeroCard
                                overline={scanScope}
                                title={
                                    isReorderMode
                                        ? activeReorderTierMeta.roleLabel
                                        : selectedItem
                                        ? selectedCleanTitle
                                        : isPriorityPickerMode
                                        ? selectedTierMeta?.roleLabel || t("lo_select_target_mod", "Select {Mod} to Configure")
                                        : t("load_order_rules", "Load Order Rules")
                                }
                                description={
                                    isReorderMode
                                        ? t("lo_reorder_tier_desc", "Drag & drop compact cards or edit sequence numbers to reorder {mods} within this priority tier.")
                                        : selectedItem
                                        ? `${selectedTierMeta?.roleDesc || ""} • ${selectedItem.previewPath}`
                                        : isPriorityPickerMode
                                        ? selectedTierMeta?.roleDesc || t("lo_tier_select_desc", "Assign this {mod} to an elevated priority tier so it loads later and wins conflicts.")
                                        : t("lo_rule_builder_desc", "Lock explicit load order dependencies between two {mods}.")
                                }
                                badge={
                                    isReorderMode
                                        ? `${reorderTierMods.length} • ${activeReorderTierMeta.shortLabel}`
                                        : selectedItem
                                        ? isSequentialStrategy
                                            ? `#${String(selectedItem.index + 1).padStart(3, "0")} / ${compiledOrder.items.length}`
                                            : selectedTierMeta?.shortLabel || t("lo_role_base_short", "Standard")
                                        : `${customLoadOrderCount} ${t("overrides", "Overrides")}`
                                }
                                badgeIcon={
                                    isReorderMode
                                        ? t("icon_swap_vert", "swap_vert")
                                        : isSequentialStrategy
                                        ? t("icon_format_list_numbered", "format_list_numbered")
                                        : t("icon_low_priority", "low_priority")
                                }
                                icon={
                                    isReorderMode
                                        ? t("icon_swap_vert", "swap_vert")
                                        : isPriorityPickerMode
                                        ? t("icon_low_priority", "low_priority")
                                        : t("icon_rule", "rule")
                                }
                                variant="accent"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full pt-1">
                                    <StatBox
                                        label={t("lo_priority_tier", "Priority Tier")}
                                        value={
                                            selectedItem
                                                ? selectedTierMeta?.shortLabel || t("lo_tier_standard_short", "Standard")
                                                : pendingTierFolder !== null && selectedTierMeta
                                                ? selectedTierMeta.shortLabel
                                                : `${elevatedModsCount} ${t("overrides", "Overrides")}`
                                        }
                                        icon={t("icon_low_priority", "low_priority")}
                                        iconColorClass="text-[var(--accent)]"
                                    />
                                    <StatBox
                                        label={
                                            isSequentialStrategy
                                                ? t("lo_sequence_position", "Queue Sequence")
                                                : t("schema_load_engine", "Load Order Engine")
                                        }
                                        value={
                                            isSequentialStrategy
                                                ? selectedItem
                                                    ? `#${String(selectedItem.index + 1).padStart(3, "0")}`
                                                    : `${compiledOrder.items.length}`
                                                : t("lo_engine_folder_short", "Folder Tiers")
                                        }
                                        icon={
                                            isSequentialStrategy
                                                ? t("icon_format_list_numbered", "format_list_numbered")
                                                : t("icon_folder_special", "folder_special")
                                        }
                                        iconColorClass="text-[var(--accent)]"
                                    />
                                    <StatBox
                                        label={t("load_order_rules", "Load Order Rules")}
                                        value={activeModRules.length}
                                        icon={t("icon_rule", "rule")}
                                        iconColorClass="text-[var(--accent)]"
                                    />
                                </div>
                            </SidePanelHeroCard>

                            {/* REORDER MODE: Compact Draggable Cards for Reordering Within a Priority Tier */}
                            {isReorderMode && (
                                <UniversalGroup
                                    title={t("lo_reorder_tier_btn", "Reorder Load Order")}
                                    icon={t("icon_swap_vert", "swap_vert")}
                                >
                                    <div className="flex flex-col gap-3.5 shrink-0">
                                        {/* Tier Filter Tiles (Sanctuary SidePanel standard: DashboardStatTile variant="filter") */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 shrink-0">
                                            {compiledOrder.priorityTiers
                                                .map((pt, idx) => ({ pt, idx }))
                                                .filter(({ pt, idx }) => idx > 0 && !!pt.folder)
                                                .map(({ pt, idx }) => {
                                                    const tMeta = getAgnosticTierMeta(pt.folder, idx);
                                                    const countInT = compiledOrder.items.filter(
                                                        (m) => (m.tierFolder || "").toLowerCase() === (pt.folder || "").toLowerCase()
                                                    ).length;
                                                    return (
                                                        <DashboardStatTile
                                                            key={pt.id}
                                                            variant="filter"
                                                            icon={tMeta.icon}
                                                            label={tMeta.shortLabel}
                                                            value={countInT}
                                                            isActive={activeReorderTierFolder.toLowerCase() === (pt.folder || "").toLowerCase()}
                                                            onClick={() => setPendingTierFolder(pt.folder)}
                                                        />
                                                    );
                                                })}
                                        </div>

                                        <p className="text-[11px] font-bold text-[var(--subtext)] opacity-85 m-0">
                                            {t(
                                                "lo_reorder_tier_desc",
                                                "Drag & drop compact cards or edit sequence numbers to reorder {mods} within this priority tier."
                                            )}
                                        </p>

                                        {reorderTierMods.length > 6 && (
                                            <ActionPill
                                                searchQuery={inspectorModSearch}
                                                setSearchQuery={setInspectorModSearch}
                                                searchPlaceholder={t("search_ph", "Search {mods}...") as string}
                                            />
                                        )}

                                        {reorderTierMods.length === 0 ? (
                                            <div className="p-5 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center gap-3 text-center">
                                                <span className="text-xs font-bold text-[var(--subtext)] opacity-80">
                                                    {t("lo_select_target_mod", "Select {Mod} to Configure")}
                                                </span>
                                                <ActionButton
                                                    variant="glass"
                                                    icon={t("icon_add", "add")}
                                                    label={t("lo_select_target_mod", "Select {Mod} to Configure")}
                                                    onClick={() => setInspectorMode("PRIORITY")}
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
                                                    {buildPreviewTierList(reorderTierMods, activeReorderTierFolder)
                                                        .map((it, idxInTier) => ({ it, idxInTier }))
                                                        .filter(({ it }) => {
                                                            const q = inspectorModSearch.trim().toLowerCase();
                                                            if (!q) return true;
                                                            return (
                                                                it.displayName.toLowerCase().includes(q) ||
                                                                it.cleanName.toLowerCase().includes(q)
                                                            );
                                                        })
                                                        .slice(0, visiblePickerMods)
                                                        .map(({ it, idxInTier }) => {
                                                            const mTitle = stripKnownModExt(it.displayName);
                                                            const mExt = getFileLabel(it.cleanName, activeGameSchema);
                                                            const isScriptMod =
                                                                String(mExt).toUpperCase().includes("SCRIPT") ||
                                                                it.cleanName.toLowerCase().endsWith(".ts4script");
                                                            const vaultM = resolveVaultMod(it.cleanName);
                                                            const mAuthor = vaultM?.author || vaultM?.creator_name || "";
                                                            const isEditingSeq =
                                                                editingOrderMod?.toLowerCase() === it.cleanName.toLowerCase();
                                                            const isBeingDragged =
                                                                draggedLoadMod?.toLowerCase() === it.cleanName.toLowerCase();
                                                            const isDropTarget =
                                                                dragOverMod?.toLowerCase() === it.cleanName.toLowerCase() &&
                                                                draggedLoadMod?.toLowerCase() !== it.cleanName.toLowerCase();

                                                            return (
                                                                <div
                                                                    key={it.cleanName}
                                                                    data-lo-slot-idx={String(idxInTier)}
                                                                    data-lo-slot-tier={activeReorderTierFolder}
                                                                    data-lo-drop-mod={it.cleanName}
                                                                    data-lo-drop-idx={String(idxInTier)}
                                                                    data-lo-drop-tier={activeReorderTierFolder}
                                                                    onPointerDown={(e) =>
                                                                        beginPointerDragCandidate(
                                                                            e,
                                                                            it.cleanName,
                                                                            mTitle,
                                                                            activeReorderTierFolder,
                                                                            idxInTier
                                                                        )
                                                                    }
                                                                    draggable={true}
                                                                    onDragStart={(e) => {
                                                                        setDraggedLoadMod(it.cleanName);
                                                                        e.dataTransfer.setData("text/plain", it.cleanName);
                                                                        e.dataTransfer.effectAllowed = "move";
                                                                    }}
                                                                    onDragEnd={() => {
                                                                        setDraggedLoadMod(null);
                                                                        setDragOverMod(null);
                                                                    }}
                                                                    onDragOver={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        if (dragOverMod !== it.cleanName) {
                                                                            setDragOverMod(it.cleanName);
                                                                        }
                                                                    }}
                                                                    onDragLeave={() => {
                                                                        if (dragOverMod === it.cleanName) {
                                                                            setDragOverMod(null);
                                                                        }
                                                                    }}
                                                                    onDrop={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setDragOverMod(null);
                                                                        const droppedMod =
                                                                            draggedLoadMod || e.dataTransfer.getData("text/plain");
                                                                        if (droppedMod) {
                                                                            reorderModInTierSection(
                                                                                droppedMod,
                                                                                idxInTier,
                                                                                activeReorderTierFolder
                                                                            );
                                                                            setDraggedLoadMod(null);
                                                                        }
                                                                    }}
                                                                    className={`p-3.5 rounded-2xl glass-panel transition-all flex flex-col justify-between gap-2.5 shrink-0 cursor-grab active:cursor-grabbing select-none group/rcard hover:-translate-y-0.5 ${
                                                                        isBeingDragged
                                                                            ? "border border-dashed border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.24))] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] opacity-85"
                                                                            : isDropTarget
                                                                            ? "border border-[color-mix(in_srgb,var(--accent)_45%,rgba(255,255,255,0.28))] bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
                                                                            : "border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.28))]"
                                                                    }`}
                                                                >
                                                                    {/* Top Row: Icon Well + Title/Author + Dossier Button (matches Select Mod cards) */}
                                                                    <div className="flex items-start justify-between gap-2.5 min-w-0">
                                                                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                                            <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                                                                <span className="material-symbols-outlined !text-[18px]">
                                                                                    {isScriptMod
                                                                                        ? t("icon_code", "code")
                                                                                        : t("icon_deployed_code", "deployed_code")}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                                                <span className="text-xs font-black text-[var(--text)] group-hover/rcard:text-[var(--accent)] transition-colors leading-snug line-clamp-2 break-words">
                                                                                    {mTitle}
                                                                                </span>
                                                                                <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-80 truncate">
                                                                                    {mAuthor
                                                                                        ? `${t("by_prefix", "By")} ${mAuthor}`
                                                                                        : activeReorderTierMeta.shortLabel}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                openModDossier(vaultM || it.cleanName);
                                                                            }}
                                                                            className="relative group/rdos w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center shrink-0 transition-all cursor-pointer"
                                                                        >
                                                                            <span className="material-symbols-outlined !text-[13px]">
                                                                                {t("icon_open_in_new", "open_in_new")}
                                                                            </span>
                                                                            <HoverTooltip
                                                                                title={t("btn_inspect", "Inspect {Mod}")}
                                                                                className="z-[200]"
                                                                            />
                                                                        </button>
                                                                    </div>

                                                                    {/* Bottom Footer Row: Sequence Badge (#01 Drag / Click-to-Edit) on Left | Up & Down Buttons on Right */}
                                                                    <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                                                                        {isEditingSeq ? (
                                                                            <input
                                                                                type="number"
                                                                                min={1}
                                                                                max={Math.max(1, reorderTierMods.length)}
                                                                                autoFocus
                                                                                value={editingOrderVal}
                                                                                onChange={(e) => setEditingOrderVal(e.target.value)}
                                                                                onBlur={() => {
                                                                                    const parsed = parseInt(editingOrderVal, 10);
                                                                                    if (!Number.isNaN(parsed)) {
                                                                                        reorderModInTierSection(
                                                                                            it.cleanName,
                                                                                            parsed - 1,
                                                                                            activeReorderTierFolder
                                                                                        );
                                                                                    }
                                                                                    setEditingOrderMod(null);
                                                                                }}
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === "Enter") {
                                                                                        const parsed = parseInt(editingOrderVal, 10);
                                                                                        if (!Number.isNaN(parsed)) {
                                                                                            reorderModInTierSection(
                                                                                                it.cleanName,
                                                                                                parsed - 1,
                                                                                                activeReorderTierFolder
                                                                                            );
                                                                                        }
                                                                                        setEditingOrderMod(null);
                                                                                    } else if (e.key === "Escape") {
                                                                                        setEditingOrderMod(null);
                                                                                    }
                                                                                }}
                                                                                className="w-14 h-7 px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[10px] font-mono font-black text-[var(--text)] bg-transparent outline-none text-center shrink-0"
                                                                            />
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                data-drag-handle="true"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (didPointerDragRef.current) return;
                                                                                    setEditingOrderMod(it.cleanName);
                                                                                    setEditingOrderVal(String(idxInTier + 1));
                                                                                }}
                                                                                className={`${VAULT_CHIP_CLASS} font-mono hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] cursor-grab active:cursor-grabbing relative group/rseq`}
                                                                            >
                                                                                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                                    {t("icon_drag_indicator", "drag_indicator")}
                                                                                </span>
                                                                                <span>#{String(idxInTier + 1).padStart(2, "0")}</span>
                                                                                <HoverTooltip
                                                                                    title={t("lo_sequence_position", "Queue Sequence")}
                                                                                    className="z-[200]"
                                                                                />
                                                                            </button>
                                                                        )}

                                                                        <div className="flex items-center gap-1 shrink-0">
                                                                            <button
                                                                                type="button"
                                                                                disabled={idxInTier === 0}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    reorderModInTierSection(
                                                                                        it.cleanName,
                                                                                        idxInTier - 1,
                                                                                        activeReorderTierFolder
                                                                                    );
                                                                                }}
                                                                                className="relative group/rup w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] disabled:opacity-35 text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                                                                            >
                                                                                <span className="material-symbols-outlined !text-[15px]">
                                                                                    {t("icon_keyboard_arrow_up", "keyboard_arrow_up")}
                                                                                </span>
                                                                                <HoverTooltip
                                                                                    title={t("lo_move_earlier", "Load Earlier")}
                                                                                    className="z-[200]"
                                                                                />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                disabled={idxInTier >= reorderTierMods.length - 1}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    reorderModInTierSection(
                                                                                        it.cleanName,
                                                                                        idxInTier + 1,
                                                                                        activeReorderTierFolder
                                                                                    );
                                                                                }}
                                                                                className="relative group/rdn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] disabled:opacity-35 text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                                                                            >
                                                                                <span className="material-symbols-outlined !text-[15px]">
                                                                                    {t("icon_keyboard_arrow_down", "keyboard_arrow_down")}
                                                                                </span>
                                                                                <HoverTooltip
                                                                                    title={t("lo_move_later", "Load Later (Higher Priority)")}
                                                                                    className="z-[200]"
                                                                                />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                </div>

                                                {reorderTierMods.length > visiblePickerMods && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setVisiblePickerMods((prev) => prev + 30)}
                                                        className="h-9 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                                                    >
                                                        <span>
                                                            {t("load_more", "Load More")} ({reorderTierMods.length - visiblePickerMods})
                                                        </span>
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </UniversalGroup>
                            )}

                            {/* PRIORITY MODE: Select {Mod} Picker (2-Column Sanctuary Card Grid — never crushed!) */}
                            {isPriorityPickerMode && (!selectedItem || showModPickerInInspector) && (
                                <UniversalGroup
                                    title={t("lo_select_target_mod", "Select {Mod} to Configure")}
                                    icon={t("icon_extension", "extension")}
                                >
                                    <div className="flex flex-col gap-3.5 shrink-0">
                                        <ActionPill
                                            searchQuery={inspectorModSearch}
                                            setSearchQuery={setInspectorModSearch}
                                            searchPlaceholder={t("search_ph", "Search {mods}...") as string}
                                        />
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
                                            {pickerFilteredMods.slice(0, visiblePickerMods).map((it) => {
                                                const mTitle = stripKnownModExt(it.displayName);
                                                const mExt = getFileLabel(it.cleanName, activeGameSchema);
                                                const isScriptMod =
                                                    String(mExt).toUpperCase().includes("SCRIPT") ||
                                                    it.cleanName.toLowerCase().endsWith(".ts4script");
                                                const vaultM = resolveVaultMod(it.cleanName);
                                                const mAuthor = vaultM?.author || vaultM?.creator_name || "";
                                                const tIdx = compiledOrder.priorityTiers.findIndex(
                                                    (pt) => (pt.folder || "").toLowerCase() === (it.tierFolder || "").toLowerCase()
                                                );
                                                const tMeta = getAgnosticTierMeta(it.tierFolder, tIdx >= 0 ? tIdx : 0);
                                                const isAlreadyInPendingTier =
                                                    pendingTierFolder !== null &&
                                                    (it.tierFolder || "").toLowerCase() === (pendingTierFolder || "").toLowerCase();

                                                return (
                                                    <div
                                                        key={it.cleanName}
                                                        onClick={() => {
                                                            const targetFolder =
                                                                pendingTierFolder !== null
                                                                    ? pendingTierFolder
                                                                    : compiledOrder.priorityTiers[1]?.folder || "Sanctuary";
                                                            setModPriorityTier(scanScope, it.cleanName, targetFolder);
                                                            setSelectedLoadOrderMod(it.cleanName);
                                                            setPendingTierFolder(null);
                                                            setShowModPickerInInspector(false);
                                                        }}
                                                        className={`p-3.5 rounded-2xl glass-panel border transition-all flex flex-col justify-between gap-2.5 shrink-0 cursor-pointer group/pick hover:-translate-y-0.5 ${
                                                            isAlreadyInPendingTier
                                                                ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                                                                : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]"
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2.5 min-w-0">
                                                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                                <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                                                    <span className="material-symbols-outlined !text-[18px]">
                                                                        {isScriptMod
                                                                            ? t("icon_code", "code")
                                                                            : t("icon_deployed_code", "deployed_code")}
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                                    <span className="text-xs font-black text-[var(--text)] group-hover/pick:text-[var(--accent)] transition-colors leading-snug line-clamp-2 break-words">
                                                                        {mTitle}
                                                                    </span>
                                                                    <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-80 truncate">
                                                                        {mAuthor
                                                                            ? `${t("by_prefix", "By")} ${mAuthor}`
                                                                            : tMeta.roleLabel}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openModDossier(vaultM || it.cleanName);
                                                                }}
                                                                className="relative group/pkdos w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center shrink-0 transition-all cursor-pointer"
                                                            >
                                                                <span className="material-symbols-outlined !text-[13px]">
                                                                    {t("icon_open_in_new", "open_in_new")}
                                                                </span>
                                                                <HoverTooltip
                                                                    title={t("btn_inspect", "Inspect {Mod}")}
                                                                    className="z-[200]"
                                                                />
                                                            </button>
                                                        </div>

                                                        <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                                                            <span className={VAULT_CHIP_CLASS}>
                                                                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                    {tMeta.icon}
                                                                </span>
                                                                <span>{tMeta.shortLabel}</span>
                                                            </span>
                                                            <span className="text-[9.5px] font-black uppercase tracking-wider text-[var(--text)] opacity-85 group-hover/pick:opacity-100 group-hover/pick:text-[var(--accent)] flex items-center gap-1 shrink-0 transition-colors">
                                                                <span>
                                                                    {isAlreadyInPendingTier
                                                                        ? t("active", "Active")
                                                                        : t("lo_select_target_mod", "Select {Mod} to Configure").split(" ")[0]}
                                                                </span>
                                                                <span className="text-xs leading-none">&rarr;</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {pickerFilteredMods.length > visiblePickerMods && (
                                            <button
                                                type="button"
                                                onClick={() => setVisiblePickerMods((prev) => prev + 30)}
                                                className="h-9 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                                            >
                                                <span>
                                                    {t("load_more", "Load More")} ({pickerFilteredMods.length - visiblePickerMods})
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                </UniversalGroup>
                            )}

                            {/* Detected Resource Overlaps for Selected {Mod} */}
                            {selectedItem && selectedOverlapInfo && selectedOverlapInfo.entries.length > 0 && (
                                <UniversalGroup
                                    title={t("lo_detected_overlaps_title", "Detected Resource Overlaps")}
                                    icon={t("icon_warning_amber", "warning_amber")}
                                >
                                    <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 mb-1">
                                        {t(
                                            "lo_detected_overlaps_desc",
                                            "This {mod} shares internal game resources with {count} other {mods}. Make it load after a rival to win the override, or inspect and resolve the conflict."
                                        ).replace("{count}", String(selectedOverlapInfo.entries.length))}
                                    </p>
                                    <div className="flex flex-col gap-2.5">
                                        {selectedOverlapInfo.entries.map(({ conflict, enemyClean, enemyDisplay, enemyIndex, enemyTierLabel, isWinning, isOverridden, severity }) => {
                                            const otherCleanLeaf = enemyClean;
                                            const otherTitle = enemyDisplay;
                                            const isFatalTier = severity >= 4;

                                            return (
                                                <div
                                                    key={`${conflict.mod_pair}_${otherCleanLeaf}`}
                                                    className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5"
                                                >
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <span className={VAULT_CHIP_CLASS}>
                                                                <span
                                                                    className={`material-symbols-outlined !text-[12px] ${
                                                                        severity >= 4
                                                                            ? "text-[var(--danger)]"
                                                                            : severity === 3
                                                                            ? "text-[var(--warning)]"
                                                                            : "text-[var(--accent)]"
                                                                    }`}
                                                                >
                                                                    {severity >= 4
                                                                        ? t("icon_error", "error")
                                                                        : severity === 3
                                                                        ? t("icon_tune", "tune")
                                                                        : t("icon_palette", "palette")}
                                                                </span>
                                                                <span>S{severity}</span>
                                                            </span>
                                                            {isSequentialStrategy && enemyIndex !== undefined ? (
                                                                <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                                                    <span>#{String(enemyIndex + 1).padStart(3, "0")}</span>
                                                                </span>
                                                            ) : enemyTierLabel ? (
                                                                <span className={VAULT_CHIP_CLASS}>
                                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                        {t("icon_low_priority", "low_priority")}
                                                                    </span>
                                                                    <span>{enemyTierLabel}</span>
                                                                </span>
                                                            ) : null}
                                                            <span className="text-xs font-black text-[var(--text)] break-words line-clamp-1">
                                                                {otherTitle}
                                                            </span>
                                                        </div>
                                                        <span className={VAULT_CHIP_CLASS}>
                                                            <span
                                                                className={`material-symbols-outlined !text-[12px] ${
                                                                    isFatalTier
                                                                        ? "text-[var(--danger)]"
                                                                        : isWinning
                                                                        ? "text-[var(--success)]"
                                                                        : isOverridden
                                                                        ? "text-[var(--warning)]"
                                                                        : "text-[var(--subtext)]"
                                                                }`}
                                                            >
                                                                {isFatalTier
                                                                    ? t("icon_warning_amber", "warning_amber")
                                                                    : isWinning
                                                                    ? t("icon_emoji_events", "emoji_events")
                                                                    : isOverridden
                                                                    ? t("icon_schedule", "schedule")
                                                                    : t("icon_help_outline", "help_outline")}
                                                            </span>
                                                            <span>
                                                                {isFatalTier
                                                                    ? t("lo_badge_core_clash", "S4 Core Clash")
                                                                    : isWinning
                                                                    ? t("lo_badge_wins_override", "Wins Override")
                                                                    : isOverridden
                                                                    ? t("lo_badge_overridden", "Overridden")
                                                                    : t("radar_winner_unresolved", "Unresolved")}
                                                            </span>
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-end gap-2 flex-wrap">
                                                        {!isFatalTier && !isWinning && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    addLoadOrderRule(
                                                                        scanScope,
                                                                        selectedItem.cleanName,
                                                                        otherCleanLeaf,
                                                                        "after"
                                                                    )
                                                                }
                                                                className="px-3 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all"
                                                            >
                                                                <span className="material-symbols-outlined !text-[14px]">
                                                                    {t("icon_emoji_events", "emoji_events")}
                                                                </span>
                                                                <span>{t("lo_btn_win_override", "Win Override (Load After)")}</span>
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsLoadOrderPanelOpen(false);
                                                                setActiveConflictRes(conflict);
                                                            }}
                                                            className="px-3 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--text)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all"
                                                        >
                                                            <span className="material-symbols-outlined !text-[14px]">
                                                                {t("icon_build", "build")}
                                                            </span>
                                                            <span>{t("btn_resolve", "Inspect & Resolve")}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </UniversalGroup>
                            )}

                            {/* Priority Tier Selector (Shown once a specific {Mod} is selected) */}
                            {selectedItem && !showModPickerInInspector && (
                                <UniversalGroup
                                    title={t("lo_priority_tier", "Priority Tier")}
                                    icon={t("icon_low_priority", "low_priority")}
                                >
                                    <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 mb-1">
                                        {t("lo_tier_select_desc", "Assign this {mod} to an elevated priority tier so it loads later and wins conflicts.")}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {compiledOrder.priorityTiers.map((pt, idx) => {
                                            const activeFolder = selectedItem
                                                ? selectedItem.tierFolder || ""
                                                : pendingTierFolder !== null
                                                ? pendingTierFolder
                                                : "";
                                            const isActiveTier =
                                                activeFolder.toLowerCase() === (pt.folder || "").toLowerCase();
                                            const tierMeta = getAgnosticTierMeta(
                                                pt.folder,
                                                idx
                                            );
                                            return (
                                                <button
                                                    key={pt.id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (selectedItem) {
                                                            setModPriorityTier(scanScope, selectedItem.cleanName, pt.folder);
                                                        } else {
                                                            setPendingTierFolder(pt.folder);
                                                        }
                                                    }}
                                                    className={`p-3.5 rounded-2xl glass-surface text-left transition-all border flex flex-col gap-2 group ${
                                                        isActiveTier
                                                            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.12)]"
                                                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2 w-full">
                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                            <div
                                                                className={`w-8 h-8 rounded-xl border bg-transparent flex items-center justify-center shrink-0 transition-colors ${
                                                                    isActiveTier
                                                                        ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                                                                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] group-hover:text-[var(--accent)]"
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined !text-[17px]">
                                                                    {idx === 0
                                                                        ? t("icon_layers", "layers")
                                                                        : idx === compiledOrder.priorityTiers.length - 1
                                                                        ? t("icon_emoji_events", "emoji_events")
                                                                        : t("icon_low_priority", "low_priority")}
                                                                </span>
                                                            </div>
                                                            <span className={`text-xs font-black uppercase tracking-wide whitespace-normal leading-snug ${isActiveTier ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                                                                {tierMeta.roleLabel}
                                                            </span>
                                                        </div>
                                                        <span className={`${VAULT_CHIP_CLASS} font-mono shrink-0`}>
                                                            <span
                                                                className={`material-symbols-outlined !text-[12px] ${
                                                                    isActiveTier ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                                                                }`}
                                                            >
                                                                {isActiveTier ? t("icon_verified", "verified") : t("icon_low_priority", "low_priority")}
                                                            </span>
                                                            <span>
                                                                {pt.folder || tierMeta.shortLabel}
                                                            </span>
                                                        </span>
                                                    </div>
                                                    <span className="text-[11px] font-bold text-[var(--subtext)] opacity-85 whitespace-normal leading-snug">
                                                        {tierMeta.roleDesc}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </UniversalGroup>
                            )}

                            {selectedItem && isSequentialStrategy && (
                                <UniversalGroup
                                    title={t("lo_sequence_position", "Queue Sequence")}
                                    icon={t("icon_format_list_numbered", "format_list_numbered")}
                                >
                                    <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 mb-1">
                                        {t("lo_sequence_desc", "Adjust where this {mod} loads within its priority tier.")}
                                    </p>
                                    <div className="flex flex-col gap-3 p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                        <div className="flex items-center gap-3 min-w-0 w-full">
                                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                                <span className="material-symbols-outlined !text-[20px]">
                                                    {String(getFileLabel(selectedItem.cleanName, activeGameSchema)).toUpperCase().includes("SCRIPT") || selectedItem.cleanName.toLowerCase().endsWith(".ts4script")
                                                        ? t("icon_code", "code")
                                                        : t("icon_extension", "extension")}
                                                </span>
                                            </div>
                                            <div className="flex flex-col min-w-0 flex-1 gap-1">
                                                <span className="text-xs font-black text-[var(--text)] break-words leading-snug">
                                                    {selectedCleanTitle}
                                                </span>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                            {t("icon_format_list_numbered", "format_list_numbered")}
                                                        </span>
                                                        <span>#{String(selectedItem.index + 1).padStart(3, "0")}</span>
                                                    </span>
                                                    <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-80 break-all">
                                                        {selectedItem.previewPath}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "top")}
                                                className="group/qtop relative h-9 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[16px]">{t("icon_vertical_align_top", "vertical_align_top")}</span>
                                                <span>{t("lo_btn_first_short", "First")}</span>
                                                <HoverTooltip title={t("lo_move_first", "Move to Start of Tier (Loads Earliest)")} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "up")}
                                                className="group/qup relative h-9 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[16px]">{t("icon_keyboard_arrow_up", "keyboard_arrow_up")}</span>
                                                <span>{t("lo_btn_earlier_short", "Earlier")}</span>
                                                <HoverTooltip title={t("lo_move_earlier", "Load Earlier")} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "down")}
                                                className="group/qdn relative h-9 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[16px]">{t("icon_keyboard_arrow_down", "keyboard_arrow_down")}</span>
                                                <span>{t("lo_btn_later_short", "Later")}</span>
                                                <HoverTooltip title={t("lo_move_later", "Load Later (Higher Priority)")} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "bottom")}
                                                className="group/qbot relative h-9 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[16px]">{t("icon_vertical_align_bottom", "vertical_align_bottom")}</span>
                                                <span>{t("lo_btn_last_short", "Last")}</span>
                                                <HoverTooltip title={t("lo_move_last", "Move to End of Tier (Loads Latest / Wins)")} />
                                            </button>
                                        </div>
                                    </div>
                                </UniversalGroup>
                            )}

                            {/* RULE MODE: Add Load Rule & Load Order Rules (Hidden when configuring Priority Tiers or Reordering!) */}
                            {!isPriorityPickerMode && !isReorderMode && (
                                <>
                                    <UniversalGroup
                                        title={t("lo_add_rule", "Add Load Rule")}
                                        icon={t("icon_rule", "rule")}
                                    >
                                        <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 mb-1">
                                            {t("lo_rule_builder_desc", "Lock explicit load order dependencies between two {mods}.")}
                                        </p>
                                        <div className="flex flex-col gap-3">
                                            {!selectedItem && (
                                                <CustomDropdown
                                                    value={normalizedRuleModA}
                                                    onChange={(val: any) => {
                                                        const nextVal = Array.isArray(val) ? String(val[0] || "") : String(val || "");
                                                        setRuleModA(nextVal);
                                                        if (nextVal && normalizedRuleModB && nextVal.toLowerCase() === normalizedRuleModB.toLowerCase()) {
                                                            setRuleModB("");
                                                        }
                                                    }}
                                                    searchable={true}
                                                    disableTint={true}
                                                    buttonClassName="!bg-[color-mix(in_srgb,var(--text)_3%,transparent)] !bg-none border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_40%,transparent)] backdrop-blur-md"
                                                    options={[
                                                        { id: "", label: t("lo_select_mod_a", "Select {Mod} A...") },
                                                        ...sourceDropdownOptions,
                                                    ]}
                                                />
                                            )}

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setRuleDirection("after")}
                                                    className={`p-3 rounded-xl glass-surface border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                                                        ruleDirection === "after"
                                                            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]"
                                                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--text)]"
                                                    }`}
                                                >
                                                    <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined !text-[16px]">
                                                            {t("icon_vertical_align_bottom", "vertical_align_bottom")}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs font-black tracking-wide whitespace-normal leading-snug">
                                                        {t("lo_rule_must_load_after", "Must Load After (Wins)")}
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setRuleDirection("before")}
                                                    className={`p-3 rounded-xl glass-surface border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                                                        ruleDirection === "before"
                                                            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]"
                                                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--text)]"
                                                    }`}
                                                >
                                                    <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined !text-[16px]">
                                                            {t("icon_vertical_align_top", "vertical_align_top")}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs font-black tracking-wide whitespace-normal leading-snug">
                                                        {t("lo_rule_must_load_before", "Must Load Before (Yields)")}
                                                    </span>
                                                </button>
                                            </div>

                                            <CustomDropdown
                                                value={normalizedRuleModB}
                                                onChange={(val: any) => {
                                                    const nextVal = Array.isArray(val) ? String(val[0] || "") : String(val || "");
                                                    setRuleModB(nextVal);
                                                }}
                                                searchable={true}
                                                disableTint={true}
                                                buttonClassName="!bg-[color-mix(in_srgb,var(--text)_3%,transparent)] !bg-none border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_40%,transparent)] backdrop-blur-md"
                                                options={[
                                                    { id: "", label: t("lo_select_mod_b", "Select Target {Mod} B...") },
                                                    ...targetDropdownOptions,
                                                ]}
                                            />
                                            <ActionButton
                                                variant="accent"
                                                icon={t("icon_add", "add")}
                                                label={t("lo_add_rule", "Add Load Rule")}
                                                disabled={!normalizedRuleModA || !normalizedRuleModB || normalizedRuleModA.toLowerCase() === normalizedRuleModB.toLowerCase()}
                                                onClick={() => {
                                                    if (normalizedRuleModA && normalizedRuleModB && normalizedRuleModA.toLowerCase() !== normalizedRuleModB.toLowerCase()) {
                                                        addLoadOrderRule(scanScope, normalizedRuleModA, normalizedRuleModB, ruleDirection);
                                                        setRuleModB("");
                                                    }
                                                }}
                                                className="w-full"
                                            />
                                        </div>
                                    </UniversalGroup>

                                    <UniversalGroup
                                        title={t("load_order_rules", "Load Order Rules")}
                                        icon={t("icon_rule", "rule")}
                                    >
                                        {activeModRules.length === 0 ? (
                                            <div className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent flex items-center justify-center text-[var(--subtext)] shrink-0">
                                                    <span className="material-symbols-outlined !text-[18px]">{t("icon_rule", "rule")}</span>
                                                </div>
                                                <span className="text-xs font-bold text-[var(--subtext)] opacity-80">
                                                    {t("lo_no_rules_desc", "Add a load rule or pick a conflict winner to automatically lock load order dependencies.")}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2.5">
                                                {activeModRules.map((rule) => {
                                                    const nameA = stripKnownModExt(formatDisplayName(rule.modA, undefined, activeGameSchema));
                                                    const nameB = stripKnownModExt(formatDisplayName(rule.modB, undefined, activeGameSchema));
                                                    return (
                                                        <div
                                                            key={rule.id}
                                                            className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex flex-col gap-2.5"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className={VAULT_CHIP_CLASS}>
                                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                        {rule.type === "after"
                                                                            ? t("icon_vertical_align_bottom", "vertical_align_bottom")
                                                                            : t("icon_vertical_align_top", "vertical_align_top")}
                                                                    </span>
                                                                    <span>
                                                                        {rule.type === "after"
                                                                            ? t("lo_loads_after_wins", "Loads After (Wins)")
                                                                            : t("lo_loads_before_yields", "Loads Before (Yields)")}
                                                                    </span>
                                                                </span>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openModDossier(resolveVaultMod(rule.modA) || rule.modA)}
                                                                        className="group/rdos relative w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[var(--accent)] flex items-center justify-center transition-all"
                                                                    >
                                                                        <span className="material-symbols-outlined !text-[15px]">{t("icon_open_in_new", "open_in_new")}</span>
                                                                        <HoverTooltip title={t("btn_inspect", "Inspect {Mod}")} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => flipLoadOrderRule(scanScope, rule.id)}
                                                                        className="group/rflip relative w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[var(--accent)] flex items-center justify-center transition-all"
                                                                    >
                                                                        <span className="material-symbols-outlined !text-[15px]">{t("icon_swap_vert", "swap_vert")}</span>
                                                                        <HoverTooltip title={t("lo_flip_rule", "Invert Rule Direction")} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeLoadOrderRule(scanScope, rule.id)}
                                                                        className="group/rdel relative w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] flex items-center justify-center transition-all"
                                                                    >
                                                                        <span className="material-symbols-outlined !text-[15px]">{t("icon_close", "close")}</span>
                                                                        <HoverTooltip title={t("delete", "Delete")} variant="danger" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col gap-1.5">
                                                                <span className="text-xs font-black text-[var(--text)] break-words">
                                                                    {nameA}
                                                                </span>
                                                                <span className="text-xs font-bold text-[var(--subtext)] break-words">
                                                                    ➔ {nameB}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </UniversalGroup>
                                </>
                            )}
                        </div>
                    </SidePanel>
                );
            })()}

            {(() => {
                const strategyList = [
                    {
                        id: "folder_priority",
                        icon: t("icon_folder", "folder"),
                        label: t("lo_strategy_folder_agnostic", "Priority Override Tiers (Folder Depth)"),
                        shortLabel: t("lo_badge_folder_tiers", "Folder Tiers"),
                        desc: t("lo_strategy_folder_desc", "Uses priority override folders and packed directory depth"),
                        manifest: "Resource.cfg",
                        badge: t("lo_badge_resource_cfg", "Resource.cfg"),
                    },
                    {
                        id: "manifest_list",
                        icon: t("icon_description", "description"),
                        label: t("lo_strategy_manifest", "Manifest List (loadorder.txt)"),
                        shortLabel: t("lo_badge_loadorder_txt", "loadorder.txt"),
                        desc: t("lo_strategy_manifest_desc", "Writes an ordered plain-text manifest file on deployment"),
                        manifest: "loadorder.txt",
                        badge: t("lo_badge_loadorder_txt", "loadorder.txt"),
                    },
                    {
                        id: "numeric_prefix",
                        icon: t("icon_format_list_numbered", "format_list_numbered"),
                        label: t("lo_strategy_prefix", "Numeric Prefix (001_)"),
                        shortLabel: t("lo_badge_numeric_prefix", "001_<file>"),
                        desc: t("lo_strategy_prefix_desc", "Prefixes deployed filenames with their load sequence index"),
                        manifest: "loadorder.txt",
                        badge: t("lo_badge_numeric_prefix", "001_<file>"),
                    },
                    {
                        id: "timestamp",
                        icon: t("icon_schedule", "schedule"),
                        label: t("lo_strategy_timestamp", "Timestamp Order"),
                        shortLabel: t("lo_badge_mtime", "mtime"),
                        desc: t("lo_strategy_timestamp_desc", "Staggers file modification timestamps by load sequence"),
                        manifest: "Resource.cfg",
                        badge: t("lo_badge_mtime", "mtime"),
                    },
                ];
                const activeStrategyMeta =
                    strategyList.find((s) => s.id === compiledOrder.strategy) || strategyList[0];
                const activeClashTotal = fatalConflicts.length + tuningConflicts.length + cloneConflicts.length;
                const scopeOptions = (playSets || []).map((s: any) => {
                    const mCount = Array.isArray(s.mods) ? s.mods.length : 0;
                    return {
                        id: s.name,
                        label: `${s.name} • ${mCount} ${t("term_mods", "{Mods}")}`,
                    };
                });
                const activeScopeModCount = Array.isArray(activeBlueprintObj?.mods)
                    ? activeBlueprintObj.mods.length
                    : 0;

                return (
                    <SidePanel
                        isOpen={isSidePanelOpen}
                        onClose={() => setIsSidePanelOpen(false)}
                        title={t("radar_engine_title", "Radar & Load Order Engine")}
                        subtitle={t("schema_load_engine_desc", "Master Schema load order strategy for this game")}
                        icon={t("icon_tune", "tune")}
                        widthClass="w-[90vw] md:w-[680px]"
                        headerActions={
                            <PanelHeaderGroup>
                                <PanelHeaderButton
                                    icon={t("icon_track_changes", "track_changes")}
                                    tooltip={t("btn_sweep", "Scan {Blueprint}")}
                                    onClick={() => runRadar(scanScope)}
                                />
                            </PanelHeaderGroup>
                        }
                    >
                        <div className="flex flex-col gap-5 pb-8">
                            <SidePanelHeroCard
                                overline={t("radar_title", "Conflict Scanner")}
                                title={t("radar_engine_title", "Radar & Load Order Engine")}
                                description={t("schema_load_engine_desc", "Master Schema load order strategy for this game")}
                                badge={scanScope || t("btn_selected", "Selected")}
                                badgeIcon={t("icon_map", "map")}
                                icon={t("icon_tune", "tune")}
                                variant="accent"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full pt-1">
                                    <StatBox
                                        label={t("scan_scope", "Scan Scope")}
                                        value={scanScope || "-"}
                                        icon={t("icon_map", "map")}
                                        iconColorClass="text-[var(--accent)]"
                                    />
                                    <StatBox
                                        label={t("schema_load_engine", "Load Order Engine")}
                                        value={activeStrategyMeta.shortLabel}
                                        icon={t("icon_low_priority", "low_priority")}
                                        iconColorClass="text-[var(--accent)]"
                                    />
                                    <StatBox
                                        label={t("conflicts", "Conflicts")}
                                        value={activeClashTotal}
                                        icon={
                                            fatalConflicts.length > 0
                                                ? t("icon_error", "error")
                                                : activeClashTotal > 0
                                                ? t("icon_warning", "warning")
                                                : t("icon_verified", "verified")
                                        }
                                        iconColorClass={
                                            fatalConflicts.length > 0
                                                ? "text-[var(--danger)]"
                                                : activeClashTotal > 0
                                                ? "text-[var(--warning)]"
                                                : "text-[var(--success)]"
                                        }
                                    />
                                </div>
                            </SidePanelHeroCard>

                            {/* Compact & Searchable Scan Scope Selector (Scales cleanly to 100+ {Blueprints}) */}
                            <UniversalGroup
                                title={t("scan_scope", "Scan Scope")}
                                icon={t("icon_map", "map")}
                            >
                                <div className="flex flex-col gap-3">
                                    <CustomDropdown
                                        value={scanScope}
                                        onChange={(val: any) => {
                                            const nextScope = Array.isArray(val) ? String(val[0] || "") : String(val || "");
                                            if (nextScope) {
                                                setScanScope(nextScope);
                                                if (!hydrateCachedScope(nextScope, ignoredPairs)) {
                                                    runRadar(nextScope, { switchTab: false });
                                                }
                                            }
                                        }}
                                        searchable={true}
                                        disableTint={true}
                                        buttonClassName="!bg-[color-mix(in_srgb,var(--text)_3%,transparent)] !bg-none border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_40%,transparent)] backdrop-blur-md"
                                        options={scopeOptions}
                                    />

                                    {activeBlueprintObj && (
                                        <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] flex items-center justify-between gap-3 flex-wrap">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className="w-9 h-9 rounded-xl border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-transparent text-[var(--accent)] flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined !text-[18px]">
                                                        {t("icon_verified_user", "verified_user")}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col min-w-0 flex-1 gap-1">
                                                    <span className="text-xs font-black uppercase tracking-wider text-[var(--accent)] truncate">
                                                        {activeBlueprintObj.name}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={VAULT_CHIP_CLASS}>
                                                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                {t("icon_extension", "extension")}
                                                            </span>
                                                            <span>
                                                                {activeScopeModCount} {t("artifacts_linked", "{Mods} Linked")}
                                                            </span>
                                                        </span>
                                                        <span className={VAULT_CHIP_CLASS}>
                                                            <span
                                                                className={`material-symbols-outlined !text-[12px] ${
                                                                    activeClashTotal > 0 ? "text-[var(--warning)]" : "text-[var(--success)]"
                                                                }`}
                                                            >
                                                                {activeClashTotal > 0 ? t("icon_warning", "warning") : t("icon_verified", "verified")}
                                                            </span>
                                                            <span>
                                                                {activeClashTotal > 0
                                                                    ? `${activeClashTotal} ${t("conflicts", "Conflicts")}`
                                                                    : t("tier_clean", "Clean")}
                                                            </span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => runRadar(scanScope)}
                                                className="h-9 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] hover:text-[var(--accent)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                                            >
                                                <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                                                    {t("icon_track_changes", "track_changes")}
                                                </span>
                                                <span>{t("btn_sweep", "Scan {Blueprint}")}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </UniversalGroup>

                            {/* Master Schema Load Order Engine Configurator */}
                            <UniversalGroup
                                title={t("schema_load_engine", "Load Order Engine")}
                                icon={t("icon_low_priority", "low_priority")}
                            >
                                <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80">
                                    {t("schema_load_engine_desc", "Master Schema load order strategy for this game")}
                                </p>

                                <div className="flex flex-col gap-2.5">
                                    {strategyList.map((strat) => {
                                        const isActive = compiledOrder.strategy === strat.id;
                                        return (
                                            <button
                                                key={strat.id}
                                                type="button"
                                                onClick={() =>
                                                    updateSchemaLoadOrderEngine({
                                                        strategy: strat.id,
                                                        manifest_file: strat.manifest,
                                                    })
                                                }
                                                className={`p-4 rounded-2xl glass-surface text-left transition-all border flex items-center justify-between gap-3.5 group ${
                                                    isActive
                                                        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.12)]"
                                                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                                                }`}
                                            >
                                                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                                                    <div
                                                        className={`w-10 h-10 rounded-xl border bg-transparent flex items-center justify-center shrink-0 transition-colors ${
                                                            isActive
                                                                ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                                                                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] group-hover:text-[var(--accent)]"
                                                        }`}
                                                    >
                                                        <span className="material-symbols-outlined !text-[20px]">{strat.icon}</span>
                                                    </div>
                                                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                        <span className={`text-xs font-black tracking-wider uppercase whitespace-normal leading-snug ${isActive ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                                                            {strat.label}
                                                        </span>
                                                        <span className="text-[11px] font-medium text-[var(--subtext)] opacity-85 whitespace-normal leading-snug">
                                                            {strat.desc}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className={`${VAULT_CHIP_CLASS} font-mono shrink-0`}>
                                                    <span
                                                        className={`material-symbols-outlined !text-[12px] ${
                                                            isActive ? "text-[var(--success)]" : "text-[var(--subtext)]"
                                                        }`}
                                                    >
                                                        {isActive ? t("icon_verified", "verified") : strat.icon}
                                                    </span>
                                                    <span>{strat.badge}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </UniversalGroup>
                        </div>
                    </SidePanel>
                );
            })()}
            {pointerDragGhost &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        style={{
                            left: `${pointerDragGhost.x + 16}px`,
                            top: `${pointerDragGhost.y + 16}px`,
                            zIndex: 2147483646,
                        }}
                        className="fixed pointer-events-none glass-panel rounded-2xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.28))] bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur-xl shadow-lg flex items-center gap-2.5 max-w-[340px]"
                    >
                        <div className="w-7 h-7 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_drag_indicator", "drag_indicator")}
                            </span>
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-xs font-black text-[var(--text)] truncate">
                                {pointerDragGhost.label}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-85 uppercase tracking-wider truncate">
                                {t("lo_reorder_tier", "Reorder Load Order")}
                            </span>
                        </div>
                        <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                            <span>→ #{String((pointerDragGhost.targetIdx ?? 0) + 1).padStart(2, "0")}</span>
                        </span>
                    </div>,
                    document.body
                )}
        </>
    );
};







