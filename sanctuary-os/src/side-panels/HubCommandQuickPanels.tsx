import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase, supabaseAuth } from "../supabase";
import { useStore } from "../store";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  ActionButton,
  CustomDropdown,
  CustomComplianceDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
} from "../shared";
import {
  UniversalInput,
  UniversalTextArea,
  SidePanelPillToggle,
} from "../components/universal/UniversalLayout";

/* ============================================================================
 * 1. ARCHITECT SCANNER (SCOUT CONSENSUS) QUICK SIDE PANEL
 * ============================================================================ */
export function CommandScoutReviewSidePanel({
  isOpen,
  onClose,
  scoutItem,
  onCompleted,
  onOpenFullQueue,
}: {
  isOpen: boolean;
  onClose: () => void;
  scoutItem: any | null;
  onCompleted: () => void;
  onOpenFullQueue?: () => void;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [version, setVersion] = useState("");
  const [subType, setSubType] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [complianceTier, setComplianceTier] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const defaultRoleLabel =
    activeGameSchema?.module_roles?.[0]?.label ||
    activeGameSchema?.module_roles?.[0]?.id ||
    t("artifact", "{Mod}");

  useEffect(() => {
    if (!scoutItem) return;
    setName(
      String(scoutItem.suggested_name || "")
        .replace(/_/g, " ")
        .trim()
    );
    setAuthor(String(scoutItem.suggested_author || "").trim());
    setVersion(String(scoutItem.suggested_version || "1.0.0").trim());
    setSubType(String(scoutItem.suggested_sub_type || scoutItem.suggested_type || "").trim());
    setUrl(String(scoutItem.suggested_url || "").trim());
    setDescription(String(scoutItem.description || "").trim());
    setComplianceTier(Math.min(4, Math.max(0, Number(scoutItem.compliance_tier || 0))));
  }, [scoutItem]);

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (!scoutItem) return;
    setIsProcessing(true);
    try {
      if (decision === "approved") {
        let resolvedMasonId: string | null = null;
        if (author) {
          const { data: masonMatch } = await supabase
            .from("masons")
            .select("id")
            .ilike("name", author)
            .maybeSingle();
          if (masonMatch?.id) resolvedMasonId = masonMatch.id;
        }

        const targetTier = Math.min(4, Math.max(0, Number(complianceTier || 0)));
        const targetStatus = targetTier >= 1 ? "pending" : "verified";

        const { data: modData, error: insErr } = await supabase
          .from("mods")
          .insert({
            name: name || scoutItem.dna_hash,
            master_author: author || null,
            mason_id: resolvedMasonId,
            category_override: scoutItem.suggested_type || defaultRoleLabel,
            sub_type: subType || null,
            latest_version: version || "1.0.0",
            url: url || null,
            description: description || null,
            compliance_tier: targetTier,
            status: targetStatus,
            ...(targetTier >= 1
              ? {
                status_reason: `[ARCHITECT SCOUT QUEUE] Flagged Tier ${targetTier} for Oversight Compliance review`,
              }
              : {}),
          })
          .select()
          .single();

        if (insErr) throw insErr;

        if (modData?.id && scoutItem.dna_hash) {
          await supabase.from("mod_versions").upsert(
            {
              mod_id: modData.id,
              dna_hash: scoutItem.dna_hash,
              version_label: version || "1.0.0",
            },
            { onConflict: "dna_hash" }
          );
        }

        if (scoutItem.dna_hash) {
          await supabase
            .from("scout_suggestions")
            .update({ status: "approved" })
            .eq("dna_hash", scoutItem.dna_hash)
            .eq("status", "pending");
        } else {
          await supabase
            .from("scout_suggestions")
            .update({ status: "approved" })
            .eq("id", scoutItem.id);
        }

        await logArchitectAction(
          targetTier >= 1 ? "Flagged Scout Submission for Oversight Compliance" : "Approved Scout Submission",
          "scout_suggestions",
          name || scoutItem.dna_hash || scoutItem.id,
          targetTier >= 1 ? `Flagged Tier ${targetTier} (Pending)` : undefined,
          "Architect Console",
          false,
          computeAuditDiff(null, { name, latest_version: version, compliance_tier: targetTier, status: targetStatus })
        );
        useStore
          .getState()
          .pushStatus(
            targetTier >= 1
              ? t(
                "nexus_mod_flagged_compliance_toast",
                "{Mod} flagged for Oversight Compliance review (Pending)."
              )
              : t("scout_approved_toast", "Scanner submission approved."),
            targetTier >= 1 ? "warning" : "success"
          );
      } else {
        if (scoutItem.dna_hash) {
          await supabase
            .from("scout_suggestions")
            .update({ status: "rejected" })
            .eq("dna_hash", scoutItem.dna_hash)
            .eq("status", "pending");
        } else {
          await supabase
            .from("scout_suggestions")
            .update({ status: "rejected" })
            .eq("id", scoutItem.id);
        }
        await logArchitectAction(
          "Rejected Scout Submission",
          "scout_suggestions",
          name || scoutItem.dna_hash || scoutItem.id,
          undefined,
          "Architect Console",
          false
        );
        useStore
          .getState()
          .pushStatus(t("scout_rejected_toast", "Scanner submission rejected."), "info");
      }

      onCompleted();
      onClose();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          `${t("err_save_failed", "Save failed:")} ${err?.message || String(err)}`,
          "error"
        );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen && Boolean(scoutItem)}
      onClose={onClose}
      title={t("scout_queue", "Scout Queue")}
      subtitle={t("scout_consensus_dossier", "Consensus Telemetry Review")}
      icon={t("icon_radar", "radar")}
      widthClass="w-[90vw] md:w-[580px]"
      headerActions={
        onOpenFullQueue ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_open_in_new", "open_in_new")}
              tooltip={t("open_scout_queue", "Open Full Scout Queue")}
              onClick={() => {
                onClose();
                onOpenFullQueue();
              }}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <ActionButton
            variant="danger"
            icon={t("icon_close", "close")}
            label={t("reject", "Reject")}
            disabled={isProcessing}
            onClick={() => handleDecision("rejected")}
          />
          <ActionButton
            variant={complianceTier >= 1 ? "warning" : "primary"}
            icon={complianceTier >= 1 ? t("icon_policy", "policy") : t("icon_verified", "verified")}
            label={
              complianceTier >= 1
                ? t("submit_compliance_flag_btn", "Submit to Oversight Compliance")
                : t("approve", "Approve")
            }
            disabled={isProcessing || !name.trim()}
            onClick={() => handleDecision("approved")}
          />
        </div>
      }
    >
      {scoutItem && (
        <div className="space-y-4 mt-2 pb-6">
          <SidePanelHeroCard
            icon={t("icon_radar", "radar")}
            overline={author || t("unknown_author", "Unknown Author")}
            title={name || scoutItem.dna_hash || t("unknown", "Unknown")}
            description={t("scout_consensus_dossier", "Consensus Telemetry Review")}
            badge={`${scoutItem.submission_count || 1} ${t("submissions", "Submissions")}`}
            badgeIcon={t("icon_groups", "groups")}
          >
            {scoutItem.dna_hash && (
              <div className="pt-1 flex flex-wrap gap-1.5">
                <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_fingerprint", "fingerprint")}
                  </span>
                  <span>{String(scoutItem.dna_hash).substring(0, 20)}...</span>
                </span>
              </div>
            )}
          </SidePanelHeroCard>

          <UniversalGroup title={t("consensus_metadata", "Consensus Metadata")} icon={t("icon_tune", "tune")}>
            <div className="space-y-3">
              <UniversalInput
                label={t("name", "Name")}
                value={name}
                onChange={(val) => setName(val)}
              />
              <div className="grid grid-cols-2 gap-3">
                <UniversalInput
                  label={t("author", "Author")}
                  value={author}
                  onChange={(val) => setAuthor(val)}
                />
                <UniversalInput
                  label={t("version", "Version")}
                  value={version}
                  onChange={(val) => setVersion(val)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <UniversalInput
                  label={t("category", "Category")}
                  value={subType}
                  onChange={(val) => setSubType(val)}
                />
                <UniversalInput
                  label={t("source_url", "Source URL")}
                  value={url}
                  onChange={(val) => setUrl(val)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("compliance_tier", "Compliance Tier")}
                </label>
                <CustomComplianceDropdown
                  value={complianceTier}
                  onChange={(val) => setComplianceTier(val)}
                  maxTier={4}
                />
              </div>
              <UniversalTextArea
                label={t("description", "Description")}
                value={description}
                rows={3}
                onChange={(val) => setDescription(val)}
              />
            </div>
          </UniversalGroup>
        </div>
      )}
    </SidePanel>
  );
}

