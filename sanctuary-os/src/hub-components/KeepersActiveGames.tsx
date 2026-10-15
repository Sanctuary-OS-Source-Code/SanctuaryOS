import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { SidePanel, ActionButton, EmptyState, PanelHeaderGroup, PanelHeaderButton } from '../shared';
import { useLexicon } from '../LexiconContext';
import { logArchitectAction } from '../lib/audit';
import { UniversalCard } from '../components/universal/UniversalCard';
import { UniversalGroup, UniversalInput } from '../components/universal/UniversalLayout';
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput, SidePanelPillToggle } from '../components/layouts/ElevatedHubLayout';

export default function KeepersActiveGames() {
  const { t } = useLexicon();
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [filter, setFilter] = useState<'overview' | 'all' | 'active' | 'inactive' | 'urgent'>('overview');
  const [sidePanelMode, setSidePanelMode] = useState<'add' | 'edit' | null>(null);
  const [formData, setFormData] = useState({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", supabase_service_key: "", icon: "", is_active: true });

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('sanctuary_games').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setGames(data);
    }
    setLoading(false);
  };

  const handleSaveGame = async () => {
    if (!formData.name || !formData.schema_id || !formData.supabase_url || !formData.supabase_anon_key) {
      alert(t("fill_required_fields") || "Please fill all required fields");
      return;
    }

    let result;
    if (sidePanelMode === 'add') {
      result = await supabase.from('sanctuary_games').insert([{
        name: formData.name,
        schema_id: formData.schema_id,
        supabase_url: formData.supabase_url,
        supabase_anon_key: formData.supabase_anon_key,
        supabase_service_key: formData.supabase_service_key,
        icon: formData.icon,
        is_active: formData.is_active
      }]);
      if (!result?.error) {
        logArchitectAction(`Registered Game Database: ${formData.name}`, 'sanctuary_games', formData.name, undefined, 'Keeper Hub', true);
      }
    } else if (sidePanelMode === 'edit') {
      result = await supabase.from('sanctuary_games').update({
        name: formData.name,
        schema_id: formData.schema_id,
        supabase_url: formData.supabase_url,
        supabase_anon_key: formData.supabase_anon_key,
        supabase_service_key: formData.supabase_service_key,
        icon: formData.icon,
        is_active: formData.is_active
      }).eq('id', formData.id);
      if (!result?.error) {
        logArchitectAction(`Updated Game Database: ${formData.name}`, 'sanctuary_games', formData.name, undefined, 'Keeper Hub', true);
      }
    }

    if (!result?.error) {
      setSidePanelMode(null);
      setFormData({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", supabase_service_key: "", icon: "", is_active: true });
      fetchGames();
    } else {
      alert(`Error saving game: ${result.error.message}`);
    }
  };

  const handleDeleteGame = async (id: string, name: string) => {
    if (!window.confirm(t("ui_confirm_deprecate_game"))) return;
    const { error } = await supabase.from('sanctuary_games').delete().eq('id', id);
    if (!error) {
      logArchitectAction(`Deprecated Game Database`, 'sanctuary_games', name, undefined, 'Keeper Hub', true);
    }
    fetchGames();
  };

  const handleToggleActive = async (id: string, name: string, currentStatus: boolean) => {
    const { error } = await supabase.from('sanctuary_games').update({ is_active: !currentStatus }).eq('id', id);
    if (!error) {
      logArchitectAction(`${!currentStatus ? 'Activated' : 'Deactivated'} Game Database`, 'sanctuary_games', name, undefined, 'Keeper Hub', true);
    }
    fetchGames();
  };

  const handleSeverFDW = async (schema_id: string, name: string) => {
    if (!window.confirm(t("ui_confirm_sever_fdw"))) return;
    try {
      await supabase.rpc('sever_fdw', { target_schema: schema_id });
      logArchitectAction(`Severed FDW Connection`, 'sanctuary_games', name, undefined, 'Keeper Hub', true);
    } catch (e) { }
    alert(t("ui_fdw_severed"));
  };

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: games.length.toString(),
    },
    {
      id: "active",
      label: t("filter_active") || "Active",
      icon: "toggle_on",
      number: games.filter(g => g.is_active !== false).length.toString(),
    },
    {
      id: "inactive",
      label: t("filter_inactive") || "Inactive",
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
        onClick={() => { setFormData({ id: game.id, name: game.name || "", schema_id: game.schema_id || "", supabase_url: game.supabase_url || "", supabase_anon_key: game.supabase_anon_key || "", supabase_service_key: game.supabase_service_key || "", icon: game.icon || "", is_active: game.is_active !== false }); setSidePanelMode('edit'); }}
        layout="vertical"
        isGhosted={game.is_active === false}
        image={game.icon || undefined}
        icon={game.icon ? undefined : "dns"}
        title={
          <span className="flex items-center gap-2">
            {game.name}
            {game.is_active === false && <span className="text-[9px] font-black capitalize bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)] px-2 py-0.5 rounded-full">{t("filter_inactive")}</span>}
          </span>
        }
        subtitle={game.schema_id}
        actions={
          <div className="flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); handleToggleActive(game.id, game.name, game.is_active); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:scale-110 group"><span className="material-symbols-outlined !text-[14px]">{game.is_active === false ? 'toggle_off' : 'toggle_on'}</span></button>
            <button onClick={(e) => { e.stopPropagation(); handleSeverFDW(game.schema_id, game.name); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)] hover:scale-110 group"><span className="material-symbols-outlined !text-[14px]">link_off</span></button>
            <button onClick={(e) => { e.stopPropagation(); handleDeleteGame(game.id, game.name); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:scale-110 group"><span className="material-symbols-outlined !text-[14px]">delete</span></button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 mt-4">
          <div className="text-[10px] text-[var(--text)] opacity-70 break-all font-mono bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-2 rounded-lg">
            {t("ui_url")}: {game.supabase_url}
          </div>
          <div className="text-[10px] text-[var(--text)] opacity-70 break-all font-mono bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-2 rounded-lg">
            {t("ui_key")}: {game.supabase_anon_key?.substring(0, 20)}...
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
          title={t("recent_active_games") || "Active Schema Engines"}
          isEmpty={activeGames.length === 0}
          emptyIcon="dns"
          emptyTitle={t("ui_no_games_registered") || "No Active Schema Engines"}
        >
          {activeGames.slice(0, 4).map(renderGameCard)}
        </HubOverviewSection>

        <HubOverviewSection
          icon="toggle_off"
          iconColorClass="text-[var(--warning)]"
          title={t("recent_inactive_games") || "Pending / Draft Engines"}
          isEmpty={inactiveGames.length === 0}
          emptyIcon="check_circle"
          emptyTitle={t("no_inactive_games") || "No Pending / Draft Engines"}
        >
          {inactiveGames.slice(0, 4).map(renderGameCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const activeTab = filter === 'all' ? 'overview' : filter;

  return (
    <ElevatedHubLayout
      headerTitle={t("ui_active_games") || "Game Databases"}
      headerSubtitle={t("ui_active_games_subtitle") || "Manage Sanctuary game databases and FDW connections."}
      headerIcon="dns"
      headerIconColorClass="text-[var(--accent)]"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("search_ph") as string}
      hideSearch={activeTab === 'overview'}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(v) => setFilter(v as any)}
      actions={
        activeTab !== 'overview' ? [
          {
            id: "add",
            icon: "add",
            label: t("ui_register_game_db") || "Register Game Database",
            onClick: () => {
              setFormData({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", supabase_service_key: "", icon: "", is_active: true });
              setSidePanelMode('add');
            }
          }
        ] : undefined
      }
    >
      <SidePanel
        isOpen={sidePanelMode !== null}
        onClose={() => setSidePanelMode(null)}
        title={sidePanelMode === 'edit' ? (t("edit_db_node") || "EDIT DATABASE NODE") : (t("ui_register_game_db"))}
        subtitle={sidePanelMode === 'edit' ? (t("update_config") || "UPDATE CONFIGURATION") : (t("ui_add_network_node"))}
        icon="dns"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton icon="save" variant="accent" tooltip={t("btn_save")} onClick={handleSaveGame} />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-6 w-full">
          <SidePanelTitleInput
            value={formData.name}
            onChange={val => setFormData({ ...formData, name: val })}
            placeholder={t("ui_game_name") || "e.g. The Sims 4"}
          />

          <SidePanelPillToggle
            checked={formData.is_active !== false}
            onChange={checked => setFormData({ ...formData, is_active: checked })}
            label={t("filter_active") || "Active Schema Engine"}
            icon="dns"
            variant="success"
          />

          <UniversalGroup label={t("ui_schema_id") || "Schema ID"}>
            <UniversalInput type="text" value={formData.schema_id} onChange={val => setFormData({ ...formData, schema_id: val })} placeholder="e.g. SIMS4" />
          </UniversalGroup>
          <UniversalGroup label={t("ui_supabase_url") || "Supabase Project URL"}>
            <UniversalInput type="text" value={formData.supabase_url} onChange={val => setFormData({ ...formData, supabase_url: val })} placeholder="https://xyz.supabase.co" />
          </UniversalGroup>
          <UniversalGroup label={t("ui_supabase_key") || "Supabase Anon Key"}>
            <UniversalInput type="text" value={formData.supabase_anon_key} onChange={val => setFormData({ ...formData, supabase_anon_key: val })} placeholder="ey..." />
          </UniversalGroup>
          <UniversalGroup label={t("ui_supabase_service_key") || "Supabase Service Key"}>
            <UniversalInput type="password" value={formData.supabase_service_key || ''} onChange={val => setFormData({ ...formData, supabase_service_key: val })} placeholder="secret..." />
          </UniversalGroup>
        </div>
      </SidePanel>

      {activeTab === 'overview' ? renderLanding() : (
          <div className="flex flex-col gap-4">
            {loading ? (
              <div className="p-12 font-black animate-pulse capitalize tracking-widest text-[var(--accent)]">{t("ui_fetching_nodes")}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGames.map(renderGameCard)}
                {filteredGames.length === 0 && sidePanelMode === null && (
                  <EmptyState icon="dns" title={t("ui_no_games_registered")} className="col-span-full py-16" />
                )}
              </div>
            )}
          </div>
      )}
    </ElevatedHubLayout>
  );
}



