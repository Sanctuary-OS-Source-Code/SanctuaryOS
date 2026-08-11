import React from 'react';

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
      <div onClick={() => { setActiveCategory("all"); setFilterStatus("ALL"); setEquipFilter("ALL"); }} className="glass-panel rounded-[var(--radius)] p-5 flex flex-col justify-start cursor-pointer group hover:-translate-y-1 transition-all" style={{ backgroundColor: 'rgba(var(--text-rgb), 0.04)', borderColor: 'rgba(var(--text-rgb), 0.1)' }}>
        <div className="flex items-center gap-3 text-[var(--text)]">
          <span className="material-symbols-outlined !text-4xl opacity-80 group-hover:scale-110 transition-transform duration-300">{t("icon_inventory_2") || "inventory_2"}</span>
          <div className="text-4xl font-black">{displayModList.length}</div>
        </div>
        <div className="text-[10px] uppercase font-bold tracking-widest opacity-60 mt-3">{t("filter_all") || "YOUR ARTIFACTS"}</div>
      </div>

      <div onClick={() => { setActiveCategory("equipped"); setEquipFilter("EQUIPPED"); }} className="glass-panel rounded-[var(--radius)] p-5 flex flex-col justify-start cursor-pointer group hover:-translate-y-1 transition-all bg-emerald-500/[5%] border-emerald-500/[20%] hover:bg-emerald-500/[10%] hover:border-emerald-500/[40%]">
        <div className="flex items-center gap-3 text-emerald-500">
          <span className="material-symbols-outlined !text-4xl opacity-80 group-hover:scale-110 transition-transform duration-300">{t("icon_check_circle") || "check_circle"}</span>
          <div className="text-4xl font-black">{equippedDisplayMods.length}</div>
        </div>
        <div className="text-[10px] uppercase font-bold tracking-widest opacity-60 mt-3 text-emerald-500">{t("filter_equipped") || "IN BLUEPRINT"}</div>
      </div>

      <div onClick={() => { setActiveCategory("all"); setFilterStatus("unverified"); }} className="glass-panel rounded-[var(--radius)] p-5 flex flex-col justify-start cursor-pointer group hover:-translate-y-1 transition-all bg-orange-500/[5%] border-orange-500/[20%] hover:bg-orange-500/[10%] hover:border-orange-500/[40%]">
        <div className="flex items-center gap-3 text-orange-500">
          <span className="material-symbols-outlined !text-4xl opacity-80 group-hover:scale-110 transition-transform duration-300">{t("icon_help_outline") || "help_outline"}</span>
          <div className="text-4xl font-black">{unverifiedCount}</div>
        </div>
        <div className="text-[10px] uppercase font-bold tracking-widest opacity-60 mt-3 text-orange-500">{t("status_unverified") || "UNVERIFIED"}</div>
      </div>

      <div onClick={() => setLocalFolderModal(true)} className="glass-panel rounded-[var(--radius)] p-5 flex flex-col justify-start cursor-pointer group hover:-translate-y-1 transition-all bg-purple-500/[5%] border-purple-500/[20%] hover:bg-purple-500/[10%] hover:border-purple-500/[40%]">
        <div className="flex items-center gap-3 text-purple-500">
          <span className="material-symbols-outlined !text-4xl opacity-80 group-hover:scale-110 transition-transform duration-300">{t("icon_account_tree") || "account_tree"}</span>
          <div className="text-4xl font-black">{localFolderCount}</div>
        </div>
        <div className="text-[10px] uppercase font-bold tracking-widest opacity-60 mt-3 text-purple-500">{t("filter_local") || "LOCAL FOLDERS"}</div>
      </div>
    </div>
  );
}
