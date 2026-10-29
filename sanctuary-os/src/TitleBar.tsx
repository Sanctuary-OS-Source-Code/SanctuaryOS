import React from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { WorkspaceSidePanel } from './side-panels/WorkspaceSidePanel';
import { isDesktop } from "./utils/envUtils";
import { HoverTooltip } from "./shared-components/alerts";

export function TitleBar({
  unreadNotificationCount = 0,
  setIsNotificationSidebarOpen,
}: any) {
  const { t } = useLexicon();

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const activeWorkspace = workspaces?.find((w: any) => w.id === activeWorkspaceId);
  const isConfigured = useStore((state) => state.isConfigured);
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const volatileSignatureQueue = useModalStore((state) => state.volatileSignatureQueue);
  const setIsSignatureQueueOpen = useModalStore((state) => state.setIsSignatureQueueOpen);
  const stagingDraftItems = useModalStore((state) => state.stagingDraftItems);
  const isSideBrowserOpen = useModalStore((state) => state.isSideBrowserOpen);

  const [globalGames, setGlobalGames] = React.useState<any[]>([]);
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = React.useState(false);
  const [hasDomSidePanel, setHasDomSidePanel] = React.useState(false);
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
  const activeGame = globalGames.find((g) => g.schema_id === activeWorkspace?.schema_id);
  const activeGameName =
    activeGame?.name || activeWorkspace?.name || activeGameSchema?.name || "Sanctuary OS";
  const activeGameIcon = activeGame?.icon;

  const sigQueueCount = volatileSignatureQueue?.resolvedItems?.length || 0;
  const stagingDraftCount = Array.isArray(stagingDraftItems) ? stagingDraftItems.length : 0;
  const blueprintQueueCount = sigQueueCount > 0 ? sigQueueCount : stagingDraftCount;
  const notifCount = unreadNotificationCount || 0;
  const showMobileAlerts = isConfigured && view !== 'landing' && !isSideBrowserOpen && (blueprintQueueCount > 0 || notifCount > 0);
  const shouldTuckCapsule = hasDomSidePanel || isWorkspacePanelOpen || isSideBrowserOpen;

  const renderUpperRightCapsule = (includeMobileAlerts: boolean) => (
    <div className="pointer-events-auto glass-panel sa-floating-glass-pill rounded-2xl shadow-lg divide-x divide-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center h-10 md:h-11 shrink-0 overflow-hidden relative z-20">
      {/* Segment 1: Active Game / Workspace Switcher */}
      <button
        type="button"
        onClick={() => setIsWorkspacePanelOpen(true)}
        className="h-full px-3 md:px-3.5 flex items-center gap-2 cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] group/launcher relative shrink-0"
      >
        {activeGameIcon ? (
          <img
            src={activeGameIcon}
            alt=""
            className="w-4 h-4 object-contain opacity-90 group-hover/launcher:opacity-100 transition-opacity shrink-0 pointer-events-none"
          />
        ) : (
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] opacity-90 group-hover/launcher:opacity-100 transition-opacity shrink-0 pointer-events-none">
            {t("icon_sports_esports", "sports_esports") || "sports_esports"}
          </span>
        )}
        <span className="text-[11px] md:text-xs tracking-wide font-extrabold capitalize text-[var(--text)] truncate max-w-[120px] sm:max-w-[160px] lg:max-w-[200px] pointer-events-none">
          {activeGameName}
        </span>
        <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] opacity-65 group-hover/launcher:opacity-100 group-hover/launcher:text-[var(--accent)] transition-all shrink-0 pointer-events-none">
          {t("icon_expand_more", "expand_more") || "expand_more"}
        </span>
        <HoverTooltip title={t("landing_workspaces", "Active Workspaces")} />
      </button>

      {/* Segment 2: Global Command Palette (Ctrl+K) */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("sanctuary-open-command-palette"))}
        className="h-full px-2.5 md:px-3 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)] group/cmd relative shrink-0"
      >
        <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] opacity-90 group-hover/cmd:opacity-100 transition-opacity shrink-0 pointer-events-none">
          {t("icon_terminal", "terminal") || "terminal"}
        </span>
        <span className="hidden sm:inline text-[11px] tracking-wider font-extrabold text-[var(--subtext)] group-hover/cmd:text-[var(--text)] opacity-85 group-hover/cmd:opacity-100 transition-all whitespace-nowrap pointer-events-none">
          {t("cmd_palette_shortcut_badge", "Ctrl+K")}
        </span>
        <HoverTooltip
          title={`${t("cmd_palette_title", "Command Palette")} (${t("cmd_palette_shortcut_badge", "Ctrl+K")})`}
        />
      </button>

      {/* Segment 3 (Mobile Only): Sync Blueprints / Staging Queue */}
      {includeMobileAlerts && showMobileAlerts && blueprintQueueCount > 0 && (
        <button
          type="button"
          onClick={() => {
            if (sigQueueCount > 0) {
              setIsSignatureQueueOpen(true);
            } else {
              setView("playsets");
            }
          }}
          className="h-full px-2.5 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--success)] shrink-0"
        >
          <span className="material-symbols-outlined !text-[17px]">
            {t("icon_phonelink_ring", "phonelink_ring") || "phonelink_ring"}
          </span>
          <span className="text-[11px] font-black leading-none">{blueprintQueueCount}</span>
        </button>
      )}

      {/* Segment 4 (Mobile Only): Unread Notifications */}
      {includeMobileAlerts && showMobileAlerts && notifCount > 0 && (
        <button
          type="button"
          onClick={() => setIsNotificationSidebarOpen?.(true)}
          className="h-full px-2.5 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--accent)] shrink-0"
        >
          <span className="material-symbols-outlined !text-[17px]">
            {t("icon_notifications_active", "notifications_active") || "notifications_active"}
          </span>
          <span className="text-[11px] font-black leading-none">{notifCount}</span>
        </button>
      )}

      {/* Segment 5: Desktop Window Controls (Minimize / Maximize / Close) */}
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
          shouldTuckCapsule ? "opacity-0 -translate-y-2 pointer-events-none" : "opacity-100 translate-y-0"
        }`}
      >
        {renderUpperRightCapsule(false)}
      </div>

      {/* MOBILE FLOATING CENTERED CAPSULE (Single unified segmented capsule centered at the top, behind any SidePanel/modal) */}
      <div
        className={`md:hidden fixed top-[calc(env(safe-area-inset-top,0px)+10px)] inset-x-4 z-30 flex items-center justify-center pointer-events-none transition-all duration-300 ${
          shouldTuckCapsule || isMobileHiddenOnScroll
            ? "opacity-0 -translate-y-4 pointer-events-none"
            : "opacity-100 translate-y-0"
        }`}
      >
        {renderUpperRightCapsule(true)}
      </div>

      <WorkspaceSidePanel isOpen={isWorkspacePanelOpen} onClose={() => setIsWorkspacePanelOpen(false)} />
    </>
  );
}



