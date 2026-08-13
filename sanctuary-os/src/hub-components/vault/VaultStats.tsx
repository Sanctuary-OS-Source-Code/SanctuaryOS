import React from 'react';
import { DashboardStatTile } from '../../shared';

export function VaultStats({
  t,
  displayModList,
  equippedDisplayMods,
  unverifiedCount,
  localFolderCount,
  setActiveCategory,
  setFilterStatus,
  setEquipFilter,
  setLocalFolderModal
}: any) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <DashboardStatTile
        icon={<span className="material-symbols-outlined">{t("icon_inventory_2")}</span>}
        number={displayModList.length}
        label={t("filter_all")}
        colorClass="text-[var(--text)]"
        onClick={() => { setActiveCategory("all"); setFilterStatus("ALL"); setEquipFilter("ALL"); }}
      />

      <DashboardStatTile
        icon={<span className="material-symbols-outlined">{t("icon_check_circle")}</span>}
        number={equippedDisplayMods.length}
        label={t("filter_equipped")}
        colorClass="text-emerald-500"
        onClick={() => { setActiveCategory("equipped"); setEquipFilter("EQUIPPED"); }}
      />

      <DashboardStatTile
        icon={<span className="material-symbols-outlined">{t("icon_help_outline")}</span>}
        number={unverifiedCount}
        label={t("status_unverified")}
        colorClass="text-orange-500"
        onClick={() => { setActiveCategory("all"); setFilterStatus("unverified"); }}
      />

      <DashboardStatTile
        icon={<span className="material-symbols-outlined">{t("icon_account_tree")}</span>}
        number={localFolderCount}
        label={t("filter_local")}
        colorClass="text-purple-500"
        onClick={() => setLocalFolderModal(true)}
      />
    </div>
  );
}
