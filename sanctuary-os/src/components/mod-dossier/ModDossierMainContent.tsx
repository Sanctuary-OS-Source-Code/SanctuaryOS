import { isDesktop } from "../../utils/envUtils";
import {
  GameVersionMultiSelect,
  CustomDatePicker,
  CustomDropdown,
  CustomClassificationDropdown,
  SidePanelHeroCard,
  SidePanelTitleInput,
  SidePanelPillToggle,
  UniversalGroup,
  StatBox,
  ActionButton,
  DashboardStatTile,
  SidePanelFilterBar,
  getModFallbackUrl,
  handleOpenUrl,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
  resolveModHighlanderSlot,
} from "../../shared";
import { LabVerificationGate, LabVerificationBadge } from "../LabVerificationGate";
import { LabReportDiagnosticCards } from "../KnownExceptionRules";
import { getComplianceTierDisplay } from "../../mod-dossier/dossierHelpersAndFetch";
import { DossierModuleCard } from "../../mod-dossier/DossierModuleCard";

export function buildModDossierHeaderActions({
  onResetMetadata,
  onOpenMasonProfile,
  editMode,
  setEditMode,
  onSecureShred,
  isCorrecting,
  setIsCorrecting,
  onSyncToNetwork,
  t,
  mustPassLabForScout,
  session,
  isModLabVerified,
  hydratedMeta,
  mod,
  handleClose,
  isSaving,
  setShowFlagModal,
  isNexusView,
  targetDbId,
  isBanned,
  userRole,
  allEquippableManifestNames,
  allEquipped,
  handleToggleAll,
  handleSave,
  handleExportLocalRelease,
  handleSubmitToVault,
}: any) {
          if (editMode) {
            return (
              <PanelHeaderGroup>
                {!isCorrecting && (
                  <>
                    <PanelHeaderButton
                      icon={t("hub_save", "save")}
                      tooltip={
                        isSaving
                          ? t("dossier_btn_saving", "Saving...")
                          : t("btn_save_local", "Save")
                      }
                      variant="success"
                      onClick={handleSave}
                      disabled={isSaving}
                    />
                    <PanelHeaderButton
                      icon={t("icon_refresh", "refresh")}
                      tooltip={t("btn_reset", "Reset")}
                      variant="danger"
                      onClick={() => {
                        if (onResetMetadata) onResetMetadata(mod.hash);
                        handleClose();
                      }}
                    />
                  </>
                )}
                {isCorrecting &&
                  session &&
                  Number(mod.compliance_tier || 0) === 0 && (
                    <PanelHeaderButton
                      icon={
                        mustPassLabForScout && !isModLabVerified
                          ? t("icon_lock", "lock")
                          : t("icon_send", "send")
                      }
                      tooltip={
                        isSaving
                          ? t("btn_submitting", "Submitting...")
                          : t("btn_submit_corrections", "Submit")
                      }
                      variant="success"
                      onClick={handleSubmitToVault}
                      disabled={
                        isSaving || (mustPassLabForScout && !isModLabVerified)
                      }
                    />
                  )}
                <PanelHeaderButton
                  icon={t("icon_close", "close")}
                  tooltip={t("cancel", "Cancel")}
                  onClick={() => {
                    setEditMode(false);
                    setIsCorrecting(false);
                  }}
                />
              </PanelHeaderGroup>
            );
          }

          const resolvedMasonId = mod.mason_id || hydratedMeta?.mason_id;
          const canViewMasonProfile = Boolean(resolvedMasonId && onOpenMasonProfile);
          const canEquipMain = Boolean(
            !isNexusView && allEquippableManifestNames.length > 0
          );
          const canSyncSandbox = Boolean(mod.hash?.startsWith("dev_sandbox_") && isDesktop());
          const canExportRelease = Boolean(
            (mod.hash?.startsWith("dev_sandbox_") ||
              mod._isLocalSandbox ||
              mod.isSandbox ||
              String(mod.status || "").toLowerCase().includes("sandbox")) &&
            !mod.isVirtual &&
            !isNexusView &&
            !mod.name?.startsWith("LOCAL_SET_") &&
            isDesktop()
          );
          const canEditDesktop = Boolean(isDesktop());
          const canShredMalware = Boolean(
            userRole === "oversight" && mod.compliance_tier === 5
          );
          const validLocalSha256 = /^[0-9a-f]{64}$/i.test(
            String(mod?.hash || "").trim()
          );
          const canFlagMod = Boolean(
            !(Number(mod.compliance_tier || 0) >= 1 && Number(mod.compliance_tier || 0) <= 4) &&
            (targetDbId || validLocalSha256) &&
            !mod?.isVirtual &&
            !String(mod?.hash || "").startsWith("dev_sandbox_") &&
            session &&
            !isBanned
          );

          if (
            !canViewMasonProfile &&
            !canEquipMain &&
            !canSyncSandbox &&
            !canExportRelease &&
            !canEditDesktop &&
            !canShredMalware &&
            !canFlagMod
          ) {
            return undefined;
          }

          return (
            <PanelHeaderGroup>
              {canViewMasonProfile && (
                <PanelHeaderButton
                  icon={t("icon_person", "person")}
                  tooltip={t("btn_view_profile", "View Profile")}
                  onClick={() => {
                    onOpenMasonProfile?.(resolvedMasonId);
                  }}
                />
              )}
              {canEquipMain && (
                <PanelHeaderButton
                  icon={
                    allEquipped
                      ? t("icon_remove", "remove")
                      : t("icon_add", "add")
                  }
                  tooltip={
                    allEquipped
                      ? t("btn_unequip", "Unequip {Mod}")
                      : t("btn_equip", "Equip {Mod}")
                  }
                  variant={allEquipped ? "danger" : "success"}
                  onClick={handleToggleAll}
                />
              )}
              {canSyncSandbox && (
                <PanelHeaderButton
                  icon={t("icon_cloud_sync", "cloud_sync")}
                  tooltip={t("btn_sync_network", "Sync Network")}
                  variant="success"
                  onClick={() => {
                    if (onSyncToNetwork) onSyncToNetwork(mod);
                    else setEditMode(true);
                  }}
                />
              )}
              {canExportRelease && (
                <PanelHeaderButton
                  icon={t("icon_rocket_launch", "rocket_launch")}
                  tooltip={t("btn_export_release", "Export Release")}
                  onClick={handleExportLocalRelease}
                  disabled={isSaving}
                />
              )}
              {mod.name?.startsWith("LOCAL_SET_")
                ? canEditDesktop && (
                  <PanelHeaderButton
                    icon={t("icon_tune", "tune")}
                    tooltip={t("local_folders_edit", "Edit Folder")}
                    variant="warning"
                    onClick={() => {
                      handleClose();
                      window.dispatchEvent(
                        new CustomEvent("openLocalFolderEditor", {
                          detail: mod.dbId,
                        })
                      );
                    }}
                  />
                )
                : canEditDesktop && (
                  <PanelHeaderButton
                    icon={t("icon_edit", "edit")}
                    tooltip={
                      isCorrecting
                        ? t("btn_submit_corrections", "Submit Corrections")
                        : t("btn_edit", "Edit")
                    }
                    variant="warning"
                    onClick={() => setEditMode(true)}
                  />
                )}
              {canShredMalware && (
                <PanelHeaderButton
                  icon={t("icon_delete_forever", "delete_forever")}
                  tooltip={t("malware_alert_btn_shred", "Shred")}
                  variant="danger"
                  onClick={() => {
                    handleClose();
                    onSecureShred(mod.name);
                  }}
                />
              )}
              {canFlagMod && (
                <PanelHeaderButton
                  icon={t("icon_flag", "flag")}
                  tooltip={t("btn_flag", "Flag {Mod}")}
                  variant="warning"
                  onClick={() => setShowFlagModal(true)}
                />
              )}
            </PanelHeaderGroup>
          );
}

