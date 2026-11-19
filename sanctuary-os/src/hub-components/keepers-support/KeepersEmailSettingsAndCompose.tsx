import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import {
  getBrandConfig,
  isStandaloneFork,
  SANCTUARY_CONFIG,
  supabaseAuth,
} from "../../supabase";
import {
  ActionButton,
  CustomDropdown,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  SidePanelHeroCard,
  VAULT_CHIP_CLASS,
} from "../../shared";
import { UniversalCard } from "../../components/universal/UniversalCard";
import { HubListGrid } from "../../components/layouts/ElevatedHubLayout";
import { CommandScreenSectionHeading } from "../SharedCommandScreenLayout";
import {
  UniversalGroup,
  UniversalInput,
  UniversalTextArea,
} from "../../components/universal/UniversalLayout";
import {
  DEFAULT_KEEPER_EMAIL_RESPONSE_TEMPLATES,
  dispatchKeeperCustomEmail,
  getKeepersPipelineConfig,
  KeeperEmailResponseTemplate,
  normalizeLegacySenderName,
  normalizeLegacySupportEmail,
  resolveKeeperEmailResponseTemplates,
  saveKeepersPipelineConfig,
} from "../../utils/supporterManager";
import EmailTemplatePreviewAndAuthSection from "../keepers-email/EmailTemplatePreviewAndAuthSection";
import EmailResponseTemplatesSection from "../keepers-email/EmailResponseTemplatesSection";

const DMARC_RECORD_VALUE = "v=DMARC1; p=none; rua=mailto:support@sanctuaryos.net;";

export type ReceivingApiStatus =
  | "ready"
  | "empty"
  | "send_only_api_key"
  | "error"
  | "not_configured";

export interface EmailThreadSummary {
  threadId: string;
  latest: any;
  count: number;
  hasInbound: boolean;
  latestIsInbound: boolean;
  resolvedTicketId: string | null;
}

export interface ActiveEmailThreadRef {
  threadId?: string | null;
  dispatchId?: string | null;
  ticketId?: string | null;
  subject?: string;
}

