import React, { useState, useEffect } from 'react';
import { useStore } from './store';
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { CartographerSetup } from './CartographerSetup';
import { supabase } from './supabase';
import { EmptyState, FilterTabs, FilterTabButton } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';

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
          className="absolute top-8 left-8 z-50 px-6 py-3 glass-surface text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:text-white hover:bg-[var(--accent)] transition-all rounded-lg shadow-lg"
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

      <div className="relative z-10 w-[95%] max-w-5xl glass-panel bg-[var(--accent)]/[5%] border border-[var(--accent)]/[20%] rounded-[var(--radius)] shadow-md flex flex-col overflow-hidden max-h-[90vh]">
        {onClose && (
          <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 rounded-full glass-surface flex items-center justify-center hover:bg-red-500/[20%] hover:text-[var(--danger)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-red-500/[30%] z-50">
            <span className="material-symbols-outlined">close</span>
          </button>
        )}

        <div className="p-10 pb-6 shrink-0 border-b border-[var(--accent)]/[15%] bg-[var(--accent)]/[8%] relative overflow-hidden group">
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

                const customIcon = game.icon ? (
                  <img src={game.icon} alt="" className="w-24 h-24 object-contain drop-shadow-lg opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                ) : (
                  <span className="material-symbols-outlined !text-[48px] theme-text-accent drop-shadow-md opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">sports_esports</span>
                );

                const actions = (
                  <div
                    onClick={(e) => togglePin(ws.id, e)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors border border-transparent ${isPinned ? 'theme-text-accent bg-[var(--accent)]/[15%] border-[var(--accent)]/[30%]' : 'text-[var(--subtext)] opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}
                  >
                    <span className="material-symbols-outlined !text-[16px]" style={{ fontVariationSettings: isPinned ? '"FILL" 1' : '"FILL" 0' }}>keep</span>
                  </div>
                );

                const footer = (
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
                );

                return (
                  <UniversalCard
                    key={`ws-${ws.id}-${idx}`}
                    layout="vertical"
                    isActive={isActive}
                    onClick={() => selectWorkspace(ws)}
                    title={game.name || ws.name || ws.id}
                    subtitle={isActive ? t("workspace_manage") || 'Active Workspace' : t("workspace_available") || "Configured Workspace"}
                    customIcon={customIcon}
                    actions={actions}
                    footer={footer}
                  />
                );
              } else {
                const game = card.game;

                const customIcon = game.icon ? (
                  <img src={game.icon} alt="" className="w-24 h-24 object-contain drop-shadow-lg opacity-40 group-hover:opacity-80 grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all duration-500" />
                ) : (
                  <span className="material-symbols-outlined !text-[48px] text-[var(--subtext)] drop-shadow-md opacity-40 group-hover:opacity-80 group-hover:text-white group-hover:scale-110 transition-all duration-500">sports_esports</span>
                );

                const footer = (
                  <div className="flex flex-col min-w-0 flex-1 pr-2">
                    <span className="text-[10px] font-bold text-[var(--text)] opacity-0 group-hover:opacity-80 transition-opacity duration-500 flex items-center gap-1 uppercase tracking-widest">
                      <span className="material-symbols-outlined !text-[12px]">add</span>
                      <span>{t("ui_add_network_node") || "Provision Node"}</span>
                    </span>
                  </div>
                );

                return (
                  <UniversalCard
                    key={`game-${game.id}-${idx}`}
                    layout="vertical"
                    isGhosted={true}
                    onClick={() => setSelectedGameConfig(game)}
                    title={game.name}
                    subtitle={t("workspace_unconfigured")}
                    customIcon={customIcon}
                    footer={footer}
                  />
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
