import React, { useState, useEffect } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HubTabButton, HubTabDropdown, EmptyState } from './shared';
import { IdentityMatrix } from './IdentityMatrix';
import MasonIDE from './MasonIDE';
import { WayfinderChameleons } from './hub-components/WayfinderChameleons';
import KeepersActiveGames from './hub-components/KeepersActiveGames';
import { KeeperCommandScreen } from "./hub-components/CommandScreens";
import KeepersSupportTickets from './hub-components/KeepersSupportTickets';
import { AuditLogViewer } from './side-panels/SAAuditLogViewer';
import { WayfinderPostsEditor } from './hub-components/WayfinderPostsEditor';
import KeeperSupportSettings from './hub-components/KeeperSupportSettings';

export default function KeepersCore() {
  const { t } = useLexicon();
  const activeTab = useStore(state => state.keepersActiveTab || "command_center");
  const setActiveTab = useStore(state => state.setKeepersActiveTab || (() => { }));

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full flex-1 pb-48 relative">
      <ViewHeader title="KEEPERS CORE" subtitle="CORE OS OVERSIGHT & INFRASTRUCTURE" icon="admin_panel_settings" iconColorClass="text-purple-400">
      </ViewHeader>

      <div className="flex flex-col gap-1 w-full mb-4 shrink-0">
        <div className="flex items-center overflow-hidden accent-scrollbar glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner divide-x divide-white/5 shrink-0">
          <HubTabButton id="command_center" icon={t("icon_desktop_windows") || "desktop_windows"} label={t("wf_tab_command") || "Command Center"} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="keepers_comms" icon={t("icon_satellite_alt") || "satellite_alt"} label={t("wf_tab_dispatch") || "DISPATCH"} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="active_games" icon="dns" label="Active Workspaces" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="identities" icon="group" label="Citizen Oversight" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="support" icon={t("icon_support_agent") || "support_agent"} label="Support Center" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabDropdown
            icon="memory"
            label="System"
            activeTab={activeTab}
            setTab={setActiveTab}
            options={[
              { id: "support_settings", icon: t("icon_support_agent") || "support_agent", label: t("wf_tab_support") || "Support Settings" },
              { id: "audit_logs", icon: t("icon_history") || "history", label: t("audit_title") || "Audit Logs" },
              { id: "ide", icon: "code", label: "Keepers IDE" },
              { id: "chameleons", icon: "palette", label: "Chameleons" }
            ]}
          />
        </div>
      </div>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <KeeperCommandScreen setTab={setActiveTab} />}
        {activeTab === "keepers_comms" && <WayfinderPostsEditor authorId="system" authorProfileId="system" isOversight={true} isKeepers={true} />}
        {activeTab === "active_games" && <KeepersActiveGames />}
        {activeTab === "identities" && <IdentityMatrix isWayfinder={false} isKeepers={true} />}
        {activeTab === "support" && <KeepersSupportTickets />}
        {activeTab === "support_settings" && <KeeperSupportSettings />}
        {activeTab === "audit_logs" && <AuditLogViewer />}
        {activeTab === "ide" && <MasonIDE isCloudMode={true} cloudTarget="sanctuary_lexicons" isKeepers={true} />}
        {activeTab === "chameleons" && <WayfinderChameleons isKeepers={true} />}
      </div>
    </div>
  );
}
