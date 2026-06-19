import React, { useState } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { SidePanel, standardButtonClass } from "./shared";
import { useStore } from './store';

interface FlagContentSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetType: 'post' | 'comment' | 'broadcast';
  userId: string;
}

export default function FlagContentSidePanel({ isOpen, onClose, targetId, targetType, userId }: FlagContentSidePanelProps) {
  const { t } = useLexicon();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    
    setIsSubmitting(true);
    const { error } = await supabase.from('content_flags').insert({
      content_type: targetType,
      content_id: targetId,
      reporter_id: userId,
      reason: reason.trim(),
      status: 'pending'
    });
    
    setIsSubmitting(false);

    if (error) {
      useStore.getState().pushStatus((t("feed_flag_error") || "Failed to flag content") + ": " + error.message);
    } else {
      useStore.getState().pushStatus(t("feed_flag_success") || "Content has been flagged for review.");
      setReason("");
      onClose();
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("feed_flag_title") || "FLAG CONTENT"}
      subtitle={t("feed_flag_subtitle") || "Report a violation to Sanctuary Architects"}
      icon={t("ui_icon_flag") || "flag"}
      widthClass="w-[450px]"
      panelZ="z-[60001]"
      backdropZ="z-[60000]"
    >
      <form onSubmit={handleSubmit} className="p-8 flex flex-col h-full">
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
              {t("feed_flag_reason_label") || "Reason for Flagging"}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("feed_flag_reason_placeholder") || "Please detail why this content violates protocols..."}
              className="w-full bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-4 text-xs text-[var(--text)] outline-none focus:theme-border-accent transition-all resize-none h-48 custom-scrollbar shadow-inner"
              required
            />
          </div>
        </div>

        <div className="mt-auto pt-6 flex gap-4">
          <button 
            type="button" 
            onClick={onClose} 
            className="flex-1 px-6 py-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
            disabled={isSubmitting}
          >
            {t("shared_cancel") || "CANCEL"}
          </button>
          <button 
            type="submit" 
            disabled={!reason.trim() || isSubmitting} 
            className={`flex-1 ${standardButtonClass}`}
          >
            {t("feed_flag_submit") || "SUBMIT REPORT"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
