import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { SidePanel, ModSearchDropdown, ViewHeader, GameVersionMultiSelect, CustomDropdown, formatDisplayName, CustomDatePicker, CustomComplianceDropdown, CustomClassificationDropdown, HubTabButton, StatTile, standardAccentGlassButtonClass, standardSuccessButtonClass, standardDangerButtonClass, standardButtonClass } from "./shared";
import ProtocolVisualizer from "./ProtocolVisualizer";
import ModStructureBuilder from "./ModStructureBuilder";
import ArchitectSupportTickets from "./ArchitectSupportTickets";
import StructureVisualizer from "./StructureVisualizer";
import ArchitectConflictMatrix from "./ArchitectConflictMatrix";
import { useLexicon } from "./LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { logArchitectAction } from "./lib/audit";
import { ModCard } from "./ModCard";
import MasonPostViewer from "./MasonPostViewer";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import { ArtifactCard, CollectionCard } from "./Cards";

const fetchAllPaginated = async (queryFn: () => any) => { let allData: any[] = []; let from = 0; const step = 999; while (true) { const { data, error } = await queryFn().range(from, from + step); if (error || !data || data.length === 0) break; allData = [...allData, ...data]; if (data.length <= step) break; from += step + 1; } return { data: allData, error: null }; };





function MasonRegistrationSidePanel({ isOpen, onClose, onCreate }: { isOpen: boolean, onClose: () => void, onCreate: (name: string) => Promise<void> }) {
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
            <h3 className="text-xl font-black tracking-widest text-[var(--text)]">{t("mason_create_title")}</h3>
            <p className="text-[9px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">{t("mason_create_subtitle")}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text)] transition-colors hover:scale-110 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            <span className="text-sm font-black">&times;</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_create_label_name")}</label>
          <input value={newMasonName} onChange={e => setNewMasonName(e.target.value)} placeholder={t("mason_create_ph_name")} className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
        </div>

        <div className="p-6 pb-12 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:scale-[1.02] text-[var(--text)] font-black text-[11px] uppercase tracking-[0.2em] rounded-xl transition-all">{t("ui_btn_cancel")}</button>
          <button onClick={handleCreate} disabled={isCreating || !newMasonName.trim()} className="flex-1 py-4 theme-bg-accent hover:opacity-90 text-[var(--bg)] font-black text-[11px] uppercase tracking-[0.2em] rounded-xl transition-all shadow-lg disabled:opacity-50">
            {isCreating ? t("mason_create_btn_creating") : t("mason_create_btn_create")}
          </button>
        </div>
      </div>
    </>
  );
}