/* ============================================================================
 * 2. ARCHITECT {MASON} SUBMISSION QUICK SIDE PANEL
 * ============================================================================ */
export function CommandMasonSubmissionSidePanel({
  isOpen,
  onClose,
  submission,
  onCompleted,
  onOpenMetadataEditor,
  onOpenFullQueue,
}: {
  isOpen: boolean;
  onClose: () => void;
  submission: any | null;
  onCompleted: () => void;
  onOpenMetadataEditor?: (modId: string) => void;
  onOpenFullQueue?: () => void;
}) {
  const { t } = useLexicon();
  const [rejectReason, setRejectReason] = useState("");
  const [complianceTier, setComplianceTier] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setRejectReason("");
    setComplianceTier(Math.min(4, Math.max(0, Number(submission?.compliance_tier || 0))));
  }, [submission]);

  const handleApprove = async () => {
    if (!submission) return;
    setIsProcessing(true);
    try {
      const targetTier = Math.min(4, Math.max(0, Number(complianceTier || 0)));
      const targetStatus = targetTier >= 1 ? "pending" : "verified";
      const updatePayload: any = {
        compliance_tier: targetTier,
        status: targetStatus,
        ...(targetTier >= 1
          ? {
            status_reason: `[ARCHITECT MASON QUEUE] Flagged Tier ${targetTier} for Oversight Compliance review${rejectReason.trim() ? `: ${rejectReason.trim()}` : ""
              }`,
          }
          : {}),
      };
      const { error } = await supabase
        .from("mods")
        .update(updatePayload)
        .eq("id", submission.id);
      if (error) throw error;

      await logArchitectAction(
        targetTier >= 1 ? "Flagged Mod for Oversight Compliance" : "Updated Mod Metadata",
        "mods",
        submission.name || submission.id,
        targetTier >= 1 ? `Flagged Tier ${targetTier} (Pending)` : undefined,
        "Architect Console",
        false,
        computeAuditDiff(submission, { ...submission, ...updatePayload })
      );
      useStore
        .getState()
        .pushStatus(
          targetTier >= 1
            ? t(
              "nexus_mod_flagged_compliance_toast",
              "{Mod} flagged for Oversight Compliance review (Pending)."
            )
            : t("mason_sub_approved_toast", "{Mason} submission verified."),
          targetTier >= 1 ? "warning" : "success"
        );
      onCompleted();
      onClose();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          `${t("err_save_failed", "Save failed:")} ${err?.message || String(err)}`,
          "error"
        );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!submission) return;
    if (!rejectReason.trim()) {
      useStore
        .getState()
        .pushStatus(t("prompt_reject_reason", "Enter rejection reason:"), "error");
      return;
    }
    setIsProcessing(true);
    try {
      const nextDesc = `${submission.description || ""}\n\nREJECTION REASON: ${rejectReason.trim()}`.trim();
      const { error } = await supabase
        .from("mods")
        .update({ status: "unverified", description: nextDesc })
        .eq("id", submission.id);
      if (error) throw error;

      await logArchitectAction(
        "Updated Mod Metadata",
        "mods",
        submission.name || submission.id,
        rejectReason.trim(),
        "Architect Console",
        false,
        computeAuditDiff(submission, { ...submission, status: "unverified" })
      );
      useStore
        .getState()
        .pushStatus(t("mason_sub_rejected_toast", "Submission returned to {Mason}."), "info");
      onCompleted();
      onClose();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          `${t("err_save_failed", "Save failed:")} ${err?.message || String(err)}`,
          "error"
        );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen && Boolean(submission)}
      onClose={onClose}
      title={t("mason_queue", "{Mason} Queue")}
      subtitle={t("mason_queue_desc", "Review submissions from {masons}.")}
      icon={t("icon_construction", "construction")}
      widthClass="w-[90vw] md:w-[580px]"
      headerActions={
        <PanelHeaderGroup>
          {submission && onOpenMetadataEditor && (
            <PanelHeaderButton
              icon={t("icon_edit_note", "edit_note")}
              tooltip={t("edit_metadata", "Edit Metadata")}
              onClick={() => {
                onClose();
                onOpenMetadataEditor(submission.id);
              }}
            />
          )}
          {onOpenFullQueue && (
            <PanelHeaderButton
              icon={t("icon_open_in_new", "open_in_new")}
              tooltip={t("open_mason_queue", "Open Full {Mason} Queue")}
              onClick={() => {
                onClose();
                onOpenFullQueue();
              }}
            />
          )}
        </PanelHeaderGroup>
      }
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <ActionButton
            variant="danger"
            icon={t("icon_close", "close")}
            label={t("reject", "Reject")}
            disabled={isProcessing}
            onClick={handleReject}
          />
          <ActionButton
            variant={complianceTier >= 1 ? "warning" : "primary"}
            icon={complianceTier >= 1 ? t("icon_policy", "policy") : t("icon_verified", "verified")}
            label={
              complianceTier >= 1
                ? t("submit_compliance_flag_btn", "Submit to Oversight Compliance")
                : t("approve", "Approve")
            }
            disabled={isProcessing}
            onClick={handleApprove}
          />
        </div>
      }
    >
      {submission && (
        <div className="space-y-4 mt-2 pb-6">
          <SidePanelHeroCard
            icon={t("icon_extension", "extension")}
            overline={
              submission.mason_name ||
              submission.master_author ||
              t("verified_mason", "Verified {Mason}")
            }
            title={submission.name || t("untitled", "Untitled")}
            badge={t("under_review", "Under Review")}
            badgeIcon={t("icon_schedule", "schedule")}
          >
            <div className="grid grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("category", "Category")}
                value={submission.sub_type || submission.category_override || t("artifact", "{Mod}")}
                icon={t("icon_category", "category")}
              />
              <StatBox
                label={t("version", "Version")}
                value={submission.latest_version || "1.0.0"}
                icon={t("icon_sell", "sell")}
              />
            </div>
          </SidePanelHeroCard>

          {submission.description && (
            <UniversalGroup title={t("description", "Description")} icon={t("icon_description", "description")}>
              <p className="text-xs text-[var(--subtext)] leading-relaxed whitespace-pre-wrap">
                {submission.description}
              </p>
            </UniversalGroup>
          )}

          <UniversalGroup title={t("compliance_tier", "Compliance Tier")} icon={t("icon_policy", "policy")}>
            <CustomComplianceDropdown
              value={complianceTier}
              onChange={(val) => setComplianceTier(val)}
              maxTier={4}
            />
          </UniversalGroup>

          <UniversalGroup title={t("review_notes", "Review / Rejection Note")} icon={t("icon_rate_review", "rate_review")}>
            <UniversalTextArea
              label={t("reason", "Reason")}
              placeholder={t("prompt_reject_reason", "Enter rejection reason (required to reject)...")}
              value={rejectReason}
              rows={3}
              onChange={(val) => setRejectReason(val)}
            />
          </UniversalGroup>
        </div>
      )}
    </SidePanel>
  );
}

