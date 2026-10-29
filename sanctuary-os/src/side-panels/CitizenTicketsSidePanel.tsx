import React, { useState } from "react";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";
import CitizenTickets from "../CitizenTickets";
import TicketDossierSidePanel from "./TicketDossierSidePanel";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { getActiveGameClient } from "../supabase";
import { isDesktop } from "../utils/envUtils";
import { isRootDomain } from "../utils/routingUtils";

interface CitizenTicketsSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  initialTicketId?: string;
}

export default function CitizenTicketsSidePanel({
  isOpen,
  onClose,
  userId,
  initialTicketId,
}: CitizenTicketsSidePanelProps) {
  const { t } = useLexicon();
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const availableWorkspaces = useStore((state) => state.workspaces);

  const isWebHub = !isDesktop() && isRootDomain();
  const hasLoadedSpoke = Boolean(
    activeWorkspaceId &&
      activeWorkspaceId !== "default_workspace" &&
      activeWorkspaceId !== "web" &&
      !isWebHub &&
      getActiveGameClient()
  );
  const activeWorkspaceObj = Array.isArray(availableWorkspaces)
    ? availableWorkspaces.find((w: any) => w.id === activeWorkspaceId)
    : null;
  const activeSpokeName =
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    activeWorkspaceObj?.name ||
    activeWorkspaceId ||
    t("tab_workspace", "Workspace");

  React.useEffect(() => {
    if (isOpen && initialTicketId) {
      setSelectedTicket({ id: initialTicketId });
    }
  }, [isOpen, initialTicketId]);

  const handleOpenNewTicket = () => {
    document.dispatchEvent(new CustomEvent("open-support-modal"));
  };

  const handleOpenFullTicketRegistry = () => {
    onClose();
    localStorage.setItem("sanctuary_settings_tab", "TICKETS");
    useStore.getState().setView("settings");
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("navigateSettings", {
          detail: { tab: "TICKETS" },
        })
      );
    }, 50);
  };

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("sidebar_support", "Support Desk")}
        subtitle={t("support_desk_sub", "Manage your support tickets and dispatches")}
        icon={t("icon_support_agent", "support_agent")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_open_in_new", "open_in_new")}
              tooltip={t("support_tickets", "Support Tickets")}
              onClick={handleOpenFullTicketRegistry}
            />
            <PanelHeaderButton
              icon={t("icon_add_circle", "add_circle")}
              tooltip={t("support_title", "New Support Ticket")}
              variant="accent"
              onClick={handleOpenNewTicket}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_support_agent", "support_agent")}
            overline={t("sidebar_support", "Support Desk")}
            title={t("support_desk_sub", "Citizen Support & Ticket Registry")}
            description={t(
              "support_title",
              "Review active support threads, inspect attached telemetry logs, or open a new support request."
            )}
            badge={t("status_active", "Online")}
            badgeIcon={t("icon_verified", "verified")}
            variant="accent"
          >
            <div className="flex flex-wrap gap-2 w-full">
              <ActionButton
                variant="glass"
                icon={t("icon_add_circle", "add_circle")}
                label={t("support_title", "Create Support Ticket")}
                onClick={handleOpenNewTicket}
                className="flex-1 min-w-[180px]"
              />
              <ActionButton
                variant="glass"
                icon={t("icon_open_in_new", "open_in_new")}
                label={t("support_tickets", "Support Tickets")}
                onClick={handleOpenFullTicketRegistry}
                className="flex-1 min-w-[180px]"
              />
            </div>
          </SidePanelHeroCard>

          {hasLoadedSpoke && (
            <UniversalGroup
              title={`${activeSpokeName} • ${t("support_tickets", "Support Tickets")}`}
              icon={t("icon_local_activity", "local_activity")}
            >
              <CitizenTickets
                userId={userId}
                tableName="sanctuary_tickets"
                onSelectTicket={(tk) =>
                  setSelectedTicket({ ...tk, table_name: "sanctuary_tickets" })
                }
                onOpenNewTicket={handleOpenNewTicket}
                isSidePanel={true}
              />
            </UniversalGroup>
          )}

          <UniversalGroup
            title={t(
              "landing_feedback_my_tickets_btn",
              "My Platform Tickets & Feedback"
            )}
            icon={t("icon_receipt_long", "receipt_long")}
          >
            <CitizenTickets
              userId={userId}
              tableName="keeper_tickets"
              onSelectTicket={(tk) =>
                setSelectedTicket({ ...tk, table_name: "keeper_tickets" })
              }
              onOpenNewTicket={handleOpenNewTicket}
              isSidePanel={true}
            />
          </UniversalGroup>
        </div>
      </SidePanel>

      <TicketDossierSidePanel
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        ticket={selectedTicket}
        tableName={selectedTicket?.table_name || "sanctuary_tickets"}
        isReadOnly={false}
        canReply={true}
        availableActions={[]}
        onReplyAdded={(newMetadata) => {
          setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
          window.dispatchEvent(new CustomEvent("sanctuary-tickets-updated"));
        }}
      />
    </>
  );
}
