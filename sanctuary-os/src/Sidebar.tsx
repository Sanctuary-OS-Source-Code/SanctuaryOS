import React from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { CustomDropdown, HoverTooltip } from './shared';
import { invoke } from '@tauri-apps/api/core';

function NavButton({ active, onClick, icon, label, isCollapsed, isAccent = false, setHoveredTooltip }: any) {
  const isActive = active;
  return (
    <div className="px-4 relative group/navbtn">
      {isActive && (
        <div className="absolute -left-1 inset-y-0 w-0 bg-[var(--accent)] rounded-r-full shadow-[0_0_5px_var(--accent)]" />
      )}
      <button
        onMouseEnter={(e) => {
          if (isCollapsed) {
            const rect = e.currentTarget.getBoundingClientRect();
            setHoveredTooltip({ label, top: rect.top + rect.height / 2 });
          }
        }}
        onMouseLeave={() => {
          if (isCollapsed) setHoveredTooltip(null);
        }}
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group
          ${isActive
            ? (isAccent ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] backdrop-blur-md" : "bg-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)] text-[var(--sidebartext)]")
            : (isAccent ? "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--accent)] border-transparent" : "text-[var(--sidebartext)] opacity-60 hover:bg-[color-mix(in_srgb,var(--sidebartext)_5%,transparent)] hover:opacity-100 border-transparent")
          } ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        {/* Sweep Micro-Animation on Hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />

        <span
          className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 relative z-10 ${isActive ? "scale-110" : "group-hover:scale-110"}`}
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
  const setKeepersActiveTab = useStore((state) => state.setKeepersActiveTab);
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
        className="absolute inset-x-0 bottom-0 z-[-1] backdrop-blur-3xl border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all duration-500 shadow-[4px_0_30px_rgba(0,0,0,0.05)]"
        style={{ top: '50px', backgroundColor: "color-mix(in srgb, var(--sidebar) 8%, transparent)" }}
      />

      <div className="h-[50px] shrink-0" />


      <div className="flex-1 pt-2 pb-2 space-y-0.5 overflow-y-auto accent-scrollbar">
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
          <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
            <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_5%,transparent)] via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent" />
            {!isSidebarCollapsed && (
              <div className="px-6 flex items-center gap-2 mb-2">
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 uppercase tracking-widest truncate">
                  {t("mason")}
                </p>
              </div>
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
          <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
            <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_5%,transparent)] via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent" />
            {!isSidebarCollapsed && (
              <div className="px-6 flex items-center gap-2 mb-2">
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 uppercase tracking-widest truncate">
                  {t("tab_architect")}
                </p>
              </div>
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
          <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
            <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_5%,transparent)] via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent" />
            {!isSidebarCollapsed && (
              <div className="px-6 flex items-center gap-2 mb-2">
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 uppercase tracking-widest truncate">
                  {t("stat_oversight")}
                </p>
              </div>
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
          <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
            <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_5%,transparent)] via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent" />
            {!isSidebarCollapsed && (
              <div className="px-6 flex items-center gap-2 mb-2">
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 uppercase tracking-widest truncate">
                  {t("sidebar_wayfinder_tools")}
                </p>
              </div>
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
          <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
            <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_30%,transparent)] to-transparent" />
            {!isSidebarCollapsed && (
              <div className="px-6 flex items-center gap-2 mb-2">
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 uppercase tracking-widest truncate drop-shadow-sm">
                  Sanctuary Foundry
                </p>
              </div>
            )}
            <NavButton
              active={view === "KeepersCore"}
              onClick={() => {
                setView("KeepersCore");
                if (setKeepersActiveTab) setKeepersActiveTab("command_center");
              }}
              icon="admin_panel_settings"
              label="Keepers Core"
              isCollapsed={isSidebarCollapsed}
              isAccent={true}
              setHoveredTooltip={setHoveredTooltip}
            />
          </div>
        )}

        <div className={`my-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
          {!session && (
            <div className="my-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] pt-4">
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
        <div className="p-4 pb-4 relative z-30 bg-gradient-to-t from-[var(--sidebar)] to-transparent">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent opacity-50" />

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
              className={`relative w-full py-4 rounded-[var(--radius)] bg-transparent backdrop-blur-md text-[10px] font-black uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 shadow-lg group/btn overflow-hidden border ${isPatchDetected || showDefconAlert
                ? "border-red-500/[30%] text-[var(--danger)] hover:border-red-500/[50%] hover:bg-red-500/[10%]"
                : "border-[var(--success)]/[30%] text-[var(--success)] hover:border-[var(--success)]/[50%] hover:bg-[var(--success)]/[10%]"
                }`}
            >
              {/* Dynamic Sweep effect inside button */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 ease-in-out" />

              <span className="relative z-10 material-symbols-outlined !text-[18px] drop-shadow-md transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:scale-110">
                {t("icon_rocket_launch")}
              </span>
              {!isSidebarCollapsed && (
                <span className="relative z-10 drop-shadow-md">
                  {t("sidebar_quick_launch")}
                </span>
              )}
            </button>
          </div>
        </div>
      )}





      {isSidebarCollapsed && hoveredTooltip && createPortal(
        <div
          className="fixed left-[96px] z-[150000] flex flex-col items-start justify-center glass-panel !bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] px-5 py-3 max-w-[320px] w-max pointer-events-none shadow-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] animate-in fade-in slide-in-from-left-2"
          style={{ top: hoveredTooltip.top, transform: 'translateY(-50%)' }}
        >
          <div className="relative z-10 flex flex-col items-start gap-1 w-full">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] flex items-start text-left gap-2 whitespace-pre-line text-[var(--text)]">
              <span>{hoveredTooltip.label}</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </nav >
  );
}