import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import { supabase } from '../supabase';
import { SidePanel, EmptyState } from "../shared";

export function WorkspaceSidePanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useLexicon();
  const workspaces = useStore((state) => state.workspaces);
  const setActiveWorkspaceId = useStore((state) => state.setActiveWorkspaceId);
  const setIsConfigured = useStore((state) => state.setIsConfigured);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);

  const [globalGames, setGlobalGames] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

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
    if (!isOpen) return;
    const fetchGames = async () => {
      setIsLoading(true);
      const { data } = await supabase.from('sanctuary_games').select('*').order('name');
      if (data) setGlobalGames(data);
      setIsLoading(false);
    };
    fetchGames();
  }, [isOpen]);

  const selectWorkspace = async (workspace: any) => {
    if (workspace.id === activeWorkspaceId) return;
    try {
      const globalConfig: any = await invoke("get_global_config");
      globalConfig.active_workspace_id = workspace.id;
      await invoke("save_coordinates", { config: globalConfig });
      localStorage.setItem('sanctuary_last_active_workspace', workspace.id);
      setActiveWorkspaceId(workspace.id);
      setIsConfigured(true);
      onClose();
      setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      console.error(err);
    }
  };

  const activeGames = globalGames.filter((g: any) => g.is_active !== false);

  let cards: any[] = [];
  activeGames.forEach((game: any) => {
    const gameWorkspaces = workspaces.filter((ws: any) => ws.schema_id === game.schema_id);
    gameWorkspaces.forEach((ws: any) => {
      cards.push({ type: 'workspace', workspace: ws, game });
    });
  });

  const filteredCards = cards.filter((c: any) => {
    const search = searchQuery.toLowerCase();
    return (c.workspace.name || c.workspace.id).toLowerCase().includes(search) ||
      (c.game.name || '').toLowerCase().includes(search) ||
      (c.workspace.schema_id || '').toLowerCase().includes(search);
  });

  // Sort: pinned first, then active, then alphabetical
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

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("workspace_sidebar") || "Environments"}
      subtitle={t("workspace_select_subtitle") || "Initialize Your Sanctuary Environment"}
      icon={t("icon_view_quilt") || "view_quilt"}
      position="left"
      widthClass="w-[700px]"
      backdropZ="z-[1000000]"
      panelZ="z-[1000001]"
      panelClass="!left-0"
    >
      <div className="flex flex-col h-full -mx-8 -mt-8 relative">
        <div className="flex flex-col md:flex-row items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5">
          <div className="relative w-full flex-1 min-w-[200px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search") || "search"}</span>
            <input
              type="text"
              placeholder={t("workspace_search") || "Search environments..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 font-inter"
            />
          </div>
          <button
            onClick={() => { setIsConfigured(false); onClose(); }}
            className="h-12 px-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl text-[11px] font-black uppercase tracking-widest hover:border-[var(--accent)] hover:theme-text-accent transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)] shrink-0"
          >
            <span className="material-symbols-outlined !text-[18px]">view_quilt</span>
            {t("workspace_all") || "All Workspaces"}
          </button>
        </div>

        <div className="p-6 w-full flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-1 pb-32">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            {filteredCards.map((card: any, idx: number) => {
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
                      <div className={`w-12 h-12 rounded-2xl theme-glass-inner border shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500 ${isActive ? 'border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-white/5' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                        {game.icon ? <img src={game.icon} alt="" className="w-8 h-8 object-contain drop-shadow-md" /> : <span className="material-symbols-outlined !text-[24px] theme-text-accent drop-shadow-md">sports_esports</span>}
                      </div>
                      <div className="flex flex-col pt-1 min-w-0 flex-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1 truncate">{isActive ? t("workspace_manage") || 'Active Workspace' : t("workspace_available") || "Configured Workspace"}</span>
                        <span className="text-[13px] font-black uppercase tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors line-clamp-2 drop-shadow-sm leading-tight">{game.name || ws.name || ws.id}</span>
                      </div>
                    </div>

                    <div
                      onClick={(e) => togglePin(ws.id, e)}
                      className={`absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors border border-transparent ${isPinned ? 'theme-text-accent bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'text-[var(--subtext)] opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-white/5 hover:border-white/10'}`}
                    >
                      <span className="material-symbols-outlined !text-[16px]" style={{ fontVariationSettings: isPinned ? '"FILL" 1' : '"FILL" 0' }}>keep</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-white/5">
                    <div className="flex flex-col min-w-0 flex-1 pr-2">
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("status")}</span>
                      <span className="text-[10px] font-bold text-[var(--success)] opacity-90 mt-1 flex items-center gap-1 truncate">
                        <span className="material-symbols-outlined !text-[12px] shrink-0">check_circle</span>
                        <span className="truncate">{t("workspace_configured")}</span>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}

            {isLoading && (
              <EmptyState icon={t("icon_sync") || "sync"} title={t("workspace_loading") || "Loading workspaces..."} className="col-span-full py-16 animate-pulse" />
            )}

            {!isLoading && filteredCards.length === 0 && (
              <EmptyState icon={t("icon_search") || "search_off"} title={t("no_matches") || "No environments found"} className="col-span-full py-16" />
            )}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
