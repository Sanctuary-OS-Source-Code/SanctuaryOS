import { useState, useEffect } from "react";
import { supabase, supabaseAuth, RESOLVED_SANCTUARY_CONFIG } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  CustomDropdown,
  ActionButton,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  DashboardStatTile,
  SidePanelFilterBar,
  VAULT_CHIP_CLASS,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";
import { TransparentCostReportBlock } from "./CommunitySupportSidePanel";
import { getSpokeServerGoalStatus, SpokeCostBreakdown } from "../utils/supporterManager";

import { dollarsToCents, centsToDollarInput } from "./wayfinder/wayfinderPanelHelpers";
import { LockedCycleLedgerSection } from "./wayfinder/LockedCycleLedgerSection";
export { KeeperReleasePipelineSidePanel } from "./wayfinder/KeeperReleasePipelineSidePanel";

export function ServerHealthSidePanel({
  isOpen,
  onClose,
  stats,
  isKeepers = false,
}: any) {
  const { t } = useLexicon();
  const workspaces = useStore((state: any) => state.workspaces);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const session = useStore((state: any) => state.session);
  const activeWs = (workspaces || []).find(
    (w: any) => w.id === activeWorkspaceId
  );

  const [uplinkUrl, setUplinkUrl] = useState("");
  const [uplinkAnonKey, setUplinkAnonKey] = useState("");
  const [uplinkServiceKey, setUplinkServiceKey] = useState("");
  const [updatingKeys, setUpdatingKeys] = useState(false);
  const [credentialStatus, setCredentialStatus] = useState<{
    has_credential?: boolean;
    credential_kind?: string;
    key_version?: string;
    key_fingerprint?: string;
    rotated_at?: string | null;
  } | null>(null);
  const [rotatingToken, setRotatingToken] = useState(false);

  const [severReason, setSeverReason] = useState("");
  const [severConfirmText, setSeverConfirmText] = useState("");
  const [confirmSever, setConfirmSever] = useState(false);
  const [isSevering, setIsSevering] = useState(false);

  const [hubLatency, setHubLatency] = useState<number | null>(null);
  const [federatedSpokes, setFederatedSpokes] = useState<any[]>([]);

  const isSeverPhraseValid =
    severConfirmText.trim().toUpperCase() === "CUT THE CORD";

  useEffect(() => {
    if (isOpen && isKeepers) {
      const start = performance.now();
      supabaseAuth
        .from("sanctuary_games")
        .select(
          "id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor"
        )
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
      setSeverConfirmText("");
      const targetGameId = activeWs.game_id || activeWs.schema_id || activeWorkspaceId;
      if (targetGameId) {
        (supabase as any)
          .rpc("secure_get_spoke_credential_status", {
            p_game_id: targetGameId,
            p_payload: {},
          })
          .then((res: any) => {
            if (!res?.error && res?.data) {
              setCredentialStatus(res.data);
            }
          })
          .catch(() => { });
      }
    }
  }, [isOpen, isKeepers, activeWs?.id]);

  const handleCopyUplinkBundle = () => {
    const payload = {
      name: activeWs?.name || activeWs?.schema_id || "Community Spoke",
      schema_id: (activeWs?.schema_id || activeWs?.id || "").toUpperCase(),
      supabase_url: uplinkUrl.trim(),
      supabase_anon_key: uplinkAnonKey.trim(),
      founder_identifier: session?.user?.id || undefined,
    };
    const token = "SANCTUARY-UPLINK://" + btoa(JSON.stringify(payload));
    navigator.clipboard.writeText(token);
    useStore
      .getState()
      .pushStatus(
        t(
          "spoke_uplink_bundle_copied",
          "Spoke Uplink Bundle copied to clipboard!"
        ),
        "success"
      );
  };

  const handleUpdateKeys = async () => {
    if (
      !uplinkUrl.trim() ||
      !uplinkAnonKey.trim() ||
      !uplinkServiceKey.trim()
    ) {
      alert(t("fill_required_fields", "Please fill all required fields"));
      return;
    }
    setUpdatingKeys(true);
    try {
      const targetGameId = activeWs?.game_id || activeWs?.schema_id || activeWorkspaceId;
      const res: any = await (supabase as any).rpc("secure_update_spoke_uplink", {
        p_game_id: targetGameId,
        p_payload: {
          supabase_url: uplinkUrl.trim(),
          supabase_anon_key: uplinkAnonKey.trim(),
          spoke_gateway_token: uplinkServiceKey.trim(),
        },
      });
      if (res?.error || res?.data?.error) {
        throw new Error(res?.error?.message || res?.data?.error);
      }
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      setUplinkServiceKey("");
      if (targetGameId) {
        try {
          const credRes: any = await (supabase as any).rpc("secure_get_spoke_credential_status", {
            p_game_id: targetGameId,
            p_payload: {},
          });
          if (!credRes?.error && credRes?.data) {
            setCredentialStatus(credRes.data);
          }
        } catch { }
      }
      useStore
        .getState()
        .pushStatus(
          t(
            "wf_uplink_keys_updated",
            "Spoke uplink keys verified and updated on the Hub."
          ),
          "success"
        );
    } catch (err: any) {
      useStore.getState().pushStatus(err.message, "error");
    } finally {
      setUpdatingKeys(false);
    }
  };

  const handleRotateGatewayToken = async () => {
    const targetGameId = activeWs?.game_id || activeWs?.schema_id || activeWorkspaceId;
    if (!targetGameId) return;
    setRotatingToken(true);
    try {
      const res: any = await (supabase as any).rpc("secure_rotate_spoke_gateway_token", {
        p_game_id: targetGameId,
        p_payload: {},
      });
      const errMsg = res?.error?.message || res?.data?.error;
      if (errMsg) {
        throw new Error(errMsg);
      }
      setCredentialStatus({
        has_credential: true,
        credential_kind: res?.data?.credential_kind || "spoke_gateway",
        key_version: res?.data?.key_version || "v1:master",
        key_fingerprint: res?.data?.key_fingerprint || "",
        rotated_at: res?.data?.rotated_at || new Date().toISOString(),
      });
      useStore
        .getState()
        .pushStatus(
          `${t("spoke_token_rotated_toast", "Spoke Gateway Token rotated and sealed:")} ${res?.data?.key_fingerprint || "spk_gw_..."}`,
          "success"
        );
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(
          err?.message || t("spoke_token_rotate_failed", "Failed to rotate Spoke Gateway Token"),
          "error"
        );
    } finally {
      setRotatingToken(false);
    }
  };

  const handleCutTheCord = async () => {
    if (!isSeverPhraseValid) return;
    if (!confirmSever) {
      setConfirmSever(true);
      setTimeout(() => setConfirmSever(false), 4500);
      return;
    }
    setIsSevering(true);
    try {
      const res: any = await supabase.rpc("secure_sever_spoke_cord", {
        p_payload: {
          reason:
            severReason.trim() ||
            "Community Executed Cut the Cord (Bilateral Sovereignty Severance)",
        },
      });
      if (res?.error || res?.data?.error) {
        throw new Error(res?.error?.message || res?.data?.error);
      }
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      useStore
        .getState()
        .pushStatus(
          t(
            "wf_cut_cord_success",
            "Uplink severed. Your Spoke database is now independent, its Spoke Gateway Tokens have been revoked, and its Hub Vault credential has been purged."
          ),
          "info"
        );
      setConfirmSever(false);
      setSeverConfirmText("");
      onClose();
    } catch (err: any) {
      useStore.getState().pushStatus(err.message, "error");
    } finally {
      setIsSevering(false);
    }
  };

  if (isKeepers) {
    const spokeList =
      federatedSpokes.length > 0 ? federatedSpokes : workspaces || [];
    return (
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={t("keepers_health_title", "Core OS Network Telemetry")}
        subtitle={t(
          "keepers_health_subtitle",
          "Central Hub & Federated Spoke Status"
        )}
        icon={t("icon_settings_ethernet", "settings_ethernet")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_memory", "memory")}
            overline={t("keepers_hub_status_label", "Keepers Core Central Hub")}
            title={t("wf_stat_server_nominal", "ONLINE")}
            description={t(
              "keepers_hub_schema_label",
              "Active Hub Node: Sanctuary Core OS"
            )}
            badge={t("auto_synchronized", "SYNCHRONIZED")}
            badgeIcon={t("icon_check_circle", "check_circle")}
            variant="success"
          >
            <div className="grid grid-cols-2 gap-3 w-full">
              <StatBox
                label={t("keepers_hub_latency_label", "Central Hub Latency")}
                value={`${hubLatency !== null ? hubLatency : stats?.networkLatency || 18} ${t("icon_ms", "ms")}`}
                icon={t("icon_speed", "speed")}
                iconColorClass="text-[var(--accent)]"
                colorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("keepers_hub_db_sync_label", "Core Hub DB Sync")}
                value={t("auto_synchronized", "SYNCHRONIZED")}
                icon={t("icon_cloud_done", "cloud_done")}
                iconColorClass="text-[var(--success)]"
                colorClass="text-[var(--success)]"
              />
              <StatBox
                label={t("ui_active_games", "Active Workspaces")}
                value={
                  stats?.activeGames ??
                  stats?.activeGamesCount ??
                  spokeList.filter((s: any) => s.is_active !== false).length
                }
                icon={t("icon_view_quilt", "view_quilt")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("citizen_oversight", "{Citizen} Management")}
                value={stats?.citizens ?? stats?.citizensCount ?? 0}
                icon={t("icon_group", "group")}
                iconColorClass="text-[var(--accent)]"
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t(
              "keepers_hub_endpoint_title",
              "Central Hub Infrastructure"
            )}
            icon={t("icon_router", "router")}
          >
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
                {t(
                  "keepers_hub_endpoint_desc",
                  "Global authentication, supporter ledger, core heuristics, and federated spoke registry."
                )}
              </p>
              <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-widest font-black text-[var(--subtext)] opacity-60">
                  {t(
                    "keepers_hub_endpoint_title",
                    "Central Hub Infrastructure"
                  )}
                </span>
                <span className="text-xs font-mono font-bold text-[var(--text)] break-all">
                  {RESOLVED_SANCTUARY_CONFIG.supabaseUrl}
                </span>
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("keepers_spokes_network_title", "Federated Spoke Nodes")}
            icon={t("icon_dns", "dns")}
            headerActions={
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                  {t("icon_dns", "dns")}
                </span>
                <span>{spokeList.length}</span>
              </span>
            }
          >
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
                {t(
                  "keepers_spokes_network_desc",
                  "Live status of connected partner game databases registered to the Central Hub."
                )}
              </p>
              <div className="flex flex-col gap-2.5">
                {spokeList.map((spoke: any) => {
                  const isOnline = spoke.is_active !== false;
                  return (
                    <div
                      key={spoke.id || spoke.schema_id}
                      className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                          {spoke.icon && spoke.icon.startsWith("http") ? (
                            <img
                              src={spoke.icon}
                              alt=""
                              className="w-5 h-5 object-contain"
                            />
                          ) : (
                            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                              {t("icon_sports_esports", "sports_esports")}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-[var(--text)] truncate">
                            {spoke.name || spoke.schema_id}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 truncate">
                            {spoke.schema_id} •{" "}
                            {spoke.supabase_url ||
                              RESOLVED_SANCTUARY_CONFIG.supabaseUrl}
                          </span>
                        </div>
                      </div>
                      <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                        <span
                          className={`material-symbols-rounded !text-[12px] shrink-0 ${isOnline
                            ? "text-[var(--success)]"
                            : "text-[var(--warning)]"
                            }`}
                        >
                          {isOnline
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_schedule", "schedule")}
                        </span>
                        <span>
                          {isOnline
                            ? t("keepers_spoke_online", "ONLINE")
                            : t("keepers_spoke_offline", "OFFLINE")}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    );
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("wf_health_title", "Server Health & Uplink")}
      subtitle={t(
        "wf_health_subtitle",
        "Spoke Node Diagnostics & Sovereignty"
      )}
      icon={t("icon_settings_ethernet", "settings_ethernet")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_sync_lock", "sync_lock")}
            tooltip={t(
              "wf_uplink_btn_update_keys",
              "Update Active Uplink Keys"
            )}
            disabled={updatingKeys || !uplinkServiceKey.trim()}
            onClick={handleUpdateKeys}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_memory", "memory")}
          overline={t("wf_core_node", "Core Node Status")}
          title={
            stats?.networkStatus === "ONLINE"
              ? t("wf_stat_server_nominal", "ONLINE")
              : t("wf_stat_server_degraded", "DEGRADED")
          }
          description={t(
            "wf_health_subtitle",
            "Spoke Node Diagnostics & Sovereignty"
          )}
          badge={activeWs?.schema_id || activeWorkspaceId || "SPOKE"}
          variant={stats?.networkStatus === "ONLINE" ? "success" : "warning"}
        >
          <div className="grid grid-cols-2 gap-3 w-full">
            <StatBox
              label={t("wf_uplink_schema_label", "Active Schema ID")}
              value={activeWs?.schema_id || activeWorkspaceId || "--"}
              icon={t("icon_schema", "schema")}
              iconColorClass="text-[var(--accent)]"
              colorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("wf_latency", "Latency")}
              value={`${stats?.networkLatency || "--"} ${t("icon_ms", "ms")}`}
              icon={t("icon_speed", "speed")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={t("wf_uplink_node_telemetry", "Spoke Node Telemetry")}
          icon={t("icon_router", "router")}
        >
          <div className="flex flex-col gap-3 w-full">
            <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-widest font-black text-[var(--subtext)] opacity-60">
                {t("wf_uplink_endpoint_label", "Spoke Endpoint")}
              </span>
              <span className="text-xs font-mono font-bold text-[var(--text)] break-all">
                {activeWs?.supabase_url || "--"}
              </span>
            </div>
            <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-widest font-black text-[var(--subtext)] opacity-60">
                {t("wf_db_sync", "Database Uplink")}
              </span>
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>{t("auto_synchronized", "SYNCHRONIZED")}</span>
              </span>
            </div>
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t(
            "wf_uplink_key_rotation_title",
            "Uplink Handshake & Key Rotation"
          )}
          icon={t("icon_vpn_key", "vpn_key")}
          headerActions={
            <ActionButton
              variant="glass"
              icon={t("icon_content_copy", "content_copy")}
              onClick={handleCopyUplinkBundle}
              className="!px-3 !py-1.5"
            >
              {t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
            </ActionButton>
          }
        >
          <div className="flex flex-col gap-3 w-full">
            <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
              {t(
                "wf_uplink_key_rotation_desc",
                "Rotate your Spoke Gateway Token (spk_gw_*), update Supabase credentials, or copy a secret-free Uplink Bundle for Keepers Core."
              )}
            </p>
            <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_terminal", "terminal")}
                </span>
                <span className="text-xs font-black uppercase tracking-wider">
                  {t("spoke_workflow_guide_title", "How to Link or Mint a Spoke Gateway Token")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                <p className="m-0">
                  {t(
                    "spoke_workflow_step_1",
                    "1. Run schema.sql in the Spoke's Supabase SQL Editor to initialize all 52 tables and gateway auth."
                  )}
                </p>
                <p className="m-0">
                  {t(
                    "spoke_workflow_step_2",
                    "2. Run SELECT public.mint_spoke_gateway_token(); in the Spoke's SQL Editor and copy the one-time spk_gw_... token:"
                  )}
                </p>
                <div className="flex items-center justify-between gap-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3 py-1.5 my-0.5">
                  <code className="text-[11px] font-mono font-bold text-[var(--accent)] break-all select-all">
                    {"SELECT public.mint_spoke_gateway_token();"}
                  </code>
                  <ActionButton
                    variant="glass"
                    icon={t("icon_content_copy", "content_copy")}
                    onClick={() => {
                      navigator.clipboard.writeText("SELECT public.mint_spoke_gateway_token();");
                      useStore
                        .getState()
                        .pushStatus(
                          t("spoke_mint_sql_copied", "Mint Gateway Token SQL copied to clipboard!"),
                          "success"
                        );
                    }}
                    className="!px-2.5 !py-1 shrink-0"
                  >
                    {t("spoke_btn_copy_mint_sql", "Copy SQL")}
                  </ActionButton>
                </div>
                <p className="m-0">
                  {t(
                    "spoke_workflow_step_3_wayfinder",
                    "3. Once linked, click Rotate Gateway Token above for 1-click zero-downtime rotation (no SQL needed). Only paste a manual spk_gw_... token below when linking for the first time, updating keys, or reconnecting after severing."
                  )}
                </p>
              </div>
            </div>
            {credentialStatus && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className={`${VAULT_CHIP_CLASS} ${!credentialStatus.has_credential
                    ? "!text-[var(--danger)] !border-[var(--danger)]/30"
                    : credentialStatus.credential_kind !== "spoke_gateway"
                      ? "!text-[var(--warning)] !border-[var(--warning)]/30"
                      : "!text-[var(--success)] !border-[var(--success)]/30"
                    }`}
                >
                  <span className="material-symbols-outlined !text-[12px]">
                    {credentialStatus.has_credential
                      ? t("icon_encrypted", "encrypted")
                      : t("icon_warning", "warning")}
                  </span>
                  <span>
                    {credentialStatus.has_credential
                      ? credentialStatus.credential_kind === "spoke_gateway"
                        ? t("spoke_cred_vault_sealed", "Envelope + Vault Sealed")
                        : t("spoke_cred_legacy_sealed", "Legacy Key Sealed")
                      : t("spoke_cred_missing", "No Uplink Token Sealed")}
                  </span>
                  {credentialStatus.key_fingerprint && (
                    <span className="font-mono opacity-80">
                      ({credentialStatus.key_fingerprint})
                    </span>
                  )}
                </div>
                {credentialStatus.has_credential && (
                  <ActionButton
                    variant="glass"
                    icon={
                      rotatingToken
                        ? t("icon_sync", "sync")
                        : t("icon_autorenew", "autorenew")
                    }
                    onClick={handleRotateGatewayToken}
                    disabled={rotatingToken}
                    className="!px-3 !py-1.5"
                  >
                    {rotatingToken
                      ? t("spoke_rotating_token", "Rotating Token...")
                      : t("spoke_btn_rotate_token", "Rotate Gateway Token")}
                  </ActionButton>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 ml-1">
                {t("ui_supabase_url", "Supabase Project URL")}
              </label>
              <input
                type="text"
                value={uplinkUrl}
                onChange={(e) => setUplinkUrl(e.target.value)}
                placeholder={t("ui_supabase_url", "Supabase Project URL")}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 ml-1">
                {t("ui_supabase_key", "Supabase Anon Key")}
              </label>
              <input
                type="text"
                value={uplinkAnonKey}
                onChange={(e) => setUplinkAnonKey(e.target.value)}
                placeholder={t("ui_supabase_key", "Supabase Anon Key")}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 ml-1">
                {t("spoke_gateway_token_label", "Spoke Gateway Token")}
              </label>
              <input
                type="password"
                value={uplinkServiceKey}
                onChange={(e) => setUplinkServiceKey(e.target.value)}
                placeholder={t(
                  "spoke_gateway_token_ph",
                  "spk_gw_... (scoped HMAC token, or leave blank to keep sealed credential)"
                )}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <ActionButton
              variant="glass"
              icon={t("icon_sync_lock", "sync_lock")}
              onClick={handleUpdateKeys}
              disabled={updatingKeys || !uplinkServiceKey.trim()}
              className="w-full justify-center !py-3 mt-1"
            >
              {t("wf_uplink_btn_update_keys", "Update Active Uplink Keys")}
            </ActionButton>
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("wf_cut_cord_title", "Cut the Cord (Sever Sanctuary Uplink)")}
          icon={t("icon_link_off", "link_off")}
          headerColorClass="text-[var(--danger)]"
        >
          <div className="flex flex-col gap-3 w-full">
            <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[var(--danger)]">
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_warning", "warning")}
                </span>
                <span className="text-xs font-black uppercase tracking-wider">
                  {t(
                    "wf_sever_warning_title",
                    "Permanent Network Severance & Auth Architecture Warning"
                  )}
                </span>
              </div>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "wf_sever_warning_desc",
                  "Cutting the cord immediately deactivates the Spoke on the Sanctuary OS Hub, revokes all active Spoke Gateway Tokens, and permanently purges its sealed Vault credential from Keepers Core. 100% of the Spoke database tables remain intact in the community's own Supabase project."
                )}
              </p>
            </div>

            <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_passkey", "passkey")}
                </span>
                <span className="text-xs font-black uppercase tracking-wider">
                  {t(
                    "wf_sever_identity_arch_title",
                    "How Accounts Work After Severing (Hub Auth vs. Spoke Profiles)"
                  )}
                </span>
              </div>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "wf_sever_identity_arch_desc",
                  "In federated mode, login credentials (auth.users) live in the Core Hub database while your Spoke stores public.profiles and zero-PII SHA-256 relink commitments. If you transition your severed Spoke into a Standalone Fork pointed solely at your Spoke Supabase URL, {Citizens} and {Masons} register a local login on your Spoke Auth and supply their Spoke Relink Token (SRK1.<uuid>.<secret>) at sign-up or in {Settings} -> System ID to cryptographically reclaim their Spoke profile, {Mason} studio, and {Blueprints} without username hijacking. The first local signup automatically promotes to Founding Wayfinder."
                )}
              </p>
            </div>

            <input
              type="text"
              value={severReason}
              onChange={(e) => setSeverReason(e.target.value)}
              placeholder={t(
                "wf_cut_cord_reason_ph",
                "Optional reason for severing the uplink (logged to Audit Trail)..."
              )}
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--danger)]"
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] ml-1">
                {t(
                  "wf_sever_type_confirm_label",
                  'Type "CUT THE CORD" to unlock severance'
                )}
              </label>
              <input
                type="text"
                value={severConfirmText}
                onChange={(e) => {
                  setSeverConfirmText(e.target.value);
                  setConfirmSever(false);
                }}
                placeholder={t("wf_sever_type_confirm_ph", "CUT THE CORD")}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono font-black uppercase tracking-wider text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--danger)]"
              />
            </div>

            <ActionButton
              variant="danger"
              icon={t("icon_content_cut", "content_cut")}
              onClick={handleCutTheCord}
              disabled={isSevering || !isSeverPhraseValid}
              className={`w-full justify-center !py-3.5 ${confirmSever ? "animate-pulse" : ""}`}
            >
              {!isSeverPhraseValid
                ? t(
                  "wf_sever_btn_locked",
                  'Type "CUT THE CORD" Above to Unlock'
                )
                : confirmSever
                  ? t(
                    "wf_cut_cord_confirm_btn",
                    "Confirm: Click Again to Permanently Sever Uplink"
                  )
                  : t(
                    "wf_cut_cord_btn",
                    "Cut the Cord (Double-Click to Sever)"
                  )}
            </ActionButton>
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}

