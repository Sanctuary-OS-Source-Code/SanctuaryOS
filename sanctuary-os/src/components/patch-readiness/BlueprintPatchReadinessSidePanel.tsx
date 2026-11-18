import {
  useState,
  useEffect,
  useMemo,
  startTransition,
} from "react";
import { isDesktop } from "../../utils/envUtils";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  ActionButton,
  ActionPill,
  CustomDropdown,
  DashboardStatTile,
  SidePanelFilterBar,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../../shared";
import {
  PatchModBucket,
  PatchPanelSubFilter,
  PatchEvaluatedMod,
  unwrapDropdownValue,
  formatDisplayVersion,
  buildPatchGuidedUpdateQueue,
  launchPatchGuidedUpdates,
} from "./patchNavigationAndTypes";
import { useBlueprintPatchReadiness, clonePatchReadyBlueprint } from "./useBlueprintPatchReadiness";

import { groupPatchEvaluatedMods, matchesPatchSearchQuery } from "./patchFamilyGrouping";
import { PatchCategorizedGroupSection } from "./PatchModRowCard";

export function BlueprintPatchReadinessSidePanel({
  isOpen,
  onClose,
  initialBlueprintName,
  initialBucket,
  initialSubFilter,
  readiness: externalReadiness,
  onOpenFullTool,
  onTriggerShelter: _onTriggerShelter,
  onNavigateView,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialBlueprintName?: string | null;
  initialBucket?: PatchModBucket | null;
  initialSubFilter?: PatchPanelSubFilter | null;
  readiness?: ReturnType<typeof useBlueprintPatchReadiness>;
  onOpenFullTool?: () => void;
  onTriggerShelter?: (lock: boolean) => void;
  onNavigateView?: (view: string) => void;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const modList = useStore((s) => s.modList);
  const setSelectedVersion = useStore((s) => s.setSelectedVersion);
  const internalReadiness = useBlueprintPatchReadiness({
    skip: !isOpen || Boolean(externalReadiness),
  });
  const readiness = externalReadiness || internalReadiness;

  const [selectedBpName, setSelectedBpName] = useState<string>("");
  const [bucketFilter, setBucketFilter] = useState<PatchModBucket>("blocking");
  const [subFilter, setSubFilter] = useState<PatchPanelSubFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [clonedNameFeedback, setClonedNameFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialBlueprintName !== undefined) {
      setSelectedBpName(initialBlueprintName || "");
    }
  }, [isOpen, initialBlueprintName]);

  const activeReport = useMemo(() => {
    if (selectedBpName) {
      const found = readiness.blueprintReports.find(
        (r) => r.blueprintName === selectedBpName
      );
      if (found) return found;
    }
    if (initialBlueprintName) {
      const found = readiness.blueprintReports.find(
        (r) => r.blueprintName === initialBlueprintName
      );
      if (found) return found;
    }
    return readiness.activeBlueprintReport;
  }, [selectedBpName, initialBlueprintName, readiness]);

  useEffect(() => {
    if (!isOpen || !activeReport) return;
    if (initialBucket) {
      setBucketFilter(initialBucket);
      setSubFilter(initialSubFilter || "all");
      return;
    }
    if (
      initialSubFilter &&
      (initialSubFilter === "direct_update" ||
        initialSubFilter === "dep_update" ||
        initialSubFilter === "auto_swap")
    ) {
      setBucketFilter("update_ready");
      setSubFilter(initialSubFilter);
      return;
    }
    if (activeReport.blockingMods.length > 0) setBucketFilter("blocking");
    else if (activeReport.updatableMods.length > 0) setBucketFilter("update_ready");
    else setBucketFilter("ready");
    setSubFilter("all");
  }, [
    isOpen,
    activeReport?.blueprintName,
    readiness.targetVersion,
    initialBucket,
    initialSubFilter,
  ]);

  const groupedBuckets = useMemo(() => {
    if (!isOpen || !activeReport) {
      return {
        blockingDirect: [] as PatchEvaluatedMod[],
        blockingDep: [] as PatchEvaluatedMod[],
        blockingAll: [] as PatchEvaluatedMod[],
        directUpdates: [] as PatchEvaluatedMod[],
        depUpdates: [] as PatchEvaluatedMod[],
        autoSwaps: [] as PatchEvaluatedMod[],
        readyGroups: [] as PatchEvaluatedMod[],
      };
    }

    const rawBlockingDirect = activeReport.blockingMods.filter(
      (m) => m.issueKind !== "dependency"
    );
    const rawBlockingDep = activeReport.blockingMods.filter(
      (m) => m.issueKind === "dependency"
    );

    const blockingDirect = groupPatchEvaluatedMods(
      rawBlockingDirect,
      modList,
      activeGameSchema,
      t
    );
    const blockingDep = groupPatchEvaluatedMods(
      rawBlockingDep,
      modList,
      activeGameSchema,
      t
    );
    const directUpdates = groupPatchEvaluatedMods(
      activeReport.directUpdateMods || [],
      modList,
      activeGameSchema,
      t
    );
    const depUpdates = groupPatchEvaluatedMods(
      activeReport.depUpdateMods || [],
      modList,
      activeGameSchema,
      t
    );
    const autoSwaps = groupPatchEvaluatedMods(
      activeReport.autoSwapMods || [],
      modList,
      activeGameSchema,
      t
    );
    const readyGroups =
      bucketFilter === "ready"
        ? groupPatchEvaluatedMods(
            activeReport.readyMods || [],
            modList,
            activeGameSchema,
            t
          )
        : [];

    return {
      blockingDirect,
      blockingDep,
      blockingAll: [...blockingDirect, ...blockingDep],
      directUpdates,
      depUpdates,
      autoSwaps,
      readyGroups,
    };
  }, [isOpen, activeReport, modList, activeGameSchema, bucketFilter, t]);

  const guidedQueue = useMemo(
    () =>
      activeReport
        ? buildPatchGuidedUpdateQueue(
            activeReport.directUpdateMods || [],
            activeGameSchema
          )
        : [],
    [activeReport, activeGameSchema]
  );

  if (!isOpen) return null;

  const q = searchQuery.trim().toLowerCase();

  const filteredDirectUpdates = groupedBuckets.directUpdates.filter((g) =>
    matchesPatchSearchQuery(g, q)
  );
  const filteredDepUpdates = groupedBuckets.depUpdates.filter((g) =>
    matchesPatchSearchQuery(g, q)
  );
  const filteredAutoSwaps = groupedBuckets.autoSwaps.filter((g) =>
    matchesPatchSearchQuery(g, q)
  );
  const filteredBlockingDirect = groupedBuckets.blockingDirect.filter((g) => {
    if (!matchesPatchSearchQuery(g, q)) return false;
    if (subFilter === "awaiting_mason") return g.issueKind === "version" || !g.issueKind;
    if (subFilter === "missing_dlc") return g.issueKind === "dlc";
    if (subFilter === "corrupted") return g.issueKind === "corrupted";
    return true;
  });
  const filteredBlockingDep = groupedBuckets.blockingDep.filter((g) =>
    matchesPatchSearchQuery(g, q)
  );
  const filteredReadyGroups = groupedBuckets.readyGroups.filter((g) =>
    matchesPatchSearchQuery(g, q)
  );

  const bpOptions = readiness.blueprintReports.map((r) => ({
    id: r.blueprintName,
    value: r.blueprintName,
    label: `${r.blueprintName} (${r.readinessPercent}%)`,
  }));

  const heroVariant =
    activeReport?.verdict === "hold"
      ? "danger"
      : activeReport?.verdict === "updates_ready"
        ? "warning"
        : "success";

  const filterPopoverOptions: Array<{
    id: PatchPanelSubFilter;
    label: string;
    count: number;
    icon: string;
  }> =
    bucketFilter === "update_ready"
      ? [
          {
            id: "all",
            label: t("all", "All"),
            count:
              groupedBuckets.directUpdates.length +
              groupedBuckets.depUpdates.length +
              groupedBuckets.autoSwaps.length,
            icon: t("icon_layers", "layers"),
          },
          {
            id: "direct_update",
            label: t("patch_sim_sec_direct_updates", "Needs Update"),
            count: groupedBuckets.directUpdates.length,
            icon: t("icon_download", "download"),
          },
          {
            id: "dep_update",
            label: t("patch_sim_sec_dep_updates", "Needs Dependency Update"),
            count: groupedBuckets.depUpdates.length,
            icon: t("icon_extension", "extension"),
          },
          {
            id: "auto_swap",
            label: t("patch_sim_sec_auto_swap", "Auto-Swap Ready"),
            count: groupedBuckets.autoSwaps.length,
            icon: t("icon_history", "history"),
          },
        ]
      : bucketFilter === "blocking"
        ? [
            {
              id: "all",
              label: t("all", "All"),
              count: groupedBuckets.blockingAll.length,
              icon: t("icon_layers", "layers"),
            },
            {
              id: "awaiting_mason",
              label: t("patch_sim_awaiting_patch", "Awaiting {Mason} Update"),
              count: groupedBuckets.blockingDirect.filter(
                (g) => g.issueKind === "version" || !g.issueKind
              ).length,
              icon: t("icon_gpp_bad", "gpp_bad"),
            },
            {
              id: "missing_dep",
              label: t("badge_missing_dep", "Missing Dependency"),
              count: groupedBuckets.blockingDep.length,
              icon: t("icon_extension", "extension"),
            },
            {
              id: "missing_dlc",
              label: t("missing_dlc", "Missing DLC"),
              count: groupedBuckets.blockingDirect.filter(
                (g) => g.issueKind === "dlc"
              ).length,
              icon: t("icon_currency_exchange", "currency_exchange"),
            },
            {
              id: "corrupted",
              label: t("status_corrupted", "Corrupted"),
              count: groupedBuckets.blockingDirect.filter(
                (g) => g.issueKind === "corrupted"
              ).length,
              icon: t("icon_broken_image", "broken_image"),
            },
          ]
        : [];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("patch_sim_title", "{Blueprint} Patch Readiness")}
      subtitle={t(
        "patch_sim_subtitle",
        "Simulate game updates non-destructively before patching"
      )}
      icon={t("icon_published_with_changes", "published_with_changes")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[92vw] md:w-[780px]"
      headerActions={
        onOpenFullTool ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_open_in_new", "open_in_new")}
              tooltip={t("patch_sim_open_matrix", "Open Full Patch Readiness Tool")}
              onClick={() => {
                onClose();
                onOpenFullTool();
              }}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-10">
        {activeReport ? (
          <>
            <SidePanelHeroCard
              icon={
                activeReport.verdict === "hold"
                  ? t("icon_gpp_bad", "gpp_bad")
                  : activeReport.verdict === "updates_ready"
                    ? t("icon_update", "update")
                    : t("icon_verified_user", "verified_user")
              }
              overline={`${activeReport.blueprintName} • ${formatDisplayVersion(
                readiness.targetVersion,
                t("auto", "Auto")
              )}`}
              title={
                activeReport.verdict === "hold"
                  ? `${t("patch_sim_verdict_hold_short", "Hold Update")} — ${
                      activeReport.blockingMods.length
                    } ${t("patch_sim_awaiting_short", "Awaiting Patch")}`
                  : activeReport.verdict === "updates_ready"
                    ? `${t("patch_sim_verdict_stage_short", "Updates Ready")} — ${
                        activeReport.updatableMods.length
                      } ${t("term_mods", "{Mods}")}`
                    : t(
                        "patch_sim_verdict_safe_long",
                        "Safe to Update — 100% Patch Ready"
                      )
              }
              description={
                activeReport.verdict === "hold"
                  ? t(
                      "patch_sim_hero_hold_desc",
                      "Keep playing on your current game version or engage {Vault} Lockdown until blocking {mods} release updates."
                    )
                  : activeReport.verdict === "updates_ready"
                    ? t(
                        "patch_sim_hero_updates_desc",
                        "Compatible builds are already available! Stage the updates below into {Vault} and you will be 100% ready to patch."
                      )
                    : t(
                        "patch_sim_hero_safe_desc",
                        "Every {mod} in this {Blueprint} is compatible with the simulated game version. Seal a {Backups} snapshot before updating."
                      )
              }
              badge={`${activeReport.readinessPercent}% ${t(
                "patch_sim_ready_label",
                "Ready"
              )}`}
              badgeIcon={t("icon_speed", "speed")}
              variant={heroVariant}
            >
              <div className="flex flex-col gap-3 pt-1">
                {/* Embedded Simulation Selectors Inside Hero Info Card */}
                <div className="rounded-xl glass-surface p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[var(--subtext)] px-0.5 flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                        {t("icon_published_with_changes", "published_with_changes")}
                      </span>
                      {t("patch_sim_target_version_label", "Simulated Game Version")}
                    </span>
                    <CustomDropdown
                      value={readiness.targetVersion}
                      onChange={(val: any) =>
                        startTransition(() =>
                          readiness.setTargetVersion(unwrapDropdownValue(val))
                        )
                      }
                      options={readiness.versionDropdownOptions}
                      allowCustom={true}
                      searchable={true}
                      placeholder={t("game_version", "Game Version")}
                    />
                  </div>

                  {bpOptions.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[var(--subtext)] px-0.5 flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                          {t("icon_map", "map")}
                        </span>
                        {t("term_blueprint", "{Blueprint}")}
                      </span>
                      <CustomDropdown
                        value={activeReport.blueprintName}
                        onChange={(val: any) => {
                          const picked = unwrapDropdownValue(val);
                          if (picked) {
                            startTransition(() => setSelectedBpName(picked));
                          }
                        }}
                        options={bpOptions}
                        placeholder={t("term_blueprint", "{Blueprint}")}
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 ml-auto pt-1 w-full">
                  {guidedQueue.length > 0 && (
                    <ActionButton
                      variant="primary"
                      icon={t("icon_public", "public")}
                      label={`${t(
                        "patch_sim_btn_stage_guided",
                        "Stage Updates"
                      )} (${guidedQueue.length})`}
                      onClick={() =>
                        launchPatchGuidedUpdates(
                          activeReport.directUpdateMods,
                          activeGameSchema
                        )
                      }
                    />
                  )}
                  {isDesktop() &&
                    activeReport.blockingMods.length + activeReport.updatableMods.length >
                      0 &&
                    activeReport.readyMods.length > 0 && (
                      <ActionButton
                        variant={clonedNameFeedback ? "success" : "glass"}
                        icon={
                          clonedNameFeedback
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_content_copy", "content_copy")
                        }
                        label={
                          clonedNameFeedback
                            ? t("patch_sim_cloned_short", "Cloned!")
                            : t("patch_sim_btn_clone_ready", "Clone Ready {Blueprint}")
                        }
                        onClick={() => {
                          const res = clonePatchReadyBlueprint(
                            activeReport,
                            readiness.targetVersion,
                            activeGameSchema,
                            t
                          );
                          if (res) {
                            setClonedNameFeedback(res.newName);
                            setTimeout(() => setClonedNameFeedback(null), 3000);
                          }
                        }}
                      />
                    )}
                  {isDesktop() &&
                    activeGameSchema?.features?.has_saves !== false &&
                    onNavigateView && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_history", "history")}
                        label={t("patch_sim_btn_open_backups", "Seal {Backups}")}
                        onClick={() => {
                          onClose();
                          onNavigateView("backups");
                        }}
                      />
                    )}
                  {activeReport.verdict === "safe" &&
                    readiness.targetVersion &&
                    readiness.targetVersion !== readiness.currentVersion && (
                      <ActionButton
                        variant="primary"
                        icon={t("icon_check_circle", "check_circle")}
                        label={`${t(
                          "patch_sim_btn_apply_version",
                          "Switch Active Version to"
                        )} v${readiness.targetVersion}`}
                        onClick={() => setSelectedVersion(readiness.targetVersion)}
                      />
                    )}
                </div>
              </div>
            </SidePanelHeroCard>

            {/* Primary Bucket Filter Tiles inside SidePanel */}
            <SidePanelFilterBar className="grid-cols-3 gap-3">
              <DashboardStatTile
                variant="filter"
                icon={t("icon_gpp_bad", "gpp_bad")}
                number={activeReport.blockingMods.length}
                label={t("patch_sim_awaiting_short", "Awaiting Patch")}
                isActive={bucketFilter === "blocking"}
                colorClass={
                  activeReport.blockingMods.length > 0
                    ? "text-[var(--danger)]"
                    : "text-[var(--text)]"
                }
                onClick={() =>
                  startTransition(() => {
                    setBucketFilter("blocking");
                    setSubFilter("all");
                  })
                }
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_download", "download")}
                number={activeReport.updatableMods.length}
                label={t("updates_avail", "Updates Available")}
                isActive={bucketFilter === "update_ready"}
                colorClass={
                  activeReport.updatableMods.length > 0
                    ? "text-[var(--warning)]"
                    : "text-[var(--text)]"
                }
                onClick={() =>
                  startTransition(() => {
                    setBucketFilter("update_ready");
                    setSubFilter("all");
                  })
                }
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_check_circle", "check_circle")}
                number={activeReport.readyMods.length}
                label={t("patch_sim_ready_in_vault", "Ready in {Vault}")}
                isActive={bucketFilter === "ready"}
                colorClass="text-[var(--success)]"
                onClick={() =>
                  startTransition(() => {
                    setBucketFilter("ready");
                    setSubFilter("all");
                  })
                }
              />
            </SidePanelFilterBar>

            <ActionPill
              className="w-full !max-w-none"
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchPlaceholder={t("nav_search", "Search...") as string}
              primaryPopover={
                filterPopoverOptions.length > 0
                  ? {
                      icon: t("icon_tune", "tune"),
                      label: t("filters", "Filters"),
                      isActive: subFilter !== "all",
                      content: (
                        <div className="flex flex-col gap-1 p-1 min-w-[230px]">
                          {filterPopoverOptions.map((opt) => {
                            const active = subFilter === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  startTransition(() => setSubFilter(opt.id))
                                }
                                className={`sa-dropdown-item flex items-center justify-between gap-3 w-full px-3 py-2 rounded-xl cursor-pointer ${
                                  active ? "is-selected font-bold" : "font-semibold"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                                    {opt.icon}
                                  </span>
                                  <span className="text-xs tracking-wide truncate">
                                    {opt.label}
                                  </span>
                                </div>
                                <span className="text-[10.5px] font-mono font-bold text-[var(--subtext)] opacity-80 shrink-0">
                                  {opt.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ),
                    }
                  : undefined
              }
            />

            {/* Categorized Sections */}
            {bucketFilter === "update_ready" ? (
              filteredDirectUpdates.length === 0 &&
              filteredDepUpdates.length === 0 &&
              filteredAutoSwaps.length === 0 ? (
                <UniversalGroup
                  title={`${t("updates_avail", "Updates Available")} (0)`}
                  icon={t("icon_download", "download")}
                >
                  <EmptyState
                    icon={t("icon_task_alt", "task_alt")}
                    title={t("patch_sim_zero_updates", "No Pending {Mod} Updates")}
                    minHeightClass="min-h-[160px]"
                  />
                </UniversalGroup>
              ) : (
                <div className="flex flex-col gap-5 w-full">
                  {(subFilter === "all" || subFilter === "direct_update") &&
                    (filteredDirectUpdates.length > 0 ||
                      subFilter === "direct_update") && (
                      <PatchCategorizedGroupSection
                        title={`${t(
                          "patch_sim_sec_direct_updates",
                          "Needs Update"
                        )} (${filteredDirectUpdates.length})`}
                        icon={t("icon_download", "download")}
                        items={filteredDirectUpdates}
                        emptyTitle={t(
                          "patch_sim_zero_updates",
                          "No Pending {Mod} Updates"
                        )}
                      />
                    )}

                  {(subFilter === "all" || subFilter === "dep_update") &&
                    (filteredDepUpdates.length > 0 ||
                      subFilter === "dep_update") && (
                      <PatchCategorizedGroupSection
                        title={`${t(
                          "patch_sim_sec_dep_updates",
                          "Needs Dependency Update"
                        )} (${filteredDepUpdates.length})`}
                        icon={t("icon_extension", "extension")}
                        items={filteredDepUpdates}
                        emptyTitle={t("none", "None")}
                      />
                    )}

                  {(subFilter === "all" || subFilter === "auto_swap") &&
                    (filteredAutoSwaps.length > 0 ||
                      subFilter === "auto_swap") && (
                      <PatchCategorizedGroupSection
                        title={`${t(
                          "patch_sim_sec_auto_swap",
                          "Auto-Swap Ready"
                        )} (${filteredAutoSwaps.length})`}
                        icon={t("icon_history", "history")}
                        items={filteredAutoSwaps}
                        emptyTitle={t("none", "None")}
                      />
                    )}
                </div>
              )
            ) : bucketFilter === "blocking" ? (
              filteredBlockingDirect.length === 0 &&
              filteredBlockingDep.length === 0 ? (
                <UniversalGroup
                  title={`${t("patch_sim_awaiting_short", "Awaiting Patch")} (0)`}
                  icon={t("icon_gpp_bad", "gpp_bad")}
                >
                  <EmptyState
                    icon={t("icon_task_alt", "task_alt")}
                    title={t("patch_sim_zero_blocking", "Zero Blocking {Mods}")}
                    minHeightClass="min-h-[160px]"
                  />
                </UniversalGroup>
              ) : (
                <div className="flex flex-col gap-5 w-full">
                  {subFilter !== "missing_dep" &&
                    (filteredBlockingDirect.length > 0 ||
                      subFilter !== "all") && (
                      <PatchCategorizedGroupSection
                        title={`${t(
                          "patch_sim_awaiting_short",
                          "Awaiting Patch"
                        )} (${filteredBlockingDirect.length})`}
                        icon={t("icon_gpp_bad", "gpp_bad")}
                        items={filteredBlockingDirect}
                        emptyTitle={t(
                          "patch_sim_zero_blocking",
                          "Zero Blocking {Mods}"
                        )}
                      />
                    )}

                  {(subFilter === "all" || subFilter === "missing_dep") &&
                    (filteredBlockingDep.length > 0 ||
                      subFilter === "missing_dep") && (
                      <PatchCategorizedGroupSection
                        title={`${t(
                          "badge_missing_dep",
                          "Missing Dependency"
                        )} (${filteredBlockingDep.length})`}
                        icon={t("icon_extension", "extension")}
                        items={filteredBlockingDep}
                        emptyTitle={t("none", "None")}
                      />
                    )}
                </div>
              )
            ) : (
              <PatchCategorizedGroupSection
                title={`${t("patch_sim_ready_in_vault", "Ready in {Vault}")} (${
                  filteredReadyGroups.length
                })`}
                icon={t("icon_check_circle", "check_circle")}
                items={filteredReadyGroups}
                emptyTitle={t("none", "None")}
              />
            )}
          </>
        ) : (
          <EmptyState
            icon={t("icon_map", "map")}
            title={t("cmd_no_blueprint_equipped", "No {Blueprint} Equipped")}
          />
        )}
      </div>
    </SidePanel>
  );
}


