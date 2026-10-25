import React from 'react';

interface WorkbenchEmptyVisualStateProps {
   t: (k: string, fallback?: string) => string;
   selectedFile: any;
   onCreateTemplate?: () => void;
}

export const WorkbenchEmptyVisualState: React.FC<WorkbenchEmptyVisualStateProps> = ({ t, selectedFile, onCreateTemplate }) => (
   <div className="flex-1 flex flex-col items-center justify-center py-20 gap-6 min-h-[400px]">
      <div className="w-20 h-20 rounded-3xl glass-panel flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] opacity-60 shadow-inner">
         <span className="material-symbols-outlined !text-4xl text-[var(--text)]">{t("icon_visibility_off", "visibility_off")}</span>
      </div>
      <div className="flex flex-col items-center gap-2 text-center opacity-80">
         <span className="text-[14px] font-black capitalize tracking-[0.15em] text-[var(--text)]">{t("no_visual_template", "No Visual Template Available")}</span>
         <span className="text-[11px] font-medium text-[var(--subtext)] max-w-md leading-relaxed">{t("author_mode_hint", "Use Author Mode by creating or selecting a .json template to build a visual interface.")}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
         {onCreateTemplate && (
            <button
               onClick={onCreateTemplate}
               className="h-11 px-5 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)] font-black capitalize tracking-widest text-[11px] flex items-center justify-center gap-2 hover:scale-[1.02] transition-all cursor-pointer"
            >
               <span className="material-symbols-outlined !text-[18px]">{t("icon_add", "add")}</span>
               {t("workbench_btn_create_for_file", "Create Template for File")}
            </button>
         )}
         <button
            onClick={() => { window.location.href = '#/nexus?tab=templates&q=' + encodeURIComponent(selectedFile?.name || ''); }}
            className="h-11 px-5 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] font-black capitalize tracking-widest text-[11px] flex items-center justify-center gap-2 hover:scale-[1.02] transition-all cursor-pointer"
         >
            <span className="material-symbols-outlined !text-[18px]">{t("icon_travel_explore", "travel_explore")}</span>
            {t("search_nexus", "Search The {Nexus}")}
         </button>
      </div>
   </div>
);
