import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { supabase, spokeOversightFrom } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel, ActionButton, CustomComplianceDropdown,
  SidePanelHeroCard, UniversalGroup, HoverTooltip
} from "../shared";
import { UniversalTextArea } from "../components/universal/UniversalLayout";
import { VAULT_CHIP_CLASS } from "../Cards";
import { logArchitectAction } from "../lib/audit";

export function FileVerificationSidePanel({ isOpen, onClose, onJumpToArtifact, isOversight, initialHash, onManualFlag }: { isOpen: boolean, onClose: () => void, onJumpToArtifact?: (modObj: any) => void, isOversight?: boolean, initialHash?: string, onManualFlag?: (hash: string) => void }) {
  const { t } = useLexicon();
  const modVerClient = isOversight
    ? spokeOversightFrom("mod_versions")
    : supabase.from("mod_versions");
  const [filePath, setFilePath] = useState<string>("");
  const [fileHash, setFileHash] = useState<string>("");
  const [isHashing, setIsHashing] = useState(false);
  const [matchedMod, setMatchedMod] = useState<any>(null);

  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagTier, setFlagTier] = useState<number>(1);
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
        const { data: verData } = await modVerClient.select('*, mods(*)').eq('dna_hash', initialHash).maybeSingle();
        let fetchedMod = null;
        if (verData && verData.mods) {
          fetchedMod = { ...verData.mods, version_label: verData.version_label, version_number: verData.version_number };
          if (!isOversight && Number(fetchedMod?.compliance_tier || 0) > 0) {
            fetchedMod = null;
          } else {
            setMatchedMod(fetchedMod);
          }
        }
        setIsHashing(false);
      };
      fetchMod();
    }
  }, [isOpen, initialHash, isOversight]);

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

        const { data: verData } = await modVerClient.select('*, mods(*)').eq('dna_hash', hash).maybeSingle();
        let fetchedMod = null;
        if (verData && verData.mods) {
          fetchedMod = { ...verData.mods, version_label: verData.version_label, version_number: verData.version_number };
          if (!isOversight && Number(fetchedMod?.compliance_tier || 0) > 0) {
            fetchedMod = null;
          } else {
            setMatchedMod(fetchedMod);
          }
        }

        setSessionHistory(prev => [{
          path: selected,
          hash: hash,
          matchedModName: fetchedMod?.name || null,
          matchedMod: fetchedMod,
          timestamp: Date.now()
        }, ...prev]);

        await logArchitectAction(
          `DNA Verification Scan: ${hash}`,
          'mod_versions',
          fetchedMod?.name || selected.split(/[/\\]/).pop() || 'Unknown File',
          undefined,
          undefined,
          false,
          {
            file_hash: { to: hash },
            matched_mod: { to: fetchedMod?.name || 'Unmatched' },
          }
        );
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

    const fileName = filePath.split(/[/\\]/).pop() || "Unknown File";
    try {
      const targetTier = Math.min(4, Math.max(1, Number(flagTier || 1)));
      const { error: flagErr } = await supabase.rpc("flag_mod_for_compliance", {
        p_mod_id: matchedMod?.id || undefined,
        p_dna_hash: fileHash ? fileHash.trim().toLowerCase() : undefined,
        p_mod_name: matchedMod?.name || fileName || undefined,
        p_tier: targetTier,
        p_reason: flagReason.trim(),
      });
      if (flagErr) throw flagErr;
      window.dispatchEvent(new CustomEvent("sanctuary-compliance-updated"));

      await logArchitectAction(
        `Flagged Artifact for Oversight Compliance (T${targetTier}): ${fileName}`,
        "mods",
        matchedMod?.name || fileName,
        `Tier ${targetTier}: ${flagReason.trim()}`,
        undefined,
        false,
        {
          file_name: { to: fileName },
          file_hash: { to: fileHash },
          compliance_tier: { to: targetTier },
          flag_reason: { to: flagReason.trim() },
        }
      );

      setSuccessMsg(
        t(
          "nexus_mod_flagged_compliance_toast",
          "{Mod} flagged for Oversight Compliance review (Pending)."
        )
      );
      setShowFlagForm(false);
      setConfirmFlag(false);
      setFlagReason("");
      setFlagTier(1);
    } catch (err: any) {
      console.error(err);
      useStore
        .getState()
        .pushStatus(
          `${t("err_flag_mod_failed", "Failed to flag {mod}:")} ${err?.message || ""}`.trim(),
          "error"
        );
    } finally {
      setIsSubmitting(false);
    }
  };

  const matchedTierNum = Number(matchedMod?.compliance_tier ?? 0);
  let statusState = "AWAITING";
  if (successMsg || showFlagForm) statusState = "FLAGGED";
  else if (isHashing) statusState = "SCANNING";
  else if (filePath && !fileHash) statusState = "SCANNING";
  else if (fileHash && matchedMod) {
    if (matchedTierNum === 5) statusState = "MALWARE";
    else if (matchedTierNum >= 1 && matchedTierNum <= 4) statusState = "RESTRICTED";
    else statusState = "VERIFIED";
  }
  else if (fileHash && !matchedMod) statusState = "MISMATCH";

  const statusConfig = {
    AWAITING: {
      color: "var(--subtext)",
      variant: "accent" as const,
      icon: t("icon_hourglass_empty", "hourglass_empty"),
      title: t("verify_status_awaiting", "Awaiting {Mod}"),
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
      icon: t("icon_verified_user", "verified_user"),
      title: t("verify_status_verified", "Verified Artifact"),
      desc: t("verify_status_verified_desc", "Hash perfectly matches a registered {mod} in the database.")
    },
    MISMATCH: {
      color: "var(--warning)",
      variant: "warning" as const,
      icon: t("icon_warning", "warning"),
      title: t("verify_status_mismatch", "Unrecognized Hash"),
      desc: t("verify_status_mismatch_desc", "No matching DNA hash was found in the registry for this file.")
    },
    MALWARE: {
      color: "var(--danger)",
      variant: "danger" as const,
      icon: t("icon_skull", "skull"),
      title: t("malware_alert_title", "Malware Detected"),
      desc: t("verify_status_malware_desc", "This {mod} hash matches a known malicious signature. Immediate deletion required.")
    },
    RESTRICTED: {
      color: "var(--warning)",
      variant: "warning" as const,
      icon: t("icon_policy", "policy"),
      title: `${t("auto_tier", "Tier")} ${matchedTierNum} — ${t("compliance_restricted", "Restricted")}`,
      desc: t("verify_status_restricted_desc", "This {mod} hash is classified under an Oversight Compliance tier.")
    },
    FLAGGED: {
      color: "var(--danger)",
      variant: "danger" as const,
      icon: t("icon_gavel", "gavel"),
      title: t("verify_status_flagged", "Flagged for Review"),
      desc: t("verify_status_flagged_desc", "{Mod} has been flagged for manual review by Admin.")
    }
  }[statusState] as any;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("verify_panel_title", "Verify File DNA")}
      subtitle={t("verify_panel_subtitle", "Import a {mod} to verify its hash")}
      icon={t("icon_verified", "verified")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={statusConfig.icon}
          overline={t("verify_panel_subtitle", "Import a {mod} to verify its hash")}
          title={statusConfig.title}
          description={statusConfig.desc}
          badge={statusState}
          badgeIcon={statusConfig.icon}
          variant={statusConfig.variant}
        >
          <div className="flex flex-wrap items-center justify-end gap-2 ml-auto w-full pt-1">
            <ActionButton
              variant="glass"
              icon={isHashing ? t("icon_sync", "sync") : t("icon_upload_file", "upload_file")}
              disabled={isHashing}
              onClick={handleImport}
              label={isHashing ? t("scanning", "Scanning...") : t("verify_panel_import_btn", "Import {Mod}")}
            />
          </div>
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
                  {t("verify_panel_flag_btn", "Flag {Mod} For Admin Review")}
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
                <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-xs font-bold text-center flex items-center justify-center gap-2">
                  <span className="material-symbols-rounded !text-[16px] text-[var(--success)] shrink-0">
                    {t("icon_check_circle", "check_circle")}
                  </span>
                  <span>{successMsg}</span>
                </div>
              )}
            </div>
          </UniversalGroup>
        )}

        {matchedMod && (
          <UniversalGroup
            title={t("registry_label_name", "Matched Registry Artifact")}
            icon={statusState === 'MALWARE' ? t("icon_skull", "skull") : statusState === 'RESTRICTED' ? t("icon_policy", "policy") : t("icon_check_circle", "check_circle")}
            headerColorClass={statusState === 'MALWARE' ? 'text-[var(--danger)]' : statusState === 'RESTRICTED' ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}
          >
            <div className="flex flex-col gap-3 w-full">
              <div className="glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0"
                    style={{
                      color: statusState === 'MALWARE' ? 'var(--danger)' : statusState === 'RESTRICTED' ? 'var(--warning)' : 'var(--success)',
                    }}
                  >
                    <span className="material-symbols-rounded !text-[20px]">
                      {statusState === 'MALWARE' ? t("icon_skull", "skull") : statusState === 'RESTRICTED' ? t("icon_policy", "policy") : t("icon_verified_user", "verified_user")}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className={`text-sm font-black capitalize tracking-widest truncate ${statusState === 'MALWARE' ? 'text-[var(--danger)]' : statusState === 'RESTRICTED' ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}>
                      {matchedMod.name}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 mt-1 capitalize tracking-widest">
                      {t("label_version", "Version")}: {matchedMod.version_label || matchedMod.version_number || t("unknown", "Unknown")}
                    </span>
                  </div>
                </div>
                <span className={VAULT_CHIP_CLASS}>
                  <span
                    className="material-symbols-rounded !text-[12px] shrink-0"
                    style={{
                      color: statusState === 'MALWARE' ? 'var(--danger)' : statusState === 'RESTRICTED' ? 'var(--warning)' : 'var(--success)',
                    }}
                  >
                    {statusState === 'MALWARE' ? t("icon_skull", "skull") : statusState === 'RESTRICTED' ? t("icon_policy", "policy") : t("icon_verified", "verified")}
                  </span>
                  {statusState === 'RESTRICTED'
                    ? `${t("auto_tier", "Tier")} ${matchedTierNum}`
                    : statusState}
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
            title={t("verify_panel_flag_btn", "Flag {Mod} For Admin Review")}
            icon={t("icon_flag", "flag")}
            headerColorClass="text-[var(--danger)]"
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("registry_col_safety", "Compliance Tier")}
                </label>
                <CustomComplianceDropdown
                  value={flagTier}
                  onChange={setFlagTier}
                  minTier={1}
                  maxTier={4}
                />
              </div>
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
                  {t("cancel", "Cancel")}
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
              {sessionHistory.map((item, i) => {
                const histTier = Number(item.matchedMod?.compliance_tier ?? 0);
                const isMalware = histTier === 5;
                const isRestricted = histTier >= 1 && histTier <= 4;
                const isVerified = Boolean(item.matchedMod && !isMalware && !isRestricted);
                const itemColor = isMalware
                  ? "var(--danger)"
                  : isRestricted || !item.matchedMod
                    ? "var(--warning)"
                    : "var(--success)";
                const itemIcon = isMalware
                  ? t("icon_skull", "skull")
                  : isRestricted
                    ? t("icon_policy", "policy")
                    : isVerified
                      ? t("icon_verified", "verified")
                      : t("icon_warning", "warning");
                const itemLabel = isMalware
                  ? t("rating_malware", "Malware")
                  : isRestricted
                    ? `${t("auto_tier", "Tier")} ${histTier}`
                    : isVerified
                      ? t("verified", "Verified")
                      : t("auto_mismatch", "Mismatch");

                return (
                  <div
                    key={i}
                    className="glass-surface rounded-xl p-3.5 flex items-center justify-between gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-colors"
                    onClick={() => {
                      setFilePath(item.path);
                      setFileHash(item.hash);
                      setMatchedMod(item.matchedMod || null);
                      setSuccessMsg("");
                      setShowFlagForm(false);
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0"
                        style={{
                          color: itemColor,
                        }}
                      >
                        <span className="material-symbols-rounded !text-[18px]">
                          {itemIcon}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-[var(--text)] truncate">
                            {item.path.split(/[/\\]/).pop()}
                            <HoverTooltip title={item.path} />
                          </span>
                          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 shrink-0">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[var(--subtext)] truncate max-w-[240px]">
                          {item.hash}
                          <HoverTooltip title={item.hash} />
                        </span>
                      </div>
                    </div>
                    <span className={VAULT_CHIP_CLASS}>
                      <span
                        className="material-symbols-rounded !text-[12px] shrink-0"
                        style={{ color: itemColor }}
                      >
                        {itemIcon}
                      </span>
                      {itemLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
