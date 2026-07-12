import { useLexicon } from '../LexiconContext';
import { TabContainer } from './shared';

export default function LogicTab({ anarchyRules, setAnarchyRules }: any) {
  const { t } = useLexicon();
  const rules = anarchyRules || { highlander: true, family: true, dependencies: true, intercept: true };

  const toggleRule = (key: string) => {
    if (setAnarchyRules) setAnarchyRules({ ...rules, [key]: !rules[key as keyof typeof rules] });
  };

  return (
    <TabContainer title={t("anarchy_title")} icon="psychology">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div onClick={() => toggleRule('highlander')} className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer flex items-center justify-between group backdrop-blur-xl shadow-xl hover:scale-[1.02] active:scale-95 ${!rules.highlander ? 'theme-glass-inner border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'theme-glass-panel hover:theme-border-accent'}`}>
          <div className="flex flex-col gap-2">
            <span className={`text-sm font-black uppercase tracking-[0.2em] transition-colors ${!rules.highlander ? 'text-red-400' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>{t("anarchy_highlander")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("anarchy_highlander_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full flex items-center p-1 transition-colors shrink-0 ${!rules.highlander ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${!rules.highlander ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>

        <div onClick={() => toggleRule('family')} className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer flex items-center justify-between group backdrop-blur-xl shadow-xl hover:scale-[1.02] active:scale-95 ${!rules.family ? 'theme-glass-inner border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'theme-glass-panel hover:theme-border-accent'}`}>
          <div className="flex flex-col gap-2">
            <span className={`text-sm font-black uppercase tracking-[0.2em] transition-colors ${!rules.family ? 'text-red-400' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>{t("anarchy_family")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("anarchy_family_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full flex items-center p-1 transition-colors shrink-0 ${!rules.family ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${!rules.family ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>

        <div onClick={() => toggleRule('dependencies')} className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer flex items-center justify-between group backdrop-blur-xl shadow-xl hover:scale-[1.02] active:scale-95 ${!rules.dependencies ? 'theme-glass-inner border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'theme-glass-panel hover:theme-border-accent'}`}>
          <div className="flex flex-col gap-2">
            <span className={`text-sm font-black uppercase tracking-[0.2em] transition-colors ${!rules.dependencies ? 'text-red-400' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>{t("anarchy_deps")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("anarchy_deps_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full flex items-center p-1 transition-colors shrink-0 ${!rules.dependencies ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${!rules.dependencies ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>

        <div onClick={() => toggleRule('intercept')} className={`p-8 rounded-[var(--radius)] border transition-all cursor-pointer flex items-center justify-between group backdrop-blur-xl shadow-xl hover:scale-[1.02] active:scale-95 ${!rules.intercept ? 'theme-glass-inner border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'theme-glass-panel hover:theme-border-accent'}`}>
          <div className="flex flex-col gap-2">
            <span className={`text-sm font-black uppercase tracking-[0.2em] transition-colors ${!rules.intercept ? 'text-red-400' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>{t("anarchy_intercept")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("anarchy_intercept_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full flex items-center p-1 transition-colors shrink-0 ${!rules.intercept ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${!rules.intercept ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>
      </div>
    </TabContainer>
  );
}
