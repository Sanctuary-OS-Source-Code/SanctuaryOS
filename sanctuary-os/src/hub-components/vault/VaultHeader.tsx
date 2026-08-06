import React from 'react';
import { CommandScreenStats, DashboardStatTile, CommandScreenSidebar, CommandScreenQuickLink } from "../SharedCommandScreenLayout";
import { isVersionMatch } from "../../shared";

export function VaultHeader({
  t,
  modList,
  equippedDisplayMods,
  displayModList,
  setViewMode,
  setEquipFilter,
  setFilterStatus,
  setIsBulkMode,
  setLocalFolderModal,
  setPurgeTargetFiles,
  useStore,
  selectedVersion
}: any) {
  const unverifiedCount = displayModList.filter((m: any) => m.status === 'unverified' || !m.dbId).length;
  const localFolderCount = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]").length;

  return (
    <>
      <CommandScreenStats>
        <DashboardStatTile
          icon={<span className="material-symbols-outlined !text-4xl">{t("icon_inventory_2") || "inventory_2"}</span>}
          number={modList.length}
          label={t("title_artifacts") || "TOTAL ARTIFACTS"}
          colorClass="border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[var(--text)] hover:border-[var(--text)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_20%,transparent)] cursor-pointer"
          onClick={() => { setViewMode("grid"); setEquipFilter("ALL"); setFilterStatus("ALL"); }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined !text-4xl">{t("icon_check_circle") || "check_circle"}</span>}
          number={equippedDisplayMods.length}
          label={t("filter_equipped") || "EQUIPPED"}
          colorClass="border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] cursor-pointer"
          onClick={() => { setViewMode("grid"); setEquipFilter("EQUIPPED"); setFilterStatus("ALL"); }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined !text-4xl">{t("icon_help_outline") || "help_outline"}</span>}
          number={unverifiedCount}
          label={t("unverified") || "UNVERIFIED"}
          colorClass="border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] hover:border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] cursor-pointer"
          onClick={() => { setViewMode("grid"); setEquipFilter("ALL"); setFilterStatus("UNVERIFIED"); }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined !text-4xl">{t("icon_account_tree") || "account_tree"}</span>}
          number={localFolderCount}
          label={t("local_folders") || "LOCAL FOLDERS"}
          colorClass="border-[color-mix(in_srgb,var(--purple)_30%,transparent)] text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20 cursor-pointer"
          onClick={() => setLocalFolderModal(true)}
        />
      </CommandScreenStats>

      <CommandScreenSidebar title={t("quick_actions") || "QUICK ACTIONS"} icon="bolt">
        <div className="flex flex-col gap-4">
          <CommandScreenQuickLink
            icon={t("icon_checklist") || "checklist"}
            title={t("ui_btn_bulk") || "BULK ACTIONS"}
            subtitle={t("ui_btn_bulk_desc") || "MASS SELECTION AND MANAGEMENT"}
            onClick={() => { setViewMode("grid"); setIsBulkMode(true); }}
            textColorClass="text-emerald-500"
            hoverTextColorClass="group-hover:text-emerald-400"
            iconShadowClass="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)] text-emerald-500"
            iconBorderHoverClass="group-hover:border-emerald-500/30"
          />
          <CommandScreenQuickLink
            icon={t("icon_account_tree") || "account_tree"}
            title={t("ui_btn_edit_folder") || "CONFIGURE FOLDERS"}
            subtitle={t("ui_btn_edit_folder_desc") || "MANAGE VIRTUAL DIRECTORIES"}
            onClick={() => setLocalFolderModal(true)}
            textColorClass="text-purple-500"
            hoverTextColorClass="group-hover:text-purple-400"
            iconShadowClass="drop-shadow-[0_0_8px_rgba(168,85,247,0.5)] text-purple-500"
            iconBorderHoverClass="group-hover:border-purple-500/30"
          />
          <CommandScreenQuickLink
            icon={t("icon_delete_sweep") || "delete_sweep"}
            title={t("btn_purge_archives") || "PURGE ARCHIVES"}
            subtitle={t("purge_archives_desc") || "CLEAN UP OUTDATED ARTIFACTS"}
            onClick={() => {
              const allFilesToPurge = new Map<string, string>();

              displayModList.forEach((mod: any) => {
                let modGameVersions: string[] = [];
                if (mod.isVirtual) {
                  modGameVersions = Array.from(new Set((mod.flavors || []).flatMap((f: any) => {
                    const v = f.compatible_versions;
                    if (!v) return [];
                    if (typeof v === 'string') return v.split(',').map((s: string) => s.trim()).filter(Boolean);
                    return Array.isArray(v) ? v : [];
                  }))).filter(Boolean) as string[];
                } else {
                  const v = mod.compatible_versions;
                  if (typeof v === 'string') {
                    modGameVersions = v.split(',').map((s: string) => s.trim()).filter(Boolean);
                  } else {
                    modGameVersions = Array.isArray(v) ? v : [];
                  }
                }

                let isCompatibleWithOS = true;
                if (selectedVersion && selectedVersion !== "") {
                  isCompatibleWithOS = isVersionMatch(modGameVersions, selectedVersion);
                }

                if (!isCompatibleWithOS || mod.status === 'outdated' || mod.status === 'unverified') {
                  if (mod.isVirtual && mod.flavors) {
                    mod.flavors.forEach((f: any) => {
                      if (f.name) allFilesToPurge.set(f.name, mod.displayName || mod.name);
                    });
                  } else if (mod.name) {
                    allFilesToPurge.set(mod.name, mod.displayName || mod.name);
                  }
                }
              });

              setPurgeTargetFiles(Array.from(allFilesToPurge.entries()).map(([file, name]) => ({ file, name })));
            }}
            textColorClass="text-rose-500"
            hoverTextColorClass="group-hover:text-rose-400"
            iconShadowClass="drop-shadow-[0_0_8px_rgba(244,63,94,0.5)] text-rose-500"
            iconBorderHoverClass="group-hover:border-rose-500/30"
          />
          <CommandScreenQuickLink
            icon={t("icon_auto_awesome") || "auto_awesome"}
            title={t("tab_nexus") || "EXPLORE NEXUS"}
            subtitle={t("hub_title_market") || "DISCOVER NEW ARTIFACTS"}
            onClick={() => useStore.getState().setView("nexus")}
            textColorClass="text-amber-500"
            hoverTextColorClass="group-hover:text-amber-400"
            iconShadowClass="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] text-amber-500"
            iconBorderHoverClass="group-hover:border-amber-500/30"
          />
        </div>
      </CommandScreenSidebar>
    </>
  );
}
