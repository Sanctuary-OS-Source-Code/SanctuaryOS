import { useLexicon } from './LexiconContext';
import { EmptyState } from './shared';

interface TemplatePreviewerProps {
  templateData: any;
}

export default function TemplatePreviewer({ templateData }: TemplatePreviewerProps) {
  const { t } = useLexicon();
  
  const settings = templateData?.settings || (Array.isArray(templateData) ? templateData[0]?.settings : []);
  
  if (!settings || settings.length === 0) {
      return (
          <EmptyState
             icon={t("icon_visibility_off", "visibility_off")}
             title={t("no_visual_template", "No Visual Template Available")}
             minHeightClass="min-h-[320px]"
          />
      );
  }

  const resolveText = (k?: string, fallback?: string) => {
      if (!k) return fallback || "";
      const tr = t(k, fallback || k);
      if (tr === `[${k}]`) return fallback || k;
      return tr;
  };

  return (
      <div className="flex flex-col gap-4">
          {settings.map((setting: any, idx: number) => {
              const val = setting.default;
              return (
                 <div key={idx} className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-6 shadow-inner flex flex-col xl:flex-row xl:items-center justify-start group hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] transition-all duration-300 gap-6 opacity-80 pointer-events-none select-none">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                       <div className="flex flex-wrap items-center gap-3">
                          <span className="text-[12px] font-black capitalize tracking-widest text-[var(--text)]">{resolveText(setting.label_key, setting.key)}</span>
                          {setting.risk === "advanced" && (
                             <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black tracking-wider uppercase flex items-center gap-1.5 shrink-0">
                                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">{t("icon_warning", "warning")}</span>
                                {t("advanced_badge", "Advanced")}
                             </span>
                          )}
                       </div>
                       <span className="text-[10px] text-[var(--subtext)] opacity-80 font-medium leading-relaxed max-w-2xl">{resolveText(setting.desc_key, "No description provided.")}</span>
                    </div>
                    <div className="shrink-0 flex items-center justify-end">
                       {setting.type === "boolean" && (
                          <div className={`sa-glass-toggle ${val ? 'is-on' : ''}`}>
                             <div className="sa-glass-toggle-thumb" />
                          </div>
                       )}
                       {setting.type === "number" && (
             <div className="flex items-stretch glass-panel rounded-xl divide-x divide-white/5 shadow-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                             <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--subtext)]">
                                <span className="material-symbols-outlined !text-[16px]">{t("icon_remove", "remove")}</span>
                             </button>
                             <input type="number" value={val || 0} readOnly className="w-16 bg-transparent text-[12px] font-black text-[var(--text)] text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                             <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--subtext)]">
                                <span className="material-symbols-outlined !text-[16px]">{t("icon_add", "add")}</span>
                             </button>
                          </div>
                       )}
                       {setting.type === "string" && (
                          <div className="relative">
                             <input type="text" value={val || ""} readOnly className="glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl h-10 px-4 text-[12px] font-bold text-[var(--text)] focus:outline-none w-48 truncate" />
                          </div>
                       )}
                       {setting.type === "options" && (
                          <div className="glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl h-10 px-4 text-[12px] font-bold text-[var(--text)] flex items-center justify-start w-48">
                             <span className="truncate">{val || "Select option..."}</span>
                             <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">{t("icon_expand_more", "expand_more")}</span>
                          </div>
                       )}
                    </div>
                 </div>
              );
          })}
      </div>
  );
}