/* ============================================================================
 * 3. ARCHITECT DIAGNOSTIC REPORT QUICK SIDE PANEL
 * ============================================================================ */
export function CommandDiagnosticDossierSidePanel({
  isOpen,
  onClose,
  diagnostic,
  onCompleted,
  onOpenFullDiagnostics,
}: {
  isOpen: boolean;
  onClose: () => void;
  diagnostic: any | null;
  onCompleted: () => void;
  onOpenFullDiagnostics?: () => void;
}) {
  const { t } = useLexicon();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSetModStatus = async (nextModStatus: "stable" | "broken") => {
    if (!diagnostic?.mod_id) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from("mods")
        .update({ status: nextModStatus })
        .eq("id", diagnostic.mod_id);
      if (error) throw error;

      if (diagnostic.id) {
        await supabase
          .from("homestead_lab_logs")
          .update({ status: "reviewed" })
          .eq("id", diagnostic.id);
      }

      await logArchitectAction(
        `Diagnostic Verdict (${nextModStatus.toUpperCase()})`,
        "mods",
        diagnostic.mod_name || diagnostic.mod_id,
        undefined,
        "Architect Diagnostics",
        false,
        { status: { from: diagnostic.mod_status || "under_review", to: nextModStatus } }
      );
      useStore
        .getState()
        .pushStatus(t("diagnostic_status_saved", "Diagnostic status updated."), "success");
      onCompleted();
      onClose();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          `${t("err_save_failed", "Save failed:")} ${err?.message || String(err)}`,
          "error"
        );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen && Boolean(diagnostic)}
      onClose={onClose}
      title={t("tab_diagnostics", "Diagnostics")}
      subtitle={t("lab_telemetry_dossier", "{Lab} Telemetry Dossier")}
      icon={t("icon_science", "science")}
      widthClass="w-[90vw] md:w-[600px]"
      headerActions={
        onOpenFullDiagnostics ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_open_in_new", "open_in_new")}
              tooltip={t("open_diagnostics_console", "Open Diagnostics & Known Error Rules")}
              onClick={() => {
                onClose();
                onOpenFullDiagnostics();
              }}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <ActionButton
            variant="danger"
            icon={t("icon_broken_image", "broken_image")}
            label={t("mark_broken", "Mark Broken")}
            disabled={isProcessing || !diagnostic?.mod_id}
            onClick={() => handleSetModStatus("broken")}
          />
          <ActionButton
            variant="primary"
            icon={t("icon_verified", "verified")}
            label={t("mark_stable", "Mark Stable")}
            disabled={isProcessing || !diagnostic?.mod_id}
            onClick={() => handleSetModStatus("stable")}
          />
        </div>
      }
    >
      {diagnostic && (
        <div className="space-y-4 mt-2 pb-6">
          <SidePanelHeroCard
            icon={t("icon_science", "science")}
            overline={diagnostic.mod_author || t("lab_diagnostic_entry", "{Lab} Report")}
            title={diagnostic.mod_name || t("unknown", "Unknown")}
            badge={t("pending", "Pending")}
            badgeIcon={t("icon_pending_actions", "pending_actions")}
          >
            <div className="grid grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("status", "Status")}
                value={diagnostic.mod_status || t("under_review", "Under Review")}
                icon={t("icon_vital_signs", "vital_signs")}
              />
              <StatBox
                label={t("reported", "Reported")}
                value={
                  diagnostic.created_at
                    ? new Date(diagnostic.created_at).toLocaleDateString()
                    : t("recent", "Recent")
                }
                icon={t("icon_schedule", "schedule")}
              />
            </div>
          </SidePanelHeroCard>

          {(diagnostic.notes || diagnostic.exception_summary || diagnostic.log_content) && (
            <UniversalGroup title={t("telemetry_excerpt", "Telemetry Excerpt")} icon={t("icon_terminal", "terminal")}>
              <pre className="text-[11px] font-mono text-[var(--subtext)] whitespace-pre-wrap break-words max-h-64 overflow-y-auto p-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]">
                {String(
                  diagnostic.notes ||
                  diagnostic.exception_summary ||
                  diagnostic.log_content ||
                  ""
                ).slice(0, 2400)}
              </pre>
            </UniversalGroup>
          )}
        </div>
      )}
    </SidePanel>
  );
}

