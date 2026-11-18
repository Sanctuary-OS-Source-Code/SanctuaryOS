import { useEffect, useState } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { supabaseAuth } from "../../supabase";
import {
  ActionButton,
  CustomDropdown,
  EmptyState,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  SidePanelHeroCard,
  VAULT_CHIP_CLASS,
} from "../../shared";
import {
  UniversalGroup,
  UniversalInput,
  UniversalTextArea,
} from "../../components/universal/UniversalLayout";
import {
  getEmailDispatchStatusMeta,
  formatEmailProviderLabel,
  maskEmailsInText,
} from "../../utils/sanctuaryEmailTemplates";
import type { KeeperEmailResponseTemplate } from "../../utils/supporterManager";

interface ThreadMessage {
  id: string;
  thread_id?: string | null;
  ticket_id?: string | null;
  direction?: "outbound" | "inbound" | string;
  from_name?: string;
  from_email?: string;
  to_email?: string;
  subject?: string;
  body_text?: string;
  status?: string;
  provider?: string;
  created_at?: string;
}

interface EmailConversationSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  threadId?: string | null;
  dispatchId?: string | null;
  ticketId?: string | null;
  initialSubject?: string;
  templates?: KeeperEmailResponseTemplate[];
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  onThreadUpdated?: () => void;
}

