import React, { useState, useEffect, useMemo, startTransition } from "react";
import { isDesktop } from "../../utils/envUtils";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import {
  UniversalGroup,
  ActionButton,
  CustomDropdown,
  EmptyState,
  HoverTooltip,
  VAULT_CHIP_CLASS,
  formatDisplayName,
  isScriptExtension,
  openModDossier,
} from "../../shared";
import { UniversalCard } from "../universal/UniversalCard";
import { DynamicBlueprintPreviewBanner } from "../../chameleon-components/ThemeCard";
import { formatAddonModuleName, formatCleanModTitle } from "../../side-panels/CommandIncompatiblePanel";
import { LiquidGlassReadinessBar, LiquidGlassAlertCard } from "./LiquidGlassReadinessWidgets";
import {
  type PatchEvaluatedMod,
  type BlueprintPatchReport,
  DRAWER_PAGE_SIZE,
  unwrapDropdownValue,
  formatDisplayVersion,
  formatGameVersionChipLabel,
  openPatchModUrl,
} from "./patchNavigationAndTypes";
import { useBlueprintPatchReadiness, clonePatchReadyBlueprint } from "./useBlueprintPatchReadiness";
import { equipMissingDepsIntoBlueprint } from "./patchFamilyGrouping";

export function PatchReadinessSimulatorInfoCard({
  readiness,
}: {
  readiness: ReturnType<typeof useBlueprintPatchReadiness>;
}) {
  const { t } = useLexicon();
  const nonEmptyReports = readiness.blueprintReports.filter(
    (r) => r.totalMods > 0
  );
  const totalBpCount = nonEmptyReports.length;
  const readyBpCount = nonEmptyReports.filter((r) => r.verdict === "safe").length;
  const updatesOnlyBpCount = nonEmptyReports.filter(
    (r) => r.verdict === "updates_ready"
  ).length;

  const overallState: "safe" | "warning" | "hold" =
    totalBpCount === 0 || readyBpCount === totalBpCount
      ? "safe"
      : readyBpCount > 0 || updatesOnlyBpCount > 0
        ? "warning"
        : "hold";

  const verdictAccent =
    overallState === "hold"
      ? "var(--danger)"
      : overallState === "warning"
        ? "var(--warning)"
        : "var(--success)";

  const verdictIconColor =
    overallState === "hold"
      ? "text-[var(--danger)]"
      : overallState === "warning"
        ? "text-[var(--warning)]"
        : "text-[var(--success)]";

  const verdictIcon =
    overallState === "hold"
      ? t("icon_gpp_bad", "gpp_bad")
      : overallState === "warning"
        ? t("icon_published_with_changes", "published_with_changes")
        : t("icon_verified_user", "verified_user");

  const targetVerDisplay = formatDisplayVersion(
    readiness.targetVersion,
    t("auto", "Auto")
  );

  return (
    <LiquidGlassAlertCard
      icon={verdictIcon}
      accentVar={verdictAccent}
      iconColorClass={verdictIconColor}
      badgeIcon={t("icon_layers", "layers")}
      badgeLabel={
        totalBpCount > 0
          ? `${readyBpCount}/${totalBpCount} ${t(
              "patch_sim_ready_label",
              "Ready"
            )}`
          : t("standby", "Standby")
      }
      overline={`${t("patch_sim_overline", "Patch Simulator")} • ${targetVerDisplay}`}
      title={
        totalBpCount === 0
          ? t("patch_sim_no_blueprints_title", "No {Blueprints} Populated")
          : readyBpCount === totalBpCount
            ? t("patch_sim_all_bp_ready", "All {Blueprints} Ready")
            : t("patch_sim_bp_ready_summary", "{0} of {1} {Blueprints} Ready")
                .replace("{0}", String(readyBpCount))
                .replace("{1}", String(totalBpCount))
      }
      description={t(
        "patch_sim_global_card_desc",
        "Test any game version across your {Blueprints} before updating, or clone a ready-to-play copy without unupdated {mods}."
      )}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-3 mt-auto pt-1"
      >
        {readiness.versionDropdownOptions.length > 0 && (
          <div className="rounded-xl glass-surface p-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[var(--subtext)] flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                  {t("icon_published_with_changes", "published_with_changes")}
                </span>
                {t("patch_sim_target_version_label", "Simulated Game Version")}
              </span>
              {readiness.currentVersion && (
                <span className="text-[9.5px] font-mono font-bold text-[var(--subtext)] opacity-75">
                  {`${
                    isDesktop()
                      ? t("patch_sim_installed_tag", "Installed")
                      : t("patch_sim_rig_tag", "Rig Synced")
                  }: v${readiness.currentVersion}`}
                </span>
              )}
            </div>
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
        )}
      </div>
    </LiquidGlassAlertCard>
  );
}

