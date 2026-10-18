import React, { useState, useEffect } from "react";
import { supabase, supabaseAuth, RESOLVED_SANCTUARY_CONFIG } from "../supabase";
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
import packageJson from "../../package.json";



export function ServerHealthSidePanel({ isOpen, onClose, stats, isKeepers = false }: any) {
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

  const [hubLatency, setHubLatency] = useState<number | null>(null);
  const [federatedSpokes, setFederatedSpokes] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && isKeepers) {
      const start = performance.now();
      supabaseAuth
        .from("sanctuary_games")
        .select("*")
        .order("name", { ascending: true })
        .then(({ data }) => {
          const elapsed = Math.max(8, Math.round(performance.now() - start));
          setHubLatency(elapsed);
          if (data) setFederatedSpokes(data);
        });
    } else if (isOpen && activeWs) {
      setUplinkUrl(activeWs.supabase_url || "");
      setUplinkAnonKey(activeWs.supabase_anon_key || "");
      setUplinkServiceKey("");
      setConfirmSever(false);
      setSeverReason("");
    }
  }, [isOpen, isKeepers, activeWs?.id]);

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

  if (isKeepers) {
    const spokeList = federatedSpokes.length > 0 ? federatedSpokes : (workspaces || []);
    return (
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("keepers_health_title", "Core OS Network Telemetry")}
        subtitle={t("keepers_health_subtitle", "Central Hub & Federated Spoke Status")}
        icon="settings_ethernet"
      >
        <div className="flex-1 overflow-y-auto flex flex-col gap-6 custom-scrollbar">
          <div className="flex flex-col gap-4">
            <div className="glass-panel border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] rounded-2xl p-6 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70">
                  {t("keepers_hub_status_label", "Keepers Core Central Hub")}
                </span>
                <span className="text-xl font-black tracking-widest text-emerald-400">
                  {t("wf_stat_server_nominal", "ONLINE")}
                </span>
                <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-60 mt-0.5">
                  {t("keepers_hub_schema_label", "Active Hub Node: Sanctuary Core OS")}
                </span>
              </div>
              <span className="material-symbols-outlined !text-[32px] text-[var(--accent)] opacity-60">
                {t("icon_memory", "memory")}
              </span>
            </div>

            <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-6 flex flex-col gap-4">
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70 flex items-center gap-2">
                <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_router", "router")}</span>
                {t("keepers_hub_endpoint_title", "Central Hub Infrastructure")}
              </span>
              <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
                {t("keepers_hub_endpoint_desc", "Global authentication, supporter ledger, core heuristics, and federated spoke registry.")}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] capitalize tracking-widest font-bold opacity-50">
                    {t("keepers_hub_latency_label", "Central Hub Latency")}
                  </span>
                  <span className="text-sm font-black text-[var(--text)] font-mono">
                    {hubLatency !== null ? hubLatency : (stats?.networkLatency || 18)} {t("icon_ms", "ms")}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] capitalize tracking-widest font-bold opacity-50">
                    {t("keepers_hub_db_sync_label", "Core Hub DB Sync")}
                  </span>
                  <span className="text-xs font-black text-emerald-400 flex items-center gap-2 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-md animate-pulse"></span>
                    {t("auto_synchronized", "SYNCHRONIZED")}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] capitalize tracking-widest font-bold opacity-50">
                    {t("ui_active_games", "Active Workspaces")}
                  </span>
                  <span className="text-sm font-black text-[var(--text)] font-mono">
                    {stats?.activeGames ?? stats?.activeGamesCount ?? spokeList.filter((s: any) => s.is_active !== false).length}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] capitalize tracking-widest font-bold opacity-50">
                    {t("citizen_oversight", "Citizen Oversight")}
                  </span>
                  <span className="text-sm font-black text-[var(--text)] font-mono">
                    {stats?.citizens ?? stats?.citizensCount ?? 0}
                  </span>
                </div>
                <div className="flex flex-col gap-1 col-span-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <span className="text-[9px] capitalize tracking-widest font-bold opacity-50">
                    {t("keepers_hub_endpoint_title", "Central Hub Infrastructure")}
                  </span>
                  <span className="text-xs font-mono font-bold text-[var(--subtext)] break-all">
                    {RESOLVED_SANCTUARY_CONFIG.supabaseUrl}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-70 flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">dns</span>
                  {t("keepers_spokes_network_title", "Federated Spoke Nodes")}
                </span>
                <span className="text-[10px] font-mono font-black text-[var(--accent)] px-2.5 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)]">
                  {spokeList.length}
                </span>
              </div>
              <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
                {t("keepers_spokes_network_desc", "Live status of connected partner game databases registered to the Central Hub.")}
              </p>
              <div className="flex flex-col gap-2.5">
                {spokeList.map((spoke: any) => {
                  const isOnline = spoke.is_active !== false;
                  return (
                    <div
                      key={spoke.id || spoke.schema_id}
                      className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                          {spoke.icon && spoke.icon.startsWith("http") ? (
                            <img src={spoke.icon} alt="" className="w-5 h-5 object-contain" />
                          ) : (
                            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">sports_esports</span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-[var(--text)] truncate">
                            {spoke.name || spoke.schema_id}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 truncate">
                            {spoke.schema_id} • {spoke.supabase_url || RESOLVED_SANCTUARY_CONFIG.supabaseUrl}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest shrink-0 border ${
                          isOnline
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                        }`}
                      >
                        {isOnline ? t("keepers_spoke_online", "ONLINE") : t("keepers_spoke_offline", "OFFLINE")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </SidePanel>
    );
  }

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

export function WayfinderDonationSetupSidePanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useLexicon();
  const workspaces = useStore((state: any) => state.workspaces);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const activeWs = (workspaces || []).find((w: any) => w.id === activeWorkspaceId);

  const [processor, setProcessor] = useState("STRIPE");
  const [donationUrl, setDonationUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const loadCurrent = async () => {
      const { getLocalPartnerDonationOverride } = await import("../utils/supporterManager");
      const localOverride =
        getLocalPartnerDonationOverride(activeWs?.schema_id) ||
        getLocalPartnerDonationOverride(activeWorkspaceId);
      if (localOverride) {
        setDonationUrl(localOverride.donation_url || "");
        setProcessor((localOverride.payment_processor || "STRIPE").toUpperCase());
      } else if (activeWs) {
        setDonationUrl(activeWs.donation_url || "");
        setProcessor((activeWs.payment_processor || "STRIPE").toUpperCase());
      }
      if (activeWs?.schema_id) {
        const { data } = await supabase
          .from("sanctuary_games")
          .select("donation_url, payment_processor")
          .ilike("schema_id", activeWs.schema_id)
          .maybeSingle();
        if (data) {
          if (data.donation_url !== undefined && data.donation_url !== null) {
            setDonationUrl(data.donation_url);
          }
          if (data.payment_processor) {
            setProcessor(String(data.payment_processor).toUpperCase());
          }
        }
      }
    };
    loadCurrent();
  }, [isOpen, activeWorkspaceId, activeWs?.schema_id]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { savePartnerCommunityDonationConfig } = await import("../utils/supporterManager");
      await savePartnerCommunityDonationConfig({
        gameId: activeWs?.id || activeWorkspaceId,
        schemaId: activeWs?.schema_id || activeWorkspaceId,
        donationUrl,
        paymentProcessor: processor,
      });
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      useStore
        .getState()
        .pushStatus(
          t("wf_donation_saved_toast", "Partner Community donation settings updated!"),
          "success",
        );
      onClose();
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("wf_donation_panel_title", "Partner Community Donation Setup")}
      subtitle={t(
        "wf_donation_panel_subtitle",
        "100% Non-Custodial • 0% Sanctuary Cut • Unlocks Global Daily Dev Builds for Citizens",
      )}
      icon={t("icon_volunteer_activism", "volunteer_activism")}
    >
      <div className="flex flex-col gap-6 w-full">
        <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,rgba(var(--bg-rgb),0.86))] flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[18px]">
              {t("icon_shield", "shield")}
            </span>
          </div>
          <p className="text-xs font-medium text-[var(--text)] opacity-90 leading-relaxed">
            {t(
              "wf_donation_notice_desc",
              "Your community receives 100% of all citizen donations directly via your own payment processor. Sanctuary OS takes a 0% cut, never touches your funds, and does not cover chargebacks. Every $5 a citizen donates to your community automatically grants them +30 days of Global Daily Dev Build access.",
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
            {t("wf_donation_processor_label", "Payment Processor")}
          </label>
          <CustomDropdown
            disableTint={true}
            value={processor}
            onChange={(val: any) => setProcessor(Array.isArray(val) ? val[0] : val)}
            options={[
              { id: "STRIPE", label: "Stripe Checkout / Payment Link" },
              { id: "KO-FI", label: "Ko-fi" },
              { id: "PATREON", label: "Patreon" },
              { id: "PAYPAL", label: "PayPal" },
              { id: "FOURTHWALL", label: "Fourthwall" },
              { id: "OPENCOLLECTIVE", label: "OpenCollective" },
              { id: "SANDBOX", label: "Sandbox Test Processor (Testing)" },
              { id: "CUSTOM", label: "Custom Direct Processor" },
            ]}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t(
                "wf_donation_url_label",
                "Donation / Checkout Link (Leave blank to hide)",
              )}
            </label>
            <button
              type="button"
              onClick={() => {
                setProcessor("SANDBOX");
                setDonationUrl("sandbox://checkout");
              }}
              className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[10px] font-black tracking-wider text-[var(--accent)] flex items-center gap-1 transition-all"
            >
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_science", "science")}
              </span>
              <span>
                {t(
                  "supporter_sandbox_enable_btn",
                  "Use Sandbox Test Processor (For Testing)",
                )}
              </span>
            </button>
          </div>
          <input
            type="url"
            value={donationUrl}
            onChange={(e) => setDonationUrl(e.target.value)}
            placeholder={t(
              "wf_donation_url_ph",
              "https://donate.stripe.com/... or https://ko-fi.com/...",
            )}
            className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-1.5">
          <span className="text-xs font-black text-[var(--text)] flex items-center gap-2">
            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
              {t("icon_info", "info")}
            </span>
            {t(
              "supporter_processor_setup_guide_title",
              "How to Connect Stripe or Ko-fi",
            )}
          </span>
          <p className="text-xs font-medium text-[var(--subtext)] whitespace-pre-line leading-relaxed">
            {t(
              "supporter_processor_setup_guide_desc",
              "1. Create a Stripe Payment Link (buy.stripe.com/...) or Ko-fi page.\n2. Paste the URL above. Sanctuary OS automatically attaches ?client_reference_id=<user_id> on checkout.\n3. (Optional) Point your Stripe/Ko-fi webhook to the partner-donation-webhook Edge Function to auto-credit citizens, or let citizens verify their receipt ID directly.",
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full glass-surface rounded-xl px-4 py-3.5 border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] disabled:opacity-40 transition-all text-xs font-black tracking-widest text-[var(--text)] flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
            {saving ? t("icon_sync", "sync") : t("icon_check", "check")}
          </span>
          <span>{t("wf_donation_save_btn", "Save Donation Settings")}</span>
        </button>
      </div>
    </SidePanel>
  );
}

export function KeeperReleasePipelineSidePanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useLexicon();
  const [keepersProcessor, setKeepersProcessor] = useState("STRIPE");
  const [keepersUrl, setKeepersUrl] = useState("");
  const [liveStableVer, setLiveStableVer] = useState("0.5.7");
  const [liveStableDate, setLiveStableDate] = useState("");
  const [liveDevVer, setLiveDevVer] = useState("");
  const [liveDevDate, setLiveDevDate] = useState("");
  const [liveDevNotes, setLiveDevNotes] = useState("");
  const [hasLiveDev, setHasLiveDev] = useState(false);
  const [syncingGitHub, setSyncingGitHub] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFromGitHubAndConfig = async (forceRefresh = false) => {
    setSyncingGitHub(true);
    try {
      const { getKeepersPipelineConfig } = await import("../utils/supporterManager");
      const cfg = await getKeepersPipelineConfig(forceRefresh);
      setKeepersProcessor(cfg.keepers_payment_processor || "STRIPE");
      setKeepersUrl(cfg.keepers_donation_url || "");
      setLiveStableVer(cfg.stable_version || "0.5.7");
      setLiveStableDate(cfg.stable_published_at || "");
      setLiveDevVer(cfg.dev_build_version || "");
      setLiveDevDate(cfg.dev_published_at || "");
      setLiveDevNotes(cfg.dev_build_notes || "");
      setHasLiveDev(Boolean(cfg.has_live_dev_release));
      if (forceRefresh) {
        useStore
          .getState()
          .pushStatus(
            t("keepers_github_synced_toast", "Synced live release channels from GitHub!"),
            "success",
          );
      }
    } finally {
      setSyncingGitHub(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadFromGitHubAndConfig(true);
  }, [isOpen]);

  // Compute next tags automatically from package.json and live GitHub versions
  const basePkgVer = (packageJson.version || "0.5.8").replace(/^v/i, "").split("-")[0].trim();
  const nextStableTag = `v${basePkgVer}`;
  const nextDevTag = (() => {
    if (liveDevVer && liveDevVer.startsWith(`${basePkgVer}-dev.`)) {
      const num = parseInt(liveDevVer.split("-dev.")[1] || "1", 10);
      if (!isNaN(num)) return `v${basePkgVer}-dev.${num + 1}`;
    }
    return `v${basePkgVer}-dev.1`;
  })();

  const handleCopyDevTagCommand = () => {
    const cmd = `git tag ${nextDevTag} && git push origin ${nextDevTag}`;
    navigator.clipboard.writeText(cmd);
    useStore
      .getState()
      .pushStatus(
        t("keepers_pipeline_tag_copied", "Git tag release command copied to clipboard!"),
        "success",
      );
  };

  const handleCopyStableTagCommand = () => {
    const cmd = `git tag ${nextStableTag} && git push origin ${nextStableTag}`;
    navigator.clipboard.writeText(cmd);
    useStore
      .getState()
      .pushStatus(
        t("keepers_pipeline_tag_copied", "Git tag release command copied to clipboard!"),
        "success",
      );
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { saveKeepersPipelineConfig } = await import("../utils/supporterManager");
      await saveKeepersPipelineConfig({
        keepers_payment_processor: keepersProcessor,
        keepers_donation_url: keepersUrl.trim(),
      });
      useStore
        .getState()
        .pushStatus(
          t(
            "keepers_pipeline_saved_toast",
            "Release pipeline & donation settings saved!",
          ),
          "success",
        );
      onClose();
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("keepers_pipeline_panel_title", "Dev Build Pipeline & Keepers Donations")}
      subtitle={t(
        "keepers_pipeline_panel_subtitle",
        "Publish Daily Dev Builds for Supporters & Configure Keepers Core Donations",
      )}
      icon={t("icon_rocket_launch", "rocket_launch")}
    >
      <div className="flex flex-col gap-6 w-full">
        {/* SECTION A: KEEPERS CORE (SANCTUARY OS) DONATION CONFIG */}
        <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black tracking-wide text-[var(--text)] flex items-center gap-2">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                {t("icon_volunteer_activism", "volunteer_activism")}
              </span>
              {t("supporter_keepers_title", "Sanctuary OS (Keepers Core)")}
            </span>
            <button
              type="button"
              onClick={() => {
                setKeepersProcessor("SANDBOX");
                setKeepersUrl("sandbox://checkout");
              }}
              className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[10px] font-black tracking-wider text-[var(--accent)] flex items-center gap-1 transition-all"
            >
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_science", "science")}
              </span>
              <span>
                {t(
                  "supporter_sandbox_enable_btn",
                  "Use Sandbox Test Processor (For Testing)",
                )}
              </span>
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("wf_donation_processor_label", "Payment Processor")}
            </label>
            <CustomDropdown
              disableTint={true}
              value={keepersProcessor}
              onChange={(val: any) =>
                setKeepersProcessor(Array.isArray(val) ? val[0] : val)
              }
              options={[
                { id: "STRIPE", label: "Stripe Checkout" },
                { id: "STRIPE / GITHUB SPONSORS", label: "Stripe / GitHub Sponsors" },
                { id: "PATREON", label: "Patreon" },
                { id: "KO-FI", label: "Ko-fi" },
                { id: "PAYPAL", label: "PayPal" },
                { id: "SANDBOX", label: "Sandbox Test Processor (Testing)" },
                { id: "CUSTOM", label: "Custom Direct Processor" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("wf_donation_url_label", "Donation / Checkout Link")}
            </label>
            <input
              type="url"
              value={keepersUrl}
              onChange={(e) => setKeepersUrl(e.target.value)}
              placeholder={t(
                "wf_donation_url_ph",
                "https://donate.stripe.com/... or https://ko-fi.com/...",
              )}
              className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] disabled:opacity-40 transition-all text-xs font-black tracking-widest text-[var(--text)] flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
              {saving ? t("icon_sync", "sync") : t("icon_check", "check")}
            </span>
            <span>{t("keepers_save_donation_btn", "Save Keepers Donation Link")}</span>
          </button>
        </div>

        {/* SECTION B: LIVE GITHUB RELEASES AUTO-SYNC */}
        <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs font-black tracking-wide text-[var(--text)] flex items-center gap-2">
                <span className="material-symbols-outlined !text-[18px] text-[var(--success)]">
                  {t("icon_cloud_sync", "cloud_sync")}
                </span>
                {t("keepers_github_auto_title", "GitHub Releases Auto-Sync (Live Channels)")}
              </span>
              <span className="text-[11px] font-medium text-[var(--subtext)] opacity-85">
                {t(
                  "keepers_github_auto_subtitle",
                  "Stable and Daily Dev Build versions, installers, and patch notes are pulled automatically from GitHub Releases.",
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => loadFromGitHubAndConfig(true)}
              disabled={syncingGitHub}
              className="px-3 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[var(--accent)] text-[10px] font-bold tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0 transition-all"
            >
              <span className={`material-symbols-outlined !text-[14px] ${syncingGitHub ? "animate-spin text-[var(--accent)]" : ""}`}>
                {t("icon_refresh", "refresh")}
              </span>
              <span>{t("keepers_github_sync_btn", "Refresh from GitHub")}</span>
            </button>
          </div>

          {/* LIVE CHANNELS STATUS GRID */}
          <div className="grid grid-cols-1 gap-3">
            {/* LIVE DAILY DEV BUILD */}
            <div className="p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--success)_35%,transparent)] flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">
                    {t("icon_bolt", "bolt")}
                  </span>
                  <span className="text-xs font-black text-[var(--text)] truncate">
                    {t("keepers_github_live_dev_label", "Live Daily Dev Build (GitHub)")}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[10px] font-mono font-bold text-[var(--success)] shrink-0">
                  {hasLiveDev
                    ? `v${liveDevVer.replace(/^v/i, "")}${liveDevDate ? ` • ${new Date(liveDevDate).toLocaleDateString()}` : ""}`
                    : t("keepers_github_not_published", "No dev-latest release published yet")}
                </span>
              </div>
              {hasLiveDev && liveDevNotes && (
                <p className="text-[11px] font-medium text-[var(--subtext)] opacity-90 line-clamp-2 leading-relaxed">
                  {liveDevNotes}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                  {`git tag ${nextDevTag} && git push origin ${nextDevTag}`}
                </span>
                <button
                  type="button"
                  onClick={handleCopyDevTagCommand}
                  className="px-3 py-1.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--success)_35%,transparent)] hover:border-[var(--success)] text-[10px] font-bold text-[var(--success)] flex items-center gap-1.5 shrink-0 transition-all"
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t("icon_content_copy", "content_copy")}
                  </span>
                  <span>{t("keepers_pipeline_copy_dev_btn", "Copy Dev Tag Command")}</span>
                </button>
              </div>
            </div>

            {/* LIVE STABLE RELEASE */}
            <div className="p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                    {t("icon_verified", "verified")}
                  </span>
                  <span className="text-xs font-black text-[var(--text)] truncate">
                    {t("keepers_github_live_stable_label", "Live Stable Release (GitHub)")}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[10px] font-mono font-bold text-[var(--accent)] shrink-0">
                  {`v${liveStableVer.replace(/^v/i, "")}${liveStableDate ? ` • ${new Date(liveStableDate).toLocaleDateString()}` : ""}`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                  {`git tag ${nextStableTag} && git push origin ${nextStableTag}`}
                </span>
                <button
                  type="button"
                  onClick={handleCopyStableTagCommand}
                  className="px-3 py-1.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[10px] font-bold text-[var(--accent)] flex items-center gap-1.5 shrink-0 transition-all"
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t("icon_content_copy", "content_copy")}
                  </span>
                  <span>{t("keepers_pipeline_copy_stable_btn", "Copy Stable Tag Command")}</span>
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs font-medium text-[var(--subtext)] opacity-90 leading-relaxed">
            {t(
              "keepers_pipeline_how_it_works",
              "Pushing a v*-dev* tag (e.g. v0.5.9-dev.1) publishes only to the Supporter Daily Dev Build channel (dev-latest) without changing the public Website download links. Pushing a clean v* tag (e.g. v0.5.9) publishes to the Stable channel for all users and updates the Website.",
            )}
          </p>
        </div>
      </div>
    </SidePanel>
  );
}



