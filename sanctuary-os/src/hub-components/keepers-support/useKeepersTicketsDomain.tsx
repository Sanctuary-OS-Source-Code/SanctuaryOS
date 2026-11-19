import { useCallback, useEffect, useMemo, useState } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { supabase, supabaseAuth } from "../../supabase";
import TicketDossierSidePanel from "../../side-panels/TicketDossierSidePanel";
import {
  SupportTicketCard,
  sortTicketsPriorityFirst,
} from "../../components/universal/SupportTicketCard";
import { openSanctuaryContextMenu } from "../../shared-components/ContextMenu";
import {
  claimOrReleaseHubTicket,
  executeHubTicketAction,
  invalidateHubCommandCache,
  isTicketClaimedBy,
  isTicketVisibleToStaff,
} from "../../utils/hubCommandCache";

export type KeepersTicketDomain =
  | "spoke"
  | "platform"
  | "compliance"
  | "partner_apps"
  | "dmca_shadow";

export type ActiveSupportDomain = "spoke" | "platform" | "compliance";

export type FiveTabId = "overview" | "new" | "pending" | "closed" | "settings";

export interface KeeperTicket {
  id: string;
  author_id: string;
  status: "open" | "resolved" | "rejected" | "escalated" | string;
  category?: string;
  ticket_type?: string;
  title: string;
  description: string;
  created_at: string;
  target_mod_id?: string;
  logs?: string;
  metadata?: any;
  author_username?: string;
  onEditMetadata?: (hash: string) => void;
}

export interface SpokeOption {
  id: string;
  name: string;
}

export interface SupportCategoryOption {
  category_code: string;
  category_name: string;
  support_domain?: string;
  is_active?: boolean;
}

export function isKeeperTicketClosed(status?: string): boolean {
  const s = String(status || "NEW").toUpperCase();
  return ["RESOLVED", "REJECTED", "CLOSED"].includes(s);
}

export function isKeeperTicketClaimed(
  ticket: KeeperTicket,
  currentUserId?: string | null
): boolean {
  if (isKeeperTicketClosed(ticket.status)) return false;
  const s = String(ticket.status || "NEW").toUpperCase();
  if (["PENDING", "ESCALATED", "INVESTIGATING"].includes(s)) return true;
  const claimedBy = isTicketClaimedBy(ticket);
  return Boolean(claimedBy) && (!currentUserId || claimedBy === String(currentUserId));
}

export function isKeeperTicketNew(
  ticket: KeeperTicket,
  currentUserId?: string | null
): boolean {
  return !isKeeperTicketClosed(ticket.status) && !isKeeperTicketClaimed(ticket, currentUserId);
}

export function extractTicketPlatform(ticket: KeeperTicket): string {
  const explicit = String(ticket.metadata?.feedback_meta?.platform || "").trim();
  if (explicit) return explicit;
  const typeStr = String(ticket.ticket_type || ticket.category || "");
  if (typeStr.startsWith("Desktop App")) return "Desktop App";
  if (typeStr.startsWith("Website")) return "Website";
  if (typeStr.startsWith("Mobile PWA")) return "Mobile PWA";
  return "";
}

export function classifyPlatformStream(ticket: KeeperTicket): "bugs" | "feedback" {
  const typeLower = String(ticket.ticket_type || ticket.category || "").toLowerCase();
  if (
    typeLower.includes("feature request") ||
    typeLower.includes("public build feedback") ||
    typeLower.includes("beta build feedback") ||
    typeLower.startsWith("desktop app -") ||
    typeLower.startsWith("website -") ||
    typeLower.startsWith("mobile pwa -") ||
    (Boolean(ticket.metadata?.feedback_meta) &&
      ticket.metadata?.feedback_meta?.stream !== "Core Bug Report")
  ) {
    return "feedback";
  }
  return "bugs";
}