export function BlueprintPatchReadinessCard({
  report,
  targetVersion,
  onInspect,
}: {
  report: BlueprintPatchReport;
  targetVersion: string;
  onInspect: (blueprintName: string) => void;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const [justCloned, setJustCloned] = useState(false);

  const unreadyCount = report.blockingMods.length + report.updatableMods.length;
  const canCloneReady = isDesktop() && unreadyCount > 0 && report.readyMods.length > 0;

  const handleCloneReady = (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = clonePatchReadyBlueprint(
      report,
      targetVersion,
      activeGameSchema,
      t
    );
    if (res) {
      setJustCloned(true);
      setTimeout(() => setJustCloned(false), 3000);
    }
  };

  const statusColor =
    report.verdict === "hold"
      ? "danger"
      : report.verdict === "updates_ready"
        ? "warning"
        : "success";

  const verdictLabel =
    report.verdict === "hold"
      ? t("patch_sim_verdict_hold_short", "Hold Update")
      : report.verdict === "updates_ready"
        ? t("patch_sim_verdict_stage_short", "Updates Ready")
        : report.verdict === "empty"
          ? t("empty", "Empty")
          : t("patch_sim_verdict_safe_short", "Safe to Update");

  const verdictIcon =
    report.verdict === "hold"
      ? t("icon_gpp_bad", "gpp_bad")
      : report.verdict === "updates_ready"
        ? t("icon_update", "update")
        : t("icon_verified_user", "verified_user");

  const verdictIconColor =
    report.verdict === "hold"
      ? "text-[var(--danger)]"
      : report.verdict === "updates_ready"
        ? "text-[var(--warning)]"
        : "text-[var(--success)]";

  return (
    <UniversalCard
      layout="vertical"
      isActive={report.isEquipped}
      statusColor={statusColor}
      icon={
        report.isEquipped
          ? t("icon_verified_user", "verified_user")
          : t("icon_map", "map")
      }
      customIcon={
        <DynamicBlueprintPreviewBanner
          data={report.blueprintObj}
          countOverride={report.totalMods}
          heightClass="h-full"
        />
      }
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-nowrap items-center gap-1.5 max-w-[78%] z-30 pointer-events-none whitespace-nowrap">
          <span className={VAULT_CHIP_CLASS}>
            <span
              className={`material-symbols-outlined !text-[12px] ${verdictIconColor}`}
            >
              {verdictIcon}
            </span>
            <span>{verdictLabel}</span>
          </span>
        </div>
      }
      actions={
        canCloneReady ? (
          <button
            type="button"
            onClick={handleCloneReady}
            className={`w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center transition-all relative cursor-pointer ${
              justCloned
                ? "text-[var(--success)]"
                : "text-[var(--text)] opacity-80 hover:opacity-100 hover:text-[var(--accent)]"
            }`}
          >
            <span className="material-symbols-outlined !text-[14px]">
              {justCloned
                ? t("icon_check", "check")
                : t("icon_content_copy", "content_copy")}
            </span>
            <HoverTooltip
              title={
                justCloned
                  ? t("patch_sim_cloned_short", "Cloned!")
                  : t("patch_sim_btn_clone_ready", "Clone Ready {Blueprint}")
              }
              subtitle={t(
                "patch_sim_clone_ready_tooltip",
                "Create a patch-ready copy omitting {0} {mods} requiring updates"
              ).replace("{0}", String(unreadyCount))}
              icon={
                justCloned
                  ? t("icon_check", "check")
                  : t("icon_content_copy", "content_copy")
              }
            />
          </button>
        ) : undefined
      }
      title={report.blueprintName}
      subtitle={`${formatDisplayVersion(targetVersion, t("auto", "Auto"))} • ${
        report.readyMods.length
      }/${report.totalMods} ${t("patch_sim_ready_label", "Ready")} (${
        report.readinessPercent
      }%)${
        report.blockingMods.length > 0
          ? ` • ${report.blockingMods.length} ${t("patch_sim_awaiting_compact", "Awaiting")}`
          : ""
      }${
        report.updatableMods.length > 0
          ? ` • ${report.updatableMods.length} ${t("updates_available", "Updates")}`
          : ""
      }`}
      onClick={() => onInspect(report.blueprintName)}
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-[10px] font-black text-[var(--accent)] flex items-center gap-1">
            {t("inspect", "Inspect")}
            <span className="material-symbols-outlined !text-[12px]">
              {t("icon_arrow_forward", "arrow_forward")}
            </span>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full">
        <LiquidGlassReadinessBar
          readyCount={report.readyMods.length}
          updateCount={report.updatableMods.length}
          blockingCount={report.blockingMods.length}
          totalCount={report.totalMods}
          heightClass="h-2"
        />
        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed m-0">
          {report.verdict === "hold"
            ? t(
                "patch_sim_card_hold_desc",
                "Hold off updating the game until blocking {mods} publish a compatible patch."
              )
            : report.verdict === "updates_ready"
              ? t(
                  "patch_sim_card_updates_desc",
                  "All {mods} support this game version once pending updates are staged into {Vault}."
                )
              : t(
                  "patch_sim_card_safe_desc",
                  "Every {mod} in this {Blueprint} is clear for the simulated game version."
                )}
        </p>
      </div>
    </UniversalCard>
  );
}

