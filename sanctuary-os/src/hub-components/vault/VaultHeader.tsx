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
  const localFolderCount = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]").length;

  return (
    <>
      <CommandScreenStats>
        <DashboardStatTile
          icon={<span className="material-symbols-outlined ">{t("icon_inventory_2")}</span>}
          number={modList.length}
          label={t("title_artifacts")}
          colorClass="text-[var(--text)] cursor-pointer"
          onClick={() => { setViewMode("grid"); setEquipFilter("ALL"); setFilterStatus("ALL"); }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined ">{t("icon_check_circle")}</span>}
          number={equippedDisplayMods.length}
          label={t("filter_equipped")}
          colorClass="text-[var(--success)] cursor-pointer"
          onClick={() => { setViewMode("grid"); setEquipFilter("EQUIPPED"); setFilterStatus("ALL"); }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined ">{t("icon_help_outline")}</span>}
          number={unverifiedCount}
          label={t("unverified")}
          colorClass="text-[var(--warning)] cursor-pointer"
          onClick={() => { setViewMode("grid"); setEquipFilter("ALL"); setFilterStatus("UNVERIFIED"); }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined ">{t("icon_account_tree")}</span>}
          number={localFolderCount}
          label={t("local_folders")}
          colorClass="text-purple-500 cursor-pointer"
          onClick={() => setLocalFolderModal(true)}
        />
      </CommandScreenStats>

      <CommandScreenSidebar title={t("quick_actions")} icon="bolt">
        <div className="flex flex-col gap-4">
          <CommandScreenQuickLink
            icon={t("icon_checklist")}
            title={t("ui_btn_bulk")}
            subtitle={t("ui_btn_bulk_desc")}
            onClick={() => { setViewMode("grid"); setIsBulkMode(true); }}
            textColorClass="text-emerald-500"
            hoverTextColorClass="group-hover:text-emerald-400"
            iconShadowClass="drop-shadow-md text-emerald-500"
            iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]"
          />
          <CommandScreenQuickLink
            icon={t("icon_account_tree")}
            title={t("ui_btn_edit_folder")}
            subtitle={t("ui_btn_edit_folder_desc")}
            onClick={() => setLocalFolderModal(true)}
            textColorClass="text-purple-500"
            hoverTextColorClass="group-hover:text-purple-400"
            iconShadowClass="drop-shadow-md text-purple-500"
            iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
          />
          <CommandScreenQuickLink
            icon={t("icon_delete_sweep")}
            title={t("btn_purge_archives")}
            subtitle={t("purge_archives_desc")}
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
            iconShadowClass="drop-shadow-md text-rose-500"
            iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
          />
          <CommandScreenQuickLink
            icon={t("icon_auto_awesome")}
            title={t("tab_nexus")}
            subtitle={t("hub_title_market")}
            onClick={() => useStore.getState().setView("nexus")}
            textColorClass="text-amber-500"
            hoverTextColorClass="group-hover:text-amber-400"
            iconShadowClass="drop-shadow-md text-amber-500"
            iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
          />
        </div>
      </CommandScreenSidebar>
    </>
  );
}
