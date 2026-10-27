import { useState } from "react";
import { SidePanel, ActionButton, PanelHeaderGroup, PanelHeaderButton, SidePanelHeroCard } from "../shared";
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
        title={t("wf_keeper_support_title", "Keeper Support Escalations")}
        subtitle={t("wf_keeper_support_subtitle", "Direct Escalation Channel to Sanctuary Keepers")}
        icon={t("icon_admin_panel_settings", "admin_panel_settings")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_add_circle", "add_circle")}
              tooltip={t("support_title", "New Escalation Ticket")}
              variant="accent"
              onClick={() => setIsCreateModalOpen(true)}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_admin_panel_settings", "admin_panel_settings")}
            overline={t("wf_keeper_support_subtitle", "Keepers Direct Uplink")}
            title={t("wf_keeper_support_title", "Keeper Support Escalations")}
            description={t("support_desc", "Review active escalations or open a direct support dossier with Sanctuary Keepers.")}
            variant="accent"
          >
            <ActionButton
              variant="glass"
              icon={t("icon_add_circle", "add_circle")}
              onClick={() => setIsCreateModalOpen(true)}
              className="w-full justify-center !py-3"
            >
              {t("support_title", "Create Support Escalation")}
            </ActionButton>
          </SidePanelHeroCard>

          <div className="relative w-full">
            <WayfinderKeeperTickets 
              userId={userId} 
              onSelectTicket={setSelectedTicket}
            />
          </div>
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
