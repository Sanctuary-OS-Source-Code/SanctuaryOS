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

  React.useEffect(() => {
    if (isOpen && initialTicketId) {
      setSelectedTicket({ id: initialTicketId });
    }
  }, [isOpen, initialTicketId]);

  const handleOpenNewTicket = () => {
    document.dispatchEvent(new CustomEvent("open-support-modal"));
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
            <ActionButton
              variant="glass"
              icon={t("icon_add_circle", "add_circle")}
              label={t("support_title", "Create Support Ticket")}
              onClick={handleOpenNewTicket}
              className="w-full"
            />
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("sidebar_support", "Ticket Registry")}
            icon={t("icon_receipt_long", "receipt_long")}
          >
            <CitizenTickets
              userId={userId}
              onSelectTicket={setSelectedTicket}
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
        isReadOnly={false}
        canReply={true}
        availableActions={[]}
        onReplyAdded={(newMetadata) => {
          setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
        }}
      />
    </>
  );
}