export function useKeepersEmailRelay() {
  const { t } = useLexicon();
  const currentUserEmail = useStore((state) => state.session?.user?.email || "");

  const brandConfig = getBrandConfig();
  const defaultSenderDisplayName = isStandaloneFork
    ? `${brandConfig.orgName || brandConfig.appTitle || "Community"} Support`
    : brandConfig.appTitle || "Sanctuary OS";
  const defaultSupportEmail = normalizeLegacySupportEmail(
    brandConfig.supportEmail || "support@sanctuaryos.net"
  );

  const [supportSenderNameInput, setSupportSenderNameInput] = useState(
    defaultSenderDisplayName
  );
  const [supportEmailInput, setSupportEmailInput] = useState(defaultSupportEmail);
  const [supportReplyToInput, setSupportReplyToInput] = useState(defaultSupportEmail);
  const [supportEmailProvider, setSupportEmailProvider] = useState<"resend" | "webhook">(
    "resend"
  );
  const [supportEmailApiKey, setSupportEmailApiKey] = useState("");
  const [hasSavedEmailSecret, setHasSavedEmailSecret] = useState(false);
  const [hasSavedWebhookRelay, setHasSavedWebhookRelay] = useState(false);
  const [hasSavedInboundSecret, setHasSavedInboundSecret] = useState(false);
  const [inboundWebhookSecretInput, setInboundWebhookSecretInput] = useState("");
  const [supportEmailWebhookUrl, setSupportEmailWebhookUrl] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const [receivingApiStatus, setReceivingApiStatus] =
    useState<ReceivingApiStatus>("not_configured");
  const [receivingSampleCount, setReceivingSampleCount] = useState(0);
  const [receivingDetail, setReceivingDetail] = useState("");
  const [isSyncingReplies, setIsSyncingReplies] = useState(false);

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [emailComposeTo, setEmailComposeTo] = useState("");
  const [emailComposeSubject, setEmailComposeSubject] = useState("");
  const [emailComposeBody, setEmailComposeBody] = useState("");
  const [isDispatchingEmail, setIsDispatchingEmail] = useState(false);
  const [showComposePreview, setShowComposePreview] = useState(false);
  const [revealComposeRecipient, setRevealComposeRecipient] = useState(true);

  const [recentDispatches, setRecentDispatches] = useState<any[]>([]);
  const [isClearingDispatches, setIsClearingDispatches] = useState(false);
  const [activeEmailThread, setActiveEmailThread] =
    useState<ActiveEmailThreadRef | null>(null);

  const [responseTemplates, setResponseTemplates] = useState<
    KeeperEmailResponseTemplate[]
  >(() => DEFAULT_KEEPER_EMAIL_RESPONSE_TEMPLATES.map((tpl) => ({ ...tpl })));
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);

  const loadEmailCenterData = useCallback(async () => {
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
          cfg.support_email_provider.toLowerCase() === "webhook" ? "webhook" : "resend"
        );
      }
      if (cfg?.support_email_webhook_url) {
        setSupportEmailWebhookUrl(cfg.support_email_webhook_url);
      }
      setResponseTemplates(resolveKeeperEmailResponseTemplates(cfg));
    } catch {
      // ignore config load error
    }

    try {
      const [{ data: logs }, { data: statusData }] = await Promise.all([
        supabaseAuth
          .from("keeper_email_dispatches")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(80),
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
        if (statusData.receiving_api_status) {
          setReceivingApiStatus(statusData.receiving_api_status as ReceivingApiStatus);
        }
        setReceivingSampleCount(Number(statusData.receiving_sample_count || 0));
        setReceivingDetail(String(statusData.receiving_detail || ""));
      }
    } catch {
      // ignore status check error
    }
  }, [defaultSenderDisplayName]);

  const syncInboundReplies = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (isSyncingReplies) return null;
      setIsSyncingReplies(true);
      try {
        const { data, error } = await supabaseAuth.functions.invoke(
          "keeper-email-dispatch",
          { body: { action: "sync_inbound_emails" } }
        );
        const summary = data?.inbound_sync || null;
        if (error || data?.ok === false) {
          if (!opts?.silent) {
            useStore
              .getState()
              .pushStatus(
                error?.message ||
                  data?.error ||
                  t("keepers_email_sync_failed", "Failed to check inbound email replies."),
                "error"
              );
          }
          return null;
        }

        if (summary?.status === "send_only_api_key") {
          setReceivingApiStatus("send_only_api_key");
          setReceivingDetail(String(summary.detail || ""));
          if (!opts?.silent) {
            useStore
              .getState()
              .pushStatus(
                t(
                  "keepers_email_send_only_toast",
                  "Saved Resend API key only has Sending Access. Use a Full Access key to sync replies."
                ),
                "error"
              );
          }
        } else if (summary?.status === "error") {
          setReceivingApiStatus("error");
          setReceivingDetail(String(summary.detail || ""));
          if (!opts?.silent) {
            useStore
              .getState()
              .pushStatus(
                summary.detail ||
                  t("keepers_email_sync_failed", "Failed to check inbound email replies."),
                "error"
              );
          }
        } else if (!opts?.silent) {
          const count = Number(summary?.synced_count || 0);
          useStore.getState().pushStatus(
            count > 0
              ? `${count} ${t("keepers_email_synced_count", "new inbound email replies synced.")}`
              : t("keepers_email_sync_up_to_date", "Inbound mailbox checked — no new replies."),
            count > 0 ? "success" : "info"
          );
        }

        await loadEmailCenterData();
        return summary;
      } finally {
        setIsSyncingReplies(false);
      }
    },
    [isSyncingReplies, loadEmailCenterData, t]
  );

  useEffect(() => {
    loadEmailCenterData();
    syncInboundReplies({ silent: true });
    // Run once on mount to load status and sync recent inbound replies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emailThreads = useMemo<EmailThreadSummary[]>(() => {
    const threadMap = new Map<string, EmailThreadSummary>();
    for (const row of recentDispatches) {
      const threadKey = String(row.thread_id || row.ticket_id || row.id);
      const isInbound = String(row.direction || "outbound").toLowerCase() === "inbound";
      const existing = threadMap.get(threadKey);
      if (!existing) {
        threadMap.set(threadKey, {
          threadId: threadKey,
          latest: row,
          count: 1,
          hasInbound: isInbound,
          latestIsInbound: isInbound,
          resolvedTicketId: row.ticket_id || null,
        });
      } else {
        existing.count += 1;
        if (isInbound) existing.hasInbound = true;
        if (!existing.resolvedTicketId && row.ticket_id) {
          existing.resolvedTicketId = row.ticket_id;
        }
      }
    }
    return Array.from(threadMap.values());
  }, [recentDispatches]);

  const handleSaveSupportEmail = useCallback(async () => {
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

      if (
        trimmedApiKey ||
        trimmedInboundSecret ||
        (supportEmailProvider === "webhook" && trimmedWebhook)
      ) {
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
        const { data: secretRes, error: secretErr } =
          await supabaseAuth.functions.invoke("keeper-email-dispatch", {
            body: secretPayload,
          });
        if (secretErr || secretRes?.ok === false) {
          throw new Error(
            secretErr?.message || secretRes?.error || "Failed to save email secret"
          );
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
      await loadEmailCenterData();
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
  }, [
    defaultSenderDisplayName,
    defaultSupportEmail,
    inboundWebhookSecretInput,
    isSavingEmail,
    loadEmailCenterData,
    supportEmailApiKey,
    supportEmailInput,
    supportEmailProvider,
    supportEmailWebhookUrl,
    supportReplyToInput,
    supportSenderNameInput,
    t,
  ]);

  const handleDispatchCustomEmail = useCallback(async () => {
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
        from_name: normalizeLegacySenderName(
          supportSenderNameInput,
          defaultSenderDisplayName
        ),
        from_email: supportEmailInput.trim() || defaultSupportEmail,
        reply_to:
          supportReplyToInput.trim() ||
          supportEmailInput.trim() ||
          defaultSupportEmail,
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
        setIsComposeOpen(false);
        loadEmailCenterData();
      } else {
        useStore
          .getState()
          .pushStatus(
            res.error ||
              t("keeper_email_compose_failed", "Failed to dispatch custom email."),
            "error"
          );
      }
    } finally {
      setIsDispatchingEmail(false);
    }
  }, [
    defaultSenderDisplayName,
    defaultSupportEmail,
    emailComposeBody,
    emailComposeSubject,
    emailComposeTo,
    isDispatchingEmail,
    loadEmailCenterData,
    supportEmailInput,
    supportReplyToInput,
    supportSenderNameInput,
    t,
  ]);

  const handleSaveResponseTemplates = useCallback(
    async (nextTemplates: KeeperEmailResponseTemplate[]) => {
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
    },
    [isSavingTemplates, t]
  );

  const handleClearEmailDispatches = useCallback(async () => {
    if (isClearingDispatches) return;
    setIsClearingDispatches(true);
    try {
      const { data: clearRes, error: clearErr } =
        await supabaseAuth.functions.invoke("keeper-email-dispatch", {
          body: { action: "clear_email_dispatches" },
        });
      if (clearErr || clearRes?.ok === false) {
        throw new Error(
          clearErr?.message || clearRes?.error || "Failed to clear email logs"
        );
      }
      setRecentDispatches([]);
      useStore
        .getState()
        .pushStatus(
          t("keepers_email_logs_cleared", "Cleared outbound email history."),
          "success"
        );
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setIsClearingDispatches(false);
    }
  }, [isClearingDispatches, t]);

  return {
    currentUserEmail,
    defaultSenderDisplayName,
    defaultSupportEmail,
    supportSenderNameInput,
    setSupportSenderNameInput,
    supportEmailInput,
    setSupportEmailInput,
    supportReplyToInput,
    setSupportReplyToInput,
    supportEmailProvider,
    setSupportEmailProvider,
    supportEmailApiKey,
    setSupportEmailApiKey,
    hasSavedEmailSecret,
    hasSavedWebhookRelay,
    hasSavedInboundSecret,
    inboundWebhookSecretInput,
    setInboundWebhookSecretInput,
    supportEmailWebhookUrl,
    setSupportEmailWebhookUrl,
    isSavingEmail,
    receivingApiStatus,
    receivingSampleCount,
    receivingDetail,
    isSyncingReplies,
    isComposeOpen,
    setIsComposeOpen,
    emailComposeTo,
    setEmailComposeTo,
    emailComposeSubject,
    setEmailComposeSubject,
    emailComposeBody,
    setEmailComposeBody,
    isDispatchingEmail,
    showComposePreview,
    setShowComposePreview,
    revealComposeRecipient,
    setRevealComposeRecipient,
    recentDispatches,
    emailThreads,
    isClearingDispatches,
    activeEmailThread,
    setActiveEmailThread,
    responseTemplates,
    isSavingTemplates,
    loadEmailCenterData,
    syncInboundReplies,
    handleSaveSupportEmail,
    handleDispatchCustomEmail,
    handleSaveResponseTemplates,
    handleClearEmailDispatches,
  };
}

