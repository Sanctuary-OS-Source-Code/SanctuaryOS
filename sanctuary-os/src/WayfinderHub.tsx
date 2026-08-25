import { DashboardStatTile } from "./shared";
import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { WayfinderCommandScreen } from "./hub-components/CommandScreens";
import { ViewHeader, HoverTabDrawer, VerticalTabButton, ActionButton, SidebarFooterButton, VerticalTabDropdown, SidePanel, extractPostImage, stripMarkdown, EmptyState } from './shared';
import ArchitectSupportTickets from './hub-components/ArchitectSupportTickets';


import GlobalFeed from './GlobalFeed';
import MasonBugReports from './MasonBugReports';
import SASupportSettings from './hub-components/SASupportSettings';
import { AuditLogViewer } from './side-panels/SAAuditLogViewer';
import { DefconSidePanel } from './hub-components/SADefcon';
import { MasonLinker } from './hub-components/SAMasonLinker';
import MasonIDE from './MasonIDE';
import SAComplianceOversight from './hub-components/SAComplianceOversight';
import SAMalwareOversight from './hub-components/SAMalwareOversight';
import MasonPostViewer from './side-panels/MasonPostViewer';
import SystemBroadcastsFeed from './SystemBroadcastsFeed';
import { IdentityMatrix } from './IdentityMatrix';
import { WayfinderPostsEditor } from './hub-components/WayfinderPostsEditor';
import { WayfinderChameleons } from './hub-components/WayfinderChameleons';
import { NexusReportsViewer } from './side-panels/NexusReportsViewer';
import { FileVerificationSidePanel } from './side-panels/ArchitectSidePanels';
import ComplianceManualFlagSidePanel from './side-panels/ComplianceManualFlagSidePanel';
import SAOversightReports from './hub-components/SAOversightReports';
import { SanctuaryAlertsSidePanel } from './side-panels/SanctuaryAlertsSidePanel';

import { ServerHealthSidePanel } from './side-panels/WayfinderSidePanels';

