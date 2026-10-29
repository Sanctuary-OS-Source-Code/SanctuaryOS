import { invoke } from "@tauri-apps/api/core";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  PanelHeaderGroup,
  PanelHeaderButton,
  openModDossier,
} from "../../shared";
import ConflictResolutionSidebar from "../../side-panels/ConflictResolutionSidebar";

export function VaultModals(props: any) {
  const {
    isBulkMode,
    setIsBulkMode,
    t,
    selectedMods,
    setSelectedMods,
    setPurgeTargetFiles,
    purgeTargetFiles,
    setStatus,
    runRadarSweep,
    activeTier3Conflict,
    setActiveTier3Conflict,
    applyConflictOverride,
    playSets,
    activePlaySetIndex,
  } = props;

  const executePurge = async () => {
    if (!purgeTargetFiles) return;
    setStatus(t("status_purging_artifacts", "Deleting {mods}..."));
    try {
      const config: any = await invoke("get_saved_coordinates");
      const msg = await invoke("purge_vault_artifacts", {
        vaultPath: config.vault_path,
        filenames: purgeTargetFiles.map((f: any) => f.file),
      });
      setStatus(`${t("icon_check_circle", "check_circle")} ${msg}`);
      setIsBulkMode(false);
      setSelectedMods([]);
      setPurgeTargetFiles(null);
      runRadarSweep(false);
    } catch (err) {
      setStatus(`${t("status_error", "Error: ")}${err}`);
    }
  };

  return (
    <>
      {purgeTargetFiles && (
        <SidePanel
          isOpen={true}
          onClose={() => setPurgeTargetFiles(null)}
          title={
            !isBulkMode || selectedMods.length === 0
              ? t("btn_purge_folder", "{Delete} Archives")
              : t("btn_purge_selected", "{Delete} Selected")
          }
          subtitle={t("confirm_mass_purge_archive", "Confirm permanent deletion from Vault")}
          icon={t("icon_delete_forever", "delete_forever")}
          iconColorClass="text-[var(--danger)]"
          widthClass="w-[90vw] md:w-[680px]"
          backdropZ="z-[15000]"
          panelZ="z-[15001]"
          ambientGlows={
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[var(--danger)] opacity-10 blur-[120px] rounded-full pointer-events-none" />
          }
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_delete_forever", "delete_forever")}
                tooltip={t("btn_purge_folder", "{Delete} Archives")}
                variant="danger"
                onClick={executePurge}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_delete_forever", "delete_forever")}
              overline={t("purge", "Permanent Deletion")}
              title={
                !isBulkMode || selectedMods.length === 0
                  ? t("btn_purge_folder", "{Delete} Archives")
                  : t("btn_purge_selected", "{Delete} Selected")
              }
              description={t(
                "confirm_mass_purge_archive",
                "Review the artifacts queued for permanent removal from your local Vault."
              )}
              badge={`${purgeTargetFiles.length} ${t("term_mods", "Items")}`}
              variant="danger"
            />

            <UniversalGroup
              title={`${t("btn_purge_selected", "{Delete} Selected")} (${purgeTargetFiles.length})`}
              icon={t("icon_delete", "delete")}
              headerColorClass="text-[var(--danger)]"
            >
              <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                {purgeTargetFiles.map((target: any) => (
                  <div
                    key={target.file}
                    onClick={() => openModDossier(target.file)}
                    className="flex items-center gap-3.5 p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all hover:border-[color-mix(in_srgb,var(--danger)_35%,transparent)] glass-surface group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_delete", "delete")}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-black text-[var(--text)] capitalize truncate">
                        {target.name}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] truncate opacity-70 font-mono">
                        {target.file.split(/[\\/]/).pop()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </UniversalGroup>
          </div>
        </SidePanel>
      )}

      {activeTier3Conflict && (
        <div className="z-[9999] relative">
          <ConflictResolutionSidebar
            conflict={activeTier3Conflict}
            onClose={() => setActiveTier3Conflict(null)}
            onVault={() => {}}
            onOverride={(winnerName, modPair) => {
              applyConflictOverride(winnerName, modPair, playSets[activePlaySetIndex]?.name);
            }}
          />
        </div>
      )}
    </>
  );
}