export type KeepersEmailRelayState = ReturnType<typeof useKeepersEmailRelay>;

export function KeepersEmailComposeDrawer({
  relay,
}: {
  relay: KeepersEmailRelayState;
}) {
  const { t } = useLexicon();

  return (
    <SidePanel
      isOpen={relay.isComposeOpen}
      onClose={() => relay.setIsComposeOpen(false)}
      title={t("keepers_email_compose_group", "Compose & Dispatch Custom Email")}
      subtitle={t("keepers_foundry_label", "Sanctuary Foundry")}
      icon={t("icon_outgoing_mail", "outgoing_mail")}
      widthClass="w-[92vw] md:w-[820px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={
              relay.revealComposeRecipient
                ? t("icon_visibility_off", "visibility_off")
                : t("icon_visibility", "visibility")
            }
            tooltip={
              relay.revealComposeRecipient
                ? t("keepers_email_mask_recipient", "Hide Recipient Email")
                : t("keepers_email_reveal_recipient", "Reveal Recipient Email")
            }
            onClick={() => relay.setRevealComposeRecipient((prev) => !prev)}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        <UniversalGroup
          title={t("keepers_email_compose_group", "Compose & Dispatch Custom Email")}
          icon={t("icon_send", "send")}
        >
          {relay.responseTemplates.length > 0 && (
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
                  const chosen = relay.responseTemplates.find(
                    (tpl) => tpl.id === vals[0]
                  );
                  if (chosen) {
                    relay.setEmailComposeSubject(chosen.subject);
                    relay.setEmailComposeBody(chosen.body);
                    useStore
                      .getState()
                      .pushStatus(
                        t("keepers_email_tpl_applied", "Applied Human Response template!"),
                        "success"
                      );
                  }
                }}
                options={relay.responseTemplates.map((tpl) => ({
                  id: tpl.id,
                  label: `${tpl.name} (${tpl.category || t("keepers_email_tpl_default_cat", "Support")})`,
                }))}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UniversalInput
              label={t("keeper_email_recipient_label", "Recipient Email Address")}
              type={relay.revealComposeRecipient ? "email" : "password"}
              className="no-text-case"
              value={relay.emailComposeTo}
              onChange={relay.setEmailComposeTo}
              placeholder={t("keeper_email_recipient_placeholder", "citizen@domain.com")}
            />
            <UniversalInput
              label={t("keepers_email_subject_label", "Subject Line")}
              value={relay.emailComposeSubject}
              onChange={relay.setEmailComposeSubject}
              placeholder={t(
                "keepers_email_subject_placeholder",
                "Official Sanctuary OS Correspondence"
              )}
            />
          </div>

          <UniversalTextArea
            label={t("keepers_email_body_label", "Message Body")}
            value={relay.emailComposeBody}
            onChange={relay.setEmailComposeBody}
            placeholder={t(
              "keepers_email_body_placeholder",
              "Write your message to be formatted and dispatched..."
            )}
            className="min-h-[140px]"
          />

          <div className="flex flex-wrap gap-2">
            <ActionButton
              onClick={() => {
                const usableEmail =
                  relay.currentUserEmail &&
                  !/@blind\.sanctuaryos\.(net|local)$/i.test(relay.currentUserEmail)
                    ? relay.currentUserEmail
                    : "";
                if (usableEmail) {
                  relay.setEmailComposeTo(usableEmail);
                  relay.setRevealComposeRecipient(false);
                }
                relay.setEmailComposeSubject(
                  t("keepers_email_test_subject", "Sanctuary OS — Official Channel Check")
                );
                relay.setEmailComposeBody(
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
              onClick={() => relay.setShowComposePreview((prev) => !prev)}
              className="w-auto shrink-0"
              icon={
                relay.showComposePreview
                  ? t("icon_visibility_off", "visibility_off")
                  : t("icon_visibility", "visibility")
              }
              variant="glass"
              label={relay.showComposePreview ? t("hide", "Hide") : t("preview", "Preview")}
            />
            <ActionButton
              onClick={relay.handleDispatchCustomEmail}
              disabled={
                relay.isDispatchingEmail ||
                !relay.emailComposeTo.trim().includes("@") ||
                !relay.emailComposeSubject.trim() ||
                !relay.emailComposeBody.trim()
              }
              className="flex-1"
              icon={t("icon_outgoing_mail", "outgoing_mail")}
              variant="accent"
              label={
                relay.isDispatchingEmail
                  ? t("btn_submitting", "Submitting...")
                  : t("keepers_email_btn_dispatch_now", "Dispatch Official Email")
              }
            />
          </div>
        </UniversalGroup>

        {relay.showComposePreview && (
          <EmailTemplatePreviewAndAuthSection
            mode="compose_preview"
            fromName={normalizeLegacySenderName(
              relay.supportSenderNameInput,
              relay.defaultSenderDisplayName
            )}
            subject={relay.emailComposeSubject}
            bodyText={relay.emailComposeBody}
          />
        )}
      </div>
    </SidePanel>
  );
}

export function KeepersEmailRelaySettingsSection({
  relay,
  externalSearch = "",
  openCreateTemplateRef,
}: {
  relay: KeepersEmailRelayState;
  externalSearch?: string;
  openCreateTemplateRef?: MutableRefObject<(() => void) | null>;
}) {
  const { t } = useLexicon();
  const [activeRelayPanel, setActiveRelayPanel] = useState<
    "sender" | "inbound" | "dns" | null
  >(null);

  const receivingColorClass =
    relay.receivingApiStatus === "ready"
      ? "text-[var(--success)]"
      : relay.receivingApiStatus === "empty"
        ? "text-[var(--accent)]"
        : relay.receivingApiStatus === "send_only_api_key"
          ? "text-[var(--danger)]"
          : "text-[var(--warning)]";

  const receivingStatusVariant: "accent" | "success" | "warning" | "danger" =
    relay.receivingApiStatus === "ready"
      ? "success"
      : relay.receivingApiStatus === "empty"
        ? "accent"
        : relay.receivingApiStatus === "send_only_api_key"
          ? "danger"
          : "warning";

  const receivingStatusLabel =
    relay.receivingApiStatus === "ready"
      ? `${t("keepers_email_rx_ready", "Inbound Sync Ready")} (${relay.receivingSampleCount})`
      : relay.receivingApiStatus === "empty"
        ? t("keepers_email_rx_empty", "Receiving Authorized (Inbox Empty)")
        : relay.receivingApiStatus === "send_only_api_key"
          ? t("keepers_email_rx_send_only", "Send-Only Key (Receiving Blocked)")
          : relay.receivingApiStatus === "not_configured"
            ? t("keepers_email_status_setup", "Setup")
            : t("keepers_email_rx_error", "Receiving Check Failed");

  const senderStatusLabel = relay.hasSavedEmailSecret
    ? t("keepers_email_status_resend_ready", "Resend API Sealed")
    : relay.hasSavedWebhookRelay
      ? t("keepers_email_status_webhook_ready", "Webhook Relay Sealed")
      : t("keepers_email_status_fallback", "In-App Fallback (Add Resend Key Above)");

  const senderSecretReady = relay.hasSavedEmailSecret || relay.hasSavedWebhookRelay;
  const activeSenderEmail = relay.supportEmailInput || relay.defaultSupportEmail;
  const activeSenderName =
    relay.supportSenderNameInput || relay.defaultSenderDisplayName;
  const activeReplyTo = relay.supportReplyToInput || activeSenderEmail;
  const inboundWebhookEndpoint = `${String(SANCTUARY_CONFIG.supabaseUrl || "").replace(/\/+$/, "")}/functions/v1/keeper-email-dispatch?inbound=1`;

  const relayCards = useMemo(() => {
    const items = [
      {
        id: "sender" as const,
        statusColor: (senderSecretReady ? "success" : "warning") as "success" | "warning",
        icon: t("icon_alternate_email", "alternate_email"),
        bannerTopLabel: t("keepers_email_provider_label", "Mail Relay Transport"),
        bannerTopRightLabel: senderStatusLabel,
        bannerBottomLabel: activeSenderEmail,
        chipIcon: senderSecretReady
          ? t("icon_verified", "verified")
          : t("icon_info", "info"),
        chipColorClass: senderSecretReady
          ? "text-[var(--success)]"
          : "text-[var(--warning)]",
        chipLabel: senderStatusLabel,
        title: t("keepers_email_sender_group", "Custom Sender Identity & Mail Relay"),
        subtitleText: `${activeSenderName} • ${activeReplyTo}`,
        subtitle: (
          <span className="no-text-case">
            {activeSenderName} &bull; {activeReplyTo}
          </span>
        ),
        description: t(
          "keepers_email_sender_card_subtitle",
          "Outbound From identity, Reply-To & Resend API relay"
        ),
        ctaLabel: t("configure", "Configure"),
      },
      {
        id: "inbound" as const,
        statusColor: receivingStatusVariant,
        icon: t("icon_move_to_inbox", "move_to_inbox"),
        bannerTopLabel: t("status", "Status"),
        bannerTopRightLabel: receivingStatusLabel,
        bannerBottomLabel: t("keepers_email_inbound_footer_note", "Resend email.received"),
        chipIcon:
          relay.receivingApiStatus === "ready" || relay.receivingApiStatus === "empty"
            ? t("icon_verified", "verified")
            : t("icon_warning", "warning"),
        chipColorClass: receivingColorClass,
        chipLabel: receivingStatusLabel,
        title: t("keepers_email_inbound_diag_title", "Inbound Email Reply Receiving"),
        subtitleText: receivingStatusLabel,
        subtitle: receivingStatusLabel,
        description: t(
          "keepers_email_inbound_card_subtitle",
          "Webhook secret, Resend polling diagnostics & history cleanup"
        ),
        ctaLabel: t("configure", "Configure"),
      },
      {
        id: "dns" as const,
        statusColor: "accent" as const,
        icon: t("icon_dns", "dns"),
        bannerTopLabel: t("keepers_email_quick_ref_title", "Quick Reference (SMTP & DNS)"),
        bannerTopRightLabel: t("keepers_email_tls_badge", "TLS / 465"),
        bannerBottomLabel: t("keepers_email_inbound_url_label", "Inbound Webhook URL"),
        chipIcon: t("icon_lock", "lock"),
        chipColorClass: "text-[var(--accent)]",
        chipLabel: t("keepers_email_tls_badge", "TLS / 465"),
        title: t("keepers_email_dns_card_title", "Auth SMTP & Cloudflare DMARC"),
        subtitleText: "smtp.resend.com _dmarc resend",
        subtitle: <span className="no-text-case">smtp.resend.com &bull; _dmarc</span>,
        description: t(
          "keepers_email_dns_card_desc",
          "Inspect ready-to-copy Supabase Auth SMTP, Cloudflare DMARC TXT, and inbound webhook endpoints."
        ),
        ctaLabel: t("open", "Open"),
      },
    ];
    const q = externalSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitleText.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.bannerTopRightLabel.toLowerCase().includes(q)
    );
  }, [
    externalSearch,
    senderSecretReady,
    senderStatusLabel,
    activeSenderEmail,
    activeSenderName,
    activeReplyTo,
    receivingStatusVariant,
    receivingStatusLabel,
    receivingColorClass,
    relay.receivingApiStatus,
    t,
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <CommandScreenSectionHeading
          icon={t("icon_alternate_email", "alternate_email")}
          iconColorClass="text-[var(--accent)]"
          title={t("keepers_email_relay_section_title", "Mail Relay & Inbound Uplink")}
          subtitle={t(
            "keepers_email_relay_section_subtitle",
            "Outbound sender identity, Resend receiving diagnostics, and DNS authentication records"
          )}
          breadcrumb={`${relayCards.length}`}
        />

        <HubListGrid
          isEmpty={relayCards.length === 0}
          emptyIcon={t("icon_alternate_email", "alternate_email")}
          emptyTitle={t("no_match_assets", "No Matching Assets")}
          className="!pb-0"
        >
          {relayCards.map((card) => (
            <UniversalCard
              key={card.id}
              layout="vertical"
              statusColor={card.statusColor}
              icon={card.icon}
              bannerTopLabel={card.bannerTopLabel}
              bannerTopRightLabel={card.bannerTopRightLabel}
              bannerBottomLabel={card.bannerBottomLabel}
              title={card.title}
              subtitle={card.subtitle}
              description={card.description}
              imageOverlay={
                <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                  <span className={VAULT_CHIP_CLASS}>
                    <span
                      className={`material-symbols-outlined !text-[12px] ${card.chipColorClass}`}
                    >
                      {card.chipIcon}
                    </span>
                    <span className={card.chipColorClass}>{card.chipLabel}</span>
                  </span>
                </div>
              }
              onClick={() => setActiveRelayPanel(card.id)}
              footer={
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                    {t("keepers_foundry_label", "Sanctuary Foundry")}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
                    <span>{card.ctaLabel}</span>
                    <span className="text-sm leading-none">&rarr;</span>
                  </span>
                </div>
              }
            />
          ))}
        </HubListGrid>
      </div>

      <EmailResponseTemplatesSection
        templates={relay.responseTemplates}
        isSaving={relay.isSavingTemplates}
        onSaveTemplates={relay.handleSaveResponseTemplates}
        externalSearch={externalSearch}
        openCreateRef={openCreateTemplateRef}
      />

      <EmailTemplatePreviewAndAuthSection
        mode="auth_templates"
        fromName={normalizeLegacySenderName(
          relay.supportSenderNameInput,
          relay.defaultSenderDisplayName
        )}
        subject={relay.emailComposeSubject}
        bodyText={relay.emailComposeBody}
        externalSearch={externalSearch}
      />

      <SidePanel
        isOpen={activeRelayPanel === "sender"}
        onClose={() => setActiveRelayPanel(null)}
        title={t("keepers_email_sender_group", "Custom Sender Identity & Mail Relay")}
        subtitle={t("keepers_foundry_label", "Sanctuary Foundry")}
        icon={t("icon_alternate_email", "alternate_email")}
        widthClass="w-[92vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={t("save", "Save Changes")}
              disabled={relay.isSavingEmail}
              onClick={relay.handleSaveSupportEmail}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_alternate_email", "alternate_email")}
            overline={t("keepers_foundry_label", "Sanctuary Foundry")}
            title={t("keepers_email_sender_group", "Custom Sender Identity & Mail Relay")}
            description={t(
              "keepers_email_sender_card_subtitle",
              "Outbound From identity, Reply-To & Resend API relay"
            )}
            badge={senderStatusLabel}
            badgeIcon={
              senderSecretReady
                ? t("icon_verified", "verified")
                : t("icon_info", "info")
            }
            variant={senderSecretReady ? "success" : "warning"}
          />

          <UniversalGroup
            title={t("keepers_email_sender_group", "Custom Sender Identity & Mail Relay")}
            icon={t("icon_alternate_email", "alternate_email")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UniversalInput
                label={t("keepers_email_sender_name_label", "Custom Sender Display Name")}
                value={relay.supportSenderNameInput}
                onChange={relay.setSupportSenderNameInput}
                placeholder={relay.defaultSenderDisplayName}
              />
              <UniversalInput
                label={t("keepers_email_sender_addr_label", "Custom Sender Email (From)")}
                className="no-text-case"
                value={relay.supportEmailInput}
                onChange={relay.setSupportEmailInput}
                placeholder={relay.defaultSupportEmail}
              />
              <UniversalInput
                label={t("keepers_email_reply_to_label", "Reply-To Address")}
                className="no-text-case"
                value={relay.supportReplyToInput}
                onChange={relay.setSupportReplyToInput}
                placeholder={relay.defaultSupportEmail}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("keepers_email_provider_label", "Mail Relay Transport")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={relay.supportEmailProvider}
                  onChange={(v: string[]) =>
                    relay.setSupportEmailProvider(
                      (v[0] as "resend" | "webhook") || "resend"
                    )
                  }
                  options={[
                    {
                      id: "resend",
                      label: t("keepers_email_provider_resend", "Resend API (Custom Domain)"),
                    },
                    {
                      id: "webhook",
                      label: t(
                        "keepers_email_provider_webhook",
                        "Custom SMTP / Webhook Relay"
                      ),
                    },
                  ]}
                />
              </div>
            </div>

            {relay.supportEmailProvider === "resend" ? (
              <UniversalInput
                label={t("keepers_email_api_key_label", "Resend API Key (re_...)")}
                type="password"
                className="no-text-case"
                value={relay.supportEmailApiKey}
                onChange={relay.setSupportEmailApiKey}
                placeholder={
                  relay.hasSavedEmailSecret
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
                value={relay.supportEmailWebhookUrl}
                onChange={relay.setSupportEmailWebhookUrl}
                placeholder="https://mail-relay.sanctuaryos.net/dispatch"
              />
            )}

            <ActionButton
              onClick={relay.handleSaveSupportEmail}
              disabled={relay.isSavingEmail}
              className="w-full"
              icon={t("icon_save", "save")}
              variant="accent"
              label={t("keepers_email_btn_save_sender", "Save Custom Sender Configuration")}
            />
          </UniversalGroup>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={activeRelayPanel === "inbound"}
        onClose={() => setActiveRelayPanel(null)}
        title={t("keepers_email_inbound_diag_title", "Inbound Email Reply Receiving")}
        subtitle={t("keepers_foundry_label", "Sanctuary Foundry")}
        icon={t("icon_move_to_inbox", "move_to_inbox")}
        widthClass="w-[92vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_sync", "sync")}
              tooltip={t("keepers_email_sync_replies_btn", "Sync Inbound Replies")}
              disabled={relay.isSyncingReplies}
              onClick={() => relay.syncInboundReplies({ silent: false })}
            />
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={t("save", "Save Changes")}
              disabled={relay.isSavingEmail}
              onClick={relay.handleSaveSupportEmail}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_move_to_inbox", "move_to_inbox")}
            overline={t("keepers_foundry_label", "Sanctuary Foundry")}
            title={t("keepers_email_inbound_diag_title", "Inbound Email Reply Receiving")}
            description={
              relay.receivingApiStatus === "send_only_api_key"
                ? t(
                    "keepers_email_send_only_desc",
                    "The saved Resend API key only has Sending Access. Resend rejects /emails/receiving reads with restricted_api_key until you replace it with a Full Access Resend API key and verify Receiving MX records on sanctuaryos.net."
                  )
                : t(
                    "keepers_email_rx_desc",
                    "Sanctuary OS polls Resend Receiving directly whenever threads open and accepts instant Resend email.received webhooks."
                  )
            }
            badge={receivingStatusLabel}
            badgeIcon={
              relay.receivingApiStatus === "ready" || relay.receivingApiStatus === "empty"
                ? t("icon_verified", "verified")
                : t("icon_warning", "warning")
            }
            variant={receivingStatusVariant}
          >
            {relay.receivingDetail && (
              <p className="text-[11px] font-mono text-[var(--warning)] break-all pt-1">
                {relay.receivingDetail}
              </p>
            )}
          </SidePanelHeroCard>

          <div className="flex flex-wrap gap-2">
            <ActionButton
              onClick={() => relay.loadEmailCenterData()}
              icon={t("icon_verified_user", "verified_user")}
              variant="glass"
              className="flex-1"
              label={t("keepers_email_verify_relay_btn", "Verify Relay Status")}
            />
            <ActionButton
              onClick={() => relay.syncInboundReplies({ silent: false })}
              disabled={relay.isSyncingReplies}
              icon={t("icon_sync", "sync")}
              variant="accent"
              className="flex-1"
              label={
                relay.isSyncingReplies
                  ? t("ui_btn_processing", "Processing...")
                  : t("keepers_email_sync_replies_btn", "Sync Inbound Replies")
              }
            />
          </div>

          <UniversalGroup
            title={t("keepers_email_inbound_card_title", "Inbound Replies Webhook (Resend / Relay)")}
            icon={t("icon_webhook", "webhook")}
          >
            <UniversalInput
              label={t(
                "keepers_email_inbound_secret_label",
                "Inbound Replies Webhook Secret (whsec_... or shared secret)"
              )}
              type="password"
              className="no-text-case"
              value={relay.inboundWebhookSecretInput}
              onChange={relay.setInboundWebhookSecretInput}
              placeholder={
                relay.hasSavedInboundSecret
                  ? `•••••••• (${t("keepers_email_inbound_secret_configured", "Inbound webhook secret sealed")})`
                  : t(
                      "keepers_email_inbound_secret_ph",
                      "whsec_... (Svix Resend secret or x-sanctuary-inbound-secret)"
                    )
              }
            />

            <ActionButton
              onClick={relay.handleSaveSupportEmail}
              disabled={relay.isSavingEmail}
              className="w-full"
              icon={t("icon_save", "save")}
              variant="glass"
              label={t("save", "Save Changes")}
            />

            <UniversalCard
              layout="vertical"
              statusColor={relay.hasSavedInboundSecret ? "success" : "warning"}
              icon={t("icon_webhook", "webhook")}
              bannerTopLabel={t("keepers_email_inbound_url_label", "Inbound Webhook URL")}
              bannerTopRightLabel={
                relay.hasSavedInboundSecret
                  ? t("active", "Active")
                  : t("keepers_email_status_setup", "Setup")
              }
              bannerBottomLabel={t("keepers_email_inbound_footer_note", "Resend email.received")}
              title={t(
                "keepers_email_inbound_card_title",
                "Inbound Replies Webhook (Resend / Relay)"
              )}
              subtitle={<span className="no-text-case">POST email.received</span>}
              description={
                <span className="no-text-case font-mono text-[11px] text-[var(--subtext)] break-all">
                  {inboundWebhookEndpoint}
                </span>
              }
              onClick={() => {
                navigator.clipboard?.writeText(inboundWebhookEndpoint);
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
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
                    <span>{t("copy", "Copy")}</span>
                    <span className="material-symbols-outlined !text-[13px]">
                      {t("icon_content_copy", "content_copy")}
                    </span>
                  </span>
                </div>
              }
            />
          </UniversalGroup>

          {relay.recentDispatches.length > 0 && (
            <UniversalGroup
              title={t("clear", "Clear")}
              icon={t("icon_delete_sweep", "delete_sweep")}
            >
              <ActionButton
                onClick={relay.handleClearEmailDispatches}
                disabled={relay.isClearingDispatches}
                variant="glass"
                className="w-full text-[var(--danger)]"
                icon={t("icon_delete_sweep", "delete_sweep")}
                label={t("clear", "Clear")}
              />
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      <SidePanel
        isOpen={activeRelayPanel === "dns"}
        onClose={() => setActiveRelayPanel(null)}
        title={t("keepers_email_dns_card_title", "Auth SMTP & Cloudflare DMARC")}
        subtitle={t("keepers_email_quick_ref_title", "Quick Reference (SMTP & DNS)")}
        icon={t("icon_dns", "dns")}
        widthClass="w-[92vw] md:w-[680px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_dns", "dns")}
            overline={t("keepers_foundry_label", "Sanctuary Foundry")}
            title={t("keepers_email_dns_card_title", "Auth SMTP & Cloudflare DMARC")}
            description={t(
              "keepers_email_dns_card_desc",
              "Inspect ready-to-copy Supabase Auth SMTP, Cloudflare DMARC TXT, and inbound webhook endpoints."
            )}
            badge={t("keepers_email_tls_badge", "TLS / 465")}
            badgeIcon={t("icon_lock", "lock")}
            variant="accent"
          />

          <div className="grid grid-cols-1 gap-4">
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
                  {t(
                    "keepers_email_smtp_short_val",
                    "smtp.resend.com • Port 465 • User: resend"
                  )}
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
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
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
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
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
              statusColor={relay.hasSavedInboundSecret ? "success" : "warning"}
              icon={t("icon_webhook", "webhook")}
              bannerTopLabel={t("keepers_email_inbound_url_label", "Inbound Webhook URL")}
              bannerTopRightLabel={
                relay.hasSavedInboundSecret
                  ? t("active", "Active")
                  : t("keepers_email_status_setup", "Setup")
              }
              bannerBottomLabel={t("keepers_email_inbound_footer_note", "Resend email.received")}
              title={t(
                "keepers_email_inbound_card_title",
                "Inbound Replies Webhook (Resend / Relay)"
              )}
              subtitle={<span className="no-text-case">POST email.received</span>}
              description={
                <span className="no-text-case font-mono text-[11px] text-[var(--subtext)] break-all">
                  {inboundWebhookEndpoint}
                </span>
              }
              imageOverlay={
                <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                  <span className={VAULT_CHIP_CLASS}>
                    <span
                      className={`material-symbols-outlined !text-[12px] ${
                        relay.hasSavedInboundSecret
                          ? "text-[var(--success)]"
                          : "text-[var(--warning)]"
                      }`}
                    >
                      {relay.hasSavedInboundSecret
                        ? t("icon_verified", "verified")
                        : t("icon_key", "key")}
                    </span>
                    <span
                      className={
                        relay.hasSavedInboundSecret
                          ? "text-[var(--success)]"
                          : "text-[var(--warning)]"
                      }
                    >
                      {relay.hasSavedInboundSecret
                        ? t("keepers_email_inbound_secret_ready", "Webhook Verified")
                        : t("keepers_email_status_setup", "Setup")}
                    </span>
                  </span>
                </div>
              }
              onClick={() => {
                navigator.clipboard?.writeText(inboundWebhookEndpoint);
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
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover/card:text-[var(--accent)] transition-all flex items-center gap-1 opacity-80 group-hover/card:opacity-100 shrink-0">
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
      </SidePanel>
    </div>
  );
}
