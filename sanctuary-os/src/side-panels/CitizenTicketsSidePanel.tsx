import React, { useState } from "react";
import { SidePanel, SidePanelActionFooter, standardAccentGlassButtonClass, standardButtonClass } from "../shared";
import CitizenTickets from "../CitizenTickets";
import TicketDossierSidePanel from "./TicketDossierSidePanel";
import { useLexicon } from "../LexiconContext";

interface CitizenTicketsSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function CitizenTicketsSidePanel({ isOpen, onClose, userId }: CitizenTicketsSidePanelProps) {
  const { t } = useLexicon();
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);

  if (!isOpen) return null;

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("sidebar_support")}
        subtitle={t("support_desk_sub")}
        icon={t("icon_support_agent")}
        widthClass="w-[700px]"
        footer={
          <SidePanelActionFooter
            onCancel={onClose}
            cancelLabel={t("nav_cancel")}
            onAction={() => {
              document.dispatchEvent(new CustomEvent('open-support-modal'));
            }}
            actionLabel={t("support_title")}
            actionIcon={t("icon_add_circle")}
          />
        }
      >
        <div className="h-full relative pb-10">
          <CitizenTickets 
            userId={userId} 
            onSelectTicket={setSelectedTicket}
          />
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
          setSelectedTicket({...selectedTicket, metadata: newMetadata});
        }}
      />
    </>
  );
}
