import React from 'react';
import { EmptyState } from '../shared';

interface WorkbenchEmptyVisualStateProps {
   t: (k: string, fallback?: string) => string;
   selectedFile: any;
   onCreateTemplate?: () => void;
}

export const WorkbenchEmptyVisualState: React.FC<WorkbenchEmptyVisualStateProps> = ({ t, selectedFile, onCreateTemplate }) => (
   <EmptyState
      icon={t("icon_visibility_off", "visibility_off")}
      title={t("no_visual_template", "No Visual Template Available")}
      subtitle={t("author_mode_hint", "Use Author Mode by creating or selecting a .json template to build a visual interface.")}
      minHeightClass="min-h-[320px]"
      action={
         <div className="flex flex-wrap items-center justify-center gap-3">
            {onCreateTemplate && (
               <button
                  type="button"
                  onClick={onCreateTemplate}
                  className="px-4 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.30))] text-xs font-black tracking-wide text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center gap-2 transition-all cursor-pointer"
               >
                  <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">{t("icon_add", "add")}</span>
                  <span>{t("workbench_btn_create_for_file", "Create Template for File")}</span>
               </button>
            )}
            <button
               type="button"
               onClick={() => { window.location.href = '#/nexus?tab=templates&q=' + encodeURIComponent(selectedFile?.name || ''); }}
               className="px-4 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.30))] text-xs font-black tracking-wide text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
               <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_travel_explore", "travel_explore")}</span>
               <span>{t("search_nexus", "Search The {Nexus}")}</span>
            </button>
         </div>
      }
   />
);
