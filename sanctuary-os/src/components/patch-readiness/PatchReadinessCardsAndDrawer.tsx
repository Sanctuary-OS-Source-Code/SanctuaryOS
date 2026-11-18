import React, { useState, useEffect, useMemo, startTransition } from "react";
import { isDesktop } from "../../utils/envUtils";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { SidePanel, SidePanelHeroCard, UniversalGroup, ActionButton, ActionPill, CustomDropdown, DashboardStatTile, SidePanelFilterBar, EmptyState, HoverTooltip, PanelHeaderGroup, PanelHeaderButton, VAULT_CHIP_CLASS, cleanSearchName, formatDisplayName, isScriptExtension, openModDossier, stripPriorityTierPrefix, deduplicateBlueprintArtifacts } from "../../shared";
import { UniversalCard } from "../universal/UniversalCard";
import { DynamicBlueprintPreviewBanner } from "../../chameleon-components/ThemeCard";
import { normalizeModGroupTitle, extractValidCreator, isKnownCreatorName, getCachedVaultGroupLookups, formatAddonModuleName, formatCleanModTitle, type MissingDepTarget, type StackedModIssue } from "../../side-panels/CommandIncompatiblePanel";
import { LiquidGlassReadinessBar, LiquidGlassAlertCard } from "./LiquidGlassReadinessWidgets";
import { PatchModBucket, PatchPanelSubFilter, PatchEvaluatedMod, BlueprintPatchReport, DRAWER_PAGE_SIZE, unwrapDropdownValue, isWildcardVersion, formatDisplayVersion, formatGameVersionChipLabel, openPatchModUrl, buildPatchGuidedUpdateQueue, launchPatchGuidedUpdates } from "./patchNavigationAndTypes";
import { useBlueprintPatchReadiness, clonePatchReadyBlueprint } from "./useBlueprintPatchReadiness";

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

export interface VaultFamilyParentMeta {
  key: string;
  title: string;
  author: string | null;
  url: string | null;
  isCollection: boolean;
}

export interface VaultFamilyLookup {
  parentByKey: Map<string, VaultFamilyParentMeta>;
  childNameToParentKey: Map<string, string>;
  childHashToParentKey: Map<string, string>;
}

export const vaultFamilyLookupCache = new WeakMap<readonly any[], VaultFamilyLookup>();

export function getVaultFamilyLookup(
  modList: readonly any[] | undefined | null,
  activeGameSchema: any
): VaultFamilyLookup {
  if (Array.isArray(modList)) {
    const cached = vaultFamilyLookupCache.get(modList);
    if (cached) return cached;
  }

  const parentByKey = new Map<string, VaultFamilyParentMeta>();
  const childNameToParentKey = new Map<string, string>();
  const childHashToParentKey = new Map<string, string>();

  const registerPath = (rawPath: any, parentKey: string) => {
    const str = String(rawPath || "").trim();
    if (!str) return;
    const norm = str.toLowerCase().replace(/\\/g, "/");
    if (!childNameToParentKey.has(norm)) {
      childNameToParentKey.set(norm, parentKey);
    }
    const stripped = stripPriorityTierPrefix(str, activeGameSchema)
      .toLowerCase()
      .replace(/\\/g, "/");
    if (stripped && !childNameToParentKey.has(stripped)) {
      childNameToParentKey.set(stripped, parentKey);
    }
  };

  if (Array.isArray(modList)) {
    for (let i = 0; i < modList.length; i++) {
      const vm = modList[i];
      if (!vm) continue;

      const rawId = String(vm.id || "").trim();
      const rawDb = String(vm.dbId || "").split("@")[0].trim();
      const rawTitle = formatDisplayName(
        vm.displayName || vm.meta_name || vm.name || ""
      );
      const title = formatCleanModTitle(rawTitle) || rawTitle;
      const author = extractValidCreator(vm);
      const url = vm.download_url || vm.url || null;
      const isCollection = Boolean(
        vm.isCollection || rawId.startsWith("set_")
      );

      let folderKey = "";
      if (rawId.startsWith("virtual_")) {
        folderKey = `fam:${rawId.replace(/^virtual_/, "").trim()}`;
      } else if (rawId.startsWith("set_")) {
        folderKey = `set:${rawId.replace(/^set_/, "").trim()}`;
      } else if (rawDb && rawDb !== "null" && rawDb !== "undefined") {
        folderKey = isCollection ? `set:${rawDb}` : `fam:${rawDb}`;
      } else if (Array.isArray(vm.flavors) && vm.flavors.length > 1 && vm.name) {
        folderKey = `folder:${String(vm.name).toLowerCase()}`;
      }

      if (folderKey && title) {
        const existing = parentByKey.get(folderKey);
        if (!existing || rawId.startsWith("virtual_") || rawId.startsWith("set_")) {
          parentByKey.set(folderKey, {
            key: folderKey,
            title,
            author: author || existing?.author || null,
            url: url || existing?.url || null,
            isCollection,
          });
        }
      }

      if (folderKey && Array.isArray(vm.flavors) && vm.flavors.length > 0) {
        for (let j = 0; j < vm.flavors.length; j++) {
          const fl = vm.flavors[j];
          if (!fl) continue;
          registerPath(fl.name, folderKey);
          registerPath(fl.physical_path, folderKey);
          if (fl.hash && !isWildcardVersion(fl.hash)) {
            const h = String(fl.hash).trim().toLowerCase();
            if (h && !childHashToParentKey.has(h)) {
              childHashToParentKey.set(h, folderKey);
            }
          }
        }
      }
    }
  }

  const built: VaultFamilyLookup = {
    parentByKey,
    childNameToParentKey,
    childHashToParentKey,
  };
  if (Array.isArray(modList)) {
    vaultFamilyLookupCache.set(modList, built);
  }
  return built;
}

