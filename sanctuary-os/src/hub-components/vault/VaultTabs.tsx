import React from 'react';
import { HoverTabDrawer, VerticalTabButton, DashboardStatTile, isVersionMatch } from "../../shared";
import { StatTileCarousel } from "../SharedCommandScreenLayout";

export const VaultTabs = React.memo(function VaultTabs({ t, equipFilter, setEquipFilter, equippedDisplayMods, displayModList, selectedVersion }: any) {
  const { allCount, devCount, archiveCount } = React.useMemo(() => {
    const list = displayModList || [];
    let baseCount = 0;
    let dev = 0;
    let archive = 0;

    for (let i = 0; i < list.length; i++) {
      const mod = list[i];
      if (!mod) continue;
      const modNameUpper = String(mod.displayName || mod.meta_name || mod.name || mod.title || "").toUpperCase().trim();
      const baseModName = modNameUpper.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || modNameUpper;
      if (baseModName === "FILTERS") continue;
      baseCount++;

      const isDev =
        mod.hash?.startsWith('dev_vault_') ||
        (typeof mod.status === 'string' && mod.status.toUpperCase().includes('SANDBOX')) ||
        (mod.physical_path && (mod.physical_path.toLowerCase().includes('/dev/') || mod.physical_path.toLowerCase().includes('\\dev\\')));
      if (isDev) {
        dev++;
      }

      if (selectedVersion && selectedVersion !== "") {
        if (!(mod.isVirtual && mod.isLocalOverride && (!mod.flavors || mod.flavors.length === 0))) {
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
          if (!isVersionMatch(modGameVersions, selectedVersion)) {
            archive++;
          }
        }
      }
    }

    return {
      allCount: Math.max(0, baseCount - dev - archive),
      devCount: dev,
      archiveCount: archive,
    };
  }, [displayModList, selectedVersion]);

  const equippedCount = equippedDisplayMods?.length || 0;
  const unequippedCount = Math.max(0, allCount - equippedCount);

  return (
    <>
      <div className="md:hidden">
        <HoverTabDrawer title={t("vault_title", "Your {Vault}")}>
          <VerticalTabButton id="OVERVIEW" icon={t("icon_space_dashboard", "space_dashboard")} label={t("tab_overview", "Overview")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="ALL" icon={t("icon_inventory_2", "inventory_2")} label={t("filter_all_vault", "Main")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="EQUIPPED" icon={t("icon_check_circle", "check_circle")} label={t("filter_equipped", "In {Blueprint}")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="UNEQUIPPED" icon={t("icon_cancel", "cancel")} label={t("filter_unequipped", "Not Equipped")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="DEV" icon={t("icon_code", "code")} label={t("filter_dev", "Sandbox")} activeTab={equipFilter} setTab={setEquipFilter} />
          <VerticalTabButton id="ARCHIVES" icon={t("icon_archive", "archive")} label={t("filter_archives", "Archives")} activeTab={equipFilter} setTab={setEquipFilter} />
        </HoverTabDrawer>
      </div>

      <div className="flex flex-col w-full gap-3 mb-8 md:mb-10">
        <StatTileCarousel>
          <DashboardStatTile variant="tab" icon={t("icon_space_dashboard", "space_dashboard")} label={t("tab_overview", "Overview")} number="" onClick={() => setEquipFilter("OVERVIEW")} isActive={equipFilter === "OVERVIEW"} />
          <DashboardStatTile variant="tab" icon={t("icon_inventory_2", "inventory_2")} label={t("filter_all_vault", "Main")} number={allCount} onClick={() => setEquipFilter("ALL")} isActive={equipFilter === "ALL"} />
          <DashboardStatTile variant="tab" icon={t("icon_check_circle", "check_circle")} label={t("filter_equipped", "In {Blueprint}")} number={equippedCount} onClick={() => setEquipFilter("EQUIPPED")} isActive={equipFilter === "EQUIPPED"} />
          <DashboardStatTile variant="tab" icon={t("icon_cancel", "cancel")} label={t("filter_unequipped", "Not Equipped")} number={unequippedCount} onClick={() => setEquipFilter("UNEQUIPPED")} isActive={equipFilter === "UNEQUIPPED"} />
          <DashboardStatTile variant="tab" icon={t("icon_code", "code")} label={t("filter_dev", "Sandbox")} number={devCount} onClick={() => setEquipFilter("DEV")} isActive={equipFilter === "DEV"} />
          <DashboardStatTile variant="tab" icon={t("icon_archive", "archive")} label={t("filter_archives", "Archives")} number={archiveCount !== undefined ? archiveCount : ""} onClick={() => setEquipFilter("ARCHIVES")} isActive={equipFilter === "ARCHIVES"} />
        </StatTileCarousel>
      </div>
    </>
  );
});
