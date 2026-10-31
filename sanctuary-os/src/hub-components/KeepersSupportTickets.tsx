import { useState, useEffect, useRef } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from '../store';
import { supabase, supabaseAuth } from "../supabase";
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import { logArchitectAction } from "../lib/audit";
import {
  CustomDropdown,
  EmptyState,
  SidePanel,
  SidePanelHeroCard,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { UniversalGroup, UniversalInput, UniversalTextArea } from "../components/universal/UniversalLayout";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import KeeperSupportSettings from "./KeeperSupportSettings";
import {
  getKeepersPipelineConfig,
  saveKeepersPipelineConfig,
  dispatchKeeperCustomEmail,
} from "../utils/supporterManager";

interface Ticket {
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

type KeepersSupportTab =
  | "overview"
  | "bugs"
  | "feedback"
  | "contact"
  | "partner_apps"
  | "new"
  | "pending"
  | "closed"
  | "settings";

const VAULT_CHIP_CLASS = "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

function classifyKeeperTicket(t: Ticket): "bugs" | "feedback" | "contact" | "partner_apps" {
  const typeStr = String(t.ticket_type || t.category || "").toLowerCase();
  const titleStr = String(t.title || "").toLowerCase();
  if (
    typeStr.includes("partner spoke") ||
    Boolean(t.metadata?.partner_application) ||
    titleStr.startsWith("[partner spoke]")
  ) {
    return "partner_apps";
  }
  if (
    typeStr.startsWith("direct contact") ||
    Boolean(t.metadata?.contact_meta) ||
    titleStr.startsWith("[contact")
  ) {
    return "contact";
  }
  if (
    typeStr.includes("feature request") ||
    typeStr.includes("public build feedback") ||
    typeStr.includes("beta build feedback") ||
    typeStr.startsWith("desktop app -") ||
    typeStr.startsWith("website -") ||
    typeStr.startsWith("mobile pwa -") ||
    (Boolean(t.metadata?.feedback_meta) &&
      t.metadata?.feedback_meta?.stream !== "Core Bug Report")
  ) {
    return "feedback";
  }
  return "bugs";
}

function isTicketClosedStatus(status?: string): boolean {
  const s = String(status || "NEW").toUpperCase();
  return ["RESOLVED", "REJECTED", "CLOSED"].includes(s);
}

export default function KeepersSupportTickets({
  userRole = "keeper",
  masonProfileId,
  onEditMetadata,
  initialTab
}: {
  userRole?: string;
  masonProfileId?: string;
  onEditMetadata?: (hash: string) => void;
  setStatus?: any;
  initialTab?: KeepersSupportTab;
}) {
  const { t } = useLexicon();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<KeepersSupportTab>(initialTab || "overview");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [statusSubFilter, setStatusSubFilter] = useState<"all_active" | "new" | "pending" | "all">("all_active");
  const [platformSubFilter, setPlatformSubFilter] = useState<string>("all");
  const [streamSubFilter, setStreamSubFilter] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const [settingsCount, setSettingsCount] = useState<number>(0);
  const [settingsStatusFilter, setSettingsStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const openCatRef = useRef<(() => void) | null>(null);
  const currentUserId = useStore(state => state.session?.user?.id);

  // Keepers Core In-App Email Center & Custom Sender State
  const [isEmailDrawerOpen, setIsEmailDrawerOpen] = useState(false);
  const [supportSenderNameInput, setSupportSenderNameInput] = useState("Sanctuary OS Keepers Core");
  const [supportEmailInput, setSupportEmailInput] = useState("support@sanctuaryos.gg");
  const [supportReplyToInput, setSupportReplyToInput] = useState("support@sanctuaryos.gg");
  const [supportEmailProvider, setSupportEmailProvider] = useState<"resend" | "webhook">("resend");
  const [supportEmailApiKey, setSupportEmailApiKey] = useState("");
  const [supportEmailWebhookUrl, setSupportEmailWebhookUrl] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // Direct Custom Email Compose State
  const [emailComposeTo, setEmailComposeTo] = useState("");
  const [emailComposeSubject, setEmailComposeSubject] = useState("");
  const [emailComposeBody, setEmailComposeBody] = useState("");
  const [isDispatchingEmail, setIsDispatchingEmail] = useState(false);
  const [recentDispatches, setRecentDispatches] = useState<any[]>([]);

  const loadEmailCenterData = async () => {
    try {
      const cfg = await getKeepersPipelineConfig();
      if (cfg?.support_sender_name) setSupportSenderNameInput(cfg.support_sender_name);
      if (cfg?.support_contact_email) setSupportEmailInput(cfg.support_contact_email);
      if (cfg?.support_reply_to_email) setSupportReplyToInput(cfg.support_reply_to_email);
      if (cfg?.support_email_provider) {
        setSupportEmailProvider(
          cfg.support_email_provider.toLowerCase() === "webhook"
            ? "webhook"
            : "resend"
        );
      }
      if (cfg?.support_email_api_key) setSupportEmailApiKey(cfg.support_email_api_key);
      if (cfg?.support_email_webhook_url) setSupportEmailWebhookUrl(cfg.support_email_webhook_url);
    } catch {
      // ignore
    }

    try {
      const { data: logs } = await supabaseAuth
        .from("keeper_email_dispatches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      if (logs) setRecentDispatches(logs);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadEmailCenterData();
  }, []);

  const handleSaveSupportEmail = async () => {
    if (isSavingEmail) return;
    setIsSavingEmail(true);
    try {
      const cleanedSender = supportSenderNameInput.trim() || "Sanctuary OS Keepers Core";
      const cleanedEmail = supportEmailInput.trim() || "support@sanctuaryos.gg";
      const cleanedReply = supportReplyToInput.trim() || cleanedEmail;
      await saveKeepersPipelineConfig({
        support_sender_name: cleanedSender,
        support_contact_email: cleanedEmail,
        support_reply_to_email: cleanedReply,
        support_email_provider: supportEmailProvider,
        support_email_api_key: supportEmailApiKey.trim(),
        support_email_webhook_url: supportEmailWebhookUrl.trim(),
      });
      setSupportSenderNameInput(cleanedSender);
      setSupportEmailInput(cleanedEmail);
      setSupportReplyToInput(cleanedReply);
      useStore
        .getState()
        .pushStatus(
          t("keepers_support_email_saved", "Keepers Core Custom Email Sender configuration saved!"),
          "success"
        );
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleDispatchCustomEmail = async () => {
    if (
      isDispatchingEmail ||
      !emailComposeTo.trim().includes("@") ||
      !emailComposeSubject.trim() ||
      !emailComposeBody.trim()
    ) {
      return;
    }
    setIsDispatchingEmail(true);
    try {
      const res = await dispatchKeeperCustomEmail({
        to_email: emailComposeTo.trim(),
        subject: emailComposeSubject.trim(),
        body_text: emailComposeBody.trim(),
        from_name: supportSenderNameInput.trim() || "Sanctuary OS Keepers Core",
        from_email: supportEmailInput.trim() || "support@sanctuaryos.gg",
        reply_to: supportReplyToInput.trim() || supportEmailInput.trim() || "support@sanctuaryos.gg",
      });
      if (res.ok) {
        useStore
          .getState()
          .pushStatus(
            t("keeper_email_compose_sent", "Custom email dispatched from Keepers Core!"),
            "success"
          );
        setEmailComposeTo("");
        setEmailComposeSubject("");
        setEmailComposeBody("");
        loadEmailCenterData();
      } else {
        useStore
          .getState()
          .pushStatus(
            res.error || t("keeper_email_compose_failed", "Failed to dispatch custom email."),
            "error"
          );
      }
    } finally {
      setIsDispatchingEmail(false);
    }
  };

  useEffect(() => {
    if (initialTab) {
      setActiveFilter(initialTab);
    }
  }, [initialTab]);

  const fetchTickets = async () => {
    setIsLoading(true);
    let query = supabaseAuth
      .from('keeper_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (userRole === "mason" && masonProfileId) {
      query = query.eq('author_id', masonProfileId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching tickets:", error);
    }
    if (data && !error) {
      const fetchedTickets = data as Ticket[];
      const authorIds = [...new Set(fetchedTickets.map(t => t.author_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', authorIds);
      const { data: masons } = await supabase.from('masons').select('id, name').in('id', authorIds);
      const profileMap: Record<string, string> = {};
      profiles?.forEach(p => profileMap[p.id] = p.username);
      masons?.forEach(m => { if (!profileMap[m.id]) profileMap[m.id] = m.name; });

      const mergedTickets = fetchedTickets.map(t => ({
        ...t,
        author_username: profileMap[t.author_id] || t.author_id?.substring(0, 8).toUpperCase() || 'SYSTEM'
      }));

      const { data: catData } = await supabaseAuth.from('keeper_support_categories').select('*');
      setSettingsCount(catData?.length || 0);

      const targetModIds = [...new Set(mergedTickets.map(t => t.target_mod_id || t.metadata?.target_mod_id).filter(Boolean))];
      const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
      const validModIds = targetModIds.filter(isValidUUID);
      const hashes = targetModIds.filter(id => !isValidUUID(id));
      const modAuthorMap: Record<string, string> = {};

      if (hashes.length > 0) {
        const { data: verData } = await supabase.from('mod_versions').select('mod_id, dna_hash').in('dna_hash', hashes);
        if (verData && verData.length > 0) {
          const mIds = [...new Set(verData.map((v: any) => v.mod_id))];
          mIds.forEach(id => {
            if (!validModIds.includes(id)) validModIds.push(id);
          });
          verData.forEach((v: any) => {
            modAuthorMap[`HASH_MAP_${v.dna_hash}`] = v.mod_id;
          });
        }
      }

      if (validModIds.length > 0) {
        const { data: modsData } = await supabase.from('mods').select('id, mason_id').in('id', validModIds);
        modsData?.forEach(m => {
          modAuthorMap[m.id] = m.mason_id;
        });
      }

      // Partner Spoke Applications live in Partner Spokes (KeepersActiveGames), not Support Center.
      const finalTickets = mergedTickets.filter(
        (tk) => classifyKeeperTicket(tk) !== "partner_apps"
      );

      setTickets(finalTickets);

      const uniqueCats = [...new Set(finalTickets.map(t => t.ticket_type || t.category || "GENERAL"))];
      const dynamicOptions = [
        { id: "all", label: t("all_types", "All Types") },
        ...uniqueCats.map(c => ({ id: c, label: c.replace(/_/g, ' ') }))
      ];
      setCategoryOptions(dynamicOptions);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleTakeAction = async (actionType: "RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING", reason: string) => {
    if (!selectedTicket) return;

    const newStatus = actionType.toUpperCase();

    const newMetadata = {
      ...(selectedTicket.metadata || {}),
      action_log: [
        ...(selectedTicket.metadata?.action_log || []),
        {
          action: actionType,
          reason,
          timestamp: new Date().toISOString(),
          architect: userRole === "oversight" ? "Oversight" : userRole === "wayfinder" ? "Wayfinder" : userRole === "architect" ? "Architect" : "Mason"
        }
      ]
    };

    if (actionType === "ESCALATED") {
      delete newMetadata.claimed_by;
    }

    const { error } = await supabaseAuth
      .from('keeper_tickets')
      .update({
        status: newStatus,
        metadata: newMetadata
      })
      .eq('id', selectedTicket.id);

    if (error) {
      useStore.getState().pushStatus(t("err_save_failed", "Save failed:") + " " + error.message, "error");
      return;
    }

    useStore.getState().pushStatus(t("auto_ticket_status_updated_39", "Ticket status updated."), "success");

    if (userRole === "keeper" || userRole === "keepers") {
      logArchitectAction(
        `Keeper Ticket ${actionType}: ${reason}`,
        'keeper_tickets',
        selectedTicket.id,
        reason,
        'Keeper Hub',
        true,
        {
          status: { from: selectedTicket.status, to: newStatus },
          resolution_action: { to: actionType },
        }
      );
    }
    setSelectedTicket(null);
    fetchTickets();
  };

  const handleClaimTicket = async () => {
    if (!selectedTicket || !currentUserId) return;
    const newMetadata = { ...(selectedTicket.metadata || {}), claimed_by: currentUserId };
    const { error } = await supabaseAuth.from('keeper_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
    if (!error) {
      setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
      fetchTickets();
      useStore.getState().pushStatus(t("ticket_claim", "Claim Ticket") || "Ticket Claimed", "success");
    }
  };

  const handleReleaseTicket = async () => {
    if (!selectedTicket || !currentUserId) return;
    const newMetadata = { ...(selectedTicket.metadata || {}) };
    delete newMetadata.claimed_by;
    const { error } = await supabaseAuth.from('keeper_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
    if (!error) {
      setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
      fetchTickets();
      useStore.getState().pushStatus(t("ticket_release", "Release Ticket") || "Ticket Released", "success");
    }
  };

  const renderTicketCard = (ticket: Ticket) => {
    const statusLower = ticket.status?.toLowerCase() || 'new';
    const isNew = statusLower === 'new' || statusLower === 'open';
    const isResolved = statusLower === 'closed' || statusLower === 'resolved';
    const isRejected = statusLower === 'rejected';
    const isPending = statusLower === 'investigating' || statusLower === 'pending';
    const isEscalated = statusLower === 'escalated';

    const statusIconColor = isResolved
      ? "text-[var(--success)]"
      : isEscalated || isRejected
        ? "text-[var(--danger)]"
        : isPending
          ? "text-[var(--warning)]"
          : "text-[var(--accent)]";

    const statusIcon = isResolved
      ? t("icon_check_circle", "check_circle")
      : isRejected
        ? t("icon_cancel", "cancel")
        : isEscalated
          ? t("icon_priority_high", "priority_high")
          : isPending
            ? t("icon_schedule", "schedule")
            : t("icon_confirmation_number", "confirmation_number");

    const statusLabel = isNew
      ? t("ticket_status_open", "Open")
      : isResolved
        ? t("ticket_status_resolved", "Resolved")
        : isRejected
          ? t("ticket_status_rejected", "Rejected")
          : isEscalated
            ? t("ticket_status_escalated", "Escalated")
            : isPending
              ? t("ticket_status_pending", "Pending")
              : t(`ticket_status_${statusLower}`, ticket.status || "Open");

    return (
      <UniversalCard
        key={ticket.id}
        onClick={() => setSelectedTicket(ticket)}
        layout="vertical"
        isGhosted={isResolved || isRejected}
        icon={t("icon_support_agent", "support_agent")}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
                {statusIcon}
              </span>
              <span>{statusLabel}</span>
            </div>
            {(ticket.metadata?.expedited_support || ticket.metadata?.urgent) && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_bolt", "bolt")}
                </span>
                <span>{t("urgent", "Urgent")}</span>
              </div>
            )}
          </div>
        }
        title={ticket.title}
        subtitle={ticket.author_username ? `${ticket.author_username} • #${ticket.id.slice(0, 8)}` : `#${ticket.id.slice(0, 8)}`}
        badges={
          <>
            {(ticket.ticket_type || ticket.category) && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_local_activity", "local_activity")}
                </span>
                <span>{(ticket.ticket_type || ticket.category || "").replace(/_/g, " ")}</span>
              </div>
            )}
            {(ticket.target_mod_id || ticket.metadata?.target_mod_id) && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_extension", "extension")}
                </span>
                <span className="truncate max-w-[140px]">
                  {String(ticket.target_mod_id || ticket.metadata?.target_mod_id).slice(0, 12)}
                </span>
              </div>
            )}
          </>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-1.5 opacity-60">
              <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today", "calendar_today")}</span>
              {new Date(ticket.created_at).toLocaleDateString()}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0">
              {t("view_ticket", "View Ticket")} <span className="material-symbols-outlined !text-[12px]">{t("icon_arrow_forward", "arrow_forward")}</span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
          {ticket.description}
        </p>
      </UniversalCard>
    );
  };

  const activeTickets = tickets.filter((tk) => !isTicketClosedStatus(tk.status));
  const bugTickets = activeTickets.filter((tk) => classifyKeeperTicket(tk) === "bugs");
  const feedbackTickets = activeTickets.filter((tk) => classifyKeeperTicket(tk) === "feedback");
  const contactTickets = activeTickets.filter((tk) => classifyKeeperTicket(tk) === "contact");
  const closedTickets = tickets.filter((tk) => isTicketClosedStatus(tk.status));

  const renderLanding = () => {
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          title={t("landing_fb_bug_title", "Core Platform Bug Reports")}
          icon={t("icon_bug_report", "bug_report")}
          iconColorClass="text-[var(--danger)]"
          isEmpty={bugTickets.length === 0}
          emptyState={
            <EmptyState
              icon={t("icon_support_agent", "support_agent")}
              title={t("no_tickets", "No Support Tickets")}
              className="py-8"
            />
          }
        >
          {bugTickets.slice(0, 4).map(renderTicketCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("keepers_tab_platform_feedback", "Platform Feedback (Desktop • Website • Mobile PWA)")}
          icon={t("icon_rate_review", "rate_review")}
          iconColorClass="text-[var(--accent)]"
          isEmpty={feedbackTickets.length === 0}
          emptyState={
            <EmptyState
              icon={t("icon_rate_review", "rate_review")}
              title={t("no_tickets", "No Support Tickets")}
              className="py-8"
            />
          }
        >
          {feedbackTickets.slice(0, 4).map(renderTicketCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("landing_contact_card_title", "Direct Human Contact")}
          icon={t("icon_support_agent", "support_agent")}
          iconColorClass="text-[var(--warning)]"
          isEmpty={contactTickets.length === 0}
          emptyState={
            <EmptyState
              icon={t("icon_support_agent", "support_agent")}
              title={t("no_tickets", "No Support Tickets")}
              className="py-8"
            />
          }
        >
          {contactTickets.slice(0, 4).map(renderTicketCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview") || "Overview",
      icon: t("icon_dashboard", "dashboard"),
      number: activeTickets.length.toString(),
    },
    {
      id: "bugs",
      label: t("keepers_tab_core_bugs", "Core Bugs"),
      icon: t("icon_bug_report", "bug_report"),
      number: bugTickets.length.toString(),
      colorClass: "text-[var(--danger)]",
    },
    {
      id: "feedback",
      label: t("keepers_tab_feedback_short", "Platform Feedback"),
      icon: t("icon_rate_review", "rate_review"),
      number: feedbackTickets.length.toString(),
      colorClass: "text-[var(--accent)]",
    },
    {
      id: "contact",
      label: t("landing_contact_card_title", "Direct Human Contact"),
      icon: t("icon_support_agent", "support_agent"),
      number: contactTickets.length.toString(),
      colorClass: "text-[var(--warning)]",
    },
    {
      id: "closed",
      label: t("filter_closed", "Closed"),
      icon: t("icon_check_circle", "check_circle"),
      number: closedTickets.length.toString(),
      colorClass: "text-[var(--success)]",
    },
    {
      id: "settings",
      label: t("settings", "Settings") || "Settings",
      icon: t("icon_settings", "settings"),
      number: settingsCount.toString(),
    }
  ];

  const resolvedTab =
    activeFilter === "new" || activeFilter === "pending"
      ? "bugs"
      : activeFilter;

  return (
    <ElevatedHubLayout
      headerTitle={t("support_tickets", "Support Tickets") || "Support Tickets"}
      headerSubtitle={t("hub_subtitle_tickets", "Manage and resolve {citizen} support requests.") || "Manage and resolve citizen support requests."}
      headerIcon={t("icon_support_agent", "support_agent")}
      headerIconColorClass="text-[var(--accent)]"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("nav_search", "Search...")}
      hideSearch={resolvedTab === 'overview'}
      tabs={tabs}
      activeTab={resolvedTab}
      onTabChange={(id) => {
        setActiveFilter(id as KeepersSupportTab);
        setActiveCategory("all");
        setPlatformSubFilter("all");
        setStreamSubFilter("all");
      }}
      primaryPopover={
        resolvedTab === 'settings'
          ? {
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters") || "Filters",
              content: (
                <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("status", "Status") || "Status"}</span>
                    <CustomDropdown
                      flat={true}
                      variant="pill"
                      value={settingsStatusFilter}
                      onChange={(v: string[]) => setSettingsStatusFilter((v[0] as any) || "all")}
                      options={[
                        { id: "all", label: t("all_classes", "All Categories") },
                        { id: "active", label: t("support_active_only", "Active Only") },
                        { id: "inactive", label: t("support_inactive_only", "Inactive Only") }
                      ]}
                      disableTint={true}
                    />
                  </div>
                </div>
              )
            }
          : resolvedTab !== 'overview'
            ? {
                icon: t("icon_tune", "tune"),
                label: t("filters", "Filters") || "Filters",
                content: (
                  <div className="flex flex-col w-[320px] p-4 max-w-[calc(100vw-40px)] gap-4">
                    {resolvedTab !== "closed" && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("status", "Status")}
                        </span>
                        <CustomDropdown
                          flat={true}
                          variant="pill"
                          value={statusSubFilter}
                          onChange={(v: string[]) =>
                            setStatusSubFilter((v[0] as any) || "all_active")
                          }
                          options={[
                            { id: "all_active", label: t("all", "All") },
                            { id: "new", label: t("badge_new", "NEW") },
                            { id: "pending", label: t("ticket_tab_claimed", "Claimed") },
                            { id: "all", label: t("all_types", "All Types") },
                          ]}
                          disableTint={true}
                        />
                      </div>
                    )}

                    {(resolvedTab === "feedback" || resolvedTab === "bugs") && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("landing_feedback_form_platform", "Target Platform")}
                        </span>
                        <CustomDropdown
                          flat={true}
                          variant="pill"
                          value={platformSubFilter}
                          onChange={(v: string[]) => setPlatformSubFilter(v[0] || "all")}
                          options={[
                            { id: "all", label: t("all", "All") },
                            { id: "Desktop App", label: t("landing_fb_desktop_title", "Desktop App") },
                            { id: "Website", label: t("landing_fb_web_title", "Website") },
                            { id: "Mobile PWA", label: t("landing_fb_pwa_title", "Mobile PWA") },
                          ]}
                          disableTint={true}
                        />
                      </div>
                    )}

                    {resolvedTab === "feedback" && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("landing_feedback_form_stream", "Feedback / Support Stream")}
                        </span>
                        <CustomDropdown
                          flat={true}
                          variant="pill"
                          value={streamSubFilter}
                          onChange={(v: string[]) => setStreamSubFilter(v[0] || "all")}
                          options={[
                            { id: "all", label: t("all", "All") },
                            { id: "Feature Request", label: t("landing_fb_stream_feature", "Feature Request") },
                            { id: "Public Build Feedback", label: t("landing_fb_stream_public", "Public Build Feedback") },
                            { id: "Beta Build Feedback", label: t("landing_fb_stream_beta", "Beta Build Feedback") },
                          ]}
                          disableTint={true}
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category", "Category") || "Category"}</span>
                      <CustomDropdown
                        flat={true}
                        variant="pill"
                        value={activeCategory}
                        onChange={(v: string[]) => setActiveCategory(v[0])}
                        options={categoryOptions.length > 0 ? categoryOptions : [{ id: "all", label: t("all_types", "All Types") }]}
                        disableTint={true}
                      />
                    </div>
                  </div>
                )
              }
            : undefined
      }
      actions={
        resolvedTab === 'settings'
          ? [
              {
                id: "config_support_email",
                icon: t("icon_outgoing_mail", "outgoing_mail"),
                label: t("keepers_email_center_btn", "In-App Email Center"),
                onClick: () => {
                  loadEmailCenterData();
                  setIsEmailDrawerOpen(true);
                },
              },
              {
                id: "add_cat",
                icon: t("icon_add", "add"),
                label: t("support_add_cat", "Add Category"),
                onClick: () => openCatRef.current?.()
              }
            ]
          : [
              {
                id: "config_support_email",
                icon: t("icon_outgoing_mail", "outgoing_mail"),
                label: t("keepers_email_center_btn", "In-App Email Center"),
                onClick: () => {
                  loadEmailCenterData();
                  setIsEmailDrawerOpen(true);
                },
              },
            ]
      }
    >
      {resolvedTab === 'settings' ? (
        <KeeperSupportSettings
          embedded={true}
          externalSearch={searchQuery}
          statusFilter={settingsStatusFilter}
          openCatRef={openCatRef}
          onCountsChange={setSettingsCount}
        />
      ) : resolvedTab === 'overview' ? renderLanding() : (
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <EmptyState
              icon={t("icon_sync", "sync")}
              title={t("ui_btn_processing", "Processing...")}
            />
          ) : (() => {
            const filteredTickets = tickets.filter(t => {
              if (resolvedTab === "closed") {
                if (!isTicketClosedStatus(t.status)) return false;
              } else {
                const channel = classifyKeeperTicket(t);
                if (channel !== resolvedTab) return false;
                if (statusSubFilter === "all_active" && isTicketClosedStatus(t.status)) {
                  return false;
                }
                if (statusSubFilter === "new") {
                  const s = String(t.status || "NEW").toUpperCase();
                  if (!["NEW", "OPEN"].includes(s) || Boolean(t.metadata?.claimed_by)) return false;
                }
                if (statusSubFilter === "pending") {
                  const s = String(t.status || "NEW").toUpperCase();
                  if (
                    !["PENDING", "ESCALATED", "INVESTIGATING"].includes(s) &&
                    !Boolean(t.metadata?.claimed_by)
                  ) {
                    return false;
                  }
                }
              }

              if (platformSubFilter !== "all") {
                const plat =
                  t.metadata?.feedback_meta?.platform ||
                  (String(t.ticket_type || "").startsWith("Desktop App")
                    ? "Desktop App"
                    : String(t.ticket_type || "").startsWith("Website")
                      ? "Website"
                      : String(t.ticket_type || "").startsWith("Mobile PWA")
                        ? "Mobile PWA"
                        : "");
                if (plat !== platformSubFilter && !String(t.title || "").includes(platformSubFilter)) {
                  return false;
                }
              }

              if (streamSubFilter !== "all") {
                const strm = t.metadata?.feedback_meta?.stream || String(t.ticket_type || "");
                if (!strm.includes(streamSubFilter) && !String(t.title || "").includes(streamSubFilter)) {
                  return false;
                }
              }

              if (activeCategory !== "all") {
                const tCat = t.ticket_type || t.category || "GENERAL";
                if (tCat !== activeCategory) return false;
              }
              if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!(t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))) return false;
              }
              return true;
            });

            if (filteredTickets.length === 0) return (
              <EmptyState
                icon={searchQuery ? t("icon_search_off", "search_off") : t("icon_support_agent", "support_agent")}
                title={searchQuery ? t("no_matches", "No matches found") : t("no_tickets", "No Support Tickets")}
                className="col-span-full py-16"
              />
            );

            return (
              <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                {filteredTickets.map(renderTicketCard)}
              </div>
            );
          })()}
        </div>
      )}

      <TicketDossierSidePanel
        isOpen={!!selectedTicket}
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

      <SidePanel
        isOpen={isEmailDrawerOpen}
        onClose={() => setIsEmailDrawerOpen(false)}
        title={t("keepers_email_center_title", "In-App Email Center & Custom Sender")}
        subtitle={t("keepers_title", "Keepers Core")}
        icon={t("icon_outgoing_mail", "outgoing_mail")}
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={isSavingEmail ? t("icon_sync", "sync") : t("icon_save", "save")}
              tooltip={t("save", "Save")}
              onClick={handleSaveSupportEmail}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 pb-6">
          <SidePanelHeroCard
            icon={t("icon_outgoing_mail", "outgoing_mail")}
            overline={t("keepers_email_center_overline", "Keepers Core • Direct Mail Relay")}
            title={t("keepers_email_center_hero_title", "Custom Sender Identity & In-App Dispatch")}
            description={t(
              "keepers_email_center_hero_desc",
              "Dispatch outbound emails directly from Keepers Core using your custom sender identity, or configure your mail relay credentials (Resend API / Custom SMTP Webhook) for automated ticket correspondence."
            )}
            variant="accent"
          />

          <UniversalGroup
            title={t("keepers_email_compose_group", "Compose & Dispatch Custom Email")}
            icon={t("icon_send", "send")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UniversalInput
                label={t("keeper_email_recipient_label", "Recipient Email Address")}
                value={emailComposeTo}
                onChange={setEmailComposeTo}
                placeholder={t("keeper_email_recipient_placeholder", "citizen@domain.com")}
              />
              <UniversalInput
                label={t("keepers_email_subject_label", "Subject Line")}
                value={emailComposeSubject}
                onChange={setEmailComposeSubject}
                placeholder={t("keepers_email_subject_placeholder", "Official Sanctuary OS Correspondence")}
              />
            </div>
            <UniversalTextArea
              label={t("keepers_email_body_label", "Message Body")}
              value={emailComposeBody}
              onChange={setEmailComposeBody}
              placeholder={t(
                "keepers_email_body_placeholder",
                "Write your message to be formatted and dispatched from Keepers Core..."
              )}
              className="min-h-[120px]"
            />
            <ActionButton
              onClick={handleDispatchCustomEmail}
              disabled={
                isDispatchingEmail ||
                !emailComposeTo.trim().includes("@") ||
                !emailComposeSubject.trim() ||
                !emailComposeBody.trim()
              }
              className="w-full"
              icon={t("icon_outgoing_mail", "outgoing_mail")}
              variant="accent"
              label={
                isDispatchingEmail
                  ? t("btn_submitting", "Submitting...")
                  : t("keepers_email_btn_dispatch_now", "Dispatch From Keepers Core")
              }
            />
          </UniversalGroup>

          <UniversalGroup
            title={t("keepers_email_sender_group", "Custom Sender Identity & Mail Relay")}
            icon={t("icon_alternate_email", "alternate_email")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UniversalInput
                label={t("keepers_email_sender_name_label", "Custom Sender Display Name")}
                value={supportSenderNameInput}
                onChange={setSupportSenderNameInput}
                placeholder="Sanctuary OS Keepers Core"
              />
              <UniversalInput
                label={t("keepers_email_sender_addr_label", "Custom Sender Email (From)")}
                value={supportEmailInput}
                onChange={setSupportEmailInput}
                placeholder="support@sanctuaryos.gg"
              />
              <UniversalInput
                label={t("keepers_email_reply_to_label", "Reply-To Address")}
                value={supportReplyToInput}
                onChange={setSupportReplyToInput}
                placeholder="support@sanctuaryos.gg"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("keepers_email_provider_label", "Mail Relay Transport")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={supportEmailProvider}
                  onChange={(v: string[]) =>
                    setSupportEmailProvider((v[0] as "resend" | "webhook") || "resend")
                  }
                  options={[
                    {
                      id: "resend",
                      label: t("keepers_email_provider_resend", "Resend API (Custom Domain)"),
                    },
                    {
                      id: "webhook",
                      label: t("keepers_email_provider_webhook", "Custom SMTP / Webhook Relay"),
                    },
                  ]}
                />
              </div>
            </div>

            {supportEmailProvider === "resend" ? (
              <UniversalInput
                label={t("keepers_email_api_key_label", "Resend API Key (re_...)")}
                value={supportEmailApiKey}
                onChange={setSupportEmailApiKey}
                placeholder={t(
                  "keepers_email_api_key_placeholder",
                  "re_... (or configured in Edge Function Secrets)"
                )}
              />
            ) : (
              <UniversalInput
                label={t("keepers_email_webhook_label", "Custom SMTP / Webhook Relay URL")}
                value={supportEmailWebhookUrl}
                onChange={setSupportEmailWebhookUrl}
                placeholder="https://mail-relay.sanctuaryos.gg/dispatch"
              />
            )}

            <ActionButton
              onClick={handleSaveSupportEmail}
              disabled={isSavingEmail}
              className="w-full"
              icon={t("icon_save", "save")}
              variant="glass"
              label={t("keepers_email_btn_save_sender", "Save Custom Sender Configuration")}
            />
          </UniversalGroup>

          {recentDispatches.length > 0 && (
            <UniversalGroup
              title={t("keeper_email_dispatches_title", "Outbound Custom Email Dispatches")}
              icon={t("icon_history", "history")}
            >
              <div className="flex flex-col gap-2">
                {recentDispatches.map((item) => (
                  <div
                    key={item.id}
                    className="glass-surface px-4 py-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-[var(--text)] truncate">
                        {item.subject}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                        {item.from_email} {"->"} {item.to_email}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-rounded !text-[12px] text-[var(--accent)]">
                          {t("icon_mark_email_read", "mark_email_read")}
                        </span>
                        <span>{item.status || "DISPATCHED"}</span>
                      </span>
                      {item.created_at && (
                        <span className="text-[10px] font-mono text-[var(--subtext)]">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}
