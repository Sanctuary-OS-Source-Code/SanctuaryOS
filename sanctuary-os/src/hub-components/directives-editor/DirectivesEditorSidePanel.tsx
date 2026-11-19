import {
  SidePanel,
  SidePanelFilterBar,
  CustomDropdown,
  HoverTooltip,
  PanelHeaderGroup,
  PanelHeaderButton,
  LinkAssetSidePanel,
  DashboardStatTile,
  ActionButton,
  UniversalGroup,
} from "../../shared";
import IconPicker from "../../shared-components/IconPicker";
import AssetPreviewSidebar from "../../side-panels/AssetPreviewSidebar";
import MasonPostViewer from "../../side-panels/MasonPostViewer";
import { renderCleanInlineText, LegalDocVersionInfoBlock } from "../../components/ReleaseNotesShowcase";
import {
  UnifiedPostBodyEditor,
  PostAttachmentsManager,
  PostEditorModeTiles,
  AutoResizeTextarea,
} from "../../components/universal/UnifiedPostEditor";
import { CANONICAL_LEGAL_DOCS, LegalDocCategory } from "../../utils/directivesSync";
import { isDesktop } from "../../utils/envUtils";
import { KeeperDocConflictBar } from "../../components/universal/KeeperDocConflictBar";
import {
  RoadmapMilestoneStatus,
  resolveRoadmapSubCardStatus,
  getRoadmapStatusMeta,
  stripDirectiveBuilderComment,
} from "../../utils/directivesBuilderSchema";
import { NEWS_CATEGORIES } from "./directivesEditorConstants";

