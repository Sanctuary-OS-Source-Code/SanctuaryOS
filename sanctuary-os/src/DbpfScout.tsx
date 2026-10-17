import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { ViewHeader, CustomDropdown, HoverTooltip, EmptyState, SidePanel, SidebarActionButton, ActionButton, HoverTabDrawer, VerticalTabButton, DashboardStatTile, ActionPill, PillTabs, PillTabButton, GlassSegmentedControl, PanelHeaderGroup, PanelHeaderButton } from "./shared";
import { getExtensionRegex, formatDisplayName, getFileLabel } from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";
import { UniversalGroup } from "./components/layouts/ElevatedHubLayout";
import { useLexicon } from "./LexiconContext";
import { usePlaySetLogic, compileLoadOrder, LoadOrderRule } from "./hooks/usePlaySetLogic";
import { useStore } from "./store";
import ConflictCard from "./ConflictCard";
import ConflictResolutionSidebar from "./side-panels/ConflictResolutionSidebar";
import UndoWinnersPanel from "./side-panels/UndoWinnersPanel";
import { CommandScreenLayout, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, CommandScreenQuickLink, CommandScreenStats, CommandScreenSectionHeading, StatTileCarousel } from "./hub-components/SharedCommandScreenLayout";

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

    const { playSets, setPlaySets, activePlaySetIndex, activeGameSchema, setActiveGameSchema, modList, setStatus } = useStore();
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
    const [visibleLoadOrder, setVisibleLoadOrder] = useState(48);
    const [activeTab, setActiveTab] = useState<string>("COMMAND");
    const [overrideTab, setOverrideTab] = useState<"ACTIVE" | "IGNORED" | "ALL">("ALL");
    const [conflictSearch, setConflictSearch] = useState("");
    const [overrideSearch, setOverrideSearch] = useState("");
    const [loadOrderSearch, setLoadOrderSearch] = useState("");
    const [blueprintSearch, setBlueprintSearch] = useState("");
    const [activeConflictSeverity, setActiveConflictSeverity] = useState<number | null>(null);
    const [activeOverrideSeverity, setActiveOverrideSeverity] = useState<number | null>(null);

    // Load Order Rule Builder & Filter state
    const [ruleModA, setRuleModA] = useState<string>("");
    const [ruleModB, setRuleModB] = useState<string>("");
    const [ruleDirection, setRuleDirection] = useState<"after" | "before">("after");
    const [loadOrderSubFilter, setLoadOrderSubFilter] = useState<"ALL" | "CUSTOM" | "RULES" | "OVERRIDES">("ALL");

    useEffect(() => {
        setVisibleLoadOrder(48);
    }, [loadOrderSearch, loadOrderSubFilter, scanScope]);

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
    const elevatedModsCount = useMemo(
        () => compiledOrder.items.filter((it) => !!it.tierFolder).length,
        [compiledOrder.items]
    );
    const customLoadOrderCount = activeBlueprintRules.length + elevatedModsCount;

    const ruleLinkedSet = useMemo(() => {
        const set = new Set<string>();
        for (const r of activeBlueprintRules) {
            if (r.modA) set.add(r.modA.toLowerCase());
            if (r.modB) set.add(r.modB.toLowerCase());
        }
        return set;
    }, [activeBlueprintRules]);

    const filteredQueue = useMemo(() => {
        const q = loadOrderSearch ? loadOrderSearch.toLowerCase() : "";
        return compiledOrder.items.filter((it) => {
            const keyLower = it.cleanName.toLowerCase();
            const hasRule = ruleLinkedSet.has(keyLower) || it.autoPromoted;
            if (loadOrderSubFilter === "OVERRIDES" && !it.tierFolder) return false;
            if (loadOrderSubFilter === "CUSTOM" && !it.tierFolder && !hasRule) return false;
            if (!q) return true;
            return (
                keyLower.includes(q) ||
                it.displayName.toLowerCase().includes(q) ||
                (it.tierFolder && it.tierFolder.toLowerCase().includes(q))
            );
        });
    }, [compiledOrder.items, ruleLinkedSet, loadOrderSubFilter, loadOrderSearch]);

    const openLoadOrderInspector = (modCleanName?: string) => {
        const clean = modCleanName || "";
        setSelectedLoadOrderMod(clean);
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
            await invoke("set_active_game_schema", { schema: nextSchema });
            setStatus(`${t("icon_check_circle")} ${t("schema_load_engine", "Load Order Engine")}: ${nextLoadOrder.strategy}`);
        } catch (e) {
            console.error("Failed to sync schema load order engine:", e);
        }
    };

    useEffect(() => {
        if (hasScanned) {
            try {
                localStorage.setItem(`radar_stats_${scanScope}`, JSON.stringify({ fatal: fatalConflicts.length, tuning: tuningConflicts.length, clone: cloneConflicts.length, soft: softConflicts.length }));
            } catch (e) { }
        }
    }, [fatalConflicts, tuningConflicts, cloneConflicts, softConflicts, hasScanned, scanScope]);

    const [selectedForVault, setSelectedForVault] = useState<string[]>([]);
    const [resolvingScript, setResolvingScript] = useState<string | null>(null);
    const [confirmMassVault, setConfirmMassVault] = useState(false);
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [activeConflictRes, setActiveConflictRes] = useState<any>(null);

    const runRadar = async (targetScope?: string) => {
        setIsSidePanelOpen(false);
        setLoading(true);
        setError(null);
        setHasScanned(false);
        setSelectedForVault([]);
        setResolvingScript(null);
        setConfirmMassVault(false);
        setStats({ packages: 0, totalClashes: 0 });
        setFatalConflicts([]);
        setTuningConflicts([]);
        setCloneConflicts([]);
        setSoftConflicts([]);
        setVisibleFatal(50);
        setVisibleTuning(50);
        setVisibleClone(50);
        setVisibleSoft(50);
        try {
            const config: any = await invoke("get_saved_coordinates");
            let targetPath = `${config.vault_path}/Mods`;
            let targetFiles: string[] | null = null;

            const scopeToUse = targetScope || scanScope || (playSets.length > 0 ? playSets[0].name : "");
            const set = playSets.find((s: any) => s.name === scopeToUse);
            if (set) {
                targetFiles = set.mods.map((m: any) => typeof m === 'string' ? m : (m.name || m.path || '')).filter(Boolean);
            }

            const report = await invoke<any>("run_conflict_radar", { modsPath: targetPath, targetFiles });

            let actionableClashes = 0;
            const fatal: any[] = [];
            const tuning: any[] = [];
            const clone: any[] = [];
            const soft: any[] = [];

            report.conflicts.forEach((c: any) => {
                if (ignoredPairs.includes(c.mod_pair)) return;

                const parts = c.mod_pair.split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
                const modA = parts[0];
                const modB = parts.length > 1 ? parts[1] : "Unknown Overlap";
                const enrichedConflict = { ...c, modA, modB };

                if (isCloneConflict(modA, modB)) { clone.push(enrichedConflict); actionableClashes++; }
                else if (c.severity_rank == 4) { fatal.push(enrichedConflict); actionableClashes++; }
                else if (c.severity_rank == 3) { tuning.push(enrichedConflict); actionableClashes++; }
                else { soft.push(enrichedConflict); }
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
                            if (!ignoredPairs.includes(ghostPair)) {
                                actionableClashes++;
                                const ghostConflict = { mod_pair: ghostPair, modA: actualA, modB: actualB, is_ghost: true, resolution_note: hit.resolution_note, severity_rank: hit.severity_rank };
                                if (Number(hit.severity_rank) === 4) fatal.push(ghostConflict);
                                else if (Number(hit.severity_rank) === 3) tuning.push(ghostConflict);
                            }
                        }
                    });
                }
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
        setActiveTab("CONFLICTS");
    };

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

    const resetIgnored = () => {
        setIgnoredPairs([]);
        localStorage.removeItem("sanctuary_ignored_conflicts");
        if (hasScanned) runRadar();
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
                        (r: LoadOrderRule) => r.modA.toLowerCase() !== cleanWinnerFile.toLowerCase()
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

    return (
        <>
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
                <div className="absolute top-1/4 left-1/4 w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] blur-[150px] rounded-full" />
                <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] blur-[150px] rounded-full" />
            </div>

            <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full relative z-10">
                <ViewHeader
                    title={t("radar_title")}
                    subtitle={t("radar_subtitle")}
                    icon="crisis_alert"
                    iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                    breadcrumb={
                        activeTab !== "COMMAND"
                            ? activeTab === "LOAD_ORDER"
                                ? t("tab_load_order", "Load Order")
                                : (t(`tab_${activeTab.toLowerCase()}`) || activeTab)
                            : undefined
                    }
                    onTitleClick={() => setActiveTab("COMMAND")}
                >
                    <div className="flex items-center gap-3 flex-wrap justify-end w-full">
                        {activeTab === "COMMAND" && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                                <ActionPill
                                    hideSearch={true}
                                    searchQuery=""
                                    setSearchQuery={() => {}}
                                    rightContent={
                                        <div className="flex items-center h-full px-1">
                                            <button onClick={() => setIsSidePanelOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)]">
                                                <span className="material-symbols-outlined !text-[20px]">tune</span>
                                            </button>
                                        </div>
                                    }
                                />
                            </div>
                        )}
                        {activeTab === "CONFLICTS" && (
                            <div className="w-full max-w-md animate-in fade-in slide-in-from-right-4 duration-500">
                                <ActionPill
                                    searchQuery={conflictSearch}
                                    setSearchQuery={setConflictSearch}
                                    searchPlaceholder={t("search_ph") as string}
                                    rightContent={
                                        <div className="flex items-center border-l border-[color-mix(in_srgb,var(--text)_6%,transparent)] pl-2 h-full pr-2">
                                            <button onClick={() => setIsSidePanelOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)]">
                                                <span className="material-symbols-outlined !text-[20px]">tune</span>
                                            </button>
                                        </div>
                                    }
                                />
                            </div>
                        )}
                        {activeTab === "OVERRIDES" && (
                            <div className="w-full max-w-md animate-in fade-in slide-in-from-right-4 duration-500">
                                <ActionPill
                                    searchQuery={overrideSearch}
                                    setSearchQuery={setOverrideSearch}
                                    searchPlaceholder={t("search_ph") as string}
                                    rightContent={
                                        <div className="flex items-center border-l border-[color-mix(in_srgb,var(--text)_6%,transparent)] pl-2 h-full pr-2">
                                            <button onClick={() => setIsSidePanelOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)]">
                                                <span className="material-symbols-outlined !text-[20px]">tune</span>
                                            </button>
                                        </div>
                                    }
                                />
                            </div>
                        )}
                        {activeTab === "LOAD_ORDER" && (
                            <div className="w-full max-w-xl animate-in fade-in slide-in-from-right-4 duration-500">
                                <ActionPill
                                    searchQuery={loadOrderSearch}
                                    setSearchQuery={setLoadOrderSearch}
                                    searchPlaceholder={t("search_ph") as string}
                                    actions={[
                                        {
                                            id: "add_load_rule",
                                            icon: "add",
                                            label: t("lo_add_rule", "Add Load Rule"),
                                            onClick: () => openLoadOrderInspector(""),
                                            activeClassName: "text-[var(--accent)]",
                                        },
                                        {
                                            id: "auto_sort_queue",
                                            icon: t("icon_swap_vert", "swap_vert"),
                                            label: t("lo_auto_sort", "Auto-Sort Queue"),
                                            onClick: () => autoSortBlueprintLoadOrder(scanScope),
                                        },
                                    ]}
                                    rightContent={
                                        <div className="flex items-center border-l border-[color-mix(in_srgb,var(--text)_6%,transparent)] pl-2 h-full pr-2">
                                            <button onClick={() => setIsSidePanelOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)]">
                                                <span className="material-symbols-outlined !text-[20px]">tune</span>
                                            </button>
                                        </div>
                                    }
                                />
                            </div>
                        )}
                    </div>
                </ViewHeader>
                <div className="md:hidden">
                    <HoverTabDrawer title={t("radar_title")} activeTab={activeTab} setTab={setActiveTab}>
                        <VerticalTabButton id="COMMAND" icon="dashboard" label={t("overview")} activeTab={activeTab} setTab={setActiveTab} />
                        <VerticalTabButton
                            id="CONFLICTS"
                            icon="warning"
                            label={t("conflicts")}
                            activeTab={activeTab}
                            setTab={setActiveTab}
                            badge={(fatalConflicts.length + tuningConflicts.length) > 0 ? (fatalConflicts.length + tuningConflicts.length) : null}
                            activeColorClass={fatalConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] shadow-md' : tuningConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] shadow-md' : undefined}
                            inactiveColorClass={fatalConflicts.length > 0 ? 'text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-80 hover:opacity-100' : tuningConflicts.length > 0 ? 'text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-80 hover:opacity-100' : undefined}
                            badgeColorClass={fatalConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]' : tuningConflicts.length > 0 ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)]' : undefined}
                        />
                        <VerticalTabButton id="OVERRIDES" icon="rule" label={t("overrides")} activeTab={activeTab} setTab={setActiveTab} badge={ignoredPairs.length > 0 ? ignoredPairs.length : null} />
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

                <div className="hidden md:flex flex-col w-full gap-3 mb-6">
                    <StatTileCarousel>
                        <DashboardStatTile variant="tab" icon="dashboard" label={t("overview")} number={scanScope || ""} onClick={() => setActiveTab("COMMAND")} isActive={activeTab === "COMMAND"} />
                        <DashboardStatTile variant="tab"
                            icon="warning"
                            label={t("conflicts")}
                            number={(fatalConflicts.length + tuningConflicts.length) > 0 ? (fatalConflicts.length + tuningConflicts.length) : 0}
                            colorClass={fatalConflicts.length > 0 ? 'text-[var(--danger)]' : tuningConflicts.length > 0 ? 'text-[var(--warning)]' : undefined}
                            onClick={() => setActiveTab("CONFLICTS")}
                            isActive={activeTab === "CONFLICTS"}
                        />
                        <DashboardStatTile variant="tab" icon="rule" label={t("overrides")} number={ignoredPairs.length} onClick={() => setActiveTab("OVERRIDES")} isActive={activeTab === "OVERRIDES"} />
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

                                    <div className="flex flex-col gap-6 w-full">
                                        <CommandScreenSectionHeading
                                            title={t("select_blueprint")}
                                            icon="map"
                                            rightContent={
                                                <div className="w-full">
                                                    <ActionPill
                                                        searchQuery={blueprintSearch}
                                                        setSearchQuery={setBlueprintSearch}
                                                        searchPlaceholder={t("search_blueprints") as string}
                                                    />
                                                </div>
                                            }
                                        />
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                            {playSets.filter((bp: any) => !blueprintSearch || bp.name.toLowerCase().includes(blueprintSearch.toLowerCase())).map((blueprint: any) => {
                                                return (
                                                    <div
                                                        key={blueprint.name}
                                                        onClick={() => { setScanScope(blueprint.name); runRadar(blueprint.name); }}
                                                        className={`flex flex-col items-start gap-4 p-6 rounded-3xl glass-panel border transition-all text-left group/btn cursor-pointer animate-in slide-in-from-bottom-2 duration-500 fill-mode-both shadow-[0_20px_50px_rgba(0,0,0,0.15)] hover:shadow-[0_30px_60px_rgba(var(--accent-rgb),0.1)] min-h-[10rem] relative ${scanScope === blueprint.name ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)] shadow-[0_20px_50px_rgba(var(--success-rgb),0.1)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]'}`}
                                                    >
                                                        <div className={`absolute inset-0 rounded-[inherit] bg-gradient-to-br transition-opacity duration-500 opacity-0 group-hover/btn:opacity-100 pointer-events-none ${scanScope === blueprint.name ? 'from-[color-mix(in_srgb,var(--success)_15%,transparent)] to-transparent' : 'from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent'}`} />

                                                        <div className="flex flex-row items-start justify-between w-full gap-4 relative z-10">
                                                            <span className={`text-2xl font-black tracking-tighter transition-colors drop-shadow-md flex-1 ${scanScope === blueprint.name ? 'text-[var(--text)]' : 'text-[var(--text)] group-hover/btn:text-[var(--accent)]'}`} style={{ wordBreak: "break-word" }}>{blueprint.name}</span>
                                                        </div>

                                                        <div className="flex items-center justify-between w-full mt-auto relative z-10 pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] group-hover/btn:border-[color-mix(in_srgb,var(--accent)_20%,transparent)]">
                                                            <div className="flex items-center gap-2">
                                                                <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)]">inventory_2</span>
                                                                <span className="text-[10px] font-black text-[var(--subtext)] opacity-80 capitalize tracking-widest">{blueprint.mods ? blueprint.mods.length : 0} {t("items")}</span>
                                                            </div>
                                                            {scanScope === blueprint.name && (
                                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_40%,transparent)] rounded-lg shrink-0 shadow-sm shadow-[0_0_15px_rgba(var(--success-rgb),0.2)]">
                                                                    <span className="material-symbols-outlined !text-[14px] text-[var(--success)] drop-shadow-md">track_changes</span>
                                                                    <span className="text-[9px] font-black capitalize tracking-[0.2em] text-[var(--success)]">{t("btn_selected") || "Selected"}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </CommandScreenMain>

                                <CommandScreenSidebar title={t("quick_actions")} icon="bolt">
                                    <CommandScreenQuickLink
                                        icon="warning"
                                        title={t("total_conflicts") || "Total Conflicts"}
                                        subtitle={`${fatalConflicts.length + tuningConflicts.length + cloneConflicts.length + softConflicts.length} ${t("conflicts")}`}
                                        onClick={() => setActiveTab("CONFLICTS")}
                                        textColorClass={(fatalConflicts.length + tuningConflicts.length) > 0 ? "text-[var(--warning)]" : "text-[var(--text)]"}
                                        hoverTextColorClass="group-hover:text-[var(--warning)]"
                                        iconShadowClass="drop-shadow-md"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon="rule"
                                        title={t("total_overrides") || "Total Overrides"}
                                        subtitle={`${totalOverridesCount} ${t("overrides")}`}
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
                                        title={t("total_ignores") || "Total Ignored"}
                                        subtitle={`${ignoredPairs.length} ${t("ignored")}`}
                                        onClick={() => { setActiveTab("OVERRIDES"); setOverrideTab("IGNORED"); }}
                                        textColorClass="text-[var(--subtext)]"
                                        hoverTextColorClass="group-hover:text-[var(--text)]"
                                        iconShadowClass="drop-shadow-md text-[var(--subtext)]"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon={loading ? "sync" : "track_changes"}
                                        title={t("btn_sweep")}
                                        subtitle={t("analyze_blueprint_desc")}
                                        onClick={runRadar}
                                        dotColorClass="bg-[var(--accent)] shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]"
                                        textColorClass="text-[var(--accent)]"
                                        hoverTextColorClass="group-hover:text-[var(--accent)]"
                                        iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon="undo"
                                        title={t("revert")}
                                        subtitle={t("undo_overrides_desc")}
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
                            {hasScanned && (
                                <StatTileCarousel>
                                    <DashboardStatTile variant="filter"
                                        label={t("total_severity_4") || "Severity 4"}
                                        number={fatalConflicts.length.toString()}
                                        icon={<span className="material-symbols-outlined">crisis_alert</span>}
                                        colorClass="text-[var(--danger)]"
                                        isActive={activeConflictSeverity === 4}
                                        className="cursor-pointer min-w-[200px] shrink-0"
                                        onClick={() => setActiveConflictSeverity(activeConflictSeverity === 4 ? null : 4)}
                                    />
                                    <DashboardStatTile variant="filter"
                                        label={t("total_severity_3") || "Severity 3"}
                                        number={tuningConflicts.length.toString()}
                                        icon={<span className="material-symbols-outlined">tune</span>}
                                        colorClass="text-[var(--warning)]"
                                        isActive={activeConflictSeverity === 3}
                                        className="cursor-pointer min-w-[200px] shrink-0"
                                        onClick={() => setActiveConflictSeverity(activeConflictSeverity === 3 ? null : 3)}
                                    />
                                    <DashboardStatTile variant="filter"
                                        label={t("total_clones") || "Total Clones"}
                                        number={cloneConflicts.length.toString()}
                                        icon={<span className="material-symbols-outlined">content_copy</span>}
                                        colorClass="text-[var(--accent)]"
                                        isActive={activeConflictSeverity === 2}
                                        className="cursor-pointer min-w-[200px] shrink-0"
                                        onClick={() => setActiveConflictSeverity(activeConflictSeverity === 2 ? null : 2)}
                                    />
                                    <DashboardStatTile variant="filter"
                                        label={t("total_soft") || "Total Soft"}
                                        number={softConflicts.length.toString()}
                                        icon={<span className="material-symbols-outlined">info</span>}
                                        colorClass="text-blue-400"
                                        isActive={activeConflictSeverity === 1}
                                        className="cursor-pointer min-w-[200px] shrink-0"
                                        onClick={() => setActiveConflictSeverity(activeConflictSeverity === 1 ? null : 1)}
                                    />
                                </StatTileCarousel>
                            )}
                            <CommandScreenBody>
                                <CommandScreenMain>
                                    <div className="flex flex-col gap-6 w-full">

                                        {!hasScanned && !loading && !error && (
                                            <div className="w-full flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in zoom-in-95 duration-1000 relative z-10 my-auto min-h-[calc(100vh-300px)]">
                                                <div className="w-56 h-56 rounded-full border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shadow-md flex items-center justify-center relative group cursor-pointer" onClick={() => runRadar()}>
                                                    <div className="absolute inset-0 rounded-[inherit]  border-[2px] border-dashed border-[var(--accent)] opacity-20 animate-[spin_20s_linear_infinite]" />
                                                    <div className="absolute inset-4 rounded-full border border-[var(--text)] opacity-10 animate-[spin_15s_linear_infinite_reverse]" />
                                                    <div className="absolute inset-10 rounded-full border-[2px] border-dotted border-[var(--warning)] opacity-10 animate-[spin_25s_linear_infinite]" />
                                                    <span className="material-symbols-outlined !text-[80px] text-[var(--accent)] opacity-80 group-hover:scale-110 group-hover:opacity-100 transition-all duration-500 drop-shadow-md">
                                                        {t("icon_track_changes")}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col items-center gap-6 relative z-10 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
                                                    <div className="text-center space-y-2 mb-4">
                                                        <h2 className="text-2xl font-black capitalize tracking-widest text-white/90">
                                                            {t("landing_title")}
                                                        </h2>
                                                        <p className="text-sm font-medium leading-relaxed text-[var(--subtext)] opacity-80 max-w-lg">
                                                            {t("landing_desc")}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {loading && (
                                            <div className="w-full flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in zoom-in-95 duration-1000 relative z-10 my-auto min-h-[calc(100vh-300px)]">
                                                <div className="w-56 h-56 rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] shadow-md flex items-center justify-center relative group">
                                                    <div className="absolute inset-0 rounded-[inherit]  border-[2px] border-dashed border-[var(--accent)] opacity-80 animate-[spin_3s_linear_infinite]" />
                                                    <div className="absolute inset-4 rounded-full border-[4px] border-solid border-transparent border-t-[var(--accent)] opacity-60 animate-[spin_1s_linear_infinite_reverse]" />
                                                    <div className="absolute inset-8 rounded-full border-[2px] border-dotted border-[var(--warning)] opacity-40 animate-[spin_5s_linear_infinite]" />
                                                    <span className="material-symbols-outlined !text-[80px] text-[var(--accent)] animate-pulse drop-shadow-md">
                                                        {t("icon_track_changes")}
                                                    </span>
                                                </div>
                                                <div className="space-y-4 max-w-xl relative z-10">
                                                    <h2 className="text-4xl font-black text-[var(--accent)] capitalize tracking-tighter drop-shadow-lg animate-pulse">
                                                        {t("scanning_title")}
                                                    </h2>
                                                    <p className="text-sm font-medium leading-relaxed text-[var(--subtext)] opacity-80">
                                                        {t("scanning_desc")}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {hasScanned && stats.totalClashes === 0 && !loading && (
                                            <div className="py-24 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in-95 duration-700 relative">
                                                <div className="absolute inset-0 rounded-[inherit] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] blur-[100px]  pointer-events-none" />
                                                <div className="relative">
                                                    <div className="w-32 h-32 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] shadow-md flex items-center justify-center relative backdrop-blur-md">
                                                        <div className="absolute inset-0 rounded-[inherit]  border-[2px] border-dashed border-[color-mix(in_srgb,var(--success)_50%,transparent)] animate-[spin_10s_linear_infinite]" />
                                                        <div className="absolute inset-2 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] animate-[spin_15s_linear_infinite_reverse]" />
                                                        <span className="material-symbols-outlined !text-[64px] text-[var(--success)] animate-pulse drop-shadow-md">
                                                            {t("icon_check")}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="relative z-10 max-w-lg">
                                                    <h2 className="text-4xl font-black text-[var(--success)] capitalize tracking-tighter mb-4 drop-shadow-md">
                                                        {t("clear_title")}
                                                    </h2>
                                                    <p className="text-xs font-bold leading-relaxed capitalize tracking-[0.2em] text-[var(--subtext)] opacity-90 border-t border-[color-mix(in_srgb,var(--success)_20%,transparent)] pt-4">
                                                        {t("clear_desc")}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {hasScanned && filteredFatal.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 4) && (
                                            <section className="space-y-6">
                                                <div className="flex items-center justify-start pb-4 mb-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
                                                            <span className="material-symbols-outlined !text-2xl theme-text-danger drop-shadow-[0_0_8px_rgba(var(--danger-rgb),0.5)]">{t("icon_warning_amber")}</span>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <h2 className="text-2xl font-black theme-text-danger capitalize tracking-tighter italic drop-shadow-md">{t("tier4_title")}</h2>
                                                            <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 capitalize tracking-widest">{t("tier4_desc")}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                                                    {filteredFatal.slice(0, visibleFatal).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={4} onClick={() => setActiveConflictRes(c)} />
                                                    ))}
                                                </div>
                                                {fatalConflicts.length > visibleFatal && (
                                                    <div className="flex justify-center mt-8">
                                                        <button onClick={() => setVisibleFatal(v => v + 100)} className="px-6 py-3 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-xl">
                                                            {t("nav_load_more")} ({fatalConflicts.length - visibleFatal})
                                                        </button>
                                                    </div>
                                                )}
                                            </section>
                                        )}

                                        {hasScanned && filteredTuning.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 3) && (
                                            <section className="space-y-6 mt-12">
                                                <div className="flex items-center justify-start pb-4 mb-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]">
                                                            <span className="material-symbols-outlined !text-2xl theme-text-warning drop-shadow-[0_0_8px_rgba(var(--warning-rgb),0.5)]">{t("icon_tune")}</span>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <h2 className="text-2xl font-black theme-text-warning capitalize tracking-tighter italic drop-shadow-md">{t("tier3_title")}</h2>
                                                            <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 capitalize tracking-widest">{t("tier3_desc")}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                                                    {filteredTuning.slice(0, visibleTuning).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={3} onClick={() => setActiveConflictRes(c)} />
                                                    ))}
                                                </div>
                                                {tuningConflicts.length > visibleTuning && (
                                                    <div className="flex justify-center mt-8">
                                                        <button onClick={() => setVisibleTuning(v => v + 100)} className="px-6 py-3 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-xl">
                                                            {t("nav_load_more")} ({tuningConflicts.length - visibleTuning})
                                                        </button>
                                                    </div>
                                                )}
                                            </section>
                                        )}

                                        {hasScanned && filteredClone.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 2) && (
                                            <section className="space-y-6 mt-12">
                                                <div className="flex flex-col lg:flex-row justify-start items-start lg:items-end gap-6 pb-4 mb-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]">
                                                            <span className="material-symbols-outlined lowercase !text-2xl theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("icon_all_inclusive")}</span>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <h2 className="text-2xl font-black theme-text-accent capitalize tracking-tighter italic drop-shadow-md">{t("duplicate_clones")}</h2>
                                                            <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 capitalize tracking-widest">{t("identical_assets")}</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        {isBulkMode && (
                                                            <>
                                                                <button onClick={targetHq} className="h-[42px] px-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black capitalize tracking-widest transition-all">
                                                                    {t("btn_select_hq")}
                                                                </button>
                                                                <button onClick={targetNonHq} className="h-[42px] px-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-black capitalize tracking-widest transition-all">
                                                                    {t("btn_select_nonhq")}
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
                                                            {isBulkMode ? (selectedForVault.length > 0 ? `${t("purge")} (${selectedForVault.length})` : t("btn_cancel_selection")) : "✓ " + (t("btn_select_assets"))}
                                                        </button>
                                                    </div>
                                                </div>

                                                {confirmMassVault && (
                                                    <div className="animate-in slide-in-from-top-2 p-6 glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl flex flex-col md:flex-row gap-6 items-center justify-start shadow-xl mb-6">
                                                        <p className="text-sm font-black theme-text-danger capitalize tracking-widest">
                                                            {t("secure_quarantine") || `Yeet ${selectedForVault.length} duplicates to the Vault?`}
                                                        </p>
                                                        <div className="flex gap-4">
                                                            <button onClick={executeMassVault} className="px-8 py-3 bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] transition-all text-[10px] tracking-widest font-black rounded-xl">
                                                                {t("confirm_purge")}
                                                            </button>
                                                            <button onClick={() => setConfirmMassVault(false)} className="px-8 py-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all text-[10px] tracking-widest font-black rounded-xl">
                                                                {t("nav_cancel")}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                                                    {filteredClone.slice(0, visibleClone).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={2} isSelectedA={selectedForVault.includes(c.modA)} isSelectedB={selectedForVault.includes(c.modB)} onKeepA={() => toggleTarget(c.modA, c.modB)} onKeepB={() => toggleTarget(c.modB, c.modA)} onClick={() => setActiveConflictRes(c)} />
                                                    ))}
                                                </div>
                                                {cloneConflicts.length > visibleClone && (
                                                    <div className="flex justify-center mt-8">
                                                        <button onClick={() => setVisibleClone(v => v + 100)} className="px-6 py-3 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-xl">
                                                            {t("nav_load_more")} ({cloneConflicts.length - visibleClone})
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
                                                            <span className="material-symbols-outlined !text-xl">{t("icon_info")}</span> {t("tier1_title").replace("{count}", String(softConflicts.length))}
                                                        </h3>
                                                        <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center text-[var(--subtext)] opacity-60 group-open:rotate-180 transition-transform shrink-0">
                                                            <span className="material-symbols-outlined !text-[20px]">{t("icon_expand_more")}</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-[9px] font-bold text-gray-600 capitalize tracking-widest ml-9">{t("safe_textures")}</p>
                                                </summary>
                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 pt-6 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] mt-4">
                                                    {filteredSoft.slice(0, visibleSoft).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={1} onClick={() => setActiveConflictRes(c)} onIgnore={() => ignoreConflict(c.mod_pair)} />
                                                    ))}
                                                </div>
                                                {softConflicts.length > visibleSoft && (
                                                    <div className="flex justify-center mt-6">
                                                        <button onClick={() => setVisibleSoft(v => v + 100)} className="px-6 py-3 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-xl">
                                                            {t("nav_load_more")} ({softConflicts.length - visibleSoft})
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
                            .filter((m: any) => hasPriorityPrefix(typeof m === 'string' ? m : (m.name || m.path || '')))
                            .map((m: any) => typeof m === 'string' ? m : (m.name || m.path || ''));

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
                                    isManual: false
                                };
                            }
                            return null;
                        }).filter(Boolean) as any[];

                        const manualOverridesOnly = manualOverrides.filter((m: string) => {
                            const cleanName = stripPriorityPrefix(m).toLowerCase();
                            return !resolvedOverrides.some(res => stripPriorityPrefix(res.winnerPath).toLowerCase().endsWith(cleanName));
                        }).map((m: string) => ({
                            pair: m,
                            winnerPath: m,
                            loserPath: t("unknown_file"),
                            isManual: true
                        }));

                        const allActiveOverrides = [...resolvedOverrides, ...manualOverridesOnly].filter(o => !overrideSearch || o.winnerPath.toLowerCase().includes(overrideSearch.toLowerCase()));
                        const trueIgnoredPairs = ignoredPairs.filter((pair: string) => !resolvedOverrides.some(res => res.pair === pair));

                        return (
                            <CommandScreenLayout>
                                {hasScanned && (
                                    <StatTileCarousel>
                                        <DashboardStatTile variant="filter"
                                            label={t("active_overrides") || "Active Overrides"}
                                            number={allActiveOverrides.length.toString()}
                                            icon={<span className="material-symbols-outlined">verified</span>}
                                            colorClass="text-[var(--accent)]"
                                            isActive={overrideTab === "ACTIVE"}
                                            className="cursor-pointer min-w-[200px] shrink-0"
                                            onClick={() => setOverrideTab(overrideTab === "ACTIVE" ? "ALL" : "ACTIVE")}
                                        />
                                        <DashboardStatTile variant="filter"
                                            label={t("ignored_conflicts") || "Ignored Conflicts"}
                                            number={trueIgnoredPairs.length.toString()}
                                            icon={<span className="material-symbols-outlined">visibility_off</span>}
                                            colorClass="text-[var(--text)]"
                                            isActive={overrideTab === "IGNORED"}
                                            className="cursor-pointer min-w-[200px] shrink-0"
                                            onClick={() => setOverrideTab(overrideTab === "IGNORED" ? "ALL" : "IGNORED")}
                                        />
                                    </StatTileCarousel>
                                )}
                                <CommandScreenBody>
                                    <CommandScreenMain>
                                        <div className="flex flex-col gap-6">
                                            {allActiveOverrides.length === 0 && trueIgnoredPairs.length === 0 && (
                                                <EmptyState icon="rule" title={t("no_overrides_title", "NO OVERRIDES")} subtitle={t("no_overrides_desc", "No conflicts have been resolved or ignored for this blueprint.")} />
                                            )}

                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4">
                                                {(overrideTab === "ALL" || overrideTab === "ACTIVE") && allActiveOverrides.map((override: any, idx: number) => {
                                                    const cleanWinnerPath = stripPriorityPrefix(override.winnerPath);
                                                    const displayWinnerName = formatDisplayName(cleanWinnerPath, activeGameSchema);

                                                    const cleanLoserPath = stripPriorityPrefix(override.loserPath);
                                                    const displayLoserName = override.isManual ? cleanLoserPath : formatDisplayName(cleanLoserPath, activeGameSchema);

                                                    return (
                                                        <div key={`active_${idx}`} className="p-5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-xl relative group/card hover:shadow-2xl hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all duration-500 flex flex-col gap-5 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]">
                                                            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-tr from-[color-mix(in_srgb,var(--bg)_5%,transparent)] to-transparent pointer-events-none z-0" />
                                                            <div className="flex items-center justify-between relative z-10">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center text-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]">
                                                                        <span className="material-symbols-outlined !text-[18px]">verified</span>
                                                                    </div>
                                                                    <h3 className="text-xs font-black capitalize tracking-widest text-[var(--accent)] drop-shadow-md">
                                                                        {t("active_override")}
                                                                    </h3>
                                                                </div>
                                                                <button
                                                                    onClick={() => override.isManual ? undoOverride(cleanWinnerPath).then(() => runRadar()) : unignoreConflict(override.pair).then(() => undoOverride(cleanWinnerPath).then(() => runRadar()))}
                                                                    className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-all flex items-center justify-center shadow-sm relative group/btn"
                                                                >
                                                                    <span className="material-symbols-outlined !text-[14px]">undo</span>
                                                                    <HoverTooltip title={t("revert_override")} variant="danger" className="z-[200] group-hover/btn:flex" />
                                                                </button>
                                                            </div>

                                                            <div className="flex flex-col gap-2 relative z-10 w-full mt-2">
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 text-[var(--accent)]">
                                                                        {t("winner")}
                                                                    </span>
                                                                    <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{displayWinnerName}</span>
                                                                </div>

                                                                <div className="relative h-px w-full flex items-center justify-center z-20 my-2">
                                                                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md absolute border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm text-[var(--subtext)]">
                                                                        <span className="text-[7px] font-black italic capitalize">{t("vs")}</span>
                                                                    </div>
                                                                    <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                                                                </div>

                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 text-[var(--subtext)]">
                                                                        {t("overridden_file")}
                                                                    </span>
                                                                    <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{displayLoserName}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {(overrideTab === "ALL" || overrideTab === "IGNORED") && trueIgnoredPairs.map((pair: string, i: number) => {
                                                    const parts = pair.split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
                                                    const left = parts[0] || pair;
                                                    const right = parts[1] || t("unknown_file");
                                                    const leftName = left.split(/[/\\]/).pop();
                                                    const rightName = right.split(/[/\\]/).pop();

                                                    return (
                                                        <div key={`ignored_${i}`} className="p-5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-xl relative group/card hover:shadow-2xl hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all duration-500 flex flex-col gap-5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                                                            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-tr from-[color-mix(in_srgb,var(--bg)_5%,transparent)] to-transparent pointer-events-none z-0" />
                                                            <div className="flex items-center justify-between relative z-10">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] shadow-sm">
                                                                        <span className="material-symbols-outlined !text-[18px]">visibility_off</span>
                                                                    </div>
                                                                    <h3 className="text-xs font-black capitalize tracking-widest text-[var(--text)] drop-shadow-md opacity-80">
                                                                        {t("ignored_conflict")}
                                                                    </h3>
                                                                </div>
                                                                <button
                                                                    onClick={() => unignoreConflict(pair).then(() => runRadar())}
                                                                    className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all flex items-center justify-center shadow-sm relative group/btn"
                                                                >
                                                                    <span className="material-symbols-outlined !text-[14px]">undo</span>
                                                                    <HoverTooltip title={t("unignore_conflict")} variant="accent" className="z-[200] group-hover/btn:flex" />
                                                                </button>
                                                            </div>

                                                            <div className="flex flex-col gap-2 relative z-10 w-full mt-2">
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 text-[var(--subtext)]">
                                                                        {t("ignored_file_a")}
                                                                    </span>
                                                                    <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{formatDisplayName(leftName || "", activeGameSchema)}</span>
                                                                </div>

                                                                <div className="relative h-px w-full flex items-center justify-center z-20 my-2">
                                                                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--bg)] absolute border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm text-[var(--subtext)]">
                                                                        <span className="text-[7px] font-black italic capitalize">{t("vs")}</span>
                                                                    </div>
                                                                    <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                                                                </div>

                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 text-[var(--subtext)]">
                                                                        {t("ignored_file_b")}
                                                                    </span>
                                                                    <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{formatDisplayName(rightName || "", activeGameSchema)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </CommandScreenMain>
                                </CommandScreenBody>
                            </CommandScreenLayout>
                        );
                    })()}

                    {activeTab === "LOAD_ORDER" && (() => {
                        const visibleQueueSlice = filteredQueue.slice(0, visibleLoadOrder);

                        return (
                            <CommandScreenLayout>
                                <StatTileCarousel>
                                    <DashboardStatTile
                                        variant="filter"
                                        label={t("load_order_queue", "Load Order Queue")}
                                        number={compiledOrder.items.length.toString()}
                                        icon={<span className="material-symbols-outlined">{t("icon_format_list_numbered", "format_list_numbered")}</span>}
                                        colorClass="text-[var(--accent)]"
                                        isActive={loadOrderSubFilter === "ALL"}
                                        className="cursor-pointer min-w-[200px] shrink-0"
                                        onClick={() => setLoadOrderSubFilter("ALL")}
                                    />
                                    <DashboardStatTile
                                        variant="filter"
                                        label={t("lo_filter_custom", "Custom Overrides & Rules")}
                                        number={customLoadOrderCount.toString()}
                                        icon={<span className="material-symbols-outlined">{t("icon_verified", "verified")}</span>}
                                        colorClass="text-[var(--success)]"
                                        isActive={loadOrderSubFilter === "CUSTOM"}
                                        className="cursor-pointer min-w-[200px] shrink-0"
                                        onClick={() => setLoadOrderSubFilter(loadOrderSubFilter === "CUSTOM" ? "ALL" : "CUSTOM")}
                                    />
                                    <DashboardStatTile
                                        variant="filter"
                                        label={t("load_order_rules", "Load Order Rules")}
                                        number={activeBlueprintRules.length.toString()}
                                        icon={<span className="material-symbols-outlined">{t("icon_account_tree", "account_tree")}</span>}
                                        colorClass="text-[var(--warning)]"
                                        isActive={loadOrderSubFilter === "RULES"}
                                        className="cursor-pointer min-w-[200px] shrink-0"
                                        onClick={() => setLoadOrderSubFilter(loadOrderSubFilter === "RULES" ? "ALL" : "RULES")}
                                    />
                                    <DashboardStatTile
                                        variant="filter"
                                        label={t("lo_priority_tier", "Priority Tier")}
                                        number={elevatedModsCount.toString()}
                                        icon={<span className="material-symbols-outlined">{t("icon_low_priority", "low_priority")}</span>}
                                        colorClass="text-[var(--accent)]"
                                        isActive={loadOrderSubFilter === "OVERRIDES"}
                                        className="cursor-pointer min-w-[200px] shrink-0"
                                        onClick={() => setLoadOrderSubFilter(loadOrderSubFilter === "OVERRIDES" ? "ALL" : "OVERRIDES")}
                                    />
                                    <DashboardStatTile
                                        variant="filter"
                                        label={t("schema_load_engine", "Load Order Engine")}
                                        number={compiledOrder.manifestFile}
                                        icon={<span className="material-symbols-outlined">tune</span>}
                                        colorClass="text-[var(--text)]"
                                        isActive={false}
                                        className="cursor-pointer min-w-[200px] shrink-0"
                                        onClick={() => setIsSidePanelOpen(true)}
                                    />
                                </StatTileCarousel>

                                <CommandScreenBody>
                                    <CommandScreenMain>
                                        <div className="flex flex-col gap-6 w-full">
                                            {/* Circular Dependency Alert Banner */}
                                            {compiledOrder.cycles.length > 0 && (
                                                <div className="p-5 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] shadow-[0_0_30px_rgba(239,68,68,0.15)] flex flex-col gap-4 animate-in fade-in duration-300">
                                                    <div className="flex items-center justify-between flex-wrap gap-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] flex items-center justify-center text-[var(--danger)]">
                                                                <span className="material-symbols-outlined !text-[20px]">sync_problem</span>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--danger)]">
                                                                    {t("lo_cycle_detected", "Circular Load Rule Detected")}
                                                                </h3>
                                                                <p className="text-xs text-[var(--subtext)] font-bold">
                                                                    {t("lo_cycle_desc", "Two or more mods are locked in an infinite load-order loop. Break one rule below to restore topological sorting.")}
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
                                                                                {formatDisplayName(node, undefined, activeGameSchema)}
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

                                            {/* Active Load Rules Section (Shown when RULES filter is active or when rules exist) */}
                                            {(loadOrderSubFilter === "RULES" || activeBlueprintRules.length > 0) && (
                                                <div className="flex flex-col gap-3">
                                                    <CommandScreenSectionHeading
                                                        title={t("load_order_rules", "Load Order Rules")}
                                                        icon={t("icon_account_tree", "account_tree")}
                                                        rightContent={
                                                            <button
                                                                type="button"
                                                                onClick={() => openLoadOrderInspector("")}
                                                                className="px-4 py-2 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                                                            >
                                                                <span className="material-symbols-outlined !text-[15px]">add</span>
                                                                {t("lo_add_rule", "Add Load Rule")}
                                                            </button>
                                                        }
                                                    />

                                                    {activeBlueprintRules.length === 0 ? (
                                                        <EmptyState
                                                            icon={t("icon_account_tree", "account_tree")}
                                                            title={t("lo_no_rules_title", "NO CUSTOM LOAD RULES")}
                                                            subtitle={t("lo_no_rules_desc", "Add a load rule or pick a conflict winner to automatically lock load order dependencies.")}
                                                        />
                                                    ) : (
                                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4">
                                                            {activeBlueprintRules.map((rule) => (
                                                                <div
                                                                    key={rule.id}
                                                                    onClick={() => openLoadOrderInspector(rule.modA)}
                                                                    className="p-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:border-[var(--accent)] flex items-center justify-between gap-3 cursor-pointer transition-all"
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                                                        <span className="text-xs font-black text-[var(--text)] truncate max-w-[150px]">
                                                                            {formatDisplayName(rule.modA, undefined, activeGameSchema)}
                                                                        </span>
                                                                        <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] shrink-0">
                                                                            {rule.type === "after"
                                                                                ? t("lo_loads_after", "LOADS AFTER")
                                                                                : t("lo_loads_before", "LOADS BEFORE")}
                                                                        </span>
                                                                        <span className="text-xs font-bold text-[var(--subtext)] truncate max-w-[150px]">
                                                                            {formatDisplayName(rule.modB, undefined, activeGameSchema)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => flipLoadOrderRule(scanScope, rule.id)}
                                                                            className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                                                        >
                                                                            <span className="material-symbols-outlined !text-[15px]">{t("icon_swap_vert", "swap_vert")}</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeLoadOrderRule(scanScope, rule.id)}
                                                                            className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] flex items-center justify-center transition-all"
                                                                        >
                                                                            <span className="material-symbols-outlined !text-[15px]">close</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Multi-Column Glass Card Grid for Load Order Queue */}
                                            {loadOrderSubFilter !== "RULES" && (
                                                <div className="flex flex-col gap-4">
                                                    <CommandScreenSectionHeading
                                                        title={t("load_order_queue", "Load Order Queue")}
                                                        icon={t("icon_format_list_numbered", "format_list_numbered")}
                                                        rightContent={
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openLoadOrderInspector("")}
                                                                    className="px-3.5 py-2 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                                                                >
                                                                    <span className="material-symbols-outlined !text-[15px]">add</span>
                                                                    {t("lo_add_rule", "Add Load Rule")}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => equipPlaySet(scanScope)}
                                                                    className="px-3.5 py-2 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                                                                >
                                                                    <span className="material-symbols-outlined !text-[15px]">{t("icon_check_circle", "check_circle")}</span>
                                                                    {t("btn_deployed", "Deployed")} ({scanScope})
                                                                </button>
                                                            </div>
                                                        }
                                                    />

                                                    {filteredQueue.length === 0 ? (
                                                        <EmptyState
                                                            icon={t("icon_low_priority", "low_priority")}
                                                            title={
                                                                loadOrderSubFilter === "CUSTOM" || loadOrderSubFilter === "OVERRIDES"
                                                                    ? t("lo_custom_empty_title", "No Custom Priority Tiers or Rules")
                                                                    : t("load_order_queue", "Load Order Queue")
                                                            }
                                                            subtitle={
                                                                loadOrderSubFilter === "CUSTOM" || loadOrderSubFilter === "OVERRIDES"
                                                                    ? t("lo_custom_empty_desc", "Click any mod in the queue or use the + button to assign a priority tier or load rule.")
                                                                    : t("lo_no_rules_desc", "Add a load rule or pick a conflict winner to automatically lock load order dependencies.")
                                                            }
                                                        />
                                                    ) : (
                                                        <>
                                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4">
                                                                {visibleQueueSlice.map((item) => {
                                                                    const isSelected = selectedLoadOrderMod.toLowerCase() === item.cleanName.toLowerCase() && isLoadOrderPanelOpen;
                                                                    const hasRule = ruleLinkedSet.has(item.cleanName.toLowerCase()) || item.autoPromoted;
                                                                    const tierLabel = item.tierFolder ? item.tierFolder : t("lo_tier_base", "Base Tier");

                                                                    return (
                                                                        <div
                                                                            key={item.cleanName}
                                                                            onClick={() => openLoadOrderInspector(item.cleanName)}
                                                                            className={`p-4 rounded-2xl glass-panel border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                                                                                isSelected
                                                                                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shadow-[0_0_25px_rgba(var(--accent-rgb),0.15)]"
                                                                                    : item.tierFolder
                                                                                    ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] hover:border-[var(--accent)]"
                                                                                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                                                <div className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] font-mono text-xs font-black text-[var(--accent)] shrink-0">
                                                                                    #{String(item.index + 1).padStart(3, "0")}
                                                                                </div>
                                                                                <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                                                                                    <span className="text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
                                                                                        {item.displayName}
                                                                                    </span>
                                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                                        <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)]">
                                                                                            {getFileLabel(item.cleanName, activeGameSchema)}
                                                                                        </span>
                                                                                        <span
                                                                                            className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${
                                                                                                item.tierFolder
                                                                                                    ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                                                                                                    : "glass-surface text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] opacity-80"
                                                                                            }`}
                                                                                        >
                                                                                            {tierLabel}
                                                                                        </span>
                                                                                        {hasRule && (
                                                                                            <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)]">
                                                                                                {t("lo_rule_badge", "Rule")}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => moveModInLoadOrder(scanScope, item.cleanName, "up")}
                                                                                    className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                                                                >
                                                                                    <span className="material-symbols-outlined !text-[16px]">keyboard_arrow_up</span>
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => moveModInLoadOrder(scanScope, item.cleanName, "down")}
                                                                                    className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                                                                >
                                                                                    <span className="material-symbols-outlined !text-[16px]">keyboard_arrow_down</span>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {filteredQueue.length > visibleLoadOrder && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setVisibleLoadOrder((prev) => prev + 48)}
                                                                    className="w-full py-3.5 mt-2 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] transition-all"
                                                                >
                                                                    {t("btn_load_more", "Load More")} ({filteredQueue.length - visibleLoadOrder} {t("lbl_remaining", "Remaining")})
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
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
                    onClose={() => setActiveConflictRes(null)}
                    onVault={vaultSingleScript}
                    onOverride={applyOverride}
                    onUndo={undoOverride}
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
                const modDropdownOptions = isLoadOrderPanelOpen
                    ? compiledOrder.items.map((it) => ({
                          id: it.cleanName,
                          label: it.displayName,
                      }))
                    : [];
                const activeModRules = selectedItem
                    ? activeBlueprintRules.filter(
                          (r) =>
                              r.modA.toLowerCase() === selectedItem.cleanName.toLowerCase() ||
                              r.modB.toLowerCase() === selectedItem.cleanName.toLowerCase()
                      )
                    : activeBlueprintRules;

                return (
                    <SidePanel
                        isOpen={isLoadOrderPanelOpen}
                        onClose={() => setIsLoadOrderPanelOpen(false)}
                        title={
                            selectedItem
                                ? selectedItem.displayName
                                : t("lo_panel_title", "Load Order & Rules")
                        }
                        subtitle={
                            selectedItem
                                ? `#${String(selectedItem.index + 1).padStart(3, "0")} • ${getFileLabel(selectedItem.cleanName, activeGameSchema)}`
                                : t("lo_panel_subtitle", "Configure priority tiers and custom load dependencies")
                        }
                        icon={t("icon_low_priority", "low_priority")}
                    >
                        <div className="flex flex-col gap-6 p-6">
                            {selectedItem && (
                                <UniversalGroup
                                    title={t("lo_priority_tier", "Priority Tier")}
                                    icon={t("icon_low_priority", "low_priority")}
                                >
                                    <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 mb-1">
                                        {t("lo_tier_select_desc", "Assign this mod to an elevated folder tier so it loads with higher priority.")}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {compiledOrder.priorityTiers.map((pt) => {
                                            const isActiveTier =
                                                (selectedItem.tierFolder || "").toLowerCase() === (pt.folder || "").toLowerCase();
                                            return (
                                                <button
                                                    key={pt.id}
                                                    type="button"
                                                    onClick={() => setModPriorityTier(scanScope, selectedItem.cleanName, pt.folder)}
                                                    className={`p-3.5 rounded-2xl text-left transition-all glass-panel border flex flex-col gap-1 ${
                                                        isActiveTier
                                                            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-sm"
                                                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)]"
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between w-full gap-2">
                                                        <span className="text-[11px] font-black uppercase tracking-wider truncate">
                                                            {pt.folder ? pt.folder : t("lo_tier_base", "Base Tier")}
                                                        </span>
                                                        <span className="text-[9px] font-mono opacity-75 shrink-0">P{pt.priority}</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold opacity-75 text-[var(--subtext)] truncate">
                                                        {pt.label}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </UniversalGroup>
                            )}

                            {selectedItem && (
                                <UniversalGroup
                                    title={t("lo_sequence_position", "Queue Sequence")}
                                    icon={t("icon_format_list_numbered", "format_list_numbered")}
                                >
                                    <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 mb-1">
                                        {t("lo_sequence_desc", "Step this mod earlier or later within its current priority tier.")}
                                    </p>
                                    <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                        <div className="flex items-center gap-3">
                                            <span className="px-3 py-1.5 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] font-mono text-xs font-black text-[var(--accent)]">
                                                #{String(selectedItem.index + 1).padStart(3, "0")}
                                            </span>
                                            <span className="text-xs font-bold text-[var(--subtext)] truncate max-w-[180px]">
                                                {selectedItem.previewPath}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "up")}
                                                className="w-9 h-9 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[18px]">keyboard_arrow_up</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "down")}
                                                className="w-9 h-9 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[18px]">keyboard_arrow_down</span>
                                            </button>
                                        </div>
                                    </div>
                                </UniversalGroup>
                            )}

                            <UniversalGroup
                                title={t("lo_add_rule", "Add Load Rule")}
                                icon={t("icon_account_tree", "account_tree")}
                            >
                                <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 mb-1">
                                    {t("lo_rule_builder_desc", "Lock load order between two mods so one always overrides the other.")}
                                </p>
                                <div className="flex flex-col gap-3">
                                    <CustomDropdown
                                        value={ruleModA}
                                        onChange={(val: string) => setRuleModA(val)}
                                        searchable={true}
                                        options={[
                                            { id: "", label: t("lo_select_mod_a", "Select Mod A...") },
                                            ...modDropdownOptions,
                                        ]}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setRuleDirection((d) => (d === "after" ? "before" : "after"))}
                                        className="w-full py-2.5 px-4 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:brightness-110 transition-all"
                                    >
                                        <span className="material-symbols-outlined !text-[15px]">{t("icon_swap_vert", "swap_vert")}</span>
                                        {ruleDirection === "after"
                                            ? t("lo_rule_must_load_after", "Must Load After (Wins)")
                                            : t("lo_rule_must_load_before", "Must Load Before (Yields)")}
                                    </button>
                                    <CustomDropdown
                                        value={ruleModB}
                                        onChange={(val: string) => setRuleModB(val)}
                                        searchable={true}
                                        options={[
                                            { id: "", label: t("lo_select_mod_b", "Select Target Mod B...") },
                                            ...modDropdownOptions,
                                        ]}
                                    />
                                    <button
                                        type="button"
                                        disabled={!ruleModA || !ruleModB || ruleModA === ruleModB}
                                        onClick={() => {
                                            if (ruleModA && ruleModB && ruleModA !== ruleModB) {
                                                addLoadOrderRule(scanScope, ruleModA, ruleModB, ruleDirection);
                                                setRuleModB("");
                                            }
                                        }}
                                        className="w-full py-3 rounded-xl bg-[var(--accent)] text-black font-black text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:pointer-events-none hover:brightness-110 transition-all"
                                    >
                                        + {t("lo_add_rule", "Add Load Rule")}
                                    </button>
                                </div>
                            </UniversalGroup>

                            {activeModRules.length > 0 && (
                                <UniversalGroup
                                    title={t("load_order_rules", "Load Order Rules")}
                                    icon={t("icon_account_tree", "account_tree")}
                                >
                                    <div className="flex flex-col gap-2">
                                        {activeModRules.map((rule) => (
                                            <div
                                                key={rule.id}
                                                className="p-3 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between gap-2"
                                            >
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                                                    <span className="text-[11px] font-black text-[var(--text)] truncate max-w-[120px]">
                                                        {formatDisplayName(rule.modA, undefined, activeGameSchema)}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]">
                                                        {rule.type === "after"
                                                            ? t("lo_loads_after", "LOADS AFTER")
                                                            : t("lo_loads_before", "LOADS BEFORE")}
                                                    </span>
                                                    <span className="text-[11px] font-bold text-[var(--subtext)] truncate max-w-[120px]">
                                                        {formatDisplayName(rule.modB, undefined, activeGameSchema)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => flipLoadOrderRule(scanScope, rule.id)}
                                                        className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                                    >
                                                        <span className="material-symbols-outlined !text-[14px]">{t("icon_swap_vert", "swap_vert")}</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeLoadOrderRule(scanScope, rule.id)}
                                                        className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] text-[var(--danger)] flex items-center justify-center transition-all"
                                                    >
                                                        <span className="material-symbols-outlined !text-[14px]">close</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </UniversalGroup>
                            )}
                        </div>
                    </SidePanel>
                );
            })()}

            <SidePanel
                isOpen={isSidePanelOpen}
                onClose={() => setIsSidePanelOpen(false)}
                title={t("radar_settings") || "Radar Settings"}
                icon="tune"
            >
                <div className="flex flex-col gap-8 p-6">
                    <div className="flex flex-col gap-4">
                        <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-2">
                            <span className="material-symbols-outlined !text-[18px]">map</span>
                            {t("scan_scope") || "Scan Scope"}
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            {(playSets || []).map((s: any) => (
                                <button
                                    key={s.name}
                                    onClick={() => { setScanScope(s.name); runRadar(s.name); setIsSidePanelOpen(false); }}
                                    className={`p-4 rounded-xl flex flex-col items-start gap-2 text-left transition-all relative overflow-hidden group glass-panel border ${scanScope === s.name ? '!bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[var(--accent)] text-[var(--accent)] shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.2)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--text)] text-[var(--subtext)] hover:text-[var(--text)]'}`}
                                >
                                    <span className="material-symbols-outlined !text-[20px] opacity-70 group-hover:opacity-100 transition-opacity">folder_open</span>
                                    <span className="font-black text-[10px] uppercase tracking-widest break-all line-clamp-2 w-full">{s.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Master Schema Load Order Engine Configurator */}
                    <div className="flex flex-col gap-4 pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)] flex items-center gap-2">
                                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("icon_low_priority", "low_priority")}</span>
                                {t("schema_load_engine", "Load Order Engine")}
                            </h3>
                            <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80">
                                {t("schema_load_engine_desc", "Master Schema load order strategy for this game")}
                            </p>
                        </div>

                        <div className="flex flex-col gap-2">
                            {[
                                {
                                    id: "folder_priority",
                                    label: t("lo_strategy_folder", "Folder Priority (Resource.cfg)"),
                                    desc: t("lo_strategy_folder_desc", "Uses priority override folders and packed directory depth"),
                                    manifest: "Resource.cfg",
                                },
                                {
                                    id: "manifest_list",
                                    label: t("lo_strategy_manifest", "Manifest List (loadorder.txt)"),
                                    desc: t("lo_strategy_manifest_desc", "Writes an ordered plain-text manifest file on deployment"),
                                    manifest: "loadorder.txt",
                                },
                                {
                                    id: "numeric_prefix",
                                    label: t("lo_strategy_prefix", "Numeric Prefix (001_)"),
                                    desc: t("lo_strategy_prefix_desc", "Prefixes deployed filenames with their load sequence index"),
                                    manifest: "loadorder.txt",
                                },
                                {
                                    id: "timestamp",
                                    label: t("lo_strategy_timestamp", "Timestamp Order"),
                                    desc: t("lo_strategy_timestamp_desc", "Staggers file modification timestamps by load sequence"),
                                    manifest: "Resource.cfg",
                                },
                            ].map((strat) => {
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
                                        className={`p-3.5 rounded-2xl text-left transition-all glass-panel border flex flex-col gap-1 ${
                                            isActive
                                                ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]"
                                                : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between w-full">
                                            <span className="text-xs font-black tracking-wider uppercase">{strat.label}</span>
                                            <span className="text-[9px] font-mono opacity-75">{strat.manifest}</span>
                                        </div>
                                        <span className="text-[10px] font-bold opacity-75 text-[var(--subtext)]">{strat.desc}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </SidePanel>
        </>
    );
};







