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
import {
  getMonthlyServerGoalStatus,
  getSpokeServerGoalStatus,
  FoundryCostBreakdown,
  SpokeCostBreakdown,
} from "../utils/supporterManager";
import packageJson from "../../package.json";

function dollarsToCents(val: string): number {
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

function centsToDollarInput(cents?: number, fallbackCents = 0): string {
  const resolved = cents !== undefined ? Number(cents) : fallbackCents;
  return (resolved / 100).toFixed(2).replace(/\.00$/, "");
}

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
    }
  }, [isOpen, isKeepers, activeWs?.id]);

  const handleCopyUplinkBundle = () => {
    const payload = {
      name: activeWs?.name || activeWs?.schema_id || "Community Spoke",
      schema_id: (activeWs?.schema_id || activeWs?.id || "").toUpperCase(),
      supabase_url: uplinkUrl.trim(),
      supabase_anon_key: uplinkAnonKey.trim(),
      supabase_service_key: uplinkServiceKey.trim() || undefined,
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
      const res: any = await supabase.rpc("secure_update_spoke_uplink", {
        p_payload: {
          supabase_url: uplinkUrl.trim(),
          supabase_anon_key: uplinkAnonKey.trim(),
          supabase_service_key: uplinkServiceKey.trim(),
        },
      });
      if (res?.error || res?.data?.error) {
        throw new Error(res?.error?.message || res?.data?.error);
      }
      const { syncGameDatabases } = await import("../store");
      await syncGameDatabases();
      setUplinkServiceKey("");
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
            "Uplink severed. Your Spoke database is now independent and its service key has been scrubbed from the Hub."
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
                "Rotate your community Supabase keys or generate an Uplink Bundle token for Keepers Core."
              )}
            </p>
            <input
              type="text"
              value={uplinkUrl}
              onChange={(e) => setUplinkUrl(e.target.value)}
              placeholder={t("ui_supabase_url", "Supabase Project URL")}
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="text"
              value={uplinkAnonKey}
              onChange={(e) => setUplinkAnonKey(e.target.value)}
              placeholder={t("ui_supabase_key", "Supabase Anon Key")}
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="password"
              value={uplinkServiceKey}
              onChange={(e) => setUplinkServiceKey(e.target.value)}
              placeholder={t("ui_supabase_service_key", "Supabase Service Key")}
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("wf_cut_cord_title", "Cut the Cord (Sever Sanctuary Uplink)")}
          icon={t("icon_link_off", "link_off")}
          headerColorClass="text-[var(--danger)]"
        >
          <div className="flex flex-col gap-3 w-full">
            <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] flex flex-col gap-2">
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
                  "Cutting the cord immediately deactivates your Spoke on the Sanctuary OS Hub and permanently scrubs your Service Role Key from Keepers Core. 100% of your Spoke database tables remain intact in your own Supabase project."
                )}
              </p>
            </div>

            <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex flex-col gap-2">
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
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] focus:outline-none focus:border-[var(--danger)]"
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
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono font-black uppercase tracking-wider text-[var(--text)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] focus:outline-none focus:border-[var(--danger)]"
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

