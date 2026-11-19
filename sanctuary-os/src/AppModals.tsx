import React, { Suspense } from 'react';
import { useShallow } from "zustand/react/shallow";
import { useModalStore } from "./store/modalStore";
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { GlobalConfirmDialog } from "./app-modals/GlobalConfirmDialog";
import { SignatureQueueSidePanel } from "./side-panels/SignatureQueueSidePanel";
import SidePanelBrowser from "./side-panels/SidePanelBrowser";
import { SystemStatusBar } from "./app-modals/SystemStatusBar";
import { GlobalWorkbenchSidePanelHost } from "./app-modals/GlobalWorkbenchSidePanelHost";
import { handleOpenUrl } from "./shared";
import { useConflictOverride } from "./hooks/usePlaySetLogic";
import { isDesktop } from "./utils/envUtils";
import { resolveActiveBlueprintMods } from "./side-panels/CommandIncompatiblePanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { lazyWithRetry } from "./utils/lazyWithRetry";

const MissingImportsAlert = lazyWithRetry(() =>
  import("./side-panels/MissingImportsAlert").then((m) => ({ default: m.MissingImportsAlert }))
);
const YeetConfirmAlert = lazyWithRetry(() =>
  import("./side-panels/YeetConfirmAlert").then((m) => ({ default: m.YeetConfirmAlert }))
);
const DropzoneSidePanel = lazyWithRetry(() =>
  import("./app-modals/DropzoneSidePanel").then((m) => ({ default: m.DropzoneSidePanel }))
);
const DnaMatchQueueSidePanel = lazyWithRetry(() =>
  import("./app-modals/DnaMatchQueueSidePanel").then((m) => ({ default: m.DnaMatchQueueSidePanel }))
);
const ScoutQueueSidePanel = lazyWithRetry(() =>
  import("./app-modals/ScoutQueueSidePanel").then((m) => ({ default: m.ScoutQueueSidePanel }))
);
const SystemStatusPanel = lazyWithRetry(() =>
  import("./side-panels/SystemStatusPanel").then((m) => ({ default: m.SystemStatusPanel }))
);
const MalwareAlertModal = lazyWithRetry(() =>
  import("./app-modals/MalwareAlertModal").then((m) => ({ default: m.MalwareAlertModal }))
);
const BulkModal = lazyWithRetry(() =>
  import("./app-modals/BulkModal").then((m) => ({ default: m.BulkModal }))
);
const LocalFolderModal = lazyWithRetry(() =>
  import("./app-modals/LocalFolderModal").then((m) => ({ default: m.LocalFolderModal }))
);
const BackupRestoreModals = lazyWithRetry(() =>
  import("./app-modals/BackupRestoreModals").then((m) => ({ default: m.BackupRestoreModals }))
);
const IngestProgressModal = lazyWithRetry(() =>
  import("./app-modals/IngestProgressModal").then((m) => ({ default: m.IngestProgressModal }))
);
const SystemLogModal = lazyWithRetry(() =>
  import("./app-modals/SystemLogModal").then((m) => ({ default: m.SystemLogModal }))
);
const SanctuaryAlertsSidePanel = lazyWithRetry(() =>
  import("./side-panels/SanctuaryAlertsSidePanel").then((m) => ({ default: m.SanctuaryAlertsSidePanel }))
);
const BlueprintSwapSidePanel = lazyWithRetry(() => import("./side-panels/BlueprintSwapSidePanel"));
const CommandRadarSweepPanel = lazyWithRetry(() => import("./side-panels/CommandRadarSweepPanel"));
const UpdatesSidePanel = lazyWithRetry(() =>
  import("./side-panels/CommandCenterSidePanels").then((m) => ({ default: m.UpdatesSidePanel }))
);
const CommandConflictsPanel = lazyWithRetry(() => import("./side-panels/CommandConflictsPanel"));
const CommandIncompatiblePanel = lazyWithRetry(() => import("./side-panels/CommandIncompatiblePanel"));
const ScreenshotTourSidePanel = lazyWithRetry(() =>
  import("./side-panels/ScreenshotTourSidePanel").then((m) => ({ default: m.ScreenshotTourSidePanel }))
);
const CloudSyncGuardSidePanel = lazyWithRetry(() =>
  import("./side-panels/CloudSyncGuardSidePanel").then((m) => ({ default: m.CloudSyncGuardSidePanel }))
);
const FomodInstallerSidePanel = lazyWithRetry(() =>
  import("./app-modals/FomodInstallerSidePanel").then((m) => ({ default: m.FomodInstallerSidePanel }))
);

