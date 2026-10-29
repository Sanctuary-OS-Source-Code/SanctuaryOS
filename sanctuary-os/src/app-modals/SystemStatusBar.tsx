import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useTooltipStore } from "../store/tooltipStore";
import { isDesktop } from "../utils/envUtils";
import { isRootDomain } from "../utils/routingUtils";
import { HoverTooltip } from '../shared';

export function SystemStatusBar({
  isSidebarCollapsed,
  isNotificationSidebarOpen,
  setIsNotificationSidebarOpen,
  unreadNotificationCount,
  isLogExpanded,
  setIsLogExpanded,
  status,
  isScanning,
  isErrorStatus,
  isSuccessStatus,
  updatePayload,
  isSystemStatusOpen,
  setIsSystemStatusOpen,
  setIsSideBrowserOpen,
}: any) {
  const { t } = useLexicon();
  const isConfigured = useStore((state) => state.isConfigured);
  const nexusUpdatesCount = useStore((state) => state.nexusUpdatesCount);
  const setView = useStore((state) => state.setView);
  const view = useStore((state) => state.view);
  const activeConflictCount = useStore((state) => state.activeConflictCount) || { tier4: 0, tier3: 0 };
  const activeBrokenCounts = useStore((state) => state.activeBrokenCounts) || { broken: 0, unstable: 0 };
  const networkUpdates = useStore((state) => state.networkUpdates) || { updated: [] };
  const activePlaySetIndex = useStore((state) => state.activePlaySetIndex);
  const playSets = useStore((state) => state.playSets);
  const scanProgress = useStore((state: any) => state.scanProgress);
  const quarantineList = useStore((state) => state.quarantineList);
  const isAlertsOpen = useStore((state) => state.isAlertsOpen);

  const {
    isSideBrowserOpen,
    useInternalBrowser,
    scoutQueue,
    setIsScoutPanelOpen,
    isScoutPanelOpen,
    dnaMatchQueue,
    isDnaModalOpen,
    setIsDnaModalOpen,
    isBlueprintSwapOpen,
    setIsBlueprintSwapOpen,
    isConflictRadarOpen,
    setIsConflictRadarOpen,
    setIsNexusUpdatesPanelOpen,
    isNexusUpdatesPanelOpen,
    setIsUpdatePanelOpen,
    isUpdatePanelOpen,
    volatileSignatureQueue,
    isSignatureQueueOpen,
    setIsSignatureQueueOpen,
    showUpdatesModal,
    showConflictsPanel,
    showIncompatiblePanel,
  } = useModalStore();

  const updatesCount = React.useMemo(() => {
    if (!networkUpdates?.updated || typeof activePlaySetIndex !== 'number' || !playSets || !playSets[activePlaySetIndex]) return 0;
    const currentMods = playSets[activePlaySetIndex].mods || [];
    const safeMods = currentMods.map((m: any) => (typeof m === 'string' ? m.toLowerCase().replace(/\\/g, '/') : ''));

    const filtered = networkUpdates.updated.filter((u: any) => {
      const uName = String(u.name).split(/[\\/]/).pop()?.toLowerCase() || String(u.name).toLowerCase();
      return safeMods.some((m: string) => m === uName || m.endsWith(`/${uName}`) || m.endsWith(`\\${uName}`));
    });
    return Object.keys(filtered.reduce((acc: any, u: any) => { acc[u.dbId || u.name] = true; return acc; }, {}) || {}).length || 0;
  }, [networkUpdates, activePlaySetIndex, playSets]);

  const tier4Count = activeConflictCount.tier4 || 0;
  const tier3Count = activeConflictCount.tier3 || 0;
  const brokenCount = activeBrokenCounts.broken || 0;
  const unstableCount = activeBrokenCounts.unstable || 0;

  let radarState = "optimal";
  if (tier4Count > 0 || brokenCount > 0) {
    radarState = "critical";
  } else if (tier3Count > 0 || unstableCount > 0) {
    radarState = "warning";
  } else if (updatesCount > 0) {
    radarState = "update";
  }

  const radarIconColor =
    radarState === 'critical'
      ? 'text-[var(--danger)]'
      : radarState === 'warning'
        ? 'text-[var(--warning)]'
        : radarState === 'update'
          ? 'text-[var(--accent)]'
          : 'text-[var(--success)]';

  const isStandby =
    typeof status === 'string' &&
    (status.toUpperCase().includes('STANDING BY') || status.toUpperCase().includes('STANDBY'));
  const showToast = Boolean((!isStandby && status) || isErrorStatus || isSuccessStatus || isScanning);

  const [isDockHovered, setIsDockHovered] = useState(false);
  const [hasDomSidePanel, setHasDomSidePanel] = useState(false);
  const [isHubLockdownActive, setIsHubLockdownActive] = useState(false);
  const [isScrolledBottom, setIsScrolledBottom] = useState(false);
  const dockTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect any open SidePanel in #sa-portals so the dock automatically tucks out of the way of panel footers,
  // and detect when Hub Lockdown ([data-passthrough="true"]) is active so notifications are hidden and Settings is accessible.
  useEffect(() => {
    const checkPanels = () => {
      const openPanels = document.querySelectorAll('.sa-side-panel-wrapper.sa-panel-open:not([data-passthrough="true"])');
      setHasDomSidePanel(openPanels.length > 0);
      const lockdownPanels = document.querySelectorAll('.sa-side-panel-wrapper.sa-panel-open[data-passthrough="true"]');
      setIsHubLockdownActive(lockdownPanels.length > 0);
    };
    checkPanels();
    const portalRoot = document.getElementById('sa-portals') || document.body;
    const observer = new MutationObserver(checkPanels);
    observer.observe(portalRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-passthrough'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isHubLockdownActive && isNotificationSidebarOpen) {
      setIsNotificationSidebarOpen(false);
    }
  }, [isHubLockdownActive, isNotificationSidebarOpen, setIsNotificationSidebarOpen]);

  // Detect when the user scrolls to the very bottom of the main scroll container
  useEffect(() => {
    const mainEl = document.getElementById('sanctuary-main-scroll');
    if (!mainEl) return;
    const handleScroll = () => {
      const scrollableDistance = mainEl.scrollHeight - mainEl.clientHeight;
      if (scrollableDistance > 120 && mainEl.scrollTop >= scrollableDistance - 48) {
        setIsScrolledBottom(true);
      } else {
        setIsScrolledBottom(false);
      }
    };
    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, [view]);

  useEffect(() => {
    if (isSideBrowserOpen) {
      if (dockTimeout.current) clearTimeout(dockTimeout.current);
      setIsDockHovered(false);
    }
  }, [isSideBrowserOpen]);

  const handleDockEnter = () => {
    if (isSideBrowserOpen) return;
    if (dockTimeout.current) clearTimeout(dockTimeout.current);
    useTooltipStore.getState().clearTooltip();
    setIsDockHovered(true);
  };

  const handleDockLeave = () => {
    if (dockTimeout.current) clearTimeout(dockTimeout.current);
    dockTimeout.current = setTimeout(() => {
      setIsDockHovered(false);
    }, 220);
  };

  const isRoot = !isDesktop() && isRootDomain();
  const [isLandingContext, setIsLandingContext] = useState<boolean>(() =>
    view === 'landing' || !isConfigured || isRoot
  );

  useEffect(() => {
    if (view === 'landing' || !isConfigured || isRoot) {
      setIsLandingContext(true);
    } else if (view !== 'KeepersCore' && view !== 'settings') {
      setIsLandingContext(false);
    }
  }, [view, isConfigured, isRoot]);

  const isWorkspaceDockActive = isConfigured && !isLandingContext;

  const sigQueueCount = volatileSignatureQueue?.resolvedItems?.length || 0;
  const quarantineCount = isDesktop() && quarantineList ? quarantineList.length : 0;
  const dnaCount = dnaMatchQueue ? dnaMatchQueue.length : 0;
  const scoutCount = isDesktop() && scoutQueue ? scoutQueue.length : 0;
  const nexusCount = isDesktop() ? (nexusUpdatesCount || 0) : 0;
  const hasAppUpdate = Boolean(updatePayload);
  const notifCount = unreadNotificationCount || 0;

  const hasQueueAlerts =
    isWorkspaceDockActive &&
    !isHubLockdownActive &&
    (quarantineCount > 0 ||
      dnaCount > 0 ||
      sigQueueCount > 0 ||
      scoutCount > 0 ||
      nexusCount > 0 ||
      hasAppUpdate ||
      notifCount > 0);

  const isAnyPanelOpen =
    hasDomSidePanel ||
    Boolean(
      isScoutPanelOpen ||
      isDnaModalOpen ||
      isSignatureQueueOpen ||
      isBlueprintSwapOpen ||
      isConflictRadarOpen ||
      isNexusUpdatesPanelOpen ||
      isUpdatePanelOpen ||
      isSystemStatusOpen ||
      isNotificationSidebarOpen ||
      isAlertsOpen ||
      showUpdatesModal ||
      showConflictsPanel ||
      showIncompatiblePanel
    );

  // Tuck down into a sleek edge handle when:
  // 1) A SidePanel is open (so we never block panel footer buttons), OR
  // 2) The user scrolled to the very bottom of a page, OR
  // 3) There are no active alerts and no active status toast (unless Hub Lockdown is active)
  const shouldTuckToRim =
    !isHubLockdownActive &&
    !isDockHovered &&
    !showToast &&
    (isAnyPanelOpen || isScrolledBottom || !hasQueueAlerts);

  const renderStatusContent = () => {
    if (isScanning && scanProgress) {
      const pct = scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0;
      return (
        <span className="flex items-center gap-2 truncate">
          <span className="truncate text-[var(--text)]">
            {t("btn_radar", "Conflict Scan") || "Radar"}: {scanProgress.message}
          </span>
          <span className="text-[var(--accent)] font-black shrink-0">{pct}%</span>
        </span>
      );
    }
    if (typeof status !== 'string') return status;
    const match = status.match(/^([a-z_0-9]+)\s+(.*)$/);
    const knownIcons = [
      'check_circle', 'warning', 'error', 'info', 'sync', 'flight_takeoff', 'radar',
      'terminal', 'bug_report', 'extension', 'block', 'update', 'done', 'download',
      'delete', 'close', 'add', 'verified', 'new_releases', 'local_fire_department',
      'health_and_safety', 'folder_open', 'inventory_2', 'account_tree', 'priority_high',
      'notifications_active',
    ];
    if (match && (knownIcons.includes(match[1]) || match[1].includes('_'))) {
      return <span className="truncate">{match[2]}</span>;
    }
    return <span className="truncate">{status}</span>;
  };

  const resolveStatusIcon = () => {
    if (isScanning) return t("icon_radar", "radar") || "radar";
    if (isErrorStatus) return t("icon_error", "error") || "error";
    if (isSuccessStatus) return t("icon_check_circle", "check_circle") || "check_circle";
    if (typeof status === 'string') {
      const match = status.match(/^([a-z_0-9]+)\s+(.*)$/);
      if (match && match[1].includes('_')) return match[1];
    }
    return t("icon_terminal", "terminal") || "terminal";
  };

  return createPortal(
    <>
      {/* Mobile Top-Right Compact Alert Pod */}
      {isWorkspaceDockActive && hasQueueAlerts && !isSideBrowserOpen && !isHubLockdownActive && (
        <div data-sa-dock="true" className="md:hidden fixed top-[calc(env(safe-area-inset-top,0px)+12px)] right-4 z-[14000] pointer-events-auto">
          <div className="glass-panel sa-floating-glass-pill flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl">
            {sigQueueCount > 0 && (
              <button
                onClick={() => setIsSignatureQueueOpen(true)}
                className="flex items-center gap-1 text-[var(--success)]"
              >
                <span className="material-symbols-outlined !text-[15px]">{t("icon_phonelink_ring", "phonelink_ring") || "phonelink_ring"}</span>
                <span className="text-[11px] font-black">{sigQueueCount}</span>
              </button>
            )}
            {notifCount > 0 && (
              <button
                onClick={() => setIsNotificationSidebarOpen(true)}
                className="flex items-center gap-1 text-[var(--accent)]"
              >
                <span className="material-symbols-outlined !text-[15px]">{t("icon_notifications_active", "notifications_active") || "notifications_active"}</span>
                <span className="text-[11px] font-black">{notifCount}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Desktop Single Morphing Pill (Aligned with Main Content Area) */}
      {!isSideBrowserOpen && (
        <div data-sa-dock="true" className="fixed bottom-0 left-0 right-0 z-[99999] hidden md:flex items-end pointer-events-none px-6">
          {/* Sidebar width spacer so the dock centers directly under the top Workspace Selector pill */}
          <div
            className="shrink-0 transition-all duration-500 hidden md:block"
            style={{ width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }}
          />

          <div className="flex-1 flex justify-center items-end">
            <div
              onMouseEnter={handleDockEnter}
              onMouseLeave={handleDockLeave}
              style={{
                marginBottom: shouldTuckToRim ? '-36px' : '12px',
                transitionProperty: 'margin-bottom, border-color, box-shadow',
                transitionDuration: '400ms',
                transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="pointer-events-auto glass-panel sa-floating-glass-pill h-9 rounded-2xl flex items-center px-3 relative"
            >
              {/* 1. INLINE STATUS SEGMENT (Morphs inside the same pill on Save / Scan / Error) */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLogExpanded(!isLogExpanded);
                }}
                className={`flex items-center gap-2 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer rounded-xl ${
                  showToast
                    ? 'max-w-[380px] opacity-100 px-2 py-1 mr-1 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]'
                    : 'max-w-0 opacity-0 px-0 py-0 mr-0 pointer-events-none'
                }`}
              >
                <span
                  className={`material-symbols-outlined !text-[15px] shrink-0 ${
                    isScanning
                      ? 'animate-spin text-[var(--accent)]'
                      : isErrorStatus
                        ? 'text-[var(--danger)]'
                        : isSuccessStatus
                          ? 'text-[var(--success)]'
                          : 'text-[var(--accent)]'
                  }`}
                >
                  {resolveStatusIcon()}
                </span>
                <span
                  className={`text-[11px] font-bold tracking-wide truncate max-w-[310px] ${
                    isErrorStatus
                      ? 'text-[var(--danger)]'
                      : isSuccessStatus
                        ? 'text-[var(--success)]'
                        : 'text-[var(--text)]'
                  }`}
                >
                  {renderStatusContent()}
                </span>
              </div>

              {/* Divider between active Status and Alerts/Tools */}
              {showToast && (hasQueueAlerts || isDockHovered || isHubLockdownActive) && (
                <div className="w-[1px] h-3.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] mx-1 shrink-0" />
              )}

              {/* 2. ACTIVE ALERT ITEMS (Clean icon + count sitting directly on the glass, no inner bubbles; hidden during Hub Lockdown) */}
              {isWorkspaceDockActive && !isHubLockdownActive && (
                <div className="flex items-center gap-0.5 shrink-0">
                  {quarantineCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setView("vault");
                      }}
                      className="h-7 px-2 rounded-xl shrink-0 cursor-pointer transition-all flex items-center gap-1.5 text-[var(--danger)] opacity-90 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] group/btn relative"
                    >
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_warning_amber", "warning_amber") || "warning_amber"}</span>
                      <span className="text-[11px] font-black leading-none">{quarantineCount}</span>
                      <HoverTooltip
                        title={<><span className="font-black text-[var(--danger)]">{quarantineCount}</span> {t("malware_alert_title", "Malware Detected") || "Malware Detected"}</>}
                        variant="danger"
                        noIcon={true}
                        className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                      />
                    </button>
                  )}

                  {dnaCount > 0 && isDesktop() && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDnaModalOpen(!isDnaModalOpen);
                      }}
                      className={`h-7 px-2 rounded-xl shrink-0 cursor-pointer transition-all flex items-center gap-1.5 text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] group/btn relative ${
                        isDnaModalOpen
                          ? 'sa-glass-active opacity-100'
                          : 'opacity-85 hover:opacity-100'
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_radar", "radar") || "radar"}</span>
                      <span className="text-[11px] font-black leading-none">{dnaCount}</span>
                      <HoverTooltip
                        title={<><span className="font-black text-[var(--warning)]">{dnaCount}</span> {t("radar_title", "Conflict Scanner") || "Conflict Radar"}</>}
                        variant="warning"
                        noIcon={true}
                        className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                      />
                    </button>
                  )}

                  {sigQueueCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSignatureQueueOpen(!isSignatureQueueOpen);
                      }}
                      className={`h-7 px-2 rounded-xl shrink-0 cursor-pointer transition-all flex items-center gap-1.5 text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] group/btn relative ${
                        isSignatureQueueOpen
                          ? 'sa-glass-active opacity-100'
                          : 'opacity-85 hover:opacity-100'
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_phonelink_ring", "phonelink_ring") || "phonelink_ring"}</span>
                      <span className="text-[11px] font-black leading-none">{sigQueueCount}</span>
                      <HoverTooltip
                        title={<><span className="font-black text-[var(--success)]">{sigQueueCount}</span> {t("sig_queue_title", "Signature Queue") || "Signature Queue"}</>}
                        variant="default"
                        noIcon={true}
                        className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                      />
                    </button>
                  )}

                  {scoutCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsScoutPanelOpen(!isScoutPanelOpen);
                      }}
                      className={`h-7 px-2 rounded-xl shrink-0 cursor-pointer transition-all flex items-center gap-1.5 text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] group/btn relative ${
                        isScoutPanelOpen
                          ? 'sa-glass-active opacity-100'
                          : 'opacity-85 hover:opacity-100'
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_biotech", "biotech") || "biotech"}</span>
                      <span className="text-[11px] font-black leading-none">{scoutCount}</span>
                      <HoverTooltip
                        title={<><span className="font-black text-[var(--accent)]">{scoutCount}</span> {t("queue_title", "Unidentified Files") || "Scout Queue"}</>}
                        variant="accent"
                        noIcon={true}
                        className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                      />
                    </button>
                  )}

                  {nexusCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsNexusUpdatesPanelOpen(true);
                      }}
                      className="h-7 px-2 rounded-xl shrink-0 cursor-pointer transition-all flex items-center gap-1.5 text-[var(--accent)] opacity-90 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] group/btn relative"
                    >
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_cloud_download", "cloud_download") || "cloud_download"}</span>
                      <span className="text-[11px] font-black leading-none">{nexusCount}</span>
                      <HoverTooltip
                        title={<>{nexusCount} {t("updates_ready", "Updates Ready") || "Updates Ready"}</>}
                        variant="accent"
                        noIcon={true}
                        className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                      />
                    </button>
                  )}

                  {hasAppUpdate && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsUpdatePanelOpen(true);
                      }}
                      className="h-7 px-2 rounded-xl shrink-0 cursor-pointer transition-all flex items-center gap-1.5 text-[var(--accent)] opacity-90 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] group/btn relative"
                    >
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_system_update_alt", "system_update_alt") || "system_update_alt"}</span>
                      <span className="text-[11px] font-black leading-none">1</span>
                      <HoverTooltip
                        title={
                          updatePayload?.isDevChannel
                            ? t("sys_stat_dev_update_available", "Dev Build Available")
                            : t("updates_ready", "Updates Ready")
                        }
                        variant="accent"
                        noIcon={true}
                        className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                      />
                    </button>
                  )}

                  {/* Unread Notification item when collapsed (when hovered, the Bell icon in the tools section shows the badge) */}
                  {notifCount > 0 && !isDockHovered && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsNotificationSidebarOpen(!isNotificationSidebarOpen);
                      }}
                      className="h-7 px-2 rounded-xl shrink-0 cursor-pointer transition-all flex items-center gap-1.5 text-[var(--accent)] opacity-90 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] group/btn relative"
                    >
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_notifications_active", "notifications_active") || "notifications_active"}</span>
                      <span className="text-[11px] font-black leading-none">{notifCount}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Minimal idle handle indicator when there are 0 alerts, no status toast, and not hovered */}
              {!hasQueueAlerts && !showToast && !isDockHovered && !isHubLockdownActive && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-[var(--subtext)] opacity-70">
                  <span className={`w-1.5 h-1.5 rounded-full ${radarState === 'critical' ? 'bg-[var(--danger)]' : radarState === 'warning' ? 'bg-[var(--warning)]' : 'bg-[var(--accent)]'}`} />
                  <span className="w-1 h-1 rounded-full bg-[var(--text)] opacity-40" />
                  <span className="w-1 h-1 rounded-full bg-[var(--text)] opacity-40" />
                </div>
              )}

              {/* 3. EXPANDABLE DOCK TOOLS (Smoothly expands inside the same pill on direct hover, or stays visible during Hub Lockdown) */}
              <div
                className={`flex items-center gap-0.5 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  isDockHovered || isHubLockdownActive
                    ? 'max-w-[440px] opacity-100 pl-0.5'
                    : 'max-w-0 opacity-0 overflow-hidden pl-0 pointer-events-none'
                }`}
              >
                {hasQueueAlerts && (
                  <div className="w-[1px] h-4 bg-[color-mix(in_srgb,var(--text)_14%,transparent)] mx-1 shrink-0" />
                )}

                {isWorkspaceDockActive && isDesktop() && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsConflictRadarOpen(!isConflictRadarOpen);
                    }}
                    className={`flex items-center justify-center w-7 h-7 rounded-xl shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn relative ${
                      isConflictRadarOpen
                        ? 'sa-glass-active text-[var(--text)] opacity-100'
                        : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    <span className={`material-symbols-outlined !text-[18px] ${radarIconColor}`}>
                      {t("icon_radar", "radar") || "radar"}
                    </span>
                    <HoverTooltip
                      title={t("btn_radar", "Conflict Scan") || "Radar"}
                      variant="default"
                      noIcon={true}
                      className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                    />
                  </button>
                )}

                {isWorkspaceDockActive && isDesktop() && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBlueprintSwapOpen(!isBlueprintSwapOpen);
                    }}
                    className={`flex items-center justify-center w-7 h-7 rounded-xl shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn relative ${
                      isBlueprintSwapOpen
                        ? 'sa-glass-active text-[var(--text)] opacity-100'
                        : 'text-[var(--text)] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[18px]">{t("icon_map", "map") || "map"}</span>
                    <HoverTooltip
                      title={t("playsets_title", "{Blueprints}") || "Blueprints"}
                      variant="default"
                      noIcon={true}
                      className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                    />
                  </button>
                )}

                {isWorkspaceDockActive && isDesktop() && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSystemStatusOpen((prev: boolean) => !prev);
                    }}
                    className={`flex items-center justify-center w-7 h-7 rounded-xl shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn relative ${
                      isSystemStatusOpen
                        ? 'sa-glass-active text-[var(--text)] opacity-100'
                        : 'text-[var(--text)] opacity-75 hover:opacity-100'
                    } ${
                      isErrorStatus
                        ? '!text-[var(--danger)] !opacity-100'
                        : updatePayload
                          ? '!text-[var(--accent)] !opacity-100'
                          : isSuccessStatus
                            ? '!text-[var(--success)] !opacity-100'
                            : ''
                    }`}
                  >
                    <div className="relative flex items-center justify-center">
                      <span className="material-symbols-outlined !text-[18px] transition-transform duration-500 group-hover/btn:scale-110">
                        {t("icon_memory", "memory") || "memory"}
                      </span>
                      {updatePayload && (
                        <span className="material-symbols-outlined absolute -bottom-1 -right-1 !text-[11px] text-[var(--accent)]">
                          {t("icon_download", "download") || "download"}
                        </span>
                      )}
                      {isErrorStatus && !updatePayload && (
                        <span className="material-symbols-outlined absolute -bottom-1 -right-1 !text-[11px] text-[var(--danger)]">
                          {t("icon_warning", "warning") || "warning"}
                        </span>
                      )}
                      {isSuccessStatus && !updatePayload && !isErrorStatus && (
                        <span className="material-symbols-outlined absolute -bottom-1 -right-1 !text-[11px] text-[var(--success)]">
                          {t("icon_check_circle", "check_circle") || "check_circle"}
                        </span>
                      )}
                    </div>
                    <HoverTooltip
                      title={
                        isErrorStatus
                          ? t("status_critical", "Critical Alert") || "Critical"
                          : isSuccessStatus
                            ? t("status_stable", "STABLE") || "Stable"
                            : updatePayload
                              ? t("updates_ready", "Updates Ready") || "Updates Ready"
                              : status || t("system_status", "System Status") || "System Status"
                      }
                      variant={isErrorStatus ? "danger" : updatePayload ? "accent" : "default"}
                      noIcon={true}
                      className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                    />
                  </button>
                )}

                {isWorkspaceDockActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLogExpanded(!isLogExpanded);
                    }}
                    className={`flex items-center justify-center w-7 h-7 rounded-xl shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn relative ${
                      isLogExpanded
                        ? 'sa-glass-active text-[var(--text)] opacity-100'
                        : 'text-[var(--text)] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[18px]">{t("icon_terminal", "terminal") || "terminal"}</span>
                    <HoverTooltip
                      title={t("sys_log_history", "System Log History") || "System Logs"}
                      variant="default"
                      noIcon={true}
                      className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                    />
                  </button>
                )}

                {isWorkspaceDockActive && useInternalBrowser && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSideBrowserOpen(!isSideBrowserOpen);
                    }}
                    className={`flex items-center justify-center w-7 h-7 rounded-xl shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn relative ${
                      isSideBrowserOpen
                        ? 'sa-glass-active text-[var(--text)] opacity-100'
                        : 'text-[var(--text)] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[18px] transition-transform duration-500 group-hover/btn:scale-110">
                      {t("icon_public", "public") || "public"}
                    </span>
                    <HoverTooltip
                      title={t("sidebar_web_browser", "Sanctuary Browser") || "Web Browser"}
                      variant="default"
                      noIcon={true}
                      className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                    />
                  </button>
                )}

                {isWorkspaceDockActive && useInternalBrowser && (
                  <div className="w-[1px] h-4 bg-[color-mix(in_srgb,var(--text)_14%,transparent)] mx-0.5 shrink-0" />
                )}

                {isWorkspaceDockActive && !isHubLockdownActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsNotificationSidebarOpen(!isNotificationSidebarOpen);
                    }}
                    className={`flex items-center justify-center h-7 ${
                      notifCount > 0 ? 'px-2 gap-1.5 text-[var(--accent)]' : 'w-7 text-[var(--text)]'
                    } rounded-xl shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn relative ${
                      isNotificationSidebarOpen
                        ? 'sa-glass-active opacity-100'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined !text-[18px] transition-all ${
                        notifCount > 0 ? 'text-[var(--accent)] opacity-100' : ''
                      }`}
                    >
                      {notifCount > 0
                        ? t("icon_notifications_active", "notifications_active") || "notifications_active"
                        : t("icon_notifications", "notifications") || "notifications"}
                    </span>
                    {notifCount > 0 && (
                      <span className="text-[11px] font-black text-[var(--accent)] leading-none">{notifCount}</span>
                    )}
                    <HoverTooltip
                      title={
                        notifCount > 0 ? (
                          <>
                            <span className="font-black text-[var(--accent)]">{notifCount}</span>{" "}
                            {t("tab_notifs", "Notifications") || "Notifications"}
                          </>
                        ) : (
                          t("tab_notifs", "Notifications") || "Notifications"
                        )
                      }
                      variant={notifCount > 0 ? "accent" : "default"}
                      noIcon={true}
                      className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                    />
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setView('settings');
                  }}
                  className={`flex items-center justify-center w-7 h-7 rounded-xl shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn relative ${
                    view === 'settings'
                      ? 'sa-glass-active text-[var(--text)] opacity-100'
                      : 'text-[var(--text)] opacity-75 hover:opacity-100'
                  }`}
                >
                  <span className="material-symbols-outlined !text-[18px] transition-opacity">
                    {t("icon_settings", "settings") || "settings"}
                  </span>
                  <HoverTooltip
                    title={t("tab_preferences", "Preferences") || "Settings"}
                    variant="default"
                    noIcon={true}
                    className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
