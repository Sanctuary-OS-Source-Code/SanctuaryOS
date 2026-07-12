import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createPortal } from 'react-dom';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { ViewHeader, CustomDropdown, GameVersionMultiSelect, ModSearchDropdown, SidePanel, CustomComplianceDropdown, loadDLCMap, HubTabButton, HubTabDropdown, StatTile, standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, standardDangerButtonClass, standardAccentGlassButtonClass, CustomDatePicker, extractPostImage, stripMarkdown, EmptyState } from './shared';
import ArchitectSupportTickets from './hub-components/ArchitectSupportTickets';
import SASupportSettings from './hub-components/SASupportSettings';
import MasonPostViewer from './side-panels/MasonPostViewer';
import { FileVerificationSidePanel } from './side-panels/ArchitectSidePanels';
import ComplianceManualFlagSidePanel from './side-panels/ComplianceManualFlagSidePanel';
import { IdentityMatrix, SharedIdentityEditor, CustomRoleSelect, ROLES } from './IdentityMatrix';
import { SharedMetadataEditorSidePanel } from './side-panels/SharedMetadataEditorSidePanel';
import SAOversightReports from './hub-components/SAOversightReports';
import SAComplianceOversight from './hub-components/SAComplianceOversight';
import SAMalwareOversight from './hub-components/SAMalwareOversight';
import { WayfinderPostsEditor } from './hub-components/WayfinderPostsEditor';
import { SanctuaryAlertsSidePanel } from './side-panels/SanctuaryAlertsSidePanel';
import { OversightCommandScreen } from './hub-components/CommandScreens';

function TabButton({ id, label, activeTab, setTab }: any) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2
        ${isActive
          ? 'theme-bg-accent text-[var(--bg)] shadow-lg'
          : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:bg-white/5'
        }`}
    >
      {label}
    </button>
  );
}

const fetchAllPaginated = async (queryFn: () => any) => { let allData: any[] = []; let from = 0; const step = 999; while (true) { const { data, error } = await queryFn().range(from, from + step); if (error || !data || data.length === 0) break; allData = [...allData, ...data]; if (data.length <= step) break; from += step + 1; } return { data: allData, error: null }; };

import { DefconPanel, DefconSidePanel } from "./hub-components/SADefcon";
import { MasonLinker, ProfileSearchDropdown } from "./hub-components/SAMasonLinker";
import { WayfinderComms } from "./hub-components/SAWayfinderComms";
import { MassUpdateOversight } from "./hub-components/SAMassUpdateOversight";
import { GameManagementOversight } from "./hub-components/SAGameManagementOversight";
import { AuditLogViewer } from "./side-panels/SAAuditLogViewer";
export default function Oversight({ onOpenMasonProfile }: any) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState("command_center");
  const [defconOpen, setDefconOpen] = useState(false);
  const [complianceFilter, setComplianceFilter] = useState("ALL");
  const [viewingPost, setViewingPost] = useState<any | null>(null);
  const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);
  const [verifyPanelInitialHash, setVerifyPanelInitialHash] = useState<string>("");
  const [showManualFlagModal, setShowManualFlagModal] = useState(false);
  const [initialManualFlagQuery, setInitialManualFlagQuery] = useState("");
  const [initialHeuristicEdit, setInitialHeuristicEdit] = useState<any>(null);
  const defconLevel = useStore((state) => state.defconLevel);
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
  const [metadataEditorInitialId, setMetadataEditorInitialId] = useState<string | undefined>(undefined);



  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-32 relative">
      <ViewHeader
        title={t("sa_title")}
        subtitle={t("sa_subtitle")}
        icon={t("icon_security")}
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
        <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner">
          <button
            onClick={() => setIsVerifyPanelOpen(true)}
            className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black"
          >
            <span className="material-symbols-outlined text-xl normal-case">{t("icon_verified_user")}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{t("wf_hub_verify")}</span>
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
        <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 shrink-0">
          <HubTabButton id="command_center" icon={t("icon_desktop_windows")} label={t("sidebar_command")} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="oversight_comms" icon={t("icon_satellite_alt")} label={t("wf_tab_dispatch") || "DISPATCH"} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="identities" icon={t("icon_group")} label={t("tab_identities")} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="compliance" icon={t("icon_policy")} label={t("tab_compliance")} activeTab={activeTab} setTab={setActiveTab} />
          
          
          
          <HubTabDropdown 
            icon="admin_panel_settings" 
            label="Moderation" 
            activeTab={activeTab} 
            setTab={(id: string) => { if (id === 'malware_oversight') setComplianceFilter('pending'); setActiveTab(id); }}
            options={[
              { id: "linker", icon: t("icon_link"), label: t("tab_linker") },
              { id: "malware_oversight", icon: t("icon_coronavirus"), label: t("tab_malware_oversight") },
              { id: "oversight_reports", icon: t("icon_threat_intelligence"), label: t("tab_malware_logs") },
              { id: "sanctuary_tickets", icon: t("icon_local_activity"), label: t("wf_tab_tickets") }
            ]} 
          />
          
          <HubTabDropdown 
            icon="memory" 
            label="System" 
            activeTab={activeTab} 
            setTab={setActiveTab}
            options={[
              { id: "mass_update", icon: t("icon_dynamic_feed"), label: t("tab_mass_update") },
              { id: "game_versions", icon: t("icon_settings"), label: t("tab_game_versions") },
              { id: "support_settings", icon: t("icon_support_agent"), label: t("wf_tab_support") },
              { id: "audit_logs", icon: t("icon_history"), label: t("tab_audit") }
            ]} 
          />
        </div>
      </div>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <OversightCommandScreen setTab={setActiveTab} onOpenDefcon={() => setDefconOpen(true)} setComplianceFilter={setComplianceFilter} setViewingPost={setViewingPost} />}
        {activeTab === "identities" && <IdentityMatrix />}
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
        {activeTab === "mass_update" && <MassUpdateOversight />}
        {activeTab === "game_versions" && <GameManagementOversight />}
        {activeTab === "oversight_reports" && <SAOversightReports />}
        {activeTab === "oversight_comms" && <WayfinderPostsEditor authorId="system" authorProfileId="system" isOversight={true} />}
        {activeTab === "audit_logs" && <AuditLogViewer />}
        {activeTab === "sanctuary_tickets" && <ArchitectSupportTickets userRole="oversight" onEditMetadata={(hash) => {
          setMetadataEditorInitialId(hash);
          setIsMetadataEditorOpen(true);
        }} />}
        {activeTab === "support_settings" && <SASupportSettings />}
      </div>

      <DefconSidePanel isOpen={defconOpen} onClose={() => setDefconOpen(false)} />
      <FileVerificationSidePanel
        isOpen={isVerifyPanelOpen}
        onClose={() => setIsVerifyPanelOpen(false)}
        isOversight={true}
        initialHash={verifyPanelInitialHash}
        onManualFlag={(hash) => {
          setInitialManualFlagQuery(hash);
          setShowManualFlagModal(true);
        }}
      />
      <ComplianceManualFlagSidePanel
        isOpen={showManualFlagModal}
        onClose={() => { setShowManualFlagModal(false); setInitialHeuristicEdit(null); }}
        initialQuery={initialManualFlagQuery}
        initialHeuristicSig={initialHeuristicEdit}
        isMalwareOnly={activeTab === 'malware_oversight'}
      />
      {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId="oversight" onOpenMasonProfile={onOpenMasonProfile} />}
    </div>
  );
}