export function FileVerificationSidePanel({ isOpen, onClose, onJumpToArtifact, isSeniorArchitect, initialHash, onManualFlag }: { isOpen: boolean, onClose: () => void, onJumpToArtifact?: (modObj: any) => void, isSeniorArchitect?: boolean, initialHash?: string, onManualFlag?: (hash: string) => void }) {
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
    
    // Create support ticket
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || "system";
    
    // Extract filename from path
    const fileName = filePath.split(/[/\\]/).pop() || "Unknown File";

    const { error } = await supabase.from('sanctuary_tickets').insert({
      author_id: userId,
      status: "ESCALATED", // Goes straight to oversight
      ticket_type: "DNA_FLAG",
      title: `Flagged File: ${fileName}`,
      description: `File Path: ${filePath}\nDNA Hash: ${fileHash}\n\nReason: ${flagReason}`,
      metadata: { file_hash: fileHash, file_path: filePath, flag_reason: flagReason }
    });

    setIsSubmitting(false);
    if (!error) {
      await logArchitectAction(`Flagged Artifact: ${fileName}`, 'sanctuary_tickets', fileName, `User provided reason: ${flagReason}`);
      setSuccessMsg(t("verify_panel_flag_success") || "Flag submitted to Oversight Command.");
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
  else if (fileHash && matchedMod) statusState = "VERIFIED";
  else if (fileHash && !matchedMod) statusState = "MISMATCH";

  const statusConfig = {
    AWAITING: {
      color: "var(--subtext)",
      bg: "transparent",
      border: "border-white/10",
      icon: t("ui_icon_pending") || "hourglass_empty",
      title: t("verify_status_awaiting") || "AWAITING ARTIFACT",
      desc: t("verify_status_awaiting_desc") || "Select a local file to extract and verify its DNA hash."
    },
    SCANNING: {
      color: "var(--accent)",
      bg: "color-mix(in srgb, var(--accent) 5%, transparent)",
      border: "border-[var(--accent)]/30",
      icon: t("ui_icon_sync") || "sync",
      title: t("verify_status_scanning") || "ANALYZING DNA",
      desc: t("verify_status_scanning_desc") || "Extracting cryptographic hash signature...",
      pulse: true
    },
    VERIFIED: {
      color: "rgb(52, 211, 153)", 
      bg: "color-mix(in srgb, rgb(52, 211, 153) 15%, transparent)",
      border: "border-emerald-400/30",
      icon: "verified_user",
      title: t("verify_status_verified") || "AUTHENTICATED",
      desc: t("verify_status_verified_desc") || "Hash perfectly matches a registered artifact in the database."
    },
    MISMATCH: {
      color: "rgb(251, 146, 60)", 
      bg: "color-mix(in srgb, rgb(251, 146, 60) 15%, transparent)",
      border: "border-orange-400/30",
      icon: "warning",
      title: t("verify_status_mismatch") || "UNVERIFIED SIGNATURE",
      desc: t("verify_status_mismatch_desc") || "This file's DNA hash does not exist in the registry. It may be modified or malicious."
    },
    FLAGGED: {
      color: "rgb(248, 113, 113)", 
      bg: "color-mix(in srgb, rgb(248, 113, 113) 15%, transparent)",
      border: "border-red-400/30",
      icon: "gavel",
      title: t("verify_status_flagged") || "ESCALATED TO OVERSIGHT",
      desc: t("verify_status_flagged_desc") || "Artifact has been flagged for manual review by Senior Architects."
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
    <SidePanel isOpen={isOpen} onClose={onClose} title={t("verify_panel_title") || "DNA VERIFICATION"} subtitle={t("verify_panel_subtitle") || "IMPORT AN ARTIFACT TO VERIFY ITS HASH"} icon="verified" iconColorClass="theme-text-accent" widthClass="w-[700px]">
      <div className="flex flex-col h-full relative">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col gap-6">

          <button 
            onClick={handleImport}
            className={`w-full py-6 rounded-2xl border-2 border-dashed border-[var(--accent)]/30 hover:border-[var(--accent)]/60 bg-[color-mix(in_srgb,var(--accent)_2%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all flex flex-col items-center justify-center gap-3 group ${isHashing ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <span className="material-symbols-outlined !text-4xl text-[var(--accent)]/70 group-hover:text-[var(--accent)] transition-colors">
              {isHashing ? (t("ui_icon_sync") || "sync") : (t("ui_icon_upload_file") || "upload_file")}
            </span>
            <span className="text-xs font-black tracking-widest uppercase text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
              {isHashing ? (t("cmd_scanning") || "SCANNING...") : (t("verify_panel_import_btn") || "IMPORT ARTIFACT")}
            </span>
          </button>

          {!filePath && BannerNode}

          {filePath && (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="theme-glass-inner rounded-2xl p-6 border border-white/5 flex flex-col gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 mb-1">{t("verify_panel_file_path") || "FILE PATH"}</span>
                  <span className="text-xs font-mono text-[var(--text)] break-all">{filePath}</span>
                </div>
                
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 mb-1">{t("verify_panel_file_hash") || "DNA HASH"}</span>
                  {isHashing ? (
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                      <span className="text-xs font-mono theme-text-accent animate-pulse">{t("cmd_scanning") || "SCANNING..."}</span>
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
                <div className="theme-glass-panel rounded-2xl p-6 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex flex-col gap-4 animate-in zoom-in-95 mt-2 bg-gradient-to-br from-[var(--accent)]/5 to-transparent">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 mb-1">{t("registry_label_name") || "MATCHED ARTIFACT"}</span>
                        <span className="text-sm font-black theme-text-accent uppercase tracking-widest">{matchedMod.name}</span>
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 mt-1 uppercase tracking-widest">
                          {t("verify_panel_version") || "VERSION"}: {matchedMod.version_label || matchedMod.version_number || "UNKNOWN"}
                        </span>
                      </div>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-inner border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)]">
                        <span className="material-symbols-outlined !text-[20px] theme-text-accent">check_circle</span>
                      </div>
                    </div>
                    {onJumpToArtifact && !isSeniorArchitect && (
                      <button 
                        onClick={() => onJumpToArtifact(matchedMod)}
                        className="w-full py-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        {t("modal_btn_link") || "VIEW ARTIFACT"} <span className="text-sm leading-none">&rarr;</span>
                      </button>
                    )}
                    {isSeniorArchitect && onManualFlag && (
                      <button 
                        onClick={() => onManualFlag(fileHash)}
                        className="w-full py-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        {t("sa_btn_manual_threat_flag") || "MANUAL THREAT FLAG"} <span className="text-sm leading-none">&rarr;</span>
                      </button>
                    )}
                </div>
              )}

              {fileHash && !showFlagForm && !isSeniorArchitect && (
                <button 
                  onClick={() => setShowFlagForm(true)}
                  className="w-full py-4 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-2"
                >
                  <span className="material-symbols-outlined !text-sm">{t("ui_icon_report") || "flag"}</span>
                  {t("verify_panel_flag_btn") || "FLAG ARTIFACT"}
                </button>
              )}

              {showFlagForm && (
                <div className="theme-glass-panel border-red-500/30 rounded-2xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 mt-2">
                  <textarea
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    placeholder={t("verify_panel_flag_reason_ph") || "ENTER REASON FOR OVERSIGHT..."}
                    className="w-full h-24 theme-glass-inner rounded-xl p-4 text-xs focus:outline-none focus:border-red-500/50 resize-none font-medium"
                  />
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        if (confirmFlag) {
                          setConfirmFlag(false);
                        } else {
                          setShowFlagForm(false);
                        }
                      }}
                      className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--text)] transition-colors rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                    >
                      {t("ui_btn_cancel") || "CANCEL"}
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
                      className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl border border-red-500/30 ${confirmFlag ? 'bg-red-500/20 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]'} disabled:opacity-50 disabled:pointer-events-none`}
                    >
                      {isSubmitting ? (t("cmd_scanning") || "SCANNING...") : 
                       (confirmFlag ? (t("verify_panel_flag_confirm") || "CONFIRM SUBMISSION") : (t("verify_panel_flag_submit") || "SUBMIT FLAG"))}
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
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">SESSION HISTORY</span>
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
                      {item.matchedModName ? (
                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">VERIFIED</span>
                      ) : (
                        <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">MISMATCH</span>
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




export default function ArchitectHub({ userRole, equipPlaySet, modList, onOpenDossier }: any) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState("command_center");
  const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);

  const [registrySearch, setRegistrySearch] = useState("");
  const [registryTargetMod, setRegistryTargetMod] = useState<any>(null);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [inspectMod, setInspectMod] = useState<any>(null);

  const handleNavigate = (tab: string, search: string = "", targetMod: any = null) => {
    setActiveTab(tab);
    if (search) setRegistrySearch(search);
    if (targetMod) setRegistryTargetMod(targetMod);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-32 relative">
      <ViewHeader 
        title={t("hub_title")} 
        subtitle={t("hub_subtitle")} 
        icon={t("ui_icon_analytics") || "analytics"} 
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30" 
      >
        <div className="flex items-center theme-glass-panel rounded-2xl p-1 border border-white/10 shadow-inner">
          <button 
            onClick={() => setIsVerifyPanelOpen(true)}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black"
          >
            <span className="material-symbols-outlined text-xl normal-case">{t("ui_icon_verified") || "verified"}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{t("architect_btn_verify_hash") || "VERIFY HASH"}</span>
          </button>
        </div>
      </ViewHeader>

        <div className="flex flex-col gap-1 w-full mb-4 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar p-1 theme-glass-panel rounded-2xl border border-white/5 shadow-inner">
          <HubTabButton id="command_center" icon={t("ui_icon_pc") || "desktop_windows"} label={t("hub_tab_command_screen")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="registry" icon={t("ui_icon_inventory") || "inventory_2"} label={t("hub_tab_registry")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
                    <HubTabButton id="cc_sets" icon={t("ui_icon_folder") || "folder"} label={t("hub_tab_cc_sets")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="protocols" icon={t("ui_icon_link") || "link"} label={t("hub_tab_protocols")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="structure" icon={t("ui_icon_architecture") || "architecture"} label={t("hub_tab_structure")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="matrix" icon={t("ui_icon_security") || "security"} label={t("hub_tab_matrix")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="queue" icon={t("ui_icon_search") || "search"} label={t("hub_tab_queue")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="mason_queue" icon={t("ui_icon_mason") || "construction"} label={t("hub_tab_mason_queue")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="marketplace_reports" icon={t("ui_icon_report") || "flag"} label={t("hub_tab_marketplace_reports")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="support_tickets" icon={t("ui_icon_local_activity") || "local_activity"} label={(t("hub_tab_support_tickets") || "SUPPORT QUEUE").replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="lab" icon={t("ui_icon_diagnostics") || "monitor_heart"} label={t("hub_tab_diagnostics")?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          </div>
        </div>

      <FileVerificationSidePanel 
        isOpen={isVerifyPanelOpen} 
        onClose={() => setIsVerifyPanelOpen(false)} 
        onJumpToArtifact={(mod) => {
          setInspectMod(mod);
        }}
      />

        <div className="w-full flex-1 flex flex-col min-h-0">
          {activeTab === "command_center" && <ArchitectCommandScreen onNavigate={handleNavigate} setViewingPost={setViewingPost} />}
          <ArchitectRegistry isActiveTab={activeTab === "registry"} initialSearch={registrySearch} onClearSearch={() => setRegistrySearch("")} initialActiveMod={registryTargetMod || inspectMod} onClearActiveMod={() => { setRegistryTargetMod(null); setInspectMod(null); }} modList={modList} />
        {activeTab === "protocols" && <ProtocolVisualizer isArchitect={true} />}
                {activeTab === "cc_sets" && <CCSetForge />}
        {activeTab === "structure" && <StructureVisualizer isArchitect={true} />}
        {activeTab === "queue" && <ScoutQueue modList={modList || []} />}
        {activeTab === "mason_queue" && <MasonQueue modList={modList || []} />}
        {activeTab === "marketplace_reports" && <MarketplaceReportsViewer onOpenDossier={onOpenDossier} />}
          {activeTab === "support_tickets" && <ArchitectSupportTickets />}
          {activeTab === "lab" && <ProvingGrounds modList={modList || []} />}
          {activeTab === "matrix" && <ArchitectConflictMatrix modList={modList || []} />}
        </div>
      {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId="architect" />}

    </div>
  );
}

function DashboardStatTile({ icon, number, label, colorClass, onClick }: any) {
  return (
    <div onClick={onClick} className={`flex-1 flex flex-col justify-center items-start gap-1 p-6 rounded-3xl border border-white/10 backdrop-blur-md ${colorClass} transition-all cursor-pointer shadow-lg relative overflow-hidden group hover:-translate-y-1 hover:shadow-xl`}>
       <div className="absolute inset-0 bg-current opacity-0 group-hover:opacity-[0.15] transition-opacity duration-300" />
       <div className="flex items-center gap-3 w-full relative z-10">
           <span className="text-3xl opacity-50 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-hover:scale-110 transition-all drop-shadow-md">{icon}</span>
           <span className={`text-4xl lg:text-5xl font-black drop-shadow-lg tracking-tighter`}>{number}</span>
       </div>
       <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-[var(--subtext)] opacity-60 mt-2">{label}</span>
    </div>
  );
}

function ArchitectCommandScreen({ onNavigate, setViewingPost }: any) {
  const { t } = useLexicon();
  const [stats, setStats] = useState({ 
    scoutQueue: 0, masonQueue: 0, marketplaceReports: 0, 
    nsfw: 0, explicit: 0, supportTickets: 0,
    totalArtifacts: 0, unverifiedMods: 0, tier4Conflicts: 0, tier3Conflicts: 0, labQueue: 0 
  });
  const [broadcasts, setBroadcasts] = useState<any[]>([]);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      const { data } = await supabase.from('system_broadcasts')
        .select('*')
        .in('target_audience', ['All', 'Architects', 'all', 'architects'])
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (data) setBroadcasts(data);
    };
    fetchBroadcasts();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      const { count: scoutQueueCount } = await supabase.from('scout_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: masonQueueCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('status', 'under_review');
      const { count: marketplaceReportsCount } = await supabase.from('marketplace_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      
      const { data: ticketsDataRaw } = await supabase.from('sanctuary_tickets')
        .select('created_at, ticket_type, status, metadata')
        .in('status', ['NEW', 'OPEN', 'PENDING', 'ESCALATED', 'INVESTIGATING', 'new', 'open', 'pending', 'escalated', 'investigating']);
      const { data: catData } = await supabase.from('sanctuary_support_categories').select('*');
      
      let supportTicketsCount = 0;
      if (ticketsDataRaw && catData) {
        const ticketsData = ticketsDataRaw.map(t => ({
          ...t,
          target_mod_id: t.metadata?.target_mod_id,
          category: t.ticket_type
        }));

        const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        const targetModIds = [...new Set(ticketsData.filter(t => t.target_mod_id).map(t => t.target_mod_id as string))].filter(Boolean).filter(isValidUUID);
        const modAuthorMap: Record<string, string> = {};
        if (targetModIds.length > 0) {
          const { data: modsData } = await supabase.from('mods').select('id, mason_id').in('id', targetModIds);
          modsData?.forEach(m => modAuthorMap[m.id] = m.mason_id);
        }

        supportTicketsCount = ticketsData.filter(t => {
          const typeStr = t.category;
          const cat = catData.find(c => c.category_name === typeStr || c.category_code === typeStr);
          const baseDest = cat?.ticket_destination || 'architect';
          const escalationPath = cat?.escalation_path || 'standard';

          const ageMs = Date.now() - new Date(t.created_at).getTime();
          const hoursOld = ageMs / (1000 * 60 * 60);

          let escalationTiers = 0;
          if (escalationPath === 'urgent') {
            escalationTiers = Math.floor(hoursOld / 24);
          } else if (escalationPath === 'standard') {
            escalationTiers = Math.floor(hoursOld / 72);
          }

          const tiers = ['mod_author', 'architect', 'senior_architect', 'wayfinder'];
          let currentTierIndex = tiers.indexOf(baseDest);
          if (currentTierIndex === -1) currentTierIndex = 1;

          let effectiveTierIndex = Math.min(currentTierIndex + escalationTiers, tiers.length - 1);
          let dest = tiers[effectiveTierIndex];

          if (t.status?.toUpperCase() === 'ESCALATED' && dest !== 'wayfinder') {
            const idx = tiers.indexOf(dest);
            dest = tiers[Math.min(idx + 1, tiers.length - 1)];
          }

          if (dest === 'mod_author') {
            const modAuthorId = t.target_mod_id ? modAuthorMap[t.target_mod_id] : null;
            if (!modAuthorId) dest = 'architect';
          }

          return dest === 'architect';
        }).length;
      }
      const { count: nsfwCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 1);
      const { count: explicitCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 2);
      
      const { count: totalArtifactsCount } = await supabase.from('mods').select('*', { count: 'exact', head: true });
      const { count: unverifiedModsCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('status', 'unverified');
      const { count: tier4ConflictsCount } = await supabase.from('logical_conflicts').select('*', { count: 'exact', head: true }).eq('severity_rank', 4);
      const { count: tier3ConflictsCount } = await supabase.from('logical_conflicts').select('*', { count: 'exact', head: true }).eq('severity_rank', 3);
      const { count: labQueueCount } = await supabase.from('solder_lab_logs').select('*', { count: 'exact', head: true });

      setStats({
        scoutQueue: scoutQueueCount || 0,
        masonQueue: masonQueueCount || 0,
        marketplaceReports: marketplaceReportsCount || 0,
        supportTickets: supportTicketsCount || 0,
        nsfw: nsfwCount || 0,
        explicit: explicitCount || 0,
        totalArtifacts: totalArtifactsCount || 0,
        unverifiedMods: unverifiedModsCount || 0,
        tier4Conflicts: tier4ConflictsCount || 0,
        tier3Conflicts: tier3ConflictsCount || 0,
        labQueue: labQueueCount || 0
      });
    };
    fetchStats();
  }, []);

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pr-4 pb-32 mt-8">
      {/* Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 w-full">
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_search") || "search"}</span>} number={stats.scoutQueue} label="SCOUT QUEUE" colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20" onClick={() => onNavigate("queue")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_handyman") || "handyman"}</span>} number={stats.masonQueue} label="MASON QUEUE" colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" onClick={() => onNavigate("mason_queue")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_report") || "flag"}</span>} number={stats.marketplaceReports} label="REPORTS QUEUE" colorClass="border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" onClick={() => onNavigate("marketplace_reports")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_local_activity") || "local_activity"}</span>} number={stats.supportTickets} label="SUPPORT QUEUE" colorClass="border-indigo-500/30 text-indigo-500 hover:border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20" onClick={() => onNavigate("support_tickets")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_nsfw") || "18_up_rating"}</span>} number={stats.nsfw} label="NSFW REPORTS" colorClass="border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20" onClick={() => onNavigate('registry', 'nsfw')} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_explicit") || "block"}</span>} number={stats.explicit} label="EXPLICIT REPORTS" colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => onNavigate('registry', 'explicit')} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full">
        {/* Left Column - Wayfinder Comms */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6 shrink-0">{t("wayfinder_comms") || "WAYFINDER COMMS"}</h2>
          
          <div className="flex flex-col gap-8 w-full">
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
               {broadcasts.length > 0 ? broadcasts.map((post, index) => {
                 const isFeatured = index === 0;
                 return (
                 <div key={post.id} onClick={() => setViewingPost({ ...post, content: post.message, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className={`group cursor-pointer w-full theme-glass-panel rounded-[2rem] overflow-hidden hover:scale-[1.01] transition-all shadow-xl hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 flex flex-col ${isFeatured ? 'xl:flex-row xl:col-span-2 min-h-[16rem] xl:min-h-[18rem]' : 'min-h-[10rem]'}`}>
                   {isFeatured && (
                     <div className="w-full relative overflow-hidden bg-[var(--bg)] border-b xl:w-1/2 xl:border-b-0 xl:border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center">
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent" />
                        <span className="material-symbols-outlined !text-6xl grayscale opacity-30 drop-shadow-lg group-hover:scale-110 group-hover:opacity-100 transition-all duration-500 group-hover:grayscale-0">{t("ui_icon_satellite") || "satellite_alt"}</span>
                     </div>
                   )}
                   <div className="flex-1 p-8 flex flex-col min-w-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--bg)_40%,transparent)] to-transparent relative z-10">
                      <div className="flex items-center gap-2 mb-4 shrink-0 flex-wrap">
                        <span className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg">{post.category || t("wayfinder_update") || "UPDATE"}</span>
                        <span className="px-3 py-1 theme-glass-inner text-[var(--text)] text-[9px] font-black uppercase tracking-widest rounded-lg">{t("wayfinder_system") || "SYSTEM"}</span>
                      </div>
                      <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors mb-4 leading-normal line-clamp-2">{post.title}</h3>
                      {isFeatured && <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 mb-6 line-clamp-3">{post.message}</p>}
                      <div className="mt-auto flex items-center justify-between pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                         <span className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[12px]">{t("ui_icon_calendar_today") || "calendar_today"}</span> {new Date(post.created_at).toLocaleDateString()}</span>
                         <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 text-[var(--accent)]">{t("wayfinder_read_more") || "READ MORE"} <span className="material-symbols-outlined !text-lg">{t('arrow_forward') || 'arrow_forward'}</span></span>
                       </div>
                    </div>
                 </div>
                 );
               }) : (
                 <div className="w-full xl:col-span-2 theme-glass-panel rounded-[2rem] p-12 text-center text-[var(--subtext)] opacity-50 uppercase font-black text-sm tracking-widest border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                   {t("system_no_broadcasts") || "NO RECENT BROADCASTS"}
                 </div>
               )}
             </div>

             <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mt-4 mb-2 shrink-0">{t("hub_metrics") || "HUB METRICS"}</h2>
             <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-orange-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-orange-500">{stats.totalArtifacts}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_total_artifacts") || "TOTAL ARTIFACTS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-blue-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-blue-500">{stats.unverifiedMods}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_unverified") || "UNVERIFIED MODS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-red-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-red-500">{stats.tier4Conflicts}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_tier4") || "TIER 4 CONFLICTS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-orange-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-orange-500">{stats.tier3Conflicts}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_tier3") || "TIER 3 CONFLICTS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-blue-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-blue-500">{stats.labQueue}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_lab_queue") || "LAB QUEUE"}</span>
                </div>
             </div>
          </div>
        </div>
        
        {/* Right Column - Quick Links */}
        <div className="w-[380px] shrink-0 flex flex-col">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6">{t("hub_quick_links") || "QUICK LINKS"}</h2>
          <div className="flex flex-col gap-4">
             <button onClick={() => onNavigate("protocols")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_link") || "link"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_protocol") || "PROTOCOL ORCHESTRATOR"}</h3>
                   <span className="text-[8px] uppercase font-bold text-blue-400 opacity-80 group-hover:text-blue-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></span> {t("hub_ql_global_rules") || "GLOBAL RULES"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => onNavigate("structure")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_architecture") || "architecture"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("structure_title") || "STRUCTURE MATRIX"}</h3>
                   <span className="text-[8px] uppercase font-bold text-amber-400 opacity-80 group-hover:text-amber-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"></span> {t("hub_ql_asset_org") || "ASSET ORGANIZATION"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => onNavigate("matrix")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_security") || "security"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_conflict") || "CONFLICT MATRIX"}</h3>
                   <span className="text-[8px] uppercase font-bold text-rose-400 opacity-80 group-hover:text-rose-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]"></span> {t("hub_ql_logical_issues") || "LOGICAL ISSUES"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => onNavigate("lab")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                    <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_diagnostics") || "monitor_heart"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_homestead") || "HOMESTEAD DIAGNOSTICS"}</h3>
                   <span className="text-[8px] uppercase font-bold text-emerald-400 opacity-80 group-hover:text-emerald-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span> {t("hub_ql_system_health") || "SYSTEM HEALTH"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => onNavigate("support_tickets")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_local_activity") || "local_activity"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_support") || "SUPPORT QUEUE"}</h3>
                   <span className="text-[8px] uppercase font-bold text-indigo-400 opacity-80 group-hover:text-indigo-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]"></span> {t("hub_ql_help_requests") || "HELP REQUESTS"}</span>
                 </div>
               </div>
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}



function ArchitectRegistry({ isActiveTab = true, initialSearch = "", onClearSearch, initialActiveMod = null, onClearActiveMod, modList }: any = {}) {
  const { t } = useLexicon();
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeMod, setActiveMod] = useState<any | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [masonsList, setMasonsList] = useState<any[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");

  // Pagination
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const PAGE_SIZE = 50;

  // Mason Side Panel State
  const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreatingMason, setIsCreatingMason] = useState(false);

  useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
      if (onClearSearch) onClearSearch();
    }
  }, [initialSearch]);

  useEffect(() => {
    if (initialActiveMod) {
      setActiveMod(initialActiveMod);
      if (onClearActiveMod) onClearActiveMod();
    }
  }, [initialActiveMod]);

  const fetchData = async (reset = false) => {
    setIsLoading(true);
    const currentPage = reset ? 0 : page;
    let query = supabase.from('mods').select('*, mod_versions(id, dna_hash, version_label, game_version)', { count: 'exact' });

    if (activeCategory !== "ALL") {
      query = query.eq('category_override', activeCategory);
      if (activeCategory === "CAS" && activeSubType !== "ALL") {
        query = query.eq('sub_type', activeSubType);
      }
    }
    
    if (statusFilter !== "ALL") {
      query = query.eq('status', statusFilter);
    }

    if (searchTerm) {
       if (searchTerm.toLowerCase() === 'nsfw') {
         query = query.eq('compliance_tier', 1);
       } else if (searchTerm.toLowerCase() === 'explicit') {
         query = query.eq('compliance_tier', 2);
       } else {
         query = query.ilike('name', `%${searchTerm}%`);
       }
    }

    const { data, error, count } = await query
      .order('name', { ascending: true })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (!error && data) {
      if (reset) {
        setCloudMods(data);
      } else {
        setCloudMods(prev => {
          const newIds = new Set(data.map(d => d.id));
          return [...prev.filter(p => !newIds.has(p.id)), ...data];
        });
      }
      setHasMore(count !== null && (currentPage + 1) * PAGE_SIZE < count);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    setPage(0);
    fetchData(true);
  }, [activeCategory, activeSubType, statusFilter, searchTerm]);

  useEffect(() => {
    if (page > 0) fetchData(false);
  }, [page]);

  useEffect(() => {
    const fetchMasons = async () => {
      const { data } = await supabase.from('masons').select('id, name').order('name');
      if (data) setMasonsList(data);
    };
    fetchMasons();
  }, []);

  const handleCreateMason = async () => {
    if (!newMasonName.trim()) return;
    setIsCreatingMason(true);
    const newId = crypto.randomUUID();
    const { error } = await supabase.from('masons').insert([{ id: newId, name: newMasonName }]);
    if (!error) {
      const { data: mData } = await supabase.from('masons').select('id, name').order('name');
      if (mData) setMasonsList(mData);
      setActiveMod({...activeMod, mason_id: newId});
      setIsMasonPanelOpen(false);
      setNewMasonName("");
    }
    setIsCreatingMason(false);
  };

  const handleCommitChanges = async () => {
    if (!activeMod) return;
    setIsCommitting(true);
    try {
      const { error } = await supabase.from('mods').update({
        name: activeMod.name,
        category_override: activeMod.category_override,
        sub_type: activeMod.sub_type,
          file_extension: activeMod.file_extension,
        status: activeMod.status,
        url: activeMod.url,
        image_url: activeMod.image_url,
        description: activeMod.description,
        compatible_versions: activeMod.compatible_versions,
        family_slug: activeMod.family_slug,
        mason_id: activeMod.mason_id,
        compliance_tier: activeMod.compliance_tier,
        folder_structure: activeMod.folder_structure || [],
        updated_at: new Date().toISOString()
      }).eq('id', activeMod.id);

      if (!error) {
        logArchitectAction(`Updated Mod Metadata`, `mods`, activeMod.name);
        alert(`[${activeMod.name}] ${t("alert_saved") || "Saved successfully!"}`);
        setPage(0);
        fetchData(true);
      } else {
        alert((t("alert_error") || "Error: ") + error.message);
      }
    } catch (err: any) {
      alert((t("alert_error") || "Error: ") + err.message);
    }
    setIsCommitting(false);
  };

  return (
    <>
      <div className={`flex flex-col gap-6 pb-20 w-full h-full relative ${isActiveTab ? '' : 'hidden'}`}>
        <div className="flex items-center justify-between mb-2 pb-4 px-6 pt-4 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl theme-glass-panel border border-[var(--accent)]/30 flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]">
              <span className="material-symbols-outlined !text-[24px] theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_inventory") || "inventory_2"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-2xl font-black theme-text-accent uppercase tracking-widest drop-shadow-md">{t("hub_tab_registry") || "ARTIFACTS"}</h2>
            </div>
          </div>
          
          <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
            <input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder={t("registry_search_placeholder") || "Search ID or Name..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("ui_icon_close") || "close"}</span>
              </button>
            )}
          </div>

          <div className="w-40 relative z-50 h-12">
            <CustomDropdown disableTint={true}
              value={activeCategory}
              onChange={(val: string[]) => { setActiveCategory(val[0]); setActiveSubType("ALL"); }}
              options={[
                { id: "ALL", label: t("vault_cat_all") || "ALL CLASSES" },
                { id: "CAS", label: t("vault_cat_cas") || "CAS" },
                { id: "BuildBuy", label: t("vault_cat_buildbuy") || "BUILD/BUY" },
                { id: "Script", label: t("vault_cat_script") || "SCRIPT" },
                { id: "Animation", label: t("vault_cat_animation") || "ANIMATION" },
                { id: "Core", label: t("vault_cat_core") || "CORE" }
              ]}
            />
          </div>

          {activeCategory === "CAS" && (
            <div className="w-40 relative z-50 h-12 animate-in fade-in slide-in-from-right-4">
              <CustomDropdown disableTint={true}
                value={activeSubType}
                onChange={(val: string[]) => setActiveSubType(val[0])}
                options={[
                  { id: "ALL", label: t("vault_sub_all") || "ALL CAS" },
                  { id: "Tattoo", label: t("vault_sub_tattoo") || "TATTOO" },
                  { id: "Hair", label: t("vault_sub_hair") || "HAIR" },
                  { id: "Clothing", label: t("vault_sub_clothing") || "CLOTHING" }
                ]}
              />
            </div>
          )}

          <div className="w-48 relative z-50 h-12">
             <CustomDropdown disableTint={true} value={statusFilter} onChange={(v: string[]) => setStatusFilter(v[0])} options={[{id: "ALL", label: "ALL STATUS"}, {id: "verified", label: "VERIFIED"}, {id: "unverified", label: "UNVERIFIED"}, {id: "broken", label: "BROKEN"}, {id: "deprecated", label: "DEPRECATED"}]} />
          </div>
        </div>
      </div>

      <div className="p-6 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6 pr-2">
          {cloudMods.map((mod: any) => (
              <ArtifactCard 
                key={mod.id} 
                mod={mod} 
                activeModId={activeMod?.id} 
                onClick={() => setActiveMod(mod)} 
              />
          ))}
        </div>
        
        {hasMore && (
          <div className="w-full flex justify-center mt-12 mb-8">
            <button 
              onClick={() => setPage(p => p + 1)} 
              disabled={isLoading}
              className="px-8 py-3 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/5 hover:border-[var(--accent)]/50 transition-all font-black text-[10px] uppercase tracking-widest text-[var(--text)] flex items-center gap-2"
            >
              {isLoading ? (
                <><span className="material-symbols-outlined animate-spin !text-[16px]">sync</span> {t("ui_btn_loading") || "LOADING..."}</>
              ) : (
                <><span className="material-symbols-outlined !text-[16px]">expand_more</span> {t("ui_btn_load_more") || "LOAD MORE"}</>
              )}
            </button>
          </div>
        )}
      </div>
      </div>

      <SidePanel
        isOpen={!!activeMod}
        onClose={() => setActiveMod(null)}
        title={activeMod?.name || t("mason_unnamed_artifact") || "UNNAMED ARTIFACT"}
        subtitle={`UUID: ${activeMod?.id}`}
        icon={t("ui_icon_inventory") || "inventory_2"}
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button onClick={() => setActiveMod(null)} disabled={isCommitting} className={standardButtonClass}>
              {t("shared_cancel") || "CANCEL"}
            </button>
            <button onClick={handleCommitChanges} disabled={isCommitting} className={standardAccentGlassButtonClass}>
              {isCommitting ? (t("registry_committing") || "COMMITTING...") : (t("registry_commit_changes") || "COMMIT CHANGES")}
            </button>
          </div>
        }
      >
        {activeMod && (
          <div className="flex flex-col gap-6 pb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_name") || "NAME"}</label>
                  <input value={activeMod.name || ""} onChange={e => setActiveMod({...activeMod, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_mason") || "MASON"}</label>
                  <div className="flex gap-2 relative">
                    <div className="flex-1 min-w-0">
                      <CustomMasonDropdown 
                        value={activeMod.mason_id} 
                        options={masonsList} 
                        onChange={(id: string) => setActiveMod({...activeMod, mason_id: id})} 
                      />
                    </div>
                    <button onClick={() => setIsMasonPanelOpen(true)} className="bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-5 rounded-xl font-black transition-colors shrink-0">
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class") || "CLASSIFICATION"}</label>
                  <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(newType: string) => setActiveMod({...activeMod, category_override: newType})} />
                </div>
                
                <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_file_ext") || "FILE EXTENSION"}</label>
                    <input value={activeMod.file_extension || ""} onChange={e => setActiveMod({...activeMod, file_extension: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder="e.g. .package, .ts4script" />
                  </div>
                  <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_subcat") || "SUB-CLASS"}</label>
                  <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({...activeMod, sub_type: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder="e.g. Tuning, Object, CAS" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_desc") || "DESCRIPTION"}</label>
                  <textarea value={activeMod.description || ""} onChange={e => setActiveMod({...activeMod, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-24 resize-none focus:outline-none focus:theme-border-accent custom-scrollbar" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image") || "IMAGE URL"}</label>
                <input value={activeMod.image_url || ""} onChange={e => setActiveMod({...activeMod, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder="https://..." />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-1">
                    {t("registry_label_version") || "VERSION"} 
                  </label>
                  <input value={activeMod.latest_version || ""} onChange={e => setActiveMod({ ...activeMod, latest_version: e.target.value })} placeholder="e.g. 1.0, 1.1, 1.2" className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--subtext)] text-sm font-bold focus:outline-none focus:theme-border-success" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url") || "DOWNLOAD URL"}</label>
                  <input value={activeMod.url || ""} onChange={e => setActiveMod({...activeMod, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 theme-text-accent text-sm font-bold focus:outline-none focus:theme-border-accent" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_status") || "STATUS"}</label>
                  <CustomStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({...activeMod, status: newStatus})} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_safety") || "SAFETY TIER"}</label>
                  <CustomComplianceDropdown value={activeMod.compliance_tier || 0} onChange={(newTier: number) => setActiveMod({...activeMod, compliance_tier: newTier})} includeTier3={false} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_game_versions") || "GAME VERSIONS"}</label>
                <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v: string[]) => setActiveMod({...activeMod, compatible_versions: v})} />
              </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isMasonPanelOpen}
        onClose={() => setIsMasonPanelOpen(false)}
        title={t("mason_create_title") || "CREATE MASON"}
        icon="person_add"
        widthClass="w-[350px]"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button onClick={() => setIsMasonPanelOpen(false)} className={standardButtonClass}>
              {t("shared_cancel") || "CANCEL"}
            </button>
            <button onClick={handleCreateMason} className={standardAccentGlassButtonClass}>
              {t("mason_create_btn_create") || "CREATE"}
            </button>
          </div>
        }
      >
        <div className="p-6">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_create_label_name") || "MASON NAME"}</label>
          <input value={newMasonName} onChange={e => setNewMasonName(e.target.value)} placeholder={t("mason_create_ph_name") || "Enter name..."} className="theme-glass-inner rounded-xl px-5 h-12 mt-2 w-full text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
        </div>
      </SidePanel>
    </>
  )
}





function CCSetForge() {
  const { t } = useLexicon();
  const [sets, setSets] = useState<any[]>([]);
  const [activeSet, setActiveSet] = useState<any | null>(null);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  
  // Create Set State
  const [setName, setSetName] = useState("");
  const [setMasonId, setSetMasonId] = useState("");
  const [setSetUrl, setSetSetUrl] = useState("");
  const [setTier, setSetTier] = useState(0);
  
  // Side Panels
  const [isForgePanelOpen, setIsForgePanelOpen] = useState(false);
  const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreatingMason, setIsCreatingMason] = useState(false);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  
  // Active Set Manage State
  const [isSaving, setIsSaving] = useState(false);
  const [manifestMembers, setManifestMembers] = useState<any[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchSets = async () => {
    const { data } = await supabase.from('cc_sets').select('*').order('name');
    if (data) setSets(data);
  };

  const fetchManifest = async (setId: string) => {
    const { data } = await supabase.from('cc_set_members')
      .select('id, mod_id, mods(id, name, image_url, status, category_override, created_at, mason_id, master_author, file_extension)')
      .eq('set_id', setId);
    if (data) setManifestMembers(data);
  };

  const searchCCAssets = async () => {
    setIsSearching(true);
    const { data } = await supabase.from('mods')
      .select('id, name, image_url, master_author, masons(name)')
      .ilike('name', `%${assetSearch}%`)
      .limit(20);
    if (data) setAvailableAssets(data);
    setIsSearching(false);
  };

  useEffect(() => {
    fetchSets();
    const fetchMasons = async () => {
      const { data } = await supabase.from('masons').select('id, name').order('name');
      if (data) setMasonsList(data);
    };
    fetchMasons();
  },[]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => { if (assetSearch) searchCCAssets(); }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [assetSearch]);

  const handleSelectSet = (setItem: any) => { 
    setActiveSet(setItem); 
    fetchManifest(setItem.id); 
  };

  const createSet = async () => {
    if (!setName) return;
    const payload: any = { 
      name: setName, 
      is_official: true, 
      compliance_tier: setTier,
      mason_id: (setMasonId && setMasonId.trim() !== "") ? setMasonId : null,
      url: (setSetUrl && setSetUrl.trim() !== "") ? setSetUrl : null
    };

    const { data, error } = await supabase.from('cc_sets').insert([payload]).select().single();
    if (!error && data) { 
      logArchitectAction("Created CC Set", "cc_sets", setName);
      setSets([...sets, data].sort((a,b) => a.name.localeCompare(b.name))); 
      setSetName(""); 
      setSetMasonId(""); 
      setSetSetUrl("");
      setSetTier(0); 
      setIsForgePanelOpen(false);
    }
  };

  const saveSetMeta = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    const { error } = await supabase.from('cc_sets').update({
      name: activeSet.name,
      image_url: activeSet.image_url,
      url: activeSet.url,
      mason_id: activeSet.mason_id,
      compliance_tier: activeSet.compliance_tier
    }).eq('id', activeSet.id);

    if (!error) {
      logArchitectAction("Updated CC Set Metadata", "cc_sets", activeSet.name);
      await fetchSets();
      alert(`[${activeSet.name}] ${t("alert_saved") || "Saved successfully!"}`);
    } else {
      alert((t("alert_error") || "Error: ") + error.message);
    }
    setTimeout(() => setIsSaving(false), 500);
  };

  const addToManifest = async (modId: string) => {
    if (!activeSet) return;
    await supabase.from('cc_set_members').upsert({ set_id: activeSet.id, mod_id: modId });
    logArchitectAction(`Added Mod ID ${modId} to CC Set`, "cc_sets", activeSet.name);
    fetchManifest(activeSet.id);
  };

  const removeFromManifest = async (memberId: string, modName: string) => {
    await supabase.from('cc_set_members').delete().eq('id', memberId);
    if (activeSet) {
      logArchitectAction(`Removed Mod ${modName} from CC Set`, "cc_sets", activeSet.name);
      fetchManifest(activeSet.id);
    }
  };

  const handleDeleteSet = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    await supabase.from('cc_set_members').delete().eq('set_id', activeSet.id);
    await supabase.from('cc_sets').delete().eq('id', activeSet.id);
    logArchitectAction(`Deleted CC Set`, "cc_sets", activeSet.name);
    setActiveSet(null);
    setManifestMembers([]);
    fetchSets();
    setIsSaving(false);
  };

  const handleCreateMason = async () => {
    if (!newMasonName.trim()) return;
    setIsCreatingMason(true);
    const newId = crypto.randomUUID();
    const { error } = await supabase.from('masons').insert([{ id: newId, name: newMasonName }]);
    if (!error) {
      setSetMasonId(newId);
      if(activeSet) setActiveSet({...activeSet, mason_id: newId});
      setIsMasonPanelOpen(false);
      setNewMasonName("");
    }
    setIsCreatingMason(false);
  };

  const filteredSets = sets.filter((s: any) => {
      if (tierFilter !== "ALL" && s.compliance_tier !== parseInt(tierFilter)) return false;
      return s.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in pb-20">
      
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_collections_card") || "collections_bookmark"}</span>
          </div>
          <span className="truncate">{t("hub_tab_cc_sets") || "COLLECTIONS"}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
            <input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder={t("registry_search_placeholder") || "Search..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>
          <div className="w-40 relative z-50 h-12">
             <CustomDropdown disableTint={true} value={tierFilter} onChange={(v: string[]) => setTierFilter(v[0])} options={[{id: "ALL", label: "ALL TIERS"}, {id: "0", label: "TIER 0"}, {id: "1", label: "TIER 1"}, {id: "2", label: "TIER 2"}]} />
          </div>
          <button onClick={() => setIsForgePanelOpen(true)} className={standardAccentGlassButtonClass + " !h-12 !py-0 shrink-0 px-6"}>
            <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_add") || "add"}</span> {t("forge_new_set") || "CREATE NEW SET"}
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6 content-start pr-2">
          {filteredSets.length === 0 && <div className="p-4 col-span-full text-center text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("mason_cc_no_sets") || "NO SETS FOUND"}</div>}
          {filteredSets.map(setItem => (
              <CollectionCard 
                key={setItem.id} 
                setItem={setItem} 
                activeSetId={activeSet?.id} 
                onClick={() => handleSelectSet(setItem)} 
                masonsList={masonsList} 
              />
          ))}
        </div>
      </div>

      <SidePanel
        isOpen={isForgePanelOpen}
        onClose={() => setIsForgePanelOpen(false)}
        title={t("forge_new_set") || "CREATE NEW SET"}
        subtitle={t("mason_create_subtitle") || "Organize your mods"}
        icon="add_circle"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button type="button" onClick={() => setIsForgePanelOpen(false)} className={standardButtonClass}>
              {t("shared_cancel") || "Cancel"}
            </button>
            <button type="button" onClick={createSet} disabled={!setName.trim()} className={standardAccentGlassButtonClass}>
              {t("forge_init_set") || "CREATE SET"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col h-full gap-8">
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("forge_set_name") || "Set Name"}</label>
            <input value={setName} onChange={e => setSetName(e.target.value)} placeholder={t("forge_set_name") || "Set Name"} className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_mason")}</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <CustomMasonDropdown value={setMasonId} options={masonsList} onChange={setSetMasonId} />
              </div>
              <button onClick={() => setIsMasonPanelOpen(true)} className="bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-4 rounded-xl transition-colors shrink-0 flex items-center justify-center" title="Create Mason">
                <span className="material-symbols-outlined text-[18px]">person_add</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_safety") || "Compliance Tier"}</label>
            <CustomComplianceDropdown value={setTier} onChange={setSetTier} includeTier3={false} />
          </div>

          <div className="flex flex-col gap-2">
             <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
             <input value={setSetUrl} onChange={e => setSetSetUrl(e.target.value)} placeholder="https://..." className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold opacity-80 focus:opacity-100 focus:outline-none focus:theme-border-accent transition-all" />
          </div>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!activeSet}
        onClose={() => setActiveSet(null)}
        title={activeSet?.name || "UNNAMED SET"}
        subtitle={t("masonhub_manage_collection") || "MANAGE COLLECTION"}
        icon="library_books"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button type="button" onClick={handleDeleteSet} disabled={isSaving} className={standardDangerButtonClass}>
              {t("mason_cc_btn_delete_set") || "DELETE SET"}
            </button>
            <button type="button" onClick={saveSetMeta} disabled={isSaving} className={standardAccentGlassButtonClass}>
              {isSaving ? (t("ui_btn_loading") || "SAVING...") : (t("mason_cc_save_set") || "SAVE COLLECTION")}
            </button>
          </div>
        }
      >
        {activeSet && (
          <div className="flex flex-col h-full gap-8">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("forge_set_name")}</label>
                  <input value={activeSet.name || ""} onChange={e => setActiveSet({...activeSet, name: e.target.value})} className="w-full theme-glass-inner rounded-xl px-4 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_mason")}</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <CustomMasonDropdown value={activeSet.mason_id || ""} options={masonsList} onChange={(val: string) => setActiveSet({...activeSet, mason_id: val})} />
                    </div>
                    <button onClick={() => setIsMasonPanelOpen(true)} className="bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-4 rounded-xl transition-colors shrink-0 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">person_add</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_safety") || "Compliance Tier"}</label>
                  <CustomComplianceDropdown value={activeSet.compliance_tier || 0} onChange={(val: number) => setActiveSet({...activeSet, compliance_tier: val})} includeTier3={false} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_cc_cover_url") || "Cover Image URL"}</label>
                  <input value={activeSet.image_url || ""} onChange={e => setActiveSet({...activeSet, image_url: e.target.value})} placeholder={t("mason_cc_cover_url") || "Cover Image URL"} className="w-full theme-glass-inner rounded-xl px-4 h-12 text-[var(--text)] text-xs font-mono focus:outline-none focus:theme-border-accent transition-all" />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url") || "External URL"}</label>
                  <input value={activeSet.url || ""} onChange={e => setActiveSet({...activeSet, url: e.target.value})} placeholder={t("dossier_external_url_placeholder") || "External URL..."} className="w-full theme-glass-inner rounded-xl px-4 h-12 text-[var(--text)] text-xs font-mono focus:outline-none focus:theme-border-accent transition-all" />
                </div>
              </div>

              <div className="h-[1px] bg-white/5 my-2 w-full" />

              <div className="flex flex-col gap-4 pb-12">
                <h4 className="text-[11px] font-black theme-text-accent uppercase tracking-widest">{t("registry_assets_title") || "SET CONTENTS"}</h4>
                
                <div className="flex flex-col gap-2 bg-black/10 p-4 rounded-2xl border border-white/5 relative z-[6000]">
                  <div className="flex items-center gap-3">
                     <span className={isSearching ? "animate-spin theme-text-accent material-symbols-outlined" : "theme-text-accent material-symbols-outlined"}>{t("registry_icon_search") || "search"}</span>
                     <input value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder={t("forge_search_assets") || "Search all mods..."} className="w-full bg-transparent border-none outline-none text-[var(--text)] text-sm font-bold placeholder:opacity-40" />
                  </div>
                  
                  {assetSearch.length >= 2 && availableAssets.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl z-[7000] overflow-hidden flex flex-col max-h-[250px] overflow-y-auto custom-scrollbar">
                      {availableAssets.filter(asset => !manifestMembers.some(m => m.mod_id === asset.id)).map(asset => (
                        <button type="button" key={asset.id} onClick={() => { addToManifest(asset.id); setAssetSearch(""); }} className="w-full text-left px-5 py-3 hover:theme-panel-accent border-b border-white/5 flex justify-between items-center group transition-all shrink-0">
                          <div className="flex flex-col min-w-0 pr-4">
                            <span className="text-[10px] font-black text-[var(--text)] uppercase truncate">{asset.name}</span>
                            <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate">{asset.masons?.name || asset.master_author || "UNKNOWN"}</span>
                          </div>
                          <span className="text-[9px] font-bold theme-text-accent opacity-0 group-hover:opacity-100 uppercase transition-all">{t("mason_cc_btn_add") || "ADD"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-4 mt-2">
                    <div className="flex items-center justify-between px-2">
                    <span className="text-[9px] uppercase tracking-widest text-[var(--subtext)] opacity-60">{t("mason_cc_in_set") || "CURRENT ASSETS"}</span>
                    <span className="theme-text-accent font-black text-xs">{manifestMembers.length}</span>
                    </div>
                    
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-2">
                    {manifestMembers.map(member => (
                      <ArtifactCard 
                          key={member.id} 
                          mod={member.mods} 
                          onClick={() => {}} 
                          onRemove={() => removeFromManifest(member.id, member.mods?.name || "Unknown")} 
                          masonsList={[]}
                      />
                    ))}
                    </div>
                  
                  {manifestMembers.length === 0 && (
                    <div className="w-full h-32 flex flex-col items-center justify-center opacity-40">
                      <span className="text-3xl mb-2 grayscale"><span className="material-symbols-outlined shrink-0">{t("ui_icon_flask") || "science"}</span></span>
                      <span className="text-[9px] font-black uppercase tracking-[0.2em]">{t("hub_no_mods_found") || "NO MODS IN SET"}</span>
                    </div>
                  )}
                </div>
              </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isMasonPanelOpen}
        onClose={() => setIsMasonPanelOpen(false)}
        title={t("mason_create_title") || "CREATE MASON"}
        icon="person_add"
        widthClass="w-[350px]"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button onClick={() => setIsMasonPanelOpen(false)} className={standardButtonClass}>
              {t("shared_cancel") || "CANCEL"}
            </button>
            <button onClick={handleCreateMason} className={standardAccentGlassButtonClass}>
              {t("mason_create_btn_create") || "CREATE"}
            </button>
          </div>
        }
      >
        <div className="p-6">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_create_label_name") || "MASON NAME"}</label>
          <input value={newMasonName} onChange={e => setNewMasonName(e.target.value)} placeholder={t("mason_create_ph_name") || "Enter name..."} className="theme-glass-inner rounded-xl px-5 h-12 mt-2 w-full text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
        </div>
      </SidePanel>

    </div>
  );
}

function ScoutQueue({ modList = [] }: { modList?: any[] }) {
    const { t } = useLexicon();
    const [searchTerm, setSearchTerm] = useState("");
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [masonsList, setMasonsList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeScout, setActiveScout] = useState<any | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [lineageId, setLineageId] = useState<string>("");
  
    const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
    const [newMasonName, setNewMasonName] = useState("");
    const [isCreatingMason, setIsCreatingMason] = useState(false);
  
    const handleCreateMason = async () => {
      if (!newMasonName.trim()) return;
      setIsCreatingMason(true);
      const newId = crypto.randomUUID();
      const { error } = await supabase.from('masons').insert([{ id: newId, name: newMasonName }]);
      if (!error) {
        const { data: mData } = await supabase.from('masons').select('id, name').order('name');
        if (mData) setMasonsList(mData);
        setEditForm({...editForm, mason_id: newId});
        setIsMasonPanelOpen(false);
        setNewMasonName("");
      }
      setIsCreatingMason(false);
    };
  
    const [editForm, setEditForm] = useState({
      name: "",
      mason_id: "",
      category_override: "",
      sub_type: "", file_extension: "",
      description: "",
      image_url: "",
      latest_version: "",
      url: "",
      compliance_tier: 0,
      compatible_versions: [] as string[],
      hash_version: ""
    });
  
    const fetchSubmissions = async () => {
      setLoading(true);
      const { data: mData } = await supabase.from('masons').select('*').order('name');
      if (mData) setMasonsList(mData);
  
      const { data, error } = await supabase
        .from('scout_suggestions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (!error && data) setSubmissions(data);
      setLoading(false);
    };
  
    useEffect(() => { fetchSubmissions(); },[]);
  
    useEffect(() => {
      if (activeScout) {
        setLineageId(""); // Reset on new scout
        const possibleMason = masonsList.find((m: any) => m.name === activeScout.suggested_author || m.id === activeScout.suggested_mason_id);
        setEditForm({
          name: (activeScout.suggested_name || "").replace(/_/g, " "),
          mason_id: possibleMason ? possibleMason.id : "",
          category_override: activeScout.suggested_type || "Script",
          sub_type: activeScout.suggested_sub_type || "",
            file_extension: "",
          description: "",
          image_url: "",
          latest_version: "",
          url: activeScout.suggested_url || "",
          compliance_tier: 0,
          compatible_versions: [],
          hash_version: activeScout.suggested_version || "v.Scout"
        });
      } else {
        setEditForm({
          name: "", mason_id: "", category_override: "", sub_type: "", file_extension: "", description: "", image_url: "", latest_version: "", url: "", compliance_tier: 0, compatible_versions: [], hash_version: ""
        });
        setLineageId("");
      }
    }, [activeScout, masonsList]);
  
    useEffect(() => {
      if (lineageId && modList) {
         const existing = modList.find(m => m.id === lineageId);
         if (existing) {
            setEditForm(prev => ({
              ...prev,
              name: existing.name || "",
              mason_id: existing.mason_id || "",
              category_override: existing.category_override || "Script",
              sub_type: existing.sub_type || "",
                file_extension: existing.file_extension || "",
              description: existing.description || "",
              image_url: existing.image_url || "",
              url: existing.url || "",
              compliance_tier: existing.compliance_tier || 0,
              compatible_versions: existing.compatible_versions || []
            }));
         }
      }
    }, [lineageId, modList]);
  
    const handleAction = async (action: 'approved' | 'rejected') => {
      if (!activeScout) return;
      setIsProcessing(true);
      
      if (action === 'approved') {
        if (lineageId) {
          await supabase.from('mod_versions').upsert({
            mod_id: lineageId,
            dna_hash: activeScout.dna_hash,
            version_label: editForm.hash_version
          }, { onConflict: 'dna_hash' });
          
          await supabase.from('mods').update({
             name: editForm.name,
             mason_id: editForm.mason_id || null,
             category_override: editForm.category_override,
             sub_type: editForm.sub_type,
               file_extension: editForm.file_extension,
             description: editForm.description,
             image_url: editForm.image_url,
             url: editForm.url,
             compliance_tier: editForm.compliance_tier,
             compatible_versions: editForm.compatible_versions,
             status: 'verified'
          }).eq('id', lineageId);
        } else {
          const { data: modData } = await supabase.from('mods').insert({
            name: editForm.name,
            mason_id: editForm.mason_id || null,
            category_override: editForm.category_override,
            sub_type: editForm.sub_type,
               file_extension: editForm.file_extension,
            description: editForm.description,
            image_url: editForm.image_url,
            latest_version: editForm.latest_version,
            url: editForm.url,
            compliance_tier: editForm.compliance_tier,
            compatible_versions: editForm.compatible_versions,
            status: 'verified'
          }).select().single();
          
          if (modData) {
            await supabase.from('mod_versions').upsert({
              mod_id: modData.id,
              dna_hash: activeScout.dna_hash,
              version_label: editForm.hash_version
            }, { onConflict: 'dna_hash' });
          }
        }
        await supabase.from('scout_suggestions').update({ status: 'approved' }).eq('id', activeScout.id);
        logArchitectAction('Approved Scout Submission', 'scout_suggestions', activeScout.id);
      } else {
        await supabase.from('scout_suggestions').update({ status: 'rejected' }).eq('id', activeScout.id);
        logArchitectAction('Rejected Scout Submission', 'scout_suggestions', activeScout.id);
      }
  
      setActiveScout(null);
      await fetchSubmissions();
      setIsProcessing(false);
    };
  
    const filteredSubmissions = submissions.filter((s: any) => {
      return s.suggested_name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.id?.toLowerCase().includes(searchTerm.toLowerCase());
    });
  
    return (
      <div className="flex flex-col w-full relative h-full">
        <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_search") || "search"}</span>
            </div>
            <span className="truncate">{t("hub_scout_queue")}</span>
          </h2>
          <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
            <div className="relative flex-1 max-w-[300px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">search</span>
              <input 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                placeholder={t("registry_search_placeholder") || "Search..."} 
                className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
              />
            </div>
          </div>
        </div>
  
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
              <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs uppercase animate-pulse">{t("scout_intercepting")}</div>
          ) : filteredSubmissions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30">
                <span className="text-6xl mb-4 grayscale"><span className="material-symbols-outlined shrink-0">{t("ui_icon_museum") || "account_balance"}</span></span>
                <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] text-center px-8 leading-relaxed">{t("hub_no_pending_submissions") || "No Pending Submissions"}</span>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-32">
              {filteredSubmissions.map((mod: any) => (
                  <ArtifactCard key={mod.id} mod={{ ...mod, name: mod.suggested_name, category_override: mod.suggested_type || "Scout Suggestion" }} onClick={() => setActiveScout(mod)} masonsList={masonsList} overrideActionLabel={t("mason_bug_inspect_report") || "INSPECT"} />
              ))}
              </div>
          )}
        </div>
  
        <SidePanel
          isOpen={!!activeScout}
          onClose={() => setActiveScout(null)}
          title={t("scout_reviewing") || "Review Scout Submission"}
            icon={t("ui_icon_search") || "search"}
          subtitle={`HASH: ${activeScout?.dna_hash}`}
          actions={
            <>
              <button onClick={() => handleAction('rejected')} disabled={isProcessing} className={standardDangerButtonClass}>
                {t("scout_discard")}
              </button>
              <button onClick={() => handleAction('approved')} disabled={isProcessing} className={standardSuccessButtonClass}>
                {isProcessing ? t("mason_saving") : t("scout_approve")}
              </button>
            </>
          }
        >
          {activeScout && (
            <div className="flex flex-col gap-6">
                
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent pointer-events-none rounded-2xl" />
                  
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[14px]">account_tree</span>
                      {t("scout_label_lineage")}
                    </label>
                    <ModSearchDropdown 
                      modList={modList || []} 
                      onSelect={(m: any) => setLineageId(m.id)} 
                      selectedItem={modList?.find((m: any) => m.id === lineageId)} 
                      onClear={() => setLineageId("")}
                      placeholder={t("scout_ph_link_lineage")}
                    />
                    <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 mt-1 ml-2">
                      {t("scout_label_lineage_desc")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">info</span>
                    {t("mason_bug_inspect_report") || "METADATA"}
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("hub_label_modname")}</label>
                      <input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_mason")}</label>
                      <div className="flex gap-2 relative">
                        <div className="flex-1 min-w-0">
                          <CustomMasonDropdown value={editForm.mason_id} options={masonsList} onChange={(id: string) => setEditForm({...editForm, mason_id: id})} />
                        </div>
                        <button onClick={() => setIsMasonPanelOpen(true)} className="bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-5 rounded-xl font-black transition-colors shrink-0">
                          +
                        </button>
                      </div>
                    </div>
                  </div>
    
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
                      <CustomClassificationDropdown value={editForm.category_override} onChange={(newType: string) => setEditForm({...editForm, category_override: newType})} />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_file_ext") || "FILE EXTENSION"}</label>
                        <input value={editForm.file_extension} onChange={e => setEditForm({...editForm, file_extension: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" placeholder="e.g. .package, .ts4script" />
                      </div>
                      <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_subcat")}</label>
                      <input value={editForm.sub_type} onChange={e => setEditForm({...editForm, sub_type: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" placeholder="e.g. Tuning, Object, CAS" />
                    </div>
                  </div>
                </div>
  
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">link</span>
                    {t("hub_label_resources") || "RESOURCES"}
                  </h4>

                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                    <input value={editForm.url || ""} onChange={e => setEditForm({...editForm, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-emerald-500/50 bg-black/20" />
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image")}</label>
                    <input value={editForm.image_url || ""} onChange={e => setEditForm({...editForm, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-emerald-500/50 bg-black/20" />
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_desc")}</label>
                    <textarea value={editForm.description || ""} onChange={e => setEditForm({...editForm, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-28 resize-none focus:outline-none focus:border-emerald-500/50 bg-black/20" />
                  </div>
                </div>
  
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">verified</span>
                    {t("masonhub_compliance_tier") || "COMPLIANCE"}
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_compliance_tier")}</label>
                      <CustomComplianceDropdown value={editForm.compliance_tier || 0} onChange={(val: number) => setEditForm({...editForm, compliance_tier: val})} includeTier3={false} />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2 flex items-center gap-1">
                        {t("registry_label_version")}
                      </label>
                      <input value={editForm.latest_version} onChange={e => setEditForm({ ...editForm, latest_version: e.target.value })} placeholder="e.g. 1.0, 1.1, 1.2" className="theme-glass-inner rounded-xl px-5 h-12 text-purple-400 text-sm font-bold focus:outline-none focus:border-purple-500/50 bg-black/20" />
                    </div>
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_game_versions")}</label>
                    <GameVersionMultiSelect selectedVersions={editForm.compatible_versions || []} onChange={(v: string[]) => setEditForm({...editForm, compatible_versions: v})} />
                  </div>
                </div>

            </div>
          )}
        </SidePanel>
  
        <SidePanel
          isOpen={isMasonPanelOpen}
          onClose={() => setIsMasonPanelOpen(false)}
          title={t("mason_create_title")}
            icon={t("ui_icon_person_add") || "person_add"}
            actions={
            <button onClick={handleCreateMason} className={standardAccentGlassButtonClass}>
              {t("mason_create_btn_create")}
            </button>
          }
        >
          <div className="p-6">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_create_label_name")}</label>
            <input value={newMasonName} onChange={e => setNewMasonName(e.target.value)} placeholder={t("mason_create_ph_name")} className="theme-glass-inner rounded-xl px-5 h-12 mt-2 w-full text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
          </div>
        </SidePanel>
      </div>
    )
  }

function MasonQueue({ modList = [] }: { modList?: any[] }) {
    const { t } = useLexicon();
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [masonsList, setMasonsList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeMod, setActiveMod] = useState<any | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
  
    const [editForm, setEditForm] = useState({
      name: '',
      mason_id: '',
      category_override: '',
      sub_type: '',
        file_extension: '',
      description: '',
      image_url: '',
      latest_version: '',
      url: '',
      compliance_tier: 0,
      compatible_versions: [] as string[]
    });
  
    const fetchData = async () => {
      setLoading(true);
      const { data: qData } = await supabase.from('mods').select('*').eq('status', 'under_review').order('updated_at', { ascending: false });
      if (qData) setSubmissions(qData);
      const { data: mData } = await supabase.from('masons').select('id, name').order('name');
      if (mData) setMasonsList(mData);
      setLoading(false);
    };
  
    useEffect(() => { fetchData(); }, []);
  
    const handleSelect = (mod: any) => {
      setActiveMod(mod);
      setEditForm({
        name: mod.name || '',
        mason_id: mod.mason_id || '',
        category_override: mod.category_override || 'Script',
        sub_type: mod.sub_type || '',
          file_extension: mod.file_extension || '',
        description: mod.description || '',
        image_url: mod.image_url || '',
        latest_version: mod.latest_version || '',
        url: mod.url || '',
        compliance_tier: mod.compliance_tier || 0,
        compatible_versions: mod.compatible_versions || []
      });
    };
  
    const handleApprove = async () => {
      if (!activeMod) return;
      setIsProcessing(true);
      
      const { error } = await supabase.from('mods').update({
        ...editForm,
        status: 'verified'
      }).eq('id', activeMod.id);
  
      if (!error) {
        logArchitectAction('Updated Mod Metadata', 'mods', activeMod.name);
        setActiveMod(null);
        fetchData();
      } else {
        alert(`${t("err_save_failed")}: ` + error.message);
      }
      setIsProcessing(false);
    };
  
    const handleReject = async () => {
      if (!activeMod) return;
      const reason = prompt(t("prompt_reject_reason"));
      if (reason === null) return;
      setIsProcessing(true);
      
      const { error } = await supabase.from('mods').update({
        status: 'unverified',
        description: (editForm.description + '\n\nREJECTION REASON: ' + reason).trim()
      }).eq('id', activeMod.id);
  
      if (!error) {
        logArchitectAction('Updated Mod Metadata', 'mods', activeMod.name);
        setActiveMod(null);
        fetchData();
      } else {
        alert(`${t("err_save_failed")}: ` + error.message);
      }
      setIsProcessing(false);
    };
  
    const filteredSubmissions = submissions.filter((s: any) => s.name?.toLowerCase().includes(searchTerm.toLowerCase()));
  
    return (
      <div className="flex flex-col w-full relative h-full">
        <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_mason") || "construction"}</span>
            </div>
            <span className="truncate">{t("hub_tab_mason_queue")}</span>
          </h2>
          <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
            <div className="relative flex-1 max-w-[300px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">search</span>
              <input 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                placeholder={t("registry_search_placeholder") || "Search..."} 
                className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
              />
            </div>
          </div>
        </div>
  
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
              <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs uppercase animate-pulse">{t("hub_loading")}</div>
          ) : filteredSubmissions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30">
                <span className="text-6xl mb-4 grayscale"><span className="material-symbols-outlined shrink-0">{t("ui_icon_museum") || "account_balance"}</span></span>
                <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] text-center px-8 leading-relaxed">{t("hub_no_pending_masons") || "No Pending Mason Submissions"}</span>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-32">
              {filteredSubmissions.map((mod: any) => (
                  <ArtifactCard key={mod.id} mod={mod} onClick={() => handleSelect(mod)} masonsList={masonsList} overrideActionLabel={t("mason_bug_inspect_report") || "INSPECT"} />
              ))}
              </div>
          )}
        </div>
  
        <SidePanel
          isOpen={!!activeMod}
          onClose={() => setActiveMod(null)}
          title={t("registry_select_master") || "Review Mason Submission"}
            icon={t("ui_icon_construction") || "construction"}
          subtitle={`UUID: ${activeMod?.id}`}
          actions={
            <>
              <button onClick={handleReject} disabled={isProcessing} className={standardDangerButtonClass}>{t("registry_btn_sever")}</button>
              <button onClick={handleApprove} disabled={isProcessing} className={standardSuccessButtonClass}>{isProcessing ? t("mason_saving") : t("registry_btn_approve")}</button>
            </>
          }
        >
          {activeMod && (
            <div className="flex flex-col gap-6">
                
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">info</span>
                    {t("mason_bug_inspect_report") || "METADATA"}
                  </h4>
                  
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("hub_label_modname")}</label>
                    <input value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" />
                  </div>
    
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_mason")}</label>
                      <CustomMasonDropdown value={editForm.mason_id} options={masonsList} onChange={(id: string) => setEditForm({...editForm, mason_id: id})} />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
                      <CustomClassificationDropdown value={editForm.category_override} onChange={(newType: string) => setEditForm({...editForm, category_override: newType})} />
                    </div>
                  </div>
    
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sandbox_label_file_ext") || "FILE EXTENSION"}</label>
                        <input value={editForm.file_extension} onChange={e => setEditForm({...editForm, file_extension: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" placeholder="e.g. .package, .ts4script" />
                      </div>
                      <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_subcat")}</label>
                      <input value={editForm.sub_type} onChange={e => setEditForm({...editForm, sub_type: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" placeholder="e.g. Tuning, Object, CAS" />
                    </div>
                  </div>
                </div>
  
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">link</span>
                    {t("hub_label_resources") || "RESOURCES"}
                  </h4>

                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                    <input value={editForm.url || ""} onChange={e => setEditForm({...editForm, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-emerald-500/50 bg-black/20" />
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image")}</label>
                    <input value={editForm.image_url || ""} onChange={e => setEditForm({...editForm, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-emerald-500/50 bg-black/20" />
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_desc")}</label>
                    <textarea value={editForm.description || ""} onChange={e => setEditForm({...editForm, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-28 resize-none focus:outline-none focus:border-emerald-500/50 bg-black/20" />
                  </div>
                </div>
  
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">verified</span>
                    {t("masonhub_compliance_tier") || "COMPLIANCE"}
                  </h4>

                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_compliance_tier")}</label>
                    <CustomComplianceDropdown value={editForm.compliance_tier || 0} onChange={(val: number) => setEditForm({...editForm, compliance_tier: val})} includeTier3={false} />
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_game_versions")}</label>
                    <GameVersionMultiSelect selectedVersions={editForm.compatible_versions || []} onChange={(v: string[]) => setEditForm({...editForm, compatible_versions: v})} />
                  </div>
                </div>
  
            </div>
          )}
        </SidePanel>
      </div>
    )
  }

function CustomTierDropdown({ value, onChange }: { value: number, onChange: (val: number) => void }) {
  const { t } = useLexicon();
  const options = [
    { id: 4, label: t("nexus_tier4") },
    { id: 3, label: t("nexus_tier3") },
  ];
  return <CustomDropdown disableTint={true} value={value} options={options} onChange={(v: any[]) => onChange(v[0])} placeholder="Select Tier" />;
}

function ConflictMatrix({ modList = [] }: { modList?: any[] }) {
  const { t } = useLexicon();
  const [ghosts, setGhosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [activeMaster, setActiveMaster] = useState<any | null>(null);
  const [conflictEnemy, setConflictEnemy] = useState<any | null>(null);
  const [conflictSeverity, setConflictSeverity] = useState(4);
  const [conflictResolution, setConflictResolution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editConflictId, setEditConflictId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const realMods = modList.filter(m => !m.isParent && !m.isFlavorFolder);

  const fetchGhosts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('logical_conflicts').select(`
      *,
      mod_a:mods!logical_conflicts_mod_a_id_fkey(id, name),
      mod_b:mods!logical_conflicts_mod_b_id_fkey(id, name)
    `).order('status', { ascending: false }).order('created_at', { ascending: false });
    
    if (!error && data) setGhosts(data);
    setLoading(false);
  };

  useEffect(() => { fetchGhosts(); }, []);

  const handleAddConflict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMaster || !conflictEnemy) return;
    setIsSubmitting(true);
    
    if (editConflictId) {
      const { error } = await supabase.from('logical_conflicts').update({ 
        mod_a_id: activeMaster.id, 
        mod_b_id: conflictEnemy.id, 
        severity_rank: conflictSeverity, 
        resolution_note: conflictResolution,
        status: 'approved' 
      }).eq('id', editConflictId);
      if (!error) logArchitectAction("Updated Global Conflict Rule", "logical_conflicts", `T${conflictSeverity}`);
    } else {
      const { error } = await supabase.from('logical_conflicts').insert([{ 
        mod_a_id: activeMaster.id, 
        mod_b_id: conflictEnemy.id, 
        severity_rank: conflictSeverity, 
        resolution_note: conflictResolution,
        status: 'approved'
      }]);
      if (!error) logArchitectAction("Created Global Conflict Rule", "logical_conflicts", `T${conflictSeverity}`);
    }
    
    setConflictEnemy(null); setConflictResolution(""); setConflictSeverity(4); setActiveMaster(null); setEditConflictId(null);
    setIsSidePanelOpen(false);
    await fetchGhosts();
    setIsSubmitting(false);
  };

  const handleEditConflict = (c: any) => {
    let myMod = c.mod_a;
    let enemyMod = c.mod_b;
    if (c.mod_a_id && !myMod) myMod = realMods.find(m => m.id === c.mod_a_id);
    if (c.mod_b_id && !enemyMod) enemyMod = realMods.find(m => m.id === c.mod_b_id);

    setActiveMaster(myMod || null);
    setConflictEnemy(enemyMod || null);
    setConflictSeverity(c.severity_rank || 4);
    setConflictResolution(c.resolution_note || "");
    setEditConflictId(c.id);
    setIsSidePanelOpen(true);
  };

  const handleDeleteConflict = async (id: string) => {
    const { error } = await supabase.from('logical_conflicts').delete().eq('id', id);
    if (!error) {
      logArchitectAction("Deleted Global Conflict Rule", "logical_conflicts", id);
      setDeleteConfirmId(null);
      setIsSidePanelOpen(false);
      fetchGhosts();
    }
  };

  const handleApproveGhost = async (id: string) => {
    const { error } = await supabase.from('logical_conflicts').update({ status: 'approved' }).eq('id', id);
    if (!error) {
      logArchitectAction("Approved Pending Conflict Rule", "logical_conflicts", id);
      fetchGhosts();
    }
  };

  const filteredGhosts = ghosts.filter(c => {
    if (tierFilter !== null && c.severity_rank !== tierFilter) return false;
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const nameA = c.mod_a?.name || c.mod_a || "";
    const nameB = c.mod_b?.name || c.mod_b || "";
    return nameA.toLowerCase().includes(search) || nameB.toLowerCase().includes(search);
  });

  const pendingGhosts = filteredGhosts.filter(c => c.status === 'pending');
  const activeGhosts = filteredGhosts.filter(c => c.status !== 'pending');


  return (
    <div className="flex flex-col w-full relative">
      
      <div className="flex flex-col gap-6 p-6 pb-32 transition-all duration-500">
        
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
             <span className="material-symbols-outlined !text-3xl opacity-70">{t("ui_icon_security") || "security"}</span>
             <span className="truncate">{t("ui_tab_conflicts")?.replace("⚔️ ", "") || "Conflict Matrix"}</span>
          </h2>
          <button onClick={() => { setEditConflictId(null); setActiveMaster(null); setConflictEnemy(null); setConflictResolution(""); setConflictSeverity(4); setIsSidePanelOpen(true); }} className="flex items-center gap-3 px-6 py-3 theme-glass-panel theme-text-accent border border-[var(--accent)]/30 hover:border-[var(--accent)] hover:shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.2)] rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95">
            + {t("ui_btn_create") || "CREATE RULE"}
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center w-full">
          <div className="relative flex-1 w-full">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
            <input 
              type="text" 
              placeholder={t("ui_search_placeholder") || "Search conflicts..."} 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-4 py-3 text-sm font-bold focus:outline-none transition-all text-[var(--text)] border border-white/5 hover:border-white/10"
            />
          </div>
          <div className="flex items-center gap-2 theme-glass-panel rounded-2xl p-2 shrink-0">
            <button onClick={() => setTierFilter(null)} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tierFilter === null ? 'bg-white/10 text-white' : 'opacity-50 hover:opacity-100 hover:bg-white/5'}`}>{t("hub_ql_all") || "ALL"}</button>
            {[4, 3, 2, 1].map(tier => (
              <button key={tier} onClick={() => setTierFilter(tier)} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tierFilter === tier ? 'bg-white/10 text-white shadow-sm' : 'opacity-50 hover:opacity-100 hover:bg-white/5'}`}>
                T{tier}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center theme-text-accent font-black tracking-widest text-xs uppercase animate-pulse">{t("hub_loading") || "LOADING..."}</div>
        ) : filteredGhosts.length === 0 ? (
           <div className="py-12 flex flex-col items-center justify-center opacity-30 gap-4">
            <span className="text-4xl grayscale"><span className="material-symbols-outlined shrink-0">{t("ui_icon_ghost") || "visibility_off"}</span></span>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text)]">{t("masonhub_no_conflicts") || "NO CONFLICTS"}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-8 mt-4">
            {pendingGhosts.length > 0 && (
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest flex items-center gap-2 px-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  {t("masonhub_pending_approval") || "Pending Approval"}
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {pendingGhosts.map(c => {
                    const nameA = c.mod_a?.name || c.mod_a || "UNKNOWN";
                    const nameB = c.mod_b?.name || c.mod_b || "UNKNOWN";
                    return (
                      <div 
                        key={c.id} 
                        onClick={() => handleEditConflict(c)} 
                        className="relative group cursor-pointer w-full rounded-[2rem] overflow-hidden transition-all duration-500 border border-amber-500/30 shadow-lg hover:shadow-[0_0_30px_rgba(245,158,11,0.2)] hover:scale-[1.02]"
                      >
                        <div className="absolute inset-0 theme-glass-panel opacity-100 group-hover:opacity-0 transition-opacity duration-500" />
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-transparent to-transparent opacity-5 group-hover:opacity-10 transition-opacity duration-500" />
                        
                        <div className="relative p-6 flex flex-col gap-4 z-10">
                          <div className="flex justify-between items-start">
                            <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-sm flex items-center gap-1.5 ${c.severity_rank === 4 ? 'bg-red-500 text-[var(--bg)] shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-orange-500 text-[var(--bg)] shadow-[0_0_10px_rgba(249,115,22,0.5)]'}`}>
                              <span className="material-symbols-outlined !text-[12px]">{c.severity_rank === 4 ? 'error' : 'warning'}</span>
                              T{c.severity_rank}
                            </span>
                            <span className="px-3 py-1.5 bg-amber-500 text-[var(--bg)] rounded-lg text-[9px] font-black uppercase shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-pulse">{t("hub_pending") || "PENDING"}</span>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-xl theme-text-accent">{t("ui_icon_extension") || "extension"}</span>
                              </div>
                              <span className="text-sm font-black text-[var(--text)] truncate">{nameA}</span>
                            </div>
                            
                            <div className="flex items-center justify-center gap-4 text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest opacity-50 px-8">
                              <div className="h-px bg-white/10 flex-1" />
                              <span className="shrink-0">{t("nexus_vs") || "VS"}</span>
                              <div className="h-px bg-white/10 flex-1" />
                            </div>
                            
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-xl theme-text-danger">{t("ui_icon_extension") || "extension"}</span>
                              </div>
                              <span className="text-sm font-black text-[var(--text)] truncate">{nameB}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeGhosts.length > 0 && (
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-black text-[var(--subtext)] opacity-50 uppercase tracking-widest flex items-center gap-2 px-2">
                  {t("matrix_established") || "ESTABLISHED CONFLICTS"}
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {activeGhosts.map(c => {
                    const nameA = c.mod_a?.name || c.mod_a || "UNKNOWN";
                    const nameB = c.mod_b?.name || c.mod_b || "UNKNOWN";
                    return (
                      <div 
                        key={c.id} 
                        onClick={() => handleEditConflict(c)} 
                        className="relative group cursor-pointer w-full rounded-[2rem] overflow-hidden transition-all duration-500 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-lg hover:shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_10%,transparent)] hover:scale-[1.02]"
                      >
                        <div className="absolute inset-0 theme-glass-panel opacity-100 group-hover:opacity-0 transition-opacity duration-500" />
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] via-transparent to-transparent opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
                        
                        <div className="relative p-6 flex flex-col gap-4 z-10">
                          <div className="flex justify-between items-start">
                            <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-sm flex items-center gap-1.5 ${c.severity_rank === 4 ? 'bg-red-500 text-[var(--bg)] shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-orange-500 text-[var(--bg)] shadow-[0_0_10px_rgba(249,115,22,0.5)]'}`}>
                              <span className="material-symbols-outlined !text-[12px]">{c.severity_rank === 4 ? 'error' : 'warning'}</span>
                              T{c.severity_rank}
                            </span>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-xl theme-text-accent">{t("ui_icon_extension") || "extension"}</span>
                              </div>
                              <span className="text-sm font-black text-[var(--text)] truncate group-hover:theme-text-accent transition-colors">{nameA}</span>
                            </div>
                            
                            <div className="flex items-center justify-center gap-4 text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest opacity-50 px-8">
                              <div className="h-px bg-white/10 flex-1" />
                              <span className="shrink-0">{t("nexus_vs") || "VS"}</span>
                              <div className="h-px bg-white/10 flex-1" />
                            </div>
                            
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-xl theme-text-danger">{t("ui_icon_extension") || "extension"}</span>
                              </div>
                              <span className="text-sm font-black text-[var(--text)] truncate">{nameB}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <SidePanel
        isOpen={isSidePanelOpen}
        onClose={() => setIsSidePanelOpen(false)}
        title={editConflictId ? (t("ui_btn_edit") || "EDIT") : (t("ui_btn_create") || "CREATE")}
        icon="security"
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pb-32">
              <form onSubmit={handleAddConflict} className="flex flex-col gap-8">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("nexus_enemy_a") || "MOD A"}</label>
                    <ModSearchDropdown placeholder={t("registry_select_master") || "Select Mod..."} selectedItem={activeMaster} onSelect={(m: any) => setActiveMaster(m)} onClear={() => setActiveMaster(null)} modList={realMods} />
                  </div>
                  
                  <div className="flex justify-center -my-2 z-20">
                      <span className="text-[10px] theme-text-danger font-black shrink-0 px-2 py-1 bg-red-500/10 rounded-full border border-red-500/20">{t("nexus_vs") || "VS"}</span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("nexus_enemy_b") || "MOD B"}</label>
                      <ModSearchDropdown placeholder={t("mason_enemy_placeholder") || "Select Enemy..."} selectedItem={conflictEnemy} onSelect={(m: any) => setConflictEnemy(m)} onClear={() => setConflictEnemy(null)} modList={realMods} />
                    </div>
                  
                    <div className="flex flex-col gap-2 relative z-10">
                      <label className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("nexus_rank") || "TIER"}</label>
                      <CustomTierDropdown value={conflictSeverity} onChange={(val) => setConflictSeverity(val)} />
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 relative z-0">
                    <label className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("nexus_label_notes") || "NOTES"}</label>
                    <textarea 
                      placeholder={t("ui_placeholder_notes") || "Describe the nature of this conflict and how Architect should handle it..."} 
                      value={conflictResolution} 
                      onChange={(e) => setConflictResolution(e.target.value)} 
                      className="w-full theme-glass-panel rounded-xl px-5 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all font-bold h-24 resize-none placeholder:text-[var(--text)]/20 hover:border-white/10"
                    />
                  </div>

                  <div className="flex flex-col gap-3 pt-4 mt-4 border-t border-white/10 relative z-0">
                    {deleteConfirmId === editConflictId && editConflictId ? (
                       <div className="flex flex-col gap-3 p-4 theme-panel-danger rounded-xl border animate-in slide-in-from-bottom-2">
                         <span className="text-xs font-black text-[var(--bg)] uppercase tracking-widest text-center">{t("ui_confirm_delete") || "ARE YOU SURE?"}</span>
                         <div className="flex gap-2">
                           <button type="button" onClick={() => handleDeleteConflict(editConflictId)} className="flex-1 py-2 bg-[var(--bg)] theme-text-danger rounded uppercase font-black text-[10px] hover:opacity-90">{t("ui_btn_delete") || "DELETE"}</button>
                           <button type="button" onClick={() => setDeleteConfirmId(null)} className="flex-1 py-2 bg-transparent text-[var(--bg)] rounded uppercase font-black text-[10px] border border-[var(--bg)] hover:bg-[var(--bg)] hover:text-[var(--text)] transition-colors">{t("ui_btn_cancel") || "CANCEL"}</button>
                         </div>
                       </div>
                    ) : (
                      <>
                        <button type="submit" disabled={isSubmitting || !activeMaster || !conflictEnemy} className={`w-full py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isSubmitting || !activeMaster || !conflictEnemy ? 'opacity-50 cursor-not-allowed bg-white/5 text-[var(--subtext)]' : 'theme-bg-danger text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:scale-[1.02]'}`}>
                          {isSubmitting ? "..." : (editConflictId ? t("masonhub_update_conflict") : t("masonhub_add_conflict"))}
                        </button>
                        
                        {editConflictId && (
                          <div className="flex gap-3 mt-2">
                            {ghosts.find((g: any) => g.id === editConflictId)?.status === 'pending' && (
                              <button type="button" onClick={() => handleApproveGhost(editConflictId)} className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest theme-bg-success text-[var(--bg)] shadow-lg hover:scale-[1.02] transition-all">
                                {t("ui_btn_approve") || "APPROVE"}
                              </button>
                            )}
                            <button type="button" onClick={() => setDeleteConfirmId(editConflictId)} className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">
                              {t("ui_btn_delete") || "DELETE"}
                            </button>
                          </div>
                        )}
                      </>
                    )}
            </div>
          </form>
        </div>
      </SidePanel>
    </div>
  );
}
function ProvingGrounds({ modList }: { modList: any[] }) {
  const { t } = useLexicon();
  const [labReports, setLabReports] = useState<any[]>([]);
  const [allMods, setAllMods] = useState<any[]>([]);
  const [allMasons, setAllMasons] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Side Panel State
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [conflictTarget, setConflictTarget] = useState<any | null>(null);
  
  // Test states
  const [isLoading, setIsLoading] = useState(false);
  const [isMissingArtifactPanelOpen, setIsMissingArtifactPanelOpen] = useState(false);
  const [testRun, setTestRun] = useState(false);
  const [testPassed, setTestPassed] = useState(true);
  const [testLog, setTestLog] = useState("");
  const [logWatcher, setLogWatcher] = useState<any>(null);

  // Resolution states
  const [severity, setSeverity] = useState(4);
  const [resolution, setResolution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.from('mods').select('*').in('status', ['under_review', 'verified', 'broken']).order('name');
      if (data) setLabReports(data);
      
      const { data: mData } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, latest_version, url').order('name'));
      if (mData) setAllMods(mData);
      
      const { data: masonData } = await supabase.from('masons').select('id, name').order('name');
      if (masonData) setAllMasons(masonData);
    };
    fetchData();
    return () => { if (logWatcher) clearInterval(logWatcher); };
  }, [logWatcher]);

  useEffect(() => {
    if (activeReport && allMods.length > 0) {
      supabase.from("solder_lab_logs")
        .select("tester_note")
        .eq("mod_id", activeReport.id)
        .limit(1)
        .then(({ data, error }) => {
          if (error) {
             console.warn("Could not fetch solder_lab_logs:", error);
             return;
          }
          if (data && data.length > 0 && data[0].tester_note) {
            try {
              const ctx = JSON.parse(data[0].tester_note);
              if (ctx.conflictTarget) {
                 const t = allMods.find(m => m.name === ctx.conflictTarget);
                 if (t) setConflictTarget(t);
              }
              if (ctx.dependencies) {
                 const deps = ctx.dependencies.map((name: string) => allMods.find(m => m.name === name)).filter(Boolean);
                 if (deps.length > 0) setDependencies(deps);
              }
            } catch (e) {
              // tester_note is probably a simple string, not JSON
            }
          }
        });
    }
  }, [activeReport, allMods]);

  const closePanel = () => {
    if (isLoading) return;
    setActiveReport(null);
    setDependencies([]);
    setConflictTarget(null);
    setTestRun(false);
    setTestPassed(true);
    setTestLog("");
  };

  const handleSelectDependency = (mod: any) => {
    if (!dependencies.find(d => d.id === mod.id)) {
      setDependencies([...dependencies, mod]);
    }
  };

  const handleRemoveDependency = (id: string) => {
    setDependencies(dependencies.filter(d => d.id !== id));
  };

  const isModMissingLocally = (modName: string) => {
    return !modList.find(m => 
      m.name === modName || 
      m.displayName === modName ||
      (m.name || '').split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '').toLowerCase() === (modName || '').toLowerCase()
    );
  };

  const downloadMissing = () => {
    if (activeReport && isModMissingLocally(activeReport.name)) {
      setIsMissingArtifactPanelOpen(true);
    }
  };

  const runSimulation = async () => {
      if (!activeReport) return;
      if (isModMissingLocally(activeReport.name)) return;
      setIsLoading(true);
      setTestRun(false);
      setTestLog("");
      
      try {
        let depPaths: string[] = [];
        const ids = [activeReport.id, ...dependencies.map(d => d.id), conflictTarget?.id].filter(Boolean);
        
        if (ids.length > 0) {
          const orQuery = ids.map(id => `child_id.eq.${id}`).join(',');
          const orParentQuery = ids.map(id => `parent_id.eq.${id}`).join(',');
          
          const { data: depLinks } = await supabase.from('mod_dependencies').select('parent_id, child_id').or(orQuery);
          const { data: twinLinks } = await supabase.from('mod_relationships').select('child_id').or(orParentQuery).eq('relationship_type', 'twin');
          const { data: addonLinks } = await supabase.from('mod_relationships').select('parent_id').or(orQuery).eq('relationship_type', 'addon');

          let allIds = new Set<string>();
          if (depLinks) depLinks.forEach((l: any) => allIds.add(l.parent_id));
          if (twinLinks) twinLinks.forEach((l: any) => allIds.add(l.child_id));
          if (addonLinks) addonLinks.forEach((l: any) => allIds.add(l.parent_id));

          if (allIds.size > 0) {
            const { data: depMods } = await supabase.from('mods').select('name').in('id', Array.from(allIds));
            if (depMods) depPaths = depMods.map((m: any) => m.name);
          }
        }

        const config: any = await invoke("get_saved_coordinates");
        await invoke("evacuate_to_shelter");
        
        const rawDeploySet = new Set([
          activeReport.physical_path || activeReport.name,
          ...dependencies.map(d => d.physical_path || d.name),
          ...(conflictTarget ? [conflictTarget.physical_path || conflictTarget.name] : []),
          ...depPaths
        ]);
        
        const deployMods = Array.from(rawDeploySet).map((modName: string) => {
          const modObj = (modList || []).find((m: any) => {
            if (m.isVirtual) return false;
            if (m.name === modName || m.displayName === modName) return true;
            const mBase = m.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '').toLowerCase();
            const targetBase = modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '').toLowerCase();
            return mBase && targetBase && mBase === targetBase;
          });
          return { path: modObj ? modObj.name : modName, allow_write: true };
        });
        
        await invoke("deploy_playset_bulk", {
          mods: deployMods,
          modsPath: config.mods_path,
          vaultPath: config.vault_path
        });
        
        const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
        await invoke("clear_old_logs", { docsPath: dPath });
        await invoke("launch_game", { livePath: config.live_path, modsPath: config.mods_path });
        
        const interval = setInterval(async () => {
          const res = await invoke<string>("scan_game_logs", { docsPath: dPath });
          if (res !== "Clean") {
            setTestPassed(false);
            setTestLog(res);
            setTestRun(true);
            setIsLoading(false);
            clearInterval(interval);
            setLogWatcher(null);
          }
        }, 5000);
        setLogWatcher(interval);
      } catch (err) {
        console.error(err);
        setIsLoading(false);
      }
  };

  const concludeTest = async (passed: boolean) => {
      if (logWatcher) clearInterval(logWatcher);
      setTestPassed(passed);
      setTestRun(true);
      setIsLoading(false);
      
      const finalStatus = passed ? "verified" : "broken";
      await supabase.from('mods').update({ status: finalStatus }).eq('id', activeReport.id);
      
      setLabReports(prev => prev.map(r => r.id === activeReport.id ? { ...r, status: finalStatus } : r));
      closePanel();

      const lastSet = localStorage.getItem("sanctuary_active_set");
      if (lastSet) {
        const config: any = await invoke("get_saved_coordinates");
        const playsetsStr = localStorage.getItem("sanctuary_playsets");
        if (playsetsStr) {
          const sets = JSON.parse(playsetsStr);
          const activeSet = sets.find((s: any) => s.name === lastSet);
          if (activeSet) {
            let deployMods: any[] = [];
            activeSet.mods.forEach((modName: string) => {
              const modObj = modList.find((m: any) => m.name === modName || m.displayName === modName);
              if (modObj && modObj.isVirtual && modObj.flavors) {
                 modObj.flavors.forEach((f: any) => deployMods.push({ path: f.name, allow_write: true }));
              } else {
                 deployMods.push({ path: modObj ? modObj.name : modName, allow_write: true });
              }
            });
            await invoke("deploy_playset_bulk", {
              mods: deployMods,
              modsPath: config.mods_path,
              vaultPath: config.vault_path,
            });
            return;
          }
        }
      }
      await invoke("evacuate_to_shelter");
  };

  const submitToNexus = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeReport || !conflictTarget) return;
      setIsSubmitting(true);
      await supabase.from('logical_conflicts').insert([{
        mod_a_id: activeReport.id,
        mod_b_id: conflictTarget.id,
        severity_rank: severity,
        resolution_note: resolution
      }]);
      setIsSubmitting(false);
      setTestRun(false);
      setTestLog("");
      setResolution("");
  };

  const filteredReports = labReports.filter(mod => 
    (mod.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (mod.master_author || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const pendingReports = filteredReports.filter(mod => mod.status === 'under_review');
  const completedReports = filteredReports.filter(mod => mod.status !== 'under_review');

  return (
    <div className="flex flex-col w-full relative">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_diagnostics") || "monitor_heart"}</span>
          </div>
          <span className="truncate">{t("hub_tab_lab")?.replace("🧪 ", "") || "Homestead Diagnostics"}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">search</span>
            <input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder={t("lab_search_ph") || "Search diagnostics..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-10 pb-32">
        {pendingReports.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg theme-glass-panel border border-amber-500/30 flex items-center justify-center shadow-md shrink-0 bg-amber-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]"></span>
              </div>
              <h4 className="text-sm font-black text-amber-500 uppercase tracking-widest drop-shadow-md">
                {t("lab_pending_queue") || "PENDING DIAGNOSTICS"} ({pendingReports.length})
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {pendingReports.map((mod: any) => (
                <ArtifactCard key={mod.id} mod={mod} onClick={() => setActiveReport(mod)} masonsList={allMasons} overrideActionLabel={t("mason_bug_inspect_report") || "INSPECT"} />
              ))}
            </div>
          </div>
        )}

        {completedReports.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2 mt-4">
              <div className="w-8 h-8 rounded-lg theme-glass-panel border border-[color-mix(in_srgb,var(--text)_30%,transparent)] flex items-center justify-center shadow-md shrink-0 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-70">check_circle</span>
              </div>
              <h4 className="text-sm font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest drop-shadow-md">
                {t("lab_completed_queue") || "COMPLETED DIAGNOSTICS"} ({completedReports.length})
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {completedReports.map((mod: any) => (
                <ArtifactCard key={mod.id} mod={mod} onClick={() => setActiveReport(mod)} masonsList={allMasons} overrideActionLabel={t("mason_bug_inspect_report") || "INSPECT"} />
              ))}
            </div>
          </div>
        )}

        {labReports.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 mt-10">
            <span className="text-8xl mb-6 grayscale"></span>
            <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] text-center px-8 leading-relaxed">{t("hub_no_pending_reports") || "NO PENDING REPORTS"}</span>
          </div>
        )}
      </div>

      {activeReport && (
        <SidePanel
          isOpen={!!activeReport}
          onClose={closePanel}
          title={t("lab_diagnostic_panel_title") || "Diagnostic Run"}
          icon="monitor_heart"
          footer={
            (!testRun || isLoading) ? (
              <div className="flex flex-col w-full gap-4">
                {isLoading && (
                  <div className="flex gap-4">
                    <button onClick={() => concludeTest(true)} className="flex-1 py-4 bg-white/10 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white/20 hover:theme-text-success transition-all shadow-lg border border-white/5 hover:border-green-500/50">
                      Conclude & Pass
                    </button>
                    <button onClick={() => concludeTest(false)} className="flex-1 py-4 bg-white/10 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white/20 hover:theme-text-danger transition-all shadow-lg border border-white/5 hover:border-red-500/50">
                      Conclude & Fail
                    </button>
                  </div>
                )}
                
                {!testRun && (
                  <div className="w-full">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center p-6 theme-glass-inner rounded-xl gap-4 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]">
                        <div className="w-8 h-8 border-4 border-[color-mix(in_srgb,var(--text)_10%,transparent)] border-t-[var(--accent)] rounded-full animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest animate-pulse mt-1 theme-text-accent">{t("lab_diagnostic_running") || "DIAGNOSING..."}</span>
                      </div>
                    ) : isModMissingLocally(activeReport.name) ? (
                      <button 
                        onClick={() => setIsMissingArtifactPanelOpen(true)} 
                        className="w-full h-14 theme-glass-panel border border-[var(--warning)]/50 text-[var(--warning)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--warning)]/10 transition-all shadow-[0_0_20px_rgba(var(--warning-rgb),0.15)] flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_download") || "download"}</span>
                        {t("lab_missing_artifacts") || "ACQUIRE MISSING ARTIFACT"}
                      </button>
                    ) : (
                      <button 
                        onClick={runSimulation} 
                        className="w-full h-14 theme-glass-panel border border-[var(--accent)]/50 text-[var(--accent)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--accent)]/10 transition-all shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_play") || "play_arrow"}</span>
                        {t("lab_btn_run_diagnostic") || "RUN DIAGNOSTIC"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : undefined
          }
        >
          <div className="flex flex-col h-full overflow-hidden">
            <div className="px-8 py-4 border-b border-white/5 bg-white/5 backdrop-blur-md shrink-0 flex flex-col gap-1">
               <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest">{t("nexus_target_artifact") || "TARGET ARTIFACT"}</span>
               <span className="text-sm font-bold text-[var(--text)] truncate">{activeReport?.name}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pb-8 flex flex-col gap-8">
              
              <div className="flex flex-col gap-4">
                <h3 className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("lab_diagnostic_dependencies") || "Add Dependencies"}</h3>
                <p className="text-[10px] text-[var(--subtext)] opacity-50 ml-2 -mt-2 leading-relaxed">{t("lab_diagnostic_dependencies_desc") || "Select optional or required mods to inject alongside the target."}</p>
                
                <div className="theme-glass-inner rounded-xl p-4 flex flex-col gap-4">
                  <ModSearchDropdown 
                    selectedItem={null}
                    onSelect={handleSelectDependency}
                    onClear={() => {}}
                    placeholder={t("lab_search_dep_ph") || "Search dependencies..."}
                    modList={allMods.filter(m => m.id !== activeReport.id && !dependencies.some(d => d.id === m.id))}
                  />
                  {dependencies.length > 0 && (
                    <div className="flex flex-col gap-2 mt-2">
                      {dependencies.map(d => (
                         <div key={d.id} className="flex justify-between items-center p-3 theme-glass-panel rounded-lg border border-white/5 text-[var(--text)] text-sm font-bold">
                           <span className="truncate pr-4">{d.name}</span>
                           <button onClick={() => handleRemoveDependency(d.id)} className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center shrink-0">
                             <span className="material-symbols-outlined !text-[14px]">close</span>
                           </button>
                         </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("lab_diagnostic_conflict_target") || "Target Conflict Matrix"}</h3>
                <p className="text-[10px] text-[var(--subtext)] opacity-50 ml-2 -mt-2 leading-relaxed">{t("lab_diagnostic_conflict_target_desc") || "Select a suspected conflicting artifact to simulate their combined injection."}</p>
                
                <div className="theme-glass-inner rounded-xl p-4 flex flex-col gap-4">
                  {conflictTarget ? (
                    <div className="flex flex-col gap-2 relative">
                      <div className="flex justify-between items-center p-4 theme-glass-panel rounded-xl border border-[var(--danger)]/30 text-[var(--text)] bg-[var(--danger)]/5 shadow-[0_0_15px_rgba(var(--danger-rgb),0.1)]">
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--danger)] mb-1">Testing Conflict With</span>
                          <span className="text-sm font-bold truncate">{conflictTarget.name}</span>
                        </div>
                        <button onClick={() => setConflictTarget(null)} className="w-8 h-8 rounded-lg hover:bg-[var(--danger)]/20 text-[var(--danger)] flex items-center justify-center shrink-0 transition-colors">
                          <span className="material-symbols-outlined !text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ModSearchDropdown 
                      selectedItem={null}
                      onSelect={(m: any) => setConflictTarget(m)}
                      onClear={() => {}}
                      placeholder={t("lab_search_conflict_ph") || "Select conflict target..."}
                      modList={allMods.filter(m => m.id !== activeReport.id && !dependencies.some(d => d.id === m.id))}
                    />
                  )}
                </div>
              </div>

              {testRun ? (
                <div className="flex flex-col gap-4 mt-4 animate-in slide-in-from-bottom-4">
                  <h3 className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("lab_diagnostic_results") || "Diagnostic Results"}</h3>
                  <div className={`p-6 theme-glass-inner rounded-2xl flex flex-col gap-4 border ${testPassed ? 'border-[var(--success)]/30 bg-[var(--success)]/5 shadow-[0_0_20px_rgba(var(--success-rgb),0.1)]' : 'border-[var(--danger)]/30 bg-[var(--danger)]/5 shadow-[0_0_20px_rgba(var(--danger-rgb),0.1)]'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${testPassed ? 'border-[var(--success)]/50 bg-[var(--success)]/20 text-[var(--success)]' : 'border-[var(--danger)]/50 bg-[var(--danger)]/20 text-[var(--danger)]'}`}>
                         <span className="material-symbols-outlined !text-[20px]">{testPassed ? 'check_circle' : 'error'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-lg font-black uppercase tracking-widest ${testPassed ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {testPassed ? t("lab_test_passed") || "VERIFIED: STABLE" : t("lab_test_failed") || "VERIFIED: UNSTABLE"}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text)] opacity-60">
                           {t("lab_injection_sim") || "Injection Simulation"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 w-full theme-glass-panel rounded-xl p-4 border border-white/5 font-mono text-[10px] text-[var(--subtext)] max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap leading-relaxed">
                      {testLog || "No logs generated."}
                    </div>

                    {!testPassed && conflictTarget && (
                      <div className="mt-4 border-t border-[var(--danger)]/20 pt-6">
                        <h3 className="text-sm font-black theme-text-accent uppercase tracking-widest">{t("lab_btn_add_to_nexus")}</h3>
                        <form onSubmit={submitToNexus} className="flex flex-col gap-4">
                          <div className="flex flex-col gap-2">
                            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("hub_resolution_suggestion")}</label>
                            <input required value={resolution} onChange={e => setResolution(e.target.value)} placeholder="e.g. Load Mod A after Mod B" className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("hub_severity")}</label>
                            <CustomTierDropdown value={severity} onChange={(val) => setSeverity(val)} />
                          </div>
                          <button type="submit" disabled={isSubmitting} className="w-full py-4 theme-bg-success text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 transition-all shadow-lg disabled:opacity-50 mt-2">
                            {isSubmitting ? "Saving..." : "Save Conflict Rule"}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

            </div>
          </div>
        </SidePanel>
      )}

      <SidePanel
        isOpen={isMissingArtifactPanelOpen}
        onClose={() => setIsMissingArtifactPanelOpen(false)}
        title={t("lab_missing_artifacts") || "ACQUIRE MISSING ARTIFACT"}
        icon="download"
        widthClass="w-[450px]"
        footer={
           <div className="flex flex-col gap-4 mt-4 w-full">
              {activeReport?.download_url ? (
                 <button onClick={() => window.open(activeReport.download_url, "_blank")} className="w-full h-14 theme-glass-panel border border-[var(--warning)]/50 text-[var(--warning)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--warning)]/10 transition-all shadow-[0_0_20px_rgba(var(--warning-rgb),0.15)] flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined !text-[16px]">download</span> {t("lab_download_source") || "Download from Source"}
                 </button>
              ) : null}
              <button onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent((activeReport?.name || '') + ' mod download')}`, "_blank")} className="w-full h-14 theme-glass-panel border border-[var(--accent)]/50 text-[var(--accent)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--accent)]/10 transition-all shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] flex items-center justify-center gap-2">
                 <span className="material-symbols-outlined !text-[16px]">search</span> {t("lab_search_web") || "Search Web"}
              </button>
           </div>
        }
      >
        <div className="flex flex-col p-8 gap-6">
           <div className="p-6 theme-glass-panel border border-[var(--warning)]/30 rounded-3xl flex flex-col items-center justify-center gap-4 text-center mt-8">
              <span className="material-symbols-outlined !text-[48px] text-[var(--warning)] opacity-80">extension_off</span>
              <div className="flex flex-col gap-1">
                 <span className="text-sm font-black text-[var(--text)] uppercase tracking-widest">{activeReport?.name}</span>
                 <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("lab_missing_dependency_desc") || "Missing Dependency or Artifact"}</span>
              </div>
           </div>
        </div>
      </SidePanel>
    </div>
  );
}


function CustomStatusDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const options =[
    { id: 'verified', label: t("status_dd_verified") },
    { id: 'under_review', label: t("status_dd_review") },
    { id: 'broken', label: t("status_dd_broken") },
    { id: 'pending', label: t("status_pending") || "Pending" },
    { id: 'unverified', label: t("status_dd_unverified") },
  ];
  return <CustomDropdown disableTint={true} value={value} options={options} onChange={(v: string[]) => onChange(v[0])} placeholder="Select Status" />;
}



function ProtocolSearchModal({ isOpen, onClose, onSelect, cloudMods, mode }: { isOpen: boolean, onClose: () => void, onSelect: (targetId: string) => void, cloudMods: any[], mode: string }) {
  const { t } = useLexicon();
  const[query, setQuery] = useState("");

  if (!isOpen) return null;

  const results = cloudMods.filter((m: any) =>
    (m.name || '').toLowerCase().includes((query || '').toLowerCase()) ||
    (m.master_author || '').toLowerCase().includes((query || '').toLowerCase())
  ).slice(0, 15);

  const getTitle = () => {
    switch(mode) {
      case 'dependency': return t("modal_sel_dep");
      case 'addon': return t("modal_sel_addon");
      case 'twin': return t("modal_sel_twin");
      case 'rival': return t("modal_sel_rival");
      case 'beta': return "Select Beta Protocol";
      default: return t("modal_sel_artifact");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-[3px] animate-in fade-in">
      <div className="w-full max-w-lg bg-[var(--sidebar)] border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black uppercase tracking-widest theme-text-accent">
              {getTitle()}
            </h3>
            <button onClick={onClose} className="text-[var(--text)]/50 hover:text-[var(--text)] font-black">?</button>
          </div>
          <input
            autoFocus
            type="text"
            placeholder={t("modal_search_catalog")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent"
          />
        </div>

        <div className="p-4 flex flex-col gap-2 max-h-96 overflow-y-auto custom-scrollbar">
          {results.length > 0 ? results.map(mod => (
            <button
              key={mod.id}
              onClick={() => { onSelect(mod.id); }}
              className="flex justify-between items-center px-5 py-3 theme-glass-inner border border-white/5 hover:theme-border-accent hover:theme-panel-accent rounded-xl transition-all text-left group"
            >
              <div className="flex flex-col max-w-[80%]">
                <span className="text-xs font-black text-[var(--text)] uppercase truncate">{mod.name}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate">{mod.master_author || t("registry_unknown_architect")}</span>
                  {(mod.original_filename || mod.mod_type) && (
                    <>
                      <span className="text-[var(--subtext)] opacity-40">•</span>
                      <span className="text-[9px] font-mono theme-text-accent tracking-tighter truncate max-w-[200px]" title={mod.original_filename || mod.mod_type}>{mod.original_filename || mod.mod_type}</span>
                    </>
                  )}
                  {(mod.latest_version || mod.version) && (
                    <>
                      <span className="text-[var(--subtext)] opacity-40">•</span>
                      <span className="text-[9px] font-bold text-[var(--text)] uppercase tracking-widest">{mod.latest_version || mod.version}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="theme-text-accent opacity-0 group-hover:opacity-100 transition-opacity font-black text-[10px] uppercase tracking-widest">{t("modal_btn_link")}</span>
            </button>
          )) : (
            <div className="text-center p-8 text-[var(--subtext)] opacity-60 font-bold text-xs uppercase tracking-widest">{t("modal_no_matches")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DLCSearchDropdown({ onSelect, currentDLC =[] }: { onSelect: (pack: string) => void, currentDLC: string[] }) {
  const { t } = useLexicon();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const DLC_MASTER_LIST =[
    { code: "EP01", name: "Get to Work" }, { code: "EP02", name: "Get Together" }, { code: "EP03", name: "City Living" },
    { code: "EP04", name: "Cats & Dogs" }, { code: "EP05", name: "Seasons" }, { code: "EP06", name: "Get Famous" },
    { code: "EP07", name: "Island Living" }, { code: "EP08", name: "Discover University" }, { code: "EP09", name: "Eco Lifestyle" },
    { code: "EP10", name: "Snowy Escape" }, { code: "EP11", name: "Cottage Living" }, { code: "EP12", name: "High School Years" },
    { code: "EP13", name: "Growing Together" }, { code: "EP14", name: "Horse Ranch" }, { code: "EP15", name: "For Rent" },
    { code: "GP01", name: "Outdoor Retreat" }, { code: "GP02", name: "Spa Day" }, { code: "GP03", name: "Dine Out" },
    { code: "GP04", name: "Vampires" }, { code: "GP05", name: "Parenthood" }, { code: "GP06", name: "Jungle Adventure" },
    { code: "GP07", name: "StrangerVille" }, { code: "GP08", name: "Realm of Magic" }, { code: "GP09", name: "Star Wars" },
    { code: "GP10", name: "Dream Home Decorator" }, { code: "GP11", name: "My Wedding Stories" }, { code: "GP12", name: "Werewolves" },
  ];

  const filtered = DLC_MASTER_LIST.filter(d =>
    (d.code.toLowerCase().includes(query.toLowerCase()) || d.name.toLowerCase().includes(query.toLowerCase())) &&
    !currentDLC.includes(d.code)
  );

  return (
    <div className={`relative w-full ${isOpen ? 'z-[6000]' : ''}`}>
      <div className="flex gap-2">
        <div className={`relative flex-1 ${isOpen ? 'z-[6000]' : ''}`}>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            placeholder={t("registry_search_dlc")}
            className="w-full theme-glass-inner rounded-lg px-3 py-1.5 text-[var(--text)] text-sm uppercase font-bold focus:outline-none focus:theme-border-success"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1.5 text-[var(--text)]/20 hover:text-[var(--text)] text-[10px]"></button>
          )}
        </div>
      </div>
      {isOpen && query.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--sidebar)] backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2">
          {filtered.length > 0 ? filtered.map(d => (
            <button
              key={d.code}
              onClick={() => { onSelect(d.code); setQuery(""); setIsOpen(false); }}
              className="w-full text-left px-4 py-2 hover:theme-panel-success flex flex-col transition-colors group"
            >
              <span className="text-[10px] font-black theme-text-success uppercase">{d.code}</span>
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-80 group-hover:text-[var(--text)] uppercase">{d.name}</span>
            </button>
          )) : (
            <div className="p-4 text-center text-[9px] font-black text-gray-600 uppercase tracking-widest">{t("registry_no_dlc")}</div>
          )}
        </div>
      )}
    </div>
  );
}

function CommandCenter({ onNavigate }: any = {}) {
  const { t } = useLexicon();

  const [stats, setStats] = useState({ 
    unverified: 0, 
    labReports: 0, 
    scoutQueue: 0, 
    masonQueue: 0,
    marketplaceReports: 0,
    conflictPending: 0,
    nsfw: 0, 
    explicit: 0 
  });

  const [commsInput, setCommsInput] = useState("");
  const [commsMessages, setCommsMessages] = useState<any[]>([]);
  const [editingCommId, setEditingCommId] = useState<number | string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();

    const fetchComms = async () => {
      const { data } = await supabase.from('hub_comms').select('*').order('created_at', { ascending: false }).limit(50);
      if (data) {
        const senderIds = Array.from(new Set(data.map(m => m.sender_id).filter(id => id)));
        if (senderIds.length > 0) {
          let profiles = null;
          if (senderIds.length === 1) {
            const { data } = await supabase.from('profiles').select('id, username').eq('id', senderIds[0]);
            profiles = data;
          } else {
            const { data } = await supabase.from('profiles').select('id, username').in('id', senderIds);
            profiles = data;
          }
          const profileMap: any = {};
          profiles?.forEach((p: any) => profileMap[p.id] = p.username || p.id.substring(0,8));
          
          const enriched = data.map(m => ({
            ...m,
            sender_name: profileMap[m.sender_id] || m.sender_id.substring(0,8)
          }));
          setCommsMessages(enriched.reverse());
        } else {
          setCommsMessages(data.reverse());
        }
      }
    };
    fetchComms();

    const commsSub = supabase.channel('global-comms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_comms' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const fetchSender = async () => {
            const { data: profile } = await supabase.from('profiles').select('username').eq('id', payload.new.sender_id).single();
            const name = profile?.username || payload.new.sender_id.substring(0,8);
            setCommsMessages(prev => [...prev, { ...payload.new, sender_name: name }]);
          };
          fetchSender();
        }
        if (payload.eventType === 'UPDATE') setCommsMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        if (payload.eventType === 'DELETE') setCommsMessages(prev => prev.filter(m => m.id !== payload.old.id));
      }).subscribe();

    return () => { supabase.removeChannel(commsSub); };
  }, []);

  const sendComm = async () => {
    if (!commsInput.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    if (editingCommId) {
      await supabase.from('hub_comms').update({ message: commsInput.trim() }).eq('id', editingCommId);
      setEditingCommId(null);
    } else {
      await supabase.from('hub_comms').insert({
        sender_id: user.id,
        message: commsInput.trim()
      });
    }
    setCommsInput("");
  };

  const deleteComm = async (id: number | string) => {
    await supabase.from('hub_comms').delete().eq('id', id);
  };

  useEffect(() => {
    const fetchStats = async () => {
      const { count: unverifiedCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('status', 'unverified');
      const { count: labReportsCount } = await supabase.from('solder_lab_logs').select('*', { count: 'exact', head: true });
      const { count: nsfwCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 1);
      const { count: explicitCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 2);
      const { count: scoutQueueCount } = await supabase.from('scout_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: masonQueueCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('status', 'under_review');
      const { count: marketplaceReportsCount } = await supabase.from('marketplace_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: conflictPendingCount } = await supabase.from('logical_conflicts').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      
      setStats({
        unverified: unverifiedCount || 0,
        labReports: labReportsCount || 0,
        scoutQueue: scoutQueueCount || 0,
        masonQueue: masonQueueCount || 0,
        marketplaceReports: marketplaceReportsCount || 0,
        conflictPending: conflictPendingCount || 0,
        nsfw: nsfwCount || 0,
        explicit: explicitCount || 0
      });
    };
    fetchStats();
  }, []);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        <button onClick={() => onNavigate && onNavigate('registry', 'unverified')} className="theme-glass-panel border-white/5 p-6 rounded-3xl flex flex-col gap-2 hover:scale-105 hover:z-10 transition-all text-left group shadow-lg" style={{ '--tw-border-opacity': '1', borderColor: 'rgba(59, 130, 246, 0.3)' } as any}>
          <span className="text-4xl font-black text-[var(--text)] group-hover:theme-text-success transition-colors drop-shadow-md">{stats.unverified}</span>
          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("status_dd_unverified")}</span>
        </button>
        
        <button onClick={() => onNavigate && onNavigate('queue')} className="theme-glass-panel border-white/5 p-6 rounded-3xl flex flex-col gap-2 hover:scale-105 hover:z-10 transition-all text-left group shadow-lg" style={{ '--tw-border-opacity': '1', borderColor: 'rgba(59, 130, 246, 0.5)' } as any}>
          <span className="text-4xl font-black theme-text-accent transition-colors drop-shadow-[0_0_15px_var(--accent)]">{stats.scoutQueue}</span>
          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("hub_tab_queue")}</span>
        </button>
        
        <button onClick={() => onNavigate && onNavigate('mason_queue')} className="theme-glass-panel border-white/5 p-6 rounded-3xl flex flex-col gap-2 hover:scale-105 hover:z-10 transition-all text-left group shadow-lg" style={{ '--tw-border-opacity': '1', borderColor: 'rgba(192, 132, 252, 0.5)' } as any}>
          <span className="text-4xl font-black text-purple-400 transition-colors drop-shadow-[0_0_15px_rgba(192,132,252,0.5)]">{stats.masonQueue}</span>
          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("hub_tab_mason_queue")}</span>
        </button>

        <button onClick={() => onNavigate && onNavigate('matrix')} className="theme-glass-panel border-white/5 p-6 rounded-3xl flex flex-col gap-2 hover:scale-105 hover:z-10 transition-all text-left group shadow-lg" style={{ '--tw-border-opacity': '1', borderColor: 'rgba(239, 68, 68, 0.5)' } as any}>
          <span className="text-4xl font-black theme-text-danger transition-colors drop-shadow-[0_0_15px_var(--danger)]">{stats.conflictPending}</span>
          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("hub_tab_conflicts_pending")}</span>
        </button>

        <button onClick={() => onNavigate && onNavigate('marketplace_reports')} className="theme-glass-panel border-white/5 p-6 rounded-3xl flex flex-col gap-2 hover:scale-105 hover:z-10 transition-all text-left group shadow-lg" style={{ '--tw-border-opacity': '1', borderColor: 'rgba(245, 158, 11, 0.5)' } as any}>
          <span className="text-4xl font-black theme-text-warning transition-colors drop-shadow-[0_0_15px_var(--warning)]">{stats.marketplaceReports}</span>
          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("hub_tab_marketplace_reports")}</span>
        </button>

        <button onClick={() => onNavigate && onNavigate('lab')} className="theme-glass-panel border-white/5 p-6 rounded-3xl flex flex-col gap-2 hover:scale-105 hover:z-10 transition-all text-left group shadow-lg" style={{ '--tw-border-opacity': '1', borderColor: 'rgba(245, 158, 11, 0.5)' } as any}>
          <span className="text-4xl font-black theme-text-warning transition-colors drop-shadow-[0_0_15px_var(--warning)]">{stats.labReports}</span>
          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("lab_queue")}</span>
        </button>

        <button onClick={() => onNavigate && onNavigate('registry', 'nsfw')} className="theme-glass-panel border-white/5 p-6 rounded-3xl flex flex-col gap-2 hover:scale-105 hover:z-10 transition-all text-left group shadow-lg" style={{ '--tw-border-opacity': '1', borderColor: 'rgba(245, 158, 11, 0.5)' } as any}>
          <span className="text-4xl font-black theme-text-warning transition-colors drop-shadow-[0_0_15px_var(--warning)]">{stats.nsfw}</span>
          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("hub_tab_nsfw_reported")}</span>
        </button>

        <button onClick={() => onNavigate && onNavigate('registry', 'explicit')} className="theme-glass-panel border-white/5 p-6 rounded-3xl flex flex-col gap-2 hover:scale-105 hover:z-10 transition-all text-left group shadow-lg" style={{ '--tw-border-opacity': '1', borderColor: 'rgba(249, 115, 22, 0.5)' } as any}>
          <span className="text-4xl font-black theme-text-danger transition-colors drop-shadow-[0_0_15px_var(--danger)]">{stats.explicit}</span>
          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("hub_tab_explicit_reported")}</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8 mt-8">
        
        <div className="flex-1 theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] rounded-[3rem] p-8 flex flex-col h-[600px] shadow-[0_0_50px_rgba(var(--accent-rgb),0.1)] relative overflow-hidden backdrop-blur-2xl">
          <div className="absolute top-[-100px] left-[-100px] w-96 h-96 theme-bg-accent opacity-10 blur-[100px] rounded-full pointer-events-none z-0" />
          <h3 className="text-sm font-black theme-text-accent uppercase tracking-[0.3em] mb-6 flex items-center gap-4 relative z-10 pl-2">
            <span className="w-2.5 h-2.5 rounded-full theme-bg-success animate-pulse shadow-[0_0_15px_var(--success)]"></span>
            {t("hub_comms_title")}
          </h3>
          
          <div className="flex-1 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-white/5 rounded-[2.5rem] flex flex-col mb-6 overflow-y-auto p-8 gap-5 custom-scrollbar shadow-inner relative z-10 backdrop-blur-[3px]">
             {commsMessages.length === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                 <span className="text-5xl mb-6 grayscale drop-shadow-2xl">{t("emote_chat")}</span>
                 <span className="text-xs font-black text-[var(--text)] uppercase tracking-[0.3em] text-center px-8 leading-loose opacity-70">
                   {t("hub_comms_offline")}<br/>{t("hub_comms_handshake")}
                 </span>
               </div>
             ) : (
               commsMessages.map((msg, i) => (
                 <div key={msg.id || i} className="flex flex-col gap-3 text-left theme-glass-inner p-6 rounded-[2rem] animate-in fade-in slide-in-from-bottom-4 border border-white/5 hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all shadow-lg group relative overflow-hidden">
                   <div className="absolute left-0 top-0 bottom-1 w-1 theme-bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                   <div className="flex justify-between items-center opacity-70 mb-1">
                     <span className="text-[10px] font-black uppercase tracking-[0.2em] theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)] flex items-center gap-2">
                       <span className="w-4 h-4 rounded flex items-center justify-center bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[8px]">{(msg.sender_name || msg.sender_id)?.charAt(0)}</span>
                       {msg.sender_name || msg.sender_id?.substring(0,8)}
                     </span>
                     <div className="flex gap-4 items-center">
                       {currentUserId === msg.sender_id && (
                           <div className="flex gap-3 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingCommId(msg.id); setCommsInput(msg.message); }} className="text-[9px] uppercase font-black tracking-widest hover:theme-text-accent transition-colors hover:scale-110">{t("emote_edit")}</button>
                            <button onClick={() => deleteComm(msg.id)} className="text-[9px] uppercase font-black tracking-widest hover:theme-text-danger transition-colors hover:scale-110">{t("emote_close")}</button>
                          </div>
                       )}
                       <span className="text-[9px] font-black tracking-widest text-[var(--subtext)] opacity-60">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                     </div>
                   </div>
                   <p className="text-sm font-medium text-[var(--text)] leading-relaxed opacity-90 pl-1">{msg.message}</p>
                 </div>
               ))
             )}
          </div>
          
          <div className="flex gap-3 relative z-10 bg-black/20 p-2.5 rounded-[2rem] border border-white/5 backdrop-blur-md shadow-2xl">
            <input 
              type="text" 
              value={commsInput}
              onChange={(e) => setCommsInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendComm()}
              className="flex-1 bg-transparent rounded-2xl px-6 py-3 text-[var(--text)] text-sm font-bold focus:outline-none transition-all placeholder-[color-mix(in_srgb,var(--subtext)_50%,transparent)]" 
              placeholder={t("hub_comms_placeholder")} 
            />
            <button 
              onClick={sendComm}
              disabled={!commsInput.trim()}
              className="px-10 py-4 theme-bg-accent text-[var(--bg)] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] shrink-0"
            >
              {editingCommId ? t("hub_comms_btn_update") : t("hub_btn_send")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



interface UnifiedReport {
  id: string;
  source: "marketplace" | "blueprint" | "comm-link";
  status: string;
  title: string;
  description: string;
  created_at: string;
  reporter_name: string;
  target_id: string;
  metadata?: any;
}

export function MarketplaceReportsViewer({ onOpenDossier }: any) {
    const { t } = useLexicon();
    const [reports, setReports] = useState<UnifiedReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<UnifiedReport | null>(null);
    const [activeCodeSnippet, setActiveCodeSnippet] = useState<string | null>(null);
    const [activeAsset, setActiveAsset] = useState<{id: string, type: string} | null>(null);
    const [resolutionReason, setResolutionReason] = useState("");
    const [isSubmittingAction, setIsSubmittingAction] = useState(false);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [activeStatus, setActiveStatus] = useState<"pending" | "resolved" | "ALL">("pending");
    const [activeType, setActiveType] = useState<string>("ALL");
  
    useEffect(() => {
      fetchReports();
    }, []);
  
    const fetchReports = async () => {
      setLoading(true);
      
      const { data: marketplaceData } = await supabase
        .from('marketplace_reports')
        .select('*, marketplace_assets(*)');
        
      const { data: blueprintData } = await supabase
        .from('blueprint_reports')
        .select('*, blueprints(*)');
        
      const { data: commData } = await supabase
        .from('content_flags')
        .select('*');

      const unified: UnifiedReport[] = [];
      
      if (marketplaceData) {
        marketplaceData.forEach((r: any) => {
            unified.push({
                id: r.id,
                source: "marketplace",
                status: r.status === 'pending' ? 'pending' : 'resolved',
                title: r.marketplace_assets?.name || "Unknown Asset",
                description: r.reason || "No reason provided",
                created_at: r.created_at,
                reporter_name: r.reporter_name || "Anonymous",
                target_id: r.asset_id,
                metadata: {
                    original_status: r.status,
                    author: r.marketplace_assets?.author,
                    json_data: r.marketplace_assets?.json_data,
                    asset_full: r.marketplace_assets
                }
            });
        });
      }

      if (blueprintData) {
        blueprintData.forEach((r: any) => {
            unified.push({
                id: r.id,
                source: "blueprint",
                status: r.status === 'pending' ? 'pending' : 'resolved',
                title: r.blueprints?.name || "Unknown Blueprint",
                description: r.reason || "No reason provided",
                created_at: r.created_at,
                reporter_name: r.reporter_name || "Anonymous",
                target_id: r.blueprint_id,
                metadata: {
                    original_status: r.status,
                    author: r.blueprints?.author_id
                }
            });
        });
      }

      if (commData) {
        commData.forEach((r: any) => {
            unified.push({
                id: r.id,
                source: "comm-link",
                status: r.status === 'pending' ? 'pending' : 'resolved',
                title: `COMM-LINK: ${r.content_type.toUpperCase()}`,
                description: r.reason || "No reason provided",
                created_at: r.created_at,
                reporter_name: r.reporter_id || "Anonymous",
                target_id: r.content_id,
                metadata: {
                    original_status: r.status,
                    content_type: r.content_type
                }
            });
        });
      }

      setReports(unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setLoading(false);
    };
  
    const handleProcessReport = async (action: 'dismiss' | 'remove' | 'ban') => {
      if (!selectedReport) return;
      setIsSubmittingAction(true);
      
      try {
        const table = selectedReport.source === 'marketplace' ? 'marketplace_reports' 
                    : selectedReport.source === 'blueprint' ? 'blueprint_reports' 
                    : 'content_flags';

        if (action === 'dismiss') {
          await supabase.from(table).update({ status: 'dismissed' }).eq('id', selectedReport.id);
          logArchitectAction(`Dismissed report for ${selectedReport.title}`, table, selectedReport.id);
        } else if (action === 'remove') {
          if (selectedReport.source === 'marketplace') {
            await supabase.rpc('admin_remove_asset', { target_asset_id: selectedReport.target_id });
            await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
            logArchitectAction(`Removed Asset: ${selectedReport.title} due to: ${resolutionReason}`, `marketplace_assets`, selectedReport.target_id);
          } else if (selectedReport.source === 'blueprint') {
            await supabase.from('blueprints').update({ is_public: false }).eq('id', selectedReport.target_id);
            await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
            logArchitectAction(`Removed Blueprint: ${selectedReport.title} due to: ${resolutionReason}`, `blueprints`, selectedReport.target_id);
          } else if (selectedReport.source === 'comm-link') {
             // For comm-link, remove the post/comment
             if (selectedReport.metadata.content_type === 'post') {
                 await supabase.from('mason_posts').delete().eq('id', selectedReport.target_id);
             } else if (selectedReport.metadata.content_type === 'comment') {
                 await supabase.from('mason_post_comments').delete().eq('id', selectedReport.target_id);
             }
             await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
             logArchitectAction(`Removed Comm-Link ${selectedReport.metadata.content_type}: ${selectedReport.target_id}`, table, selectedReport.id);
          }
        } else if (action === 'ban') {
           if (selectedReport.metadata?.author) {
              await supabase.rpc('admin_ban_author', { target_author: selectedReport.metadata.author });
           }
           await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
           logArchitectAction(`Banned Author and Revoked Uploads: ${resolutionReason}`, `profiles`, selectedReport.metadata?.author || selectedReport.reporter_name);
        }
        
        setReports(reports.map(r => r.id === selectedReport.id ? { ...r, status: action === 'dismiss' ? 'dismissed' : 'resolved' } : r));
        setSelectedReport(null);
        setResolutionReason("");
      } catch (e) {
        console.error(e);
        alert("Failed to process action.");
      }
      
      setIsSubmittingAction(false);
    };
  
    const filteredReports = reports.filter(r => {
        if (activeStatus !== "ALL" && r.status !== activeStatus) return false;
        if (activeType !== "ALL" && r.source !== activeType) return false;
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            if (!r.title.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
        }
        return true;
    });
  
    return (
      <div className="flex flex-col w-full relative h-full">
          <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
            <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_report") || "flag"}</span>
              </div>
              <span className="truncate">{t("hub_title_reports")?.replace("dY>' ", "") || "Nexus Reports"}</span>
            </h2>

            <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
              <div className="relative flex-1 max-w-[300px]">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
                <input 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                  placeholder={t("registry_search_placeholder") || "Search reports..."} 
                  className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                />
              </div>

              <div className="w-40 relative z-50 h-12">
                <CustomDropdown disableTint={true}
                  value={activeType}
                  options={[
                    { id: 'ALL', label: 'ALL TYPES' },
                    { id: 'marketplace', label: 'MARKETPLACE' },
                    { id: 'blueprint', label: 'BLUEPRINTS' },
                    { id: 'comm-link', label: 'COMM-LINK' }
                  ]}
                  onChange={(v: string[]) => setActiveType(v[0])}
                  placeholder="Select Type..."
                />
              </div>

              <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 border border-white/5 h-12 shrink-0">
                <button 
                  onClick={() => setActiveStatus("pending" as any)}
                  className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${activeStatus === 'pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
                >
                  Pending
                </button>
                <button 
                  onClick={() => setActiveStatus("resolved" as any)}
                  className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${activeStatus === 'resolved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
                >
                  Resolved
                </button>
              </div>
            </div>
          </div>
        
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-10">
        {loading ? (
          <div className="theme-glass-panel p-8 rounded-3xl text-center text-sm font-bold text-[var(--subtext)]">{t("hub_loading")}</div>
        ) : filteredReports.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-50 theme-glass-panel rounded-3xl py-20">
            <span className="text-4xl mb-4 grayscale"><span className="material-symbols-outlined shrink-0">{t("ui_icon_shield") || "shield"}</span></span>
            <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] text-center px-8 leading-relaxed">NO TICKETS FOUND IN THIS CATEGORY.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {filteredReports.map(report => (
              <div 
                  key={report.id}
                  className="theme-glass-panel rounded-[1.5rem] flex flex-col group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-emerald-500/50 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] transition-all duration-500 hover:-translate-y-1.5 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[220px]"
                  onClick={() => setSelectedReport(report)}
              >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500
                      ${report.status?.toLowerCase() === 'pending' ? 'bg-amber-500/50 group-hover:bg-amber-500 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.5)]' : 'bg-emerald-500/50 group-hover:bg-emerald-500 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]'}
                  `} />
                  
                  <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                      <div className="flex justify-between items-start gap-4">
                          <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-emerald-500/30">
                              <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-50 group-hover:opacity-100 group-hover:text-emerald-400 transition-colors duration-500">
                                  {report.status?.toLowerCase() === 'pending' ? 'warning' : 'done_all'}
                              </span>
                          </div>
                          <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors
                              ${report.status?.toLowerCase() === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 group-hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 group-hover:bg-emerald-500/20'}
                          `}>
                              {(report.status || "PENDING").replace(/_/g, ' ')}
                          </span>
                      </div>
                      
                      <div className="flex flex-col gap-1 mt-2">
                          <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2 truncate opacity-70 group-hover:opacity-100 transition-opacity">
                              {report.source.replace('-', ' ')}
                          </span>
                          <h3 className="font-black text-xl leading-tight text-[var(--text)] group-hover:text-emerald-400 transition-colors uppercase tracking-widest line-clamp-2">
                              {report.title}
                          </h3>
                      </div>
                      
                      <p className="text-xs text-[var(--subtext)] line-clamp-3 leading-relaxed font-bold opacity-70 group-hover:opacity-100 transition-opacity flex-1">
                          {report.description}
                      </p>
                      
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] gap-4 relative">
                          <div className="flex items-center gap-4 flex-1 min-w-0 group-hover:opacity-0 transition-opacity duration-300">
                              <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60 shrink-0">
                                  <span className="material-symbols-outlined !text-[14px] normal-case">{t("ui_icon_calendar_today") || "calendar_today"}</span>
                                  {new Date(report.created_at).toLocaleDateString()}
                              </span>
                              <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60 shrink-0">
                                  <span className="material-symbols-outlined !text-[14px] normal-case">{t("ui_icon_person") || "person"}</span>
                                  {report.reporter_name.substring(0, 8)}
                              </span>
                          </div>
                          <button className="text-[10px] font-black text-[var(--text)] group-hover:text-emerald-400 uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                              {t("mason_bug_inspect_report") || "INSPECT"} <span className="text-lg leading-none">&rarr;</span>
                          </button>
                      </div>
                  </div>
              </div>
            ))}
          </div>
        )}
        </div>
        
        <SidePanel 
          isOpen={!!selectedReport} 
          onClose={() => {
             setSelectedReport(null);
             setResolutionReason("");
          }}
          title={selectedReport?.title || "Report Details"}
          icon="shield"
        >
          <div className="p-6 flex flex-col gap-6">
            {selectedReport && (
              <>
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("hub_reporter") || "Reporter"}</span>
                  <span className="text-sm font-bold theme-text-accent">{selectedReport.reporter_name}</span>
                </div>
                
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("hub_reason") || "Reason"}</span>
                  <p className="text-sm font-bold text-[var(--text)] leading-relaxed theme-glass-inner p-4 rounded-2xl">{selectedReport.description}</p>
                </div>
                
                <div className="flex gap-4 mt-2">
                   {selectedReport.source === 'marketplace' && selectedReport.metadata?.asset_full && (
                      <button 
                         onClick={() => setActiveAsset({ id: selectedReport.metadata.asset_full.id, type: selectedReport.metadata.asset_full.asset_type })}
                         className="flex-1 py-3 theme-glass-inner hover:bg-white/10 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 group border border-white/5 hover:border-white/20"
                      >
                         <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("ui_icon_visibility") || "visibility"}</span>
                         {t("hub_btn_view_nexus") || "View Nexus Asset"}
                      </button>
                   )}
                   {selectedReport.metadata?.json_data && (
                      <button 
                         onClick={() => setActiveCodeSnippet(typeof selectedReport.metadata.json_data === 'string' ? selectedReport.metadata.json_data : JSON.stringify(selectedReport.metadata.json_data, null, 2))}
                         className="flex-1 py-3 theme-glass-inner hover:bg-white/10 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 group border border-white/5 hover:border-white/20"
                      >
                         <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("ui_icon_data_object") || "data_object"}</span>
                         {t("hub_btn_view_code") || "View Code Snippet"}
                      </button>
                   )}
                </div>
                
                {selectedReport.status === 'pending' && (
                  <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-white/5">
                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                       <span className="material-symbols-outlined !text-[14px]">gavel</span>
                       {t("hub_architect_action") || "Architect Action"}
                    </span>
                    
                    <textarea 
                      value={resolutionReason}
                      onChange={e => setResolutionReason(e.target.value)}
                      placeholder={t("hub_resolution_reason_ph") || "Reason for decision..."}
                      className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm font-bold min-h-[120px] focus:outline-none transition-all text-[var(--text)] border border-white/5 focus:border-[var(--accent)]/50 resize-none custom-scrollbar"
                    />
                    
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={() => handleProcessReport('dismiss')} 
                        disabled={isSubmittingAction || !resolutionReason} 
                        className={`w-full ${standardButtonClass}`}
                      >
                        {t("hub_btn_dismiss_report") || "Dismiss"}
                      </button>
                      
                      <button 
                        onClick={() => handleProcessReport('remove')} 
                        disabled={isSubmittingAction || !resolutionReason} 
                        className={`w-full ${standardDangerButtonClass}`}
                      >
                        {t("hub_btn_remove_asset") || "Remove Asset"}
                      </button>
                      
                      <button 
                        onClick={() => handleProcessReport('ban')} 
                        disabled={isSubmittingAction || !resolutionReason} 
                        className={`w-full ${standardDangerButtonClass}`}
                      >
                        {t("hub_btn_revoke_mason") || "Revoke Masons Uploads"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </SidePanel>
        
        {activeCodeSnippet && (
          <CodeSnippetSidebar
            onClose={() => setActiveCodeSnippet(null)}
            code={activeCodeSnippet}
            widthClass="w-[30vw] min-w-[400px] max-w-lg"
          />
        )}
        
        {activeAsset && (
          <AssetPreviewSidebar 
            assetType={activeAsset.type} 
            assetId={activeAsset.id} 
            onClose={() => setActiveAsset(null)} 
          />
        )}
      </div>
    );
  }
function CustomMasonDropdown({ value, options, onChange }: { value: string, options: any[], onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const dropdownOptions = options.map(o => ({ id: o.id, label: o.name }));
  return <CustomDropdown disableTint={true} searchable={true} value={value} options={dropdownOptions} onChange={(v: string[]) => onChange(v[0])} placeholder={t("mason_label_select")} />;
}
