import React from 'react';
import { HoverTabDrawer, VerticalTabButton } from "../../shared";

export function VaultTabs({ t, equipFilter, setEquipFilter }: any) {
  return (
    <HoverTabDrawer title="Vault Navigation">
      <VerticalTabButton id="OVERVIEW" icon="space_dashboard" label={t("tab_overview") || "OVERVIEW"} activeTab={equipFilter} setTab={setEquipFilter} />
      <VerticalTabButton id="ALL" icon="inventory_2" label={t("filter_all_vault") || "MAIN"} activeTab={equipFilter} setTab={setEquipFilter} />
      <VerticalTabButton id="EQUIPPED" icon="check_circle" label={t("filter_equipped") || "IN BLUEPRINT"} activeTab={equipFilter} setTab={setEquipFilter} />
      <VerticalTabButton id="UNEQUIPPED" icon="cancel" label={t("filter_unequipped") || "NOT EQUIPPED"} activeTab={equipFilter} setTab={setEquipFilter} />
      <VerticalTabButton id="DEV" icon="code" label={t("filter_dev") || "<> SANDBOX"} activeTab={equipFilter} setTab={setEquipFilter} />
      <VerticalTabButton id="ARCHIVES" icon="archive" label={t("filter_archives") || "ARCHIVES"} activeTab={equipFilter} setTab={setEquipFilter} />
    </HoverTabDrawer>
  );
}
