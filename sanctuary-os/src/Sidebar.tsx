import React from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { isDesktop } from "./utils/envUtils";
import { isRootDomain, scrollToLandingSection, getActiveLandingTab, normalizeLandingTab } from "./utils/routingUtils";
import { openSanctuaryLogin } from "./AuthWrapper";

function NavButton({ active, onClick, icon, label, isCollapsed, isAccent = false, badge = 0, setHoveredTooltip }: any) {
  const isActive = active;
  return (
    <div className="px-3.5 relative group/navbtn">
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
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden group border-0 cursor-pointer
          ${isActive
            ? "sa-glass-active text-[var(--sidebartext)] opacity-100"
            : (isAccent
                ? "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--sidebartext)_6%,transparent)]"
                : "text-[var(--sidebartext)] opacity-60 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--sidebartext)_5%,transparent)]")
          } ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        <div className="relative flex items-center justify-center shrink-0">
          <span
            className={`material-symbols-outlined !text-[20px] transition-all duration-300 shrink-0 relative z-10 ${isActive ? "text-[var(--accent)]" : "group-hover:text-[var(--accent)]"}`}
          >
            {icon}
          </span>
          {isCollapsed && badge > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-md glass-surface border border-[color-mix(in_srgb,var(--sidebartext)_22%,transparent)] text-[var(--sidebartext)] text-[8px] font-black flex items-center justify-center z-20">
              {badge}
            </span>
          )}
        </div>
        {!isCollapsed && (
          <span
            className="font-black capitalize tracking-[0.14em] truncate relative z-10 flex-1 text-left"
            style={{ fontSize: "var(--fontSizeSidebar, 11px)" }}
          >
            {label}
          </span>
        )}
        {!isCollapsed && badge > 0 && (
          <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--sidebartext)_16%,transparent)] text-[9px] font-black text-[var(--sidebartext)] opacity-85 shrink-0 flex items-center justify-center leading-none">
            {badge}
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
  const { t, osLogoUrl } = useLexicon();
  const session = useStore((state) => state.session);
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const userRole = useStore((state) => state.userRole);
  const osRole = useStore((state) => state.osRole);
  const isPatchDetected = useStore((state) => state.isPatchDetected);
  const isConfigured = useStore((state) => state.isConfigured);
  const { showDefconAlert, stagingDraftItems } = useModalStore();
  const [, setGlobalGames] = React.useState<any[]>([]);
  const [hoveredTooltip, setHoveredTooltip] = React.useState<{ label: string, top: number } | null>(null);
  const [activeLandingSection, setActiveLandingSection] = React.useState<string>(() => getActiveLandingTab());
  const [hasLinkedMasonRecord, setHasLinkedMasonRecord] = React.useState<boolean>(false);
  const [isMasonRecordVerified, setIsMasonRecordVerified] = React.useState<boolean>(false);

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const schemaFeatures = activeGameSchema?.features || { has_cc: true, has_saves: true };

  React.useEffect(() => {
    import('./supabase').then(({ supabase }) => {
      supabase.from('sanctuary_games').select('id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor').then(({ data }) => {
        if (data) setGlobalGames(data);
      });
    });
  }, []);

  React.useEffect(() => {
    if (!session?.user?.id) {
      setHasLinkedMasonRecord(false);
      setIsMasonRecordVerified(false);
      return;
    }
    import('./supabase').then(({ supabase }) => {
      supabase.from('masons').select('id, is_verified').eq('profile_id', session.user.id).maybeSingle().then(({ data }) => {
        setHasLinkedMasonRecord(!!data);
        setIsMasonRecordVerified(!!data?.is_verified);
      });
    });
  }, [session?.user?.id, activeWorkspaceId]);

  const isVerifiedMason = hasLinkedMasonRecord && (
    isMasonRecordVerified ||
    ["mason", "architect", "senior_architect", "oversight", "wayfinder", "admin"].includes(userRole) ||
    ["core_dev", "admin", "keeper"].includes(osRole)
  );

  const [isLandingContext, setIsLandingContext] = React.useState<boolean>(() =>
    view === "landing" || !isConfigured || (!isDesktop() && isRootDomain())
  );

  React.useEffect(() => {
    if (view === "landing" || !isConfigured || (!isDesktop() && isRootDomain())) {
      setIsLandingContext(true);
    } else if (view !== "KeepersCore" && view !== "settings") {
      setIsLandingContext(false);
    }
  }, [view, isConfigured]);

  React.useEffect(() => {
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

  return (
    <nav
      className={`hidden md:flex ${isSidebarCollapsed ? 'w-[80px]' : ''} flex-shrink-0 md:my-6 md:h-[calc(100%-3rem)] flex-col relative z-20 transition-[width,min-width,border-color,box-shadow] duration-500 rounded-3xl border overflow-hidden firefox-safe-glass`}
      style={{
        width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)',
        minWidth: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)',
        backgroundColor: 'var(--glass-sidebar-bg)',
        borderTopColor: 'var(--glass-border-top)',
        borderLeftColor: 'var(--glass-border-left)',
        borderRightColor: 'var(--glass-border-right)',
        borderBottomColor: 'var(--glass-border-bottom)',
        boxShadow: 'var(--glass-sidebar-shadow, var(--glass-outer-shadow), var(--glass-inset-highlight))'
      }}
    >
      <div className={`flex flex-col h-full w-full relative z-10`}>
        {/* Brand Header (Sculpted Liquid Glass Title / Subtitle Capsule) */}
        <div
          className={`relative flex items-center cursor-pointer glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--sidebartext)_14%,rgba(255,255,255,0.18))] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.28))] transition-all duration-300 z-[100] shrink-0 group/logo overflow-hidden mx-3.5 mt-3.5 mb-2 ${isSidebarCollapsed ? 'justify-center p-2 min-h-[52px]' : 'justify-between px-3 py-2.5 min-h-[62px]'}`}
          onClick={() => {
            if (isRootDomain() && (!isDesktop() || !isConfigured)) {
              setView("landing");
              setIsSidebarCollapsed(!isSidebarCollapsed);
            } else {
              setIsSidebarCollapsed(!isSidebarCollapsed);
            }
          }}
        >
          {/* Ambient Watermark Background Icon */}
          {!isSidebarCollapsed && (
            <img
              src={osLogoUrl || "/icon.png"}
              alt={t("sidebar_app_title", "Sanctuary OS") as string}
              className="absolute top-1/2 -translate-y-1/2 transition-all duration-700 pointer-events-none w-24 h-24 -right-4 opacity-[0.06] grayscale group-hover/logo:grayscale-0 group-hover/logo:opacity-[0.14] group-hover/logo:scale-110 group-hover/logo:rotate-12 object-contain"
            />
          )}

          <div className={`flex items-center w-full relative z-10 transition-all duration-500 ${isSidebarCollapsed ? 'justify-center' : 'justify-between gap-2.5 min-w-0'}`}>
            {/* Sculpted Glass Icon Tile */}
            <div className="w-9 h-9 rounded-xl glass-panel border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_12px_rgba(0,0,0,0.2)] flex items-center justify-center shrink-0 transition-transform duration-300 group-hover/logo:scale-105">
              <img
                src={osLogoUrl || "/icon.png"}
                alt={t("sidebar_app_title", "Sanctuary OS") as string}
                className="w-5 h-5 object-contain"
              />
            </div>

            {!isSidebarCollapsed && (
              <div className="flex flex-col justify-center min-w-0 flex-1">
                {/* Two-Tone Title */}
                <h1 className="text-[16px] tracking-tight capitalize leading-tight group-hover/logo:opacity-100 transition-colors flex items-center gap-1 whitespace-nowrap">
                  <span className="font-black text-[var(--sidebartext)]">{t("sidebar_app_title", "Sanctuary Os")?.split(' ')[0]}</span>
                  <span className="font-light text-[var(--sidebartext)] opacity-75">{t("sidebar_app_title", "Sanctuary Os")?.split(' ').slice(1).join(' ')}</span>
                </h1>
                {/* Subtitle */}
                <span className="text-[7px] font-black tracking-[0.14em] text-[var(--accent)] opacity-85 capitalize leading-snug mt-0.5 break-words">
                  {t(`sidebar_app_subtitle_${subtitleIndex}`, "No Black Boxes")}
                </span>
              </div>
            )}

            {/* Explicit Collapse Action Button */}
            {!isSidebarCollapsed && (
              <div className="ml-auto self-center w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--sidebartext)_14%,transparent)] group-hover/logo:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all shrink-0 z-20">
                <span className="material-symbols-outlined !text-[16px] leading-none flex items-center justify-center text-[var(--sidebartext)] opacity-75 group-hover/logo:opacity-100 group-hover/logo:text-[var(--accent)] transition-all">
                  {t("icon_keyboard_double_arrow_left", "keyboard_double_arrow_left")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 pt-2 pb-24 md:pb-6 space-y-0.5 overflow-y-auto hide-scrollbar">
          {isLandingContext ? (
            <>
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'overview'}
                onClick={() => {
                  setActiveLandingSection('overview');
                  setView("landing");
                  scrollToLandingSection('overview');
                }}
                icon={t("icon_dashboard", "dashboard")}
                label={t("overview", "Overview")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'workspaces'}
                onClick={() => {
                  setActiveLandingSection('workspaces');
                  setView("landing");
                  scrollToLandingSection('workspaces');
                }}
                icon={t("icon_public", "public")}
                label={t("landing_workspaces", "Active Workspaces")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'news'}
                onClick={() => {
                  setActiveLandingSection('news');
                  setView("landing");
                  scrollToLandingSection('news');
                }}
                icon={t("icon_newspaper", "newspaper")}
                label={t("landing_news", "Sanctuary Foundry News")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'directives'}
                onClick={() => {
                  setActiveLandingSection('directives');
                  setView("landing");
                  scrollToLandingSection('directives');
                }}
                icon={t("icon_folder_special", "folder_special")}
                label={t("landing_system_directives", "Public Documents") || "System Directives"}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              {!isDesktop() && (
                <NavButton
                  active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'download'}
                  onClick={() => {
                    setActiveLandingSection('download');
                    setView("landing");
                    scrollToLandingSection('download');
                  }}
                  icon={t("icon_download", "download")}
                  label={t("landing_download_sidebar", "Download Sanctuary OS")}
                  isCollapsed={isSidebarCollapsed}
                  isAccent={true}
                  setHoveredTooltip={setHoveredTooltip}
                />
              )}
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'support'}
                onClick={() => {
                  setActiveLandingSection('support');
                  setView("landing");
                  scrollToLandingSection('support');
                }}
                icon={t("icon_support_agent", "support_agent")}
                label={t("landing_nav_feedback", "Feedback & Support")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'partners'}
                onClick={() => {
                  setActiveLandingSection('partners');
                  setView("landing");
                  scrollToLandingSection('partners');
                }}
                icon={t("icon_handshake", "handshake")}
                label={t("landing_partners_tab", "Partner Spokes")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'legal'}
                onClick={() => {
                  setActiveLandingSection('legal');
                  setView("landing");
                  scrollToLandingSection('legal');
                }}
                icon={t("icon_gavel", "gavel")}
                label={t("landing_legal_tab", "Legal")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'donations'}
                onClick={() => {
                  setActiveLandingSection('donations');
                  setView("landing");
                  scrollToLandingSection('donations');
                }}
                icon={t("icon_volunteer_activism", "volunteer_activism")}
                label={t("wf_tab_donations", "Donations")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view === "settings"}
                onClick={() => setView("settings")}
                icon={t("icon_settings", "settings")}
                label={t("tab_preferences", "Preferences")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
            </>
          ) : (
            <>
              <NavButton
                active={view === "dashboard"}
                onClick={() => setView("dashboard")}
                icon={t("icon_desktop_windows", "desktop_windows")}
                label={t("center_title", "Dashboard")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              {(schemaFeatures.has_cc || schemaFeatures.has_saves || schemaFeatures.has_tray) && isDesktop() && (
                <NavButton
                  active={view === "vault"}
                  onClick={() => setView("vault")}
                  icon={t("icon_account_balance", "account_balance")}
                  label={t("vault_title", "Your {Vault}")}
                  isCollapsed={isSidebarCollapsed}
                  isAccent={true}
                  setHoveredTooltip={setHoveredTooltip}
                />
              )}
              {localStorage.getItem("sanctuary_blacklisted") !== "true" && (
                <NavButton
                  active={view === "nexus"}
                  onClick={() => setView("nexus")}
                  icon={t("icon_hub", "hub")}
                  label={t("market_title", "The {Nexus}")}
                  isCollapsed={isSidebarCollapsed}
                  isAccent={true}
                  setHoveredTooltip={setHoveredTooltip}
                />
              )}
              {schemaFeatures.has_cc && (
                <NavButton
                  active={view === "playsets"}
                  onClick={() => setView("playsets")}
                  icon={t("icon_map", "map")}
                  label={t("playsets_title", "{Blueprints}")}
                  badge={(stagingDraftItems || []).length}
                  isCollapsed={isSidebarCollapsed}
                  isAccent={true}
                  setHoveredTooltip={setHoveredTooltip}
                />
              )}
              {localStorage.getItem("sanctuary_blacklisted") !== "true" && (
                <NavButton
                  active={view === "GlobalFeed"}
                  onClick={() => setView("GlobalFeed")}
                  icon={t("icon_satellite_alt", "satellite_alt")}
                  label={t("feed_title", "Community Feed")}
                  isCollapsed={isSidebarCollapsed}
                  isAccent={true}
                  setHoveredTooltip={setHoveredTooltip}
                />
              )}
              {schemaFeatures.has_cc && isDesktop() && (
                <>
                  <NavButton
                    active={view === "DbpfScout"}
                    onClick={() => setView("DbpfScout")}
                    icon={t("icon_track_changes", "track_changes")}
                    label={t("radar_title", "Conflict Scanner")}
                    isCollapsed={isSidebarCollapsed}
                    isAccent={true}
                    setHoveredTooltip={setHoveredTooltip}
                  />
                  <NavButton
                    active={view === "lab"}
                    onClick={() => setView("lab")}
                    icon={t("icon_science", "science")}
                    label={t("term_lab", "Testing Lab")}
                    isCollapsed={isSidebarCollapsed}
                    isAccent={true}
                    setHoveredTooltip={setHoveredTooltip}
                  />
                  <NavButton
                    active={view === "CitizensWorkbench"}
                    onClick={() => setView("CitizensWorkbench")}
                    icon={t("icon_design_services", "design_services")}
                    label={t("title_sidebar", "Workbench")}
                    isCollapsed={isSidebarCollapsed}
                    isAccent={true}
                    setHoveredTooltip={setHoveredTooltip}
                  />
                </>
              )}
              {schemaFeatures.has_saves && isDesktop() && (
                <NavButton
                  active={view === "backups"}
                  onClick={() => setView("backups")}
                  icon={t("icon_history", "history")}
                  label={t("term_backups", "Backups")}
                  isCollapsed={isSidebarCollapsed}
                  isAccent={true}
                  setHoveredTooltip={setHoveredTooltip}
                />
              )}
              {session && !(!isDesktop() && isRootDomain()) && schemaFeatures.has_cc && (
                <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
                  <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_5%,transparent)] via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent" />
                  {!isSidebarCollapsed && (
                    <div className="px-6 flex items-center gap-2 mb-2">
                      <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate">
                        {t("mason", "{Mason}")}
                      </p>
                    </div>
                  )}
                  <NavButton
                    active={view === "MasonHub"}
                    onClick={() => setView("MasonHub")}
                    icon={t("icon_construction", "construction")}
                    label={t("sidebar_mason_hub", "Workshop")}
                    isCollapsed={isSidebarCollapsed}
                    isAccent={true}
                    setHoveredTooltip={setHoveredTooltip}
                  />
                  {view === "MasonHub" && !isSidebarCollapsed && (
                    <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                      <NavButton active={useStore.getState().masonActiveTab === "command_center"} onClick={() => useStore.getState().setMasonActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().masonActiveTab === "sandbox" || useStore.getState().masonActiveTab === "registry"} onClick={() => useStore.getState().setMasonActiveTab("sandbox")} icon={(isVerifiedMason ? t("icon_deployed_code", "deployed_code") : t("icon_handyman", "handyman")) as string} label={(isVerifiedMason ? t("term_mods", "Mods") : t("filter_dev", "Sandbox"))?.replace(/^[^\w]*/, '').trim() || "Artifacts"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "sandbox" || useStore.getState().masonActiveTab === "registry"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().masonActiveTab === "nexus"} onClick={() => useStore.getState().setMasonActiveTab("nexus")} icon={t("icon_hub", "hub") as string} label={t("tab_nexus", "{Nexus}")?.replace(/^[^\w]*/, '').trim() || "Nexus"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "nexus"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().masonActiveTab === "chameleons"} onClick={() => useStore.getState().setMasonActiveTab("chameleons")} icon={t("icon_palette", "palette") as string} label={t("tab_aesthetics", "Aesthetics")?.replace(/^[^\w]*/, '').trim() || "Aesthetics"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "chameleons"} setHoveredTooltip={setHoveredTooltip} />
                      {isVerifiedMason && (
                        <>
                          <NavButton active={useStore.getState().masonActiveTab === "collections"} onClick={() => useStore.getState().setMasonActiveTab("collections")} icon={t("icon_collections_bookmark", "collections_bookmark") as string} label={t("tab_cc", "Collections")?.replace(/^[^\w]*/, '').trim() || "Collections"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "collections"} setHoveredTooltip={setHoveredTooltip} />
                          <NavButton active={useStore.getState().masonActiveTab === "posts"} onClick={() => useStore.getState().setMasonActiveTab("posts")} icon={t("icon_edit_document", "edit_document") as string} label={t("tab_posts", "{Dispatches}")?.replace(/^[^\w]*/, '').trim() || "Posts"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "posts"} setHoveredTooltip={setHoveredTooltip} />
                          <NavButton active={useStore.getState().masonActiveTab === "bug_reports"} onClick={() => useStore.getState().setMasonActiveTab("bug_reports")} icon={t("icon_bug_report", "bug_report") as string} label={t("stat_bugs", "Reports")?.replace(/^[^\w]*/, '').trim() || "Bug Reports"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "bug_reports"} setHoveredTooltip={setHoveredTooltip} />
                        </>
                      )}
                    </div>
                  )}</div>
              )}
              {session && !(!isDesktop() && isRootDomain()) && schemaFeatures.has_cc && ["architect", "oversight", "wayfinder", "admin"].includes(userRole) && (
                <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
                  <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_5%,transparent)] via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent" />
                  {!isSidebarCollapsed && (
                    <div className="px-6 flex items-center gap-2 mb-2">
                      <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate">
                        {t("tab_architect", "Architect")}
                      </p>
                    </div>
                  )}
                  <NavButton
                    active={view === "ArchitectHub"}
                    onClick={() => setView("ArchitectHub")}
                    icon={t("icon_analytics", "analytics")}
                    label={t("sidebar_architect_hub", "Console")}
                    isCollapsed={isSidebarCollapsed}
                    isAccent={true}
                    setHoveredTooltip={setHoveredTooltip}
                  />
                  {view === "ArchitectHub" && !isSidebarCollapsed && (
                    <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                      <NavButton active={useStore.getState().architectActiveTab === "command_center"} onClick={() => useStore.getState().setArchitectActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "registry"} onClick={() => useStore.getState().setArchitectActiveTab("registry")} icon={t("icon_inventory_2", "inventory_2") as string} label={t("term_mods", "Mods")?.replace(/^[^\w]*/, '').trim() || "Artifacts"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "registry"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "queue"} onClick={() => useStore.getState().setArchitectActiveTab("queue")} icon={t("icon_search", "search") as string} label={t("tab_queue", "Scanner")?.replace(/^[^\w]*/, '').trim() || "Queue"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "queue"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "lab"} onClick={() => useStore.getState().setArchitectActiveTab("lab")} icon={t("icon_monitor_heart", "monitor_heart") as string} label={t("tab_diagnostics", "Diagnostics")?.replace(/^[^\w]*/, '').trim() || "Diagnostics"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "lab"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "collections"} onClick={() => useStore.getState().setArchitectActiveTab("collections")} icon={t("icon_collections_bookmark", "collections_bookmark") as string} label={t("tab_cc", "Collections")?.replace(/^[^\w]*/, '').trim() || "Collections"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "collections"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "mason_queue"} onClick={() => useStore.getState().setArchitectActiveTab("mason_queue")} icon={t("icon_construction", "construction") as string} label={t("mason", "{Mason}")?.replace(/^[^\w]*/, '').trim() || "Mason"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "mason_queue"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "template_oversight"} onClick={() => useStore.getState().setArchitectActiveTab("template_oversight")} icon={t("icon_data_object", "data_object") as string} label={t("ql_templates", "Templates")?.replace(/^[^\w]*/, '').trim() || "Templates"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "template_oversight"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "nexus_reports"} onClick={() => useStore.getState().setArchitectActiveTab("nexus_reports")} icon={t("icon_flag", "flag") as string} label={t("stat_bugs", "Reports")?.replace(/^[^\w]*/, '').trim() || "Reports"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "nexus_reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "support_tickets"} onClick={() => useStore.getState().setArchitectActiveTab("support_tickets")} icon={t("icon_local_activity", "local_activity") as string} label={t("wf_tab_tickets", "Support")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "support_tickets"} setHoveredTooltip={setHoveredTooltip} />
                    </div>
                  )}
                </div>
              )}
              {session && !(!isDesktop() && isRootDomain()) && schemaFeatures.has_cc && ["oversight", "wayfinder", "admin"].includes(userRole) && (
                <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
                  <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_5%,transparent)] via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent" />
                  {!isSidebarCollapsed && (
                    <div className="px-6 flex items-center gap-2 mb-2">
                      <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate">
                        {t("stat_oversight", "Admin")}
                      </p>
                    </div>
                  )}
                  <NavButton
                    active={view === "Oversight"}
                    onClick={() => setView("Oversight")}
                    icon={t("icon_security", "security")}
                    label={t("wf_tab_command", "Command")}
                    isCollapsed={isSidebarCollapsed}
                    isAccent={true}
                    setHoveredTooltip={setHoveredTooltip}
                  />
                  {view === "Oversight" && !isSidebarCollapsed && (
                    <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                      <NavButton active={useStore.getState().oversightActiveTab === "command_center"} onClick={() => useStore.getState().setOversightActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "oversight_comms"} onClick={() => useStore.getState().setOversightActiveTab("oversight_comms")} icon={t("icon_satellite_alt", "satellite_alt") as string} label={t("wf_tab_dispatch", "Dispatch")?.replace(/^[^\w]*/, '').trim() || "Dispatch"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "oversight_comms"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "identities" || useStore.getState().oversightActiveTab === "linker"} onClick={() => useStore.getState().setOversightActiveTab("identities")} icon={t("icon_group", "group") as string} label={t("tab_identities", "Identity")?.replace(/^[^\w]*/, '').trim() || "Identities"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "identities" || useStore.getState().oversightActiveTab === "linker"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "compliance"} onClick={() => useStore.getState().setOversightActiveTab("compliance")} icon={t("icon_policy", "policy") as string} label={t("tab_compliance", "Compliance")?.replace(/^[^\w]*/, '').trim() || "Compliance"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "compliance"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "malware_oversight" || useStore.getState().oversightActiveTab === "oversight_reports"} onClick={() => useStore.getState().setOversightActiveTab("malware_oversight")} icon={t("icon_coronavirus", "coronavirus") as string} label={t("rating_malware", "Malware")?.replace(/^[^\w]*/, '').trim() || "Malware"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "malware_oversight" || useStore.getState().oversightActiveTab === "oversight_reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "reports"} onClick={() => useStore.getState().setOversightActiveTab("reports")} icon={t("icon_flag", "flag") as string} label={t("stat_bugs", "Reports")?.replace(/^[^\w]*/, '').trim() || "Reports"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "sanctuary_tickets" || useStore.getState().oversightActiveTab === "support_settings"} onClick={() => useStore.getState().setOversightActiveTab("sanctuary_tickets")} icon={t("icon_local_activity", "local_activity") as string} label={t("wf_tab_tickets", "Support")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "sanctuary_tickets" || useStore.getState().oversightActiveTab === "support_settings"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "mass_update"} onClick={() => useStore.getState().setOversightActiveTab("mass_update")} icon={t("icon_dynamic_feed", "dynamic_feed") as string} label={t("tab_mass_update", "Mass Update")?.replace(/^[^\w]*/, '').trim() || "Mass Update"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "mass_update"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "game_versions"} onClick={() => useStore.getState().setOversightActiveTab("game_versions")} icon={t("icon_settings", "settings") as string} label={t("tab_game_versions", "Management")?.replace(/^[^\w]*/, '').trim() || "Versions"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "game_versions"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "audit_logs"} onClick={() => useStore.getState().setOversightActiveTab("audit_logs")} icon={t("icon_history", "history") as string} label={t("tab_audit", "Logs")?.replace(/^[^\w]*/, '').trim() || "Audit"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "audit_logs"} setHoveredTooltip={setHoveredTooltip} />
                    </div>
                  )}
                </div>
              )}
              {session && !(!isDesktop() && isRootDomain()) && schemaFeatures?.has_cc !== false && (userRole === "wayfinder" || userRole === "admin") && (
                <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
                  <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_5%,transparent)] via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent" />
                  {!isSidebarCollapsed && (
                    <div className="px-6 flex items-center gap-2 mb-2">
                      <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate">
                        {t("sidebar_wayfinder_tools", "Wayfinder")}
                      </p>
                    </div>
                  )}
                  <NavButton
                    active={view === "WayfinderHub"}
                    onClick={() => setView("WayfinderHub")}
                    icon={t("icon_terminal", "terminal")}
                    label={t("ui_btn_operations", "Operations")}
                    isCollapsed={isSidebarCollapsed}
                    isAccent={true}
                    setHoveredTooltip={setHoveredTooltip}
                  />
                  {view === "WayfinderHub" && !isSidebarCollapsed && (
                    <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                      <NavButton active={useStore.getState().wayfinderActiveTab === "command_center"} onClick={() => useStore.getState().setWayfinderActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "wf_comms_title"} onClick={() => useStore.getState().setWayfinderActiveTab("wf_comms_title")} icon={t("icon_satellite_alt", "satellite_alt") as string} label={t("wf_tab_dispatch", "Dispatch")?.replace(/^[^\w]*/, '').trim() || "Dispatch"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "wf_comms_title"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "sanctuary_tickets" || useStore.getState().wayfinderActiveTab === "support_settings"} onClick={() => useStore.getState().setWayfinderActiveTab("sanctuary_tickets")} icon={t("icon_local_activity", "local_activity") as string} label={t("wf_tab_tickets", "Support")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "sanctuary_tickets" || useStore.getState().wayfinderActiveTab === "support_settings"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "identities" || useStore.getState().wayfinderActiveTab === "linker"} onClick={() => useStore.getState().setWayfinderActiveTab("identities")} icon={t("icon_group", "group") as string} label={t("tab_identities", "Identity")?.replace(/^[^\w]*/, '').trim() || "Identities"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "identities" || useStore.getState().wayfinderActiveTab === "linker"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "compliance"} onClick={() => useStore.getState().setWayfinderActiveTab("compliance")} icon={t("icon_policy", "policy") as string} label={t("tab_compliance", "Compliance")?.replace(/^[^\w]*/, '').trim() || "Compliance"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "compliance"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "malware_oversight" || useStore.getState().wayfinderActiveTab === "oversight_reports"} onClick={() => useStore.getState().setWayfinderActiveTab("malware_oversight")} icon={t("icon_coronavirus", "coronavirus") as string} label={t("rating_malware", "Malware")?.replace(/^[^\w]*/, '').trim() || "Malware"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "malware_oversight" || useStore.getState().wayfinderActiveTab === "oversight_reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "reports"} onClick={() => useStore.getState().setWayfinderActiveTab("reports")} icon={t("icon_flag", "flag") as string} label={t("stat_bugs", "Reports")?.replace(/^[^\w]*/, '').trim() || "Reports"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={["ide", "schemas", "audit_logs", "spoke_setup", "spoke_sever", "forking_help", "donations", "keepers_support"].includes(useStore.getState().wayfinderActiveTab)} onClick={() => useStore.getState().setWayfinderActiveTab("ide")} icon={t("icon_data_object", "data_object") as string} label={t("wf_tab_spoke_control", "Spoke Control")?.replace(/^[^\w]*/, '').trim() || "Spoke Control"} isCollapsed={false} isAccent={["ide", "schemas", "audit_logs", "spoke_setup", "spoke_sever", "forking_help", "donations", "keepers_support"].includes(useStore.getState().wayfinderActiveTab)} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "chameleons"} onClick={() => useStore.getState().setWayfinderActiveTab("chameleons")} icon={t("icon_palette", "palette") as string} label={t("wf_tab_spoke_aesthetics", "Spoke Aesthetics")?.replace(/^[^\w]*/, '').trim() || "Spoke Aesthetics"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "chameleons"} setHoveredTooltip={setHoveredTooltip} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {session && (osRole === "core_dev" || osRole === "admin" || osRole === "keeper") && (
            <div className={`mt-3 mb-1 pt-3 relative ${isSidebarCollapsed ? 'px-0' : ''}`}>
              <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_30%,transparent)] to-transparent" />
              {!isSidebarCollapsed && (
                <div className="px-6 flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-[var(--sidebartext)] opacity-50 capitalize tracking-widest truncate ">
                    Sanctuary Foundry
                  </p>
                </div>
              )}
              <NavButton
                active={view === "KeepersCore"}
                onClick={() => {
                  setView("KeepersCore");
                  if (useStore.getState().setKeepersActiveTab) useStore.getState().setKeepersActiveTab("command_center");
                }}
                icon="admin_panel_settings"
                label={t("sidebar_keepers_core", "Keepers Core")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              {view === "KeepersCore" && !isSidebarCollapsed && (
                <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                  <NavButton active={useStore.getState().keepersActiveTab === "command_center"} onClick={() => useStore.getState().setKeepersActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={useStore.getState().keepersActiveTab === "keepers_comms"} onClick={() => useStore.getState().setKeepersActiveTab("keepers_comms")} icon={t("icon_satellite_alt", "satellite_alt") as string} label={t("wf_tab_dispatch", "Dispatch")?.replace(/^[^\w]*/, '').trim() || "Dispatch"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "keepers_comms"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={useStore.getState().keepersActiveTab === "web_directives" || useStore.getState().keepersActiveTab === "web_news" || useStore.getState().keepersActiveTab === "web_legal"} onClick={() => useStore.getState().setKeepersActiveTab("web_directives")} icon={t("icon_public", "public") as string} label={t("keepers_tab_web_landing", "Web Landing")} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "web_directives" || useStore.getState().keepersActiveTab === "web_news" || useStore.getState().keepersActiveTab === "web_legal"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={["active_games", "ide", "schemas", "audit_logs"].includes(useStore.getState().keepersActiveTab)} onClick={() => useStore.getState().setKeepersActiveTab("active_games")} icon={t("icon_dns", "dns") as string} label={t("keepers_tab_partner_spokes", "Partner Spokes")?.replace(/^[^\w]*/, '').trim() || "Partner Spokes"} isCollapsed={false} isAccent={["active_games", "ide", "schemas", "audit_logs"].includes(useStore.getState().keepersActiveTab)} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={useStore.getState().keepersActiveTab === "identities"} onClick={() => useStore.getState().setKeepersActiveTab("identities")} icon={t("icon_group", "group") as string} label={t("citizen_oversight", "Oversight")?.replace(/^[^\w]*/, '').trim() || "Oversight"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "identities"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={useStore.getState().keepersActiveTab === "heuristics"} onClick={() => useStore.getState().setKeepersActiveTab("heuristics")} icon={t("icon_shield_lock", "shield_lock") || "shield_lock"} label={t("core_heuristics_tab", "Core Heuristics") || "Core Heuristics"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "heuristics"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={useStore.getState().keepersActiveTab === "support" || useStore.getState().keepersActiveTab === "support_settings"} onClick={() => useStore.getState().setKeepersActiveTab("support")} icon={t("icon_support_agent", "support_agent") as string} label={t("wf_tab_tickets", "Support")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "support" || useStore.getState().keepersActiveTab === "support_settings"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={useStore.getState().keepersActiveTab === "chameleons"} onClick={() => useStore.getState().setKeepersActiveTab("chameleons")} icon={t("icon_palette", "palette") as string} label={t("keepers_tab_core_aesthetics", "Core Aesthetics")?.replace(/^[^\w]*/, '').trim() || "Core Aesthetics"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "chameleons"} setHoveredTooltip={setHoveredTooltip} />
                </div>
              )}
            </div>
          )}

          <div className={`my-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] pt-4 ${isSidebarCollapsed ? 'px-0' : ''}`}>
            {!session && (
              <NavButton
                onClick={() => openSanctuaryLogin()}
                icon={t("icon_key", "key")}
                label={t("sidebar_signin", "Authenticate")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
            )}
          </div>
          <div className="flex-1" />
        </div>

        {!isLandingContext && schemaFeatures?.has_launch !== false && isDesktop() && (
          <div className="px-3.5 pb-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--sidebartext)_8%,transparent)] relative z-30">
            <div className="relative group/nav">
              <button
                onMouseEnter={(e) => {
                  if (isSidebarCollapsed) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredTooltip({ label: t("sidebar_quick_launch", "Quick Launch"), top: rect.top + rect.height / 2 });
                  }
                }}
                onMouseLeave={() => {
                  if (isSidebarCollapsed) setHoveredTooltip(null);
                }}
                onClick={(e) => {
                  if (!isConfigured) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  handleQuickLaunch(e);
                }}
                disabled={!isConfigured}
                className={`relative w-full h-11 px-3 rounded-xl font-black capitalize tracking-[0.16em] transition-all duration-300 flex items-center justify-center gap-2.5 group/btn overflow-hidden border cursor-pointer ${!isConfigured
                  ? "glass-surface !border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-30 cursor-not-allowed"
                  : isPatchDetected || showDefconAlert
                    ? "glass-surface !border-[color-mix(in_srgb,var(--danger)_55%,rgba(255,255,255,0.32))] hover:!border-[color-mix(in_srgb,var(--danger)_75%,rgba(255,255,255,0.45))] text-[var(--danger)]"
                    : "glass-surface !border-[color-mix(in_srgb,var(--success)_55%,rgba(255,255,255,0.32))] hover:!border-[color-mix(in_srgb,var(--success)_75%,rgba(255,255,255,0.45))] text-[var(--success)]"
                  }`}
                style={{ fontSize: "var(--fontSizeSidebar, 11px)" }}
              >
                {isConfigured && (
                  <div
                    className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-300 opacity-85 group-hover/btn:opacity-100"
                    style={{
                      background:
                        isPatchDetected || showDefconAlert
                          ? "linear-gradient(135deg, color-mix(in srgb, var(--danger) 18%, rgba(255, 255, 255, 0.06)) 0%, color-mix(in srgb, var(--danger) 5%, transparent) 55%, transparent 100%)"
                          : "linear-gradient(135deg, color-mix(in srgb, var(--success) 18%, rgba(255, 255, 255, 0.06)) 0%, color-mix(in srgb, var(--success) 5%, transparent) 55%, transparent 100%)",
                    }}
                  />
                )}

                {/* Dynamic Sweep effect inside button */}
                {isConfigured && (
                  <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-transparent via-white/12 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none" />
                )}

                <span className="relative z-10 material-symbols-outlined !text-[18px] leading-none flex items-center justify-center transition-transform group-hover/btn:scale-110">
                  {t("icon_rocket_launch", "rocket_launch")}
                </span>
                {!isSidebarCollapsed && (
                  <span className="relative z-10 leading-none">
                    {t("sidebar_quick_launch", "Quick Launch")}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

      </div>

      {isSidebarCollapsed && hoveredTooltip && createPortal(
        <div
          className="fixed left-[96px] z-[150000] pointer-events-none"
          style={{ top: hoveredTooltip.top, transform: 'translateY(-50%)' }}
        >
          <div
            className="glass-panel portal-glass-fix flex flex-col items-start justify-center px-3.5 py-2 max-w-[320px] w-max border border-[rgba(var(--text-rgb,255,255,255),0.16)] !rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-150"
          >
            <div className="relative z-10 flex flex-col items-start gap-1 w-full">
              <div className="text-xs font-bold capitalize tracking-wide flex items-start text-left gap-2 whitespace-pre-line text-[var(--text)]">
                <span>{hoveredTooltip.label}</span>
              </div>
            </div>
          </div>
        </div>, document.getElementById("sa-portals") || document.body
      )}
    </nav >
  );
}
