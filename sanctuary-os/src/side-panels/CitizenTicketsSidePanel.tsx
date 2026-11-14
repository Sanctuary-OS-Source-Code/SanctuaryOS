import React, { useState, useEffect } from "react";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  SidePanelFilterBar,
} from "../shared";
import CitizenTickets from "../CitizenTickets";
import TicketDossierSidePanel from "./TicketDossierSidePanel";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { getActiveGameClient, supabase, supabaseAuth } from "../supabase";
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
  const [activeScope, setActiveScope] = useState<"spoke" | "core">(() =>
    hasLoadedSpoke ? "spoke" : "core"
  );
  const [spokeTicketCount, setSpokeTicketCount] = useState<number>(0);
  const [coreTicketCount, setCoreTicketCount] = useState<number>(0);

  useEffect(() => {
    if (!hasLoadedSpoke && activeScope === "spoke") {
      setActiveScope("core");
    }
  }, [hasLoadedSpoke, activeScope]);

  useEffect(() => {
    if (!isOpen || !userId) {
      setSpokeTicketCount(0);
      setCoreTicketCount(0);
      return;
    }

    let isMounted = true;
    const syncScopeCounts = async () => {
      try {
        const coreRes = await supabaseAuth
          .from("keeper_tickets")
          .select("id", { count: "exact", head: true })
          .eq("author_id", userId);
        if (isMounted && typeof coreRes.count === "number") {
          setCoreTicketCount(coreRes.count);
        }
      } catch {
        // Ignore transient network errors
      }

      if (hasLoadedSpoke) {
        try {
          const spokeRes = await supabase
            .from("sanctuary_tickets")
            .select("id", { count: "exact", head: true })
            .eq("author_id", userId);
          if (isMounted && typeof spokeRes.count === "number") {
            setSpokeTicketCount(spokeRes.count);
          }
        } catch {
          // Ignore transient network errors
        }
      } else if (isMounted) {
        setSpokeTicketCount(0);
      }
    };

    syncScopeCounts();
    window.addEventListener("sanctuary-tickets-updated", syncScopeCounts);
    return () => {
      isMounted = false;
      window.removeEventListener("sanctuary-tickets-updated", syncScopeCounts);
    };
  }, [isOpen, userId, hasLoadedSpoke, activeWorkspaceId]);

  const resolvedScope: "spoke" | "core" = hasLoadedSpoke ? activeScope : "core";
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
            <div className="flex flex-wrap items-center justify-end gap-2 w-full">
              <ActionButton
                variant="glass"
                icon={t("icon_add_circle", "add_circle")}
                label={t("support_title", "Create Support Ticket")}
                onClick={handleOpenNewTicket}
              />
              <ActionButton
                variant="glass"
                icon={t("icon_open_in_new", "open_in_new")}
                label={t("support_tickets", "Support Tickets")}
                onClick={handleOpenFullTicketRegistry}
              />
            </div>
          </SidePanelHeroCard>

          {hasLoadedSpoke && (
            <SidePanelFilterBar className="sm:grid-cols-2 gap-3">
              <DashboardStatTile
                variant="filter"
                icon={t("icon_local_activity", "local_activity")}
                label={activeSpokeName}
                value={spokeTicketCount}
                isActive={resolvedScope === "spoke"}
                onClick={() => setActiveScope("spoke")}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_receipt_long", "receipt_long")}
                label={t("keepers_title", "Keepers Core")}
                value={coreTicketCount}
                isActive={resolvedScope === "core"}
                onClick={() => setActiveScope("core")}
              />
            </SidePanelFilterBar>
          )}

          {resolvedScope === "spoke" && hasLoadedSpoke ? (
            <UniversalGroup
              title={`${activeSpokeName} • ${t("support_tickets", "Support Tickets")}`}
              icon={t("icon_local_activity", "local_activity")}
            >
              <CitizenTickets
                key={`spoke-${activeWorkspaceId}`}
                userId={userId}
                tableName="sanctuary_tickets"
                onCountChange={setSpokeTicketCount}
                onSelectTicket={(tk) =>
                  setSelectedTicket({ ...tk, table_name: "sanctuary_tickets" })
                }
                onOpenNewTicket={handleOpenNewTicket}
                isSidePanel={true}
              />
            </UniversalGroup>
          ) : (
            <UniversalGroup
              title={t(
                "landing_feedback_my_tickets_btn",
                "My Platform Tickets & Feedback"
              )}
              icon={t("icon_receipt_long", "receipt_long")}
            >
              <CitizenTickets
                key="core-keeper-tickets"
                userId={userId}
                tableName="keeper_tickets"
                onCountChange={setCoreTicketCount}
                onSelectTicket={(tk) =>
                  setSelectedTicket({ ...tk, table_name: "keeper_tickets" })
                }
                onOpenNewTicket={handleOpenNewTicket}
                isSidePanel={true}
              />
            </UniversalGroup>
          )}
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
