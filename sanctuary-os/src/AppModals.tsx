import React from 'react';
import { useModalStore } from "./store/modalStore";
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { MissingImportsAlert } from "./side-panels/MissingImportsAlert";
import { YeetConfirmAlert } from "./side-panels/YeetConfirmAlert";
import { DefconAlert } from "./DefconAlert";
import { GlobalConfirmDialog } from "./app-modals/GlobalConfirmDialog";
import { DropzoneSidePanel } from "./app-modals/DropzoneSidePanel";
import { DnaMatchQueueSidePanel } from "./app-modals/DnaMatchQueueSidePanel";
import { ScoutQueueSidePanel } from "./app-modals/ScoutQueueSidePanel";
import { SystemStatusPanel } from "./side-panels/SystemStatusPanel";
import SidePanelBrowser from "./side-panels/SidePanelBrowser";
import { MalwareAlertModal } from "./app-modals/MalwareAlertModal";
import { SnapshotModal } from "./app-modals/SnapshotModal";
import { BulkModal } from "./app-modals/BulkModal";
import { RenameModal } from "./app-modals/RenameModal";
import { LocalFolderModal } from "./app-modals/LocalFolderModal";
import { QuarantineModal } from "./app-modals/QuarantineModal";
import { BackupRestoreModals } from "./app-modals/BackupRestoreModals";
import { IngestProgressModal } from "./app-modals/IngestProgressModal";
import { SystemLogModal } from "./app-modals/SystemLogModal";
import { SystemStatusBar } from "./app-modals/SystemStatusBar";
import { SanctuaryAlertsSidePanel } from './side-panels/SanctuaryAlertsSidePanel';
import BlueprintSwapSidePanel from "./side-panels/BlueprintSwapSidePanel";
import CommandRadarSweepPanel from "./side-panels/CommandRadarSweepPanel";
import { UpdatesSidePanel } from "./side-panels/CommandCenterSidePanels";
import CommandConflictsPanel from "./side-panels/CommandConflictsPanel";
import CommandIncompatiblePanel from "./side-panels/CommandIncompatiblePanel";
import { getExtensionRegex, handleOpenUrl } from "./shared";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { isDesktop } from "./utils/envUtils";

