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
    <div
      data-tauri-drag-region
      onMouseDown={async (e) => {
        if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest('.group\\/logo') && !(e.target as HTMLElement).closest('.group\\/launcher')) {
          try { await getCurrentWebviewWindow().startDragging(); } catch (err) { console.error(err); }
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest('.group\\/logo') && !(e.target as HTMLElement).closest('.group\\/launcher')) {
          (window as any).__sanc_manual_max = true;
          setTimeout(() => { (window as any).__sanc_manual_max = false; }, 1000);
        }
      }}
      className="fixed top-0 left-0 right-0 h-[50px] select-none flex items-center z-[999999] pointer-events-auto group/titlebar transition-colors"
    >



      {/* TitleBar Premium Glass Background */}
      <div
        className="absolute inset-0 z-[-1] backdrop-blur-md transition-all duration-500 pointer-events-none"
        style={{ 
          background: "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--bg) 40%, transparent) 25%, color-mix(in srgb, var(--bg) 80%, transparent) 50%, color-mix(in srgb, var(--bg) 40%, transparent) 75%, transparent 100%)" 
        }}
      />

      {/* 3D Glass Inner Top Highlight */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_15%,transparent)] to-transparent opacity-60 pointer-events-none z-[-1]" />

      {/* Ultra-faint Noise Texture for Glass Material realism */}
      <div className="absolute inset-0 z-[-1] opacity-[0.04] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />

      {/* Title Bar Bottom Borders */}
      <div
        className="absolute bottom-0 right-0 h-[1px] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] pointer-events-none transition-all duration-500"
        style={{ left: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }}
      />
      <div
        className="absolute bottom-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_20%,transparent)] to-transparent opacity-20 group-hover/titlebar:opacity-50 transition-all duration-700 pointer-events-none"
        style={{ left: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }}
      />

      {/* Revolutionary Watermark Layout */}
      <div
        className="absolute top-0 left-0 h-[50px] flex flex-col justify-center cursor-pointer hover:bg-white/[0.02] transition-colors duration-500 z-[100] shrink-0 group/logo"
        style={{ width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }}
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      >
        {/* Responsive Watermark Background Icon */}
        <img
          src="/icon.png"
          alt="Watermark"
          className={`absolute top-1/2 -translate-y-1/2 transition-all duration-700 pointer-events-none ${isSidebarCollapsed
            ? 'w-10 h-10 left-1/2 -translate-x-1/2 opacity-[0.4] group-hover/logo:opacity-100 group-hover/logo:scale-110 drop-shadow-[0_0_8px_var(--accent)]'
            : 'w-24 h-24 -left-4 opacity-[0.03] group-hover/logo:opacity-[0.08] group-hover/logo:scale-110 group-hover/logo:rotate-12 group-hover/logo:drop-shadow-[0_0_15px_var(--accent)]'
            }`}
        />

        <div className={`flex items-center w-full relative z-10 transition-all duration-500 ${isSidebarCollapsed ? 'justify-center' : 'justify-between px-6'}`}>
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="flex flex-col pt-0">
                {/* Two-Tone Title (Strictly Theme Colors, Softened Weight) */}
                <h1 className="text-[19px] tracking-tighter uppercase leading-none drop-shadow-sm group-hover/logo:opacity-100 transition-colors flex items-center gap-1 whitespace-nowrap">
                  <span className="font-black text-[var(--sidebartext)]">{t("sidebar_app_title")?.split(' ')[0]}</span>
                  <span className="font-light text-[var(--sidebartext)] opacity-70">{t("sidebar_app_title")?.split(' ').slice(1).join(' ')}</span>
                </h1>
                {/* Subtitle */}
                <span className="text-[7px] font-black tracking-[0.4em] text-[var(--accent)] opacity-70 uppercase leading-none mt-1 whitespace-nowrap">
                  {t(`sidebar_app_subtitle_${subtitleIndex}`)}
                </span>
              </div>
            </div>
          )}

          {/* Explicit Collapse Action Button */}
          {!isSidebarCollapsed && (
            <div className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] shadow-lg">
              <span className="material-symbols-outlined text-[16px] text-white/70 group-hover/logo:text-white transition-colors">keyboard_double_arrow_left</span>
            </div>
          )}
        </div>
      </div>

      {/* Spacer to push the rest of the TitleBar to the right of the absolute Logo area */}
      <div className="shrink-0 transition-all duration-500 pointer-events-none" style={{ width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }} />

      {/* Main Title Bar Area (Automatically sits to the right of Logo) */}
      <div className="flex-1 h-[50px] relative flex items-center">

        {/* Active Workspace Title / Selector (Figma/Notion Style) */}
        <div className="flex-1 h-full flex items-center justify-center pointer-events-none">
          {workspaces?.length > 0 && (
            <div
              data-tauri-drag-region="false"
              className="pointer-events-auto flex items-center gap-3 cursor-pointer group/launcher px-4 py-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all"
              onClick={() => setIsWorkspacePanelOpen(true)}
            >
              {activeGameIcon ? (
                <img src={activeGameIcon} alt="" className="w-5 h-5 object-contain opacity-70 group-hover/launcher:opacity-100 transition-opacity pointer-events-none drop-shadow-md" />
              ) : (
                <span className="material-symbols-outlined !text-[18px] opacity-50 group-hover/launcher:opacity-80 transition-opacity pointer-events-none drop-shadow-md">sports_esports</span>
              )}
              <span className="text-[16px] tracking-wide font-black uppercase text-[var(--text)] opacity-90 group-hover/launcher:opacity-100 transition-opacity pointer-events-none px-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {activeGameName}
              </span>
              <span className="material-symbols-outlined !text-[18px] opacity-30 group-hover/launcher:opacity-70 transition-opacity pointer-events-none drop-shadow-md">
                expand_more
              </span>
            </div>
          )}
        </div>

        {/* Window Controls (Tactile Chiclet Keys) */}
        <div className="flex items-center gap-1.5 pr-5 relative z-10 pointer-events-auto h-full">
          <button
            onClick={async () => { await getCurrentWebviewWindow().minimize(); }}
            className="w-[28px] h-[24px] rounded-[5px] bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_8%,transparent)] to-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] border-b-[color-mix(in_srgb,var(--text)_25%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.1)] flex items-center justify-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--warning)] hover:border-[color-mix(in_srgb,var(--warning)_50%,transparent)] hover:bg-gradient-to-b hover:from-[color-mix(in_srgb,var(--warning)_15%,transparent)] hover:to-[color-mix(in_srgb,var(--warning)_2%,transparent)] hover:translate-y-[1px] hover:shadow-none transition-all outline-none group/btn"
          >
            <span className="material-symbols-outlined !text-[14px] leading-none transition-transform group-active/btn:scale-90">{t("icon_remove")}</span>
          </button>

          <button
            onClick={async () => {
              (window as any).__sanc_manual_max = true;
              await getCurrentWebviewWindow().toggleMaximize();
              setTimeout(() => { (window as any).__sanc_manual_max = false; }, 1000);
            }}
            className="w-[28px] h-[24px] rounded-[5px] bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_8%,transparent)] to-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] border-b-[color-mix(in_srgb,var(--text)_25%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.1)] flex items-center justify-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:bg-gradient-to-b hover:from-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:to-[color-mix(in_srgb,var(--accent)_2%,transparent)] hover:translate-y-[1px] hover:shadow-none transition-all outline-none group/btn"
          >
            <span className="material-symbols-outlined !text-[12px] leading-none transition-transform group-active/btn:scale-90">{t("icon_fullscreen")}</span>
          </button>

          <button
            onClick={async () => { await getCurrentWebviewWindow().close(); }}
            className="w-[28px] h-[24px] rounded-[5px] bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_8%,transparent)] to-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] border-b-[color-mix(in_srgb,var(--text)_25%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.1)] flex items-center justify-center text-[var(--text)] opacity-70 hover:opacity-100 hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:bg-gradient-to-b hover:from-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:to-[color-mix(in_srgb,var(--danger)_2%,transparent)] hover:translate-y-[1px] hover:shadow-none transition-all outline-none group/btn"
          >
            <span className="material-symbols-outlined !text-[13px] leading-none transition-transform group-active/btn:scale-90">{t("icon_close")}</span>
          </button>
        </div>
      </div>

      <WorkspaceSidePanel isOpen={isWorkspacePanelOpen} onClose={() => setIsWorkspacePanelOpen(false)} />
    </div>
  );
}

