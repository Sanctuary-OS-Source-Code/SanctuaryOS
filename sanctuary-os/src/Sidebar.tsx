import React from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
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
  const {
    session,
    view,
    setView,
    userRole,
    osRole,
    isPatchDetected,
    isConfigured,
    activeWorkspaceId,
    activeGameSchema,
    masonActiveTab,
    setMasonActiveTab,
    architectActiveTab,
    setArchitectActiveTab,
    oversightActiveTab,
    setOversightActiveTab,
    wayfinderActiveTab,
    setWayfinderActiveTab,
    keepersActiveTab,
    setKeepersActiveTab,
  } = useStore(
    useShallow((state) => ({
      session: state.session,
      view: state.view,
      setView: state.setView,
      userRole: state.userRole,
      osRole: state.osRole,
      isPatchDetected: state.isPatchDetected,
      isConfigured: state.isConfigured,
      activeWorkspaceId: state.activeWorkspaceId,
      activeGameSchema: state.activeGameSchema,
      masonActiveTab: state.masonActiveTab,
      setMasonActiveTab: state.setMasonActiveTab,
      architectActiveTab: state.architectActiveTab,
      setArchitectActiveTab: state.setArchitectActiveTab,
      oversightActiveTab: state.oversightActiveTab,
      setOversightActiveTab: state.setOversightActiveTab,
      wayfinderActiveTab: state.wayfinderActiveTab,
      setWayfinderActiveTab: state.setWayfinderActiveTab,
      keepersActiveTab: state.keepersActiveTab,
      setKeepersActiveTab: state.setKeepersActiveTab,
    }))
  );
  const { showDefconAlert, stagingDraftItems } = useModalStore(
    useShallow((s) => ({
      showDefconAlert: s.showDefconAlert,
      stagingDraftItems: s.stagingDraftItems,
    }))
  );
  const [, setGlobalGames] = React.useState<any[]>([]);
  const [hoveredTooltip, setHoveredTooltip] = React.useState<{ label: string, top: number } | null>(null);
  const [activeLandingSection, setActiveLandingSection] = React.useState<string>(() => getActiveLandingTab());
  const [hasLinkedMasonRecord, setHasLinkedMasonRecord] = React.useState<boolean>(false);
  const [isMasonRecordVerified, setIsMasonRecordVerified] = React.useState<boolean>(false);

  const schemaFeatures = activeGameSchema?.features || { has_cc: true, has_saves: true };

  React.useEffect(() => {
    const loadGames = () => {
      import('./supabase').then(({ supabase }) => {
        supabase.from('sanctuary_games').select('id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor').then(({ data }) => {
          if (data) setGlobalGames(data.filter((g: any) => g.is_active !== false));
        });
      });
    };
    loadGames();
    window.addEventListener('sanctuary-games-updated', loadGames);
    return () => window.removeEventListener('sanctuary-games-updated', loadGames);
  }, []);

  React.useEffect(() => {
    if (!session?.user?.id) {
      setHasLinkedMasonRecord(false);
      setIsMasonRecordVerified(false);
      return;
    }
    import('./supabase').then(({ getActiveGameClient }) => {
      const gameClient = getActiveGameClient();
      if (!gameClient) {
        setHasLinkedMasonRecord(false);
        setIsMasonRecordVerified(false);
        return;
      }
      gameClient.from('masons').select('id, is_verified').eq('profile_id', session.user.id).maybeSingle().then(({ data }) => {
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
      className={`${isDesktop() ? 'flex my-6 h-[calc(100%-3rem)]' : 'hidden md:flex md:my-6 md:h-[calc(100%-3rem)]'} ${isSidebarCollapsed ? 'w-[80px]' : ''} flex-shrink-0 flex-col relative z-20 transition-[width,min-width,border-color,box-shadow] duration-500 rounded-3xl border overflow-hidden firefox-safe-glass`}
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
          className={`relative flex items-center cursor-pointer glass-surface rounded-xl border hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--glass-border-top))] transition-all duration-300 z-[100] shrink-0 group/logo overflow-hidden mx-3.5 mt-3.5 mb-2 ${isSidebarCollapsed ? 'justify-center p-2 min-h-[52px]' : 'justify-between p-2.5 min-h-[56px]'}`}
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
            <div className="w-9 h-9 rounded-lg border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-transform duration-300 group-hover/logo:scale-105">
              <img
                src={osLogoUrl || "/icon.png"}
                alt={t("sidebar_app_title", "Sanctuary OS") as string}
                className="w-[30px] h-[30px] object-contain"
              />
            </div>

            {!isSidebarCollapsed && (
              <div className="flex flex-col justify-center min-w-0 flex-1">
                {/* Two-Tone Title */}
                <h1 className="text-[15.5px] tracking-tight capitalize leading-tight group-hover/logo:opacity-100 transition-colors flex items-center gap-1 whitespace-nowrap">
                  <span className="font-black text-[var(--sidebartext)]">{t("sidebar_app_title", "Sanctuary Os")?.split(' ')[0]}</span>
                  <span className="font-light text-[var(--sidebartext)] opacity-75">{t("sidebar_app_title", "Sanctuary Os")?.split(' ').slice(1).join(' ')}</span>
                </h1>
                {/* Subtitle */}
                <span className="text-[7px] font-black tracking-[0.12em] text-[var(--accent)] opacity-85 capitalize leading-snug mt-0.5 truncate whitespace-nowrap">
                  {t(`sidebar_app_subtitle_${subtitleIndex}`, "No Black Boxes")}
                </span>
              </div>
            )}

            {/* Explicit Collapse Action Button */}
            {!isSidebarCollapsed && (
              <div className="ml-auto self-center w-8 h-8 rounded-lg border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] group-hover/logo:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center transition-all shrink-0 z-20">
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
                    active={view === "ArtifactScout"}
                    onClick={() => setView("ArtifactScout")}
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
                      <NavButton active={masonActiveTab === "command_center"} onClick={() => setMasonActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={masonActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={masonActiveTab === "sandbox" || masonActiveTab === "registry"} onClick={() => setMasonActiveTab("sandbox")} icon={(isVerifiedMason ? t("icon_deployed_code", "deployed_code") : t("icon_handyman", "handyman")) as string} label={(isVerifiedMason ? t("term_mods", "Mods") : t("filter_dev", "Sandbox"))?.replace(/^[^\w]*/, '').trim() || "Artifacts"} isCollapsed={false} isAccent={masonActiveTab === "sandbox" || masonActiveTab === "registry"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={masonActiveTab === "nexus"} onClick={() => setMasonActiveTab("nexus")} icon={t("icon_hub", "hub") as string} label={t("tab_nexus", "{Nexus}")?.replace(/^[^\w]*/, '').trim() || "Nexus"} isCollapsed={false} isAccent={masonActiveTab === "nexus"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={masonActiveTab === "chameleons"} onClick={() => setMasonActiveTab("chameleons")} icon={t("icon_palette", "palette") as string} label={t("tab_aesthetics", "Aesthetics")?.replace(/^[^\w]*/, '').trim() || "Aesthetics"} isCollapsed={false} isAccent={masonActiveTab === "chameleons"} setHoveredTooltip={setHoveredTooltip} />
                      {isVerifiedMason && (
                        <>
                          <NavButton active={masonActiveTab === "collections"} onClick={() => setMasonActiveTab("collections")} icon={t("icon_collections_bookmark", "collections_bookmark") as string} label={t("tab_cc", "Collections")?.replace(/^[^\w]*/, '').trim() || "Collections"} isCollapsed={false} isAccent={masonActiveTab === "collections"} setHoveredTooltip={setHoveredTooltip} />
                          <NavButton active={masonActiveTab === "posts"} onClick={() => setMasonActiveTab("posts")} icon={t("icon_edit_document", "edit_document") as string} label={t("tab_posts", "{Dispatches}")?.replace(/^[^\w]*/, '').trim() || "Posts"} isCollapsed={false} isAccent={masonActiveTab === "posts"} setHoveredTooltip={setHoveredTooltip} />
                          <NavButton active={masonActiveTab === "bug_reports"} onClick={() => setMasonActiveTab("bug_reports")} icon={t("icon_bug_report", "bug_report") as string} label={t("stat_bugs", "Reports")?.replace(/^[^\w]*/, '').trim() || "Bug Reports"} isCollapsed={false} isAccent={masonActiveTab === "bug_reports"} setHoveredTooltip={setHoveredTooltip} />
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
                      <NavButton active={architectActiveTab === "command_center"} onClick={() => setArchitectActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={architectActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={architectActiveTab === "registry"} onClick={() => setArchitectActiveTab("registry")} icon={t("icon_inventory_2", "inventory_2") as string} label={t("term_mods", "Mods")?.replace(/^[^\w]*/, '').trim() || "Artifacts"} isCollapsed={false} isAccent={architectActiveTab === "registry"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={architectActiveTab === "queue"} onClick={() => setArchitectActiveTab("queue")} icon={t("icon_search", "search") as string} label={t("tab_queue", "Scanner")?.replace(/^[^\w]*/, '').trim() || "Queue"} isCollapsed={false} isAccent={architectActiveTab === "queue"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={architectActiveTab === "lab"} onClick={() => setArchitectActiveTab("lab")} icon={t("icon_monitor_heart", "monitor_heart") as string} label={t("tab_diagnostics", "Diagnostics")?.replace(/^[^\w]*/, '').trim() || "Diagnostics"} isCollapsed={false} isAccent={architectActiveTab === "lab"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={architectActiveTab === "collections"} onClick={() => setArchitectActiveTab("collections")} icon={t("icon_collections_bookmark", "collections_bookmark") as string} label={t("tab_cc", "Collections")?.replace(/^[^\w]*/, '').trim() || "Collections"} isCollapsed={false} isAccent={architectActiveTab === "collections"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={architectActiveTab === "mason_queue"} onClick={() => setArchitectActiveTab("mason_queue")} icon={t("icon_construction", "construction") as string} label={t("mason", "{Mason}")?.replace(/^[^\w]*/, '').trim() || "Mason"} isCollapsed={false} isAccent={architectActiveTab === "mason_queue"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={architectActiveTab === "template_oversight"} onClick={() => setArchitectActiveTab("template_oversight")} icon={t("icon_data_object", "data_object") as string} label={t("ql_templates", "Templates")?.replace(/^[^\w]*/, '').trim() || "Templates"} isCollapsed={false} isAccent={architectActiveTab === "template_oversight"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={architectActiveTab === "nexus_reports"} onClick={() => setArchitectActiveTab("nexus_reports")} icon={t("icon_flag", "flag") as string} label={t("stat_bugs", "Reports")?.replace(/^[^\w]*/, '').trim() || "Reports"} isCollapsed={false} isAccent={architectActiveTab === "nexus_reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={architectActiveTab === "support_tickets"} onClick={() => setArchitectActiveTab("support_tickets")} icon={t("icon_local_activity", "local_activity") as string} label={t("wf_tab_tickets", "Support")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={architectActiveTab === "support_tickets"} setHoveredTooltip={setHoveredTooltip} />
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
                      <NavButton active={oversightActiveTab === "command_center"} onClick={() => setOversightActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={oversightActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={oversightActiveTab === "oversight_comms"} onClick={() => setOversightActiveTab("oversight_comms")} icon={t("icon_satellite_alt", "satellite_alt") as string} label={t("wf_tab_dispatch", "Dispatch")?.replace(/^[^\w]*/, '').trim() || "Dispatch"} isCollapsed={false} isAccent={oversightActiveTab === "oversight_comms"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={oversightActiveTab === "identities" || oversightActiveTab === "linker"} onClick={() => setOversightActiveTab("identities")} icon={t("icon_group", "group") as string} label={t("tab_identities", "Identity")?.replace(/^[^\w]*/, '').trim() || "Identities"} isCollapsed={false} isAccent={oversightActiveTab === "identities" || oversightActiveTab === "linker"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={oversightActiveTab === "compliance"} onClick={() => setOversightActiveTab("compliance")} icon={t("icon_policy", "policy") as string} label={t("tab_compliance", "Compliance")?.replace(/^[^\w]*/, '').trim() || "Compliance"} isCollapsed={false} isAccent={oversightActiveTab === "compliance"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={oversightActiveTab === "malware_oversight" || oversightActiveTab === "oversight_reports"} onClick={() => setOversightActiveTab("malware_oversight")} icon={t("icon_coronavirus", "coronavirus") as string} label={t("rating_malware", "Malware")?.replace(/^[^\w]*/, '').trim() || "Malware"} isCollapsed={false} isAccent={oversightActiveTab === "malware_oversight" || oversightActiveTab === "oversight_reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={oversightActiveTab === "reports"} onClick={() => setOversightActiveTab("reports")} icon={t("icon_flag", "flag") as string} label={t("stat_bugs", "Reports")?.replace(/^[^\w]*/, '').trim() || "Reports"} isCollapsed={false} isAccent={oversightActiveTab === "reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={oversightActiveTab === "sanctuary_tickets" || oversightActiveTab === "support_settings"} onClick={() => setOversightActiveTab("sanctuary_tickets")} icon={t("icon_local_activity", "local_activity") as string} label={t("wf_tab_tickets", "Support")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={oversightActiveTab === "sanctuary_tickets" || oversightActiveTab === "support_settings"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={oversightActiveTab === "mass_update"} onClick={() => setOversightActiveTab("mass_update")} icon={t("icon_dynamic_feed", "dynamic_feed") as string} label={t("tab_mass_update", "Mass Update")?.replace(/^[^\w]*/, '').trim() || "Mass Update"} isCollapsed={false} isAccent={oversightActiveTab === "mass_update"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={oversightActiveTab === "game_versions"} onClick={() => setOversightActiveTab("game_versions")} icon={t("icon_settings", "settings") as string} label={t("tab_game_versions", "Management")?.replace(/^[^\w]*/, '').trim() || "Versions"} isCollapsed={false} isAccent={oversightActiveTab === "game_versions"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={oversightActiveTab === "audit_logs"} onClick={() => setOversightActiveTab("audit_logs")} icon={t("icon_history", "history") as string} label={t("tab_audit", "Logs")?.replace(/^[^\w]*/, '').trim() || "Audit"} isCollapsed={false} isAccent={oversightActiveTab === "audit_logs"} setHoveredTooltip={setHoveredTooltip} />
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
                      <NavButton active={wayfinderActiveTab === "command_center"} onClick={() => setWayfinderActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={wayfinderActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={wayfinderActiveTab === "wf_comms_title"} onClick={() => setWayfinderActiveTab("wf_comms_title")} icon={t("icon_satellite_alt", "satellite_alt") as string} label={t("wf_tab_dispatch", "Dispatch")?.replace(/^[^\w]*/, '').trim() || "Dispatch"} isCollapsed={false} isAccent={wayfinderActiveTab === "wf_comms_title"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={wayfinderActiveTab === "sanctuary_tickets" || wayfinderActiveTab === "support_settings"} onClick={() => setWayfinderActiveTab("sanctuary_tickets")} icon={t("icon_local_activity", "local_activity") as string} label={t("wf_tab_tickets", "Support")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={wayfinderActiveTab === "sanctuary_tickets" || wayfinderActiveTab === "support_settings"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={wayfinderActiveTab === "identities" || wayfinderActiveTab === "linker"} onClick={() => setWayfinderActiveTab("identities")} icon={t("icon_group", "group") as string} label={t("tab_identities", "Identity")?.replace(/^[^\w]*/, '').trim() || "Identities"} isCollapsed={false} isAccent={wayfinderActiveTab === "identities" || wayfinderActiveTab === "linker"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={wayfinderActiveTab === "compliance"} onClick={() => setWayfinderActiveTab("compliance")} icon={t("icon_policy", "policy") as string} label={t("tab_compliance", "Compliance")?.replace(/^[^\w]*/, '').trim() || "Compliance"} isCollapsed={false} isAccent={wayfinderActiveTab === "compliance"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={wayfinderActiveTab === "malware_oversight" || wayfinderActiveTab === "oversight_reports"} onClick={() => setWayfinderActiveTab("malware_oversight")} icon={t("icon_coronavirus", "coronavirus") as string} label={t("rating_malware", "Malware")?.replace(/^[^\w]*/, '').trim() || "Malware"} isCollapsed={false} isAccent={wayfinderActiveTab === "malware_oversight" || wayfinderActiveTab === "oversight_reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={wayfinderActiveTab === "reports"} onClick={() => setWayfinderActiveTab("reports")} icon={t("icon_flag", "flag") as string} label={t("stat_bugs", "Reports")?.replace(/^[^\w]*/, '').trim() || "Reports"} isCollapsed={false} isAccent={wayfinderActiveTab === "reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={["ide", "schemas", "audit_logs", "spoke_setup", "spoke_sever", "forking_help", "donations", "keepers_support"].includes(wayfinderActiveTab)} onClick={() => setWayfinderActiveTab("ide")} icon={t("icon_data_object", "data_object") as string} label={t("wf_tab_spoke_control", "Spoke Control")?.replace(/^[^\w]*/, '').trim() || "Spoke Control"} isCollapsed={false} isAccent={["ide", "schemas", "audit_logs", "spoke_setup", "spoke_sever", "forking_help", "donations", "keepers_support"].includes(wayfinderActiveTab)} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={wayfinderActiveTab === "chameleons"} onClick={() => setWayfinderActiveTab("chameleons")} icon={t("icon_palette", "palette") as string} label={t("wf_tab_spoke_aesthetics", "Spoke Aesthetics")?.replace(/^[^\w]*/, '').trim() || "Spoke Aesthetics"} isCollapsed={false} isAccent={wayfinderActiveTab === "chameleons"} setHoveredTooltip={setHoveredTooltip} />
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
                    {t("keepers_foundry_label", "Sanctuary Foundry")}
                  </p>
                </div>
              )}
              <NavButton
                active={view === "KeepersCore"}
                onClick={() => {
                  setView("KeepersCore");
                  if (setKeepersActiveTab) setKeepersActiveTab("command_center");
                }}
                icon={t("icon_admin_panel_settings", "admin_panel_settings")}
                label={t("sidebar_keepers_core", "Keepers Core")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              {view === "KeepersCore" && !isSidebarCollapsed && (
                <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                  <NavButton active={keepersActiveTab === "command_center"} onClick={() => setKeepersActiveTab("command_center")} icon={t("icon_desktop_windows", "desktop_windows") as string} label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={keepersActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={keepersActiveTab === "keepers_comms"} onClick={() => setKeepersActiveTab("keepers_comms")} icon={t("icon_satellite_alt", "satellite_alt") as string} label={t("wf_tab_dispatch", "Dispatch")?.replace(/^[^\w]*/, '').trim() || "Dispatch"} isCollapsed={false} isAccent={keepersActiveTab === "keepers_comms"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={keepersActiveTab === "web_directives" || keepersActiveTab === "web_news" || keepersActiveTab === "web_legal"} onClick={() => setKeepersActiveTab("web_directives")} icon={t("icon_public", "public") as string} label={t("keepers_tab_web_landing", "Web Landing")} isCollapsed={false} isAccent={keepersActiveTab === "web_directives" || keepersActiveTab === "web_news" || keepersActiveTab === "web_legal"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={["active_games", "ide", "schemas", "audit_logs"].includes(keepersActiveTab)} onClick={() => setKeepersActiveTab("active_games")} icon={t("icon_dns", "dns") as string} label={t("keepers_tab_partner_spokes", "Partner Spokes")?.replace(/^[^\w]*/, '').trim() || "Partner Spokes"} isCollapsed={false} isAccent={["active_games", "ide", "schemas", "audit_logs"].includes(keepersActiveTab)} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={keepersActiveTab === "identities"} onClick={() => setKeepersActiveTab("identities")} icon={t("icon_group", "group") as string} label={t("citizen_oversight", "Oversight")?.replace(/^[^\w]*/, '').trim() || "Oversight"} isCollapsed={false} isAccent={keepersActiveTab === "identities"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={keepersActiveTab === "heuristics"} onClick={() => setKeepersActiveTab("heuristics")} icon={t("icon_shield_lock", "shield_lock") || "shield_lock"} label={t("core_heuristics_tab", "Core Heuristics") || "Core Heuristics"} isCollapsed={false} isAccent={keepersActiveTab === "heuristics"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={keepersActiveTab === "support" || keepersActiveTab === "support_settings"} onClick={() => setKeepersActiveTab("support")} icon={t("icon_support_agent", "support_agent") as string} label={t("wf_tab_tickets", "Support")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={keepersActiveTab === "support" || keepersActiveTab === "support_settings"} setHoveredTooltip={setHoveredTooltip} />
                  <NavButton active={keepersActiveTab === "chameleons"} onClick={() => setKeepersActiveTab("chameleons")} icon={t("icon_palette", "palette") as string} label={t("keepers_tab_core_aesthetics", "Core Aesthetics")?.replace(/^[^\w]*/, '').trim() || "Core Aesthetics"} isCollapsed={false} isAccent={keepersActiveTab === "chameleons"} setHoveredTooltip={setHoveredTooltip} />
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
            className="sa-tooltip-glass flex flex-col items-start justify-center px-3 py-1.5 max-w-[320px] w-max overflow-hidden animate-in fade-in slide-in-from-left-2 duration-150"
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