export function ModDossierMainContent({
  metaInputs,
  setMetaInputs,
  onSaveMetadata,
  onOpenMasonProfile,
  editMode,
  onSendToLab,
  isCorrecting,
  t,
  activeGameSchema,
  requireScoutLabTest,
  mustPassLabForScout,
  setIsModLabVerified,
  hydratedMeta,
  collectionFilter,
  setCollectionFilter,
  collectionSearchQuery,
  setCollectionSearchQuery,
  versionPoolItems,
  setSelectedVersionGroupKeys,
  visibleKidsLimit,
  kidsSentinelRef,
  filterVersionGroupsForTarget,
  setActiveVersionModalGroups,
  mod,
  handleClose,
  handleInspectKid,
  isNexusView,
  localCreatedAt,
  setLocalCreatedAt,
  localUpdatedAt,
  setLocalUpdatedAt,
  showImages,
  localCategory,
  setLocalCategory,
  localCompatibleVersions,
  setLocalCompatibleVersions,
  dossierLabReports,
  activeMods,
  isModNameEquipped,
  groupedKids,
  inVaultKidsCount,
  missingKidsCount,
  filteredGroupedKids,
  visibleGroupedKids,
  collectionFilterPopoverContent,
  groupedRelations,
  isSingleItemStaged,
  isModStaged,
  handleStageTargetToPc,
  isCollection,
  hasOverrides,
  familyVersion,
  allEquippableManifestNames,
  allEquipped,
  safeToggle,
  safeToggleGroup,
  handleToggleAll,
  conflicts,
  cleanArtifactTitle,
  statusLabel,
  statusVariant,
  statusIcon,
  resolvedVersion,
  resolvedCreatedAt,
  resolvedUpdatedAt,
  coverImageUrl,
  hasValidCover,
}: any) {
  return (
    <>
          <SidePanelHeroCard
            icon={statusIcon}
            overline={t("system_status", "System Status")}
            title={statusLabel}
            description={
              (mod.status_reason &&
                !/^\[ARCHITECT\b/i.test(String(mod.status_reason).trim())
                ? mod.status_reason
                : "") ||
              mod._alert_reason ||
              `${cleanArtifactTitle} • ${mod.author || t("unknown", "Unknown")}`
            }
            badge={
              mod.name?.includes(".")
                ? `.${(mod.name || "").split(".").pop()?.toUpperCase()}`
                : isCollection
                  ? t("collection", "Collection")
                  : mod.isParent
                    ? t("folder", "Folder")
                    : localCategory || t("label_artifact", "{Mod}")
            }
            badgeIcon={t("icon_inventory_2", "inventory_2")}
            badges={[
              ...(resolveModHighlanderSlot(mod)
                ? [
                  {
                    label: `${t("highlander_exclusive_slot", "Exclusive Slot")}: ${resolveModHighlanderSlot(mod)!.name}`,
                    icon: t("icon_swap_horiz", "swap_horiz"),
                    colorClass: "text-[var(--accent)]",
                  },
                ]
                : []),
              ...((editMode ? metaInputs.is_early_access : mod.is_early_access)
                ? [
                  {
                    label: t("badge_early_access", "Early Access"),
                    icon: t("icon_science", "science"),
                  },
                ]
                : []),
              ...((editMode ? metaInputs.is_paid : mod.is_paid)
                ? [
                  {
                    label: t("badge_paid", "Paid"),
                    icon: t("icon_monetization_on", "monetization_on"),
                    colorClass: "text-[var(--warning)]",
                  },
                ]
                : []),
            ]}
            variant={statusVariant}
          >
            <div className="flex flex-col gap-3">
              {hasValidCover && (
                <div className="w-full h-40 rounded-xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] glass-surface relative">
                  <img
                    src={coverImageUrl}
                    className="w-full h-full object-cover opacity-80"
                    alt={t("cc_cover_url", "Cover")}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                {!mod.isVirtual && mod.hash && (
                  <div className="flex flex-wrap items-center gap-2">
                    <LabVerificationBadge
                      dnaHash={mod.hash}
                      required={requireScoutLabTest && isCorrecting}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  {!editMode && !isNexusView && allEquippableManifestNames.length > 0 && (
                    <ActionButton
                      variant={allEquipped ? "danger" : "success"}
                      icon={
                        allEquipped
                          ? t("icon_remove_circle_outline", "remove_circle_outline")
                          : t("icon_add_circle_outline", "add_circle_outline")
                      }
                      label={
                        allEquipped
                          ? groupedKids.length > 1
                            ? t("remove_all", "Remove All")
                            : t("btn_unequip", "Unequip {Mod}")
                          : groupedKids.length > 1
                            ? t("add_all", "Add All")
                            : t("btn_equip", "Equip {Mod}")
                      }
                      onClick={handleToggleAll}
                    />
                  )}
                  {!editMode && !isDesktop() && (
                    <ActionButton
                      variant={isModStaged ? "accent" : "glass"}
                      icon={
                        isModStaged
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_phonelink", "phonelink")
                      }
                      label={
                        isModStaged
                          ? t("staging_btn_staged", "Staged")
                          : t("staging_btn_stage_mod", "Stage to PC")
                      }
                      onClick={() => handleStageTargetToPc(mod, isModStaged)}
                    />
                  )}
                  {!editMode &&
                    Number(mod.compliance_tier || 0) === 0 &&
                    isDesktop() && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_science", "science")}
                        label={t("btn_send_to_lab", "Send to Lab")}
                        onClick={() => {
                          handleClose();
                          onSendToLab();
                        }}
                      />
                    )}
                  {!editMode && !isNexusView && isDesktop() && versionPoolItems.length > 0 && (
                    <ActionButton
                      variant="glass"
                      icon={t("icon_history", "history")}
                      label={t("version_pool_btn_versions", "Versions")}
                      onClick={() => {
                        const mainVersionGroups = filterVersionGroupsForTarget(mod);
                        setActiveVersionModalGroups(mainVersionGroups);
                        setSelectedVersionGroupKeys(
                          mainVersionGroups.map((g: any) => g.key)
                        );
                      }}
                    />
                  )}
                  {!editMode && (
                    <ActionButton
                      variant="glass"
                      icon={
                        !isDesktop()
                          ? mod.url || hasOverrides
                            ? t("icon_open_in_new", "open_in_new")
                            : t("icon_search", "search")
                          : mod.url || hasOverrides
                            ? t("icon_download", "download")
                            : t("icon_search", "search")
                      }
                      label={
                        !isDesktop()
                          ? mod.url || hasOverrides
                            ? t("btn_view", "View")
                            : t("btn_search_web", "Search Web")
                          : mod.url || hasOverrides
                            ? t("btn_download", "Download")
                            : t("btn_search_web", "Search Web")
                      }
                      onClick={() => {
                        const url = getModFallbackUrl(
                          mod.displayName || mod.name || "",
                          mod.hash,
                          activeGameSchema,
                          { url: mod.url }
                        );
                        handleOpenUrl(url);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </SidePanelHeroCard>

          {editMode && (
            <SidePanelTitleInput
              value={metaInputs.name}
              onChange={setMetaInputs.name}
              placeholder={t("mod_name", "Artifact Name")}
              label={t("mod_name", "Artifact Name")}
              icon={t("icon_deployed_code", "deployed_code")}
            />
          )}

          {!mod.isVirtual &&
            !isNexusView &&
            mod.hash &&
            Number(mod.compliance_tier || 0) === 0 &&
            editMode &&
            isCorrecting && (
              <LabVerificationGate
                dnaHash={mod.hash}
                modName={mod.displayName || mod.name || "Artifact"}
                physicalPath={mod.physical_path || mod.name}
                roleContext="scout"
                isGateRequired={mustPassLabForScout}
                onStatusChange={(st) => setIsModLabVerified(st.verified)}
                onOpenInFullLab={
                  onSendToLab
                    ? () => {
                      handleClose();
                      onSendToLab();
                    }
                    : undefined
                }
              />
            )}

          <UniversalGroup
            title={t("tab_metadata", "Metadata & Telemetry")}
            icon={t("icon_analytics", "analytics")}
          >
            {!editMode ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatBox
                    label={t("mason", "{Mason}")}
                    value={mod.author || t("unknown", "Unknown")}
                    icon={t("icon_person", "person")}
                    iconColorClass="text-[var(--accent)]"
                    onClick={
                      (mod.mason_id || hydratedMeta?.mason_id) && onOpenMasonProfile
                        ? () => {
                          onOpenMasonProfile(mod.mason_id || hydratedMeta?.mason_id);
                        }
                        : undefined
                    }
                  />
                  <StatBox
                    label={t("revision", "Revision")}
                    value={resolvedVersion}
                    icon={t("icon_tag", "tag")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("label_game_version", "Game Version")}
                    value={
                      familyVersion === "Unknown" ||
                        familyVersion === "ALL" ||
                        familyVersion === ""
                        ? t("any", "Any")
                        : familyVersion
                    }
                    icon={t("icon_sports_esports", "sports_esports")}
                    iconColorClass="text-[var(--success)]"
                  />
                  <StatBox
                    label={t("label_mod_category", "{Mod} Category")}
                    value={
                      isCollection
                        ? t("collection", "Collection")
                        : mod.isParent
                          ? t("folder", "Folder")
                          : localCategory || t("uncategorized", "Uncategorized")
                    }
                    icon={t("icon_category", "category")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  {resolveModHighlanderSlot(mod) && (
                    <StatBox
                      label={t("highlander_exclusive_slot", "Exclusive Slot")}
                      value={resolveModHighlanderSlot(mod)!.name}
                      icon={t("icon_swap_horiz", "swap_horiz")}
                      iconColorClass="text-[var(--accent)]"
                    />
                  )}
                  <StatBox
                    label={t("tab_compliance", "Compliance")}
                    value={getComplianceTierDisplay(mod, isNexusView, t).value}
                    icon={t("icon_shield", "shield")}
                    iconColorClass={getComplianceTierDisplay(mod, isNexusView, t).color}
                  />
                  <StatBox
                    label={t("badge_early_access", "Access Tier")}
                    value={
                      mod.is_early_access
                        ? t("badge_early_access", "Early Access")
                        : mod.is_paid
                          ? t("badge_paid", "Paid")
                          : t("badge_free", "Free")
                    }
                    icon={
                      mod.is_early_access
                        ? t("icon_science", "science")
                        : mod.is_paid
                          ? t("icon_monetization_on", "monetization_on")
                          : t("icon_public", "public")
                    }
                    iconColorClass={
                      mod.is_paid
                        ? "text-[var(--warning)]"
                        : mod.is_early_access
                          ? "text-[var(--accent)]"
                          : "text-[var(--success)]"
                    }
                  />
                  <StatBox
                    label={t("label_uploaded", "Uploaded")}
                    value={resolvedCreatedAt}
                    icon={t("icon_calendar_today", "calendar_today")}
                  />
                  <StatBox
                    label={t("updated_date", "Updated")}
                    value={resolvedUpdatedAt}
                    icon={t("icon_update", "update")}
                  />
                </div>

                {(metaInputs.manifest_url || mod.manifest_url) && (
                  <div className="flex items-center justify-between gap-4 p-3.5 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_network_wifi", "network_wifi")}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">
                          {t(
                            "label_static_manifest_linked",
                            "Static Edge Manifest Linked"
                          )}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--subtext)] truncate">
                          {metaInputs.manifest_url || mod.manifest_url}
                        </span>
                      </div>
                    </div>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_sync", "sync")}
                      label={t("btn_poll_manifest", "Poll Manifest")}
                      onClick={() =>
                        onSaveMetadata({
                          manifest_url:
                            metaInputs.manifest_url || mod.manifest_url,
                        })
                      }
                    />
                  </div>
                )}

                {(() => {
                  const rawReason = String(mod.status_reason || "").trim();
                  const cleanStatusReason =
                    rawReason && !/^\[ARCHITECT\b/i.test(rawReason) ? rawReason : "";
                  const modStatusLower = String(mod.status || "").toLowerCase();
                  const hasIssueStatus =
                    modStatusLower === "broken" ||
                    modStatusLower === "corrupted" ||
                    modStatusLower === "unstable";
                  if (
                    !hasIssueStatus &&
                    !cleanStatusReason &&
                    dossierLabReports.length === 0
                  ) {
                    return null;
                  }
                  const isCorruptedStatus =
                    modStatusLower === "broken" || modStatusLower === "corrupted";
                  const statusToneClass = isCorruptedStatus
                    ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
                    : modStatusLower === "unstable"
                      ? "text-[var(--warning)] border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
                      : "text-[var(--accent)] border-[color-mix(in_srgb,var(--text)_14%,transparent)]";

                  return (
                    <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                            {t("icon_science", "science")}
                          </span>
                          {t(
                            "dossier_issues_lab_title",
                            "Issues, Causes & {Lab} Diagnostics"
                          )}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md bg-transparent border text-[9px] font-black uppercase tracking-widest ${statusToneClass}`}
                        >
                          {isCorruptedStatus
                            ? t("status_corrupted", "Corrupted")
                            : modStatusLower === "unstable"
                              ? t("status_unstable", "Unstable")
                              : t("tab_lab_reports", "Lab Reports")}
                        </span>
                      </div>

                      {cleanStatusReason && (
                        <div className="rounded-xl p-3 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t(
                              "label_issue_cause_summary",
                              "Documented Issue & Cause"
                            )}
                          </span>
                          <p className="text-xs font-semibold text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words">
                            {cleanStatusReason}
                          </p>
                        </div>
                      )}

                      <LabReportDiagnosticCards
                        reports={dossierLabReports}
                        activeGameSchema={activeGameSchema}
                      />
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("mason", "{Mason}")}
                    </label>
                    <input
                      value={metaInputs.author}
                      onChange={(e) => setMetaInputs.author(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t("author_placeholder", "{Mason} Name...")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("revision", "Revision")}
                    </label>
                    <input
                      value={metaInputs.version || ""}
                      onChange={(e) => setMetaInputs.version(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t("unknown", "1.0.0")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_mod_category", "{Mod} Category")}
                    </label>
                    <CustomClassificationDropdown
                      value={localCategory || "Script"}
                      onChange={(val: string) => setLocalCategory(val)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_game_version", "Game Version")}
                    </label>
                    <GameVersionMultiSelect
                      selectedVersions={localCompatibleVersions || []}
                      onChange={(v) => setLocalCompatibleVersions(v)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_uploaded", "Uploaded")}
                    </label>
                    <CustomDatePicker
                      value={localCreatedAt}
                      onChange={setLocalCreatedAt}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("updated_date", "Updated")}
                    </label>
                    <CustomDatePicker
                      value={localUpdatedAt}
                      onChange={setLocalUpdatedAt}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("registry_label_status", "Verification Status")}
                    </label>
                    <CustomDropdown
                      disableTint={true}
                      value={(() => {
                        const s = String(metaInputs.status || mod.status || "")
                          .toLowerCase()
                          .trim();
                        if (s === "corrupted" || s === "broken") return "corrupted";
                        if (s === "unstable") return "unstable";
                        return "stable";
                      })()}
                      onChange={(val: string) =>
                        setMetaInputs.status && setMetaInputs.status(val)
                      }
                      options={[
                        { id: "stable", label: t("status_stable", "Stable") },
                        { id: "unstable", label: t("label_unstable", "Unstable") },
                        { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label
                      className={`text-[10px] font-black uppercase tracking-wider px-1 flex items-center gap-1.5 ${String(metaInputs.status || mod.status || "").toLowerCase() ===
                        "corrupted" ||
                        String(metaInputs.status || mod.status || "").toLowerCase() ===
                        "broken"
                        ? "text-[var(--danger)]"
                        : String(metaInputs.status || mod.status || "").toLowerCase() ===
                          "unstable"
                          ? "text-[var(--warning)]"
                          : "text-[var(--subtext)]"
                        }`}
                    >
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_report_problem", "report_problem")}
                      </span>
                      {t(
                        "label_status_issue_details",
                        "Issue & Cause Details (Corrupted / Unstable)"
                      )}
                    </label>
                    <textarea
                      value={metaInputs.statusMsg || ""}
                      onChange={(e) =>
                        setMetaInputs.statusMsg &&
                        setMetaInputs.statusMsg(e.target.value)
                      }
                      placeholder={t(
                        "ph_status_issue_details",
                        "Explain what the issue is and what is causing it (shown on {Citizen} Alerts & {Mod} Dossier)..."
                      )}
                      className="w-full min-h-[72px] glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl p-3 text-xs font-semibold text-[var(--text)] resize-y focus:outline-none transition-all custom-scrollbar"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SidePanelPillToggle
                    checked={metaInputs.is_paid || false}
                    onChange={(val) => setMetaInputs.is_paid(val)}
                    icon={
                      metaInputs.is_paid
                        ? t("icon_monetization_on", "monetization_on")
                        : t("icon_money_off", "money_off")
                    }
                    label={`${t("label_is_paid", "Paid {Mod}")}: ${metaInputs.is_paid
                      ? t("badge_paid", "Paid")
                      : t("badge_free", "Free")
                      }`}
                    activeColor="var(--warning)"
                  />
                  <SidePanelPillToggle
                    checked={metaInputs.is_early_access || false}
                    onChange={(val) => setMetaInputs.is_early_access(val)}
                    icon={
                      metaInputs.is_early_access
                        ? t("icon_science", "science")
                        : t("icon_public", "public")
                    }
                    label={`${t("badge_early_access", "Early Access")}: ${metaInputs.is_early_access
                      ? t("badge_early_access", "Early Access")
                      : t("badge_standard", "Standard")
                      }`}
                    activeColor="var(--accent)"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("external_url_placeholder", "External URL")}
                    </label>
                    <input
                      value={metaInputs.url}
                      onChange={(e) => setMetaInputs.url(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("cc_cover_url", "Cover Image URL")}
                    </label>
                    <input
                      value={metaInputs.image}
                      onChange={(e) => setMetaInputs.image(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-[var(--accent)] uppercase tracking-wider px-1">
                      {t(
                        "edge_manifest_url_label",
                        "Static Edge Manifest URL (.sanctuary.manifest.json)"
                      )}
                    </label>
                    <input
                      value={metaInputs.manifest_url || ""}
                      onChange={(e) =>
                        setMetaInputs.manifest_url &&
                        setMetaInputs.manifest_url(e.target.value)
                      }
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t(
                        "placeholder_static_manifest_url",
                        "https://your-domain.com/.sanctuary.manifest.json"
                      )}
                    />
                  </div>
                </div>
              </div>
            )}
          </UniversalGroup>

          <UniversalGroup
            title={t("log_manifest", "{Mod} Description")}
            icon={t("icon_description", "description")}
          >
            {editMode ? (
              <textarea
                value={metaInputs.desc}
                onChange={(e) => setMetaInputs.desc(e.target.value)}
                className="w-full h-36 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl p-3.5 text-xs font-medium text-[var(--text)] resize-none focus:outline-none transition-all custom-scrollbar"
                placeholder={t("local_desc_placeholder", "Enter description...")}
              />
            ) : (
              <div className="text-xs text-[var(--text)] opacity-90 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] whitespace-pre-wrap">
                {mod.description || t("no_desc_manifest", "No description provided for this {Mod}.")}
              </div>
            )}
          </UniversalGroup>

          {groupedKids.length > 0 && (
            <UniversalGroup
              title={`${t("manifest", "Manifest")} (${groupedKids.length})`}
              icon={t("icon_inventory_2", "inventory_2")}
              headerAction={
                !isNexusView && (
                  <button
                    type="button"
                    onClick={handleToggleAll}
                    className={`h-7 px-3 rounded-lg glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${allEquipped
                      ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                      : "text-[var(--success)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)]"
                      }`}
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {allEquipped
                        ? t("icon_remove_circle_outline", "remove_circle_outline")
                        : t("icon_add_circle_outline", "add_circle_outline")}
                    </span>
                    <span>
                      {allEquipped
                        ? t("remove_all", "Remove All")
                        : t("add_all", "Add All")}
                    </span>
                  </button>
                )
              }
            >
              <SidePanelFilterBar className="grid-cols-3 gap-2.5 mb-3">
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={t("icon_inventory_2", "inventory_2")}
                  label={t("filter_all", "All")}
                  number={groupedKids.length}
                  colorClass="text-[var(--accent)]"
                  isActive={collectionFilter === "all"}
                  onClick={() => setCollectionFilter("all")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={t("icon_check_circle", "check_circle")}
                  label={t("status_in_vault", "In {Vault}")}
                  number={inVaultKidsCount}
                  colorClass="text-[var(--success)]"
                  isActive={collectionFilter === "in_vault"}
                  onClick={() => setCollectionFilter("in_vault")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={t("icon_error", "error")}
                  label={t("status_missing", "Missing")}
                  number={missingKidsCount}
                  colorClass="text-[var(--danger)]"
                  isActive={collectionFilter === "missing"}
                  onClick={() => setCollectionFilter("missing")}
                />
              </SidePanelFilterBar>

              <div className="mb-3">
                <ActionPill
                  searchQuery={collectionSearchQuery}
                  setSearchQuery={setCollectionSearchQuery}
                  searchPlaceholder={t("search_ph", "Search {mods}...")}
                  primaryPopover={{
                    icon: t("icon_tune", "tune"),
                    label: t("filters", "Filters"),
                    content: collectionFilterPopoverContent,
                  }}
                />
              </div>

              {filteredGroupedKids.length === 0 ? (
                <div className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-center">
                  {t("registry_no_mods", "No {Mods} Found")}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {visibleGroupedKids.map((kidGroup: any, kidIndex: number) => (
                    <DossierModuleCard
                      key={
                        kidGroup.hash ||
                        kidGroup.dbId ||
                        `${kidGroup._groupedTitle}_${kidIndex}`
                      }
                      item={kidGroup}
                      activeMods={activeMods}
                      isModNameEquipped={isModNameEquipped}
                      isNexusView={isNexusView}
                      activeGameSchema={activeGameSchema}
                      showImages={showImages}
                      t={t}
                      onInspect={handleInspectKid}
                      onToggleGroup={safeToggleGroup}
                      onToggleSingle={safeToggle}
                      isSingleItemStaged={isSingleItemStaged}
                      handleStageTargetToPc={handleStageTargetToPc}
                    />
                  ))}
                  {visibleKidsLimit < filteredGroupedKids.length && (
                    <div ref={kidsSentinelRef} className="col-span-full h-2" />
                  )}
                </div>
              )}
            </UniversalGroup>
          )}

          {(groupedRelations.length > 0 || conflicts.length > 0) && (
            <UniversalGroup
              title={t("network_protocols", "Required {Mods}")}
              icon={t("auto_extension", "extension")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupedRelations.map((relItem: any, i: number) => (
                  <DossierModuleCard
                    key={
                      relItem.dbId ||
                      relItem.hash ||
                      `${relItem._groupedTitle}_${i}`
                    }
                    item={relItem}
                    activeMods={activeMods}
                    isModNameEquipped={isModNameEquipped}
                    isNexusView={isNexusView}
                    activeGameSchema={activeGameSchema}
                    showImages={showImages}
                    t={t}
                    onInspect={handleInspectKid}
                    onToggleGroup={safeToggleGroup}
                    onToggleSingle={safeToggle}
                    isSingleItemStaged={isSingleItemStaged}
                    handleStageTargetToPc={handleStageTargetToPc}
                  />
                ))}
              </div>
            </UniversalGroup>
          )}
    </>
  );
}
