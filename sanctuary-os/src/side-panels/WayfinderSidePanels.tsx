import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
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
import MasonPostViewer from "./MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";



export function ServerHealthSidePanel({ isOpen, onClose, stats }: any) {
  const { t } = useLexicon();
  const workspaces = useStore((state: any) => state.workspaces);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const session = useStore((state: any) => state.session);
  const activeWs = (workspaces || []).find((w: any) => w.id === activeWorkspaceId);

  const [uplinkUrl, setUplinkUrl] = useState("");
  const [uplinkAnonKey, setUplinkAnonKey] = useState("");
  const [uplinkServiceKey, setUplinkServiceKey] = useState("");
  const [updatingKeys, setUpdatingKeys] = useState(false);

  const [severReason, setSeverReason] = useState("");
  const [confirmSever, setConfirmSever] = useState(false);
  const [isSevering, setIsSevering] = useState(false);

  useEffect(() => {
    if (isOpen && activeWs) {
      setUplinkUrl(activeWs.supabase_url || "");
      setUplinkAnonKey(activeWs.supabase_anon_key || "");
      setUplinkServiceKey("");
      setConfirmSever(false);
      setSeverReason("");
    }
  }, [isOpen, activeWs?.id]);

  const handleCopyUplinkBundle = () => {
    const payload = {
      name: activeWs?.name || activeWs?.schema_id || "Community Spoke",
      schema_id: (activeWs?.schema_id || activeWs?.id || "").toUpperCase(),
      supabase_url: uplinkUrl.trim(),
      supabase_anon_key: uplinkAnonKey.trim(),
      supabase_service_key: uplinkServiceKey.trim() || undefined,
      founder_identifier: session?.user?.id || undefined
    };
    const token = "SANCTUARY-UPLINK://" + btoa(JSON.stringify(payload));
    navigator.clipboard.writeText(token);
    useStore.getState().pushStatus(t("spoke_uplink_bundle_copied", "Spoke Uplink Bundle copied to clipboard!"), "success");
  };

  const handleUpdateKeys = async () => {
    if (!uplinkUrl.trim() || !uplinkAnonKey.trim() || !uplinkServiceKey.trim()) {
      alert(t("fill_required_fields", "Please fill all required fields"));
      return;
    }
    setUpdatingKeys(true);
    try {
      const res: any = await supabase.rpc('secure_update_spoke_uplink', {
        p_payload: {
          supabase_url: uplinkUrl.trim(),
          supabase_anon_key: uplinkAnonKey.trim(),
          supabase_service_key: uplinkServiceKey.trim()
        }
      });
      if (res?.error || res?.data?.error) {
        throw new Error(res?.error?.message || res?.data?.error);
      }
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      setUplinkServiceKey("");
      useStore.getState().pushStatus(t("wf_uplink_keys_updated", "Spoke uplink keys verified and updated on the Hub."), "success");
    } catch (err: any) {
      useStore.getState().pushStatus(err.message, "error");
    } finally {
      setUpdatingKeys(false);
    }
  };

  const handleCutTheCord = async () => {
    if (!confirmSever) {
      setConfirmSever(true);
      setTimeout(() => setConfirmSever(false), 4500);
      return;
    }
    setIsSevering(true);
    try {
      const res: any = await supabase.rpc('secure_sever_spoke_cord', {
        p_payload: {
          reason: severReason.trim() || "Community Executed Cut the Cord (Bilateral Sovereignty Severance)"
        }
      });
      if (res?.error || res?.data?.error) {
        throw new Error(res?.error?.message || res?.data?.error);
      }
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      useStore.getState().pushStatus(t("wf_cut_cord_success", "Uplink severed. Your Spoke database is now independent and its service key has been scrubbed from the Hub."), "info");
      setConfirmSever(false);
      onClose();
    } catch (err: any) {
      useStore.getState().pushStatus(err.message, "error");
    } finally {
      setIsSevering(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("wf_health_title", "Server Health & Uplink")}
      subtitle={t("wf_health_subtitle", "Spoke Node Diagnostics & Sovereignty")}
      icon="settings_ethernet"
    >
      <div className="flex-1 overflow-y-auto flex flex-col gap-6 custom-scrollbar">
        <div className="flex flex-col gap-4">
          <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-6 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70">{t("wf_core_node", "Core Node Status")}</span>
              <span className={`text-xl font-black tracking-widest ${stats.networkStatus === 'ONLINE' ? 'text-emerald-400' : 'text-yellow-400'}`}>
                {stats.networkStatus === 'ONLINE' ? t("wf_stat_server_nominal", "ONLINE") : t("wf_stat_server_degraded", "DEGRADED")}
              </span>
            </div>
            <span className="material-symbols-outlined !text-[32px] text-[var(--accent)] opacity-40">{t("icon_memory", "memory")}</span>
          </div>

          <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-6 flex flex-col gap-4">
            <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70 flex items-center gap-2">
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_router", "router")}</span>
              {t("wf_uplink_node_telemetry", "Spoke Node Telemetry")}
            </span>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] capitalize tracking-widest font-bold opacity-50">{t("wf_uplink_schema_label", "Active Schema ID")}</span>
                <span className="text-sm font-black text-[var(--text)] font-mono">{activeWs?.schema_id || activeWorkspaceId || "--"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] capitalize tracking-widest font-bold opacity-50">{t("wf_latency", "Latency")}</span>
                <span className="text-sm font-black text-[var(--text)] font-mono">{stats.networkLatency || '--'} {t("icon_ms", "ms")}</span>
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <span className="text-[9px] capitalize tracking-widest font-bold opacity-50">{t("wf_uplink_endpoint_label", "Spoke Endpoint")}</span>
                <span className="text-xs font-mono font-bold text-[var(--subtext)] break-all">{activeWs?.supabase_url || "--"}</span>
              </div>
              <div className="flex flex-col gap-1 col-span-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <span className="text-[9px] capitalize tracking-widest font-bold opacity-50">{t("wf_db_sync", "Database Uplink")}</span>
                <span className="text-xs font-black text-emerald-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-md animate-pulse"></span>
                  {t("auto_synchronized", "SYNCHRONIZED")}
                </span>
              </div>
            </div>
          </div>

          <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70 flex items-center gap-2">
                <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">vpn_key</span>
                {t("wf_uplink_key_rotation_title", "Uplink Handshake & Key Rotation")}
              </span>
              <button
                type="button"
                onClick={handleCopyUplinkBundle}
                className="px-3 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:border-[var(--accent)] text-[10px] font-black tracking-wider text-[var(--accent)] flex items-center gap-1.5 transition-all"
              >
                <span className="material-symbols-outlined !text-[14px]">content_copy</span>
                <span>{t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}</span>
              </button>
            </div>
            <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
              {t("wf_uplink_key_rotation_desc", "Rotate your community Supabase keys or generate an Uplink Bundle token for Keepers Core.")}
            </p>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={uplinkUrl}
                onChange={e => setUplinkUrl(e.target.value)}
                placeholder={t("ui_supabase_url", "Supabase Project URL")}
                className="w-full glass-surface rounded-xl px-4 py-2.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
              <input
                type="text"
                value={uplinkAnonKey}
                onChange={e => setUplinkAnonKey(e.target.value)}
                placeholder={t("ui_supabase_key", "Supabase Anon Key")}
                className="w-full glass-surface rounded-xl px-4 py-2.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
              <input
                type="password"
                value={uplinkServiceKey}
                onChange={e => setUplinkServiceKey(e.target.value)}
                placeholder={t("ui_supabase_service_key", "Supabase Service Key")}
                className="w-full glass-surface rounded-xl px-4 py-2.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={handleUpdateKeys}
                disabled={updatingKeys || !uplinkServiceKey.trim()}
                className="w-full glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] disabled:opacity-40 transition-all text-xs font-black tracking-widest text-[var(--text)] flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">sync_lock</span>
                <span>{t("wf_uplink_btn_update_keys", "Update Active Uplink Keys")}</span>
              </button>
            </div>
          </div>

          <div className="glass-panel theme-panel-danger border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] rounded-2xl p-6 flex flex-col gap-4">
            <span className="text-[10px] font-black capitalize tracking-widest text-[var(--danger)] flex items-center gap-2">
              <span className="material-symbols-outlined !text-[16px]">link_off</span>
              {t("wf_cut_cord_title", "Cut the Cord (Sever Sanctuary Uplink)")}
            </span>
            <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
              {t("wf_cut_cord_desc", "Unilaterally sever your community's Spoke database from the Sanctuary OS Hub. This immediately deactivates the workspace on the global network and scrubs your Service Role Key from the Hub while leaving 100% of your Spoke database intact.")}
            </p>
            <input
              type="text"
              value={severReason}
              onChange={e => setSeverReason(e.target.value)}
              placeholder={t("wf_cut_cord_reason_ph", "Optional reason for severing the uplink (logged to Audit Trail)...")}
              className="w-full glass-surface rounded-xl px-4 py-2.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] focus:outline-none focus:border-[var(--danger)]"
            />
            <button
              type="button"
              onClick={handleCutTheCord}
              disabled={isSevering}
              className={`w-full rounded-xl px-4 py-3.5 border transition-all text-xs font-black tracking-widest flex items-center justify-center gap-2 ${
                confirmSever
                  ? 'bg-[var(--danger)] text-white border-[var(--danger)] shadow-[0_0_20px_rgba(var(--danger-rgb),0.5)] animate-pulse'
                  : 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)]'
              }`}
            >
              <span className="material-symbols-outlined !text-[18px]">content_cut</span>
              <span>
                {confirmSever
                  ? t("wf_cut_cord_confirm_btn", "Confirm: Click Again to Permanently Sever Uplink")
                  : t("wf_cut_cord_btn", "Cut the Cord (Double-Click to Sever)")}
              </span>
            </button>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}


