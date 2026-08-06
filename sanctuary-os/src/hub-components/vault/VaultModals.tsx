import React from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { SidePanel, SidePanelActionFooter } from '../../shared';
import { VaultLocalFolderEditorSidePanel } from '../../side-panels/VaultSidePanels';
import ConflictResolutionSidebar from '../../side-panels/ConflictResolutionSidebar';

export function VaultModals(props: any) {
  const { isBulkMode, setIsBulkMode, t, selectedMods, setSelectedMods, displayModList, setBulkModal, setLocalFolderModal, finalVisibleMods, setPurgeTargetFiles, purgeTargetFiles, setStatus, runRadarSweep, isLocalFolderEditorOpen, setIsLocalFolderEditorOpen, confirmDeleteId, setConfirmDeleteId, renameFolderInput, setRenameFolderInput, activeLocalFolder, setActiveLocalFolder, activeTier3Conflict, setActiveTier3Conflict, applyConflictOverride, playSets, activePlaySetIndex } = props;
  return (
    <>
      {isBulkMode && createPortal(
        <div className="fixed bottom-16 right-0 z-[3000] pointer-events-none flex justify-center items-end" style={{ left: 'var(--sidebar-width, 288px)' }}>
          <div className="theme-glass-panel backdrop-blur-3xl px-8 py-4 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_100px_rgba(0,0,0,0.8)] pointer-events-auto flex items-center gap-4 transition-all animate-in slide-in-from-bottom-10">
            <button
              onClick={() => setIsBulkMode(false)}
              className="h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all text-[var(--text)]/80 hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-2 relative z-10"
            >
              <span className="material-symbols-outlined !text-[24px]">{t("icon_cancel")}</span>
              {t("nav_cancel")}
            </button>

            <div className="w-px h-8 bg-white/10 relative z-10" />

            <div className="flex flex-col items-center justify-center gap-1 px-4 min-w-[100px]">
              <span className="text-[var(--text)] font-black text-xl leading-none">{selectedMods.length}</span>
              <span className="text-[var(--text)] font-black text-[9px] tracking-[0.2em] opacity-80 leading-none mr-[-0.2em]">{t("shared_selected")}</span>
            </div>

            <div className="w-px h-8 bg-white/10 relative z-10" />

            <button
              onClick={() => {
                const allNames = finalVisibleMods.map((m: any) => m.name);
                if (allNames.length > 0) {
                  if (selectedMods.length > 0) {
                    setSelectedMods([]);
                  } else {
                    setSelectedMods(Array.from(new Set(allNames)));
                  }
                }
              }}
              className={`h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all flex items-center gap-2 relative z-10 ${selectedMods.length > 0
                ? 'text-[var(--danger)]/80 hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--danger)_20%,transparent)]'
                : 'text-[var(--text)]/80 hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]'
                }`}
            >
              <span className="material-symbols-outlined !text-[24px]">
                {selectedMods.length > 0 ? 'deselect' : 'library_add_check'}
              </span>
              {selectedMods.length > 0 ? (t("clear") || "CLEAR") : (t("btn_select_all") || "SELECT ALL")}
            </button>

            <div className="w-px h-8 bg-white/10 relative z-10" />

            <button
              onClick={() => setBulkModal(true)}
              disabled={selectedMods.length === 0}
              className="h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(var(--accent-rgb),0.2)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative z-10 hover:scale-105 active:scale-95"
            >
              <span className="material-symbols-outlined !text-[28px]">{t("icon_architecture")}</span>
              {t("status_draft_blueprint")}
            </button>

            <button
              onClick={() => setLocalFolderModal(true)}
              disabled={selectedMods.length === 0}
              className="h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(var(--success-rgb),0.2)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative z-10 hover:scale-105 active:scale-95"
            >
              <span className="material-symbols-outlined !text-[28px]">{t("icon_create_new_folder")}</span>
              {t("btn_group_folder")}
            </button>

            <div className="w-px h-8 bg-white/10 relative z-10" />

            <button
              disabled={selectedMods.length === 0}
              onClick={() => {
                const allFilesToPurge = new Map<string, string>();
                selectedMods.forEach((modName: string) => {
                  const mod = displayModList.find((m: any) => m.name === modName);
                  if (mod && mod.isVirtual && mod.flavors) {
                    mod.flavors.forEach((f: any) => {
                      if (f.name) allFilesToPurge.set(f.name, mod.displayName || mod.name);
                    });
                  } else {
                    allFilesToPurge.set(modName, mod?.displayName || modName);
                  }
                });
                setPurgeTargetFiles(Array.from(allFilesToPurge.entries()).map(([file, name]) => ({ file, name })));
              }}
              className="h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(var(--danger-rgb),0.2)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative z-10 hover:scale-105 active:scale-95"
            >
              <span className="material-symbols-outlined !text-[28px]">{t("icon_delete_forever")}</span>
              {t("btn_purge_artifacts")}
            </button>
          </div>
        </div>, document.body
      )}

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
          footer={
            <SidePanelActionFooter
              actionLabel={t("btn_purge_folder")}
              actionIcon="delete_forever"
              actionVariant="danger"
              onAction={async () => {
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
              cancelLabel={t("nav_cancel")}
              onCancel={() => setPurgeTargetFiles(null)}
            />
          }
        >
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-4 min-h-[300px]">
            <div className="grid grid-cols-1 gap-2">
              {purgeTargetFiles.map((target: any) => (
                <div key={target.file} className="flex items-center gap-4 p-3 rounded-xl border border-white/5 transition-all hover:bg-white/5 hover:border-white/10 theme-glass-panel group">
                  <div className="w-8 h-8 rounded-full bg-[var(--danger)]/10 text-[var(--danger)] flex items-center justify-center shrink-0 shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_10%,transparent)]">
                    <span className="material-symbols-outlined !text-[16px] opacity-70 group-hover:opacity-100 transition-opacity">delete</span>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[11px] font-black text-[var(--text)] uppercase truncate">
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


      <VaultLocalFolderEditorSidePanel
        isOpen={isLocalFolderEditorOpen}
        onClose={() => { setIsLocalFolderEditorOpen(false); setConfirmDeleteId(null); setRenameFolderInput(""); }}
        activeLocalFolder={activeLocalFolder}
        setActiveLocalFolder={setActiveLocalFolder}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        renameFolderInput={renameFolderInput}
        setRenameFolderInput={setRenameFolderInput}
        runRadarSweep={runRadarSweep}
        displayModList={displayModList}
      />

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