export function DirectivesEditorSidePanel({
  session,
  t,
  title,
  setTitle,
  category,
  setCategory,
  actionRequired,
  setActionRequired,
  pollData,
  setPollData,
  content,
  setContent,
  imageUrl,
  setImageUrl,
  isSubmitting,
  isSyncing,
  editingPostId,
  editingPost,
  editingRecordKind,
  previewPost,
  setPreviewPost,
  codeSnippet,
  setCodeSnippet,
  showCodeInput,
  setShowCodeInput,
  conflictServerRow,
  setConflictServerRow,
  isConflictSaveBlocked,
  setIsConflictSaveBlocked,
  setIsAssetPanelOpen,
  isAssetPanelOpen,
  setActiveAsset,
  activeAsset,
  isEditorOpen,
  confirmDiscard,
  isActive,
  setIsActive,
  confirmDelete,
  setConfirmDelete,
  editorMode,
  setBuilderSchema,
  builderSchema,
  activeBuilderTabIdx,
  setActiveBuilderTabIdx,
  setSelectedBuilderCardIdx,
  setEditingSubCardIdx,
  editingSubCardIdx,
  isDirty,
  setIsDirty,
  setIconPickerTarget,
  iconPickerTarget,
  baseRevision,
  activeCanonicalSlug,
  activeCanonicalMeta,
  activeDocKey,
  presence,
  editor,
  switchEditorMode,
  handleLinkAsset,
  closeEditor,
  handleDiscardChanges,
  handleImportLocalMdToDraft,
  handleLoadLatestFromHub,
  handleOverwriteHubWithMine,
  handleResetBuilderToDefault,
  updateBuilderCard,
  handleAddCardToTab,
  handleMoveCard,
  handleDeleteCard,
  handleAddSubCard,
  updateSubCard,
  handleMoveSubCard,
  handleDeleteSubCard,
  handleSubmit,
  handleDelete,
  activeBuilderTab,
  safeSelectedCardIdx,
  activeBuilderCard,
}: any) {
  return (
    <>
      {isEditorOpen && (
        <SidePanel
          isOpen={isEditorOpen}
          onClose={closeEditor}
          icon={
            editingRecordKind === "legal"
              ? t("icon_gavel", "gavel")
              : editingRecordKind === "news"
              ? t("icon_newspaper", "newspaper")
              : t("icon_dashboard", "dashboard")
          }
          widthClass="w-[92vw] md:w-[920px]"
          title={
            title ||
            (editingPostId
              ? t("update_transmission", "Update {Dispatch}")
              : t("post_broadcast", "New {Dispatch}"))
          }
          subtitle={
            activeCanonicalMeta
              ? activeCanonicalMeta.file_path
              : editingRecordKind === "legal"
              ? category
              : editingPostId
              ? t("editing_record", "Editing Record")
              : t("composing_broadcast", "Composing Broadcast")
          }
          headerActions={
            <PanelHeaderGroup>
              {activeCanonicalMeta && (
                <PanelHeaderButton
                  onClick={handleResetBuilderToDefault}
                  tooltip={t("dir_builder_btn_reset", "Reset to Default")}
                  icon={t("icon_restart_alt", "restart_alt")}
                />
              )}

              {editingPostId && editingRecordKind === "news" && (
                <>
                  {confirmDelete === editingPostId ? (
                    <PanelHeaderButton
                      onClick={() => {
                        handleDelete(editingPostId);
                        setConfirmDelete(null);
                        closeEditor();
                      }}
                      tooltip={t("btn_confirm_delete", "Confirm {Delete}")}
                      icon={t("icon_delete_forever", "delete_forever")}
                      variant="danger"
                      className="animate-pulse"
                    />
                  ) : (
                    <PanelHeaderButton
                      onClick={() => setConfirmDelete(editingPostId)}
                      tooltip={t("purge", "Delete Post")}
                      icon={t("icon_delete", "delete")}
                      variant="danger"
                    />
                  )}
                </>
              )}

              {isDirty && (
                <PanelHeaderButton
                  onClick={handleDiscardChanges}
                  disabled={isSubmitting}
                  tooltip={
                    confirmDiscard
                      ? t("ui_confirm_discard", "Click again to discard")
                      : t("ui_btn_discard_edits", "Discard Changes")
                  }
                  icon={
                    confirmDiscard
                      ? t("icon_warning", "warning")
                      : t("icon_undo", "undo")
                  }
                  variant="danger"
                  className={confirmDiscard ? "animate-pulse" : ""}
                />
              )}
              <PanelHeaderButton
                icon={
                  isActive
                    ? t("icon_cell_tower", "cell_tower")
                    : t("icon_portable_wifi_off", "portable_wifi_off")
                }
                variant={isActive ? "success" : "default"}
                tooltip={
                  isActive
                    ? t("status_live", "Live")
                    : t("status_not_live", "Not Live")
                }
                onClick={() => {
                  const nextActive = !isActive;
                  setIsActive(nextActive);
                  setBuilderSchema((prev: any) =>
                    prev ? { ...prev, isActive: nextActive } : prev
                  );
                  setIsDirty(true);
                }}
              />
              {(isDesktop() || import.meta.env.DEV) &&
                Boolean(editingPost?.local_md_content) && (
                  <PanelHeaderButton
                    onClick={handleImportLocalMdToDraft}
                    disabled={isSubmitting || isSyncing}
                    tooltip={t(
                      "keeper_local_md_import_btn",
                      "Import .md to Draft"
                    )}
                    icon={t("icon_upload_file", "upload_file")}
                    variant={
                      editingPost?.has_local_md_changes ? "warning" : "default"
                    }
                  />
                )}
              {activeCanonicalMeta || editingRecordKind === "legal" ? (
                <>
                  <PanelHeaderButton
                    onClick={() => handleSubmit(undefined, false)}
                    disabled={isSubmitting || isSyncing || !title}
                    tooltip={
                      isSubmitting
                        ? t("btn_saving", "Saving...")
                        : t("dir_btn_save_sync_staged", "Save Shared Draft")
                    }
                    icon={
                      isSubmitting
                        ? t("icon_sync", "sync")
                        : t("icon_save", "save")
                    }
                    variant={isDirty ? "warning" : "default"}
                    className={isSubmitting ? "animate-pulse" : ""}
                  />
                  <PanelHeaderButton
                    onClick={() => handleSubmit(undefined, true)}
                    disabled={isSubmitting || isSyncing || !title}
                    tooltip={
                      isSubmitting
                        ? t("btn_saving", "Saving...")
                        : t(
                            "dir_btn_publish_live",
                            "Publish Live to {Citizens}"
                          )
                    }
                    icon={
                      isSubmitting
                        ? t("icon_sync", "sync")
                        : t("icon_publish", "publish")
                    }
                    variant={
                      isDirty || Boolean(editingPost?.has_unpublished_changes)
                        ? "warning"
                        : "accent"
                    }
                    className={isSubmitting ? "animate-pulse" : ""}
                  />
                </>
              ) : (
                <PanelHeaderButton
                  onClick={() => handleSubmit(undefined, false)}
                  disabled={isSubmitting || isSyncing || !title}
                  tooltip={
                    isSubmitting
                      ? t("btn_saving", "Saving...")
                      : t("save", "Save Changes")
                  }
                  icon={
                    isSubmitting
                      ? t("icon_sync", "sync")
                      : t("icon_send", "send")
                  }
                  variant={isDirty ? "warning" : "accent"}
                  className={isSubmitting ? "animate-pulse" : ""}
                />
              )}
            </PanelHeaderGroup>
          }
        >
          <div
            className={`flex flex-col gap-5 ${
              editorMode === "markdown" ? "flex-1 min-h-0 pb-0" : "shrink-0 pb-8"
            }`}
          >
            <KeeperDocConflictBar
              peerEditors={presence.peersByDocKey[activeDocKey] || []}
              hasLocalMdChanges={Boolean(
                (isDesktop() || import.meta.env.DEV) &&
                  editingPost?.has_local_md_changes
              )}
              localFileName={
                activeCanonicalMeta?.file_path ||
                (editingRecordKind === "legal"
                  ? CANONICAL_LEGAL_DOCS[category as LegalDocCategory]?.file_path
                  : undefined)
              }
              onImportLocalMd={handleImportLocalMdToDraft}
              conflictInfo={
                conflictServerRow
                  ? {
                      baseRevision,
                      serverRevision: Number(conflictServerRow.revision || 1),
                      updatedBy: conflictServerRow.updated_by || "Keepers Core",
                      updatedAt:
                        conflictServerRow.updated_at ||
                        conflictServerRow.created_at,
                      serverTitle: conflictServerRow.title,
                      serverMarkdown: stripDirectiveBuilderComment(
                        conflictServerRow.content ||
                          conflictServerRow.message ||
                          ""
                      ),
                      localMarkdown: stripDirectiveBuilderComment(content || ""),
                      isSaveBlocked: isConflictSaveBlocked,
                    }
                  : null
              }
              onLoadLatestFromHub={handleLoadLatestFromHub}
              onOverwriteWithMine={handleOverwriteHubWithMine}
              onDismissConflict={() => {
                setConflictServerRow(null);
                setIsConflictSaveBlocked(false);
              }}
            />

            {activeCanonicalMeta && (
              <PostEditorModeTiles
                mode={editorMode}
                onModeChange={(m) => switchEditorMode(m)}
              />
            )}

            {/* =================================================================
                MODE A: 100% FULL-WIDTH SINGLE-COLUMN STACKED VISUAL BUILDER
               ================================================================= */}
            {editorMode === "visual" &&
              builderSchema &&
              activeBuilderTab &&
              activeBuilderCard && (
                <div className="flex flex-col gap-4 animate-in fade-in duration-200 w-full">
                  {/* 1. 1x3 or 2x2 Directive Tab Selector */}
                  {builderSchema.tabs.length > 1 && (
                    <SidePanelFilterBar
                      className={
                        builderSchema.tabs.length % 2 === 0
                          ? "md:grid-cols-2 gap-3.5"
                          : "md:grid-cols-3 gap-3.5"
                      }
                    >
                      {builderSchema.tabs.map((tab: any, tIdx: any) => (
                        <DashboardStatTile
                          key={tab.id}
                          variant="filter"
                          icon={tab.icon || t("icon_layers", "layers")}
                          label={`${tab.label} • ${tab.cards.length}`}
                          number={tab.value}
                          colorClass="text-[var(--accent)]"
                          isActive={activeBuilderTabIdx === tIdx}
                          onClick={() => {
                            setActiveBuilderTabIdx(tIdx);
                            setSelectedBuilderCardIdx(0);
                            setEditingSubCardIdx(null);
                          }}
                        />
                      ))}
                    </SidePanelFilterBar>
                  )}

                  {/* 2. Top Action Bar + Liquid Glass Add Card Button */}
                  <div className="glass-panel p-3 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-2.5">
                    <div className="px-2.5 py-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                        {t("icon_dashboard", "dashboard")}
                      </span>
                      <span>
                        {t("dir_builder_cards_list_heading", "Cards in Tab")} (
                        {activeBuilderTab.cards.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddCardToTab(activeBuilderTabIdx)}
                      className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                        {t("icon_add_box", "add_box")}
                      </span>
                      <span>{t("dir_builder_add_card", "Add Card")}</span>
                    </button>
                  </div>

                  {/* 3. 100% Full-Width Single-Column Card Stack */}
                  <div className="flex flex-col gap-3.5 w-full">
                    {activeBuilderTab.cards.map((card: any, cardIdx: any) => {
                      const isSelected = safeSelectedCardIdx === cardIdx;

                      if (!isSelected) {
                        /* UNSELECTED CARD: Full-Width Compact 1-Line Row (Dimmed at opacity-50) */
                        return (
                          <div
                            key={card.id || cardIdx}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedBuilderCardIdx(cardIdx);
                              setEditingSubCardIdx(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedBuilderCardIdx(cardIdx);
                                setEditingSubCardIdx(null);
                              }
                            }}
                            className="glass-panel rounded-2xl px-4 py-3.5 flex flex-col gap-2 border transition-all duration-200 cursor-pointer opacity-50 hover:opacity-85 border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] w-full"
                          >
                            <div className="flex items-center justify-between gap-2.5 sm:gap-3 w-full">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined !text-[18px]">
                                    {card.icon || t("icon_layers", "layers")}
                                  </span>
                                </div>
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-[9px] font-black uppercase tracking-wider text-[var(--accent)] leading-snug">
                                    {card.overline || `#${cardIdx + 1}`}
                                  </span>
                                  <span className="hidden sm:block text-sm font-black text-[var(--text)] truncate">
                                    {renderCleanInlineText(card.title)}
                                  </span>
                                </div>
                              </div>

                              <div
                                className="flex items-center gap-1.5 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {card.badge && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider mr-1">
                                    {activeCanonicalSlug === "phase_roadmap" && (
                                      <span
                                        className={`material-symbols-outlined !text-[12px] ${
                                          card.status === "completed"
                                            ? "text-[var(--success)]"
                                            : card.status === "in_testing"
                                              ? "text-[var(--warning)]"
                                              : "text-[var(--accent)]"
                                        }`}
                                      >
                                        {card.status === "completed"
                                          ? t("icon_check_circle", "check_circle")
                                          : card.status === "in_testing"
                                            ? t("icon_science", "science")
                                            : t("icon_rocket_launch", "rocket_launch")}
                                      </span>
                                    )}
                                    {card.badge}
                                  </span>
                                )}
                                <ActionButton
                                  variant="glass"
                                  icon={t("icon_arrow_upward", "arrow_upward")}
                                  iconOnly={true}
                                  disabled={cardIdx === 0}
                                  onClick={() =>
                                    handleMoveCard(
                                      activeBuilderTabIdx,
                                      cardIdx,
                                      -1
                                    )
                                  }
                                  className="!w-8 !h-8 !rounded-xl"
                                />
                                <ActionButton
                                  variant="glass"
                                  icon={t(
                                    "icon_arrow_downward",
                                    "arrow_downward"
                                  )}
                                  iconOnly={true}
                                  disabled={
                                    cardIdx >= activeBuilderTab.cards.length - 1
                                  }
                                  onClick={() =>
                                    handleMoveCard(
                                      activeBuilderTabIdx,
                                      cardIdx,
                                      1
                                    )
                                  }
                                  className="!w-8 !h-8 !rounded-xl"
                                />
                                <ActionButton
                                  variant="glass"
                                  icon={t("icon_expand_more", "expand_more")}
                                  iconOnly={true}
                                  onClick={() => {
                                    setSelectedBuilderCardIdx(cardIdx);
                                    setEditingSubCardIdx(null);
                                  }}
                                  className="!w-8 !h-8 !rounded-xl"
                                />
                              </div>
                            </div>

                            <span className="sm:hidden text-sm font-black text-[var(--text)] leading-snug">
                              {renderCleanInlineText(card.title)}
                            </span>
                          </div>
                        );
                      }

                      /* SELECTED CARD: Expands In-Place Across 100% of SidePanel Width */
                      return (
                        <div
                          key={card.id || cardIdx}
                          className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] w-full animate-in fade-in duration-150"
                        >
                          {/* Expanded Card Top Header Bar */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                              {t(
                                "dir_builder_editing_card",
                                "Editing Card {0} of {1}"
                              )
                                .replace("{0}", String(cardIdx + 1))
                                .replace(
                                  "{1}",
                                  String(activeBuilderTab.cards.length)
                                )}
                            </span>

                            <div className="flex items-center gap-1.5">
                              <ActionButton
                                variant="glass"
                                icon={t("icon_arrow_upward", "arrow_upward")}
                                iconOnly={true}
                                disabled={cardIdx === 0}
                                onClick={() =>
                                  handleMoveCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    -1
                                  )
                                }
                                className="!w-8 !h-8 !rounded-xl"
                              />
                              <ActionButton
                                variant="glass"
                                icon={t(
                                  "icon_arrow_downward",
                                  "arrow_downward"
                                )}
                                iconOnly={true}
                                disabled={
                                  cardIdx >= activeBuilderTab.cards.length - 1
                                }
                                onClick={() =>
                                  handleMoveCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    1
                                  )
                                }
                                className="!w-8 !h-8 !rounded-xl"
                              />
                              {activeBuilderTab.cards.length > 1 && (
                                <ActionButton
                                  variant="danger"
                                  icon={t("icon_delete", "delete")}
                                  onClick={() =>
                                    handleDeleteCard(
                                      activeBuilderTabIdx,
                                      cardIdx
                                    )
                                  }
                                  className="!px-3 !py-1.5 !text-[10px] !rounded-xl"
                                >
                                  {t("dir_builder_delete_card", "Remove Card")}
                                </ActionButton>
                              )}
                            </div>
                          </div>

                          {/* Row 1: Icon Picker + Full-Width Card Title */}
                          <div className="flex items-end gap-2.5 sm:gap-3 w-full">
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setIconPickerTarget(
                                    iconPickerTarget?.type === "card" &&
                                      iconPickerTarget.cardIdx === cardIdx
                                      ? null
                                      : {
                                          type: "card",
                                          tabIdx: activeBuilderTabIdx,
                                          cardIdx,
                                        }
                                  )
                                }
                                className="h-10 w-10 sm:w-auto sm:px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                                  {card.icon || t("icon_layers", "layers")}
                                </span>
                                <span className="hidden sm:inline text-[10px] font-black uppercase tracking-wider">
                                  {t("visual_editor_icon_btn", "Icon")}
                                </span>
                                <span className="hidden sm:inline material-symbols-outlined !text-[14px] opacity-70">
                                  {t("icon_expand_more", "expand_more")}
                                </span>
                                <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                              </button>
                              {iconPickerTarget?.type === "card" &&
                                iconPickerTarget.tabIdx ===
                                  activeBuilderTabIdx &&
                                iconPickerTarget.cardIdx === cardIdx && (
                                  <div className="absolute left-0 top-12 z-[200]">
                                    <IconPicker
                                      onSelect={(icon) => {
                                        updateBuilderCard(
                                          activeBuilderTabIdx,
                                          cardIdx,
                                          { icon }
                                        );
                                        setIconPickerTarget(null);
                                      }}
                                      onClose={() => setIconPickerTarget(null)}
                                    />
                                  </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                {t("dir_builder_field_title", "Card Title")}
                              </label>
                              <input
                                value={card.title}
                                onChange={(e) =>
                                  updateBuilderCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    { title: e.target.value }
                                  )
                                }
                                className="h-11 w-full glass-surface rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                              />
                            </div>
                          </div>

                          {/* Row 2: Overline & Top-Right Status Badge (2 Columns Across Full Width) */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                {t(
                                  "dir_builder_field_overline",
                                  "Overline / Stage / Phase Label"
                                )}
                              </label>
                              <input
                                value={card.overline}
                                onChange={(e) =>
                                  updateBuilderCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    { overline: e.target.value }
                                  )
                                }
                                className="h-11 w-full glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                {t(
                                  "dir_builder_field_badge",
                                  "Top-Right Status Badge"
                                )}
                              </label>
                              {activeCanonicalSlug === "phase_roadmap" ? (
                                <CustomDropdown
                                  disableTint={true}
                                  value={
                                    card.status === "planned"
                                      ? "planned"
                                      : card.status === "completed"
                                        ? "completed"
                                        : card.status === "in_testing"
                                          ? "in_testing"
                                          : "in_progress"
                                  }
                                  options={(
                                    [
                                      "planned",
                                      "in_progress",
                                      "in_testing",
                                      "completed",
                                    ] as RoadmapMilestoneStatus[]
                                  ).map((st) => {
                                    const meta = getRoadmapStatusMeta(st, t);
                                    return {
                                      id: st,
                                      label: meta.label,
                                      icon: meta.icon,
                                      iconColorClass: meta.colorClass,
                                    };
                                  })}
                                  onChange={(vals: string[]) => {
                                    const picked = (vals[0] ||
                                      "in_progress") as RoadmapMilestoneStatus;
                                    const meta = getRoadmapStatusMeta(
                                      picked,
                                      t
                                    );
                                    const cardStatusKey =
                                      picked === "planned"
                                        ? "planned"
                                        : picked === "in_progress"
                                          ? "active"
                                          : picked === "in_testing"
                                            ? "in_testing"
                                            : "completed";
                                    updateBuilderCard(
                                      activeBuilderTabIdx,
                                      cardIdx,
                                      {
                                        status: cardStatusKey,
                                        badge: meta.label,
                                      }
                                    );
                                  }}
                                />
                              ) : (
                                <input
                                  value={card.badge}
                                  onChange={(e) =>
                                    updateBuilderCard(
                                      activeBuilderTabIdx,
                                      cardIdx,
                                      { badge: e.target.value }
                                    )
                                  }
                                  className="h-11 w-full glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                                />
                              )}
                            </div>
                          </div>

                          {/* Row 3: Full-Width Card Description */}
                          <div className="flex flex-col gap-1 w-full">
                            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                              {t(
                                "dir_builder_field_desc",
                                "Full Description (Shows in Drawer)"
                              )}
                            </label>
                            <AutoResizeTextarea
                              minRows={3}
                              value={card.desc}
                              onChange={(e) =>
                                updateBuilderCard(
                                  activeBuilderTabIdx,
                                  cardIdx,
                                  { desc: e.target.value }
                                )
                              }
                              className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-normal text-[var(--text)] leading-relaxed focus:outline-none focus:theme-border-accent"
                            />
                          </div>

                          {/* Row 4: Inline Drawer Info Blocks / Milestones */}
                          <div className="pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 w-full">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                                  {t("icon_dashboard", "dashboard")}
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                                  {t(
                                    "dir_builder_subcards_heading",
                                    "Expanded Drawer Info Blocks / Milestones"
                                  )}{" "}
                                  ({(card.subCards || []).length})
                                </span>
                              </div>

                              <ActionButton
                                variant="accent"
                                icon={t("icon_add", "add")}
                                onClick={() =>
                                  handleAddSubCard(activeBuilderTabIdx, cardIdx)
                                }
                                className="!px-3 !py-1.5 !text-[10px] !rounded-xl"
                              >
                                {t(
                                  "dir_builder_add_subcard",
                                  "Add Drawer Item"
                                )}
                              </ActionButton>
                            </div>

                            {(card.subCards || []).length > 0 && (
                              <div className="flex flex-col gap-2.5 w-full">
                                {(card.subCards || []).map((sub: any, subIdx: any) => {
                                  const isSubExpanded =
                                    editingSubCardIdx === subIdx;

                                  if (!isSubExpanded) {
                                    /* UNSELECTED DRAWER INFO BLOCK: Full-Width Compact Row */
                                    return (
                                      <div
                                        key={sub.id || subIdx}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() =>
                                          setEditingSubCardIdx(subIdx)
                                        }
                                        onKeyDown={(e) => {
                                          if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                          ) {
                                            e.preventDefault();
                                            setEditingSubCardIdx(subIdx);
                                          }
                                        }}
                                        className="glass-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] opacity-65 hover:opacity-100 cursor-pointer transition-all w-full"
                                      >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                          <span
                                            className={`material-symbols-outlined !text-[16px] shrink-0 ${
                                              activeCanonicalSlug ===
                                              "phase_roadmap"
                                                ? getRoadmapStatusMeta(
                                                    resolveRoadmapSubCardStatus(
                                                      sub
                                                    ),
                                                    t
                                                  ).colorClass
                                                : "text-[var(--accent)]"
                                            }`}
                                          >
                                            {activeCanonicalSlug ===
                                            "phase_roadmap"
                                              ? getRoadmapStatusMeta(
                                                  resolveRoadmapSubCardStatus(
                                                    sub
                                                  ),
                                                  t
                                                ).icon
                                              : sub.icon ||
                                                t(
                                                  "icon_check_circle",
                                                  "check_circle"
                                                )}
                                          </span>
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-xs font-bold text-[var(--text)] truncate">
                                              {renderCleanInlineText(sub.title)}
                                            </span>
                                            <span className="text-[11px] text-[color-mix(in_srgb,var(--text)_78%,transparent)] truncate">
                                              {renderCleanInlineText(sub.desc)}
                                            </span>
                                          </div>
                                        </div>

                                        <div
                                          className="flex items-center gap-1.5 shrink-0"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {activeCanonicalSlug ===
                                            "phase_roadmap" &&
                                            (() => {
                                              const curStatus =
                                                resolveRoadmapSubCardStatus(
                                                  sub
                                                );
                                              const meta = getRoadmapStatusMeta(
                                                curStatus,
                                                t
                                              );
                                              const nextStatus: RoadmapMilestoneStatus =
                                                curStatus === "planned"
                                                  ? "in_progress"
                                                  : curStatus === "in_progress"
                                                    ? "in_testing"
                                                    : curStatus === "in_testing"
                                                      ? "completed"
                                                      : "planned";
                                              const nextMeta =
                                                getRoadmapStatusMeta(
                                                  nextStatus,
                                                  t
                                                );
                                              return (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    updateSubCard(
                                                      activeBuilderTabIdx,
                                                      cardIdx,
                                                      subIdx,
                                                      {
                                                        roadmapStatus:
                                                          nextStatus,
                                                        pending:
                                                          nextStatus ===
                                                          "in_progress" ||
                                                          nextStatus ===
                                                          "planned",
                                                        icon: nextMeta.icon,
                                                      }
                                                    )
                                                  }
                                                  className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider mr-1 flex items-center gap-1.5 transition-all cursor-pointer"
                                                >
                                                  <span
                                                    className={`material-symbols-outlined !text-[12px] ${meta.colorClass}`}
                                                  >
                                                    {meta.icon}
                                                  </span>
                                                  <span>{meta.label}</span>
                                                </button>
                                              );
                                            })()}
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_arrow_upward",
                                              "arrow_upward"
                                            )}
                                            iconOnly={true}
                                            disabled={subIdx === 0}
                                            onClick={() =>
                                              handleMoveSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                -1
                                              )
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_arrow_downward",
                                              "arrow_downward"
                                            )}
                                            iconOnly={true}
                                            disabled={
                                              subIdx >=
                                              (card.subCards || []).length - 1
                                            }
                                            onClick={() =>
                                              handleMoveSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                1
                                              )
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_expand_more",
                                              "expand_more"
                                            )}
                                            iconOnly={true}
                                            onClick={() =>
                                              setEditingSubCardIdx(subIdx)
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                        </div>
                                      </div>
                                    );
                                  }

                                  /* SELECTED DRAWER INFO BLOCK: Expands In-Place at 100% Width */
                                  return (
                                    <div
                                      key={sub.id || subIdx}
                                      className="glass-surface rounded-xl p-4 flex flex-col gap-3.5 border !border-[color-mix(in_srgb,var(--text)_26%,transparent)] opacity-100 w-full animate-in fade-in duration-150"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--accent)]">
                                          {t(
                                            "dir_builder_editing_subcard",
                                            "Editing Drawer Item {0} of {1}"
                                          )
                                            .replace("{0}", String(subIdx + 1))
                                            .replace(
                                              "{1}",
                                              String(
                                                (card.subCards || []).length
                                              )
                                            )}
                                        </span>

                                        <div className="flex items-center gap-1.5">
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_arrow_upward",
                                              "arrow_upward"
                                            )}
                                            iconOnly={true}
                                            disabled={subIdx === 0}
                                            onClick={() =>
                                              handleMoveSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                -1
                                              )
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_arrow_downward",
                                              "arrow_downward"
                                            )}
                                            iconOnly={true}
                                            disabled={
                                              subIdx >=
                                              (card.subCards || []).length - 1
                                            }
                                            onClick={() =>
                                              handleMoveSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                1
                                              )
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                          <ActionButton
                                            variant="danger"
                                            icon={t("icon_delete", "delete")}
                                            onClick={() =>
                                              handleDeleteSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx
                                              )
                                            }
                                            className="!px-2.5 !py-1 !text-[9px] !rounded-lg"
                                          >
                                            {t("purge", "Delete")}
                                          </ActionButton>
                                          <ActionButton
                                            variant="accent"
                                            icon={t(
                                              "icon_expand_less",
                                              "expand_less"
                                            )}
                                            onClick={() =>
                                              setEditingSubCardIdx(null)
                                            }
                                            className="!px-2.5 !py-1 !text-[9px] !rounded-lg"
                                          >
                                            {t(
                                              "dir_builder_done_btn",
                                              "Done"
                                            )}
                                          </ActionButton>
                                        </div>
                                      </div>

                                      {/* Icon + Item Title */}
                                      <div className="flex items-end gap-2.5 sm:gap-3 w-full">
                                        <div className="relative shrink-0">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setIconPickerTarget(
                                                iconPickerTarget?.type ===
                                                  "subcard" &&
                                                  iconPickerTarget.subIdx ===
                                                    subIdx
                                                  ? null
                                                  : {
                                                      type: "subcard",
                                                      tabIdx:
                                                        activeBuilderTabIdx,
                                                      cardIdx,
                                                      subIdx,
                                                    }
                                              )
                                            }
                                            className="h-10 px-3 rounded-xl glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                          >
                                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                                              {sub.icon ||
                                                t(
                                                  "icon_check_circle",
                                                  "check_circle"
                                                )}
                                            </span>
                                            <span className="material-symbols-outlined !text-[14px] opacity-70">
                                              {t("icon_expand_more", "expand_more")}
                                            </span>
                                            <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                                          </button>
                                          {iconPickerTarget?.type ===
                                            "subcard" &&
                                            iconPickerTarget.tabIdx ===
                                              activeBuilderTabIdx &&
                                            iconPickerTarget.cardIdx ===
                                              cardIdx &&
                                            iconPickerTarget.subIdx ===
                                              subIdx && (
                                              <div className="absolute left-0 top-12 z-[200]">
                                                <IconPicker
                                                  onSelect={(icon) => {
                                                    updateSubCard(
                                                      activeBuilderTabIdx,
                                                      cardIdx,
                                                      subIdx,
                                                      { icon }
                                                    );
                                                    setIconPickerTarget(null);
                                                  }}
                                                  onClose={() =>
                                                    setIconPickerTarget(null)
                                                  }
                                                />
                                              </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                            {t(
                                              "dir_builder_field_title",
                                              "Title"
                                            )}
                                          </label>
                                          <input
                                            value={sub.title}
                                            onChange={(e) =>
                                              updateSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                { title: e.target.value }
                                              )
                                            }
                                            placeholder={t(
                                              "dir_builder_subcard_title_ph",
                                              "Info block title..."
                                            )}
                                            className="w-full h-10 glass-surface rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                                          />
                                        </div>

                                        {activeCanonicalSlug ===
                                          "phase_roadmap" && (
                                          <CustomDropdown
                                            disableTint={true}
                                            iconOnlyTrigger={true}
                                            tooltipPrefix={t(
                                              "status",
                                              "Status"
                                            )}
                                            menuMinWidth={260}
                                            value={resolveRoadmapSubCardStatus(
                                              sub
                                            )}
                                            options={(
                                              [
                                                "planned",
                                                "in_progress",
                                                "in_testing",
                                                "completed",
                                              ] as RoadmapMilestoneStatus[]
                                            ).map((st) => {
                                              const meta =
                                                getRoadmapStatusMeta(st, t);
                                              return {
                                                id: st,
                                                label: meta.label,
                                                icon: meta.icon,
                                                iconColorClass:
                                                  meta.colorClass,
                                              };
                                            })}
                                            onChange={(vals: string[]) => {
                                              const picked = (vals[0] ||
                                                "in_progress") as RoadmapMilestoneStatus;
                                              const meta =
                                                getRoadmapStatusMeta(
                                                  picked,
                                                  t
                                                );
                                              updateSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                {
                                                  roadmapStatus: picked,
                                                  pending:
                                                    picked === "in_progress" ||
                                                    picked === "planned",
                                                  icon: meta.icon,
                                                }
                                              );
                                            }}
                                          />
                                        )}
                                      </div>

                                      {/* Full-Width Item Description */}
                                      <div className="flex flex-col gap-1 w-full">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                          {t(
                                            "dir_builder_field_desc",
                                            "Description"
                                          )}
                                        </label>
                                        <AutoResizeTextarea
                                          minRows={3}
                                          value={sub.desc}
                                          onChange={(e) =>
                                            updateSubCard(
                                              activeBuilderTabIdx,
                                              cardIdx,
                                              subIdx,
                                              { desc: e.target.value }
                                            )
                                          }
                                          placeholder={t(
                                            "dir_builder_subcard_desc_ph",
                                            "Concise description..."
                                          )}
                                          className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-normal text-[var(--text)] leading-relaxed focus:outline-none focus:theme-border-accent"
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 4. Bottom Action Bar + Liquid Glass Add Card Button */}
                  <div className="glass-panel p-3 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-2.5">
                    <div className="px-2.5 py-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                        {t("icon_dashboard", "dashboard")}
                      </span>
                      <span>
                        {t("dir_builder_cards_list_heading", "Cards in Tab")} (
                        {activeBuilderTab.cards.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddCardToTab(activeBuilderTabIdx)}
                      className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                        {t("icon_add_box", "add_box")}
                      </span>
                      <span>{t("dir_builder_add_card", "Add Card")}</span>
                    </button>
                  </div>
                </div>
              )}

            {/* =================================================================
                SHARED METADATA + UNIFIED 3-MODE EDITOR FOR NEWS / LEGAL
               ================================================================= */}
            {!activeCanonicalMeta && (
              <div className="flex flex-col gap-5 w-full">
                <UniversalGroup
                  title={t("metadata", "Metadata")}
                  icon={t("icon_tune", "tune")}
                >
                  <div className="flex flex-col gap-4 w-full">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                        {t("dir_builder_field_title", "Title")}
                      </label>
                      <input
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder={t("post_title_placeholder", "Enter title...")}
                        className="h-11 w-full glass-surface rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                      />
                    </div>

                    {editingRecordKind === "legal" && (
                      <LegalDocVersionInfoBlock
                        content={content}
                        updatedAt={
                          editingPost?.updated_at || editingPost?.created_at
                        }
                      />
                    )}

                    {editingRecordKind === "news" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                        <div className="flex flex-col gap-1.5 flex-1">
                          <label className="text-[9px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                            {t("category", "Category")}
                          </label>
                          <CustomDropdown
                            disableTint={true}
                            searchable={false}
                            value={category}
                            onChange={(v: string[]) => {
                              setCategory(v[0]);
                              setIsDirty(true);
                            }}
                            options={NEWS_CATEGORIES.map((c) => ({
                              id: c,
                              label: c,
                            }))}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                          <label className="text-[9px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                            {t("dispatch_meta_action", "Action Required")}
                          </label>
                          <CustomDropdown
                            disableTint={true}
                            searchable={false}
                            value={actionRequired}
                            onChange={(v: string[]) => {
                              setActionRequired(v[0] || "No Action Required");
                              setIsDirty(true);
                            }}
                            options={[
                              {
                                id: "No Action Required",
                                label: t(
                                  "dispatch_action_none",
                                  "No Action Required"
                                ),
                              },
                              {
                                id: "Review Before Updating",
                                label: t(
                                  "dispatch_action_review",
                                  "Review Before Updating"
                                ),
                              },
                              {
                                id: "Update Recommended",
                                label: t(
                                  "dispatch_action_update_rec",
                                  "Update Recommended"
                                ),
                              },
                              {
                                id: "Immediate Action Required",
                                label: t(
                                  "dispatch_action_immediate",
                                  "Immediate Action Required"
                                ),
                              },
                            ]}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </UniversalGroup>

                <UnifiedPostBodyEditor
                  mode={editorMode}
                  onModeChange={(m) => switchEditorMode(m)}
                  content={content}
                  onContentChange={(nextMd) => {
                    setContent(nextMd);
                    setIsDirty(true);
                  }}
                  editor={editor}
                  placeholder={t(
                    "keepers_web_directives_body_ph",
                    "Write or add section boxes to preview how your post will look when published..."
                  )}
                />

                {editingRecordKind === "news" && (
                  <PostAttachmentsManager
                    content={content}
                    onContentChange={(nextMd) => {
                      setContent(nextMd);
                      setIsDirty(true);
                    }}
                    editor={editor}
                    onOpenAssetLinker={() => setIsAssetPanelOpen(true)}
                    imageUrl={imageUrl}
                    onImageUrlChange={(val) => {
                      setImageUrl(val);
                      setIsDirty(true);
                    }}
                    showCodeInput={showCodeInput}
                    onToggleCodeInput={setShowCodeInput}
                    codeSnippet={codeSnippet}
                    onCodeSnippetChange={(val) => {
                      setCodeSnippet(val);
                      setIsDirty(true);
                    }}
                    pollData={pollData}
                    onPollDataChange={(val) => {
                      setPollData(val);
                      setIsDirty(true);
                    }}
                  />
                )}
              </div>
            )}

            {/* =================================================================
                MODE B & C FOR CANONICAL DIRECTIVES (WHEN NOT IN VISUAL BUILDER)
               ================================================================= */}
            {activeCanonicalMeta && editorMode !== "visual" && (
              <UnifiedPostBodyEditor
                mode={editorMode}
                onModeChange={(m) => switchEditorMode(m)}
                content={content}
                onContentChange={(nextMd) => {
                  setContent(nextMd);
                  setIsDirty(true);
                }}
                editor={editor}
                hideModeTiles={true}
              />
            )}
          </div>
        </SidePanel>
      )}

      <LinkAssetSidePanel
        isOpen={isAssetPanelOpen}
        onClose={() => setIsAssetPanelOpen(false)}
        onAssetSelect={handleLinkAsset}
        widthClass="w-[92vw] md:w-[920px]"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      />

      {previewPost && (
        <MasonPostViewer
          post={{
            ...previewPost,
            content: previewPost.message || previewPost.content || "",
          }}
          onClose={() => setPreviewPost(null)}
          userId={session?.user?.id || ""}
          onOpenMasonProfile={undefined}
          onAssetClick={(type: string, id: string) =>
            setActiveAsset({ type, id })
          }
        />
      )}

      {activeAsset && (
        <AssetPreviewSidebar
          assetType={activeAsset.type}
          assetId={activeAsset.id}
          onClose={() => setActiveAsset(null)}
        />
      )}
    </>
  );
}
