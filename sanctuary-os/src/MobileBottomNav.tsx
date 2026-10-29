import { useState, useEffect } from 'react';
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { useLexicon } from './LexiconContext';
import { isRootDomain, scrollToLandingSection, getActiveLandingTab, normalizeLandingTab } from './utils/routingUtils';
import { isDesktop } from './utils/envUtils';
import { usePwaInstall, PwaInstallPrompt } from './utils/pwaManager';

function MobileNavItem({
  active,
  onClick,
  icon,
  label,
  iconColorClass,
  badge,
}: {
  active?: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  iconColorClass?: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden group border-0 cursor-pointer ${
        active
          ? 'sa-glass-active text-[var(--text)] opacity-100'
          : 'text-[var(--text)] opacity-80 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]'
      }`}
    >
      <div
        className="w-8 h-8 rounded-xl glass-surface flex items-center justify-center shrink-0 border transition-transform duration-300 group-hover:scale-105"
        style={{
          backgroundColor: 'var(--glass-card-icon-bg)',
          borderColor: active
            ? 'color-mix(in srgb, var(--accent) 45%, var(--glass-card-icon-border, rgba(255,255,255,0.22)))'
            : 'var(--glass-card-icon-border)',
          boxShadow: 'var(--glass-card-icon-shadow)',
        }}
      >
        <span
          className={`material-symbols-outlined !text-[18px] transition-all duration-300 shrink-0 relative z-10 ${
            iconColorClass
              ? iconColorClass
              : active
                ? 'text-[var(--accent)] opacity-100'
                : 'text-[var(--text)] opacity-85 group-hover:opacity-100 group-hover:text-[var(--accent)]'
          }`}
        >
          {icon}
        </span>
      </div>
      <span
        className="font-black capitalize tracking-[0.14em] truncate relative z-10 flex-1 text-left"
        style={{ fontSize: 'var(--fontSizeSidebar, 11px)' }}
      >
        {label}
      </span>
      {typeof badge === 'number' && badge > 0 && (
        <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[9px] font-black text-[var(--text)] opacity-85 shrink-0 flex items-center justify-center leading-none">
          {badge}
        </span>
      )}
    </button>
  );
}

export function MobileBottomNav({ view, setView }: { view: string, setView: (v: string) => void }) {
  const { t, osLogoUrl } = useLexicon();
  const session = useStore((state) => state.session);
  const userRole = useStore((state) => state.userRole);
  const osRole = useStore((state) => state.osRole);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const stagingDraftItems = useModalStore((state) => state.stagingDraftItems);
  const masonActiveTab = useStore((state: any) => state.masonActiveTab);
  const setMasonActiveTab = useStore((state: any) => state.setMasonActiveTab);
  const architectActiveTab = useStore((state: any) => state.architectActiveTab);
  const setArchitectActiveTab = useStore((state: any) => state.setArchitectActiveTab);
  const oversightActiveTab = useStore((state: any) => state.oversightActiveTab);
  const setOversightActiveTab = useStore((state: any) => state.setOversightActiveTab);
  const wayfinderActiveTab = useStore((state: any) => state.wayfinderActiveTab);
  const setWayfinderActiveTab = useStore((state: any) => state.setWayfinderActiveTab);
  const keepersActiveTab = useStore((state: any) => state.keepersActiveTab);
  const setKeepersActiveTab = useStore((state: any) => state.setKeepersActiveTab);
  const isConfigured = useStore((state: any) => state.isConfigured);
  const schemaFeatures = activeGameSchema?.features || { has_cc: true, has_saves: true };
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHubNavOpen, setIsHubNavOpen] = useState(false);
  const [activeLandingSection, setActiveLandingSection] = useState<string>(() => getActiveLandingTab());
  const { isStandalone, triggerInstall } = usePwaInstall();

  const [isLandingContext, setIsLandingContext] = useState<boolean>(() =>
    view === 'landing' || !isConfigured || (!isDesktop() && isRootDomain())
  );

  useEffect(() => {
    if (view === 'landing' || !isConfigured || (!isDesktop() && isRootDomain())) {
      setIsLandingContext(true);
    } else if (view !== 'KeepersCore' && view !== 'settings') {
      setIsLandingContext(false);
    }
  }, [view, isConfigured]);

  useEffect(() => {
    const handleLandingTab = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const rawTab = typeof detail === 'string' ? detail : detail?.tab || detail?.sectionId;
      if (rawTab) {
        setActiveLandingSection(normalizeLandingTab(rawTab));
      }
    };
    const handleHashChange = () => {
      if (window.location.hash) {
        setActiveLandingSection(normalizeLandingTab(window.location.hash));
      }
    };
    window.addEventListener('sanctuary-landing-tab', handleLandingTab);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('sanctuary-landing-tab', handleLandingTab);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const tabs: { id: string; icon: string; label: string; badge?: number }[] = [];

  let hubNavLabel = "";
  let hubNavIcon = "";

  if (isLandingContext) {
    tabs.push({ id: 'overview', icon: t("icon_dashboard", "dashboard"), label: t("overview", "Overview") });
    tabs.push({ id: 'workspaces', icon: t("icon_public", "public"), label: t("landing_workspaces", "Active Workspaces") });
    tabs.push({ id: 'news', icon: t("icon_newspaper", "newspaper"), label: t("landing_news_short", "News") });
    tabs.push({ id: 'directives', icon: t("icon_folder_special", "folder_special"), label: t("landing_directives_short", "Directives") });
    if (view === "KeepersCore") {
      hubNavLabel = t("sidebar_keepers_core", "Keepers Core");
      hubNavIcon = t("icon_terminal", "terminal");
      tabs.push({ id: 'hub_nav', icon: hubNavIcon, label: hubNavLabel });
    }
    tabs.push({ id: 'menu', icon: t("icon_menu", "menu"), label: t("ui_btn_more", "More") });
  } else {
    tabs.push({ id: 'dashboard', icon: t("icon_desktop_windows", "desktop_windows"), label: t("center_title", "Dashboard") });
    if (localStorage.getItem("sanctuary_blacklisted") !== "true") {
      tabs.push({ id: 'nexus', icon: t("icon_hub", "hub"), label: t("market_title", "The {Nexus}") });
      if (schemaFeatures.has_cc) {
        tabs.push({
          id: 'playsets',
          icon: t("icon_map", "map"),
          label: t("playsets_title", "{Blueprints}"),
          badge: (stagingDraftItems || []).length,
        });
      }
      tabs.push({ id: 'GlobalFeed', icon: t("icon_satellite_alt", "satellite_alt"), label: t("feed_title", "Feed") });
    }

    if (view === "MasonHub") { hubNavLabel = t("sidebar_mason_hub", "Workshop"); hubNavIcon = t("icon_construction", "construction"); }
    else if (view === "ArchitectHub") { hubNavLabel = t("sidebar_architect_hub", "Console"); hubNavIcon = t("icon_analytics", "analytics"); }
    else if (view === "Oversight") { hubNavLabel = t("wf_tab_command", "Command"); hubNavIcon = t("icon_security", "security"); }
    else if (view === "WayfinderHub") { hubNavLabel = t("ui_btn_operations", "Operations"); hubNavIcon = t("icon_terminal", "terminal"); }
    else if (view === "KeepersCore") { hubNavLabel = t("sidebar_keepers_core", "Keepers Core"); hubNavIcon = t("icon_terminal", "terminal"); }

    if (hubNavLabel) {
      tabs.push({ id: 'hub_nav', icon: hubNavIcon, label: hubNavLabel });
    }

    // Everyone gets the "More" menu
    tabs.push({ id: 'menu', icon: t("icon_menu", "menu"), label: t("ui_btn_more", "More") });
  }

  const handleTabClick = (tabId: string) => {
    if (tabId === 'menu') {
      setIsMenuOpen(!isMenuOpen);
      setIsHubNavOpen(false);
    } else if (tabId === 'hub_nav') {
      setIsHubNavOpen(!isHubNavOpen);
      setIsMenuOpen(false);
    } else if (isLandingContext) {
      setIsMenuOpen(false);
      setIsHubNavOpen(false);
      if (['overview', 'workspaces', 'news', 'directives', 'system_directives', 'download', 'support', 'feedback', 'contact', 'partners', 'partner_spokes', 'legal', 'eula', 'donations', 'donate'].includes(tabId)) {
        const norm = normalizeLandingTab(tabId);
        setActiveLandingSection(norm);
        setView('landing');
        setTimeout(() => scrollToLandingSection(tabId), 60);
      } else {
        setView(tabId);
      }
    } else {
      setIsMenuOpen(false);
      setIsHubNavOpen(false);
      setView(tabId);
    }
  };

  useEffect(() => {
    (window as any).__sanctuaryRenderWebGLGlass?.(true);
    const timer = window.setTimeout(() => {
      (window as any).__sanctuaryRenderWebGLGlass?.(true);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isMenuOpen, isHubNavOpen, view, activeLandingSection]);

  const hasRoleHubs =
    !isLandingContext || ["core_dev", "admin", "keeper"].includes(osRole);

  return (
    <>
      <PwaInstallPrompt />

      {/* Click-outside backdrop when Mobile Menu or Hub Navigation Drawer is open */}
      {(isMenuOpen || isHubNavOpen) && (
        <div
          className="md:hidden fixed inset-0 z-[999997] transition-opacity duration-300"
          style={{ backgroundColor: 'var(--glass-backdrop-dim, rgba(0, 0, 0, 0.28))' }}
          onClick={() => {
            setIsMenuOpen(false);
            setIsHubNavOpen(false);
          }}
        />
      )}

      {/* Transparent Safe-Area Edge-to-Edge Anchor for Mobile System Bars */}
      <div
        aria-hidden="true"
        className="md:hidden fixed bottom-0 left-0 right-0 pointer-events-none z-0"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          backgroundColor: 'transparent',
        }}
      />

      {/* Mobile Bottom Navigation Dock (WebGL2 3D Liquid Glass Engine) */}
      <div
        className="md:hidden fixed bottom-[calc(0.625rem+env(safe-area-inset-bottom,0px))] left-3.5 right-3.5 h-[68px] z-[999999] glass-panel sa-mobile-glass-overlay rounded-3xl border overflow-hidden"
        style={{
          backgroundColor: 'var(--glass-base-fill)',
          borderTopColor: 'var(--glass-border-top)',
          borderLeftColor: 'var(--glass-border-left)',
          borderRightColor: 'var(--glass-border-right)',
          borderBottomColor: 'var(--glass-border-bottom)',
          boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.36), var(--glass-inset-highlight)',
        }}
      >
        <div className="relative z-10 w-full h-full flex items-center justify-around px-2 py-1.5 gap-1.5">
          {tabs.map(tab => {
            const isLandingView = isLandingContext && view !== 'settings' && view !== 'KeepersCore';
            const isActive =
              (tab.id === 'menu' && isMenuOpen) ||
              (tab.id === 'hub_nav' && (isHubNavOpen || ["MasonHub", "ArchitectHub", "Oversight", "WayfinderHub", "KeepersCore"].includes(view))) ||
              (isLandingView && !isMenuOpen ? activeLandingSection === tab.id : view === tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`flex flex-col items-center justify-center h-full py-1.5 gap-1 rounded-2xl transition-all duration-300 relative cursor-pointer ${
                  isActive
                    ? 'sa-glass-active flex-[1.5] shrink-0 px-3 text-[var(--text)] opacity-100'
                    : 'flex-1 min-w-0 px-1 text-[var(--text)] opacity-70 hover:opacity-100'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <span
                    className={`material-symbols-outlined relative z-10 leading-none shrink-0 transition-all duration-300 !text-[20px] ${
                      isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text)] opacity-85'
                    }`}
                  >
                    {tab.icon}
                  </span>
                  {typeof tab.badge === "number" && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_22%,transparent)] text-[var(--text)] text-[8px] font-black flex items-center justify-center shadow-sm z-20">
                      {tab.badge}
                    </span>
                  )}
                </div>
                {isActive && (
                  <span className="text-[9.5px] font-bold text-center leading-tight capitalize tracking-[0.04em] text-[var(--text)] opacity-95 whitespace-nowrap relative z-10">
                    {tab.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile "More" Menu Drawer (WebGL2 3D Liquid Glass Engine) */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-[calc(82px+env(safe-area-inset-bottom,0px))] z-[999998] sa-mobile-drawer-wrapper transition-opacity duration-200 ${
          isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`mx-3.5 mb-2 glass-panel sa-mobile-glass-overlay rounded-3xl border overflow-hidden relative flex flex-col max-h-[68vh] ${
            isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            backgroundColor: 'var(--glass-base-fill)',
            borderTopColor: 'var(--glass-border-top)',
            borderLeftColor: 'var(--glass-border-left)',
            borderRightColor: 'var(--glass-border-right)',
            borderBottomColor: 'var(--glass-border-bottom)',
            boxShadow: 'var(--glass-outer-shadow), var(--glass-inset-highlight)',
          }}
        >
          <div className="relative z-10 flex flex-col w-full max-h-[68vh] overflow-hidden">
            {/* Grabber Handle */}
            <div className="w-10 h-1 rounded-full bg-[color-mix(in_srgb,var(--sidebartext)_16%,transparent)] mx-auto mt-2.5 mb-1 shrink-0" />

            {/* Sculpted Liquid Glass Brand Header Capsule (matching Sidebar.tsx) */}
            <div className="relative flex items-center justify-between px-3 py-2.5 mx-3 mt-1 mb-2 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--sidebartext)_14%,rgba(255,255,255,0.18))] shrink-0 overflow-hidden">
              <img
                src={osLogoUrl || "/icon.png"}
                alt={t("sidebar_app_title", "Sanctuary OS") as string}
                className="absolute top-1/2 -translate-y-1/2 pointer-events-none w-20 h-20 -right-3 opacity-[0.06] grayscale object-contain"
              />
              <div className="flex items-center gap-2.5 min-w-0 relative z-10">
                <div className="w-9 h-9 rounded-xl glass-panel border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_12px_rgba(0,0,0,0.2)] flex items-center justify-center shrink-0">
                  <img
                    src={osLogoUrl || "/icon.png"}
                    alt={t("sidebar_app_title", "Sanctuary OS") as string}
                    className="w-5 h-5 object-contain"
                  />
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <div className="text-[15px] tracking-tight capitalize leading-tight flex items-center gap-1 whitespace-nowrap">
                    <span className="font-black text-[var(--sidebartext)]">
                      {t("sidebar_app_title", "Sanctuary OS")?.split(' ')[0]}
                    </span>
                    <span className="font-light text-[var(--sidebartext)] opacity-75">
                      {t("sidebar_app_title", "Sanctuary OS")?.split(' ').slice(1).join(' ')}
                    </span>
                  </div>
                  <span className="text-[7.5px] font-black tracking-[0.14em] text-[var(--accent)] opacity-85 capitalize leading-snug mt-0.5">
                    {t("sidebar_app_subtitle_0", "No Black Boxes")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--sidebartext)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center text-[var(--sidebartext)] opacity-75 hover:opacity-100 hover:text-[var(--accent)] transition-all shrink-0 relative z-10 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_close", "close")}
                </span>
              </button>
            </div>

            {/* Scrollable Navigation Items */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3.5 pt-0.5 flex flex-col gap-1">
              {!isDesktop() && !isStandalone && (
                <MobileNavItem
                  onClick={() => {
                    setIsMenuOpen(false);
                    triggerInstall();
                  }}
                  icon={t("icon_add_to_home_screen", "add_to_home_screen")}
                  label={t("pwa_btn_install", "Install App")}
                />
              )}

              {isLandingContext && (
                <>
                  <MobileNavItem
                    active={view === 'landing' && activeLandingSection === 'download'}
                    onClick={() => handleTabClick('download')}
                    icon={t("icon_download", "download")}
                    label={t("landing_download_sidebar", "Download Sanctuary OS")}
                  />
                  <MobileNavItem
                    active={view === 'landing' && activeLandingSection === 'support'}
                    onClick={() => handleTabClick('support')}
                    icon={t("icon_support_agent", "support_agent")}
                    label={t("landing_nav_feedback", "Feedback & Support")}
                  />
                  <MobileNavItem
                    active={view === 'landing' && activeLandingSection === 'partners'}
                    onClick={() => handleTabClick('partners')}
                    icon={t("icon_handshake", "handshake")}
                    label={t("landing_partners_tab", "Partner Spokes")}
                  />
                  <MobileNavItem
                    active={view === 'landing' && activeLandingSection === 'legal'}
                    onClick={() => handleTabClick('legal')}
                    icon={t("icon_gavel", "gavel")}
                    label={t("landing_legal_tab", "Legal")}
                  />
                  <MobileNavItem
                    active={view === 'landing' && activeLandingSection === 'donations'}
                    onClick={() => handleTabClick('donations')}
                    icon={t("icon_volunteer_activism", "volunteer_activism")}
                    label={t("wf_tab_donations", "Donations")}
                  />
                </>
              )}

              {!isLandingContext && (
                <MobileNavItem
                  onClick={() => {
                    setIsMenuOpen(false);
                    if (isDesktop()) {
                      setView("landing");
                    } else {
                      window.location.href = "/";
                    }
                  }}
                  icon={t("icon_public", "public")}
                  label={t("return_to_hub", "Return to the Hub") || t("workspace_sidebar", "Workspaces")}
                />
              )}

              {!session?.user && (
                <MobileNavItem
                  onClick={() => {
                    setIsMenuOpen(false);
                    localStorage.setItem("sanctuary_show_login", "true");
                    localStorage.removeItem("sanctuary_login_bypassed");
                    window.dispatchEvent(new CustomEvent("sanctuary-open-login"));
                  }}
                  icon={t("icon_key", "key")}
                  label={t("sidebar_signin", "Authenticate")}
                />
              )}

              <MobileNavItem
                active={view === 'settings'}
                onClick={() => {
                  setIsMenuOpen(false);
                  handleTabClick('settings');
                }}
                icon={t("icon_settings", "settings")}
                label={t("term_settings", "Settings")}
              />

              {hasRoleHubs && (
                <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_14%,transparent)] to-transparent my-1.5 shrink-0" />
              )}

              {!isLandingContext && (
                <MobileNavItem
                  active={view === 'MasonHub'}
                  onClick={() => handleTabClick('MasonHub')}
                  icon={t("icon_construction", "construction")}
                  label={t("mason_hub_title", "{Mason} Workshop")}
                  iconColorClass="text-[var(--warning)]"
                />
              )}

              {["architect", "oversight", "wayfinder", "admin"].includes(userRole) && !isLandingContext && (
                <MobileNavItem
                  active={view === 'ArchitectHub'}
                  onClick={() => handleTabClick('ArchitectHub')}
                  icon={t("icon_analytics", "analytics")}
                  label={t("hub_title", "Moderator Console")}
                />
              )}

              {["oversight", "wayfinder", "admin"].includes(userRole) && !isLandingContext && (
                <MobileNavItem
                  active={view === 'Oversight'}
                  onClick={() => handleTabClick('Oversight')}
                  icon={t("icon_security", "security")}
                  label={t("sa_title", "Admin Command")}
                  iconColorClass="text-[var(--danger)]"
                />
              )}

              {(userRole === "wayfinder" || userRole === "admin") && !isLandingContext && (
                <MobileNavItem
                  active={view === 'WayfinderHub'}
                  onClick={() => handleTabClick('WayfinderHub')}
                  icon={t("icon_terminal", "terminal")}
                  label={t("wf_hub_title", "Wayfinder Operations")}
                />
              )}

              {["core_dev", "admin", "keeper"].includes(osRole) && (
                <MobileNavItem
                  active={view === 'KeepersCore'}
                  onClick={() => handleTabClick('KeepersCore')}
                  icon={t("icon_admin_panel_settings", "admin_panel_settings")}
                  label={t("sidebar_keepers_core", "Keepers Core")}
                  iconColorClass="text-[var(--success)]"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hub Navigation Drawer (WebGL2 3D Liquid Glass Engine) */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-[calc(82px+env(safe-area-inset-bottom,0px))] z-[999998] sa-mobile-drawer-wrapper transition-opacity duration-200 ${
          isHubNavOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`mx-3.5 mb-2 glass-panel sa-mobile-glass-overlay rounded-3xl border overflow-hidden relative flex flex-col max-h-[calc(100dvh-120px)] ${
            isHubNavOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            backgroundColor: 'var(--glass-base-fill)',
            borderTopColor: 'var(--glass-border-top)',
            borderLeftColor: 'var(--glass-border-left)',
            borderRightColor: 'var(--glass-border-right)',
            borderBottomColor: 'var(--glass-border-bottom)',
            boxShadow: 'var(--glass-outer-shadow), var(--glass-inset-highlight)',
          }}
        >
          <div className="relative z-10 flex flex-col w-full max-h-[calc(100dvh-120px)] overflow-hidden">
            {/* Grabber Handle */}
            <div className="w-10 h-1 rounded-full bg-[color-mix(in_srgb,var(--sidebartext)_16%,transparent)] mx-auto mt-2.5 mb-1 shrink-0" />

            {/* Sculpted Hub Header Capsule */}
            <div className="relative flex items-center justify-between px-3 py-2.5 mx-3 mt-1 mb-2 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--sidebartext)_14%,rgba(255,255,255,0.18))] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl glass-panel border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_12px_rgba(0,0,0,0.2)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[var(--accent)] !text-[18px]">
                    {hubNavIcon || t("icon_hub", "hub")}
                  </span>
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-[14px] font-black tracking-wide capitalize text-[var(--sidebartext)] truncate">
                    {hubNavLabel}
                  </span>
                  <span className="text-[7.5px] font-black tracking-[0.14em] text-[var(--accent)] opacity-85 capitalize leading-snug">
                    {t("sidebar_app_title", "Sanctuary OS")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHubNavOpen(false)}
                className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--sidebartext)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center text-[var(--sidebartext)] opacity-75 hover:opacity-100 hover:text-[var(--accent)] transition-all shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_close", "close")}
                </span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4 pt-0.5 flex flex-col gap-1 w-full">
              {view === "MasonHub" && [
                { id: "command_center", icon: t("icon_desktop_windows", "desktop_windows"), label: (t("wf_tab_command", "Command") || "Command Center").replace(/^[^\w]*/, '').trim() },
                { id: "sandbox", icon: t("icon_deployed_code", "deployed_code"), label: (t("term_mods", "Mods") || "Registry").replace(/^[^\w]*/, '').trim() },
                { id: "nexus", icon: t("icon_hub", "hub"), label: (t("tab_nexus", "{Nexus}") || "Nexus").replace(/^[^\w]*/, '').trim() },
                { id: "chameleons", icon: t("icon_palette", "palette"), label: (t("tab_aesthetics", "Aesthetics") || "Aesthetics").replace(/^[^\w]*/, '').trim() },
                { id: "collections", icon: t("icon_collections_bookmark", "collections_bookmark"), label: (t("tab_cc", "Collections") || "Collections").replace(/^[^\w]*/, '').trim() },
                { id: "posts", icon: t("icon_edit_document", "edit_document"), label: (t("tab_posts", "{Dispatches}") || "Posts").replace(/^[^\w]*/, '').trim() },
                { id: "bug_reports", icon: t("icon_bug_report", "bug_report"), label: (t("stat_bugs", "Reports") || "Bug Reports").replace(/^[^\w]*/, '').trim() },
              ].map(tab => (
                <MobileNavItem
                  key={tab.id}
                  active={masonActiveTab === tab.id || (tab.id === "sandbox" && masonActiveTab === "registry")}
                  onClick={() => {
                    setMasonActiveTab(tab.id);
                    setIsHubNavOpen(false);
                  }}
                  icon={tab.icon}
                  label={tab.label}
                />
              ))}

              {view === "ArchitectHub" && [
                { id: "command_center", icon: t("icon_desktop_windows", "desktop_windows"), label: (t("wf_tab_command", "Command") || "Command Center").replace(/^[^\w]*/, '').trim() },
                { id: "registry", icon: t("icon_inventory_2", "inventory_2"), label: (t("term_mods", "Mods") || "Registry").replace(/^[^\w]*/, '').trim() },
                { id: "queue", icon: t("icon_search", "search"), label: (t("tab_queue", "Scanner") || "Queue").replace(/^[^\w]*/, '').trim() },
                { id: "lab", icon: t("icon_monitor_heart", "monitor_heart"), label: (t("tab_diagnostics", "Diagnostics") || "Diagnostics").replace(/^[^\w]*/, '').trim() },
                { id: "collections", icon: t("icon_collections_bookmark", "collections_bookmark"), label: (t("tab_cc", "Collections") || "Collections").replace(/^[^\w]*/, '').trim() },
                { id: "mason_queue", icon: t("icon_construction", "construction"), label: (t("mason", "{Mason}") || "Mason").replace(/^[^\w]*/, '').trim() },
                { id: "template_oversight", icon: t("icon_data_object", "data_object"), label: (t("ql_templates", "Templates") || "Templates").replace(/^[^\w]*/, '').trim() },
                { id: "nexus_reports", icon: t("icon_flag", "flag"), label: (t("stat_bugs", "Reports") || "Bug Reports").replace(/^[^\w]*/, '').trim() },
                { id: "support_tickets", icon: t("icon_local_activity", "local_activity"), label: (t("wf_tab_tickets", "Support") || "Tickets").replace(/^[^\w]*/, '').trim() },
              ].map(tab => (
                <MobileNavItem
                  key={tab.id}
                  active={architectActiveTab === tab.id}
                  onClick={() => {
                    setArchitectActiveTab(tab.id);
                    setIsHubNavOpen(false);
                  }}
                  icon={tab.icon}
                  label={tab.label}
                />
              ))}

              {view === "Oversight" && [
                { id: "command_center", icon: t("icon_desktop_windows", "desktop_windows"), label: (t("wf_tab_command", "Command") || "Command Center").replace(/^[^\w]*/, '').trim() },
                { id: "oversight_comms", icon: t("icon_satellite_alt", "satellite_alt"), label: (t("wf_tab_dispatch", "Dispatch") || "Dispatch").replace(/^[^\w]*/, '').trim() },
                { id: "identities", icon: t("icon_group", "group"), label: (t("tab_identities", "Identity") || "Identities").replace(/^[^\w]*/, '').trim() },
                { id: "compliance", icon: t("icon_policy", "policy"), label: (t("tab_compliance", "Compliance") || "Compliance").replace(/^[^\w]*/, '').trim() },
                { id: "malware_oversight", icon: t("icon_coronavirus", "coronavirus"), label: (t("rating_malware", "Malware") || "Malware").replace(/^[^\w]*/, '').trim() },
                { id: "sanctuary_tickets", icon: t("icon_local_activity", "local_activity"), label: (t("wf_tab_tickets", "Support") || "Tickets").replace(/^[^\w]*/, '').trim() },
                { id: "mass_update", icon: t("icon_dynamic_feed", "dynamic_feed"), label: (t("tab_mass_update", "Mass Update") || "Mass Update").replace(/^[^\w]*/, '').trim() },
                { id: "game_versions", icon: t("icon_settings", "settings"), label: (t("tab_game_versions", "Management") || "Game Versions").replace(/^[^\w]*/, '').trim() },
                { id: "support_settings", icon: t("icon_support_agent", "support_agent"), label: (t("term_settings", "Settings") || "Support").replace(/^[^\w]*/, '').trim() },
                { id: "audit_logs", icon: t("icon_history", "history"), label: (t("tab_audit", "Logs") || "Audit Logs").replace(/^[^\w]*/, '').trim() },
              ].map(tab => (
                <MobileNavItem
                  key={tab.id}
                  active={oversightActiveTab === tab.id}
                  onClick={() => {
                    setOversightActiveTab(tab.id);
                    setIsHubNavOpen(false);
                  }}
                  icon={tab.icon}
                  label={tab.label}
                />
              ))}

              {view === "WayfinderHub" && [
                { id: "command_center", icon: t("icon_desktop_windows", "desktop_windows"), label: (t("wf_tab_command", "Command") || "Command Center").replace(/^[^\w]*/, '').trim() },
                { id: "wf_comms_title", icon: t("icon_satellite_alt", "satellite_alt"), label: (t("wf_tab_dispatch", "Dispatch") || "Dispatch").replace(/^[^\w]*/, '').trim() },
                { id: "sanctuary_tickets", icon: t("icon_local_activity", "local_activity"), label: (t("wf_tab_tickets", "Support") || "Tickets").replace(/^[^\w]*/, '').trim() },
                { id: "identities", icon: t("icon_group", "group"), label: (t("tab_identities", "Identity") || "Identities").replace(/^[^\w]*/, '').trim() },
                { id: "compliance", icon: t("icon_policy", "policy"), label: (t("tab_compliance", "Compliance") || "Compliance").replace(/^[^\w]*/, '').trim() },
                { id: "malware_oversight", icon: t("icon_coronavirus", "coronavirus"), label: (t("rating_malware", "Malware") || "Malware").replace(/^[^\w]*/, '').trim() },
                { id: "reports", icon: t("icon_flag", "flag"), label: (t("stat_bugs", "Reports") || "Reports").replace(/^[^\w]*/, '').trim() },
                { id: "audit_logs", icon: t("icon_history", "history"), label: (t("tab_audit", "Logs") || "Audit Logs").replace(/^[^\w]*/, '').trim() },
                { id: "support_settings", icon: t("icon_support_agent", "support_agent"), label: (t("term_settings", "Settings") || "Support Settings").replace(/^[^\w]*/, '').trim() },
                { id: "ide", icon: t("icon_data_object", "data_object"), label: (t("wf_tab_spoke_control", "Spoke Control") || "Spoke Control").replace(/^[^\w]*/, '').trim() },
                { id: "chameleons", icon: t("icon_palette", "palette"), label: (t("wf_tab_spoke_aesthetics", "Spoke Aesthetics") || "Spoke Aesthetics").replace(/^[^\w]*/, '').trim() },
              ].map(tab => (
                <MobileNavItem
                  key={tab.id}
                  active={wayfinderActiveTab === tab.id}
                  onClick={() => {
                    setWayfinderActiveTab(tab.id);
                    setIsHubNavOpen(false);
                  }}
                  icon={tab.icon}
                  label={tab.label}
                />
              ))}

              {view === "KeepersCore" && [
                { id: "command_center", icon: t("icon_desktop_windows", "desktop_windows"), label: (t("wf_tab_command", "Command") || "Command Center").replace(/^[^\w]*/, '').trim() },
                { id: "keepers_comms", icon: t("icon_satellite_alt", "satellite_alt"), label: (t("wf_tab_dispatch", "Dispatch") || "Dispatch").replace(/^[^\w]*/, '').trim() },
                { id: "web_directives", icon: t("icon_public", "public"), label: t("keepers_tab_web_landing", "Web Landing") },
                { id: "active_games", icon: t("icon_dns", "dns"), label: t("keepers_tab_partner_spokes", "Partner Spokes") || "Partner Spokes" },
                { id: "identities", icon: t("icon_group", "group"), label: t("citizen_oversight", "{Citizen} Management") || "Citizen Oversight" },
                { id: "heuristics", icon: t("icon_shield_lock", "shield_lock"), label: t("core_heuristics_tab", "Core Heuristics") || "Core Heuristics" },
                { id: "support", icon: t("icon_support_agent", "support_agent"), label: t("support_tickets", "Support Center") || "Support Center" },
                { id: "support_settings", icon: t("icon_support_agent", "support_agent"), label: (t("term_settings", "Settings") || "Support Settings").replace(/^[^\w]*/, '').trim() },
                { id: "chameleons", icon: t("icon_palette", "palette"), label: (t("keepers_tab_core_aesthetics", "Core Aesthetics") || "Core Aesthetics").replace(/^[^\w]*/, '').trim() },
              ].map(tab => (
                <MobileNavItem
                  key={tab.id}
                  active={keepersActiveTab === tab.id}
                  onClick={() => {
                    setKeepersActiveTab(tab.id);
                    setIsHubNavOpen(false);
                  }}
                  icon={tab.icon}
                  label={tab.label}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
