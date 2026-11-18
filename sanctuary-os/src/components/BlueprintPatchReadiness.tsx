import { useState, useEffect, useMemo } from "react";
import { isDesktop } from "../utils/envUtils";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { CommandScreenLayout, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, CommandScreenSectionHeading, CommandScreenQuickLink, CommandScreenMetricTile } from "../hub-components/SharedCommandScreenLayout";
import { PatchModBucket, PatchPanelSubFilter, buildPatchGuidedUpdateQueue, launchPatchGuidedUpdates } from "./patch-readiness/patchNavigationAndTypes";
import { useBlueprintPatchReadiness, clonePatchReadyBlueprint } from "./patch-readiness/useBlueprintPatchReadiness";
import { PatchReadinessSimulatorInfoCard, BlueprintPatchReadinessCard, BlueprintPatchReadinessSidePanel } from "./patch-readiness/PatchReadinessCardsAndDrawer";
export * from "./patch-readiness/LiquidGlassReadinessWidgets";
export * from "./patch-readiness/patchNavigationAndTypes";
export * from "./patch-readiness/useBlueprintPatchReadiness";
export * from "./patch-readiness/PatchReadinessCardsAndDrawer";

export function BlueprintPatchReadinessView({
  pinnedBlueprints,
  readiness: externalReadiness,
  initialInspectBlueprint,
  initialInspectBucket,
  initialInspectSubFilter,
  onClearInitialInspect,
}: {
  pinnedBlueprints?: string[];
  readiness?: ReturnType<typeof useBlueprintPatchReadiness>;
  initialInspectBlueprint?: string | null;
  initialInspectBucket?: PatchModBucket | null;
  initialInspectSubFilter?: PatchPanelSubFilter | null;
  onClearInitialInspect?: () => void;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const setSelectedVersion = useStore((s) => s.setSelectedVersion);
  const setView = useStore((s) => s.setView);
  const internalReadiness = useBlueprintPatchReadiness({
    pinnedBlueprintNames: pinnedBlueprints,
    skip: Boolean(externalReadiness),
  });
  const readiness = externalReadiness || internalReadiness;

  const [drawerBpName, setDrawerBpName] = useState<string | null>(
    initialInspectBlueprint ?? null
  );
  const [drawerInitialBucket, setDrawerInitialBucket] =
    useState<PatchModBucket | null>(initialInspectBucket ?? null);
  const [drawerInitialSubFilter, setDrawerInitialSubFilter] =
    useState<PatchPanelSubFilter | null>(initialInspectSubFilter ?? null);

  useEffect(() => {
    if (initialInspectBlueprint) {
      setDrawerBpName(initialInspectBlueprint);
      setDrawerInitialBucket(initialInspectBucket ?? null);
      setDrawerInitialSubFilter(initialInspectSubFilter ?? null);
      if (onClearInitialInspect) onClearInitialInspect();
    }
  }, [
    initialInspectBlueprint,
    initialInspectBucket,
    initialInspectSubFilter,
    onClearInitialInspect,
  ]);

  const focusedReport = readiness.activeBlueprintReport;

  const guidedUpdateQueue = useMemo(
    () =>
      focusedReport
        ? buildPatchGuidedUpdateQueue(
            focusedReport.directUpdateMods || [],
            activeGameSchema
          )
        : [],
    [focusedReport, activeGameSchema]
  );

  const openFocusedDrawer = (
    bucket?: PatchModBucket | null,
    sub?: PatchPanelSubFilter | null
  ) => {
    setDrawerInitialBucket(bucket ?? null);
    setDrawerInitialSubFilter(sub ?? null);
    setDrawerBpName(focusedReport?.blueprintName || "");
  };

  return (
    <div className="flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 min-h-[400px]">
      <CommandScreenLayout>
        <CommandScreenBody>
          <CommandScreenMain>
            <div className="flex flex-col gap-4 w-full">
              <CommandScreenSectionHeading
                title={t("patch_sim_title", "{Blueprint} Patch Readiness")}
                subtitle={t(
                  "patch_sim_matrix_sub",
                  "Non-destructive health check across target game patches before you update"
                )}
                icon={t("icon_published_with_changes", "published_with_changes")}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                <PatchReadinessSimulatorInfoCard readiness={readiness} />

                {readiness.blueprintReports.map((rep) => (
                  <BlueprintPatchReadinessCard
                    key={rep.blueprintName}
                    report={rep}
                    targetVersion={readiness.targetVersion}
                    onInspect={(name) => {
                      setDrawerInitialBucket(null);
                      setDrawerInitialSubFilter(null);
                      setDrawerBpName(name);
                    }}
                  />
                ))}
              </div>
            </div>
          </CommandScreenMain>

          <CommandScreenSidebar
            title={t("quick_actions", "Quick Actions")}
            icon={t("icon_bolt", "bolt")}
            metricsTitle={t("patch_sim_metrics_title", "Readiness Telemetry")}
            metricsIcon={t("icon_monitoring", "monitoring")}
            metrics={
              <>
                <CommandScreenMetricTile
                  icon={t("icon_speed", "speed")}
                  value={`${focusedReport?.readinessPercent ?? 100}%`}
                  label={t("patch_sim_ready_label", "Ready")}
                  valueColorClass={
                    focusedReport?.verdict === "hold"
                      ? "text-[var(--danger)]"
                      : focusedReport?.verdict === "updates_ready"
                        ? "text-[var(--warning)]"
                        : "text-[var(--success)]"
                  }
                  onClick={() => openFocusedDrawer("ready", "all")}
                />
                <CommandScreenMetricTile
                  icon={t("icon_gpp_bad", "gpp_bad")}
                  value={focusedReport?.blockingMods.length ?? 0}
                  label={t("patch_sim_awaiting_short", "Awaiting Patch")}
                  valueColorClass={
                    (focusedReport?.blockingMods.length ?? 0) > 0
                      ? "text-[var(--danger)]"
                      : "text-[var(--success)]"
                  }
                  onClick={() => openFocusedDrawer("blocking", "all")}
                />
                <CommandScreenMetricTile
                  icon={t("icon_history", "history")}
                  value={focusedReport?.autoSwapMods.length ?? 0}
                  label={t("version_pool_badge_auto_swap", "Auto-Swap")}
                  onClick={() => openFocusedDrawer("update_ready", "auto_swap")}
                />
                <CommandScreenMetricTile
                  icon={t("icon_inventory_2", "inventory_2")}
                  value={readiness.backupCount}
                  label={t("cmd_snapshots_label", "Snapshots")}
                  onClick={() => {
                    if (isDesktop() && activeGameSchema?.features?.has_saves !== false) {
                      setView("backups");
                    }
                  }}
                />
              </>
            }
          >
            {isDesktop() &&
              focusedReport &&
              focusedReport.blockingMods.length +
                focusedReport.updatableMods.length >
                0 &&
              focusedReport.readyMods.length > 0 && (
                <CommandScreenQuickLink
                  icon={t("icon_content_copy", "content_copy")}
                  title={t(
                    "patch_sim_btn_clone_ready",
                    "Clone Ready {Blueprint}"
                  )}
                  subtitle={t(
                    "patch_sim_clone_ready_tooltip",
                    "Create a patch-ready copy omitting {0} {mods} requiring updates"
                  ).replace(
                    "{0}",
                    String(
                      focusedReport.blockingMods.length +
                        focusedReport.updatableMods.length
                    )
                  )}
                  onClick={() =>
                    clonePatchReadyBlueprint(
                      focusedReport,
                      readiness.targetVersion,
                      activeGameSchema,
                      t
                    )
                  }
                  iconColorClass="text-[var(--accent)]"
                />
              )}

            {guidedUpdateQueue.length > 0 && focusedReport && (
              <CommandScreenQuickLink
                icon={t("icon_public", "public")}
                title={t("patch_sim_btn_stage_guided", "Stage Updates")}
                subtitle={`${guidedUpdateQueue.length} ${t(
                  "updates_avail",
                  "Updates Available"
                )}`}
                onClick={() =>
                  launchPatchGuidedUpdates(
                    focusedReport.directUpdateMods,
                    activeGameSchema
                  )
                }
                iconColorClass="text-[var(--warning)]"
              />
            )}

            {isDesktop() && activeGameSchema?.features?.has_saves !== false && (
              <CommandScreenQuickLink
                icon={t("icon_history", "history")}
                title={t("patch_sim_btn_open_backups", "Seal {Backups}")}
                subtitle={t(
                  "cmd_backups_card_desc",
                  "Capture pre-patch world saves and full engine snapshots so game updates never corrupt your progress."
                )}
                onClick={() => setView("backups")}
              />
            )}

            {focusedReport?.verdict === "safe" &&
              readiness.targetVersion &&
              readiness.targetVersion !== readiness.currentVersion && (
                <CommandScreenQuickLink
                  icon={t("icon_check_circle", "check_circle")}
                  title={`${t(
                    "patch_sim_btn_apply_version",
                    "Switch Active Version to"
                  )} v${readiness.targetVersion}`}
                  subtitle={t(
                    "patch_sim_apply_version_sub",
                    "All {mods} verified clear — promote simulated version to active"
                  )}
                  onClick={() => setSelectedVersion(readiness.targetVersion)}
                  iconColorClass="text-[var(--success)]"
                />
              )}
          </CommandScreenSidebar>
        </CommandScreenBody>
      </CommandScreenLayout>

      {drawerBpName !== null && (
        <BlueprintPatchReadinessSidePanel
          isOpen={drawerBpName !== null}
          onClose={() => {
            setDrawerBpName(null);
            setDrawerInitialBucket(null);
            setDrawerInitialSubFilter(null);
          }}
          initialBlueprintName={drawerBpName || undefined}
          initialBucket={drawerInitialBucket}
          initialSubFilter={drawerInitialSubFilter}
          readiness={readiness}
          onNavigateView={setView}
        />
      )}
    </div>
  );
}

