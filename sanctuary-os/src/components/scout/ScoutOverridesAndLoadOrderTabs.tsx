import { useState } from "react";
import { useStore } from "../../store";
import {
  HoverTooltip,
  EmptyState,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanel,
  SidePanelHeroCard,
  openModDossier,
} from "../../shared";
import {
  formatDisplayName,
  getFileLabel,
  isScriptExtension,
} from "../../shared";
import { parseLootRulesText } from "../../hooks/playset/lootRuleParser";
import { UniversalCard } from "../universal/UniversalCard";
import { RadarPairPreviewBanner } from "../../shared-components/ConflictCard";
import { parseConflictPairNames } from "../../hooks/playset/conflictPrecomputer";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../../shared-components/ContextMenu";
import {
  CommandScreenLayout,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSectionHeading,
} from "../../hub-components/SharedCommandScreenLayout";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";

export function ScoutOverridesAndLoadOrderTabs({
  isLoadOrderPanelOpen,
  selectedLoadOrderMod,
  t,
  setModPriorityTier,
  addLoadOrderRule,
  removeLoadOrderRule,
  flipLoadOrderRule,
  activeGameSchema,
  showImages,
  scanScope,
  activeTab,
  overrideTab,
  loadOrderSearch,
  setLoadOrderSearch,
  loadOrderSubFilter,
  collapsedTiers,
  setCollapsedTiers,
  draggedLoadMod,
  setDraggedLoadMod,
  dragOverTier,
  setDragOverTier,
  setDragOverMod,
  dragOverMod,
  pointerDragGhost,
  didPointerDragRef,
  editingOrderMod,
  setEditingOrderMod,
  editingOrderVal,
  setEditingOrderVal,
  stripKnownModExt,
  getAgnosticTierMeta,
  compiledOrder,
  activeBlueprintRules,
  ruleLinkedSet,
  standaloneElevatedMods,
  isSequentialStrategy,
  reorderModInTierSection,
  buildPreviewTierList,
  beginPointerDragCandidate,
  resolveVaultMod,
  openLoadOrderInspector,
  setActiveConflictRes,
  runRadar,
  unignoreConflict,
  stripPriorityPrefix,
  undoOverride,
  overridesViewModel,
  modOverlapMap,
  filteredQueue,
  queueVirtual,
  loadOrderDiagnostics,
}: any) {
  const [isLootImportOpen, setIsLootImportOpen] = useState(false);
  const [lootImportText, setLootImportText] = useState("");
  const parsedLootPreview = isLootImportOpen ? parseLootRulesText(lootImportText) : [];

  return (
    <>
                    {activeTab === "OVERRIDES" && (() => {
                        const { allActiveOverrides, trueIgnoredPairs } = overridesViewModel;

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
                                                        rightContent={
                                                            typeof addLoadOrderRule === "function" ? (
                                                                <ActionButton
                                                                    variant="glass"
                                                                    icon={t("icon_upload_file", "upload_file")}
                                                                    label={t("lo_import_loot_rules", "Import Load Rules")}
                                                                    onClick={() => setIsLootImportOpen(true)}
                                                                />
                                                            ) : undefined
                                                        }
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
                                                                    onContextMenu={(e) => {
                                                                        const menuItems: SanctuaryContextMenuItem[] = [
                                                                            {
                                                                                label: t("edit", "Edit"),
                                                                                icon: t("icon_rule", "rule"),
                                                                                onClick: () => openLoadOrderInspector(cleanWinnerPath, undefined, "RULE"),
                                                                            },
                                                                            {
                                                                                label: `${t("btn_inspect", "Inspect {Mod}")}: ${displayWinnerName}`,
                                                                                icon: t("icon_open_in_new", "open_in_new"),
                                                                                dividerBefore: true,
                                                                                onClick: () => openModDossier(vaultWinner || cleanWinnerPath),
                                                                            },
                                                                            {
                                                                                label: `${t("btn_inspect", "Inspect {Mod}")}: ${displayLoserName}`,
                                                                                icon: t("icon_open_in_new", "open_in_new"),
                                                                                onClick: () => openModDossier(vaultLoser || cleanLoserPath),
                                                                            },
                                                                        ];
                                                                        if (override.isRule) {
                                                                            menuItems.push({
                                                                                label: t("lo_flip_rule", "Invert Rule Direction"),
                                                                                icon: t("icon_swap_vert", "swap_vert"),
                                                                                dividerBefore: true,
                                                                                onClick: () => flipLoadOrderRule(scanScope, override.id),
                                                                            });
                                                                        }
                                                                        menuItems.push({
                                                                            label: override.isRule
                                                                                ? t("remove", "Remove")
                                                                                : t("revert_override", "Revert Override"),
                                                                            icon: override.isRule
                                                                                ? t("icon_delete", "delete")
                                                                                : t("icon_undo", "undo"),
                                                                            variant: "danger",
                                                                            dividerBefore: !override.isRule,
                                                                            onClick: () => {
                                                                                if (override.isRule) {
                                                                                    removeLoadOrderRule(scanScope, override.id);
                                                                                } else if (override.isManual) {
                                                                                    undoOverride(cleanWinnerPath).then(() => runRadar());
                                                                                } else {
                                                                                    unignoreConflict(override.pair).then(() =>
                                                                                        undoOverride(cleanWinnerPath).then(() => runRadar())
                                                                                    );
                                                                                }
                                                                            },
                                                                        });
                                                                        openSanctuaryContextMenu(e, menuItems);
                                                                    }}
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
                                                            const [left, rightRaw] = parseConflictPairNames(pair);
                                                            const right = rightRaw || t("unknown_file", "Unknown File");
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
                                                                    onContextMenu={(e) => {
                                                                        const menuItems: SanctuaryContextMenuItem[] = [
                                                                            {
                                                                                label: `${t("btn_inspect", "Inspect {Mod}")}: ${leftDisplay}`,
                                                                                icon: t("icon_open_in_new", "open_in_new"),
                                                                                onClick: () => openModDossier(vaultLeft || leftName),
                                                                            },
                                                                            {
                                                                                label: `${t("btn_inspect", "Inspect {Mod}")}: ${rightDisplay}`,
                                                                                icon: t("icon_open_in_new", "open_in_new"),
                                                                                onClick: () => openModDossier(vaultRight || rightName),
                                                                            },
                                                                            {
                                                                                label: t("unignore_conflict", "Unignore Conflict"),
                                                                                icon: t("icon_visibility", "visibility"),
                                                                                variant: "warning",
                                                                                dividerBefore: true,
                                                                                onClick: () => unignoreConflict(pair).then(() => runRadar()),
                                                                            },
                                                                        ];
                                                                        openSanctuaryContextMenu(e, menuItems);
                                                                    }}
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
                        const visibleQueueSlice = queueVirtual.isVirtualized
                            ? filteredQueue.slice(queueVirtual.startIndex, queueVirtual.endIndex)
                            : filteredQueue;
                        const elevatedTierDefs = compiledOrder.priorityTiers.slice(1);
                        const cycleTierFolder = (currentFolder: string) => {
                            const tiers = compiledOrder.priorityTiers;
                            if (!tiers || tiers.length === 0) return "";
                            const currIdx = tiers.findIndex(
                                (pt: any) => (pt.folder || "").toLowerCase() === (currentFolder || "").toLowerCase()
                            );
                            const nextIdx = (currIdx + 1) % tiers.length;
                            return tiers[nextIdx]?.folder || "";
                        };

                        return (
                            <CommandScreenLayout>
                                <CommandScreenBody>
                                    <CommandScreenMain>
                                        <div className="flex flex-col gap-10 w-full">
                                            {/* Schema-Driven Slot Budget Counters, Missing Masters & Dirty Plugins */}
                                            {(Array.isArray(loadOrderDiagnostics?.slot_usage) &&
                                                loadOrderDiagnostics.slot_usage.length > 0) ||
                                            (Array.isArray(loadOrderDiagnostics?.missing_masters) &&
                                                loadOrderDiagnostics.missing_masters.length > 0) ||
                                            (Array.isArray(loadOrderDiagnostics?.dirty_plugins) &&
                                                loadOrderDiagnostics.dirty_plugins.length > 0) ? (
                                                <div className="flex flex-col gap-4">
                                                    {Array.isArray(loadOrderDiagnostics?.slot_usage) &&
                                                        loadOrderDiagnostics.slot_usage.length > 0 && (
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                {loadOrderDiagnostics.slot_usage.map((bucket: any) => (
                                                                    <span
                                                                        key={bucket.id}
                                                                        className={VAULT_CHIP_CLASS}
                                                                    >
                                                                        <span
                                                                            className={`material-symbols-outlined !text-[13px] ${
                                                                                bucket.over_limit
                                                                                    ? "text-[var(--danger)]"
                                                                                    : "text-[var(--accent)]"
                                                                            }`}
                                                                        >
                                                                            {bucket.over_limit
                                                                                ? t("icon_warning", "warning")
                                                                                : t("icon_storage", "storage")}
                                                                        </span>
                                                                        <span className="text-[var(--subtext)]">
                                                                            {bucket.label}:
                                                                        </span>
                                                                        <span
                                                                            className={
                                                                                bucket.over_limit
                                                                                    ? "text-[var(--danger)]"
                                                                                    : "text-[var(--text)]"
                                                                            }
                                                                        >
                                                                            {bucket.used}
                                                                            {bucket.max_slots > 0
                                                                                ? ` / ${bucket.max_slots}`
                                                                                : ""}
                                                                        </span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                    {Array.isArray(loadOrderDiagnostics?.missing_masters) &&
                                                        loadOrderDiagnostics.missing_masters.length > 0 && (
                                                            <div className="p-5 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] flex flex-col gap-3 animate-in fade-in duration-300">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--warning)]">
                                                                        <span className="material-symbols-outlined !text-[20px]">
                                                                            {t("icon_warning_amber", "warning_amber")}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--warning)] m-0">
                                                                            {t("lo_missing_masters_title", "Missing Required Masters")}
                                                                        </h3>
                                                                        <p className="text-xs text-[var(--subtext)] font-bold m-0">
                                                                            {t(
                                                                                "lo_missing_masters_desc",
                                                                                "One or more {mods} reference upstream dependencies that are not active in this {Blueprint}."
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {loadOrderDiagnostics.missing_masters.map(
                                                                        (mm: any, mIdx: number) => (
                                                                            <span
                                                                                key={`${mm.mod_name}_${mm.missing_master}_${mIdx}`}
                                                                                className={`${VAULT_CHIP_CLASS} font-mono`}
                                                                            >
                                                                                <span className="text-[var(--text)]">
                                                                                    {mm.mod_name}
                                                                                </span>
                                                                                <span className="text-[var(--warning)]">
                                                                                    -&gt; {mm.missing_master}
                                                                                </span>
                                                                            </span>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                    {Array.isArray(loadOrderDiagnostics?.dirty_plugins) &&
                                                        loadOrderDiagnostics.dirty_plugins.length > 0 && (
                                                            <div className="p-5 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] flex flex-col gap-3 animate-in fade-in duration-300">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--warning)]">
                                                                        <span className="material-symbols-outlined !text-[20px]">
                                                                            {t("icon_cleaning_services", "cleaning_services")}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--warning)] m-0">
                                                                            {t("lo_dirty_plugins_title", "Dirty Modules Detected")}
                                                                        </h3>
                                                                        <p className="text-xs text-[var(--subtext)] font-bold m-0">
                                                                            {t(
                                                                                "lo_dirty_plugins_desc",
                                                                                "External load rules flagged identical-to-master (ITM) or deleted records matching known CRC32 signatures."
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {loadOrderDiagnostics.dirty_plugins.map(
                                                                        (dp: any, dIdx: number) => (
                                                                            <span
                                                                                key={`${dp.mod_name}_${dp.crc_hex}_${dIdx}`}
                                                                                className={`${VAULT_CHIP_CLASS} font-mono`}
                                                                            >
                                                                                <span className="text-[var(--text)]">
                                                                                    {dp.mod_name}
                                                                                </span>
                                                                                <span className="text-[var(--warning)]">
                                                                                    {`${dp.crc_hex} (${dp.itm_count} ITM / ${dp.udr_count} UDR • ${dp.cleaning_utility})`}
                                                                                </span>
                                                                            </span>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                </div>
                                            ) : null}

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
                                                        {compiledOrder.cycles.map((cyc: any, cIdx: any) => (
                                                            <div
                                                                key={`cycle_${cIdx}`}
                                                                className="p-3 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] flex items-center justify-between gap-4 flex-wrap"
                                                            >
                                                                <div className="flex items-center gap-2 flex-wrap text-xs font-mono font-bold text-[var(--text)]">
                                                                    {cyc.chain.map((node: any, nIdx: any) => (
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
                                                            <PanelHeaderGroup>
                                                                <PanelHeaderButton
                                                                    icon={t("icon_close", "close")}
                                                                    tooltip={t("clear", "Clear")}
                                                                    onClick={() => setLoadOrderSearch("")}
                                                                />
                                                            </PanelHeaderGroup>
                                                        }
                                                    />
                                                    {filteredQueue.length === 0 ? (
                                                        <EmptyState
                                                            icon={t("icon_search_off", "search_off")}
                                                            title={t("none", "None")}
                                                            subtitle={t("search_ph", "Search {mods}...")}
                                                        />
                                                    ) : (
                                                        <div ref={queueVirtual.containerRef}>
                                                            {queueVirtual.topPadding > 0 && <div style={{ height: queueVirtual.topPadding }} aria-hidden="true" />}
                                                            <div ref={queueVirtual.gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                                                                {visibleQueueSlice.map((item: any) => {
                                                                const isSelected =
                                                                    selectedLoadOrderMod.toLowerCase() === item.cleanName.toLowerCase() &&
                                                                    isLoadOrderPanelOpen;
                                                                const hasRule =
                                                                    ruleLinkedSet.has(item.cleanName.toLowerCase()) || item.autoPromoted;
                                                                const isScript =
                                                                    String(item.extLabel).toUpperCase().includes("SCRIPT") ||
                                                                    isScriptExtension(item.cleanName, activeGameSchema);
                                                                const vaultMod = resolveVaultMod(item.cleanName);
                                                                const topOverlap = item.overlapInfo?.entries?.[0] || null;

                                                                return (
                                                                    <UniversalCard
                                                                        key={item.cleanName}
                                                                        layout="vertical"
                                                                        isActive={isSelected}
                                                                        onClick={() => openLoadOrderInspector(item.cleanName, undefined, "PRIORITY")}
                                                                        onContextMenu={(e) => {
                                                                            const menuItems: SanctuaryContextMenuItem[] = [
                                                                                {
                                                                                    label: t("lo_priority_tier", "Priority Tier"),
                                                                                    icon: t("icon_low_priority", "low_priority"),
                                                                                    onClick: () => openLoadOrderInspector(item.cleanName, undefined, "PRIORITY"),
                                                                                },
                                                                                {
                                                                                    label: t("btn_inspect", "Inspect {Mod}"),
                                                                                    icon: t("icon_open_in_new", "open_in_new"),
                                                                                    onClick: () => openModDossier(vaultMod || item.cleanName),
                                                                                },
                                                                            ];
                                                                            compiledOrder.priorityTiers.forEach((ptOpt: any, idxOpt: number) => {
                                                                                menuItems.push({
                                                                                    label: `T${idxOpt + 1}: ${ptOpt.label || ptOpt.folder}`,
                                                                                    icon: t("icon_workspace_premium", "workspace_premium"),
                                                                                    dividerBefore: idxOpt === 0,
                                                                                    onClick: () => setModPriorityTier(scanScope, item.cleanName, ptOpt.folder),
                                                                                });
                                                                            });
                                                                            if (item.tierFolder) {
                                                                                menuItems.push({
                                                                                    label: t("revert_override", "Revert Override"),
                                                                                    icon: t("icon_undo", "undo"),
                                                                                    variant: "danger",
                                                                                    dividerBefore: true,
                                                                                    onClick: () => setModPriorityTier(scanScope, item.cleanName, ""),
                                                                                });
                                                                            }
                                                                            openSanctuaryContextMenu(e, menuItems);
                                                                        }}
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
                                                            {queueVirtual.bottomPadding > 0 && <div style={{ height: queueVirtual.bottomPadding }} aria-hidden="true" />}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ========================================================================== */}
                                            {/* PRIORITY TIERS 1-3: 3 COLLAPSIBLE ROWS WITH MASONHUB-SIZED CARDS & DRAG    */}
                                            {/* ========================================================================== */}
                                            {elevatedTierDefs.map((pt: any, idx: any) => {
                                                const tierNumber = idx + 1;
                                                const filterId = `TIER_${tierNumber}` as "TIER_1" | "TIER_2" | "TIER_3";
                                                if (loadOrderSubFilter !== "ALL" && loadOrderSubFilter !== filterId) {
                                                    return null;
                                                }

                                                const tierMeta = getAgnosticTierMeta(pt.folder, tierNumber);
                                                const tierMods = standaloneElevatedMods.filter(
                                                    (it: any) => (it.tierFolder || "").toLowerCase() === (pt.folder || "").toLowerCase()
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
                                                            breadcrumb={`${tierMods.length}`}
                                                            rightContent={
                                                                <PanelHeaderGroup>
                                                                    <PanelHeaderButton
                                                                        icon={
                                                                            isCollapsed
                                                                                ? t("icon_expand_more", "expand_more")
                                                                                : t("icon_expand_less", "expand_less")
                                                                        }
                                                                        tooltip={isCollapsed ? t("expand", "Expand") : t("collapse", "Collapse")}
                                                                        onClick={() =>
                                                                            setCollapsedTiers((prev: any) => ({
                                                                                ...prev,
                                                                                [pt.id]: !prev[pt.id],
                                                                            }))
                                                                        }
                                                                    />
                                                                </PanelHeaderGroup>
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

                                                                {displayTierMods.map((it: any, modIdxInTier: any) => {
                                                                    const cleanTitle = stripKnownModExt(it.displayName);
                                                                    const extLabel = getFileLabel(it.cleanName, activeGameSchema);
                                                                    const isScript =
                                                                        String(extLabel).toUpperCase().includes("SCRIPT") ||
                                                                        isScriptExtension(it.cleanName, activeGameSchema);
                                                                    const isSelected =
                                                                        selectedLoadOrderMod.toLowerCase() ===
                                                                            it.cleanName.toLowerCase() && isLoadOrderPanelOpen;
                                                                    const isEditingNum =
                                                                        editingOrderMod?.toLowerCase() === it.cleanName.toLowerCase();
                                                                    const vaultMod = resolveVaultMod(it.cleanName);
                                                                    const overlapInfo = modOverlapMap.get(it.cleanName.toLowerCase());
                                                                    const topOverlap = overlapInfo?.entries?.[0] || null;
                                                                    const modRule = activeBlueprintRules.find(
                                                                        (r: any) =>
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
                                                                                onContextMenu={(e) => {
                                                                                    const menuItems: SanctuaryContextMenuItem[] = [
                                                                                        {
                                                                                            label: t("lo_priority_tier", "Priority Tier"),
                                                                                            icon: t("icon_low_priority", "low_priority"),
                                                                                            onClick: () => openLoadOrderInspector(it.cleanName, undefined, "PRIORITY"),
                                                                                        },
                                                                                        {
                                                                                            label: t("btn_inspect", "Inspect {Mod}"),
                                                                                            icon: t("icon_open_in_new", "open_in_new"),
                                                                                            onClick: () => openModDossier(vaultMod || it.cleanName),
                                                                                        },
                                                                                    ];
                                                                                    compiledOrder.priorityTiers.forEach((ptOpt: any, idxOpt: number) => {
                                                                                        if (String(ptOpt.folder || "").toLowerCase() !== String(it.tierFolder || "").toLowerCase()) {
                                                                                            menuItems.push({
                                                                                                label: `T${idxOpt + 1}: ${ptOpt.label || ptOpt.folder}`,
                                                                                                icon: t("icon_workspace_premium", "workspace_premium"),
                                                                                                dividerBefore: menuItems.length === 2,
                                                                                                onClick: () => setModPriorityTier(scanScope, it.cleanName, ptOpt.folder),
                                                                                            });
                                                                                        }
                                                                                    });
                                                                                    menuItems.push({
                                                                                        label: t("revert_override", "Revert Override"),
                                                                                        icon: t("icon_undo", "undo"),
                                                                                        variant: "danger",
                                                                                        dividerBefore: true,
                                                                                        onClick: () => setModPriorityTier(scanScope, it.cleanName, ""),
                                                                                    });
                                                                                    openSanctuaryContextMenu(e, menuItems);
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
                                                                                                    type="text"
                                                                                                    inputMode="numeric"
                                                                                                    autoFocus
                                                                                                    value={editingOrderVal}
                                                                                                    onChange={(e) =>
                                                                                                        setEditingOrderVal(e.target.value.replace(/[^0-9]/g, ""))
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
                                                                                                        ? t("lo_badge_core_clash_agnostic", "Core Binary Clash")
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
      <SidePanel
        isOpen={isLootImportOpen}
        onClose={() => setIsLootImportOpen(false)}
        title={t("lo_import_loot_rules", "Import Load Rules")}
        subtitle={t("lo_import_loot_subtitle", "Import LOOT YAML or JSON load order rules into {Vault}.")}
        icon={t("icon_upload_file", "upload_file")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[92vw] md:w-[600px]"
        headerActions={
          <PanelHeaderGroup>
            <span className={`${VAULT_CHIP_CLASS} px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--accent)]`}>
              {parsedLootPreview.length} {t("load_order_rules", "Load Order Rules")}
            </span>
            <PanelHeaderButton
              icon={t("icon_close", "close")}
              tooltip={t("close", "Close")}
              onClick={() => setIsLootImportOpen(false)}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 pb-6">
          <SidePanelHeroCard
            icon={t("icon_upload_file", "upload_file")}
            overline={t("load_order_rules", "Load Order Rules")}
            title={t("lo_import_loot_rules", "Import Load Rules")}
            description={t(
              "lo_import_loot_desc",
              "Paste LOOT userlist YAML or JSON plugin rules, or pick a .yaml / .json file to import directional load rules."
            )}
            badge={`${parsedLootPreview.length}`}
            variant="accent"
          />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text)] cursor-pointer inline-flex items-center gap-2 transition-all">
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                {t("icon_folder_open", "folder_open")}
              </span>
              <span>{t("lo_choose_rules_file", "Choose YAML / JSON File")}</span>
              <input
                type="file"
                accept=".yaml,.yml,.json,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      setLootImportText(reader.result);
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
            {lootImportText.trim().length > 0 && (
              <ActionButton
                variant="glass"
                icon={t("icon_delete_sweep", "delete_sweep")}
                label={t("clear", "Clear")}
                onClick={() => setLootImportText("")}
              />
            )}
          </div>

          <textarea
            value={lootImportText}
            onChange={(e) => setLootImportText(e.target.value)}
            rows={11}
            placeholder={t(
              "lo_import_loot_placeholder",
              "plugins:\n  - name: 'Patch.mod'\n    after:\n      - 'BaseModule.mod'"
            )}
            className="w-full glass-surface rounded-2xl p-3.5 text-xs font-mono text-[var(--text)] outline-none border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] resize-y"
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <ActionButton
              variant="glass"
              icon={t("icon_close", "close")}
              label={t("cancel", "Cancel")}
              onClick={() => setIsLootImportOpen(false)}
            />
            <ActionButton
              variant="accent"
              icon={t("icon_check", "check")}
              label={t("lo_apply_imported_rules", "Apply Rules")}
              disabled={parsedLootPreview.length === 0 || typeof addLoadOrderRule !== "function"}
              onClick={() => {
                for (const r of parsedLootPreview) {
                  addLoadOrderRule(scanScope, r.modA, r.modB, r.type);
                }
                useStore
                  .getState()
                  .pushStatus(
                    t("lo_imported_rules_toast", "Imported {count} load order rule(s).").replace(
                      "{count}",
                      String(parsedLootPreview.length)
                    ),
                    "success"
                  );
                setLootImportText("");
                setIsLootImportOpen(false);
              }}
            />
          </div>
        </div>
      </SidePanel>
    </>
  );
}