export function classifyKeeperTicketDomain(
  ticket: KeeperTicket,
  categoryDomainMap: Record<string, string> = {}
): KeepersTicketDomain {
  const typeRaw = String(ticket.ticket_type || ticket.category || "").trim();
  const typeLower = typeRaw.toLowerCase();
  const titleLower = String(ticket.title || "").toLowerCase();

  if (
    Boolean(ticket.metadata?.dmca_notice_id || ticket.metadata?.dmca_meta) ||
    typeLower.includes("dmca")
  ) {
    return "dmca_shadow";
  }

  if (
    typeLower.includes("partner spoke") ||
    typeLower === "partner_spoke_application" ||
    Boolean(ticket.metadata?.partner_application) ||
    titleLower.startsWith("[partner spoke]")
  ) {
    return "partner_apps";
  }

  const metaDomain = String(
    ticket.metadata?.source_domain || ticket.metadata?.support_domain || ""
  )
    .trim()
    .toLowerCase();
  if (metaDomain === "spoke_support" || metaDomain === "spoke") return "spoke";
  if (metaDomain === "platform_support" || metaDomain === "platform") return "platform";
  if (metaDomain === "compliance_contact" || metaDomain === "compliance") {
    return "compliance";
  }

  const catDomain = String(categoryDomainMap[typeRaw] || "").trim().toLowerCase();
  if (catDomain === "spoke") return "spoke";
  if (catDomain === "compliance") return "compliance";
  if (catDomain === "partner_apps") return "partner_apps";
  if (catDomain === "platform") return "platform";

  if (
    typeLower.startsWith("direct contact") ||
    Boolean(ticket.metadata?.contact_meta) ||
    titleLower.startsWith("[contact")
  ) {
    return "compliance";
  }

  if (
    Boolean(ticket.metadata?.feedback_meta) ||
    typeLower.includes("feature request") ||
    typeLower.includes("public build feedback") ||
    typeLower.includes("beta build feedback") ||
    typeLower.startsWith("desktop app -") ||
    typeLower.startsWith("website -") ||
    typeLower.startsWith("mobile pwa -")
  ) {
    return "platform";
  }

  if (Boolean(ticket.metadata?.spoke_id || ticket.metadata?.spoke_name)) {
    return "spoke";
  }

  return "platform";
}

export function extractTicketSpokeId(ticket: KeeperTicket): string {
  return String(
    ticket.metadata?.spoke_id || ticket.metadata?.target_spoke_id || ""
  ).trim();
}

export function extractTicketSpokeName(
  ticket: KeeperTicket,
  spokesMap: Record<string, string>
): string {
  const sid = extractTicketSpokeId(ticket);
  return String(
    ticket.metadata?.spoke_name ||
      ticket.metadata?.target_spoke_name ||
      (sid ? spokesMap[sid] : "") ||
      sid
  ).trim();
}

