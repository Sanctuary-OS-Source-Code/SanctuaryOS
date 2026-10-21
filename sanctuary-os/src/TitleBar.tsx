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
      <div className="fixed top-0 left-0 right-0 h-[70px] pointer-events-none flex items-center z-[999998] px-6">

        {/* Spacer to respect sidebar width */}
        <div className="shrink-0 transition-all duration-500 hidden md:block" style={{ width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }} />

        {/* Center Game Selector Pill */}
        <div className="flex-1 flex justify-center h-full items-center">
          {workspaces?.length > 0 ? (
            <button
              type="button"
              className="pointer-events-auto glass-panel portal-glass-fix h-10 px-4 rounded-full flex items-center gap-2.5 cursor-pointer group/launcher hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all duration-200"
              onClick={() => setIsWorkspacePanelOpen(true)}
            >
              {activeGameIcon ? (
                <img src={activeGameIcon} alt="" className="w-4 h-4 object-contain opacity-85 group-hover/launcher:opacity-100 transition-opacity pointer-events-none drop-shadow-sm" />
              ) : (
                <span className="material-symbols-outlined !text-[17px] text-[var(--accent)] opacity-85 group-hover/launcher:opacity-100 transition-opacity pointer-events-none">
                  {t("icon_sports_esports") || "sports_esports"}
                </span>
              )}
              <span className="text-[13px] tracking-wide font-extrabold capitalize text-[var(--text)] opacity-95 group-hover/launcher:opacity-100 transition-opacity pointer-events-none">
                {activeGameName}
              </span>
              <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-60 group-hover/launcher:opacity-100 group-hover/launcher:text-[var(--accent)] transition-all pointer-events-none">
                {t("icon_expand_more") || "expand_more"}
              </span>
            </button>
          ) : (
            <div className="pointer-events-none glass-panel portal-glass-fix h-10 px-4 rounded-full flex items-center gap-2.5">
              <span className="material-symbols-outlined !text-[17px] text-[var(--accent)] opacity-85">
                {t("icon_sports_esports") || "sports_esports"}
              </span>
              <span className="text-[13px] tracking-wide font-extrabold capitalize text-[var(--text)] opacity-95">
                {activeGameName}
              </span>
            </div>
          )}
        </div>

        {/* Right Window Controls Pill */}
        {isDesktop() && (
          <div
            className="pointer-events-auto glass-panel portal-glass-fix h-10 px-1.5 rounded-full flex items-center gap-0.5"
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
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text)] opacity-75 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] transition-all outline-none group/btn"
            >
              <span className="material-symbols-outlined !text-[15px] leading-none transition-transform group-active/btn:scale-90">
                {t("icon_remove") || "remove"}
              </span>
            </button>

            <button
              type="button"
              onClick={async () => {
                (window as any).__sanc_manual_max = true;
                await getCurrentWebviewWindow().toggleMaximize();
                setTimeout(() => { (window as any).__sanc_manual_max = false; }, 1000);
              }}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text)] opacity-75 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all outline-none group/btn"
            >
              <span className="material-symbols-outlined !text-[13px] leading-none transition-transform group-active/btn:scale-90">
                {t("icon_crop_square") || "crop_square"}
              </span>
            </button>

            <button
              type="button"
              onClick={async () => { await getCurrentWebviewWindow().close(); }}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text)] opacity-75 hover:opacity-100 hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] transition-all outline-none group/btn"
            >
              <span className="material-symbols-outlined !text-[15px] leading-none transition-transform group-active/btn:scale-90">
                {t("icon_close") || "close"}
              </span>
            </button>
          </div>
        )}

      </div>

      <WorkspaceSidePanel isOpen={isWorkspacePanelOpen} onClose={() => setIsWorkspacePanelOpen(false)} />
    </>
  );
}