export default function WayfinderHub({ onOpenMasonProfile }: { onOpenMasonProfile?: (id: string) => void }) {
  const { t } = useLexicon();
  const { session } = useStore();
  const activeTab = useStore(state => state.wayfinderActiveTab);
  const setActiveTab = useStore(state => state.setWayfinderActiveTab);
  const [complianceFilter, setComplianceFilter] = useState("ALL");
  const [showManualFlagModal, setShowManualFlagModal] = useState(false);
  const [initialManualFlagQuery, setInitialManualFlagQuery] = useState("");
  const [defconOpen, setDefconOpen] = useState(false);
  const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);
  const [verifyPanelInitialHash, setVerifyPanelInitialHash] = useState("");
  const [initialHeuristicEdit, setInitialHeuristicEdit] = useState<any>(null);
  const defconLevel = useStore((state) => state.defconLevel);

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader title={t("wf_hub_title")} subtitle={t("wf_hub_subtitle")} icon={t("icon_terminal")} iconColorClass="text-[var(--success)]" breadcrumb={activeTab !== "command_center" ? activeTab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : undefined} onTitleClick={() => setActiveTab("command_center")} />

      <HoverTabDrawer 
        title="Wayfinder Navigation" 
        activeTab={activeTab} 
        setTab={setActiveTab}
        footer={
          <>
            <SidebarFooterButton
              icon={t("icon_verified_user")}
              label={t("wf_hub_verify")}
              variant="glass"
              className="w-full"
              onClick={() => setIsVerifyPanelOpen(true)}
            />
            <SidebarFooterButton
              icon={defconLevel === 1 ? "warning" : "security"}
              label={<span className="truncate">{t("defcon_title").replace("🚨 ", "").replace("⚠️ ", "")}</span>}
              variant={defconLevel === 1 ? "danger" : "glass"}
              className={`w-full ${defconLevel === 1 ? 'animate-pulse' : ''}`}
              onClick={() => setDefconOpen(true)}
            />
          </>
        }
      >
        <VerticalTabButton id="command_center" icon={t("icon_desktop_windows")} label={t("wf_tab_command")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="wf_comms_title" icon={t("icon_satellite_alt")} label={t("wf_tab_dispatch")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="sanctuary_tickets" icon={t("icon_local_activity")} label={t("wf_tab_tickets")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="identities" icon={t("icon_group")} label={t("tab_identities")} activeTab={activeTab} setTab={setActiveTab} />

        <VerticalTabButton id="linker" icon={t("icon_link")} label={t("tab_linker")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="compliance" icon={t("icon_policy")} label={t("tab_compliance")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="malware_oversight" icon={t("icon_coronavirus")} label={t("rating_malware")} activeTab={activeTab} setTab={(id: string) => { setComplianceFilter('pending'); setActiveTab(id); }} />
        <VerticalTabButton id="oversight_reports" icon={t("icon_threat_intelligence")} label={t("tab_malware_logs")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="reports" icon={t("icon_flag")} label={t("stat_bugs")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="audit_logs" icon={t("icon_history")} label={t("tab_audit")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="support_settings" icon={t("icon_support_agent")} label={t("wf_tab_support")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="ide" icon="code" label="WAYFINDER IDE" activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="chameleons" icon="palette" label={t("wf_master_themes")} activeTab={activeTab} setTab={setActiveTab} />
      </HoverTabDrawer>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <WayfinderCommandScreen setTab={setActiveTab} setComplianceFilter={setComplianceFilter} onOpenMasonProfile={onOpenMasonProfile} />}
        {activeTab === "wf_comms_title" && <WayfinderPostsEditor authorId={session?.user?.id || ""} authorProfileId={session?.user?.id || ""} />}
        {activeTab === "identities" && <IdentityMatrix isWayfinder={true} />}
        {activeTab === "linker" && <MasonLinker />}
        {activeTab === "compliance" && <SAComplianceOversight initialFilter={complianceFilter} setInitialFilter={setComplianceFilter} onOpenManualFlag={(query: string, sig?: any) => {
          setInitialManualFlagQuery(query);
          if (sig) setInitialHeuristicEdit(sig);
          setShowManualFlagModal(true);
        }} />}
        {activeTab === "malware_oversight" && <SAMalwareOversight initialFilter={complianceFilter} setInitialFilter={setComplianceFilter} onOpenManualFlag={(query: string, sig?: any) => {
          setInitialManualFlagQuery(query);
          if (sig) setInitialHeuristicEdit(sig);
          setShowManualFlagModal(true);
        }} />}
        {activeTab === "reports" && <NexusReportsViewer onOpenDossier={(report: any) => { }} />}
        {activeTab === "oversight_reports" && <SAOversightReports />}
        {activeTab === "sanctuary_tickets" && <ArchitectSupportTickets userRole="wayfinder" />}
        {activeTab === "support_settings" && <SASupportSettings />}
        {activeTab === "audit_logs" && <AuditLogViewer />}
        {activeTab === "ide" && <MasonIDE isCloudMode={true} cloudTarget="sanctuary_lexicons" />}
        {activeTab === "chameleons" && <WayfinderChameleons />}
        {activeTab !== "command_center" && activeTab !== "wf_comms_title" && activeTab !== "identities" && activeTab !== "linker" && activeTab !== "compliance" && activeTab !== "malware_oversight" && activeTab !== "reports" && activeTab !== "oversight_reports" && activeTab !== "sanctuary_tickets" && activeTab !== "support_settings" && activeTab !== "audit_logs" && activeTab !== "ide" && activeTab !== "chameleons" && (
          <EmptyState icon={t("icon_construction")} title={t("wf_under_construction")} className="col-span-full py-16" />
        )}
      </div>

      <DefconSidePanel isOpen={defconOpen} onClose={() => setDefconOpen(false)} />
      <FileVerificationSidePanel
        isOpen={isVerifyPanelOpen}
        onClose={() => setIsVerifyPanelOpen(false)}
        isOversight={true}
        initialHash={verifyPanelInitialHash}
        onManualFlag={(hash: string) => {
          setInitialManualFlagQuery(hash);
          setShowManualFlagModal(true);
        }}
      />
      <ComplianceManualFlagSidePanel
        isOpen={showManualFlagModal}
        onClose={() => { setShowManualFlagModal(false); setInitialHeuristicEdit(null); }}
        initialQuery={initialManualFlagQuery}
        initialHeuristicEdit={initialHeuristicEdit}
        sourceHub="Sanctuary OS [Wayfinder]"
        isMalwareOnly={activeTab === 'malware_oversight'}
      />
    </div>
  );
}




