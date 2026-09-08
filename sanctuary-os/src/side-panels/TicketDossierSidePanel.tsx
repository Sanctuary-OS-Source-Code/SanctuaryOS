import { useStore } from "../store";
import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import { SidePanel, ActionButton, standardAccentGlassButtonClass, standardSuccessButtonClass, standardDangerButtonClass, standardButtonClass, CustomDropdown, renderTextWithIcons, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";
import MarkdownRenderer from "../MarkdownRenderer";
import TicketLogViewer from "./TicketLogViewer";

interface TicketDossierProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: any | null;
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
      supabase.from('profiles').select('username').eq('id', ticket.author_id).maybeSingle().then(({ data, error }) => {
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

    const { error } = await supabase.from('sanctuary_tickets').update({ metadata: newMetadata }).eq('id', ticket.id);

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
          {(!isReadOnly && onTakeAction && !['resolved', 'rejected'].includes(ticket.status?.toLowerCase() || '')) && (
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
      <div className="flex flex-col gap-8 pb-48">
        <h2 className="text-4xl font-black text-[var(--text)] leading-tight capitalize tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-white via-white/80 to-white/40 drop-shadow-md">
          {ticket.title}
        </h2>

        {ticket.metadata?.restricted_violations && ticket.metadata.restricted_violations.length > 0 && (
          <div className="bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] p-5 rounded-2xl flex flex-col gap-3 relative group shadow-[0_0_20px_rgba(var(--danger-rgb),0.15)]">
            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-rose-500/10 to-transparent pointer-events-none" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center animate-pulse shrink-0">
                <span className="material-symbols-outlined !text-[18px] text-rose-500">{t("icon_warning")}</span>
              </div>
              <span className="text-rose-400 font-black text-[10px] tracking-widest capitalize">{t("dossier_restricted_detected")}</span>
            </div>
            <div className="flex flex-wrap gap-2 relative z-10 pl-11">
              {ticket.metadata.restricted_violations.map((v: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-rose-200/90 text-[10px] font-mono bg-rose-500/10 py-1.5 px-3 rounded-md border border-rose-500/20 shadow-inner">
                  <span className="material-symbols-outlined !text-[12px] opacity-70">{t("auto_extension")}</span>
                  <span>{v.replace(/[-_]/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 w-full">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("icon_receipt_long")}</span>
            <span className="text-[12px] font-black capitalize tracking-widest text-[var(--text)]">{t("dossier_ticket_details")}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Author */}
            <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                <span className="text-[14px] font-black theme-text-accent">{(ticket.author_username || authorName || "U").charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest mb-0.5">{(t("dossier_author")).replace(/^[^\w]*/, '').trim()}</span>
                <span className="text-xs font-bold text-[var(--text)] group-hover:theme-text-accent transition-colors">{ticket.author_username || authorName}</span>
              </div>
            </div>

            {/* Status */}
            <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[18px] opacity-70 group-hover:text-[var(--accent)] transition-colors">{t("icon_info")}</span>
              </div>
              <div className="flex flex-col flex-1 items-start">
                <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest mb-0.5">{(t("status")).replace(/^[^\w]*/, '').trim()}</span>
                <div className="flex items-center gap-2">
                  {(ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                  )}
                  {(ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                  )}
                  {(ticket.status?.toLowerCase() === 'escalated') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse shadow-[0_0_8px_rgba(217,70,239,0.8)]" />
                  )}
                  <span className={`text-xs font-bold uppercase tracking-widest transition-colors
                            ${ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new' ? 'text-rose-400' : ''}
                            ${ticket.status?.toLowerCase() === 'resolved' || ticket.status?.toLowerCase() === 'closed' || ticket.status?.toLowerCase() === 'rejected' ? 'text-emerald-400' : ''}
                            ${ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'text-amber-400' : ''}
                            ${ticket.status?.toLowerCase() === 'escalated' ? 'text-fuchsia-400' : ''}
                            ${!['open', 'new', 'resolved', 'closed', 'rejected', 'investigating', 'pending', 'escalated'].includes(ticket.status?.toLowerCase() || '') ? 'text-[var(--accent)]' : ''}
                          `}>
                    {(ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new') ? 'NEW' : ticket.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Category */}
            <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[18px] opacity-70 group-hover:text-[var(--accent)] transition-colors">{t("icon_label")}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest mb-0.5">{(t("category")).replace(/^[^\w]*/, '').trim()}</span>
                <span className="text-xs font-bold text-[var(--text)] capitalize opacity-90 group-hover:theme-text-accent transition-colors">{(ticket.category || ticket.ticket_type || "general").replace('_', ' ')}</span>
              </div>
            </div>

            {/* Created At */}
            <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
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
              <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md flex items-center gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
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
              <div className="md:col-span-2 glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 relative group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
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
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] transition-all active:scale-95 shrink-0"
                  >
                    <span className="text-[10px] font-black tracking-widest uppercase">{t("btn_edit") || "Edit"}</span>
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_edit")}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] drop-shadow-md">{t("icon_description")}</span> {t("upload_desc")}
          </label>
          <div className="w-full glass-surface rounded-2xl px-6 py-5 text-[var(--text)] text-sm border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[inset_0_5px_20px_rgba(0,0,0,0.3)] min-h-32 whitespace-pre-wrap leading-relaxed relative overflow-hidden backdrop-blur-xl">
            {ticket.description}
          </div>
        </div>

        {ticket.metadata?.logs && ticket.metadata.logs !== "null" && ticket.metadata.logs.trim() !== "" && (
          <div className="flex flex-col gap-3 mt-4">
            <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_terminal")}</span> {t("dossier_attached_logs")}
            </label>
            <TicketLogViewer logs={ticket.metadata.logs} />
          </div>
        )}

        {replies.length > 0 && (
          <div className="flex flex-col gap-4 mt-8">
            <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-2 mb-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-2">
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_forum")}</span> {t("dossier_transmissions")}
            </label>
            {replies.map((r, idx) => (
              <div
                key={idx}
                className="relative group w-full rounded-2xl overflow-hidden transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-lg bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] hover:-translate-y-0.5"
              >
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="relative p-5 flex flex-col gap-4 z-10">
                  <div className="flex justify-start items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[0.75rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-black/40 group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                        <span className="text-[14px] font-black theme-text-accent drop-shadow-md">
                          {(r.author || "U").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-[var(--text)] capitalize tracking-widest group-hover:theme-text-accent transition-colors drop-shadow-sm">
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
          </div>
        )}

        {canReply && !isReadOnly && !['resolved', 'rejected'].includes(ticket.status?.toLowerCase() || '') && (
          <div className="flex flex-col gap-3 mt-8">
            <label className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("dossier_add_reply")}</label>
            <div className="flex flex-col gap-3 relative glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-xl group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors">
              <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-t from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={t("dossier_reply_placeholder")}
                className="w-full glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] focus:shadow-[inset_0_2px_15px_rgba(0,0,0,0.2),0_0_20px_rgba(var(--accent-rgb),0.15)] transition-all h-32 resize-none custom-scrollbar border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[inset_0_2px_15px_rgba(0,0,0,0.15)] relative z-10"
              />
              <ActionButton
                onClick={handleSendReply}
                disabled={!replyText.trim() || isSubmitting}
                className="self-end relative z-10 mt-2"
                icon="send"
                variant="accent"
                label={isSubmitting ? (t("btn_submitting")) : (t("dossier_btn_send_transmission"))}
              />
            </div>
          </div>
        )}

        {(!isReadOnly && onTakeAction && !['resolved', 'rejected'].includes(ticket.status?.toLowerCase() || '')) && (
          <div className="flex flex-col gap-5 mt-10 p-6 glass-panel rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border-2 border-[color-mix(in_srgb,var(--danger)_30%,transparent)] relative group overflow-hidden bg-[color-mix(in_srgb,var(--bg)_80%,transparent)]">
            <div className="absolute inset-0 rounded-[inherit] bg-[url('/assets/noise.png')] opacity-20 pointer-events-none mix-blend-overlay" />
            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-rose-500/10 via-transparent to-rose-500/5 pointer-events-none" />

            <div className="flex items-center gap-3 relative z-10 border-b border-[color-mix(in_srgb,var(--danger)_20%,transparent)] pb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                <span className="material-symbols-outlined !text-[20px] text-rose-500">admin_panel_settings</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-black capitalize tracking-widest text-rose-500 drop-shadow-sm">{t("admin_actions")}</span>
                <span className="text-[9px] font-bold text-rose-200/70 tracking-widest uppercase mt-0.5">Elevated Clearance Required</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-10 pt-2">
              <div className="flex flex-col gap-2 relative">
                <label className="text-[10px] font-black text-rose-300/80 capitalize tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_gavel")}</span> {t("dossier_action_reason")} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={t("dossier_reason_placeholder")}
                  className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-rose-500/50 focus:shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all border border-rose-500/20 shadow-inner bg-black/40"
                />
              </div>

              <div className="flex flex-col gap-2 relative z-[70]">
                <label className="text-[10px] font-black text-rose-300/80 capitalize tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[14px] opacity-70">task_alt</span> {t("action")} <span className="text-rose-500">*</span>
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
          </div>
        )}
      </div>
    </SidePanel>
  );
}
