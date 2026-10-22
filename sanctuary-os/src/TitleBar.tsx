import React from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { WorkspaceSidePanel } from './side-panels/WorkspaceSidePanel';
import { isDesktop } from "./utils/envUtils";
import { isRootDomain } from "./utils/routingUtils";

export function TitleBar({ isSidebarCollapsed, setIsSidebarCollapsed, subtitleIndex }: any) {
  const { t } = useLexicon();

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const activeWorkspace = workspaces?.find((w: any) => w.id === activeWorkspaceId);
  const [globalGames, setGlobalGames] = React.useState<any[]>([]);
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = React.useState(false);

  React.useEffect(() => {
    import('./supabase').then(({ supabase }) => {
      supabase.from('sanctuary_games').select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active').then(({ data }) => {
        if (data) setGlobalGames(data);
      });
    });
  }, []);

  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const activeGame = globalGames.find(g => g.schema_id === activeWorkspace?.schema_id);
  const activeGameName = activeGame?.name || activeWorkspace?.name || activeGameSchema?.name || "Sanctuary OS";
  const activeGameIcon = activeGame?.icon;

  return (
    <>
      {/* Invisible drag region across the very top */}
      <div
        data-tauri-drag-region
        style={{ WebkitAppRegion: 'drag' } as any}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button')) {
            (window as any).__sanc_manual_max = true;
            setTimeout(() => { (window as any).__sanc_manual_max = false; }, 750);
          }
        }}
        className="fixed top-0 left-0 right-0 h-[24px] z-[999999] pointer-events-auto bg-[rgba(0,0,0,0.01)]"
      />

      {/* Container for pills */}
      <div className="fixed top-0 left-0 right-0 h-[56px] pointer-events-none flex items-center z-[999998] px-5">

        {/* Spacer to respect sidebar width */}
        <div className="shrink-0 transition-all duration-500 hidden md:block" style={{ width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }} />

        {/* Center Game Selector Pill */}
        <div className="flex-1 flex justify-center h-full items-center">
          {workspaces?.length > 0 ? (
            <button
              type="button"
              className="pointer-events-auto glass-panel portal-glass-fix h-8 px-3.5 !rounded-full flex items-center gap-2 cursor-pointer group/launcher hover:-translate-y-0.5 transition-all duration-300"
              onClick={() => setIsWorkspacePanelOpen(true)}
            >
              {activeGameIcon ? (
                <img src={activeGameIcon} alt="" className="w-4 h-4 object-contain opacity-90 group-hover/launcher:opacity-100 transition-opacity pointer-events-none" />
              ) : (
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] opacity-90 group-hover/launcher:opacity-100 transition-opacity pointer-events-none">
                  {t("icon_sports_esports") || "sports_esports"}
                </span>
              )}
              <span className="text-[11px] tracking-wider font-extrabold capitalize text-[var(--text)] opacity-90 group-hover/launcher:opacity-100 transition-opacity pointer-events-none">
                {activeGameName}
              </span>
              <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)] opacity-65 group-hover/launcher:opacity-100 group-hover/launcher:text-[var(--accent)] transition-all pointer-events-none">
                {t("icon_expand_more") || "expand_more"}
              </span>
            </button>
          ) : (
            <div className="pointer-events-none glass-panel portal-glass-fix h-8 px-3.5 !rounded-full flex items-center gap-2">
              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] opacity-90">
                {t("icon_sports_esports") || "sports_esports"}
              </span>
              <span className="text-[11px] tracking-wider font-extrabold capitalize text-[var(--text)] opacity-90">
                {activeGameName}
              </span>
            </div>
          )}
        </div>

        {/* Right Window Controls Pill */}
        {isDesktop() && (
          <div
            className="pointer-events-auto glass-panel portal-glass-fix h-8 px-1 !rounded-full flex items-center gap-1"
            data-tauri-drag-region
            onMouseDown={async (e) => {
              if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button')) {
                try { await getCurrentWebviewWindow().startDragging(); } catch (err) { console.error(err); }
              }
            }}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button')) {
                (window as any).__sanc_manual_max = true;
                setTimeout(() => { (window as any).__sanc_manual_max = false; }, 1000);
              }
            }}
          >
            <button
              type="button"
              onClick={async () => { await getCurrentWebviewWindow().minimize(); }}
              className="w-6 h-6 !rounded-full flex items-center justify-center bg-transparent border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_14%,transparent)] transition-all duration-200 outline-none group/btn cursor-pointer"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-[var(--text)] opacity-70 group-hover/btn:text-[var(--accent)] group-hover/btn:opacity-100 transition-all group-active/btn:scale-90">
                <path d="M1.75 5H8.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <button
              type="button"
              onClick={async () => {
                (window as any).__sanc_manual_max = true;
                await getCurrentWebviewWindow().toggleMaximize();
                setTimeout(() => { (window as any).__sanc_manual_max = false; }, 1000);
              }}
              className="w-6 h-6 !rounded-full flex items-center justify-center bg-transparent border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_14%,transparent)] transition-all duration-200 outline-none group/btn cursor-pointer"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-[var(--text)] opacity-70 group-hover/btn:text-[var(--warning)] group-hover/btn:opacity-100 transition-all group-active/btn:scale-90">
                <rect x="2" y="2" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>

            <button
              type="button"
              onClick={async () => { await getCurrentWebviewWindow().close(); }}
              className="w-6 h-6 !rounded-full flex items-center justify-center bg-transparent border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_14%,transparent)] transition-all duration-200 outline-none group/btn cursor-pointer"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-[var(--text)] opacity-70 group-hover/btn:text-[var(--danger)] group-hover/btn:opacity-100 transition-all group-active/btn:scale-90">
                <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

      </div>

      <WorkspaceSidePanel isOpen={isWorkspacePanelOpen} onClose={() => setIsWorkspacePanelOpen(false)} />
    </>
  );
}

