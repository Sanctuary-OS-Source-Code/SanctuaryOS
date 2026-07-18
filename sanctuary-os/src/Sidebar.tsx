import React from 'react';
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { useModalStore } from './store/modalStore';

function NavButton({
  id,
  label,
  icon,
  activeTab,
  setTab,
  active,
  onClick,
  isCollapsed,
  isAccent
}: any) {
  const isActive = active !== undefined ? active : activeTab === id;
  const handleClick = () => {
    if (onClick) onClick();
    else if (setTab && id) setTab(id);
  };
  return (
    <div className="relative group/nav">
      <button
        onClick={handleClick}
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
      {isCollapsed && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-4 py-2 bg-[var(--sidebar)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all duration-300 z-[1000] pointer-events-none backdrop-blur-xl">
          {label}
        </div>
      )}
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
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const session = useStore((state) => state.session);
  const userRole = useStore((state) => state.userRole);
  const isPatchDetected = useStore((state) => state.isPatchDetected);
  const defconLevel = useStore((state) => state.defconLevel);
  const { showDefconAlert } = useModalStore();

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
        style={{ top: "80px", backgroundColor: "color-mix(in srgb, var(--sidebar) 40%, transparent)" }}
      />

      <div className="h-[75px] shrink-0" />

      <div className="flex-1 pt-6 pb-6 px-4 space-y-1 overflow-y-auto overflow-x-hidden accent-scrollbar">
        <NavButton
          active={view === "dashboard"}
          onClick={() => setView("dashboard")}
          icon={t("icon_desktop_windows")}
          label={t("center_title")}
          isCollapsed={isSidebarCollapsed}
          isAccent={true}
        />
        <NavButton
          active={view === "vault"}
          onClick={() => setView("vault")}
          icon={t("icon_account_balance")}
          label={t("vault_title")}
          isCollapsed={isSidebarCollapsed}
          isAccent={true}
        />
        {session && localStorage.getItem("sanctuary_blacklisted") !== "true" && (
          <NavButton
            active={view === "nexus"}
            onClick={() => setView("nexus")}
            icon={t("icon_hub")}
            label={t("market_title")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
        )}
        <NavButton
          active={view === "playsets"}
          onClick={() => setView("playsets")}
          icon={t("icon_map")}
          label={t("playsets_title")}
          isCollapsed={isSidebarCollapsed}
          isAccent={true}
        />
        {session && localStorage.getItem("sanctuary_blacklisted") !== "true" && (
          <NavButton
            active={view === "GlobalFeed"}
            onClick={() => setView("GlobalFeed")}
            icon={t("icon_satellite_alt")}
            label={t("feed_title")}
            isCollapsed={isSidebarCollapsed}
            isAccent={true}
          />
        )}
        <NavButton
          active={view === "DbpfScout"}
          onClick={() => setView("DbpfScout")}
          icon={t("icon_track_changes")}
          label={t("radar_title")}
          isCollapsed={isSidebarCollapsed}
          isAccent={true}
        />
        <NavButton
          active={view === "lab"}
          onClick={() => setView("lab")}
          icon={t("icon_science")}
          label={t("lab_title")}
          isCollapsed={isSidebarCollapsed}
          isAccent={true}
        />
        <NavButton
          active={view === "CitizensWorkbench"}
          onClick={() => setView("CitizensWorkbench")}
          icon={t("icon_design_services")}
          label={t("title_sidebar")}
          isCollapsed={isSidebarCollapsed}
          isAccent={true}
        />
        <NavButton
          active={view === "backups"}
          onClick={() => setView("backups")}
          icon={t("icon_history")}
          label={t("backups_title")}
          isCollapsed={isSidebarCollapsed}
          isAccent={true}
        />
        {session && ["mason", "architect", "oversight", "wayfinder", "admin"].includes(userRole) && (
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
            />
          </div>
        )}
        {session && ["architect", "oversight", "wayfinder", "admin"].includes(userRole) && (
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
            />
          </div>
        )}
        {session && ["oversight", "wayfinder", "admin"].includes(userRole) && (
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
            />
          </div>
        )}
        {session && (userRole === "wayfinder" || userRole === "admin") && (
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
            />
          </div>
        )}
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
            />
          </div>
        )}
      </div>
      <div className="p-4 pb-14 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col gap-2 relative">
        <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-10" />

        <div className="relative group/nav mt-2">
          <button
            onClick={handleQuickLaunch}
            className={`w-full py-3 rounded-xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 border bg-transparent ${isPatchDetected || showDefconAlert ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]" : "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"}`}
          >
            {isSidebarCollapsed ? <span className="material-symbols-outlined !text-xl drop-shadow-md">{t("icon_rocket_launch")}</span> : <><span className="material-symbols-outlined !text-xl drop-shadow-md">{t("icon_rocket_launch")}</span> {t("sidebar_quick_launch")}</>}
          </button>
          {isSidebarCollapsed && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-4 py-2 bg-[var(--sidebar)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all duration-300 z-[1000] pointer-events-none">
              {t("sidebar_quick_launch")}
            </div>
          )}
        </div>
      </div>
    </nav >
  );
}