export const AppModals = React.memo(function AppModals(props: any) {
  const { t } = useLexicon();
  const [isScreenshotTourOpen, setIsScreenshotTourOpen] = React.useState(false);

  React.useEffect(() => {
    const handleOpenTour = () => setIsScreenshotTourOpen(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setIsScreenshotTourOpen((prev) => !prev);
      }
    };
    window.addEventListener("sanctuary-open-screenshot-tour", handleOpenTour);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("sanctuary-open-screenshot-tour", handleOpenTour);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  const { playSets, activePlaySetIndex, toggleInActiveSet, bulkModal, setBulkModal, bulkName, setBulkName, executeBulkDraft, selectedMods, resolveDisplayName, localFolderModal, setLocalFolderModal, localFolderType, setLocalFolderType, localFolderName, setLocalFolderName, createLocalFolder, missingImportMods, pendingImportSet, setMissingImportMods, setPendingImportSet, finalizeImport, setIsDropzoneOpen, isDropzoneOpen, isDragging, dropzoneState, droppedFiles, setDropzoneState, setDroppedFiles, setIsDragging, handleDroppedFiles, runRadarSweep, modList, isBackingUp, isRestoring, ingestProgress, isScanning, showDefconAlert, yeetConfirmPending, setYeetConfirmPending, dnaMatchQueue, setDnaMatchQueue, ignoredHashesRef, setStatus, statusLog, clearStatusLog, scoutQueue, setScoutQueue, onOpenScoutDossier, malwareAlert, setMalwareAlert, setPlaySets, isSidebarCollapsed, equipPlaySet } = props;

  const status = useStore((state) => state.status);
  const activeConflictCount = useStore((state) => state.activeConflictCount) || { total: 0, tier3: 0, tier4: 0 };
  const activeBrokenCounts = useStore((state) => state.activeBrokenCounts) || { broken: 0, unstable: 0 };
  const networkUpdates = useStore((state) => state.networkUpdates);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const modsPath = useStore((state) => state.modsPath);
  const isAlertsOpen = useStore(state => state.isAlertsOpen);
  const setIsAlertsOpen = useStore(state => state.setIsAlertsOpen);
  const applyConflictOverride = useConflictOverride();

  const {
    backupType,
    restoreType,
    completedBackups,
    backupRestoreError,
    confirmDialog,
    updatePayload,
    setIsSideBrowserOpen,
    isBlueprintSwapOpen,
    setIsBlueprintSwapOpen,
    isConflictRadarOpen,
    setIsConflictRadarOpen,
    showUpdatesModal,
    setShowUpdatesModal,
    showConflictsPanel,
    setShowConflictsPanel,
    showIncompatiblePanel,
    setShowIncompatiblePanel,
    isLogExpanded,
    setIsLogExpanded,
    isSystemStatusOpen,
    setIsSystemStatusOpen,
    isScoutPanelOpen,
    isCloudSyncGuardOpen,
    closeCloudSyncGuard,
    hasInstallerWizard,
  } = useModalStore(
    useShallow((s) => ({
      backupType: s.backupType,
      restoreType: s.restoreType,
      completedBackups: s.completedBackups,
      backupRestoreError: s.backupRestoreError,
      confirmDialog: s.confirmDialog,
      updatePayload: s.updatePayload,
      setIsSideBrowserOpen: s.setIsSideBrowserOpen,
      isBlueprintSwapOpen: s.isBlueprintSwapOpen,
      setIsBlueprintSwapOpen: s.setIsBlueprintSwapOpen,
      isConflictRadarOpen: s.isConflictRadarOpen,
      setIsConflictRadarOpen: s.setIsConflictRadarOpen,
      showUpdatesModal: s.showUpdatesModal,
      setShowUpdatesModal: s.setShowUpdatesModal,
      showConflictsPanel: s.showConflictsPanel,
      setShowConflictsPanel: s.setShowConflictsPanel,
      showIncompatiblePanel: s.showIncompatiblePanel,
      setShowIncompatiblePanel: s.setShowIncompatiblePanel,
      isLogExpanded: s.isLogExpanded,
      setIsLogExpanded: s.setIsLogExpanded,
      isSystemStatusOpen: s.isSystemStatusOpen,
      setIsSystemStatusOpen: s.setIsSystemStatusOpen,
      isScoutPanelOpen: s.isScoutPanelOpen,
      isCloudSyncGuardOpen: s.isCloudSyncGuardOpen,
      closeCloudSyncGuard: s.closeCloudSyncGuard,
      hasInstallerWizard: s.installerWizardQueue.length > 0,
    }))
  );

  const activePlaySet = playSets ? playSets[activePlaySetIndex] : null;
  const needsBlueprintMods = Boolean(showUpdatesModal || showIncompatiblePanel || showConflictsPanel);

  const activeBlueprintMods = React.useMemo(() => {
    if (!needsBlueprintMods || !activePlaySet) return [];
    return resolveActiveBlueprintMods(
      activePlaySet.mods,
      modList,
      activeGameSchema,
      networkUpdates
    );
  }, [needsBlueprintMods, activePlaySet, modList, activeGameSchema, networkUpdates]);

  const activeUpdates = React.useMemo(() => {
    const rawUpdates = activeBlueprintMods.filter((m: any) => m.hasUpdate).map((m: any) => ({
      ...m,
      dbId: m.dbId,
    }));
    return Object.values(rawUpdates.reduce((acc: any, update: any) => {
      const key = update.dbId || update.displayName || update.name;
      if (!acc[key]) acc[key] = update;
      return acc;
    }, {}));
  }, [activeBlueprintMods]);

  const logModalRef = React.useRef<HTMLDivElement>(null);
  const logDragRef = React.useRef({ isDragging: false, startX: 0, startY: 0, currentX: 0, currentY: 0, initOffsetX: 0, initOffsetY: 0 });

  const handleLogPointerDown = (e: React.PointerEvent) => {
    logDragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      currentX: logDragRef.current.currentX,
      currentY: logDragRef.current.currentY,
      initOffsetX: logDragRef.current.currentX,
      initOffsetY: logDragRef.current.currentY
    };
    if (logModalRef.current) {
      logModalRef.current.style.transition = 'none';
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleLogPointerMove = (e: React.PointerEvent) => {
    if (!logDragRef.current.isDragging) return;
    const dx = e.clientX - logDragRef.current.startX;
    const dy = e.clientY - logDragRef.current.startY;
    logDragRef.current.currentX = logDragRef.current.initOffsetX + dx;
    logDragRef.current.currentY = logDragRef.current.initOffsetY + dy;
    
    if (logModalRef.current) {
       logModalRef.current.style.transform = `translate(${logDragRef.current.currentX}px, ${logDragRef.current.currentY}px)`;
    }
  };

  const handleLogPointerUp = (e: React.PointerEvent) => {
    logDragRef.current.isDragging = false;
    if (logModalRef.current) {
      logModalRef.current.style.transition = '';
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const isErrorStatus = typeof status === 'string' && (status.toLowerCase().includes('error') || status.toLowerCase().includes('fail') || status.toLowerCase().includes('fatal') || status.includes('❌'));
  const isSuccessStatus = typeof status === 'string' && (status.toLowerCase().includes('success') || status.toLowerCase().includes('done') || status.includes('✅') || status.includes('icon_check_circle'));
  
  const statusBgClass = isErrorStatus ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_45%,transparent)] shadow-md' : isSuccessStatus ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_45%,transparent)] shadow-md' : 'bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border-[color-mix(in_srgb,var(--text)_8%,transparent)] shadow-[0_-5px_20px_rgba(0,0,0,0.5)]';
  const statusTextClass = isErrorStatus ? 'text-[var(--danger)] font-black' : isSuccessStatus ? 'text-[var(--success)] font-black' : 'theme-text-accent';
  const statusAccentClass = isErrorStatus ? 'theme-bg-danger shadow-md' : isSuccessStatus ? 'theme-bg-success shadow-md' : 'theme-bg-accent shadow-[0_0_10px_var(--accent)]';
  const statusIconClass = isErrorStatus ? 'text-[var(--danger)]' : isSuccessStatus ? 'text-[var(--success)]' : 'text-[var(--accent)]';


  const hasDnaActivity = Boolean(dnaMatchQueue && dnaMatchQueue.length > 0);
  const [keepDnaMounted, setKeepDnaMounted] = React.useState(false);
  React.useEffect(() => {
    if (hasDnaActivity) {
      setKeepDnaMounted(true);
      return;
    }
    if (!keepDnaMounted) return;
    const timer = setTimeout(() => setKeepDnaMounted(false), 2500);
    return () => clearTimeout(timer);
  }, [hasDnaActivity, keepDnaMounted]);

  return (
    <>
      <ErrorBoundary
        variant="overlay"
        onClose={() => {
          setMalwareAlert(null);
          setBulkModal(false);
          setLocalFolderModal(false);
          setMissingImportMods([]);
          setPendingImportSet(null);
        }}
      >
        <Suspense fallback={null}>
          {malwareAlert && malwareAlert.length > 0 && (
            <MalwareAlertModal malwareAlert={malwareAlert} setMalwareAlert={setMalwareAlert} droppedFiles={droppedFiles} runRadarSweep={runRadarSweep} setStatus={setStatus} />
          )}
          {bulkModal && (
            <BulkModal bulkModal={bulkModal} setBulkModal={setBulkModal} bulkName={bulkName} setBulkName={setBulkName} executeBulkDraft={executeBulkDraft} selectedMods={selectedMods} resolveDisplayName={resolveDisplayName} />
          )}
          {localFolderModal && (
            <LocalFolderModal localFolderModal={localFolderModal} setLocalFolderModal={setLocalFolderModal} localFolderType={localFolderType} setLocalFolderType={setLocalFolderType} localFolderName={localFolderName} setLocalFolderName={setLocalFolderName} createLocalFolder={createLocalFolder} selectedMods={selectedMods} resolveDisplayName={resolveDisplayName} />
          )}

          {(missingImportMods && missingImportMods.length > 0) && pendingImportSet && (
            <MissingImportsAlert missingImportMods={missingImportMods} setMissingImportMods={setMissingImportMods} pendingImportSet={pendingImportSet} setPendingImportSet={setPendingImportSet} finalizeImport={finalizeImport} setIsDropzoneOpen={setIsDropzoneOpen} />
          )}
        </Suspense>
      </ErrorBoundary>

      {!showDefconAlert && <GlobalConfirmDialog />}

      <ErrorBoundary
        variant="overlay"
        onClose={() => {
          setIsDropzoneOpen(false);
          setIsDragging(false);
          setDroppedFiles([]);
          setYeetConfirmPending(null);
          setDnaMatchQueue([]);
        }}
      >
        <Suspense fallback={null}>
          {(isDropzoneOpen || isDragging || (droppedFiles && droppedFiles.length > 0)) && (
            <DropzoneSidePanel isDropzoneOpen={isDropzoneOpen} isDragging={isDragging} setIsDragging={setIsDragging} dropzoneState={dropzoneState} setIsDropzoneOpen={setIsDropzoneOpen} setDropzoneState={setDropzoneState} droppedFiles={droppedFiles} setDroppedFiles={setDroppedFiles} ingestProgress={ingestProgress} handleDroppedFiles={handleDroppedFiles} runRadarSweep={runRadarSweep} />
          )}

          {(isBackingUp ||
            isRestoring ||
            completedBackups.length > 0 ||
            Boolean(confirmDialog?.isDefcon) ||
            Boolean(backupRestoreError)) && (
            <BackupRestoreModals isBackingUp={isBackingUp} isRestoring={isRestoring} backupType={backupType} restoreType={restoreType} t={t} />
          )}

          {ingestProgress?.active && (
            <IngestProgressModal ingestProgress={ingestProgress} />
          )}

          {yeetConfirmPending && <YeetConfirmAlert yeetConfirmPending={yeetConfirmPending} setYeetConfirmPending={setYeetConfirmPending} />}

          {(hasDnaActivity || keepDnaMounted) && (
            <DnaMatchQueueSidePanel dnaMatchQueue={dnaMatchQueue} setDnaMatchQueue={setDnaMatchQueue} ignoredHashesRef={ignoredHashesRef} runRadarSweep={runRadarSweep} setStatus={setStatus} setPlaySets={setPlaySets} activePlaySetIndex={activePlaySetIndex} />
          )}

          {isScoutPanelOpen && (
            <ScoutQueueSidePanel scoutQueue={scoutQueue} setScoutQueue={setScoutQueue} onOpenScoutDossier={onOpenScoutDossier} />
          )}
        </Suspense>
      </ErrorBoundary>

      <SignatureQueueSidePanel equipPlaySet={equipPlaySet} onOpenDossier={props.onOpenDossier} />

      <ErrorBoundary
        variant="overlay"
        onClose={() => setIsLogExpanded(false)}
      >
        <Suspense fallback={null}>
          {isLogExpanded && (
            <SystemLogModal isLogExpanded={isLogExpanded} setIsLogExpanded={setIsLogExpanded} statusLog={statusLog} clearStatusLog={clearStatusLog} logModalRef={logModalRef} handleLogPointerDown={handleLogPointerDown} handleLogPointerMove={handleLogPointerMove} handleLogPointerUp={handleLogPointerUp} />
          )}
        </Suspense>
      </ErrorBoundary>

      <SystemStatusBar isSidebarCollapsed={isSidebarCollapsed} isNotificationSidebarOpen={props.isNotificationSidebarOpen} setIsNotificationSidebarOpen={props.setIsNotificationSidebarOpen} unreadNotificationCount={props.unreadNotificationCount} isLogExpanded={isLogExpanded} setIsLogExpanded={setIsLogExpanded} status={status} isScanning={isScanning} isErrorStatus={isErrorStatus} isSuccessStatus={isSuccessStatus} statusBgClass={statusBgClass} statusAccentClass={statusAccentClass} statusIconClass={statusIconClass} statusTextClass={statusTextClass} updatePayload={updatePayload} isSystemStatusOpen={isSystemStatusOpen} setIsSystemStatusOpen={setIsSystemStatusOpen} setIsSideBrowserOpen={setIsSideBrowserOpen} />

      <ErrorBoundary
        variant="overlay"
        onClose={() => {
          setIsSystemStatusOpen(false);
          closeCloudSyncGuard();
        }}
      >
        <Suspense fallback={null}>
          {isSystemStatusOpen && (
            <SystemStatusPanel isOpen={isSystemStatusOpen} onClose={() => setIsSystemStatusOpen(false)} />
          )}
          {isDesktop() && isCloudSyncGuardOpen && (
            <CloudSyncGuardSidePanel isOpen={isCloudSyncGuardOpen} onClose={closeCloudSyncGuard} />
          )}
          {isDesktop() && hasInstallerWizard && (
            <FomodInstallerSidePanel runRadarSweep={runRadarSweep} />
          )}
        </Suspense>
      </ErrorBoundary>

      {isDesktop() && <SidePanelBrowser />}

      <ErrorBoundary
        variant="overlay"
        onClose={() => {
          setIsBlueprintSwapOpen(false);
          setIsConflictRadarOpen(false);
          setShowUpdatesModal(false);
          setShowIncompatiblePanel(false);
          setShowConflictsPanel(false);
          setIsAlertsOpen(false);
        }}
      >
        <Suspense fallback={null}>
          {isBlueprintSwapOpen && (
            <BlueprintSwapSidePanel
              isOpen={isBlueprintSwapOpen}
              onClose={() => setIsBlueprintSwapOpen(false)}
              equipPlaySet={equipPlaySet}
            />
          )}

          {isConflictRadarOpen && (
            <CommandRadarSweepPanel
              isOpen={isConflictRadarOpen}
              onClose={() => setIsConflictRadarOpen(false)}
              status={status}
              runRadarSweep={runRadarSweep}
              isScanning={isScanning}
              networkUpdates={networkUpdates}
              tier3Count={activeConflictCount.tier3}
              tier4Count={activeConflictCount.tier4}
              brokenCount={activeBrokenCounts.broken}
              unstableCount={activeBrokenCounts.unstable}
              onOpenUpdates={() => setShowUpdatesModal(true)}
              onOpenConflicts={() => setShowConflictsPanel(true)}
              onOpenIncompatible={() => setShowIncompatiblePanel(true)}
              onOpenHotSwap={() => setIsBlueprintSwapOpen(true)}
            />
          )}

          {showUpdatesModal && (
            <UpdatesSidePanel
              isOpen={showUpdatesModal}
              onClose={() => setShowUpdatesModal(false)}
              activeUpdates={activeUpdates}
              handleOpenUrl={handleOpenUrl}
            />
          )}

          {showIncompatiblePanel && (
            <CommandIncompatiblePanel
              isOpen={showIncompatiblePanel}
              onClose={() => setShowIncompatiblePanel(false)}
              activeMods={activeBlueprintMods}
              allow_write={!activePlaySet?.read_only}
              toggleInActiveSet={toggleInActiveSet}
            />
          )}

          {showConflictsPanel && (
            <CommandConflictsPanel
              isOpen={showConflictsPanel}
              onClose={() => setShowConflictsPanel(false)}
              activeMods={activeBlueprintMods}
              allow_write={!activePlaySet?.read_only}
              toggleInActiveSet={toggleInActiveSet}
              applyConflictOverride={applyConflictOverride}
              activeSetName={activePlaySet?.name}
              vaultPath={modsPath}
              onRefreshMods={runRadarSweep}
            />
          )}

          {isAlertsOpen && (
            <SanctuaryAlertsSidePanel
              isOpen={isAlertsOpen}
              onClose={() => setIsAlertsOpen(false)}
              audience="Citizens"
            />
          )}
        </Suspense>
      </ErrorBoundary>

      <GlobalWorkbenchSidePanelHost />

      <ErrorBoundary
        variant="overlay"
        onClose={() => setIsScreenshotTourOpen(false)}
      >
        <Suspense fallback={null}>
          {isScreenshotTourOpen && (
            <ScreenshotTourSidePanel
              isOpen={isScreenshotTourOpen}
              onClose={() => setIsScreenshotTourOpen(false)}
            />
          )}
        </Suspense>
      </ErrorBoundary>
    </>
  );
});
