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
            className="font-black capitalize tracking-[0.15em] truncate leading-none pt-0.5 relative z-10"
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
      className={`${isSidebarCollapsed ? 'w-[80px]' : ''} flex-shrink-0 h-full flex flex-col relative z-20 transition-all duration-500 rounded-3xl border border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)] backdrop-blur-[var(--glassBlur)]`}
      style={{
        width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)',
        minWidth: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)',
        background: `linear-gradient(135deg, color-mix(in srgb, var(--text) 5%, transparent) 0%, transparent 100%), color-mix(in srgb, var(--sidebar) calc(var(--glassOpacityDecimal) * 100%), transparent)`
      }}
    >
      {/* Revolutionary Watermark Layout */}
      <div
        className="relative flex flex-col justify-center cursor-pointer hover:bg-[color-mix(in_srgb,var(--sidebartext)_5%,transparent)] transition-colors duration-500 z-[100] shrink-0 group/logo overflow-hidden rounded-t-3xl h-[70px] mb-2"
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      >
        {/* Responsive Watermark Background Icon */}
        <img
          src="/icon.png"
          alt="Watermark"
          className={`absolute top-1/2 -translate-y-1/2 transition-all duration-700 pointer-events-none ${isSidebarCollapsed
            ? 'w-8 h-8 left-1/2 -translate-x-1/2 opacity-100 drop-shadow-sm group-hover/logo:scale-110 group-hover/logo:drop-shadow-[0_0_8px_var(--accent)]'
            : 'w-24 h-24 -left-4 opacity-[0.06] grayscale group-hover/logo:grayscale-0 group-hover/logo:opacity-[0.15] group-hover/logo:scale-110 group-hover/logo:rotate-12 group-hover/logo:drop-shadow-[0_0_15px_var(--accent)]'
            }`}
        />

        <div className={`flex items-center w-full relative z-10 transition-all duration-500 ${isSidebarCollapsed ? 'justify-center' : 'justify-start px-6'}`}>
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="flex flex-col pt-0">
                {/* Two-Tone Title */}
                <h1 className="text-[19px] tracking-tighter capitalize leading-none drop-shadow-sm group-hover/logo:opacity-100 transition-colors flex items-center gap-1 whitespace-nowrap">
                  <span className="font-black text-[var(--sidebartext)]">{t("sidebar_app_title")?.split(' ')[0]}</span>
                  <span className="font-light text-[var(--sidebartext)] opacity-70">{t("sidebar_app_title")?.split(' ').slice(1).join(' ')}</span>
                </h1>
                {/* Subtitle */}
                <span className="text-[7px] font-black tracking-[0.4em] text-[var(--accent)] opacity-70 capitalize leading-none mt-1 whitespace-nowrap">
                  {t(`sidebar_app_subtitle_${subtitleIndex}`)}
                </span>
              </div>
            </div>
          )}

          {/* Explicit Collapse Action Button */}
          {!isSidebarCollapsed && (
            <div className="ml-auto w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)] bg-[color-mix(in_srgb,var(--sidebartext)_5%,transparent)] flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-all hover:bg-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--sidebartext)_20%,transparent)] shadow-lg">
              <span className="material-symbols-outlined text-[16px] text-[var(--sidebartext)] opacity-70 group-hover/logo:opacity-100 transition-opacity">keyboard_double_arrow_left</span>
            </div>
          )}
        </div>
      </div>

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
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate">
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
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate">
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
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate">
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
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate">
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
                <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate drop-shadow-sm">
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
        <div className="p-4 pb-4 relative z-30">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent opacity-50" />

          <div className="relative group/nav mt-2">
            <button
              onMouseEnter={(e) => {
                if (isSidebarCollapsed) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredTooltip({ label: t("sidebar_quick_launch"), top: rect.top + rect.height / 2 });
                }
              }}
              onMouseLeave={() => {
                if (isSidebarCollapsed) setHoveredTooltip(null);
              }}
              onClick={handleQuickLaunch}
              className={`relative w-full py-4 rounded-[var(--radius)] bg-transparent backdrop-blur-md text-[10px] font-black capitalize tracking-[0.2em] hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 shadow-lg group/btn overflow-hidden border ${isPatchDetected || showDefconAlert
                ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                : "border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"
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
          className="fixed left-[96px] z-[150000] flex flex-col items-start justify-center px-5 py-3 max-w-[320px] w-max pointer-events-none shadow-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl overflow-hidden bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md animate-in fade-in slide-in-from-left-2"
          style={{ top: hoveredTooltip.top, transform: 'translateY(-50%)' }}
        >
          {/* 3D Glass Inner Top Highlight */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent opacity-60 pointer-events-none z-0" />

          {/* Ultra-faint Noise Texture for Glass Material realism */}
          <div className="absolute inset-0 z-0 opacity-[0.05] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />

          <div className="relative z-10 flex flex-col items-start gap-1 w-full">
            <div className="text-[10px] font-black capitalize tracking-[0.2em] flex items-start text-left gap-2 whitespace-pre-line text-[var(--text)]">
              <span>{hoveredTooltip.label}</span>
            </div>
          </div>
        </div>, document.body
      )}
    </nav >
  );
}
