import React, { useState } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { SidePanel, standardButtonClass, standardDangerButtonClass } from "../shared";
import { useStore } from '../store';

interface FlagContentSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetType: 'post' | 'comment' | 'broadcast';
  userId: string;
  backdropZ?: string;
  panelZ?: string;
}

export default function FlagContentSidePanel({ isOpen, onClose, targetId, targetType, userId, backdropZ, panelZ }: FlagContentSidePanelProps) {
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
      useStore.getState().pushStatus((t("flag_error")) + ": " + error.message);
    } else {
      useStore.getState().pushStatus(t("flag_success"));
      setReason("");
      onClose();
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("flag_title")}
      subtitle={t("flag_subtitle")}
      icon={t("icon_flag")}
      widthClass="w-[450px]"
      backdropZ={backdropZ || "z-[110005]"}
      panelZ={panelZ || "z-[110006]"}
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
          <button 
            type="button" 
            onClick={onClose} 
            className={standardButtonClass}
            disabled={isSubmitting}
          >
            {t("nav_cancel")}
          </button>
          <button 
            type="submit" 
            form="flag-form"
            disabled={!reason.trim() || isSubmitting} 
            className={standardDangerButtonClass}
          >
            {t("flag_submit")}
          </button>
        </div>
      }
    >
      <form id="flag-form" onSubmit={handleSubmit} className="p-8 flex flex-col h-full">
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
              {t("flag_reason")}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("flag_reason_placeholder")}
              className="w-full bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-4 text-xs text-[var(--text)] outline-none focus:theme-border-accent transition-all resize-none h-48 custom-scrollbar shadow-inner"
              required
            />
          </div>
        </div>

      </form>
    </SidePanel>
  );
}
