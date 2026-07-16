import React from 'react';

interface WorkbenchEmptyVisualStateProps {
   t: (k: string) => string;
   selectedFile: any;
}

export const WorkbenchEmptyVisualState: React.FC<WorkbenchEmptyVisualStateProps> = ({ t, selectedFile }) => (
   <div className="flex-1 flex flex-col items-center justify-center py-20 gap-8 min-h-[400px]">
      <div className="w-24 h-24 rounded-full theme-glass-panel flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] opacity-40 shadow-inner">
         <span className="material-symbols-outlined !text-5xl text-[var(--text)]">{t("icon_visibility_off")}</span>
      </div>
      <div className="flex flex-col items-center gap-3 text-center opacity-60">
         <span className="text-[14px] font-black uppercase tracking-[0.2em] text-[var(--text)]">{t("no_visual_template")}</span>
         <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] max-w-sm leading-relaxed">{t("author_mode_hint")}</span>
      </div>
      <div className="mt-4 flex items-center gap-4">
         <button onClick={() => { window.location.href = '#/nexus?tab=templates&q=' + encodeURIComponent(selectedFile?.name || ''); }} className="mt-8 h-12 px-6 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-[0_10px_30px_rgba(var(--accent-rgb),0.1)]">
            <span className="material-symbols-outlined !text-[16px]">{t("icon_travel_explore")}</span>
            {t("search_nexus")}
         </button>
      </div>
   </div>
);
