import { useState, useEffect } from "react";
import { supabase, supabaseAuth, RESOLVED_SANCTUARY_CONFIG } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel, CustomDropdown, ActionButton,
  SidePanelHeroCard, UniversalGroup, StatBox, VAULT_CHIP_CLASS,
  PanelHeaderGroup, PanelHeaderButton
} from "../shared";
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
        .select("id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor")
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
        icon={t("icon_settings_ethernet", "settings_ethernet")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_memory", "memory")}
            overline={t("keepers_hub_status_label", "Keepers Core Central Hub")}
            title={t("wf_stat_server_nominal", "ONLINE")}
            description={t("keepers_hub_schema_label", "Active Hub Node: Sanctuary Core OS")}
            badge={t("auto_synchronized", "SYNCHRONIZED")}
            badgeIcon={t("icon_check_circle", "check_circle")}
            variant="success"
          >
            <div className="grid grid-cols-2 gap-3 w-full">
              <StatBox
                label={t("keepers_hub_latency_label", "Central Hub Latency")}
                value={`${hubLatency !== null ? hubLatency : (stats?.networkLatency || 18)} ${t("icon_ms", "ms")}`}
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
                value={stats?.activeGames ?? stats?.activeGamesCount ?? spokeList.filter((s: any) => s.is_active !== false).length}
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
            title={t("keepers_hub_endpoint_title", "Central Hub Infrastructure")}
            icon={t("icon_router", "router")}
          >
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
                {t("keepers_hub_endpoint_desc", "Global authentication, supporter ledger, core heuristics, and federated spoke registry.")}
              </p>
              <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-widest font-black text-[var(--subtext)] opacity-60">
                  {t("keepers_hub_endpoint_title", "Central Hub Infrastructure")}
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
                {t("keepers_spokes_network_desc", "Live status of connected partner game databases registered to the Central Hub.")}
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
                            <img src={spoke.icon} alt="" className="w-5 h-5 object-contain" />
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
                            {spoke.schema_id} • {spoke.supabase_url || RESOLVED_SANCTUARY_CONFIG.supabaseUrl}
                          </span>
                        </div>
                      </div>
                      <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                        <span
                          className={`material-symbols-rounded !text-[12px] shrink-0 ${
                            isOnline ? "text-[var(--success)]" : "text-[var(--warning)]"
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
      subtitle={t("wf_health_subtitle", "Spoke Node Diagnostics & Sovereignty")}
      icon={t("icon_settings_ethernet", "settings_ethernet")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_memory", "memory")}
          overline={t("wf_core_node", "Core Node Status")}
          title={stats?.networkStatus === 'ONLINE' ? t("wf_stat_server_nominal", "ONLINE") : t("wf_stat_server_degraded", "DEGRADED")}
          description={t("wf_health_subtitle", "Spoke Node Diagnostics & Sovereignty")}
          badge={activeWs?.schema_id || activeWorkspaceId || "SPOKE"}
          variant={stats?.networkStatus === 'ONLINE' ? "success" : "warning"}
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
              value={`${stats?.networkLatency || '--'} ${t("icon_ms", "ms")}`}
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
          title={t("wf_uplink_key_rotation_title", "Uplink Handshake & Key Rotation")}
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
              {t("wf_uplink_key_rotation_desc", "Rotate your community Supabase keys or generate an Uplink Bundle token for Keepers Core.")}
            </p>
            <input
              type="text"
              value={uplinkUrl}
              onChange={e => setUplinkUrl(e.target.value)}
              placeholder={t("ui_supabase_url", "Supabase Project URL")}
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="text"
              value={uplinkAnonKey}
              onChange={e => setUplinkAnonKey(e.target.value)}
              placeholder={t("ui_supabase_key", "Supabase Anon Key")}
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              type="password"
              value={uplinkServiceKey}
              onChange={e => setUplinkServiceKey(e.target.value)}
              placeholder={t("ui_supabase_service_key", "Supabase Service Key")}
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
            />
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
            <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed">
              {t("wf_cut_cord_desc", "Unilaterally sever your community's Spoke database from the Sanctuary OS Hub. This immediately deactivates the workspace on the global network and scrubs your Service Role Key from the Hub while leaving 100% of your Spoke database intact.")}
            </p>
            <input
              type="text"
              value={severReason}
              onChange={e => setSeverReason(e.target.value)}
              placeholder={t("wf_cut_cord_reason_ph", "Optional reason for severing the uplink (logged to Audit Trail)...")}
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] focus:outline-none focus:border-[var(--danger)]"
            />
            <ActionButton
              variant="danger"
              icon={t("icon_content_cut", "content_cut")}
              onClick={handleCutTheCord}
              disabled={isSevering}
              className={`w-full justify-center !py-3.5 ${confirmSever ? "animate-pulse" : ""}`}
            >
              {confirmSever
                ? t("wf_cut_cord_confirm_btn", "Confirm: Click Again to Permanently Sever Uplink")
                : t("wf_cut_cord_btn", "Cut the Cord (Double-Click to Sever)")}
            </ActionButton>
          </div>
        </UniversalGroup>
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
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_shield", "shield")}
          overline={activeWs?.name || activeWs?.schema_id || t("wf_donation_panel_title", "Partner Community")}
          title={t("wf_donation_panel_title", "Non-Custodial Community Donations")}
          description={t(
            "wf_donation_notice_desc",
            "Your community receives 100% of all citizen donations directly via your own payment processor. Sanctuary OS takes a 0% cut, never touches your funds, and does not cover chargebacks. Every $5 a citizen donates to your community automatically grants them +30 days of Global Daily Dev Build access.",
          )}
          badge={processor}
          variant="accent"
        />

        <UniversalGroup
          title={t("wf_donation_processor_label", "Payment Processor & Checkout Link")}
          icon={t("icon_volunteer_activism", "volunteer_activism")}
          headerActions={
            <ActionButton
              variant="glass"
              icon={t("icon_science", "science")}
              onClick={() => {
                setProcessor("SANDBOX");
                setDonationUrl("sandbox://checkout");
              }}
              className="!px-3 !py-1.5"
            >
              {t("supporter_sandbox_enable_btn", "Use Sandbox Test Processor (For Testing)")}
            </ActionButton>
          }
        >
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
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
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                {t("wf_donation_url_label", "Donation / Checkout Link (Leave blank to hide)")}
              </label>
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

            <ActionButton
              variant="glass"
              icon={saving ? t("icon_sync", "sync") : t("icon_check", "check")}
              onClick={handleSave}
              disabled={saving}
              className="w-full justify-center !py-3.5 mt-1"
            >
              {t("wf_donation_save_btn", "Save Donation Settings")}
            </ActionButton>
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("supporter_processor_setup_guide_title", "How to Connect Stripe or Ko-fi")}
          icon={t("icon_info", "info")}
        >
          <p className="text-xs font-medium text-[var(--subtext)] whitespace-pre-line leading-relaxed">
            {t(
              "supporter_processor_setup_guide_desc",
              "1. Create a Stripe Payment Link (buy.stripe.com/...) or Ko-fi page.\n2. Paste the URL above. Sanctuary OS automatically attaches ?client_reference_id=<user_id> on checkout.\n3. (Optional) Point your Stripe/Ko-fi webhook to the partner-donation-webhook Edge Function to auto-credit citizens, or let citizens verify their receipt ID directly.",
            )}
          </p>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}

export function KeeperReleasePipelineSidePanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useLexicon();
  const [keepersProcessor, setKeepersProcessor] = useState("STRIPE");
  const [keepersUrl, setKeepersUrl] = useState("");
  const [supportEmail, setSupportEmail] = useState("support@sanctuaryos.gg");
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
      setSupportEmail(cfg.support_contact_email || "support@sanctuaryos.gg");
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
        support_contact_email: supportEmail.trim() || "support@sanctuaryos.gg",
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
          overline={t("supporter_keepers_title", "Sanctuary OS (Keepers Core)")}
          title={t("keepers_pipeline_panel_title", "Release Pipeline & Supporter Channels")}
          description={t(
            "keepers_github_auto_subtitle",
            "Stable and Daily Dev Build versions, installers, and patch notes are pulled automatically from GitHub Releases.",
          )}
          badge={`v${liveStableVer.replace(/^v/i, "")}`}
          variant="accent"
        >
          <div className="grid grid-cols-2 gap-3 w-full">
            <StatBox
              label={t("keepers_github_live_stable_label", "Live Stable Release")}
              value={`v${liveStableVer.replace(/^v/i, "")}`}
              icon={t("icon_verified", "verified")}
              iconColorClass="text-[var(--accent)]"
              colorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("keepers_github_live_dev_label", "Live Daily Dev Build")}
              value={hasLiveDev ? `v${liveDevVer.replace(/^v/i, "")}` : "--"}
              icon={t("icon_bolt", "bolt")}
              iconColorClass="text-[var(--success)]"
              colorClass="text-[var(--success)]"
            />
          </div>
        </SidePanelHeroCard>

        {/* SECTION A: KEEPERS CORE (SANCTUARY OS) DONATION CONFIG */}
        <UniversalGroup
          title={t("supporter_keepers_title", "Sanctuary OS (Keepers Core)")}
          icon={t("icon_volunteer_activism", "volunteer_activism")}
          headerActions={
            <ActionButton
              variant="glass"
              icon={t("icon_science", "science")}
              onClick={() => {
                setKeepersProcessor("SANDBOX");
                setKeepersUrl("sandbox://checkout");
              }}
              className="!px-3 !py-1.5"
            >
              {t("supporter_sandbox_enable_btn", "Use Sandbox Test Processor (For Testing)")}
            </ActionButton>
          }
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
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
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
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-2">
                {t("keepers_email_sender_addr_label", "Custom Sender Email (From)")}
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
              icon={saving ? t("icon_sync", "sync") : t("icon_check", "check")}
              onClick={handleSave}
              disabled={saving}
              className="w-full justify-center !py-3 mt-1"
            >
              {t("keepers_save_donation_btn", "Save Keepers Donation Link")}
            </ActionButton>
          </div>
        </UniversalGroup>

        {/* SECTION B: LIVE GITHUB RELEASES AUTO-SYNC */}
        <UniversalGroup
          title={t("keepers_github_auto_title", "GitHub Releases Auto-Sync (Live Channels)")}
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
              {/* LIVE DAILY DEV BUILD */}
              <div className="p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--success)]">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_bolt", "bolt")}
                      </span>
                    </div>
                    <span className="text-xs font-black text-[var(--text)] truncate">
                      {t("keepers_github_live_dev_label", "Live Daily Dev Build (GitHub)")}
                    </span>
                  </div>
                  <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                    <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                      {t("icon_tag", "tag")}
                    </span>
                    <span>
                      {hasLiveDev
                        ? `v${liveDevVer.replace(/^v/i, "")}${liveDevDate ? ` • ${new Date(liveDevDate).toLocaleDateString()}` : ""}`
                        : t("keepers_github_not_published", "No dev-latest release published yet")}
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
                    {t("keepers_pipeline_copy_dev_btn", "Copy Dev Tag Command")}
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
                      {t("keepers_github_live_stable_label", "Live Stable Release (GitHub)")}
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
                    {t("keepers_pipeline_copy_stable_btn", "Copy Stable Tag Command")}
                  </ActionButton>
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
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
