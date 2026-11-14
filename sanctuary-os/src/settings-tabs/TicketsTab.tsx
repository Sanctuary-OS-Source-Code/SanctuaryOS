import { useState } from 'react';
import { useLexicon } from '../LexiconContext';
import { TabContainer } from './shared';
import { PanelHeaderGroup, PanelHeaderButton } from '../shared';
import CitizenTickets from '../CitizenTickets';
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import { useStore } from '../store';
import { isDesktop } from '../utils/envUtils';
import { isRootDomain } from '../utils/routingUtils';

interface TicketsTabProps {
  searchQuery?: string;
  ticketStatusFilter?: 'all' | 'open' | 'pending' | 'closed';
  scopeFilter?: 'all' | 'core' | 'spoke';
}

export default function TicketsTab({
  searchQuery = '',
  ticketStatusFilter = 'all',
  scopeFilter = 'all',
}: TicketsTabProps) {
  const { t } = useLexicon();
  const userId = useStore((state) => state.session?.user?.id || '');
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const availableWorkspaces = useStore((state) => state.workspaces);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);

  const isWebHub = !isDesktop() && isRootDomain();
  const hasLoadedSpoke = Boolean(
    activeWorkspaceId &&
      activeWorkspaceId !== 'default_workspace' &&
      activeWorkspaceId !== 'web' &&
      !isWebHub
  );

  const activeWorkspaceObj = Array.isArray(availableWorkspaces)
    ? availableWorkspaces.find(
        (w: any) =>
          String(w?.id || '').toLowerCase() === String(activeWorkspaceId || '').toLowerCase() ||
          String(w?.schema_id || '').toLowerCase() === String(activeWorkspaceId || '').toLowerCase()
      )
    : null;
  const activeSpokeName =
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    activeWorkspaceObj?.name ||
    activeWorkspaceId ||
    t('tab_workspace', 'Workspace');

  const handleOpenCoreFeedback = () => {
    localStorage.setItem('sanctuary_landing_tab', 'support');
    useStore.getState().setView('landing');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sanctuary-landing-tab', { detail: 'support' }));
    }, 60);
  };

  const handleOpenSpokeTicket = () => {
    document.dispatchEvent(new CustomEvent('open-support-modal'));
  };

  const showSpokeSection =
    hasLoadedSpoke && (scopeFilter === 'all' || scopeFilter === 'spoke');
  const showCoreSection =
    !hasLoadedSpoke || scopeFilter === 'all' || scopeFilter === 'core';

  return (
    <div className="flex flex-col gap-12 w-full pb-32">
      {showSpokeSection && activeWorkspaceId && (
        <TabContainer
          title={`${activeSpokeName} • ${t('support_tickets', 'Support Tickets')}`}
          icon={t('icon_local_activity', 'local_activity')}
          actions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t('icon_add_circle', 'add_circle')}
                tooltip={`${activeSpokeName} • ${t('ticket_new', 'New Ticket')}`}
                variant="accent"
                onClick={handleOpenSpokeTicket}
              />
            </PanelHeaderGroup>
          }
        >
          <CitizenTickets
            key={`spoke_tickets_${activeWorkspaceId}`}
            userId={userId}
            tableName="sanctuary_tickets"
            spokeId={String(activeWorkspaceId)}
            embedded={true}
            externalSearch={searchQuery}
            externalFilter={ticketStatusFilter}
            onSelectTicket={(tk) =>
              setSelectedTicket({ ...tk, table_name: 'sanctuary_tickets' })
            }
            onOpenNewTicket={handleOpenSpokeTicket}
          />
        </TabContainer>
      )}

      {showCoreSection && (
        <TabContainer
          title={t('landing_feedback_my_tickets_btn', 'My Platform Tickets & Feedback')}
          icon={t('icon_receipt_long', 'receipt_long')}
          actions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t('icon_add_circle', 'add_circle')}
                tooltip={t('landing_feedback_btn_open', 'Transmit Platform Feedback')}
                variant="accent"
                onClick={handleOpenCoreFeedback}
              />
            </PanelHeaderGroup>
          }
        >
          <CitizenTickets
            key="core_tickets"
            userId={userId}
            tableName="keeper_tickets"
            embedded={true}
            externalSearch={searchQuery}
            externalFilter={ticketStatusFilter}
            onSelectTicket={(tk) =>
              setSelectedTicket({ ...tk, table_name: 'keeper_tickets' })
            }
            onOpenNewTicket={handleOpenCoreFeedback}
          />
        </TabContainer>
      )}

      <TicketDossierSidePanel
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        ticket={selectedTicket}
        tableName={selectedTicket?.table_name || 'keeper_tickets'}
        isReadOnly={false}
        canReply={true}
        availableActions={[]}
        onReplyAdded={(newMetadata) => {
          if (selectedTicket && newMetadata) {
            setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
          }
          window.dispatchEvent(new CustomEvent('sanctuary-tickets-updated'));
        }}
      />
    </div>
  );
}
