import {
  EmptyState,
  ActionButton,
  ActionPill,
  countBlueprintArtifacts,
} from "../../shared";
import { formatDisplayName } from "../../shared";
import { UniversalCard } from "../universal/UniversalCard";
import ConflictCard from "../../shared-components/ConflictCard";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../../shared-components/ContextMenu";
import {
  CommandScreenLayout,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  CommandScreenQuickLink,
  CommandScreenSectionHeading,
} from "../../hub-components/SharedCommandScreenLayout";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";

export function ScoutCommandAndConflictTabs({
  t,
  removeLoadOrderRule,
  loading,
  error,
  hasScanned,
  setShowUndoPanel,
  stats,
  playSets,
  activeGameSchema,
  scanScope,
  setScanScope,
  ignoredPairs,
  fatalConflicts,
  tuningConflicts,
  cloneConflicts,
  softConflicts,
  activeTab,
  setActiveTab,
  setOverrideTab,
  blueprintSearch,
  setBlueprintSearch,
  activeConflictSeverity,
  stripKnownModExt,
  compiledOrder,
  selectedForVault,
  setConfirmMassVault,
  confirmMassVault,
  isBulkMode,
  setIsBulkMode,
  setActiveConflictRes,
  hydrateCachedScope,
  runRadar,
  ignoreConflict,
  toggleTarget,
  executeMassVault,
  vaultSingleScript,
  applyOverride,
  totalOverridesCount,
  filteredFatal,
  filteredTuning,
  filteredClone,
  filteredSoft,
  getConflictLoadOrderInfo,
  fatalVirtual,
  tuningVirtual,
  cloneVirtual,
  softVirtual,
}: any) {
  return (
    <>
                    {activeTab === "COMMAND" && (
                        <CommandScreenLayout>

                            <CommandScreenBody>
                                <CommandScreenMain>

                                    <div className="flex flex-col gap-4 w-full">
                                        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 w-full">
                                            <CommandScreenSectionHeading
                                                title={t("select_blueprint", "Select {Blueprint}")}
                                                icon={t("icon_map", "map")}
                                            />
                                            <div className="w-full md:w-auto">
                                                <ActionPill
                                                    searchQuery={blueprintSearch}
                                                    setSearchQuery={setBlueprintSearch}
                                                    searchPlaceholder={t("search_blueprints", "Search {Blueprints}...") as string}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                            {playSets.filter((bp: any) => !blueprintSearch || bp.name.toLowerCase().includes(blueprintSearch.toLowerCase())).map((blueprint: any) => {
                                                const isTarget = scanScope === blueprint.name;
                                                const modCount = countBlueprintArtifacts(blueprint.mods, activeGameSchema);
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
                                                        onContextMenu={(e) => {
                                                            const menuItems: SanctuaryContextMenuItem[] = [
                                                                {
                                                                    label: t("btn_scan", "Scan"),
                                                                    icon: t("icon_radar", "radar"),
                                                                    onClick: () => {
                                                                        setScanScope(blueprint.name);
                                                                        runRadar(blueprint.name);
                                                                    },
                                                                },
                                                                {
                                                                    label: t("conflicts", "Conflicts"),
                                                                    icon: t("icon_warning", "warning"),
                                                                    dividerBefore: true,
                                                                    onClick: () => {
                                                                        setScanScope(blueprint.name);
                                                                        if (!hydrateCachedScope(blueprint.name, ignoredPairs)) {
                                                                            runRadar(blueprint.name);
                                                                        }
                                                                        setActiveTab("CONFLICTS");
                                                                    },
                                                                },
                                                                {
                                                                    label: t("tab_overrides", "Overrides"),
                                                                    icon: t("icon_rule", "rule"),
                                                                    onClick: () => {
                                                                        setScanScope(blueprint.name);
                                                                        setActiveTab("OVERRIDES");
                                                                    },
                                                                },
                                                                {
                                                                    label: t("tab_load_order", "Load Order"),
                                                                    icon: t("icon_low_priority", "low_priority"),
                                                                    onClick: () => {
                                                                        setScanScope(blueprint.name);
                                                                        setActiveTab("LOAD_ORDER");
                                                                    },
                                                                },
                                                            ];
                                                            openSanctuaryContextMenu(e, menuItems);
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

                                <CommandScreenSidebar title={t("quick_actions", "Quick Actions")} icon={t("icon_bolt", "bolt")}>
                                    <CommandScreenQuickLink
                                        icon={t("icon_warning", "warning")}
                                        title={t("total_conflicts", "Total Conflicts") || "Total Conflicts"}
                                        subtitle={`${fatalConflicts.length + tuningConflicts.length + cloneConflicts.length + softConflicts.length} ${t("conflicts", "Conflicts")}`}
                                        onClick={() => setActiveTab("CONFLICTS")}
                                        textColorClass={(fatalConflicts.length + tuningConflicts.length) > 0 ? "text-[var(--warning)]" : "text-[var(--text)]"}
                                        hoverTextColorClass="group-hover:text-[var(--warning)]"
                                        iconShadowClass="drop-shadow-md"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon={t("icon_rule", "rule")}
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
                                                : t("lo_strategy_folder_agnostic", "Priority Override Tiers (Folder Depth)")
                                        }`}
                                        onClick={() => setActiveTab("LOAD_ORDER")}
                                        textColorClass="text-[var(--accent)]"
                                        hoverTextColorClass="group-hover:text-[var(--accent)]"
                                        iconShadowClass="drop-shadow-md text-[var(--accent)]"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon={t("icon_visibility_off", "visibility_off")}
                                        title={t("total_ignores", "Total Ignored") || "Total Ignored"}
                                        subtitle={`${ignoredPairs.length} ${t("ignored", "Ignored")}`}
                                        onClick={() => { setActiveTab("OVERRIDES"); setOverrideTab("IGNORED"); }}
                                        textColorClass="text-[var(--subtext)]"
                                        hoverTextColorClass="group-hover:text-[var(--text)]"
                                        iconShadowClass="drop-shadow-md text-[var(--subtext)]"
                                        iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"
                                    />
                                    <CommandScreenQuickLink
                                        icon={loading ? t("icon_sync", "sync") : t("icon_track_changes", "track_changes")}
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
                                        icon={t("icon_undo", "undo")}
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
                                                    {compiledOrder.cycles.map((cyc: any, cIdx: any) => (
                                                        <div
                                                            key={`cycle_conf_${cIdx}`}
                                                            className="p-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] flex items-center justify-between gap-4 flex-wrap"
                                                        >
                                                            <div className="flex items-center gap-2 flex-wrap text-xs font-mono font-bold text-[var(--text)]">
                                                                {cyc.chain.map((node: any, nIdx: any) => (
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
                                                    subtitle={t("tier4_desc_agnostic", "Core script or binary module overlaps detected. Overrides impossible.")}
                                                    icon={t("icon_warning_amber", "warning_amber")}
                                                    iconColorClass="text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                                                />

                                                <div ref={fatalVirtual.containerRef}>
                                                    {fatalVirtual.topPadding > 0 && <div style={{ height: fatalVirtual.topPadding }} aria-hidden="true" />}
                                                    <div ref={fatalVirtual.gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                        {(fatalVirtual.isVirtualized ? filteredFatal.slice(fatalVirtual.startIndex, fatalVirtual.endIndex) : filteredFatal).map((c: any) => (
                                                            <ConflictCard
                                                                key={c.mod_pair}
                                                                conflict={c}
                                                                tier={4}
                                                                loadOrderInfo={getConflictLoadOrderInfo(c)}
                                                                onClick={() => setActiveConflictRes(c)}
                                                                onRemoveA={() => vaultSingleScript(c.modA)}
                                                                onRemoveB={() => vaultSingleScript(c.modB)}
                                                                onIgnore={() => ignoreConflict(c.mod_pair)}
                                                            />
                                                        ))}
                                                    </div>
                                                    {fatalVirtual.bottomPadding > 0 && <div style={{ height: fatalVirtual.bottomPadding }} aria-hidden="true" />}
                                                </div>
                                            </section>
                                        )}

                                        {hasScanned && filteredTuning.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 3) && (
                                            <section className="space-y-6 mt-12">
                                                <CommandScreenSectionHeading
                                                    title={t("tier3_title", "Severity 3 Collisions")}
                                                    subtitle={t("tier3_desc_agnostic", "Structured data or resource chunk overlaps detected. Neutralize via Override.")}
                                                    icon={t("icon_tune", "tune")}
                                                    iconColorClass="text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                                                />

                                                <div ref={tuningVirtual.containerRef}>
                                                    {tuningVirtual.topPadding > 0 && <div style={{ height: tuningVirtual.topPadding }} aria-hidden="true" />}
                                                    <div ref={tuningVirtual.gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                        {(tuningVirtual.isVirtualized ? filteredTuning.slice(tuningVirtual.startIndex, tuningVirtual.endIndex) : filteredTuning).map((c: any) => (
                                                            <ConflictCard
                                                                key={c.mod_pair}
                                                                conflict={c}
                                                                tier={3}
                                                                loadOrderInfo={getConflictLoadOrderInfo(c)}
                                                                onClick={() => setActiveConflictRes(c)}
                                                                onOverrideA={() => applyOverride(c.modA, c.mod_pair, undefined, c.modB)}
                                                                onOverrideB={() => applyOverride(c.modB, c.mod_pair, undefined, c.modA)}
                                                                onRemoveA={() => vaultSingleScript(c.modA)}
                                                                onRemoveB={() => vaultSingleScript(c.modB)}
                                                                onIgnore={() => ignoreConflict(c.mod_pair)}
                                                            />
                                                        ))}
                                                    </div>
                                                    {tuningVirtual.bottomPadding > 0 && <div style={{ height: tuningVirtual.bottomPadding }} aria-hidden="true" />}
                                                </div>
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

                                                <div ref={cloneVirtual.containerRef}>
                                                    {cloneVirtual.topPadding > 0 && <div style={{ height: cloneVirtual.topPadding }} aria-hidden="true" />}
                                                    <div ref={cloneVirtual.gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                        {(cloneVirtual.isVirtualized ? filteredClone.slice(cloneVirtual.startIndex, cloneVirtual.endIndex) : filteredClone).map((c: any) => (
                                                            <ConflictCard
                                                                key={c.mod_pair}
                                                                conflict={c}
                                                                tier={2}
                                                                loadOrderInfo={getConflictLoadOrderInfo(c)}
                                                                isSelectedA={selectedForVault.includes(c.modA)}
                                                                isSelectedB={selectedForVault.includes(c.modB)}
                                                                onKeepA={() => toggleTarget(c.modA, c.modB)}
                                                                onKeepB={() => toggleTarget(c.modB, c.modA)}
                                                                onRemoveA={() => vaultSingleScript(c.modA)}
                                                                onRemoveB={() => vaultSingleScript(c.modB)}
                                                                onIgnore={() => ignoreConflict(c.mod_pair)}
                                                                onClick={() => setActiveConflictRes(c)}
                                                            />
                                                        ))}
                                                    </div>
                                                    {cloneVirtual.bottomPadding > 0 && <div style={{ height: cloneVirtual.bottomPadding }} aria-hidden="true" />}
                                                </div>
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
                                                <div ref={softVirtual.containerRef} className="pt-6 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] mt-4">
                                                    {softVirtual.topPadding > 0 && <div style={{ height: softVirtual.topPadding }} aria-hidden="true" />}
                                                    <div ref={softVirtual.gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                        {(softVirtual.isVirtualized ? filteredSoft.slice(softVirtual.startIndex, softVirtual.endIndex) : filteredSoft).map((c: any) => (
                                                            <ConflictCard
                                                                key={c.mod_pair}
                                                                conflict={c}
                                                                tier={1}
                                                                loadOrderInfo={getConflictLoadOrderInfo(c)}
                                                                onClick={() => setActiveConflictRes(c)}
                                                                onOverrideA={() => applyOverride(c.modA, c.mod_pair, undefined, c.modB)}
                                                                onOverrideB={() => applyOverride(c.modB, c.mod_pair, undefined, c.modA)}
                                                                onRemoveA={() => vaultSingleScript(c.modA)}
                                                                onRemoveB={() => vaultSingleScript(c.modB)}
                                                                onIgnore={() => ignoreConflict(c.mod_pair)}
                                                            />
                                                        ))}
                                                    </div>
                                                    {softVirtual.bottomPadding > 0 && <div style={{ height: softVirtual.bottomPadding }} aria-hidden="true" />}
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                </CommandScreenMain>

                            </CommandScreenBody>
                        </CommandScreenLayout>
                    )}
    </>
  );
}