export function groupPatchEvaluatedMods(
  items: PatchEvaluatedMod[],
  modList: any[],
  activeGameSchema: any,
  t: (key: string, fallback?: string) => string
): PatchEvaluatedMod[] {
  if (!Array.isArray(items) || items.length <= 1) return items || [];

  const lookup = getVaultFamilyLookup(modList, activeGameSchema);
  const {
    vaultByHash,
    vaultUpdateLookup,
    virtualByFamilyId,
    collectionBySetId,
    parentByDbId,
    vaultFamilyCounts,
    vaultSetCounts,
  } = getCachedVaultGroupLookups(modList || []);

  const listFamilyCounts = new Map<string, number>();
  const listSetCounts = new Map<string, number>();
  const twinCounts = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const raw = it.rawMod;
    const matchedVault =
      (raw?.hash
        ? vaultByHash.get(String(raw.hash).toLowerCase())
        : undefined) ||
      vaultUpdateLookup.get(String(raw?.name || "").toLowerCase()) ||
      vaultUpdateLookup.get(String(raw?.displayName || "").toLowerCase());

    const explicitFam = String(
      matchedVault?.baseFamilyId ||
        matchedVault?.familyId ||
        raw?.baseFamilyId ||
        raw?.familyId ||
        ""
    )
      .split("@")[0]
      .trim();
    const selfDb = String(matchedVault?.dbId || raw?.dbId || "")
      .split("@")[0]
      .trim();

    if (
      explicitFam &&
      explicitFam !== "null" &&
      explicitFam !== "undefined" &&
      !explicitFam.startsWith("local_")
    ) {
      listFamilyCounts.set(
        explicitFam,
        (listFamilyCounts.get(explicitFam) || 0) + 1
      );
    }
    if (
      selfDb &&
      selfDb !== "null" &&
      selfDb !== "undefined" &&
      !selfDb.startsWith("local_") &&
      selfDb !== explicitFam
    ) {
      listFamilyCounts.set(selfDb, (listFamilyCounts.get(selfDb) || 0) + 1);
    }

    const setRaw = String(raw?.setId || matchedVault?.setId || "")
      .split("@")[0]
      .trim();
    if (setRaw && setRaw !== "null" && setRaw !== "undefined") {
      listSetCounts.set(setRaw, (listSetCounts.get(setRaw) || 0) + 1);
    }

    const twinNorm = normalizeModGroupTitle(it.title).toLowerCase().trim();
    if (twinNorm.length >= 3) {
      const cr = (it.author || "").toLowerCase().trim();
      const tKey = cr ? `${cr}::${twinNorm}` : twinNorm;
      twinCounts.set(tKey, (twinCounts.get(tKey) || 0) + 1);
      twinCounts.set(twinNorm, (twinCounts.get(twinNorm) || 0) + 1);
    }
  }

  const resolveGroupKey = (item: PatchEvaluatedMod): string => {
    const raw = item.rawMod;
    if (raw) {
      const matchedVault =
        (raw.hash
          ? vaultByHash.get(String(raw.hash).toLowerCase())
          : undefined) ||
        vaultUpdateLookup.get(String(raw.name || "").toLowerCase()) ||
        vaultUpdateLookup.get(String(raw.displayName || "").toLowerCase());

      const origNorm = stripPriorityTierPrefix(
        String(raw._originalSetName || raw.name || ""),
        activeGameSchema
      )
        .toLowerCase()
        .replace(/\\/g, "/");
      const nameNorm = String(raw.name || "")
        .toLowerCase()
        .replace(/\\/g, "/");
      const hashNorm =
        raw.hash && !isWildcardVersion(raw.hash)
          ? String(raw.hash).trim().toLowerCase()
          : "";

      const mappedFolder =
        (origNorm && lookup.childNameToParentKey.get(origNorm)) ||
        (nameNorm && lookup.childNameToParentKey.get(nameNorm)) ||
        (hashNorm && lookup.childHashToParentKey.get(hashNorm));
      if (mappedFolder) return mappedFolder;

      const explicitFam = String(
        matchedVault?.baseFamilyId ||
          matchedVault?.familyId ||
          raw.baseFamilyId ||
          raw.familyId ||
          ""
      )
        .split("@")[0]
        .trim();
      const selfDb = String(matchedVault?.dbId || raw.dbId || "")
        .split("@")[0]
        .trim();

      const famRaw =
        explicitFam &&
        explicitFam !== "null" &&
        explicitFam !== "undefined" &&
        !explicitFam.startsWith("local_")
          ? explicitFam
          : selfDb &&
              selfDb !== "null" &&
              selfDb !== "undefined" &&
              !selfDb.startsWith("local_") &&
              !raw.isCollection &&
              !matchedVault?.isCollection &&
              (virtualByFamilyId.has(selfDb) ||
                (vaultFamilyCounts.get(selfDb) || 0) > 1 ||
                (listFamilyCounts.get(selfDb) || 0) > 1)
            ? selfDb
            : "";

      if (famRaw) {
        if (lookup.parentByKey.has(`set:${famRaw}`) || collectionBySetId.has(famRaw)) {
          return `set:${famRaw}`;
        }
        return `fam:${famRaw}`;
      }

      const setRaw = String(raw.setId || matchedVault?.setId || "")
        .split("@")[0]
        .trim();
      if (
        setRaw &&
        setRaw !== "null" &&
        setRaw !== "undefined" &&
        (collectionBySetId.has(setRaw) ||
          (vaultSetCounts.get(setRaw) || 0) > 1 ||
          (listSetCounts.get(setRaw) || 0) > 1 ||
          lookup.parentByKey.has(`set:${setRaw}`))
      ) {
        return `set:${setRaw}`;
      }

      const cgRaw = String(
        raw.communityGroupId || matchedVault?.communityGroupId || ""
      ).trim();
      if (cgRaw && cgRaw !== "null" && cgRaw !== "undefined") {
        return `comm:${cgRaw}`;
      }
    }

    if (item.suiteKey && !item.suiteKey.startsWith("art:")) {
      return item.suiteKey;
    }

    const twinNorm = normalizeModGroupTitle(item.title).toLowerCase().trim();
    if (twinNorm.length >= 3) {
      const cr = (item.author || "").toLowerCase().trim();
      const tKey = cr ? `${cr}::${twinNorm}` : twinNorm;
      if ((twinCounts.get(tKey) || 0) > 1) {
        return `twin:${tKey}`;
      }
      if ((twinCounts.get(twinNorm) || 0) > 1) {
        return `twin:${twinNorm}`;
      }
    }

    return item.key;
  };

  const buckets = new Map<string, PatchEvaluatedMod[]>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const gKey = resolveGroupKey(it);
    const arr = buckets.get(gKey);
    if (arr) arr.push(it);
    else buckets.set(gKey, [it]);
  }

  const mergeEvaluatedGroup = (
    members: PatchEvaluatedMod[],
    gKey: string
  ): PatchEvaluatedMod => {
    if (members.length === 1) return members[0];

    const famSuffix = gKey.startsWith("fam:") ? gKey.slice(4) : "";
    const setSuffix = gKey.startsWith("set:") ? gKey.slice(4) : "";
    const parentMeta = lookup.parentByKey.get(gKey);
    const vaultFamilyParent = famSuffix
      ? virtualByFamilyId.get(famSuffix) || parentByDbId.get(famSuffix)
      : null;
    const vaultCollectionFolder = setSuffix
      ? collectionBySetId.get(setSuffix)
      : null;

    const coreMember =
      members.find((m) => {
        const selfDb = String(m.rawMod?.dbId || "").split("@")[0].trim();
        if (famSuffix && selfDb === famSuffix) return true;
        const rt = String(m.rawMod?.relationshipType || "").toLowerCase();
        return rt === "core" || rt === "parent" || Boolean(m.rawMod?.isParent);
      }) ||
      members.find((m) => m.downloadUrl || m.targetModVersion) ||
      members[0];

    const rawParentTitle = vaultFamilyParent
      ? formatCleanModTitle(
          formatDisplayName(
            vaultFamilyParent.displayName || vaultFamilyParent.name || ""
          )
        )
      : vaultCollectionFolder
        ? formatCleanModTitle(
            formatDisplayName(
              vaultCollectionFolder.displayName ||
                vaultCollectionFolder.name ||
                ""
            )
          )
        : "";
    const normalizedBaseTitle =
      formatCleanModTitle(normalizeModGroupTitle(coreMember.title)) ||
      coreMember.title;

    let folderTitle =
      parentMeta?.title ||
      (rawParentTitle
        ? formatCleanModTitle(normalizeModGroupTitle(rawParentTitle)) ||
          rawParentTitle
        : "") ||
      normalizedBaseTitle ||
      coreMember.title;

    const isCollectionFolder = Boolean(
      parentMeta?.isCollection ||
        vaultCollectionFolder ||
        gKey.startsWith("set:")
    );

    const combinedRawMods: any[] = [];
    const seenRawSet = new Set<any>();
    const compatSet = new Set<string>();
    const combinedIssues: StackedModIssue[] = [];
    const seenIssueKeys = new Set<string>();
    const combinedDepTargets: MissingDepTarget[] = [];
    const seenDepTargetKeys = new Set<string>();
    const flatMembers: PatchEvaluatedMod[] = [];
    let hasAnyScript = false;

    for (let i = 0; i < members.length; i++) {
      const mem = members[i];
      if (mem.isScript) hasAnyScript = true;
      if (Array.isArray(mem.memberEvaluations) && mem.memberEvaluations.length > 0) {
        for (let k = 0; k < mem.memberEvaluations.length; k++) {
          flatMembers.push(mem.memberEvaluations[k]);
        }
      } else {
        flatMembers.push(mem);
      }
      for (let j = 0; j < mem.compatibleVersions.length; j++) {
        compatSet.add(mem.compatibleVersions[j]);
      }
      for (let j = 0; j < mem.groupedMods.length; j++) {
        const gm = mem.groupedMods[j];
        if (gm && !seenRawSet.has(gm)) {
          seenRawSet.add(gm);
          combinedRawMods.push(gm);
        }
      }
      if (Array.isArray(mem.issues)) {
        for (let j = 0; j < mem.issues.length; j++) {
          const iss = mem.issues[j];
          const ik = `${iss.category}::${iss.title}::${iss.detail || ""}`;
          if (!seenIssueKeys.has(ik)) {
            seenIssueKeys.add(ik);
            combinedIssues.push(iss);
          }
        }
      }
      if (Array.isArray(mem.missingDepTargets)) {
        for (let j = 0; j < mem.missingDepTargets.length; j++) {
          const dt = mem.missingDepTargets[j];
          const dk = dt.name.toLowerCase();
          if (!seenDepTargetKeys.has(dk)) {
            seenDepTargetKeys.add(dk);
            combinedDepTargets.push(dt);
          }
        }
      }
    }

    const hasRootParentInMembers = famSuffix
      ? flatMembers.some(
          (m) => String(m.rawMod?.dbId || "").split("@")[0].trim() === famSuffix
        )
      : true;
    if (
      coreMember.issueKind === "dependency" &&
      !hasRootParentInMembers &&
      combinedDepTargets.some(
        (dt) => dt.name.toLowerCase() === folderTitle.toLowerCase()
      )
    ) {
      const modulesWord = t("badge_modules_count", "Modules");
      if (!folderTitle.toLowerCase().includes(modulesWord.toLowerCase())) {
        folderTitle = `${folderTitle} (${modulesWord})`;
      }
    }

    const bestAuthor =
      (parentMeta?.author && isKnownCreatorName(parentMeta.author)
        ? parentMeta.author
        : null) ||
      extractValidCreator(vaultFamilyParent, vaultCollectionFolder) ||
      members.find((m) => isKnownCreatorName(m.author))?.author ||
      parentMeta?.author ||
      members.find((m) => m.author)?.author ||
      null;
    const bestDownloadUrl =
      members.find((m) => m.downloadUrl)?.downloadUrl ||
      parentMeta?.url ||
      vaultFamilyParent?.download_url ||
      vaultFamilyParent?.url ||
      vaultCollectionFolder?.url ||
      null;
    const bestTargetVer =
      members.find((m) => m.targetModVersion)?.targetModVersion || null;
    const bestInstVer =
      members.find((m) => m.installedVersion)?.installedVersion || null;

    return {
      ...coreMember,
      key: `group:${gKey}:${coreMember.bucket}:${coreMember.source}`,
      suiteKey: gKey,
      title: folderTitle,
      author: bestAuthor,
      icon: isCollectionFolder
        ? t("icon_inventory_2", "inventory_2")
        : t("icon_folder_special", "folder_special"),
      isScript: hasAnyScript,
      isCollectionFolder,
      moduleCount: Math.max(flatMembers.length, combinedRawMods.length),
      installedVersion: bestInstVer,
      targetModVersion: bestTargetVer,
      compatibleVersions: Array.from(compatSet),
      downloadUrl: bestDownloadUrl,
      groupedMods: combinedRawMods,
      memberEvaluations: flatMembers,
      issues: combinedIssues.length > 0 ? combinedIssues : coreMember.issues,
      missingDepTargets:
        combinedDepTargets.length > 0
          ? combinedDepTargets
          : coreMember.missingDepTargets,
    };
  };

  const passOneEntries: PatchEvaluatedMod[] = [];
  buckets.forEach((members, gKey) => {
    passOneEntries.push(mergeEvaluatedGroup(members, gKey));
  });

  // Second pass: merge prefix-based Addons/Modules and equal-normalized-title twins into their parent mod card
  const mergedOut = new Set<number>();
  for (let i = 0; i < passOneEntries.length; i++) {
    if (mergedOut.has(i)) continue;
    let parent = passOneEntries[i];
    const pTitle = String(parent.title || "").trim();
    if (pTitle.length < 4) continue;
    const pLower = pTitle.toLowerCase();
    const pNorm = normalizeModGroupTitle(pTitle).toLowerCase().trim();

    for (let j = 0; j < passOneEntries.length; j++) {
      if (i === j || mergedOut.has(j)) continue;
      const candidate = passOneEntries[j];
      const cTitle = String(candidate.title || "").trim();
      const cLower = cTitle.toLowerCase();
      const cNorm = normalizeModGroupTitle(cTitle).toLowerCase().trim();

      const isEqualTwin = Boolean(
        pNorm.length >= 4 &&
          pNorm === cNorm &&
          !parent.isCollectionFolder &&
          !candidate.isCollectionFolder
      );
      const isPrefixAddon =
        isEqualTwin ||
        (cLower.length > pLower.length &&
          cLower.startsWith(pLower) &&
          /^(\s*[-:–_(\[]|\s+(addon|add-on|module|pack|part|script|scripts)\b)/i.test(
            cTitle.slice(pTitle.length)
          ));

      if (isPrefixAddon) {
        mergedOut.add(j);
        parent = mergeEvaluatedGroup(
          [parent, candidate],
          parent.suiteKey || `merged:${pNorm}`
        );
        passOneEntries[i] = parent;
      }
    }
  }

  return passOneEntries.filter((_, idx) => !mergedOut.has(idx));
}

export function matchesPatchSearchQuery(item: PatchEvaluatedMod, q: string): boolean {
  if (!q) return true;
  if (item.title.toLowerCase().includes(q)) return true;
  if (item.author && item.author.toLowerCase().includes(q)) return true;
  if (item.reasonLabel.toLowerCase().includes(q)) return true;
  if (Array.isArray(item.memberEvaluations)) {
    for (let i = 0; i < item.memberEvaluations.length; i++) {
      const mem = item.memberEvaluations[i];
      if (
        mem.title.toLowerCase().includes(q) ||
        (mem.author && mem.author.toLowerCase().includes(q)) ||
        String(mem.rawMod?.name || "").toLowerCase().includes(q)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function equipMissingDepsIntoBlueprint(
  blueprintName: string | undefined,
  depsToEquip: MissingDepTarget[],
  t: (key: string, fallback?: string) => string
) {
  if (!Array.isArray(depsToEquip) || depsToEquip.length === 0) return;
  const store = useStore.getState();
  const currentSets = Array.isArray(store.playSets) ? store.playSets : [];
  if (currentSets.length === 0) return;

  const targetIdx = blueprintName
    ? currentSets.findIndex((ps: any) => ps?.name === blueprintName)
    : store.activePlaySetIndex;
  const resolvedIdx = targetIdx >= 0 ? targetIdx : store.activePlaySetIndex;
  const targetSet = currentSets[resolvedIdx];
  if (!targetSet) return;

  const allVaultMods: any[] = Array.isArray(store.modList) ? store.modList : [];
  const schema = store.activeGameSchema;
  const namesToAdd: string[] = [];
  const hashesToAdd: Record<string, string> = {};
  const equippedLabels: string[] = [];

  for (let i = 0; i < depsToEquip.length; i++) {
    const dep = depsToEquip[i];
    if (!dep?.vaultModName) continue;
    const primaryVm = allVaultMods.find(
      (vm: any) =>
        vm &&
        !vm.isVirtual &&
        !vm.isCollection &&
        String(vm.name || "").toLowerCase() === dep.vaultModName!.toLowerCase()
    );
    if (!primaryVm) {
      namesToAdd.push(dep.vaultModName);
      equippedLabels.push(dep.name);
      continue;
    }

    equippedLabels.push(dep.name);
    const primaryBase = cleanSearchName(primaryVm.name, schema)
      .toLowerCase()
      .trim();
    const anchorFam = String(
      primaryVm.baseFamilyId || primaryVm.familyId || primaryVm.dbId || ""
    )
      .split("@")[0]
      .trim();

    for (let j = 0; j < allVaultMods.length; j++) {
      const vm = allVaultMods[j];
      if (!vm || vm.isVirtual || vm.isCollection || !vm.name) continue;
      const isSelf = vm.name === primaryVm.name;
      const vmBase = cleanSearchName(vm.name, schema).toLowerCase().trim();
      const isTwinBase =
        Boolean(primaryBase) && vmBase === primaryBase && !isSelf;
      const vmFam = String(vm.baseFamilyId || vm.familyId || vm.dbId || "")
        .split("@")[0]
        .trim();
      const rel = String(vm.relationshipType || "").toLowerCase();
      const isCoreTwinSibling =
        Boolean(anchorFam) &&
        anchorFam !== "null" &&
        anchorFam !== "undefined" &&
        !anchorFam.startsWith("local_") &&
        vmFam === anchorFam &&
        (rel === "core" || rel === "twin" || (!rel && isTwinBase));

      if (isSelf || isTwinBase || isCoreTwinSibling) {
        namesToAdd.push(vm.name);
        if (vm.hash) {
          hashesToAdd[vm.name] = String(vm.hash);
        }
      }
    }
  }

  if (namesToAdd.length === 0) return;

  const existingMods = Array.isArray(targetSet.mods) ? targetSet.mods : [];
  const mergedMods = deduplicateBlueprintArtifacts(
    [...existingMods, ...namesToAdd],
    schema
  );
  const nextSet = {
    ...targetSet,
    mods: mergedMods,
    modHashes: {
      ...(targetSet.modHashes || {}),
      ...hashesToAdd,
    },
  };
  const nextSets = [...currentSets];
  nextSets[resolvedIdx] = nextSet;
  store.setPlaySets(nextSets);

  store.pushStatus(
    t("patch_sim_equipped_dep_toast", 'Equipped {0} into "{1}".')
      .replace("{0}", equippedLabels.join(", "))
      .replace("{1}", targetSet.name),
    "success"
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

