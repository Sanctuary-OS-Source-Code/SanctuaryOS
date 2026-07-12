import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useLexicon } from "./LexiconContext";

export function TitleBar({ isSidebarCollapsed, setIsSidebarCollapsed, subtitleIndex }: any) {
  const { t } = useLexicon();
  return (
    <div className="fixed top-0 left-0 right-0 h-[50px] select-none flex items-center z-[999999] pointer-events-auto group/titlebar transition-colors">

      {/* Revolutionary Watermark Layout */}
      <div
        className="absolute top-0 left-0 h-[85px] flex flex-col justify-center cursor-pointer hover:bg-white/[0.02] transition-colors duration-500 z-[100] shrink-0 overflow-hidden group/logo"
        style={{ width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }}
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      >
        {/* Background & Glass */}
        <div
          className="absolute inset-0 z-[-1] backdrop-blur-md transition-all duration-500 pointer-events-none"
          style={{ backgroundColor: "var(--sidebar)", opacity: "var(--glassOpacity, 30%)" }}
        />

        {/* Giant Watermark Background Icon */}
        <img
          src="/icon.png"
          alt="Watermark"
          className="absolute -left-6 top-1/2 -translate-y-1/2 w-32 h-32 opacity-[0.03] group-hover/logo:opacity-[0.06] group-hover/logo:scale-110 group-hover/logo:rotate-12 transition-all duration-700 pointer-events-none"
        />

        <div className={`flex items-center w-full relative z-10 transition-all duration-500 ${isSidebarCollapsed ? 'justify-center' : 'justify-between px-6'}`}>
          {!isSidebarCollapsed ? (
            <div className="flex flex-col gap-0.5 pt-1">
              {/* Bold Title */}
              <h1 className="text-[17px] font-black tracking-[0.1em] uppercase text-[var(--sidebartext)] leading-none drop-shadow-md group-hover/logo:opacity-100 transition-colors">
                {t("sidebar_app_title")}
              </h1>

              {/* Monospace System Subtitle */}
              <span className="text-[9px] font-mono tracking-[0.25em] text-[var(--accent)] opacity-90 uppercase leading-none mt-1">
                {t(`sidebar_app_subtitle_${subtitleIndex}`)}
              </span>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <img src="/icon.png" alt="Icon" className="w-10 h-10 opacity-70 group-hover/logo:opacity-100 group-hover/logo:scale-110 transition-all duration-300" />
            </div>
          )}

          {/* Explicit Collapse Action Button */}
          {!isSidebarCollapsed && (
            <div className="w-7 h-7 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-all hover:bg-white/10 hover:border-white/20 shadow-lg">
              <span className="material-symbols-outlined text-[16px] text-white/70 group-hover/logo:text-white transition-colors">keyboard_double_arrow_left</span>
            </div>
          )}
        </div>
      </div>

      {/* Spacer to push the rest of the TitleBar to the right of the absolute Logo area */}
      <div className="shrink-0 transition-all duration-500 pointer-events-none" style={{ width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }} />

      {/* Main Title Bar Area (Automatically sits to the right of Logo) */}
      <div className="flex-1 h-[50px] relative flex items-center">

        {/* TitleBar Glass Background */}
        <div 
          className="absolute inset-0 z-[-1] backdrop-blur-md transition-all duration-500 pointer-events-none"
          style={{ backgroundColor: "var(--sidebar)", opacity: "var(--glassOpacity, 30%)" }}
        />

        {/* Title Bar Bottom Borders */}
        <div className="absolute bottom-0 inset-x-0 h-[1px] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] pointer-events-none transition-all duration-500" />
        <div className="absolute bottom-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_50%,transparent)] to-transparent opacity-20 group-hover/titlebar:opacity-50 transition-all duration-700 pointer-events-none" />

        {/* Drag Region */}
        <div
          data-tauri-drag-region
          onMouseDown={async () => { try { await getCurrentWebviewWindow().startDragging(); } catch (e) { console.error(e); } }}
          onDoubleClick={() => {
            (window as any).__sanc_manual_max = true;
            setTimeout(() => { (window as any).__sanc_manual_max = false; }, 1000);
          }}
          className="flex-1 h-full cursor-default pointer-events-auto relative z-10 transition-all duration-500 flex items-center justify-center group/drag"
        >
          <div className="w-1/3 h-px bg-white/5 relative flex items-center justify-between pointer-events-none">
            <div className="w-1 h-1 bg-[color-mix(in_srgb,var(--text)_20%,transparent)] rotate-45" />
            <div className="w-[10%] h-[2px] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] blur-[1px]" />
            <div className="w-1 h-1 bg-[color-mix(in_srgb,var(--text)_20%,transparent)] rotate-45" />
          </div>

          <div className="absolute bottom-0 inset-x-0 h-[2px] flex justify-center pointer-events-none">
            <div className="w-1/3 h-full bg-[var(--accent)] shadow-[0_0_15px_var(--accent)] opacity-10 group-hover/titlebar:opacity-40 transition-opacity duration-1000 blur-[1px]" />
          </div>
        </div>

        {/* Window Controls */}
        <div className="flex items-center gap-2 pr-6 pointer-events-auto relative z-10 h-full py-2.5">
          <button
            onClick={async () => { await getCurrentWebviewWindow().minimize(); }}
            className="group relative w-12 h-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 outline-none"
          >
            <div className="absolute inset-0 bg-white/5 rounded border border-white/10 group-hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] group-hover:border-[color-mix(in_srgb,var(--warning)_50%,transparent)] group-hover:shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_40%,transparent)] transition-all skew-x-[-20deg] shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md" />
            <span className="relative text-[var(--text)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--warning)] transition-all font-black flex items-center justify-center">
              <span className="material-symbols-outlined !text-[16px]">{t("icon_remove")}</span>
            </span>
          </button>

          <button
            onClick={async () => {
              (window as any).__sanc_manual_max = true;
              await getCurrentWebviewWindow().toggleMaximize();
              setTimeout(() => { (window as any).__sanc_manual_max = false; }, 1000);
            }}
            className="group relative w-12 h-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 outline-none"
          >
            <div className="absolute inset-0 bg-white/5 rounded border border-white/10 group-hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] group-hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all skew-x-[-20deg] shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md" />
            <span className="relative text-[var(--text)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all flex items-center justify-center">
              <span className="material-symbols-outlined !text-[14px] leading-none">{t("icon_fullscreen")}</span>
            </span>
          </button>

          <button
            onClick={async () => { await getCurrentWebviewWindow().close(); }}
            className="group relative w-12 h-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 outline-none"
          >
            <div className="absolute inset-0 bg-white/5 rounded border border-white/10 group-hover:bg-red-500/20 group-hover:border-red-500/50 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all skew-x-[-20deg] shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md" />
            <span className="relative text-[var(--text)] opacity-40 group-hover:opacity-100 group-hover:text-red-400 transition-all font-black flex items-center justify-center">
              <span className="material-symbols-outlined !text-[16px] leading-none">{t("icon_close")}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
