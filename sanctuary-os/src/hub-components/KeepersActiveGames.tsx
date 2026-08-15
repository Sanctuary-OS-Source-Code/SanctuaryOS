import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { SidePanel, standardButtonClass, standardSuccessButtonClass, standardAccentGlassButtonClass, ActionButton } from '../shared';
import { useLexicon } from '../LexiconContext';
import { logArchitectAction } from '../lib/audit';
import { UniversalCard } from '../components/universal/UniversalCard';

export default function KeepersActiveGames() {
  const { t } = useLexicon();
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sidePanelMode, setSidePanelMode] = useState<'add' | 'edit' | null>(null);
  const [formData, setFormData] = useState({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", supabase_service_key: "", icon: "" });

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
      alert("Please fill all required fields");
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
        icon: formData.icon
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
        icon: formData.icon
      }).eq('id', formData.id);
      if (!result?.error) {
        logArchitectAction(`Updated Game Database: ${formData.name}`, 'sanctuary_games', formData.name, undefined, 'Keeper Hub', true);
      }
    }

    if (!result?.error) {
      setSidePanelMode(null);
      setFormData({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", supabase_service_key: "", icon: "" });
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

  const filteredGames = games.filter(g => {
    if (filter === 'active') return g.is_active !== false;
    if (filter === 'inactive') return g.is_active === false;
    return true;
  });

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full z-10">
        <div className="flex items-center gap-3 flex-1 w-full justify-end">
     <div className="flex items-center glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] divide-x divide-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner">
            <button onClick={() => setFilter('all')} className={`px-4 h-12 text-[10px] font-black capitalize tracking-widest transition-all ${filter === 'all' ? 'text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-md' : 'text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>{t("filter_all")}</button>
            <button onClick={() => setFilter('active')} className={`px-4 h-12 text-[10px] font-black capitalize tracking-widest transition-all ${filter === 'active' ? 'text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-md' : 'text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>{t("filter_active")}</button>
            <button onClick={() => setFilter('inactive')} className={`px-4 h-12 text-[10px] font-black capitalize tracking-widest transition-all ${filter === 'inactive' ? 'text-red-500 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] shadow-md' : 'text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-red-400 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>{t("filter_inactive")}</button>
          </div>
          <ActionButton
            onClick={() => { setFormData({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", supabase_service_key: "", icon: "" }); setSidePanelMode('add'); }}
            className="shrink-0 h-12 px-6 font-black capitalize tracking-widest text-[10px]"
            icon="add"
            label={t("ui_register_game_db")}
          />
        </div>
      </div>

      <SidePanel
        isOpen={sidePanelMode !== null}
        onClose={() => setSidePanelMode(null)}
        title={sidePanelMode === 'edit' ? "EDIT DATABASE NODE" : (t("ui_register_game_db"))}
        subtitle={sidePanelMode === 'edit' ? "UPDATE CONFIGURATION" : (t("ui_add_network_node"))}
        icon="dns"
        footer={
          <div className="flex justify-center items-center gap-4 w-full">
            <ActionButton type="button" onClick={() => setSidePanelMode(null)} label={t("nav_cancel")}>
              
            </ActionButton>
            <ActionButton onClick={handleSaveGame} label={t("btn_save")} icon="save">
              
              
            </ActionButton>
          </div>
        }
      >
        <div className="flex flex-col gap-6 w-full">
          <div>
            <label className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] mb-2 block">{t("ui_game_name")}</label>
            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent transition-colors" placeholder="e.g. The Sims 4" />
          </div>
          <div>
            <label className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] mb-2 block">{t("ui_schema_id")}</label>
            <input type="text" value={formData.schema_id} onChange={e => setFormData({ ...formData, schema_id: e.target.value })} className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent transition-colors" placeholder="e.g. SIMS4" />
          </div>
          <div>
            <label className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] mb-2 block">{t("ui_supabase_url")}</label>
            <input type="text" value={formData.supabase_url} onChange={e => setFormData({ ...formData, supabase_url: e.target.value })} className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent transition-colors" placeholder="https://xyz.supabase.co" />
          </div>
          <div>
            <label className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] mb-2 block">{t("ui_supabase_key")}</label>
            <input type="text" value={formData.supabase_anon_key} onChange={e => setFormData({ ...formData, supabase_anon_key: e.target.value })} className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent transition-colors" placeholder="ey..." />
          </div>
          <div>
            <label className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] mb-2 block">{t("ui_supabase_service_key")}</label>
            <input type="password" value={formData.supabase_service_key || ''} onChange={e => setFormData({ ...formData, supabase_service_key: e.target.value })} className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent transition-colors" placeholder="secret..." />
          </div>
        </div>
      </SidePanel>

      <div className="p-6 overflow-y-auto w-full h-full">
        {loading ? (
          <div className="p-12 font-black animate-pulse capitalize tracking-widest text-[var(--accent)]">{t("ui_fetching_nodes")}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGames.map(game => (
              <UniversalCard
                key={game.id}
                onClick={() => { setFormData({ id: game.id, name: game.name || "", schema_id: game.schema_id || "", supabase_url: game.supabase_url || "", supabase_anon_key: game.supabase_anon_key || "", supabase_service_key: game.supabase_service_key || "", icon: game.icon || "" }); setSidePanelMode('edit'); }}
                layout="vertical"
                isGhosted={game.is_active === false}
                image={game.icon || undefined}
                icon={game.icon ? undefined : "dns"}
                title={
                  <span className="flex items-center gap-2">
                    {game.name}
                    {game.is_active === false && <span className="text-[9px] font-black capitalize bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-500 px-2 py-0.5 rounded-full">{t("filter_inactive")}</span>}
                  </span>
                }
                subtitle={game.schema_id}
                actions={
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleToggleActive(game.id, game.name, game.is_active); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:scale-110">
                      <span className="material-symbols-outlined !text-[14px]">{game.is_active === false ? 'toggle_off' : 'toggle_on'}</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleSeverFDW(game.schema_id, game.name); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-amber-500 hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)] hover:scale-110">
                      <span className="material-symbols-outlined !text-[14px]">link_off</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteGame(game.id, game.name); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:scale-110">
                      <span className="material-symbols-outlined !text-[14px]">delete</span>
                    </button>
                  </div>
                }
              >
                <div className="flex flex-col gap-2 mt-4">
                  <div className="text-[10px] text-[var(--text)] opacity-70 break-all font-mono bg-black/20 p-2 rounded-lg">
                    {t("ui_url")}: {game.supabase_url}
                  </div>
                  <div className="text-[10px] text-[var(--text)] opacity-70 break-all font-mono bg-black/20 p-2 rounded-lg">
                    {t("ui_key")}: {game.supabase_anon_key?.substring(0, 20)}...
                  </div>
                </div>
              </UniversalCard>
            ))}
            {filteredGames.length === 0 && sidePanelMode === null && (
              <div className="col-span-full py-16 text-center text-[var(--subtext)] font-black capitalize tracking-widest opacity-50">
                {t("ui_no_games_registered")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


