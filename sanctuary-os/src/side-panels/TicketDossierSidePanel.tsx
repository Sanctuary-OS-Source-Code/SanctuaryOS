import { useStore } from "../store";
import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase, supabaseAuth } from "../supabase";
import {
  SidePanel,
  SidePanelHeroCard,
  SidePanelTitleInput,
  UniversalGroup,
  StatBox,
  ActionButton,
  CustomDropdown,
  renderTextWithIcons,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
} from "../shared";
import { UniversalInput, UniversalTextArea, SidePanelPillToggle } from "../components/universal/UniversalLayout";
import { dispatchKeeperCustomEmail, getKeepersPipelineConfig } from "../utils/supporterManager";
import TicketLogViewer from "./TicketLogViewer";

interface TicketDossierProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: any | null;
  tableName?: string;
  onTakeAction?: (
    actionType: "RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING",
    reason: string
  ) => void;
  onReplyAdded?: (newMetadata?: any) => void;
  onEditMetadata?: (hash: string) => void;
  isReadOnly?: boolean;
  canReply?: boolean;
  availableActions?: ("RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING")[];
  onClaim?: () => void;
  onRelease?: () => void;
  currentUserId?: string;
}

export default function TicketDossierSidePanel({
  isOpen,
  onClose,
  ticket,
  tableName = "sanctuary_tickets",
  onTakeAction,
  isReadOnly = false,
  canReply = false,
  availableActions = ["RESOLVED", "REJECTED", "ESCALATED", "PENDING"],
  onReplyAdded,
  onEditMetadata,
  onClaim,
  onRelease,
  currentUserId,
}: TicketDossierProps) {
  const { t } = useLexicon();
  const [reason, setReason] = useState("");
  const [replyText, setReplyText] = useState("");
  const [authorName, setAuthorName] = useState("LOADING...");
  const [replies, setReplies] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchedTargetModName, setFetchedTargetModName] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [sendEmailCopy, setSendEmailCopy] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [senderIdentityLabel, setSenderIdentityLabel] = useState("Sanctuary OS Keepers Core <support@sanctuaryos.gg>");

  useEffect(() => {
    const isKeepersTicket = (ticket?.table_name || tableName) === "keeper_tickets";
    if (!isKeepersTicket || !ticket) {
      setSendEmailCopy(false);
      setEmailRecipient("");
      return;
    }

    getKeepersPipelineConfig().then((cfg) => {
      setSenderIdentityLabel(
        `${cfg.support_sender_name || "Sanctuary OS Keepers Core"} <${cfg.support_contact_email || "support@sanctuaryos.gg"}>`
      );
    });

    const rawContact =
      ticket.metadata?.contact_meta?.reply_contact ||
      ticket.metadata?.partner_application?.lead_contact ||
      "";
    const emailMatch = String(rawContact).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) {
      setEmailRecipient(emailMatch[0]);
      setSendEmailCopy(true);
    } else {
      setEmailRecipient("");
      setSendEmailCopy(false);
    }
  }, [ticket, tableName]);

  useEffect(() => {
    const targetModId = ticket?.target_mod_id || ticket?.metadata?.target_mod_id;
    if (!ticket || !targetModId) return;
    if (ticket.target_mod_name) return;

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetModId
      );

    const fetchName = async () => {
      try {
        if (isUUID) {
          const { data } = await supabase
            .from("mods")
            .select("name")
            .eq("id", targetModId)
            .single();
          if (data) setFetchedTargetModName(data.name);
        } else {
          const { data: verData } = await supabase
            .from("mod_versions")
            .select("mod_id")
            .eq("dna_hash", targetModId)
            .maybeSingle();
          if (verData?.mod_id) {
            const { data: modData } = await supabase
              .from("mods")
              .select("name")
              .eq("id", verData.mod_id)
              .single();
            if (modData) setFetchedTargetModName(modData.name);
          }
        }
      } catch (err) {
        console.error("Failed to fetch target mod name", err);
      }
    };
    fetchName();
  }, [ticket]);

  useEffect(() => {
    if (ticket?.author_id) {
      supabase
        .from("profiles")
        .select("username")
        .eq("id", ticket.author_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setAuthorName(
              data.username ||
                ticket.author_id?.substring(0, 8).toUpperCase() ||
                "SYSTEM"
            );
          } else {
            supabase
              .from("masons")
              .select("name")
              .eq("id", ticket.author_id)
              .single()
              .then(({ data: mData }) => {
                if (mData) setAuthorName(mData.name);
                else
                  setAuthorName(
                    ticket.author_id?.substring(0, 8).toUpperCase() || "SYSTEM"
                  );
              });
          }
        });
    } else if (ticket) {
      const fallbackAuthor =
        ticket.metadata?.partner_application?.lead_contact ||
        ticket.metadata?.contact_meta?.reply_contact ||
        ticket.metadata?.feedback_meta?.author_label ||
        "VISITOR";
      setAuthorName(fallbackAuthor);
    }

    if (ticket?.metadata?.replies) {
      setReplies(ticket.metadata.replies);
    } else {
      setReplies([]);
    }
  }, [ticket]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !ticket) return;
    setIsSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    let replyAuthor = "Support Team";
    if (user) {
      replyAuthor =
        user.user_metadata?.mason_name ||
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        "Support Team";
    }

    const newReply = {
      id: crypto.randomUUID(),
      author: replyAuthor,
      text: replyText,
      time: new Date().toISOString(),
    };

    const newMetadata = {
      ...(ticket.metadata || {}),
      replies: [...replies, newReply],
    };

    const targetTable = ticket.table_name || tableName || "sanctuary_tickets";
    const dbClient = targetTable === "keeper_tickets" ? supabaseAuth : supabase;
    const { error } = await dbClient
      .from(targetTable)
      .update({ metadata: newMetadata })
      .eq("id", ticket.id);

    setIsSubmitting(false);
    if (!error) {
      let updatedMeta = newMetadata;

      if (
        targetTable === "keeper_tickets" &&
        sendEmailCopy &&
        emailRecipient.trim().includes("@")
      ) {
        const emailResult = await dispatchKeeperCustomEmail({
          to_email: emailRecipient.trim(),
          subject: `Re: ${ticket.title || "Sanctuary OS Support Inquiry"}`,
          body_text: replyText.trim(),
          ticket_id: ticket.id,
        });

        const dispatchBadge = {
          id: emailResult.dispatch_id || crypto.randomUUID(),
          to_email: emailRecipient.trim(),
          from_identity: senderIdentityLabel,
          status: emailResult.status,
          sent_at: new Date().toISOString(),
        };

        updatedMeta = {
          ...newMetadata,
          email_dispatches: [
            ...(Array.isArray(newMetadata.email_dispatches)
              ? newMetadata.email_dispatches
              : []),
            dispatchBadge,
          ],
        };
      }

      setReplies(updatedMeta.replies);
      setReplyText("");
      if (onReplyAdded) onReplyAdded(updatedMeta);
      useStore.getState().pushStatus(
        targetTable === "keeper_tickets" && sendEmailCopy && emailRecipient.trim().includes("@")
          ? t("keeper_email_reply_dispatched", "Reply saved & custom email dispatched from Keepers Core")
          : t("support_success", "Reply sent"),
        "success"
      );

      if (ticket.author_id && user && ticket.author_id !== user.id) {
        await supabase.from("notifications").insert({
          user_id: ticket.author_id,
          title: "New Ticket Reply",
          message: `${replyAuthor} replied to your ticket: ${ticket.title}`,
          type: "support_reply",
          reference_id: ticket.id,
        });
      }
    } else {
      useStore
        .getState()
        .pushStatus(t("auto_failed_to_send_25", "Failed to send reply"), "error");
    }
  };

  if (!isOpen || !ticket) return null;

  const statusLower = ticket.status?.toLowerCase() || "new";
  const isNew = statusLower === "open" || statusLower === "new";
  const isClosed =
    statusLower === "resolved" ||
    statusLower === "closed" ||
    statusLower === "rejected";
  const isPending = statusLower === "investigating" || statusLower === "pending";

  const heroVariant = isNew
    ? "danger"
    : isClosed
      ? "success"
      : isPending
        ? "warning"
        : "accent";

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("dossier_subtitle", "Ticket Dossier")}
      subtitle={`${t("oversight_report_id", "ID")}: ${ticket.id.substring(0, 8)}`}
      icon={t("icon_support_agent", "support_agent")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        <PanelHeaderGroup>
          {onClaim && !ticket.metadata?.claimed_by && (
            <PanelHeaderButton
              icon={t("icon_back_hand", "back_hand")}
              tooltip={t("ticket_claim", "Claim Ticket")}
              variant="accent"
              onClick={onClaim}
            />
          )}
          {onRelease && ticket.metadata?.claimed_by === currentUserId && (
            <PanelHeaderButton
              icon={t("icon_waving_hand", "waving_hand")}
              tooltip={t("ticket_release", "Release Ticket")}
              variant="danger"
              onClick={onRelease}
            />
          )}
          {!isReadOnly &&
            onTakeAction &&
            !["resolved", "rejected"].includes(statusLower) && (
              <PanelHeaderButton
                icon={t("icon_save", "save")}
                tooltip={t("dossier_btn_save", "Save Action")}
                variant="success"
                onClick={() => onTakeAction(selectedAction as any, reason)}
                disabled={!selectedAction || !reason.trim() || isSubmitting}
              />
            )}
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_receipt_long", "receipt_long")}
          overline={`${t("oversight_report_id", "ID")}: ${ticket.id.substring(0, 8)}`}
          title={ticket.title || t("dossier_subtitle", "Ticket Dossier")}
          description={t(
            "dossier_ticket_details",
            "Ticket details, diagnostic telemetry, and agent correspondence."
          )}
          badge={isNew ? t("badge_new", "NEW") : ticket.status}
          badgeIcon={t("icon_info", "info")}
          variant={heroVariant}
        >
          <div className="grid grid-cols-2 gap-3 pt-1">
            <StatBox
              label={t("author", "Author")
                .replace(/^[^\w]*/, "")
                .trim()}
              value={ticket.author_username || authorName}
              icon={t("icon_person", "person")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("status", "Status")
                .replace(/^[^\w]*/, "")
                .trim()}
              value={isNew ? t("badge_new", "NEW") : ticket.status}
              icon={t("icon_info", "info")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("category", "Category")
                .replace(/^[^\w]*/, "")
                .trim()}
              value={(ticket.category || ticket.ticket_type || "general").replace(
                "_",
                " "
              )}
              icon={t("icon_label", "label")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("dossier_created_at", "Created At")
                .replace(/^[^\w]*/, "")
                .trim()}
              value={new Date(ticket.created_at).toLocaleDateString()}
              icon={t("icon_calendar_today", "calendar_today")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>
        </SidePanelHeroCard>

        <SidePanelTitleInput
          value={ticket.title || ""}
          readOnly
          label={t("dossier_subtitle", "Ticket Subject")}
          subtitle={`${t("oversight_report_id", "ID")}: ${ticket.id.substring(0, 8)}`}
        />

        {ticket.metadata?.restricted_violations &&
          ticket.metadata.restricted_violations.length > 0 && (
            <SidePanelHeroCard
              icon={t("icon_warning", "warning")}
              overline={t("dossier_restricted_detected", "Restricted {mods} detected in {blueprint}")}
              title={t("dossier_restricted_detected", "Restricted {mods} detected in {blueprint}")}
              variant="danger"
            >
              <div className="flex flex-wrap gap-2">
                {ticket.metadata.restricted_violations.map(
                  (v: string, i: number) => (
                    <span
                      key={i}
                      className={`${VAULT_CHIP_CLASS} font-mono`}
                    >
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                        {t("icon_extension", "extension")}
                      </span>
                      <span>{v.replace(/[-_]/g, " ")}</span>
                    </span>
                  )
                )}
              </div>
            </SidePanelHeroCard>
          )}

        {(ticket.metadata?.claimed_by ||
          ticket.target_mod_id ||
          ticket.metadata?.target_mod_id) && (
          <UniversalGroup
            title={t("dossier_ticket_details", "Assignment & Target")}
            icon={t("icon_extension", "extension")}
          >
            {ticket.metadata?.claimed_by && (
              <div className="glass-surface px-4 py-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                    <span className="material-symbols-rounded !text-[18px]">
                      {t("icon_back_hand", "back_hand")}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-[var(--subtext)]">
                    {t("ticket_claimed_by", "Claimed By")}
                  </span>
                </div>
                <span className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                    {t("icon_person", "person")}
                  </span>
                  <span>
                    {ticket.metadata.claimed_by === currentUserId
                      ? t("you", "You")
                      : t("another_agent", "Another Agent")}
                  </span>
                </span>
              </div>
            )}

            {(ticket.target_mod_id || ticket.metadata?.target_mod_id) && (
              <div className="glass-surface px-4 py-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                    <span className="material-symbols-rounded !text-[18px]">
                      {t("icon_extension", "extension")}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest">
                      {t("target_artifact", "Target {Mod}")}
                    </span>
                    <span className="text-xs font-mono font-bold text-[var(--text)] truncate">
                      {ticket.target_mod_name ||
                        fetchedTargetModName ||
                        ticket.target_mod_id ||
                        ticket.metadata?.target_mod_id}
                    </span>
                  </div>
                </div>
                {onEditMetadata && (
                  <ActionButton
                    variant="glass"
                    icon={t("icon_edit", "edit")}
                    label={t("btn_edit", "Edit")}
                    onClick={() =>
                      onEditMetadata(
                        ticket.target_mod_id || ticket.metadata?.target_mod_id
                      )
                    }
                  />
                )}
              </div>
            )}
          </UniversalGroup>
        )}

        <UniversalGroup
          title={t("upload_desc", "Description")}
          icon={t("icon_description", "description")}
        >
          <div className="w-full glass-surface rounded-xl px-4 py-3.5 text-[var(--text)] text-sm border border-[color-mix(in_srgb,var(--text)_12%,transparent)] min-h-28 whitespace-pre-wrap leading-relaxed">
            {ticket.description}
          </div>
        </UniversalGroup>

        {ticket.metadata?.feedback_meta && (
          <UniversalGroup
            title={t("landing_feedback_section_title", "Platform Feedback & Core Support")}
            icon={t("icon_rate_review", "rate_review")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <StatBox
                label={t("landing_feedback_form_platform", "Target Platform")}
                value={ticket.metadata.feedback_meta.platform || "Core OS"}
                icon={t("icon_devices", "devices")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("landing_feedback_form_stream", "Feedback / Support Stream")}
                value={ticket.metadata.feedback_meta.stream || ticket.ticket_type || "Feedback"}
                icon={t("icon_alt_route", "alt_route")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("landing_feedback_form_sentiment", "Sentiment")}
                value={ticket.metadata.feedback_meta.sentiment || "Constructive"}
                icon={t("icon_mood", "mood")}
                iconColorClass="text-[var(--accent)]"
              />
            </div>
          </UniversalGroup>
        )}

        {ticket.metadata?.contact_meta && (
          <UniversalGroup
            title={t("landing_contact_card_title", "Direct Human Contact")}
            icon={t("icon_support_agent", "support_agent")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <StatBox
                label={t("landing_contact_form_channel", "Inquiry Channel")}
                value={ticket.metadata.contact_meta.channel || ticket.ticket_type || "General"}
                icon={t("icon_mail", "mail")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("landing_contact_form_reply_to", "Reply Contact")}
                value={ticket.metadata.contact_meta.reply_contact || "Account Profile"}
                icon={t("icon_alternate_email", "alternate_email")}
                iconColorClass="text-[var(--accent)]"
              />
            </div>
          </UniversalGroup>
        )}

        {ticket.metadata?.partner_application && (
          <UniversalGroup
            title={t("landing_partner_drawer_title", "Partner Game Spoke Application")}
            icon={t("icon_handshake", "handshake")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <StatBox
                label={t("landing_partner_game_title", "Target Game Title & Engine")}
                value={ticket.metadata.partner_application.game_title || "N/A"}
                icon={t("icon_sports_esports", "sports_esports")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("landing_partner_extensions", "Primary {Mod} File Formats")}
                value={ticket.metadata.partner_application.primary_extensions || "N/A"}
                icon={t("icon_extension", "extension")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("landing_partner_lead_contact", "Lead Wayfinder Contact")}
                value={ticket.metadata.partner_application.lead_contact || "N/A"}
                icon={t("icon_person", "person")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("landing_partner_team_size", "Moderation Team Size")}
                value={ticket.metadata.partner_application.team_size || "N/A"}
                icon={t("icon_groups", "groups")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("landing_partner_community_url", "Community / GitHub URL")}
                value={ticket.metadata.partner_application.community_url || "N/A"}
                icon={t("icon_link", "link")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("landing_partner_infra_ready", "Supabase Infrastructure")}
                value={ticket.metadata.partner_application.infra_readiness || "N/A"}
                icon={t("icon_dns", "dns")}
                iconColorClass="text-[var(--accent)]"
              />
            </div>
          </UniversalGroup>
        )}

        {ticket.metadata?.logs &&
          ticket.metadata.logs !== "null" &&
          ticket.metadata.logs.trim() !== "" && (
            <UniversalGroup
              title={t("dossier_attached_logs", "Attached Logs")}
              icon={t("icon_terminal", "terminal")}
            >
              <TicketLogViewer logs={ticket.metadata.logs} />
            </UniversalGroup>
          )}

        {replies.length > 0 && (
          <UniversalGroup
            title={t("tab_posts", "{Dispatches}")}
            icon={t("icon_forum", "forum")}
          >
            <div className="flex flex-col gap-3">
              {replies.map((r, idx) => (
                <div
                  key={idx}
                  className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col"
                >
                  <div className="px-4 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        <span className="text-xs font-black">
                          {(r.author || "U").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-xs font-black text-[var(--text)] truncate">
                        {r.author}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 shrink-0">
                      {r.time
                        ? new Date(r.time).toLocaleString()
                        : t("date_unknown", "Unknown Date")}
                    </span>
                  </div>

                  <div className="p-4">
                    <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs font-medium text-[var(--text)] leading-relaxed break-words whitespace-pre-wrap">
                      {renderTextWithIcons(r.text)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </UniversalGroup>
        )}

        {Array.isArray(ticket.metadata?.email_dispatches) &&
          ticket.metadata.email_dispatches.length > 0 && (
            <UniversalGroup
              title={t("keeper_email_dispatches_title", "Outbound Custom Email Dispatches")}
              icon={t("icon_outgoing_mail", "outgoing_mail")}
            >
              <div className="flex flex-col gap-2">
                {ticket.metadata.email_dispatches.map((ed: any, idx: number) => (
                  <div
                    key={ed.id || idx}
                    className="glass-surface px-4 py-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="material-symbols-rounded !text-[16px] text-[var(--accent)] shrink-0">
                        {t("icon_mark_email_read", "mark_email_read")}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-[var(--text)] truncate">
                          {ed.to_email}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                          {ed.from_identity || senderIdentityLabel}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-rounded !text-[12px] text-[var(--success)]">
                          {t("icon_verified", "verified")}
                        </span>
                        <span>{ed.status || "DISPATCHED"}</span>
                      </span>
                      {ed.sent_at && (
                        <span className="text-[10px] font-mono text-[var(--subtext)]">
                          {new Date(ed.sent_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </UniversalGroup>
          )}

        {canReply &&
          !isReadOnly &&
          !["resolved", "rejected"].includes(statusLower) && (
            <UniversalGroup
              title={t("dossier_add_reply", "Add Reply")}
              icon={t("icon_reply", "reply")}
            >
              <UniversalTextArea
                value={replyText}
                onChange={setReplyText}
                placeholder={t(
                  "dossier_reply_placeholder",
                  "Write your response..."
                )}
              />

              {(ticket.table_name || tableName) === "keeper_tickets" && (
                <div className="flex flex-col gap-2.5 pt-1">
                  <SidePanelPillToggle
                    label={t(
                      "keeper_email_toggle_label",
                      "Also Dispatch Custom Email From Keepers Core"
                    )}
                    description={senderIdentityLabel}
                    icon={t("icon_outgoing_mail", "outgoing_mail")}
                    checked={sendEmailCopy}
                    onChange={setSendEmailCopy}
                  />
                  {sendEmailCopy && (
                    <UniversalInput
                      label={t("keeper_email_recipient_label", "Recipient Email Address")}
                      value={emailRecipient}
                      onChange={setEmailRecipient}
                      placeholder={t(
                        "keeper_email_recipient_placeholder",
                        "citizen@domain.com"
                      )}
                    />
                  )}
                </div>
              )}

              <ActionButton
                onClick={handleSendReply}
                disabled={
                  !replyText.trim() ||
                  isSubmitting ||
                  ((ticket.table_name || tableName) === "keeper_tickets" &&
                    sendEmailCopy &&
                    !emailRecipient.trim().includes("@"))
                }
                className="w-full"
                icon={t("icon_send", "send")}
                variant="glass"
                label={
                  isSubmitting
                    ? t("btn_submitting", "Submitting...")
                    : (ticket.table_name || tableName) === "keeper_tickets" &&
                        sendEmailCopy
                      ? t(
                          "keeper_email_btn_send_reply_and_email",
                          "Send Reply & Dispatch Custom Email"
                        )
                      : t("dossier_btn_send_transmission", "Send {Dispatch}")
                }
              />
            </UniversalGroup>
          )}

        {!isReadOnly &&
          onTakeAction &&
          !["resolved", "rejected"].includes(statusLower) && (
            <UniversalGroup
              title={t("admin_actions", "Admin Actions")}
              icon={t("icon_admin_panel_settings", "admin_panel_settings")}
              headerColorClass="text-[var(--danger)]"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                <UniversalInput
                  label={`${t("dossier_action_reason", "Action Reason")} *`}
                  value={reason}
                  onChange={setReason}
                  placeholder={t(
                    "dossier_reason_placeholder",
                    "Provide reason..."
                  )}
                />

                <div className="flex flex-col gap-1.5 relative z-[70]">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("action", "Action")} *
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={selectedAction}
                    options={availableActions.map((action) => ({
                      id: action,
                      label:
                        t(
                          `ticket_dossier_action_${action.toLowerCase()}`,
                          action
                        ) || action,
                    }))}
                    onChange={(v: string[]) => setSelectedAction(v[0])}
                    placeholder={t("dossier_select_action", "Select Action")}
                  />
                </div>
              </div>
            </UniversalGroup>
          )}
      </div>
    </SidePanel>
  );
}
