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

interface ThreadAttachmentItem {
  id?: string;
  filename: string;
  content_type: string;
  size?: number;
  is_inline?: boolean;
  download_url?: string | null;
  data_url?: string | null;
}

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
  attachments?: ThreadAttachmentItem[];
  status?: string;
  provider?: string;
  provider_message_id?: string | null;
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
  const [inboundSyncStatus, setInboundSyncStatus] = useState<string | null>(null);
  const [inboundSyncDetail, setInboundSyncDetail] = useState<string>("");
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    filename: string;
    contentType: string;
  } | null>(null);
  const [previewActualSize, setPreviewActualSize] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const loadThread = async (forceSync = false) => {
    if (!isOpen || (!threadId && !dispatchId && !ticketId)) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabaseAuth.functions.invoke("keeper-email-dispatch", {
        body: {
          action: "get_email_thread",
          thread_id: threadId || undefined,
          dispatch_id: dispatchId || undefined,
          ticket_id: ticketId || undefined,
          force_sync: forceSync,
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
      setInboundSyncStatus(data?.inbound_sync?.status || null);
      setInboundSyncDetail(data?.inbound_sync?.detail || "");
      if (forceSync && data?.inbound_sync?.synced_count > 0) {
        useStore
          .getState()
          .pushStatus(
            t("keepers_email_inbound_synced_count", "Synced new inbound email replies."),
            "success"
          );
        onThreadUpdated?.();
      }
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
      setInboundSyncStatus(null);
      setInboundSyncDetail("");
      loadThread(false);
    } else {
      setPreviewImage(null);
      setPreviewActualSize(false);
    }
  }, [isOpen, threadId, dispatchId, ticketId]);

  const resolveAttachmentDataUrl = async (
    msg: ThreadMessage,
    att: ThreadAttachmentItem
  ): Promise<string | null> => {
    if (att.data_url) return att.data_url;
    if (!msg.provider_message_id) {
      useStore
        .getState()
        .pushStatus(
          t("keepers_email_att_fetch_failed", "Unable to load email attachment."),
          "error"
        );
      return null;
    }
    try {
      const { data, error } = await supabaseAuth.functions.invoke("keeper-email-dispatch", {
        body: {
          action: "fetch_email_attachment",
          provider_message_id: msg.provider_message_id,
          attachment_id: att.id,
          filename: att.filename,
        },
      });
      if (error || !data?.ok || !data?.data_url) {
        throw new Error(error?.message || data?.error || "Attachment fetch failed");
      }
      const hydratedUrl = String(data.data_url);
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== msg.id
            ? m
            : {
                ...m,
                attachments: (m.attachments || []).map((item) =>
                  (att.id && item.id === att.id) || item.filename === att.filename
                    ? { ...item, data_url: hydratedUrl }
                    : item
                ),
              }
        )
      );
      return hydratedUrl;
    } catch {
      useStore
        .getState()
        .pushStatus(
          t("keepers_email_att_fetch_failed", "Unable to load email attachment."),
          "error"
        );
      return null;
    }
  };

  const triggerAttachmentDownload = (dataUrl: string, filename: string) => {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) return;
    const mime = match[1] || "application/octet-stream";
    const bin = atob(match[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    const objUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objUrl;
    link.download = filename || "attachment";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 2500);
  };

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
    <>
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
            onClick={() => loadThread(true)}
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

        {inboundSyncStatus === "send_only_api_key" && (
          <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] flex items-start gap-3">
            <span className="material-symbols-outlined !text-[18px] text-[var(--warning)] shrink-0 mt-0.5">
              {t("icon_warning", "warning")}
            </span>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-black text-[var(--warning)]">
                {t(
                  "keepers_email_send_only_key_title",
                  "Resend Key Needs Full Access + Receiving Enabled"
                )}
              </span>
              <span className="text-[11px] text-[var(--subtext)] leading-relaxed">
                {inboundSyncDetail ||
                  t(
                    "keepers_email_send_only_key_desc",
                    "The saved Resend API key only has Sending Access. Save a Full Access Resend API key in Settings and enable Domain Receiving (MX) on your domain to sync inbound email replies."
                  )}
              </span>
            </div>
          </div>
        )}

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

                    {(msg.body_text || !(msg.attachments && msg.attachments.length > 0)) && (
                      <div className="text-xs font-medium text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words px-0.5">
                        {msg.body_text || t("keepers_email_empty_body", "(No message body)")}
                      </div>
                    )}

                    {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                      <div className="flex flex-col gap-2 pt-1">
                        {msg.attachments.map((att, attIdx) => {
                          const attKey = att.id || `${msg.id}_att_${attIdx}`;
                          const src = att.data_url || att.download_url || "";
                          const isImage =
                            Boolean(src) &&
                            String(att.content_type || "").toLowerCase().startsWith("image/");
                          const isDownloading = downloadingKey === attKey;

                          const handleInspectImage = async () => {
                            const resolved =
                              att.data_url ||
                              (await resolveAttachmentDataUrl(msg, att)) ||
                              att.download_url;
                            if (!resolved) return;
                            setPreviewActualSize(false);
                            setPreviewImage({
                              src: resolved,
                              filename: att.filename,
                              contentType: att.content_type,
                            });
                          };

                          const handleDownloadAtt = async () => {
                            if (isDownloading) return;
                            setDownloadingKey(attKey);
                            try {
                              const dataUrl = await resolveAttachmentDataUrl(msg, att);
                              if (dataUrl) {
                                triggerAttachmentDownload(dataUrl, att.filename);
                              }
                            } finally {
                              setDownloadingKey(null);
                            }
                          };

                          if (isImage) {
                            return (
                              <div
                                key={attKey}
                                className="flex flex-col gap-1.5"
                              >
                                <img
                                  src={src}
                                  alt={att.filename}
                                  className="max-h-72 w-auto max-w-full rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] object-contain cursor-pointer bg-black/20"
                                  onClick={handleInspectImage}
                                />
                                <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--subtext)] px-0.5">
                                  <span className="truncate font-mono no-text-case">
                                    {att.filename}
                                  </span>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <button
                                      type="button"
                                      onClick={handleInspectImage}
                                      className="text-[var(--accent)] hover:underline font-bold shrink-0 cursor-pointer"
                                    >
                                      {t("btn_view", "View")}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isDownloading}
                                      onClick={handleDownloadAtt}
                                      className="text-[var(--accent)] hover:underline font-bold shrink-0 cursor-pointer disabled:opacity-50"
                                    >
                                      {isDownloading
                                        ? t("loading", "Loading...")
                                        : t("btn_download", "Download")}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <button
                              key={attKey}
                              type="button"
                              disabled={isDownloading || (!att.data_url && !att.download_url)}
                              onClick={handleDownloadAtt}
                              className={`${VAULT_CHIP_CLASS} w-fit cursor-pointer hover:sa-glass-pill-active transition-all disabled:opacity-50`}
                            >
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {isDownloading
                                  ? t("icon_sync", "sync")
                                  : t("icon_attach_file", "attach_file")}
                              </span>
                              <span className="no-text-case font-mono">
                                {isDownloading
                                  ? t("loading", "Loading...")
                                  : att.filename}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

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

    <SidePanel
      isOpen={Boolean(previewImage)}
      onClose={() => setPreviewImage(null)}
      backdropZ="z-[50100]"
      panelZ="z-[50101]"
      widthClass="w-[95vw] md:w-[920px]"
      title={previewImage?.filename || t("preview", "Preview")}
      subtitle={previewImage?.contentType || t("keepers_foundry_label", "Sanctuary Foundry")}
      icon={t("icon_image", "image")}
      headerActions={
        previewImage ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={
                previewActualSize
                  ? t("icon_fit_screen", "fit_screen")
                  : t("icon_zoom_in", "zoom_in")
              }
              tooltip={
                previewActualSize
                  ? t("keepers_email_img_fit", "Fit to Panel")
                  : t("keepers_email_img_actual", "Actual Size")
              }
              onClick={() => setPreviewActualSize((v) => !v)}
            />
            <PanelHeaderButton
              icon={t("icon_download", "download")}
              tooltip={t("btn_download", "Download")}
              onClick={() => {
                if (previewImage.src.startsWith("data:")) {
                  triggerAttachmentDownload(previewImage.src, previewImage.filename);
                } else {
                  useStore
                    .getState()
                    .pushStatus(
                      t("keepers_email_att_fetch_failed", "Unable to load email attachment."),
                      "error"
                    );
                }
              }}
            />
          </PanelHeaderGroup>
        ) : null
      }
    >
      {previewImage && (
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <div className="glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] p-3 overflow-auto max-h-[78vh] flex items-center justify-center bg-black/30">
            <img
              src={previewImage.src}
              alt={previewImage.filename}
              className={
                previewActualSize
                  ? "max-w-none h-auto rounded-xl"
                  : "max-w-full max-h-[75vh] w-auto h-auto object-contain rounded-xl mx-auto"
              }
            />
          </div>
        </div>
      )}
    </SidePanel>
    </>
  );
}
