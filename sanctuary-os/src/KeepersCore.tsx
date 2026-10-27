import { useState } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HoverTabDrawer, VerticalTabButton, SidebarFooterButton } from './shared';
import { IdentityMatrix } from './IdentityMatrix';
import { WayfinderChameleons } from './hub-components/WayfinderChameleons';
import KeepersActiveGames from './hub-components/KeepersActiveGames';
import { KeeperCommandScreen } from "./hub-components/CommandScreens";
import KeepersSupportTickets from './hub-components/KeepersSupportTickets';
import { KeepersDispatchEditor } from './hub-components/KeepersDispatchEditor';
import KeepersWebDirectivesEditor from './hub-components/KeepersWebDirectivesEditor';
import KeepersHeuristicsOversight from './hub-components/KeepersHeuristicsOversight';
import { FileVerificationSidePanel } from './side-panels/ArchitectSidePanels';
import { openSanctuaryScreenshotTour } from './side-panels/ScreenshotTourSidePanel';

export default function KeepersCore() {
  const { t } = useLexicon();
  const activeTab = useStore(state => state.keepersActiveTab);
  const setActiveTab = useStore(state => state.setKeepersActiveTab);
  const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);

  const isWebLandingTab =
    activeTab === "web_directives" ||
    activeTab === "web_news" ||
    activeTab === "web_legal";

  const breadcrumbMap: Record<string, string> = {
    keepers_comms: t("wf_tab_dispatch", "Dispatch"),
    web_directives: t("keepers_tab_web_landing", "Web Landing"),
    web_news: t("keepers_tab_web_landing", "Web Landing"),
    web_legal: t("keepers_tab_web_landing", "Web Landing"),
    active_games: t("keepers_tab_partner_spokes", "Partner Spokes"),
    ide: t("tab_schemas", "Master Schemas"),
    schemas: t("tab_schemas", "Master Schemas"),
    audit_logs: t("audit_logs", "Audit Logs"),
    identities: t("citizen_oversight", "{Citizen} Management"),
    heuristics: t("core_heuristics_tab", "Core Heuristics"),
    support: t("support_tickets", "Support Center"),
    support_settings: t("term_settings", "Support"),
    chameleons: t("keepers_tab_core_aesthetics", "Core Aesthetics"),
  };

  const breadcrumbText =
    activeTab === "command_center"
      ? undefined
      : breadcrumbMap[activeTab] ||
        activeTab
          .split('_')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader 
        title={t("keepers_core", "KEEPERS CORE")} 
        subtitle={t("keepers_core_subtitle", "CORE OS OVERSIGHT & INFRASTRUCTURE")} 
        icon={t("icon_admin_panel_settings", "admin_panel_settings")} 
        iconColorClass="text-[var(--accent)]"
        breadcrumb={breadcrumbText}
        onTitleClick={() => setActiveTab("command_center")}
        hubActions={[
          {
            id: "hub_screenshot_tour",
            icon: t("icon_photo_camera", "photo_camera"),
            label: t("screenshot_tour_title", "Screenshot Tour"),
            onClick: () => openSanctuaryScreenshotTour()
          },
          {
            id: "hub_verify_hash",
            icon: t("icon_verified_user", "verified_user"),
            label: t("wf_hub_verify", "Check Hash"),
            onClick: () => setIsVerifyPanelOpen(true)
          }
        ]}
      >
      </ViewHeader>

      <div className="md:hidden">
        <HoverTabDrawer
          title={t("keepers_navigation", "Keepers Navigation")}
          activeTab={isWebLandingTab ? "web_directives" : activeTab}
          setTab={setActiveTab}
          hideMobilePills={true}
          footer={
            <SidebarFooterButton
              icon={t("icon_verified_user", "verified_user")}
              label={t("wf_hub_verify", "Check Hash")}
              variant="glass"
              className="w-full"
              onClick={() => setIsVerifyPanelOpen(true)}
            />
          }
        >
          <VerticalTabButton id="command_center" icon={t("icon_desktop_windows", "desktop_windows")} label={t("wf_tab_command", "Command Center")} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="keepers_comms" icon={t("icon_satellite_alt", "satellite_alt")} label={t("wf_tab_dispatch", "Dispatch")} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="web_directives" icon={t("icon_public", "public")} label={t("keepers_tab_web_landing", "Web Landing")} activeTab={isWebLandingTab ? "web_directives" : activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="active_games" icon={t("icon_dns", "dns")} label={t("keepers_tab_partner_spokes", "Partner Spokes")} activeTab={["active_games", "ide", "schemas", "audit_logs"].includes(activeTab) ? "active_games" : activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="identities" icon={t("icon_group", "group")} label={t("citizen_oversight", "{Citizen} Management")} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="heuristics" icon={t("icon_shield_lock", "shield_lock")} label={t("core_heuristics_tab", "Core Heuristics")} activeTab={activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="support" icon={t("icon_support_agent", "support_agent")} label={t("support_tickets", "Support Center")} activeTab={activeTab === "support_settings" ? "support" : activeTab} setTab={setActiveTab} />
          <VerticalTabButton id="chameleons" icon={t("icon_palette", "palette")} label={t("keepers_tab_core_aesthetics", "Core Aesthetics")} activeTab={activeTab} setTab={setActiveTab} />
        </HoverTabDrawer>
      </div>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <KeeperCommandScreen setTab={setActiveTab} />}
        {activeTab === "keepers_comms" && <KeepersDispatchEditor authorId="system" authorProfileId="system" />}
        {isWebLandingTab && (
          <KeepersWebDirectivesEditor
            initialTab={
              activeTab === "web_news"
                ? "news"
                : activeTab === "web_legal"
                ? "legal"
                : undefined
            }
          />
        )}
        {["active_games", "ide", "schemas", "audit_logs"].includes(activeTab) && (
          <KeepersActiveGames
            initialTab={
              activeTab === "ide" || activeTab === "schemas"
                ? "schemas"
                : activeTab === "audit_logs"
                  ? "audit_logs"
                  : "workspaces"
            }
          />
        )}
        {activeTab === "identities" && <IdentityMatrix isWayfinder={false} isKeepers={true} />}
        {activeTab === "heuristics" && <KeepersHeuristicsOversight />}
        {(activeTab === "support" || activeTab === "support_settings") && (
          <KeepersSupportTickets initialTab={activeTab === "support_settings" ? "settings" : undefined} />
        )}
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
