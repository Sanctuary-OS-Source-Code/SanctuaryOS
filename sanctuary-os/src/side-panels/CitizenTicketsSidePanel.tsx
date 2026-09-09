import React, { useState } from "react";
import { SidePanel, standardAccentGlassButtonClass, standardButtonClass, PanelHeaderGroup, PanelHeaderButton } from "../shared";
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
  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("sidebar_support")}
        subtitle={t("support_desk_sub")}
        icon={t("icon_support_agent")}
        widthClass="w-full md:w-[700px]"
        noPadding={true}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_add_circle")}
              tooltip={t("support_title")}
              variant="accent"
              onClick={() => {
                document.dispatchEvent(new CustomEvent('open-support-modal'));
              }}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="min-h-full relative pb-10">
          <CitizenTickets 
            userId={userId} 
            onSelectTicket={setSelectedTicket}
            isSidePanel={true}
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