function LockedCycleLedgerSection({
  grossDollars,
  setGrossDollars,
  stripeFeesDollars,
  setStripeFeesDollars,
  carryoverDollars,
  setCarryoverDollars,
}: {
  grossDollars: string;
  setGrossDollars: (v: string) => void;
  stripeFeesDollars: string;
  setStripeFeesDollars: (v: string) => void;
  carryoverDollars: string;
  setCarryoverDollars: (v: string) => void;
}) {
  const { t } = useLexicon();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [grossDelta, setGrossDelta] = useState("5");
  const [feesDelta, setFeesDelta] = useState("1");
  const [carryoverDelta, setCarryoverDelta] = useState("5");

  const applyFieldDelta = (
    field: "gross" | "fees" | "carryover",
    sign: 1 | -1
  ) => {
    if (field === "gross") {
      const deltaCents = Math.max(0, dollarsToCents(grossDelta)) * sign;
      if (!deltaCents) return;
      const next = Math.max(0, dollarsToCents(grossDollars) + deltaCents);
      setGrossDollars(centsToDollarInput(next, 0));
    } else if (field === "fees") {
      const deltaCents = Math.max(0, dollarsToCents(feesDelta)) * sign;
      if (!deltaCents) return;
      const next = Math.max(0, dollarsToCents(stripeFeesDollars) + deltaCents);
      setStripeFeesDollars(centsToDollarInput(next, 0));
    } else {
      const deltaCents = Math.max(0, dollarsToCents(carryoverDelta)) * sign;
      if (!deltaCents) return;
      const next = dollarsToCents(carryoverDollars) + deltaCents;
      setCarryoverDollars(centsToDollarInput(next, 0));
    }
  };

  const formatReadOnlyUsd = (valStr: string, allowSigned = false) => {
    const cents = dollarsToCents(valStr);
    const abs = Math.abs(cents) / 100;
    if (allowSigned && cents < 0) return `-$${abs.toFixed(2)}`;
    if (allowSigned && cents > 0) return `+$${abs.toFixed(2)}`;
    return `$${abs.toFixed(2)}`;
  };

  const cards = [
    {
      id: "gross" as const,
      icon: t("icon_payments", "payments"),
      label: t("report_gross_contributions", "Gross Contributions"),
      formattedValue: formatReadOnlyUsd(grossDollars),
      valueColor: "text-[var(--text)]",
      deltaValue: grossDelta,
      setDeltaValue: setGrossDelta,
    },
    {
      id: "fees" as const,
      icon: t("icon_percent", "percent"),
      label: t("report_stripe_fees", "Payment Processing / Stripe Fees"),
      formattedValue: `-${formatReadOnlyUsd(stripeFeesDollars)}`,
      valueColor: "text-[var(--warning)]",
      deltaValue: feesDelta,
      setDeltaValue: setFeesDelta,
    },
    {
      id: "carryover" as const,
      icon: t("icon_history", "history"),
      label: t("report_prior_carryover_card_title", "Prior Cycle Carryover"),
      formattedValue: formatReadOnlyUsd(carryoverDollars, true),
      valueColor:
        dollarsToCents(carryoverDollars) > 0
          ? "text-[var(--success)]"
          : dollarsToCents(carryoverDollars) < 0
            ? "text-[var(--warning)]"
            : "text-[var(--text)]",
      deltaValue: carryoverDelta,
      setDeltaValue: setCarryoverDelta,
    },
  ];

  return (
    <UniversalGroup
      title={t(
        "report_payment_processing_title",
        "Payment Processing & Cycle Ledger"
      )}
      icon={t("icon_account_balance", "account_balance")}
      headerActions={
        <button
          type="button"
          onClick={() => setIsUnlocked((prev) => !prev)}
          className={`px-2.5 py-1 rounded-lg border bg-transparent text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
            isUnlocked
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
          }`}
        >
          <span className="material-symbols-outlined !text-[13px]">
            {isUnlocked
              ? t("icon_lock_open", "lock_open")
              : t("icon_lock", "lock")}
          </span>
          <span>
            {isUnlocked
              ? t("report_btn_lock_ledger", "Lock Ledger")
              : t("report_btn_unlock_adjust", "Unlock to Adjust")}
          </span>
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed m-0 px-0.5">
          {t(
            "report_ledger_locked_hint",
            "Totals update automatically from donations and monthly rollovers. Unlock only if you need to add or subtract a manual correction."
          )}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className={`p-3.5 rounded-2xl glass-surface border flex flex-col justify-between gap-2.5 transition-colors ${
                isUnlocked
                  ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                  <span className="material-symbols-outlined !text-[15px]">
                    {card.icon}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] inline-flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[11px]">
                    {t("icon_lock", "lock")}
                  </span>
                  <span>{t("report_ledger_locked_badge", "Auto-Synced")}</span>
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-85 leading-snug">
                  {card.label}
                </span>
                <span
                  className={`text-base font-black font-mono select-none ${card.valueColor}`}
                >
                  {card.formattedValue}
                </span>
              </div>

              {isUnlocked && (
                <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyFieldDelta(card.id, -1)}
                    className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[var(--warning)] text-[var(--text)] hover:text-[var(--warning)] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_remove", "remove")}
                    </span>
                  </button>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={card.deltaValue}
                    onChange={(e) => card.setDeltaValue(e.target.value)}
                    className="w-full min-w-0 glass-panel border border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-lg px-2 py-1 text-center text-xs font-mono font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => applyFieldDelta(card.id, 1)}
                    className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[var(--success)] text-[var(--text)] hover:text-[var(--success)] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_add", "add")}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </UniversalGroup>
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
                    type="number"
                    min={0}
                    step="0.01"
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
                    type="number"
                    min={0}
                    step="0.01"
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
                    type="number"
                    min={0}
                    step="0.01"
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
                    type="number"
                    min={0}
                    step="0.01"
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
                    type="number"
                    min={0}
                    step="0.01"
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
                    type="number"
                    min={0}
                    step="0.01"
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
                    type="url"
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

export function KeeperReleasePipelineSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const [activeSubTab, setActiveSubTab] = useState<
    "pipeline" | "report" | "checkout"
  >("pipeline");
  const [keepersProcessor, setKeepersProcessor] = useState("STRIPE");
  const [keepersUrl, setKeepersUrl] = useState("");
  const [supportEmail, setSupportEmail] = useState("support@sanctuaryos.gg");

  // Foundry cost breakdown inputs ($ USD)
  const [domainAnnualDollars, setDomainAnnualDollars] = useState("24");
  const [supabaseMonthlyDollars, setSupabaseMonthlyDollars] = useState("25");
  const [windowsAnnualDollars, setWindowsAnnualDollars] = useState("120");
  const [appleAnnualDollars, setAppleAnnualDollars] = useState("99");
  const [infraOtherMonthlyDollars, setInfraOtherMonthlyDollars] = useState("5");
  const [infraHostingDollars, setInfraHostingDollars] = useState("1.50");
  const [infraEmailDollars, setInfraEmailDollars] = useState("1.50");
  const [infraStorageDollars, setInfraStorageDollars] = useState("1.00");
  const [infraMonitoringDollars, setInfraMonitoringDollars] = useState("1.00");
  const [grossDollars, setGrossDollars] = useState("0");
  const [stripeFeesDollars, setStripeFeesDollars] = useState("0");
  const [carryoverDollars, setCarryoverDollars] = useState("0");

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
      const { getKeepersPipelineConfig, getMonthlyServerGoalStatus } =
        await import("../utils/supporterManager");
      const cfg = await getKeepersPipelineConfig(forceRefresh);
      const proc = (cfg.keepers_payment_processor || "STRIPE").toUpperCase();
      setKeepersProcessor(proc === "SANDBOX" ? "STRIPE" : proc);
      setKeepersUrl(cfg.keepers_donation_url || "");
      setSupportEmail(cfg.support_contact_email || "support@sanctuaryos.gg");

      const status = getMonthlyServerGoalStatus(cfg);
      const fb = status.foundryBreakdown;
      if (fb) {
        setDomainAnnualDollars(centsToDollarInput(fb.domain_annual_cents, 2400));
        setSupabaseMonthlyDollars(
          centsToDollarInput(fb.supabase_monthly_cents, 2500)
        );
        setWindowsAnnualDollars(
          centsToDollarInput(fb.windows_signing_annual_cents, 12000)
        );
        setAppleAnnualDollars(
          centsToDollarInput(fb.apple_dev_annual_cents, 9900)
        );
        setInfraOtherMonthlyDollars(
          centsToDollarInput(fb.infra_other_monthly_cents, 500)
        );
        setInfraHostingDollars(centsToDollarInput(fb.infra_hosting_cents, 150));
        setInfraEmailDollars(centsToDollarInput(fb.infra_email_cents, 150));
        setInfraStorageDollars(
          centsToDollarInput(fb.infra_release_storage_cents, 100)
        );
        setInfraMonitoringDollars(
          centsToDollarInput(fb.infra_monitoring_cents, 100)
        );
        setGrossDollars(centsToDollarInput(fb.gross_contributions_cents, 0));
        setStripeFeesDollars(centsToDollarInput(fb.stripe_fees_cents, 0));
        setCarryoverDollars(centsToDollarInput(fb.carryover_cents, 0));
      }

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
            t(
              "keepers_github_synced_toast",
              "Synced live release channels from GitHub!"
            ),
            "success"
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

  const draftFoundryBreakdown: FoundryCostBreakdown = {
    domain_annual_cents: Math.max(0, dollarsToCents(domainAnnualDollars)),
    supabase_monthly_cents: Math.max(0, dollarsToCents(supabaseMonthlyDollars)),
    windows_signing_annual_cents: Math.max(
      0,
      dollarsToCents(windowsAnnualDollars)
    ),
    apple_dev_annual_cents: Math.max(0, dollarsToCents(appleAnnualDollars)),
    infra_other_monthly_cents: Math.max(
      0,
      dollarsToCents(infraOtherMonthlyDollars)
    ),
    infra_hosting_cents: Math.max(0, dollarsToCents(infraHostingDollars)),
    infra_email_cents: Math.max(0, dollarsToCents(infraEmailDollars)),
    infra_release_storage_cents: Math.max(
      0,
      dollarsToCents(infraStorageDollars)
    ),
    infra_monitoring_cents: Math.max(0, dollarsToCents(infraMonitoringDollars)),
    gross_contributions_cents: Math.max(0, dollarsToCents(grossDollars)),
    stripe_fees_cents: Math.max(0, dollarsToCents(stripeFeesDollars)),
    carryover_cents: dollarsToCents(carryoverDollars),
  };

  const previewFoundryGoal = getMonthlyServerGoalStatus({
    keepers_donation_url: keepersUrl,
    keepers_payment_processor: keepersProcessor,
    stable_version: liveStableVer,
    dev_build_version: liveDevVer,
    dev_build_endpoint: "",
    dev_build_download_url: "",
    dev_build_notes: liveDevNotes,
    foundry_cost_breakdown: draftFoundryBreakdown,
    updated_at: "",
  });

  // Compute next tags automatically from package.json and live GitHub versions
  const basePkgVer = (packageJson.version || "0.5.8")
    .replace(/^v/i, "")
    .split("-")[0]
    .trim();
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
        t(
          "keepers_pipeline_tag_copied",
          "Git tag release command copied to clipboard!"
        ),
        "success"
      );
  };

  const handleCopyStableTagCommand = () => {
    const cmd = `git tag ${nextStableTag} && git push origin ${nextStableTag}`;
    navigator.clipboard.writeText(cmd);
    useStore
      .getState()
      .pushStatus(
        t(
          "keepers_pipeline_tag_copied",
          "Git tag release command copied to clipboard!"
        ),
        "success"
      );
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { saveKeepersPipelineConfig } = await import(
        "../utils/supporterManager"
      );
      await saveKeepersPipelineConfig({
        keepers_payment_processor: keepersProcessor,
        keepers_donation_url: keepersUrl.trim(),
        support_contact_email: supportEmail.trim() || "support@sanctuaryos.gg",
        monthly_server_goal_cents: previewFoundryGoal.totalOperatingCostCents,
        monthly_server_covered_cents: previewFoundryGoal.netReceivedCents,
        foundry_cost_breakdown: draftFoundryBreakdown,
      });
      useStore
        .getState()
        .pushStatus(
          t(
            "keepers_pipeline_saved_toast",
            "Release pipeline & donation settings saved!"
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

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t(
        "keepers_pipeline_panel_title",
        "Dev Build Pipeline & Keepers Donations"
      )}
      subtitle={t(
        "keepers_pipeline_panel_subtitle",
        "Publish Dev Builds for Supporters & Configure Keepers Core Donations"
      )}
      icon={t("icon_rocket_launch", "rocket_launch")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={saving ? t("icon_sync", "sync") : t("icon_save", "save")}
            tooltip={t("save", "Save")}
            onClick={handleSave}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_rocket_launch", "rocket_launch")}
          overline={t("supporter_keepers_title", "Sanctuary Foundry")}
          title={t(
            "keepers_pipeline_panel_title",
            "Release Pipeline & Supporter Channels"
          )}
          description={t(
            "keepers_github_auto_subtitle",
            "Stable and Dev Build versions, installers, and patch notes are pulled automatically from GitHub Releases."
          )}
          badge={`v${liveStableVer.replace(/^v/i, "")}`}
          variant="accent"
        >
          <div className="grid grid-cols-2 gap-3 w-full">
            <StatBox
              label={t(
                "keepers_github_live_stable_label",
                "Live Stable Release"
              )}
              value={`v${liveStableVer.replace(/^v/i, "")}`}
              icon={t("icon_verified", "verified")}
              iconColorClass="text-[var(--accent)]"
              colorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("keepers_github_live_dev_label", "Live Dev Build")}
              value={hasLiveDev ? `v${liveDevVer.replace(/^v/i, "")}` : "--"}
              icon={t("icon_bolt", "bolt")}
              iconColorClass="text-[var(--success)]"
              colorClass="text-[var(--success)]"
            />
          </div>
        </SidePanelHeroCard>

        {/* SUB-TABS INSIDE SIDE PANEL */}
        <SidePanelFilterBar className="grid-cols-3 gap-2.5">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_cloud_sync", "cloud_sync")}
            label={t("report_tab_pipeline", "Release Pipeline")}
            isActive={activeSubTab === "pipeline"}
            onClick={() => setActiveSubTab("pipeline")}
          />
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

        {activeSubTab === "pipeline" && (
          <UniversalGroup
            title={t(
              "keepers_github_auto_title",
              "GitHub Releases Auto-Sync (Live Channels)"
            )}
            icon={t("icon_cloud_sync", "cloud_sync")}
            headerColorClass="text-[var(--success)]"
            headerActions={
              <ActionButton
                variant="glass"
                icon={t("icon_refresh", "refresh")}
                onClick={() => loadFromGitHubAndConfig(true)}
                disabled={syncingGitHub}
                className="!px-3 !py-1.5"
              >
                {t("keepers_github_sync_btn", "Refresh from GitHub")}
              </ActionButton>
            }
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 gap-3">
                {/* LIVE DEV BUILD */}
                <div className="p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--success)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_bolt", "bolt")}
                        </span>
                      </div>
                      <span className="text-xs font-black text-[var(--text)] truncate">
                        {t(
                          "keepers_github_live_dev_label",
                          "Live Dev Build (GitHub)"
                        )}
                      </span>
                    </div>
                    <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                        {t("icon_tag", "tag")}
                      </span>
                      <span>
                        {hasLiveDev
                          ? `v${liveDevVer.replace(/^v/i, "")}${liveDevDate ? ` • ${new Date(liveDevDate).toLocaleDateString()}` : ""}`
                          : t(
                            "keepers_github_not_published",
                            "No dev-latest release published yet"
                          )}
                      </span>
                    </span>
                  </div>
                  {hasLiveDev && liveDevNotes && (
                    <p className="text-[11px] font-medium text-[var(--subtext)] opacity-90 line-clamp-2 leading-relaxed">
                      {liveDevNotes}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                      {`git tag ${nextDevTag} && git push origin ${nextDevTag}`}
                    </span>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_content_copy", "content_copy")}
                      onClick={handleCopyDevTagCommand}
                      className="!px-3 !py-1.5 shrink-0"
                    >
                      {t(
                        "keepers_pipeline_copy_dev_btn",
                        "Copy Dev Tag Command"
                      )}
                    </ActionButton>
                  </div>
                </div>

                {/* LIVE STABLE RELEASE */}
                <div className="p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_verified", "verified")}
                        </span>
                      </div>
                      <span className="text-xs font-black text-[var(--text)] truncate">
                        {t(
                          "keepers_github_live_stable_label",
                          "Live Stable Release (GitHub)"
                        )}
                      </span>
                    </div>
                    <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                      <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                        {t("icon_tag", "tag")}
                      </span>
                      <span>
                        {`v${liveStableVer.replace(/^v/i, "")}${liveStableDate ? ` • ${new Date(liveStableDate).toLocaleDateString()}` : ""}`}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                      {`git tag ${nextStableTag} && git push origin ${nextStableTag}`}
                    </span>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_content_copy", "content_copy")}
                      onClick={handleCopyStableTagCommand}
                      className="!px-3 !py-1.5 shrink-0"
                    >
                      {t(
                        "keepers_pipeline_copy_stable_btn",
                        "Copy Stable Tag Command"
                      )}
                    </ActionButton>
                  </div>
                </div>
              </div>

              <p className="text-xs font-medium text-[var(--subtext)] opacity-90 leading-relaxed">
                {t(
                  "keepers_pipeline_how_it_works",
                  "Pushing a v*-dev* tag (e.g. v0.5.9-dev.1) publishes only to the Supporter Dev Build channel (dev-latest) without changing the public Website download links. Pushing a clean v* tag (e.g. v0.5.9) publishes to the Stable channel for all users and updates the Website."
                )}
              </p>
            </div>
          </UniversalGroup>
        )}

        {activeSubTab === "report" && (
          <div className="flex flex-col gap-4">
            <UniversalGroup
              title={t(
                "report_foundry_title",
                "Foundry Cost & Spending Report"
              )}
              icon={t("icon_receipt_long", "receipt_long")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_domain", "Domain Registration & DNS")} (${t("report_annual_usd_suffix", "/ yr")})`}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={domainAnnualDollars}
                    onChange={(e) => setDomainAnnualDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_supabase_hub", "Supabase (Core Hub)")} (${t("report_monthly_usd_suffix", "/ mo")})`}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={supabaseMonthlyDollars}
                    onChange={(e) => setSupabaseMonthlyDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_windows_signing", "Windows OV/EV Code Signing")} (${t("report_annual_usd_suffix", "/ yr")})`}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={windowsAnnualDollars}
                    onChange={(e) => setWindowsAnnualDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {`${t("report_item_apple_dev", "Apple Developer Program")} (${t("report_annual_usd_suffix", "/ yr")})`}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={appleAnnualDollars}
                    onChange={(e) => setAppleAnnualDollars(e.target.value)}
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="p-3.5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-3 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                        {t("icon_dns", "dns")}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                        {t(
                          "report_item_infra_other",
                          "Hosting, Email, Release Storage & Monitoring"
                        )}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-xs font-black font-mono text-[var(--accent)]">
                      {`$${(Math.max(0, dollarsToCents(infraOtherMonthlyDollars)) / 100).toFixed(2)} ${t("report_monthly_usd_suffix", "/mo")}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        key: "hosting",
                        label: t(
                          "report_sub_infra_hosting",
                          "Web Hosting & Edge CDN"
                        ),
                        value: infraHostingDollars,
                        onChange: (v: string) => {
                          setInfraHostingDollars(v);
                          const sum =
                            Math.max(0, dollarsToCents(v)) +
                            Math.max(0, dollarsToCents(infraEmailDollars)) +
                            Math.max(0, dollarsToCents(infraStorageDollars)) +
                            Math.max(
                              0,
                              dollarsToCents(infraMonitoringDollars)
                            );
                          setInfraOtherMonthlyDollars(
                            centsToDollarInput(sum, 0)
                          );
                        },
                      },
                      {
                        key: "email",
                        label: t(
                          "report_sub_infra_email",
                          "Transactional Email & Dispatch"
                        ),
                        value: infraEmailDollars,
                        onChange: (v: string) => {
                          setInfraEmailDollars(v);
                          const sum =
                            Math.max(0, dollarsToCents(infraHostingDollars)) +
                            Math.max(0, dollarsToCents(v)) +
                            Math.max(0, dollarsToCents(infraStorageDollars)) +
                            Math.max(
                              0,
                              dollarsToCents(infraMonitoringDollars)
                            );
                          setInfraOtherMonthlyDollars(
                            centsToDollarInput(sum, 0)
                          );
                        },
                      },
                      {
                        key: "storage",
                        label: t(
                          "report_sub_infra_storage",
                          "Release Binary Storage"
                        ),
                        value: infraStorageDollars,
                        onChange: (v: string) => {
                          setInfraStorageDollars(v);
                          const sum =
                            Math.max(0, dollarsToCents(infraHostingDollars)) +
                            Math.max(0, dollarsToCents(infraEmailDollars)) +
                            Math.max(0, dollarsToCents(v)) +
                            Math.max(
                              0,
                              dollarsToCents(infraMonitoringDollars)
                            );
                          setInfraOtherMonthlyDollars(
                            centsToDollarInput(sum, 0)
                          );
                        },
                      },
                      {
                        key: "monitoring",
                        label: t(
                          "report_sub_infra_monitoring",
                          "Uptime & Crash Telemetry"
                        ),
                        value: infraMonitoringDollars,
                        onChange: (v: string) => {
                          setInfraMonitoringDollars(v);
                          const sum =
                            Math.max(0, dollarsToCents(infraHostingDollars)) +
                            Math.max(0, dollarsToCents(infraEmailDollars)) +
                            Math.max(0, dollarsToCents(infraStorageDollars)) +
                            Math.max(0, dollarsToCents(v));
                          setInfraOtherMonthlyDollars(
                            centsToDollarInput(sum, 0)
                          );
                        },
                      },
                    ].map((sub) => (
                      <div key={sub.key} className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                          {`${sub.label} (${t("report_monthly_usd_suffix", "/mo")})`}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={sub.value}
                          onChange={(e) => sub.onChange(e.target.value)}
                          className="w-full glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-2.5 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    ))}
                  </div>
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

            <TransparentCostReportBlock goal={previewFoundryGoal} />

            <ActionButton
              variant="glass"
              icon={saving ? t("icon_sync", "sync") : t("icon_save", "save")}
              onClick={handleSave}
              disabled={saving}
              className="w-full justify-center !py-3"
            >
              {t("save", "Save")}
            </ActionButton>
          </div>
        )}

        {activeSubTab === "checkout" && (
          <UniversalGroup
            title={t("supporter_keepers_title", "Sanctuary Foundry")}
            icon={t("icon_volunteer_activism", "volunteer_activism")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                  {t("wf_donation_processor_label", "Payment Processor")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={keepersProcessor}
                  onChange={(val: any) =>
                    setKeepersProcessor(Array.isArray(val) ? val[0] : val)
                  }
                  options={[
                    {
                      id: "STRIPE",
                      label: t(
                        "proc_stripe_checkout",
                        "Stripe Checkout / Payment Link"
                      ),
                    },
                    {
                      id: "STRIPE / GITHUB SPONSORS",
                      label: t(
                        "proc_stripe_github",
                        "Stripe / GitHub Sponsors"
                      ),
                    },
                    { id: "PATREON", label: "Patreon" },
                    { id: "KO-FI", label: "Ko-fi" },
                    { id: "PAYPAL", label: "PayPal" },
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
                  {t("wf_donation_url_label", "Donation / Checkout Link")}
                </label>
                <input
                  type="url"
                  value={keepersUrl}
                  onChange={(e) => setKeepersUrl(e.target.value)}
                  placeholder={t(
                    "wf_donation_url_ph",
                    "https://donate.stripe.com/... or https://ko-fi.com/..."
                  )}
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                  {t(
                    "keepers_email_sender_addr_label",
                    "Custom Sender Email (From)"
                  )}
                </label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@sanctuaryos.gg"
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl p-3 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <ActionButton
                variant="glass"
                icon={saving ? t("icon_sync", "sync") : t("icon_save", "save")}
                onClick={handleSave}
                disabled={saving}
                className="w-full justify-center !py-3"
              >
                {t("save", "Save")}
              </ActionButton>
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
