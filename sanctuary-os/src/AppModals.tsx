import React from 'react';
import { useModalStore } from "./store/modalStore";
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { MissingImportsAlert } from "./side-panels/MissingImportsAlert";
import { YeetConfirmAlert } from "./side-panels/YeetConfirmAlert";
import { DefconAlert } from "./DefconAlert";
import { GlobalConfirmDialog } from "./app-modals/GlobalConfirmDialog";
import { DropzoneSidePanel } from "./app-modals/DropzoneSidePanel";
import { BrokenModsSidePanel } from "./app-modals/BrokenModsSidePanel";
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

export function AppModals(props: any) {
  const [isLogExpanded, setIsLogExpanded] = React.useState(false);
  const [isSystemStatusOpen, setIsSystemStatusOpen] = React.useState(false);
  const {
    snapshotModal, setSnapshotModal, snapshotName, setSnapshotName, executeSnapshot, playSets, activePlaySetIndex, toggleInActiveSet,
    bulkModal, setBulkModal, bulkName, setBulkName, executeBulkDraft, selectedMods,
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
    isScanning, scanProgress,
    status,
    showDefconAlert, setShowDefconAlert, triggerFullEngineBackup, triggerPrePatchSnapshot,
    yeetConfirmPending, setYeetConfirmPending,
    dnaMatchQueue, setDnaMatchQueue, ignoredHashesRef, setStatus, statusLog, clearStatusLog,
    scoutQueue, setScoutQueue, onOpenScoutDossier,
    malwareAlert, setMalwareAlert, setPlaySets,
    isSidebarCollapsed
  } = props;

  const { backupType, restoreType, updatePayload, setIsSideBrowserOpen } = useModalStore();
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
  
  const statusBgClass = isErrorStatus ? 'bg-red-900/40 border-red-500/50 shadow-[0_0_30px_rgba(220,38,38,0.3)]' : isSuccessStatus ? 'bg-emerald-900/40 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 'bg-[var(--bg)]/40 border-white/5 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]';
  const statusTextClass = isErrorStatus ? 'text-red-400 font-black' : isSuccessStatus ? 'text-emerald-400 font-black' : 'theme-text-accent';
  const statusAccentClass = isErrorStatus ? 'bg-red-500 shadow-[0_0_10px_rgba(220,38,38,1)]' : isSuccessStatus ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)]' : 'theme-bg-accent shadow-[0_0_10px_var(--accent)]';
  const statusIconClass = isErrorStatus ? 'text-red-500' : isSuccessStatus ? 'text-emerald-500' : 'text-[var(--accent)]';

  return (
    <>
      <MalwareAlertModal malwareAlert={malwareAlert} setMalwareAlert={setMalwareAlert} droppedFiles={droppedFiles} runRadarSweep={runRadarSweep} setStatus={setStatus} />
      <SnapshotModal snapshotModal={snapshotModal} setSnapshotModal={setSnapshotModal} snapshotName={snapshotName} setSnapshotName={setSnapshotName} executeSnapshot={executeSnapshot} />
      <BulkModal bulkModal={bulkModal} setBulkModal={setBulkModal} bulkName={bulkName} setBulkName={setBulkName} executeBulkDraft={executeBulkDraft} selectedMods={selectedMods} />
      <RenameModal renameModal={renameModal} setRenameModal={setRenameModal} executeRename={executeRename} renameTarget={renameTarget} setRenameTarget={setRenameTarget} nameInput={nameInput} setNameInput={setNameInput} confirmRename={confirmRename} />
      <LocalFolderModal localFolderModal={localFolderModal} setLocalFolderModal={setLocalFolderModal} localFolderType={localFolderType} setLocalFolderType={setLocalFolderType} localFolderName={localFolderName} setLocalFolderName={setLocalFolderName} createLocalFolder={createLocalFolder} />
      <QuarantineModal showQuarantineModal={showQuarantineModal} setShowQuarantineModal={setShowQuarantineModal} quarantineList={quarantineList} restoreMod={restoreMod} purgeMod={purgeMod} />
      
      {(missingImportMods && missingImportMods.length > 0) && pendingImportSet && (
        <MissingImportsAlert missingImportMods={missingImportMods} setMissingImportMods={setMissingImportMods} pendingImportSet={pendingImportSet} setPendingImportSet={setPendingImportSet} finalizeImport={finalizeImport} setIsDropzoneOpen={setIsDropzoneOpen} />
      )}
      
      {!showDefconAlert && <GlobalConfirmDialog />}
      
      <DropzoneSidePanel isDropzoneOpen={isDropzoneOpen} isDragging={isDragging} setIsDragging={setIsDragging} dropzoneState={dropzoneState} setIsDropzoneOpen={setIsDropzoneOpen} setDropzoneState={setDropzoneState} droppedFiles={droppedFiles} setDroppedFiles={setDroppedFiles} ingestProgress={ingestProgress} handleDroppedFiles={handleDroppedFiles} runRadarSweep={runRadarSweep} />
      
      <BrokenModsSidePanel showBrokenModal={showBrokenModal} setShowBrokenModal={setShowBrokenModal} modList={modList} playSets={playSets} activePlaySetIndex={activePlaySetIndex} toggleInActiveSet={toggleInActiveSet} />
      
      {!showDefconAlert && <BackupRestoreModals isBackingUp={isBackingUp} isRestoring={isRestoring} backupType={backupType} restoreType={restoreType} t={useLexicon().t} />}
      
      <IngestProgressModal ingestProgress={ingestProgress} />
      
      {showDefconAlert && <DefconAlert />}
      
      {yeetConfirmPending && <YeetConfirmAlert yeetConfirmPending={yeetConfirmPending} setYeetConfirmPending={setYeetConfirmPending} />}
      
      <DnaMatchQueueSidePanel dnaMatchQueue={dnaMatchQueue} setDnaMatchQueue={setDnaMatchQueue} ignoredHashesRef={ignoredHashesRef} runRadarSweep={runRadarSweep} setStatus={setStatus} setPlaySets={setPlaySets} activePlaySetIndex={activePlaySetIndex} />
      
      <ScoutQueueSidePanel scoutQueue={scoutQueue} setScoutQueue={setScoutQueue} onOpenScoutDossier={onOpenScoutDossier} />
      
      <SystemLogModal isLogExpanded={isLogExpanded} setIsLogExpanded={setIsLogExpanded} statusLog={statusLog} clearStatusLog={clearStatusLog} logModalRef={logModalRef} handleLogPointerDown={handleLogPointerDown} handleLogPointerMove={handleLogPointerMove} handleLogPointerUp={handleLogPointerUp} />
      
      <SystemStatusBar isSidebarCollapsed={isSidebarCollapsed} isNotificationSidebarOpen={props.isNotificationSidebarOpen} setIsNotificationSidebarOpen={props.setIsNotificationSidebarOpen} unreadNotificationCount={props.unreadNotificationCount} isLogExpanded={isLogExpanded} setIsLogExpanded={setIsLogExpanded} status={status} isScanning={isScanning} scanProgress={scanProgress} isErrorStatus={isErrorStatus} isSuccessStatus={isSuccessStatus} statusBgClass={statusBgClass} statusAccentClass={statusAccentClass} statusIconClass={statusIconClass} statusTextClass={statusTextClass} updatePayload={updatePayload} setIsSystemStatusOpen={setIsSystemStatusOpen} setIsSideBrowserOpen={setIsSideBrowserOpen} />
      
      <SystemStatusPanel isOpen={isSystemStatusOpen} onClose={() => setIsSystemStatusOpen(false)} />
      
      <SidePanelBrowser />
    </>
  );
}
