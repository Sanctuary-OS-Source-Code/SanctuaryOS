import React from 'react';
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { CustomDropdown, HoverTooltip } from './shared';
import { invoke } from '@tauri-apps/api/core';
import { WorkspaceSidePanel } from './side-panels/WorkspaceSidePanel';

function NavButton({
  id,
  label,
  icon,
  activeTab,
  setTab,
  active,
  onClick,
  isCollapsed,
  isAccent,
  setHoveredTooltip
}: any) {
  const isActive = active !== undefined ? active : activeTab === id;
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    if (onClick) onClick();
    else if (setTab && id) setTab(id);
  };

  const handleMouseEnter = () => {
    if (isCollapsed && setHoveredTooltip && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setHoveredTooltip({ label, top: rect.top + rect.height / 2 });
    }
  };

  const handleMouseLeave = () => {
    if (isCollapsed && setHoveredTooltip) {
      setHoveredTooltip(null);
    }
  };

  return (
    <div className="relative group/nav">
      <button
        ref={buttonRef}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`w-full flex items-center gap-4 px-6 py-4 rounded-[var(--radius)] transition-all duration-500 group relative
          ${isActive
            ? (isAccent ? "theme-bg-accent/10 theme-text-accent shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] backdrop-blur-md" : "bg-white/10 text-[var(--sidebartext)] shadow-lg border border-white/10")
            : (isAccent ? "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:theme-bg-accent/5 hover:theme-text-accent border border-transparent" : "text-[var(--sidebartext)] opacity-60 hover:bg-white/5 hover:text-gray-300 border border-transparent")
          } ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        <div className="absolute inset-0 overflow-hidden rounded-[var(--radius)] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out" />
        </div>
        <span
          className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 relative z-10 ${isActive ? "scale-110 drop-shadow-md" : "group-hover:scale-110 group-hover:drop-shadow-sm"}`}
        >
          {icon}
        </span>
        {!isCollapsed && (
          <span
            className="font-black uppercase tracking-[0.15em] truncate leading-none pt-0.5 relative z-10"
            style={{ fontSize: "var(--fontSizeSidebar, 11px)" }}
          >
            {label}
          </span>
        )}
      </button>
    </div>
  );
}

