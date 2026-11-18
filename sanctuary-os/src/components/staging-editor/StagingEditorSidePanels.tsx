import { createPortal } from "react-dom";
import {
  ActionButton,
  ActionPill,
  CustomDropdown,
  DashboardStatTile,
  SidePanelFilterBar,
  EmptyState,
  HoverTooltip,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  StatBox,
  cleanSearchName,
  getModIcon,
} from "../../shared";
import { SidePanelHeroCard, UniversalGroup } from "../layouts/ElevatedHubLayout";
import { VAULT_CHIP_CLASS } from "../../shared-components/constants";
import { resolveKnownAuthor } from "./stagingEditorHelpers";

export function StagingEditorSidePanels({
  onOpenDossier,
  t,
  activeGameSchema,
  stagingDraftMode,
  setStagingDraftMode,
  stagingDraftName,
  setStagingDraftName,
  targetDesktopBlueprint,
  setTargetDesktopBlueprint,
  stagingDraftCode,
  stagingDraftNotes,
  setStagingDraftNotes,
  stagingDraftAutoEquip,
  setStagingDraftAutoEquip,
  stagingDraftStrategy,
  setStagingDraftStrategy,
  stagingDraftItems,
  stagingDraftRemovedItems,
  loadSavedLocalDraft,
  toggleRemoveModInStagingDraft,
  setVolatileSignatureQueue,
  activeSignatureQueueIndex,
  setActiveSignatureQueueIndex,
  setActiveSubTab,
  isDraftPanelOpen,
  setIsDraftPanelOpen,
  isCloudPanelOpen,
  setIsCloudPanelOpen,
  setIsSettingsOpen,
  isSettingsOpen,
  searchFilter,
  setSearchFilter,
  cloudSearchFilter,
  setCloudSearchFilter,
  draftVisibleCount,
  setDraftVisibleCount,
  setCloudVisibleCount,
  cloudVisibleCount,
  isResolvingDeps,
  isTransmitting,
  isShredding,
  inspectingPack,
  setInspectingPack,
  inspectSearchQuery,
  setInspectSearchQuery,
  inspectFilterTab,
  setInspectFilterTab,
  setInspectBpEquipFilter,
  inspectBpEquipFilter,
  inspectVisibleCount,
  setInspectVisibleCount,
  activeDraftTitle,
  goToNexusMods,
  filteredItems,
  filteredRemovedItems,
  cloudQueuesList,
  activeCloud,
  filteredCloudItems,
  filteredCloudRemovedItems,
  depsCount,
  isSingleModStaged,
  isSingleModRemoved,
  sortItemsByPriorityTier,
  handleSaveSnapshotLocally,
  handleStageModWithAutoDeps,
  handleResolveDependencies,
  handleEncryptAndTransmit,
  handleLoadActiveCloudIntoEditor,
  handleStageDesktopBlueprintEdit,
  handleShredActiveCloud,
  inspectedAllItems,
  isModInInspectedBp,
  inspectedFilteredItems,
  totalPendingChangesCount,
  renderStagedModCard,
}: any) {
  return (
    <>
      {isDraftPanelOpen &&
        createPortal(
          <SidePanel
            isOpen={true}
            onClose={() => setIsDraftPanelOpen(false)}
            title={activeDraftTitle}
            subtitle={
              stagingDraftMode === "blueprint"
                ? t("staging_mode_blueprint", "Curated {Blueprint}")
                : t("staging_mode_mod_queue", "{Mod} Download Queue")
            }
            icon={
              stagingDraftMode === "blueprint"
                ? t("icon_map", "map")
                : t("icon_download", "download")
            }
            widthClass="w-full max-w-3xl"
            backdropZ="z-[100000]"
            panelZ="z-[100001]"
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_tune", "tune")}
                  tooltip={t("staging_tab_settings", "{Blueprint} Settings")}
                  onClick={() => setIsSettingsOpen(true)}
                />
                <PanelHeaderButton
                  icon={t("icon_bookmark", "bookmark")}
                  tooltip={t("staging_btn_save_snapshot", "Save Draft on Device")}
                  variant="accent"
                  onClick={handleSaveSnapshotLocally}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-4 pb-10">
              <SidePanelHeroCard
                title={activeDraftTitle}
                subtitle={
                  targetDesktopBlueprint
                    ? t(
                        "staging_desktop_bp_edit_notice",
                        "Proposed Edit for Desktop {Blueprint}: {0} (Requires Desktop Signature)"
                      ).replace("{0}", targetDesktopBlueprint)
                    : t(
                        "staging_local_memory_desc",
                        "Held in local device memory across reloads until you send it to the cloud or discard it."
                      )
                }
                label={
                  targetDesktopBlueprint
                    ? t("staging_tab_desktop_bps", "Desktop {Blueprints}")
                    : stagingDraftCode || "LOCAL"
                }
                icon={
                  stagingDraftMode === "blueprint"
                    ? t("icon_map", "map")
                    : t("icon_download", "download")
                }
                variant="accent"
              >
                <div className="flex flex-col gap-3 w-full">
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <StatBox
                      label={t("term_mods", "Items")}
                      value={stagingDraftItems.length}
                      icon={t("icon_inventory_2", "inventory_2")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    {stagingDraftRemovedItems.length > 0 ? (
                      <StatBox
                        label={t("staging_badge_removing", "Removing")}
                        value={stagingDraftRemovedItems.length}
                        icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                        iconColorClass="text-[var(--danger)]"
                      />
                    ) : (
                      <StatBox
                        label={t("section_deps_title", "Deps")}
                        value={depsCount}
                        icon={t("icon_account_tree", "account_tree")}
                        iconColorClass="text-cyan-400"
                      />
                    )}
                  </div>

                  {totalPendingChangesCount > 0 && (
                    <div className="flex flex-wrap items-center justify-end gap-2 ml-auto w-full pt-1">
                      <ActionButton
                        variant="accent"
                        disabled={isTransmitting}
                        onClick={() => handleEncryptAndTransmit()}
                        icon={
                          isTransmitting
                            ? t("icon_sync", "sync")
                            : t("icon_encrypted", "encrypted")
                        }
                        label={
                          isTransmitting
                            ? t("staging_btn_transmitting", "Encrypting & Sending...")
                            : t("staging_btn_transmit", "Encrypt & Send to Desktop")
                        }
                      />
                    </div>
                  )}
                </div>
              </SidePanelHeroCard>

              <ActionPill
                searchQuery={searchFilter}
                setSearchQuery={setSearchFilter}
                searchPlaceholder={t("search_ph", "Search {mods}...")}
                actions={[
                  ...(stagingDraftItems.length > 0 && stagingDraftMode === "blueprint"
                    ? [
                        {
                          id: "sort_tiers",
                          icon: (
                            <span className="material-symbols-outlined !text-[20px]">
                              {t("icon_swap_vert", "swap_vert")}
                            </span>
                          ),
                          label: t("staging_btn_sort_tiers", "Auto-Sort by Tier"),
                          onClick: sortItemsByPriorityTier,
                        },
                      ]
                    : []),
                  ...(stagingDraftItems.length > 0
                    ? [
                        {
                          id: "resolve_deps",
                          icon: (
                            <span className="material-symbols-outlined !text-[20px]">
                              {t("icon_account_tree", "account_tree")}
                            </span>
                          ),
                          label: isResolvingDeps
                            ? t("staging_btn_resolving_deps", "Resolving...")
                            : t("staging_btn_resolve_deps", "Resolve Dependencies"),
                          onClick: handleResolveDependencies,
                        },
                      ]
                    : []),
                  {
                    id: "add_mods",
                    icon: (
                      <span className="material-symbols-outlined !text-[20px]">
                        {t("icon_add_circle", "add_circle")}
                      </span>
                    ),
                    label: t("staging_catalog_drawer_title", "Build & Add {Mods}"),
                    onClick: () => {
                      setIsDraftPanelOpen(false);
                      goToNexusMods();
                    },
                  },
                ]}
              />

              {filteredRemovedItems.length > 0 && (
                <UniversalGroup
                  title={`${t("sig_queue_group_removing", "Removing from {Blueprint}")} (${
                    filteredRemovedItems.length
                  })`}
                  icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {filteredRemovedItems.map((remItem: any, rIdx: number) => (
                      <div
                        key={`draft_rem_${remItem.id || remItem.name}_${rIdx}`}
                        onClick={() => {
                          const knownAuthor = resolveKnownAuthor(remItem, "");
                          onOpenDossier?.({
                            ...remItem,
                            dbId: remItem.dbId || remItem.id,
                            status: remItem.status || "stable",
                            author: knownAuthor || remItem.author || "",
                            master_author: knownAuthor || remItem.author || "",
                            isNexusView: true,
                          });
                        }}
                        className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)] transition-all cursor-pointer flex flex-col justify-between gap-3 group"
                      >
                        <div className="flex items-start gap-3 min-w-0 w-full">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[20px]">
                              {t("icon_remove_circle_outline", "remove_circle_outline")}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                              {cleanSearchName(
                                remItem.displayName || remItem.name,
                                activeGameSchema
                              )}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                              {resolveKnownAuthor(
                                remItem,
                                t("unknown_mason", "Unknown {Mason}")
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                          <span className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)]`}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                              {t("icon_delete", "delete")}
                            </span>
                            <span>{t("staging_badge_removing", "Removing")}</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRemoveModInStagingDraft(remItem);
                            }}
                            className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors relative group/btn cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_undo", "undo")}
                            </span>
                            <HoverTooltip
                              title={t("cancel", "Cancel")}
                              className="group-hover/btn:flex z-[200]"
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </UniversalGroup>
              )}

              <UniversalGroup
                title={`${
                  targetDesktopBlueprint
                    ? t("staging_group_adding", "Adding to {Blueprint}")
                    : t("blueprint_included", "Included {Mods}")
                } (${filteredItems.length})`}
                icon={t("icon_inventory_2", "inventory_2")}
              >
                {stagingDraftItems.length === 0 ? (
                  <EmptyState
                    icon={t("icon_map", "map")}
                    title={t("staging_empty_title", "No Items in Staging Draft")}
                    subtitle={t(
                      "staging_empty_desc",
                      "Browse {Mods} or {Blueprints} in the Nexus and click Stage to build your encrypted desktop queue."
                    )}
                    action={
                      <ActionButton
                        variant="primary"
                        icon={t("icon_add_circle", "add_circle")}
                        label={t("staging_catalog_drawer_title", "Build & Add {Mods}")}
                        onClick={() => {
                          setIsDraftPanelOpen(false);
                          goToNexusMods();
                        }}
                      />
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {filteredItems
                      .slice(0, draftVisibleCount)
                      .map((item: any, idx: number) =>
                        renderStagedModCard(item, idx, false)
                      )}
                    {filteredItems.length > draftVisibleCount && (
                      <button
                        type="button"
                        onClick={() => setDraftVisibleCount((prev: any) => prev + 100)}
                        className="col-span-full w-full py-3 mt-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_expand_more", "expand_more")}
                        </span>
                        {t("load_more_artifacts", "Load More {Mods}")} (
                        {filteredItems.length - draftVisibleCount})
                      </button>
                    )}
                  </div>
                )}
              </UniversalGroup>
            </div>
          </SidePanel>,
          document.body
        )}

      {/* ACTIVE PC QUEUE PAYLOAD SIDEPANEL INSPECTOR */}
      {isCloudPanelOpen &&
        activeCloud &&
        createPortal(
          <SidePanel
            isOpen={true}
            onClose={() => setIsCloudPanelOpen(false)}
            title={activeCloud.payload.blueprintName}
            subtitle={t("staging_active_cloud_title", "Awaiting Desktop Signature")}
            icon={t("icon_phonelink_ring", "phonelink_ring")}
            widthClass="w-full max-w-3xl"
            backdropZ="z-[100000]"
            panelZ="z-[100001]"
          >
            <div className="flex flex-col gap-4 pb-10">
              {cloudQueuesList.length > 1 && (
                <div className="flex flex-col gap-1.5 p-3 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 ml-1">
                    {t("sig_queue_select_queue", "Queued {Blueprints}")} ({cloudQueuesList.length})
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                    {cloudQueuesList.map((qItem: any, qIdx: any) => {
                      const isSel =
                        (activeCloud.rowId && qItem.rowId === activeCloud.rowId) ||
                        qIdx === activeSignatureQueueIndex;
                      const addCount = qItem.resolvedItems?.length || 0;
                      const remCount = qItem.payload?.removedItems?.length || 0;
                      return (
                        <button
                          key={qItem.rowId || qIdx}
                          type="button"
                          onClick={() => {
                            setActiveSignatureQueueIndex(qIdx);
                            setVolatileSignatureQueue(qItem);
                            setCloudVisibleCount(80);
                          }}
                          className={`px-3 py-2 rounded-xl border text-left flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                            isSel
                              ? "glass-surface border-[var(--accent)] text-[var(--accent)]"
                              : "glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_map", "map")}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider truncate max-w-[160px]">
                            {qItem.payload?.blueprintName || t("term_blueprint", "{Blueprint}")}
                          </span>
                          <span className="text-[9px] font-mono opacity-80">
                            +{addCount}
                            {remCount > 0 ? ` / -${remCount}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <SidePanelHeroCard
                title={activeCloud.payload.blueprintName}
                subtitle={t("staging_active_cloud_title", "Awaiting Desktop Signature")}
                label={activeCloud.payload.blueprintCode || "CLOUD"}
                icon={t("icon_phonelink_ring", "phonelink_ring")}
                variant="accent"
              >
                <div className="flex flex-col gap-3 w-full">
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <StatBox
                      label={t("term_mods", "Items")}
                      value={activeCloud.resolvedItems?.length || 0}
                      icon={t("icon_inventory_2", "inventory_2")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    {(activeCloud.payload?.removedItems?.length || 0) > 0 ? (
                      <StatBox
                        label={t("staging_badge_removing", "Removing")}
                        value={activeCloud.payload.removedItems?.length || 0}
                        icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                        iconColorClass="text-[var(--danger)]"
                      />
                    ) : (
                      <StatBox
                        label={t("status", "Status")}
                        value={t("staging_badge_aes", "AES-256-GCM")}
                        icon={t("icon_encrypted", "encrypted")}
                        iconColorClass="text-[var(--success)]"
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 ml-auto w-full pt-1">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_edit", "edit")}
                      label={t("staging_btn_load_to_editor", "Edit")}
                      onClick={() => handleLoadActiveCloudIntoEditor(activeCloud)}
                    />
                    <ActionButton
                      variant="danger"
                      icon={t("icon_delete_forever", "delete_forever")}
                      label={t("staging_btn_shred_short", "Clear")}
                      disabled={isShredding}
                      onClick={() => handleShredActiveCloud(activeCloud)}
                    />
                  </div>
                </div>
              </SidePanelHeroCard>

              <ActionPill
                searchQuery={cloudSearchFilter}
                setSearchQuery={setCloudSearchFilter}
                searchPlaceholder={t("search_ph", "Search {mods}...")}
              />

              {filteredCloudRemovedItems.length > 0 && (
                <UniversalGroup
                  title={`${t("sig_queue_group_removing", "Removing from {Blueprint}")} (${
                    filteredCloudRemovedItems.length
                  })`}
                  icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {filteredCloudRemovedItems.map((remMod: any, rIdx: number) => (
                      <div
                        key={`cloud_rem_${remMod.id || remMod.name}_${rIdx}`}
                        className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0 w-full">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[20px]">
                              {t("icon_remove_circle_outline", "remove_circle_outline")}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                              {cleanSearchName(
                                remMod.displayName || remMod.name,
                                activeGameSchema
                              )}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                              {resolveKnownAuthor(
                                remMod,
                                t("unknown_mason", "Unknown {Mason}")
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                          <span className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)]`}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                              {t("icon_delete", "delete")}
                            </span>
                            <span>{t("staging_badge_removing", "Removing")}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </UniversalGroup>
              )}

              <UniversalGroup
                title={`${t("blueprint_included", "Included {Mods}")} (${filteredCloudItems.length})`}
                icon={t("icon_inventory_2", "inventory_2")}
              >
                {filteredCloudItems.length === 0 ? (
                  <EmptyState
                    icon={t("icon_search_off", "search_off")}
                    title={t("no_results", "No matching {mods} found.")}
                    minHeightClass="min-h-[160px]"
                    className="py-6"
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {filteredCloudItems
                      .slice(0, cloudVisibleCount)
                      .map((mod: any, idx: number) =>
                        renderStagedModCard(mod, idx, true)
                      )}
                    {filteredCloudItems.length > cloudVisibleCount && (
                      <button
                        type="button"
                        onClick={() => setCloudVisibleCount((prev: any) => prev + 100)}
                        className="col-span-full w-full py-3 mt-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_expand_more", "expand_more")}
                        </span>
                        {t("load_more_artifacts", "Load More {Mods}")} (
                        {filteredCloudItems.length - cloudVisibleCount})
                      </button>
                    )}
                  </div>
                )}
              </UniversalGroup>
            </div>
          </SidePanel>,
          document.body
        )}

      {/* BLUEPRINT SETTINGS SIDEPANEL DRAWER */}
      {isSettingsOpen &&
        createPortal(
          <SidePanel
            isOpen={true}
            onClose={() => setIsSettingsOpen(false)}
            title={t("staging_tab_settings", "{Blueprint} Settings")}
            subtitle={t(
              "staging_local_memory_desc",
              "Held in local device memory across reloads until you send it to the cloud or discard it."
            )}
            icon={t("icon_tune", "tune")}
            widthClass="w-full max-w-2xl"
            backdropZ="z-[100002]"
            panelZ="z-[100003]"
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_bookmark", "bookmark")}
                  tooltip={t("staging_btn_save_snapshot", "Save Draft on Device")}
                  variant="accent"
                  onClick={() => {
                    handleSaveSnapshotLocally();
                    setIsSettingsOpen(false);
                  }}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-5 pb-10">
              <SidePanelHeroCard
                title={activeDraftTitle}
                subtitle={
                  targetDesktopBlueprint
                    ? t(
                        "staging_desktop_bp_edit_notice",
                        "Proposed Edit for Desktop {Blueprint}: {0} (Requires Desktop Signature)"
                      ).replace("{0}", targetDesktopBlueprint)
                    : t(
                        "staging_local_memory_desc",
                        "Held in local device memory across reloads until you send it to the cloud or discard it."
                      )
                }
                label={
                  targetDesktopBlueprint
                    ? t("staging_tab_desktop_bps", "Desktop {Blueprints}")
                    : stagingDraftCode || "LOCAL"
                }
                icon={
                  stagingDraftMode === "blueprint"
                    ? t("icon_map", "map")
                    : t("icon_download", "download")
                }
                variant="accent"
              >
                <div className="grid grid-cols-2 gap-3 w-full">
                  <StatBox
                    label={t("term_mods", "Items")}
                    value={stagingDraftItems.length}
                    icon={t("icon_inventory_2", "inventory_2")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("section_deps_title", "Deps")}
                    value={depsCount}
                    icon={t("icon_account_tree", "account_tree")}
                    iconColorClass="text-cyan-400"
                  />
                </div>
              </SidePanelHeroCard>

              {/* Mode Selector using DashboardStatTile variant="filter" */}
              <SidePanelFilterBar className="grid-cols-2 gap-3">
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_map", "map")}
                  label={t("staging_mode_blueprint", "Curated {Blueprint}")}
                  isActive={stagingDraftMode === "blueprint"}
                  onClick={() => setStagingDraftMode("blueprint")}
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_download", "download")}
                  label={t("staging_mode_mod_queue", "{Mod} Download Queue")}
                  isActive={stagingDraftMode === "mod_queue"}
                  onClick={() => setStagingDraftMode("mod_queue")}
                />
              </SidePanelFilterBar>

              <UniversalGroup
                title={t("staging_tab_settings", "{Blueprint} Settings")}
                icon={t("icon_edit", "edit")}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-65 uppercase tracking-widest ml-1">
                      {t("staging_payload_name_label", "Payload / {Blueprint} Name")}
                    </label>
                    <input
                      type="text"
                      value={stagingDraftName}
                      onChange={(e) => setStagingDraftName(e.target.value)}
                      placeholder={t(
                        "staging_payload_name_ph",
                        "e.g. Curated Nexus {Blueprint}..."
                      )}
                      className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-65 uppercase tracking-widest ml-1">
                      {t("staging_notes_label", "Dispatch Note (Optional)")}
                    </label>
                    <input
                      type="text"
                      value={stagingDraftNotes}
                      onChange={(e) => setStagingDraftNotes(e.target.value)}
                      placeholder={t(
                        "staging_notes_ph",
                        "Add a reminder or note for when you review on desktop..."
                      )}
                      className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all"
                    />
                  </div>

                  {stagingDraftMode === "blueprint" && (
                    <>
                      <div
                        onClick={() => setStagingDraftAutoEquip(!stagingDraftAutoEquip)}
                        className={`flex items-center justify-between gap-3.5 p-3.5 rounded-2xl glass-surface border transition-all cursor-pointer ${
                          stagingDraftAutoEquip
                            ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                              stagingDraftAutoEquip
                                ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                                : "glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-60"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {t("icon_rocket_launch", "rocket_launch")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] leading-snug">
                              {t(
                                "staging_auto_equip_title",
                                "Auto-Deploy Owned {Mods} on Approval"
                              )}
                            </span>
                            <span className="text-[9px] font-bold text-[var(--subtext)] opacity-65 leading-snug">
                              {t(
                                "staging_auto_equip_desc",
                                "Immediately equip and symlink already-owned {mods} when you sign on desktop."
                              )}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`sa-glass-toggle shrink-0 ${
                            stagingDraftAutoEquip ? "is-on" : ""
                          }`}
                        >
                          <div className="sa-glass-toggle-thumb" />
                        </div>
                      </div>

                      <div className="flex flex-col justify-center gap-1.5 p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-30">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 ml-1">
                          {t("staging_strategy_label", "Load Order Strategy")}
                        </span>
                        <div className="h-10 w-full relative z-40">
                          <CustomDropdown
                            disableTint={true}
                            flat={true}
                            variant="pill"
                            value={stagingDraftStrategy}
                            onChange={(val: string[]) => {
                              const next = val[0] as
                                | "alphabetical"
                                | "numeric_prefix"
                                | "loadorder_txt";
                              if (next) setStagingDraftStrategy(next);
                            }}
                            options={[
                              {
                                id: "alphabetical",
                                label: t("staging_strategy_alpha", "Alphabetical (Default)"),
                              },
                              {
                                id: "numeric_prefix",
                                label: t("lo_strategy_prefix", "Numeric Tier Prefix"),
                              },
                              {
                                id: "loadorder_txt",
                                label: t("staging_strategy_manifest", "Load Order Manifest"),
                              },
                            ]}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </UniversalGroup>
            </div>
          </SidePanel>,
          document.body
        )}

      {/* SAVED DRAFT / DESKTOP BLUEPRINT INSPECTOR SIDEPANEL */}
      {inspectingPack &&
        createPortal(
          <SidePanel
            isOpen={true}
            onClose={() => setInspectingPack(null)}
            title={
              inspectingPack.data?.displayName ||
              inspectingPack.data?.name ||
              t("staging_inspector_title", "{Blueprint} Contents")
            }
            subtitle={t(
              "staging_inspector_subtitle",
              "Review and filter included {mods} before loading into the builder"
            )}
            icon={
              inspectingPack.type === "desktop_bp"
                ? t("icon_devices", "devices")
                : t("icon_bookmark", "bookmark")
            }
            widthClass="w-full max-w-3xl"
            backdropZ="z-[100000]"
            panelZ="z-[100001]"
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={
                    inspectingPack.type === "desktop_bp"
                      ? totalPendingChangesCount > 0
                        ? t("icon_encrypted", "encrypted")
                        : t("icon_add_circle", "add_circle")
                      : t("icon_play_circle", "play_circle")
                  }
                  tooltip={
                    inspectingPack.type === "desktop_bp"
                      ? totalPendingChangesCount > 0
                        ? t("staging_btn_transmit", "Encrypt & Send to Desktop")
                        : t("staging_catalog_drawer_title", "Build & Add {Mods}")
                      : t("staging_btn_use_short", "Use {Blueprint}")
                  }
                  variant="accent"
                  onClick={() => {
                    if (inspectingPack.type === "desktop_bp") {
                      handleStageDesktopBlueprintEdit(inspectingPack.data);
                    } else {
                      setTargetDesktopBlueprint(null);
                      loadSavedLocalDraft(inspectingPack.data.id);
                      setInspectingPack(null);
                      setActiveSubTab("OVERVIEW");
                      setIsDraftPanelOpen(true);
                    }
                  }}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-3.5 pb-10">
              <SidePanelHeroCard
                title={
                  inspectingPack.data?.displayName ||
                  inspectingPack.data?.name ||
                  t("staging_inspector_title", "{Blueprint} Contents")
                }
                subtitle={t(
                  "staging_inspector_subtitle",
                  "Review and filter included {mods} before loading into the builder"
                )}
                label={
                  inspectingPack.type === "desktop_bp"
                    ? inspectingPack.data?.isActive
                      ? t("staging_desktop_bp_active_badge", "Active on Desktop")
                      : t("staging_badge_aes", "AES-256-GCM")
                    : inspectingPack.data?.code || "LOCAL"
                }
                icon={
                  inspectingPack.type === "desktop_bp"
                    ? t("icon_devices", "devices")
                    : t("icon_bookmark", "bookmark")
                }
                variant="accent"
              >
                <div className="flex flex-wrap items-center justify-end gap-2 ml-auto w-full pt-1">
                  <ActionButton
                    variant="accent"
                    disabled={isTransmitting}
                    onClick={() => {
                      if (inspectingPack.type === "desktop_bp") {
                        handleStageDesktopBlueprintEdit(inspectingPack.data);
                      } else {
                        setTargetDesktopBlueprint(null);
                        loadSavedLocalDraft(inspectingPack.data.id);
                        setInspectingPack(null);
                        setActiveSubTab("OVERVIEW");
                        setIsDraftPanelOpen(true);
                      }
                    }}
                    icon={
                      inspectingPack.type === "desktop_bp"
                        ? isTransmitting
                          ? t("icon_sync", "sync")
                          : totalPendingChangesCount > 0
                            ? t("icon_encrypted", "encrypted")
                            : t("icon_add_circle", "add_circle")
                        : t("icon_play_circle", "play_circle")
                    }
                    label={
                      inspectingPack.type === "desktop_bp"
                        ? isTransmitting
                          ? t("staging_btn_transmitting", "Encrypting & Sending...")
                          : totalPendingChangesCount > 0
                            ? `${t("staging_btn_transmit", "Encrypt & Send to Desktop")} (${totalPendingChangesCount})`
                            : t("staging_catalog_drawer_title", "Build & Add {Mods}")
                        : t("staging_btn_use_short", "Use {Blueprint}")
                    }
                  />
                </div>
              </SidePanelHeroCard>

              <div className="flex flex-col gap-3 w-full">
                <SidePanelFilterBar
                  className={`grid-cols-2 ${
                    inspectingPack.type === "desktop_bp"
                      ? "sm:grid-cols-4"
                      : "sm:grid-cols-3"
                  } gap-3`}
                >
                  <DashboardStatTile
                    variant="filter"
                    className="!w-full"
                    icon={t("icon_list", "list")}
                    label={t("filter_all", "All")}
                    number={inspectedAllItems.length.toString()}
                    isActive={inspectFilterTab === "ALL"}
                    onClick={() => setInspectFilterTab("ALL")}
                  />
                  <DashboardStatTile
                    variant="filter"
                    className="!w-full"
                    icon={t("icon_check_circle", "check_circle")}
                    label={t("staging_btn_added", "Added")}
                    number={inspectedAllItems
                      .filter((m: any) => isSingleModStaged(m))
                      .length.toString()}
                    isActive={inspectFilterTab === "STAGED"}
                    onClick={() => setInspectFilterTab("STAGED")}
                  />
                  {inspectingPack.type === "desktop_bp" && (
                    <DashboardStatTile
                      variant="filter"
                      className="!w-full"
                      icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                      label={t("staging_filter_removing", "Removing")}
                      number={inspectedAllItems
                        .filter((m: any) => isSingleModRemoved(m))
                        .length.toString()}
                      isActive={inspectFilterTab === "REMOVING"}
                      onClick={() => setInspectFilterTab("REMOVING")}
                    />
                  )}
                  <DashboardStatTile
                    variant="filter"
                    className={`!w-full ${
                      inspectingPack.type === "desktop_bp"
                        ? ""
                        : "col-span-2 sm:col-span-1"
                    }`}
                    icon={t("icon_workspace_premium", "workspace_premium")}
                    label={t("badge_premium", "Premium")}
                    number={inspectedAllItems
                      .filter((m: any) => m.is_paid || m.is_early_access)
                      .length.toString()}
                    isActive={inspectFilterTab === "PREMIUM"}
                    onClick={() => setInspectFilterTab("PREMIUM")}
                  />
                </SidePanelFilterBar>
                <ActionPill
                  searchQuery={inspectSearchQuery}
                  setSearchQuery={setInspectSearchQuery}
                  searchPlaceholder={t("search_ph", "Search {mods}...")}
                  primaryPopover={
                    inspectingPack.type === "desktop_bp"
                      ? {
                          icon: t("icon_tune", "tune"),
                          label: t("filters", "Filters"),
                          content: (
                            <div className="flex flex-col gap-2 w-60">
                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 px-2">
                                {t("filter_status", "Filter Status")}
                              </span>
                              <div className="flex flex-col gap-1">
                                {[
                                  {
                                    id: "ALL" as const,
                                    label: t("filter_all_vault_scope", "All {Vault}"),
                                  },
                                  {
                                    id: "IN_BP" as const,
                                    label: t("filter_in_blueprint", "In {Blueprint}"),
                                  },
                                  {
                                    id: "NOT_IN_BP" as const,
                                    label: t("filter_not_in_blueprint", "Not in {Blueprint}"),
                                  },
                                ].map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      setInspectFilterTab("ALL");
                                      setInspectBpEquipFilter(opt.id);
                                    }}
                                    className={`px-3 py-2 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                                      inspectBpEquipFilter === opt.id
                                        ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                        : "text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent"
                                    }`}
                                  >
                                    <span>{opt.label}</span>
                                    {inspectBpEquipFilter === opt.id && (
                                      <span className="material-symbols-outlined !text-[14px]">
                                        {t("icon_check", "check")}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ),
                        }
                      : undefined
                  }
                />
              </div>

              <UniversalGroup
                title={`${
                  inspectingPack.type === "desktop_bp" &&
                  inspectFilterTab === "ALL" &&
                  inspectBpEquipFilter === "NOT_IN_BP"
                    ? t("filter_not_in_blueprint", "Not in {Blueprint}")
                    : inspectingPack.type === "desktop_bp" &&
                        inspectFilterTab === "ALL" &&
                        inspectBpEquipFilter === "ALL"
                      ? t("filter_all_vault_scope", "All {Vault}")
                      : t("blueprint_included", "Included {Mods}")
                } (${inspectedFilteredItems.length})`}
                icon={t("icon_inventory_2", "inventory_2")}
              >
                {inspectedFilteredItems.length === 0 ? (
                  <EmptyState
                    icon={t("icon_search_off", "search_off")}
                    title={t("no_results", "No matching {mods} found.")}
                    minHeightClass="min-h-[160px]"
                    className="py-6"
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                    {inspectedFilteredItems
                      .slice(0, inspectVisibleCount)
                      .map((mod: any, idx: number) => {
                        const isDesktopBpView = inspectingPack.type === "desktop_bp";
                        const inBp = !isDesktopBpView || isModInInspectedBp(mod);
                        const staged = isSingleModStaged(mod);
                        const markedForRemoval = isDesktopBpView && inBp && isSingleModRemoved(mod);
                        return (
                          <div
                            key={`${mod.id || mod.hash || mod.name}_${idx}`}
                            onClick={() => {
                              const knownAuthor = resolveKnownAuthor(
                                mod,
                                resolveKnownAuthor(inspectingPack?.data, "")
                              );
                              onOpenDossier?.({
                                ...mod,
                                dbId: mod.dbId || mod.id,
                                status: mod.status || "stable",
                                author: knownAuthor || mod.author || mod.master_author || "",
                                master_author: knownAuthor || mod.master_author || mod.author || "",
                                category_override: mod.category_override || mod.category || mod.type || "",
                                isNexusView: true,
                              });
                            }}
                            className={`glass-surface p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 cursor-pointer group ${
                              markedForRemoval
                                ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
                                : staged
                                  ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0 w-full">
                              <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0">
                                <span className="material-symbols-outlined !text-[20px]">
                                  {getModIcon(mod, activeGameSchema, t)}
                                </span>
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
                                  {cleanSearchName(
                                    mod.displayName || mod.name,
                                    activeGameSchema
                                  )}
                                </span>
                                <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                                  {resolveKnownAuthor(
                                    mod,
                                    resolveKnownAuthor(
                                      inspectingPack?.data,
                                      t("unknown_mason", "Unknown {Mason}")
                                    )
                                  )}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                    {t("icon_tag", "tag")}
                                  </span>
                                  <span>#{String(idx + 1).padStart(3, "0")}</span>
                                </span>
                                {isDesktopBpView && inspectBpEquipFilter === "ALL" && inBp && (
                                  <span
                                    className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]`}
                                  >
                                    <span className="material-symbols-outlined !text-[12px]">
                                      {t("icon_check_circle", "check_circle")}
                                    </span>
                                    <span>
                                      {t("filter_in_blueprint", "In {Blueprint}")}
                                    </span>
                                  </span>
                                )}
                                {mod.is_early_access && (
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                      {t("icon_schedule", "schedule")}
                                    </span>
                                    <span>{t("badge_early_access", "Early Access")}</span>
                                  </span>
                                )}
                                {mod.is_paid && (
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                      {t("icon_workspace_premium", "workspace_premium")}
                                    </span>
                                    <span>{t("badge_paid", "Paid")}</span>
                                  </span>
                                )}
                              </div>

                              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                {isDesktopBpView && inBp && !staged ? (
                                  <ActionButton
                                    onClick={() => {
                                      setStagingDraftMode("blueprint");
                                      setStagingDraftName(inspectingPack.data.name);
                                      setTargetDesktopBlueprint(inspectingPack.data.name);
                                      toggleRemoveModInStagingDraft(mod);
                                    }}
                                    icon={
                                      markedForRemoval
                                        ? t("icon_undo", "undo")
                                        : t("icon_remove_circle_outline", "remove_circle_outline")
                                    }
                                    label={
                                      markedForRemoval
                                        ? t("staging_badge_removing", "Queued to {Remove}")
                                        : t("btn_remove", "{Remove}")
                                    }
                                    variant={markedForRemoval ? "danger" : "glass"}
                                    className="!px-2.5 !py-1 !text-[9px] whitespace-nowrap"
                                  />
                                ) : (
                                  <ActionButton
                                    onClick={() => {
                                      if (isDesktopBpView && inspectingPack?.data?.name) {
                                        setStagingDraftMode("blueprint");
                                        setStagingDraftName(inspectingPack.data.name);
                                        setTargetDesktopBlueprint(inspectingPack.data.name);
                                      }
                                      handleStageModWithAutoDeps({ ...mod, _stageSingle: true });
                                    }}
                                    icon={
                                      staged
                                        ? t("icon_check", "check")
                                        : t("icon_add", "add")
                                    }
                                    label={
                                      staged
                                        ? t("staging_btn_added", "Added")
                                        : t("staging_btn_add_mod", "Add")
                                    }
                                    variant="glass"
                                    className="!px-2.5 !py-1 !text-[9px] whitespace-nowrap"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                    {inspectedFilteredItems.length > inspectVisibleCount && (
                      <button
                        type="button"
                        onClick={() =>
                          setInspectVisibleCount((prev: any) => prev + 100)
                        }
                        className="col-span-full w-full py-3 mt-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_expand_more", "expand_more")}
                        </span>
                        {t("load_more_artifacts", "Load More {Mods}")} (
                        {inspectedFilteredItems.length - inspectVisibleCount})
                      </button>
                    )}
                  </div>
                )}
              </UniversalGroup>
            </div>
          </SidePanel>,
          document.body
        )}
    </>
  );
}
