import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createPortal } from 'react-dom';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { ViewHeader, CustomDropdown, GameVersionMultiSelect, ModSearchDropdown, SidePanel, CustomComplianceDropdown, loadDLCMap, HoverTabDrawer, VerticalTabButton, VerticalTabDropdown, StatTile, standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, standardDangerButtonClass, standardAccentGlassButtonClass, CustomDatePicker, extractPostImage, stripMarkdown, EmptyState, ActionButton } from './shared';
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
                    : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
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
        <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
            <ViewHeader
                title={t("oversight_title")}
                subtitle={t("oversight_subtitle")}
                icon="admin_panel_settings"
                iconColorClass="text-[var(--danger)]"
                breadcrumb={activeTab !== "command_center" ? activeTab.replace(/_/g, ' ').toUpperCase() : undefined}
                onTitleClick={() => setActiveTab("command_center")}
            />

            <HoverTabDrawer 
                title="Oversight Navigation" 
                activeTab={activeTab} 
                setTab={setActiveTab}
                footer={
                    <>
                        <ActionButton
                            icon={t("icon_verified_user")}
                            label={t("wf_hub_verify")}
                            variant="glass"
                            className="w-full"
                            onClick={() => setIsVerifyPanelOpen(true)}
                        />
                        <ActionButton
                            icon={defconLevel === 1 ? "warning" : "security"}
                            label={<span className="truncate">{t("defcon_title") || "DEFCON OVERRIDE".replace("🚨 ", "").replace("⚠️ ", "")}</span>}
                            variant={defconLevel === 1 ? "danger" : "glass"}
                            className={`w-full ${defconLevel === 1 ? 'animate-pulse' : ''}`}
                            onClick={() => setDefconOpen(true)}
                        />
                    </>
                }
            >
                <VerticalTabButton id="command_center" icon={t("icon_desktop_windows")} label={t("wf_tab_command")} activeTab={activeTab} setTab={setActiveTab} />
                <VerticalTabButton id="oversight_comms" icon={t("icon_satellite_alt")} label={t("wf_tab_dispatch") || "DISPATCH"} activeTab={activeTab} setTab={setActiveTab} />
                <VerticalTabButton id="identities" icon={t("icon_group")} label={t("tab_identities")} activeTab={activeTab} setTab={setActiveTab} />
                <VerticalTabButton id="compliance" icon={t("icon_policy")} label={t("tab_compliance")} activeTab={activeTab} setTab={setActiveTab} />

                <VerticalTabButton id="linker" icon={t("icon_link")} label={t("tab_linker")} activeTab={activeTab} setTab={setActiveTab} />
                <VerticalTabButton id="malware_oversight" icon={t("icon_coronavirus")} label={t("rating_malware")} activeTab={activeTab} setTab={(id: string) => { setComplianceFilter('pending'); setActiveTab(id); }} />
                <VerticalTabButton id="oversight_reports" icon={t("icon_threat_intelligence")} label={t("tab_malware_logs")} activeTab={activeTab} setTab={setActiveTab} />
                <VerticalTabButton id="sanctuary_tickets" icon={t("icon_local_activity")} label={t("wf_tab_tickets")} activeTab={activeTab} setTab={setActiveTab} />
                <VerticalTabButton id="mass_update" icon={t("icon_dynamic_feed")} label={t("tab_mass_update")} activeTab={activeTab} setTab={setActiveTab} />
                <VerticalTabButton id="game_versions" icon={t("icon_settings")} label={t("tab_game_versions")} activeTab={activeTab} setTab={setActiveTab} />
                <VerticalTabButton id="support_settings" icon={t("icon_support_agent")} label={t("wf_tab_support")} activeTab={activeTab} setTab={setActiveTab} />
                <VerticalTabButton id="audit_logs" icon={t("icon_history")} label={t("tab_audit")} activeTab={activeTab} setTab={setActiveTab} />
            </HoverTabDrawer>

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

