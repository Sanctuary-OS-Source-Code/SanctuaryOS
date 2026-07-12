import { useStore } from "../store";
import React, { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import { SidePanel, standardAccentGlassButtonClass, standardSuccessButtonClass, standardDangerButtonClass, standardButtonClass, CustomDropdown, renderTextWithIcons } from "../shared";
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
  onEditMetadata
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
      supabase.from('profiles').select('username').eq('id', ticket.author_id).single().then(({data, error}) => {
        if (data) {
           setAuthorName(data.username || ticket.author_id.substring(0,8).toUpperCase());
        } else {
           supabase.from('masons').select("name").eq('id', ticket.author_id).single().then(({data: mData}) => {
               if (mData) setAuthorName(mData.name);
               else setAuthorName(ticket.author_id.substring(0,8).toUpperCase());
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
      useStore.getState().pushStatus(t("auto_failed_to_send_reply"), "error");
    }
  };

  if (!isOpen || !ticket) return null;

  return (
    <SidePanel 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t("dossier_subtitle")}
      icon="support_agent"
      footer={
        (!isReadOnly && onTakeAction && !['resolved', 'rejected'].includes(ticket.status?.toLowerCase() || '')) ? (
          <div className="flex justify-center items-center gap-4 w-full">
            <button 
              onClick={onClose}
              disabled={isSubmitting}
              className={standardButtonClass}
            >
              {t("shared_cancel")}
            </button>
            <button 
              onClick={() => onTakeAction(selectedAction as any, reason)}
              disabled={!selectedAction || !reason.trim() || isSubmitting}
              className={standardAccentGlassButtonClass}
            >
              {t("dossier_btn_save")}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-8">
        <h2 className="text-3xl font-black text-[var(--text)] leading-tight uppercase tracking-widest">
          {ticket.title}
        </h2>

        {ticket.metadata?.restricted_violations && ticket.metadata.restricted_violations.length > 0 && (
            <div className="bg-rose-500/10 border border-rose-500/30 p-5 rounded-2xl flex flex-col gap-3 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent pointer-events-none" />
                <div className="flex items-center gap-3 relative z-10">
                    <span className="material-symbols-outlined !text-[20px] text-rose-500">{t("icon_warning")}</span>
                    <span className="text-rose-400 font-black text-[10px] tracking-widest uppercase">{t("dossier_restricted_detected")}</span>
                </div>
                <div className="flex flex-wrap gap-2 relative z-10">
                    {ticket.metadata.restricted_violations.map((v: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-rose-200/90 text-[10px] font-mono bg-rose-500/10 py-1.5 px-3 rounded-md border border-rose-500/20">
                            <span className="material-symbols-outlined !text-[12px] opacity-70">{t("auto_extension")}</span>
                            <span>{v.replace(/[-_]/g, ' ')}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}
        
        <div className="flex flex-col gap-5 pb-8 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_person")}</span> {(t("dossier_author")).replace(/^[^\w]*/, '').trim()}
            </span>
            <span className="text-xs font-black text-[var(--text)] flex items-center gap-2">
              <span className="text-[10px] opacity-50 theme-text-accent font-mono truncate max-w-[100px]">{(ticket.author_username || authorName || "U").charAt(0).toUpperCase()}</span>
              {ticket.author_username || authorName}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_info")}</span> {(t("sys_log")).replace(/^[^\w]*/, '').trim()}
            </span>
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg border shadow-inner shrink-0 inline-block transition-colors
              ${ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : ''}
              ${ticket.status?.toLowerCase() === 'resolved' || ticket.status?.toLowerCase() === 'closed' || ticket.status?.toLowerCase() === 'rejected' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}
              ${ticket.status?.toLowerCase() === 'investigating' || ticket.status?.toLowerCase() === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : ''}
              ${ticket.status?.toLowerCase() === 'escalated' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20' : ''}
              ${!['open', 'new', 'resolved', 'closed', 'rejected', 'investigating', 'pending', 'escalated'].includes(ticket.status?.toLowerCase() || '') ? 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20' : ''}
            `}>
              {(ticket.status?.toLowerCase() === 'open' || ticket.status?.toLowerCase() === 'new') ? 'NEW' : ticket.status}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_label")}</span> {(t("registry_label_class")).replace(/^[^\w]*/, '').trim()}
            </span>
            <span className="text-xs font-bold text-[var(--text)] capitalize opacity-90">{(ticket.category || ticket.ticket_type || "general").replace('_', ' ')}</span>
          </div>

          {(ticket.target_mod_id || ticket.metadata?.target_mod_id) && (
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_extension")}</span> {t("support_target_mod_label")}
              </span>
              <div className="flex items-center gap-2">
                {onEditMetadata ? (
                  <button 
                    onClick={() => onEditMetadata(ticket.target_mod_id || ticket.metadata?.target_mod_id)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all active:scale-95 max-w-[250px] shrink-0"
                  >
                    <span className="text-[10px] font-mono font-bold truncate">{ticket.target_mod_name || fetchedTargetModName || ticket.target_mod_id || ticket.metadata?.target_mod_id}</span>
                    <span className="material-symbols-outlined !text-[14px] shrink-0">{t("icon_edit")}</span>
                  </button>
                ) : (
                  <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] max-w-[250px] shrink-0">
                    <span className="text-[10px] font-mono font-bold truncate opacity-80">{ticket.target_mod_name || fetchedTargetModName || ticket.target_mod_id || ticket.metadata?.target_mod_id}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_calendar_today")}</span> {(t("dossier_created_at")).replace(/^[^\w]*/, '').trim()}
            </span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80">
              {new Date(ticket.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_description")}</span> {t("upload_desc")}
          </label>
          <div className="w-full theme-glass-panel rounded-xl px-5 py-4 text-[var(--text)] text-sm border border-white/5 shadow-inner min-h-32 whitespace-pre-wrap leading-relaxed">
            {ticket.description}
          </div>
        </div>

          {ticket.metadata?.logs && ticket.metadata.logs !== "null" && ticket.metadata.logs.trim() !== "" && (
            <div className="flex flex-col gap-3 mt-4">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_terminal")}</span> {t("dossier_attached_logs")}
              </label>
              <TicketLogViewer logs={ticket.metadata.logs} />
            </div>
          )}

          {replies.length > 0 && (
          <div className="flex flex-col gap-4 mt-6">
            <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2 ml-2">
              <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_forum")}</span> {t("dossier_transmissions")}
            </label>
            {replies.map((r, idx) => (
              <div 
                key={idx} 
                className="relative group w-full rounded-[var(--radius)] overflow-hidden transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-lg"
              >
                <div className="absolute inset-0 theme-glass-panel opacity-100 group-hover:opacity-0 transition-opacity duration-500" />
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] via-transparent to-transparent opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
                
                <div className="relative p-5 flex flex-col gap-4 z-10">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[0.75rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                        <span className="text-[14px] font-black theme-text-accent">
                          {(r.author || "U").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-[var(--text)] uppercase tracking-widest group-hover:theme-text-accent transition-colors">
                          {r.author}
                        </span>
                        <span className="text-[9px] font-bold opacity-50 text-[var(--text)] uppercase tracking-wider">
                          {r.time ? new Date(r.time).toLocaleString() : t("date_unknown")}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-sm text-[var(--subtext)] leading-relaxed bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] p-4 rounded-xl border border-white/5">
                    {renderTextWithIcons(r.text)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {canReply && !isReadOnly && !['resolved', 'rejected'].includes(ticket.status?.toLowerCase() || '') && (
          <div className="flex flex-col gap-3 mt-6 theme-glass-panel p-5 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent)]" />
            <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("dossier_add_reply")}</label>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder={t("dossier_reply_placeholder")}
              className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] transition-all h-24 resize-none custom-scrollbar"
            />
            <div className="flex justify-end mt-2">
              <button 
                onClick={handleSendReply}
                disabled={isSubmitting || !replyText.trim()}
                className={standardAccentGlassButtonClass}
              >
                <span className="material-symbols-outlined !text-[14px]">{t("icon_send")}</span> {isSubmitting ? (t("btn_submitting")) : (t("dossier_btn_send_transmission"))}
              </button>
            </div>
          </div>
        )}

        {!isReadOnly && onTakeAction && !['resolved', 'rejected'].includes(ticket.status?.toLowerCase() || '') && (
          <div className="flex flex-col gap-6 mt-6">
            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_task_alt")}</span> {t("audit_action")} <span className="text-rose-500">*</span>
              </label>
              <div className="w-full relative z-50">
                <CustomDropdown 
                  disableTint={true}
                  value={selectedAction} 
                  onChange={(v: string[]) => setSelectedAction(v[0])} 
                  options={availableActions.map(action => ({
                    id: action,
                    label: t(`ticket_dossier_action_${action.toLowerCase()}`) || action
                  }))}
                  placeholder={t("dossier_select_action")}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined !text-[14px] opacity-70">{t("icon_gavel")}</span> {t("dossier_action_reason")} <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t("dossier_reason_placeholder")}
                className="w-full theme-glass-panel border-white/10 rounded-xl px-4 py-4 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] transition-all h-32 resize-none custom-scrollbar shadow-inner"
              />
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
