import React, { useState } from "react";
import { SidePanel, standardAccentGlassButtonClass, standardButtonClass, ActionButton, PanelHeaderGroup, PanelHeaderButton } from "../shared";
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
  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("wf_keeper_support_title")}
        subtitle={t("wf_keeper_support_subtitle")}
        icon={t("icon_admin_panel_settings")}
        widthClass="w-[700px]"
        noPadding={true}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="close"
              tooltip={t("nav_cancel")}
              onClick={onClose}
            />
            <PanelHeaderButton
              icon={t("icon_add_circle") || "add_circle"}
              tooltip={t("support_title")}
              variant="accent"
              onClick={() => setIsCreateModalOpen(true)}
            />
          </PanelHeaderGroup>
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
