import React from 'react';
import { HoverTabDrawer, VerticalTabButton, DashboardStatTile } from "../../shared";
import { StatTileCarousel } from "../SharedCommandScreenLayout";

import { isVersionMatch } from "../../shared";

export function VaultTabs({ t, equipFilter, setEquipFilter, finalVisibleMods, equippedDisplayMods, visibleMods, displayModList, selectedVersion }: any) {
  const baseVisibleMods = displayModList?.filter((mod: any) => {
      const modNameUpper = String(mod.displayName || mod.meta_name || mod.name || mod.title || "").toUpperCase().trim();
      const baseModName = modNameUpper.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || modNameUpper;
      if (baseModName === "FILTERS") return false;
      return true;
  }) || [];
  
  const devCount = displayModList?.filter((m: any) => {
    return m.hash?.startsWith('dev_vault_') || 
      (typeof m.status === 'string' && m.status.toUpperCase().includes('SANDBOX')) || 
      (m.physical_path && (m.physical_path.toLowerCase().includes('/dev/') || m.physical_path.toLowerCase().includes('\\dev\\')));
  }).length || 0;

  const archiveCount = displayModList?.filter((mod: any) => {
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
    if (selectedVersion && selectedVersion !== "") {
      if (mod.isVirtual && mod.isLocalOverride && (!mod.flavors || mod.flavors.length === 0)) {
        return false;
      }
      return !isVersionMatch(modGameVersions, selectedVersion);
    }
  }).length || 0;

  const allCount = Math.max(0, baseVisibleMods.length - devCount - archiveCount);
  const equippedCount = equippedDisplayMods?.length || 0;
  const unequippedCount = Math.max(0, allCount - equippedCount);

  return (
    <>
      <div className="md:hidden">
        <HoverTabDrawer title="Vault Navigation">
          <VerticalTabButton id="OVERVIEW" icon="space_dashboard" label={t("tab_overview")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="ALL" icon="inventory_2" label={t("filter_all_vault")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="EQUIPPED" icon="check_circle" label={t("filter_equipped")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="UNEQUIPPED" icon="cancel" label={t("filter_unequipped")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="DEV" icon="code" label={t("filter_dev")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="ARCHIVES" icon="archive" label={t("filter_archives")} activeTab={equipFilter} setTab={setEquipFilter} />
        </HoverTabDrawer>
      </div>

      <div className="hidden md:flex flex-col w-full gap-3 mb-6">
        <StatTileCarousel>
          <DashboardStatTile variant="tab" icon="space_dashboard" label={t("tab_overview")} number="" onClick={() => setEquipFilter("OVERVIEW")} isActive={equipFilter === "OVERVIEW"} />
          <DashboardStatTile variant="tab" icon="inventory_2" label={t("filter_all_vault")} number={allCount} onClick={() => setEquipFilter("ALL")} isActive={equipFilter === "ALL"} />
          <DashboardStatTile variant="tab" icon="check_circle" label={t("filter_equipped")} number={equippedCount} onClick={() => setEquipFilter("EQUIPPED")} isActive={equipFilter === "EQUIPPED"} />
          <DashboardStatTile variant="tab" icon="cancel" label={t("filter_unequipped")} number={unequippedCount} onClick={() => setEquipFilter("UNEQUIPPED")} isActive={equipFilter === "UNEQUIPPED"} />
          <DashboardStatTile variant="tab" icon="code" label={t("filter_dev")} number={devCount} onClick={() => setEquipFilter("DEV")} isActive={equipFilter === "DEV"} />
          <DashboardStatTile variant="tab" icon="archive" label={t("filter_archives")} number={archiveCount !== undefined ? archiveCount : ""} onClick={() => setEquipFilter("ARCHIVES")} isActive={equipFilter === "ARCHIVES"} />
        </StatTileCarousel>
      </div>
    </>
  );
}