export function useKeepersTicketsDomain(options: {
  domain: ActiveSupportDomain;
  userRole?: string;
  masonProfileId?: string;
  onEditMetadata?: (hash: string) => void;
}) {
  const { domain, userRole = "keeper", masonProfileId, onEditMetadata } = options;
  const { t } = useLexicon();
  const currentUserId = useStore((state) => state.session?.user?.id);

  const [tickets, setTickets] = useState<KeeperTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<KeeperTicket | null>(null);
  const [modNameMap, setModNameMap] = useState<Record<string, string>>({});
  const [spokesList, setSpokesList] = useState<SpokeOption[]>([]);
  const [spokesMap, setSpokesMap] = useState<Record<string, string>>({});
  const [domainCategories, setDomainCategories] = useState<SupportCategoryOption[]>([]);
  const [settingsCount, setSettingsCount] = useState<number>(0);

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      let ticketQuery = supabaseAuth
        .from("keeper_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (userRole === "mason" && masonProfileId) {
        ticketQuery = ticketQuery.eq("author_id", masonProfileId);
      }

      const [ticketsRes, catsRes, gamesRes] = await Promise.all([
        ticketQuery,
        supabaseAuth
          .from("keeper_support_categories")
          .select("category_code, category_name, support_domain, is_active")
          .order("category_name", { ascending: true }),
        supabaseAuth
          .from("sanctuary_games")
          .select("id, name, schema_id")
          .order("name", { ascending: true }),
      ]);

      const rawCats = Array.isArray(catsRes.data)
        ? (catsRes.data as SupportCategoryOption[])
        : [];
      const catDomainMap: Record<string, string> = {};
      rawCats.forEach((cat) => {
        if (cat.category_code) {
          catDomainMap[cat.category_code] = String(cat.support_domain || "platform");
        }
      });

      const scopedCats = rawCats.filter(
        (cat) => String(cat.support_domain || "platform") === domain
      );
      setDomainCategories(scopedCats);
      setSettingsCount(scopedCats.length);

      const rawGames = Array.isArray(gamesRes.data) ? gamesRes.data : [];
      const nextSpokesMap: Record<string, string> = {};
      const nextSpokesList: SpokeOption[] = [];
      rawGames.forEach((g: any) => {
        if (g?.id) {
          const id = String(g.id);
          const name = String(g.name || g.schema_id || id);
          nextSpokesMap[id] = name;
          nextSpokesList.push({ id, name });
        }
      });
      setSpokesMap(nextSpokesMap);
      setSpokesList(nextSpokesList);

      if (ticketsRes.error) {
        console.error("Error fetching Keeper tickets:", ticketsRes.error);
        setTickets([]);
        return;
      }

      const fetchedTickets = (ticketsRes.data || []) as KeeperTicket[];
      const authorIds = [...new Set(fetchedTickets.map((tk) => tk.author_id).filter(Boolean))];

      const profileMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const [{ data: profiles }, { data: masons }] = await Promise.all([
          supabaseAuth.from("profiles").select("id, username").in("id", authorIds),
          supabase
            .from("masons")
            .select("id, name")
            .in("id", authorIds)
            .then((r) => r, () => ({ data: null as any })),
        ]);
        profiles?.forEach((p: any) => {
          profileMap[p.id] = p.username;
        });
        masons?.forEach((m: any) => {
          if (!profileMap[m.id]) profileMap[m.id] = m.name;
        });
      }

      const mergedTickets = fetchedTickets.map((tk) => ({
        ...tk,
        author_username:
          profileMap[tk.author_id] ||
          tk.author_id?.substring(0, 8).toUpperCase() ||
          "SYSTEM",
      }));

      const domainFiltered = sortTicketsPriorityFirst(
        mergedTickets.filter((tk) => {
          const tkDomain = classifyKeeperTicketDomain(tk, catDomainMap);
          if (tkDomain !== domain) return false;
          if (userRole !== "mason" && !isTicketVisibleToStaff(tk, currentUserId)) {
            return false;
          }
          return true;
        })
      );

      setTickets(domainFiltered);

      const targetModIds = [
        ...new Set(
          domainFiltered
            .map((tk) => tk.target_mod_id || tk.metadata?.target_mod_id)
            .filter(Boolean)
        ),
      ];
      const isValidUUID = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id
        );
      const validModIds = targetModIds.filter(isValidUUID);
      const hashes = targetModIds.filter((id) => !isValidUUID(id));
      const hashToModId: Record<string, string> = {};
      const nextModNames: Record<string, string> = {};

      try {
        if (hashes.length > 0) {
          const { data: verData } = await supabase
            .from("mod_versions")
            .select("mod_id, dna_hash")
            .in("dna_hash", hashes);
          if (verData && verData.length > 0) {
            verData.forEach((v: any) => {
              if (v.mod_id && !validModIds.includes(v.mod_id)) {
                validModIds.push(v.mod_id);
              }
              if (v.dna_hash && v.mod_id) {
                hashToModId[v.dna_hash] = v.mod_id;
              }
            });
          }
        }
        if (validModIds.length > 0) {
          const { data: modsData } = await supabase
            .from("mods")
            .select("id, name")
            .in("id", validModIds);
          modsData?.forEach((m: any) => {
            if (m.name) nextModNames[m.id] = String(m.name);
          });
          hashes.forEach((h) => {
            const resolvedId = hashToModId[h];
            if (resolvedId && nextModNames[resolvedId]) {
              nextModNames[h] = nextModNames[resolvedId];
            }
          });
        }
      } catch {
        // Best-effort target item lookup across mounted Spoke
      }
      setModNameMap(nextModNames);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, domain, masonProfileId, userRole]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleTakeAction = useCallback(
    async (
      actionType: "RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING",
      reason: string
    ) => {
      if (!selectedTicket) return;
      const actorRole =
        userRole === "oversight"
          ? "oversight"
          : userRole === "wayfinder"
            ? "wayfinder"
            : userRole === "architect"
              ? "architect"
              : userRole === "mason"
                ? "mason"
                : "keeper";
      const ok = await executeHubTicketAction({
        ticket: selectedTicket,
        actionType,
        reason,
        actorRole,
        tableName: "keeper_tickets",
        t,
      });
      if (ok) {
        invalidateHubCommandCache("keeper");
        setSelectedTicket(null);
        fetchTickets();
      }
    },
    [fetchTickets, selectedTicket, t, userRole]
  );

  const handleClaimTicket = useCallback(async () => {
    if (!selectedTicket || !currentUserId) return;
    const updated = await claimOrReleaseHubTicket({
      ticket: selectedTicket,
      currentUserId,
      claim: true,
      actorRole: "keeper",
      tableName: "keeper_tickets",
      t,
    });
    if (updated) {
      invalidateHubCommandCache("keeper");
      setSelectedTicket(updated);
      fetchTickets();
    }
  }, [currentUserId, fetchTickets, selectedTicket, t]);

  const handleReleaseTicket = useCallback(async () => {
    if (!selectedTicket || !currentUserId) return;
    const updated = await claimOrReleaseHubTicket({
      ticket: selectedTicket,
      currentUserId,
      claim: false,
      actorRole: "keeper",
      tableName: "keeper_tickets",
      t,
    });
    if (updated) {
      invalidateHubCommandCache("keeper");
      setSelectedTicket(updated);
      fetchTickets();
    }
  }, [currentUserId, fetchTickets, selectedTicket, t]);

  const activeTickets = useMemo(
    () => tickets.filter((tk) => !isKeeperTicketClosed(tk.status)),
    [tickets]
  );
  const newTickets = useMemo(
    () => activeTickets.filter((tk) => isKeeperTicketNew(tk, currentUserId)),
    [activeTickets, currentUserId]
  );
  const claimedTickets = useMemo(
    () => activeTickets.filter((tk) => isKeeperTicketClaimed(tk, currentUserId)),
    [activeTickets, currentUserId]
  );
  const resolvedTickets = useMemo(
    () => tickets.filter((tk) => isKeeperTicketClosed(tk.status)),
    [tickets]
  );

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    domainCategories.forEach((c) => {
      if (c.category_code) {
        map.set(c.category_code, c.category_name || c.category_code.replace(/_/g, " "));
      }
    });
    tickets.forEach((tk) => {
      const code = String(tk.ticket_type || tk.category || "").trim();
      if (code && !map.has(code)) {
        map.set(code, code.replace(/_/g, " "));
      }
    });
    return [
      { id: "all", label: t("all_types", "All Types") },
      ...Array.from(map.entries()).map(([id, label]) => ({ id, label })),
    ];
  }, [domainCategories, t, tickets]);

  const renderTicketCard = useCallback(
    (ticket: KeeperTicket) => {
      const rawModId = String(
        ticket.target_mod_id || ticket.metadata?.target_mod_id || ""
      ).trim();
      const resolvedModName = rawModId ? modNameMap[rawModId] || null : null;
      const replyCount = Array.isArray(ticket.metadata?.replies)
        ? ticket.metadata.replies.length
        : 0;

      return (
        <SupportTicketCard
          key={ticket.id}
          ticket={ticket}
          t={t}
          claimedBySelf={
            Boolean(currentUserId) && isTicketClaimedBy(ticket) === String(currentUserId)
          }
          resolvedModName={resolvedModName}
          replyCount={replyCount}
          authorLabel={ticket.author_username || null}
          onClick={() => setSelectedTicket(ticket)}
          onContextMenu={(e) => {
            openSanctuaryContextMenu(e, [
              {
                label: t("view_ticket", "View Ticket"),
                icon: t("icon_support_agent", "support_agent"),
                onClick: () => setSelectedTicket(ticket),
              },
              {
                divider: true,
                label: t("copy_title", "Copy Title"),
                icon: t("icon_content_copy", "content_copy"),
                onClick: () => navigator.clipboard?.writeText(ticket.title || ""),
              },
            ]);
          }}
        />
      );
    },
    [currentUserId, modNameMap, t]
  );

  const renderDossierDrawer = () => (
    <TicketDossierSidePanel
      isOpen={Boolean(selectedTicket)}
      onClose={() => setSelectedTicket(null)}
      ticket={selectedTicket}
      tableName="keeper_tickets"
      isReadOnly={false}
      canReply={true}
      availableActions={["RESOLVED", "REJECTED", "ESCALATED", "PENDING"]}
      onTakeAction={handleTakeAction}
      onEditMetadata={onEditMetadata}
      onClaim={handleClaimTicket}
      onRelease={handleReleaseTicket}
      currentUserId={currentUserId}
      onReplyAdded={() => {
        fetchTickets();
      }}
    />
  );

  return {
    t,
    currentUserId,
    tickets,
    activeTickets,
    newTickets,
    claimedTickets,
    resolvedTickets,
    isLoading,
    selectedTicket,
    setSelectedTicket,
    spokesList,
    spokesMap,
    categoryOptions,
    settingsCount,
    setSettingsCount,
    fetchTickets,
    renderTicketCard,
    renderDossierDrawer,
  };
}
