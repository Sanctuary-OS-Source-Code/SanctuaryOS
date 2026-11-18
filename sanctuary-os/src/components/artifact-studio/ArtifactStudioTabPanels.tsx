import { supabase } from "../../supabase";
import { useStore } from "../../store";
import { VAULT_CHIP_CLASS } from "../../shared";
import { getTicketSupporterFlags } from "../universal/SupportTicketCard";
import { isUuid } from "./artifactStudioUtils";
import { ArtifactVersionHistorySection } from "./EditableVersionHistoryCard";
import { ArtifactFilesTab } from "./ArtifactFilesTab";
import { ArtifactRulesTab } from "./ArtifactRulesTab";
import { ArtifactIdeDrawer } from "./ArtifactIdeDrawer";
import { LabReportDiagnosticCards } from "../KnownExceptionRules";

export function ArtifactStudioTabPanels({
  mode,
  mod,
  onUpdateMod,
  isVerifiedMason,
  onSwitchMod,
  onRefreshParentList,
  onExportRelease,
  onSyncToNetwork,
  onSaveCloudChanges,
  isCommitting,
  children,
  t,
  isCloudMod,
  normalizedTab,
  dlcRegistry,
  modTickets,
  labReports,
  parentRel,
  childRels,
  dependencies,
  conflicts,
  localCollectionNames,
  setLocalCollectionNames,
  versions,
  newConfigNameInput,
  setNewConfigNameInput,
  newConfigExt,
  setNewConfigExt,
  showNewConfigForm,
  setShowNewConfigForm,
  showParentLinkPicker,
  setShowParentLinkPicker,
  familyRoleFilter,
  setFamilyRoleFilter,
  familySearchFilter,
  setFamilySearchFilter,
  newFamilyRole,
  setNewFamilyRole,
  cwSelectedFile,
  hasUnsavedIdeChanges,
  wbFileState,
  wbEditorState,
  wbLayoutState,
  wbShowTimeline,
  setWbShowTimeline,
  conflictSeverity,
  setConflictSeverity,
  newCollectionName,
  setNewCollectionName,
  showAddVersionModal,
  setShowAddVersionModal,
  selectedSandboxVersionHash,
  setSelectedSandboxVersionHash,
  manualVersionHash,
  setManualVersionHash,
  newVersionLabel,
  setNewVersionLabel,
  isSavingStructure,
  myModCandidates,
  allConflictAndDepCandidates,
  persistLocalSandboxConfig,
  getAuthToken,
  handleLinkChildModule,
  handleChangeChildRole,
  handleUnlinkChildModule,
  handleSetParentMod,
  handleChangeParentRole,
  handleUnlinkParentMod,
  modStem,
  linkedConfigFiles,
  handleOpenConfigInIde,
  handleCreateAndOpenConfig,
  handleDetachConfig,
  handleDeleteConfigFile,
  activeDlcIds,
  handleToggleDlc,
  handleSetDlcList,
  handleAddDependencyDirect,
  handleRemoveDependency,
  structureNodes,
  handleStructureChange,
  handleSaveCloudStructure,
  handleAddConflictCard,
  handleRemoveConflict,
  handleToggleCloudCollection,
  handleAddCollectionQuick,
  handleAddVersionUnified,
  handleSaveVersionLabel,
  handleSaveVersionGameVersions,
  handleDeleteVersionEntry,
  unlinkedSandboxVersionOptions,
  isModFlagged,
  handleResolveSingleTicket,
  handleResolveAndResubmitMod,
  unassignedCloudCollections,
  assignedCloudCollections,
}: any) {
  return (
    <>
      {normalizedTab === "overview" && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col gap-6 pb-8">
          {isModFlagged && (
            <div className="p-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] flex flex-col gap-4">
              <div className="flex items-start gap-3 pb-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] flex items-center justify-center shrink-0 text-[var(--danger)]">
                  <span className="material-symbols-outlined !text-[20px]">
                    {t("icon_report_problem", "report_problem")}
                  </span>
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("flag_res_dossier_title", "Flag & Resolution Dossier")}
                    </h4>
                    <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_flag", "flag")}
                      </span>
                      {t("studio_flagged_status_reason", "Status:")}{" "}
                      {String(mod?.status || "flagged").toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                    {mod?.status === "corrupted" || mod?.status === "broken"
                      ? t(
                          "flag_res_mod_why_corrupted",
                          "This {Mod} was flagged as Corrupted due to critical game errors, broken script tuning, or patch incompatibility."
                        )
                      : mod?.status === "unstable"
                        ? t(
                            "flag_res_mod_why_unstable",
                            "This {Mod} was marked Unstable after compatibility warnings or minor gameplay glitches were reported."
                          )
                        : mod?.status === "under_review" || mod?.status === "under review"
                          ? t(
                              "flag_res_mod_why_review",
                              "This {Mod} is currently Under Review by Sanctuary moderation or automated compatibility checks."
                            )
                          : t(
                              "flag_res_mod_why_tickets",
                              "This {Mod} has open {Citizen} bug or compatibility reports awaiting {Mason} review."
                            )}
                  </p>
                </div>
              </div>

              {/* DIAGNOSTIC & REPORTS */}
              <div className="flex flex-col gap-2">
                {(mod?.status === "corrupted" ||
                  mod?.status === "broken" ||
                  mod?.status === "unstable" ||
                  mod?.status === "under_review" ||
                  mod?.status === "under review" ||
                  mod?.status === "rejected") && (
                  <div className="rounded-xl p-3 glass-surface border border-[color-mix(in_srgb,var(--danger)_24%,transparent)] flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_bug_report", "bug_report")}
                      </span>
                      {t("flag_res_mod_status_diag_label", "System Status Diagnostic")}
                    </span>
                    {mod?.status_reason &&
                      !/^\[ARCHITECT\b/i.test(String(mod.status_reason).trim()) && (
                        <p className="text-xs font-bold text-[var(--text)] leading-relaxed">
                          {mod.status_reason}
                        </p>
                      )}
                    <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                      {mod?.status === "corrupted" || mod?.status === "broken"
                        ? t(
                            "flag_res_mod_corrupted_detail",
                            "The current release hash is flagged as Corrupted. {Citizens} with this {Mod} installed receive a critical alert in their {Vault} until a patched version hash is published and status is restored to Stable."
                          )
                        : mod?.status === "unstable"
                          ? t(
                              "flag_res_mod_unstable_detail",
                              "The current release is marked Unstable. {Citizens} see a caution badge in their {Vault}. Verify compatibility with the latest game patch or attach a hotfix version below."
                            )
                          : t(
                              "flag_res_mod_review_detail",
                              "This {Mod} is awaiting verification of its metadata, safety tier, or release hash. Review the fields below and resubmit to restore Stable status."
                            )}
                    </p>
                  </div>
                )}

                {labReports.length > 0 && (
                  <LabReportDiagnosticCards
                    reports={labReports}
                    activeGameSchema={useStore.getState().activeGameSchema}
                  />
                )}

                {modTickets.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {modTickets.map((tk: any, idx: number) => {
                      const titleText =
                        tk.title ||
                        tk.subject ||
                        t("flag_res_ticket_default_title", "{Citizen} Issue Report");
                      const descText =
                        tk.description ||
                        tk.content ||
                        tk.steps ||
                        tk.reason ||
                        t("flag_res_legacy_reason", "No additional details were attached to this report.");
                      const reporterName =
                        tk.reporter_name ||
                        tk.author_name ||
                        tk.user_email ||
                        t("term_citizen", "{Citizen}");
                      const dateStr = tk.created_at
                        ? new Date(tk.created_at).toLocaleDateString()
                        : "";
                      const flags = getTicketSupporterFlags(tk);
                      return (
                        <div
                          key={tk.id || idx}
                          className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={VAULT_CHIP_CLASS}>
                                <span
                                  className={`material-symbols-outlined !text-[12px] ${
                                    flags.isPriority ? "text-[var(--warning)]" : "text-[var(--danger)]"
                                  }`}
                                >
                                  {flags.isPriority
                                    ? t("icon_bolt", "bolt")
                                    : t("icon_flag", "flag")}
                                </span>
                                <span>{tk.status || t("flagged", "Flagged")}</span>
                              </span>
                              {flags.isMasonSupporter && (
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                    {t("icon_bolt", "bolt")}
                                  </span>
                                  <span>{t("ticket_badge_mason_priority", "Priority • {Mason} Supporter")}</span>
                                </span>
                              )}
                              {flags.isSpokeSupporter && (
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                    {t("icon_favorite", "favorite")}
                                  </span>
                                  <span>{t("ticket_badge_spoke_supporter", "Spoke Supporter")}</span>
                                </span>
                              )}
                              <span className="text-xs font-black text-[var(--text)]">
                                {titleText}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-[var(--subtext)]">
                                {`${t("by_prefix", "By")} ${reporterName}${
                                  dateStr ? ` • ${dateStr}` : ""
                                }`}
                              </span>
                              {tk.id && (
                                <button
                                  type="button"
                                  onClick={() => handleResolveSingleTicket(tk.id)}
                                  className="px-2.5 py-1 rounded-lg glass-surface hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--success)] transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[12px]">
                                    {t("icon_check_circle", "check_circle")}
                                  </span>
                                  {t("flag_res_ticket_resolve_btn", "Resolve Ticket")}
                                </button>
                              )}
                            </div>
                          </div>
                          {descText && descText !== titleText && (
                            <p className="text-xs text-[var(--subtext)] leading-relaxed whitespace-pre-wrap">
                              {descText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RESOLUTION STEPS */}
              <div className="pt-3.5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">
                    {t("icon_task_alt", "task_alt")}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                    {t("flag_res_sec_how", "3. How to Resolve & Resubmit")}
                  </span>
                </div>
                <ol className="flex flex-col gap-2 text-xs font-semibold text-[var(--subtext)] leading-relaxed list-none">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[10px] font-black text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      {t(
                        "flag_res_mod_step_1",
                        "Review the diagnostic or {Citizen} bug report(s) above and test your updated {Mod} files in your {Lab}."
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[10px] font-black text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      {t(
                        "flag_res_mod_step_2",
                        "Bump the {Mason} Version, verify compatible Game Versions, and link your patched file hash under Version History below."
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[10px] font-black text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      {t(
                        "flag_res_mod_step_3",
                        "Click Resolve & Resubmit {Mod} below to close open tickets, set status back to Stable, and publish your fix."
                      )}
                    </span>
                  </li>
                </ol>
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={handleResolveAndResubmitMod}
                    disabled={isCommitting}
                    className="w-full justify-center px-4 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-xs font-black uppercase tracking-wider text-[var(--text)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                      {t("icon_published_with_changes", "published_with_changes")}
                    </span>
                    {t("flag_res_mod_btn_resolve", "Resolve & Resubmit {Mod}")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {children}

          <ArtifactVersionHistorySection
            versions={versions}
            showAddVersionModal={showAddVersionModal}
            setShowAddVersionModal={setShowAddVersionModal}
            unlinkedSandboxVersionOptions={unlinkedSandboxVersionOptions}
            selectedSandboxVersionHash={selectedSandboxVersionHash}
            setSelectedSandboxVersionHash={setSelectedSandboxVersionHash}
            manualVersionHash={manualVersionHash}
            setManualVersionHash={setManualVersionHash}
            newVersionLabel={newVersionLabel}
            setNewVersionLabel={setNewVersionLabel}
            onAddVersionUnified={handleAddVersionUnified}
            onSaveVersionLabel={handleSaveVersionLabel}
            onSaveVersionGameVersions={handleSaveVersionGameVersions}
            onDeleteVersionEntry={handleDeleteVersionEntry}
          />
        </div>
      )}

      {/* TILE 2: FILES & FOLDERS */}
      {normalizedTab === "files" && (
        <ArtifactFilesTab
          mode={mode}
          mod={mod}
          modStem={modStem}
          isCloudMod={isCloudMod}
          childRels={childRels}
          parentRel={parentRel}
          myModCandidates={myModCandidates}
          familyRoleFilter={familyRoleFilter}
          setFamilyRoleFilter={setFamilyRoleFilter}
          familySearchFilter={familySearchFilter}
          setFamilySearchFilter={setFamilySearchFilter}
          showParentLinkPicker={showParentLinkPicker}
          setShowParentLinkPicker={setShowParentLinkPicker}
          newFamilyRole={newFamilyRole}
          setNewFamilyRole={setNewFamilyRole}
          onSwitchMod={onSwitchMod}
          onLinkChildModule={handleLinkChildModule}
          onChangeChildRole={handleChangeChildRole}
          onUnlinkChildModule={handleUnlinkChildModule}
          onSetParentMod={handleSetParentMod}
          onChangeParentRole={handleChangeParentRole}
          onUnlinkParentMod={handleUnlinkParentMod}
          structureNodes={structureNodes}
          onStructureChange={handleStructureChange}
          isSavingStructure={isSavingStructure}
          onSaveCloudStructure={handleSaveCloudStructure}
          showNewConfigForm={showNewConfigForm}
          setShowNewConfigForm={setShowNewConfigForm}
          newConfigNameInput={newConfigNameInput}
          setNewConfigNameInput={setNewConfigNameInput}
          newConfigExt={newConfigExt}
          setNewConfigExt={setNewConfigExt}
          onCreateAndOpenConfig={handleCreateAndOpenConfig}
          linkedConfigFiles={linkedConfigFiles}
          onOpenConfigInIde={handleOpenConfigInIde}
          onDetachConfig={handleDetachConfig}
          onDeleteConfigFile={handleDeleteConfigFile}
        />
      )}

      {/* TILE 3: RULES & UPLOAD */}
      {normalizedTab === "rules" && (
        <ArtifactRulesTab
          mode={mode}
          mod={mod}
          isCloudMod={isCloudMod}
          isVerifiedMason={isVerifiedMason}
          isCommitting={isCommitting}
          dlcRegistry={dlcRegistry}
          activeDlcIds={activeDlcIds}
          onToggleDlc={handleToggleDlc}
          onSetDlcList={handleSetDlcList}
          onClearAllDlc={() => {
            onUpdateMod({ ...mod, requiredDLC: [] });
            if (isCloudMod) {
              supabase.rpc("secure_upsert_cloud_file", {
                p_token: getAuthToken(),
                p_target: "mods",
                p_payload: { id: mod.id, name: mod.name, requiredDLC: [] },
              });
            } else {
              persistLocalSandboxConfig({ requiredDLC: [] });
            }
          }}
          dependencies={dependencies}
          allConflictAndDepCandidates={allConflictAndDepCandidates}
          onAddDependencyDirect={handleAddDependencyDirect}
          onRemoveDependency={handleRemoveDependency}
          conflicts={conflicts}
          conflictSeverity={conflictSeverity}
          setConflictSeverity={setConflictSeverity}
          onAddConflictCard={handleAddConflictCard}
          onRemoveConflict={handleRemoveConflict}
          unassignedCloudCollections={unassignedCloudCollections}
          assignedCloudCollections={assignedCloudCollections}
          localCollectionNames={localCollectionNames}
          newCollectionName={newCollectionName}
          setNewCollectionName={setNewCollectionName}
          onToggleCloudCollection={handleToggleCloudCollection}
          onAddCollectionQuick={handleAddCollectionQuick}
          onRemoveLocalCollection={(name) => {
            const next = localCollectionNames.filter((n: any) => n !== name);
            setLocalCollectionNames(next);
            persistLocalSandboxConfig({ collections: next });
          }}
          onChangeHighlanderSlot={async ({ groupId, slug, name }) => {
            const patch = {
              highlander_group_id: groupId || null,
              highlanderGroupId: groupId || null,
              highlander_slot_slug: slug || null,
              highlanderSlotKey: slug || null,
              highlander_slot_name: name || null,
              highlanderSlotName: name || null,
            };
            onUpdateMod({ ...mod, ...patch });
            if (isCloudMod && isUuid(mod.id)) {
              const { error } = await supabase
                .from("mods")
                .update({
                  highlander_group_id: groupId || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", mod.id);
              if (error) {
                useStore.getState().pushStatus(error.message, "error");
              } else {
                useStore
                  .getState()
                  .pushStatus(t("alert_saved", "Saved"), "success");
                if (onRefreshParentList) onRefreshParentList();
              }
            } else {
              persistLocalSandboxConfig(patch);
            }
          }}
          onChangeStaticManifestUrl={(url) => {
            onUpdateMod({ ...mod, static_manifest_url: url });
            persistLocalSandboxConfig({ static_manifest_url: url });
          }}
          onExportRelease={onExportRelease}
          onSyncToNetwork={onSyncToNetwork}
          onSaveCloudChanges={onSaveCloudChanges}
        />
      )}

      {/* CLEAN RAW-CODE IDE DRAWER */}
      <ArtifactIdeDrawer
        cwSelectedFile={cwSelectedFile}
        hasUnsavedIdeChanges={hasUnsavedIdeChanges}
        wbFileState={wbFileState}
        wbEditorState={wbEditorState}
        wbLayoutState={wbLayoutState}
        wbShowTimeline={wbShowTimeline}
        setWbShowTimeline={setWbShowTimeline}
      />
    </>
  );
}
