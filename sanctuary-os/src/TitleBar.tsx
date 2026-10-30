import React from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { WorkspaceSidePanel } from './side-panels/WorkspaceSidePanel';
import { SystemQueuesSidePanel } from './side-panels/SystemQueuesSidePanel';
import { isDesktop } from "./utils/envUtils";
import { isRootDomain } from "./utils/routingUtils";
import { HoverTooltip } from "./shared-components/alerts";

export function TitleBar({
  subtitleIndex = 0,
  unreadNotificationCount = 0,
  setIsNotificationSidebarOpen,
}: any) {
  const { t, osLogoUrl } = useLexicon();

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const activeWorkspace = workspaces?.find((w: any) => w.id === activeWorkspaceId);
  const isConfigured = useStore((state) => state.isConfigured);
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const quarantineList = useStore((state) => state.quarantineList);
  const nexusUpdatesCount = useStore((state) => state.nexusUpdatesCount);
  const volatileSignatureQueue = useModalStore((state) => state.volatileSignatureQueue);
  const stagingDraftItems = useModalStore((state) => state.stagingDraftItems);
  const dnaMatchQueue = useModalStore((state) => state.dnaMatchQueue);
  const scoutQueue = useModalStore((state) => state.scoutQueue);
  const updatePayload = useModalStore((state) => state.updatePayload);
  const isSideBrowserOpen = useModalStore((state) => state.isSideBrowserOpen);
  const isQueuesPanelOpen = useModalStore((state) => state.isQueuesPanelOpen);
  const setIsQueuesPanelOpen = useModalStore((state) => state.setIsQueuesPanelOpen);

  const [globalGames, setGlobalGames] = React.useState<any[]>([]);
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = React.useState(false);
  const [hasDomSidePanel, setHasDomSidePanel] = React.useState(false);
  const [isHubLockdownActive, setIsHubLockdownActive] = React.useState(false);
  const [isMobileHiddenOnScroll, setIsMobileHiddenOnScroll] = React.useState(false);

  React.useEffect(() => {
    import('./supabase').then(({ supabase }) => {
      supabase
        .from('sanctuary_games')
        .select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active')
        .then(({ data }) => {
          if (data) setGlobalGames(data);
        });
    });
  }, []);

  // Automatically tuck the TitleBar capsule when any SidePanel drawer is open so it never gets sliced by a panel border
  React.useEffect(() => {
    const checkPanels = () => {
      const openPanels = document.querySelectorAll(
        '.sa-side-panel-wrapper.sa-panel-open:not([data-passthrough="true"])'
      );
      setHasDomSidePanel(openPanels.length > 0);
      const lockdownPanels = document.querySelectorAll(
        '.sa-side-panel-wrapper.sa-panel-open[data-passthrough="true"]'
      );
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

  // Smoothly tuck the floating mobile top capsule when scrolling down and reveal on scroll up
  React.useEffect(() => {
    let lastScrollY = window.scrollY;
    const handleWindowScroll = () => {
      const currentY = window.scrollY;
      if (currentY <= 20) {
        setIsMobileHiddenOnScroll(false);
      } else if (currentY > lastScrollY + 8 && currentY > 48) {
        setIsMobileHiddenOnScroll(true);
      } else if (currentY < lastScrollY - 8) {
        setIsMobileHiddenOnScroll(false);
      }
      lastScrollY = currentY;
    };
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, []);

  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const targetSchemaId =
    activeWorkspace?.schema_id ||
    activeGameSchema?.schema_id ||
    activeGameSchema?.id ||
    activeWorkspaceId;
  const activeGame = globalGames.find(
    (g) =>
      String(g.schema_id || "").toLowerCase() === String(targetSchemaId || "").toLowerCase() ||
      String(g.id || "").toLowerCase() === String(targetSchemaId || "").toLowerCase()
  );
  const activeGameName =
    activeGame?.name ||
    activeWorkspace?.name ||
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    "Sanctuary OS";
  const activeGameIcon = activeGame?.icon || activeGameSchema?.icon || activeWorkspace?.icon;

  const sigQueueCount = volatileSignatureQueue?.resolvedItems?.length || 0;
  const stagingDraftCount = Array.isArray(stagingDraftItems) ? stagingDraftItems.length : 0;
  const blueprintQueueCount = sigQueueCount > 0 ? sigQueueCount : stagingDraftCount;
  const quarantineCount = Array.isArray(quarantineList) ? quarantineList.length : 0;
  const dnaCount = Array.isArray(dnaMatchQueue) ? dnaMatchQueue.length : 0;
  const scoutCount = Array.isArray(scoutQueue) ? scoutQueue.length : 0;
  const nexusCount = nexusUpdatesCount || 0;
  const hasAppUpdate = Boolean(updatePayload);
  const totalQueueCount =
    quarantineCount +
    dnaCount +
    blueprintQueueCount +
    scoutCount +
    nexusCount +
    (hasAppUpdate ? 1 : 0);

  const notifCount = unreadNotificationCount || 0;
  const isRoot = !isDesktop() && isRootDomain();
  const isOnLandingHub = view === 'landing' || !isConfigured || isRoot;
  const isWorkspaceActive = !isOnLandingHub && !isSideBrowserOpen && !isHubLockdownActive;
  const shouldTuckCapsule =
    hasDomSidePanel ||
    isHubLockdownActive ||
    isWorkspacePanelOpen ||
    isQueuesPanelOpen ||
    isSideBrowserOpen;

  const queueIcon =
    quarantineCount > 0
      ? t("icon_warning_amber", "warning_amber")
      : dnaCount > 0
        ? t("icon_difference", "difference")
        : hasAppUpdate && totalQueueCount === 1
          ? t("icon_system_update_alt", "system_update_alt")
          : blueprintQueueCount > 0 && scoutCount === 0 && nexusCount === 0 && !hasAppUpdate
            ? t("icon_phonelink_ring", "phonelink_ring")
            : t("icon_layers", "layers");

  const queueColorClass =
    totalQueueCount === 0
      ? "text-[var(--subtext)] hover:text-[var(--text)]"
      : quarantineCount > 0
        ? "text-[var(--danger)]"
        : dnaCount > 0
          ? "text-[var(--warning)]"
          : blueprintQueueCount > 0 && scoutCount === 0 && nexusCount === 0 && !hasAppUpdate
            ? "text-[var(--success)]"
            : "text-[var(--accent)]";

  const appTitleStr = String(t("sidebar_app_title", "Sanctuary OS") || "Sanctuary OS");
  const appTitleFirst = appTitleStr.split(" ")[0] || "Sanctuary";
  const appTitleRest = appTitleStr.split(" ").slice(1).join(" ") || "OS";
  const landingSubtitle = String(
    t(`sidebar_app_subtitle_${subtitleIndex}`, "No Black Boxes") || "No Black Boxes"
  );

  const renderUpperRightCapsule = () => (
    <div className="pointer-events-auto glass-panel sa-floating-glass-pill rounded-2xl shadow-lg divide-x divide-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center h-11 shrink-0 overflow-hidden relative z-20">
      {/* Segment 1: Brand & Active Workspace Header (Sanctuary Logo + Title/Subtitle on Landing; Spoke Logo + Sanctuary OS / Spoke Name in Spoke) */}
      <button
        type="button"
        onClick={() => setIsWorkspacePanelOpen(true)}
        className="h-full px-3 md:px-3.5 flex items-center gap-2.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] group/launcher relative shrink-0"
      >
        <div className="w-7 h-7 rounded-xl glass-panel border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_12px_rgba(0,0,0,0.2)] flex items-center justify-center shrink-0 transition-transform duration-300 group-hover/launcher:scale-105 pointer-events-none">
          {isOnLandingHub ? (
            <img
              src={osLogoUrl || "/icon.png"}
              alt={appTitleStr}
              className="w-4.5 h-4.5 object-contain"
            />
          ) : activeGameIcon ? (
            <img
              src={activeGameIcon}
              alt=""
              className="w-4.5 h-4.5 object-contain opacity-95 group-hover/launcher:opacity-100 transition-opacity"
            />
          ) : (
            <span className="material-symbols-outlined !text-[17px] text-[var(--accent)] opacity-95 group-hover/launcher:opacity-100 transition-opacity">
              {t("icon_sports_esports", "sports_esports") || "sports_esports"}
            </span>
          )}
        </div>

        <div className="flex flex-col justify-center items-start min-w-0 pointer-events-none text-left">
          {isOnLandingHub ? (
            <>
              <div className="text-[11.5px] md:text-xs tracking-tight capitalize leading-tight flex items-center gap-1 whitespace-nowrap">
                <span className="font-black text-[var(--text)]">{appTitleFirst}</span>
                <span className="font-light text-[var(--text)] opacity-75">{appTitleRest}</span>
              </div>
              <span className="text-[7px] font-black tracking-[0.14em] text-[var(--accent)] opacity-85 capitalize leading-none mt-0.5 truncate max-w-[140px] sm:max-w-[180px]">
                {landingSubtitle}
              </span>
            </>
          ) : (
            <>
              {/* Mobile Spoke Overline [Smaller text]: Sanctuary OS */}
              <div className="md:hidden text-[7px] tracking-[0.14em] capitalize leading-none flex items-center gap-1 whitespace-nowrap">
                <span className="font-black text-[var(--accent)]">{appTitleFirst}</span>
                <span className="font-semibold text-[var(--subtext)] opacity-85">{appTitleRest}</span>
              </div>
              {/* Desktop Spoke Overline [Smaller text]: Active Workspace */}
              <span className="hidden md:block text-[7px] font-black tracking-[0.14em] text-[var(--accent)] opacity-85 capitalize leading-none whitespace-nowrap">
                {t("landing_workspaces", "Active Workspaces")}
              </span>
              {/* Spoke Title [Larger text on both Desktop & Mobile] */}
              <span className="text-[11.5px] md:text-xs font-black tracking-tight capitalize text-[var(--text)] leading-tight mt-0.5 truncate max-w-[140px] sm:max-w-[180px]">
                {activeGameName}
              </span>
            </>
          )}
        </div>

        <HoverTooltip title={t("landing_workspaces", "Active Workspaces")} />
      </button>

      {/* Segment 2: Consolidated System Queues & Utilities */}
      {isWorkspaceActive && (
        <button
          type="button"
          onClick={() => setIsQueuesPanelOpen(true)}
          className={`h-full px-2.5 md:px-3 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all ${queueColorClass} group/queues relative shrink-0`}
        >
          <span
            className={`material-symbols-outlined !text-[17px] ${
              totalQueueCount > 0
                ? "opacity-100"
                : "opacity-80 group-hover/queues:opacity-100"
            } transition-opacity shrink-0 pointer-events-none`}
          >
            {queueIcon}
          </span>
          {totalQueueCount > 0 && (
            <span className="text-[11px] font-black leading-none pointer-events-none">
              {totalQueueCount}
            </span>
          )}
          <HoverTooltip
            title={
              totalQueueCount > 0
                ? `${totalQueueCount} ${t("system_queues_title", "System Queues & Updates")}`
                : t("system_queues_title", "System Queues & Updates")
            }
            variant={
              totalQueueCount === 0
                ? "default"
                : quarantineCount > 0
                  ? "danger"
                  : dnaCount > 0
                    ? "warning"
                    : "accent"
            }
          />
        </button>
      )}

      {/* Segment 3: Real Notifications (Bell Icon) */}
      {isWorkspaceActive && (
        <button
          type="button"
          onClick={() => setIsNotificationSidebarOpen?.((prev: boolean) => !prev)}
          className={`h-full px-2.5 md:px-3 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all ${
            notifCount > 0
              ? "text-[var(--accent)]"
              : "text-[var(--subtext)] hover:text-[var(--text)]"
          } group/notifs relative shrink-0`}
        >
          <span
            className={`material-symbols-outlined !text-[17px] ${
              notifCount > 0
                ? "text-[var(--accent)] opacity-100"
                : "opacity-80 group-hover/notifs:opacity-100"
            } transition-opacity shrink-0 pointer-events-none`}
          >
            {notifCount > 0
              ? t("icon_notifications_active", "notifications_active") || "notifications_active"
              : t("icon_notifications", "notifications") || "notifications"}
          </span>
          {notifCount > 0 && (
            <span className="text-[11px] font-black leading-none text-[var(--accent)] pointer-events-none">
              {notifCount}
            </span>
          )}
          <HoverTooltip
            title={
              notifCount > 0
                ? `${notifCount} ${t("tab_notifs", "Notifications")}`
                : t("tab_notifs", "Notifications")
            }
            variant={notifCount > 0 ? "accent" : "default"}
          />
        </button>
      )}

      {/* Segment 4: Global Command Palette (Icon-Only >_) */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("sanctuary-open-command-palette"))}
        className="h-full px-2.5 md:px-3 flex items-center justify-center cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)] group/cmd relative shrink-0"
      >
        <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] group-hover/cmd:text-[var(--accent)] opacity-85 group-hover/cmd:opacity-100 transition-all shrink-0 pointer-events-none">
          {t("icon_terminal", "terminal") || "terminal"}
        </span>
        <HoverTooltip
          title={`${t("cmd_palette_title", "Command Palette")} (${t("cmd_palette_shortcut_badge", "Ctrl+K")})`}
        />
      </button>

      {/* Segment 5: Settings (⚙) */}
      {!isSideBrowserOpen && (
        <button
          type="button"
          onClick={() => setView("settings")}
          className={`flex h-full px-2.5 md:px-3 items-center justify-center cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all ${
            view === "settings"
              ? "text-[var(--accent)]"
              : "text-[var(--subtext)] hover:text-[var(--text)]"
          } group/settings relative shrink-0`}
        >
          <span
            className={`material-symbols-outlined !text-[17px] ${
              view === "settings"
                ? "text-[var(--accent)] opacity-100"
                : "opacity-80 group-hover/settings:opacity-100"
            } transition-opacity shrink-0 pointer-events-none`}
          >
            {t("icon_settings", "settings") || "settings"}
          </span>
          <HoverTooltip
            title={t("tab_preferences", "Preferences") || "Settings"}
            variant={view === "settings" ? "accent" : "default"}
          />
        </button>
      )}

      {/* Segment 6: Desktop Window Controls (Minimize / Maximize / Close) */}
      {isDesktop() && (
        <div
          className="h-full px-1.5 flex items-center gap-0.5 shrink-0"
          data-tauri-drag-region
          onMouseDown={async (e) => {
            if (
              (e.target as HTMLElement).tagName !== "BUTTON" &&
              !(e.target as HTMLElement).closest("button")
            ) {
              try {
                await getCurrentWebviewWindow().startDragging();
              } catch (err) {
                console.error(err);
              }
            }
          }}
          onDoubleClick={(e) => {
            if (
              (e.target as HTMLElement).tagName !== "BUTTON" &&
              !(e.target as HTMLElement).closest("button")
            ) {
              (window as any).__sanc_manual_max = true;
              setTimeout(() => {
                (window as any).__sanc_manual_max = false;
              }, 1000);
            }
          }}
        >
          <button
            type="button"
            onClick={async () => {
              await getCurrentWebviewWindow().minimize();
            }}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-transparent border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all duration-200 outline-none group/btn cursor-pointer relative"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 10 10"
              fill="none"
              className="text-[var(--subtext)] group-hover/btn:text-[var(--text)] transition-all group-active/btn:scale-90"
            >
              <path
                d="M2 5H8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={async () => {
              (window as any).__sanc_manual_max = true;
              await getCurrentWebviewWindow().toggleMaximize();
              setTimeout(() => {
                (window as any).__sanc_manual_max = false;
              }, 1000);
            }}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-transparent border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all duration-200 outline-none group/btn cursor-pointer relative"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 10 10"
              fill="none"
              className="text-[var(--subtext)] group-hover/btn:text-[var(--warning)] transition-all group-active/btn:scale-90"
            >
              <rect
                x="2"
                y="2"
                width="6"
                height="6"
                rx="1.4"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={async () => {
              await getCurrentWebviewWindow().close();
            }}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-transparent border border-transparent hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] transition-all duration-200 outline-none group/btn cursor-pointer relative"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 10 10"
              fill="none"
              className="text-[var(--subtext)] group-hover/btn:text-[var(--danger)] transition-all group-active/btn:scale-90"
            >
              <path
                d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Invisible drag region across the very top (Desktop Tauri window only, behind SidePanels/modals) */}
      {isDesktop() && (
        <div
          data-tauri-drag-region
          style={{ WebkitAppRegion: 'drag' } as any}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button')) {
              (window as any).__sanc_manual_max = true;
              setTimeout(() => { (window as any).__sanc_manual_max = false; }, 750);
            }
          }}
          className="fixed top-0 left-0 right-0 h-[24px] z-30 pointer-events-auto bg-[rgba(0,0,0,0.01)]"
        />
      )}

      {/* DESKTOP FLOATING UPPER-RIGHT CAPSULE (Above #sanctuary-main-scroll, strictly behind any SidePanel/modal) */}
      <div
        data-tauri-drag-region={isDesktop() ? true : undefined}
        className={`hidden md:flex fixed top-3.5 right-6 z-30 items-center justify-end pointer-events-none select-none transition-all duration-300 ${
          shouldTuckCapsule ? "opacity-0 -translate-y-16 pointer-events-none" : "opacity-100 translate-y-0"
        }`}
      >
        {renderUpperRightCapsule()}
      </div>

      {/* MOBILE FLOATING CENTERED CAPSULE (Single unified segmented capsule centered at the top, behind any SidePanel/modal) */}
      <div
        className={`md:hidden fixed top-[calc(env(safe-area-inset-top,0px)+10px)] inset-x-4 z-30 flex items-center justify-center pointer-events-none transition-all duration-300 ${
          shouldTuckCapsule || isMobileHiddenOnScroll
            ? "opacity-0 -translate-y-16 pointer-events-none"
            : "opacity-100 translate-y-0"
        }`}
      >
        {renderUpperRightCapsule()}
      </div>

      <WorkspaceSidePanel isOpen={isWorkspacePanelOpen} onClose={() => setIsWorkspacePanelOpen(false)} />
      <SystemQueuesSidePanel isOpen={isQueuesPanelOpen} onClose={() => setIsQueuesPanelOpen(false)} />
    </>
  );
}



