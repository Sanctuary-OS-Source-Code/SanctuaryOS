import React, { useState } from "react";
import { SidePanel, standardAccentGlassButtonClass, standardButtonClass } from "../shared";
import WayfinderKeeperTickets from "../WayfinderKeeperTickets";
import TicketDossierSidePanel from "./TicketDossierSidePanel";
import WayfinderSupportSidePanel from "./WayfinderSupportSidePanel";
import { useLexicon } from "../LexiconContext";

interface CitizenTicketsSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function WayfinderKeeperSidePanel({ isOpen, onClose, userId }: CitizenTicketsSidePanelProps) {
  const { t } = useLexicon();
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("wf_keeper_support_title") || "Contact Keepers"}
        subtitle={t("wf_keeper_support_subtitle") || "Direct Line to Core OS Developers"}
        icon={t("icon_admin_panel_settings") || "admin_panel_settings"}
        widthClass="w-[700px]"
        footer={
          <div className="flex justify-center items-center gap-4 w-full">
            <button onClick={onClose} className={standardButtonClass}>
              {t("nav_cancel")}
            </button>
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className={standardAccentGlassButtonClass}
            >
              <span className="material-symbols-outlined !text-[14px]">{t("icon_add_circle")}</span> {t("support_title")}
            </button>
          </div>
        }
      >
        <div className="h-full relative pb-10">
          <WayfinderKeeperTickets 
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
      
      <WayfinderSupportSidePanel 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />
    </>
  );
}
