import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLexicon } from '../LexiconContext';

export function CustomSettingsDropdown({ value, options, onChange }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o: any) => o.id == value) || options[0];
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative w-full z-10">
      <button ref={btnRef} onClick={() => setIsOpen(!isOpen)} className="w-full p-5 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] outline-none transition-all shadow-xl flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[var(--text)] focus:theme-border-accent group hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-2xl hover:scale-[1.02] active:scale-95 backdrop-blur-3xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <span className="relative z-10">{selected?.label}</span>
        <span className="text-[var(--subtext)] opacity-60 text-[10px] group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors relative z-10 material-symbols-outlined !text-[18px]">{isOpen ? 'expand_less' : 'expand_more'}</span>
      </button>
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[50000]" onClick={() => setIsOpen(false)} />
          <div className="fixed mt-3 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[50001] animate-in fade-in zoom-in-95 slide-in-from-top-2 backdrop-blur-3xl"
            style={{
              top: btnRef.current?.getBoundingClientRect().bottom,
              left: btnRef.current?.getBoundingClientRect().left,
              width: btnRef.current?.getBoundingClientRect().width,
            }}
          >
            {options.map((opt: any) => (
              <button key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); }} className={`w-full text-left px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex items-center justify-between group/opt hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:pl-7 ${opt.id === value ? 'theme-text-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--text)]'}`}>
                {opt.label}
                {opt.id === value && <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_check")}</span>}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export const TabContainer = ({ title, icon, actions, children }: any) => (
  <div className="flex flex-col gap-16 animate-in slide-in-from-right-8 duration-500 w-full relative">
    <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent)] opacity-[0.02] blur-[100px] pointer-events-none rounded-full" />
    <div className="flex justify-between items-center border-b border-white/10 pb-6 relative z-10">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-white/20 to-transparent" />
      <h2 className="text-2xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-4 drop-shadow-lg">
        {icon && <span className="material-symbols-outlined !text-4xl opacity-50 theme-text-accent">{icon}</span>}
        {title}
      </h2>
      {actions && <div className="absolute right-0 bottom-4 flex gap-3 z-10">{actions}</div>}
    </div>
    <div className="flex flex-col gap-10 w-full relative z-10">
      {children}
    </div>
  </div>
);
export function SettingsGrid({ children }: any) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 w-full relative z-10">
      {children}
    </div>
  );
}

export function SettingCard({ title, description, icon, action, children, onClick, danger, active }: any) {
  return (
    <div 
      onClick={onClick} 
      className={`flex flex-col p-6 rounded-[var(--radius)] theme-glass-panel transition-all shadow-xl hover:-translate-y-1 hover:shadow-2xl active:scale-95 border ${onClick ? 'cursor-pointer' : ''} ${active ? 'theme-border-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : danger ? 'border-red-500/30 hover:border-red-500 hover:bg-red-500/10' : 'border-white/5 hover:border-white/20'}`}
    >
      <div className="flex items-start justify-between mb-8 gap-4">
        {icon ? (
          <span className={`material-symbols-outlined !text-3xl ${danger ? 'text-red-500' : 'theme-text-accent'}`}>{icon}</span>
        ) : (
          <div className="w-8 h-8" />
        )}
        {action && (
          <div className="shrink-0 flex items-center justify-end">
            {action}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 mb-4">
        <span className={`text-[12px] font-black uppercase tracking-[0.2em] ${danger ? "text-red-400" : "text-[var(--text)]"}`}>{title}</span>
        {description && <span className={`text-[10px] font-bold opacity-60 uppercase tracking-widest leading-relaxed ${danger ? "text-red-400" : "text-[var(--subtext)]"}`}>{description}</span>}
      </div>
      {children && (
        <div className="mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          {children}
        </div>
      )}
    </div>
  );
}

export function SettingsToggle({ checked, danger }: any) {
  return (
    <div className={`w-12 h-6 rounded-full transition-colors flex items-center p-1 shrink-0 ${checked ? (danger ? "bg-[var(--danger)] shadow-[0_0_15px_var(--danger)]" : "theme-bg-accent shadow-[0_0_15px_var(--accent)]") : "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]"}`}>
      <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-300 ${checked ? "translate-x-6" : "translate-x-0"}`} />
    </div>
  );
}
