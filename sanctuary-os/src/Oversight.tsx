import { useState } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HoverTabDrawer, VerticalTabButton, SidebarFooterButton } from './shared';
import ArchitectSupportTickets from './hub-components/ArchitectSupportTickets';
import MasonPostViewer from './side-panels/MasonPostViewer';
import { FileVerificationSidePanel } from './side-panels/ArchitectSidePanels';
import ComplianceManualFlagSidePanel from './side-panels/ComplianceManualFlagSidePanel';
import { IdentityMatrix } from './IdentityMatrix';
import { SharedMetadataEditorSidePanel } from './side-panels/SharedMetadataEditorSidePanel';
import SAComplianceOversight from './hub-components/SAComplianceOversight';
import SAMalwareOversight from './hub-components/SAMalwareOversight';
import { WayfinderPostsEditor } from './hub-components/WayfinderPostsEditor';
import { OversightCommandScreen } from './hub-components/CommandScreens';
import { DefconSidePanel } from "./hub-components/SADefcon";
import { MassUpdateOversight } from "./hub-components/SAMassUpdateOversight";
import { GameManagementOversight } from "./hub-components/SAGameManagementOversight";
import { AuditLogViewer } from "./side-panels/SAAuditLogViewer";
import { NexusReportsViewer } from "./side-panels/NexusReportsViewer";
export default function Oversight({ userRole: _userRole, activeGameSchema: _activeGameSchema, onOpenMasonProfile }: any) {
    const { t } = useLexicon();
    const activeTab = useStore((state) => state.oversightActiveTab);
    const setActiveTab = useStore((state) => state.setOversightActiveTab);
    const [defconOpen, setDefconOpen] = useState(false);
    const [complianceFilter, setComplianceFilter] = useState("ALL");
    const [viewingPost, setViewingPost] = useState<any | null>(null);
    const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);
    const [verifyPanelInitialHash] = useState<string>("");
    const [showManualFlagModal, setShowManualFlagModal] = useState(false);
    const [initialManualFlagQuery, setInitialManualFlagQuery] = useState("");
    const [initialHeuristicEdit, setInitialHeuristicEdit] = useState<any>(null);
    const defconLevel = useStore((state) => state.defconLevel);
    const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
    const [metadataEditorInitialId, setMetadataEditorInitialId] = useState<string | undefined>(undefined);



    return (
        <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
            <ViewHeader
                title={t("sa_title", "Admin Command") || "Oversight Hub"}
                subtitle={t("sa_subtitle", "Compliance, enforcement, audit control, and emergency authority") || "Security & Compliance Enforcement"}
                icon={t("icon_admin_panel_settings", "admin_panel_settings") || "admin_panel_settings"}
                iconColorClass="text-[var(--danger)]"
                breadcrumb={activeTab !== "command_center" ? activeTab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : undefined}
                onTitleClick={() => setActiveTab("command_center")}
                hubActions={[
                    {
                        id: "hub_verify_hash",
                        icon: t("icon_verified_user", "verified_user") || "verified_user",
                        label: t("wf_hub_verify", "Verify Hash") || "Check Hash",
                        onClick: () => setIsVerifyPanelOpen(true)
                    }
                ]}
            />

            <div className="md:hidden">
                <HoverTabDrawer 
                    title="Oversight Navigation" 
                    activeTab={activeTab} 
                    setTab={setActiveTab}
                    hideMobilePills={true}
                    footer={
                        <>
                            <SidebarFooterButton
                                icon={t("icon_verified_user", "verified_user")}
                                label={t("wf_hub_verify", "Verify Hash")}
                                variant="glass"
                                className="w-full"
                                onClick={() => setIsVerifyPanelOpen(true)}
                            />
                            <SidebarFooterButton
                                icon={defconLevel === 1 ? "warning" : "security"}
                                label={<span className="truncate">{t("defcon_title", "Lockdown Override").replace("🚨 ", "").replace("⚠️ ", "")}</span>}
                                variant={defconLevel === 1 ? "danger" : "glass"}
                                className={`w-full ${defconLevel === 1 ? 'animate-pulse' : ''}`}
                                onClick={() => setDefconOpen(true)}
                            />
                        </>
                    }
                >
                    <VerticalTabButton id="command_center" icon={t("icon_desktop_windows", "desktop_windows")} label={t("wf_tab_command", "Command")} activeTab={activeTab} setTab={setActiveTab} />
                    <VerticalTabButton id="oversight_comms" icon={t("icon_satellite_alt", "satellite_alt")} label={t("wf_tab_dispatch", "Dispatch")} activeTab={activeTab} setTab={setActiveTab} />
                    <VerticalTabButton id="identities" icon={t("icon_group", "group")} label={t("tab_identities", "Identity")} activeTab={activeTab === "linker" ? "identities" : activeTab} setTab={setActiveTab} />
                    <VerticalTabButton id="compliance" icon={t("icon_policy", "policy")} label={t("tab_compliance", "Compliance")} activeTab={activeTab} setTab={setActiveTab} />

                    <VerticalTabButton id="malware_oversight" icon={t("icon_coronavirus", "coronavirus")} label={t("rating_malware", "Malware")} activeTab={activeTab === "oversight_reports" ? "malware_oversight" : activeTab} setTab={(id: string) => { setComplianceFilter('overview'); setActiveTab(id); }} />
                    <VerticalTabButton id="reports" icon={t("icon_flag", "flag")} label={t("stat_bugs", "Reports")} activeTab={activeTab} setTab={setActiveTab} />
                    <VerticalTabButton id="sanctuary_tickets" icon={t("icon_local_activity", "local_activity")} label={t("wf_tab_tickets", "Support")} activeTab={activeTab === "support_settings" ? "sanctuary_tickets" : activeTab} setTab={setActiveTab} />
                    <VerticalTabButton id="mass_update" icon={t("icon_dynamic_feed", "dynamic_feed")} label={t("tab_mass_update", "Mass Update")} activeTab={activeTab} setTab={setActiveTab} />
                    <VerticalTabButton id="game_versions" icon={t("icon_settings", "settings")} label={t("tab_game_versions", "Management")} activeTab={activeTab} setTab={setActiveTab} />

                    <VerticalTabButton id="audit_logs" icon={t("icon_history", "history")} label={t("tab_audit", "Logs")} activeTab={activeTab} setTab={setActiveTab} />
                </HoverTabDrawer>
            </div>

            <div className="w-full flex-1 flex flex-col min-h-0">
                {activeTab === "command_center" && <OversightCommandScreen setTab={setActiveTab} onOpenDefcon={() => setDefconOpen(true)} setComplianceFilter={setComplianceFilter} setViewingPost={setViewingPost} />}
                {(activeTab === "identities" || activeTab === "linker") && <IdentityMatrix initialFilterRole={activeTab === "linker" ? "verified_masons" : "overview"} />}
                {activeTab === "compliance" && <SAComplianceOversight initialFilter={complianceFilter} setInitialFilter={setComplianceFilter} onOpenManualFlag={(query: string, sig?: any) => {
                    setInitialManualFlagQuery(query);
                    if (sig) setInitialHeuristicEdit(sig);
                    setShowManualFlagModal(true);
                }} />}
                {(activeTab === "malware_oversight" || activeTab === "oversight_reports") && <SAMalwareOversight initialFilter={activeTab === "oversight_reports" ? "manifests" : complianceFilter} setInitialFilter={setComplianceFilter} onOpenManualFlag={(query: string, sig?: any) => {
                    setInitialManualFlagQuery(query);
                    if (sig) setInitialHeuristicEdit(sig);
                    setShowManualFlagModal(true);
                }} />}
                {activeTab === "mass_update" && <MassUpdateOversight />}
                {activeTab === "reports" && <NexusReportsViewer />}
                {activeTab === "game_versions" && <GameManagementOversight />}
                {activeTab === "oversight_comms" && <WayfinderPostsEditor authorId="system" authorProfileId="system" isOversight={true} />}
                {activeTab === "audit_logs" && <AuditLogViewer />}
                {(activeTab === "sanctuary_tickets" || activeTab === "support_settings") && <ArchitectSupportTickets userRole="oversight" initialTab={activeTab === "support_settings" ? "settings" : undefined} onEditMetadata={(hash) => {
                    setMetadataEditorInitialId(hash);
                    setIsMetadataEditorOpen(true);
                }} />}

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
                initialHeuristicEdit={initialHeuristicEdit}
                isMalwareOnly={activeTab === 'malware_oversight'}
            />
            {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId="oversight" onOpenMasonProfile={onOpenMasonProfile} />}
            <SharedMetadataEditorSidePanel
                isOpen={isMetadataEditorOpen}
                onClose={() => setIsMetadataEditorOpen(false)}
                initialModId={metadataEditorInitialId}
            />
        </div>
    );
}



