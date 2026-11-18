import { isDesktop } from "../../utils/envUtils";
import {
  HoverTooltip,
  cleanSearchName,
  getModIcon,
} from "../../shared";
import { UniversalCard } from "../universal/UniversalCard";
import { DynamicBlueprintPreviewBanner } from "../../chameleon-components/ThemeCard";
import { VaultCompanionDesktopBlueprint, ResolvedStagedPayload } from "../../utils/stagingCrypto";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";
import { resolveKnownAuthor, resolveSchemaPriorityTiers } from "./stagingEditorHelpers";

export function useStagingCardRenderers({
  onOpenDossier,
  t,
  activeGameSchema,
  stagingDraftMode,
  setStagingDraftMode,
  setStagingDraftName,
  setTargetDesktopBlueprint,
  setStagingDraftAutoEquip,
  stagingDraftItems,
  stagingDraftRemovedItems,
  loadSavedLocalDraft,
  deleteSavedLocalDraft,
  clearStagingDraft,
  setVolatileSignatureQueue,
  setActiveSignatureQueueIndex,
  setIsSignatureQueueOpen,
  setActiveSubTab,
  setIsDraftPanelOpen,
  setIsCloudPanelOpen,
  setCloudSearchFilter,
  setCloudVisibleCount,
  isTransmitting,
  isShredding,
  deleteDraftConfirm,
  setDeleteDraftConfirm,
  setPreviewAsset,
  setInspectingPack,
  setInspectSearchQuery,
  setInspectFilterTab,
  setInspectVisibleCount,
  matchingDesktopBp,
  activeCloud,
  moveItem,
  cycleItemTier,
  removeItem,
  handleEncryptAndTransmit,
  handleLoadActiveCloudIntoEditor,
  handleToggleCloudCompleteLocally,
  handleShredActiveCloud,
  totalPendingChangesCount,
}: any) {
  const renderStagedModCard = (item: any, idx: number, isReadOnly = false) => {
    const realIdx = isReadOnly
      ? idx
      : stagingDraftItems.findIndex((x: any) => x.id === item.id);
    const activeTiers = resolveSchemaPriorityTiers(activeGameSchema);
    const currentTier = item.priority_tier || activeTiers[Math.min(2, activeTiers.length - 1)]?.id || "3_Standard";
    const tierMeta =
      activeTiers.find((pt) => pt.id === currentTier) ||
      activeTiers[Math.min(2, activeTiers.length - 1)] ||
      activeTiers[0];
    const isNexusAsset =
      item.asset_type === "lexicon" ||
      item.asset_type === "chameleon" ||
      item.asset_type === "workbench_template";

    return (
      <div
        key={`${item.id || item.name}_${idx}`}
        onClick={() => {
          if (isNexusAsset && item.asset_id) {
            setPreviewAsset({
              id: String(item.asset_id),
              type: item.asset_type,
            });
          } else {
            const knownAuthor = resolveKnownAuthor(item, "");
            onOpenDossier?.({
              ...item,
              dbId: item.dbId || item.id,
              status: item.status || "stable",
              author: knownAuthor || item.author || item.master_author || "",
              master_author: knownAuthor || item.master_author || item.author || "",
              category_override: item.category_override || item.category || item.type || "",
              isNexusView: true,
            });
          }
        }}
        className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all cursor-pointer flex flex-col justify-between gap-3 group"
      >
        <div className="flex items-start gap-3 min-w-0 w-full">
          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[20px]">
              {isNexusAsset
                ? item.asset_type === "lexicon"
                  ? t("icon_translate", "translate")
                  : item.asset_type === "chameleon"
                    ? t("icon_palette", "palette")
                    : t("icon_draw", "draw")
                : getModIcon(item, activeGameSchema, t)}
            </span>
          </div>

          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug group-hover:text-[var(--accent)] transition-colors truncate">
              {cleanSearchName(item.displayName || item.name, activeGameSchema)}
            </span>

            <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
              <span className="truncate">
                {resolveKnownAuthor(item, t("unknown_mason", "Unknown {Mason}"))}
              </span>
              {item.dependencyOf && (
                <span className="text-[9px] font-bold text-[var(--accent)] truncate">
                  • {t("staging_dep_of_prefix", "Required by")} {item.dependencyOf}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={`${VAULT_CHIP_CLASS} font-mono`}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_tag", "tag")}
              </span>
              <span>#{String((realIdx >= 0 ? realIdx : idx) + 1).padStart(3, "0")}</span>
            </span>

            {!isNexusAsset && stagingDraftMode === "blueprint" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isReadOnly) cycleItemTier(item.id, currentTier);
                }}
                className={`${VAULT_CHIP_CLASS} ${
                  !isReadOnly
                    ? "hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] cursor-pointer transition-colors"
                    : ""
                }`}
              >
                <span
                  className={`material-symbols-outlined !text-[12px] ${tierMeta.iconColorClass}`}
                >
                  {t("icon_low_priority", "low_priority")}
                </span>
                <span>{t(tierMeta.labelKey, tierMeta.fallback)}</span>
              </button>
            )}

            {isNexusAsset && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_bolt", "bolt")}
                </span>
                <span>{t("sig_queue_badge_direct_install", "Direct OS Install")}</span>
              </span>
            )}

            {item.isDependency && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_account_tree", "account_tree")}
                </span>
                <span>{t("staging_badge_dependency", "Dependency")}</span>
              </span>
            )}

            {item.is_early_access && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_schedule", "schedule")}
                </span>
                <span>{t("badge_early_access", "Early Access")}</span>
              </span>
            )}

            {item.is_paid && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_workspace_premium", "workspace_premium")}
                </span>
                <span>{t("badge_paid", "Paid")}</span>
              </span>
            )}
          </div>

          {!isReadOnly && (
            <div
              className="flex items-center gap-1.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {stagingDraftMode === "blueprint" && !isNexusAsset && (
                <>
                  <button
                    type="button"
                    disabled={realIdx <= 0}
                    onClick={() => moveItem(realIdx, -1)}
                    className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors disabled:opacity-25 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_keyboard_arrow_up", "keyboard_arrow_up")}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={realIdx < 0 || realIdx >= stagingDraftItems.length - 1}
                    onClick={() => moveItem(realIdx, 1)}
                    className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors disabled:opacity-25 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_keyboard_arrow_down", "keyboard_arrow_down")}
                    </span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-colors relative group/btn cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_close", "close")}
                </span>
                <HoverTooltip
                  title={t("btn_remove", "{Remove}")}
                  variant="danger"
                  className="group-hover/btn:flex z-[200]"
                />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSavedDraftCard = (draft: any) => {
    const draftItems = draft.items || [];
    const isDeleteConfirming = deleteDraftConfirm === draft.id;

    return (
      <UniversalCard
        key={draft.id}
        layout="vertical"
        icon={t("icon_bookmark", "bookmark")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={{ ...draft, json_data: { artifacts: draftItems } }}
            heightClass="h-full"
          />
        }
        title={draft.name || t("staging_mode_blueprint", "Curated {Blueprint}")}
        subtitle={
          draft.mode === "mod_queue"
            ? t("staging_mode_mod_queue", "{Mod} Download Queue")
            : t("term_blueprint", "{Blueprint}")
        }
        onClick={() => {
          setInspectSearchQuery("");
          setInspectFilterTab("ALL");
          setInspectVisibleCount(80);
          setInspectingPack({ type: "draft", data: draft });
        }}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {t("icon_memory", "memory")}
              </span>
              <span>{t("staging_local_memory_badge", "Saved on Your Device")}</span>
            </div>
          </div>
        }
        actions={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isDeleteConfirming) {
                deleteSavedLocalDraft(draft.id);
                setDeleteDraftConfirm(null);
              } else {
                setDeleteDraftConfirm(draft.id);
                setTimeout(() => setDeleteDraftConfirm(null), 3000);
              }
            }}
            className={`w-8 h-8 rounded-xl glass-surface border flex items-center justify-center transition-all relative cursor-pointer ${
              isDeleteConfirming
                ? "border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]"
                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] opacity-75 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:text-[var(--danger)]"
            }`}
          >
            <span className="material-symbols-outlined !text-[16px]">
              {isDeleteConfirming
                ? t("icon_warning", "warning")
                : t("icon_delete", "delete")}
            </span>
            <HoverTooltip
              title={
                isDeleteConfirming ? t("confirm", "Confirm") : t("purge", "Delete")
              }
              variant="danger"
            />
          </button>
        }
        badges={
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInspectSearchQuery("");
                setInspectFilterTab("ALL");
                setInspectVisibleCount(80);
                setInspectingPack({ type: "draft", data: draft });
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_extension", "extension")}
              </span>
              <span>
                {draftItems.length} {t("artifacts_linked", "{Mods} Linked")}
              </span>
            </button>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_tag", "tag")}
              </span>
              <span className="text-[var(--subtext)]">{draft.code || "LOCAL"}</span>
            </div>
          </>
        }
        footer={
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                loadSavedLocalDraft(draft.id);
                setActiveSubTab("OVERVIEW");
                setIsDraftPanelOpen(true);
              }}
              className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_play_circle", "play_circle")}
              </span>
              <span>{t("staging_btn_use_short", "Use {Blueprint}")}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInspectSearchQuery("");
                setInspectFilterTab("ALL");
                setInspectVisibleCount(80);
                setInspectingPack({ type: "draft", data: draft });
              }}
              className="h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_visibility", "visibility")}
              </span>
              <HoverTooltip title={t("staging_btn_view_contents", "View {Mods}")} />
            </button>
          </div>
        }
      />
    );
  };

  const renderActiveCloudPayloadCard = (
    customCloud?: ResolvedStagedPayload,
    queueIdx?: number
  ) => {
    const cloudTarget = customCloud || activeCloud;
    if (!cloudTarget) return null;
    const cloudItems = cloudTarget.resolvedItems || [];
    const cloudRemoved = cloudTarget.payload?.removedItems || [];
    const cloudMode = cloudTarget.payload?.mode || "blueprint";

    const selectAndOpenCloud = () => {
      if (typeof queueIdx === "number") {
        setActiveSignatureQueueIndex(queueIdx);
      }
      setVolatileSignatureQueue(cloudTarget);
      setCloudSearchFilter("");
      setCloudVisibleCount(80);
      setIsCloudPanelOpen(true);
    };

    return (
      <UniversalCard
        key={cloudTarget.rowId || cloudTarget.payload.blueprintCode || queueIdx}
        layout="vertical"
        isActive={true}
        icon={t("icon_phonelink_ring", "phonelink_ring")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={{
              name: cloudTarget.payload.blueprintName,
              json_data: {
                artifacts: cloudItems,
              },
            }}
            heightClass="h-full"
          />
        }
        title={cloudTarget.payload.blueprintName}
        subtitle={`${cloudTarget.payload.sourceDevice ? `${cloudTarget.payload.sourceDevice} • ` : ""}${
          cloudTarget.isCompletedLocally
            ? t("sig_queue_badge_completed_local", "Completed Here • Pending on Other Systems")
            : t("staging_active_cloud_title", "Awaiting Desktop Signature")
        }`}
        onClick={selectAndOpenCloud}
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectAndOpenCloud();
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_extension", "extension")}
              </span>
              <span>
                {cloudItems.length} {t("artifacts_linked", "{Mods} Linked")}
              </span>
            </button>
            {cloudTarget.payload?.isFullRigBlueprint && (
              <div className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]`}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_devices", "devices")}
                </span>
                <span>{t("pipeline_badge_full_rig", "Full Rig {Blueprint}")}</span>
              </div>
            )}
            {cloudRemoved.length > 0 && (
              <div className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)]`}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_remove_circle_outline", "remove_circle_outline")}
                </span>
                <span>
                  -{cloudRemoved.length} {t("staging_badge_removing", "Removing")}
                </span>
              </div>
            )}
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {cloudMode === "blueprint"
                  ? t("icon_map", "map")
                  : t("icon_download", "download")}
              </span>
              <span>
                {cloudMode === "blueprint"
                  ? t("staging_mode_blueprint", "Curated {Blueprint}")
                  : t("staging_mode_mod_queue", "{Mod} Download Queue")}
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
                if (typeof queueIdx === "number") {
                  setActiveSignatureQueueIndex(queueIdx);
                }
                setVolatileSignatureQueue(cloudTarget);
                if (isDesktop()) {
                  setIsSignatureQueueOpen(true);
                } else {
                  setCloudSearchFilter("");
                  setCloudVisibleCount(80);
                  setIsCloudPanelOpen(true);
                }
              }}
              className="w-full h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_visibility", "visibility")}
              </span>
              <span>{t("staging_btn_view_contents", "View {Mods}")}</span>
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCloudCompleteLocally(cloudTarget);
                }}
                className={`h-8 glass-surface border rounded-lg transition-all flex items-center justify-center relative cursor-pointer ${
                  cloudTarget.isCompletedLocally
                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:text-[var(--success)]"
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

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLoadActiveCloudIntoEditor(cloudTarget);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_edit", "edit")}
                </span>
                <HoverTooltip title={t("staging_btn_load_to_editor", "Edit")} />
              </button>

              <button
                type="button"
                disabled={isShredding}
                onClick={(e) => {
                  e.stopPropagation();
                  handleShredActiveCloud(cloudTarget);
                }}
                className="h-8 glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] hover:border-[var(--danger)] rounded-lg transition-all flex items-center justify-center relative cursor-pointer"
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

  const renderDesktopBlueprintCard = (bp: VaultCompanionDesktopBlueprint) => {
    const bpItems = bp.artifacts || [];
    const bpModsCount = bp.modsCount ?? bpItems.length;
    const isTargetBp =
      matchingDesktopBp?.name?.toLowerCase() === bp.name.toLowerCase();
    const pendingAddCount = isTargetBp ? stagingDraftItems?.length || 0 : 0;
    const pendingRemCount = isTargetBp ? stagingDraftRemovedItems?.length || 0 : 0;
    const hasPendingForThisBp = isTargetBp && totalPendingChangesCount > 0;
    const effectiveModsCount = Math.max(
      0,
      bpModsCount + pendingAddCount - pendingRemCount
    );

    const openDesktopBpInspector = () => {
      setStagingDraftMode("blueprint");
      setStagingDraftName(bp.name);
      setTargetDesktopBlueprint(bp.name);
      setStagingDraftAutoEquip(!!bp.isActive);
      setInspectSearchQuery("");
      setInspectFilterTab("ALL");
      setInspectVisibleCount(80);
      setInspectingPack({ type: "desktop_bp", data: bp });
    };

    return (
      <UniversalCard
        key={bp.name}
        layout="vertical"
        isActive={!!bp.isActive || hasPendingForThisBp}
        icon={t("icon_devices", "devices")}
        customIcon={
          <DynamicBlueprintPreviewBanner
            data={{
              name: bp.name,
              json_data: {
                artifacts:
                  pendingAddCount > 0
                    ? [...(stagingDraftItems || []), ...bpItems]
                    : bpItems,
              },
            }}
            heightClass="h-full"
          />
        }
        title={bp.name}
        subtitle={
          hasPendingForThisBp
            ? t(
                "staging_desktop_bp_edit_notice",
                "Proposed Edit for Desktop {Blueprint}: {0} (Requires Desktop Signature)"
              ).replace("{0}", bp.name)
            : bp.isActive
              ? t("staging_desktop_bp_active_badge", "Active on Desktop")
              : t("staging_desktop_bp_synced_badge", "Synced Desktop {Blueprint}")
        }
        onClick={openDesktopBpInspector}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[85%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  bp.isActive ? "text-[var(--success)]" : "text-[var(--accent)]"
                }`}
              >
                {bp.isActive
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_encrypted", "encrypted")}
              </span>
              <span>
                {bp.isActive
                  ? t("staging_desktop_bp_active_badge", "Active on Desktop")
                  : t("staging_badge_aes", "AES-256-GCM")}
              </span>
            </div>
          </div>
        }
        actions={
          hasPendingForThisBp ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearStagingDraft();
                setTargetDesktopBlueprint(bp.name);
                setStagingDraftName(bp.name);
              }}
              className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all relative cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_delete", "delete")}
              </span>
              <HoverTooltip
                title={t("staging_btn_clear_draft", "Clear Draft")}
                variant="danger"
              />
            </button>
          ) : undefined
        }
        badges={
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openDesktopBpInspector();
              }}
              className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)] transition-colors cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_extension", "extension")}
              </span>
              <span>
                {effectiveModsCount} {t("artifacts_linked", "{Mods} Linked")}
              </span>
            </button>

            {pendingAddCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openDesktopBpInspector();
                  setInspectFilterTab("STAGED");
                }}
                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)] cursor-pointer`}
              >
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_add_circle", "add_circle")}
                </span>
                <span>
                  +{pendingAddCount} {t("staging_btn_added", "Added")}
                </span>
              </button>
            )}

            {pendingRemCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openDesktopBpInspector();
                  setInspectFilterTab("REMOVING");
                }}
                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] cursor-pointer`}
              >
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_remove_circle_outline", "remove_circle_outline")}
                </span>
                <span>
                  -{pendingRemCount} {t("staging_badge_removing", "Queued to {Remove}")}
                </span>
              </button>
            )}
          </>
        }
        footer={
          <div className="flex items-center gap-2 w-full">
            {hasPendingForThisBp ? (
              <button
                type="button"
                disabled={isTransmitting}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEncryptAndTransmit(bp);
                }}
                className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {isTransmitting
                    ? t("icon_sync", "sync")
                    : t("icon_encrypted", "encrypted")}
                </span>
                <span className="truncate">
                  {isTransmitting
                    ? t("staging_btn_transmitting", "Encrypting & Sending...")
                    : t("staging_btn_transmit", "Encrypt & Send to Desktop")}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openDesktopBpInspector();
                }}
                className="flex-1 h-9 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 relative border bg-transparent glass-surface border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_edit_note", "edit_note")}
                </span>
                <span className="truncate">
                  {t("staging_btn_stage_bp_edit", "Stage Edit to Desktop Queue")}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openDesktopBpInspector();
              }}
              className="h-9 px-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] rounded-xl transition-all flex items-center justify-center gap-1.5 relative font-black uppercase text-[10px] tracking-wider cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_visibility", "visibility")}
              </span>
              <HoverTooltip title={t("staging_btn_view_contents", "View {Mods}")} />
            </button>
          </div>
        }
      />
    );
  };

  return {
    renderStagedModCard,
    renderSavedDraftCard,
    renderActiveCloudPayloadCard,
    renderDesktopBlueprintCard,
  };
}
