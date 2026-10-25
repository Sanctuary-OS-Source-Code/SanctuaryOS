import React, { useState, useEffect } from "react";
import { useStore, syncMasterSchemas } from "../store";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import {
  SidePanel,
  EmptyState,
  ActionPill,
  DashboardStatTile,
  PanelHeaderGroup,
  PanelHeaderButton,
  HoverTooltip,
  SidePanelHeroCard,
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../shared";
import { isDesktop } from "../utils/envUtils";

export function WorkspaceSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const workspaces = useStore((state) => state.workspaces);
  const setActiveWorkspaceId = useStore((state) => state.setActiveWorkspaceId);
  const setIsConfigured = useStore((state) => state.setIsConfigured);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);

  const [globalGames, setGlobalGames] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "pinned">("all");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const storedPins = localStorage.getItem("sanctuary_pinned_workspaces");
      if (storedPins) {
        setPinnedIds(JSON.parse(storedPins));
      }
    } catch (e) {}
  }, []);

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let newPins = [...pinnedIds];
    if (newPins.includes(id)) {
      newPins = newPins.filter((p) => p !== id);
    } else {
      newPins.push(id);
    }
    setPinnedIds(newPins);
    localStorage.setItem("sanctuary_pinned_workspaces", JSON.stringify(newPins));
  };

  useEffect(() => {
    if (!isOpen) return;
    const fetchGames = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from("sanctuary_games")
        .select(
          "id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor"
        )
        .order("name");
      if (data) setGlobalGames(data);
      setIsLoading(false);
    };
    fetchGames();
  }, [isOpen]);

  const selectWorkspace = async (workspace: any) => {
    if (workspace.id === activeWorkspaceId) {
      setIsConfigured(true);
      if (view === "landing") {
        setView("dashboard");
      }
      onClose();
      return;
    }

    let globalConfig: any = null;
    try {
      if (isDesktop()) {
        globalConfig = await invoke("get_global_config");
        globalConfig.active_workspace_id = workspace.id;

        if (globalConfig.workspaces) {
          const defaultWs = globalConfig.workspaces.find(
            (w: any) => w.id === "default_workspace"
          );
          if (defaultWs && defaultWs.schema_id) {
            defaultWs.id = defaultWs.schema_id;
            if (globalConfig.active_workspace_id === "default_workspace") {
              globalConfig.active_workspace_id = defaultWs.schema_id;
            }
          }
          if (
            !globalConfig.workspaces.find(
              (w: any) => w.id === globalConfig.active_workspace_id
            )
          ) {
            const cloned = {
              ...globalConfig.workspaces[0],
              id: globalConfig.active_workspace_id,
              schema_id:
                workspace.schema_id || globalConfig.active_workspace_id,
            };
            globalConfig.workspaces.push(cloned);
          }
        }
        await invoke("save_coordinates", { config: globalConfig });
      }
    } catch (err) {
      console.error("Desktop config save failed:", err);
    }

    const safeActiveId =
      globalConfig?.active_workspace_id ||
      (workspace.id === "default_workspace" && workspace.schema_id
        ? workspace.schema_id
        : workspace.id);

    localStorage.setItem("sanctuary_last_active_workspace", safeActiveId);
    useStore.getState().hydrateWorkspaceState(safeActiveId);
    if (workspace.schema_id) {
      syncMasterSchemas(workspace.schema_id).catch(console.warn);
    }
    setActiveWorkspaceId(safeActiveId);
    setIsConfigured(true);
    if (view === "landing") {
      setView("dashboard");
    }
    onClose();

    if (isDesktop()) {
      setTimeout(() => window.location.reload(), 300);
    } else {
      setTimeout(() => (window.location.href = "/" + safeActiveId), 300);
    }
  };

  const activeGames = globalGames.filter((g: any) => g.is_active !== false);

  const cards: any[] = [];
  activeGames.forEach((game: any) => {
    const gameWorkspaces = workspaces.filter(
      (ws: any) => ws.schema_id === game.schema_id
    );
    gameWorkspaces.forEach((ws: any) => {
      cards.push({ type: "workspace", workspace: ws, game });
    });
  });

  // Fallback for local workspaces that don't have a matching active game from Supabase
  workspaces.forEach((ws: any) => {
    if (!cards.find((c) => c.workspace.id === ws.id)) {
      cards.push({
        type: "workspace",
        workspace: ws,
        game: { name: ws.name || ws.id, schema_id: ws.schema_id },
      });
    }
  });

  const pinnedCount = cards.filter((c) =>
    pinnedIds.includes(c.workspace.id)
  ).length;

  const filteredCards = cards.filter((c: any) => {
    if (filterMode === "pinned" && !pinnedIds.includes(c.workspace.id)) {
      return false;
    }
    const search = searchQuery.toLowerCase();
    return (
      (c.workspace.name || c.workspace.id).toLowerCase().includes(search) ||
      (c.game.name || "").toLowerCase().includes(search) ||
      (c.workspace.schema_id || "").toLowerCase().includes(search)
    );
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
      title={t("workspace_sidebar", "Workspaces")}
      subtitle={t("workspace_select_subtitle", "Select Your Workspace")}
      icon={t("icon_view_quilt", "view_quilt")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ="z-[100000]"
      panelZ="z-[100001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_public", "public")}
            tooltip={t("workspace_all", "Return to Hub")}
            onClick={() => {
              if (isDesktop()) {
                setView("landing");
              } else {
                window.location.href = "/";
              }
              onClose();
            }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 pb-8 relative z-10 w-full">
        <SidePanelHeroCard
          icon={t("icon_view_quilt", "view_quilt")}
          overline={t("workspace_info_title", "Workspace Directory")}
          title={t("workspace_select_subtitle", "Select Your Workspace")}
          description={t(
            "workspace_info_desc",
            "Switch between active game environments, manage pinned workspaces, or return to the central Sanctuary hub."
          )}
          badge={`${cards.length}`}
          variant="accent"
        />

        {/* 2-Column Filter Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_view_quilt", "view_quilt")}
            label={t("workspace_filter_all", "All Workspaces")}
            value={cards.length}
            active={filterMode === "all"}
            onClick={() => setFilterMode("all")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_keep", "keep")}
            label={t("workspace_filter_pinned", "Pinned")}
            value={pinnedCount}
            active={filterMode === "pinned"}
            onClick={() => setFilterMode("pinned")}
          />
        </div>

        {/* Search Bar */}
        <ActionPill
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchPlaceholder={t("workspace_search", "Search Workspaces...")}
        />

        {/* Workspace Cards Grid */}
        <UniversalGroup
          title={t("workspace_sidebar", "Workspaces")}
          icon={t("icon_sports_esports", "sports_esports")}
          headerAction={
            <span
              className={VAULT_CHIP_CLASS}
              style={{
                color: "var(--subtext)",
                borderColor: "color-mix(in srgb, var(--text) 18%, var(--border))",
              }}
            >
              <span className="material-symbols-rounded !text-[12px] shrink-0">
                {t("icon_view_quilt", "view_quilt")}
              </span>
              <span>{filteredCards.length}</span>
            </span>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {filteredCards.map((card: any, idx: number) => {
            const ws = card.workspace;
            const game = card.game;
            const isActive = ws.id === activeWorkspaceId;
            const isPinned = pinnedIds.includes(ws.id);
            const isWorkspaceConfigured = Boolean(
              ws.mods_path || ws.live_path || ws.vault_path || isActive
            );

            return (
              <div
                key={`ws-${ws.id}-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => selectWorkspace(ws)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectWorkspace(ws);
                  }
                }}
                className={`relative glass-panel p-5 rounded-2xl flex flex-col gap-3.5 border text-left group cursor-pointer transition-all duration-300 ${
                  isActive
                    ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_65%,transparent)]"
                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                }`}
              >
                {/* Top Row: Icon Box on Left + Status Badge & Pin Button on Right */}
                <div className="flex justify-between items-start gap-3 relative z-10">
                  <div
                    className={`w-10 h-10 rounded-xl border glass-surface flex items-center justify-center shrink-0 transition-colors duration-300 ${
                      isActive
                        ? "text-[var(--accent)]"
                        : "text-[var(--subtext)] group-hover:text-[var(--accent)]"
                    }`}
                    style={{
                      borderColor: isActive
                        ? "color-mix(in srgb, var(--accent) 40%, var(--border))"
                        : "color-mix(in srgb, var(--accent) 25%, var(--border))",
                    }}
                  >
                    {game.icon ? (
                      <img
                        src={game.icon}
                        alt=""
                        className="w-6 h-6 object-contain drop-shadow-sm"
                      />
                    ) : (
                      <span className="material-symbols-outlined !text-[22px]">
                        {t("icon_sports_esports", "sports_esports")}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive ? (
                      <span
                        className={VAULT_CHIP_CLASS}
                        style={{
                          color: "var(--accent)",
                          borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                        }}
                      >
                        <span className="material-symbols-rounded !text-[12px] shrink-0">
                          {t("icon_check_circle", "check_circle")}
                        </span>
                        <span>{t("active", "Active")}</span>
                      </span>
                    ) : (
                      <span
                        className={VAULT_CHIP_CLASS}
                        style={{
                          color: "var(--success)",
                          borderColor: "color-mix(in srgb, var(--success) 35%, var(--border))",
                        }}
                      >
                        <span className="material-symbols-rounded !text-[12px] shrink-0">
                          {t("icon_check_circle", "check_circle")}
                        </span>
                        <span>
                          {isWorkspaceConfigured
                            ? t("workspace_badge_configured", "Configured")
                            : t("workspace_badge_ready", "Ready")}
                        </span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => togglePin(ws.id, e)}
                      className={`w-7 h-7 rounded-lg border bg-transparent flex items-center justify-center transition-all relative group/pin cursor-pointer ${
                        isPinned
                          ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] opacity-60 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:text-[var(--accent)]"
                      }`}
                    >
                      <span
                        className="material-symbols-outlined !text-[15px]"
                        style={{
                          fontVariationSettings: isPinned
                            ? '"FILL" 1'
                            : '"FILL" 0',
                        }}
                      >
                        {t("icon_keep", "keep")}
                      </span>
                      <HoverTooltip
                        title={
                          isPinned
                            ? t("workspace_btn_unpin", "Unpin Workspace")
                            : t("workspace_btn_pin", "Pin Workspace")
                        }
                      />
                    </button>
                  </div>
                </div>

                {/* Middle Block: Overline + Prominent Title + Concise Description */}
                <div className="flex flex-col gap-1 relative z-10 mt-0.5">
                  <span
                    className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                      isActive
                        ? "text-[var(--accent)]"
                        : "text-[var(--subtext)] opacity-75 group-hover:text-[var(--accent)] group-hover:opacity-100"
                    }`}
                  >
                    {t("workspace_card_overline", "Game Workspace")}
                  </span>
                  <h3 className="text-lg font-black text-[var(--text)] tracking-tight leading-snug group-hover:text-[var(--accent)] transition-colors truncate m-0">
                    {game.name || ws.name || ws.id}
                  </h3>
                  <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 m-0">
                    {isActive
                      ? t("workspace_card_desc_active", "Currently active environment for {mod} deployment, diagnostics, and backups.")
                      : t("workspace_card_desc_available", "Select to mount this game workspace and load its {vault}, {blueprints}, and tools.")}
                  </p>
                </div>

                {/* Bottom Footer Row: Schema Code + Action Label */}
                <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                    {ws.schema_id || game.schema_id || ws.id}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 transition-colors ${
                      isActive
                        ? "text-[var(--accent)]"
                        : "text-[var(--subtext)] opacity-75 group-hover:text-[var(--accent)] group-hover:opacity-100"
                    }`}
                  >
                    <span>
                      {isActive && view !== "landing"
                        ? t("active", "Active")
                        : isActive
                          ? t("workspace_btn_enter", "Enter Workspace")
                          : t("workspace_btn_switch", "Switch Workspace")}
                    </span>
                    <span className="material-symbols-outlined !text-[14px]">
                      {isActive && view !== "landing"
                        ? t("icon_check_circle", "check_circle")
                        : t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <EmptyState
              icon={t("icon_sync", "sync")}
              title={t("workspace_loading", "Loading Workspaces...")}
              className="col-span-full py-12 animate-pulse"
            />
          )}

          {!isLoading && filteredCards.length === 0 && (
            <EmptyState
              icon={t("icon_search", "search")}
              title={t("no_matches", "No Matches Found")}
              className="col-span-full py-12"
            />
          )}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
