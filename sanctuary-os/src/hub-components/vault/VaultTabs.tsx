import React from 'react';
import { HubTabButton } from "../../shared";

export function VaultTabs({ t, equipFilter, setEquipFilter }: any) {
  return (
    <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
      <HubTabButton id="OVERVIEW" icon="space_dashboard" label={t("tab_overview") || "OVERVIEW"} activeTab={equipFilter} setTab={setEquipFilter} />
      <HubTabButton id="ALL" icon="inventory_2" label={t("filter_all_vault") || "MAIN"} activeTab={equipFilter} setTab={setEquipFilter} />
      <HubTabButton id="EQUIPPED" icon="check_circle" label={t("filter_equipped") || "IN BLUEPRINT"} activeTab={equipFilter} setTab={setEquipFilter} />
      <HubTabButton id="UNEQUIPPED" icon="cancel" label={t("filter_unequipped") || "NOT EQUIPPED"} activeTab={equipFilter} setTab={setEquipFilter} />
      <HubTabButton id="DEV" icon="code" label={t("filter_dev") || "<> SANDBOX"} activeTab={equipFilter} setTab={setEquipFilter} />
      <HubTabButton id="ARCHIVES" icon="archive" label={t("filter_archives") || "ARCHIVES"} activeTab={equipFilter} setTab={setEquipFilter} />
    </div>
  );
}
