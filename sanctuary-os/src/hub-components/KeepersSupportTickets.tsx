import { useState, useEffect, useRef } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from '../store';
import { supabase, supabaseAuth, getBrandConfig, isStandaloneFork, SANCTUARY_CONFIG } from "../supabase";
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import { logArchitectAction } from "../lib/audit";
import {
  CustomDropdown,
  EmptyState,
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  HoverTooltip,
  DashboardStatTile,
  SidePanelFilterBar,
  SidePanelHeroCard,
  VAULT_CHIP_CLASS,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import {
  SupportTicketCard,
  sortTicketsPriorityFirst,
} from "../components/universal/SupportTicketCard";
import { openSanctuaryContextMenu } from "../shared-components/ContextMenu";
import { UniversalGroup, UniversalInput, UniversalTextArea } from "../components/universal/UniversalLayout";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import KeeperSupportSettings from "./KeeperSupportSettings";
import {
  DEFAULT_KEEPER_EMAIL_RESPONSE_TEMPLATES,
  getKeepersPipelineConfig,
  KeeperEmailResponseTemplate,
  normalizeLegacySenderName,
  normalizeLegacySupportEmail,
  resolveKeeperEmailResponseTemplates,
  saveKeepersPipelineConfig,
  dispatchKeeperCustomEmail,
} from "../utils/supporterManager";
import {
  isTicketClaimedBy,
  isTicketVisibleToStaff,
  invalidateHubCommandCache,
} from "../utils/hubCommandCache";
import {
  maskEmailsInText,
  getEmailDispatchStatusMeta,
  formatEmailProviderLabel,
} from "../utils/sanctuaryEmailTemplates";
import EmailTemplatePreviewAndAuthSection from "./keepers-email/EmailTemplatePreviewAndAuthSection";
import EmailResponseTemplatesSection from "./keepers-email/EmailResponseTemplatesSection";
import EmailConversationSidePanel from "./keepers-email/EmailConversationSidePanel";

const DMARC_RECORD_VALUE = "v=DMARC1; p=none; rua=mailto:support@sanctuaryos.net;";

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
  const [modNameMap, setModNameMap] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const [settingsCount, setSettingsCount] = useState<number>(0);
  const [settingsStatusFilter, setSettingsStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const openCatRef = useRef<(() => void) | null>(null);
  const currentUserId = useStore(state => state.session?.user?.id);
  const currentUserEmail = useStore(state => state.session?.user?.email || "");

  // Keepers Core In-App Email Center & Custom Sender State
  const [isEmailDrawerOpen, setIsEmailDrawerOpen] = useState(false);
  const brandConfig = getBrandConfig();
  const defaultSenderDisplayName = isStandaloneFork
    ? `${brandConfig.orgName || brandConfig.appTitle || "Community"} Support`
    : brandConfig.appTitle || "Sanctuary OS";
  const defaultSupportEmail = normalizeLegacySupportEmail(
    brandConfig.supportEmail || "support@sanctuaryos.net"
  );

  const [supportSenderNameInput, setSupportSenderNameInput] = useState(defaultSenderDisplayName);
  const [supportEmailInput, setSupportEmailInput] = useState(defaultSupportEmail);
  const [supportReplyToInput, setSupportReplyToInput] = useState(defaultSupportEmail);
  const [supportEmailProvider, setSupportEmailProvider] = useState<"resend" | "webhook">("resend");
  const [supportEmailApiKey, setSupportEmailApiKey] = useState("");
  const [hasSavedEmailSecret, setHasSavedEmailSecret] = useState(false);
  const [hasSavedWebhookRelay, setHasSavedWebhookRelay] = useState(false);
  const [hasSavedInboundSecret, setHasSavedInboundSecret] = useState(false);
  const [inboundWebhookSecretInput, setInboundWebhookSecretInput] = useState("");
  const [supportEmailWebhookUrl, setSupportEmailWebhookUrl] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // Direct Custom Email Compose & Templates State
  const [emailComposeTo, setEmailComposeTo] = useState("");
  const [emailComposeSubject, setEmailComposeSubject] = useState("");
  const [emailComposeBody, setEmailComposeBody] = useState("");
  const [isDispatchingEmail, setIsDispatchingEmail] = useState(false);
  const [recentDispatches, setRecentDispatches] = useState<any[]>([]);
  const [activeEmailThread, setActiveEmailThread] = useState<{
    threadId?: string | null;
    dispatchId?: string | null;
    ticketId?: string | null;
    subject?: string;
  } | null>(null);
  const [emailDrawerTab, setEmailDrawerTab] = useState<"compose" | "templates" | "config" | "activity">("compose");
  const [showComposePreview, setShowComposePreview] = useState(false);
  const [revealComposeRecipient, setRevealComposeRecipient] = useState(true);
  const [isClearingDispatches, setIsClearingDispatches] = useState(false);
  const [responseTemplates, setResponseTemplates] = useState<KeeperEmailResponseTemplate[]>(
    () => DEFAULT_KEEPER_EMAIL_RESPONSE_TEMPLATES.map((tpl) => ({ ...tpl }))
  );
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);

  const loadEmailCenterData = async () => {
    try {
      const cfg = await getKeepersPipelineConfig();
      if (cfg?.support_sender_name) {
        setSupportSenderNameInput(
          normalizeLegacySenderName(cfg.support_sender_name, defaultSenderDisplayName)
        );
      }
      if (cfg?.support_contact_email) {
        setSupportEmailInput(normalizeLegacySupportEmail(cfg.support_contact_email));
      }
      if (cfg?.support_reply_to_email) {
        setSupportReplyToInput(normalizeLegacySupportEmail(cfg.support_reply_to_email));
      }
      if (cfg?.support_email_provider) {
        setSupportEmailProvider(
          cfg.support_email_provider.toLowerCase() === "webhook"
            ? "webhook"
            : "resend"
        );
      }
      if (cfg?.support_email_webhook_url) setSupportEmailWebhookUrl(cfg.support_email_webhook_url);
      setResponseTemplates(resolveKeeperEmailResponseTemplates(cfg));
    } catch {
      // ignore
    }

    try {
      const [{ data: logs }, { data: statusData }] = await Promise.all([
        supabaseAuth
          .from("keeper_email_dispatches")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(40),
        supabaseAuth.functions
          .invoke("keeper-email-dispatch", {
            body: { action: "check_email_status" },
          })
          .catch(() => ({ data: null })),
      ]);
      if (logs) setRecentDispatches(logs);
      if (statusData?.ok) {
        setHasSavedEmailSecret(Boolean(statusData.resend_configured));
        setHasSavedWebhookRelay(Boolean(statusData.webhook_configured));
        setHasSavedInboundSecret(Boolean(statusData.inbound_configured));
      }
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
      const cleanedSender = normalizeLegacySenderName(
        supportSenderNameInput,
        defaultSenderDisplayName
      );
      const cleanedEmail = normalizeLegacySupportEmail(
        supportEmailInput.trim() || defaultSupportEmail
      );
      const cleanedReply = normalizeLegacySupportEmail(
        supportReplyToInput.trim() || cleanedEmail
      );
      const trimmedApiKey = supportEmailApiKey.trim();
      const trimmedWebhook = supportEmailWebhookUrl.trim();
      const trimmedInboundSecret = inboundWebhookSecretInput.trim();

      if (trimmedApiKey || trimmedInboundSecret || (supportEmailProvider === "webhook" && trimmedWebhook)) {
        const secretPayload: Record<string, string> = {
          action: "save_email_secrets",
        };
        if (trimmedApiKey) {
          secretPayload.api_key = trimmedApiKey;
          secretPayload.support_email_api_key = trimmedApiKey;
        }
        if (supportEmailProvider === "webhook" && trimmedWebhook) {
          secretPayload.support_email_webhook_url = trimmedWebhook;
        }
        if (trimmedInboundSecret) {
          secretPayload.inbound_webhook_secret = trimmedInboundSecret;
        }
        const { data: secretRes, error: secretErr } = await supabaseAuth.functions.invoke(
          "keeper-email-dispatch",
          { body: secretPayload }
        );
        if (secretErr || secretRes?.ok === false) {
          throw new Error(secretErr?.message || secretRes?.error || "Failed to save email secret");
        }
        if (trimmedApiKey) {
          setSupportEmailApiKey("");
          setHasSavedEmailSecret(true);
        }
        if (trimmedInboundSecret) {
          setInboundWebhookSecretInput("");
          setHasSavedInboundSecret(true);
        }
        if (trimmedWebhook) {
          setHasSavedWebhookRelay(true);
        }
      }

      await saveKeepersPipelineConfig({
        support_sender_name: cleanedSender,
        support_contact_email: cleanedEmail,
        support_reply_to_email: cleanedReply,
        support_email_provider: supportEmailProvider,
        support_email_api_key: undefined,
        support_email_webhook_url: trimmedWebhook,
      });
      setSupportSenderNameInput(cleanedSender);
      setSupportEmailInput(cleanedEmail);
      setSupportReplyToInput(cleanedReply);
      useStore
        .getState()
        .pushStatus(
          t("keepers_support_email_saved", "Custom Email Sender configuration saved!"),
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
        from_name: normalizeLegacySenderName(supportSenderNameInput, defaultSenderDisplayName),
        from_email: supportEmailInput.trim() || defaultSupportEmail,
        reply_to: supportReplyToInput.trim() || supportEmailInput.trim() || defaultSupportEmail,
      });
      if (res.ok) {
        useStore
          .getState()
          .pushStatus(
            t("keeper_email_compose_sent", "Custom email dispatched!"),
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

  const handleSaveResponseTemplates = async (
    nextTemplates: KeeperEmailResponseTemplate[]
  ) => {
    if (isSavingTemplates) return;
    setIsSavingTemplates(true);
    try {
      await saveKeepersPipelineConfig({ email_response_templates: nextTemplates });
      setResponseTemplates(nextTemplates);
      useStore
        .getState()
        .pushStatus(
          t("keepers_email_tpl_saved", "Saved Human Response templates!"),
          "success"
        );
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsSavingTemplates(false);
    }
  };

  const handleClearEmailDispatches = async () => {
    if (isClearingDispatches) return;
    setIsClearingDispatches(true);
    try {
      const { data: clearRes, error: clearErr } = await supabaseAuth.functions.invoke(
        "keeper-email-dispatch",
        { body: { action: "clear_email_dispatches" } }
      );
      if (clearErr || clearRes?.ok === false) {
        throw new Error(clearErr?.message || clearRes?.error || "Failed to clear email logs");
      }
      setRecentDispatches([]);
      useStore
        .getState()
        .pushStatus(t("keepers_email_logs_cleared", "Cleared outbound email history."), "success");
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsClearingDispatches(false);
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
      const { data: profiles } = await supabaseAuth.from('profiles').select('id, username').in('id', authorIds);
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

      const nextModNames: Record<string, string> = {};
      try {
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
          const { data: modsData } = await supabase.from('mods').select('id, name, mason_id').in('id', validModIds);
          modsData?.forEach(m => {
            modAuthorMap[m.id] = m.mason_id;
            if (m.name) nextModNames[m.id] = String(m.name);
          });
          hashes.forEach(h => {
            const resolvedId = modAuthorMap[`HASH_MAP_${h}`];
            if (resolvedId && nextModNames[resolvedId]) {
              nextModNames[h] = nextModNames[resolvedId];
            }
          });
        }
      } catch {
        // Best-effort target mod lookup across active Spoke
      }
      setModNameMap(nextModNames);

      // Partner Spoke Applications live in Partner Spokes (KeepersActiveGames), not Support Center.
      const finalTickets = sortTicketsPriorityFirst(
        mergedTickets.filter(
          (tk) =>
            classifyKeeperTicket(tk) !== "partner_apps" &&
            (userRole === "mason" || isTicketVisibleToStaff(tk, currentUserId))
        )
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
  }, [currentUserId, userRole]);

  const handleTakeAction = async (actionType: "RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING", reason: string) => {
    if (!selectedTicket) return;

    const newStatus = actionType.toUpperCase();

    const newMetadata: Record<string, any> = {
      ...(selectedTicket.metadata || {}),
      action_log: [
        ...(selectedTicket.metadata?.action_log || []),
        {
          action: actionType,
          reason,
          timestamp: new Date().toISOString(),
          architect: userRole === "oversight" ? "Oversight" : userRole === "wayfinder" ? "Wayfinder" : userRole === "architect" ? "Architect" : userRole === "keeper" || userRole === "keepers" ? "Keeper" : "Mason"
        }
      ]
    };

    if (actionType === "ESCALATED" || actionType === "RESOLVED" || actionType === "REJECTED") {
      delete newMetadata.claimed_by;
      delete newMetadata.claimed_role;
    } else if (actionType === "PENDING" && currentUserId && userRole !== "mason") {
      newMetadata.claimed_by = currentUserId;
      newMetadata.claimed_role = "keeper";
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
    invalidateHubCommandCache("keeper");
    setSelectedTicket(null);
    fetchTickets();
  };

  const handleClaimTicket = async () => {
    if (!selectedTicket || !currentUserId) return;
    const newMetadata = { ...(selectedTicket.metadata || {}), claimed_by: currentUserId, claimed_role: "keeper" };
    const { error } = await supabaseAuth.from('keeper_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
    if (!error) {
      invalidateHubCommandCache("keeper");
      setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
      fetchTickets();
      useStore.getState().pushStatus(t("ticket_claim", "Claim Ticket") || "Ticket Claimed", "success");
    }
  };

  const handleReleaseTicket = async () => {
    if (!selectedTicket || !currentUserId) return;
    const newMetadata = { ...(selectedTicket.metadata || {}) };
    delete newMetadata.claimed_by;
    delete newMetadata.claimed_role;
    const { error } = await supabaseAuth.from('keeper_tickets').update({ metadata: newMetadata }).eq('id', selectedTicket.id);
    if (!error) {
      invalidateHubCommandCache("keeper");
      setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
      fetchTickets();
      useStore.getState().pushStatus(t("ticket_release", "Release Ticket") || "Ticket Released", "success");
    }
  };

  const renderTicketCard = (ticket: Ticket) => {
    const rawModId = String(ticket.target_mod_id || ticket.metadata?.target_mod_id || "").trim();
    const resolvedModName = rawModId ? modNameMap[rawModId] || null : null;
    const replyCount = Array.isArray(ticket.metadata?.replies)
      ? ticket.metadata.replies.length
      : 0;

    return (
      <SupportTicketCard
        key={ticket.id}
        ticket={ticket}
        t={t}
        claimedBySelf={Boolean(currentUserId) && isTicketClaimedBy(ticket) === String(currentUserId)}
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
  };

  const activeTickets = tickets.filter((tk) => !isTicketClosedStatus(tk.status));
  const claimedKeeperTickets = activeTickets.filter(
    (tk) => Boolean(currentUserId) && isTicketClaimedBy(tk) === String(currentUserId)
  );
  const bugTickets = activeTickets.filter((tk) => classifyKeeperTicket(tk) === "bugs");
  const feedbackTickets = activeTickets.filter((tk) => classifyKeeperTicket(tk) === "feedback");
  const contactTickets = activeTickets.filter((tk) => classifyKeeperTicket(tk) === "contact");
  const closedTickets = tickets.filter((tk) => isTicketClosedStatus(tk.status));

  const renderLanding = () => {
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          title={t("ticket_tab_claimed", "Claimed")}
          icon={t("icon_assignment_ind", "assignment_ind")}
          iconColorClass="text-[var(--warning)]"
          headerAction={
            <button
              type="button"
              onClick={() => setActiveFilter("pending")}
              className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_arrow_forward", "arrow_forward")}
              </span>
              <HoverTooltip title={t("ticket_tab_claimed", "Claimed")} />
            </button>
          }
          isEmpty={claimedKeeperTickets.length === 0}
          emptyState={
            <EmptyState
              icon={t("icon_done_all", "done_all")}
              title={t("no_claimed_tickets", "No Claimed Tickets")}
              className="py-8"
            />
          }
        >
          {claimedKeeperTickets.slice(0, 4).map(renderTicketCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("landing_fb_bug_title", "Core Platform Bug Reports")}
          icon={t("icon_bug_report", "bug_report")}
          iconColorClass="text-[var(--danger)]"
          headerAction={
            <button
              type="button"
              onClick={() => setActiveFilter("bugs")}
              className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_arrow_forward", "arrow_forward")}
              </span>
              <HoverTooltip title={t("keepers_tab_core_bugs", "Core Bugs")} />
            </button>
          }
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
          headerAction={
            <button
              type="button"
              onClick={() => setActiveFilter("feedback")}
              className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_arrow_forward", "arrow_forward")}
              </span>
              <HoverTooltip title={t("keepers_tab_feedback_short", "Platform Feedback")} />
            </button>
          }
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
          headerAction={
            <button
              type="button"
              onClick={() => setActiveFilter("contact")}
              className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_arrow_forward", "arrow_forward")}
              </span>
              <HoverTooltip title={t("landing_contact_card_title", "Direct Human Contact")} />
            </button>
          }
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
      id: "pending",
      label: t("ticket_tab_claimed", "Claimed"),
      icon: t("icon_assignment_ind", "assignment_ind"),
      number: claimedKeeperTickets.length.toString(),
      colorClass: "text-[var(--warning)]",
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

  const resolvedTab = activeFilter === "new" ? "bugs" : activeFilter;

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
                            { id: "new", label: t("new", "New") },
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
              } else if (resolvedTab === "pending") {
                if (
                  isTicketClosedStatus(t.status) ||
                  !currentUserId ||
                  isTicketClaimedBy(t) !== String(currentUserId)
                ) {
                  return false;
                }
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
        subtitle={t("keepers_foundry_label", "Sanctuary Foundry")}
        icon={t("icon_outgoing_mail", "outgoing_mail")}
        widthClass="w-[92vw] md:w-[920px]"
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
          <SidePanelFilterBar className="grid-cols-2 lg:grid-cols-4 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              isActive={emailDrawerTab === "compose"}
              icon={t("icon_send", "send")}
              label={t("keepers_email_tab_compose", "Compose")}
              value={t("keepers_email_tab_direct", "Direct")}
              onClick={() => setEmailDrawerTab("compose")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              isActive={emailDrawerTab === "templates"}
              icon={t("icon_quickreply", "quickreply")}
              label={t("tab_templates", "Templates")}
              value={responseTemplates.length}
              onClick={() => setEmailDrawerTab("templates")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              isActive={emailDrawerTab === "config"}
              icon={t("icon_tune", "tune")}
              label={t("config", "Config")}
              value={
                hasSavedEmailSecret || hasSavedWebhookRelay
                  ? t("active", "Active")
                  : t("keepers_email_status_setup", "Setup")
              }
              onClick={() => setEmailDrawerTab("config")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              isActive={emailDrawerTab === "activity"}
              icon={t("icon_history", "history")}
              label={t("keepers_email_tab_activity", "Activity")}
              value={recentDispatches.length}
              onClick={() => setEmailDrawerTab("activity")}
            />
          </SidePanelFilterBar>

          {emailDrawerTab === "compose" && (
            <>
              <UniversalGroup
                title={t("keepers_email_compose_group", "Compose & Dispatch Custom Email")}
                icon={t("icon_send", "send")}
                headerAction={
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={
                        revealComposeRecipient
                          ? t("icon_visibility_off", "visibility_off")
                          : t("icon_visibility", "visibility")
                      }
                      tooltip={
                        revealComposeRecipient
                          ? t("keepers_email_mask_recipient", "Hide Recipient Email")
                          : t("keepers_email_reveal_recipient", "Reveal Recipient Email")
                      }
                      onClick={() => setRevealComposeRecipient((prev) => !prev)}
                    />
                  </PanelHeaderGroup>
                }
              >
                {responseTemplates.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                      {t("keepers_email_load_tpl_label", "Load Response Template")}
                    </label>
                    <CustomDropdown
                      disableTint={true}
                      value=""
                      placeholder={t(
                        "keepers_email_load_tpl_ph",
                        "Choose a Human Response Template..."
                      )}
                      onChange={(vals: string[]) => {
                        const chosen = responseTemplates.find((tpl) => tpl.id === vals[0]);
                        if (chosen) {
                          setEmailComposeSubject(chosen.subject);
                          setEmailComposeBody(chosen.body);
                          useStore
                            .getState()
                            .pushStatus(
                              t(
                                "keepers_email_tpl_applied",
                                "Applied Human Response template!"
                              ),
                              "success"
                            );
                        }
                      }}
                      options={responseTemplates.map((tpl) => ({
                        id: tpl.id,
                        label: `${tpl.name} (${tpl.category || t("keepers_email_tpl_default_cat", "Support")})`,
                      }))}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <UniversalInput
                    label={t("keeper_email_recipient_label", "Recipient Email Address")}
                    type={revealComposeRecipient ? "email" : "password"}
                    className="no-text-case"
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
                    "Write your message to be formatted and dispatched..."
                  )}
                  className="min-h-[120px]"
                />
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    onClick={() => {
                      const usableEmail =
                        currentUserEmail &&
                        !/@blind\.sanctuaryos\.(net|local)$/i.test(currentUserEmail)
                          ? currentUserEmail
                          : "";
                      if (usableEmail) {
                        setEmailComposeTo(usableEmail);
                        setRevealComposeRecipient(false);
                      }
                      setEmailComposeSubject(
                        t(
                          "keepers_email_test_subject",
                          "Sanctuary OS — Official Channel Check"
                        )
                      );
                      setEmailComposeBody(
                        t(
                          "keepers_email_test_body",
                          "Greetings from Sanctuary Foundry.\n\nThis message confirms that outbound mail relay and support notifications are active for sanctuaryos.net."
                        )
                      );
                    }}
                    className="w-auto shrink-0"
                    icon={t("icon_science", "science")}
                    variant="glass"
                    label={t("keepers_email_btn_prefill_test", "Prefill Test")}
                  />
                  <ActionButton
                    onClick={() => setShowComposePreview((prev) => !prev)}
                    className="w-auto shrink-0"
                    icon={
                      showComposePreview
                        ? t("icon_visibility_off", "visibility_off")
                        : t("icon_visibility", "visibility")
                    }
                    variant="glass"
                    label={
                      showComposePreview
                        ? t("hide", "Hide")
                        : t("preview", "Preview")
                    }
                  />
                  <ActionButton
                    onClick={handleDispatchCustomEmail}
                    disabled={
                      isDispatchingEmail ||
                      !emailComposeTo.trim().includes("@") ||
                      !emailComposeSubject.trim() ||
                      !emailComposeBody.trim()
                    }
                    className="flex-1"
                    icon={t("icon_outgoing_mail", "outgoing_mail")}
                    variant="accent"
                    label={
                      isDispatchingEmail
                        ? t("btn_submitting", "Submitting...")
                        : t("keepers_email_btn_dispatch_now", "Dispatch Official Email")
                    }
                  />
                </div>
              </UniversalGroup>

              {showComposePreview && (
                <EmailTemplatePreviewAndAuthSection
                  mode="compose_preview"
                  fromName={normalizeLegacySenderName(supportSenderNameInput, defaultSenderDisplayName)}
                  subject={emailComposeSubject}
                  bodyText={emailComposeBody}
                />
              )}
            </>
          )}

          {emailDrawerTab === "templates" && (
            <EmailResponseTemplatesSection
              templates={responseTemplates}
              isSaving={isSavingTemplates}
              onSaveTemplates={handleSaveResponseTemplates}
              onUseTemplate={(tpl) => {
                setEmailComposeSubject(tpl.subject);
                setEmailComposeBody(tpl.body);
                setEmailDrawerTab("compose");
                useStore
                  .getState()
                  .pushStatus(
                    t("keepers_email_tpl_applied", "Applied Human Response template!"),
                    "success"
                  );
              }}
            />
          )}

          {emailDrawerTab === "config" && (
            <div className="flex flex-col gap-4">
              <UniversalGroup
              title={t("keepers_email_sender_group", "Custom Sender Identity & Mail Relay")}
              icon={t("icon_alternate_email", "alternate_email")}
              headerAction={
                <span className={VAULT_CHIP_CLASS}>
                  <span
                    className={`material-symbols-outlined !text-[12px] ${
                      hasSavedEmailSecret || hasSavedWebhookRelay
                        ? "text-[var(--success)]"
                        : "text-[var(--warning)]"
                    }`}
                  >
                    {hasSavedEmailSecret || hasSavedWebhookRelay
                      ? t("icon_verified", "verified")
                      : t("icon_info", "info")}
                  </span>
                  <span>
                    {hasSavedEmailSecret
                      ? t("keepers_email_status_resend_ready", "Resend API Sealed")
                      : hasSavedWebhookRelay
                        ? t("keepers_email_status_webhook_ready", "Webhook Relay Sealed")
                        : t(
                            "keepers_email_status_fallback",
                            "In-App Fallback (Add Resend Key Above)"
                          )}
                  </span>
                </span>
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UniversalInput
                  label={t("keepers_email_sender_name_label", "Custom Sender Display Name")}
                  value={supportSenderNameInput}
                  onChange={setSupportSenderNameInput}
                  placeholder={defaultSenderDisplayName}
                />
                <UniversalInput
                  label={t("keepers_email_sender_addr_label", "Custom Sender Email (From)")}
                  className="no-text-case"
                  value={supportEmailInput}
                  onChange={setSupportEmailInput}
                  placeholder={defaultSupportEmail}
                />
                <UniversalInput
                  label={t("keepers_email_reply_to_label", "Reply-To Address")}
                  className="no-text-case"
                  value={supportReplyToInput}
                  onChange={setSupportReplyToInput}
                  placeholder={defaultSupportEmail}
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
                  type="password"
                  className="no-text-case"
                  value={supportEmailApiKey}
                  onChange={setSupportEmailApiKey}
                  placeholder={
                    hasSavedEmailSecret
                      ? `•••••••• (${t("keepers_email_api_key_placeholder", "re_... (or configured in Edge Function Secrets)")})`
                      : t(
                          "keepers_email_api_key_placeholder",
                          "re_... (or configured in Edge Function Secrets)"
                        )
                  }
                />
              ) : (
                <UniversalInput
                  label={t("keepers_email_webhook_label", "Custom SMTP / Webhook Relay URL")}
                  className="no-text-case"
                  value={supportEmailWebhookUrl}
                  onChange={setSupportEmailWebhookUrl}
                  placeholder="https://mail-relay.sanctuaryos.net/dispatch"
                />
              )}

              <UniversalInput
                label={t("keepers_email_inbound_secret_label", "Inbound Replies Webhook Secret (whsec_... or shared secret)")}
                type="password"
                className="no-text-case"
                value={inboundWebhookSecretInput}
                onChange={setInboundWebhookSecretInput}
                placeholder={
                  hasSavedInboundSecret
                    ? `•••••••• (${t("keepers_email_inbound_secret_configured", "Inbound webhook secret sealed")})`
                    : t("keepers_email_inbound_secret_ph", "whsec_... (Svix Resend secret or x-sanctuary-inbound-secret)")
                }
              />

              <ActionButton
                onClick={handleSaveSupportEmail}
                disabled={isSavingEmail}
                className="w-full"
                icon={t("icon_save", "save")}
                variant="glass"
                label={t("keepers_email_btn_save_sender", "Save Custom Sender Configuration")}
              />

              <div className="flex flex-col gap-2.5 pt-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] px-1">
                  {t("keepers_email_quick_ref_title", "Quick Reference (SMTP & DNS)")}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <UniversalCard
                    layout="vertical"
                    statusColor="accent"
                    icon={t("icon_dns", "dns")}
                    bannerTopLabel={t("keepers_email_tls_badge", "TLS / 465")}
                    bannerTopRightLabel="smtp.resend.com"
                    bannerBottomLabel="noreply@sanctuaryos.net"
                    title={t("keepers_email_smtp_short_label", "Supabase Auth SMTP")}
                    subtitle={
                      <span className="no-text-case">
                        {t("keepers_email_smtp_short_val", "smtp.resend.com • Port 465 • User: resend")}
                      </span>
                    }
                    imageOverlay={
                      <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_lock", "lock")}
                          </span>
                          <span>{t("keepers_email_tls_badge", "TLS / 465")}</span>
                        </span>
                      </div>
                    }
                    onClick={() => {
                      navigator.clipboard?.writeText(
                        "Host: smtp.resend.com\nPort: 465\nUsername: resend\nSender: noreply@sanctuaryos.net"
                      );
                      useStore
                        .getState()
                        .pushStatus(
                          t("keepers_email_smtp_copied", "Copied Auth SMTP settings!"),
                          "success"
                        );
                    }}
                    footer={
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="no-text-case font-mono text-[10px] text-[var(--subtext)] truncate">
                          noreply@sanctuaryos.net
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
                          <span>{t("copy", "Copy")}</span>
                          <span className="material-symbols-outlined !text-[13px]">
                            {t("icon_content_copy", "content_copy")}
                          </span>
                        </span>
                      </div>
                    }
                  />
                  <UniversalCard
                    layout="vertical"
                    statusColor="accent"
                    icon={t("icon_shield", "shield")}
                    bannerTopLabel={t("keepers_email_dns_txt_badge", "DNS TXT")}
                    bannerTopRightLabel="_dmarc"
                    bannerBottomLabel={DMARC_RECORD_VALUE}
                    title={t("keepers_email_dmarc_short_label", "Cloudflare DMARC TXT")}
                    subtitle={<span className="no-text-case">_dmarc</span>}
                    description={
                      <span className="no-text-case font-mono text-[11px] text-[var(--subtext)] break-all">
                        {DMARC_RECORD_VALUE}
                      </span>
                    }
                    imageOverlay={
                      <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_dns", "dns")}
                          </span>
                          <span>{t("keepers_email_txt_badge", "TXT")}</span>
                        </span>
                      </div>
                    }
                    onClick={() => {
                      navigator.clipboard?.writeText(DMARC_RECORD_VALUE);
                      useStore
                        .getState()
                        .pushStatus(
                          t("keepers_email_dmarc_copied", "Copied DMARC TXT record value!"),
                          "success"
                        );
                    }}
                    footer={
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80">
                          {t("keepers_email_dns_txt_badge", "DNS TXT")}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
                          <span>{t("copy", "Copy")}</span>
                          <span className="material-symbols-outlined !text-[13px]">
                            {t("icon_content_copy", "content_copy")}
                          </span>
                        </span>
                      </div>
                    }
                  />
                  <UniversalCard
                    layout="vertical"
                    className="sm:col-span-2"
                    statusColor={hasSavedInboundSecret ? "success" : "warning"}
                    icon={t("icon_webhook", "webhook")}
                    bannerTopLabel={t("keepers_email_inbound_url_label", "Inbound Webhook URL")}
                    bannerTopRightLabel={
                      hasSavedInboundSecret
                        ? t("active", "Active")
                        : t("keepers_email_status_setup", "Setup")
                    }
                    bannerBottomLabel="email.received • POST ?inbound=1"
                    title={t("keepers_email_inbound_card_title", "Inbound Replies Webhook (Resend / Relay)")}
                    subtitle={<span className="no-text-case">POST email.received &bull; ?inbound=1</span>}
                    description={
                      <span className="no-text-case font-mono text-[11px] text-[var(--subtext)] break-all">
                        {`${String(SANCTUARY_CONFIG.supabaseUrl || "").replace(/\/+$/, "")}/functions/v1/keeper-email-dispatch?inbound=1`}
                      </span>
                    }
                    imageOverlay={
                      <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                        <span className={VAULT_CHIP_CLASS}>
                          <span
                            className={`material-symbols-outlined !text-[12px] ${
                              hasSavedInboundSecret ? "text-[var(--success)]" : "text-[var(--warning)]"
                            }`}
                          >
                            {hasSavedInboundSecret ? t("icon_verified", "verified") : t("icon_key", "key")}
                          </span>
                          <span>
                            {hasSavedInboundSecret
                              ? t("keepers_email_inbound_secret_ready", "Webhook Verified")
                              : t("keepers_email_status_setup", "Setup")}
                          </span>
                        </span>
                      </div>
                    }
                    onClick={() => {
                      const inboundUrl = `${String(SANCTUARY_CONFIG.supabaseUrl || "").replace(/\/+$/, "")}/functions/v1/keeper-email-dispatch?inbound=1`;
                      navigator.clipboard?.writeText(inboundUrl);
                      useStore
                        .getState()
                        .pushStatus(
                          t("keepers_email_inbound_url_copied", "Copied Inbound Webhook URL!"),
                          "success"
                        );
                    }}
                    footer={
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80">
                          {t("keepers_email_inbound_footer_note", "Resend email.received")}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
                          <span>{t("copy", "Copy")}</span>
                          <span className="material-symbols-outlined !text-[13px]">
                            {t("icon_content_copy", "content_copy")}
                          </span>
                        </span>
                      </div>
                    }
                  />
                </div>
              </div>
              </UniversalGroup>
              <EmailTemplatePreviewAndAuthSection
                mode="auth_templates"
                fromName={normalizeLegacySenderName(supportSenderNameInput, defaultSenderDisplayName)}
                subject={emailComposeSubject}
                bodyText={emailComposeBody}
              />
            </div>
          )}

          {emailDrawerTab === "activity" && (
            recentDispatches.length > 0 ? (() => {
              const threadMap = new Map<string, { latest: any; count: number; hasInbound: boolean }>();
              for (const row of recentDispatches) {
                const threadKey = String(row.thread_id || row.ticket_id || row.id);
                const existing = threadMap.get(threadKey);
                const isInbound = String(row.direction || "outbound").toLowerCase() === "inbound";
                if (!existing) {
                  threadMap.set(threadKey, { latest: row, count: 1, hasInbound: isInbound });
                } else {
                  existing.count += 1;
                  if (isInbound) existing.hasInbound = true;
                }
              }
              const threadEntries = Array.from(threadMap.values());
              return (
              <div className="flex flex-col gap-4">
                <SidePanelHeroCard
                  icon={t("icon_history", "history")}
                  overline={t("keepers_foundry_label", "Sanctuary Foundry")}
                  title={t("keeper_email_dispatches_title", "Outbound Custom Email Dispatches")}
                  badge={`${threadEntries.length} ${t("keepers_email_threads_count", "Conversations")}`}
                  badgeIcon={t("icon_forum", "forum")}
                  variant="accent"
                >
                  <div className="flex justify-end w-full">
                    <ActionButton
                      onClick={handleClearEmailDispatches}
                      disabled={isClearingDispatches}
                      variant="glass"
                      className="text-[var(--danger)]"
                      icon={
                        isClearingDispatches
                          ? t("icon_sync", "sync")
                          : t("icon_delete_sweep", "delete_sweep")
                      }
                      label={t("clear", "Clear")}
                    />
                  </div>
                </SidePanelHeroCard>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {threadEntries.map(({ latest: item, count, hasInbound }) => {
                    const statusMeta = getEmailDispatchStatusMeta(item.status, t);
                    const providerLabel = formatEmailProviderLabel(item.provider);
                    const dateLabel = item.created_at
                      ? new Date(item.created_at).toLocaleDateString()
                      : "";
                    const senderLabel = normalizeLegacySenderName(
                      item.from_name,
                      defaultSenderDisplayName
                    );
                    const recipientMasked = maskEmailsInText(item.to_email || item.from_email || "");
                    return (
                      <UniversalCard
                        key={item.thread_id || item.ticket_id || item.id}
                        layout="vertical"
                        statusColor={hasInbound ? "warning" : statusMeta.cardStatusColor}
                        icon={
                          hasInbound
                            ? t("icon_forum", "forum")
                            : t("icon_outgoing_mail", "outgoing_mail")
                        }
                        bannerTopLabel={statusMeta.label}
                        bannerTopRightLabel={`${count} ${t("keepers_email_thread_msgs_short", "msgs")}`}
                        bannerBottomLabel={recipientMasked || senderLabel}
                        title={
                          item.subject ||
                          t("keepers_email_subject_placeholder", "Official Sanctuary OS Correspondence")
                        }
                        subtitle={
                          <span className="no-text-case font-mono text-[11px] break-all">
                            {recipientMasked} &bull; {senderLabel}
                          </span>
                        }
                        imageOverlay={
                          <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                            <span className={VAULT_CHIP_CLASS}>
                              <span
                                className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColorClass}`}
                              >
                                {statusMeta.iconName}
                              </span>
                              <span>{statusMeta.label}</span>
                            </span>
                          </div>
                        }
                        badges={
                          <>
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_forum", "forum")}
                              </span>
                              <span>
                                {count} {t("keepers_email_thread_msgs", "Messages")}
                              </span>
                            </span>
                            {hasInbound && (
                              <span className={VAULT_CHIP_CLASS}>
                                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                                  {t("icon_move_to_inbox", "move_to_inbox")}
                                </span>
                                <span>{t("keepers_email_dir_inbound", "External Reply")}</span>
                              </span>
                            )}
                          </>
                        }
                        onClick={() =>
                          setActiveEmailThread({
                            threadId: item.thread_id || item.ticket_id || item.id,
                            dispatchId: item.id,
                            ticketId: item.ticket_id || null,
                            subject: item.subject || undefined,
                          })
                        }
                        footer={
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                              {providerLabel}{dateLabel ? ` • ${dateLabel}` : ""}
                            </span>
                            <span className="text-[10px] font-black text-[var(--text)] group-hover/card:text-[var(--accent)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover/card:opacity-100 group-hover:opacity-100 translate-x-2 group-hover/card:translate-x-0 group-hover:translate-x-0 shrink-0">
                              <span>{t("keepers_email_open_thread", "Open Thread")}</span>
                              <span className="text-base leading-none">&rarr;</span>
                            </span>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </div>
              );
            })() : (
              <EmptyState
                icon={t("icon_mark_email_read", "mark_email_read")}
                title={t("keepers_email_no_activity", "No Outbound Email Logs")}
                className="py-12"
              />
            )
          )}
        </div>
      </SidePanel>

      <EmailConversationSidePanel
        isOpen={Boolean(activeEmailThread)}
        onClose={() => setActiveEmailThread(null)}
        threadId={activeEmailThread?.threadId}
        dispatchId={activeEmailThread?.dispatchId}
        ticketId={activeEmailThread?.ticketId}
        initialSubject={activeEmailThread?.subject}
        templates={responseTemplates}
        fromName={normalizeLegacySenderName(supportSenderNameInput, defaultSenderDisplayName)}
        fromEmail={supportEmailInput.trim() || defaultSupportEmail}
        replyTo={supportReplyToInput.trim() || supportEmailInput.trim() || defaultSupportEmail}
        onThreadUpdated={loadEmailCenterData}
      />
    </ElevatedHubLayout>
  );
}
