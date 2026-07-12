import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown } from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";



export function DefconPanel() {
  const { t } = useLexicon();
  const [defconLevel, setDefconLevel] = useState<number>(5);
  const [showDefconConfirmModal, setShowDefconConfirmModal] = useState(false);

  useEffect(() => {
    const fetchDefcon = async () => {
      const { data } = await supabase.from('global_network_status').select("defcon_level").eq('id', 1).single();
      if (data) setDefconLevel(data.defcon_level);
    };
    fetchDefcon();
  }, []);

  const triggerDefcon = async () => {
    const newLevel = defconLevel === 1 ? 5 : 1;
    const msg = newLevel === 1 ? t("defcon_msg_emergency") : t("defcon_msg_normal");
    const statusMsg = newLevel === 1 ? "Global DEFCON 1 override active. Patch imminent." : "Network Secure. All systems nominal.";

    setDefconLevel(newLevel);
    useStore.getState().setDefconLevel(newLevel);

    const { error } = await supabase.from('global_network_status')
      .update({ defcon_level: newLevel, message: msg, status_message: statusMsg, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) {
      console.warn("Supabase RLS blocked global defcon sync.", error.message);
    }
  };

  return (
    <div className={`w-full max-w-xl mx-auto mt-12 theme-glass-panel border rounded-[var(--radius)] p-8 flex flex-col items-center justify-center text-center gap-6 relative overflow-hidden shrink-0 ${defconLevel === 1 ? 'border-amber-900/50 shadow-lg' : 'border-white/5'}`}>
      {defconLevel === 1 && <div className="absolute inset-0 bg-amber-500/5 animate-pulse pointer-events-none" />}

      <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center relative z-10 ${defconLevel === 1 ? 'border-amber-900/50 shadow-lg' : 'border-white/10'}`}>
        <span className={`text-4xl material-symbols-outlined ${defconLevel === 1 ? 'animate-bounce text-amber-500' : 'text-white'}`}>{t("icon_warning_amber")}</span>
      </div>

      <div className="flex flex-col gap-2 relative z-10">
        <h3 className={`text-xl font-black uppercase tracking-tighter drop-shadow-md ${defconLevel === 1 ? 'text-amber-400' : 'text-[var(--text)]'}`}>{t("defcon_override_title")}</h3>
        <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">
          {t("defcon_override_desc")}
        </p>
      </div>

      <button
        onClick={() => setShowDefconConfirmModal(true)}
        className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all relative z-10 theme-glass-inner ${defconLevel === 1
            ? 'border border-white/10 text-[var(--text)] hover:border-white/30 hover:bg-white/5'
            : 'border border-amber-900/50 text-amber-400 hover:border-amber-500 hover:text-amber-400 hover:bg-amber-500/10'
          }`}
      >
        {defconLevel === 1 ? t("defcon_stand_down") : t("defcon_initiate")}
      </button>      {showDefconConfirmModal && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-[var(--bg)]/60 backdrop-blur-md animate-in fade-in duration-300 p-8">
          <div className="relative w-full max-w-4xl theme-glass-panel border-2 border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] p-12 shadow-2xl flex flex-col gap-8 overflow-hidden">
            {defconLevel === 5 && (
              <>
                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(245,158,11,0.03)_25%,transparent,25%,transparent,50%,rgba(245,158,11,0.03),50%,rgba(245,158,11,0.03),75%,transparent,75%,transparent)] bg-[length:64px_64px] pointer-events-none opacity-50"></div>
                <div className="absolute inset-0 bg-amber-500/5 animate-pulse pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent opacity-80"></div>
              </>
            )}

            <div className="flex items-start gap-8 relative z-10 text-left">
              <div className={`relative w-32 h-32 rounded-[var(--radius)] flex items-center justify-center text-6xl shrink-0 shadow-lg ${defconLevel === 5 ? 'bg-amber-900/10 border border-amber-900/50' : 'bg-white/5 border border-white/10'}`}>
                {defconLevel === 5 && <div className="absolute inset-0 rounded-[var(--radius)] border-2 border-amber-500/20 animate-spin-slow"></div>}
                <span className={`drop-shadow-md animate-pulse material-symbols-outlined ${defconLevel === 5 ? 'text-amber-500' : 'text-white'}`}>{t("icon_warning_amber")}</span>
              </div>
              <div className="flex flex-col gap-4 pt-2 flex-1">
                <h2 className={`text-5xl font-black uppercase tracking-tighter drop-shadow-md leading-none ${defconLevel === 5 ? 'text-amber-400' : 'text-[var(--text)]'}`}>
                  {t("defcon_confirm_title")}
                </h2>
                <div className={`w-full h-px my-2 ${defconLevel === 5 ? 'bg-gradient-to-r from-amber-500/50 to-transparent' : 'bg-gradient-to-r from-white/10 to-transparent'}`}></div>
                <p className={`text-xs font-bold uppercase tracking-[0.2em] leading-relaxed max-w-2xl whitespace-pre-line ${defconLevel === 5 ? 'text-amber-200/80' : 'text-[var(--text)]/80'}`}>
                  {defconLevel === 1
                    ? t("defcon_confirm_stand_down")
                    : t("defcon_confirm_execute")}
                </p>
              </div>
            </div>

            <div className="flex gap-4 w-full mt-4 relative z-10">
              <button
                onClick={() => { triggerDefcon(); setShowDefconConfirmModal(false); }}
                className={`flex-1 py-6 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all theme-glass-inner shadow-lg ${defconLevel === 5
                    ? 'border border-amber-900/50 text-amber-400 hover:border-amber-500 hover:bg-amber-500/10'
                    : 'border border-white/10 text-[var(--text)] hover:border-white/30 hover:bg-white/5'
                  }`}
              >
                {defconLevel === 1 ? t("btn_confirm_stand_down") : t("btn_execute_defcon")}
              </button>
              <button
                onClick={() => setShowDefconConfirmModal(false)}
                className="flex-1 py-6 theme-glass-inner border border-white/10 text-[var(--text)] hover:border-white/30 hover:bg-white/5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all shadow-sm"
              >
                {t("btn_abort")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DefconSidePanel({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { t } = useLexicon();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [confirmMode, setConfirmMode] = useState<"execute" | "standDown" | null>(null);
  const setConfirmDialog = useModalStore((state: any) => state.setConfirmDialog);

  const fetchStatus = async () => {
    setLoading(true);
    const { data } = await supabase.from('global_network_status').select('*').single();
    if (data) setStatus(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setActionStatus("");
      setConfirmMode(null);
    }
  }, [isOpen]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (confirmMode) {
      timeout = setTimeout(() => {
        setConfirmMode(null);
      }, 3000);
    }
    return () => clearTimeout(timeout);
  }, [confirmMode]);

  const executeDefcon = async () => {
    setSubmitting(true);
    setActionStatus("Executing Lock Down...");
    const userRes = await supabase.auth.getUser();

    await supabase.from('global_network_status').update({ defcon_level: 1, message: "EMERGENCY: SYSTEM LOCKDOWN", status_message: "Global DEFCON 1 override active. Patch imminent.", updated_at: new Date().toISOString() }).eq('id', 1);
    useStore.getState().setDefconLevel(1);
    await supabase.from('audit_logs').insert({
      action: "Triggered Global DEFCON 1 Override", target_table: "global_network_status", target_name: "GLOBAL NETWORK", actor_id: userRes.data.user?.id, reason: "Game Patch Imminent Override"
    });

    await fetchStatus();
    setActionStatus("LOCK DOWN EXECUTED.");
    setSubmitting(false);
    setConfirmMode(null);
    setTimeout(onClose, 2000);
  };

  const standDown = async () => {
    setSubmitting(true);
    setActionStatus("Lifting Lock Down...");
    const userRes = await supabase.auth.getUser();

    await supabase.from('global_network_status').update({ defcon_level: 5, message: "System Normal", status_message: "Network Secure. All systems nominal.", updated_at: new Date().toISOString() }).eq('id', 1);
    useStore.getState().setDefconLevel(5);
    await supabase.from('audit_logs').insert({
      action: "Stood Down Global DEFCON Alert", target_table: "global_network_status", target_name: "GLOBAL NETWORK", actor_id: userRes.data.user?.id, reason: "Game Patch Concluded"
    });

    await fetchStatus();
    setActionStatus("STAND DOWN EXECUTED.");
    setSubmitting(false);
    setConfirmMode(null);
    setTimeout(onClose, 2000);
  };



  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("defcon_title")}
      subtitle={t("defcon_auth_req")}
      icon={status?.defcon_level === 1 ? 'warning' : 'security'}
      iconColorClass={status?.defcon_level === 1 ? "text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]" : "text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]"}
      widthClass="w-[600px]"
    >
      <div className="flex flex-col gap-6 h-full p-8 animate-in fade-in duration-500 relative">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-50 z-0"></div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50 relative z-10">
            <span className="material-symbols-outlined animate-spin text-4xl text-amber-500">{t("icon_sync")}</span>
            <div className="text-center font-black animate-pulse uppercase tracking-widest text-xs text-amber-500">{t("defcon_accessing")}</div>
          </div>
        ) : (
          <>
            <div className={`rounded-[var(--radius)] flex flex-col items-center justify-center p-10 text-center border-2 relative overflow-hidden transition-all duration-700 z-10 shadow-2xl min-h-[280px] ${status?.defcon_level === 1 ? 'bg-red-950/40 border-red-500/50 shadow-[0_0_80px_rgba(239,68,68,0.2)]' : 'theme-glass-panel border-[var(--accent)]/20'}`}>

              {status?.defcon_level === 1 && (
                <>
                  <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none z-20"></div>
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-[var(--text)]/10 to-transparent -translate-y-full animate-[scan_3s_ease-in-out_infinite] pointer-events-none z-20"></div>
                  <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none" />
                  <div className="absolute top-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(239,68,68,0.5)_10px,rgba(239,68,68,0.5)_20px)] opacity-80" />
                  <div className="absolute bottom-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(239,68,68,0.5)_10px,rgba(239,68,68,0.5)_20px)] opacity-80" />
                </>
              )}

              <div className="flex justify-center mb-6 relative z-30">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${status?.defcon_level === 1 ? 'border-red-500/30 bg-red-500/10' : 'border-[var(--success)]/20 bg-[var(--success)]/5'} shadow-inner relative`}>
                  {status?.defcon_level === 1 && <div className="absolute inset-0 rounded-full border-4 border-red-500/50 animate-ping opacity-50"></div>}
                  {status?.defcon_level === 5 && <div className="absolute inset-0 rounded-full border border-[var(--success)]/30 animate-[spin_10s_linear_infinite] border-t-transparent border-l-transparent"></div>}
                  <span className={`material-symbols-outlined text-5xl drop-shadow-lg ${status?.defcon_level === 1 ? 'text-red-500 animate-pulse' : 'theme-text-success opacity-80'}`}>
                    {status?.defcon_level === 1 ? 'warning' : 'verified_user'}
                  </span>
                </div>
              </div>

              <span className={`text-4xl font-black tracking-tighter relative z-30 mb-2 ${status?.defcon_level === 1 ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'text-[var(--text)]'}`}>
                {status?.defcon_level === 1 ? t("defcon_active") : t("defcon_normal")}
              </span>
              <span className={`text-[11px] font-black uppercase tracking-[0.4em] relative z-30 ${status?.defcon_level === 1 ? 'text-red-300/80' : 'theme-text-success opacity-80'}`}>
                {status?.defcon_level === 1 ? t("defcon_active_sub") : t("defcon_normal_sub")}
              </span>

              <div className="flex gap-4 mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full justify-center relative z-30">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[8px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("tab_network")}</span>
                  <span className={`text-[10px] font-mono font-bold ${status?.defcon_level === 1 ? 'text-red-400' : 'theme-text-success'}`}>{status?.defcon_level === 1 ? 'LOCKED' : 'SECURE'}</span>
                </div>
                <div className="w-px h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"></div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[8px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("tab_vaults")}</span>
                  <span className={`text-[10px] font-mono font-bold ${status?.defcon_level === 1 ? 'text-red-400' : 'theme-text-success'}`}>{status?.defcon_level === 1 ? 'SEALED' : 'ONLINE'}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 relative z-10">
              <div className="theme-glass-panel border-l-4 border-l-amber-500 p-5 rounded-2xl flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                  <span className="material-symbols-outlined text-amber-500 !text-xl">{t("icon_info")}</span>
                </div>
                <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed pt-0.5">
                  {t("defcon_warning")}
                </p>
              </div>

              <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_20px,rgba(239,68,68,0.05)_20px,rgba(239,68,68,0.05)_40px)] pointer-events-none"></div>
                <span className="material-symbols-outlined text-red-500 !text-2xl animate-pulse">{t("icon_threat_intelligence")}</span>
                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest text-center max-w-[80%] leading-relaxed">
                  {t("defcon_warning_red")}
                </p>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-4 relative z-10 pt-4">
              {actionStatus && (
                <div className={`text-center p-4 rounded-xl border backdrop-blur-md shadow-inner ${status?.defcon_level === 1 ? 'bg-amber-900/10 border-amber-500/20 shadow-[inset_0_2px_10px_rgba(245,158,11,0.05)]' : 'bg-emerald-900/10 border-emerald-500/20 shadow-[inset_0_2px_10px_rgba(16,185,129,0.05)]'}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest animate-pulse ${status?.defcon_level === 1 ? 'text-amber-400' : 'text-emerald-400'}`}>{actionStatus}</p>
                </div>
              )}
              {status?.defcon_level === 1 ? (
                <>
                  {confirmMode === 'standDown' ? (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-300 relative">
                      <p className="text-[10px] text-center font-black uppercase tracking-widest text-amber-500 mb-1 animate-pulse">{t("confirm_sure")}</p>
                      <button
                        onClick={standDown} disabled={submitting}
                        className={`w-full py-6 text-xs ${standardSuccessButtonClass} !bg-amber-500/20 !border-amber-500/50 !text-amber-400 hover:!bg-amber-500/40 hover:!text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.2)]`}
                      >
                        {t("btn_proceed")}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmMode('standDown')} disabled={submitting}
                      className={`w-full py-6 text-xs ${standardSuccessButtonClass}`}
                    >
                      <span className="material-symbols-outlined !text-xl">{t("icon_lock_open")}</span>
                      {t("sa_defcon_stand_down")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {confirmMode === 'execute' ? (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-300 relative">
                      <p className="text-[10px] text-center font-black uppercase tracking-widest text-red-500 mb-1 animate-pulse">{t("defcon_confirm_execute")}</p>
                      <button
                        onClick={executeDefcon} disabled={submitting}
                        className={`w-full py-6 text-xs ${standardDangerButtonClass} shadow-[0_0_30px_rgba(220,38,38,0.4)] animate-[pulse_2s_ease-in-out_infinite] bg-red-600/40`}
                      >
                        {t("btn_proceed")}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmMode('execute')} disabled={submitting}
                      className={`w-full py-6 text-xs ${standardDangerButtonClass} hover:bg-red-600/30 active:scale-95 transition-all shadow-[0_0_30px_rgba(220,38,38,0.2)]`}
                    >
                      <span className="material-symbols-outlined !text-xl group-hover:animate-bounce">{t("icon_warning_amber")}</span>
                      {t("defcon_execute")}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </SidePanel>
  );
}