/* ============================================================================
 * 4. UNIFIED REPORT RESOLUTION QUICK SIDE PANEL (NEXUS / BLUEPRINT / COMM-LINK)
 * ============================================================================ */
export function CommandReportResolutionSidePanel({
  isOpen,
  onClose,
  report,
  onCompleted,
  onOpenFullReports,
}: {
  isOpen: boolean;
  onClose: () => void;
  report: any | null;
  onCompleted: () => void;
  onOpenFullReports?: () => void;
}) {
  const { t } = useLexicon();
  const [resolutionReason, setResolutionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setResolutionReason("");
  }, [report]);

  const handleResolve = async (action: "dismiss" | "remove") => {
    if (!report) return;
    setIsProcessing(true);
    try {
      const table =
        report.source === "blueprint"
          ? "blueprint_reports"
          : report.source === "comm-link"
            ? "content_flags"
            : "nexus_reports";

      if (action === "dismiss") {
        const { error } = await supabase
          .from(table)
          .update({ status: "dismissed" })
          .eq("id", report.id);
        if (error) throw error;
        await logArchitectAction(
          `Dismissed Report: ${report.title}`,
          table,
          report.id,
          resolutionReason || undefined,
          undefined,
          false,
          { status: { from: report.status || "pending", to: "dismissed" } }
        );
      } else {
        if (report.source === "nexus" && report.target_id) {
          await supabase
            .from("nexus_assets")
            .update({ is_public: false })
            .eq("id", report.target_id);
        } else if (report.source === "blueprint" && report.target_id) {
          await supabase
            .from("blueprints")
            .update({ is_public: false })
            .eq("id", report.target_id);
        } else if (report.source === "comm-link" && report.target_id) {
          if (report.content_type === "post") {
            await supabase.from("mason_posts").delete().eq("id", report.target_id);
          } else if (report.content_type === "comment") {
            await supabase.from("mason_post_comments").delete().eq("id", report.target_id);
          }
        }
        const { error } = await supabase
          .from(table)
          .update({ status: "resolved" })
          .eq("id", report.id);
        if (error) throw error;
        await logArchitectAction(
          `Resolved & Hidden Reported Target: ${report.title}`,
          table,
          report.id,
          resolutionReason || undefined,
          undefined,
          false,
          { status: { from: report.status || "pending", to: "resolved" } }
        );
      }

      useStore
        .getState()
        .pushStatus(t("report_resolved_toast", "Report updated."), "success");
      onCompleted();
      onClose();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          `${t("err_save_failed", "Save failed:")} ${err?.message || String(err)}`,
          "error"
        );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen && Boolean(report)}
      onClose={onClose}
      title={t("nexus_reports", "{Nexus} Reports")}
      subtitle={t("moderation_report_dossier", "Reported Content Review")}
      icon={t("icon_flag", "flag")}
      widthClass="w-[90vw] md:w-[580px]"
      headerActions={
        onOpenFullReports ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_open_in_new", "open_in_new")}
              tooltip={t("open_reports_console", "Open Full Reports Console")}
              onClick={() => {
                onClose();
                onOpenFullReports();
              }}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <ActionButton
            variant="glass"
            icon={t("icon_check_circle", "check_circle")}
            label={t("dismiss", "Dismiss")}
            disabled={isProcessing}
            onClick={() => handleResolve("dismiss")}
          />
          <ActionButton
            variant="danger"
            icon={t("icon_visibility_off", "visibility_off")}
            label={t("unpublish_and_resolve", "Hide Target & Resolve")}
            disabled={isProcessing}
            onClick={() => handleResolve("remove")}
          />
        </div>
      }
    >
      {report && (
        <div className="space-y-4 mt-2 pb-6">
          <SidePanelHeroCard
            icon={t("icon_flag", "flag")}
            overline={report.reporter_name || t("citizen", "{Citizen}")}
            title={report.title || t("reported_item", "Reported Item")}
            badge={String(report.source || "nexus").toUpperCase()}
            badgeIcon={t("icon_flag", "flag")}
          />

          <UniversalGroup title={t("report_reason", "Reported Reason")} icon={t("icon_report", "report")}>
            <p className="text-xs text-[var(--subtext)] leading-relaxed whitespace-pre-wrap">
              {report.reason || report.description || t("no_reason", "No reason provided")}
            </p>
          </UniversalGroup>

          <UniversalGroup title={t("moderator_note", "Moderator Resolution Note")} icon={t("icon_edit_note", "edit_note")}>
            <UniversalTextArea
              label={t("reason", "Reason")}
              value={resolutionReason}
              rows={3}
              placeholder={t("optional_audit_note", "Optional audit log note...")}
              onChange={(val) => setResolutionReason(val)}
            />
          </UniversalGroup>
        </div>
      )}
    </SidePanel>
  );
}

