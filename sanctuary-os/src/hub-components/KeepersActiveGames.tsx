import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useStore, syncGameDatabases } from '../store';
import { SidePanel, ActionButton, EmptyState, PanelHeaderGroup, PanelHeaderButton } from '../shared';
import { useLexicon } from '../LexiconContext';
import { logArchitectAction } from '../lib/audit';
import { UniversalCard } from '../components/universal/UniversalCard';
import { UniversalGroup, UniversalInput, SidePanelHeroCard, StatBox } from '../components/universal/UniversalLayout';
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput, SidePanelPillToggle } from '../components/layouts/ElevatedHubLayout';

export default function KeepersActiveGames() {
  const { t } = useLexicon();
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [filter, setFilter] = useState<'overview' | 'all' | 'active' | 'inactive' | 'urgent'>('overview');
  const [sidePanelMode, setSidePanelMode] = useState<'add' | 'edit' | null>(null);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    schema_id: "",
    supabase_url: "",
    supabase_anon_key: "",
    supabase_service_key: "",
    icon: "",
    is_active: true,
    founder_identifier: "",
    donation_url: "",
    payment_processor: "STRIPE"
  });
  const [bundleInput, setBundleInput] = useState("");
  const [verifyingHandshake, setVerifyingHandshake] = useState(false);
  const [handshakeStatus, setHandshakeStatus] = useState<{
    ok: boolean;
    message: string;
    latency?: number;
    wayfinder?: string | null;
  } | null>(null);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('sanctuary_games').select('id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor').order('created_at', { ascending: false });
    if (!error && data) {
      setGames(data);
    }
    setLoading(false);
  };

  const handleParseBundle = (raw: string) => {
    setBundleInput(raw);
    const trimmed = raw.trim();
    if (!trimmed) return;

    try {
      let jsonStr = trimmed;
      if (trimmed.startsWith("SANCTUARY-UPLINK://")) {
        jsonStr = atob(trimmed.replace("SANCTUARY-UPLINK://", "").trim());
      }
      if (jsonStr.startsWith("{")) {
        const parsed = JSON.parse(jsonStr);
        setFormData(prev => ({
          ...prev,
          name: parsed.name || prev.name,
          schema_id: (parsed.schema_id || prev.schema_id || "").toUpperCase(),
          supabase_url: parsed.supabase_url || prev.supabase_url,
          supabase_anon_key: parsed.supabase_anon_key || prev.supabase_anon_key,
          supabase_service_key: parsed.supabase_service_key || prev.supabase_service_key,
          founder_identifier: parsed.founder_identifier || prev.founder_identifier
        }));
        setBundleInput("");
        setHandshakeStatus(null);
        useStore.getState().pushStatus(t("spoke_bundle_parsed_toast", "Uplink bundle parsed and fields populated."), "success");
        return;
      }
    } catch (e) {}

    // Fallback: extract URL and keys from raw text / .env paste
    const urlMatch = trimmed.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    const keys = trimmed.match(/(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_(?:publishable|secret)_[A-Za-z0-9_-]+)/g) || [];
    if (urlMatch || keys.length > 0) {
      setFormData(prev => ({
        ...prev,
        supabase_url: urlMatch ? urlMatch[0] : prev.supabase_url,
        supabase_anon_key: keys[0] || prev.supabase_anon_key,
        supabase_service_key: keys[1] || prev.supabase_service_key
      }));
      setBundleInput("");
      setHandshakeStatus(null);
      useStore.getState().pushStatus(t("spoke_bundle_parsed_toast", "Uplink bundle parsed and fields populated."), "success");
    }
  };

  const handleCopyUplinkBundle = () => {
    const payload = {
      name: formData.name,
      schema_id: formData.schema_id,
      supabase_url: formData.supabase_url,
      supabase_anon_key: formData.supabase_anon_key,
      supabase_service_key: formData.supabase_service_key,
      founder_identifier: formData.founder_identifier || undefined
    };
    const token = "SANCTUARY-UPLINK://" + btoa(JSON.stringify(payload));
    navigator.clipboard.writeText(token);
    useStore.getState().pushStatus(t("spoke_uplink_bundle_copied", "Spoke Uplink Bundle copied to clipboard!"), "success");
  };

  const handleVerifyHandshake = async () => {
    if (!formData.supabase_url || (!formData.supabase_anon_key && !formData.supabase_service_key)) {
      alert(t("fill_required_fields", "Please fill all required fields"));
      return null;
    }
    setVerifyingHandshake(true);
    setHandshakeStatus(null);
    try {
      const res: any = await supabase.rpc('secure_verify_and_bootstrap_spoke', {
        p_payload: {
          supabase_url: formData.supabase_url.trim(),
          supabase_anon_key: formData.supabase_anon_key.trim(),
          supabase_service_key: formData.supabase_service_key?.trim() || "",
          founder_identifier: formData.founder_identifier?.trim() || ""
        }
      });
      const data = res?.data;
      if (res?.error || data?.error) {
        const errMsg = res?.error?.message || data?.error;
        setHandshakeStatus({ ok: false, message: errMsg });
        return { ok: false };
      }
      if (data?.missing_tables && data.missing_tables.length > 0) {
        setHandshakeStatus({
          ok: false,
          message: `${t("spoke_handshake_missing_tables", "Missing tables (run schema.sql on Spoke): ")}${data.missing_tables.join(", ")}`,
          latency: data.latency_ms
        });
        return { ok: false };
      }
      setHandshakeStatus({
        ok: true,
        message: t("spoke_handshake_ok", "Spoke Schema Verified & Ready"),
        latency: data?.latency_ms,
        wayfinder: data?.wayfinder_provisioned
      });
      return { ok: true, data };
    } catch (err: any) {
      setHandshakeStatus({ ok: false, message: err.message });
      return { ok: false };
    } finally {
      setVerifyingHandshake(false);
    }
  };

  const handleSaveGame = async () => {
    if (!formData.name || !formData.schema_id || !formData.supabase_url || !formData.supabase_anon_key) {
      alert(t("fill_required_fields", "Please fill all required fields"));
      return;
    }

    if (formData.supabase_service_key) {
      await handleVerifyHandshake();
    }

    let result;
    if (sidePanelMode === 'add') {
      result = await supabase.from('sanctuary_games').insert([{
        name: formData.name.trim(),
        schema_id: formData.schema_id.trim().toUpperCase(),
        supabase_url: formData.supabase_url.trim(),
        supabase_anon_key: formData.supabase_anon_key.trim(),
        ...(formData.supabase_service_key?.trim() ? { supabase_service_key: formData.supabase_service_key.trim() } : {}),
        icon: formData.icon,
        is_active: formData.is_active
      }]);
      if (!result?.error) {
        logArchitectAction(`Registered Game Database: ${formData.name}`, 'sanctuary_games', formData.name, undefined, 'Keeper Hub', true);
      }
    } else if (sidePanelMode === 'edit') {
      result = await supabase.from('sanctuary_games').update({
        name: formData.name.trim(),
        schema_id: formData.schema_id.trim().toUpperCase(),
        supabase_url: formData.supabase_url.trim(),
        supabase_anon_key: formData.supabase_anon_key.trim(),
        ...(formData.supabase_service_key?.trim() ? { supabase_service_key: formData.supabase_service_key.trim() } : {}),
        icon: formData.icon,
        is_active: formData.is_active
      }).eq('id', formData.id);
      if (!result?.error) {
        logArchitectAction(`Updated Game Database: ${formData.name}`, 'sanctuary_games', formData.name, undefined, 'Keeper Hub', true);
      }
    }

    if (!result?.error) {
      try {
        const { savePartnerCommunityDonationConfig } = await import("../utils/supporterManager");
        await savePartnerCommunityDonationConfig({
          gameId: formData.id || undefined,
          schemaId: formData.schema_id.trim().toUpperCase(),
          donationUrl: formData.donation_url,
          paymentProcessor: formData.payment_processor,
        });
      } catch {}
      setSidePanelMode(null);
      setHandshakeStatus(null);
      setFormData({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", supabase_service_key: "", icon: "", is_active: true, founder_identifier: "", donation_url: "", payment_processor: "STRIPE" });
      await fetchGames();
      await syncGameDatabases();
    } else {
      alert(`${t("identities_failed_prefix", "Error saving game:")} ${result.error.message}`);
    }
  };

  const handleDeleteGame = async (id: string, name: string) => {
    if (!window.confirm(t("ui_confirm_deprecate_game", "Deprecate and remove this Game Database?"))) return;
    const { error } = await supabase.from('sanctuary_games').delete().eq('id', id);
    if (!error) {
      logArchitectAction(`Deprecated Game Database`, 'sanctuary_games', name, undefined, 'Keeper Hub', true);
    }
    await fetchGames();
    await syncGameDatabases();
  };

  const handleToggleActive = async (id: string, name: string, currentStatus: boolean) => {
    const { error } = await supabase.from('sanctuary_games').update({ is_active: !currentStatus }).eq('id', id);
    if (!error) {
      logArchitectAction(`${!currentStatus ? 'Activated' : 'Deactivated'} Game Database`, 'sanctuary_games', name, undefined, 'Keeper Hub', true);
    }
    await fetchGames();
    await syncGameDatabases();
  };

  const handleSeverFDW = async (schema_id: string, name: string, id: string) => {
    if (!window.confirm(t("ui_confirm_sever_fdw", "Cut the cord and sever this Spoke connection? This deactivates the workspace and scrubs its service key from the Hub."))) return;
    try {
      await supabase.rpc('secure_sever_spoke_cord', {
        p_game_id: id || schema_id,
        p_payload: { reason: "Keeper Executed Severance Protocol" }
      });
      await supabase.from('sanctuary_games').update({ is_active: false, supabase_service_key: null }).eq('id', id);
      logArchitectAction(`Severed Spoke Uplink (Cut the Cord)`, 'sanctuary_games', name, undefined, 'Keeper Hub', true);
      useStore.getState().pushStatus(t("ui_fdw_severed", "Spoke uplink severed."), "info");
    } catch (e) { }
    await fetchGames();
    await syncGameDatabases();
  };

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview", "Overview"),
      icon: "dashboard",
      number: games.length.toString(),
    },
    {
      id: "active",
      label: t("filter_active", "Active"),
      icon: "toggle_on",
      number: games.filter(g => g.is_active !== false).length.toString(),
    },
    {
      id: "inactive",
      label: t("filter_inactive", "Inactive"),
      icon: "toggle_off",
      number: games.filter(g => g.is_active === false).length.toString(),
    }
  ];

  const filteredGames = games.filter(g => {
    if (filter === 'active' && g.is_active === false) return false;
    if (filter === 'inactive' && g.is_active !== false) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(g.name?.toLowerCase().includes(q) || g.schema_id?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const renderGameCard = (game: any) => (
      <UniversalCard
        key={game.id}
        onClick={() => {
          setHandshakeStatus(null);
          setFormData({
            id: game.id,
            name: game.name || "",
            schema_id: game.schema_id || "",
            supabase_url: game.supabase_url || "",
            supabase_anon_key: game.supabase_anon_key || "",
            supabase_service_key: game.supabase_service_key || "",
            icon: game.icon || "",
            is_active: game.is_active !== false,
            founder_identifier: "",
            donation_url: game.donation_url || "",
            payment_processor: (game.payment_processor || "STRIPE").toUpperCase()
          });
          setSidePanelMode('edit');
        }}
        layout="vertical"
        isGhosted={game.is_active === false}
        image={game.icon || undefined}
        icon={game.icon ? undefined : "dns"}
        title={
          <span className="flex items-center gap-2">
            {game.name}
            {game.is_active === false && (
              <span className="text-[9px] font-black uppercase bg-transparent border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] px-2 py-0.5 rounded-lg">
                {t("filter_inactive", "Inactive")}
              </span>
            )}
          </span>
        }
        subtitle={game.schema_id}
        actions={
          <div className="flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); handleToggleActive(game.id, game.name, game.is_active); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-transparent border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:scale-110 group"><span className="material-symbols-outlined !text-[14px]">{game.is_active === false ? 'toggle_off' : 'toggle_on'}</span></button>
            <button onClick={(e) => { e.stopPropagation(); handleSeverFDW(game.schema_id, game.name, game.id); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-transparent border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--warning)] hover:border-[color-mix(in_srgb,var(--warning)_40%,transparent)] hover:scale-110 group"><span className="material-symbols-outlined !text-[14px]">link_off</span></button>
            <button onClick={(e) => { e.stopPropagation(); handleDeleteGame(game.id, game.name); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-transparent border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:scale-110 group"><span className="material-symbols-outlined !text-[14px]">delete</span></button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 mt-4">
          <div className="text-[10px] text-[var(--text)] opacity-70 break-all font-mono glass-surface p-2 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            {t("ui_url", "URL")}: {game.supabase_url}
          </div>
          <div className="text-[10px] text-[var(--text)] opacity-70 break-all font-mono glass-surface p-2 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            {t("ui_key", "Key")}: {game.supabase_anon_key?.substring(0, 20)}...
          </div>
        </div>
      </UniversalCard>
  );

  const renderLanding = () => {
    const activeGames = games.filter(g => g.is_active !== false);
    const inactiveGames = games.filter(g => g.is_active === false);

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon="toggle_on"
          iconColorClass="text-[var(--success)]"
          title={t("recent_active_games", "Active Schema Engines")}
          isEmpty={activeGames.length === 0}
          emptyIcon="dns"
          emptyTitle={t("ui_no_games_registered", "No Active Schema Engines")}
        >
          {activeGames.slice(0, 4).map(renderGameCard)}
        </HubOverviewSection>

        <HubOverviewSection
          icon="toggle_off"
          iconColorClass="text-[var(--warning)]"
          title={t("recent_inactive_games", "Pending / Draft Engines")}
          isEmpty={inactiveGames.length === 0}
          emptyIcon="check_circle"
          emptyTitle={t("no_inactive_games", "No Pending / Draft Engines")}
        >
          {inactiveGames.slice(0, 4).map(renderGameCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const activeTab = filter === 'all' ? 'overview' : filter;

  return (
    <ElevatedHubLayout
      headerTitle={t("ui_active_games", "Game Databases")}
      headerSubtitle={t("ui_active_games_subtitle", "Manage Sanctuary game databases and FDW connections.")}
      headerIcon="dns"
      headerIconColorClass="text-[var(--accent)]"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("search_ph", "Search...") as string}
      hideSearch={activeTab === 'overview'}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(v) => setFilter(v as any)}
      actions={[
        {
          id: "add",
          icon: "add",
          label: t("ui_register_game_db", "Register Game Database"),
          onClick: () => {
            setHandshakeStatus(null);
            setFormData({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", supabase_service_key: "", icon: "", is_active: true, founder_identifier: "", donation_url: "", payment_processor: "STRIPE" });
            setSidePanelMode('add');
          }
        }
      ]}
    >
      <SidePanel
        isOpen={sidePanelMode !== null}
        onClose={() => setSidePanelMode(null)}
        title={sidePanelMode === 'edit' ? t("edit_db_node", "Edit Database Node") : t("ui_register_game_db", "Register Game Database")}
        subtitle={sidePanelMode === 'edit' ? t("update_config", "Update Configuration") : t("ui_add_network_node", "Add Network Node")}
        icon="dns"
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton icon="content_copy" tooltip={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")} onClick={handleCopyUplinkBundle} />
            <PanelHeaderButton icon="network_check" tooltip={t("spoke_btn_verify_handshake", "Test Handshake & Verify Schema")} onClick={handleVerifyHandshake} />
            <PanelHeaderButton icon="save" variant="accent" tooltip={t("btn_save", "Save")} onClick={handleSaveGame} />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon="dns"
            overline={t("ui_active_games", "Game Databases")}
            title={formData.name || (sidePanelMode === 'edit' ? t("edit_db_node", "Edit Database Node") : t("ui_register_game_db", "Register Game Database"))}
            description={t("ui_active_games_subtitle", "Manage Sanctuary game databases and FDW connections.")}
            badge={formData.is_active !== false ? t("filter_active", "Active") : t("filter_inactive", "Inactive")}
            badgeIcon={formData.is_active !== false ? "toggle_on" : "toggle_off"}
            variant={formData.is_active !== false ? "success" : "warning"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("ui_schema_id", "Schema ID")}
                value={formData.schema_id || t("oversight_na", "N/A")}
                icon="fingerprint"
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("wf_donation_processor_label", "Payment Processor")}
                value={formData.payment_processor || "STRIPE"}
                icon="volunteer_activism"
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          {handshakeStatus && (
            <div className={`glass-panel rounded-2xl p-4 border flex items-center justify-between gap-3 ${handshakeStatus.ok ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)]' : 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)]'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <span className={`material-symbols-outlined !text-[20px] ${handshakeStatus.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                  {handshakeStatus.ok ? 'verified' : 'error'}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className={`text-xs font-black tracking-wide ${handshakeStatus.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {handshakeStatus.message}
                  </span>
                  {handshakeStatus.wayfinder && (
                    <span className="text-[10px] font-bold text-[var(--subtext)]">
                      {t("spoke_wayfinder_provisioned", "Wayfinder role provisioned for: ")}{handshakeStatus.wayfinder}
                    </span>
                  )}
                </div>
              </div>
              {handshakeStatus.latency !== undefined && (
                <span className="text-[10px] font-mono font-black text-[var(--subtext)] shrink-0">
                  {handshakeStatus.latency} {t("icon_ms", "ms")}
                </span>
              )}
            </div>
          )}

          <SidePanelTitleInput
            value={formData.name}
            onChange={val => setFormData({ ...formData, name: val })}
            label={t("ui_game_name", "Game Workspace Name")}
            placeholder={t("ui_game_name", "e.g. The Sims 4")}
            subtitle={formData.schema_id ? `${t("ui_schema_id", "SCHEMA")}: ${formData.schema_id}` : undefined}
          />

          <UniversalGroup
            title={t("spoke_quick_bundle_label", "Quick-Paste Uplink Bundle / Credentials")}
            icon="bolt"
          >
            <UniversalInput
              type="text"
              value={bundleInput}
              onChange={handleParseBundle}
              placeholder={t("spoke_quick_bundle_ph", "Paste a SANCTUARY-UPLINK:// token, JSON bundle, or raw Supabase URL & keys...")}
            />
            <SidePanelPillToggle
              checked={formData.is_active !== false}
              onChange={checked => setFormData({ ...formData, is_active: checked })}
              label={t("filter_active", "Active Schema Engine")}
              icon="dns"
              variant="success"
            />
          </UniversalGroup>

          <UniversalGroup
            title={t("ui_supabase_url", "Spoke Database & Handshake Credentials")}
            icon="dns"
          >
            <UniversalInput
              label={t("ui_schema_id", "Schema ID")}
              type="text"
              value={formData.schema_id}
              onChange={val => setFormData({ ...formData, schema_id: val })}
              placeholder={t("ui_schema_id", "e.g. SIMS4")}
            />
            <UniversalInput
              label={t("ui_supabase_url", "Supabase Project URL")}
              type="text"
              value={formData.supabase_url}
              onChange={val => setFormData({ ...formData, supabase_url: val })}
              placeholder={t("ui_supabase_url", "https://xyz.supabase.co")}
            />
            <UniversalInput
              label={t("ui_supabase_key", "Supabase Anon Key")}
              type="text"
              value={formData.supabase_anon_key}
              onChange={val => setFormData({ ...formData, supabase_anon_key: val })}
              placeholder={t("ui_supabase_key", "ey...")}
            />
            <UniversalInput
              label={t("ui_supabase_service_key", "Supabase Service Key")}
              type="password"
              value={formData.supabase_service_key || ''}
              onChange={val => setFormData({ ...formData, supabase_service_key: val })}
              placeholder={t("ui_supabase_service_key", "secret...")}
            />
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <ActionButton
                variant="glass"
                icon="content_copy"
                label={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
                onClick={handleCopyUplinkBundle}
              />
              <ActionButton
                variant="glass"
                icon={verifyingHandshake ? "sync" : "network_check"}
                label={
                  verifyingHandshake
                    ? t("spoke_verifying_handshake", "Testing Spoke Handshake...")
                    : t("spoke_btn_verify_handshake", "Test Handshake & Verify Schema")
                }
                disabled={verifyingHandshake}
                onClick={handleVerifyHandshake}
              />
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("spoke_founder_label", "Founding Community & Non-Custodial Donations")}
            icon="volunteer_activism"
          >
            <UniversalInput
              label={t("spoke_founder_label", "Founding Community Manager (Username or UUID)")}
              type="text"
              value={formData.founder_identifier}
              onChange={val => setFormData({ ...formData, founder_identifier: val })}
              placeholder={t("spoke_founder_ph", "Optional: Hub username or UUID to auto-promote to Wayfinder")}
            />
            <UniversalInput
              label={t("wf_donation_processor_label", "Community Payment Processor")}
              type="text"
              value={formData.payment_processor}
              onChange={val => setFormData({ ...formData, payment_processor: val })}
              placeholder={t("wf_donation_processor_label", "STRIPE / KO-FI / PATREON / PAYPAL")}
            />
            <UniversalInput
              label={t("wf_donation_url_label", "Donation / Checkout URL (Leave blank to hide from directory)")}
              type="text"
              value={formData.donation_url}
              onChange={val => setFormData({ ...formData, donation_url: val })}
              placeholder={t("wf_donation_url_ph", "https://donate.stripe.com/... or https://ko-fi.com/...")}
            />
          </UniversalGroup>
        </div>
      </SidePanel>

      {activeTab === 'overview' ? renderLanding() : (
          <div className="flex flex-col gap-4">
            {loading ? (
              <div className="p-12 font-black animate-pulse capitalize tracking-widest text-[var(--accent)]">{t("ui_fetching_nodes", "Fetching Nodes...")}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGames.map(renderGameCard)}
                {filteredGames.length === 0 && sidePanelMode === null && (
                  <EmptyState icon="dns" title={t("ui_no_games_registered", "No Active Schema Engines")} className="col-span-full py-16" />
                )}
              </div>
            )}
          </div>
      )}
    </ElevatedHubLayout>
  );
}
