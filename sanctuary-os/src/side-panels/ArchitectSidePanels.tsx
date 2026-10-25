import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, DashboardStatTile,
  HubTabButton, ModSearchDropdown, EmptyState, ActionButton,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass, PanelHeaderGroup, PanelHeaderButton,
  SidePanelHeroCard, SidePanelTitleInput, UniversalGroup, StatBox,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "../shared";
import { UniversalTextArea } from "../components/universal/UniversalLayout";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";


export function MasonRegistrationSidePanel({ isOpen, onClose, onCreate }: { isOpen: boolean, onClose: () => void, onCreate: (name: string) => Promise<void> }) {
  const { t } = useLexicon();
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    await onCreate(newMasonName);
    setIsCreating(false);
    setNewMasonName("");
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("verify_panel_title", "Register Mason")}
      subtitle={t("auth_user_id_desc", "Mason Registry")}
      icon={t("icon_person_add", "person_add")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      panelZ="z-[15001]"
      backdropZ="z-[15000]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon="add"
            tooltip={isCreating ? t("btn_saving", "Saving...") : t("ql_add", "Create Mason")}
            variant="accent"
            disabled={isCreating || !newMasonName.trim()}
            onClick={handleCreate}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_person_add", "person_add")}
          overline={t("auth_user_id_desc", "Mason Registry")}
          title={newMasonName || t("verify_panel_title", "Register Mason")}
          description={t("resolution_suggestion", "Create a new creator identity in the community Mason registry.")}
          variant="accent"
        />

        <SidePanelTitleInput
          value={newMasonName}
          onChange={setNewMasonName}
          placeholder={t("auto_e_g_load_31", "Enter Mason name...")}
          subtitle={t("resolution_suggestion", "Mason Display Name")}
        />

        <UniversalGroup title={t("verify_panel_title", "Mason Identity")} icon={t("icon_badge", "badge")}>
          <div className="flex flex-col gap-3 w-full">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("resolution_suggestion", "Mason Handle")}</label>
            <input
              value={newMasonName}
              onChange={e => setNewMasonName(e.target.value)}
              placeholder={t("auto_e_g_load_31", "Enter Mason name...")}
              className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] w-full"
            />
            <ActionButton
              variant="glass"
              icon={t("icon_add", "add")}
              disabled={isCreating || !newMasonName.trim()}
              onClick={handleCreate}
              className="w-full justify-center !py-3 mt-1"
            >
              {isCreating ? t("btn_saving", "Saving...") : t("ql_add", "Create Mason")}
            </ActionButton>
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}