/** Interactive two-way email conversation drawer for Keepers Support & Ticket Dossiers. */
export default function EmailConversationSidePanel({
  isOpen,
  onClose,
  threadId,
  dispatchId,
  ticketId,
  initialSubject,
  templates = [],
  fromName,
  fromEmail,
  replyTo,
  onThreadUpdated,
}: EmailConversationSidePanelProps) {
  const { t } = useLexicon();
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [resolvedThreadId, setResolvedThreadId] = useState<string>(threadId || "");
  const [resolvedTicketId, setResolvedTicketId] = useState<string>(ticketId || "");
  const [subject, setSubject] = useState<string>(initialSubject || "");
  const [externalEmail, setExternalEmail] = useState<string | null>(null);
  const [externalEmailMasked, setExternalEmailMasked] = useState<string>("");
  const [revealRecipient, setRevealRecipient] = useState(false);
  const [manualToEmail, setManualToEmail] = useState("");
  const [replyBody, setReplyBody] = useState("");

  const loadThread = async () => {
    if (!isOpen || (!threadId && !dispatchId && !ticketId)) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabaseAuth.functions.invoke("keeper-email-dispatch", {
        body: {
          action: "get_email_thread",
          thread_id: threadId || undefined,
          dispatch_id: dispatchId || undefined,
          ticket_id: ticketId || undefined,
        },
      });
      if (error || data?.ok === false) {
        throw new Error(error?.message || data?.error || "Failed to load email thread");
      }
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setResolvedThreadId(data?.thread_id || threadId || "");
      setResolvedTicketId(data?.ticket_id || ticketId || "");
      setExternalEmail(data?.external_email || null);
      setExternalEmailMasked(data?.external_email_masked || "");
      setSubject(data?.subject || initialSubject || "");
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setRevealRecipient(false);
      setManualToEmail("");
      setReplyBody("");
      loadThread();
    }
  }, [isOpen, threadId, dispatchId, ticketId]);

  const handleSendReply = async () => {
    const cleanBody = replyBody.trim();
    const targetRecipient = externalEmail || manualToEmail.trim();
    if (isSending || !cleanBody || !targetRecipient.includes("@")) return;
    setIsSending(true);
    try {
      const { data, error } = await supabaseAuth.functions.invoke("keeper-email-dispatch", {
        body: {
          action: "reply_email_thread",
          thread_id: resolvedThreadId || threadId || undefined,
          dispatch_id: dispatchId || undefined,
          ticket_id: resolvedTicketId || ticketId || undefined,
          subject: subject || initialSubject || undefined,
          to_email: externalEmail ? undefined : manualToEmail.trim(),
          body_text: cleanBody,
          from_name: fromName,
          from_email: fromEmail,
          reply_to: replyTo,
        },
      });
      if (error || data?.ok === false) {
        throw new Error(error?.message || data?.error || "Failed to dispatch email reply");
      }
      useStore
        .getState()
        .pushStatus(t("keepers_email_reply_sent", "Thread reply dispatched!"), "success");
      setReplyBody("");
      await loadThread();
      onThreadUpdated?.();
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsSending(false);
    }
  };

  const displayRecipient =
    revealRecipient && externalEmail
      ? externalEmail
      : externalEmailMasked || maskEmailsInText(externalEmail || "");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("keepers_email_thread_title", "Email Conversation Thread")}
      subtitle={
        <span className="no-text-case font-mono text-[11px]">
          {displayRecipient || t("keepers_email_thread_unknown_recipient", "Encrypted Recipient")}
        </span>
      }
      icon={t("icon_forum", "forum")}
      widthClass="w-[92vw] md:w-[760px]"
      headerActions={
        <PanelHeaderGroup>
          {externalEmail && (
            <PanelHeaderButton
              icon={
                revealRecipient
                  ? t("icon_visibility_off", "visibility_off")
                  : t("icon_visibility", "visibility")
              }
              tooltip={
                revealRecipient
                  ? t("keepers_email_mask_recipient", "Hide Recipient Email")
                  : t("keepers_email_reveal_recipient", "Reveal Recipient Email")
              }
              onClick={() => setRevealRecipient((prev) => !prev)}
            />
          )}
          <PanelHeaderButton
            icon={isLoading ? t("icon_sync", "sync") : t("icon_refresh", "refresh")}
            tooltip={t("refresh", "Refresh")}
            onClick={loadThread}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        <SidePanelHeroCard
          icon={t("icon_mark_email_read", "mark_email_read")}
          overline={
            resolvedTicketId
              ? `${t("support_ticket", "Ticket")} #${resolvedTicketId.slice(0, 8).toUpperCase()}`
              : t("keepers_foundry_label", "Sanctuary Foundry")
          }
          title={
            subject ||
            t("keepers_email_subject_placeholder", "Official Sanctuary OS Correspondence")
          }
          badge={`${messages.length} ${t("keepers_email_thread_msgs", "Messages")}`}
          badgeIcon={t("icon_forum", "forum")}
          variant="accent"
        />

        <UniversalGroup
          title={t("keepers_email_thread_history", "Conversation History")}
          icon={t("icon_history", "history")}
          count={messages.length}
        >
          {isLoading && messages.length === 0 ? (
            <EmptyState
              icon={t("icon_sync", "sync")}
              title={t("loading", "Loading...")}
              className="py-8"
            />
          ) : messages.length === 0 ? (
            <EmptyState
              icon={t("icon_inbox", "inbox")}
              title={t("keepers_email_thread_empty", "No messages recorded in this thread yet.")}
              className="py-8"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((msg) => {
                const isInbound = String(msg.direction || "outbound").toLowerCase() === "inbound";
                const statusMeta = getEmailDispatchStatusMeta(msg.status, t);
                const senderTitle = isInbound
                  ? revealRecipient && externalEmail
                    ? externalEmail
                    : externalEmailMasked || msg.from_email || t("keepers_email_dir_inbound", "External Reply")
                  : msg.from_name || t("keepers_email_dir_outbound", "Sanctuary OS");
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-2 glass-surface rounded-2xl p-3.5 border ${
                      isInbound
                        ? "border-[color-mix(in_srgb,var(--warning)_28%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--accent)_24%,transparent)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`material-symbols-outlined !text-[16px] shrink-0 ${
                            isInbound ? "text-[var(--warning)]" : "text-[var(--accent)]"
                          }`}
                        >
                          {isInbound
                            ? t("icon_move_to_inbox", "move_to_inbox")
                            : t("icon_outgoing_mail", "outgoing_mail")}
                        </span>
                        <span className="text-[11px] font-black text-[var(--text)] no-text-case truncate">
                          {senderTitle}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-80">
                          {isInbound
                            ? t("keepers_email_dir_inbound", "External Reply")
                            : t("keepers_email_dir_outbound", "Sanctuary OS")}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 ml-auto shrink-0">
                        <span className={VAULT_CHIP_CLASS}>
                          <span
                            className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColorClass}`}
                          >
                            {statusMeta.iconName}
                          </span>
                          <span>{statusMeta.label}</span>
                        </span>
                        {msg.created_at && (
                          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75">
                            {new Date(msg.created_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs font-medium text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words px-0.5">
                      {msg.body_text || t("keepers_email_empty_body", "(No message body)")}
                    </div>

                    {msg.provider && (
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-60">
                        {formatEmailProviderLabel(msg.provider)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </UniversalGroup>

        <UniversalGroup
          title={t("keepers_email_thread_reply", "Reply in Thread")}
          icon={t("icon_reply", "reply")}
        >
          {!externalEmail && (
            <UniversalInput
              label={t("keeper_email_recipient_label", "Recipient Email Address")}
              type="email"
              className="no-text-case"
              value={manualToEmail}
              onChange={setManualToEmail}
              placeholder={t("keeper_email_recipient_placeholder", "citizen@domain.com")}
            />
          )}

          {templates.length > 0 && (
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
                  const chosen = templates.find((tpl) => tpl.id === vals[0]);
                  if (chosen) {
                    setReplyBody(chosen.body);
                  }
                }}
                options={templates.map((tpl) => ({
                  id: tpl.id,
                  label: `${tpl.name} (${tpl.category || t("keepers_email_tpl_default_cat", "Support")})`,
                }))}
              />
            </div>
          )}

          <UniversalTextArea
            label={t("keepers_email_body_label", "Message Body")}
            value={replyBody}
            onChange={setReplyBody}
            placeholder={t(
              "keepers_email_thread_reply_ph",
              "Write your follow-up email reply to append and dispatch into this conversation..."
            )}
            className="min-h-[120px]"
          />

          <ActionButton
            onClick={handleSendReply}
            disabled={
              isSending ||
              !replyBody.trim() ||
              !(externalEmail || manualToEmail.trim().includes("@"))
            }
            variant="accent"
            className="w-full"
            icon={isSending ? t("icon_sync", "sync") : t("icon_send", "send")}
            label={
              isSending
                ? t("btn_submitting", "Submitting...")
                : t("keepers_email_btn_send_reply", "Send Email Reply")
            }
          />
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
