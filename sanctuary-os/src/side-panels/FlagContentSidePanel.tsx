import React, { useState } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";
import { useStore } from "../store";

interface FlagContentSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetType: "post" | "comment" | "broadcast";
  userId: string;
  backdropZ?: string;
  panelZ?: string;
}

export default function FlagContentSidePanel({
  isOpen,
  onClose,
  targetId,
  targetType,
  userId,
  backdropZ,
  panelZ,
}: FlagContentSidePanelProps) {
  const { t } = useLexicon();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!reason.trim()) return;

    setIsSubmitting(true);
    const { error } = await supabase.from("content_flags").insert({
      content_type: targetType,
      content_id: targetId,
      reporter_id: userId,
      reason: reason.trim(),
      status: "pending",
    });

    setIsSubmitting(false);

    if (error) {
      useStore
        .getState()
        .pushStatus(`${t("flag_error", "Failed to submit flag")}: ${error.message}`);
    } else {
      useStore.getState().pushStatus(t("flag_success", "Report submitted"));
      setReason("");
      onClose();
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("flag_title", "Flag Content")}
      subtitle={t("flag_subtitle", "Report policy violations for review")}
      icon={t("icon_flag", "flag")}
      iconColorClass="text-[var(--danger)]"
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ={backdropZ || "z-[110005]"}
      panelZ={panelZ || "z-[110006]"}
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_flag", "flag")}
            tooltip={t("flag_submit", "Submit Flag")}
            variant="danger"
            disabled={!reason.trim() || isSubmitting}
            onClick={() => handleSubmit()}
          />
        </PanelHeaderGroup>
      }
    >
      <form
        id="flag-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8"
      >
        <SidePanelHeroCard
          icon={t("icon_flag", "flag")}
          overline={t("action_required", "Content Moderation")}
          title={t("flag_title", "Flag Content")}
          description={t(
            "flag_subtitle",
            "Provide context on why this content violates community standards."
          )}
          badge={targetType.toUpperCase()}
          badgeIcon={t("icon_warning", "warning")}
          variant="danger"
        >
          <div className="grid grid-cols-2 gap-3 pt-1">
            <StatBox
              label={t("target_asset", "Target ID")}
              value={targetId ? targetId.substring(0, 8) : t("unknown", "Unknown")}
              icon={t("icon_target", "target")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("asset_type", "Content Type")}
              value={targetType}
              icon={t("icon_category", "category")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={t("flag_reason", "Reason for Report")}
          icon={t("icon_description", "description")}
        >
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t(
              "flag_reason_placeholder",
              "Describe the issue or violation..."
            )}
            className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all resize-none h-44 custom-scrollbar"
            required
          />
        </UniversalGroup>
      </form>
    </SidePanel>
  );
}
