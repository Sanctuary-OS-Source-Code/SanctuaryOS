import React, { useState, useEffect } from "react";
import { supabase, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown
} from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";
import { UniversalGroup } from "../components/universal/UniversalLayout";



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
  <div className={`w-full max-w-xl mx-auto mt-12 glass-panel border rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-6 relative shrink-0 ${defconLevel === 1 ? 'border-amber-900/50 shadow-lg' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
      {defconLevel === 1 && <div className="absolute inset-0 rounded-[inherit] bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] animate-pulse pointer-events-none" />}

      <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center relative z-10 ${defconLevel === 1 ? 'border-amber-900/50 shadow-lg' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
        <span className={`text-4xl material-symbols-outlined ${defconLevel === 1 ? 'animate-bounce text-amber-500' : 'text-white'}`}>{t("icon_warning_amber")}</span>
      </div>

      <div className="flex flex-col gap-2 relative z-10">
        <h3 className={`text-xl font-black capitalize tracking-tighter drop-shadow-md ${defconLevel === 1 ? 'text-amber-400' : 'text-[var(--text)]'}`}>{t("defcon_override_title")}</h3>
        <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest leading-relaxed">
          {t("defcon_override_desc")}
        </p>
      </div>

      <button
        onClick={() => setShowDefconConfirmModal(true)}
        className={`w-full py-5 rounded-2xl font-black text-xs capitalize tracking-[0.2em] transition-all relative z-10 glass-surface ${defconLevel === 1
          ? 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
          : 'border border-amber-900/50 text-amber-400 hover:border-amber-500 hover:text-amber-400 hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]'
          }`}
      >
        {defconLevel === 1 ? t("defcon_stand_down") : t("defcon_initiate")}
      </button>      {showDefconConfirmModal && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] backdrop-blur-md animate-in fade-in duration-300 p-8">
     <div className="relative w-full max-w-4xl glass-panel border-2 border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-12 shadow-2xl flex flex-col gap-8 ">
            {defconLevel === 5 && (
              <>
                <div className="absolute inset-0 rounded-[inherit] bg-[linear-gradient(45deg,rgba(245,158,11,0.03)_25%,transparent,25%,transparent,50%,rgba(245,158,11,0.03),50%,rgba(245,158,11,0.03),75%,transparent,75%,transparent)] bg-[length:64px_64px] pointer-events-none opacity-50"></div>
                <div className="absolute inset-0 rounded-[inherit] bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] animate-pulse pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent opacity-80"></div>
              </>
            )}

            <div className="flex items-start gap-8 relative z-10 text-left">
              <div className={`relative w-32 h-32 rounded-2xl flex items-center justify-center text-6xl shrink-0 shadow-lg ${defconLevel === 5 ? 'bg-amber-900/10 border border-amber-900/50' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                {defconLevel === 5 && <div className="absolute inset-0 rounded-[inherit]  border-2 border-[color-mix(in_srgb,var(--warning)_20%,transparent)] animate-spin-slow"></div>}
                <span className={`drop-shadow-md animate-pulse material-symbols-outlined ${defconLevel === 5 ? 'text-amber-500' : 'text-white'}`}>{t("icon_warning_amber")}</span>
              </div>
              <div className="flex flex-col gap-4 pt-2 flex-1">
                <h2 className={`text-5xl font-black capitalize tracking-tighter drop-shadow-md leading-none ${defconLevel === 5 ? 'text-amber-400' : 'text-[var(--text)]'}`}>
                  {t("defcon_confirm_title")}
                </h2>
                <div className={`w-full h-px my-2 ${defconLevel === 5 ? 'bg-gradient-to-r from-amber-500/50 to-transparent' : 'bg-gradient-to-r from-white/10 to-transparent'}`}></div>
                <p className={`text-xs font-bold capitalize tracking-[0.2em] leading-relaxed max-w-2xl whitespace-pre-line ${defconLevel === 5 ? 'text-amber-200/80' : 'text-[color-mix(in_srgb,var(--text)_80%,transparent)]'}`}>
                  {defconLevel === 1
                    ? t("defcon_confirm_stand_down")
                    : t("defcon_confirm_execute")}
                </p>
              </div>
            </div>

            <div className="flex gap-4 w-full mt-4 relative z-10">
              <button
                onClick={() => { triggerDefcon(); setShowDefconConfirmModal(false); }}
                className={`flex-1 py-6 rounded-2xl font-black text-xs capitalize tracking-[0.3em] transition-all glass-surface shadow-lg ${defconLevel === 5
                  ? 'border border-amber-900/50 text-amber-400 hover:border-amber-500 hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]'
                  : 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'
                  }`}
              >
                {defconLevel === 1 ? t("btn_confirm_stand_down") : t("btn_execute_defcon")}
              </button>
              <button
                onClick={() => setShowDefconConfirmModal(false)}
                className="flex-1 py-6 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl font-black text-xs capitalize tracking-[0.3em] transition-all shadow-sm"
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



  const executeDefcon = async () => {
    setSubmitting(true);
    setActionStatus("Executing Lock Down...");
    const userRes = await supabase.auth.getUser();

    const targetId = status?.id || 1;
    const { error } = await supabase.rpc('secure_upsert_cloud_file', {
      p_token: useStore.getState().session?.access_token || '',
      p_target: 'global_network_status',
      p_payload: {
        id: targetId,
        defcon_level: 1,
        message: "EMERGENCY: SYSTEM LOCKDOWN",
        status_message: "Global DEFCON 1 override active. Patch imminent.",
        updated_at: new Date().toISOString()
      }
    });

    if (error) {
      console.error("Defcon update error:", error);
      setActionStatus("ERROR: " + (error.message || "Failed to update"));
      setSubmitting(false);
      return;
    }

    useStore.getState().setDefconLevel(1);
    await logArchitectAction(
      "Triggered Global DEFCON 1 Override", "global_network_status", "GLOBAL NETWORK", "Game Patch Imminent Override", "Command Center Oversight"
    );

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

    const targetId = status?.id || 1;
    const { error } = await supabase.rpc('secure_upsert_cloud_file', {
      p_token: useStore.getState().session?.access_token || '',
      p_target: 'global_network_status',
      p_payload: {
        id: targetId,
        defcon_level: 5,
        message: "System Normal",
        status_message: "Network Secure. All systems nominal.",
        updated_at: new Date().toISOString()
      }
    });

    if (error) {
      console.error("Defcon update error:", error);
      setActionStatus("ERROR: " + (error.message || "Failed to update"));
      setSubmitting(false);
      return;
    }

    useStore.getState().setDefconLevel(5);
    await logArchitectAction(
      "Stood Down Global DEFCON Alert", "global_network_status", "GLOBAL NETWORK", "Game Patch Concluded", "Command Center Oversight"
    );

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
      iconColorClass={status?.defcon_level === 1 ? "text-red-500 animate-pulse drop-shadow-md" : "text-amber-400 drop-shadow-md"}
      widthClass="w-[600px]"
    >
      <div className="flex flex-col gap-6 h-full p-8 animate-in fade-in duration-500 relative overflow-y-auto">
        <div className="absolute inset-0 rounded-[inherit] bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-50 z-0"></div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50 relative z-10">
            <span className="material-symbols-outlined animate-spin text-4xl text-amber-500">{t("icon_sync")}</span>
            <div className="text-center font-black animate-pulse capitalize tracking-widest text-xs text-amber-500">{t("defcon_accessing")}</div>
          </div>
        ) : (
          <>
            <UniversalGroup title={t("defcon_override_title")} icon="admin_panel_settings">
       <div className={`glass-panel rounded-2xl flex flex-col items-center justify-center p-10 text-center relative transition-all duration-700 z-10 shadow-lg ${status?.defcon_level === 1 ? 'border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-[inset_0_0_40px_rgba(239,68,68,0.1)]' : 'border-[color-mix(in_srgb,var(--accent)_20%,transparent)]'}`}>

                {status?.defcon_level === 1 && (
                  <>
                    <div className="absolute inset-0 rounded-[inherit] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] animate-pulse pointer-events-none" />
                    <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent opacity-80" />
                    <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent opacity-80" />
                  </>
                )}

                <div className="flex justify-center mb-6 relative z-30">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 ${status?.defcon_level === 1 ? 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]' : 'border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)]'} shadow-inner relative`}>
                    {status?.defcon_level === 1 && <div className="absolute inset-0 rounded-[inherit]  border-2 border-[color-mix(in_srgb,var(--danger)_50%,transparent)] animate-ping opacity-50"></div>}
                    {status?.defcon_level === 5 && <div className="absolute inset-0 rounded-[inherit]  border border-[color-mix(in_srgb,var(--success)_30%,transparent)] animate-[spin_10s_linear_infinite] border-t-transparent border-l-transparent"></div>}
                    <span className={`material-symbols-outlined text-4xl drop-shadow-lg ${status?.defcon_level === 1 ? 'text-red-500 animate-pulse' : 'theme-text-success opacity-80'}`}>
                      {status?.defcon_level === 1 ? 'warning' : 'verified_user'}
                    </span>
                  </div>
                </div>

                <span className={`text-3xl font-black tracking-tighter relative z-30 mb-2 ${status?.defcon_level === 1 ? 'text-red-500 drop-shadow-md' : 'text-[var(--text)]'}`}>
                  {status?.defcon_level === 1 ? t("defcon_active") : t("defcon_normal")}
                </span>
                <span className={`text-[10px] font-black capitalize tracking-[0.4em] relative z-30 ${status?.defcon_level === 1 ? 'text-red-300/80' : 'theme-text-success opacity-80'}`}>
                  {status?.defcon_level === 1 ? t("defcon_active_sub") : t("defcon_normal_sub")}
                </span>

                <div className="flex gap-4 mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full justify-center relative z-30">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[8px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("tab_network")}</span>
                    <span className={`text-[10px] font-mono font-bold ${status?.defcon_level === 1 ? 'text-red-400' : 'theme-text-success'}`}>{status?.defcon_level === 1 ? 'LOCKED' : 'SECURE'}</span>
                  </div>
                  <div className="w-px h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"></div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[8px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("tab_vaults")}</span>
                    <span className={`text-[10px] font-mono font-bold ${status?.defcon_level === 1 ? 'text-red-400' : 'theme-text-success'}`}>{status?.defcon_level === 1 ? 'SEALED' : 'ONLINE'}</span>
                  </div>
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup title={t("defcon_warnings_title")} icon="gavel">
              <div className="glass-panel border-l-2 border-l-amber-500 p-5 rounded-xl flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
                  <span className="material-symbols-outlined text-amber-500 !text-sm">{t("icon_info")}</span>
                </div>
                <p className="text-[11px] font-bold text-[var(--subtext)] leading-relaxed pt-1">
                  {t("defcon_warning")}
                </p>
              </div>

       <div className="glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] p-4 rounded-xl flex items-center gap-4 relative ">
                <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--danger)_20%,transparent)]">
                  <span className="material-symbols-outlined text-red-500 !text-sm animate-pulse">{t("icon_threat_intelligence")}</span>
                </div>
                <p className="text-[9px] font-black text-red-400 capitalize tracking-widest leading-relaxed">
                  {t("defcon_warning_red")}
                </p>
              </div>
            </UniversalGroup>

            <div className="mt-auto flex flex-col gap-4 relative z-10 pt-4">
              {actionStatus && (
                <div className={`text-center p-4 rounded-xl border backdrop-blur-md shadow-inner ${status?.defcon_level === 1 ? 'bg-amber-900/10 border-[color-mix(in_srgb,var(--warning)_20%,transparent)] shadow-[inset_0_2px_10px_rgba(245,158,11,0.05)]' : 'bg-emerald-900/10 border-[color-mix(in_srgb,var(--success)_20%,transparent)] shadow-[inset_0_2px_10px_rgba(16,185,129,0.05)]'}`}>
                  <p className={`text-[10px] font-black capitalize tracking-widest animate-pulse ${status?.defcon_level === 1 ? 'text-amber-400' : 'text-emerald-400'}`}>{actionStatus}</p>
                </div>
              )}
              {status?.defcon_level === 1 ? (
                <>
                  {confirmMode === 'standDown' ? (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-300 relative">
                      <p className="text-[10px] text-center font-black capitalize tracking-widest text-amber-500 mb-1 animate-pulse">{t("confirm_sure")}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={standDown} disabled={submitting}
                          className={`flex-1 py-6 text-xs ${standardSuccessButtonClass} !bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] !border-[color-mix(in_srgb,var(--warning)_50%,transparent)] !text-amber-400 hover:!bg-[color-mix(in_srgb,var(--warning)_40%,transparent)] hover:!text-amber-300 shadow-md`}
                        >
                          {t("btn_proceed")}
                        </button>
                        <button
                          onClick={() => setConfirmMode(null)} disabled={submitting}
                          className="flex-1 py-6 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl font-black text-xs capitalize tracking-[0.3em] transition-all shadow-sm"
                        >
                          {t("btn_abort")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmMode('standDown')} disabled={submitting}
                      className={`w-full py-6 text-xs ${standardSuccessButtonClass}`}
                    >
                      <span className="material-symbols-outlined !text-xl">{t("icon_lock_open")}</span>
                      {t("defcon_stand_down")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {confirmMode === 'execute' ? (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-300 relative">
                      <p className="text-[10px] text-center font-black capitalize tracking-widest text-red-500 mb-1 animate-pulse">{t("defcon_confirm_execute")}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={executeDefcon} disabled={submitting}
                          className={`flex-1 py-6 text-xs ${standardDangerButtonClass} shadow-md animate-[pulse_2s_ease-in-out_infinite] bg-[color-mix(in_srgb,var(--danger)_40%,transparent)]`}
                        >
                          {t("btn_proceed")}
                        </button>
                        <button
                          onClick={() => setConfirmMode(null)} disabled={submitting}
                          className="flex-1 py-6 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl font-black text-xs capitalize tracking-[0.3em] transition-all shadow-sm"
                        >
                          {t("btn_abort")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmMode('execute')} disabled={submitting}
                      className={`w-full py-6 text-xs ${standardDangerButtonClass} hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] active:scale-95 transition-all shadow-md`}
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