export const AppModals = React.memo(function AppModals(props: any) {
  const [isLogExpanded, setIsLogExpanded] = React.useState(false);
  const [isSystemStatusOpen, setIsSystemStatusOpen] = React.useState(false);
  const {
    snapshotModal, setSnapshotModal, snapshotName, setSnapshotName, executeSnapshot, playSets, activePlaySetIndex, toggleInActiveSet,
    bulkModal, setBulkModal, bulkName, setBulkName, executeBulkDraft, selectedMods, resolveDisplayName,
    renameModal, setRenameModal, executeRename,
    renameTarget, setRenameTarget, nameInput, setNameInput, confirmRename,
    localFolderModal, setLocalFolderModal, localFolderType, setLocalFolderType, localFolderName, setLocalFolderName, createLocalFolder,
    missingImportMods, pendingImportSet, setMissingImportMods, setPendingImportSet, finalizeImport, setIsDropzoneOpen,
    confirmDialog, setConfirmDialog,
    isBulkMode, openBulk, openLocalFolder,
    isDropzoneOpen, isDragging, dropzoneState, droppedFiles, setDropzoneState, setDroppedFiles, setIsDragging, handleDroppedFiles, runRadarSweep,
    showBrokenModal, setShowBrokenModal, modList,
    showQuarantineModal, setShowQuarantineModal, quarantineList, restoreMod, purgeMod,
    isBackingUp, isRestoring,
    ingestProgress,
    isScanning,
    showDefconAlert, setShowDefconAlert, triggerFullEngineBackup, triggerPrePatchSnapshot,
    yeetConfirmPending, setYeetConfirmPending,
    dnaMatchQueue, setDnaMatchQueue, ignoredHashesRef, setStatus, statusLog, clearStatusLog,
    scoutQueue, setScoutQueue, onOpenScoutDossier,
    malwareAlert, setMalwareAlert, setPlaySets,
    isSidebarCollapsed, equipPlaySet
  } = props;

  const status = useStore((state) => state.status);
  const activeConflictCount = useStore((state) => state.activeConflictCount) || { total: 0, tier3: 0, tier4: 0 };
  const activeBrokenCounts = useStore((state) => state.activeBrokenCounts) || { broken: 0, unstable: 0 };
  const networkUpdates = useStore((state) => state.networkUpdates);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const modsPath = useStore((state) => state.modsPath);
  const isAlertsOpen = useStore(state => state.isAlertsOpen);
  const setIsAlertsOpen = useStore(state => state.setIsAlertsOpen);
  const { applyConflictOverride } = usePlaySetLogic();

  const { backupType, restoreType, updatePayload, setIsSideBrowserOpen, isBlueprintSwapOpen, setIsBlueprintSwapOpen, isConflictRadarOpen, setIsConflictRadarOpen, showUpdatesModal, setShowUpdatesModal, showConflictsPanel, setShowConflictsPanel, showIncompatiblePanel, setShowIncompatiblePanel } = useModalStore();

  const activePlaySet = playSets ? playSets[activePlaySetIndex] : null;

  const activeBlueprintMods = React.useMemo(() => {
    if (!activePlaySet) return [];
    const safeMods = Array.isArray(activePlaySet.mods) ? activePlaySet.mods : [];
    const safeList = Array.isArray(modList) ? modList : [];

    const exactMatchMap = new Map();
    const baseMatchMap = new Map();
    
    for (const m of safeList) {
        if (!m.name) continue;
        const exactKey = m.name.toLowerCase().replace(/\\/g, '/');
        exactMatchMap.set(exactKey, m);
        
        const baseKey = m.name.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
        if (baseKey) {
            if (!baseMatchMap.has(baseKey)) {
                baseMatchMap.set(baseKey, m);
            }
        }
    }

    return safeMods.map((rawMod: any) => {
      const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
      const cleanModName = modName.replace(/^(sanctuary[/\\])+/i, '');
      const modNameLow = cleanModName.toLowerCase().replace(/\\/g, '/');
      
      const exactMatch = exactMatchMap.get(modNameLow);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };

      const mBase = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
      
      const baseMatch = mBase ? baseMatchMap.get(mBase) : undefined;
      if (baseMatch) return { ...baseMatch, _originalSetName: modName };

      return { id: `missing-${modName}`, name: modName, isFallback: true, color: 'theme-border-danger', physical_path: null, hash: 'vlocal' };
    });
  }, [activePlaySet, modList, activeGameSchema]);

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
  
  const statusBgClass = isErrorStatus ? 'bg-red-900/40 border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-md' : isSuccessStatus ? 'bg-emerald-900/40 border-[color-mix(in_srgb,var(--success)_50%,transparent)] shadow-md' : 'bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-[0_-5px_20px_rgba(0,0,0,0.5)]';
  const statusTextClass = isErrorStatus ? 'text-red-400 font-black' : isSuccessStatus ? 'text-emerald-400 font-black' : 'theme-text-accent';
  const statusAccentClass = isErrorStatus ? 'bg-red-500 shadow-md' : isSuccessStatus ? 'bg-emerald-500 shadow-md' : 'theme-bg-accent shadow-[0_0_10px_var(--accent)]';
  const statusIconClass = isErrorStatus ? 'text-red-500' : isSuccessStatus ? 'text-emerald-500' : 'text-[var(--accent)]';


  return (
    <>
      <MalwareAlertModal malwareAlert={malwareAlert} setMalwareAlert={setMalwareAlert} droppedFiles={droppedFiles} runRadarSweep={runRadarSweep} setStatus={setStatus} />
      <SnapshotModal snapshotModal={snapshotModal} setSnapshotModal={setSnapshotModal} snapshotName={snapshotName} setSnapshotName={setSnapshotName} executeSnapshot={executeSnapshot} />
      <BulkModal bulkModal={bulkModal} setBulkModal={setBulkModal} bulkName={bulkName} setBulkName={setBulkName} executeBulkDraft={executeBulkDraft} selectedMods={selectedMods} resolveDisplayName={resolveDisplayName} />
      <RenameModal renameModal={renameModal} setRenameModal={setRenameModal} executeRename={executeRename} renameTarget={renameTarget} setRenameTarget={setRenameTarget} nameInput={nameInput} setNameInput={setNameInput} confirmRename={confirmRename} />
      <LocalFolderModal localFolderModal={localFolderModal} setLocalFolderModal={setLocalFolderModal} localFolderType={localFolderType} setLocalFolderType={setLocalFolderType} localFolderName={localFolderName} setLocalFolderName={setLocalFolderName} createLocalFolder={createLocalFolder} selectedMods={selectedMods} resolveDisplayName={resolveDisplayName} />
      <QuarantineModal showQuarantineModal={showQuarantineModal} setShowQuarantineModal={setShowQuarantineModal} quarantineList={quarantineList} restoreMod={restoreMod} purgeMod={purgeMod} />
      
      {(missingImportMods && missingImportMods.length > 0) && pendingImportSet && (
        <MissingImportsAlert missingImportMods={missingImportMods} setMissingImportMods={setMissingImportMods} pendingImportSet={pendingImportSet} setPendingImportSet={setPendingImportSet} finalizeImport={finalizeImport} setIsDropzoneOpen={setIsDropzoneOpen} />
      )}
      
      {!showDefconAlert && <GlobalConfirmDialog />}
      
      <DropzoneSidePanel isDropzoneOpen={isDropzoneOpen} isDragging={isDragging} setIsDragging={setIsDragging} dropzoneState={dropzoneState} setIsDropzoneOpen={setIsDropzoneOpen} setDropzoneState={setDropzoneState} droppedFiles={droppedFiles} setDroppedFiles={setDroppedFiles} ingestProgress={ingestProgress} handleDroppedFiles={handleDroppedFiles} runRadarSweep={runRadarSweep} />
      
      {!showDefconAlert && <BackupRestoreModals isBackingUp={isBackingUp} isRestoring={isRestoring} backupType={backupType} restoreType={restoreType} t={useLexicon().t} />}
      
      <IngestProgressModal ingestProgress={ingestProgress} />
      
      {showDefconAlert && <DefconAlert />}
      
      {yeetConfirmPending && <YeetConfirmAlert yeetConfirmPending={yeetConfirmPending} setYeetConfirmPending={setYeetConfirmPending} />}
      
      <DnaMatchQueueSidePanel dnaMatchQueue={dnaMatchQueue} setDnaMatchQueue={setDnaMatchQueue} ignoredHashesRef={ignoredHashesRef} runRadarSweep={runRadarSweep} setStatus={setStatus} setPlaySets={setPlaySets} activePlaySetIndex={activePlaySetIndex} />
      
      <ScoutQueueSidePanel scoutQueue={scoutQueue} setScoutQueue={setScoutQueue} onOpenScoutDossier={onOpenScoutDossier} />
      
      <SystemLogModal isLogExpanded={isLogExpanded} setIsLogExpanded={setIsLogExpanded} statusLog={statusLog} clearStatusLog={clearStatusLog} logModalRef={logModalRef} handleLogPointerDown={handleLogPointerDown} handleLogPointerMove={handleLogPointerMove} handleLogPointerUp={handleLogPointerUp} />
      
      <SystemStatusBar isSidebarCollapsed={isSidebarCollapsed} isNotificationSidebarOpen={props.isNotificationSidebarOpen} setIsNotificationSidebarOpen={props.setIsNotificationSidebarOpen} unreadNotificationCount={props.unreadNotificationCount} isLogExpanded={isLogExpanded} setIsLogExpanded={setIsLogExpanded} status={status} isScanning={isScanning} isErrorStatus={isErrorStatus} isSuccessStatus={isSuccessStatus} statusBgClass={statusBgClass} statusAccentClass={statusAccentClass} statusIconClass={statusIconClass} statusTextClass={statusTextClass} updatePayload={updatePayload} isSystemStatusOpen={isSystemStatusOpen} setIsSystemStatusOpen={setIsSystemStatusOpen} setIsSideBrowserOpen={setIsSideBrowserOpen} />
      
      <SystemStatusPanel isOpen={isSystemStatusOpen} onClose={() => setIsSystemStatusOpen(false)} />
      
      {isDesktop() && <SidePanelBrowser />}
      
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

      <UpdatesSidePanel
        isOpen={showUpdatesModal}
        onClose={() => setShowUpdatesModal(false)}
        activeUpdates={activeUpdates}
        handleOpenUrl={handleOpenUrl}
      />

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
      
      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience="Citizens"
      />
    </>
  );
});
