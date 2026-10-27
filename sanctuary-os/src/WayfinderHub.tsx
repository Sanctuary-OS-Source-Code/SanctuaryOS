import { useState } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { WayfinderCommandScreen } from "./hub-components/CommandScreens";
import { ViewHeader, HoverTabDrawer, VerticalTabButton, SidebarFooterButton, EmptyState } from './shared';
import ArchitectSupportTickets from './hub-components/ArchitectSupportTickets';
import { DefconSidePanel } from './hub-components/SADefcon';
import WayfinderMasterSchemas from './hub-components/WayfinderMasterSchemas';
import SAComplianceOversight from './hub-components/SAComplianceOversight';
import SAMalwareOversight from './hub-components/SAMalwareOversight';
import { IdentityMatrix } from './IdentityMatrix';
import { WayfinderPostsEditor } from './hub-components/WayfinderPostsEditor';
import { WayfinderChameleons } from './hub-components/WayfinderChameleons';
import { NexusReportsViewer } from './side-panels/NexusReportsViewer';
import { FileVerificationSidePanel } from './side-panels/ArchitectSidePanels';
import ComplianceManualFlagSidePanel from './side-panels/ComplianceManualFlagSidePanel';

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
  const [verifyPanelInitialHash] = useState("");
  const [initialHeuristicEdit, setInitialHeuristicEdit] = useState<any>(null);
  const defconLevel = useStore((state) => state.defconLevel);

  const breadcrumbMap: Record<string, string> = {
    wf_comms_title: t("wf_tab_dispatch", "Dispatch"),
    sanctuary_tickets: t("wf_tab_tickets", "Support"),
    identities: t("tab_identities", "Identity"),
    linker: t("tab_linker", "{Masons}"),
    compliance: t("tab_compliance", "Compliance"),
    malware_oversight: t("rating_malware", "Malware"),
    oversight_reports: t("tab_malware_logs", "Manifests"),
    reports: t("stat_bugs", "Reports"),
    support_settings: t("term_settings", "Settings"),
    ide: t("wf_tab_spoke_control", "Spoke Control"),
    schemas: t("wf_tab_spoke_control", "Spoke Control"),
    audit_logs: t("wf_tab_spoke_control", "Spoke Control"),
    spoke_setup: t("wf_tab_spoke_control", "Spoke Control"),
    spoke_sever: t("wf_tab_spoke_control", "Spoke Control"),
    forking_help: t("wf_tab_spoke_control", "Spoke Control"),
    donations: t("wf_tab_spoke_control", "Spoke Control"),
    keepers_support: t("wf_tab_spoke_control", "Spoke Control"),
    chameleons: t("wf_tab_spoke_aesthetics", "Spoke Aesthetics"),
  };

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader
        title={t("wf_hub_title", "Wayfinder Operations") || "Wayfinder Operations"}
        subtitle={t("wf_hub_subtitle", "Network operations, broadcasts, support routing, and platform health") || "Global Network & Operations"}
        icon={t("icon_terminal", "terminal") || "terminal"}
        iconColorClass="text-[var(--success)]"
        breadcrumb={
          activeTab !== "command_center"
            ? breadcrumbMap[activeTab] ||
              activeTab
                .split("_")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" ")
            : undefined
        }
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
          title="Wayfinder Navigation" 
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
          <VerticalTabButton id="wf_comms_title" icon={t("icon_satellite_alt", "satellite_alt")} label={t("wf_tab_dispatch", "Dispatch")} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="sanctuary_tickets" icon={t("icon_local_activity", "local_activity")} label={t("wf_tab_tickets", "Support")} activeTab={activeTab === "support_settings" ? "sanctuary_tickets" : activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="identities" icon={t("icon_group", "group")} label={t("tab_identities", "Identity")} activeTab={activeTab === "linker" ? "identities" : activeTab} setTab={setActiveTab} />

          <VerticalTabButton id="compliance" icon={t("icon_policy", "policy")} label={t("tab_compliance", "Compliance")} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="malware_oversight" icon={t("icon_coronavirus", "coronavirus")} label={t("rating_malware", "Malware")} activeTab={activeTab === "oversight_reports" ? "malware_oversight" : activeTab} setTab={(id: string) => { setComplianceFilter('overview'); setActiveTab(id); }} />
          <VerticalTabButton id="reports" icon={t("icon_flag", "flag")} label={t("stat_bugs", "Reports")} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="ide" icon={t("icon_data_object", "data_object")} label={t("wf_tab_spoke_control", "Spoke Control")} activeTab={["ide", "schemas", "audit_logs", "spoke_setup", "spoke_sever", "forking_help", "donations", "keepers_support"].includes(activeTab) ? "ide" : activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="chameleons" icon={t("icon_palette", "palette")} label={t("wf_tab_spoke_aesthetics", "Spoke Aesthetics")} activeTab={activeTab} setTab={setActiveTab} />
        </HoverTabDrawer>
      </div>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <WayfinderCommandScreen setTab={setActiveTab} setComplianceFilter={setComplianceFilter} onOpenMasonProfile={onOpenMasonProfile} />}
        {activeTab === "wf_comms_title" && <WayfinderPostsEditor authorId={session?.user?.id || ""} authorProfileId={session?.user?.id || ""} />}
        {(activeTab === "identities" || activeTab === "linker") && <IdentityMatrix isWayfinder={true} initialFilterRole={activeTab === "linker" ? "verified_masons" : "overview"} />}
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
        {activeTab === "reports" && <NexusReportsViewer onOpenDossier={(report: any) => { }} />}
        {(activeTab === "sanctuary_tickets" || activeTab === "support_settings") && (
          <ArchitectSupportTickets
            userRole="wayfinder"
            initialTab={activeTab === "support_settings" ? "settings" : undefined}
          />
        )}
        {["ide", "schemas", "audit_logs", "spoke_setup", "spoke_sever", "forking_help", "donations", "keepers_support"].includes(activeTab) && (
          <WayfinderMasterSchemas
            initialTab={
              activeTab === "audit_logs"
                ? "audit_logs"
                : activeTab === "spoke_setup"
                  ? "spoke_setup"
                  : activeTab === "spoke_sever"
                    ? "spoke_sever"
                    : activeTab === "forking_help"
                      ? "forking_help"
                      : activeTab === "donations"
                        ? "donations"
                        : activeTab === "keepers_support"
                          ? "keepers_support"
                          : "overview"
            }
          />
        )}
        {activeTab === "chameleons" && <WayfinderChameleons />}
        {activeTab !== "command_center" && activeTab !== "wf_comms_title" && activeTab !== "identities" && activeTab !== "linker" && activeTab !== "compliance" && activeTab !== "malware_oversight" && activeTab !== "reports" && activeTab !== "oversight_reports" && activeTab !== "sanctuary_tickets" && activeTab !== "support_settings" && !["ide", "schemas", "audit_logs", "spoke_setup", "spoke_sever", "forking_help", "donations", "keepers_support"].includes(activeTab) && activeTab !== "chameleons" && (
          <EmptyState icon={t("icon_construction", "construction")} title={t("wf_under_construction", "Section Under Construction")} className="col-span-full py-16" />
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




