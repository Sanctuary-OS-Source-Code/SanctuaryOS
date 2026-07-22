import React, { useState, useEffect } from 'react';
import { useStore } from './store';
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { CartographerSetup } from './CartographerSetup';
import { supabase } from './supabase';

export function WorkspaceLanding({ onClose }: { onClose?: () => void }) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const workspaces = useStore((state) => state.workspaces);
  const setActiveWorkspaceId = useStore((state) => state.setActiveWorkspaceId);
  const setIsConfigured = useStore((state) => state.setIsConfigured);

  const [selectedGameConfig, setSelectedGameConfig] = useState<any>(null);
  const [globalGames, setGlobalGames] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchGames = async () => {
      const { data } = await supabase.from('sanctuary_games').select('*').order('name');
      if (data) setGlobalGames(data);
    };
    fetchGames();
  }, []);

  const selectWorkspace = async (workspace: any) => {
    try {
      const globalConfig: any = await invoke("get_global_config");
      globalConfig.active_workspace_id = workspace.id;
      await invoke("save_coordinates", { config: globalConfig });
      setActiveWorkspaceId(workspace.id);
      setIsConfigured(true);
      if (onClose) {
        onClose();
      }
      setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      console.error(err);
    }
  };

  const activeGames = globalGames.filter((g: any) => g.is_active !== false);

  const cards: any[] = [];
  activeGames.forEach((game: any) => {
    const gameWorkspaces = workspaces.filter((ws: any) => ws.schema_id === game.schema_id);
    if (gameWorkspaces.length > 0) {
      gameWorkspaces.forEach((ws: any) => {
        cards.push({ type: 'workspace', workspace: ws, game });
      });
    } else {
      cards.push({ type: 'unconfigured', game });
    }
  });

  const filteredCards = cards.filter((c: any) => {
    const search = searchQuery.toLowerCase();
    if (c.type === 'workspace') {
      return (c.workspace.name || c.workspace.id).toLowerCase().includes(search) ||
        (c.game.name || '').toLowerCase().includes(search) ||
        (c.workspace.schema_id || '').toLowerCase().includes(search);
    }
    return (c.game.name || '').toLowerCase().includes(search) ||
      (c.game.schema_id || '').toLowerCase().includes(search);
  });

  if (selectedGameConfig) {
    return (
      <div className="relative w-full h-full">
        <button
          onClick={() => setSelectedGameConfig(null)}
          className="absolute top-8 left-8 z-50 px-6 py-3 theme-glass-inner text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:text-white hover:bg-[var(--accent)] transition-all rounded-lg shadow-lg"
        >
          {t("nav_cancel") || "CANCEL"}
        </button>
        <CartographerSetup preselectedGame={selectedGameConfig} onCancel={() => setSelectedGameConfig(null)} />
      </div>
    );
  }



  return (
    <div className={`flex h-screen w-screen items-center justify-center font-sans relative overflow-hidden transition-colors duration-1000 ${onClose ? 'bg-black/80 backdrop-blur-sm' : ''}`} style={{ background: onClose ? undefined : '#050505', color: 'var(--text)' }}>
      {!onClose && <div className="absolute inset-0 z-0 bg-[url('/bg_workspace.png')] bg-cover bg-center bg-no-repeat opacity-40 mix-blend-screen transition-opacity duration-1000 animate-in fade-in" />}
      {!onClose && <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-black/10 to-black/80 pointer-events-none" />}

      <div className="relative z-10 w-[95%] max-w-6xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] shadow-[0_40px_100px_rgba(0,0,0,0.5)] flex flex-col p-8 lg:p-12 overflow-hidden max-h-[90vh]">

        {onClose && (
          <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 rounded-full theme-glass-inner flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 transition-all border border-transparent hover:border-red-500/30 z-50">
            <span className="material-symbols-outlined">close</span>
          </button>
        )}

        <div className="flex flex-col items-center text-center mb-10 relative z-20">
          <div className="w-16 h-16 mb-4 relative flex items-center justify-center group">
            <div className="absolute inset-0 theme-bg-accent opacity-20 blur-xl rounded-full transition-all duration-700 group-hover:opacity-40 group-hover:blur-2xl" />
            <img src="/icon.png" alt="" className="w-12 h-12 object-contain relative z-10 drop-shadow-[0_2px_10px_rgba(0,0,0,0.2)] transition-transform duration-500 group-hover:scale-110" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-widest text-[var(--headerText)] drop-shadow-md">
            {t("workspace_select_title") || "Select Workspace"}
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] theme-text-accent opacity-80 mt-3 transition-colors duration-500">
            {t("workspace_select_subtitle") || "Initialize Your Sanctuary Environment"}
          </p>
        </div>

        <div className="flex justify-center mb-8 relative z-20">
          <div className="relative w-full max-w-md group">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[var(--subtext)] opacity-50 transition-opacity group-focus-within:opacity-100 group-focus-within:text-[var(--accent)]">search</span>
            <input
              type="text"
              placeholder="Filter Environments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/20 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full py-3.5 pl-14 pr-6 text-[11px] font-black uppercase tracking-widest text-[var(--text)] outline-none focus:border-[var(--accent)] focus:bg-black/40 transition-all shadow-inner focus:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-20 overflow-y-auto custom-scrollbar p-6 -mx-6 px-6 pb-12">
          {filteredCards.map((card: any, idx: number) => {
            if (card.type === 'workspace') {
              const ws = card.workspace;
              const game = card.game;
              return (
                <button
                  key={`${ws.id}-${idx}`}
                  onClick={() => selectWorkspace(ws)}
                  className="theme-glass-panel backdrop-blur-2xl border border-white/10 rounded-[1.5rem] flex flex-col hover:border-white/30 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:-translate-y-1 active:translate-y-0 transition-all duration-500 group text-left relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                  <div className="p-8 flex flex-col gap-6 relative z-10 w-full h-full">
                    <div className="flex items-start justify-between w-full">
                      <div className="w-14 h-14 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10 group-hover:bg-white/10 group-hover:border-white/20 transition-all duration-500 shadow-inner">
                        {game.icon ? <img src={game.icon} alt="" className="w-8 h-8 object-contain opacity-80 group-hover:opacity-100 transition-opacity duration-500" /> : <span className="material-symbols-outlined text-white/70 group-hover:text-white !text-[28px] transition-colors duration-500">sports_esports</span>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full bg-white/5 text-[var(--text)] border border-white/10 shadow-inner group-hover:bg-white/10 transition-colors duration-500">Configured</span>
                        <span className="text-[10px] font-bold text-[var(--text)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 uppercase tracking-widest flex items-center gap-1">Connect <span className="material-symbols-outlined !text-[12px]">arrow_forward</span></span>
                      </div>
                    </div>
                    <div className="mt-auto">
                      <h3 className="text-2xl font-black text-[var(--text)] group-hover:text-white transition-colors duration-500 tracking-tight leading-tight">{game.name || ws.name || ws.id}</h3>
                      <div className="flex items-center gap-2 mt-3 text-[var(--subtext)] opacity-60 group-hover:opacity-100 transition-opacity duration-500">
                        <span className="material-symbols-outlined !text-[12px]">folder</span>
                        <p className="text-[9px] font-bold uppercase tracking-widest truncate">{ws.live_path}</p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            } else {
              const game = card.game;
              return (
                <button
                  key={`${game.id}-${idx}`}
                  onClick={() => setSelectedGameConfig(game)}
                  className="theme-glass-panel backdrop-blur-md border border-white/5 border-dashed rounded-[1.5rem] flex flex-col hover:border-white/20 hover:border-solid hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:-translate-y-1 active:translate-y-0 transition-all duration-500 group text-left relative overflow-hidden opacity-80 hover:opacity-100"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="p-8 flex flex-col gap-6 relative z-10 w-full h-full">
                    <div className="flex items-start justify-between w-full">
                      <div className="w-14 h-14 rounded-2xl bg-black/20 flex items-center justify-center border border-white/5 group-hover:border-white/10 group-hover:bg-black/40 transition-all duration-500 shadow-inner">
                        {game.icon ? <img src={game.icon} alt="" className="w-8 h-8 object-contain grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-80 transition-all duration-500" /> : <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-80 group-hover:text-white !text-[28px] transition-colors duration-500">sports_esports</span>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full bg-black/20 text-[var(--subtext)] border border-white/5 shadow-inner transition-colors duration-500">Unconfigured</span>
                      </div>
                    </div>
                    <div className="mt-auto">
                      <h3 className="text-xl font-black text-[var(--subtext)] group-hover:text-[var(--text)] transition-colors duration-500 tracking-tight leading-tight">{game.name}</h3>
                      <div className="flex items-center gap-2 mt-3 text-[var(--text)] opacity-0 group-hover:opacity-80 transition-opacity duration-500">
                        <span className="material-symbols-outlined !text-[12px]">add</span>
                        <p className="text-[9px] font-bold uppercase tracking-widest">{t("ui_add_network_node") || "PROVISION NODE"}</p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            }
          })}

          {filteredCards.length === 0 && (
            <div className="col-span-full py-16 flex flex-col items-center justify-center text-center opacity-50">
              <span className="material-symbols-outlined !text-[48px] mb-4 text-[var(--subtext)]">search_off</span>
              <p className="font-black uppercase tracking-[0.2em] text-[12px] text-[var(--subtext)]">{t("no_matches") || "No environments found"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
