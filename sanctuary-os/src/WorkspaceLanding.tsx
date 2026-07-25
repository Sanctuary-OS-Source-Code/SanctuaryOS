import React, { useState, useEffect } from 'react';
import { useStore } from './store';
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { CartographerSetup } from './CartographerSetup';
import { supabase } from './supabase';
import { EmptyState, FilterTabs, FilterTabButton } from './shared';

export function WorkspaceLanding({ onClose, isModal }: { onClose?: () => void, isModal?: boolean }) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const workspaces = useStore((state) => state.workspaces);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const setActiveWorkspaceId = useStore((state) => state.setActiveWorkspaceId);
  const setIsConfigured = useStore((state) => state.setIsConfigured);

  const [selectedGameConfig, setSelectedGameConfig] = useState<any>(null);
  const [globalGames, setGlobalGames] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<'configured' | 'unconfigured'>('configured');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [isSelecting, setIsSelecting] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storedPins = localStorage.getItem('sanctuary_pinned_workspaces');
      if (storedPins) {
        setPinnedIds(JSON.parse(storedPins));
      }
    } catch (e) { }
  }, []);

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let newPins = [...pinnedIds];
    if (newPins.includes(id)) {
      newPins = newPins.filter(p => p !== id);
    } else {
      newPins.push(id);
    }
    setPinnedIds(newPins);
    localStorage.setItem('sanctuary_pinned_workspaces', JSON.stringify(newPins));
  };

  useEffect(() => {
    const fetchGames = async () => {
      const { data } = await supabase.from('sanctuary_games').select('*').order('name');
      if (data) setGlobalGames(data);
    };
    fetchGames();
  }, []);

  const selectWorkspace = async (workspace: any) => {
    try {
      setIsSelecting(workspace.id);
      const globalConfig: any = await invoke("get_global_config");
      globalConfig.active_workspace_id = workspace.id;
      await invoke("save_coordinates", { config: globalConfig });
      localStorage.setItem('sanctuary_last_active_workspace', workspace.id);
      if (onClose) {
        onClose();
      }
      setTimeout(() => window.location.reload(), 10);
    } catch (err) {
      console.error(err);
      setIsSelecting(null);
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
    if (filterTab === 'configured' && c.type !== 'workspace') return false;
    if (filterTab === 'unconfigured' && c.type !== 'unconfigured') return false;

    const search = searchQuery.toLowerCase();
    if (c.type === 'workspace') {
      return (c.workspace.name || c.workspace.id).toLowerCase().includes(search) ||
        (c.game.name || '').toLowerCase().includes(search) ||
        (c.workspace.schema_id || '').toLowerCase().includes(search);
    }
    return (c.game.name || '').toLowerCase().includes(search) ||
      (c.game.schema_id || '').toLowerCase().includes(search);
  });

  if (filterTab === 'configured') {
    filteredCards.sort((a, b) => {
      const aPinned = pinnedIds.includes(a.workspace.id);
      const bPinned = pinnedIds.includes(b.workspace.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const aActive = a.workspace.id === activeWorkspaceId;
      const bActive = b.workspace.id === activeWorkspaceId;
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      const aName = a.workspace.name || a.workspace.id;
      const bName = b.workspace.name || b.workspace.id;
      return aName.localeCompare(bName);
    });
  }

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

  const isTransparent = onClose || isModal;

  return (
    <div className={`flex h-screen w-screen absolute inset-0 z-[999999] items-center justify-center font-sans overflow-hidden transition-colors duration-1000 ${isTransparent ? 'backdrop-blur-2xl' : ''}`} style={{ background: isTransparent ? undefined : 'var(--bgGradient)', backgroundColor: isTransparent ? `color-mix(in srgb, var(--bg) 40%, transparent)` : undefined, color: 'var(--text)' }}>
      {!isTransparent && <div className="absolute inset-0 z-0 bg-[url('/bg_workspace.png')] bg-cover bg-center bg-no-repeat opacity-40 transition-opacity duration-1000 animate-in fade-in mix-blend-overlay pointer-events-none" />}
      {!isTransparent && <div className="absolute inset-0 z-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] via-transparent to-[color-mix(in_srgb,var(--accent)_5%,transparent)] pointer-events-none" />}

      <div className="relative z-10 w-[95%] max-w-5xl theme-glass-panel bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] rounded-[var(--radius)] shadow-[0_40px_100px_color-mix(in_srgb,var(--accent)_15%,transparent),inset_0_1px_2px_color-mix(in_srgb,var(--accent)_20%,transparent)] flex flex-col overflow-hidden max-h-[90vh]">
        {onClose && (
          <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 rounded-full theme-glass-inner flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-[var(--danger)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] z-50">
            <span className="material-symbols-outlined">close</span>
          </button>
        )}

        <div className="p-10 pb-6 shrink-0 border-b border-[color-mix(in_srgb,var(--accent)_15%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] relative overflow-hidden group">
          <div className="flex flex-col items-center justify-center relative z-20 min-h-[100px]">
            {/* Centered Logo */}
            <div className="relative mb-6 w-20 h-20 flex items-center justify-center">
              <img
                src="/icon.png"
                alt="Logo"
                className="w-full h-full object-contain opacity-[0.25] hover:opacity-[0.8] hover:scale-110 hover:rotate-12 transition-all duration-700 cursor-pointer"
              />
            </div>
            {/* The Page Title */}
            <div className="flex flex-col text-center relative z-10">
              <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-widest text-[var(--headerText)] drop-shadow-md leading-none">
                {t("workspace_select_title") || "Select Sector"}
              </h1>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] theme-text-accent opacity-80 mt-4 transition-colors duration-500">
                {t("workspace_select_subtitle") || "Initialize Connection"}
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mt-10 relative z-20">
            <FilterTabs className="w-full md:w-auto">
              <FilterTabButton
                id="configured"
                label={t("workspace_configured") || "Configured Workspaces"}
                activeTab={filterTab}
                setTab={setFilterTab}
              />
              <FilterTabButton
                id="unconfigured"
                label={t("workspace_unconfigured") || "Unconfigured Workspaces"}
                activeTab={filterTab}
                setTab={setFilterTab}
              />
            </FilterTabs>

            <div className="relative w-full max-w-[300px] group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-[var(--subtext)] opacity-50 transition-opacity group-focus-within:opacity-100 group-focus-within:text-[var(--accent)] text-sm">search</span>
              <input
                type="text"
                placeholder={t("workspace_search") || "Filter Environments..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full h-11 pl-10 pr-6 text-[11px] font-black uppercase tracking-widest text-[var(--text)] outline-none focus:border-[color-mix(in_srgb,var(--text)_30%,transparent)] focus:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all shadow-inner"
              />
            </div>
          </div>
        </div>

        <div className="p-10 overflow-y-auto custom-scrollbar relative z-20 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCards.map((card: any, idx: number) => {
              if (card.type === 'workspace') {
                const ws = card.workspace;
                const game = card.game;
                const isActive = ws.id === activeWorkspaceId;
                const isPinned = pinnedIds.includes(ws.id);

                return (
                  <button
                    key={`ws-${ws.id}-${idx}`}
                    onClick={() => selectWorkspace(ws)}
                    className={`flex flex-col justify-between p-6 rounded-[var(--radius)] theme-glass-panel border group transition-all duration-500 relative overflow-hidden min-h-[160px] text-left hover:-translate-y-1.5 ${isActive ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)]'}`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br from-[var(--accent)]/20 to-transparent transition-opacity duration-700 pointer-events-none ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />

                    <div className="flex justify-between items-start w-full relative z-10 mb-4">
                      <div className="flex items-start gap-4 w-full pr-8">
                        <div className={`w-12 h-12 rounded-2xl theme-glass-inner border shadow-[inset_0_0_20px_color-mix(in_srgb,var(--text)_5%,transparent),0_0_15px_color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500 ${isActive ? 'border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                          {game.icon ? <img src={game.icon} alt="" className="w-8 h-8 object-contain drop-shadow-md" /> : <span className="material-symbols-outlined !text-[24px] theme-text-accent drop-shadow-md">sports_esports</span>}
                        </div>
                        <div className="flex flex-col pt-1 min-w-0 flex-1">
                          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1 truncate">{isActive ? t("workspace_manage") || 'Active Workspace' : t("workspace_available") || "Configured Workspace"}</span>
                          <span className="text-[14px] font-black uppercase tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors line-clamp-2 drop-shadow-sm leading-tight">{game.name || ws.name || ws.id}</span>
                        </div>
                      </div>

                      <div
                        onClick={(e) => togglePin(ws.id, e)}
                        className={`absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors border border-transparent ${isPinned ? 'theme-text-accent bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}
                      >
                        <span className="material-symbols-outlined !text-[16px]" style={{ fontVariationSettings: isPinned ? '"FILL" 1' : '"FILL" 0' }}>keep</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                      <div className="flex flex-col min-w-0 flex-1 pr-2">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("status")}</span>
                        {isSelecting === ws.id ? (
                          <span className="text-[10px] font-bold text-[var(--accent)] opacity-90 mt-1 flex items-center gap-1 truncate animate-pulse">
                            <span className="material-symbols-outlined !text-[12px] shrink-0 animate-spin">sync</span>
                            <span className="truncate">{t("status_establishing_connection") || "Establishing Connection..."}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-[var(--success)] opacity-90 mt-1 flex items-center gap-1 truncate">
                            <span className="material-symbols-outlined !text-[12px] shrink-0">check_circle</span>
                            <span className="truncate">{t("workspace_configured")}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              } else {
                const game = card.game;
                return (
                  <button
                    key={`game-${game.id}-${idx}`}
                    onClick={() => setSelectedGameConfig(game)}
                    className="flex flex-col justify-between p-6 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] border-dashed group hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:border-solid hover:shadow-[0_0_40px_color-mix(in_srgb,var(--text)_5%,transparent)] transition-all duration-500 relative overflow-hidden min-h-[160px] text-left hover:-translate-y-1.5 opacity-70 hover:opacity-100"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_5%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                    <div className="flex justify-between items-start w-full relative z-10 mb-4">
                      <div className="flex items-start gap-4 w-full">
                        <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
                          {game.icon ? <img src={game.icon} alt="" className="w-8 h-8 object-contain grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-80 transition-all duration-500" /> : <span className="material-symbols-outlined !text-[24px] text-[var(--subtext)] opacity-50 group-hover:opacity-100 group-hover:text-white transition-colors">sports_esports</span>}
                        </div>
                        <div className="flex flex-col pt-1 min-w-0 flex-1">
                          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-40 mb-1 truncate">{t("workspace_unconfigured")}</span>
                          <span className="text-[14px] font-black uppercase tracking-widest text-[var(--subtext)] group-hover:text-[var(--text)] transition-colors line-clamp-2 drop-shadow-sm leading-tight">{game.name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                      <div className="flex flex-col min-w-0 flex-1 pr-2">
                        <span className="text-[10px] font-bold text-[var(--text)] opacity-0 group-hover:opacity-80 transition-opacity duration-500 flex items-center gap-1 uppercase tracking-widest">
                          <span className="material-symbols-outlined !text-[12px]">add</span>
                          <span>{t("ui_add_network_node") || "Provision Node"}</span>
                        </span>
                      </div>
                    </div>
                  </button>
                );
              }
            })}

            {filteredCards.length === 0 && (
              <EmptyState icon={t("icon_search") || "search_off"} title={t("no_matches") || "No environments found"} className="col-span-full py-16" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
