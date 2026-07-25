import React, { useState, useEffect } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HubTabButton, HubTabDropdown, EmptyState } from './shared';
import { IdentityMatrix } from './IdentityMatrix';
import MasonIDE from './MasonIDE';
import { WayfinderChameleons } from './hub-components/WayfinderChameleons';
import KeepersActiveGames from './hub-components/KeepersActiveGames';
import KeepersSupportTickets from './hub-components/KeepersSupportTickets';
import KeeperSupportSettings from './hub-components/KeeperSupportSettings';
import { KeeperCommandScreen } from './hub-components/CommandScreens';
import { KeeperPostsEditor } from './hub-components/KeeperPostsEditor';
import { AuditLogViewer } from './side-panels/SAAuditLogViewer';

export default function KeepersCore() {
  const { t } = useLexicon();
  const activeTab = useStore(state => state.keepersActiveTab || "command_center");
  const session = useStore(state => state.session);
  const setActiveTab = useStore(state => state.setKeepersActiveTab || (() => { }));

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full flex-1 pb-48 relative">
      <ViewHeader title="KEEPERS CORE" subtitle="CORE OS OVERSIGHT & INFRASTRUCTURE" icon="admin_panel_settings" iconColorClass="text-purple-400 border-purple-500/30">
      </ViewHeader>

      <div className="flex flex-col gap-1 w-full mb-4 shrink-0">
        <div className="flex items-center overflow-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 shrink-0">
          <HubTabButton id="command_center" icon="dashboard" label="Command" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="dispatch" icon="satellite_alt" label="Dispatch" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="tickets" icon="local_activity" label="Support" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="active_games" icon="dns" label="Workspaces" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabDropdown 
            icon="more_horiz" 
            label="More Tools" 
            activeTab={activeTab} 
            setTab={setActiveTab} 
            options={[
              { id: 'identities', icon: 'group', label: 'Citizen Oversight' },
              { id: 'settings', icon: 'settings', label: t("keeper_tickets_settings") || "Support Settings" },
              { id: 'ide', icon: 'code', label: 'Keepers IDE' },
              { id: 'chameleons', icon: 'palette', label: 'Chameleons' },
              { id: 'audit_logs', icon: 'history', label: t("tab_audit") || "Audit Logs" }
            ]} 
          />
        </div>
      </div>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <KeeperCommandScreen setTab={setActiveTab} />}
        {activeTab === "dispatch" && <KeeperPostsEditor authorId={session?.user?.id || ''} authorProfileId={session?.user?.id || ''} />}
        {activeTab === "active_games" && <KeepersActiveGames />}
        {activeTab.startsWith("identities") && <IdentityMatrix isWayfinder={false} isKeepers={true} initialFilterRole={activeTab === "identities_admin" ? "admin" : activeTab === "identities_citizen" ? "citizen" : "all"} />}
        {activeTab === "tickets" && <KeepersSupportTickets />}
        {activeTab === "settings" && <KeeperSupportSettings />}
        {activeTab === "ide" && <MasonIDE isCloudMode={true} cloudTarget="sanctuary_lexicons" isKeepers={true} />}
        {activeTab === "chameleons" && <WayfinderChameleons isKeepers={true} />}
        {activeTab === "audit_logs" && <AuditLogViewer isKeepers={true} />}
      </div>
    </div>
  );
}
