import React, { useState, useEffect } from 'react';
import { useStore } from './store';
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { CartographerSetup } from './CartographerSetup';
import { supabase } from './supabase';
import { EmptyState, SearchBar, HoverTabDrawer, VerticalTabButton } from './shared';
import { UniversalCard } from './components/universal/UniversalCard';
import { CommandScreenLayout, CommandScreenBody, CommandScreenMain, CommandScreenSectionHeading, CommandScreenStatusbar } from "./hub-components/SharedCommandScreenLayout";

export function WorkspaceLanding({ onClose, isModal }: { onClose?: () => void, isModal?: boolean }) {
  const { t } = useLexicon();
  const workspaces = useStore((state) => state.workspaces);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);

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

  const isTransparent = onClose || isModal;

  return (
    <div className="flex-1 w-full h-full flex flex-col font-sans overflow-hidden animate-in fade-in duration-1000 text-[var(--text)]">
      {onClose && (
        <button onClick={onClose} className="absolute top-8 right-8 w-12 h-12 rounded-full glass-surface flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-[var(--danger)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] z-50 shadow-lg">
          <span className="material-symbols-outlined !text-[24px]">close</span>
        </button>
      )}

      <div className="w-full h-full flex-1 flex flex-col p-4 overflow-hidden gap-6">

        {!selectedGameConfig && (
          <HoverTabDrawer title={t("quick_actions")}>
            <VerticalTabButton id="configured" icon="storage" label={t("workspace_configured")} activeTab={filterTab} setTab={setFilterTab} />
            <VerticalTabButton id="unconfigured" icon="add_circle" label={t("workspace_unconfigured")} activeTab={filterTab} setTab={setFilterTab} />
          </HoverTabDrawer>
        )}

        <CommandScreenLayout>
          {selectedGameConfig ? (
            <>
              <CartographerSetup preselectedGame={selectedGameConfig} onCancel={() => setSelectedGameConfig(null)} />
            </>
          ) : (
            <>
              <CommandScreenSectionHeading
                title={t("workspace_select_title")}
                subtitle={t("workspace_select_subtitle")}
                icon="dns"
                shape="circle"
                rightContent={
                  <div className="w-[300px]">
                    <SearchBar
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder={t("workspace_search")}
                      className="h-12 rounded-2xl w-full"
                    />
                  </div>
                }
              />

              <CommandScreenBody>
                <CommandScreenMain>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6 pb-20">
                    {filteredCards.map((card: any, idx: number) => {
                      if (card.type === 'workspace') {
                        const ws = card.workspace;
                        const game = card.game;
                        const isActive = ws.id === activeWorkspaceId;
                        const isPinned = pinnedIds.includes(ws.id);

                        const customIcon = game.icon ? (
                          <img src={game.icon} alt="" className="w-full h-full object-contain p-4 drop-shadow-lg opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                        ) : (
                          <span className="material-symbols-outlined !text-[48px] theme-text-accent drop-shadow-md opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">sports_esports</span>
                        );

                        const actions = (
                          <div
                            onClick={(e) => togglePin(ws.id, e)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border border-transparent ${isPinned ? 'theme-text-accent bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'text-[var(--subtext)] opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}
                          >
                            <span className="material-symbols-outlined !text-[20px]" style={{ fontVariationSettings: isPinned ? '"FILL" 1' : '"FILL" 0' }}>keep</span>
                          </div>
                        );

                        const footer = (
                          <div className="flex flex-col min-w-0 flex-1 pr-2">
                            <span className="text-[9px] font-black capitalize tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("status")}</span>
                            {isSelecting === ws.id ? (
                              <span className="text-[11px] font-bold text-[var(--accent)] opacity-90 mt-1 flex items-center gap-2 truncate animate-pulse">
                                <span className="material-symbols-outlined !text-[14px] shrink-0 animate-spin">sync</span>
                                <span className="truncate">{t("status_establishing_connection")}</span>
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-[var(--success)] opacity-90 mt-1 flex items-center gap-2 truncate">
                                <span className="material-symbols-outlined !text-[14px] shrink-0">check_circle</span>
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
                            customIcon={customIcon}
                            actions={actions}
                            footer={footer}
                          />
                        );
                      } else {
                        const game = card.game;

                        const customIcon = game.icon ? (
                          <img src={game.icon} alt="" className="w-full h-full object-contain p-4 drop-shadow-lg opacity-40 group-hover:opacity-80 grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all duration-500" />
                        ) : (
                          <span className="material-symbols-outlined !text-[48px] text-[var(--subtext)] drop-shadow-md opacity-40 group-hover:opacity-80 group-hover:theme-text-accent group-hover:scale-110 transition-all duration-500">sports_esports</span>
                        );

                        const footer = (
                          <div className="flex flex-col min-w-0 flex-1 pr-2">
                            <span className="text-[9px] font-black capitalize tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("status")}</span>
                            <span className="text-[11px] font-bold text-[var(--warning)] opacity-90 mt-1 flex items-center gap-2 truncate">
                              <span className="material-symbols-outlined !text-[14px] shrink-0">error</span>
                              <span className="truncate">{t("workspace_unconfigured")}</span>
                            </span>
                          </div>
                        );

                        return (
                          <UniversalCard
                            key={`unconf-${game.id}-${idx}`}
                            layout="vertical"
                            isGhosted={true}
                            onClick={() => setSelectedGameConfig(game)}
                            title={game.name}
                            customIcon={customIcon}
                            footer={footer}
                          />
                        );
                      }
                    })}

                    {filteredCards.length === 0 && (
                      <EmptyState icon="search" title={t("no_matches")} className="col-span-full py-16" />
                    )}
                  </div>
                </CommandScreenMain>
              </CommandScreenBody>
            </>
          )}
        </CommandScreenLayout>
      </div>
    </div>
  );
}
