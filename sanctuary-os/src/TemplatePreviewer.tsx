import React from 'react';
import { useLexicon } from './LexiconContext';

interface TemplatePreviewerProps {
  templateData: any;
}

export default function TemplatePreviewer({ templateData }: TemplatePreviewerProps) {
  const { t } = useLexicon();
  
  const settings = templateData?.settings || (Array.isArray(templateData) ? templateData[0]?.settings : []);
  
  if (!settings || settings.length === 0) {
      return (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-8 min-h-[400px]">
             <div className="w-24 h-24 rounded-full theme-glass-panel flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] opacity-40 shadow-inner">
                <span className="material-symbols-outlined !text-5xl text-[var(--text)]">{t("auto_visibility_off")}</span>
             </div>
             <div className="flex flex-col items-center gap-3 text-center opacity-60">
                <span className="text-[14px] font-black uppercase tracking-[0.2em] text-[var(--text)]">{t("workbench_no_visual_template") || "NO VISUAL TEMPLATE FOUND"}</span>
             </div>
          </div>
      );
  }

  return (
      <div className="flex flex-col gap-4">
          {settings.map((setting: any, idx: number) => {
              const val = setting.default;
              return (
                 <div key={idx} className="theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-3xl p-6 shadow-inner flex flex-col xl:flex-row xl:items-center justify-between group hover:border-white/30 transition-all duration-300 gap-6 opacity-80 pointer-events-none select-none">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                       <div className="flex flex-wrap items-center gap-3">
                          <span className="text-[12px] font-black uppercase tracking-widest text-[var(--text)]">{t(setting.label_key) || setting.label_key || setting.key}</span>
                          {setting.risk === "advanced" && (
                             <span className="px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] text-[8px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">{t("workbench_advanced_badge") || "ADVANCED"}</span>
                          )}
                       </div>
                       <span className="text-[10px] text-[var(--subtext)] opacity-80 font-medium leading-relaxed max-w-2xl">{t(setting.desc_key) || setting.desc_key || "No description provided."}</span>
                    </div>
                    <div className="shrink-0 flex items-center justify-end">
                       {setting.type === "boolean" && (
                          <div className={`w-14 h-8 rounded-full transition-all duration-300 relative flex items-center px-1 border shadow-inner ${val ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'theme-glass-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                             <div className={`w-6 h-6 rounded-full shadow-md transition-all duration-300 ${val ? 'translate-x-6 bg-[var(--accent)]' : 'translate-x-0 bg-[var(--text)] opacity-40'}`}></div>
                          </div>
                       )}
                       {setting.type === "number" && (
                          <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 shadow-inner border border-white/10 shrink-0">
                             <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--subtext)]">
                                <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_remove") || "remove"}</span>
                             </button>
                             <input type="number" value={val || 0} readOnly className="w-16 bg-transparent text-[12px] font-black text-[var(--text)] text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                             <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--subtext)]">
                                <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_add") || "add"}</span>
                             </button>
                          </div>
                       )}
                       {setting.type === "string" && (
                          <div className="relative">
                             <input type="text" value={val || ""} readOnly className="theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl h-10 px-4 text-[12px] font-bold text-[var(--text)] focus:outline-none w-48 truncate" />
                          </div>
                       )}
                       {setting.type === "options" && (
                          <div className="theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl h-10 px-4 text-[12px] font-bold text-[var(--text)] flex items-center justify-between w-48">
                             <span className="truncate">{val || "Select option..."}</span>
                             <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">{t("ui_icon_expand_more") || "expand_more"}</span>
                          </div>
                       )}
                    </div>
                 </div>
              );
          })}
      </div>
  );
}