export function Sidebar({
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  subtitleIndex,
  isNotificationSidebarOpen,
  setIsNotificationSidebarOpen,
  unreadNotificationCount,
  handleQuickLaunch,
}: any) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const userRole = useStore((state) => state.userRole);
  const isPatchDetected = useStore((state) => state.isPatchDetected);
  const { showDefconAlert } = useModalStore();
  const [globalGames, setGlobalGames] = React.useState<any[]>([]);
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = React.useState(false);
  const [hoveredTooltip, setHoveredTooltip] = React.useState<{ label: string, top: number } | null>(null);

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const activeWorkspace = workspaces?.find((w: any) => w.id === activeWorkspaceId);
  const activeGameName = globalGames.find(g => g.schema_id === activeWorkspace?.schema_id)?.name || activeWorkspace?.name || "Sanctuary OS";
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const schemaFeatures = activeGameSchema?.features || { has_cc: true, has_saves: true };

  React.useEffect(() => {
    import('./supabase').then(({ supabase }) => {
      supabase.from('sanctuary_games').select('*').then(({ data }) => {
        if (data) setGlobalGames(data);
      });
    });
  }, []);

  return (
    <nav
      className={`${isSidebarCollapsed ? 'w-[80px]' : ''} flex-shrink-0 h-full flex flex-col relative z-20 transition-all duration-500`}
      style={{
        width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)',
        minWidth: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)'
      }}
    >
      <div
        className="absolute inset-x-0 bottom-0 z-[-1] backdrop-blur-3xl border-r border-black/5 dark:border-white/10 transition-all duration-500 shadow-[4px_0_30px_rgba(0,0,0,0.05)]"
        style={{ top: 0, backgroundColor: "color-mix(in srgb, var(--sidebar) 40%, transparent)" }}
      />

      <div className="h-[80px] shrink-0" />

      {!isSidebarCollapsed && useStore.getState().workspaces?.length > 0 && (
        <div className="px-6 pt-5 pb-3 flex items-center justify-between group/header cursor-pointer" onClick={() => setIsWorkspacePanelOpen(true)}>
          <div className="flex flex-col min-w-0 flex-1 pr-2">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--subtext)] opacity-60 mb-1">{t("active_workspace") || "Active Workspace"}</span>
            <h2 className="text-[14px] font-black uppercase tracking-widest text-[var(--headerText)] truncate drop-shadow-sm group-hover/header:theme-text-accent transition-colors">
              {activeGameName}
            </h2>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setIsWorkspacePanelOpen(true); }} className="w-8 h-8 shrink-0 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center hover:border-[var(--accent)] hover:theme-text-accent hover:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all group-hover/header:border-[var(--accent)] group-hover/header:theme-text-accent">
            <span className="material-symbols-outlined !text-[18px]">swap_horiz</span>
          </button>
        </div>
      )}

      <div className="flex-1 pt-4 pb-6 px-4 space-y-1 overflow-y-auto accent-scrollbar">
        <NavButton
          active={view === "dashboard"}
          onClick={() => setView("dashboard")}
          icon={t("icon_desktop_windows")}
          label={t("center_title")}
          isCollapsed={isSidebarCollapsed}
          isAccent={true}
          setHoveredTooltip={setHoveredTooltip}
        />
        {(schemaFeatures.has_cc || schemaFeatures.has_saves || schemaFeatures.has_tray) && (
          <NavButton
            active={view === "vault"}
            onClick={() => setView("vault")}
            icon={t("icon_account_balance")}
            label={t("vault_title")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
            setHoveredTooltip={setHoveredTooltip}
          />
        )}
        {session && localStorage.getItem("sanctuary_blacklisted") !== "true" && (
          <NavButton
            active={view === "nexus"}
            onClick={() => setView("nexus")}
            icon={t("icon_hub")}
            label={t("market_title")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
            setHoveredTooltip={setHoveredTooltip}
          />
        )}
        {schemaFeatures.has_cc && (
          <NavButton
            active={view === "playsets"}
            onClick={() => setView("playsets")}
            icon={t("icon_map")}
            label={t("playsets_title")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
            setHoveredTooltip={setHoveredTooltip}
          />
        )}
        {session && localStorage.getItem("sanctuary_blacklisted") !== "true" && (
          <NavButton
            active={view === "GlobalFeed"}
            onClick={() => setView("GlobalFeed")}
            icon={t("icon_satellite_alt")}
            label={t("feed_title")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
            setHoveredTooltip={setHoveredTooltip}
          />
        )}
        {schemaFeatures.has_cc && (
          <>
            <NavButton
              active={view === "DbpfScout"}
              onClick={() => setView("DbpfScout")}
              icon={t("icon_track_changes")}
              label={t("radar_title")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
              setHoveredTooltip={setHoveredTooltip}
            />
            <NavButton
              active={view === "lab"}
              onClick={() => setView("lab")}
              icon={t("icon_science")}
              label={t("lab_title")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
              setHoveredTooltip={setHoveredTooltip}
            />
            <NavButton
              active={view === "CitizensWorkbench"}
              onClick={() => setView("CitizensWorkbench")}
              icon={t("icon_design_services")}
              label={t("title_sidebar")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
              setHoveredTooltip={setHoveredTooltip}
            />
          </>
        )}
        {schemaFeatures.has_saves && (
          <NavButton
            active={view === "backups"}
            onClick={() => setView("backups")}
            icon={t("icon_history")}
            label={t("backups_title")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
            setHoveredTooltip={setHoveredTooltip}
          />
        )}
        {session && schemaFeatures.has_cc && ["mason", "architect", "oversight", "wayfinder", "admin"].includes(userRole) && (
          <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
            {!isSidebarCollapsed && (
              <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left truncate">
                {t("mason")}
              </p>
            )}
            <NavButton
              active={view === "MasonHub"}
              onClick={() => setView("MasonHub")}
              icon={t("icon_construction")}
              label={t("sidebar_mason_hub")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
              setHoveredTooltip={setHoveredTooltip}
            />
          </div>
        )}
        {session && schemaFeatures.has_cc && ["architect", "oversight", "wayfinder", "admin"].includes(userRole) && (
          <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
            {!isSidebarCollapsed && (
              <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left truncate">
                {t("tab_architect")}
              </p>
            )}
            <NavButton
              active={view === "ArchitectHub"}
              onClick={() => setView("ArchitectHub")}
              icon={t("icon_analytics")}
              label={t("sidebar_architect_hub")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
              setHoveredTooltip={setHoveredTooltip}
            />
          </div>
        )}
        {session && schemaFeatures.has_cc && ["oversight", "wayfinder", "admin"].includes(userRole) && (
          <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
            {!isSidebarCollapsed && (
              <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left truncate">
                {t("stat_oversight")}
              </p>
            )}
            <NavButton
              active={view === "Oversight"}
              onClick={() => setView("Oversight")}
              icon={t("icon_security")}
              label={t("wf_tab_command")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
              setHoveredTooltip={setHoveredTooltip}
            />
          </div>
        )}
        {session && schemaFeatures?.has_cc !== false && (userRole === "wayfinder" || userRole === "admin") && (
          <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
            {!isSidebarCollapsed && (
              <p className="px-3 text-[10px] font-semibold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2 text-left truncate">
                {t("sidebar_wayfinder_tools")}
              </p>
            )}
            <NavButton
              active={view === "WayfinderHub"}
              onClick={() => setView("WayfinderHub")}
              icon={t("icon_terminal")}
              label={t("ui_btn_operations")}
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
              setHoveredTooltip={setHoveredTooltip}
            />
          </div>
        )}
        {session && (userRole === "core_dev" || userRole === "admin" || userRole === "keeper") && (
          <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
            {!isSidebarCollapsed && (
              <p className="px-3 text-[10px] font-semibold text-purple-400 opacity-80 uppercase tracking-widest mb-2 text-left truncate">
                Sanctuary Foundry
              </p>
            )}
            <NavButton
              active={view === "KeepersCore"}
              onClick={() => setView("KeepersCore")}
              icon="admin_panel_settings"
              label="Keepers Core"
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
              setHoveredTooltip={setHoveredTooltip}
            />
          </div>
        )}

        <div className={`my-4 border-t border-white/5 pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
          {!session && (
            <div className="my-4 border-t border-white/5 pt-4">
              <NavButton
                onClick={() => {
                  localStorage.setItem("sanctuary_show_login", "true");
                  window.location.reload();
                }}
                icon={t("icon_key")}
                label={t("sidebar_signin")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
            </div>
          )}
        </div>
        <div className="flex-1" />
      </div>

      {schemaFeatures?.has_launch !== false && (
        <div className="p-4 pb-14 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col gap-2 relative">
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-10" />

          <div className="relative group/nav mt-2">
            <button
              onMouseEnter={(e) => {
                if (isSidebarCollapsed) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredTooltip({ label: t("sidebar_quick_launch") || "Quick Launch", top: rect.top + rect.height / 2 });
                }
              }}
              onMouseLeave={() => {
                if (isSidebarCollapsed) setHoveredTooltip(null);
              }}
              onClick={handleQuickLaunch}
              className={`w-full py-3 rounded-xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 border bg-transparent ${isPatchDetected || showDefconAlert ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]" : "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"}`}
            >
              {isSidebarCollapsed ? <span className="material-symbols-outlined !text-xl drop-shadow-md">{t("icon_rocket_launch")}</span> : <><span className="material-symbols-outlined !text-xl drop-shadow-md">{t("icon_rocket_launch")}</span> {t("sidebar_quick_launch")}</>}
            </button>
          </div>
        </div>
      )}

      {isSidebarCollapsed && hoveredTooltip && (
        <div
          className="fixed left-[96px] z-[1000] flex flex-col items-start justify-center theme-glass-panel !bg-black/50 px-5 py-3 max-w-[320px] w-max pointer-events-none shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] animate-in fade-in slide-in-from-left-2"
          style={{ top: hoveredTooltip.top, transform: 'translateY(-50%)' }}
        >
          <div className="relative z-10 flex flex-col items-start gap-1 w-full">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] flex items-start text-left gap-2 whitespace-pre-line text-[var(--text)]">
              <span>{hoveredTooltip.label}</span>
            </div>
          </div>
        </div>
      )}

      <WorkspaceSidePanel isOpen={isWorkspacePanelOpen} onClose={() => setIsWorkspacePanelOpen(false)} />
    </nav >
  );
}