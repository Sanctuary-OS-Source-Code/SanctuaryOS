import { createPortal } from "react-dom";
import {
  CustomDropdown,
  HoverTooltip,
  SidePanel,
  ActionButton,
  DashboardStatTile,
  SidePanelFilterBar,
  ActionPill,
  PanelHeaderGroup,
  PanelHeaderButton,
  StatBox,
  openModDossier,
  countBlueprintArtifacts,
} from "../../shared";
import {
  formatDisplayName,
  getFileLabel,
  isScriptExtension,
} from "../../shared";
import { UniversalGroup, SidePanelHeroCard } from "../layouts/ElevatedHubLayout";
import ConflictResolutionSidebar from "../../side-panels/ConflictResolutionSidebar";
import UndoWinnersPanel from "../../side-panels/UndoWinnersPanel";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";

export function ScoutSidePanels({
  isSidePanelOpen,
  setIsSidePanelOpen,
  isLoadOrderPanelOpen,
  setIsLoadOrderPanelOpen,
  selectedLoadOrderMod,
  setSelectedLoadOrderMod,
  t,
  setModPriorityTier,
  addLoadOrderRule,
  removeLoadOrderRule,
  flipLoadOrderRule,
  moveModInLoadOrder,
  autoSortBlueprintLoadOrder,
  equipPlaySet,
  showUndoPanel,
  setShowUndoPanel,
  playSets,
  activeGameSchema,
  scanScope,
  setScanScope,
  ignoredPairs,
  fatalConflicts,
  tuningConflicts,
  cloneConflicts,
  ruleModA,
  setRuleModA,
  ruleModB,
  setRuleModB,
  setRuleDirection,
  ruleDirection,
  pendingTierFolder,
  setPendingTierFolder,
  inspectorMode,
  setInspectorMode,
  inspectorModSearch,
  setInspectorModSearch,
  visiblePickerMods,
  setVisiblePickerMods,
  setShowModPickerInInspector,
  showModPickerInInspector,
  draggedLoadMod,
  setDraggedLoadMod,
  dragOverMod,
  setDragOverMod,
  pointerDragGhost,
  didPointerDragRef,
  editingOrderMod,
  setEditingOrderMod,
  editingOrderVal,
  setEditingOrderVal,
  stripKnownModExt,
  getAgnosticTierMeta,
  activeBlueprintObj,
  compiledOrder,
  activeBlueprintRules,
  elevatedModsCount,
  customLoadOrderCount,
  isSequentialStrategy,
  reorderModInTierSection,
  buildPreviewTierList,
  beginPointerDragCandidate,
  resolveVaultMod,
  openLoadOrderInspector,
  updateSchemaLoadOrderEngine,
  activeConflictRes,
  setActiveConflictRes,
  hydrateCachedScope,
  runRadar,
  vaultSingleScript,
  applyOverride,
  stripPriorityPrefix,
  undoOverride,
  clearAllOverrides,
  getConflictLoadOrderInfo,
  modOverlapMap,
}: any) {
  return (
    <>
            {activeConflictRes && (
                <ConflictResolutionSidebar
                    conflict={activeConflictRes}
                    loadOrderInfo={getConflictLoadOrderInfo(activeConflictRes)}
                    scanScope={scanScope}
                    onRefreshRadar={() => runRadar(scanScope)}
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

            {showUndoPanel && (
                <UndoWinnersPanel
                    isOpen={showUndoPanel}
                    onClose={() => setShowUndoPanel(false)}
                    scanScope={scanScope}
                    onUndoComplete={runRadar}
                    onUndo={undoOverride}
                    onClearAll={clearAllOverrides}
                />
            )}

            {/* Load Order & Rules Inspector SidePanel */}
            {isLoadOrderPanelOpen && (() => {
                const selectedItem = selectedLoadOrderMod
                    ? compiledOrder.items.find((it: any) => it.cleanName.toLowerCase() === selectedLoadOrderMod.toLowerCase()) || null
                    : null;
                const selectedCleanTitle = selectedItem
                    ? stripKnownModExt(selectedItem.displayName)
                    : "";
                const selectedTierIndex = selectedItem
                    ? Math.max(
                          0,
                          compiledOrder.priorityTiers.findIndex(
                              (pt: any) => (pt.folder || "").toLowerCase() === (selectedItem.tierFolder || "").toLowerCase()
                          )
                      )
                    : pendingTierFolder !== null
                    ? Math.max(
                          0,
                          compiledOrder.priorityTiers.findIndex(
                              (pt: any) => (pt.folder || "").toLowerCase() === (pendingTierFolder || "").toLowerCase()
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
                    ? compiledOrder.items.map((it: any) => ({
                          id: it.cleanName,
                          label: isSequentialStrategy
                              ? `#${String(it.index + 1).padStart(3, "0")} • ${stripKnownModExt(it.displayName)}`
                              : stripKnownModExt(it.displayName),
                      }))
                    : [];
                const activeModRules = selectedItem
                    ? activeBlueprintRules.filter(
                          (r: any) =>
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
                    (opt: any) => !normalizedRuleModB || opt.id.toLowerCase() !== normalizedRuleModB.toLowerCase()
                );
                const targetDropdownOptions = modDropdownOptions.filter(
                    (opt: any) => !normalizedRuleModA || opt.id.toLowerCase() !== normalizedRuleModA.toLowerCase()
                );

                const isPriorityPickerMode = inspectorMode === "PRIORITY";
                const isReorderMode = inspectorMode === "REORDER";

                const activeReorderTierFolder =
                    pendingTierFolder !== null
                        ? pendingTierFolder
                        : selectedItem?.tierFolder ||
                          compiledOrder.priorityTiers.find((pt: any) => !!pt.folder)?.folder ||
                          "";
                const activeReorderTierIdx = compiledOrder.priorityTiers.findIndex(
                    (pt: any) => (pt.folder || "").toLowerCase() === activeReorderTierFolder.toLowerCase()
                );
                const activeReorderTierMeta = getAgnosticTierMeta(
                    activeReorderTierFolder,
                    activeReorderTierIdx >= 0 ? activeReorderTierIdx : 1
                );
                const reorderTierMods = compiledOrder.items.filter(
                    (it: any) => (it.tierFolder || "").toLowerCase() === activeReorderTierFolder.toLowerCase()
                );

                const pickerFilteredMods = isLoadOrderPanelOpen
                    ? compiledOrder.items.filter((it: any) => {
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
                                        onClick={() => setShowModPickerInInspector((prev: any) => !prev)}
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
                                        <SidePanelFilterBar className="sm:grid-cols-3 gap-2.5">
                                            {compiledOrder.priorityTiers
                                                .map((pt: any, idx: any) => ({ pt, idx }))
                                                .filter(({ pt, idx }: any) => idx > 0 && !!pt.folder)
                                                .map(({ pt, idx }: any) => {
                                                    const tMeta = getAgnosticTierMeta(pt.folder, idx);
                                                    const countInT = compiledOrder.items.filter(
                                                        (m: any) => (m.tierFolder || "").toLowerCase() === (pt.folder || "").toLowerCase()
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
                                        </SidePanelFilterBar>

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
                                                        .map((it: any, idxInTier: any) => ({ it, idxInTier }))
                                                        .filter(({ it }: any) => {
                                                            const q = inspectorModSearch.trim().toLowerCase();
                                                            if (!q) return true;
                                                            return (
                                                                it.displayName.toLowerCase().includes(q) ||
                                                                it.cleanName.toLowerCase().includes(q)
                                                            );
                                                        })
                                                        .slice(0, visiblePickerMods)
                                                        .map(({ it, idxInTier }: any) => {
                                                            const mTitle = stripKnownModExt(it.displayName);
                                                            const mExt = getFileLabel(it.cleanName, activeGameSchema);
                                                            const isScriptMod =
                                                                String(mExt).toUpperCase().includes("SCRIPT") ||
                                                                isScriptExtension(it.cleanName, activeGameSchema);
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
                                                                                type="text"
                                                                                inputMode="numeric"
                                                                                autoFocus
                                                                                value={editingOrderVal}
                                                                                onChange={(e) => setEditingOrderVal(e.target.value.replace(/[^0-9]/g, ""))}
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
                                                        onClick={() => setVisiblePickerMods((prev: any) => prev + 30)}
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
                                            {pickerFilteredMods.slice(0, visiblePickerMods).map((it: any) => {
                                                const mTitle = stripKnownModExt(it.displayName);
                                                const mExt = getFileLabel(it.cleanName, activeGameSchema);
                                                const isScriptMod =
                                                    String(mExt).toUpperCase().includes("SCRIPT") ||
                                                    isScriptExtension(it.cleanName, activeGameSchema);
                                                const vaultM = resolveVaultMod(it.cleanName);
                                                const mAuthor = vaultM?.author || vaultM?.creator_name || "";
                                                const tIdx = compiledOrder.priorityTiers.findIndex(
                                                    (pt: any) => (pt.folder || "").toLowerCase() === (it.tierFolder || "").toLowerCase()
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
                                                                    : compiledOrder.priorityTiers[1]?.folder || "";
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
                                                onClick={() => setVisiblePickerMods((prev: any) => prev + 30)}
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
                                        {selectedOverlapInfo.entries.map(({ conflict, enemyClean, enemyDisplay, enemyIndex, enemyTierLabel, isWinning, isOverridden, severity }: any) => {
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
                                                                    ? t("lo_badge_core_clash_agnostic", "Core Binary Clash")
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
                                        {compiledOrder.priorityTiers.map((pt: any, idx: any) => {
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
                                                    {String(getFileLabel(selectedItem.cleanName, activeGameSchema)).toUpperCase().includes("SCRIPT") || isScriptExtension(selectedItem.cleanName, activeGameSchema)
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
                                                {activeModRules.map((rule: any) => {
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

            {isSidePanelOpen && (() => {
                const configuredManifest = activeGameSchema?.load_order?.manifest_file || "";
                const strategyList = [
                    {
                        id: "folder_priority",
                        icon: t("icon_folder", "folder"),
                        label: t("lo_strategy_folder_agnostic", "Priority Override Tiers (Folder Depth)"),
                        shortLabel: t("lo_badge_folder_tiers", "Folder Tiers"),
                        desc: t("lo_strategy_folder_desc", "Uses priority override folders and packed directory depth"),
                        manifest: configuredManifest,
                        badge: t("lo_badge_folder_tiers", "Folder Tiers"),
                    },
                    {
                        id: "manifest_list",
                        icon: t("icon_description", "description"),
                        label: t("lo_strategy_manifest", "Manifest List (loadorder.txt)"),
                        shortLabel: t("lo_badge_loadorder_txt", "loadorder.txt"),
                        desc: t("lo_strategy_manifest_desc", "Writes an ordered plain-text manifest file on deployment"),
                        manifest: configuredManifest,
                        badge: t("lo_badge_loadorder_txt", "loadorder.txt"),
                    },
                    {
                        id: "numeric_prefix",
                        icon: t("icon_format_list_numbered", "format_list_numbered"),
                        label: t("lo_strategy_prefix", "Numeric Prefix (001_)"),
                        shortLabel: t("lo_badge_numeric_prefix", "001_<file>"),
                        desc: t("lo_strategy_prefix_desc", "Prefixes deployed filenames with their load sequence index"),
                        manifest: configuredManifest,
                        badge: t("lo_badge_numeric_prefix", "001_<file>"),
                    },
                    {
                        id: "timestamp",
                        icon: t("icon_schedule", "schedule"),
                        label: t("lo_strategy_timestamp", "Timestamp Order"),
                        shortLabel: t("lo_badge_mtime", "mtime"),
                        desc: t("lo_strategy_timestamp_desc", "Staggers file modification timestamps by load sequence"),
                        manifest: configuredManifest,
                        badge: t("lo_badge_mtime", "mtime"),
                    },
                ];
                const activeStrategyMeta =
                    strategyList.find((s) => s.id === compiledOrder.strategy) || strategyList[0];
                const activeClashTotal = fatalConflicts.length + tuningConflicts.length + cloneConflicts.length;
                const scopeOptions = (playSets || []).map((s: any) => {
                    const mCount = countBlueprintArtifacts(s.mods, activeGameSchema);
                    return {
                        id: s.name,
                        label: `${s.name} • ${mCount} ${t("term_mods", "{Mods}")}`,
                    };
                });
                const activeScopeModCount = countBlueprintArtifacts(activeBlueprintObj?.mods, activeGameSchema);

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
}
