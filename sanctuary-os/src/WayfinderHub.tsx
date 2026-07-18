import { DashboardStatTile } from "./shared";
import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { WayfinderCommandScreen } from "./hub-components/CommandScreens";
import { ViewHeader, HubTabButton, HubTabDropdown, SidePanel, extractPostImage, stripMarkdown, EmptyState } from './shared';
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
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader title={t("wf_hub_title")} subtitle={t("wf_hub_subtitle")} icon={t("icon_terminal")} iconColorClass="text-indigo-400 border-indigo-500/30">
        <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner">
          <button
            onClick={() => setIsVerifyPanelOpen(true)}
            className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 border border-transparent text-[var(--text)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] hover:border-[var(--accent)]/50 font-black uppercase tracking-widest text-[10px] group"
          >
            <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("icon_verified_user")}</span>
            {t("wf_hub_verify")}
          </button>

          

          <button
            onClick={() => setDefconOpen(true)}
            className={`h-12 px-6 rounded-none transition-all flex items-center justify-center gap-3 shrink-0 font-black uppercase tracking-widest border border-transparent ${defconLevel === 1
              ? 'text-red-400 hover:text-red-300 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)] bg-red-500/10 hover:bg-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse'
              : 'text-[var(--text)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] hover:border-[var(--accent)]/50'
              }`}
          >
            <span className={`material-symbols-outlined !text-[24px] ${defconLevel === 1 ? 'animate-bounce' : 'opacity-70'}`}>
              {defconLevel === 1 ? 'warning' : 'security'}
            </span>
            <span className="text-[10px]">{t("defcon_title") || "DEFCON OVERRIDE".replace("🚨 ", "").replace("⚠️ ", "")}</span>
          </button>
        </div>
      </ViewHeader>

      <div className="flex flex-col gap-1 w-full mb-4 shrink-0">
        <div className="flex items-center overflow-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 shrink-0">
          <HubTabButton id="command_center" icon={t("icon_desktop_windows")} label={t("wf_tab_command")} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="wf_comms_title" icon={t("icon_satellite_alt")} label={t("wf_tab_dispatch")} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="sanctuary_tickets" icon={t("icon_local_activity")} label={t("wf_tab_tickets")} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="identities" icon={t("icon_group")} label={t("tab_identities")} activeTab={activeTab} setTab={setActiveTab} />
          
          
          
          <HubTabDropdown 
            icon="admin_panel_settings" 
            label="Moderation" 
            activeTab={activeTab} 
            setTab={(id: string) => { if (id === 'malware_oversight') setComplianceFilter('pending'); setActiveTab(id); }}
            options={[
              { id: "linker", icon: t("icon_link"), label: t("tab_linker") },
              { id: "compliance", icon: t("icon_policy"), label: t("tab_compliance") },
              { id: "malware_oversight", icon: t("icon_coronavirus"), label: t("rating_malware") },
              { id: "oversight_reports", icon: t("icon_threat_intelligence"), label: t("tab_malware_logs") },
              { id: "reports", icon: t("icon_flag"), label: t("stat_bugs") },
              { id: "audit_logs", icon: t("icon_history"), label: t("tab_audit") }
            ]} 
          />
          <HubTabDropdown 
            icon="memory" 
            label="System" 
            activeTab={activeTab} 
            setTab={setActiveTab}
            options={[
              { id: "support_settings", icon: t("icon_support_agent"), label: t("wf_tab_support") },
              { id: "ide", icon: "code", label: "WAYFINDER IDE" }
            ]} 
          />
        </div>
      </div>

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
        {activeTab === "ide" && <MasonIDE isCloudMode={true} cloudTarget="sanctuary_schemas" />}
        {activeTab !== "command_center" && activeTab !== "wf_comms_title" && activeTab !== "identities" && activeTab !== "linker" && activeTab !== "compliance" && activeTab !== "malware_oversight" && activeTab !== "reports" && activeTab !== "oversight_reports" && activeTab !== "sanctuary_tickets" && activeTab !== "support_settings" && activeTab !== "audit_logs" && activeTab !== "ide" && (
          <EmptyState icon={t("icon_construction") || "construction"} title={t("wf_under_construction")} className="col-span-full py-16" />
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