/* ============================================================================
 * 5. OVERSIGHT / WAYFINDER MALWARE THREAT MANIFEST QUICK SIDE PANEL
 * ============================================================================ */
export function CommandMalwareManifestSidePanel({
  isOpen,
  onClose,
  manifest,
  onCompleted,
  onOpenManualFlag,
  onOpenFullMalware,
}: {
  isOpen: boolean;
  onClose: () => void;
  manifest: any | null;
  onCompleted: () => void;
  onOpenManualFlag?: () => void;
  onOpenFullMalware?: () => void;
}) {
  const { t } = useLexicon();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleStatusUpdate = async (newStatus: "confirmed" | "dismissed") => {
    if (!manifest) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from("malware_reports")
        .update({ status: newStatus })
        .eq("id", manifest.id);
      if (error) throw error;

      await logArchitectAction(
        `Updated malware report status to: ${newStatus}`,
        "malware_reports",
        manifest.id,
        undefined,
        "Malware & Manifests",
        false,
        { status: { from: manifest.status || "pending", to: newStatus } }
      );
      useStore
        .getState()
        .pushStatus(t("malware_manifest_updated", "Threat manifest updated."), "success");
      onCompleted();
      onClose();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          `${t("err_save_failed", "Save failed:")} ${err?.message || String(err)}`,
          "error"
        );
    } finally {
      setIsProcessing(false);
    }
  };

  const displayName =
    manifest?.mod_name ||
    manifest?.file_name ||
    (manifest?.detected_hash ? String(manifest.detected_hash).substring(0, 16) : "") ||
    t("threat_manifest", "Threat Manifest");

  return (
    <SidePanel
      isOpen={isOpen && Boolean(manifest)}
      onClose={onClose}
      title={t("malware_manifests", "Malware & Manifests")}
      subtitle={t("threat_manifest_dossier", "Threat Telemetry Inspection")}
      icon={t("icon_coronavirus", "coronavirus")}
      widthClass="w-[90vw] md:w-[600px]"
      headerActions={
        <PanelHeaderGroup>
          {onOpenManualFlag && (
            <PanelHeaderButton
              icon={t("icon_gpp_bad", "gpp_bad")}
              tooltip={t("manual_flag_title", "Manual Compliance / Malware Flag")}
              onClick={() => {
                onClose();
                onOpenManualFlag();
              }}
            />
          )}
          {onOpenFullMalware && (
            <PanelHeaderButton
              icon={t("icon_open_in_new", "open_in_new")}
              tooltip={t("open_malware_console", "Open Malware & Heuristics")}
              onClick={() => {
                onClose();
                onOpenFullMalware();
              }}
            />
          )}
        </PanelHeaderGroup>
      }
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <ActionButton
            variant="glass"
            icon={t("icon_check_circle", "check_circle")}
            label={t("false_positive_dismiss", "False Positive")}
            disabled={isProcessing}
            onClick={() => handleStatusUpdate("dismissed")}
          />
          <ActionButton
            variant="danger"
            icon={t("icon_gpp_bad", "gpp_bad")}
            label={t("confirm_threat", "Confirm Threat")}
            disabled={isProcessing}
            onClick={() => handleStatusUpdate("confirmed")}
          />
        </div>
      }
    >
      {manifest && (
        <div className="space-y-4 mt-2 pb-6">
          <SidePanelHeroCard
            icon={t("icon_coronavirus", "coronavirus")}
            overline={manifest.matched_rule || manifest.threat_type || t("heuristic_alert", "Heuristic Match")}
            title={displayName}
            badge={String(manifest.status || "pending").toUpperCase()}
            badgeIcon={t("icon_warning", "warning")}
            variant="danger"
          >
            <div className="grid grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("file_target", "Target File")}
                value={manifest.file_name || manifest.mod_name || t("unknown", "Unknown")}
                icon={t("icon_description", "description")}
              />
              <StatBox
                label={t("detected", "Detected")}
                value={
                  manifest.created_at
                    ? new Date(manifest.created_at).toLocaleDateString()
                    : t("recent", "Recent")
                }
                icon={t("icon_schedule", "schedule")}
              />
            </div>
          </SidePanelHeroCard>

          {(manifest.details || manifest.matched_pattern || manifest.detected_hash) && (
            <UniversalGroup title={t("signature_telemetry", "Signature Telemetry")} icon={t("icon_terminal", "terminal")}>
              <pre className="text-[11px] font-mono text-[var(--subtext)] whitespace-pre-wrap break-words max-h-56 overflow-y-auto p-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]">
                {JSON.stringify(
                  {
                    hash: manifest.detected_hash,
                    matched_rule: manifest.matched_rule || manifest.matched_pattern,
                    details: manifest.details || manifest.reason,
                  },
                  null,
                  2
                )}
              </pre>
            </UniversalGroup>
          )}
        </div>
      )}
    </SidePanel>
  );
}

