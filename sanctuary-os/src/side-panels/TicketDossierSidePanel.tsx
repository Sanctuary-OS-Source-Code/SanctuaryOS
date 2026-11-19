import { useStore } from "../store";
import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase, supabaseAuth, getBrandConfig } from "../supabase";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  ActionButton,
  CustomDropdown,
  handleOpenUrl,
  renderTextWithIcons,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
} from "../shared";
import { UniversalInput, UniversalTextArea, SidePanelPillToggle } from "../components/universal/UniversalLayout";
import {
  DEFAULT_KEEPER_EMAIL_RESPONSE_TEMPLATES,
  dispatchKeeperCustomEmail,
  getKeepersPipelineConfig,
  KeeperEmailResponseTemplate,
  normalizeLegacySenderName,
  resolveKeeperEmailResponseTemplates,
  getSupporterState,
  findAnyActiveMasonSupporterPasses,
  isSpokeSupporter,
  isFoundryPatron,
} from "../utils/supporterManager";
import { UniversalCard } from "../components/universal/UniversalCard";
import {
  getTicketSupporterFlags,
  parseTicketPresentation,
  TicketSupporterFallback,
} from "../components/universal/SupportTicketCard";
import {
  hydrateSpokeTargetsForIdentifiers,
  makeTargetLookupKey,
  normalizeExternalUrl,
  type ResolvedDmcaTargetEntry,
} from "../hub-components/compliance/dmcaQueueHelpers";
import {
  SpokeTargetDossierSidePanel,
  type SpokeTargetPreResolvedMeta,
} from "../landing/SpokeTargetDossierSidePanel";
import type { LegalTargetItem } from "../landing/DmcaAndLegalFlowSteps";
import {
  maskEmailAddress,
  maskEmailsInText,
  getEmailDispatchStatusMeta,
  formatEmailProviderLabel,
} from "../utils/sanctuaryEmailTemplates";
import TicketLogViewer from "./TicketLogViewer";
import EmailConversationSidePanel from "../hub-components/keepers-email/EmailConversationSidePanel";

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
  const [authorName, setAuthorName] = useState(t("loading", "Loading..."));
  const [isAuthorPatron, setIsAuthorPatron] = useState(false);
  const [localAuthorFallback, setLocalAuthorFallback] = useState<
    TicketSupporterFallback | undefined
  >(undefined);
  const [replies, setReplies] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchedTargetModName, setFetchedTargetModName] = useState<string | null>(null);
  const [hydratedDmcaTargets, setHydratedDmcaTargets] = useState<
    Record<string, ResolvedDmcaTargetEntry>
  >({});
  const [hydratedGamesMap, setHydratedGamesMap] = useState<Record<string, any>>({});
  const [dossierTarget, setDossierTarget] = useState<{
    item: LegalTargetItem;
    spokeGame: any | null;
    preResolved?: SpokeTargetPreResolvedMeta;
  } | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [sendEmailCopy, setSendEmailCopy] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [revealContactEmail, setRevealContactEmail] = useState(false);
  const brand = getBrandConfig();
  const defaultSenderName = brand.appTitle || "Sanctuary OS";
  const [senderIdentityLabel, setSenderIdentityLabel] = useState(defaultSenderName);
  const [responseTemplates, setResponseTemplates] = useState<KeeperEmailResponseTemplate[]>(
    () => DEFAULT_KEEPER_EMAIL_RESPONSE_TEMPLATES.map((tpl) => ({ ...tpl }))
  );
  const [activeDispatchThread, setActiveDispatchThread] = useState<{
    threadId?: string | null;
    dispatchId?: string | null;
    subject?: string;
  } | null>(null);

  useEffect(() => {
    setRevealContactEmail(false);
    setDossierTarget(null);
    const isKeepersTicket = (ticket?.table_name || tableName) === "keeper_tickets";
    if (!ticket) {
      setSendEmailCopy(false);
      setEmailRecipient("");
      setHydratedDmcaTargets({});
      setHydratedGamesMap({});
      return;
    }

    const parsedTicket = parseTicketPresentation(ticket, t);
    const targetModToken = ticket?.target_mod_id || ticket?.metadata?.target_mod_id;
    const dmcaIds = parsedTicket.dmca?.targetIdentifiers || [];
    const spokeIdToResolve =
      parsedTicket.dmca?.targetSpokeId ||
      ticket?.metadata?.target_spoke_id ||
      ((): string | null => {
        const st = useStore.getState();
        const ws = Array.isArray(st.workspaces)
          ? st.workspaces.find((w: any) => w.id === st.activeWorkspaceId)
          : null;
        return ws?.game_id ? String(ws.game_id) : null;
      })();

    if ((dmcaIds.length > 0 || targetModToken) && spokeIdToResolve) {
      hydrateSpokeTargetsForIdentifiers([
        {
          targetSpokeId: spokeIdToResolve,
          identifiers: [
            ...dmcaIds,
            ...(targetModToken ? [String(targetModToken)] : []),
          ],
        },
      ])
        .then((res) => {
          setHydratedGamesMap(res.gamesMap);
          setHydratedDmcaTargets(res.resolvedTargetsMap);
        })
        .catch(() => {});
    } else if (dmcaIds.length > 0 && parsedTicket.dmca?.targetScope) {
      supabaseAuth
        .from("sanctuary_games")
        .select("id, name, schema_id, supabase_url, supabase_anon_key, icon")
        .ilike("name", parsedTicket.dmca.targetScope)
        .limit(1)
        .then(
          ({ data: matchingGames }) => {
            const matchedId = matchingGames?.[0]?.id;
            if (!matchedId) return;
            hydrateSpokeTargetsForIdentifiers(
              [{ targetSpokeId: String(matchedId), identifiers: dmcaIds }],
              { [String(matchedId)]: matchingGames[0] }
            )
              .then((res) => {
                setHydratedGamesMap(res.gamesMap);
                setHydratedDmcaTargets(res.resolvedTargetsMap);
              })
              .catch(() => {});
          },
          () => {}
        );
    } else {
      setHydratedDmcaTargets({});
    }

    if (!isKeepersTicket) {
      setSendEmailCopy(false);
      setEmailRecipient("");
      return;
    }

    getKeepersPipelineConfig().then((cfg) => {
      const b = getBrandConfig();
      const fallbackBrand = b.appTitle || "Sanctuary OS";
      setSenderIdentityLabel(
        normalizeLegacySenderName(cfg.support_sender_name, fallbackBrand)
      );
      setResponseTemplates(resolveKeeperEmailResponseTemplates(cfg));
    });

    const rawContact =
      ticket.metadata?.contact_meta?.reply_contact ||
      ticket.metadata?.partner_application?.lead_contact ||
      ticket.metadata?.keeper_application?.applicant_contact ||
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
    let isMounted = true;
    const initialPatron = Boolean(
      ticket?.metadata?.is_foundry_patron || ticket?.metadata?.expedited_support
    );
    setIsAuthorPatron(initialPatron);
    setLocalAuthorFallback(undefined);

    const resolveAuthorAndSupporter = async () => {
      if (!ticket) return;

      const sessionUser = useStore.getState().session?.user;
      const isCurrentUserAuthor =
        Boolean(ticket.author_id) &&
        (ticket.author_id === currentUserId ||
          ticket.author_id === sessionUser?.id);

      if (isCurrentUserAuthor) {
        try {
          const st = await getSupporterState();
          if (isMounted) {
            const patron = isFoundryPatron(st);
            if (patron) {
              setIsAuthorPatron(true);
            }
            const activeWorkspaceId = useStore.getState().activeWorkspaceId;
            const masonPasses = findAnyActiveMasonSupporterPasses(st);
            const spokePass = isSpokeSupporter(st, activeWorkspaceId);
            setLocalAuthorFallback({
              isMasonSupporter: masonPasses.length > 0,
              masonSupporterName: masonPasses[0]?.mason_name || null,
              isSpokeSupporter: Boolean(spokePass),
              spokeSupporterName: spokePass?.spoke_name || null,
              isFoundryPatron: patron,
            });
          }
        } catch (_) {}
      }

      if (ticket.author_id) {
        let resolvedName = "";

        try {
          const { data: spokeProfile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", ticket.author_id)
            .maybeSingle();
          if (spokeProfile?.username) {
            resolvedName = spokeProfile.username;
          }
        } catch (_) {}

        try {
          const { data: hubProfile } = await supabaseAuth
            .from("profiles")
            .select("username, total_months_unlocked, dev_build_until")
            .eq("id", ticket.author_id)
            .maybeSingle();
          if (hubProfile) {
            if (!resolvedName && (hubProfile as any).username) {
              resolvedName = (hubProfile as any).username;
            }
            const hubMonths = Number(
              (hubProfile as any).total_months_unlocked || 0
            );
            const hubUntil = (hubProfile as any).dev_build_until
              ? new Date((hubProfile as any).dev_build_until).getTime()
              : 0;
            if (isMounted && (hubMonths > 0 || hubUntil > Date.now())) {
              setIsAuthorPatron(true);
            }
          }
        } catch (_) {}

        if (!resolvedName) {
          try {
            const { data: mData } = await supabase
              .from("masons")
              .select("name")
              .or(`id.eq.${ticket.author_id},profile_id.eq.${ticket.author_id}`)
              .maybeSingle();
            if (mData?.name) {
              resolvedName = mData.name;
            }
          } catch (_) {}
        }

        if (!resolvedName && isCurrentUserAuthor && sessionUser) {
          resolvedName =
            sessionUser.user_metadata?.mason_name ||
            sessionUser.user_metadata?.username ||
            sessionUser.email?.split("@")[0] ||
            "";
        }

        if (isMounted) {
          setAuthorName(
            resolvedName ||
              ticket.author_username ||
              ticket.author_id?.substring(0, 8).toUpperCase() ||
              "SYSTEM"
          );
        }
      } else {
        const rawFallbackAuthor =
          ticket.metadata?.keeper_application?.applicant_handle ||
          ticket.metadata?.keeper_application?.applicant_contact ||
          ticket.metadata?.partner_application?.lead_contact ||
          ticket.metadata?.contact_meta?.reply_contact ||
          ticket.metadata?.feedback_meta?.author_label ||
          "VISITOR";
        if (isMounted) setAuthorName(maskEmailsInText(rawFallbackAuthor));
      }
    };

    resolveAuthorAndSupporter();

    if (ticket?.metadata?.replies) {
      setReplies(ticket.metadata.replies);
    } else {
      setReplies([]);
    }

    return () => {
      isMounted = false;
    };
  }, [ticket, currentUserId]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !ticket) return;
    setIsSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    let replyAuthor = t("support_team", "Support Team");
    if (user) {
      replyAuthor =
        user.user_metadata?.mason_name ||
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        t("support_team", "Support Team");
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
        const replySubject = `Re: ${ticket.title || `${brand.appTitle} Support Inquiry`}`;
        const emailResult = await dispatchKeeperCustomEmail({
          to_email: emailRecipient.trim(),
          subject: replySubject,
          body_text: replyText.trim(),
          ticket_id: ticket.id,
        });

        const dispatchBadge = {
          id: emailResult.dispatch_id || crypto.randomUUID(),
          to_email: maskEmailAddress(emailRecipient.trim()),
          from_identity: senderIdentityLabel,
          subject: replySubject,
          provider: emailResult.provider,
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
          ? t("keeper_email_reply_dispatched", "Reply saved & official email dispatched!")
          : t("support_success", "Reply sent"),
        "success"
      );

      if (ticket.author_id && user && ticket.author_id !== user.id) {
        await supabase.from("notifications").insert({
          user_id: ticket.author_id,
          actor_id: user.id,
          title: t("notification_ticket_reply_title", "New Ticket Reply"),
          message: (
            t("notification_ticket_reply_body", "{0} replied to your ticket: {1}") ||
            "{0} replied to your ticket: {1}"
          )
            .replace("{0}", replyAuthor)
            .replace("{1}", String(ticket.title || "")),
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

  const statusLower = ticket.status?.toLowerCase() || "open";
  const isResolved = statusLower === "resolved" || statusLower === "closed";
  const isRejected = statusLower === "rejected";
  const isEscalated = statusLower === "escalated";
  const isPending = statusLower === "investigating" || statusLower === "pending";

  const statusLabel = isResolved
    ? t("ticket_status_resolved", "Resolved")
    : isRejected
      ? t("ticket_status_rejected", "Rejected")
      : isEscalated
        ? t("ticket_status_escalated", "Escalated")
        : isPending
          ? t("ticket_status_pending", "Pending")
          : t("ticket_status_open", "Open");

  const isKeepersSpokeViewCopy =
    (ticket.table_name || tableName) === "keeper_tickets" &&
    (Boolean(ticket?.metadata?.target_spoke_id || ticket?.metadata?.dmca_meta?.target_spoke_id) ||
      String(
        ticket?.metadata?.target_scope ||
          ticket?.metadata?.dmca_meta?.target_scope ||
          ""
      ).toLowerCase() === "spoke");
  const effectiveReadOnly = Boolean(isReadOnly || isKeepersSpokeViewCopy);
  const effectiveCanReply = Boolean(canReply && !isKeepersSpokeViewCopy);

  const heroVariant = isEscalated || isRejected
    ? "danger"
    : isResolved
      ? "success"
      : isPending
        ? "warning"
        : "accent";

  return (
    <>
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("ticket_details_title", "Support Ticket")}
      subtitle={`${t("ticket_id_label", "Ticket ID")}: ${ticket.id.substring(0, 8)}`}
      icon={t("icon_support_agent", "support_agent")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[92vw] md:w-[820px]"
      headerActions={
        !effectiveReadOnly ? (
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
            {onTakeAction &&
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
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        {(() => {
          const supporterFlags = getTicketSupporterFlags(ticket, localAuthorFallback);
          const showPatron = isAuthorPatron || supporterFlags.isFoundryPatron;
          const heroBadges: { label: string; icon?: string; colorClass?: string }[] = [];
          if (supporterFlags.isMasonSupporter) {
            heroBadges.push({
              label: supporterFlags.masonSupporterName
                ? `${t("ticket_badge_mason_priority", "Priority • {Mason} Supporter")} (${supporterFlags.masonSupporterName})`
                : t("ticket_badge_mason_priority", "Priority • {Mason} Supporter"),
              icon: t("icon_bolt", "bolt"),
              colorClass: "text-[var(--warning)]",
            });
          } else if (supporterFlags.isSpokeSupporter) {
            heroBadges.push({
              label: t("ticket_badge_spoke_supporter", "Spoke Supporter"),
              icon: t("icon_favorite", "favorite"),
              colorClass: "text-[var(--accent)]",
            });
          } else if (showPatron) {
            heroBadges.push({
              label: t("supporter_patron_badge_label", "Foundry Supporter"),
              icon: t("icon_workspace_premium", "workspace_premium"),
              colorClass: "text-[var(--accent)]",
            });
          }

          const parsedHero = parseTicketPresentation(ticket, t);
          return (
            <SidePanelHeroCard
              icon={parsedHero.dmca ? t("icon_gavel", "gavel") : t("icon_receipt_long", "receipt_long")}
              overline={
                parsedHero.channelBadge ||
                (ticket.category || ticket.ticket_type || t("support_ticket", "Support Ticket")).replace(
                  /_/g,
                  " "
                )
              }
              title={parsedHero.cleanTitle}
              description={
                parsedHero.dmca
                  ? [parsedHero.dmca.noticeTypeLabel, parsedHero.dmca.noticeId]
                      .filter(Boolean)
                      .join(" • ")
                  : t(
                      "ticket_details_desc",
                      "Ticket details, attached logs, and support replies."
                    )
              }
              badge={statusLabel}
              badgeIcon={t("icon_confirmation_number", "confirmation_number")}
              badges={heroBadges.length > 0 ? heroBadges : undefined}
              variant={heroVariant}
            >
              <div className="grid grid-cols-2 gap-3 pt-1">
                <StatBox
                  label={t("author", "Author")
                    .replace(/^[^\w]*/, "")
                    .trim()}
                  value={ticket.author_username || authorName}
                  icon={
                    showPatron
                      ? t("icon_workspace_premium", "workspace_premium")
                      : t("icon_person", "person")
                  }
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("ticket_status", "Ticket Status")
                    .replace(/^[^\w]*/, "")
                    .trim()}
                  value={statusLabel}
                  icon={t("icon_confirmation_number", "confirmation_number")}
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
          );
        })()}

        {ticket.metadata?.restricted_violations &&
          ticket.metadata.restricted_violations.length > 0 && (
            <SidePanelHeroCard
              icon={t("icon_warning", "warning")}
              overline={t("ticket_restricted_detected", "Restricted {mods} detected in {blueprint}")}
              title={t("ticket_restricted_detected", "Restricted {mods} detected in {blueprint}")}
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
            title={t("ticket_assignment_title", "Assignment & Target")}
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
                      : t("another_support_member", "Another Team Member")}
                  </span>
                </span>
              </div>
            )}

            {(ticket.target_mod_id || ticket.metadata?.target_mod_id) && (() => {
              const targetModToken = String(
                ticket.target_mod_id || ticket.metadata?.target_mod_id || ""
              ).trim();
              const matchedHydrated = Object.values(hydratedDmcaTargets).find(
                (entry) =>
                  entry.identifier.toLowerCase() === targetModToken.toLowerCase()
              );
              const resolvedTitle =
                ticket.target_mod_name ||
                matchedHydrated?.item?.title ||
                fetchedTargetModName ||
                targetModToken;
              const resolvedSub = [
                matchedHydrated?.item?.subtitle
                  ? `${t("by_prefix", "By")} ${matchedHydrated.item.subtitle}`
                  : null,
                `#${targetModToken.slice(0, 8)}`,
              ]
                .filter(Boolean)
                .join(" • ");

              return (
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_extension", "extension")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                        {t("target_artifact", "Target {Mod}")}
                      </span>
                      <span className="text-sm font-black text-[var(--text)] truncate no-text-case">
                        {resolvedTitle}
                      </span>
                      <span className="text-xs font-mono text-[var(--subtext)] truncate no-text-case">
                        {resolvedSub}
                      </span>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_menu_book", "menu_book")}
                      label={t("view_dossier", "View Dossier")}
                      onClick={() =>
                        setDossierTarget({
                          item: matchedHydrated?.item || {
                            identifier: targetModToken,
                            kind: "mod",
                            title: resolvedTitle,
                          },
                          spokeGame: matchedHydrated?.spokeGame || null,
                          preResolved: matchedHydrated?.preResolved,
                        })
                      }
                    />
                    {onEditMetadata && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_edit", "edit")}
                        label={t("btn_edit", "Edit")}
                        onClick={() => onEditMetadata(targetModToken)}
                      />
                    )}
                  </div>
                </div>
              );
            })()}
          </UniversalGroup>
        )}

        {(() => {
          const parsedBody = parseTicketPresentation(ticket, t);
          if (parsedBody.dmca) {
            const dmca = parsedBody.dmca;
            const resolvedEntries = Object.entries(hydratedDmcaTargets);
            const lookupHydrated = (token: string): ResolvedDmcaTargetEntry | undefined => {
              const directKey = dmca.targetSpokeId
                ? makeTargetLookupKey(dmca.targetSpokeId, token)
                : "";
              if (directKey && hydratedDmcaTargets[directKey]) {
                return hydratedDmcaTargets[directKey];
              }
              const lowerTok = token.trim().toLowerCase();
              const found = resolvedEntries.find(([k]) => k.endsWith(`::${lowerTok}`));
              return found?.[1];
            };
            const firstGameObj =
              (dmca.targetSpokeId && hydratedGamesMap[dmca.targetSpokeId]) ||
              Object.values(hydratedGamesMap)[0] ||
              null;

            return (
              <UniversalGroup
                title={t("dmca_ticket_filing_group", "Legal & Compliance Filing")}
                icon={t("icon_gavel", "gavel")}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <StatBox
                    label={t("dmca_request_type_label", "Request Type")}
                    value={dmca.noticeTypeLabel}
                    icon={t("icon_gavel", "gavel")}
                    iconColorClass="text-[var(--warning)]"
                  />
                  <StatBox
                    label={t("dmca_notice_ref_label", "Notice Reference")}
                    value={dmca.noticeId || `#${String(ticket.id).slice(0, 8)}`}
                    icon={t("icon_fingerprint", "fingerprint")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("dmca_scope_label", "Target Scope")}
                    value={dmca.targetScope || t("sanctuary_foundry", "Sanctuary Foundry")}
                    icon={t("icon_hub", "hub")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={
                      dmca.slaDeadlineAt
                        ? t("dmca_sla_deadline_label", "48h Spoke SLA")
                        : t("dmca_claimant_masked_label", "Claimant")
                    }
                    value={
                      dmca.slaDeadlineAt
                        ? new Date(dmca.slaDeadlineAt).toLocaleString()
                        : dmca.claimantMasked || authorName
                    }
                    icon={
                      dmca.slaDeadlineAt
                        ? t("icon_schedule", "schedule")
                        : t("icon_badge", "badge")
                    }
                    iconColorClass="text-[var(--warning)]"
                  />
                </div>

                {dmca.targetIdentifiers.length > 0 && (
                  <div className="flex flex-col gap-2 mt-1">
                    {dmca.targetIdentifiers.map((tok) => {
                      const entry = lookupHydrated(tok);
                      const isUrl = /^https?:\/\//i.test(tok);
                      const isHashToken = /^[0-9a-f]{64}$/i.test(tok);
                      const itemCard: LegalTargetItem = entry?.item || {
                        identifier: tok,
                        kind: "mod",
                        title: tok,
                        subtitle: dmca.targetScope,
                      };
                      const sub = entry
                        ? [
                            entry.item.subtitle
                              ? `${t("by_prefix", "By")} ${entry.item.subtitle}`
                              : dmca.targetScope,
                            typeof entry.preResolved?.complianceTier === "number"
                              ? `${t("stat_tier", "Tier")} ${entry.preResolved.complianceTier}`
                              : null,
                            `#${entry.identifier.slice(0, 8)}`,
                          ]
                            .filter(Boolean)
                            .join(" • ")
                        : isHashToken
                          ? `SHA-256: ${tok.slice(0, 12)}...${tok.slice(-8)}`
                          : `${dmca.targetScope} • ${tok}`;

                      return (
                        <div
                          key={tok}
                          className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 no-text-case"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                              <span className="material-symbols-outlined !text-[18px]">
                                {itemCard.kind === "blueprint"
                                  ? t("icon_layers", "layers")
                                  : t("icon_inventory_2", "inventory_2")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                                {t("target_artifact", "Target {Mod}")}
                              </span>
                              <span className="text-sm font-black text-[var(--text)] truncate no-text-case">
                                {itemCard.title}
                              </span>
                              <span className="text-xs font-mono text-[var(--subtext)] truncate no-text-case">
                                {sub}
                              </span>
                            </div>
                          </div>
                          <div className="ml-auto flex items-center gap-2 shrink-0">
                            {isUrl ? (
                              <ActionButton
                                variant="glass"
                                icon={t("icon_open_in_new", "open_in_new")}
                                label={t("btn_open", "Open")}
                                onClick={() => {
                                  const safe = normalizeExternalUrl(tok);
                                  if (safe) handleOpenUrl(safe);
                                }}
                              />
                            ) : (
                              <ActionButton
                                variant="glass"
                                icon={t("icon_menu_book", "menu_book")}
                                label={t("view_dossier", "View Dossier")}
                                onClick={() =>
                                  setDossierTarget({
                                    item: itemCard,
                                    spokeGame: entry?.spokeGame || firstGameObj || null,
                                    preResolved: entry?.preResolved,
                                  })
                                }
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {dmca.workUrl && (
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 no-text-case">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_link", "link")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                          {t("dmca_work_url_opt_label", "Original Work / Reference URL")}
                        </span>
                        <span className="text-xs font-mono font-bold text-[var(--text)] truncate no-text-case">
                          {dmca.workUrl}
                        </span>
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      <ActionButton
                        variant="glass"
                        icon={t("icon_open_in_new", "open_in_new")}
                        label={t("dmca_open_reference_url", "Open Link")}
                        onClick={() => {
                          const safe = normalizeExternalUrl(dmca.workUrl);
                          if (safe) handleOpenUrl(safe);
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-2.5 text-xs text-[var(--subtext)] no-text-case">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                    {t("icon_lock", "lock")}
                  </span>
                  <span>{dmca.privacyNote}</span>
                </div>
              </UniversalGroup>
            );
          }

          return (
            <UniversalGroup
              title={t("upload_desc", "Description")}
              icon={t("icon_description", "description")}
            >
              <div className="w-full glass-surface rounded-xl px-4 py-3.5 text-[var(--text)] text-sm border border-[color-mix(in_srgb,var(--text)_12%,transparent)] min-h-28 whitespace-pre-wrap leading-relaxed no-text-case">
                {ticket.description}
              </div>
            </UniversalGroup>
          );
        })()}

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
            headerAction={
              String(ticket.metadata.contact_meta.reply_contact || "").includes("@") ? (
                <PanelHeaderGroup>
                  <PanelHeaderButton
                    icon={
                      revealContactEmail
                        ? t("icon_visibility_off", "visibility_off")
                        : t("icon_visibility", "visibility")
                    }
                    tooltip={
                      revealContactEmail
                        ? t("keepers_email_mask_recipient", "Hide Recipient Email")
                        : t("keepers_email_reveal_recipient", "Reveal Recipient Email")
                    }
                    onClick={() => setRevealContactEmail((prev) => !prev)}
                  />
                </PanelHeaderGroup>
              ) : undefined
            }
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
                value={
                  ticket.metadata.contact_meta.reply_contact
                    ? revealContactEmail
                      ? ticket.metadata.contact_meta.reply_contact
                      : maskEmailsInText(ticket.metadata.contact_meta.reply_contact)
                    : "Account Profile"
                }
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
            headerAction={
              String(ticket.metadata.partner_application.lead_contact || "").includes("@") ? (
                <PanelHeaderGroup>
                  <PanelHeaderButton
                    icon={
                      revealContactEmail
                        ? t("icon_visibility_off", "visibility_off")
                        : t("icon_visibility", "visibility")
                    }
                    tooltip={
                      revealContactEmail
                        ? t("keepers_email_mask_recipient", "Hide Recipient Email")
                        : t("keepers_email_reveal_recipient", "Reveal Recipient Email")
                    }
                    onClick={() => setRevealContactEmail((prev) => !prev)}
                  />
                </PanelHeaderGroup>
              ) : undefined
            }
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
                value={
                  ticket.metadata.partner_application.lead_contact
                    ? revealContactEmail
                      ? ticket.metadata.partner_application.lead_contact
                      : maskEmailsInText(ticket.metadata.partner_application.lead_contact)
                    : "N/A"
                }
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
              title={t("ticket_attached_logs", "Attached Logs")}
              icon={t("icon_terminal", "terminal")}
            >
              <TicketLogViewer logs={ticket.metadata.logs} />
            </UniversalGroup>
          )}

        {replies.length > 0 && (
          <UniversalGroup
            title={t("ticket_replies", "Replies")}
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
              count={ticket.metadata.email_dispatches.length}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ticket.metadata.email_dispatches.map((ed: any, idx: number) => {
                  const rawSender = String(
                    ed.from_name || ed.from_identity || senderIdentityLabel
                  )
                    .replace(/\s*<[^>]+>/g, "")
                    .trim();
                  const cleanSender = normalizeLegacySenderName(
                    rawSender,
                    senderIdentityLabel
                  );
                  const statusMeta = getEmailDispatchStatusMeta(ed.status, t);
                  const providerLabel = formatEmailProviderLabel(ed.provider);
                  const maskedTo = maskEmailsInText(ed.to_email || "");
                  return (
                    <UniversalCard
                      key={ed.id || idx}
                      layout="vertical"
                      statusColor={statusMeta.cardStatusColor}
                      icon={t("icon_mark_email_read", "mark_email_read")}
                      bannerTopLabel={statusMeta.label}
                      bannerTopRightLabel={providerLabel}
                      bannerBottomLabel={maskedTo || cleanSender}
                      title={
                        <span className="no-text-case font-mono">
                          {maskedTo || cleanSender || senderIdentityLabel}
                        </span>
                      }
                      subtitle={
                        ed.subject
                          ? `${ed.subject} • ${cleanSender}`
                          : cleanSender || senderIdentityLabel
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
                      onClick={() =>
                        setActiveDispatchThread({
                          threadId: ed.thread_id || null,
                          dispatchId: ed.id || null,
                          subject: ed.subject || ticket.title || undefined,
                        })
                      }
                      footer={
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                            {providerLabel}
                            {ed.sent_at ? ` • ${new Date(ed.sent_at).toLocaleDateString()}` : ""}
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
            </UniversalGroup>
          )}

        {effectiveCanReply &&
          !effectiveReadOnly &&
          !["resolved", "rejected"].includes(statusLower) && (
            <UniversalGroup
              title={t("dossier_add_reply", "Add Reply")}
              icon={t("icon_reply", "reply")}
              headerAction={
                (ticket.table_name || tableName) === "keeper_tickets" && sendEmailCopy ? (
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={
                        revealContactEmail
                          ? t("icon_visibility_off", "visibility_off")
                          : t("icon_visibility", "visibility")
                      }
                      tooltip={
                        revealContactEmail
                          ? t("keepers_email_mask_recipient", "Hide Recipient Email")
                          : t("keepers_email_reveal_recipient", "Reveal Recipient Email")
                      }
                      onClick={() => setRevealContactEmail((prev) => !prev)}
                    />
                  </PanelHeaderGroup>
                ) : undefined
              }
            >
              {(ticket.table_name || tableName) === "keeper_tickets" &&
                responseTemplates.length > 0 && (
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
                          setReplyText(chosen.body);
                        }
                      }}
                      options={responseTemplates.map((tpl) => ({
                        id: tpl.id,
                        label: `${tpl.name} (${tpl.category || t("keepers_email_tpl_default_cat", "Support")})`,
                      }))}
                    />
                  </div>
                )}

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
                      "Also Dispatch Official Email Reply"
                    )}
                    description={
                      <span className="font-mono">{senderIdentityLabel}</span>
                    }
                    icon={t("icon_outgoing_mail", "outgoing_mail")}
                    checked={sendEmailCopy}
                    onChange={setSendEmailCopy}
                  />
                  {sendEmailCopy && (
                    <UniversalInput
                      label={t("keeper_email_recipient_label", "Recipient Email Address")}
                      type={revealContactEmail ? "email" : "password"}
                      className="no-text-case"
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
                      : t("btn_send_reply", "Send Reply")
                }
              />
            </UniversalGroup>
          )}

        {isKeepersSpokeViewCopy && (
          <UniversalGroup
            title={t("dmca_spoke_view_copy_title", "Partner Spoke Relay Copy (Read-Only)")}
            icon={t("icon_visibility", "visibility")}
          >
            <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] flex items-start gap-2.5 text-xs no-text-case">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0 mt-0.5">
                {t("icon_info", "info")}
              </span>
              <span className="text-[11px] text-[var(--subtext)] leading-relaxed">
                {t(
                  "dmca_spoke_custody_note_body",
                  "Sanctuary Foundry is non-custodial over Partner Spoke catalogs. This record is a read-only Keepers Core audit copy to track the 48-hour statutory relay SLA before Partner Spoke gateway review."
                )}
              </span>
            </div>
          </UniversalGroup>
        )}

        {!effectiveReadOnly &&
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

    <EmailConversationSidePanel
      isOpen={Boolean(activeDispatchThread)}
      onClose={() => setActiveDispatchThread(null)}
      threadId={activeDispatchThread?.threadId}
      dispatchId={activeDispatchThread?.dispatchId}
      ticketId={ticket?.id || null}
      initialSubject={activeDispatchThread?.subject || ticket?.title || undefined}
      templates={responseTemplates}
      fromName={senderIdentityLabel}
      onThreadUpdated={() => onReplyAdded?.(ticket?.metadata)}
    />

    <SpokeTargetDossierSidePanel
      isOpen={Boolean(dossierTarget)}
      onClose={() => setDossierTarget(null)}
      item={dossierTarget?.item || null}
      spokeGame={dossierTarget?.spokeGame || null}
      preResolved={dossierTarget?.preResolved}
    />
  </>
  );
}
