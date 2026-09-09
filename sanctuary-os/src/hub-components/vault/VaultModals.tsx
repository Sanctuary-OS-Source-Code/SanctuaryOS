import React from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { SidePanel, PanelHeaderGroup, PanelHeaderButton } from '../../shared';
import { VaultLocalFolderEditorSidePanel } from '../../side-panels/VaultSidePanels';
import ConflictResolutionSidebar from '../../side-panels/ConflictResolutionSidebar';

export function VaultModals(props: any) {
  const { isBulkMode, setIsBulkMode, bulkAddTarget, setBulkAddTarget, t, selectedMods, setSelectedMods, displayModList, setBulkModal, setLocalFolderModal, finalVisibleMods, setPurgeTargetFiles, purgeTargetFiles, setStatus, runRadarSweep, isLocalFolderEditorOpen, setIsLocalFolderEditorOpen, confirmDeleteId, setConfirmDeleteId, renameFolderInput, setRenameFolderInput, activeLocalFolder, setActiveLocalFolder, activeTier3Conflict, setActiveTier3Conflict, applyConflictOverride, playSets, activePlaySetIndex } = props;
  return (
    <>
      {purgeTargetFiles && (
        <SidePanel
          isOpen={true}
          onClose={() => setPurgeTargetFiles(null)}
          title={(!isBulkMode || selectedMods.length === 0) ? (t("btn_purge_folder")) : (t("btn_purge_selected"))}
          subtitle={t("confirm_mass_purge_archive")}
          icon="delete_forever"
          iconColorClass="text-[var(--danger)]"
          widthClass="w-[600px]"
          backdropZ="z-[15000]"
          panelZ="z-[15001]"
          ambientGlows={
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[var(--danger)] opacity-10 blur-[120px] rounded-full pointer-events-none" />
          }
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon="delete_forever"
                tooltip={t("btn_purge_folder")}
                variant="danger"
                onClick={async () => {
                  setStatus(t("status_purging_artifacts"));
                  try {
                    const config: any = await invoke("get_saved_coordinates");
                    const msg = await invoke("purge_vault_artifacts", {
                      vaultPath: config.vault_path,
                      filenames: purgeTargetFiles.map((f: any) => f.file),
                    });
                    setStatus(`${t("icon_check_circle")} ${msg}`);
                    setIsBulkMode(false);
                    setSelectedMods([]);
                    setPurgeTargetFiles(null);
                    runRadarSweep(false);
                  } catch (err) {
                    setStatus(`${t("status_error")}${err}`);
                  }
                }}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-4 min-h-[300px]">
            <div className="grid grid-cols-1 gap-2">
              {purgeTargetFiles.map((target: any) => (
                <div key={target.file} className="flex items-center gap-4 p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] glass-panel group">
                  <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0 shadow-md">
                    <span className="material-symbols-outlined !text-[16px] opacity-70 group-hover:opacity-100 transition-opacity">delete</span>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[11px] font-black text-[var(--text)] capitalize truncate">
                      {target.name}
                    </span>
                    <span className="text-[9px] font-bold text-[var(--subtext)] truncate opacity-60 font-mono">
                      {target.file.split(/[\\/]/).pop()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SidePanel>
      )}


      {activeTier3Conflict && (
        <div className="z-[9999] relative">
          <ConflictResolutionSidebar
            conflict={activeTier3Conflict}
            onClose={() => setActiveTier3Conflict(null)}
            onVault={() => { }}
            onOverride={(winnerName, modPair) => {
              applyConflictOverride(winnerName, modPair, playSets[activePlaySetIndex]?.name);
            }}
          />
        </div>
      )}

    </>
  );
}