/* ============================================================================
 * 6. OVERSIGHT / WAYFINDER COMPLIANCE TIER REVIEW QUICK SIDE PANEL
 * ============================================================================ */
export function CommandComplianceReviewSidePanel({
  isOpen,
  onClose,
  modItem,
  onCompleted,
  onOpenMetadataEditor,
  onOpenFullCompliance,
}: {
  isOpen: boolean;
  onClose: () => void;
  modItem: any | null;
  onCompleted: () => void;
  onOpenMetadataEditor?: (modId: string) => void;
  onOpenFullCompliance?: () => void;
}) {
  const { t } = useLexicon();
  const [editTier, setEditTier] = useState<number>(1);
  const [editReason, setEditReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!modItem) return;
    setEditTier(Number(modItem.compliance_tier ?? 1));
    setEditReason("");
  }, [modItem]);

  const tierOptions = [
    { id: "0", label: t("tier_0_clean", "Tier 0 — Standard / Clean") },
    { id: "1", label: t("tier_1_label", "Tier 1 — Mature / Advisory") },
    { id: "2", label: t("tier_2_label", "Tier 2 — Restricted Adult") },
    { id: "3", label: t("tier_3_label", "Tier 3 — Policy Violation") },
    { id: "4", label: t("tier_4_label", "Tier 4 — Severe Violation") },
    { id: "5", label: t("tier_5_label", "Tier 5 — Confirmed Malware") },
  ];

  const handleSave = async () => {
    if (!modItem) return;
    if (!editReason.trim()) {
      useStore
        .getState()
        .pushStatus(
          t("identities_req_reason", "Reason is required when changing compliance tier."),
          "error"
        );
      return;
    }

    setIsSubmitting(true);
    try {
      const nextStatus = editTier === 5 ? "blacklisted" : "verified";
      const { error } = await supabase.rpc("secure_upsert_cloud_file", {
        p_token: useStore.getState().session?.access_token || "",
        p_target: "mods",
        p_payload: {
          id: modItem.id,
          compliance_tier: editTier,
          status: nextStatus,
          status_reason: editReason.trim(),
        },
      });
      if (error) throw error;

      await logArchitectAction(
        `Changed compliance tier from ${modItem.compliance_tier} to ${editTier}`,
        "mods",
        modItem.name || modItem.id,
        editReason.trim() || "Compliance Review",
        "Oversight Compliance",
        false,
        {
          compliance_tier: { from: modItem.compliance_tier, to: editTier },
          status: { from: modItem.status, to: nextStatus },
        }
      );
      useStore
        .getState()
        .pushStatus(t("identities_updated", "Success"), "success");
      onCompleted();
      onClose();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          `${t("err_save_failed", "Save failed:")} ${err?.message || String(err)}`,
          "error"
        );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen && Boolean(modItem)}
      onClose={onClose}
      title={t("tab_compliance", "Compliance")}
      subtitle={t("compliance_tier_dossier", "Compliance Tier Classification")}
      icon={t("icon_policy", "policy")}
      widthClass="w-[90vw] md:w-[580px]"
      headerActions={
        <PanelHeaderGroup>
          {modItem && onOpenMetadataEditor && (
            <PanelHeaderButton
              icon={t("icon_edit_note", "edit_note")}
              tooltip={t("edit_metadata", "Edit Metadata")}
              onClick={() => {
                onClose();
                onOpenMetadataEditor(modItem.id);
              }}
            />
          )}
          {onOpenFullCompliance && (
            <PanelHeaderButton
              icon={t("icon_open_in_new", "open_in_new")}
              tooltip={t("open_compliance_console", "Open Full Compliance View")}
              onClick={() => {
                onClose();
                onOpenFullCompliance();
              }}
            />
          )}
        </PanelHeaderGroup>
      }
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <ActionButton
            variant="glass"
            label={t("cancel", "Cancel")}
            onClick={onClose}
            disabled={isSubmitting}
          />
          <ActionButton
            variant="primary"
            icon={t("icon_save", "save")}
            label={t("save", "Save")}
            disabled={isSubmitting}
            onClick={handleSave}
          />
        </div>
      }
    >
      {modItem && (
        <div className="space-y-4 mt-2 pb-6">
          <SidePanelHeroCard
            icon={t("icon_policy", "policy")}
            overline={modItem.master_author || t("artifact", "{Mod}")}
            title={modItem.name || t("unknown", "Unknown")}
            badge={`${t("stat_tier", "Tier")} ${modItem.compliance_tier ?? 1}`}
            badgeIcon={t("icon_policy", "policy")}
          />

          {modItem.status_reason && (
            <UniversalGroup
              title={t("report_reason", "Reported / Flagged Context")}
              icon={t("icon_report", "report")}
            >
              <p className="text-xs font-bold text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words m-0">
                {modItem.status_reason}
              </p>
            </UniversalGroup>
          )}

          <UniversalGroup title={t("compliance_classification", "Compliance Classification")} icon={t("icon_gavel", "gavel")}>
            <div className="space-y-3">
              <CustomDropdown
                label={t("compliance_tier", "Compliance Tier")}
                value={String(editTier)}
                options={tierOptions}
                onChange={(val: any) => {
                  const chosen = Array.isArray(val) ? val[0] : val;
                  setEditTier(Number(chosen));
                }}
              />
              <UniversalTextArea
                label={t("reason", "Reason")}
                value={editReason}
                rows={3}
                placeholder={t(
                  "identities_req_reason",
                  "Reason is required when changing compliance tier."
                )}
                onChange={(val) => setEditReason(val)}
              />
            </div>
          </UniversalGroup>
        </div>
      )}
    </SidePanel>
  );
}

