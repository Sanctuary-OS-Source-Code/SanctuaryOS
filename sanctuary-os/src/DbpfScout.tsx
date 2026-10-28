import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { ViewHeader, CustomDropdown, HoverTooltip, EmptyState, SidePanel, ActionButton, HoverTabDrawer, VerticalTabButton, DashboardStatTile, ActionPill, PanelHeaderGroup, PanelHeaderButton, StatBox } from "./shared";
import { getExtensionRegex, formatDisplayName, getFileLabel } from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";
import { UniversalGroup, SidePanelHeroCard } from "./components/layouts/ElevatedHubLayout";
import { useLexicon } from "./LexiconContext";
import { usePlaySetLogic, compileLoadOrder, LoadOrderRule } from "./hooks/usePlaySetLogic";
import { useStore } from "./store";
import ConflictCard from "./ConflictCard";
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
        return compiledOrder.items
            .filter((it) => {
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
            })
            .map((it) => ({
                ...it,
                extLabel: getFileLabel(it.cleanName, activeGameSchema),
            }));
    }, [compiledOrder.items, ruleLinkedSet, loadOrderSubFilter, loadOrderSearch, activeGameSchema]);

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
            if (!parsed || typeof parsed !== "object") return false;
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
                                    searchPlaceholder={t("search_ph", "Search {mods}...") as string}
                                    primaryPopover={{
                                        icon: t("icon_tune", "tune"),
                                        label: t("filters", "Filters") as string,
                                        content: (
                                            <div className="flex flex-col w-[380px] p-4 max-w-[calc(100vw-40px)] text-left">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                                                    {t("filter_status", "Filter Status")}
                                                    <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { id: null, label: `${t("all", "All")} (${fatalConflicts.length + tuningConflicts.length + cloneConflicts.length + softConflicts.length})` },
                                                        { id: 4, label: `${t("total_severity_4", "Total Fatal")} (${fatalConflicts.length})` },
                                                        { id: 3, label: `${t("total_severity_3", "Total Tuning")} (${tuningConflicts.length})` },
                                                        { id: 2, label: `${t("total_clones", "Total Clones")} (${cloneConflicts.length})` },
                                                        { id: 1, label: `${t("total_soft", "Total Soft Overlaps")} (${softConflicts.length})` },
                                                    ].map((opt) => {
                                                        const active = activeConflictSeverity === opt.id;
                                                        return (
                                                            <button
                                                                key={String(opt.id)}
                                                                type="button"
                                                                onClick={() => setActiveConflictSeverity(opt.id)}
                                                                className={`rounded-lg px-3 py-1.5 transition-all flex items-center justify-center text-[10px] font-bold uppercase tracking-widest border cursor-pointer ${
                                                                    active
                                                                        ? "border-[var(--accent)] text-[var(--accent)] bg-transparent"
                                                                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]"
                                                                }`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ),
                                    }}
                                    rightContent={
                                        <div className="flex items-center border-l border-[color-mix(in_srgb,var(--text)_6%,transparent)] pl-2 h-full pr-2">
                                            <button onClick={() => setIsSidePanelOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)]">
                                                <span className="material-symbols-outlined !text-[20px]">{t("icon_settings", "settings")}</span>
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
                                    searchPlaceholder={t("search_ph", "Search {mods}...") as string}
                                    primaryPopover={{
                                        icon: t("icon_tune", "tune"),
                                        label: t("filters", "Filters") as string,
                                        content: (
                                            <div className="flex flex-col w-[360px] p-4 max-w-[calc(100vw-40px)] text-left">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                                                    {t("filter_status", "Filter Status")}
                                                    <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { id: "ALL" as const, label: t("all", "All") },
                                                        { id: "ACTIVE" as const, label: t("active_overrides", "Active Overrides") },
                                                        { id: "IGNORED" as const, label: t("ignored_conflicts", "Ignored Conflicts") },
                                                    ].map((opt) => {
                                                        const active = overrideTab === opt.id;
                                                        return (
                                                            <button
                                                                key={opt.id}
                                                                type="button"
                                                                onClick={() => setOverrideTab(opt.id)}
                                                                className={`rounded-lg px-3 py-1.5 transition-all flex items-center justify-center text-[10px] font-bold uppercase tracking-widest border cursor-pointer ${
                                                                    active
                                                                        ? "border-[var(--accent)] text-[var(--accent)] bg-transparent"
                                                                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]"
                                                                }`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ),
                                    }}
                                    rightContent={
                                        <div className="flex items-center border-l border-[color-mix(in_srgb,var(--text)_6%,transparent)] pl-2 h-full pr-2">
                                            <button onClick={() => setIsSidePanelOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)]">
                                                <span className="material-symbols-outlined !text-[20px]">{t("icon_settings", "settings")}</span>
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
                                    searchPlaceholder={t("search_ph", "Search {mods}...") as string}
                                    primaryPopover={{
                                        icon: t("icon_tune", "tune"),
                                        label: t("filters", "Filters") as string,
                                        content: (
                                            <div className="flex flex-col w-[400px] p-4 max-w-[calc(100vw-40px)] text-left">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                                                    {t("filter_status", "Filter Status")}
                                                    <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { id: "ALL" as const, label: `${t("load_order_queue", "Load Order Queue")} (${compiledOrder.items.length})` },
                                                        { id: "CUSTOM" as const, label: `${t("lo_filter_custom", "Custom Overrides & Rules")} (${customLoadOrderCount})` },
                                                        { id: "RULES" as const, label: `${t("load_order_rules", "Load Order Rules")} (${activeBlueprintRules.length})` },
                                                        { id: "OVERRIDES" as const, label: `${t("lo_priority_tier", "Priority Tier")} (${elevatedModsCount})` },
                                                    ].map((opt) => {
                                                        const active = loadOrderSubFilter === opt.id;
                                                        return (
                                                            <button
                                                                key={opt.id}
                                                                type="button"
                                                                onClick={() => setLoadOrderSubFilter(opt.id)}
                                                                className={`rounded-lg px-3 py-1.5 transition-all flex items-center justify-center text-[10px] font-bold uppercase tracking-widest border cursor-pointer ${
                                                                    active
                                                                        ? "border-[var(--accent)] text-[var(--accent)] bg-transparent"
                                                                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]"
                                                                }`}
                                                            >
                                                                {opt.label}
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
                                            id: "auto_sort_queue",
                                            icon: t("icon_swap_vert", "swap_vert"),
                                            label: t("lo_auto_sort", "Auto-Sort Queue"),
                                            onClick: () => autoSortBlueprintLoadOrder(scanScope),
                                        },
                                    ]}
                                    rightContent={
                                        <div className="flex items-center border-l border-[color-mix(in_srgb,var(--text)_6%,transparent)] pl-2 h-full pr-2">
                                            <button onClick={() => setIsSidePanelOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)]">
                                                <span className="material-symbols-outlined !text-[20px]">{t("icon_settings", "settings")}</span>
                                            </button>
                                        </div>
                                    }
                                />
                            </div>
                        )}
                    </div>
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
                        <VerticalTabButton id="OVERRIDES" icon="rule" label={t("overrides", "Overrides")} activeTab={activeTab} setTab={setActiveTab} badge={ignoredPairs.length > 0 ? ignoredPairs.length : null} />
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
                        <DashboardStatTile variant="tab" icon="rule" label={t("overrides", "Overrides")} number={ignoredPairs.length} onClick={() => setActiveTab("OVERRIDES")} isActive={activeTab === "OVERRIDES"} />
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
                                            <div className="w-full flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in zoom-in-95 duration-1000 relative z-10 my-auto min-h-[calc(100vh-300px)]">
                                                <div className="w-56 h-56 rounded-full border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shadow-md flex items-center justify-center relative group cursor-pointer" onClick={() => runRadar()}>
                                                    <div className="absolute inset-0 rounded-[inherit]  border-[2px] border-dashed border-[var(--accent)] opacity-20 animate-[spin_20s_linear_infinite]" />
                                                    <div className="absolute inset-4 rounded-full border border-[var(--text)] opacity-10 animate-[spin_15s_linear_infinite_reverse]" />
                                                    <div className="absolute inset-10 rounded-full border-[2px] border-dotted border-[var(--warning)] opacity-10 animate-[spin_25s_linear_infinite]" />
                                                    <span className="material-symbols-outlined !text-[80px] text-[var(--accent)] opacity-80 group-hover:scale-110 group-hover:opacity-100 transition-all duration-500 drop-shadow-md">
                                                        {t("icon_track_changes", "track_changes")}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col items-center gap-6 relative z-10 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
                                                    <div className="text-center space-y-2 mb-4">
                                                        <h2 className="text-2xl font-black capitalize tracking-widest text-white/90">
                                                            {t("landing_title", "System Standby")}
                                                        </h2>
                                                        <p className="text-sm font-medium leading-relaxed text-[var(--subtext)] opacity-80 max-w-lg">
                                                            {t("landing_desc", "Deploy the Conflict Scanner to scan your active load order for fatal structural clashes, tuning data overlaps, and duplicate asset clones. Neutralize threats before they destabilize your environment.")}
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
                                                        {t("icon_track_changes", "track_changes")}
                                                    </span>
                                                </div>
                                                <div className="space-y-4 max-w-xl relative z-10">
                                                    <h2 className="text-4xl font-black text-[var(--accent)] capitalize tracking-tighter drop-shadow-lg animate-pulse">
                                                        {t("scanning_title", "Scanning {Blueprint}...")}
                                                    </h2>
                                                    <p className="text-sm font-medium leading-relaxed text-[var(--subtext)] opacity-80">
                                                        {t("scanning_desc", "Please stand by. Analyzing target {blueprint} for duplicate assets and logical conflicts.")}
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
                                                            {t("icon_check", "check")}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="relative z-10 max-w-lg">
                                                    <h2 className="text-4xl font-black text-[var(--success)] capitalize tracking-tighter mb-4 drop-shadow-md">
                                                        {t("clear_title", "{Blueprint} Clear")}
                                                    </h2>
                                                    <p className="text-xs font-bold leading-relaxed capitalize tracking-[0.2em] text-[var(--subtext)] opacity-90 border-t border-[color-mix(in_srgb,var(--success)_20%,transparent)] pt-4">
                                                        {t("clear_desc", "No conflicts were detected in your deployed {blueprint}.")}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {hasScanned && filteredFatal.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 4) && (
                                            <section className="space-y-6">
                                                <CommandScreenSectionHeading
                                                    title={t("tier4_title", "Severity 4 Collisions")}
                                                    subtitle={t("tier4_desc", "Core Python or Binary overlaps detected. Overrides impossible.")}
                                                    icon={t("icon_warning_amber", "warning_amber")}
                                                    iconColorClass="text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                                                />

                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                                                    {filteredFatal.slice(0, visibleFatal).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={4} onClick={() => setActiveConflictRes(c)} />
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

                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                                                    {filteredTuning.slice(0, visibleTuning).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={3} onClick={() => setActiveConflictRes(c)} />
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

                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                                                    {filteredClone.slice(0, visibleClone).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={2} isSelectedA={selectedForVault.includes(c.modA)} isSelectedB={selectedForVault.includes(c.modB)} onKeepA={() => toggleTarget(c.modA, c.modB)} onKeepB={() => toggleTarget(c.modB, c.modA)} onClick={() => setActiveConflictRes(c)} />
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
                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 pt-6 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] mt-4">
                                                    {filteredSoft.slice(0, visibleSoft).map((c: any) => (
                                                        <ConflictCard key={c.mod_pair} conflict={c} tier={1} onClick={() => setActiveConflictRes(c)} onIgnore={() => ignoreConflict(c.mod_pair)} />
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
                            loserPath: t("unknown_file", "Unknown File"),
                            isManual: true
                        }));

                        const allActiveOverrides = [...resolvedOverrides, ...manualOverridesOnly].filter(o => !overrideSearch || o.winnerPath.toLowerCase().includes(overrideSearch.toLowerCase()));
                        const trueIgnoredPairs = ignoredPairs.filter((pair: string) => !resolvedOverrides.some(res => res.pair === pair));

                        return (
                            <CommandScreenLayout>
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
                                                            <div className="flex items-center justify-between relative z-10 pb-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                                                                <span className={VAULT_CHIP_CLASS}>
                                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_verified", "verified")}</span>
                                                                    <span>{t("active_override", "Active Override")}</span>
                                                                </span>
                                                                <button
                                                                    onClick={() => override.isManual ? undoOverride(cleanWinnerPath).then(() => runRadar()) : unignoreConflict(override.pair).then(() => undoOverride(cleanWinnerPath).then(() => runRadar()))}
                                                                    className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] transition-all flex items-center justify-center shadow-sm relative group/btn"
                                                                >
                                                                    <span className="material-symbols-outlined !text-[14px]">{t("icon_undo", "undo")}</span>
                                                                    <HoverTooltip title={t("revert_override", "Revert Override")} variant="danger" className="z-[200] group-hover/btn:flex" />
                                                                </button>
                                                            </div>

                                                            <div className="flex flex-col gap-2 relative z-10 w-full">
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 opacity-80 text-[var(--accent)]">
                                                                        <span className="material-symbols-outlined !text-[12px]">{t("icon_emoji_events", "emoji_events")}</span>
                                                                        {t("winner", "WINNING {MOD}")}
                                                                    </span>
                                                                    <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{displayWinnerName}</span>
                                                                </div>

                                                                <div className="relative h-px w-full flex items-center justify-center z-20 my-2">
                                                                    <div className="px-2 py-0.5 rounded-lg flex items-center justify-center glass-surface absolute border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-sm text-[var(--subtext)]">
                                                                        <span className="text-[8px] font-black uppercase tracking-wider">{t("vs", "VS")}</span>
                                                                    </div>
                                                                    <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                                                                </div>

                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 opacity-80 text-[var(--subtext)]">
                                                                        <span className="material-symbols-outlined !text-[12px]">{t("icon_extension", "extension")}</span>
                                                                        {t("overridden_file", "Overridden File")}
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
                                                    const right = parts[1] || t("unknown_file", "Unknown File");
                                                    const leftName = left.split(/[/\\]/).pop();
                                                    const rightName = right.split(/[/\\]/).pop();

                                                    return (
                                                        <div key={`ignored_${i}`} className="p-5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-xl relative group/card hover:shadow-2xl hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all duration-500 flex flex-col gap-5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                                                            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-tr from-[color-mix(in_srgb,var(--bg)_5%,transparent)] to-transparent pointer-events-none z-0" />
                                                            <div className="flex items-center justify-between relative z-10 pb-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                                                                <span className={VAULT_CHIP_CLASS}>
                                                                    <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">{t("icon_visibility_off", "visibility_off")}</span>
                                                                    <span>{t("ignored_conflict", "Ignored Conflict")}</span>
                                                                </span>
                                                                <button
                                                                    onClick={() => unignoreConflict(pair).then(() => runRadar())}
                                                                    className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] transition-all flex items-center justify-center shadow-sm relative group/btn"
                                                                >
                                                                    <span className="material-symbols-outlined !text-[14px]">{t("icon_undo", "undo")}</span>
                                                                    <HoverTooltip title={t("unignore_conflict", "Unignore Conflict")} variant="accent" className="z-[200] group-hover/btn:flex" />
                                                                </button>
                                                            </div>

                                                            <div className="flex flex-col gap-2 relative z-10 w-full">
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 opacity-80 text-[var(--subtext)]">
                                                                        <span className="material-symbols-outlined !text-[12px]">{t("icon_extension", "extension")}</span>
                                                                        {t("enemy_a", "{Mod} A")}
                                                                    </span>
                                                                    <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{formatDisplayName(leftName || "", activeGameSchema)}</span>
                                                                </div>

                                                                <div className="relative h-px w-full flex items-center justify-center z-20 my-2">
                                                                    <div className="px-2 py-0.5 rounded-lg flex items-center justify-center glass-surface absolute border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-sm text-[var(--subtext)]">
                                                                        <span className="text-[8px] font-black uppercase tracking-wider">{t("vs", "VS")}</span>
                                                                    </div>
                                                                    <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                                                                </div>

                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 opacity-80 text-[var(--subtext)]">
                                                                        <span className="material-symbols-outlined !text-[12px]">{t("icon_extension", "extension")}</span>
                                                                        {t("enemy_b", "{Mod} B")}
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
                                <CommandScreenBody>
                                    <CommandScreenMain>
                                        <div className="flex flex-col gap-6 w-full">
                                            {/* Circular Dependency Alert Banner */}
                                            {compiledOrder.cycles.length > 0 && (
                                                <div className="p-5 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] shadow-[0_0_30px_rgba(239,68,68,0.15)] flex flex-col gap-4 animate-in fade-in duration-300">
                                                    <div className="flex items-center justify-between flex-wrap gap-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--danger)]">
                                                                <span className="material-symbols-outlined !text-[20px]">{t("icon_sync_problem", "sync_problem")}</span>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--danger)]">
                                                                    {t("lo_cycle_detected", "Circular Load Rule Detected")}
                                                                </h3>
                                                                <p className="text-xs text-[var(--subtext)] font-bold">
                                                                    {t("lo_cycle_desc", "Two or more {mods} are locked in an infinite load-order loop. Break one rule below to restore topological sorting.")}
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
                                                        icon={t("icon_rule", "rule")}
                                                        rightContent={
                                                            <ActionButton
                                                                variant="glass"
                                                                icon={t("icon_add", "add")}
                                                                label={t("lo_add_rule", "Add Load Rule")}
                                                                onClick={() => openLoadOrderInspector("")}
                                                            />
                                                        }
                                                    />

                                                    {activeBlueprintRules.length === 0 ? (
                                                        <EmptyState
                                                            icon={t("icon_rule", "rule")}
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
                                                                        <span className={VAULT_CHIP_CLASS}>
                                                                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                                {rule.type === "after"
                                                                                    ? t("icon_vertical_align_bottom", "vertical_align_bottom")
                                                                                    : t("icon_vertical_align_top", "vertical_align_top")}
                                                                            </span>
                                                                            <span>
                                                                                {rule.type === "after"
                                                                                    ? t("lo_loads_after", "LOADS AFTER")
                                                                                    : t("lo_loads_before", "LOADS BEFORE")}
                                                                            </span>
                                                                        </span>
                                                                        <span className="text-xs font-bold text-[var(--subtext)] truncate max-w-[150px]">
                                                                            {formatDisplayName(rule.modB, undefined, activeGameSchema)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => flipLoadOrderRule(scanScope, rule.id)}
                                                                            className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors"
                                                                        >
                                                                            <span className="material-symbols-outlined !text-[15px]">{t("icon_swap_vert", "swap_vert")}</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeLoadOrderRule(scanScope, rule.id)}
                                                                            className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] flex items-center justify-center transition-colors"
                                                                        >
                                                                            <span className="material-symbols-outlined !text-[15px]">{t("icon_close", "close")}</span>
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
                                                                <ActionButton
                                                                    variant="glass"
                                                                    icon={t("icon_add", "add")}
                                                                    label={t("lo_add_rule", "Add Load Rule")}
                                                                    onClick={() => openLoadOrderInspector("")}
                                                                />
                                                                <ActionButton
                                                                    variant="glass"
                                                                    icon={t("icon_swap_vert", "swap_vert")}
                                                                    label={t("lo_auto_sort", "Auto-Sort Queue")}
                                                                    onClick={() => autoSortBlueprintLoadOrder(scanScope)}
                                                                />
                                                                <ActionButton
                                                                    variant="accent"
                                                                    icon={t("icon_check_circle", "check_circle")}
                                                                    label={`${t("btn_deployed", "Deployed")} (${scanScope})`}
                                                                    onClick={() => equipPlaySet(scanScope)}
                                                                />
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
                                                                    ? t("lo_custom_empty_desc", "All {mods} are currently using default load order. Click '+' in the header or switch to Full Queue to configure a {mod}.")
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
                                                                    const isScript = String(item.extLabel).toUpperCase().includes("SCRIPT") || item.cleanName.toLowerCase().endsWith(".ts4script");

                                                                    return (
                                                                        <div
                                                                            key={item.cleanName}
                                                                            onClick={() => openLoadOrderInspector(item.cleanName)}
                                                                            className={`p-4 rounded-2xl glass-panel border transition-colors cursor-pointer flex items-center justify-between gap-3 group ${
                                                                                isSelected
                                                                                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shadow-[0_0_25px_rgba(var(--accent-rgb),0.15)]"
                                                                                    : item.tierFolder
                                                                                    ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] hover:border-[var(--accent)]"
                                                                                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                                                <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                                                                    <span className="material-symbols-outlined !text-[20px]">
                                                                                        {isScript ? t("icon_code", "code") : t("icon_extension", "extension")}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                                                                                    <span className="text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
                                                                                        {item.displayName}
                                                                                    </span>
                                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                                        <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                                                                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_format_list_numbered", "format_list_numbered")}</span>
                                                                                            <span>#{String(item.index + 1).padStart(3, "0")}</span>
                                                                                        </span>
                                                                                        <span className={VAULT_CHIP_CLASS}>
                                                                                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                                                {isScript ? t("icon_code", "code") : t("icon_extension", "extension")}
                                                                                            </span>
                                                                                            <span>{item.extLabel}</span>
                                                                                        </span>
                                                                                        <span className={VAULT_CHIP_CLASS}>
                                                                                            <span className={`material-symbols-outlined !text-[12px] ${item.tierFolder ? "text-[var(--accent)]" : "text-[var(--subtext)]"}`}>
                                                                                                {t("icon_low_priority", "low_priority")}
                                                                                            </span>
                                                                                            <span>{tierLabel}</span>
                                                                                        </span>
                                                                                        {hasRule && (
                                                                                            <span className={VAULT_CHIP_CLASS}>
                                                                                                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_rule", "rule")}</span>
                                                                                                <span>{t("lo_rule_badge", "Rule")}</span>
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => moveModInLoadOrder(scanScope, item.cleanName, "up")}
                                                                                    className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors"
                                                                                >
                                                                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_keyboard_arrow_up", "keyboard_arrow_up")}</span>
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => moveModInLoadOrder(scanScope, item.cleanName, "down")}
                                                                                    className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors"
                                                                                >
                                                                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_keyboard_arrow_down", "keyboard_arrow_down")}</span>
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
                          label: `#${String(it.index + 1).padStart(3, "0")} • ${it.displayName}`,
                      }))
                    : [];
                const activeModRules = selectedItem
                    ? activeBlueprintRules.filter(
                          (r) =>
                              r.modA.toLowerCase() === selectedItem.cleanName.toLowerCase() ||
                              r.modB.toLowerCase() === selectedItem.cleanName.toLowerCase()
                      )
                    : activeBlueprintRules;

                const normalizedRuleModA = Array.isArray(ruleModA) ? String(ruleModA[0] || "") : String(ruleModA || "");
                const normalizedRuleModB = Array.isArray(ruleModB) ? String(ruleModB || "") : String(ruleModB || "");

                const sourceDropdownOptions = modDropdownOptions.filter(
                    (opt) => !normalizedRuleModB || opt.id.toLowerCase() !== normalizedRuleModB.toLowerCase()
                );
                const targetDropdownOptions = modDropdownOptions.filter(
                    (opt) =>
                        (!normalizedRuleModA || opt.id.toLowerCase() !== normalizedRuleModA.toLowerCase()) &&
                        (!selectedItem || opt.id.toLowerCase() !== selectedItem.cleanName.toLowerCase() || normalizedRuleModA.toLowerCase() !== selectedItem.cleanName.toLowerCase())
                );

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
                        widthClass="w-[90vw] md:w-[680px]"
                        headerActions={
                            <PanelHeaderGroup>
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
                                    selectedItem
                                        ? selectedItem.displayName
                                        : t("lo_panel_title", "Load Order & Rules")
                                }
                                description={
                                    selectedItem
                                        ? selectedItem.previewPath
                                        : t("lo_panel_subtitle", "Configure priority tiers and custom load dependencies")
                                }
                                badge={
                                    selectedItem
                                        ? `#${String(selectedItem.index + 1).padStart(3, "0")}`
                                        : `${compiledOrder.items.length} ${t("term_mods", "{Mods}")}`
                                }
                                badgeIcon={t("icon_format_list_numbered", "format_list_numbered")}
                                icon={t("icon_low_priority", "low_priority")}
                                variant="accent"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full pt-1">
                                    <StatBox
                                        label={t("lo_priority_tier", "Priority Tier")}
                                        value={
                                            selectedItem
                                                ? selectedItem.tierFolder || t("lo_tier_base", "Base Tier")
                                                : `${elevatedModsCount} ${t("overrides", "Overrides")}`
                                        }
                                        icon={t("icon_low_priority", "low_priority")}
                                        iconColorClass="text-[var(--accent)]"
                                    />
                                    <StatBox
                                        label={t("lo_sequence_position", "Queue Sequence")}
                                        value={
                                            selectedItem
                                                ? `#${String(selectedItem.index + 1).padStart(3, "0")} / ${compiledOrder.items.length}`
                                                : `${compiledOrder.items.length}`
                                        }
                                        icon={t("icon_format_list_numbered", "format_list_numbered")}
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

                            <UniversalGroup
                                title={t("term_mod", "{Mod}")}
                                icon={t("icon_extension", "extension")}
                            >
                                <CustomDropdown
                                    value={selectedLoadOrderMod || ""}
                                    onChange={(val: any) => {
                                        const nextVal = Array.isArray(val) ? String(val[0] || "") : String(val || "");
                                        setSelectedLoadOrderMod(nextVal);
                                        if (nextVal) {
                                            setRuleModA(nextVal);
                                        }
                                    }}
                                    searchable={true}
                                    disableTint={true}
                                    buttonClassName="!bg-[color-mix(in_srgb,var(--text)_3%,transparent)] !bg-none border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--accent)_40%,transparent)] backdrop-blur-md"
                                    options={[
                                        { id: "", label: t("all", "All") },
                                        ...modDropdownOptions,
                                    ]}
                                />
                            </UniversalGroup>

                            {selectedItem && (
                                <UniversalGroup
                                    title={t("lo_priority_tier", "Priority Tier")}
                                    icon={t("icon_low_priority", "low_priority")}
                                >
                                    <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 mb-1">
                                        {t("lo_tier_select_desc", "Assign this {mod} to an elevated priority tier so it loads later and wins conflicts.")}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {compiledOrder.priorityTiers.map((pt) => {
                                            const isActiveTier =
                                                (selectedItem.tierFolder || "").toLowerCase() === (pt.folder || "").toLowerCase();
                                            return (
                                                <button
                                                    key={pt.id}
                                                    type="button"
                                                    onClick={() => setModPriorityTier(scanScope, selectedItem.cleanName, pt.folder)}
                                                    className={`p-3.5 rounded-2xl glass-surface text-left transition-all border flex items-center justify-between gap-3 group ${
                                                        isActiveTier
                                                            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.12)]"
                                                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div
                                                            className={`w-9 h-9 rounded-xl border bg-transparent flex items-center justify-center shrink-0 transition-colors ${
                                                                isActiveTier
                                                                    ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                                                                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] group-hover:text-[var(--accent)]"
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined !text-[18px]">
                                                                {t("icon_low_priority", "low_priority")}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                                            <span className={`text-xs font-black uppercase tracking-wider truncate ${isActiveTier ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                                                                {pt.folder ? pt.folder : t("lo_tier_base", "Base Tier")}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                                                                {pt.label}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                                        <span
                                                            className={`material-symbols-outlined !text-[12px] ${
                                                                isActiveTier ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                                                            }`}
                                                        >
                                                            {t("icon_low_priority", "low_priority")}
                                                        </span>
                                                        <span>P{pt.priority}</span>
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
                                        {t("lo_sequence_desc", "Adjust where this {mod} loads within its priority tier.")}
                                    </p>
                                    <div className="flex items-center justify-between gap-3 p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                                <span className="material-symbols-outlined !text-[20px]">
                                                    {String(getFileLabel(selectedItem.cleanName, activeGameSchema)).toUpperCase().includes("SCRIPT") || selectedItem.cleanName.toLowerCase().endsWith(".ts4script")
                                                        ? t("icon_code", "code")
                                                        : t("icon_extension", "extension")}
                                                </span>
                                            </div>
                                            <div className="flex flex-col min-w-0 flex-1 gap-1">
                                                <span className="text-xs font-black text-[var(--text)] truncate">
                                                    {selectedItem.displayName}
                                                </span>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                            {t("icon_format_list_numbered", "format_list_numbered")}
                                                        </span>
                                                        <span>#{String(selectedItem.index + 1).padStart(3, "0")}</span>
                                                    </span>
                                                    <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-80 truncate">
                                                        {selectedItem.previewPath}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "top")}
                                                className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[18px]">{t("icon_vertical_align_top", "vertical_align_top")}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "up")}
                                                className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[18px]">{t("icon_keyboard_arrow_up", "keyboard_arrow_up")}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "down")}
                                                className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[18px]">{t("icon_keyboard_arrow_down", "keyboard_arrow_down")}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveModInLoadOrder(scanScope, selectedItem.cleanName, "bottom")}
                                                className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                                            >
                                                <span className="material-symbols-outlined !text-[18px]">{t("icon_vertical_align_bottom", "vertical_align_bottom")}</span>
                                            </button>
                                        </div>
                                    </div>
                                </UniversalGroup>
                            )}

                            <UniversalGroup
                                title={t("lo_add_rule", "Add Load Rule")}
                                icon={t("icon_rule", "rule")}
                            >
                                <p className="text-[11px] font-bold text-[var(--subtext)] opacity-80 mb-1">
                                    {t("lo_rule_builder_desc", "Lock explicit load order dependencies between two {mods}.")}
                                </p>
                                <div className="flex flex-col gap-3">
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

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <DashboardStatTile
                                            variant="filter"
                                            icon={t("icon_vertical_align_bottom", "vertical_align_bottom")}
                                            label={t("lo_rule_must_load_after", "Must Load After (Wins)")}
                                            isActive={ruleDirection === "after"}
                                            onClick={() => setRuleDirection("after")}
                                        />
                                        <DashboardStatTile
                                            variant="filter"
                                            icon={t("icon_vertical_align_top", "vertical_align_top")}
                                            label={t("lo_rule_must_load_before", "Must Load Before (Yields)")}
                                            isActive={ruleDirection === "before"}
                                            onClick={() => setRuleDirection("before")}
                                        />
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
                                        {activeModRules.map((rule) => (
                                            <div
                                                key={rule.id}
                                                className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between gap-3"
                                            >
                                                <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                                    <span className="text-xs font-black text-[var(--text)] truncate max-w-[150px]">
                                                        {formatDisplayName(rule.modA, undefined, activeGameSchema)}
                                                    </span>
                                                    <span className={VAULT_CHIP_CLASS}>
                                                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                            {rule.type === "after"
                                                                ? t("icon_vertical_align_bottom", "vertical_align_bottom")
                                                                : t("icon_vertical_align_top", "vertical_align_top")}
                                                        </span>
                                                        <span>
                                                            {rule.type === "after"
                                                                ? t("lo_loads_after", "LOADS AFTER")
                                                                : t("lo_loads_before", "LOADS BEFORE")}
                                                        </span>
                                                    </span>
                                                    <span className="text-xs font-bold text-[var(--subtext)] truncate max-w-[150px]">
                                                        {formatDisplayName(rule.modB, undefined, activeGameSchema)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => flipLoadOrderRule(scanScope, rule.id)}
                                                        className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[var(--accent)] flex items-center justify-center transition-all"
                                                    >
                                                        <span className="material-symbols-outlined !text-[15px]">{t("icon_swap_vert", "swap_vert")}</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeLoadOrderRule(scanScope, rule.id)}
                                                        className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] flex items-center justify-center transition-all"
                                                    >
                                                        <span className="material-symbols-outlined !text-[15px]">{t("icon_close", "close")}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </UniversalGroup>
                        </div>
                    </SidePanel>
                );
            })()}

            {(() => {
                const strategyList = [
                    {
                        id: "folder_priority",
                        icon: t("icon_folder", "folder"),
                        label: t("lo_strategy_folder", "Folder Priority (Resource.cfg)"),
                        shortLabel: t("lo_badge_resource_cfg", "Resource.cfg"),
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

                return (
                    <SidePanel
                        isOpen={isSidePanelOpen}
                        onClose={() => setIsSidePanelOpen(false)}
                        title={t("radar_settings", "Radar Settings")}
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
                                title={t("radar_settings", "Radar Settings")}
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

                            <UniversalGroup
                                title={t("scan_scope", "Scan Scope")}
                                icon={t("icon_map", "map")}
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {(playSets || []).map((s: any) => {
                                        const isSelectedScope = scanScope === s.name;
                                        const modCount = Array.isArray(s.mods) ? s.mods.length : 0;
                                        let cachedStats: { fatal?: number; tuning?: number; clone?: number } | null = null;
                                        try {
                                            const rawStats = localStorage.getItem(`radar_stats_${s.name}`);
                                            if (rawStats) cachedStats = JSON.parse(rawStats);
                                        } catch {}
                                        const scopeClashes =
                                            isSelectedScope && hasScanned
                                                ? activeClashTotal
                                                : cachedStats
                                                ? (cachedStats.fatal || 0) + (cachedStats.tuning || 0) + (cachedStats.clone || 0)
                                                : null;

                                        return (
                                            <button
                                                key={s.name}
                                                type="button"
                                                onClick={() => {
                                                    setScanScope(s.name);
                                                    if (!hydrateCachedScope(s.name, ignoredPairs)) {
                                                        runRadar(s.name, { switchTab: false });
                                                    }
                                                    setIsSidePanelOpen(false);
                                                }}
                                                className={`p-4 rounded-2xl glass-surface text-left transition-all border flex items-center justify-between gap-3 group ${
                                                    isSelectedScope
                                                        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.12)]"
                                                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div
                                                        className={`w-10 h-10 rounded-xl border bg-transparent flex items-center justify-center shrink-0 transition-colors ${
                                                            isSelectedScope
                                                                ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                                                                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] group-hover:text-[var(--accent)]"
                                                        }`}
                                                    >
                                                        <span className="material-symbols-outlined !text-[20px]">
                                                            {isSelectedScope ? t("icon_verified_user", "verified_user") : t("icon_map", "map")}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col min-w-0 flex-1 gap-1">
                                                        <span className={`text-xs font-black uppercase tracking-wider truncate ${isSelectedScope ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                                                            {s.name}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className={VAULT_CHIP_CLASS}>
                                                                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                                                    {t("icon_extension", "extension")}
                                                                </span>
                                                                <span>
                                                                    {modCount} {t("artifacts_linked", "{Mods} Linked")}
                                                                </span>
                                                            </span>
                                                            {scopeClashes !== null && (
                                                                <span className={VAULT_CHIP_CLASS}>
                                                                    <span
                                                                        className={`material-symbols-outlined !text-[12px] ${
                                                                            scopeClashes > 0 ? "text-[var(--warning)]" : "text-[var(--success)]"
                                                                        }`}
                                                                    >
                                                                        {scopeClashes > 0 ? t("icon_warning", "warning") : t("icon_verified", "verified")}
                                                                    </span>
                                                                    <span>
                                                                        {scopeClashes > 0
                                                                            ? `${scopeClashes} ${t("conflicts", "Conflicts")}`
                                                                            : t("tier_clean", "Clean")}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className={VAULT_CHIP_CLASS}>
                                                    <span
                                                        className={`material-symbols-outlined !text-[12px] ${
                                                            isSelectedScope ? "text-[var(--success)]" : "text-[var(--subtext)]"
                                                        }`}
                                                    >
                                                        {isSelectedScope
                                                            ? t("icon_verified_user", "verified_user")
                                                            : t("icon_schedule", "schedule")}
                                                    </span>
                                                    <span>
                                                        {isSelectedScope
                                                            ? t("status_active", "Active")
                                                            : t("status_standby", "Standby")}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
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
                                                        <span className={`text-xs font-black tracking-wider uppercase ${isActive ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                                                            {strat.label}
                                                        </span>
                                                        <span className="text-[11px] font-medium text-[var(--subtext)] opacity-85 leading-snug">
                                                            {strat.desc}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className={`${VAULT_CHIP_CLASS} font-mono`}>
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
        </>
    );
};







