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
import {
  getPinnedWorkspaceIds,
  isWorkspacePinned,
  togglePinnedWorkspace,
  getWorkspaceRecentTimestamps,
  recordWorkspaceLoaded,
  isWorkspaceSetupConfigured,
  sortWorkspacesList,
  WORKSPACE_PREFS_EVENT,
} from "../utils/workspacePrefs";

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
  const [filterMode, setFilterMode] = useState<
    "all" | "active" | "inactive" | "pinned"
  >("all");
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [pinnedIds, setPinnedIds] = useState<string[]>(() =>
    getPinnedWorkspaceIds(activeWorkspaceId ? [activeWorkspaceId] : undefined)
  );
  const [recentTimestamps, setRecentTimestamps] = useState<
    Record<string, number>
  >(() => getWorkspaceRecentTimestamps());

  useEffect(() => {
    const syncPrefs = () => {
      setPinnedIds(
        getPinnedWorkspaceIds(
          activeWorkspaceId ? [activeWorkspaceId] : undefined
        )
      );
      setRecentTimestamps(getWorkspaceRecentTimestamps());
    };
    syncPrefs();
    window.addEventListener(WORKSPACE_PREFS_EVENT, syncPrefs);
    window.addEventListener("storage", syncPrefs);
    return () => {
      window.removeEventListener(WORKSPACE_PREFS_EVENT, syncPrefs);
      window.removeEventListener("storage", syncPrefs);
    };
  }, [activeWorkspaceId, isOpen]);

  const togglePin = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextPins = togglePinnedWorkspace(item, pinnedIds);
    setPinnedIds(nextPins);
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
    recordWorkspaceLoaded(workspace);

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
          const targetSchemaId =
            workspace.schema_id || globalConfig.active_workspace_id;
          const existingTarget = globalConfig.workspaces.find(
            (w: any) =>
              String(w.id || "").toLowerCase() ===
                String(globalConfig.active_workspace_id || "").toLowerCase() ||
              String(w.schema_id || "").toLowerCase() ===
                String(targetSchemaId || "").toLowerCase()
          );
          if (!existingTarget) {
            const masterVault = globalConfig.vault_path || "";
            const cleanWorkspace = {
              id: globalConfig.active_workspace_id,
              name: workspace.name || targetSchemaId,
              schema_id: targetSchemaId,
              live_path: "",
              mods_path: "",
              vault_path: masterVault ? `${masterVault}\\${targetSchemaId}` : "",
              supabase_url: workspace.supabase_url || null,
              supabase_anon_key: workspace.supabase_anon_key || null,
            };
            globalConfig.workspaces.push(cleanWorkspace);
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

    recordWorkspaceLoaded(safeActiveId);
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
      setTimeout(() => window.location.reload(), 30);
    } else {
      setTimeout(() => (window.location.href = "/" + safeActiveId), 30);
    }
  };

  const activeGames = globalGames.filter((g: any) => g.is_active !== false);

  const cards: any[] = [];
  activeGames.forEach((game: any) => {
    const gameWorkspaces = workspaces.filter(
      (ws: any) => ws.schema_id === game.schema_id
    );
    if (gameWorkspaces.length > 0) {
      gameWorkspaces.forEach((ws: any) => {
        cards.push({ type: "workspace", workspace: ws, game });
      });
    } else {
      cards.push({
        type: "workspace",
        workspace: {
          id: game.schema_id || game.id,
          name: game.name,
          schema_id: game.schema_id,
          supabase_url: game.supabase_url,
          supabase_anon_key: game.supabase_anon_key,
        },
        game,
      });
    }
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
    isWorkspacePinned(c, pinnedIds)
  ).length;

  const filteredCards = sortWorkspacesList(
    cards.filter((c: any) => {
      const isSetup = isWorkspaceSetupConfigured(
        c,
        workspaces,
        activeWorkspaceId
      );
      if (filterMode === "pinned" && !isWorkspacePinned(c, pinnedIds)) {
        return false;
      }
      if (filterMode === "active" && !isSetup) {
        return false;
      }
      if (filterMode === "inactive" && isSetup) {
        return false;
      }
      const search = searchQuery.toLowerCase();
      return (
        (c.workspace.name || c.workspace.id).toLowerCase().includes(search) ||
        (c.game.name || "").toLowerCase().includes(search) ||
        (c.workspace.schema_id || "").toLowerCase().includes(search)
      );
    }),
    {
      pinnedIds,
      recentTimestamps,
      workspaces,
      activeWorkspaceId,
      sortBy: sortMode,
      prioritizePinned: true,
    }
  );

  const setupCards = filteredCards.filter((c) =>
    isWorkspaceSetupConfigured(c, workspaces, activeWorkspaceId)
  );
  const unconfiguredCards = filteredCards.filter(
    (c) => !isWorkspaceSetupConfigured(c, workspaces, activeWorkspaceId)
  );

  const renderWorkspaceCard = (card: any, idx: number) => {
    const ws = card.workspace;
    const game = card.game;
    const isActive =
      String(ws.id || "").toLowerCase() ===
        String(activeWorkspaceId || "").toLowerCase() ||
      (isDesktop() &&
        String(ws.schema_id || "").toLowerCase() ===
          String(activeWorkspaceId || "").toLowerCase());
    const isPinned = isWorkspacePinned(card, pinnedIds);
    const isWorkspaceConfigured = isWorkspaceSetupConfigured(
      card,
      workspaces,
      activeWorkspaceId
    );

    return (
      <div
        key={`ws-${ws.id || ws.schema_id}-${idx}`}
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
            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors duration-300 ${
              isActive
                ? "text-[var(--accent)]"
                : "text-[var(--subtext)] group-hover:text-[var(--accent)]"
            }`}
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
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>{t("active", "Active")}</span>
              </span>
            ) : isWorkspaceConfigured ? (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>{t("workspace_badge_configured", "Configured")}</span>
              </span>
            ) : (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--subtext)]">
                  {t("icon_pending", "pending")}
                </span>
                <span>{t("workspace_badge_not_setup", "Not Setup")}</span>
              </span>
            )}

            <button
              type="button"
              onClick={(e) => togglePin(card, e)}
              className="h-6 w-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center transition-all relative group/pin cursor-pointer"
            >
              <span
                className={`material-symbols-outlined !text-[13px] transition-colors ${
                  isPinned
                    ? "text-[var(--accent)] opacity-90 group-hover/pin:opacity-100"
                    : "text-[var(--subtext)] opacity-55 group-hover/pin:opacity-100 group-hover/pin:text-[var(--text)]"
                }`}
                style={{
                  fontVariationSettings: isPinned ? '"FILL" 1' : '"FILL" 0',
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
          <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed m-0">
            {isActive
              ? t(
                  "workspace_card_desc_active",
                  "Currently active environment for {mod} deployment, diagnostics, and backups."
                )
              : t(
                  "workspace_card_desc_available",
                  "Select to mount this game workspace and load its {vault}, {blueprints}, and tools."
                )}
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
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("landing_workspaces", "Active Workspaces")}
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

        {/* Search & Filter Bar */}
        <ActionPill
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchPlaceholder={t("workspace_search", "Search Workspaces...")}
          primaryPopover={{
            icon: t("icon_tune", "tune"),
            label: t("filters", "Filters"),
            content: (
              <div className="flex flex-col w-[460px] p-4 max-w-[calc(100vw-40px)] text-left">
                <div className="flex flex-col mb-5 w-full">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2 px-1 flex items-center gap-2">
                    {t("filter_status", "Filter Status")}
                    <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: "all", label: t("filter_all", "All") },
                      { id: "active", label: t("active", "Active") },
                      {
                        id: "inactive",
                        label: t("workspace_badge_not_setup", "Not Setup"),
                      },
                      { id: "pinned", label: t("pinned", "Pinned") },
                    ].map((opt) => {
                      const active = filterMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setFilterMode(opt.id as any)}
                          className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                            active ? "is-selected font-bold" : "font-semibold"
                          }`}
                        >
                          <span className="truncate flex items-center gap-2 min-w-0">
                            {opt.label}
                          </span>
                          {active && (
                            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                              {t("icon_check", "check")}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col w-full">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2 px-1 flex items-center gap-2">
                    {t("filters", "Filters")}
                    <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      {
                        id: "recent",
                        label: t("workspace_sort_recent", "Recently Loaded"),
                      },
                      {
                        id: "name",
                        label: t("sort_alphabetical", "Alphabetical"),
                      },
                    ].map((opt) => {
                      const active = sortMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSortMode(opt.id as any)}
                          className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                            active ? "is-selected font-bold" : "font-semibold"
                          }`}
                        >
                          <span className="truncate flex items-center gap-2 min-w-0">
                            {opt.label}
                          </span>
                          {active && (
                            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                              {t("icon_check", "check")}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ),
          }}
        />

        {isLoading ? (
          <EmptyState
            icon={t("icon_sync", "sync")}
            title={t("workspace_loading", "Loading Workspaces...")}
            className="py-12 animate-pulse"
          />
        ) : filteredCards.length === 0 ? (
          <EmptyState
            icon={t("icon_search", "search")}
            title={t("no_matches", "No Matches Found")}
            className="py-12"
          />
        ) : (
          <>
            {/* TOP SECTION: ACTIVE WORKSPACES (SETUP) */}
            {setupCards.length > 0 && (
              <UniversalGroup
                title={t(
                  "workspace_section_active_setup",
                  "Active Workspaces (Setup)"
                )}
                icon={t("icon_check_circle", "check_circle")}
                headerAction={
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    <span>{setupCards.length}</span>
                  </span>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  {setupCards.map((card, idx) =>
                    renderWorkspaceCard(card, idx)
                  )}
                </div>
              </UniversalGroup>
            )}

            {/* BOTTOM SECTION: INACTIVE WORKSPACES (NOT YET SETUP) */}
            {unconfiguredCards.length > 0 && (
              <UniversalGroup
                title={t(
                  "workspace_section_inactive_unconfigured",
                  "Inactive Workspaces (Not Yet Setup)"
                )}
                icon={t("icon_pending", "pending")}
                headerAction={
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--subtext)]">
                      {t("icon_pending", "pending")}
                    </span>
                    <span>{unconfiguredCards.length}</span>
                  </span>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  {unconfiguredCards.map((card, idx) =>
                    renderWorkspaceCard(card, idx)
                  )}
                </div>
              </UniversalGroup>
            )}
          </>
        )}
      </div>
    </SidePanel>
  );
}
