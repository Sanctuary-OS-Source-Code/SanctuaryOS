import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { 
  ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect, 
  CustomComplianceDropdown, CustomDatePicker, StatTile, 
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, 
  standardDangerButtonClass, standardAccentGlassButtonClass, 
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";


export function MasonRegistrationSidePanel({ isOpen, onClose, onCreate }: { isOpen: boolean, onClose: () => void, onCreate: (name: string) => Promise<void> }) {
  const { t } = useLexicon();
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setIsCreating(true);
    await onCreate(newMasonName);
    setIsCreating(false);
    setNewMasonName("");
  };

  return (
    <>
      <div className="fixed inset-0 z-[15000] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-[3px] animate-in fade-in duration-300" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-1 w-[320px] theme-glass-panel border-l border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-2xl flex flex-col z-[15001] animate-in slide-in-from-right duration-500 overflow-hidden">
        <div className="flex items-center justify-between pt-[60px] px-6 pb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0">
          <div className="flex flex-col">
            <h3 className="text-xl font-black tracking-widest text-[var(--text)]">{t("create_title")}</h3>
            <p className="text-[9px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">{t("create_subtitle")}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text)] transition-colors hover:scale-110 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            <span className="text-sm font-black">&times;</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_name")}</label>
          <input value={newMasonName} onChange={e => setNewMasonName(e.target.value)} placeholder={t("create_ph_name")} className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
        </div>

        <div className="p-6 pb-12 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:scale-[1.02] text-[var(--text)] font-black text-[11px] uppercase tracking-[0.2em] rounded-xl transition-all">{t("shared_cancel")}</button>
          <button onClick={handleCreate} disabled={isCreating || !newMasonName.trim()} className="flex-1 py-4 theme-bg-accent hover:opacity-90 text-[var(--bg)] font-black text-[11px] uppercase tracking-[0.2em] rounded-xl transition-all shadow-lg disabled:opacity-50">
            {isCreating ? t("create_btn_creating") : t("create_btn_create")}
          </button>
        </div>
      </div>
    </>
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

  if (!isOpen) return null;

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

    const { error } = await supabase.from('sanctuary_tickets').insert({
      author_id: userId,
      status: "ESCALATED",
      ticket_type: "DNA_FLAG",
      title: `Flagged File: ${cleanFileName}`,
      description: `File Path: ${hiddenPath}\n\nReason: ${flagReason}`,
      metadata: { file_hash: fileHash, file_path: hiddenPath, flag_reason: flagReason, target_mod_id: fileHash }
    });

    setIsSubmitting(false);
    if (!error) {
      await logArchitectAction(`Flagged Artifact: ${fileName}`, 'sanctuary_tickets', fileName, `User provided reason: ${flagReason}`);
      setSuccessMsg(t("verify_panel_flag_success"));
      setShowFlagForm(false);
      setFlagReason("");
    } else {
      console.error("Failed to flag:", error);
    }
  };

  let statusState = "AWAITING";
  if (successMsg || showFlagForm) statusState = "FLAGGED";
  else if (isHashing) statusState = "SCANNING";
  else if (filePath && !fileHash) statusState = "SCANNING";
  else if (fileHash && matchedMod) {
    if (matchedMod.compliance_tier === 3) statusState = "MALWARE";
    else if (matchedMod.compliance_tier === 2) statusState = "EXPLICIT";
    else statusState = "VERIFIED";
  }
  else if (fileHash && !matchedMod) statusState = "MISMATCH";

  const statusConfig = {
    AWAITING: {
      color: "var(--subtext)",
      bg: "transparent",
      border: "border-white/10",
      icon: t("icon_hourglass_empty"),
      title: t("verify_status_awaiting"),
      desc: t("verify_status_awaiting_desc")
    },
    SCANNING: {
      color: "var(--accent)",
      bg: "color-mix(in srgb, var(--accent) 5%, transparent)",
      border: "border-[var(--accent)]/30",
      icon: t("icon_sync"),
      title: t("verify_status_scanning"),
      desc: t("verify_status_scanning_desc"),
      pulse: true
    },
    VERIFIED: {
      color: "rgb(52, 211, 153)", 
      bg: "color-mix(in srgb, rgb(52, 211, 153) 15%, transparent)",
      border: "border-emerald-400/30",
      icon: "verified_user",
      title: t("verify_status_verified"),
      desc: t("verify_status_verified_desc")
    },
    MISMATCH: {
      color: "rgb(251, 146, 60)", 
      bg: "color-mix(in srgb, rgb(251, 146, 60) 15%, transparent)",
      border: "border-orange-400/30",
      icon: "warning",
      title: t("verify_status_mismatch"),
      desc: t("verify_status_mismatch_desc")
    },
    MALWARE: {
      color: "rgb(239, 68, 68)", 
      bg: "color-mix(in srgb, rgb(239, 68, 68) 15%, transparent)",
      border: "border-red-500/30",
      icon: "skull",
      title: t("malware_alert_title"),
      desc: t("verify_status_malware_desc")
    },
    EXPLICIT: {
      color: "rgb(250, 204, 21)", 
      bg: "color-mix(in srgb, rgb(250, 204, 21) 15%, transparent)",
      border: "border-yellow-400/30",
      icon: "warning",
      title: t("verify_status_explicit"),
      desc: t("verify_status_explicit_desc")
    },
    FLAGGED: {
      color: "rgb(248, 113, 113)", 
      bg: "color-mix(in srgb, rgb(248, 113, 113) 15%, transparent)",
      border: "border-red-400/30",
      icon: "gavel",
      title: t("verify_status_flagged"),
      desc: t("verify_status_flagged_desc")
    }
  }[statusState] as any;

  const BannerNode = (
    <div className={`theme-glass-panel rounded-2xl p-6 border flex items-center gap-5 ${statusConfig.border}`} style={{ backgroundColor: statusConfig.bg }}>
      <div className={`w-14 h-14 shrink-0 rounded-xl flex items-center justify-center border shadow-inner ${statusConfig.pulse ? 'animate-pulse' : ''}`} style={{ borderColor: `color-mix(in srgb, ${statusConfig.color} 30%, transparent)`, backgroundColor: `color-mix(in srgb, var(--bg) 50%, transparent)` }}>
        <span className={`material-symbols-outlined !text-3xl ${statusConfig.pulse ? 'animate-spin-slow' : ''}`} style={{ color: statusConfig.color }}>{statusConfig.icon}</span>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: statusConfig.color }}>{statusConfig.title}</h3>
        <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 leading-relaxed max-w-sm">{statusConfig.desc}</p>
      </div>
    </div>
  );

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title={t("verify_panel_title")} subtitle={t("verify_panel_subtitle")} icon="verified" iconColorClass="theme-text-accent" widthClass="w-[700px]">
      <div className="flex flex-col h-full relative">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col gap-6">

          <button 
            onClick={handleImport}
            className={`w-full py-6 rounded-2xl border-2 border-dashed border-[var(--accent)]/30 hover:border-[var(--accent)]/60 bg-[color-mix(in_srgb,var(--accent)_2%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all flex flex-col items-center justify-center gap-3 group ${isHashing ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <span className="material-symbols-outlined !text-4xl text-[var(--accent)]/70 group-hover:text-[var(--accent)] transition-colors">
              {isHashing ? (t("icon_sync")) : (t("icon_upload_file"))}
            </span>
            <span className="text-xs font-black tracking-widest uppercase text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
              {isHashing ? (t("scanning")) : (t("verify_panel_import_btn"))}
            </span>
          </button>

          {!filePath && BannerNode}

          {filePath && (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="theme-glass-inner rounded-2xl p-6 border border-white/5 flex flex-col gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 mb-1">{t("verify_panel_file_path")}</span>
                  <span className="text-xs font-mono text-[var(--text)] break-all">{filePath.replace(/^(?:[A-Z]:)?[\/\\]Users[\/\\][^\/\\]+[\/\\]/i, '...\\')}</span>
                </div>
                
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 mb-1">{t("verify_panel_file_hash")}</span>
                  {isHashing ? (
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                      <span className="text-xs font-mono theme-text-accent animate-pulse">{t("scanning")}</span>
                    </div>
                  ) : (
                    <span className="text-sm font-mono font-bold break-all bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] p-3 rounded-xl border border-white/5 shadow-inner relative overflow-hidden" style={{ color: statusConfig.color }}>
                      {fileHash || "ERROR"}
                    </span>
                  )}
                </div>
              </div>

              {BannerNode}

              {matchedMod && (
                <div className={`theme-glass-panel rounded-2xl p-6 border flex flex-col gap-4 animate-in zoom-in-95 mt-2 bg-gradient-to-br from-transparent to-transparent ${statusState === 'MALWARE' ? 'border-red-500/30 bg-red-500/5' : statusState === 'EXPLICIT' ? 'border-yellow-400/30 bg-yellow-400/5' : 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent)]/5'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 mb-1">{t("registry_label_name")}</span>
                        <span className={`text-sm font-black uppercase tracking-widest ${statusState === 'MALWARE' ? 'text-red-500' : statusState === 'EXPLICIT' ? 'text-yellow-400' : 'theme-text-accent'}`}>{matchedMod.name}</span>
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 mt-1 uppercase tracking-widest">
                          {t("update_version")}: {matchedMod.version_label || matchedMod.version_number || "UNKNOWN"}
                        </span>
                      </div>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${statusState === 'MALWARE' ? 'border-red-500/30 bg-red-500/10' : statusState === 'EXPLICIT' ? 'border-yellow-400/30 bg-yellow-400/10' : 'border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)]'}`}>
                        <span className={`material-symbols-outlined !text-[20px] ${statusState === 'MALWARE' ? 'text-red-500' : statusState === 'EXPLICIT' ? 'text-yellow-400' : 'theme-text-accent'}`}>{statusState === 'MALWARE' ? 'skull' : statusState === 'EXPLICIT' ? 'warning' : 'check_circle'}</span>
                      </div>
                    </div>
                    {onJumpToArtifact && !isOversight && (
                      <button 
                        onClick={() => onJumpToArtifact(matchedMod)}
                        className="w-full py-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        {t("btn_link")} <span className="text-sm leading-none">&rarr;</span>
                      </button>
                    )}
                    {isOversight && onManualFlag && (
                      <button 
                        onClick={() => onManualFlag(fileHash)}
                        className="w-full py-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        {t("btn_manual_threat_flag")} <span className="text-sm leading-none">&rarr;</span>
                      </button>
                    )}
                </div>
              )}

              {fileHash && !showFlagForm && !isOversight && (
                <button 
                  onClick={() => setShowFlagForm(true)}
                  className="w-full py-4 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-2"
                >
                  <span className="material-symbols-outlined !text-sm">{t("icon_flag")}</span>
                  {t("verify_panel_flag_btn")}
                </button>
              )}

              {fileHash && !matchedMod && isOversight && onManualFlag && (
                  <button 
                    onClick={() => onManualFlag(fileHash)}
                    className="w-full py-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    <span className="material-symbols-outlined !text-sm">{t("icon_gavel")}</span>
                    {t("btn_manual_threat_flag")} <span className="text-sm leading-none">&rarr;</span>
                  </button>
              )}

              {showFlagForm && (
                <div className="theme-glass-panel border-red-500/30 rounded-2xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 mt-2">
                  <textarea
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    placeholder={t("verify_panel_flag_reason_ph")}
                    className="w-full h-24 theme-glass-inner rounded-xl p-4 text-xs focus:outline-none focus:border-red-500/50 resize-none font-medium"
                  />
                  <div className="flex justify-center items-center gap-4 mt-4 w-full">
                    <button 
                      onClick={() => {
                        if (confirmFlag) {
                          setConfirmFlag(false);
                        } else {
                          setShowFlagForm(false);
                        }
                      }}
                      className={standardButtonClass}
                    >
                      {t("shared_cancel")}
                    </button>
                    <button 
                      onClick={() => {
                        if (!confirmFlag) {
                          setConfirmFlag(true);
                        } else {
                          handleFlag();
                        }
                      }}
                      disabled={isSubmitting || !flagReason.trim()}
                      className={standardDangerButtonClass}
                    >
                      {isSubmitting ? (t("scanning")) : 
                       (confirmFlag ? (t("verify_panel_flag_confirm")) : (t("verify_panel_flag_submit")))}
                    </button>
                  </div>
                </div>
              )}

              {successMsg && (
                <div className="p-4 rounded-xl bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] text-xs font-bold text-center animate-in fade-in mt-2">
                  {successMsg}
                </div>
              )}
            </div>
          )}

          {sessionHistory.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 animate-in fade-in">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">{t("auto_session_history")}</span>
              <div className="flex flex-col gap-2">
                {sessionHistory.map((item, i) => (
                  <div key={i} 
                    className="theme-glass-panel rounded-xl p-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] cursor-pointer hover:border-[var(--accent)]/50 transition-colors"
                    onClick={() => {
                      setFilePath(item.path);
                      setFileHash(item.hash);
                      setMatchedMod(item.matchedMod || null);
                      setSuccessMsg("");
                      setShowFlagForm(false);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[var(--text)] truncate max-w-[200px]" title={item.path}>{item.path.split(/[/\\]/).pop()}</span>
                      <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60">{new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-[var(--subtext)] truncate max-w-[150px]" title={item.hash}>{item.hash}</span>
                      {item.matchedMod ? (
                        item.matchedMod.compliance_tier === 3 ? (
                          <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">{t("rating_malware")}</span>
                        ) : item.matchedMod.compliance_tier === 2 ? (
                          <span className="text-[9px] font-black text-yellow-400 uppercase tracking-widest">{t("rating_explicit")}</span>
                        ) : (
                          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{t("status_verified")}</span>
                        )
                      ) : (
                        <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">{t("auto_mismatch")}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </SidePanel>
  );
}

