import { invoke } from "@tauri-apps/api/core";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  HoverTooltip,
  VAULT_CHIP_CLASS,
  formatDisplayName,
  getModIcon,
  isScriptExtension,
  getHighestVersion,
  openModDossier,
} from "../../shared";
import { formatCleanModTitle } from "../../side-panels/CommandIncompatiblePanel";
import { useStore } from "../../store";
import ConflictResolutionSidebar from "../../side-panels/ConflictResolutionSidebar";

export function VaultModals(props: any) {
  const {
    isBulkMode,
    setIsBulkMode,
    t,
    selectedMods,
    setSelectedMods,
    displayModList,
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
  const activeGameSchema = useStore((s: any) => s.activeGameSchema);

  const executePurge = async () => {
    if (!purgeTargetFiles || purgeTargetFiles.length === 0) return;
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

  const resolvePurgeItemMeta = (target: any) => {
    const list = Array.isArray(displayModList) ? displayModList : [];
    const targetFile = String(target?.file || "");
    const targetBase = (targetFile.split(/[\\/]/).pop() || targetFile).toLowerCase();
    let matchedMod: any = null;
    let parentMod: any = null;

    for (const m of list) {
      if (!m) continue;
      if (
        m.name === targetFile ||
        (m.name && (String(m.name).split(/[\\/]/).pop() || "").toLowerCase() === targetBase)
      ) {
        matchedMod = m;
        break;
      }
      if (Array.isArray(m.flavors)) {
        const sub = m.flavors.find(
          (f: any) =>
            f?.name === targetFile ||
            (f?.name && (String(f.name).split(/[\\/]/).pop() || "").toLowerCase() === targetBase)
        );
        if (sub) {
          matchedMod = sub;
          parentMod = m;
          break;
        }
      }
    }

    const rawDisplay = formatDisplayName(
      matchedMod?.displayName || target?.name || targetBase || targetFile
    );
    const cleanTitle = formatCleanModTitle(rawDisplay) || rawDisplay;
    const rawAuthor = matchedMod?.author || parentMod?.author || "";
    const author =
      !rawAuthor || String(rawAuthor).trim().toLowerCase() === "unknown"
        ? t("unknown", "Unknown")
        : String(rawAuthor).trim();
    const isScript =
      isScriptExtension(targetFile, activeGameSchema) ||
      String(matchedMod?.type || "").toLowerCase().includes("script");
    const typeLabel = isScript
      ? t("type_script", "Script")
      : t("type_package", "Package");
    const rawCompat = matchedMod?.compatible_versions || parentMod?.compatible_versions;
    const compatArr = Array.isArray(rawCompat)
      ? rawCompat
      : typeof rawCompat === "string"
        ? rawCompat.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
    const gameVer = compatArr.length > 0 ? getHighestVersion(compatArr) : null;
    const iconName = getModIcon(
      matchedMod || { name: targetFile, type: isScript ? "Script" : "Package" },
      activeGameSchema,
      t
    );

    return { cleanTitle, author, isScript, typeLabel, gameVer, iconName };
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
          widthClass="w-[90vw] md:w-[720px]"
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
              badgeIcon={t("icon_inventory_2", "inventory_2")}
              variant="danger"
            >
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <ActionButton
                  variant="glass"
                  icon={t("icon_close", "close")}
                  label={t("cancel", "Cancel")}
                  onClick={() => setPurgeTargetFiles(null)}
                />
                <ActionButton
                  variant="danger"
                  icon={t("icon_delete_forever", "delete_forever")}
                  label={
                    !isBulkMode || selectedMods.length === 0
                      ? t("btn_purge_folder", "{Delete} Archives")
                      : t("btn_purge_selected", "{Delete} Selected")
                  }
                  onClick={executePurge}
                />
              </div>
            </SidePanelHeroCard>

            <UniversalGroup
              title={`${t("btn_purge_selected", "{Delete} Selected")} (${purgeTargetFiles.length})`}
              icon={t("icon_delete", "delete")}
              headerColorClass="text-[var(--danger)]"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                {purgeTargetFiles.map((target: any) => {
                  const meta = resolvePurgeItemMeta(target);
                  return (
                    <div
                      key={target.file}
                      onClick={() => openModDossier(target.file)}
                      className="flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--danger)_24%,rgba(255,255,255,0.12))] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] transition-all cursor-pointer group"
                    >
                      {/* Top Row: Liquid Glass Icon Well + Clean Title & Subtitle */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[20px]">
                            {meta.iconName}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--danger)] transition-colors">
                            {meta.cleanTitle}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                            <span className="truncate">{meta.author}</span>
                            <span className="opacity-40 shrink-0">•</span>
                            <span className="opacity-85 shrink-0">{meta.typeLabel}</span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Status & Action Bar */}
                      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--subtext)]">
                              {meta.isScript
                                ? t("icon_terminal", "terminal")
                                : t("icon_deployed_code", "deployed_code")}
                            </span>
                            <span>{meta.typeLabel}</span>
                          </span>
                          {meta.gameVer && meta.gameVer !== "Unknown" && (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--danger)]">
                                {t("icon_sports_esports", "sports_esports")}
                              </span>
                              <span>{meta.gameVer}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModDossier(target.file);
                            }}
                            className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                          >
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_open_in_new", "open_in_new")}
                            </span>
                            <HoverTooltip
                              className="z-[100] !right-0 !translate-x-0 !left-auto"
                              title={t("btn_inspect", "Inspect {Mod}")}
                              icon={t("icon_open_in_new", "open_in_new")}
                            />
                          </button>
                          {purgeTargetFiles.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = purgeTargetFiles.filter(
                                  (p: any) => p.file !== target.file
                                );
                                setPurgeTargetFiles(next.length > 0 ? next : null);
                              }}
                              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--warning)] text-[var(--subtext)] hover:text-[var(--warning)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                            >
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_close", "close")}
                              </span>
                              <HoverTooltip
                                className="z-[100] !right-0 !translate-x-0 !left-auto"
                                title={t("btn_remove", "{Remove}")}
                                icon={t("icon_close", "close")}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
