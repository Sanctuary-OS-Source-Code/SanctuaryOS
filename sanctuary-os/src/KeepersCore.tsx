import React, { useState, useEffect } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HoverTabDrawer, VerticalTabButton, VerticalTabDropdown, EmptyState, SidebarFooterButton } from './shared';
import { IdentityMatrix } from './IdentityMatrix';
import MasonIDE from './MasonIDE';
import { WayfinderChameleons } from './hub-components/WayfinderChameleons';
import KeepersActiveGames from './hub-components/KeepersActiveGames';
import { KeeperCommandScreen } from "./hub-components/CommandScreens";
import KeepersSupportTickets from './hub-components/KeepersSupportTickets';
import { AuditLogViewer } from './side-panels/SAAuditLogViewer';
import { KeepersDispatchEditor } from './hub-components/KeepersDispatchEditor';
import KeepersWebNewsEditor from './hub-components/KeepersWebNewsEditor';
import KeepersWebDirectivesEditor from './hub-components/KeepersWebDirectivesEditor';
import KeepersWebLegalEditor from './hub-components/KeepersWebLegalEditor';
import KeeperSupportSettings from './hub-components/KeeperSupportSettings';
import KeepersHeuristicsOversight from './hub-components/KeepersHeuristicsOversight';
import { FileVerificationSidePanel } from './side-panels/ArchitectSidePanels';

export default function KeepersCore() {
  const { t } = useLexicon();
  const activeTab = useStore(state => state.keepersActiveTab);
  const setActiveTab = useStore(state => state.setKeepersActiveTab);
  const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader 
        title={t("keepers_core") || "KEEPERS CORE"} 
        subtitle={t("keepers_core_subtitle") || "CORE OS OVERSIGHT & INFRASTRUCTURE"} 
        icon={t("icon_admin_panel_settings") || "admin_panel_settings"} 
        iconColorClass="text-[var(--accent)]"
        breadcrumb={activeTab !== "command_center" ? activeTab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : undefined}
        onTitleClick={() => setActiveTab("command_center")}
        hubActions={[
          {
            id: "hub_verify_hash",
            icon: t("icon_verified_user") || "verified_user",
            label: t("wf_hub_verify") || "Check Hash",
            onClick: () => setIsVerifyPanelOpen(true)
          }
        ]}
      >
      </ViewHeader>

      <div className="md:hidden">
        <HoverTabDrawer
          title={t("keepers_navigation") || "Keepers Navigation"}
          activeTab={activeTab}
          setTab={setActiveTab}
          hideMobilePills={true}
          footer={
            <SidebarFooterButton
              icon={t("icon_verified_user") || "verified_user"}
              label={t("wf_hub_verify") || "Check Hash"}
              variant="glass"
              className="w-full"
              onClick={() => setIsVerifyPanelOpen(true)}
            />
          }
        >
          <VerticalTabButton id="command_center" icon={t("icon_desktop_windows") || "desktop_windows"} label={t("wf_tab_command") || "Command Center"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="keepers_comms" icon={t("icon_satellite_alt") || "satellite_alt"} label={t("wf_tab_dispatch") || "Dispatch"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="web_directives" icon={t("icon_folder_special") || "folder_special"} label={t("web_directives") || "System Directives"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="web_news" icon={t("icon_public") || "public"} label={t("web_news") || "Website News"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="web_legal" icon={t("icon_gavel") || "gavel"} label={t("hub_legal_docs") || "Legal Documents"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="active_games" icon={t("icon_dns") || "dns"} label={t("ui_active_games") || "Active Workspaces"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="identities" icon={t("icon_group") || "group"} label={t("citizen_oversight") || "Citizen Oversight"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="heuristics" icon={t("icon_shield_lock") || "shield_lock"} label={t("core_heuristics_tab") || "Core Heuristics"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="support" icon={t("icon_support_agent") || "support_agent"} label={t("hub_title_tickets") || "Support Center"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="support_settings" icon={t("icon_support_agent") || "support_agent"} label={t("wf_tab_support") || "Support"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="audit_logs" icon={t("icon_history") || "history"} label={t("audit_title") || "Audit Logs"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="ide" icon={t("icon_code") || "code"} label={t("keepers_ide") || "Keepers IDE"} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="chameleons" icon={t("icon_palette") || "palette"} label={t("wf_master_themes") || "Chameleons"} activeTab={activeTab} setTab={setActiveTab} />
        </HoverTabDrawer>
      </div>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <KeeperCommandScreen setTab={setActiveTab} />}
        {activeTab === "keepers_comms" && <KeepersDispatchEditor authorId="system" authorProfileId="system" />}
        {activeTab === "web_directives" && <KeepersWebDirectivesEditor />}
        {activeTab === "web_news" && <KeepersWebNewsEditor />}
        {activeTab === "web_legal" && <KeepersWebLegalEditor />}
        {activeTab === "active_games" && <KeepersActiveGames />}
        {activeTab === "identities" && <IdentityMatrix isWayfinder={false} isKeepers={true} />}
        {activeTab === "heuristics" && <KeepersHeuristicsOversight />}
        {activeTab === "support" && <KeepersSupportTickets />}
        {activeTab === "support_settings" && <KeeperSupportSettings />}
        {activeTab === "audit_logs" && <AuditLogViewer isKeepers={true} />}
        {activeTab === "ide" && <MasonIDE isCloudMode={true} cloudTarget="sanctuary_lexicons" isKeepers={true} />}
        {activeTab === "chameleons" && <WayfinderChameleons isKeepers={true} />}
      </div>

      <FileVerificationSidePanel
        isOpen={isVerifyPanelOpen}
        onClose={() => setIsVerifyPanelOpen(false)}
        isOversight={true}
      />
    </div>
  );
}