/* ============================================================================
 * 7. KEEPERS CORE PARTNER SPOKE NODE QUICK SIDE PANEL (NO DONATION FIELDS!)
 * ============================================================================ */
export function CommandSpokeNodeSidePanel({
  isOpen,
  onClose,
  gameNode,
  onCompleted,
  onOpenPartnerSpokes,
}: {
  isOpen: boolean;
  onClose: () => void;
  gameNode: any | null;
  onCompleted: () => void;
  onOpenPartnerSpokes?: () => void;
}) {
  const { t } = useLexicon();
  const [isActive, setIsActive] = useState(true);
  const [isKeepersOnly, setIsKeepersOnly] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!gameNode) return;
    setIsActive(Boolean(gameNode.is_active));
    setIsKeepersOnly(Boolean(gameNode.is_keepers_only));
  }, [gameNode]);

  const handleSaveNodeFlags = async () => {
    if (!gameNode) return;
    setIsSaving(true);
    try {
      const upsertPayload = {
        id: gameNode.id,
        name: gameNode.name,
        schema_id: String(gameNode.schema_id || "").toUpperCase(),
        supabase_url: gameNode.supabase_url,
        supabase_anon_key: gameNode.supabase_anon_key,
        icon: gameNode.icon,
        is_active: isActive,
        is_keepers_only: isKeepersOnly,
      };
      const res: any = await supabaseAuth.functions.invoke("game-gateway", {
        body: {
          action: "keeper_upsert_game",
          payload: upsertPayload,
        },
      });
      const invokeErr = res?.error || (res?.data?.error ? { message: res.data.error } : null);
      if (invokeErr) throw new Error(invokeErr.message || String(invokeErr));

      await logArchitectAction(
        `Updated Spoke Node Telemetry: ${gameNode.name}`,
        "sanctuary_games",
        gameNode.name,
        undefined,
        "Keepers Core",
        true,
        {
          is_active: { from: gameNode.is_active, to: isActive },
          is_keepers_only: { from: Boolean(gameNode.is_keepers_only), to: isKeepersOnly },
        }
      );
      useStore
        .getState()
        .pushStatus(t("spoke_node_updated_toast", "Partner Spoke node updated."), "success");
      onCompleted();
      onClose();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          `${t("err_save_failed", "Save failed:")} ${err?.message || String(err)}`,
          "error"
        );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen && Boolean(gameNode)}
      onClose={onClose}
      title={t("keepers_tab_partner_spokes", "Partner Spokes")}
      subtitle={t("spoke_node_telemetry", "Federated Spoke Node Telemetry")}
      icon={t("icon_dns", "dns")}
      widthClass="w-[90vw] md:w-[580px]"
      headerActions={
        onOpenPartnerSpokes ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_open_in_new", "open_in_new")}
              tooltip={t("open_partner_spokes", "Open Full Partner Spokes Console")}
              onClick={() => {
                onClose();
                onOpenPartnerSpokes();
              }}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <ActionButton
            variant="glass"
            label={t("cancel", "Cancel")}
            onClick={onClose}
            disabled={isSaving}
          />
          <ActionButton
            variant="primary"
            icon={t("icon_save", "save")}
            label={t("save", "Save")}
            disabled={isSaving}
            onClick={handleSaveNodeFlags}
          />
        </div>
      }
    >
      {gameNode && (
        <div className="space-y-4 mt-2 pb-6">
          <SidePanelHeroCard
            icon={t("icon_dns", "dns")}
            overline={gameNode.supabase_url || t("spoke_endpoint", "Spoke Endpoint")}
            title={gameNode.name}
            badge={isActive ? t("online", "Online") : t("offline", "Offline")}
            badgeIcon={
              isActive
                ? t("icon_check_circle", "check_circle")
                : t("icon_cloud_off", "cloud_off")
            }
          >
            <div className="grid grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("schema_id", "Schema ID")}
                value={String(gameNode.schema_id || "").toUpperCase()}
                icon={t("icon_data_object", "data_object")}
              />
              <StatBox
                label={t("registered", "Registered")}
                value={
                  gameNode.created_at
                    ? new Date(gameNode.created_at).toLocaleDateString()
                    : t("active", "Active")
                }
                icon={t("icon_calendar_today", "calendar_today")}
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup title={t("routing_visibility", "Routing & Visibility")} icon={t("icon_alt_route", "alt_route")}>
            <div className="space-y-3">
              {isKeepersOnly ? (
                <SidePanelPillToggle
                  label={t("online", "Online")}
                  checked={isActive}
                  onChange={setIsActive}
                />
              ) : (
                <p className="text-xs text-[var(--subtext)] leading-relaxed m-0">
                  {t(
                    "keepers_partner_spoke_sovereignty_note",
                    "Partner Spokes are independently owned by their Wayfinders. Keepers cannot alter Spoke operations except via emergency Compliance Sever (Cut the Cord)."
                  )}
                </p>
              )}
              <SidePanelPillToggle
                label={t(
                  "keepers_only_spoke_toggle",
                  "Keepers-Classified Spoke (Foundry Test Node)"
                )}
                checked={isKeepersOnly}
                onChange={setIsKeepersOnly}
              />
              {onOpenPartnerSpokes && !isKeepersOnly && (
                <ActionButton
                  variant="danger"
                  icon={t("icon_link_off", "link_off")}
                  label={t("keepers_sever_spoke_btn", "Spoke Sever (Cut the Cord)")}
                  onClick={() => {
                    onClose();
                    onOpenPartnerSpokes();
                  }}
                  className="!w-full !justify-center"
                />
              )}
            </div>
          </UniversalGroup>
        </div>
      )}
    </SidePanel>
  );
}
