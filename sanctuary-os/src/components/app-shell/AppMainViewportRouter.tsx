import { openUrl } from "@tauri-apps/plugin-opener";
import React, { Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "../../ErrorBoundary";
import { AppModals } from "../../AppModals";
import { useModalStore } from "../../store/modalStore";
import { useStore } from "../../store";
import {
  SidePanel,
  getExtensionRegex,
  PixelSnapper,
} from "../../shared";
import { isDesktop, isLinuxDesktop } from "../../utils/envUtils";
import { isRootDomain } from "../../utils/routingUtils";
import { MobileBottomNav } from "../../MobileBottomNav";
import { NexusUpdatesChecker } from "../../shared-components/NexusUpdatesChecker";
import CommandCenter from "../../views/CommandCenter";
import { DevBuildClearanceGate } from "../DevBuildClearanceGate";
import { ElevatedPasskeyGate, CompanionPasskeyHandshakeApprover } from "../ElevatedPasskeyGate";
import { getCitizenSecurityPolicy } from "../../utils/passkeyUtils";
import Vault from "../../views/Vault";
import { GlobalCommandPalette } from '../../side-panels/GlobalCommandPalette';
import { createPortal } from "react-dom";
import { ContextMenu } from "../../shared-components/ContextMenu";
import { GlobalTooltip } from "../../shared-components/GlobalTooltip";
import { useTooltipStore } from "../../store/tooltipStore";
import { getStaticNoiseDataUrl } from "../../utils/noiseTexture";
import { lazyWithRetry } from "../../utils/lazyWithRetry";

const ArchitectHub = lazyWithRetry(() => import("../../views/ArchitectHub"));
const GlobalFeed = lazyWithRetry(() => import("../../views/GlobalFeed"));
const Settings = lazyWithRetry(() => import("../../views/SettingsTab"));
const ModDossier = lazyWithRetry(() => import("../../side-panels/ModDossier"));
const BlueprintArchitect = lazyWithRetry(() => import("../../views/BlueprintArchitect"));
const Nexus = lazyWithRetry(() => import("../../views/Nexus"));
const ArtifactScout = lazyWithRetry(() => import("../../views/ArtifactScout").then((m) => ({ default: m.ArtifactScout })));
const WebLandingPage = lazyWithRetry(() => import("../../views/WebLandingPage"));
const WorkspaceFirstTimeSetup = lazyWithRetry(() => import("../WorkspaceFirstTimeSetup"));
const NotificationSidebar = lazyWithRetry(() => import("../../side-panels/NotificationSidebar"));
const CitizenTicketsSidePanel = lazyWithRetry(() => import("../../side-panels/CitizenTicketsSidePanel"));
const MasonHub = lazyWithRetry(() => import("../../views/MasonHub"));
const MasonProfile = lazyWithRetry(() => import("../../views/MasonProfile"));
const MasonPostViewer = lazyWithRetry(() => import("../../side-panels/MasonPostViewer"));
const SupportHub = lazyWithRetry(() => import("../../views/SupportHub"));
const Blueprints = lazyWithRetry(() => import("../../views/Blueprints"));
const StagingPayloadEditor = lazyWithRetry(() => import("../StagingPayloadEditor"));
const Lab = lazyWithRetry(() => import("../../views/Lab"));
const TimeCapsule = lazyWithRetry(() => import("../../views/TimeCapsule"));
const Oversight = lazyWithRetry(() => import("../../views/Oversight"));
const WayfinderHub = lazyWithRetry(() => import("../../views/WayfinderHub"));
const KeepersCore = lazyWithRetry(() => import("../../views/KeepersCore"));
const UpdateSidePanel = lazyWithRetry(() => import("../../side-panels/UpdateSidePanel").then((m) => ({ default: m.UpdateSidePanel })));
const NexusUpdatesSidePanel = lazyWithRetry(() => import("../../side-panels/NexusUpdatesSidePanel").then((m) => ({ default: m.NexusUpdatesSidePanel })));
const SupporterCelebrationSidePanel = lazyWithRetry(() => import("../../side-panels/SupporterCelebrationSidePanel").then((m) => ({ default: m.SupporterCelebrationSidePanel })));
const CitizensWorkbench = lazyWithRetry(() => import("../../views/CitizensWorkbench"));

export function AppMainViewportRouter({
  currentTheme,
  t,
  activeWorkspaceId,
  triggerPrePatchSnapshot,
  triggerFullEngineBackup,
  restoreGameBackup,
  fetchBackups,
  deleteBackup,
  subtitleIndex,
  getBackupSignature,
  backupProgress,
  userRole,
  osRole,
  setMetaAllowWriteInput,
  metaAllowWriteInput,
  playSets,
  setPlaySets,
  activeSetName,
  setActiveSetName,
  statusLog,
  setStatus,
  clearStatusLog,
  session,
  modList,
  activeGameSchema,
  runRadarSweep,
  malwareAlert,
  setMalwareAlert,
  handleDroppedFiles,
  view,
  setView,
  isConfigured,
  isWorkspaceSetupOverlayOpen,
  modsPath,
  vaultPath,
  quarantineList,
  shelterContents,
  shelterActive,
  backupList,
  isNotificationSidebarOpen,
  setIsNotificationSidebarOpen,
  setGlobalViewingPost,
  globalViewingPost,
  unreadNotificationCount,
  setActiveDossier,
  activeDossier,
  labQueue,
  activeLabMod,
  setActiveLabMod,
  activeSandboxMod,
  setActiveSandboxMod,
  testErrorFound,
  testLogSnippet,
  isSubmittingReport,
  labSearchQuery,
  setLabSearchQuery,
  labVerificationQueue,
  setEditMode,
  editMode,
  configContent,
  setConfigContent,
  activePlaySetIndex,
  setActivePlaySetIndex,
  setIsEditingMeta,
  isEditingMeta,
  setIsCorrectingMeta,
  isCorrectingMeta,
  setMetaNameInput,
  metaNameInput,
  setMetaAuthorInput,
  metaAuthorInput,
  setMetaUrlInput,
  metaUrlInput,
  setMetaImageInput,
  metaImageInput,
  setMetaDescInput,
  metaDescInput,
  metaStatusMsgInput,
  setMetaStatusMsgInput,
  metaStatusInput,
  setMetaStatusInput,
  setMetaVersionInput,
  metaVersionInput,
  metaManifestUrlInput,
  setMetaManifestUrlInput,
  metaIsPaidInput,
  setMetaIsPaidInput,
  metaIsEarlyAccessInput,
  setMetaIsEarlyAccessInput,
  globalSearchQuery,
  setGlobalSearchQuery,
  cloudSearchResults,
  isSearchingCloud,
  isDraftingSet,
  setIsDraftingSet,
  draftSetName,
  setDraftSetName,
  isSidebarCollapsed,
  setIsCitizenTicketsOpen,
  isCitizenTicketsOpen,
  selectedVersion,
  setSelectedVersion,
  ownedDLC,
  maskedDLC,
  metaRequiredDLC,
  setMetaRequiredDLC,
  setDrawerConfirmHash,
  drawerConfirmHash,
  associatedMods,
  saveLocalMetadata,
  resetLocalMetadata,
  setConflictTarget,
  conflictTarget,
  isLoadingAssociated,
  labConflicts,
  setLabConflicts,
  activeMasonProfileId,
  activeMasonPostId,
  isMasonProfilePanelOpen,
  setIsMasonProfilePanelOpen,
  networkUpdates,
  massIngestToCloud,
  syncBlueprintByCode,
  uploadBlueprintToCloud,
  snapshotModal,
  setSnapshotModal,
  snapshotName,
  setSnapshotName,
  bulkModal,
  setBulkModal,
  bulkName,
  setBulkName,
  isBulkMode,
  setIsBulkMode,
  selectedMods,
  setSelectedMods,
  renameModal,
  setRenameModal,
  renameTarget,
  setRenameTarget,
  nameInput,
  setNameInput,
  localFolderModal,
  setLocalFolderModal,
  localFolderType,
  setLocalFolderType,
  localFolderName,
  setLocalFolderName,
  missingImportMods,
  setMissingImportMods,
  pendingImportSet,
  setPendingImportSet,
  syncCode,
  setSyncCode,
  confirmDialog,
  setConfirmDialog,
  isDropzoneOpen,
  setIsDropzoneOpen,
  isDragging,
  setIsDragging,
  dropzoneState,
  setDropzoneState,
  droppedFiles,
  setDroppedFiles,
  showBrokenModal,
  setShowBrokenModal,
  showQuarantineModal,
  setShowQuarantineModal,
  isBackingUp,
  isRestoring,
  ingestProgress,
  isScanning,
  showDefconAlert,
  setShowDefconAlert,
  yeetConfirmPending,
  setYeetConfirmPending,
  dnaMatchQueue,
  setDnaMatchQueue,
  edgeOverrideQueue,
  setEdgeOverrideQueue,
  scoutQueue,
  setScoutQueue,
  isUpdatePanelOpen,
  isNexusUpdatesPanelOpen,
  isSupportPanelOpen,
  createLocalFolder,
  executeBulkDraft,
  executeSnapshot,
  exportPlaySet,
  executeRename,
  confirmRename,
  ignoredHashesRef,
  anarchyRules,
  setAnarchyRules,
  masonProfileAboveDossier,
  setMasonProfileAboveDossier,
  handleOpenMasonProfile,
  toggleInActiveSet,
  equipPlaySet,
  renamePlaySet,
  deletePlaySet,
  importPlaySet,
  finalizeImport,
  triggerShelter,
  restoreMod,
  purgeMod,
  handleSmartSearch,
  registerConflict,
  designateTwin,
  searchGlobalNetwork,
  establishBond,
  sendToLabQueue,
  finalizeDraftSet,
  displayModList,
  handleQuickLaunch,
  executeHotSwap,
  openWorkbench,
  saveWorkbenchChanges,
  submitLabReport,
  concludeTest,
  runLabSimulation,
  runProvingRun,
  searchQuery,
  setSearchQuery,
  setFilterStatus,
  filterStatus,
  equipFilter,
  setEquipFilter,
  activeCategory,
  setActiveCategory,
  activeSubType,
  setActiveSubType,
  exclusiveSlotFilter,
  setExclusiveSlotFilter,
  expandedFolder,
  setExpandedFolder,
  visibleMods,
  isGlobalConfigLoaded,
}: any) {
  React.useEffect(() => {
    if (!isDesktop() || !isGlobalConfigLoaded) return;
    const warm = () => {
      void import("../../views/Blueprints");
      void import("../../views/SettingsTab");
    };
    const w = window as any;
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(warm, { timeout: 1200 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(warm, 800);
    return () => window.clearTimeout(timer);
  }, [isGlobalConfigLoaded]);

  return (
    <>
          <main
            id="sanctuary-main-scroll"
            className={`flex-1 min-h-0 relative z-10 overflow-y-auto overflow-x-hidden px-6 pb-6 ${
              isDesktop()
                ? "pt-[68px]"
                : "max-md:overflow-visible md:pt-[68px] max-md:px-4 max-md:pt-[calc(env(safe-area-inset-top,0px)+4.25rem)] max-md:pb-[calc(env(safe-area-inset-bottom,0px)+100px)]"
            } custom-scrollbar`}
            style={{
              flexGrow: 1,
              width: "100%",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
            }}
          >
            <div className="relative z-10 w-full min-h-full pb-[100px] max-md:pb-[40px]">
              {isGlobalConfigLoaded && (
                <Suspense
                  fallback={
                    <div className="p-6 md:p-10">
                      <div className="glass-panel rounded-3xl p-6 border border-[var(--border)] flex items-center gap-4">
                        <span className="material-symbols-outlined animate-spin text-[22px] text-[var(--accent)]">
                          {t("icon_progress_activity", "progress_activity")}
                        </span>
                        <span className="text-sm font-black uppercase tracking-widest text-[var(--text)]">
                          {t("loading", "Loading...")}
                        </span>
                      </div>
                    </div>
                  }
                >
                  {(view === "landing" || (((!isConfigured && !isWorkspaceSetupOverlayOpen) || (!isDesktop() && isRootDomain())) && view !== "settings" && view !== "KeepersCore")) ? (
                    <WebLandingPage />
                  ) : (
                    <ElevatedPasskeyGate
                      requirePasskey={Boolean(
                        session?.user?.id &&
                          getCitizenSecurityPolicy(session).enforceSessionLock &&
                          !["ArchitectHub", "Oversight", "WayfinderHub", "KeepersCore"].includes(view)
                      )}
                      roleLabelKey="auth_citizen_lockdown_role_label"
                      roleLabelFallback="{Citizen} Account Lockdown"
                    >
                      {view === "dashboard" && (
                        <div style={{ width: '100%', height: '100%' }}>
                          <ErrorBoundary moduleName="Command Center">
                            <CommandCenter
                              key={activeWorkspaceId || 'no-workspace'}
                              isScanning={isScanning}
                              runRadarSweep={runRadarSweep}
                              modList={modList}
                              quarantineList={quarantineList}
                              isConfigured={isConfigured}
                              modsPath={modsPath}
                              vaultPath={vaultPath}
                              triggerShelter={triggerShelter}
                              shelterActive={shelterActive}
                              shelterContents={shelterContents}
                              setShowQuarantineModal={setShowQuarantineModal}
                              setShowBrokenModal={setShowBrokenModal}
                              handleOpenMasonProfile={handleOpenMasonProfile}
                              massIngestToCloud={massIngestToCloud}
                              networkUpdates={networkUpdates}
                              toggleInActiveSet={toggleInActiveSet}
                              setView={setView}
                              setFilterStatus={setFilterStatus}
                              setIsSupportDeskOpen={() => useModalStore.getState().setIsSupportPanelOpen(true)}
                              setIsCitizenTicketsOpen={setIsCitizenTicketsOpen}
                              equipPlaySet={equipPlaySet}
                              onOpenDossier={setActiveDossier}
                            />
                          </ErrorBoundary>
                        </div>
                      )}

                      {view === "nexus" && (
                        <Nexus
                          key={activeWorkspaceId || 'no-workspace'}
                          ownedHashes={modList.map((m: any) => m.hash).filter((h: any) => !!h)}
                          onSetStatus={setStatus}
                          onOpenMasonProfile={handleOpenMasonProfile}
                          onOpenDossier={setActiveDossier}
                          syncBlueprintByCode={syncBlueprintByCode}
                        />
                      )}
                      {view === "vault" && (
                        <ErrorBoundary moduleName="Vault">
                          <Vault
                            setView={setView}
                            isScanning={isScanning}
                            isBulkMode={isBulkMode} setIsBulkMode={setIsBulkMode}
                            selectedMods={selectedMods} setSelectedMods={setSelectedMods}
                            setConfirmDialog={setConfirmDialog} setStatus={setStatus}
                            runRadarSweep={runRadarSweep} setIsDropzoneOpen={setIsDropzoneOpen}
                            setLocalFolderModal={setLocalFolderModal} playSets={playSets} setPlaySets={setPlaySets}
                            equipFilter={equipFilter} setEquipFilter={setEquipFilter}
                            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                            activeCategory={activeCategory} setActiveCategory={setActiveCategory}
                            activeSubType={activeSubType} setActiveSubType={setActiveSubType}
                            exclusiveSlotFilter={exclusiveSlotFilter} setExclusiveSlotFilter={setExclusiveSlotFilter}
                            visibleMods={visibleMods} displayModList={displayModList}
                            activePlaySetIndex={activePlaySetIndex}
                            setActivePlaySetIndex={setActivePlaySetIndex}
                            toggleInActiveSet={toggleInActiveSet}
                            openUrl={openUrl} setLocalFolderName={setLocalFolderName} setLocalFolderType={setLocalFolderType}
                            executeHotSwap={executeHotSwap} equipPlaySet={equipPlaySet} setMetaNameInput={setMetaNameInput} setMetaAuthorInput={setMetaAuthorInput}
                            setMetaVersionInput={setMetaVersionInput} setMetaUrlInput={setMetaUrlInput} setActiveDossier={setActiveDossier} setDrawerConfirmHash={setDrawerConfirmHash}
                            quarantineList={quarantineList} restoreMod={restoreMod} purgeMod={purgeMod}
                            ownedDLC={ownedDLC} maskedDLC={maskedDLC} setMetaDescInput={setMetaDescInput}
                            setMetaImageInput={setMetaImageInput} setMetaAllowWriteInput={setMetaAllowWriteInput}
                            expandedFolder={expandedFolder} setExpandedFolder={setExpandedFolder}
                            drawerConfirmHash={drawerConfirmHash} modList={modList} anarchyRules={anarchyRules}
                            setBulkModal={setBulkModal}
                          />
                        </ErrorBoundary>
                      )}
                      {view === "playsets" && (
                        <ErrorBoundary moduleName="Blueprints">
                          {isDesktop() ? (
                            <Blueprints
                              playSets={playSets}
                              setPlaySets={setPlaySets}
                              activeSetName={activeSetName}
                              setActiveSetName={setActiveSetName}
                              equipPlaySet={equipPlaySet}
                              isDraftingSet={isDraftingSet}
                              setIsDraftingSet={setIsDraftingSet}
                              draftSetName={draftSetName}
                              setDraftSetName={setDraftSetName}
                              finalizeDraftSet={finalizeDraftSet}
                              renamePlaySet={renamePlaySet}
                              deletePlaySet={deletePlaySet}
                              exportPlaySet={exportPlaySet}
                              importPlaySet={importPlaySet}
                              uploadBlueprintToCloud={uploadBlueprintToCloud}
                              syncBlueprintByCode={syncBlueprintByCode}
                              setView={setView}
                              setSnapshotModal={setSnapshotModal}
                              globalSearchQuery={globalSearchQuery}
                              setGlobalSearchQuery={setGlobalSearchQuery}
                              isSearchingCloud={isSearchingCloud}
                              searchGlobalNetwork={searchGlobalNetwork}
                              cloudSearchResults={cloudSearchResults}
                              syncCode={syncCode}
                              setSyncCode={setSyncCode}
                              modList={modList}
                              activePlaySetIndex={activePlaySetIndex}
                              setActivePlaySetIndex={setActivePlaySetIndex}
                              toggleInActiveSet={toggleInActiveSet}
                            />
                          ) : (
                            <StagingPayloadEditor
                              onSetStatus={setStatus}
                              onOpenDossier={setActiveDossier}
                              onBrowseMods={() => {
                                setView("nexus");
                                useStore.getState().setMarketTab("MODS");
                              }}
                              onBrowseBlueprints={() => {
                                setView("nexus");
                                useStore.getState().setMarketTab("BLUEPRINTS");
                              }}
                            />
                          )}
                        </ErrorBoundary>
                      )}
                      {view === "GlobalFeed" && (
                        <ErrorBoundary moduleName="Global Feed">
                          <GlobalFeed
                            key={activeWorkspaceId || 'no-workspace'}
                            onOpenMasonProfile={handleOpenMasonProfile}
                          />
                        </ErrorBoundary>
                      )}

                      {view === "BlueprintArchitect" && playSets[activePlaySetIndex] && (
                        <ErrorBoundary moduleName="Blueprint Architect">
                          <BlueprintArchitect
                            isOpen={true}
                            onClose={() => setView("dashboard")}
                            playSet={playSets[activePlaySetIndex]}
                            modList={modList}
                            toggleInActiveSet={toggleInActiveSet}
                            globalSearchQuery={globalSearchQuery}
                            setGlobalSearchQuery={setGlobalSearchQuery}
                            onSearchNetwork={searchGlobalNetwork}
                            cloudResults={cloudSearchResults}
                            isSearching={isSearchingCloud}
                            allow_write={true}
                            onCloudUpload={uploadBlueprintToCloud}
                            vaultPath={vaultPath}
                            onRefreshMods={runRadarSweep}
                            displayModList={displayModList}
                          />
                        </ErrorBoundary>
                      )}
                      {view === "lab" && (
                        <ErrorBoundary moduleName="Homestead Lab">
                          <Lab
                            onOpenDossier={setActiveDossier}
                            executeHotSwap={runProvingRun}
                            shelterActive={shelterActive}
                            labSearchQuery={labSearchQuery}
                            setLabSearchQuery={setLabSearchQuery}
                            labVerificationQueue={labVerificationQueue}
                            labQueue={labQueue}
                            activeLabMod={activeLabMod}
                            setActiveLabMod={setActiveLabMod}
                            testErrorFound={testErrorFound}
                            testLogSnippet={testLogSnippet}
                            isSubmittingReport={isSubmittingReport}
                            submitLabReport={submitLabReport}
                            concludeTest={concludeTest}
                            openWorkbench={openWorkbench}
                            userRole={userRole}
                            modList={modList}
                            setConflictTarget={setConflictTarget}
                            conflictTarget={conflictTarget}
                            runLabSimulation={runLabSimulation}
                            isLoadingAssociated={isLoadingAssociated}
                            associatedMods={associatedMods}
                            runProvingRun={runProvingRun}
                            labConflicts={labConflicts}
                            setLabConflicts={setLabConflicts}
                          />
                        </ErrorBoundary>
                      )}
                      {view === "backups" && (
                        <TimeCapsule
                          selectedVersion={selectedVersion}
                          setSelectedVersion={setSelectedVersion}
                          triggerPrePatchSnapshot={triggerPrePatchSnapshot}
                          isBackingUp={isBackingUp}
                          backupProgress={backupProgress}
                          triggerFullEngineBackup={triggerFullEngineBackup}
                          backupList={backupList}
                          getBackupSignature={getBackupSignature}
                          restoreGameBackup={restoreGameBackup}
                          renameGameBackup={async (oldName: string, newName: string) => {
                            try {
                              await invoke("rename_backup", { oldName, newName });
                              fetchBackups();
                            } catch (err) {
                              alert(err);
                            }
                          }}
                          deleteBackup={deleteBackup}
                        />
                      )}
                      {view === "MasonHub" &&
                        !!session && <MasonHub key={activeWorkspaceId || 'no-workspace'} sandboxMod={activeSandboxMod} clearSandboxMod={() => setActiveSandboxMod(null)} vaultPath={vaultPath} handleOpenMasonProfile={handleOpenMasonProfile} />}
                      {view === "ArchitectHub" &&
                        ["architect", "oversight", "wayfinder", "admin"].includes(
                          userRole,
                        ) && (
                          <ErrorBoundary moduleName="Architect Hub">
                            <ElevatedPasskeyGate requirePasskey={true} roleLabelKey="passkey_gate_role_architect" roleLabelFallback="Architect">
                              <ArchitectHub key={activeWorkspaceId || 'no-workspace'} userRole={userRole} equipPlaySet={equipPlaySet} modList={modList} setStatus={setStatus} onOpenDossier={setActiveDossier} onOpenMasonProfile={handleOpenMasonProfile} />
                            </ElevatedPasskeyGate>
                          </ErrorBoundary>
                        )}
                      {view === "Oversight" &&
                        ["oversight", "wayfinder", "admin"].includes(userRole) && (
                          <ErrorBoundary moduleName="Oversight">
                            <ElevatedPasskeyGate requirePasskey={true} roleLabelKey="passkey_gate_role_oversight" roleLabelFallback="Oversight">
                              <Oversight key={activeWorkspaceId || 'no-workspace'} />
                            </ElevatedPasskeyGate>
                          </ErrorBoundary>
                        )}
                      {view === "WayfinderHub" &&
                        ["wayfinder", "admin"].includes(userRole) && (
                          <ErrorBoundary moduleName="Wayfinder Hub">
                            <ElevatedPasskeyGate requirePasskey={true} roleLabelKey="passkey_gate_role_wayfinder" roleLabelFallback="Wayfinder">
                              <WayfinderHub key={activeWorkspaceId || 'no-workspace'} onOpenMasonProfile={handleOpenMasonProfile} />
                            </ElevatedPasskeyGate>
                          </ErrorBoundary>
                        )}
                      {view === "KeepersCore" &&
                        ["core_dev", "admin", "keeper"].includes(osRole) && (
                          <ErrorBoundary moduleName="Keepers Core">
                            <ElevatedPasskeyGate requirePasskey={true} roleLabelKey="passkey_gate_role_keeper" roleLabelFallback="Keeper">
                              <KeepersCore />
                            </ElevatedPasskeyGate>
                          </ErrorBoundary>
                        )}
                      {view === "ArtifactScout" && <ArtifactScout key={activeWorkspaceId || 'no-workspace'} />}
                      {view === "CitizensWorkbench" && <CitizensWorkbench key={activeWorkspaceId || 'no-workspace'} onOpenMasonProfile={handleOpenMasonProfile} />}
                      {view === "settings" && (
                        <ErrorBoundary moduleName="Settings">
                          <Settings
                            anarchyRules={anarchyRules}
                            setAnarchyRules={setAnarchyRules}
                          />
                        </ErrorBoundary>
                      )}
                      {view === "MasonProfile" && activeMasonProfileId && (
                        <ErrorBoundary moduleName="Mason Profile">
                          <MasonProfile
                            masonId={activeMasonProfileId}
                            initialPostId={activeMasonPostId}
                            onModClick={(mod: any) => setActiveDossier(mod)}
                          />
                        </ErrorBoundary>
                      )}
                    </ElevatedPasskeyGate>
                  )}
                </Suspense>
              )}
            </div>
          </main>
          {isMasonProfilePanelOpen && activeMasonProfileId && (
            <ErrorBoundary moduleName="Mason Profile SidePanel">
              <Suspense fallback={null}>
                <MasonProfile
                  isSidePanel={true}
                  isOpen={isMasonProfilePanelOpen}
                  onClose={() => setIsMasonProfilePanelOpen(false)}
                  onOpenFullProfile={() => {
                    setIsMasonProfilePanelOpen(false);
                    setView("MasonProfile");
                  }}
                  backdropZ={masonProfileAboveDossier ? "z-[121000]" : "z-[118000]"}
                  panelZ={masonProfileAboveDossier ? "z-[121001]" : "z-[118001]"}
                  masonId={activeMasonProfileId}
                  initialPostId={activeMasonPostId}
                  onModClick={(mod: any) => {
                    setMasonProfileAboveDossier(false);
                    setActiveDossier(mod);
                  }}
                  syncBlueprintByCode={syncBlueprintByCode}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeDossier && (
            <ErrorBoundary moduleName="ModDossier">
              <Suspense fallback={null}>
                <ModDossier
                mod={activeDossier}
                modList={modList}
                ownedDLC={ownedDLC}
                maskedDLC={maskedDLC}
                activePlaySet={playSets[activePlaySetIndex]}
                onToggleInActiveSet={toggleInActiveSet}
                onShowYeetAlert={(casualties: string[], onConfirm: () => void) =>
                  setYeetConfirmPending({ casualties, onConfirm })
                }
                onClose={() => {
                  setActiveDossier(null);
                  setEditMode(false);
                  setIsEditingMeta(false);
                  setIsCorrectingMeta(false);
                }}
                isEditingMeta={isEditingMeta}
                setIsEditingMeta={setIsEditingMeta}
                isCorrecting={isCorrectingMeta}
                setIsCorrecting={setIsCorrectingMeta}
                editMode={editMode}
                setEditMode={setEditMode}
                configContent={configContent}
                setConfigContent={setConfigContent}
                metaInputs={{
                  name: metaNameInput,
                  author: metaAuthorInput,
                  url: metaUrlInput,
                  manifest_url: metaManifestUrlInput,
                  image: metaImageInput,
                  desc: metaDescInput,
                  statusMsg: metaStatusMsgInput,
                  status: metaStatusInput,
                  version: metaVersionInput,
                  requiredDLC: metaRequiredDLC,
                  allow_write: metaAllowWriteInput,
                  is_paid: metaIsPaidInput,
                  is_early_access: metaIsEarlyAccessInput,
                }}
                setMetaInputs={{
                  name: setMetaNameInput,
                  author: setMetaAuthorInput,
                  url: setMetaUrlInput,
                  manifest_url: setMetaManifestUrlInput,
                  image: setMetaImageInput,
                  desc: setMetaDescInput,
                  statusMsg: setMetaStatusMsgInput,
                  status: setMetaStatusInput,
                  version: setMetaVersionInput,
                  requiredDLC: setMetaRequiredDLC,
                  allow_write: setMetaAllowWriteInput,
                  is_paid: setMetaIsPaidInput,
                  is_early_access: setMetaIsEarlyAccessInput,
                }}
                onSendToLab={sendToLabQueue}
                onSyncToNetwork={(mod: any) => {
                  setActiveDossier(null);
                  setActiveSandboxMod(mod);
                  setView("MasonHub");
                }}
                onDesignateTwin={designateTwin}
                onEstablishBond={establishBond}
                onRegisterConflict={registerConflict}
                onSmartSearch={handleSmartSearch}
                onOpenWorkbench={openWorkbench}
                onSaveWorkbench={saveWorkbenchChanges}
                onSaveMetadata={saveLocalMetadata}
                onResetMetadata={resetLocalMetadata}
                onOpenMasonProfile={handleOpenMasonProfile}
                onSecureShred={async (filename: string) => {
                  try {
                    await invoke("purge_quarantined_file", {
                      filename: filename.split("/").pop() || filename,
                    });
                    setStatus(`${t("icon_check_circle", "check_circle")} ${t("status_file_shredded", "File deleted securely.")}`);
                    runRadarSweep();
                  } catch (err: any) {
                    setStatus(` Error: ${err}`);
                  }
                }}
              />
              </Suspense>
            </ErrorBoundary>
          )}
          <AppModals
            isSidebarCollapsed={isSidebarCollapsed}
            isNotificationSidebarOpen={isNotificationSidebarOpen}
            setIsNotificationSidebarOpen={setIsNotificationSidebarOpen}
            unreadNotificationCount={unreadNotificationCount}
            malwareAlert={malwareAlert}
            setMalwareAlert={setMalwareAlert}
            snapshotModal={snapshotModal}
            setSnapshotModal={setSnapshotModal}
            snapshotName={snapshotName}
            setSnapshotName={setSnapshotName}
            executeSnapshot={executeSnapshot}
            playSets={playSets}
            activePlaySetIndex={activePlaySetIndex}
            toggleInActiveSet={toggleInActiveSet}
            bulkModal={bulkModal}
            setBulkModal={setBulkModal}
            bulkName={bulkName}
            setBulkName={setBulkName}
            executeBulkDraft={executeBulkDraft}
            selectedMods={selectedMods}
            renameModal={renameModal}
            setRenameModal={setRenameModal}
            executeRename={executeRename}
            renameTarget={renameTarget}
            setRenameTarget={setRenameTarget}
            nameInput={nameInput}
            setNameInput={setNameInput}
            confirmRename={confirmRename}
            localFolderModal={localFolderModal}
            equipPlaySet={equipPlaySet}
            setLocalFolderModal={setLocalFolderModal}
            localFolderType={localFolderType}
            setLocalFolderType={setLocalFolderType}
            localFolderName={localFolderName}
            setLocalFolderName={setLocalFolderName}
            createLocalFolder={createLocalFolder}
            missingImportMods={missingImportMods}
            pendingImportSet={pendingImportSet}
            setMissingImportMods={setMissingImportMods}
            setPendingImportSet={setPendingImportSet}
            finalizeImport={finalizeImport}
            setIsDropzoneOpen={setIsDropzoneOpen}
            confirmDialog={confirmDialog}
            resolveDisplayName={(modName: string) => {
              if (modName.startsWith("FOLDER ")) {
                const id = modName.replace("FOLDER ", "");
                const ls = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]").find((s: any) => s.id === id);
                if (ls) return ls.name;
              }
              if (modName.startsWith("SET ")) {
                const id = modName.replace("SET ", "");
                const ps = playSets.find((s: any) => s.id === id);
                if (ps) return ps.name;
              }
              const found = modList.find((m: any) => m.name === modName);
              return found ? (found.displayName || found.name) : modName.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
            }}
            setConfirmDialog={setConfirmDialog}
            isBulkMode={isBulkMode}
            openBulk={setBulkModal}
            openLocalFolder={setLocalFolderModal}
            isDropzoneOpen={isDropzoneOpen}
            isDragging={isDragging}
            dropzoneState={dropzoneState}
            droppedFiles={droppedFiles}
            setDropzoneState={setDropzoneState}
            setDroppedFiles={setDroppedFiles}
            setIsDragging={setIsDragging}
            handleDroppedFiles={handleDroppedFiles}
            runRadarSweep={runRadarSweep}
            showBrokenModal={showBrokenModal}
            setShowBrokenModal={setShowBrokenModal}
            modList={modList}
            showQuarantineModal={showQuarantineModal}
            setShowQuarantineModal={setShowQuarantineModal}
            quarantineList={quarantineList}
            restoreMod={restoreMod}
            purgeMod={purgeMod}
            scoutQueue={scoutQueue}
            setScoutQueue={setScoutQueue}
            onOpenScoutDossier={(mod: any) => {
              const defaultName = (mod.displayName || mod.name || "").split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').replace(/_/g, ' ') || "";
              setMetaNameInput(defaultName);
              setMetaAuthorInput(mod.author || "");
              setMetaVersionInput(mod.version || "");
              setMetaDescInput(mod.description || "");
              setMetaImageInput(mod.image_url || mod.imageUrl || "");
              setMetaAllowWriteInput(mod.allow_write || false);
              setMetaIsPaidInput(mod.is_paid || false);
              setMetaIsEarlyAccessInput(mod.is_early_access || false);
              setActiveDossier(mod);
              setIsEditingMeta(true);
              setEditMode(true);
              setIsCorrectingMeta(true);
              useModalStore.getState().setIsSideBrowserOpen(false);
            }}
            onOpenDossier={setActiveDossier}
            isBackingUp={isBackingUp}
            isRestoring={isRestoring}
            ingestProgress={ingestProgress}
            isScanning={isScanning}
            showDefconAlert={showDefconAlert}
            setShowDefconAlert={setShowDefconAlert}
            triggerFullEngineBackup={triggerFullEngineBackup}
            triggerPrePatchSnapshot={triggerPrePatchSnapshot}
            yeetConfirmPending={yeetConfirmPending}
            setYeetConfirmPending={setYeetConfirmPending}
            dnaMatchQueue={dnaMatchQueue}
            setDnaMatchQueue={setDnaMatchQueue}
            edgeOverrideQueue={edgeOverrideQueue}
            setEdgeOverrideQueue={setEdgeOverrideQueue}
            ignoredHashesRef={ignoredHashesRef}
            setStatus={setStatus}
            statusLog={statusLog}
            clearStatusLog={clearStatusLog}
          />
          <ErrorBoundary
            variant="overlay"
            moduleName={t("notifications", "Notifications")}
            onClose={() => setIsNotificationSidebarOpen(false)}
          >
            <Suspense fallback={null}>
              {isNotificationSidebarOpen && (
                <NotificationSidebar
                  onClose={() => setIsNotificationSidebarOpen(false)}
                  onOpenPost={setGlobalViewingPost}
                />
              )}
            </Suspense>
          </ErrorBoundary>
          <NexusUpdatesChecker />
          <ErrorBoundary
            variant="overlay"
            moduleName={t("support", "Support")}
            onClose={() => {
              setGlobalViewingPost(null);
              setIsCitizenTicketsOpen(false);
            }}
          >
            <Suspense fallback={null}>
              {globalViewingPost && (
                <MasonPostViewer
                  post={globalViewingPost}
                  onClose={() => setGlobalViewingPost(null)}
                  onOpenMasonProfile={handleOpenMasonProfile}
                  userId={session?.user?.id}
                />
              )}
              {isCitizenTicketsOpen && (
                <CitizenTicketsSidePanel isOpen={isCitizenTicketsOpen} onClose={() => setIsCitizenTicketsOpen(false)} userId={session?.user?.id} />
              )}
            </Suspense>
          </ErrorBoundary>
          <GlobalCommandPalette
            onInspectMod={(mod) => {
              window.dispatchEvent(new CustomEvent("sanctuary-open-dossier", { detail: mod }));
            }}
            onToggleModInBlueprint={(mod) => {
              toggleInActiveSet(mod.name);
            }}
            onEquipBlueprint={(setName) => {
              equipPlaySet(setName);
            }}
            onQuickLaunch={() => {
              handleQuickLaunch();
            }}
            onRunRadarSweep={() => {
              runRadarSweep(true);
            }}
            onOpenDropzone={() => {
              setIsDropzoneOpen(true);
            }}
            onTriggerFullBackup={() => {
              triggerFullEngineBackup();
            }}
            onTriggerPrePatchSnapshot={() => {
              triggerPrePatchSnapshot();
            }}
            onOpenNotifications={() => {
              setIsNotificationSidebarOpen(true);
            }}
            onOpenMasonProfile={handleOpenMasonProfile}
            onOpenDefcon={() => {
              setShowDefconAlert(true);
            }}
            onTriggerShelter={(enable) => {
              triggerShelter(enable);
            }}
            onOpenCitizenTickets={() => {
              setIsCitizenTicketsOpen(true);
            }}
          />
          <DevBuildClearanceGate />
          <ErrorBoundary
            variant="overlay"
            moduleName={t("release_notes_tile_changelog", "Changelog")}
            onClose={() => {
              const modalState = useModalStore.getState();
              modalState.setIsUpdatePanelOpen(false);
              modalState.setIsNexusUpdatesPanelOpen(false);
              modalState.setIsSupportPanelOpen(false);
            }}
          >
            <Suspense fallback={null}>
              {isUpdatePanelOpen && <UpdateSidePanel />}
              <SupporterCelebrationSidePanel />
              {isNexusUpdatesPanelOpen && <NexusUpdatesSidePanel />}
              {isSupportPanelOpen && (
                <SupportHub onOpenModDossier={setActiveDossier} />
              )}
              {isDesktop() && (
                <WorkspaceFirstTimeSetup isOpen={isWorkspaceSetupOverlayOpen} />
              )}
            </Suspense>
          </ErrorBoundary>
          <ContextMenu />
          <GlobalTooltip />
          <PixelSnapper />
    </>
  );
}

export function AppGlobalOverlays({
  view,
  setView,
  subtitleIndex,
  isGlobalConfigLoaded,
  t,
  currentTheme,
}: any) {
  const status = useStore((s) => s.status);
  return (
    <>
      {!isDesktop() && <MobileBottomNav view={view} setView={setView} subtitleIndex={subtitleIndex} />}

      {!isGlobalConfigLoaded && (() => {
        const portalRoot =
          (typeof document !== "undefined" && document.getElementById("sa-portals")) ||
          (typeof document !== "undefined" ? document.body : null);
        const lockShieldOverlay = (
          <div
            data-sa-malware-active="true"
            className="fixed inset-0 z-[59998] pointer-events-auto select-none cursor-passkey-locked"
            onMouseMove={(e) => {
              useTooltipStore.getState().setTooltip({
                title: t("status_syncing", "Loading Workspace"),
                subtitle: t(
                  "status_establishing_connection",
                  "Please standby while Sanctuary OS prepares your Workspace."
                ),
                variant: "default",
                icon: t("icon_block", "block"),
                x: e.clientX,
                y: e.clientY - 14,
                align: "center",
                vAlign: "top",
              });
            }}
            onMouseLeave={() => {
              useTooltipStore.getState().clearTooltip();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        );
        return (
          <>
            {portalRoot ? createPortal(lockShieldOverlay, portalRoot) : lockShieldOverlay}
            <SidePanel
              isOpen={true}
              onClose={() => {}}
              hideCloseButton={true}
              passthroughBackdrop={true}
              noBackdropDim={true}
              backdropZ="z-[60000]"
              panelZ="z-[60001]"
              panelClass="sa-malware-lockdown-panel"
              title={t("status_syncing", "Loading Workspace")}
              subtitle={t(
                "status_establishing_connection",
                "Please standby while Sanctuary OS prepares your Workspace."
              )}
              icon={t("icon_sync", "sync")}
              iconColorClass="text-[var(--accent)]"
            >
              <div
                className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8"
                onMouseEnter={() => useTooltipStore.getState().clearTooltip()}
              >
                <div
                  className="glass-panel rounded-2xl p-5 border flex flex-col gap-5"
                  style={{
                    borderColor: "color-mix(in srgb, var(--accent) 32%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[22px] animate-spin">
                        {t("icon_sync", "sync")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                        {t("tab_workspace", "Workspace")}
                      </span>
                      <h3 className="text-lg font-black tracking-tight text-[var(--text)] leading-tight m-0 truncate">
                        {t("status_syncing", "Loading Workspace")}
                      </h3>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "status_establishing_connection",
                      "Please standby while Sanctuary OS prepares your Workspace."
                    )}
                  </p>

                  <div className="w-full rounded-2xl p-4 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                    <div className="w-full h-2 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                      <div
                        className="h-full w-2/3 rounded-full animate-pulse"
                        style={{
                          background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[var(--subtext)]">
                      <span className="truncate">
                        {status || t("workspace_loading", "Loading Workspaces...")}
                      </span>
                      <span className="text-[var(--accent)] font-bold shrink-0">
                        {t("active", "Active")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </SidePanel>
          </>
        );
      })()}
      <CompanionPasskeyHandshakeApprover />

      {/* 
        Global SVG Noise Texture (Top Level)
        Moved here to sit on top of the entire DOM. This prevents it from being blurred by glass panels
        (which causes CRT fuzzy artifacts) and prevents its mix-blend-mode from breaking backdrop-filter
        for the rest of the application.
      */}
      {currentTheme.ambientNoise !== false && !isLinuxDesktop() && (
        <div
          className="fixed inset-0 w-full h-full opacity-[0.45] pointer-events-none z-[9999999] transform-gpu"
          style={{
            backgroundImage: getStaticNoiseDataUrl() ? `url("${getStaticNoiseDataUrl()}")` : undefined,
            backgroundRepeat: 'repeat',
            backgroundSize: '96px 96px',
          }}
        />
      )}

    </>
  );
}
