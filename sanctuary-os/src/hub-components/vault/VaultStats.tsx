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
      <div onClick={() => { setActiveCategory("all"); setFilterStatus("ALL"); setEquipFilter("ALL"); }} className="theme-glass-panel rounded-[var(--radius)] p-4 flex flex-col justify-between cursor-pointer hover:border-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_30%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] group">
        <div className="flex items-center gap-3 text-[var(--text)]">
          <span className="material-symbols-outlined !text-4xl opacity-80 group-hover:scale-110 transition-transform">{t("icon_inventory_2") || "inventory_2"}</span>
          <div className="text-4xl font-black text-[var(--text)]">{displayModList.length}</div>
        </div>
        <div className="text-[10px] uppercase font-black tracking-widest text-[var(--text)] opacity-60 mt-4">{t("filter_all") || "YOUR ARTIFACTS"}</div>
      </div>
      
      <div onClick={() => { setActiveCategory("equipped"); setEquipFilter("EQUIPPED"); }} className="theme-glass-panel rounded-[var(--radius)] p-4 flex flex-col justify-between cursor-pointer hover:border-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] transition-all border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)] group">
        <div className="flex items-center gap-3 text-[var(--success)]">
          <span className="material-symbols-outlined !text-4xl opacity-80 group-hover:scale-110 transition-transform">{t("icon_check_circle") || "check_circle"}</span>
          <div className="text-4xl font-black text-[var(--success)]">{equippedDisplayMods.length}</div>
        </div>
        <div className="text-[10px] uppercase font-black tracking-widest text-[var(--success)] opacity-60 mt-4">{t("filter_equipped") || "IN BLUEPRINT"}</div>
      </div>

      <div onClick={() => { setActiveCategory("all"); setFilterStatus("unverified"); }} className="theme-glass-panel rounded-[var(--radius)] p-4 flex flex-col justify-between cursor-pointer hover:border-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] transition-all border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] group">
        <div className="flex items-center gap-3 text-[var(--warning)]">
          <span className="material-symbols-outlined !text-4xl opacity-80 group-hover:scale-110 transition-transform">{t("icon_help_outline") || "help_outline"}</span>
          <div className="text-4xl font-black text-[var(--warning)]">{unverifiedCount}</div>
        </div>
        <div className="text-[10px] uppercase font-black tracking-widest text-[var(--warning)] opacity-60 mt-4">{t("status_unverified") || "UNVERIFIED"}</div>
      </div>

      <div onClick={() => setLocalFolderModal(true)} className="theme-glass-panel rounded-[var(--radius)] p-4 flex flex-col justify-between cursor-pointer hover:border-[var(--info)] hover:bg-[color-mix(in_srgb,var(--info)_10%,transparent)] transition-all border border-[color-mix(in_srgb,var(--info)_30%,transparent)] bg-[color-mix(in_srgb,var(--info)_5%,transparent)] group">
        <div className="flex items-center gap-3 text-[var(--info)]">
          <span className="material-symbols-outlined !text-4xl opacity-80 group-hover:scale-110 transition-transform">{t("icon_account_tree") || "account_tree"}</span>
          <div className="text-4xl font-black text-[var(--info)]">{localFolderCount}</div>
        </div>
        <div className="text-[10px] uppercase font-black tracking-widest text-[var(--info)] opacity-60 mt-4">{t("filter_local") || "LOCAL FOLDERS"}</div>
      </div>
    </div>
  );
}