export function FileVerificationSidePanel({ isOpen, onClose, onJumpToArtifact, isOversight, initialHash, onManualFlag }: { isOpen: boolean, onClose: () => void, onJumpToArtifact?: (modObj: any) => void, isOversight?: boolean, initialHash?: string, onManualFlag?: (hash: string) => void }) {
  const { t } = useLexicon();
  const [filePath, setFilePath] = useState<string>("");
  const [fileHash, setFileHash] = useState<string>("");
  const [isHashing, setIsHashing] = useState(false);
  const [matchedMod, setMatchedMod] = useState<any>(null);

  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);
  const [confirmFlag, setConfirmFlag] = useState(false);

  useEffect(() => {
    if (isOpen && initialHash) {
      setFilePath("Remote Hash");
      setFileHash(initialHash);
      setIsHashing(true);
      setSuccessMsg("");
      setShowFlagForm(false);
      setMatchedMod(null);

      const fetchMod = async () => {
        const { data: verData } = await supabase.from('mod_versions').select('*, mods(*)').eq('dna_hash', initialHash).maybeSingle();
        let fetchedMod = null;
        if (verData && verData.mods) {
          fetchedMod = { ...verData.mods, version_label: verData.version_label, version_number: verData.version_number };
          setMatchedMod(fetchedMod);
        }
        setIsHashing(false);
      };
      fetchMod();
    }
  }, [isOpen, initialHash]);

  const handleImport = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
      });
      if (selected && !Array.isArray(selected)) {
        setFilePath(selected);
        setIsHashing(true);
        setFileHash("");
        setSuccessMsg("");
        setShowFlagForm(false);
        setMatchedMod(null);

        const hash = await invoke<string>("generate_full_dna_hash", { filePath: selected });
        setFileHash(hash);

        const { data: verData } = await supabase.from('mod_versions').select('*, mods(*)').eq('dna_hash', hash).maybeSingle();
        let fetchedMod = null;
        if (verData && verData.mods) {
          fetchedMod = { ...verData.mods, version_label: verData.version_label, version_number: verData.version_number };
          setMatchedMod(fetchedMod);
        }

        setSessionHistory(prev => [{
          path: selected,
          hash: hash,
          matchedModName: fetchedMod?.name || null,
          matchedMod: fetchedMod,
          timestamp: Date.now()
        }, ...prev]);

        await logArchitectAction(`DNA Verification Scan: ${hash}`, 'mod_versions', fetchedMod?.name || selected.split(/[/\\]/).pop() || 'Unknown File');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsHashing(false);
    }
  };

  const handleFlag = async () => {
    if (!flagReason.trim() || !filePath || !fileHash) return;
    setIsSubmitting(true);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || "system";

    const fileName = filePath.split(/[/\\]/).pop() || "Unknown File";
    const cleanFileName = fileName.replace(/\.[^/.]+$/, "").replace(/_/g, ' ');
    const hiddenPath = filePath.replace(/^(?:[A-Z]:)?[\/\\]Users[\/\\][^\/\\]+[\/\\]/i, '...\\');

    await logArchitectAction(`Flagged Artifact: ${fileName}`, 'sanctuary_tickets', fileName, `User provided reason: ${flagReason}`);
    
    setIsSubmitting(false);
    setSuccessMsg(t("verify_panel_flag_success", "Artifact flagged for review."));
    setShowFlagForm(false);
    setFlagReason("");
  };

  let statusState = "AWAITING";
  if (successMsg || showFlagForm) statusState = "FLAGGED";
  else if (isHashing) statusState = "SCANNING";
  else if (filePath && !fileHash) statusState = "SCANNING";
  else if (fileHash && matchedMod) {
    if (matchedMod.compliance_tier === 5) statusState = "MALWARE";
    else if (matchedMod.compliance_tier === 2) statusState = "EXPLICIT";
    else statusState = "VERIFIED";
  }
  else if (fileHash && !matchedMod) statusState = "MISMATCH";

  const statusConfig = {
    AWAITING: {
      color: "var(--subtext)",
      variant: "accent" as const,
      icon: t("icon_hourglass_empty", "hourglass_empty"),
      title: t("verify_status_awaiting", "Awaiting Artifact"),
      desc: t("verify_status_awaiting_desc", "Select a local file to compute its SHA-256 DNA hash and verify against the global registry.")
    },
    SCANNING: {
      color: "var(--accent)",
      variant: "accent" as const,
      icon: t("icon_sync", "sync"),
      title: t("verify_status_scanning", "Scanning DNA"),
      desc: t("verify_status_scanning_desc", "Computing cryptographic SHA-256 hash and querying registry..."),
      pulse: true
    },
    VERIFIED: {
      color: "var(--success)",
      variant: "success" as const,
      icon: "verified_user",
      title: t("verify_status_verified", "Verified Artifact"),
      desc: t("verify_status_verified_desc", "This file matches a known, verified artifact in the Sanctuary registry.")
    },
    MISMATCH: {
      color: "var(--warning)",
      variant: "warning" as const,
      icon: "warning",
      title: t("verify_status_mismatch", "Unrecognized Hash"),
      desc: t("verify_status_mismatch_desc", "No matching DNA hash was found in the registry for this file.")
    },
    MALWARE: {
      color: "var(--danger)",
      variant: "danger" as const,
      icon: "skull",
      title: t("malware_alert_title", "Malware Detected"),
      desc: t("verify_status_malware_desc", "CRITICAL: This file matches a known malicious artifact signature.")
    },
    EXPLICIT: {
      color: "var(--warning)",
      variant: "warning" as const,
      icon: "warning",
      title: t("verify_status_explicit", "Explicit Content"),
      desc: t("verify_status_explicit_desc", "This file matches an adult/explicit compliance tier artifact.")
    },
    FLAGGED: {
      color: "var(--danger)",
      variant: "danger" as const,
      icon: "gavel",
      title: t("verify_status_flagged", "Flagged for Review"),
      desc: t("verify_status_flagged_desc", "This artifact is being flagged for oversight investigation.")
    }
  }[statusState] as any;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("verify_panel_title", "Verify File DNA")}
      subtitle={t("verify_panel_subtitle", "Cryptographic SHA-256 Registry Verification")}
      icon={t("icon_verified", "verified")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={statusConfig.icon}
          overline={t("verify_panel_subtitle", "DNA Verification")}
          title={statusConfig.title}
          description={statusConfig.desc}
          badge={statusState}
          variant={statusConfig.variant}
        >
          <ActionButton
            variant="glass"
            icon={isHashing ? t("icon_sync", "sync") : t("icon_upload_file", "upload_file")}
            disabled={isHashing}
            onClick={handleImport}
            className="w-full justify-center !py-3.5"
          >
            {isHashing ? t("scanning", "Scanning...") : t("verify_panel_import_btn", "Select File to Verify")}
          </ActionButton>
        </SidePanelHeroCard>

        {filePath && (
          <UniversalGroup
            title={t("verify_panel_title", "Scanned File Telemetry")}
            icon={t("icon_fingerprint", "fingerprint")}
          >
            <div className="flex flex-col gap-3 w-full">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 ml-2">{t("verify_panel_file_path", "File Path")}</span>
                <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-mono text-[var(--text)] break-all">
                  {filePath.replace(/^(?:[A-Z]:)?[\/\\]Users[\/\\][^\/\\]+[\/\\]/i, '...\\')}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 ml-2">{t("dna_hash", "SHA-256 DNA Hash")}</span>
                {isHashing ? (
                  <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                    <span className="text-xs font-mono text-[var(--accent)] animate-pulse">{t("scanning", "Scanning...")}</span>
                  </div>
                ) : (
                  <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-mono font-bold break-all" style={{ color: statusConfig.color }}>
                    {fileHash || "ERROR"}
                  </div>
                )}
              </div>

              {fileHash && !showFlagForm && !isOversight && (
                <ActionButton
                  variant="danger"
                  icon={t("icon_flag", "flag")}
                  onClick={() => setShowFlagForm(true)}
                  className="w-full justify-center !py-3 mt-1"
                >
                  {t("verify_panel_flag_btn", "Flag Artifact")}
                </ActionButton>
              )}

              {fileHash && !matchedMod && isOversight && onManualFlag && (
                <ActionButton
                  variant="danger"
                  icon={t("icon_gavel", "gavel")}
                  onClick={() => onManualFlag(fileHash)}
                  className="w-full justify-center !py-3 mt-1"
                >
                  {t("comp_manual_title", "Manual Flag")} &rarr;
                </ActionButton>
              )}

              {successMsg && (
                <div className="p-3.5 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)] text-xs font-bold text-center">
                  {successMsg}
                </div>
              )}
            </div>
          </UniversalGroup>
        )}

        {matchedMod && (
          <UniversalGroup
            title={t("registry_label_name", "Matched Registry Artifact")}
            icon={statusState === 'MALWARE' ? 'skull' : statusState === 'EXPLICIT' ? 'warning' : 'check_circle'}
            headerColorClass={statusState === 'MALWARE' ? 'text-[var(--danger)]' : statusState === 'EXPLICIT' ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}
          >
            <div className="flex flex-col gap-3 w-full">
              <div className="glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-4">
                <div className="flex flex-col min-w-0">
                  <span className={`text-sm font-black capitalize tracking-widest truncate ${statusState === 'MALWARE' ? 'text-[var(--danger)]' : statusState === 'EXPLICIT' ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}>
                    {matchedMod.name}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 mt-1 capitalize tracking-widest">
                    {t("update_version", "Version")}: {matchedMod.version_label || matchedMod.version_number || "UNKNOWN"}
                  </span>
                </div>
                <span className={`px-2.5 py-1 rounded-lg bg-transparent border text-[9px] font-black uppercase tracking-widest shrink-0 ${statusState === 'MALWARE' ? 'border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)]' : statusState === 'EXPLICIT' ? 'border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-[var(--warning)]' : 'border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)]'}`}>
                  {statusState}
                </span>
              </div>

              {onJumpToArtifact && !isOversight && (
                <ActionButton
                  variant="glass"
                  icon={t("icon_open_in_new", "open_in_new")}
                  onClick={() => onJumpToArtifact(matchedMod)}
                  className="w-full justify-center !py-3"
                >
                  {t("btn_link", "Jump to Artifact")} &rarr;
                </ActionButton>
              )}

              {isOversight && onManualFlag && (
                <ActionButton
                  variant="danger"
                  icon={t("icon_gavel", "gavel")}
                  onClick={() => onManualFlag(fileHash)}
                  className="w-full justify-center !py-3"
                >
                  {t("comp_manual_title", "Manual Flag")} &rarr;
                </ActionButton>
              )}
            </div>
          </UniversalGroup>
        )}

        {showFlagForm && (
          <UniversalGroup
            title={t("verify_panel_flag_btn", "Flag Artifact")}
            icon={t("icon_flag", "flag")}
            headerColorClass="text-[var(--danger)]"
          >
            <div className="flex flex-col gap-4 w-full">
              <UniversalTextArea
                label={t("reason", "Reason")}
                value={flagReason}
                onChange={setFlagReason}
                placeholder={t("verify_panel_flag_reason_ph", "Describe why this artifact should be reviewed...")}
                className="min-h-[96px]"
              />
              <div className="grid grid-cols-2 gap-3 w-full">
                <ActionButton
                  variant="glass"
                  onClick={() => {
                    if (confirmFlag) {
                      setConfirmFlag(false);
                    } else {
                      setShowFlagForm(false);
                    }
                  }}
                  className="w-full justify-center !py-3"
                >
                  {t("nav_cancel", "Cancel")}
                </ActionButton>
                <ActionButton
                  variant="danger"
                  icon={t("icon_flag", "flag")}
                  onClick={() => {
                    if (!confirmFlag) {
                      setConfirmFlag(true);
                    } else {
                      handleFlag();
                    }
                  }}
                  disabled={isSubmitting || !flagReason.trim()}
                  className="w-full justify-center !py-3"
                >
                  {isSubmitting ? t("scanning", "Submitting...") :
                    (confirmFlag ? t("verify_panel_flag_confirm", "Confirm Flag") : t("verify_panel_flag_submit", "Submit Flag"))}
                </ActionButton>
              </div>
            </div>
          </UniversalGroup>
        )}

        {sessionHistory.length > 0 && (
          <UniversalGroup
            title={t("auto_session_history", "Session History")}
            icon={t("icon_history", "history")}
          >
            <div className="flex flex-col gap-2.5 w-full">
              {sessionHistory.map((item, i) => (
                <div
                  key={i}
                  className="glass-surface rounded-xl p-3.5 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-colors"
                  onClick={() => {
                    setFilePath(item.path);
                    setFileHash(item.hash);
                    setMatchedMod(item.matchedMod || null);
                    setSuccessMsg("");
                    setShowFlagForm(false);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--text)] truncate" title={item.path}>{item.path.split(/[/\\]/).pop()}</span>
                    <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 shrink-0">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-[var(--subtext)] truncate max-w-[240px]" title={item.hash}>{item.hash}</span>
                    {item.matchedMod ? (
                      item.matchedMod.compliance_tier === 5 ? (
                        <span className="px-2 py-0.5 rounded bg-transparent border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[8px] font-black text-[var(--danger)] uppercase tracking-widest shrink-0">{t("rating_malware", "Malware")}</span>
                      ) : item.matchedMod.compliance_tier === 2 ? (
                        <span className="px-2 py-0.5 rounded bg-transparent border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-[8px] font-black text-[var(--warning)] uppercase tracking-widest shrink-0">{t("rating_explicit", "Explicit")}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-transparent border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[8px] font-black text-[var(--success)] uppercase tracking-widest shrink-0">{t("verified", "Verified")}</span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-transparent border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-[8px] font-black text-[var(--warning)] uppercase tracking-widest shrink-0">{t("auto_mismatch", "Mismatch")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
