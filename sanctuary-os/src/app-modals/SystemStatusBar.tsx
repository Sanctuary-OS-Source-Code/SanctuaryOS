import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { isDesktop } from "../utils/envUtils";
import { isRootDomain } from "../utils/routingUtils";
import { HoverTooltip } from '../shared';

export function SystemStatusBar({ isSidebarCollapsed, isNotificationSidebarOpen, setIsNotificationSidebarOpen, unreadNotificationCount, isLogExpanded, setIsLogExpanded, status, isScanning, isErrorStatus, isSuccessStatus, statusBgClass, statusAccentClass, statusIconClass, statusTextClass, updatePayload, isSystemStatusOpen, setIsSystemStatusOpen, setIsSideBrowserOpen }: any) {
  const { t } = useLexicon();
  const isConfigured = useStore(state => state.isConfigured);
  const nexusUpdatesCount = useStore(state => state.nexusUpdatesCount);
  const nexusUpdateTabs = useStore(state => state.nexusUpdateTabs);
  const setView = useStore(state => state.setView);
  const view = useStore(state => state.view);
  const setMarketTab = useStore(state => state.setMarketTab);
  const activeConflictCount = useStore(state => state.activeConflictCount) || { tier4: 0, tier3: 0 };
  const activeBrokenCounts = useStore(state => state.activeBrokenCounts) || { broken: 0, unstable: 0 };
  const networkUpdates = useStore(state => state.networkUpdates) || { updated: [] };
  const activePlaySetIndex = useStore(state => state.activePlaySetIndex);
  const playSets = useStore(state => state.playSets);
  const scanProgress = useStore((state: any) => state.scanProgress);
  const quarantineList = useStore(state => state.quarantineList);
  const { isSideBrowserOpen, scoutQueue, setIsScoutPanelOpen, isScoutPanelOpen, dnaMatchQueue, isDnaModalOpen, setIsDnaModalOpen, isBlueprintSwapOpen, setIsBlueprintSwapOpen, isConflictRadarOpen, setIsConflictRadarOpen, setIsNexusUpdatesPanelOpen, setIsUpdatePanelOpen, setShowQuarantineModal } = useModalStore();

  const updatesCount = React.useMemo(() => {
    if (!networkUpdates?.updated || typeof activePlaySetIndex !== 'number' || !playSets || !playSets[activePlaySetIndex]) return 0;
    const currentMods = playSets[activePlaySetIndex].mods || [];
    const safeMods = currentMods.map((m: any) => typeof m === 'string' ? m.toLowerCase().replace(/\\/g, '/') : '');

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

  const radarIconColor = radarState === 'critical' ? 'text-[var(--danger)] drop-shadow-[0_0_5px_var(--danger)]' :
    radarState === 'warning' ? 'text-[var(--warning)] drop-shadow-[0_0_5px_var(--warning)]' :
      radarState === 'update' ? 'text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]' :
        'text-[var(--success)] drop-shadow-[0_0_5px_var(--success)]';

  const isStandby = typeof status === 'string' && (status.toUpperCase().includes('STANDING BY') || status.toUpperCase().includes('STANDBY'));
  const showToast = (!isStandby && status) || isErrorStatus || isSuccessStatus || isScanning;

  const [isDockHovered, setIsDockHovered] = useState(false);
  const dockTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleDockEnter = () => {
    if (dockTimeout.current) clearTimeout(dockTimeout.current);
    setIsDockHovered(true);
  };

  const handleDockLeave = () => {
    dockTimeout.current = setTimeout(() => {
      setIsDockHovered(false);
    }, 300);
  };

  const isRoot = !isDesktop() && isRootDomain();
  const hasDockNotifications = !isRoot && ((nexusUpdatesCount > 0) || (unreadNotificationCount > 0) || (scoutQueue && scoutQueue.length > 0) || (dnaMatchQueue && dnaMatchQueue.length > 0) || updatePayload || (quarantineList && quarantineList.length > 0));

  const dockTransformClass = isDockHovered ? 'translate-y-0' : 'translate-y-[calc(100%-16px)]';
  const dockOpacityClass = isDockHovered ? 'opacity-100' : 'opacity-40';

  return createPortal(
    <>
      <div
        className={`fixed bottom-12 left-1/2 -translate-x-1/2 z-[9999999] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${showToast ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-4 opacity-0 pointer-events-none"}`}
      >
        <div
          onClick={() => setIsNotificationSidebarOpen(true)}
          className={`flex items-center gap-3 px-5 py-2.5 rounded-full shadow-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors ${statusBgClass}`}
        >
          <span className={`material-symbols-outlined text-[16px] shrink-0 opacity-70 ${statusIconClass} ${isScanning ? 'animate-spin-slow text-[var(--accent)]' : ''}`}>
            {isScanning ? t("icon_radar") : isErrorStatus ? 'error' : isSuccessStatus ? 'check_circle' : 'terminal'}
          </span>
          <span className={`${statusTextClass} opacity-50 shrink-0 text-[10px] capitalize tracking-widest font-black`}>{t("status")} </span>
          <span className={`${isErrorStatus ? 'text-red-100' : isSuccessStatus ? 'text-emerald-100' : 'text-[var(--text)]'} font-bold text-xs truncate max-w-[400px] flex items-center drop-shadow-md`}>
            {(() => {
              if (isScanning && scanProgress) {
                return (
                  <span className="flex items-center gap-2">
                    <span className="truncate">{t("btn_radar")}: {scanProgress.message}</span>
                    <span className="text-[var(--accent)] font-black">{scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%</span>
                  </span>
                );
              }
              if (typeof status !== 'string') return status;
              const match = status.match(/^([a-z_0-9]+)\s+(.*)$/);
              const knownIcons = ['check_circle', 'warning', 'error', 'info', 'sync', 'flight_takeoff', 'radar', 'terminal', 'bug_report', 'extension', 'block', 'update', 'done', 'download', 'delete', 'close', 'add', 'verified', 'new_releases', 'local_fire_department', 'health_and_safety', 'folder_open', 'inventory_2', 'account_tree', 'priority_high', 'notifications_active'];
              if (match && (knownIcons.includes(match[1]) || match[1].includes('_'))) {
                return (
                  <span className="flex items-center gap-2">
                    <span className={`material-symbols-outlined !text-[14px] leading-none ${statusIconClass}`}>{match[1]}</span>
                    <span className="truncate">{match[2]}</span>
                  </span>
                );
              }
              return <span className="truncate">{status}</span>;
            })()}
          </span>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:z-[9999999] max-md:z-[14000] flex flex-col items-center justify-end pointer-events-none">

        {!isRoot && (
          <div className={`absolute max-md:fixed bottom-[20px] max-md:top-[20px] max-md:right-4 max-md:bottom-auto max-md:left-auto transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${hasDockNotifications && !isDockHovered ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-8 max-md:-translate-y-8 scale-95 pointer-events-none'}`}>
            <div className="glass-panel flex items-center gap-4 px-5 py-2 rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[0_10px_30px_color-mix(in_srgb,var(--accent)_20%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-xl animate-[pulse_4s_cubic-bezier(0.4,0,0.6,1)_infinite]">
              {quarantineList && quarantineList.length > 0 && isDesktop() && (
                <button onClick={() => setShowQuarantineModal(true)} className="flex items-center gap-1.5 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] hover:scale-110 transition-transform cursor-pointer">
                  <span className="material-symbols-outlined !text-[15px]">warning_amber</span>
                  <span className="text-[11px] font-black">{quarantineList.length}</span>
                </button>
              )}
              {dnaMatchQueue && dnaMatchQueue.length > 0 && (
                <button onClick={() => setIsDnaModalOpen(true)} className="flex items-center gap-1.5 text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)] hover:scale-110 transition-transform cursor-pointer">
                  <span className="material-symbols-outlined !text-[15px]">radar</span>
                  <span className="text-[11px] font-black">{dnaMatchQueue.length}</span>
                </button>
              )}
              {scoutQueue && scoutQueue.length > 0 && isDesktop() && (
                <button onClick={() => setIsScoutPanelOpen(true)} className="flex items-center gap-1.5 text-[var(--accent)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_80%,transparent)] hover:scale-110 transition-transform cursor-pointer">
                  <span className="material-symbols-outlined !text-[15px]">biotech</span>
                  <span className="text-[11px] font-black">{scoutQueue.length}</span>
                </button>
              )}
              {nexusUpdatesCount > 0 && isDesktop() && (
                <button onClick={() => setIsNexusUpdatesPanelOpen(true)} className="flex items-center gap-1.5 text-[var(--accent)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_80%,transparent)] hover:scale-110 transition-transform cursor-pointer">
                  <span className="material-symbols-outlined !text-[15px]">cloud_download</span>
                  <span className="text-[11px] font-black">{nexusUpdatesCount}</span>
                </button>
              )}
              {updatePayload && (
                <button onClick={() => setIsUpdatePanelOpen(true)} className="flex items-center gap-1.5 text-[var(--accent)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_80%,transparent)] hover:scale-110 transition-transform cursor-pointer">
                  <span className="material-symbols-outlined !text-[15px]">memory</span>
                  <span className="text-[11px] font-black text-[var(--danger)] animate-pulse">1</span>
                </button>
              )}
              {unreadNotificationCount > 0 && (
                <button onClick={() => setIsNotificationSidebarOpen(true)} className="flex items-center gap-1.5 text-[var(--accent)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_80%,transparent)] hover:scale-110 transition-transform cursor-pointer">
                  <span className="material-symbols-outlined !text-[15px]">notifications_active</span>
                  <span className="text-[11px] font-black">{unreadNotificationCount}</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div
          onMouseEnter={handleDockEnter}
          onMouseLeave={handleDockLeave}
          className={`pointer-events-auto relative flex flex-col items-center justify-end transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${dockTransformClass} pb-4 max-md:hidden ${!isConfigured ? 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0' : ''}`}>


          <div className="w-[800px] max-w-[100vw] h-16 cursor-default" />

          <div className={`glass-panel rounded-full flex items-center px-4 py-1.5 gap-1 shadow-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all duration-500 ${dockOpacityClass}`}>

            {isConfigured && quarantineList && quarantineList.length > 0 && isDesktop() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQuarantineModal(true);
                }}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] group/btn text-red-500 hover:opacity-100 opacity-90 relative`}
              >
                <span className="material-symbols-outlined !text-[20px] drop-shadow-[0_0_5px_currentColor] animate-pulse">warning_amber</span>
                <HoverTooltip title={<><span className="font-black text-red-500">{quarantineList.length}</span> {t("quarantine_modal_title") || "Malware Detected"}</>} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}

            {isConfigured && dnaMatchQueue && dnaMatchQueue.length > 0 && isDesktop() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDnaModalOpen(!isDnaModalOpen);
                }}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group/btn ${isDnaModalOpen ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-100' : 'text-[var(--text)] opacity-90 hover:opacity-100'} relative`}
              >
                <span className="material-symbols-outlined !text-[20px] text-orange-500 drop-shadow-md animate-pulse">{t("icon_radar")}</span>
                <HoverTooltip title={<><span className="font-black text-orange-500">{dnaMatchQueue.length}</span> {t("radar_title")}</>} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}

            {isConfigured && scoutQueue && scoutQueue.length > 0 && isDesktop() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsScoutPanelOpen(!isScoutPanelOpen);
                }}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group/btn ${isScoutPanelOpen ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-100' : 'text-[var(--text)] opacity-90 hover:opacity-100'} relative`}
              >
                <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)] animate-pulse">{t("icon_biotech")}</span>
                <HoverTooltip title={<><span className="font-black text-[var(--accent)]">{scoutQueue.length}</span> {t("queue_title")}</>} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}

            {isConfigured && nexusUpdatesCount > 0 && isDesktop() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsNexusUpdatesPanelOpen(true);
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group/btn text-[var(--accent)] relative"
              >
                <span className="material-symbols-outlined !text-[20px] animate-pulse">cloud_download</span>
                <HoverTooltip title={<>{nexusUpdatesCount} {t("updates_ready")}</>} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}

            {isConfigured && isDesktop() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsConflictRadarOpen(!isConflictRadarOpen);
                }}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn ${isConflictRadarOpen ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-100' : 'text-[var(--text)] opacity-70 hover:opacity-100'} relative`}
              >
                <span className={`material-symbols-outlined !text-[20px] ${radarIconColor}`}>{t("icon_radar")}</span>
                <HoverTooltip title={t("btn_radar")} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}

            {isConfigured && isDesktop() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsBlueprintSwapOpen(!isBlueprintSwapOpen);
                }}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn ${isBlueprintSwapOpen ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-100' : 'text-[var(--text)] opacity-70 hover:opacity-100'} relative`}
              >
                <span className={`material-symbols-outlined !text-[20px]`}>{t("icon_map")}</span>
                <HoverTooltip title={t("playsets_title")} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}

            {isConfigured && isDesktop() && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsSystemStatusOpen((prev: boolean) => !prev); }}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all group/btn relative
                  ${isSystemStatusOpen ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-white' : 'hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] opacity-70 hover:opacity-100'}
                  ${updatePayload ? 'theme-text-accent hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] font-bold' : ''}
                  ${isErrorStatus ? 'text-red-500 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]' : ''}
                  ${isSuccessStatus ? 'text-emerald-500 hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : ''}`}
              >
                <div className="relative flex items-center justify-center">
                  <span className={`material-symbols-outlined !text-[20px] transition-transform duration-500 group-hover/btn:scale-110 ${updatePayload || isErrorStatus ? 'animate-pulse' : ''}`}>
                    memory
                  </span>
                  {updatePayload && (
                    <span className="material-symbols-outlined absolute -bottom-1 -right-1 !text-[12px] text-[var(--accent)] drop-shadow-[0_0_5px_rgba(var(--accent-rgb),1)]">
                      download
                    </span>
                  )}
                  {isErrorStatus && !updatePayload && (
                    <span className="material-symbols-outlined absolute -bottom-1 -right-1 !text-[12px] text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,1)]">
                      warning
                    </span>
                  )}
                  {isSuccessStatus && !updatePayload && !isErrorStatus && (
                    <span className="material-symbols-outlined absolute -bottom-1 -right-1 !text-[12px] text-emerald-500 drop-shadow-[0_0_5px_rgba(16,185,129,1)]">
                      check_circle
                    </span>
                  )}
                </div>
                <HoverTooltip title={isErrorStatus ? t("status_critical") : isSuccessStatus ? t("status_stable") : updatePayload ? t("updates_ready") : status || t("system_status")} variant={isErrorStatus ? "danger" : isSuccessStatus ? "success" : "default"} noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}

            {isConfigured && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsLogExpanded(!isLogExpanded); }}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group/btn ${isLogExpanded ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-100' : 'text-[var(--text)] opacity-70 hover:opacity-100'} relative`}
              >
                <span className={`material-symbols-outlined !text-[20px]`}>terminal</span>
                <HoverTooltip title={t("sys_log_history")} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}

            {isConfigured && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsSideBrowserOpen(!isSideBrowserOpen); }}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all group/btn relative ${isSideBrowserOpen ? 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-white opacity-100' : 'hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] opacity-70 hover:opacity-100'}`}
              >
                <span className="material-symbols-outlined !text-[20px] transition-transform duration-500 group-hover/btn:scale-110">public</span>
                <HoverTooltip title={t("sidebar_web_browser")} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}

            <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1" />

            {!isRoot && isConfigured && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsNotificationSidebarOpen(!isNotificationSidebarOpen); }}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all group/btn relative hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]`}
              >
                <div className="relative flex items-center justify-center">
                  <span className={`material-symbols-outlined !text-[20px] transition-all ${isNotificationSidebarOpen ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent)]' : unreadNotificationCount > 0 ? 'text-[var(--accent)] animate-pulse drop-shadow-[0_0_5px_var(--accent)]' : 'text-[var(--text)] opacity-70 group-hover/btn:opacity-100'}`}>
                    {t("icon_notifications")}
                  </span>
                </div>
                <HoverTooltip title={t("tab_notifs")} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
              </button>
            )}


            <button
              onClick={(e) => { e.stopPropagation(); setView('settings'); }}
              className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 cursor-pointer transition-all group/btn relative hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]`}
            >
              <span className="material-symbols-outlined !text-[20px] text-[var(--text)] opacity-70 group-hover/btn:opacity-100 transition-opacity">
                {t("icon_settings")}
              </span>
              <HoverTooltip title={t("sidebar_settings")} variant="default" noIcon={true} className="!hidden group-hover/btn:!flex !bottom-[calc(100%+8px)] !right-auto !left-1/2 !-translate-x-1/2" />
            </button>

          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
