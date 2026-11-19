import { isDesktop } from "../../utils/envUtils";
import { useStore } from "../../store";
import {
  CustomComplianceDropdown,
  formatVersionRangesLabel,
  getFileLabel,
  getModIcon,
  mapDlcCode,
  formatDisplayName,
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  ActionButton,
  DashboardStatTile,
  SidePanelFilterBar,
  getModFallbackUrl,
  handleOpenUrl,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
  ActionPill,
  isScriptExtension,
} from "../../shared";
import { formatCleanModTitle } from "../../side-panels/CommandIncompatiblePanel";
import { ModVersionHistorySidePanel } from "../../side-panels/VaultSidePanels";
import { UniversalTextArea } from "../universal/UniversalLayout";
import {
  getComplianceTierDisplay,
  isPlaceholderVersionStr,
  pickFirstValidAuthor,
  DossierFilterSection,
} from "../../mod-dossier/dossierHelpersAndFetch";
import { DossierModuleCard } from "../../mod-dossier/DossierModuleCard";

export function ModDossierSecondaryDrawers({
  onOpenMasonProfile,
  t,
  activeGameSchema,
  selectedVersion,
  dossierAlertPending,
  setDossierAlertPending,
  kidCollectionFilter,
  setKidCollectionFilter,
  kidSearchQuery,
  setKidSearchQuery,
  deferredKidSearch,
  kidEquipFilter,
  setKidEquipFilter,
  kidCategoryFilter,
  kidStatusFilter,
  setKidStatusFilter,
  versionPoolItems,
  setSelectedVersionGroupKeys,
  loadDossierVersionPool,
  handleActivateDossierVersion,
  handleDeleteDossierVersion,
  filterVersionGroupsForTarget,
  setActiveVersionModalGroups,
  selectedVersionGroups,
  mod,
  selectedKid,
  setSelectedKid,
  handleInspectKid,
  kidToRender,
  showFlagModal,
  setShowFlagModal,
  isNexusView,
  showImages,
  activeMods,
  isModNameEquipped,
  buildGroupedCollectionModules,
  isKidGroupEquipped,
  resolveKidCategoryKey,
  isSingleItemStaged,
  handleStageTargetToPc,
  getVersions,
  familyVersion,
  safeToggle,
  safeToggleGroup,
  flagComplianceTier,
  setFlagComplianceTier,
  flagReasonNotes,
  setFlagReasonNotes,
  isSubmittingFlag,
  handleFlagMod,
  cleanArtifactTitle,
  resolvedVersion,
}: any) {
  return (
    <>
      {kidToRender &&
        (() => {
          const rawKidTitle =
            kidToRender._groupedTitle ||
            (kidToRender.displayName &&
              !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(kidToRender.displayName))
              ? kidToRender.displayName
              : (kidToRender.name || "")
                .replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "")
                .split(/[/\\]/)
                .pop() || "");
          const cleanKidTitle =
            formatCleanModTitle(
              String(rawKidTitle).replace(/_/g, " ").replace(/\.[^/.]+$/, "")
            ) || String(rawKidTitle);

          const kidAuthor =
            pickFirstValidAuthor(t, kidToRender, mod) ||
            t("unknown", "Unknown");

          const kidVerCandidates = [
            ...(Array.isArray(kidToRender.mod_versions)
              ? kidToRender.mod_versions.map((mv: any) => mv?.version_label)
              : []),
            kidToRender.latest_version,
            kidToRender.version,
            resolvedVersion,
          ];
          const kidResolvedVersion =
            kidVerCandidates.find((v) => !isPlaceholderVersionStr(v, t)) ||
            t("unknown", "Unknown");

          const kidCompat = getVersions(kidToRender);
          const kidHighestVer =
            kidCompat.length > 0 ? formatVersionRangesLabel(kidCompat) : familyVersion;
          const kidGameVersionLabel =
            kidHighestVer === "Unknown" ||
              kidHighestVer === "ALL" ||
              kidHighestVer === ""
              ? t("any", "Any")
              : kidHighestVer;

          const kidCreatedDt =
            kidToRender.created_at ||
            kidToRender.mod_versions?.[0]?.created_at ||
            kidToRender._groupedMods?.find((gm: any) => gm?.created_at)?.created_at ||
            kidToRender.flavors?.find((fl: any) => fl?.created_at)?.created_at ||
            mod.created_at ||
            mod.mod_versions?.[0]?.created_at;
          const kidResolvedCreatedAt = kidCreatedDt
            ? new Date(kidCreatedDt).toLocaleDateString()
            : t("source_local", "Local");

          const kidUpdatedDt =
            kidToRender.updated_at ||
            kidToRender.mod_versions?.[0]?.created_at ||
            kidToRender.created_at ||
            kidToRender._groupedMods?.find(
              (gm: any) => gm?.updated_at || gm?.created_at
            )?.updated_at ||
            kidToRender.flavors?.find(
              (fl: any) => fl?.updated_at || fl?.created_at
            )?.updated_at ||
            mod.updated_at ||
            mod.created_at;
          const kidResolvedUpdatedAt = kidUpdatedDt
            ? new Date(kidUpdatedDt).toLocaleDateString()
            : t("source_local", "Local");

          const kidModules: any[] =
            Array.isArray(kidToRender._groupedMods) &&
              kidToRender._groupedMods.length > 0
              ? kidToRender._groupedMods
              : Array.isArray(kidToRender.flavors) &&
                kidToRender.flavors.length > 0
                ? kidToRender.flavors
                : [kidToRender];

          const groupedKidModules =
            kidModules.length > 1 ||
              kidToRender.isVirtual ||
              kidToRender.isParent ||
              kidToRender.isCollection ||
              (Array.isArray(kidToRender.hydratedCollectionChildren) &&
                kidToRender.hydratedCollectionChildren.length > 1)
              ? buildGroupedCollectionModules(
                kidModules,
                kidToRender.hydratedCollectionChildren || []
              )
              : [];

          const kidInVaultCount = groupedKidModules.filter(
            (k: any) => k.isInstalled !== false
          ).length;
          const kidMissingCount = groupedKidModules.filter(
            (k: any) => k.isInstalled === false
          ).length;

          const normKidSearch = deferredKidSearch
            .trim()
            .toLowerCase()
            .replace(/[_.\-/\\]+/g, " ")
            .replace(/\s+/g, " ");

          const filteredKidModules = groupedKidModules.filter((k: any) => {
            if (kidCollectionFilter === "in_vault" && k.isInstalled === false)
              return false;
            if (kidCollectionFilter === "missing" && k.isInstalled !== false)
              return false;
            if (kidEquipFilter === "EQUIPPED" && !isKidGroupEquipped(k))
              return false;
            if (kidEquipFilter === "UNEQUIPPED" && isKidGroupEquipped(k))
              return false;
            if (kidCategoryFilter !== "ALL") {
              const cat = resolveKidCategoryKey(k);
              if (cat.toLowerCase() !== kidCategoryFilter.toLowerCase())
                return false;
            }
            if (kidStatusFilter !== "ALL") {
              const rawStatus = String(k.status || "").toLowerCase();
              const isLocalOnly =
                !k.dbId ||
                rawStatus === "local" ||
                rawStatus === "unverified" ||
                String(k.version || "").toLowerCase() === "v.local";
              if (kidStatusFilter === "UNVERIFIED") {
                if (!isLocalOnly) return false;
              } else if (rawStatus !== kidStatusFilter.toLowerCase()) {
                return false;
              }
            }
            if (normKidSearch) {
              const gMods =
                Array.isArray(k._groupedMods) && k._groupedMods.length > 0
                  ? k._groupedMods
                  : [k];
              const titleStr = String(
                k._groupedTitle || k.displayName || k.name || ""
              )
                .toLowerCase()
                .replace(/[_.\-/\\]+/g, " ");
              const authorStr = String(k.author || k.master_author || "")
                .toLowerCase()
                .replace(/[_.\-/\\]+/g, " ");
              const matchesSub = gMods.some((gm: any) =>
                String(gm?.name || gm?.displayName || "")
                  .toLowerCase()
                  .replace(/[_.\-/\\]+/g, " ")
                  .includes(normKidSearch)
              );
              if (
                !titleStr.includes(normKidSearch) &&
                !authorStr.includes(normKidSearch) &&
                !matchesSub
              ) {
                return false;
              }
            }
            return true;
          });

          const kidEquippableNames = kidModules
            .map((km: any) => km?.name)
            .filter(
              (n: any) =>
                n &&
                typeof n === "string" &&
                !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
            );
          const isKidEquipped =
            kidEquippableNames.length > 0 &&
            kidEquippableNames.some((n: string) => isModNameEquipped(n));

          const rawKidName = String(kidToRender.name || "");

          const kidHeroDescription =
            kidToRender.status_reason || `${cleanKidTitle} • ${kidAuthor}`;

          const hasScriptKid = kidModules.some((km: any) =>
            isScriptExtension(
              String(km?.name || km?.file_extension || ""),
              activeGameSchema
            )
          );
          const kidCategoryLabel =
            kidToRender.category_override ||
            kidToRender.type ||
            (hasScriptKid
              ? t("type_script", "Script")
              : getFileLabel(rawKidName, activeGameSchema));

          const kidStatusRaw = String(kidToRender.status || "stable")
            .toLowerCase()
            .replace(/[\[\]]/g, "");
          const kidStatusLabel =
            kidStatusRaw === "broken" || kidStatusRaw === "corrupted"
              ? t("status_corrupted", "Broken")
              : kidStatusRaw === "unstable"
                ? t("label_unstable", "Unstable")
                : t("status_stable", "Stable");

          return (
            <SidePanel
              isOpen={!!selectedKid}
              onClose={() => setSelectedKid(null)}
              title={cleanKidTitle}
              subtitle={`${kidAuthor} • ${kidStatusLabel}`}
              icon={getModIcon(kidToRender, activeGameSchema, t)}
              iconColorClass="text-[var(--accent)]"
              widthClass="w-[660px] max-w-[100vw]"
              backdropZ="z-[120004]"
              panelZ="z-[120005]"
              headerActions={(() => {
                const hasKidEquip = !isNexusView && kidEquippableNames.length > 0;
                if (!hasKidEquip) return undefined;
                return (
                  <PanelHeaderGroup>
                    {hasKidEquip && (
                      <PanelHeaderButton
                        icon={
                          isKidEquipped
                            ? t("icon_remove", "remove")
                            : t("icon_add", "add")
                        }
                        tooltip={
                          isKidEquipped
                            ? t("btn_unequip", "Unequip {Mod}")
                            : t("btn_equip", "Equip {Mod}")
                        }
                        variant={isKidEquipped ? "danger" : "success"}
                        onClick={() => {
                          safeToggleGroup(kidToRender);
                          if (!isKidEquipped) setSelectedKid(null);
                        }}
                      />
                    )}
                  </PanelHeaderGroup>
                );
              })()}
            >
              <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                <SidePanelHeroCard
                  icon={getModIcon(kidToRender, activeGameSchema, t)}
                  overline={kidAuthor}
                  title={cleanKidTitle}
                  description={kidHeroDescription}
                  badge={kidResolvedVersion}
                  badgeIcon={t("icon_tag", "tag")}
                  variant="accent"
                >
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {!isNexusView && kidEquippableNames.length > 0 && (
                      <ActionButton
                        variant={isKidEquipped ? "danger" : "success"}
                        icon={
                          isKidEquipped
                            ? t("icon_remove_circle_outline", "remove_circle_outline")
                            : t("icon_add_circle_outline", "add_circle_outline")
                        }
                        label={
                          isKidEquipped
                            ? groupedKidModules.length > 1
                              ? t("remove_all", "Remove All")
                              : t("btn_unequip", "Unequip {Mod}")
                            : groupedKidModules.length > 1
                              ? t("add_all", "Add All")
                              : t("btn_equip", "Equip {Mod}")
                        }
                        onClick={() => safeToggleGroup(kidToRender)}
                      />
                    )}
                    {!isDesktop() && (
                      <ActionButton
                        variant={
                          isSingleItemStaged(kidToRender) ? "accent" : "glass"
                        }
                        icon={
                          isSingleItemStaged(kidToRender)
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_phonelink", "phonelink")
                        }
                        label={
                          isSingleItemStaged(kidToRender)
                            ? t("staging_btn_staged", "Staged")
                            : t("staging_btn_stage_mod", "Stage to PC")
                        }
                        onClick={() =>
                          handleStageTargetToPc(
                            { ...kidToRender, _stageSingle: true },
                            isSingleItemStaged(kidToRender)
                          )
                        }
                      />
                    )}
                    {!isNexusView && isDesktop() && versionPoolItems.length > 0 && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_history", "history")}
                        label={t("version_pool_btn_versions", "Versions")}
                        onClick={() => {
                          const kidVersionGroups = filterVersionGroupsForTarget(kidToRender);
                          setActiveVersionModalGroups(kidVersionGroups);
                          setSelectedVersionGroupKeys(
                            kidVersionGroups.map((g: any) => g.key)
                          );
                        }}
                      />
                    )}
                    <ActionButton
                      variant="glass"
                      icon={
                        !isDesktop()
                          ? kidToRender.url || mod.url
                            ? t("icon_open_in_new", "open_in_new")
                            : t("icon_search", "search")
                          : kidToRender.url || mod.url
                            ? t("icon_download", "download")
                            : t("icon_search", "search")
                      }
                      label={
                        !isDesktop()
                          ? kidToRender.url || mod.url
                            ? t("btn_view", "View")
                            : t("btn_search_web", "Search Web")
                          : kidToRender.url || mod.url
                            ? t("btn_download", "Download")
                            : t("btn_search_web", "Search Web")
                      }
                      onClick={() => {
                        const url = getModFallbackUrl(
                          cleanKidTitle || kidToRender.name || "",
                          kidToRender.hash,
                          activeGameSchema,
                          { url: kidToRender.url || mod.url }
                        );
                        handleOpenUrl(url);
                      }}
                    />
                  </div>
                </SidePanelHeroCard>

                <UniversalGroup
                  title={t("tab_metadata", "Metadata & Telemetry")}
                  icon={t("icon_analytics", "analytics")}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <StatBox
                      label={t("mason", "{Mason}")}
                      value={kidAuthor}
                      icon={t("icon_person", "person")}
                      iconColorClass="text-[var(--accent)]"
                      onClick={
                        kidToRender.mason_id && onOpenMasonProfile
                          ? () => {
                            onOpenMasonProfile(kidToRender.mason_id);
                          }
                          : undefined
                      }
                    />
                    <StatBox
                      label={t("revision", "Revision")}
                      value={kidResolvedVersion}
                      icon={t("icon_tag", "tag")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    <StatBox
                      label={t("label_game_version", "Game Version")}
                      value={kidGameVersionLabel}
                      icon={t("icon_sports_esports", "sports_esports")}
                      iconColorClass="text-[var(--success)]"
                    />
                    <StatBox
                      label={t("label_mod_category", "{Mod} Category")}
                      value={kidCategoryLabel}
                      icon={t("icon_category", "category")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    <StatBox
                      label={t("tab_compliance", "Compliance")}
                      value={getComplianceTierDisplay(kidToRender, isNexusView, t).value}
                      icon={t("icon_shield", "shield")}
                      iconColorClass={getComplianceTierDisplay(kidToRender, isNexusView, t).color}
                    />
                    <StatBox
                      label={t("badge_early_access", "Access Tier")}
                      value={
                        kidToRender.is_early_access
                          ? t("badge_early_access", "Early Access")
                          : kidToRender.is_paid
                            ? t("badge_paid", "Paid")
                            : t("badge_free", "Free")
                      }
                      icon={
                        kidToRender.is_early_access
                          ? t("icon_science", "science")
                          : kidToRender.is_paid
                            ? t("icon_monetization_on", "monetization_on")
                            : t("icon_public", "public")
                      }
                      iconColorClass={
                        kidToRender.is_paid
                          ? "text-[var(--warning)]"
                          : kidToRender.is_early_access
                            ? "text-[var(--accent)]"
                            : "text-[var(--success)]"
                      }
                    />
                    <StatBox
                      label={t("label_uploaded", "Uploaded")}
                      value={kidResolvedCreatedAt}
                      icon={t("icon_calendar_today", "calendar_today")}
                    />
                    <StatBox
                      label={t("updated_date", "Updated")}
                      value={kidResolvedUpdatedAt}
                      icon={t("icon_update", "update")}
                    />
                  </div>
                </UniversalGroup>

                <UniversalGroup
                  title={t("log_manifest", "{Mod} Description")}
                  icon={t("icon_description", "description")}
                >
                  <div className="text-xs text-[var(--text)] opacity-90 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] whitespace-pre-wrap">
                    {kidToRender.description ||
                      mod.description ||
                      t(
                        "no_desc_sub",
                        "No specific local description provided for this sub-{mod}."
                      )}
                  </div>
                </UniversalGroup>

                {groupedKidModules.length > 1 && (
                  <UniversalGroup
                    title={`${t("manifest", "Manifest")} (${groupedKidModules.length})`}
                    icon={t("icon_inventory_2", "inventory_2")}
                    headerAction={
                      !isNexusView &&
                      kidEquippableNames.length > 0 && (
                        <button
                          type="button"
                          onClick={() => safeToggleGroup(kidToRender)}
                          className={`h-7 px-3 rounded-lg glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${isKidEquipped
                            ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                            : "text-[var(--success)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)]"
                            }`}
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {isKidEquipped
                              ? t("icon_remove_circle_outline", "remove_circle_outline")
                              : t("icon_add_circle_outline", "add_circle_outline")}
                          </span>
                          <span>
                            {isKidEquipped
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
                        number={groupedKidModules.length}
                        colorClass="text-[var(--accent)]"
                        isActive={kidCollectionFilter === "all"}
                        onClick={() => setKidCollectionFilter("all")}
                      />
                      <DashboardStatTile
                        variant="filter"
                        className="!w-full"
                        icon={t("icon_check_circle", "check_circle")}
                        label={t("status_in_vault", "In {Vault}")}
                        number={kidInVaultCount}
                        colorClass="text-[var(--success)]"
                        isActive={kidCollectionFilter === "in_vault"}
                        onClick={() => setKidCollectionFilter("in_vault")}
                      />
                      <DashboardStatTile
                        variant="filter"
                        className="!w-full"
                        icon={t("icon_error", "error")}
                        label={t("status_missing", "Missing")}
                        number={kidMissingCount}
                        colorClass="text-[var(--danger)]"
                        isActive={kidCollectionFilter === "missing"}
                        onClick={() => setKidCollectionFilter("missing")}
                      />
                    </SidePanelFilterBar>

                    <div className="mb-3">
                      <ActionPill
                        searchQuery={kidSearchQuery}
                        setSearchQuery={setKidSearchQuery}
                        searchPlaceholder={t("search_ph", "Search {mods}...")}
                        primaryPopover={{
                          icon: t("icon_tune", "tune"),
                          label: t("filters", "Filters"),
                          content: (
                            <div className="flex flex-col w-[440px] p-4 max-w-[calc(100vw-40px)] text-left">
                              {!isNexusView && (
                                <DossierFilterSection
                                  t={t}
                                  title={t("blueprint", "{Blueprint}")}
                                  value={kidEquipFilter}
                                  onChange={(val: "ALL" | "EQUIPPED" | "UNEQUIPPED") =>
                                    setKidEquipFilter(val)
                                  }
                                  options={[
                                    { id: "ALL", label: t("filter_all", "All") },
                                    {
                                      id: "EQUIPPED",
                                      label: t("filter_in_blueprint", "In {Blueprint}"),
                                    },
                                    {
                                      id: "UNEQUIPPED",
                                      label: t("filter_not_equipped", "Not Equipped"),
                                    },
                                  ]}
                                />
                              )}
                              <DossierFilterSection
                                t={t}
                                title={t("filter_status", "Filter Status")}
                                value={kidStatusFilter}
                                onChange={(val: string) => setKidStatusFilter(val)}
                                options={[
                                  { id: "ALL", label: t("filter_all", "All") },
                                  { id: "stable", label: t("status_stable", "STABLE") },
                                  { id: "UNVERIFIED", label: t("unverified", "Unverified") },
                                  { id: "unstable", label: t("label_unstable", "Unstable") },
                                  { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                                ]}
                              />
                            </div>
                          ),
                        }}
                      />
                    </div>

                    {filteredKidModules.length === 0 ? (
                      <div className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-center">
                        {t("registry_no_mods", "No {Mods} Found")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredKidModules.map((kmGroup: any, kmIdx: number) => (
                          <DossierModuleCard
                            key={
                              kmGroup?.hash ||
                              kmGroup?.dbId ||
                              `${kmGroup?._groupedTitle}_${kmIdx}`
                            }
                            item={kmGroup}
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
                    )}
                  </UniversalGroup>
                )}
              </div>
            </SidePanel>
          );
        })()}

      <ModVersionHistorySidePanel
        groups={selectedVersionGroups}
        isOpen={selectedVersionGroups.length > 0}
        onClose={() => {
          setSelectedVersionGroupKeys([]);
          setActiveVersionModalGroups([]);
        }}
        onActivateVersion={handleActivateDossierVersion}
        onDeleteVersion={handleDeleteDossierVersion}
        onRefresh={() => loadDossierVersionPool(true)}
        runRadarSweep={() => window.dispatchEvent(new CustomEvent("runRadarSweep"))}
        setStatus={(msg: string) => useStore.getState().pushStatus(msg)}
        parentTitle={cleanArtifactTitle}
      />

      {showFlagModal && (
        <SidePanel
          isOpen={showFlagModal}
          onClose={() => setShowFlagModal(false)}
          title={t("flag_title", "Flag {Mod}")}
          subtitle={t("flag_desc", "Route {Mod} compliance or metadata issues for review.")}
          icon={t("icon_flag", "flag")}
          iconColorClass="text-[var(--warning)]"
          widthClass="w-[520px] max-w-[100vw]"
          backdropZ="z-[120008]"
          panelZ="z-[120009]"
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_flag", "flag")}
              overline={t("flag_title", "Flag {Mod}")}
              title={cleanArtifactTitle}
              description={t(
                "nexus_compliance_flag_desc",
                "Tier 1–5 compliance flags route directly to Oversight Compliance as Pending until verified by Oversight or Wayfinder staff."
              )}
              variant="warning"
            />

            <UniversalGroup
              title={t("compliance_tier", "Compliance Tier (Tier 1–5)")}
              icon={t("icon_policy", "policy")}
            >
              <div className="space-y-3">
                <CustomComplianceDropdown
                  value={Math.min(5, Math.max(1, Number(flagComplianceTier || 1)))}
                  onChange={(val) => setFlagComplianceTier(val)}
                  minTier={1}
                  maxTier={5}
                />
                <UniversalTextArea
                  label={t("reason", "Reason")}
                  value={flagReasonNotes}
                  onChange={(val) => setFlagReasonNotes(val)}
                  placeholder={t(
                    "placeholder_provide_specific_details_or_context",
                    "Provide specific details or context..."
                  )}
                  rows={3}
                />
                <ActionButton
                  variant="warning"
                  icon={t("icon_policy", "policy")}
                  label={
                    isSubmittingFlag
                      ? t("submitting", "Submitting...")
                      : t("submit_compliance_flag_btn", "Submit to Oversight Compliance")
                  }
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("compliance", flagComplianceTier)}
                  className="!w-full !h-11 !justify-center"
                />
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("metadata_and_security", "Metadata & Security")}
              icon={t("icon_edit_note", "edit_note")}
            >
              <div className="flex flex-col gap-2.5">
                <ActionButton
                  variant="glass"
                  icon={t("icon_history", "history")}
                  label={t("dossier_flag_outdated", "Outdated Information")}
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("Outdated Information")}
                  className="!w-full !h-11 !justify-start !px-4"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_edit_note", "edit_note")}
                  label={t("flag_inaccurate", "Inaccurate Information")}
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("Inaccurate Information")}
                  className="!w-full !h-11 !justify-start !px-4"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_gpp_bad", "gpp_bad")}
                  label={t("flag_malware", "Suspected Malware")}
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("Suspected Malware")}
                  className="!w-full !h-11 !justify-start !px-4 !text-[var(--danger)]"
                />
              </div>
            </UniversalGroup>
          </div>
        </SidePanel>
      )}

      {dossierAlertPending &&
        (() => {
          const isCascade = dossierAlertPending.mode === "yeet_cascade";
          const handleConfirmDossierAlert = () => {
            const cb = dossierAlertPending.onConfirm;
            setDossierAlertPending(null);
            cb?.();
          };

          const handleKeepBothDossierAlert = () => {
            const cb = dossierAlertPending.onKeepBoth;
            setDossierAlertPending(null);
            cb?.();
          };

          if (isCascade) {
            const casualties: string[] = Array.isArray(
              dossierAlertPending.casualties
            )
              ? dossierAlertPending.casualties
              : [];
            return (
              <SidePanel
                isOpen={true}
                onClose={() => setDossierAlertPending(null)}
                title={t("yeet_cascade_detected", "Cascade Removal Detected")}
                subtitle={t(
                  "yeet_removing_following",
                  "Removing the following dependent artifacts"
                )}
                icon={t("icon_warning_amber", "warning")}
                iconColorClass="text-[var(--danger)] animate-pulse"
                backdropZ="z-[125000]"
                panelZ="z-[125001]"
                widthClass="w-[90vw] md:w-[620px]"
                headerActions={
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={t("icon_delete", "delete")}
                      tooltip={t("yeet_btn_confirm", "Confirm Removal")}
                      variant="danger"
                      onClick={handleConfirmDossierAlert}
                    />
                  </PanelHeaderGroup>
                }
              >
                <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                  <SidePanelHeroCard
                    icon={t("icon_warning_amber", "warning")}
                    overline={t("protocol_override", "Protocol Override")}
                    title={t(
                      "yeet_cascade_detected",
                      "Cascade Removal Detected"
                    )}
                    description={t(
                      "yeet_removing_following",
                      "These dependent artifacts require the target module and will also be unequipped."
                    )}
                    badge={`${casualties.length} ${t("term_mods", "Items")}`}
                    badgeIcon={t("icon_delete", "delete")}
                    variant="danger"
                  >
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <ActionButton
                        variant="glass"
                        icon={t("icon_close", "close")}
                        label={t("cancel", "Cancel")}
                        onClick={() => setDossierAlertPending(null)}
                      />
                      <ActionButton
                        variant="danger"
                        icon={t("icon_delete", "delete")}
                        label={t("yeet_btn_confirm", "Confirm Removal")}
                        onClick={handleConfirmDossierAlert}
                      />
                    </div>
                  </SidePanelHeroCard>

                  <UniversalGroup
                    title={`${t("yeet_removing_following", "Affected Artifacts")} (${casualties.length})`}
                    icon={t("icon_delete", "delete")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {casualties.map((c: any, i: number) => (
                        <div
                          key={i}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_delete", "delete")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {String(c).replace(/_/g, " ")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                              {t("icon_link_off", "link_off")}
                            </span>
                            <span>{t("protocol_override", "Dependent")}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                </div>
              </SidePanel>
            );
          }

          const {
            targetLabel,
            isGameVersionMismatch,
            requiredGameVersion,
            missingPacks = [],
            missingDeps = [],
            brokenMods = [],
            flavorRivals = [],
            exclusiveSlotName = "",
            fatalConflicts = [],
            tier3Conflicts = [],
          } = dossierAlertPending;

          const swapSlotTitle = exclusiveSlotName
            ? `${t("highlander_exclusive_slot", "Exclusive Slot")}: ${exclusiveSlotName}`
            : t("flavor_swap", "Flavor Swap");

          const primaryTitle = isGameVersionMismatch
            ? t("unsupported_version", "Unsupported Game Version")
            : missingDeps.length > 0
              ? t("missing_artifacts", "Missing {Mods}")
              : missingPacks.length > 0
                ? t("missing_dlc", "Missing DLC")
                : brokenMods.length > 0
                  ? t("broken_artifacts", "Corrupted {Mods}")
                  : fatalConflicts.length > 0
                    ? t("fatal_conflict", "Severity 4 Collision")
                    : flavorRivals.length > 0
                      ? swapSlotTitle
                      : t("tier3_conflict", "Severity 3 Collision");

          const primaryIcon = isGameVersionMismatch
            ? t("icon_sports_esports", "sports_esports")
            : missingDeps.length > 0
              ? t("icon_extension", "extension")
              : missingPacks.length > 0
                ? t("icon_currency_exchange", "currency_exchange")
                : brokenMods.length > 0
                  ? t("icon_broken_image", "broken_image")
                  : fatalConflicts.length > 0
                    ? t("icon_crisis_alert", "crisis_alert")
                    : flavorRivals.length > 0
                      ? t("icon_swap_horiz", "swap_horiz")
                      : t("icon_tune", "tune");

          const primaryVariant: "danger" | "warning" | "accent" =
            isGameVersionMismatch ||
              missingDeps.length > 0 ||
              missingPacks.length > 0 ||
              brokenMods.length > 0 ||
              fatalConflicts.length > 0
              ? "danger"
              : flavorRivals.length > 0
                ? "accent"
                : "warning";

          const isSwapPrimary = primaryVariant === "accent" && flavorRivals.length > 0;
          const primaryConfirmLabel =
            flavorRivals.length > 0
              ? t("btn_swap_mods", "Swap {Mods}")
              : t("btn_equip", "Equip {Mod}");

          return (
            <SidePanel
              isOpen={true}
              onClose={() => setDossierAlertPending(null)}
              title={primaryTitle}
              subtitle={targetLabel || cleanArtifactTitle}
              icon={primaryIcon}
              iconColorClass={
                primaryVariant === "danger"
                  ? "text-[var(--danger)]"
                  : primaryVariant === "accent"
                    ? "text-[var(--accent)]"
                    : "text-[var(--warning)]"
              }
              backdropZ="z-[125000]"
              panelZ="z-[125001]"
              widthClass="w-[90vw] md:w-[620px]"
              headerActions={
                <PanelHeaderGroup>
                  <PanelHeaderButton
                    icon={
                      isSwapPrimary
                        ? t("icon_swap_horiz", "swap_horiz")
                        : t("icon_check", "check")
                    }
                    tooltip={primaryConfirmLabel}
                    variant={
                      primaryVariant === "danger"
                        ? "danger"
                        : primaryVariant === "accent"
                          ? "accent"
                          : "warning"
                    }
                    onClick={handleConfirmDossierAlert}
                  />
                </PanelHeaderGroup>
              }
            >
              <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                <SidePanelHeroCard
                  icon={primaryIcon}
                  overline={
                    isSwapPrimary
                      ? t("highlander_exclusive_slot", "Exclusive Slot")
                      : t("protocol_override", "Protocol Override")
                  }
                  title={primaryTitle}
                  description={
                    isSwapPrimary
                      ? t(
                        "highlander_swap_prompt_desc",
                        "Another {mod} in this exclusive slot is already equipped. Swap to replace it cleanly, or keep both equipped and track the overlap in Conflict Radar."
                      )
                      : targetLabel || cleanArtifactTitle
                  }
                  badge={
                    exclusiveSlotName
                      ? exclusiveSlotName
                      : selectedVersion
                        ? `${t("label_game_version", "Game Version")}: ${selectedVersion}`
                        : undefined
                  }
                  badgeIcon={
                    exclusiveSlotName
                      ? t("icon_swap_horiz", "swap_horiz")
                      : t("icon_sports_esports", "sports_esports")
                  }
                  variant={primaryVariant}
                >
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_close", "close")}
                      label={t("cancel", "Cancel")}
                      onClick={() => setDossierAlertPending(null)}
                    />
                    {flavorRivals.length > 0 && dossierAlertPending.onKeepBoth && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_layers", "layers")}
                        label={t("btn_keep_both", "Keep Both")}
                        onClick={handleKeepBothDossierAlert}
                      />
                    )}
                    <ActionButton
                      variant={
                        primaryVariant === "danger"
                          ? "danger"
                          : primaryVariant === "accent"
                            ? "accent"
                            : "warning"
                      }
                      icon={
                        flavorRivals.length > 0
                          ? t("icon_swap_horiz", "swap_horiz")
                          : t("icon_add_circle_outline", "add_circle_outline")
                      }
                      label={primaryConfirmLabel}
                      onClick={handleConfirmDossierAlert}
                    />
                  </div>
                </SidePanelHeroCard>

                {isGameVersionMismatch && (
                  <UniversalGroup
                    title={t("unsupported_version", "Unsupported Game Version")}
                    icon={t("icon_sports_esports", "sports_esports")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <StatBox
                        label={t("required_version", "Required Game Version")}
                        value={requiredGameVersion || familyVersion}
                        icon={t("icon_sports_esports", "sports_esports")}
                        iconColorClass="text-[var(--danger)]"
                      />
                      <StatBox
                        label={t("label_game_version", "Game Version")}
                        value={selectedVersion || t("unknown", "Unknown")}
                        icon={t("icon_verified", "verified")}
                        iconColorClass="text-[var(--accent)]"
                      />
                    </div>
                  </UniversalGroup>
                )}

                {missingPacks.length > 0 && (
                  <UniversalGroup
                    title={`${t("missing_dlc", "Missing DLC")} (${missingPacks.length})`}
                    icon={t("icon_currency_exchange", "currency_exchange")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {missingPacks.map((p: string) => (
                        <div
                          key={p}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_currency_exchange", "currency_exchange")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {mapDlcCode(p)}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {p.split(" ")[0].toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {missingDeps.length > 0 && (
                  <UniversalGroup
                    title={`${t("missing_artifacts", "Missing {Mods}")} (${missingDeps.length})`}
                    icon={t("icon_extension", "extension")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {missingDeps.map((dep: any, idx: number) => {
                        const depTitle =
                          dep?._groupedTitle ||
                          dep?.displayName ||
                          dep?.name ||
                          String(dep?.id || dep || "");
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setDossierAlertPending(null);
                              handleInspectKid(dep);
                            }}
                            className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-between gap-3 cursor-pointer transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-[15px]">
                                  {t("icon_extension", "extension")}
                                </span>
                              </div>
                              <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                                {formatDisplayName(depTitle)}
                              </span>
                            </div>
                            <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                                {t("icon_error", "error")}
                              </span>
                              <span>{t("status_missing", "Missing")}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </UniversalGroup>
                )}

                {brokenMods.length > 0 && (
                  <UniversalGroup
                    title={`${t("broken_artifacts", "Corrupted {Mods}")} (${brokenMods.length})`}
                    icon={t("icon_broken_image", "broken_image")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {brokenMods.map((bm: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_broken_image", "broken_image")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(bm.displayName || bm.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("status_corrupted", "Corrupted")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {flavorRivals.length > 0 && (
                  <UniversalGroup
                    title={`${swapSlotTitle} (${flavorRivals.length})`}
                    icon={t("icon_swap_horiz", "swap_horiz")}
                    headerColorClass="text-[var(--accent)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {flavorRivals.map((rv: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_swap_horiz", "swap_horiz")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(rv._displayTitle || rv.displayName || rv.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("flavor_replaced", "Will Replace")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {fatalConflicts.length > 0 && (
                  <UniversalGroup
                    title={`${t("fatal_conflict", "Severity 4 Collision")} (${fatalConflicts.length})`}
                    icon={t("icon_crisis_alert", "crisis_alert")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {fatalConflicts.map((fc: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_crisis_alert", "crisis_alert")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(fc.displayName || fc.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("artifact_removed", "Will {Remove}")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {tier3Conflicts.length > 0 && (
                  <UniversalGroup
                    title={`${t("tier3_conflict", "Severity 3 Collision")} (${tier3Conflicts.length})`}
                    icon={t("icon_tune", "tune")}
                    headerColorClass="text-[var(--warning)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {tier3Conflicts.map((tc: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--warning)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_tune", "tune")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(tc.displayName || tc.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("tier3_conflict", "Severity 3 Collision")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}
              </div>
            </SidePanel>
          );
        })()}
    </>
  );
}
