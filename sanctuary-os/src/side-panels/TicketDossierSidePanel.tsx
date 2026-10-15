import { useStore } from "../store";
import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import { SidePanel, ActionButton, CustomDropdown, renderTextWithIcons, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { UniversalGroup, SidePanelTitleInput, UniversalInput, UniversalTextArea } from "../components/universal/UniversalLayout";
import MarkdownRenderer from "../MarkdownRenderer";
import TicketLogViewer from "./TicketLogViewer";

interface TicketDossierProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: any | null;
  tableName?: string;
  onTakeAction?: (actionType: "RESOLVED" | "REJECTED" | "ESCALATED" | "PENDING", reason: string) => void;
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
  currentUserId
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

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetModId);

    const fetchName = async () => {
      try {
        if (isUUID) {
          const { data } = await supabase.from('mods').select("name").eq('id', targetModId).single();
          if (data) setFetchedTargetModName(data.name);
        } else {
          const { data: verData } = await supabase.from('mod_versions').select("mod_id").eq('dna_hash', targetModId).maybeSingle();
          if (verData?.mod_id) {
            const { data: modData } = await supabase.from('mods').select("name").eq('id', verData.mod_id).single();
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
      supabase.from('profiles').select('username').eq('id', ticket.author_id).maybeSingle().then(({ data }) => {
        if (data) {
          setAuthorName(data.username || ticket.author_id?.substring(0, 8).toUpperCase() || 'SYSTEM');
        } else {
          supabase.from('masons').select("name").eq('id', ticket.author_id).single().then(({ data: mData }) => {
            if (mData) setAuthorName(mData.name);
            else setAuthorName(ticket.author_id?.substring(0, 8).toUpperCase() || 'SYSTEM');
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

    const { data: { user } } = await supabase.auth.getUser();
    let authorName = "Support Team";
    if (user) {
      authorName = user.user_metadata?.mason_name || user.user_metadata?.username || user.email?.split('@')[0] || "Support Team";
    }

    const newReply = {
      id: crypto.randomUUID(),
      author: authorName,
      text: replyText,
      time: new Date().toISOString()
    };

    const newMetadata = {
      ...(ticket.metadata || {}),
      replies: [...replies, newReply]
    };

    const targetTable = ticket.table_name || tableName || 'sanctuary_tickets';
    const { error } = await supabase.from(targetTable).update({ metadata: newMetadata }).eq('id', ticket.id);

    setIsSubmitting(false);
    if (!error) {
      setReplies(newMetadata.replies);
      setReplyText("");
      if (onReplyAdded) onReplyAdded(newMetadata);
      useStore.getState().pushStatus(t("support_success"), "success");

      if (ticket.author_id && user && ticket.author_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: ticket.author_id,
          title: "New Ticket Reply",
          message: `${authorName} replied to your ticket: ${ticket.title}`,
          type: "support_reply",
          reference_id: ticket.id
        });
      }
    } else {
      useStore.getState().pushStatus(t("auto_failed_to_send_25"), "error");
    }
  };

  if (!isOpen || !ticket) return null;

  const statusLower = ticket.status?.toLowerCase() || 'new';
  const isNew = statusLower === 'open' || statusLower === 'new';
  const isClosed = statusLower === 'resolved' || statusLower === 'closed' || statusLower === 'rejected';
  const isPending = statusLower === 'investigating' || statusLower === 'pending';
  const isEscalated = statusLower === 'escalated';

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("dossier_subtitle")}
      icon="support_agent"
      widthClass="w-[90vw] md:w-[550px] xl:w-[650px]"
      headerActions={
        <PanelHeaderGroup>
          {onClaim && !ticket.metadata?.claimed_by && (
            <PanelHeaderButton
              icon="back_hand"
              tooltip={t("ticket_claim") || "Claim Ticket"}
              variant="accent"
              onClick={onClaim}
            />
          )}
          {onRelease && ticket.metadata?.claimed_by === currentUserId && (
            <PanelHeaderButton
              icon="waving_hand"
              tooltip={t("ticket_release") || "Release Ticket"}
              variant="danger"
              onClick={onRelease}
            />
          )}
          {(!isReadOnly && onTakeAction && !['resolved', 'rejected'].includes(statusLower)) && (
            <PanelHeaderButton
              icon="save"
              tooltip={t("dossier_btn_save") || "Save Action"}
              variant="success"
              onClick={() => onTakeAction(selectedAction as any, reason)}
              disabled={!selectedAction || !reason.trim() || isSubmitting}
            />
          )}
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-6 pb-20">
        <SidePanelTitleInput
          value={ticket.title || ""}
          readOnly
          subtitle={`${t("oversight_report_id") || "ID"}: ${ticket.id.substring(0, 8)}`}
        />

        {ticket.metadata?.restricted_violations && ticket.metadata.restricted_violations.length > 0 && (
          <div className="bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] p-5 rounded-2xl flex flex-col gap-3 relative group">
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center justify-center animate-pulse shrink-0">
                <span className="material-symbols-outlined !text-[18px] text-[var(--danger)]">{t("icon_warning")}</span>
              </div>
              <span className="text-[var(--danger)] font-black text-[10px] tracking-widest capitalize">{t("dossier_restricted_detected")}</span>
            </div>
            <div className="flex flex-wrap gap-2 relative z-10 pl-11">
              {ticket.metadata.restricted_violations.map((v: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[var(--danger)] text-[10px] font-mono bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] py-1.5 px-3 rounded-md border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-inner">
                  <span className="material-symbols-outlined !text-[12px] opacity-70">{t("auto_extension")}</span>
                  <span>{v.replace(/[-_]/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <UniversalGroup title={t("dossier_ticket_details")} icon={t("icon_receipt_long")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Author */}
            <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                <span className="text-[14px] font-black theme-text-accent">{(ticket.author_username || authorName || "U").charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest mb-0.5">{(t("dossier_author")).replace(/^[^\w]*/, '').trim()}</span>
                <span className="text-xs font-bold text-[var(--text)] group-hover:theme-text-accent transition-colors">{ticket.author_username || authorName}</span>
              </div>
            </div>

            {/* Status */}
            <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[18px] opacity-70 group-hover:text-[var(--accent)] transition-colors">{t("icon_info")}</span>
              </div>
              <div className="flex flex-col flex-1 items-start">
                <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest mb-0.5">{(t("status")).replace(/^[^\w]*/, '').trim()}</span>
                <div className="flex items-center gap-2">
                  {isNew && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] animate-pulse" />
                  )}
                  {isPending && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse" />
                  )}
                  {isEscalated && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  )}
                  <span className={`text-xs font-bold uppercase tracking-widest transition-colors
                    ${isNew ? 'text-[var(--danger)]' : ''}
                    ${isClosed ? 'text-[var(--success)]' : ''}
                    ${isPending ? 'text-[var(--warning)]' : ''}
                    ${isEscalated ? 'text-[var(--accent)]' : ''}
                    ${!isNew && !isClosed && !isPending && !isEscalated ? 'text-[var(--accent)]' : ''}
                  `}>
                    {isNew ? (t("ui_tab_new") || 'NEW') : ticket.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Category */}
            <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[18px] opacity-70 group-hover:text-[var(--accent)] transition-colors">{t("icon_label")}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest mb-0.5">{(t("category")).replace(/^[^\w]*/, '').trim()}</span>
                <span className="text-xs font-bold text-[var(--text)] capitalize opacity-90 group-hover:theme-text-accent transition-colors">{(ticket.category || ticket.ticket_type || "general").replace('_', ' ')}</span>
              </div>
            </div>

            {/* Created At */}
            <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[18px] opacity-70 group-hover:text-[var(--accent)] transition-colors">{t("icon_calendar_today")}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest mb-0.5">{(t("dossier_created_at")).replace(/^[^\w]*/, '').trim()}</span>
                <span className="text-xs font-bold text-[var(--subtext)] opacity-80 group-hover:theme-text-accent transition-colors">{new Date(ticket.created_at).toLocaleString()}</span>
              </div>
            </div>

            {/* Claimed By */}
            {ticket.metadata?.claimed_by && (
              <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
                <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[18px] opacity-70 group-hover:text-[var(--accent)] transition-colors">back_hand</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest mb-0.5">{t("ticket_claimed_by") || "Claimed By"}</span>
                  <span className="text-xs font-bold text-[var(--text)] capitalize opacity-90 group-hover:theme-text-accent transition-colors">{ticket.metadata.claimed_by === currentUserId ? (t("you") || "You") : (t("another_agent") || "Another Agent")}</span>
                </div>
              </div>
            )}

            {/* Target Artifact (Full width) */}
            {(ticket.target_mod_id || ticket.metadata?.target_mod_id) && (
              <div className="md:col-span-2 glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col md:flex-row md:items-center justify-between gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0 group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-colors">
                    <span className="material-symbols-outlined !text-[18px] opacity-70 group-hover:text-[var(--accent)] transition-colors">{t("icon_extension")}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest mb-0.5">{t("target_artifact")}</span>
                    <span className="text-xs font-mono font-bold text-[var(--text)] group-hover:theme-text-accent transition-colors truncate max-w-[250px]">{ticket.target_mod_name || fetchedTargetModName || ticket.target_mod_id || ticket.metadata?.target_mod_id}</span>
                  </div>
                </div>
                {onEditMetadata && (
                  <button
                    onClick={() => onEditMetadata(ticket.target_mod_id || ticket.metadata?.target_mod_id)}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all active:scale-95 shrink-0"
                  >
                    <span className="text-[10px] font-black tracking-widest uppercase">{t("btn_edit") || "Edit"}</span>
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_edit")}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </UniversalGroup>

        <UniversalGroup title={t("upload_desc")} icon={t("icon_description")}>
          <div className="w-full glass-surface rounded-2xl px-6 py-5 text-[var(--text)] text-sm border border-[color-mix(in_srgb,var(--text)_10%,transparent)] min-h-32 whitespace-pre-wrap leading-relaxed relative overflow-hidden">
            {ticket.description}
          </div>
        </UniversalGroup>

        {ticket.metadata?.logs && ticket.metadata.logs !== "null" && ticket.metadata.logs.trim() !== "" && (
          <UniversalGroup title={t("dossier_attached_logs")} icon={t("icon_terminal")}>
            <TicketLogViewer logs={ticket.metadata.logs} />
          </UniversalGroup>
        )}

        {replies.length > 0 && (
          <UniversalGroup title={t("dossier_transmissions")} icon={t("icon_forum")}>
            {replies.map((r, idx) => (
              <div
                key={idx}
                className="relative group w-full rounded-2xl overflow-hidden transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] glass-surface"
              >
                <div className="relative p-5 flex flex-col gap-4 z-10">
                  <div className="flex justify-start items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[0.75rem] flex items-center justify-center shrink-0 border transition-all duration-500 border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                        <span className="text-[14px] font-black theme-text-accent">
                          {(r.author || "U").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-[var(--text)] capitalize tracking-widest group-hover:theme-text-accent transition-colors">
                          {r.author}
                        </span>
                        <span className="text-[9px] font-bold opacity-50 text-[var(--text)] capitalize tracking-widest mt-0.5">
                          {r.time ? new Date(r.time).toLocaleString() : t("date_unknown")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-[var(--subtext)] leading-relaxed p-2 font-medium break-words whitespace-pre-wrap">
                    {renderTextWithIcons(r.text)}
                  </div>
                </div>
              </div>
            ))}
          </UniversalGroup>
        )}

        {canReply && !isReadOnly && !['resolved', 'rejected'].includes(statusLower) && (
          <UniversalGroup title={t("dossier_add_reply")} icon="reply">
            <UniversalTextArea
              value={replyText}
              onChange={setReplyText}
              placeholder={t("dossier_reply_placeholder")}
            />
            <ActionButton
              onClick={handleSendReply}
              disabled={!replyText.trim() || isSubmitting}
              className="self-end mt-2"
              icon="send"
              variant="accent"
              label={isSubmitting ? (t("btn_submitting")) : (t("dossier_btn_send_transmission"))}
            />
          </UniversalGroup>
        )}

        {(!isReadOnly && onTakeAction && !['resolved', 'rejected'].includes(statusLower)) && (
          <UniversalGroup title={t("admin_actions")} icon="admin_panel_settings" headerColorClass="text-[var(--danger)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-10">
              <div className="flex flex-col gap-2 relative">
                <UniversalInput
                  label={`${t("dossier_action_reason")} *`}
                  value={reason}
                  onChange={setReason}
                  placeholder={t("dossier_reason_placeholder")}
                />
              </div>

              <div className="flex flex-col gap-2 relative z-[70]">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                  {t("action")} *
                </label>
                <CustomDropdown disableTint={true}
                  value={selectedAction}
                  options={availableActions.map(action => ({
                    id: action,
                    label: t(`ticket_dossier_action_${action.toLowerCase()}`) || action
                  }))}
                  onChange={(v: string[]) => setSelectedAction(v[0])}
                  placeholder={t("dossier_select_action")}
                />
              </div>
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
