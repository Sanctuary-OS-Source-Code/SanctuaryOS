import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useLexicon } from './LexiconContext';

export function TitleBar() {
  const { t } = useLexicon();
  return (
    <div className="h-[50px] select-none flex items-center fixed top-0 left-0 right-0 z-[99999] pointer-events-none group/titlebar">
      {/* Background layer */}
      <div 
        className="absolute inset-y-0 right-0 bg-gradient-to-b from-[var(--bg)] to-transparent backdrop-blur-[3px] opacity-90 transition-all duration-500" 
        style={{ left: "var(--sidebar-width, 288px)" }}
      />
      
      {/* Accent glow on the bottom edge */}
      <div 
        className="absolute bottom-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_50%,transparent)] to-transparent opacity-20 group-hover/titlebar:opacity-50 transition-all duration-700" 
        style={{ left: "var(--sidebar-width, 288px)" }}
      />
      {/* Center: Drag Region & Centered HUD Elements */}
      <div 
        data-tauri-drag-region
        onMouseDown={async () => { try { await getCurrentWebviewWindow().startDragging(); } catch(e) { console.error(e); } }}
        className="flex-1 h-full cursor-default pointer-events-auto relative transition-all duration-500 flex items-center justify-center"
        style={{ marginLeft: "var(--sidebar-width, 288px)" }}
      >
        {/* Decorative center hud lines */}
        <div className="w-1/3 h-px bg-white/5 relative flex items-center justify-between pointer-events-none">
           <div className="w-1 h-1 bg-[color-mix(in_srgb,var(--text)_20%,transparent)] rotate-45" />
           <div className="w-[10%] h-[2px] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] blur-[1px]" />
           <div className="w-1 h-1 bg-[color-mix(in_srgb,var(--text)_20%,transparent)] rotate-45" />
        </div>

        {/* Accent glow on the bottom edge centered in drag region */}
        <div className="absolute bottom-0 inset-x-0 h-[2px] flex justify-center pointer-events-none">
          <div className="w-1/3 h-full bg-[var(--accent)] shadow-[0_0_15px_var(--accent)] opacity-10 group-hover/titlebar:opacity-40 transition-opacity duration-1000 blur-[1px]" />
        </div>
      </div>
      
      {/* Right: Window Controls */}
      <div className="flex items-center gap-2 pr-6 pointer-events-auto relative z-10 h-full py-2.5">
        {/* Minimize */}
        <button 
          onClick={async () => { await getCurrentWebviewWindow().minimize(); }} 
          className="group relative w-10 h-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 outline-none"
        >
          <div className="absolute inset-0 bg-white/5 rounded border border-white/10 group-hover:theme-bg-accent/20 group-hover:theme-border-accent transition-all skew-x-[-20deg] shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md" />
          <span className="relative text-[var(--text)] opacity-40 group-hover:opacity-100 group-hover:theme-text-accent transition-all font-black flex items-center justify-center">
            <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_remove") || "remove"}</span>
          </span>
        </button>
        
        {/* Maximize */}
        <button 
          onClick={async () => { await getCurrentWebviewWindow().toggleMaximize(); }} 
          className="group relative w-10 h-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 outline-none"
        >
          <div className="absolute inset-0 bg-white/5 rounded border border-white/10 group-hover:theme-bg-accent/20 group-hover:theme-border-accent transition-all skew-x-[-20deg] shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md" />
          <span className="relative text-[var(--text)] opacity-40 group-hover:opacity-100 group-hover:theme-text-accent transition-all flex items-center justify-center">
             <span className="material-symbols-outlined !text-[14px] leading-none">{t("ui_icon_fullscreen") || "fullscreen"}</span>
          </span>
        </button>

        {/* Close */}
        <button 
          onClick={async () => { await getCurrentWebviewWindow().close(); }} 
          className="group relative w-12 h-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 outline-none ml-2"
        >
          <div className="absolute inset-0 bg-white/5 rounded border border-white/10 group-hover:bg-red-500/20 group-hover:border-red-500/50 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all skew-x-[-20deg] shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md" />
          <span className="relative text-[var(--text)] opacity-40 group-hover:opacity-100 group-hover:text-red-400 transition-all font-black flex items-center justify-center">
             <span className="material-symbols-outlined !text-[16px] leading-none">{t("ui_icon_close") || "close"}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
