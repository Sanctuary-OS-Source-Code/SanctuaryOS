import React from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { CustomDropdown, HoverTooltip, useIsMobile } from './shared';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from "./utils/envUtils";
import { isRootDomain, scrollToLandingSection } from "./utils/routingUtils";

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
        style={
          isActive
            ? {
                backgroundColor: 'var(--glass-nav-active-bg)',
                boxShadow: 'var(--glass-nav-active-shadow)',
              }
            : undefined
        }
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden group border-0 cursor-pointer
          ${isActive
            ? "text-[var(--sidebartext)] opacity-100"
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
            <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--accent)] text-[var(--bg)] text-[8px] font-black flex items-center justify-center z-20">
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
          <span className="px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[9px] font-black text-[var(--accent)] shrink-0">
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
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const setKeepersActiveTab = useStore((state) => state.setKeepersActiveTab);
  const userRole = useStore((state) => state.userRole);
  const osRole = useStore((state) => state.osRole);
  const isPatchDetected = useStore((state) => state.isPatchDetected);
  const isConfigured = useStore((state) => state.isConfigured);
  const { showDefconAlert, stagingDraftItems } = useModalStore();
  const [globalGames, setGlobalGames] = React.useState<any[]>([]);
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = React.useState(false);
  const [hoveredTooltip, setHoveredTooltip] = React.useState<{ label: string, top: number } | null>(null);
  const [activeLandingSection, setActiveLandingSection] = React.useState<string>('workspaces');
  const [hasLinkedMasonRecord, setHasLinkedMasonRecord] = React.useState<boolean>(false);
  const [isMasonRecordVerified, setIsMasonRecordVerified] = React.useState<boolean>(false);

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const activeWorkspace = workspaces?.find((w: any) => w.id === activeWorkspaceId);
  const activeGameName = globalGames.find(g => g.schema_id === activeWorkspace?.schema_id)?.name || activeWorkspace?.name || "Sanctuary OS";
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

  React.useEffect(() => {
    if (!(!isConfigured || (!isDesktop() && isRootDomain()))) return;
    const container = document.getElementById('sanctuary-main-scroll');
    if (!container) return;
    const handleScroll = () => {
      const sectionIds = ['workspaces', 'news', 'system_directives', 'download', 'eula'];
      const containerTop = container.getBoundingClientRect().top;
      let current = 'workspaces';
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top - containerTop <= 180) {
            current = id;
          }
        }
      }
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 40) {
        current = 'eula';
      }
      setActiveLandingSection(current);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isConfigured, view]);

  return (
    <nav
      className={`hidden md:flex ${isSidebarCollapsed ? 'w-[80px]' : ''} flex-shrink-0 h-full flex-col relative z-20 transition-all duration-500 rounded-3xl border overflow-hidden firefox-safe-glass`}
      style={{
        width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)',
        minWidth: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)',
        backgroundColor: 'var(--glass-sidebar-bg)',
        backgroundImage: 'var(--glass-sheen)',
        backdropFilter: 'blur(min(var(--glassBlur, 18px), 18px)) saturate(var(--glassSaturation, 185%))',
        WebkitBackdropFilter: 'blur(min(var(--glassBlur, 18px), 18px)) saturate(var(--glassSaturation, 185%))',
        borderTopColor: 'var(--glass-border-top)',
        borderLeftColor: 'var(--glass-border-left)',
        borderRightColor: 'var(--glass-border-right)',
        borderBottomColor: 'var(--glass-border-bottom)',
        boxShadow: 'var(--glass-outer-shadow), var(--glass-inset-highlight)'
      }}
    >
      <div className={`flex flex-col h-full w-full relative z-10`}>
        {/* Brand Header */}
        <div
          className="relative flex flex-col justify-center cursor-pointer hover:bg-[color-mix(in_srgb,var(--sidebartext)_4%,transparent)] transition-colors duration-500 z-[100] shrink-0 group/logo overflow-hidden rounded-t-3xl h-[68px] border-b border-[color-mix(in_srgb,var(--sidebartext)_6%,rgba(255,255,255,0.12))] mb-1.5"
          onClick={() => {
            if (isRootDomain() && (!isDesktop() || !isConfigured)) {
              setView("landing");
              setIsSidebarCollapsed(!isSidebarCollapsed);
            } else {
              setIsSidebarCollapsed(!isSidebarCollapsed);
            }
          }}
        >
          {/* Responsive Watermark Background Icon */}
          <img
            src="/icon.png"
            alt="Watermark"
            className={`absolute top-1/2 -translate-y-1/2 transition-all duration-700 pointer-events-none ${isSidebarCollapsed
              ? 'w-8 h-8 left-1/2 -translate-x-1/2 opacity-100  group-hover/logo:scale-110 '
              : 'w-24 h-24 -left-4 opacity-[0.06] grayscale group-hover/logo:grayscale-0 group-hover/logo:opacity-[0.15] group-hover/logo:scale-110 group-hover/logo:rotate-12 '
              }`}
          />

          <div className={`flex items-center w-full relative z-10 transition-all duration-500 ${isSidebarCollapsed ? 'justify-center' : 'justify-start px-6'}`}>
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-3">
                <div className="flex flex-col pt-0">
                  {/* Two-Tone Title */}
                  <h1 className="text-[19px] tracking-tighter capitalize leading-none  group-hover/logo:opacity-100 transition-colors flex items-center gap-1 whitespace-nowrap">
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
              <div className="ml-auto w-7 h-7 rounded-lg glass-surface flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-all">
                <span className="material-symbols-outlined text-[16px] text-[var(--sidebartext)] opacity-70 group-hover/logo:opacity-100 transition-opacity">keyboard_double_arrow_left</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 pt-2 pb-24 md:pb-6 space-y-0.5 overflow-y-auto hide-scrollbar">
          {(!isConfigured || (!isDesktop() && isRootDomain())) ? (
            <>
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'workspaces'}
                onClick={() => {
                  setActiveLandingSection('workspaces');
                  setView("landing");
                  setTimeout(() => {
                    if (isDesktop() || isRootDomain()) scrollToLandingSection('workspaces');
                    else window.location.href = `/#workspaces`;
                  }, 80);
                }}
                icon="public"
                label={t("landing_workspaces")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'news'}
                onClick={() => {
                  setActiveLandingSection('news');
                  setView("landing");
                  setTimeout(() => {
                    if (isDesktop() || isRootDomain()) scrollToLandingSection('news');
                    else window.location.href = `/#news`;
                  }, 80);
                }}
                icon="newspaper"
                label={t("landing_news")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'system_directives'}
                onClick={() => {
                  setActiveLandingSection('system_directives');
                  setView("landing");
                  setTimeout(() => {
                    if (isDesktop() || isRootDomain()) scrollToLandingSection('system_directives');
                    else window.location.href = `/#system_directives`;
                  }, 80);
                }}
                icon="folder_special"
                label={t("landing_system_directives") || "System Directives"}
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
                    setTimeout(() => {
                      if (isRootDomain()) scrollToLandingSection('download');
                      else window.location.href = `/#download`;
                    }, 80);
                  }}
                  icon="download"
                  label={t("landing_download_sidebar")}
                  isCollapsed={isSidebarCollapsed}
                  isAccent={true}
                  setHoveredTooltip={setHoveredTooltip}
                />
              )}
              <NavButton
                active={view !== "settings" && view !== "KeepersCore" && activeLandingSection === 'eula'}
                onClick={() => {
                  setActiveLandingSection('eula');
                  setView("landing");
                  setTimeout(() => {
                    if (isDesktop() || isRootDomain()) scrollToLandingSection('eula');
                    else window.location.href = `/#eula`;
                  }, 80);
                }}
                icon="gavel"
                label={t("landing_eula")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              <NavButton
                active={view === "settings"}
                onClick={() => setView("settings")}
                icon={t("icon_settings")}
                label={t("sidebar_settings")}
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
                icon={t("icon_desktop_windows")}
                label={t("center_title")}
                isCollapsed={isSidebarCollapsed}
                isAccent={true}
                setHoveredTooltip={setHoveredTooltip}
              />
              {(schemaFeatures.has_cc || schemaFeatures.has_saves || schemaFeatures.has_tray) && isDesktop() && (
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
              {localStorage.getItem("sanctuary_blacklisted") !== "true" && (
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
                  icon={t("icon_satellite_alt")}
                  label={t("feed_title")}
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
              {schemaFeatures.has_saves && isDesktop() && (
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
              {session && !(!isDesktop() && isRootDomain()) && schemaFeatures.has_cc && (
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
                  {view === "MasonHub" && !isSidebarCollapsed && (
                    <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                      <NavButton active={useStore.getState().masonActiveTab === "command_center"} onClick={() => useStore.getState().setMasonActiveTab("command_center")} icon={t("icon_desktop_windows") as string} label={t("wf_tab_command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().masonActiveTab === "sandbox" || useStore.getState().masonActiveTab === "registry"} onClick={() => useStore.getState().setMasonActiveTab("sandbox")} icon={(isVerifiedMason ? t("icon_deployed_code") : t("icon_handyman")) as string} label={(isVerifiedMason ? t("items") : t("filter_dev"))?.replace(/^[^\w]*/, '').trim() || "Artifacts"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "sandbox" || useStore.getState().masonActiveTab === "registry"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().masonActiveTab === "nexus"} onClick={() => useStore.getState().setMasonActiveTab("nexus")} icon={t("icon_hub") as string} label={t("tab_nexus")?.replace(/^[^\w]*/, '').trim() || "Nexus"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "nexus"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().masonActiveTab === "chameleons"} onClick={() => useStore.getState().setMasonActiveTab("chameleons")} icon="palette" label={t("tab_chameleons")?.replace(/^[^\w]*/, '').trim() || "Chameleons"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "chameleons"} setHoveredTooltip={setHoveredTooltip} />
                      {isVerifiedMason && (
                        <>
                          <NavButton active={useStore.getState().masonActiveTab === "collections"} onClick={() => useStore.getState().setMasonActiveTab("collections")} icon={t("icon_collections_bookmark") as string} label={t("tab_cc")?.replace(/^[^\w]*/, '').trim() || "Collections"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "collections"} setHoveredTooltip={setHoveredTooltip} />
                          <NavButton active={useStore.getState().masonActiveTab === "posts"} onClick={() => useStore.getState().setMasonActiveTab("posts")} icon={t("icon_edit_document") as string} label={t("tab_posts")?.replace(/^[^\w]*/, '').trim() || "Posts"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "posts"} setHoveredTooltip={setHoveredTooltip} />
                          <NavButton active={useStore.getState().masonActiveTab === "bug_reports"} onClick={() => useStore.getState().setMasonActiveTab("bug_reports")} icon={t("icon_bug_report") as string} label={t("stat_bugs")?.replace(/^[^\w]*/, '').trim() || "Bug Reports"} isCollapsed={false} isAccent={useStore.getState().masonActiveTab === "bug_reports"} setHoveredTooltip={setHoveredTooltip} />
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
                  {view === "ArchitectHub" && !isSidebarCollapsed && (
                    <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                      <NavButton active={useStore.getState().architectActiveTab === "command_center"} onClick={() => useStore.getState().setArchitectActiveTab("command_center")} icon={t("icon_desktop_windows") as string} label={t("wf_tab_command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "registry"} onClick={() => useStore.getState().setArchitectActiveTab("registry")} icon={t("icon_inventory_2") as string} label={t("items")?.replace(/^[^\w]*/, '').trim() || "Artifacts"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "registry"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "queue"} onClick={() => useStore.getState().setArchitectActiveTab("queue")} icon={t("icon_search") as string} label={t("tab_queue")?.replace(/^[^\w]*/, '').trim() || "Queue"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "queue"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "lab"} onClick={() => useStore.getState().setArchitectActiveTab("lab")} icon={t("icon_monitor_heart") as string} label={t("tab_diagnostics")?.replace(/^[^\w]*/, '').trim() || "Diagnostics"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "lab"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "collections"} onClick={() => useStore.getState().setArchitectActiveTab("collections")} icon={t("icon_collections_bookmark") as string} label={t("tab_cc")?.replace(/^[^\w]*/, '').trim() || "Collections"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "collections"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "mason_queue"} onClick={() => useStore.getState().setArchitectActiveTab("mason_queue")} icon={t("icon_construction") as string} label={t("mason")?.replace(/^[^\w]*/, '').trim() || "Mason"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "mason_queue"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "template_oversight"} onClick={() => useStore.getState().setArchitectActiveTab("template_oversight")} icon={t("icon_data_object") as string} label={t("ql_templates")?.replace(/^[^\w]*/, '').trim() || "Templates"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "template_oversight"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "nexus_reports"} onClick={() => useStore.getState().setArchitectActiveTab("nexus_reports")} icon={t("icon_flag") as string} label={t("stat_bugs")?.replace(/^[^\w]*/, '').trim() || "Reports"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "nexus_reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().architectActiveTab === "support_tickets"} onClick={() => useStore.getState().setArchitectActiveTab("support_tickets")} icon={t("icon_local_activity") as string} label={t("wf_tab_tickets")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={useStore.getState().architectActiveTab === "support_tickets"} setHoveredTooltip={setHoveredTooltip} />
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
                  {view === "Oversight" && !isSidebarCollapsed && (
                    <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                      <NavButton active={useStore.getState().oversightActiveTab === "command_center"} onClick={() => useStore.getState().setOversightActiveTab("command_center")} icon={t("icon_desktop_windows") as string} label={t("wf_tab_command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "oversight_comms"} onClick={() => useStore.getState().setOversightActiveTab("oversight_comms")} icon={t("icon_satellite_alt") as string} label={t("wf_tab_dispatch")?.replace(/^[^\w]*/, '').trim() || "Dispatch"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "oversight_comms"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "identities"} onClick={() => useStore.getState().setOversightActiveTab("identities")} icon={t("icon_group") as string} label={t("tab_identities")?.replace(/^[^\w]*/, '').trim() || "Identities"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "identities"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "compliance"} onClick={() => useStore.getState().setOversightActiveTab("compliance")} icon={t("icon_policy") as string} label={t("tab_compliance")?.replace(/^[^\w]*/, '').trim() || "Compliance"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "compliance"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "linker"} onClick={() => useStore.getState().setOversightActiveTab("linker")} icon={t("icon_link") as string} label={t("tab_linker")?.replace(/^[^\w]*/, '').trim() || "Linker"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "linker"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "malware_oversight"} onClick={() => useStore.getState().setOversightActiveTab("malware_oversight")} icon={t("icon_coronavirus") as string} label={t("rating_malware")?.replace(/^[^\w]*/, '').trim() || "Malware"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "malware_oversight"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "oversight_reports"} onClick={() => useStore.getState().setOversightActiveTab("oversight_reports")} icon={t("icon_threat_intelligence") as string} label={t("tab_malware_logs")?.replace(/^[^\w]*/, '').trim() || "Logs"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "oversight_reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "sanctuary_tickets"} onClick={() => useStore.getState().setOversightActiveTab("sanctuary_tickets")} icon={t("icon_local_activity") as string} label={t("wf_tab_tickets")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "sanctuary_tickets"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "mass_update"} onClick={() => useStore.getState().setOversightActiveTab("mass_update")} icon={t("icon_dynamic_feed") as string} label={t("tab_mass_update")?.replace(/^[^\w]*/, '').trim() || "Mass Update"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "mass_update"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "game_versions"} onClick={() => useStore.getState().setOversightActiveTab("game_versions")} icon={t("icon_settings") as string} label={t("tab_game_versions")?.replace(/^[^\w]*/, '').trim() || "Versions"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "game_versions"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "support_settings"} onClick={() => useStore.getState().setOversightActiveTab("support_settings")} icon={t("icon_support_agent") as string} label={t("wf_tab_support")?.replace(/^[^\w]*/, '').trim() || "Settings"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "support_settings"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().oversightActiveTab === "audit_logs"} onClick={() => useStore.getState().setOversightActiveTab("audit_logs")} icon={t("icon_history") as string} label={t("tab_audit")?.replace(/^[^\w]*/, '').trim() || "Audit"} isCollapsed={false} isAccent={useStore.getState().oversightActiveTab === "audit_logs"} setHoveredTooltip={setHoveredTooltip} />
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
                  {view === "WayfinderHub" && !isSidebarCollapsed && (
                    <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                      <NavButton active={useStore.getState().wayfinderActiveTab === "command_center"} onClick={() => useStore.getState().setWayfinderActiveTab("command_center")} icon={t("icon_desktop_windows") as string} label={t("wf_tab_command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "wf_comms_title"} onClick={() => useStore.getState().setWayfinderActiveTab("wf_comms_title")} icon={t("icon_satellite_alt") as string} label={t("wf_tab_dispatch")?.replace(/^[^\w]*/, '').trim() || "Dispatch"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "wf_comms_title"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "sanctuary_tickets"} onClick={() => useStore.getState().setWayfinderActiveTab("sanctuary_tickets")} icon={t("icon_local_activity") as string} label={t("wf_tab_tickets")?.replace(/^[^\w]*/, '').trim() || "Support"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "sanctuary_tickets"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "identities"} onClick={() => useStore.getState().setWayfinderActiveTab("identities")} icon={t("icon_group") as string} label={t("tab_identities")?.replace(/^[^\w]*/, '').trim() || "Identities"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "identities"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "linker"} onClick={() => useStore.getState().setWayfinderActiveTab("linker")} icon={t("icon_link") as string} label={t("tab_linker")?.replace(/^[^\w]*/, '').trim() || "Linker"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "linker"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "compliance"} onClick={() => useStore.getState().setWayfinderActiveTab("compliance")} icon={t("icon_policy") as string} label={t("tab_compliance")?.replace(/^[^\w]*/, '').trim() || "Compliance"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "compliance"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "malware_oversight"} onClick={() => useStore.getState().setWayfinderActiveTab("malware_oversight")} icon={t("icon_coronavirus") as string} label={t("rating_malware")?.replace(/^[^\w]*/, '').trim() || "Malware"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "malware_oversight"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "oversight_reports"} onClick={() => useStore.getState().setWayfinderActiveTab("oversight_reports")} icon={t("icon_threat_intelligence") as string} label={t("tab_malware_logs")?.replace(/^[^\w]*/, '').trim() || "Logs"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "oversight_reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "reports"} onClick={() => useStore.getState().setWayfinderActiveTab("reports")} icon={t("icon_flag") as string} label={t("stat_bugs")?.replace(/^[^\w]*/, '').trim() || "Reports"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "reports"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "audit_logs"} onClick={() => useStore.getState().setWayfinderActiveTab("audit_logs")} icon={t("icon_history") as string} label={t("tab_audit")?.replace(/^[^\w]*/, '').trim() || "Audit"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "audit_logs"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "support_settings"} onClick={() => useStore.getState().setWayfinderActiveTab("support_settings")} icon={t("icon_support_agent") as string} label={t("wf_tab_support")?.replace(/^[^\w]*/, '').trim() || "Settings"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "support_settings"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "ide"} onClick={() => useStore.getState().setWayfinderActiveTab("ide")} icon="code" label="IDE" isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "ide"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().wayfinderActiveTab === "chameleons"} onClick={() => useStore.getState().setWayfinderActiveTab("chameleons")} icon="palette" label={t("wf_master_themes")?.replace(/^[^\w]*/, '').trim() || "Themes"} isCollapsed={false} isAccent={useStore.getState().wayfinderActiveTab === "chameleons"} setHoveredTooltip={setHoveredTooltip} />
                    </div>
                  )}
                </div>
              )}
              {session && !(!isDesktop() && isRootDomain()) && (osRole === "core_dev" || osRole === "admin" || osRole === "keeper") && (
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
                    label={t("sidebar_keepers_core")}
                    isCollapsed={isSidebarCollapsed}
                    isAccent={true}
                    setHoveredTooltip={setHoveredTooltip}
                  />
                  {view === "KeepersCore" && !isSidebarCollapsed && (
                    <div className="flex flex-col gap-0.5 mt-1.5 ml-3 pl-2 border-l border-[color-mix(in_srgb,var(--sidebartext)_10%,transparent)]">
                      <NavButton active={useStore.getState().keepersActiveTab === "command_center"} onClick={() => useStore.getState().setKeepersActiveTab("command_center")} icon={t("icon_desktop_windows") as string} label={t("wf_tab_command")?.replace(/^[^\w]*/, '').trim() || "Command Center"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "command_center"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "keepers_comms"} onClick={() => useStore.getState().setKeepersActiveTab("keepers_comms")} icon={t("icon_satellite_alt") as string} label={t("wf_tab_dispatch")?.replace(/^[^\w]*/, '').trim() || "Dispatch"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "keepers_comms"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "web_directives"} onClick={() => useStore.getState().setKeepersActiveTab("web_directives")} icon="folder_special" label="Directives" isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "web_directives"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "web_news"} onClick={() => useStore.getState().setKeepersActiveTab("web_news")} icon="public" label="News" isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "web_news"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "web_legal"} onClick={() => useStore.getState().setKeepersActiveTab("web_legal")} icon="gavel" label="Legal" isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "web_legal"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "active_games"} onClick={() => useStore.getState().setKeepersActiveTab("active_games")} icon="dns" label="Workspaces" isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "active_games"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "identities"} onClick={() => useStore.getState().setKeepersActiveTab("identities")} icon="group" label="Oversight" isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "identities"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "heuristics"} onClick={() => useStore.getState().setKeepersActiveTab("heuristics")} icon={t("icon_shield_lock") || "shield_lock"} label={t("core_heuristics_tab") || "Core Heuristics"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "heuristics"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "support"} onClick={() => useStore.getState().setKeepersActiveTab("support")} icon={t("icon_support_agent") as string} label="Support" isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "support"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "support_settings"} onClick={() => useStore.getState().setKeepersActiveTab("support_settings")} icon={t("icon_support_agent") as string} label={t("wf_tab_support")?.replace(/^[^\w]*/, '').trim() || "Settings"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "support_settings"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "audit_logs"} onClick={() => useStore.getState().setKeepersActiveTab("audit_logs")} icon={t("icon_history") as string} label={t("audit_title")?.replace(/^[^\w]*/, '').trim() || "Audit"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "audit_logs"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "ide"} onClick={() => useStore.getState().setKeepersActiveTab("ide")} icon="code" label="IDE" isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "ide"} setHoveredTooltip={setHoveredTooltip} />
                      <NavButton active={useStore.getState().keepersActiveTab === "chameleons"} onClick={() => useStore.getState().setKeepersActiveTab("chameleons")} icon="palette" label={t("wf_master_themes")?.replace(/^[^\w]*/, '').trim() || "Themes"} isCollapsed={false} isAccent={useStore.getState().keepersActiveTab === "chameleons"} setHoveredTooltip={setHoveredTooltip} />
                    </div>
                  )}
                </div>
              )}
            </>
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

        {schemaFeatures?.has_launch !== false && isDesktop() && (
          <div className="px-3.5 pb-3.5 pt-2 relative z-30">
            <div className="relative group/nav">
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
                onClick={(e) => {
                  if (!isConfigured) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  handleQuickLaunch(e);
                }}
                disabled={!isConfigured}
                style={
                  isConfigured
                    ? {
                        boxShadow: 'var(--glass-nav-active-shadow)',
                      }
                    : undefined
                }
                className={`relative w-full py-3 rounded-xl text-[10px] font-black capitalize tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-2.5 group/btn overflow-hidden border-0 cursor-pointer ${!isConfigured
                  ? "bg-[color-mix(in_srgb,var(--text)_4%,transparent)] text-[var(--text)] opacity-30 cursor-not-allowed"
                  : isPatchDetected || showDefconAlert
                    ? "bg-[color-mix(in_srgb,var(--danger)_12%,var(--glass-nav-active-bg))] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,var(--glass-nav-active-bg))]"
                    : "bg-[color-mix(in_srgb,var(--success)_12%,var(--glass-nav-active-bg))] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_18%,var(--glass-nav-active-bg))]"
                  }`}
              >
                {/* Dynamic Sweep effect inside button */}
                {isConfigured && (
                  <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 ease-in-out" />
                )}

                <span className="relative z-10 material-symbols-outlined !text-[17px] transition-transform group-hover/btn:scale-110">
                  {t("icon_rocket_launch")}
                </span>
                {!isSidebarCollapsed && (
                  <span className="relative z-10">
                    {t("sidebar_quick_launch")}
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
