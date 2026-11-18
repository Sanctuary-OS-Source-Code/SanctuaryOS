import { HoverTooltip, countBlueprintArtifacts } from "../../shared";
import { UniversalCard } from "../universal/UniversalCard";
import { DynamicBlueprintPreviewBanner } from "../../chameleon-components/ThemeCard";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../../shared-components/ContextMenu";
import { ResolvedStagedPayload } from "../../utils/stagingCrypto";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";
import { LiquidGlassReadinessBar } from "../patch-readiness/LiquidGlassReadinessWidgets";

export function useBlueprintCardRenderers({
  playSets,
  setPlaySets,
  activeSetName,
  equipPlaySet,
  deletePlaySet,
  renamePlaySet,
  setActivePlaySetIndex,
  exportPlaySet,
  t,
  patchFireDrillEnabled,
  activeGameSchema,
  setDrawerReadinessBp,
  shreddingRowId,
  setSelectedUplinkBlueprint,
  pinnedBlueprints,
  togglePin,
  patchReadiness,
  setComputations,
  editingSetName,
  setEditingSetName,
  newSetName,
  setNewSetName,
  deleteConfirm,
  setDeleteConfirm,
  setIsArchitectOpen,
  stagingRigSetName,
  stagedRigSuccessSetName,
  handleStageSetToRigQueue,
  handleOpenMatrix,
  pipelineSetNames,
  handleOpenInSignatureQueue,
  handleTogglePipelineCompleteLocally,
  handleShredPipelineRow,
}: any) {
  const renderPipelineCard = (cloudTarget: ResolvedStagedPayload, queueIdx: number) => {
    if (!cloudTarget?.payload) return null;
    const cloudItems = cloudTarget.resolvedItems || [];
    const cloudRemoved = cloudTarget.payload?.removedItems || [];
    const ownedCount = cloudItems.filter((i: any) => i.isOwned).length;
    const bpTitle =
      cloudTarget.payload.blueprintName || t("term_blueprint", "{Blueprint}");
    const matchingLocalSet = (playSets || []).find(
      (s: any) => String(s?.name || "").toLowerCase() === bpTitle.toLowerCase()
    );
    const sourceDevice = cloudTarget.payload.sourceDevice || "Sanctuary Rig";

    return (
      <UniversalCard
        key={cloudTarget.rowId || cloudTarget.payload.blueprintCode || queueIdx}
        layout="vertical"
        isActive={!cloudTarget.isCompletedLocally}
        icon={t("icon_phonelink_ring", "phonelink_ring")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={{
              name: bpTitle,
              json_data: {
                artifacts: cloudItems,
              },
            }}
            heightClass="h-full"
          />
        }
        title={bpTitle}
        subtitle={`${sourceDevice} • ${cloudTarget.isCompletedLocally
            ? t(
              "sig_queue_badge_completed_local",
              "Completed Here • Pending on Other Systems"
            )
            : t("staging_active_cloud_title", "Awaiting Desktop Signature")
          }`}
        onClick={() => handleOpenInSignatureQueue(cloudTarget, queueIdx)}
        onContextMenu={(e) => {
          const items: SanctuaryContextMenuItem[] = [
            {
              id: "open_sig_queue",
              label: t("pipeline_btn_open_sig_queue", "Inspect & Deploy"),
              icon: t("icon_draw", "draw"),
              variant: "accent",
              onClick: () => handleOpenInSignatureQueue(cloudTarget, queueIdx),
            },
            {
              id: "inspect_mods",
              label: t("blueprint_inspector", "Blueprint Mods"),
              icon: t("icon_extension", "extension"),
              badge: String(cloudItems.length),
              onClick: () =>
                setSelectedUplinkBlueprint({
                  name: bpTitle,
                  code: cloudTarget.payload.blueprintCode || "RIG PIPELINE",
                  artifacts: cloudItems,
                }),
            },
            {
              id: "toggle_complete_local",
              label: cloudTarget.isCompletedLocally
                ? t("sig_queue_btn_mark_pending_local", "Mark Pending on This System")
                : t("sig_queue_btn_mark_complete_local", "Mark Complete on This System"),
              icon: cloudTarget.isCompletedLocally
                ? t("icon_schedule", "schedule")
                : t("icon_task_alt", "task_alt"),
              variant: "success",
              dividerBefore: true,
              onClick: () => handleTogglePipelineCompleteLocally(cloudTarget),
            },
          ];
          if (matchingLocalSet) {
            items.push({
              id: "rebeam_local",
              label: t("pipeline_btn_update_beam", "Update in Pipeline"),
              icon: t("icon_devices", "devices"),
              variant: "accent",
              onClick: () => handleStageSetToRigQueue(matchingLocalSet),
            });
          }
          items.push({
            id: "shred_pipeline",
            label: t("staging_btn_shred_short", "Clear"),
            icon: t("icon_delete_forever", "delete_forever"),
            variant: "danger",
            dividerBefore: true,
            onClick: () => handleShredPipelineRow(cloudTarget),
          });
          openSanctuaryContextMenu(e, {
            title: bpTitle,
            subtitle: `${cloudItems.length} ${t("artifacts_linked", "{Mods} Linked")} • ${sourceDevice}`,
            statusLabel: cloudTarget.isCompletedLocally
              ? t("sig_queue_badge_completed_short", "Completed Here")
              : t("staging_badge_aes", "AES-256-GCM"),
            statusColorClass: cloudTarget.isCompletedLocally
              ? "text-[var(--success)]"
              : "text-[var(--accent)]",
            icon: t("icon_phonelink_ring", "phonelink_ring"),
            iconColorClass: "text-[var(--accent)]",
            items,
          });
        }}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-nowrap items-center gap-1.5 max-w-[85%] z-30 pointer-events-none whitespace-nowrap">
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {cloudTarget.isCompletedLocally
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_encrypted", "encrypted")}
              </span>
              <span>
                {cloudTarget.isCompletedLocally
                  ? t("sig_queue_badge_completed_short", "Completed Here")
                  : t("staging_badge_aes", "AES-256-GCM")}
              </span>
            </div>
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${cloudRemoved.length > 0
                    ? "text-[var(--danger)]"
                    : ownedCount === cloudItems.length && cloudItems.length > 0
                      ? "text-[var(--success)]"
                      : "text-[var(--warning)]"
                  }`}
              >
                {ownedCount === cloudItems.length && cloudItems.length > 0
                  ? t("icon_verified", "verified")
                  : t("icon_cloud_download", "cloud_download")}
              </span>
              <span>
                {ownedCount}/{cloudItems.length} {t("status_in_vault", "In {Vault}")}
                {cloudRemoved.length > 0 ? ` • -${cloudRemoved.length}` : ""}
              </span>
            </div>
          </>
        }
        footer={
          <div className="flex flex-col gap-2.5 w-full">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenInSignatureQueue(cloudTarget, queueIdx);
              }}
              className="w-full h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_26%,transparent)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_draw", "draw")}
              </span>
              <span className="truncate">
                {t("pipeline_btn_open_sig_queue", "Inspect & Deploy")}
              </span>
            </button>

            <div className={`grid ${matchingLocalSet ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePipelineCompleteLocally(cloudTarget);
                }}
                className={`h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer ${cloudTarget.isCompletedLocally
                    ? "text-[var(--success)]"
                    : "text-[var(--subtext)] hover:text-[var(--success)]"
                  }`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {cloudTarget.isCompletedLocally
                    ? t("icon_check_circle", "check_circle")
                    : t("icon_task_alt", "task_alt")}
                </span>
                <HoverTooltip
                  title={
                    cloudTarget.isCompletedLocally
                      ? t("sig_queue_btn_mark_pending_local", "Mark Pending on This System")
                      : t("sig_queue_btn_mark_complete_local", "Mark Complete on This System")
                  }
                />
              </button>

              {matchingLocalSet && (
                <button
                  type="button"
                  disabled={stagingRigSetName === matchingLocalSet.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStageSetToRigQueue(matchingLocalSet);
                  }}
                  className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:text-[var(--accent)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
                >
                  <span
                    className={`material-symbols-outlined !text-[16px] ${stagingRigSetName === matchingLocalSet.name
                        ? "animate-spin text-[var(--accent)]"
                        : ""
                      }`}
                  >
                    {stagingRigSetName === matchingLocalSet.name
                      ? t("icon_sync", "sync")
                      : t("icon_devices", "devices")}
                  </span>
                  <HoverTooltip
                    title={t("pipeline_btn_update_beam", "Update in Pipeline")}
                  />
                </button>
              )}

              <button
                type="button"
                disabled={shreddingRowId === cloudTarget.rowId}
                onClick={(e) => {
                  e.stopPropagation();
                  handleShredPipelineRow(cloudTarget);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--danger)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_delete_forever", "delete_forever")}
                </span>
                <HoverTooltip
                  title={t("staging_btn_shred_short", "Clear")}
                  variant="danger"
                />
              </button>
            </div>
          </div>
        }
      />
    );
  };

  const renderVaultCard = (set: any) => {
    const { alertStatus } = setComputations[set.name] || {
      alertStatus: { total: 0, tier4: 0, tier3: 0, broken: 0, unstable: 0 },
    };
    const bpPatchReport = patchFireDrillEnabled
      ? patchReadiness.blueprintReports.find(
          (r: any) =>
            String(r.blueprintName || "").toLowerCase() ===
            String(set.name || "").toLowerCase()
        ) || null
      : null;
    const isPinned = pinnedBlueprints.includes(set.name);
    const hasAlerts = alertStatus && alertStatus.total > 0;
    const isDeployed = activeSetName === set.name;
    const linkedModsCount = countBlueprintArtifacts(set.mods, activeGameSchema);

    const titleNode =
      editingSetName === set.name ? (
        <div onClick={(e) => e.stopPropagation()} className="w-full">
          <input
            autoFocus
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                  renamePlaySet(set.name, newSetName.trim());
                }
                setEditingSetName(null);
              } else if (e.key === "Escape") {
                setEditingSetName(null);
              }
            }}
            onBlur={() => {
              if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                renamePlaySet(set.name, newSetName.trim());
              }
              setEditingSetName(null);
            }}
            className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] px-3 py-1.5 rounded-xl text-sm font-black text-[var(--text)] tracking-tight outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      ) : (
        <div
          className="flex items-center gap-2 cursor-pointer w-full group/editbtn"
          onClick={(e) => {
            e.stopPropagation();
            setNewSetName(set.name);
            setEditingSetName(set.name);
          }}
        >
          <span className="truncate">{set.name}</span>
          <span className="material-symbols-outlined !text-[14px] opacity-0 group-hover/editbtn:opacity-100 transition-opacity text-[var(--subtext)] hover:text-[var(--accent)] shrink-0">
            {t("icon_edit", "edit")}
          </span>
        </div>
      );

    return (
      <UniversalCard
        key={set.name}
        layout="vertical"
        isActive={isDeployed}
        icon={isDeployed ? t("icon_verified_user", "verified_user") : t("icon_map", "map")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={set}
            countOverride={linkedModsCount}
            heightClass="h-full"
          />
        }
        title={titleNode}
        subtitle={isDeployed ? t("btn_deployed", "Deployed") : t("term_blueprint", "{Blueprint}")}
        onContextMenu={(e) => {
          const items: SanctuaryContextMenuItem[] = [
            {
              id: "equip",
              label: isDeployed
                ? t("btn_deployed", "Deployed")
                : t("action_equip", "Equip {Blueprint}"),
              icon: isDeployed
                ? t("icon_verified_user", "verified_user")
                : t("icon_play_circle", "play_circle"),
              variant: isDeployed ? "success" : "accent",
              onClick: () => equipPlaySet && equipPlaySet(set.name),
            },
            {
              id: "inspect",
              label: t("blueprint_inspector", "Blueprint Mods"),
              icon: t("icon_extension", "extension"),
              badge: String(linkedModsCount),
              onClick: () =>
                setSelectedUplinkBlueprint({
                  name: set.name,
                  code: "LOCAL BLUEPRINT",
                  artifacts: set.mods,
                }),
            },
            {
              id: "architect",
              label: hasAlerts
                ? `${alertStatus.total} ${t("system_alerts_title", "Alerts")}`
                : t("architect", "Blueprint Architect"),
              icon: hasAlerts
                ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                  ? t("icon_error", "error")
                  : t("icon_warning", "warning")
                : t("icon_tune", "tune"),
              variant: hasAlerts
                ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                  ? "danger"
                  : "warning"
                : "default",
              onClick: () => {
                if (setActivePlaySetIndex)
                  setActivePlaySetIndex(playSets.findIndex((s: any) => s.name === set.name));
                setIsArchitectOpen(true);
              },
            },
            {
              id: "pin",
              label: isPinned
                ? t("action_unpin", "Unpin {Blueprint}")
                : t("action_pin", "Pin {Blueprint}"),
              icon: isPinned ? t("icon_keep_off", "keep_off") : t("icon_keep", "keep"),
              dividerBefore: true,
              onClick: () => togglePin(set.name),
            },
            {
              id: "rename",
              label: t("edit", "Edit"),
              icon: t("icon_edit", "edit"),
              onClick: () => {
                setNewSetName(set.name);
                setEditingSetName(set.name);
              },
            },
            {
              id: "duplicate",
              label: t("btn_snapshot", "Snapshot Active {Blueprint}"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => {
                let copyIndex = 1;
                let newName = `${set.name} (Copy)`;
                while (
                  playSets.some(
                    (s: any) => s.name.toLowerCase() === newName.toLowerCase()
                  )
                ) {
                  newName = `${set.name} (Copy) (${copyIndex})`;
                  copyIndex++;
                }
                const updatedSets = [
                  ...playSets,
                  {
                    name: newName,
                    mods: Array.isArray(set.mods) ? [...set.mods] : [],
                    modHashes: set.modHashes ? { ...set.modHashes } : undefined,
                    modMeta: set.modMeta ? { ...set.modMeta } : undefined,
                    loadRules: Array.isArray(set.loadRules)
                      ? set.loadRules.map((r: any) => ({ ...r }))
                      : undefined,
                    modTiers: set.modTiers ? { ...set.modTiers } : undefined,
                    loadOrder: Array.isArray(set.loadOrder)
                      ? [...set.loadOrder]
                      : undefined,
                  },
                ];
                setPlaySets(updatedSets);
                window.dispatchEvent(new Event("storage"));
              },
            },
            {
              id: "send_rig_queue",
              label: t("action_send_rig_queue", "Send to Rig Queue"),
              icon: t("icon_devices", "devices"),
              variant: "accent",
              dividerBefore: true,
              onClick: () => handleStageSetToRigQueue(set),
            },
            {
              id: "uplink",
              label: t("action_uplink", "Uplink"),
              icon: t("icon_cloud", "cloud"),
              onClick: () => handleOpenMatrix(set.name),
            },
            {
              id: "export",
              label: t("action_export", "Export"),
              icon: t("icon_upload", "upload"),
              onClick: () => exportPlaySet && exportPlaySet(set.name),
            },
            {
              id: "delete",
              label: `${t("purge", "{Delete}")} ${t("term_blueprint", "{Blueprint}")}`,
              icon: t("icon_delete_forever", "delete_forever"),
              variant: "danger",
              dividerBefore: true,
              onClick: () => deletePlaySet && deletePlaySet(set.name),
            },
          ];

          openSanctuaryContextMenu(e, {
            title: set.name,
            subtitle: `${linkedModsCount} ${t("artifacts_linked", "{Mods} Linked")}`,
            statusLabel: isDeployed
              ? t("status_active", "Active")
              : t("status_standby", "Standby"),
            statusColorClass: isDeployed ? "text-[var(--success)]" : "opacity-80",
            icon: isDeployed
              ? t("icon_verified_user", "verified_user")
              : t("icon_map", "map"),
            iconColorClass: isDeployed ? "text-[var(--success)]" : "text-[var(--accent)]",
            items,
          });
        }}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-nowrap items-center gap-1.5 max-w-[75%] z-30 pointer-events-none whitespace-nowrap">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${isDeployed ? "text-[var(--success)]" : "text-[var(--subtext)]"
                  }`}
              >
                {isDeployed ? t("icon_verified_user", "verified_user") : t("icon_schedule", "schedule")}
              </span>
              <span>
                {isDeployed ? t("status_active", "Active") : t("status_standby", "Standby")}
              </span>
            </div>
            {pipelineSetNames.has(String(set.name || "").toLowerCase()) && (
              <div className={`${VAULT_CHIP_CLASS} text-[var(--accent)]`}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_phonelink_ring", "phonelink_ring")}
                </span>
                <span>{t("pipeline_badge_in_pipeline", "In Pipeline")}</span>
              </div>
            )}
          </div>
        }
        actions={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePin(set.name);
            }}
            className={`w-6 h-6 rounded-lg glass-surface border flex items-center justify-center transition-all relative cursor-pointer ${isPinned
                ? "text-[var(--accent)] border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] opacity-100"
                : "text-[var(--subtext)] opacity-75 hover:opacity-100 border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:text-[var(--accent)]"
              }`}
          >
            <span
              className="material-symbols-outlined !text-[14px]"
              style={{
                fontVariationSettings: isPinned ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              {isPinned
                ? t("icon_keep", "keep")
                : t("icon_keep_off", "keep_off")}
            </span>
            <HoverTooltip
              title={
                isPinned
                  ? t("action_unpin", "Unpin {Blueprint}")
                  : t("action_pin", "Pin {Blueprint}")
              }
            />
          </button>
        }
        footer={
          <div className="flex flex-col gap-2.5 w-full">
            {bpPatchReport && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawerReadinessBp(set.name);
                }}
                className="w-full rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] px-2.5 py-2 flex flex-col gap-1.5 transition-all cursor-pointer group/drill text-left"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                  <span className="flex items-center gap-1.5 text-[var(--subtext)] group-hover/drill:text-[var(--text)] transition-colors min-w-0">
                    <span
                      className={`material-symbols-outlined !text-[13px] ${
                        bpPatchReport.verdict === "hold"
                          ? "text-[var(--danger)]"
                          : bpPatchReport.verdict === "updates_ready"
                            ? "text-[var(--warning)]"
                            : "text-[var(--success)]"
                      }`}
                    >
                      {t("icon_published_with_changes", "published_with_changes")}
                    </span>
                    <span className="truncate font-mono">
                      {patchReadiness.targetVersion
                        ? `v${patchReadiness.targetVersion}`
                        : t("patch_sim_tab_title", "Patch Readiness")}
                    </span>
                  </span>
                  <span
                    className={`font-mono font-black shrink-0 ${
                      bpPatchReport.verdict === "hold"
                        ? "text-[var(--danger)]"
                        : bpPatchReport.verdict === "updates_ready"
                          ? "text-[var(--warning)]"
                          : "text-[var(--success)]"
                    }`}
                  >
                    {bpPatchReport.readinessPercent}% {t("patch_sim_ready_label", "Ready")}
                  </span>
                </div>
                <LiquidGlassReadinessBar
                  readyCount={bpPatchReport.readyMods.length}
                  updateCount={bpPatchReport.updatableMods.length}
                  blockingCount={bpPatchReport.blockingMods.length}
                  totalCount={bpPatchReport.totalMods}
                  heightClass="h-2"
                />
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  equipPlaySet && equipPlaySet(set.name);
                }}
                className={`flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] ${isDeployed
                    ? "text-[var(--success)]"
                    : "text-[var(--accent)]"
                  }`}
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {isDeployed
                    ? t("icon_verified_user", "verified_user")
                    : t("icon_play_circle", "play_circle")}
                </span>
                <span>
                  {isDeployed ? t("btn_deployed", "Deployed") : t("playsets_btn_equip", "Equip")}
                </span>
                <HoverTooltip
                  title={
                    isDeployed
                      ? t("btn_deployed", "Deployed")
                      : t("action_equip", "Equip {Blueprint}")
                  }
                />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (setActivePlaySetIndex)
                    setActivePlaySetIndex(playSets.findIndex((s: any) => s.name === set.name));
                  setIsArchitectOpen(true);
                }}
                className={`h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider ${hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? "text-[var(--danger)]"
                      : "text-[var(--warning)]"
                    : "text-[var(--text)] hover:text-[var(--accent)]"
                  }`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {hasAlerts
                    ? alertStatus.tier4 > 0 || alertStatus.broken > 0
                      ? t("icon_error", "error")
                      : t("icon_warning", "warning")
                    : t("icon_tune", "tune")}
                </span>
                <HoverTooltip
                  title={
                    hasAlerts
                      ? `${alertStatus.total} ${t("system_alerts_title", "Alerts")}`
                      : t("architect", "Blueprint Architect")
                  }
                />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                disabled={stagingRigSetName === set.name}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStageSetToRigQueue(set);
                }}
                className={`h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer ${stagedRigSuccessSetName === set.name
                    ? "text-[var(--success)]"
                    : "text-[var(--subtext)] hover:text-[var(--accent)]"
                  }`}
              >
                <span
                  className={`material-symbols-outlined !text-[16px] ${stagingRigSetName === set.name ? "animate-spin text-[var(--accent)]" : ""
                    }`}
                >
                  {stagingRigSetName === set.name
                    ? t("icon_sync", "sync")
                    : stagedRigSuccessSetName === set.name
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_devices", "devices")}
                </span>
                <HoverTooltip
                  title={
                    stagedRigSuccessSetName === set.name
                      ? t("status_rig_queue_sent", "{Blueprint} Staged to Rig Queue!")
                      : t("action_send_rig_queue", "Send to Rig Queue")
                  }
                />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenMatrix(set.name);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_cloud", "cloud")}
                </span>
                <HoverTooltip title={t("action_uplink", "Uplink")} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  exportPlaySet && exportPlaySet(set.name);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_upload", "upload")}
                </span>
                <HoverTooltip title={t("action_export", "Export")} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (deleteConfirm === set.name) {
                    deletePlaySet && deletePlaySet(set.name);
                    setDeleteConfirm(null);
                  } else {
                    setDeleteConfirm(set.name);
                    setTimeout(() => setDeleteConfirm(null), 3000);
                  }
                }}
                className={`h-8 transition-all flex items-center justify-center rounded-lg border glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] relative cursor-pointer ${deleteConfirm === set.name
                    ? "text-[var(--danger)]"
                    : "text-[var(--subtext)] hover:text-[var(--danger)]"
                  }`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {deleteConfirm === set.name
                    ? t("icon_warning", "warning")
                    : t("icon_delete", "delete")}
                </span>
                <HoverTooltip
                  title={
                    deleteConfirm === set.name ? t("confirm", "Confirm") : t("purge", "Delete")
                  }
                />
              </button>
            </div>
          </div>
        }
      />
    );
  };

  return {
    renderPipelineCard,
    renderVaultCard,
  };
}
