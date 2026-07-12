import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { SidePanel } from '../shared';
import WORKBENCH_TEMPLATES from "../data/workbench_templates.json";

export function ImportTemplateSidePanel({ 
  isOpen, 
  onClose, 
  onSelectTemplate 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSelectTemplate: (templateContent: string) => void;
}) {
  const { t } = useLexicon();
  const [searchQuery, setSearchQuery] = useState("");
  const [fetchedTemplates, setFetchedTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchTemplates = async () => {
        setIsLoading(true);
        try {
          const { data, error } = await supabase
            .from('nexus_assets')
            .select('*')
            .eq('asset_type', 'workbench_template');
          if (!error && data) {
            const parsed = data.map(d => {
              try {
                return JSON.parse(d.json_data);
              } catch {
                return null;
              }
            }).filter(Boolean);
            setFetchedTemplates(parsed);
          }
        } catch (e) {
          console.error("Failed to fetch templates", e);
        } finally {
          setIsLoading(false);
        }
      };
      fetchTemplates();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const allTemplates = [WORKBENCH_TEMPLATES, ...fetchedTemplates];
  
  const filteredTemplates = allTemplates.filter((template: any) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (template.template_id && template.template_id.toLowerCase().includes(searchLower)) ||
      (template.mod_author && template.mod_author.toLowerCase().includes(searchLower)) ||
      (template.target_file && template.target_file.toLowerCase().includes(searchLower))
    );
  });

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("btn_import")}
      subtitle={t("upload_import_subtitle")}
      icon="drive_folder_upload"
      iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      widthClass="w-[600px]"
    >
      <div className="flex flex-col gap-6 p-8 h-full min-h-0 relative">
        <div className="relative shrink-0 group">
          <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-[var(--radius)] blur-xl group-hover:bg-[var(--accent)]/10 transition-colors pointer-events-none"></div>
          <div className="relative flex items-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] shadow-inner overflow-hidden transition-all group-focus-within:border-[var(--accent)] group-focus-within:shadow-[0_0_25px_rgba(var(--accent-rgb),0.1)]">
            <div className="pl-6 pr-2 py-4 flex items-center justify-center">
               <span className="material-symbols-outlined text-[var(--accent)] drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("icon_search")}</span>
            </div>
            <input 
              type="text" 
              placeholder={t("workbench_search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none px-4 py-4 text-sm font-black text-[var(--text)] focus:outline-none placeholder-[var(--subtext)] placeholder:opacity-50 tracking-wider"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-4 pb-8">
          {isLoading ? (
             <div className="flex flex-col items-center justify-center p-12 opacity-40 theme-glass-panel rounded-[var(--radius)] border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
               <span className="material-symbols-outlined !text-5xl mb-4 text-[var(--text)] animate-spin">{t("icon_refresh")}</span>
               <p className="text-sm font-black uppercase tracking-widest">{t("loading_templates")}</p>
             </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 opacity-40 theme-glass-panel rounded-[var(--radius)] border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
              <span className="material-symbols-outlined !text-5xl mb-4 text-[var(--text)]">{t("icon_search_off")}</span>
              <p className="text-sm font-black uppercase tracking-widest">{t("empty_title_templates")}</p>
            </div>
          ) : (
            filteredTemplates.map((template: any, i: number) => (
              <button 
                key={i}
                onClick={() => {
                  onSelectTemplate(JSON.stringify(template, null, 2));
                }}
                className="flex flex-col items-start gap-4 p-6 theme-glass-panel rounded-[var(--radius)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.15)] hover:-translate-y-1 transition-all duration-300 group text-left border border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative overflow-hidden w-full"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 rounded-full blur-3xl group-hover:bg-[var(--accent)]/20 transition-colors pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
                
                <div className="flex items-center justify-between w-full relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform">
                       <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] drop-shadow-[0_0_5px_rgba(var(--accent-rgb),0.5)]">{t("icon_data_object")}</span>
                    </div>
                    <span className="font-black text-sm text-[var(--text)] tracking-wider drop-shadow-sm">{template.template_id}</span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] px-3 py-1.5 rounded-full shadow-inner">{template.target_file}</span>
                </div>
                
                <div className="flex items-center justify-between w-full mt-2 relative z-10 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] pt-4">
                   <div className="flex items-center gap-6">
                       {template.mod_author && (
                         <div className="flex items-center gap-2">
                           <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)]">{t("icon_person")}</span>
                           <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--text)] opacity-80">{t("author_author_label")} <span className="text-[var(--accent)]">{template.mod_author}</span></span>
                         </div>
                       )}
                       {template.template_version && (
                         <div className="flex items-center gap-2">
                           <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)]">{t("icon_tag")}</span>
                           <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--text)] opacity-80">{t("author_version_label")} <span className="text-[var(--accent)]">{template.template_version}</span></span>
                         </div>
                       )}
                   </div>
                   <div className="flex items-center gap-2 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-300">
                     <span className="text-[9px] font-black uppercase tracking-widest">{t("author_import_to_editor")}</span>
                     <span className="material-symbols-outlined !text-[14px]">{t("icon_arrow_forward")}</span>
                   </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </SidePanel>
  );
}
