import { useStore } from "../store";
import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
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
import { UniversalInput, UniversalTextArea } from "../components/universal/UniversalLayout";
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
    const { error } = await supabase
      .from(targetTable)
      .update({ metadata: newMetadata })
      .eq("id", ticket.id);

    setIsSubmitting(false);
    if (!error) {
      setReplies(newMetadata.replies);
      setReplyText("");
      if (onReplyAdded) onReplyAdded(newMetadata);
      useStore.getState().pushStatus(t("support_success", "Reply sent"), "success");

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
                      style={{
                        color: "var(--danger)",
                        borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))",
                      }}
                    >
                      <span className="material-symbols-rounded !text-[12px] shrink-0">
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
                  <div
                    className="w-9 h-9 rounded-xl glass-surface border flex items-center justify-center shrink-0 text-[var(--accent)]"
                    style={{
                      borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
                    }}
                  >
                    <span className="material-symbols-rounded !text-[18px]">
                      {t("icon_back_hand", "back_hand")}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-[var(--subtext)]">
                    {t("ticket_claimed_by", "Claimed By")}
                  </span>
                </div>
                <span
                  className={VAULT_CHIP_CLASS}
                  style={{
                    color: "var(--accent)",
                    borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                  }}
                >
                  <span className="material-symbols-rounded !text-[12px] shrink-0">
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
                  <div
                    className="w-9 h-9 rounded-xl glass-surface border flex items-center justify-center shrink-0 text-[var(--accent)]"
                    style={{
                      borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
                    }}
                  >
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
                      <div
                        className="w-9 h-9 rounded-xl glass-surface flex items-center justify-center shrink-0 border text-[var(--accent)]"
                        style={{
                          borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
                        }}
                      >
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
              <ActionButton
                onClick={handleSendReply}
                disabled={!replyText.trim() || isSubmitting}
                className="w-full"
                icon={t("icon_send", "send")}
                variant="glass"
                label={
                  isSubmitting
                    ? t("btn_submitting", "Submitting...")
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
