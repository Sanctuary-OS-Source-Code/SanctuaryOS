import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { SidePanel, standardButtonClass, standardSuccessButtonClass, standardAccentGlassButtonClass } from '../shared';
import { useLexicon } from '../LexiconContext';

export default function KeepersActiveGames() {
  const { t } = useLexicon();
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sidePanelMode, setSidePanelMode] = useState<'add' | 'edit' | null>(null);
  const [formData, setFormData] = useState({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", icon: "" });

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
        icon: formData.icon
      }]);
    } else if (sidePanelMode === 'edit') {
      result = await supabase.from('sanctuary_games').update({
        name: formData.name,
        schema_id: formData.schema_id,
        supabase_url: formData.supabase_url,
        supabase_anon_key: formData.supabase_anon_key,
        icon: formData.icon
      }).eq('id', formData.id);
    }

    if (!result?.error) {
      setSidePanelMode(null);
      setFormData({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", icon: "" });
      fetchGames();
    } else {
      alert(`Error saving game: ${result.error.message}`);
    }
  };

  const handleDeleteGame = async (id: string) => {
    if (!window.confirm(t("ui_confirm_deprecate_game") || "Are you sure you want to deprecate this game database?")) return;
    await supabase.from('sanctuary_games').delete().eq('id', id);
    fetchGames();
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    await supabase.from('sanctuary_games').update({ is_active: !currentStatus }).eq('id', id);
    fetchGames();
  };

  const handleSeverFDW = async (schema_id: string) => {
    if (!window.confirm(t("ui_confirm_sever_fdw") || "Are you sure you want to sever the FDW connection? This will break cross-database queries.")) return;
    try {
      await supabase.rpc('sever_fdw', { target_schema: schema_id });
    } catch (e) { }
    alert(t("ui_fdw_severed") || "FDW Connection Severed");
  };

  const filteredGames = games.filter(g => {
    if (filter === 'active') return g.is_active !== false;
    if (filter === 'inactive') return g.is_active === false;
    return true;
  });

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full z-10">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">dns</span>
          </div>
          <span className="truncate">{t("ui_supported_games") || "Supported Game Databases"}</span>
        </h2>

        <div className="flex items-center gap-3 flex-1 justify-end">
          <div className="flex items-center theme-glass-panel rounded-xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] divide-x divide-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner">
            <button onClick={() => setFilter('all')} className={`px-4 h-12 text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'all' ? 'text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>All</button>
            <button onClick={() => setFilter('active')} className={`px-4 h-12 text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'active' ? 'text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>Active</button>
            <button onClick={() => setFilter('inactive')} className={`px-4 h-12 text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'inactive' ? 'text-red-500 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-red-400 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>Inactive</button>
          </div>
          <button
            onClick={() => { setFormData({ id: "", name: "", schema_id: "", supabase_url: "", supabase_anon_key: "", icon: "" }); setSidePanelMode('add'); }}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group"
          >
            <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform duration-500">add</span>
            {t("ui_register_game_db") || "Register New Game DB"}
          </button>
        </div>
      </div>

      <SidePanel
        isOpen={sidePanelMode !== null}
        onClose={() => setSidePanelMode(null)}
        title={sidePanelMode === 'edit' ? "EDIT DATABASE NODE" : (t("ui_register_game_db") || "Register New Game DB")}
        subtitle={sidePanelMode === 'edit' ? "UPDATE CONFIGURATION" : (t("ui_add_network_node") || "ADD NETWORK NODE")}
        icon="dns"
        footer={
          <div className="flex justify-center items-center gap-4 w-full">
            <button type="button" onClick={() => setSidePanelMode(null)} className={standardButtonClass}>
              {t("nav_cancel") || "CANCEL"}
            </button>
            <button onClick={handleSaveGame} className={standardSuccessButtonClass}>
              <span className="material-symbols-outlined">save</span>
              {t("btn_save") || "SAVE DATABASE NODE"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-6 w-full">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-2 block">{t("ui_game_name") || "GAME NAME"}</label>
            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent transition-colors" placeholder="e.g. The Sims 4" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-2 block">{t("ui_schema_id") || "SCHEMA IDENTIFIER"}</label>
            <input type="text" value={formData.schema_id} onChange={e => setFormData({ ...formData, schema_id: e.target.value })} className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent transition-colors" placeholder="e.g. SIMS4" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-2 block">{t("ui_supabase_url") || "SUPABASE URL"}</label>
            <input type="text" value={formData.supabase_url} onChange={e => setFormData({ ...formData, supabase_url: e.target.value })} className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent transition-colors" placeholder="https://xyz.supabase.co" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-2 block">{t("ui_supabase_key") || "ANON KEY"}</label>
            <input type="text" value={formData.supabase_anon_key} onChange={e => setFormData({ ...formData, supabase_anon_key: e.target.value })} className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent transition-colors" placeholder="ey..." />
          </div>
        </div>
      </SidePanel>

      <div className="p-6 overflow-y-auto w-full h-full">
        {loading ? (
          <div className="p-12 font-black animate-pulse uppercase tracking-widest text-[var(--accent)]">{t("ui_fetching_nodes") || "Fetching Network Nodes..."}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGames.map(game => (
              <div key={game.id} onClick={() => { setFormData({ id: game.id, name: game.name || "", schema_id: game.schema_id || "", supabase_url: game.supabase_url || "", supabase_anon_key: game.supabase_anon_key || "", icon: game.icon || "" }); setSidePanelMode('edit'); }} className={`theme-glass-panel rounded-[var(--radius)] flex flex-col group border transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)] hover:-translate-y-1.5 p-6 ${game.is_active === false ? 'opacity-50 grayscale border-white/5' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <button onClick={(e) => { e.stopPropagation(); handleToggleActive(game.id, game.is_active); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:scale-110">
                    <span className="material-symbols-outlined !text-[14px]">{game.is_active === false ? 'toggle_off' : 'toggle_on'}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleSeverFDW(game.schema_id); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-amber-500 hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)] hover:scale-110">
                    <span className="material-symbols-outlined !text-[14px]">link_off</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteGame(game.id); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:scale-110">
                    <span className="material-symbols-outlined !text-[14px]">delete</span>
                  </button>
                </div>

                <div className="flex items-center gap-4 mb-4 mt-2">
                  <div className="w-12 h-12 rounded-full theme-bg-accent/20 flex items-center justify-center border border-[var(--accent)]/30">
                    {game.icon ? <img src={game.icon} alt="" className="w-8 h-8 object-contain" /> : <span className="material-symbols-outlined text-[var(--accent)]">dns</span>}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[var(--headerText)] flex items-center gap-2">
                      {game.name}
                      {game.is_active === false && <span className="text-[9px] font-black uppercase bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full">INACTIVE</span>}
                    </h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{game.schema_id}</p>
                  </div>
                </div>
                <div className="text-[10px] text-[var(--text)] opacity-70 break-all font-mono bg-black/20 p-2 rounded-lg mb-2">
                  {t("ui_url") || "URL"}: {game.supabase_url}
                </div>
                <div className="text-[10px] text-[var(--text)] opacity-70 break-all font-mono bg-black/20 p-2 rounded-lg">
                  {t("ui_key") || "KEY"}: {game.supabase_anon_key?.substring(0, 20)}...
                </div>
              </div>
            ))}
            {filteredGames.length === 0 && sidePanelMode === null && (
              <div className="col-span-full py-16 text-center text-[var(--subtext)] font-black uppercase tracking-widest opacity-50">
                {t("ui_no_games_registered") || "No Game Databases Registered"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