export function WayfinderDonationSetupSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const userRole = useStore((state: any) => state.userRole);
  const canManageSpokeDonations = userRole === "wayfinder";
  const workspaces = useStore((state: any) => state.workspaces);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const activeWs = (workspaces || []).find(
    (w: any) => w.id === activeWorkspaceId
  );

  const [activeSubTab, setActiveSubTab] = useState<"report" | "checkout">(
    "report"
  );
  const [processor, setProcessor] = useState("STRIPE");
  const [donationUrl, setDonationUrl] = useState("");
  const [dbComputeDollars, setDbComputeDollars] = useState("15");
  const [authDollars, setAuthDollars] = useState("2");
  const [realtimeDollars, setRealtimeDollars] = useState("2");
  const [edgeDollars, setEdgeDollars] = useState("2");
  const [storageDollars, setStorageDollars] = useState("2");
  const [backupsDollars, setBackupsDollars] = useState("2");
  const [grossDollars, setGrossDollars] = useState("0");
  const [stripeFeesDollars, setStripeFeesDollars] = useState("0");
  const [carryoverDollars, setCarryoverDollars] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !canManageSpokeDonations) return;
    const loadCurrent = async () => {
      const { getLocalPartnerDonationOverride, getSpokeServerGoalStatus } =
        await import("../utils/supporterManager");
      const localOverride =
        getLocalPartnerDonationOverride(activeWs?.schema_id) ||
        getLocalPartnerDonationOverride(activeWorkspaceId);
      const goalStatus = getSpokeServerGoalStatus({
        id: activeWs?.id || activeWorkspaceId,
        schema_id: activeWs?.schema_id || activeWorkspaceId,
        monthly_goal_cents: localOverride?.monthly_goal_cents,
        monthly_covered_cents: localOverride?.monthly_covered_cents,
        spoke_cost_breakdown: localOverride?.spoke_cost_breakdown,
      });
      const sb = goalStatus.spokeBreakdown;
      if (sb) {
        setDbComputeDollars(
          centsToDollarInput(sb.db_compute_storage_cents, 1500)
        );
        setAuthDollars(centsToDollarInput(sb.auth_activity_cents, 200));
        setRealtimeDollars(centsToDollarInput(sb.realtime_cents, 200));
        setEdgeDollars(centsToDollarInput(sb.edge_functions_cents, 200));
        setStorageDollars(centsToDollarInput(sb.storage_egress_cents, 200));
        setBackupsDollars(centsToDollarInput(sb.backups_logs_cents, 200));
        setGrossDollars(centsToDollarInput(sb.gross_contributions_cents, 0));
        setStripeFeesDollars(centsToDollarInput(sb.stripe_fees_cents, 0));
        setCarryoverDollars(centsToDollarInput(sb.carryover_cents, 0));
      }

      if (localOverride) {
        setDonationUrl(localOverride.donation_url || "");
        const proc = (
          localOverride.payment_processor || "STRIPE"
        ).toUpperCase();
        setProcessor(proc === "SANDBOX" ? "STRIPE" : proc);
      } else if (activeWs) {
        setDonationUrl(activeWs.donation_url || "");
        const proc = (activeWs.payment_processor || "STRIPE").toUpperCase();
        setProcessor(proc === "SANDBOX" ? "STRIPE" : proc);
      }
      if (activeWs?.schema_id) {
        const { data } = await supabaseAuth
          .from("sanctuary_games")
          .select("donation_url, payment_processor")
          .ilike("schema_id", activeWs.schema_id)
          .maybeSingle();
        if (data) {
          if (
            data.donation_url !== undefined &&
            data.donation_url !== null &&
            !String(data.donation_url).toLowerCase().startsWith("sandbox://")
          ) {
            setDonationUrl(data.donation_url);
          }
          if (data.payment_processor) {
            const p = String(data.payment_processor).toUpperCase();
            setProcessor(p === "SANDBOX" ? "STRIPE" : p);
          }
        }
      }
    };
    loadCurrent();
  }, [isOpen, activeWorkspaceId, activeWs?.schema_id]);

  const draftBreakdown: SpokeCostBreakdown = {
    db_compute_storage_cents: Math.max(0, dollarsToCents(dbComputeDollars)),
    auth_activity_cents: Math.max(0, dollarsToCents(authDollars)),
    realtime_cents: Math.max(0, dollarsToCents(realtimeDollars)),
    edge_functions_cents: Math.max(0, dollarsToCents(edgeDollars)),
    storage_egress_cents: Math.max(0, dollarsToCents(storageDollars)),
    backups_logs_cents: Math.max(0, dollarsToCents(backupsDollars)),
    gross_contributions_cents: Math.max(0, dollarsToCents(grossDollars)),
    stripe_fees_cents: Math.max(0, dollarsToCents(stripeFeesDollars)),
    carryover_cents: dollarsToCents(carryoverDollars),
  };

  const previewGoal = getSpokeServerGoalStatus({
    id: activeWs?.id || activeWorkspaceId,
    schema_id: activeWs?.schema_id || activeWorkspaceId,
    monthly_goal_cents:
      (draftBreakdown.db_compute_storage_cents || 0) +
      (draftBreakdown.auth_activity_cents || 0) +
      (draftBreakdown.realtime_cents || 0) +
      (draftBreakdown.edge_functions_cents || 0) +
      (draftBreakdown.storage_egress_cents || 0) +
      (draftBreakdown.backups_logs_cents || 0),
    monthly_covered_cents: Math.max(
      0,
      (draftBreakdown.gross_contributions_cents || 0) -
      (draftBreakdown.stripe_fees_cents || 0)
    ),
    spoke_cost_breakdown: draftBreakdown,
  });

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { savePartnerCommunityDonationConfig } = await import(
        "../utils/supporterManager"
      );
      await savePartnerCommunityDonationConfig({
        gameId: activeWs?.id || activeWorkspaceId,
        schemaId: activeWs?.schema_id || activeWorkspaceId,
        donationUrl,
        paymentProcessor: processor,
        monthlyGoalCents: previewGoal.totalOperatingCostCents,
        monthlyCoveredCents: previewGoal.netReceivedCents,
        spokeCostBreakdown: draftBreakdown,
      });
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      useStore
        .getState()
        .pushStatus(
          t(
            "wf_donation_saved_toast",
            "Partner Community donation settings updated!"
          ),
          "success"
        );
      onClose();
    } catch (err: any) {
      useStore.getState().pushStatus(err?.message || String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  if (!canManageSpokeDonations) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("wf_donation_panel_title", "Partner Community Donation Setup")}
      subtitle={t(
        "wf_donation_panel_subtitle",
        "100% Non-Custodial • 0% Sanctuary Cut • Unlocks Global Dev Builds for Citizens"
      )}
      icon={t("icon_volunteer_activism", "volunteer_activism")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={saving ? t("icon_sync", "sync") : t("icon_save", "save")}
            tooltip={t("wf_donation_save_btn", "Save Donation Settings")}
            disabled={saving}
            onClick={handleSave}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_shield", "shield")}
          overline={
            activeWs?.name ||
            activeWs?.schema_id ||
            t("wf_donation_panel_title", "Partner Community")
          }
          title={t(
            "wf_donation_panel_title",
            "Non-Custodial Community Donations"
          )}
          description={t(
            "wf_donation_notice_desc",
            "Your community receives 100% of all citizen donations directly via your own payment processor. Sanctuary OS takes a 0% cut, never touches your funds, and does not cover chargebacks. Every $5 a citizen donates to your community automatically grants them +30 days of Global Dev Build access."
          )}
          badge={processor}
          variant="accent"
        >
          <div className="grid grid-cols-2 gap-3 pt-1">
            <StatBox
              label={t("report_total_operating_cost", "Total Operating Cost")}
              value={`$${(previewGoal.totalOperatingCostCents / 100).toFixed(2)} ${t("report_monthly_usd_suffix", "/ mo")}`}
              icon={t("icon_database", "database")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("report_funded_this_cycle", "Amount Funded This Cycle")}
              value={`$${(previewGoal.fundedThisCycleCents / 100).toFixed(2)} (${previewGoal.percent}%)`}
              icon={t("icon_volunteer_activism", "volunteer_activism")}
              iconColorClass="text-[var(--success)]"
            />
          </div>
        </SidePanelHeroCard>

        {/* SUB-TABS INSIDE SIDE PANEL */}
        <SidePanelFilterBar className="grid-cols-2 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_receipt_long", "receipt_long")}
            label={t("report_tab_cost_breakdown", "Cost & Spending Report")}
            isActive={activeSubTab === "report"}
            onClick={() => setActiveSubTab("report")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_payments", "payments")}
            label={t("report_tab_checkout", "Processor & Checkout")}
            isActive={activeSubTab === "checkout"}
            onClick={() => setActiveSubTab("checkout")}
          />
        </SidePanelFilterBar>

        {activeSubTab === "report" ? (
          <div className="flex flex-col gap-4">
            <UniversalGroup
              title={t(
                "report_spoke_title",
                "Spoke Infrastructure & Spending Report"
              )}
              icon={t("icon_database", "database")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_spoke_db", "Database Compute & Storage")} ($ USD)`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={dbComputeDollars}
                    onChange={(e) => setDbComputeDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_spoke_auth", "Auth Activity")} ($ USD)`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={authDollars}
                    onChange={(e) => setAuthDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_spoke_realtime", "Realtime Connections & Messages")} ($ USD)`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={realtimeDollars}
                    onChange={(e) => setRealtimeDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_spoke_edge", "Edge Functions")} ($ USD)`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={edgeDollars}
                    onChange={(e) => setEdgeDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_spoke_storage", "File Storage & Egress")} ($ USD)`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={storageDollars}
                    onChange={(e) => setStorageDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_spoke_backups", "Database Backups & Audit Log Retention")} ($ USD)`}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={backupsDollars}
                    onChange={(e) => setBackupsDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </UniversalGroup>

            <LockedCycleLedgerSection
              grossDollars={grossDollars}
              setGrossDollars={setGrossDollars}
              stripeFeesDollars={stripeFeesDollars}
              setStripeFeesDollars={setStripeFeesDollars}
              carryoverDollars={carryoverDollars}
              setCarryoverDollars={setCarryoverDollars}
            />

            <TransparentCostReportBlock goal={previewGoal} />

            <ActionButton
              variant="glass"
              icon={saving ? t("icon_sync", "sync") : t("icon_save", "save")}
              onClick={handleSave}
              disabled={saving}
              className="w-full justify-center !py-3"
            >
              {t("wf_donation_save_btn", "Save Donation Settings")}
            </ActionButton>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <UniversalGroup
              title={t(
                "wf_donation_processor_label",
                "Payment Processor & Checkout Link"
              )}
              icon={t("icon_volunteer_activism", "volunteer_activism")}
            >
              <div className="flex flex-col gap-4 w-full">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                    {t("wf_donation_processor_label", "Payment Processor")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={processor}
                    onChange={(val: any) =>
                      setProcessor(Array.isArray(val) ? val[0] : val)
                    }
                    options={[
                      {
                        id: "STRIPE",
                        label: t(
                          "proc_stripe_checkout",
                          "Stripe Checkout / Payment Link"
                        ),
                      },
                      { id: "KO-FI", label: "Ko-fi" },
                      { id: "PATREON", label: "Patreon" },
                      { id: "PAYPAL", label: "PayPal" },
                      { id: "FOURTHWALL", label: "Fourthwall" },
                      { id: "OPENCOLLECTIVE", label: "OpenCollective" },
                      {
                        id: "CUSTOM",
                        label: t(
                          "proc_custom_direct",
                          "Custom Direct Processor"
                        ),
                      },
                    ]}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                    {t(
                      "wf_donation_url_label",
                      "Donation / Checkout Link (Leave blank to hide)"
                    )}
                  </label>
                  <input
                    type="text"
                    inputMode="url"
                    value={donationUrl}
                    onChange={(e) => setDonationUrl(e.target.value)}
                    placeholder={t(
                      "wf_donation_url_ph",
                      "https://donate.stripe.com/... or https://ko-fi.com/..."
                    )}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3.5 text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <ActionButton
                  variant="glass"
                  icon={
                    saving ? t("icon_sync", "sync") : t("icon_save", "save")
                  }
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full justify-center !py-3"
                >
                  {t("wf_donation_save_btn", "Save Donation Settings")}
                </ActionButton>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t(
                "supporter_processor_setup_guide_title",
                "How to Connect Stripe or Ko-fi"
              )}
              icon={t("icon_info", "info")}
            >
              <p className="text-xs font-medium text-[var(--subtext)] whitespace-pre-line leading-relaxed">
                {t(
                  "supporter_processor_setup_guide_desc",
                  "1. Create a Stripe Payment Link (buy.stripe.com/...) or Ko-fi page.\n2. Paste the URL above. Sanctuary OS automatically attaches ?client_reference_id=<user_id> on checkout.\n3. (Optional) Point your Stripe/Ko-fi webhook to the partner-donation-webhook Edge Function to auto-credit citizens, or let citizens verify their receipt ID directly."
                )}
              </p>
            </UniversalGroup>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