export const PatchModRowCard = React.memo(function PatchModRowCard({
  item,
}: {
  item: PatchEvaluatedMod;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const showImages = useStore((s) => s.showImages);
  const [isExpanded, setIsExpanded] = useState(false);

  const groupedMods = useMemo(
    () =>
      Array.isArray(item.groupedMods) && item.groupedMods.length > 0
        ? item.groupedMods
        : [item.rawMod].filter(Boolean),
    [item.groupedMods, item.rawMod]
  );
  const hasMultipleModules = groupedMods.length > 1;

  const missingDepTargets = useMemo(
    () =>
      Array.isArray(item.missingDepTargets) ? item.missingDepTargets : [],
    [item.missingDepTargets]
  );
  const vaultDepsToEquip = useMemo(
    () => missingDepTargets.filter((d) => Boolean(d.vaultModName)),
    [missingDepTargets]
  );

  const imageUrl = showImages
    ? item.rawMod?.image_url || item.rawMod?.imageUrl || null
    : null;

  const bucketIcon =
    item.bucket === "blocking"
      ? item.issueKind === "dependency"
        ? t("icon_extension", "extension")
        : item.issueKind === "dlc"
          ? t("icon_currency_exchange", "currency_exchange")
          : item.issueKind === "conflict"
            ? t("icon_error", "error")
            : item.issueKind === "corrupted"
              ? t("icon_broken_image", "broken_image")
              : t("icon_gpp_bad", "gpp_bad")
      : item.source === "vault_archive"
        ? t("icon_history", "history")
        : item.source === "dep_update_pending"
          ? t("icon_extension", "extension")
          : item.bucket === "update_ready"
            ? t("icon_new_releases", "new_releases")
            : t("icon_check_circle", "check_circle");

  const bucketIconColor =
    item.bucket === "blocking"
      ? "text-[var(--danger)]"
      : item.source === "cloud_update"
        ? "text-[var(--accent)]"
        : item.bucket === "update_ready"
          ? "text-[var(--warning)]"
          : "text-[var(--success)]";

  const bucketBadgeText =
    item.bucket === "blocking"
      ? item.issueKind === "dependency"
        ? t("badge_missing_dep", "Missing Dependency")
        : item.issueKind === "dlc"
          ? t("missing_dlc", "Missing DLC")
          : item.issueKind === "conflict"
            ? t("fatal_conflict", "Fatal Conflict")
            : item.issueKind === "corrupted"
              ? t("status_corrupted", "Corrupted")
              : t("patch_sim_awaiting_short", "Awaiting Patch")
      : item.source === "vault_archive"
        ? t("version_pool_badge_auto_swap", "Auto-Swap")
        : item.source === "dep_update_pending"
          ? t("patch_sim_dep_update_chip", "Pending Dep Update")
          : item.bucket === "update_ready"
            ? t("btn_update", "Update")
            : t("patch_sim_ready_label", "Ready");

  const gameVerChipLabel = formatGameVersionChipLabel(
    item.compatibleVersions,
    t("any", "Any")
  );

  const stackedIssues = useMemo((): Array<{
    type: "red" | "amber";
    issueLabel: string;
    icon: string;
    tooltipLines: string[];
  }> => {
    const rawIssues = Array.isArray(item.issues) ? item.issues : [];
    if (item.bucket !== "blocking") return [];
    if (rawIssues.length > 0) {
      return rawIssues.map((iss) => {
        if (iss.category === "missing_deps") {
          const depName =
            iss.depTarget?.name || iss.detail || t("unknown", "Unknown");
          const hint = iss.depTarget?.vaultModName
            ? t(
                "dep_in_vault_equip_hint",
                "In {Vault} — Click + on card to equip"
              )
            : iss.depTarget?.sourceHost
              ? `${t("source", "Source")}: ${iss.depTarget.sourceHost}`
              : t(
                  "dep_click_download_hint",
                  "Click download icon on card to get it"
                );
          return {
            type: iss.type,
            issueLabel: t("badge_missing_dep", "Missing Dependency"),
            icon: iss.icon || t("icon_extension", "extension"),
            tooltipLines: [
              `${t("tooltip_required", "Required:")} ${depName}`,
              hint,
            ],
          };
        }
        if (iss.category === "missing_dlc") {
          return {
            type: iss.type,
            issueLabel: t("missing_dlc", "Missing DLC"),
            icon: iss.icon || t("icon_currency_exchange", "currency_exchange"),
            tooltipLines: [
              `${t("tooltip_required", "Required:")} ${
                iss.detail || t("unknown", "Unknown")
              }`,
            ],
          };
        }
        if (iss.category === "version_mismatch") {
          const lines: string[] = [];
          if (iss.installedVersion) {
            lines.push(`${t("installed", "Installed")}: ${iss.installedVersion}`);
          }
          if (iss.requiredVersion) {
            lines.push(
              `${t("tooltip_required", "Required:")} ${iss.requiredVersion}`
            );
          } else if (iss.detail) {
            lines.push(iss.detail);
          }
          return {
            type: iss.type,
            issueLabel: bucketBadgeText,
            icon: bucketIcon,
            tooltipLines: lines.length > 0 ? lines : [item.reasonLabel],
          };
        }
        return {
          type: iss.type,
          issueLabel: iss.title || bucketBadgeText,
          icon: iss.icon || bucketIcon,
          tooltipLines: iss.detail ? [iss.detail] : [item.reasonLabel],
        };
      });
    }
    return [
      {
        type: "red",
        issueLabel: bucketBadgeText,
        icon: bucketIcon,
        tooltipLines: [item.reasonLabel],
      },
    ];
  }, [
    item.bucket,
    item.issues,
    bucketBadgeText,
    bucketIcon,
    item.reasonLabel,
    t,
  ]);

  const extraIssueCount = Math.max(0, stackedIssues.length - 1);
  const fallbackTypeLabel = item.isScript
    ? t("type_script", "Script")
    : t("term_mod", "{Mod}");

  const depCalloutLine =
    missingDepTargets.length > 0
      ? `${t("required", "Required")}: ${missingDepTargets
          .map((d) => d.name)
          .join(", ")}`
      : item.source === "dep_update_pending"
        ? item.reasonLabel
        : null;

  return (
    <div
      onClick={() =>
        openModDossier(
          hasMultipleModules
            ? {
                ...item.rawMod,
                displayName: item.title,
                isVirtual: true,
                flavors: groupedMods,
              }
            : item.rawMod
        )
      }
      className={`glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex flex-col justify-between gap-3 transition-all duration-200 cursor-pointer relative ${
        isExpanded && hasMultipleModules ? "sm:col-span-2" : ""
      }`}
    >
      {/* Top Tier: Icon Well / Cover + Title & Creator Identity */}
      <div className="flex items-center gap-3 min-w-0 w-full">
        {imageUrl ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
            <img
              src={imageUrl}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${bucketIconColor}`}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {item.icon}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
              {item.title}
            </span>
            <HoverTooltip
              className="z-[100]"
              title={item.title}
              subtitle={item.reasonLabel}
              icon={item.icon}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
            <span className="truncate opacity-85">
              {item.author
                ? formatCleanModTitle(item.author)
                : fallbackTypeLabel}
            </span>
            {hasMultipleModules && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="opacity-85 shrink-0">
                  {`${groupedMods.length} ${
                    item.isCollectionFolder
                      ? t("term_mods", "{Mods}")
                      : t("badge_modules_count", "Modules")
                  }`}
                </span>
              </>
            )}
          </div>

          {depCalloutLine && (
            <div className="relative group/depcallout flex items-center min-w-0 w-fit max-w-full mt-0.5">
              <span className="text-[11px] font-medium text-[var(--subtext)] truncate">
                {depCalloutLine}
              </span>
              <HoverTooltip
                className="z-[100]"
                title={bucketBadgeText}
                subtitle={depCalloutLine}
                icon={bucketIcon}
                variant={item.bucket === "blocking" ? "danger" : "warning"}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Telemetry & Action Bar: Single Status Badge on Left | Uniform Action Icon Buttons on Right */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`relative group/patchchip ${VAULT_CHIP_CLASS} ${
              item.source === "cloud_update" ? "font-mono" : ""
            }`}
          >
            <span
              className={`material-symbols-outlined !text-[12px] shrink-0 ${bucketIconColor}`}
            >
              {bucketIcon}
            </span>
            {item.source === "cloud_update" ? (
              item.installedVersion &&
              item.targetModVersion &&
              item.installedVersion !== item.targetModVersion ? (
                <>
                  <span className="text-[var(--subtext)]">
                    {`v${item.installedVersion} → `}
                  </span>
                  <span>{`v${item.targetModVersion}`}</span>
                </>
              ) : item.targetModVersion ? (
                <span>{`v${item.targetModVersion}`}</span>
              ) : item.installedVersion ? (
                <span>{`v${item.installedVersion}`}</span>
              ) : (
                <span>{bucketBadgeText}</span>
              )
            ) : item.bucket === "ready" && item.installedVersion ? (
              <span className="font-mono">{`v${item.installedVersion}`}</span>
            ) : (
              <span>{bucketBadgeText}</span>
            )}
            {extraIssueCount > 0 && (
              <span className="opacity-75">{`+${extraIssueCount}`}</span>
            )}

            <HoverTooltip
              className="z-[100] !left-0 !translate-x-0"
              title={bucketBadgeText}
              icon={bucketIcon}
              variant={
                item.bucket === "blocking"
                  ? "danger"
                  : item.source === "cloud_update"
                    ? "accent"
                    : "default"
              }
              content={
                item.bucket === "blocking" ? (
                  <div className="flex flex-col items-start gap-2 min-w-[185px]">
                    {stackedIssues.map((r, rIdx) => (
                      <div
                        key={rIdx}
                        className="flex flex-col items-start gap-0.5 text-left w-full"
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide leading-snug text-[var(--text)]">
                          <span
                            className={`material-symbols-outlined !text-[14px] shrink-0 ${
                              r.type === "amber"
                                ? "text-[var(--warning)]"
                                : "text-[var(--danger)]"
                            }`}
                          >
                            {r.icon}
                          </span>
                          <span>{r.issueLabel}</span>
                        </div>
                        {r.tooltipLines.length > 0 && (
                          <div className="flex flex-col gap-0.5 pl-5 text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                            {r.tooltipLines.map((line, lIdx) => (
                              <span key={lIdx} className="break-words">
                                {line}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="pt-1.5 mt-0.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full flex flex-col gap-0.5 font-mono text-[10.5px] text-left">
                      {item.installedVersion && (
                        <div>
                          <span className="opacity-70">
                            {t("installed", "Installed")}:
                          </span>{" "}
                          <span className="font-bold text-[var(--text)]">
                            {`v${item.installedVersion}`}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="opacity-70">
                          {t("compatible", "Compatible")}:
                        </span>{" "}
                        <span className="font-bold text-[var(--text)]">
                          {gameVerChipLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5 text-left font-mono text-[11px] min-w-[165px]">
                    {item.installedVersion && (
                      <div>
                        <span className="opacity-70">
                          {t("installed", "Installed")}:
                        </span>{" "}
                        <span className="font-bold text-[var(--text)]">
                          {`v${item.installedVersion}`}
                        </span>
                      </div>
                    )}
                    {item.targetModVersion && (
                      <div>
                        <span className="opacity-70">
                          {item.source === "vault_archive"
                            ? t("version_pool_badge_auto_swap", "Auto-Swap")
                            : t("latest", "Latest")}
                          :
                        </span>{" "}
                        <span className="font-bold text-[var(--accent)]">
                          {`v${item.targetModVersion}`}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="opacity-70">
                        {t("compatible", "Compatible")}:
                      </span>{" "}
                      <span className="font-bold text-[var(--text)]">
                        {gameVerChipLabel}
                      </span>
                    </div>
                    {item.source === "dep_update_pending" && (
                      <div className="font-sans pt-1 text-[var(--subtext)]">
                        {item.reasonLabel}
                      </div>
                    )}
                  </div>
                )
              }
            />
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {hasMultipleModules && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                isExpanded
                  ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${groupedMods.length} ${
                  item.isCollectionFolder
                    ? t("term_mods", "{Mods}")
                    : t("badge_modules_count", "Modules")
                }`}
                icon={t("icon_account_tree", "account_tree")}
              />
            </button>
          )}

          {vaultDepsToEquip.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                equipMissingDepsIntoBlueprint(
                  item.blueprintName,
                  vaultDepsToEquip,
                  t
                );
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_add_link", "add_link")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${t("equip", "Equip")}: ${vaultDepsToEquip
                  .map((d) => d.name)
                  .join(", ")}`}
                subtitle={t(
                  "dep_equip_from_vault_sub",
                  "Already in {Vault} — equip into this {Blueprint}"
                )}
                icon={t("icon_add_link", "add_link")}
                variant="accent"
              />
            </button>
          )}

          {missingDepTargets.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const primaryDep = missingDepTargets[0];
                if (primaryDep?.url) {
                  openPatchModUrl(primaryDep.url);
                }
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {missingDepTargets[0].sourceHost
                  ? t("icon_download", "download")
                  : t("icon_travel_explore", "travel_explore")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${t("btn_get_dependency", "Get Dependency")}: ${missingDepTargets
                  .map((d) => d.name)
                  .join(", ")}`}
                subtitle={
                  missingDepTargets[0].sourceHost
                    ? `${t("source", "Source")}: ${missingDepTargets[0].sourceHost}`
                    : t("search_for_dependency", "Find & download required {mod}")
                }
                icon={
                  missingDepTargets[0].sourceHost
                    ? t("icon_download", "download")
                    : t("icon_travel_explore", "travel_explore")
                }
                variant="accent"
              />
            </button>
          )}

          {item.downloadUrl &&
            item.bucket !== "ready" &&
            missingDepTargets.length === 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openPatchModUrl(item.downloadUrl!);
                }}
                className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_open_in_new", "open_in_new")}
                </span>
                <HoverTooltip
                  className="z-[100] !right-0 !translate-x-0 !left-auto"
                  title={
                    item.source === "cloud_update"
                      ? t("btn_update", "Update")
                      : t("inspect", "Inspect")
                  }
                  icon={
                    item.source === "cloud_update"
                      ? t("icon_update", "update")
                      : t("icon_open_in_new", "open_in_new")
                  }
                  variant="accent"
                />
              </button>
            )}
        </div>
      </div>

      {/* Compact Recessed Linked Modules Drawer (Matching Updates Panel) */}
      {isExpanded && hasMultipleModules && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] animate-in fade-in slide-in-from-top-1 duration-200 cursor-default"
        >
          <div className="max-h-[196px] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {groupedMods.map((gm: any, gIdx: number) => {
                const gmName =
                  formatAddonModuleName(gm, activeGameSchema) ||
                  formatCleanModTitle(
                    formatDisplayName(gm?.displayName || gm?.name || "")
                  );
                const gmIsScript = isScriptExtension(
                  String(gm?.name || gm?._originalSetName || ""),
                  activeGameSchema
                );
                return (
                  <div
                    key={`${gm?.name || gIdx}-${gIdx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openModDossier(gm);
                    }}
                    className="glass-surface rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)] flex items-center justify-between gap-2 cursor-pointer transition-all"
                  >
                    <div className="relative group/gmtitle flex items-center gap-2 min-w-0 flex-1">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                        {gmIsScript
                          ? t("icon_terminal", "terminal")
                          : t("icon_deployed_code", "deployed_code")}
                      </span>
                      <span className="text-xs font-bold text-[var(--text)] truncate">
                        {gmName}
                      </span>
                      <HoverTooltip
                        className="z-[100]"
                        title={gmName}
                        icon={
                          gmIsScript
                            ? t("icon_terminal", "terminal")
                            : t("icon_deployed_code", "deployed_code")
                        }
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-70 shrink-0">
                      {gmIsScript
                        ? t("type_script", "Script")
                        : item.isCollectionFolder
                          ? t("term_mod", "{Mod}")
                          : t("type_package", "Module")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export function PatchCategorizedGroupSection({
  title,
  icon,
  items,
  emptyTitle,
  headerAction,
}: {
  title: string;
  icon: string;
  items: PatchEvaluatedMod[];
  emptyTitle?: string;
  headerAction?: React.ReactNode;
}) {
  const { t } = useLexicon();
  const [visibleCount, setVisibleCount] = useState<number>(DRAWER_PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(DRAWER_PAGE_SIZE);
  }, [items]);

  const paged = items.slice(0, visibleCount);
  const remaining = Math.max(0, items.length - visibleCount);

  return (
    <UniversalGroup title={title} icon={icon} actions={headerAction}>
      {items.length === 0 ? (
        <EmptyState
          icon={t("icon_task_alt", "task_alt")}
          title={emptyTitle || t("none", "None")}
          minHeightClass="min-h-[140px]"
        />
      ) : (
        <div className="flex flex-col gap-4 w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {paged.map((item) => (
              <PatchModRowCard key={item.key} item={item} />
            ))}
          </div>

          {remaining > 0 && (
            <div className="flex items-center justify-center pt-1">
              <ActionButton
                variant="glass"
                icon={t("icon_expand_more", "expand_more")}
                label={`${t("load_more", "Load More")} (${remaining})`}
                onClick={() =>
                  startTransition(() =>
                    setVisibleCount((prev) => prev + DRAWER_PAGE_SIZE)
                  )
                }
              />
            </div>
          )}
        </div>
      )}
    </UniversalGroup>
  );
}

