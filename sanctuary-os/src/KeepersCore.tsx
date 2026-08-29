import React, { useState, useEffect } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HoverTabDrawer, VerticalTabButton, VerticalTabDropdown, EmptyState } from './shared';
import { IdentityMatrix } from './IdentityMatrix';
import MasonIDE from './MasonIDE';
import { WayfinderChameleons } from './hub-components/WayfinderChameleons';
import KeepersActiveGames from './hub-components/KeepersActiveGames';
import { KeeperCommandScreen } from "./hub-components/CommandScreens";
import KeepersSupportTickets from './hub-components/KeepersSupportTickets';
import { AuditLogViewer } from './side-panels/SAAuditLogViewer';
import { KeepersDispatchEditor } from './hub-components/KeepersDispatchEditor';
import KeepersWebNewsEditor from './hub-components/KeepersWebNewsEditor';
import KeepersWebLegalEditor from './hub-components/KeepersWebLegalEditor';
import KeeperSupportSettings from './hub-components/KeeperSupportSettings';

export default function KeepersCore() {
  const { t } = useLexicon();
  const activeTab = useStore(state => state.keepersActiveTab || "command_center");
  const setActiveTab = useStore(state => state.setKeepersActiveTab || (() => { }));

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader 
        title="KEEPERS CORE" 
        subtitle="CORE OS OVERSIGHT & INFRASTRUCTURE" 
        icon="admin_panel_settings" 
        iconColorClass="text-purple-400"
        breadcrumb={activeTab !== "command_center" ? activeTab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : undefined}
        onTitleClick={() => setActiveTab("command_center")}
      >
      </ViewHeader>

      <HoverTabDrawer title="Keepers Navigation" activeTab={activeTab} setTab={setActiveTab}>
        <VerticalTabButton id="command_center" icon={t("icon_desktop_windows")} label={t("wf_tab_command")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="keepers_comms" icon={t("icon_satellite_alt")} label={t("wf_tab_dispatch")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="web_news" icon="public" label="Website News" activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="web_legal" icon="gavel" label="Legal Documents" activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="active_games" icon="dns" label="Active Workspaces" activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="identities" icon="group" label="Citizen Oversight" activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="support" icon={t("icon_support_agent")} label="Support Center" activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="support_settings" icon={t("icon_support_agent")} label={t("wf_tab_support")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="audit_logs" icon={t("icon_history")} label={t("audit_title")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="ide" icon="code" label="Keepers IDE" activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="chameleons" icon="palette" label={t("wf_master_themes")} activeTab={activeTab} setTab={setActiveTab} />
      </HoverTabDrawer>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <KeeperCommandScreen setTab={setActiveTab} />}
        {activeTab === "keepers_comms" && <KeepersDispatchEditor authorId="system" authorProfileId="system" />}
        {activeTab === "web_news" && <KeepersWebNewsEditor />}
        {activeTab === "web_legal" && <KeepersWebLegalEditor />}
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
