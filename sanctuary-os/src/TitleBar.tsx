import React from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useLexicon } from "./LexiconContext";
import { useStore } from './store';
import { WorkspaceSidePanel } from './side-panels/WorkspaceSidePanel';

export function TitleBar({ isSidebarCollapsed, setIsSidebarCollapsed, subtitleIndex }: any) {
  const { t } = useLexicon();

  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const activeWorkspace = workspaces?.find((w: any) => w.id === activeWorkspaceId);
  const [globalGames, setGlobalGames] = React.useState<any[]>([]);
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = React.useState(false);

  React.useEffect(() => {
    import('./supabase').then(({ supabase }) => {
      supabase.from('sanctuary_games').select('*').then(({ data }) => {
        if (data) setGlobalGames(data);
      });
    });
  }, []);

  const activeGame = globalGames.find(g => g.schema_id === activeWorkspace?.schema_id);
  const activeGameName = activeGame?.name || activeWorkspace?.name || "Sanctuary OS";
  const activeGameIcon = activeGame?.icon;

  return (
    <>
      {/* Invisible drag region across the very top */}
      <div
        data-tauri-drag-region
        onMouseDown={async (e) => {
          if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button')) {
            try { await getCurrentWebviewWindow().startDragging(); } catch (err) { console.error(err); }
          }
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button')) {
            (window as any).__sanc_manual_max = true;
            setTimeout(() => { (window as any).__sanc_manual_max = false; }, 750);
          }
        }}
        className="fixed top-0 left-0 right-0 h-[24px] z-[999999] pointer-events-auto opacity-0"
      />

      {/* Container for pills */}
      <div className="fixed top-0 left-0 right-0 h-[70px] pointer-events-none flex items-center z-[999998] px-6">

        {/* Spacer to respect sidebar width */}
        <div className="shrink-0 transition-all duration-500" style={{ width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }} />

        {/* Center Game Selector Pill */}
        <div className="flex-1 flex justify-center h-full items-center">
          {workspaces?.length > 0 && (
            <button
              className="pointer-events-auto glass-panel rounded-full px-5 py-2 flex items-center gap-3 cursor-pointer group/launcher hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shadow-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
              onClick={() => setIsWorkspacePanelOpen(true)}
            >
              {activeGameIcon ? (
                <img src={activeGameIcon} alt="" className="w-5 h-5 object-contain opacity-70 group-hover/launcher:opacity-100 transition-opacity pointer-events-none drop-shadow-md" />
              ) : (
                <span className="material-symbols-outlined !text-[18px] opacity-50 group-hover/launcher:opacity-80 transition-opacity pointer-events-none drop-shadow-md">sports_esports</span>
              )}
              <span className="text-[14px] tracking-wide font-black capitalize text-[var(--text)] opacity-90 group-hover/launcher:opacity-100 transition-opacity pointer-events-none px-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {activeGameName}
              </span>
              <span className="material-symbols-outlined !text-[16px] opacity-30 group-hover/launcher:opacity-70 transition-opacity pointer-events-none drop-shadow-md">
                expand_more
              </span>
            </button>
          )}
        </div>

        {/* Right Window Controls Pill */}
        <div
          className="pointer-events-auto glass-panel rounded-full px-2 py-1.5 flex items-center gap-1.5 shadow-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
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
            onClick={async () => { await getCurrentWebviewWindow().minimize(); }}
            className="w-[28px] h-[24px] rounded-full bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_8%,transparent)] to-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.1)] flex items-center justify-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--warning)] hover:border-[color-mix(in_srgb,var(--warning)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] transition-all outline-none group/btn"
          >
            <span className="material-symbols-outlined !text-[14px] leading-none transition-transform group-active/btn:scale-90">{t("icon_remove")}</span>
          </button>

          <button
            onClick={async () => {
              (window as any).__sanc_manual_max = true;
              await getCurrentWebviewWindow().toggleMaximize();
              setTimeout(() => { (window as any).__sanc_manual_max = false; }, 1000);
            }}
            className="w-[28px] h-[24px] rounded-full bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_8%,transparent)] to-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.1)] flex items-center justify-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all outline-none group/btn"
          >
            <span className="material-symbols-outlined !text-[12px] leading-none transition-transform group-active/btn:scale-90">{t("icon_fullscreen")}</span>
          </button>

          <button
            onClick={async () => { await getCurrentWebviewWindow().close(); }}
            className="w-[28px] h-[24px] rounded-full bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_8%,transparent)] to-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.1)] flex items-center justify-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-all outline-none group/btn"
          >
            <span className="material-symbols-outlined !text-[13px] leading-none transition-transform group-active/btn:scale-90">{t("icon_close")}</span>
          </button>
        </div>

      </div>

      <WorkspaceSidePanel isOpen={isWorkspacePanelOpen} onClose={() => setIsWorkspacePanelOpen(false)} />
    </>
  );
}

