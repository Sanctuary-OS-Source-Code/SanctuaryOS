import {
  ModSearchDropdown,
  getModIcon,
  HoverTooltip,
  EmptyState,
} from "../../shared";
import {
  CommandScreenSectionHeading,
  CommandScreenBody,
  CommandScreenMain,
} from "../../hub-components/SharedCommandScreenLayout";
import { UniversalCard } from "../universal/UniversalCard";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../../shared-components/ContextMenu";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";
import { supabase } from "../../supabase";
import { KnownErrorRulesManager } from "../KnownExceptionRules";
import {
  resolveLabReportNumber,
  getCleanModBaseName,
  getModExtensionLabel,
  getModVersionLabel,
  resolveRealReportMod,
} from "../../utils/logScrubber";
import { parseLabTimestamp } from "./labHelpers";

export function LabBuilderAndReportsTabs({
  activeLabMod,
  setActiveLabMod,
  modList,
  onOpenDossier,
  shelterActive,
  conflictTarget,
  setConflictTarget,
  submitLabReport,
  t,
  activeGameSchema,
  selectedVersion,
  linkedTool,
  airgapStatus,
  testSaveStatus,
  setShowTestSaveModal,
  memoryDismissedRef,
  stagedExtras,
  setStagedExtras,
  conflictExtras,
  setConflictExtras,
  missingDeps,
  setShowTestPanel,
  activeTab,
  setActiveTab,
  setSelectedReport,
  handleToggleAirgap,
  knownErrorSearch,
  setKnownErrorSearch,
  builderSearch,
  builderFilter,
  builderPage,
  setBuilderPage,
  setKnownErrorFilter,
  knownErrorFilter,
  setKnownErrorLabBehavior,
  knownErrorLabBehavior,
  setKnownErrorFileHint,
  knownErrorFileHint,
  knownErrorSort,
  runCombinedHotSwap,
  builderSymbioticMods,
  builderPrimaryAdversaryMods,
  builderExtraAdversaryMods,
  abortLab,
  testedModHashes,
  filteredBuilderCandidates,
  reportsToList,
  filteredReports,
  canSubmitLabReportItem,
}: any) {
  return (
    <>
      {activeTab === "BUILDER" && (() => {
        const BUILDER_PAGE_SIZE = 24;
        const totalBuilderPages = Math.max(
          1,
          Math.ceil(filteredBuilderCandidates.length / BUILDER_PAGE_SIZE)
        );
        const safeBuilderPage = Math.min(builderPage, totalBuilderPages);
        const pagedCandidates = filteredBuilderCandidates.slice(
          (safeBuilderPage - 1) * BUILDER_PAGE_SIZE,
          safeBuilderPage * BUILDER_PAGE_SIZE
        );
        const renderBenchModCard = (
          m: any,
          opts: {
            iconColorClass: string;
            onRemove: () => void;
            companionMods?: any[];
          }
        ) => {
          const itemExt = getModExtensionLabel(
            m,
            activeGameSchema,
            modList,
            opts.companionMods
          );
          const itemVer = getModVersionLabel(m, modList, opts.companionMods);
          const itemMeta =
            [
              itemExt,
              itemVer && itemVer !== "Local" ? `v${itemVer}` : "",
            ]
              .filter(Boolean)
              .join(" • ") || t("term_mod", "Mod");

          return (
            <div
              key={m.hash || m.name}
              className="glass-surface rounded-xl p-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-9 h-9 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0 ${opts.iconColorClass}`}
                >
                  <span className="material-symbols-outlined !text-[18px]">
                    {getModIcon(m, activeGameSchema, t)}
                  </span>
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-black text-[var(--text)] truncate">
                    {getCleanModBaseName(m)}
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--subtext)] truncate">
                    {itemMeta}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onOpenDossier && (
                  <button
                    type="button"
                    onClick={() => onOpenDossier(m)}
                    className="relative group/inspbtn w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_deployed_code", "deployed_code")}
                    </span>
                    <HoverTooltip
                      className="z-[100] !right-0 !translate-x-0 !left-auto"
                      title={t("inspect", "Inspect")}
                    />
                  </button>
                )}
                <button
                  type="button"
                  onClick={opts.onRemove}
                  className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              </div>
            </div>
          );
        };

        return (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full pb-32">
            <CommandScreenBody>
              {/* LEFT PANE: VAULT MOD CATALOG */}
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading
                    title={t("lab_vault_catalog_title", "{Vault} {Mods}")}
                    subtitle={t(
                      "lab_vault_catalog_subtitle",
                      "Select a {mod} to isolate and test in the sandbox"
                    )}
                    icon={t("icon_inventory_2", "inventory_2")}
                  />

                  {filteredBuilderCandidates.length === 0 ? (
                    <EmptyState
                      icon={
                        builderSearch || builderFilter !== "all"
                          ? t("icon_search_off", "search_off")
                          : t("icon_science", "science")
                      }
                      title={
                        builderSearch || builderFilter !== "all"
                          ? t("no_matches", "No matches found")
                          : t("shared_no_signatures", "No Signatures Found")
                      }
                    />
                  ) : (
                    <>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(235px,1fr))] gap-3.5 w-full">
                        {pagedCandidates.map((candidate: any, idx: number) => {
                          const isPrimaryStaged = Boolean(
                            activeLabMod &&
                              ((candidate.hash && activeLabMod.hash === candidate.hash) ||
                                (!candidate.hash && activeLabMod.name === candidate.name))
                          );
                          const isExtraStaged = Boolean(
                            candidate.hash && stagedExtras.some((e: any) => e.hash === candidate.hash)
                          );
                          const isConflictStaged = Boolean(
                            candidate.hash &&
                              ((conflictTarget && conflictTarget.hash === candidate.hash) ||
                                conflictExtras.some((e: any) => e.hash === candidate.hash))
                          );
                          const isAnyStaged = isPrimaryStaged || isExtraStaged || isConflictStaged;
                          const isTested = Boolean(
                            candidate?.hash && testedModHashes.has(candidate.hash)
                          );
                          const candExt = getModExtensionLabel(candidate, activeGameSchema, modList);
                          const candVer = getModVersionLabel(candidate, modList);
                          const candAuthor = candidate.author || candidate.master_author || "";
                          const candStatusLower = String(candidate?.status || "").toLowerCase();
                          const isFlagged =
                            candStatusLower.includes("unstable") ||
                            candStatusLower.includes("corrupted") ||
                            candStatusLower.includes("broken");

                          const cleanTitle = getCleanModBaseName(candidate);
                          const modIcon = getModIcon(candidate, activeGameSchema, t);
                          const metaParts = [
                            candAuthor ? getCleanModBaseName(candAuthor) : "",
                            candExt || "",
                            candVer && candVer !== "Local" ? `v${candVer}` : "",
                          ].filter(Boolean);

                          let chipIcon = t("icon_schedule", "schedule");
                          let chipIconColor = "text-[var(--subtext)]";
                          let chipLabel = t("lab_status_untested", "Untested");

                          if (isPrimaryStaged) {
                            chipIcon = t("icon_science", "science");
                            chipIconColor = "text-[var(--accent)]";
                            chipLabel = t("lab_role_primary", "Primary {Mod}");
                          } else if (isExtraStaged) {
                            chipIcon = t("icon_hub", "hub");
                            chipIconColor = "text-[var(--accent)]";
                            chipLabel = t("lab_role_dependency", "Dependency");
                          } else if (isConflictStaged) {
                            chipIcon = t("icon_compare_arrows", "compare_arrows");
                            chipIconColor = "text-[var(--warning)]";
                            chipLabel = t("lab_role_conflict", "Conflict Check");
                          } else if (isFlagged) {
                            chipIcon = t("icon_warning", "warning");
                            chipIconColor = "text-[var(--warning)]";
                            chipLabel = t("label_unstable", "Unstable");
                          } else if (isTested) {
                            chipIcon = t("icon_check_circle", "check_circle");
                            chipIconColor = "text-[var(--success)]";
                            chipLabel = t("lab_status_tested", "Tested");
                          }

                          return (
                            <div
                              key={candidate.hash || `${candidate.name}-${idx}`}
                              onClick={() => {
                                memoryDismissedRef.current = false;
                                if (!isPrimaryStaged) {
                                  setActiveLabMod(candidate);
                                  if (isConflictStaged && conflictTarget?.hash === candidate.hash) {
                                    setConflictTarget(null);
                                  }
                                }
                              }}
                              onContextMenu={(e) => {
                                const menuItems: SanctuaryContextMenuItem[] = [
                                  {
                                    label: t("select", "Select"),
                                    icon: t("icon_science", "science"),
                                    variant: "accent",
                                    onClick: () => {
                                      memoryDismissedRef.current = false;
                                      setActiveLabMod(candidate);
                                    },
                                  },
                                ];
                                if (activeLabMod && !isPrimaryStaged) {
                                  menuItems.push({
                                    label: isExtraStaged
                                      ? t("remove", "Remove")
                                      : t("lab_add_as_dep", "Add as Dependency"),
                                    icon: isExtraStaged
                                      ? t("icon_close", "close")
                                      : t("icon_hub", "hub"),
                                    onClick: () => {
                                      if (isExtraStaged) {
                                        setStagedExtras(
                                          stagedExtras.filter((x: any) => x.hash !== candidate.hash)
                                        );
                                      } else {
                                        setStagedExtras([...stagedExtras, candidate]);
                                      }
                                    },
                                  });
                                  menuItems.push({
                                    label: isConflictStaged
                                      ? t("remove", "Remove")
                                      : t("lab_set_as_conflict", "Test Conflict Against"),
                                    icon: isConflictStaged
                                      ? t("icon_close", "close")
                                      : t("icon_compare_arrows", "compare_arrows"),
                                    onClick: () => {
                                      if (isConflictStaged) {
                                        if (conflictTarget?.hash === candidate.hash) {
                                          setConflictTarget(null);
                                        }
                                        setConflictExtras(
                                          conflictExtras.filter((x: any) => x.hash !== candidate.hash)
                                        );
                                      } else {
                                        setConflictTarget(candidate);
                                      }
                                    },
                                  });
                                }
                                if (onOpenDossier) {
                                  menuItems.push({
                                    label: t("inspect", "Inspect"),
                                    icon: t("icon_deployed_code", "deployed_code"),
                                    dividerBefore: true,
                                    onClick: () => onOpenDossier(candidate),
                                  });
                                }
                                openSanctuaryContextMenu(e, menuItems);
                              }}
                              className={`glass-panel rounded-2xl p-3.5 border transition-all duration-200 flex flex-col justify-between gap-3 cursor-pointer group ${
                                isPrimaryStaged
                                  ? "sa-card-selected border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                                  : isAnyStaged
                                    ? "border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
                                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                              }`}
                            >
                              {/* Top Tier: Icon Well + Clean Mod Title & Metadata */}
                              <div className="flex items-center gap-3 min-w-0 w-full">
                                <div
                                  className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                                    isAnyStaged ? "text-[var(--accent)]" : "text-[var(--text)]"
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[20px]">
                                    {modIcon}
                                  </span>
                                </div>

                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
                                    <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
                                      {cleanTitle}
                                    </span>
                                    <HoverTooltip
                                      className="z-[100]"
                                      title={cleanTitle}
                                      icon={modIcon}
                                    />
                                  </div>

                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0 truncate opacity-85">
                                    <span className="truncate">
                                      {metaParts.join(" • ") || t("term_mod", "Mod")}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Bottom Bar: Neutral VAULT_CHIP_CLASS Status on Left | Clear Contextual Actions on Right */}
                              <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className={`material-symbols-outlined !text-[12px] shrink-0 ${chipIconColor}`}>
                                    {chipIcon}
                                  </span>
                                  <span>{chipLabel}</span>
                                </span>

                                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                  {!activeLabMod ? (
                                    <span className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] group-hover:text-[var(--accent)] flex items-center gap-1 transition-all">
                                      <span>{t("select", "Select")}</span>
                                      <span className="material-symbols-outlined !text-[13px]">
                                        {t("icon_arrow_forward", "arrow_forward")}
                                      </span>
                                    </span>
                                  ) : isPrimaryStaged ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        abortLab();
                                      }}
                                      className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--danger)] flex items-center gap-1 transition-all cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined !text-[13px]">
                                        {t("icon_close", "close")}
                                      </span>
                                      <span>{t("clear", "Clear")}</span>
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isExtraStaged) {
                                            setStagedExtras(
                                              stagedExtras.filter((x: any) => x.hash !== candidate.hash)
                                            );
                                          } else {
                                            if (conflictTarget?.hash === candidate.hash) {
                                              setConflictTarget(null);
                                            }
                                            setConflictExtras(
                                              conflictExtras.filter((x: any) => x.hash !== candidate.hash)
                                            );
                                            setStagedExtras([...stagedExtras, candidate]);
                                          }
                                        }}
                                        className={`relative group/depbtn h-7 px-2 rounded-lg glass-surface border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                                          isExtraStaged
                                            ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)]"
                                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                        }`}
                                      >
                                        <span
                                          className={`material-symbols-outlined !text-[13px] ${
                                            isExtraStaged ? "text-[var(--accent)]" : ""
                                          }`}
                                        >
                                          {isExtraStaged
                                            ? t("icon_check", "check")
                                            : t("icon_hub", "hub")}
                                        </span>
                                        <span>{t("lab_btn_dep_short", "Dep")}</span>
                                        <HoverTooltip
                                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                                          title={
                                            isExtraStaged
                                              ? t("remove", "Remove")
                                              : t("lab_add_as_dep", "Add as Dependency")
                                          }
                                          icon={t("icon_hub", "hub")}
                                        />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isConflictStaged) {
                                            if (conflictTarget?.hash === candidate.hash) {
                                              setConflictTarget(null);
                                            }
                                            setConflictExtras(
                                              conflictExtras.filter((x: any) => x.hash !== candidate.hash)
                                            );
                                          } else {
                                            setStagedExtras(
                                              stagedExtras.filter((x: any) => x.hash !== candidate.hash)
                                            );
                                            setConflictTarget(candidate);
                                          }
                                        }}
                                        className={`relative group/vsbtn h-7 px-2 rounded-lg glass-surface border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                                          isConflictStaged
                                            ? "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--text)]"
                                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                        }`}
                                      >
                                        <span
                                          className={`material-symbols-outlined !text-[13px] ${
                                            isConflictStaged ? "text-[var(--warning)]" : ""
                                          }`}
                                        >
                                          {isConflictStaged
                                            ? t("icon_check", "check")
                                            : t("icon_compare_arrows", "compare_arrows")}
                                        </span>
                                        <span>{t("vs", "vs")}</span>
                                        <HoverTooltip
                                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                                          title={
                                            isConflictStaged
                                              ? t("remove", "Remove")
                                              : t("lab_set_as_conflict", "Test Conflict Against")
                                          }
                                          icon={t("icon_compare_arrows", "compare_arrows")}
                                        />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {totalBuilderPages > 1 && (
                        <div className="flex items-center justify-center gap-3 pt-2 select-none">
                          <button
                            type="button"
                            disabled={safeBuilderPage === 1}
                            onClick={() => setBuilderPage((p: any) => Math.max(1, p - 1))}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_chevron_left", "chevron_left")}
                            </span>
                            <span>{t("prev", "Prev")}</span>
                          </button>

                          <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-black text-[var(--subtext)] font-mono">
                            <span className="text-[var(--accent)]">{safeBuilderPage}</span>
                            <span className="opacity-40">/</span>
                            <span>{totalBuilderPages}</span>
                          </div>

                          <button
                            type="button"
                            disabled={safeBuilderPage >= totalBuilderPages}
                            onClick={() => setBuilderPage((p: any) => Math.min(totalBuilderPages, p + 1))}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                          >
                            <span>{t("next", "Next")}</span>
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_chevron_right", "chevron_right")}
                            </span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CommandScreenMain>

              {/* RIGHT PANE: STICKY ACTIVE TEST BENCH */}
              <div className="w-full lg:w-[400px] xl:w-[420px] shrink-0 lg:sticky lg:top-4 self-start flex flex-col gap-4">
                <CommandScreenSectionHeading
                  title={t("lab_test_bench_title", "Active Test Bench")}
                  subtitle={t(
                    "lab_test_bench_subtitle",
                    "Configure dependencies, conflicts, and sandbox safeguards"
                  )}
                  icon={t("icon_science", "science")}
                />

                <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
                  {/* STEP 1: PRIMARY MOD */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                          {t("icon_science", "science")}
                        </span>
                        <span>{t("lab_slot_primary_title", "1. Primary {Mod}")}</span>
                      </span>
                      {activeLabMod && (
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_check_circle", "check_circle")}
                          </span>
                          <span>{t("selected", "Selected")}</span>
                        </span>
                      )}
                    </div>

                    {!activeLabMod ? (
                      <div className="rounded-xl p-5 glass-surface border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col items-center justify-center text-center gap-2">
                        <div className="w-10 h-10 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)] flex items-center justify-center">
                          <span className="material-symbols-outlined !text-[20px]">
                            {t("icon_science", "science")}
                          </span>
                        </div>
                        <span className="text-xs font-black text-[var(--text)]">
                          {t("lab_empty_primary_title", "Select a {Mod} to Test")}
                        </span>
                        <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0 max-w-[280px]">
                          {t(
                            "lab_empty_primary_desc",
                            "Pick any {mod} from the catalog on the left to load it into an isolated test session."
                          )}
                        </p>
                      </div>
                    ) : (
                      renderBenchModCard(activeLabMod, {
                        iconColorClass: "text-[var(--accent)]",
                        onRemove: abortLab,
                        companionMods: stagedExtras,
                      })
                    )}

                    {activeLabMod && missingDeps.length > 0 && (
                      <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--text)]">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">
                            {t("icon_warning", "warning")}
                          </span>
                          <span>{t("missing_deps", "Missing Dependencies")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {missingDeps.map((depObj: any, idx: any) => {
                            const depName =
                              typeof depObj === "string"
                                ? depObj
                                : depObj.displayName || depObj.name || t("unknown", "Unknown");
                            const depId = typeof depObj === "string" ? null : depObj.id;
                            return (
                              <button
                                key={depId || idx}
                                type="button"
                                onClick={async () => {
                                  if (!onOpenDossier) return;
                                  let data = null;
                                  if (depId) {
                                    const { data: d } = await supabase
                                      .from("mods")
                                      .select("*")
                                      .eq("id", depId)
                                      .eq("compliance_tier", 0)
                                      .in("status", ["stable", "unstable", "corrupted", "pending"])
                                      .single();
                                    data = d;
                                  } else {
                                    const searchTerms = depName
                                      .split(" ")
                                      .map((term: string) => term.trim())
                                      .filter(Boolean)
                                      .join("%");
                                    const { data: d } = await supabase
                                      .from("mods")
                                      .select("*")
                                      .ilike("name", `%${searchTerms}%`)
                                      .eq("compliance_tier", 0)
                                      .in("status", ["stable", "unstable", "corrupted", "pending"])
                                      .limit(1)
                                      .maybeSingle();
                                    data = d;
                                  }
                                  if (data) {
                                    onOpenDossier({ ...data, isNexusView: true });
                                  } else {
                                    onOpenDossier({
                                      name: depName,
                                      displayName: depName,
                                      isNexusView: true,
                                    });
                                  }
                                }}
                                className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] cursor-pointer transition-colors`}
                              >
                                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                                  {t("icon_warning", "warning")}
                                </span>
                                <span>{getCleanModBaseName(depName)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* STEP 2: DEPENDENCIES */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                          {t("icon_hub", "hub")}
                        </span>
                        <span>{t("lab_slot_deps_title", "2. Dependencies")}</span>
                      </span>
                      <span className={VAULT_CHIP_CLASS}>
                        <span>{stagedExtras.length}</span>
                      </span>
                    </div>

                    <ModSearchDropdown
                      modList={builderSymbioticMods}
                      selectedItem={null}
                      onSelect={(m: any) => {
                        if (m && !stagedExtras.find((e: any) => e.hash === m.hash)) {
                          setStagedExtras([...stagedExtras, m]);
                        }
                      }}
                      onClear={() => {}}
                      placeholder={t("add_extra", "Add extra dependency...")}
                    />

                    {stagedExtras.length > 0 ? (
                      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-0.5">
                        {stagedExtras.map((m: any) =>
                          renderBenchModCard(m, {
                            iconColorClass: "text-[var(--accent)]",
                            onRemove: () =>
                              setStagedExtras(
                                stagedExtras.filter((x: any) => x.hash !== m.hash)
                              ),
                            companionMods: activeLabMod ? [activeLabMod] : undefined,
                          })
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] font-medium text-[var(--subtext)] opacity-75 px-0.5">
                        {t(
                          "lab_builder_no_deps_hint",
                          "No extra dependencies staged — only the primary {mod} will load."
                        )}
                      </span>
                    )}
                  </div>

                  {/* STEP 3: OPTIONAL CONFLICT CHECK */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                          {t("icon_compare_arrows", "compare_arrows")}
                        </span>
                        <span>{t("lab_slot_conflict_title", "3. Conflict Check")}</span>
                      </span>
                      <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-65">
                        {t("lab_optional_label", "Optional")}
                      </span>
                    </div>

                    {!conflictTarget ? (
                      <ModSearchDropdown
                        modList={builderPrimaryAdversaryMods}
                        selectedItem={conflictTarget}
                        onSelect={setConflictTarget}
                        onClear={() => setConflictTarget(null)}
                        placeholder={t(
                          "lab_conflict_ph",
                          "Test compatibility against another {mod}..."
                        )}
                      />
                    ) : (
                      <ModSearchDropdown
                        modList={builderExtraAdversaryMods}
                        selectedItem={null}
                        onSelect={(m: any) => {
                          if (m && !conflictExtras.find((e: any) => e.hash === m.hash)) {
                            setConflictExtras([...conflictExtras, m]);
                          }
                        }}
                        onClear={() => {}}
                        placeholder={t("add_extra", "Add extra dependency...")}
                      />
                    )}

                    {conflictTarget && (
                      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-0.5">
                        {renderBenchModCard(conflictTarget, {
                          iconColorClass: "text-[var(--warning)]",
                          onRemove: () => {
                            setConflictTarget(null);
                            setConflictExtras([]);
                          },
                          companionMods: conflictExtras,
                        })}

                        {conflictExtras.map((m: any) =>
                          renderBenchModCard(m, {
                            iconColorClass: "text-[var(--subtext)]",
                            onRemove: () =>
                              setConflictExtras(
                                conflictExtras.filter((x: any) => x.hash !== m.hash)
                              ),
                            companionMods: conflictTarget ? [conflictTarget] : undefined,
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* SANDBOX SAFEGUARDS STRIP */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <button
                      type="button"
                      onClick={() => setShowTestSaveModal(true)}
                      className="glass-surface rounded-xl p-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex items-center gap-2 text-left transition-colors cursor-pointer min-w-0"
                    >
                      <span
                        className={`material-symbols-outlined !text-[17px] shrink-0 ${
                          testSaveStatus?.has_test_save
                            ? "text-[var(--accent)]"
                            : "text-[var(--warning)]"
                        }`}
                      >
                        {t("icon_save", "save")}
                      </span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] truncate">
                          {t("lab_bench_save_label", "Test Save")}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {testSaveStatus?.active_test_save?.file_name ||
                            t("lab_test_save_btn_setup", "Set Up Test Save")}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleAirgap(!airgapStatus.active)}
                      className="glass-surface rounded-xl p-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex items-center gap-2 text-left transition-colors cursor-pointer min-w-0"
                    >
                      <span
                        className={`material-symbols-outlined !text-[17px] shrink-0 ${
                          airgapStatus.active ? "text-[var(--success)]" : "text-[var(--subtext)]"
                        }`}
                      >
                        {t("icon_shield_lock", "shield_lock")}
                      </span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] truncate">
                          {t("lab_save_airgap_title", "Save Airgap Shield")}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {airgapStatus.active
                            ? t("enabled", "Enabled")
                            : t("lab_airgap_auto_on_run", "Auto on Launch")}
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* PRIMARY LAUNCH CTA */}
                  <div className="flex flex-col gap-2 pt-1">
                    {!shelterActive ? (
                      <>
                        <div className="flex items-center gap-2 w-full">
                          <button
                            type="button"
                            disabled={!activeLabMod}
                            onClick={() => runCombinedHotSwap()}
                            className="flex-1 py-3 px-4 rounded-xl glass-surface sa-glass-pill-active text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <span className="material-symbols-outlined !text-[17px] text-[var(--accent)]">
                              {t("icon_bolt", "bolt")}
                            </span>
                            <span>{t("btn_initiate_swap", "Conduct Experiment")}</span>
                          </button>

                          {activeLabMod && (
                            <button
                              type="button"
                              onClick={abortLab}
                              className="py-3 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-xs font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                            >
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_restart_alt", "restart_alt")}
                              </span>
                              <span>{t("clear", "Clear")}</span>
                            </button>
                          )}
                        </div>
                        {linkedTool && activeLabMod && (
                          <button
                            type="button"
                            onClick={() => runCombinedHotSwap(linkedTool.path)}
                            className="w-full py-2.5 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                              {t("icon_build_circle", "build_circle")}
                            </span>
                            <span className="truncate">
                              {`${t("lab_btn_launch_tool", "Launch Linked Tool")} (${linkedTool.name})`}
                            </span>
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowTestPanel(true)}
                        className="w-full py-3 px-4 rounded-xl glass-surface sa-glass-pill-success text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[17px] text-[var(--success)]">
                          {t("icon_science", "science")}
                        </span>
                        <span>{t("btn_view_test", "View Active Test")}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CommandScreenBody>
          </div>
        );
      })()}

      {activeTab === "REPORTS" && (
        <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full h-full min-h-[500px]">
          <CommandScreenSectionHeading
            title={t("tab_lab_reports", "Lab Reports")}
            subtitle={t(
              "lab_reports_section_sub",
              "Session logs, crash diagnostics, and sandbox verification results"
            )}
            icon={t("icon_terminal", "terminal")}
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pb-32">
            {filteredReports.map((report: any) => {
              const isError = Boolean(report.errorFound);
              const cardReportNum = resolveLabReportNumber(report, reportsToList);
              const resolvedCardMod = resolveRealReportMod(
                report.mod,
                report.stagedExtras,
                modList
              );
              const modVer = getModVersionLabel(
                resolvedCardMod,
                modList,
                report.stagedExtras
              );
              const modExt = getModExtensionLabel(
                resolvedCardMod,
                activeGameSchema,
                modList,
                report.stagedExtras
              );
              return (
                <UniversalCard
                  key={report.id}
                  layout="vertical"
                  onClick={() => setSelectedReport(report)}
                  onContextMenu={(e) => {
                    const menuItems: SanctuaryContextMenuItem[] = [
                      {
                        label: t("view_details", "View Details"),
                        icon: t("icon_visibility", "visibility"),
                        onClick: () => setSelectedReport(report),
                      },
                    ];
                    if (resolvedCardMod && onOpenDossier) {
                      menuItems.push({
                        label: t("inspect", "Inspect"),
                        icon: t("icon_deployed_code", "deployed_code"),
                        onClick: () => onOpenDossier(resolvedCardMod),
                      });
                    }
                    if (resolvedCardMod) {
                      menuItems.push({
                        label: t("tab_env_builder", "Environment Builder"),
                        icon: t("icon_science", "science"),
                        onClick: () => {
                          setActiveLabMod(resolvedCardMod);
                          setStagedExtras(Array.isArray(report.stagedExtras) ? report.stagedExtras : []);
                          setConflictTarget(report.conflictTarget || null);
                          setConflictExtras(Array.isArray(report.conflictExtras) ? report.conflictExtras : []);
                          setActiveTab("BUILDER");
                        },
                      });
                    }
                    if (report.logSnippet) {
                      menuItems.push({
                        label: t("copy_log", "Copy Log"),
                        icon: t("icon_content_copy", "content_copy"),
                        dividerBefore: true,
                        onClick: () => navigator.clipboard?.writeText(String(report.logSnippet)),
                      });
                    }
                    if (
                      isError &&
                      submitLabReport &&
                      canSubmitLabReportItem(resolvedCardMod, report)
                    ) {
                      menuItems.push({
                        label: t("lab_action_submit_diag_title", "Submit To Diagnostics"),
                        icon: t("icon_send", "send"),
                        variant: "warning",
                        dividerBefore: !report.logSnippet,
                        onClick: () => {
                          submitLabReport(report);
                        },
                      });
                    }
                    openSanctuaryContextMenu(e, menuItems);
                  }}
                  icon={isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                  title={getCleanModBaseName(resolvedCardMod)}
                  subtitle={
                    report.conflictTarget
                      ? `${t("vs", "vs")} ${getCleanModBaseName(report.conflictTarget)}`
                      : t("target_engine_core", "Target: Engine Core Only")
                  }
                  imageOverlay={
                    <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-20 pointer-events-none">
                      <span className={VAULT_CHIP_CLASS}>
                        <span
                          className={`material-symbols-outlined !text-[12px] ${isError ? "text-[var(--danger)]" : "text-[var(--success)]"
                            }`}
                        >
                          {isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                        </span>
                        <span>
                          {isError
                            ? t("fatal_collision", "Fatal Collision")
                            : t("successful_injection", "Successful Injection")}
                        </span>
                      </span>
                    </div>
                  }
                  badges={
                    <>
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_terminal", "terminal")}
                        </span>
                        <span className="font-mono">
                          {`Lab_Report_${cardReportNum}`}
                        </span>
                      </span>
                      {modExt && (
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                            {t("icon_deployed_code", "deployed_code")}
                          </span>
                          <span>{modExt}</span>
                        </span>
                      )}
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                          {t("icon_sell", "sell")}
                        </span>
                        <span>
                          {modVer ? `v${modVer}` : selectedVersion || t("unknown", "Unknown")}
                        </span>
                      </span>
                    </>
                  }
                  footer={
                    <div className="flex items-center justify-between w-full">
                      {report.isConcluding && shelterActive ? (
                        <span className="text-[10px] font-black text-amber-400 animate-pulse truncate">
                          {t("status_pending_review", "Pending Review")}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                          {parseLabTimestamp(report.time).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          &bull;{" "}
                          {parseLabTimestamp(report.time).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                        {t("view_details", "View Details")}
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </span>
                    </div>
                  }
                />
              );
            })}

            {filteredReports.length === 0 && (
              <EmptyState
                icon={t("icon_terminal", "terminal")}
                title={t("lab_reports_empty", "No Reports Generated Yet")}
                subtitle={t("lab_reports_empty_desc", "Run a test in the Environment Builder to generate a report.")}
                className="col-span-full py-16"
              />
            )}
          </div>
        </div>
      )}

      {activeTab === "KNOWN_ERRORS" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full pb-32">
          <KnownErrorRulesManager
            searchQuery={knownErrorSearch}
            onClearSearch={() => {
              setKnownErrorSearch("");
              setKnownErrorFilter("all");
              setKnownErrorLabBehavior("all");
              setKnownErrorFileHint("all");
            }}
            canEdit={false}
            severityFilter={knownErrorFilter}
            onSeverityFilterChange={setKnownErrorFilter}
            labBehaviorFilter={knownErrorLabBehavior}
            fileHintFilter={knownErrorFileHint}
            sortBy={knownErrorSort}
          />
        </div>
      )}
    </>
  );
}
