import React, { useState } from "react";
import { SidePanel, standardAccentGlassButtonClass, standardButtonClass } from "./shared";
import CitizenTickets from "./CitizenTickets";
import TicketDossierSidePanel from "./TicketDossierSidePanel";
import { useLexicon } from "./LexiconContext";

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
        title={t("ticket_support_desk") || "SANCTUARY SUPPORT"}
        subtitle={t("ticket_support_desk_sub") || "Manage Your Open Requests"}
        icon={t("ui_icon_support") || "support_agent"}
        widthClass="w-[700px]"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button onClick={onClose} className={standardButtonClass}>
              {t("shared_cancel") || "CANCEL"}
            </button>
            <button 
              onClick={() => {
                document.dispatchEvent(new CustomEvent('open-support-modal'));
              }}
              className={standardAccentGlassButtonClass}
            >
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_add_circle") || "add_circle"}</span> {t("ticket_new_ticket") || "SUBMIT A TICKET"}
            </button>
          </div>
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
        availableActions={[]} // Citizens cannot resolve or reject their own tickets, only architects can.
        onReplyAdded={(newMetadata) => {
          setSelectedTicket({...selectedTicket, metadata: newMetadata});
        }}
      />
    </>
  );
}
