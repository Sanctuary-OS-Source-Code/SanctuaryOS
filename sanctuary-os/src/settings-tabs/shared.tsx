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
      <button ref={btnRef} onClick={() => setIsOpen(!isOpen)} className="w-full p-5 rounded-[var(--radius)] glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] outline-none transition-all shadow-xl flex justify-start items-center text-[10px] font-black capitalize tracking-widest text-[var(--text)] focus:theme-border-accent group hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-2xl hover:scale-[1.02] active:scale-95 backdrop-blur-3xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <span className="relative z-10">{selected?.label}</span>
        <span className="text-[var(--subtext)] opacity-60 text-[10px] group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors relative z-10 material-symbols-outlined !text-[18px]">{isOpen ? 'expand_less' : 'expand_more'}</span>
      </button>
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[50000]" onClick={() => setIsOpen(false)} />
          <div className="fixed mt-3 glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[50001] animate-in fade-in zoom-in-95 slide-in-from-top-2 backdrop-blur-3xl"
            style={{
              top: btnRef.current?.getBoundingClientRect().bottom,
              left: btnRef.current?.getBoundingClientRect().left,
              width: btnRef.current?.getBoundingClientRect().width,
            }}
          >
            {options.map((opt: any) => (
              <button key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); }} className={`w-full text-left px-5 py-4 text-[10px] font-black capitalize tracking-widest transition-all border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex items-center justify-start group/opt hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:pl-7 ${opt.id === value ? 'theme-text-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--text)]'}`}>
                {opt.label}
                {opt.id === value && <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_check")}</span>}
              </button>
            ))}
          </div>
        </>, document.body
      )}
    </div>
  );
}

export const TabContainer = ({ title, icon, actions, children }: any) => (
  <div className="flex flex-col gap-10 animate-in slide-in-from-right-8 duration-500 w-full relative">
    <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent)] opacity-[0.02] blur-[100px] pointer-events-none rounded-full" />
    <div className="flex justify-start items-center border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-4 relative z-10">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_50%,transparent)] to-transparent" />
      <h2 className="text-2xl font-semibold text-[var(--text)] tracking-tight flex items-center gap-3 drop-shadow-md">
        {icon && <span className="material-symbols-outlined !text-3xl opacity-50 theme-text-accent">{icon}</span>}
        {title}
      </h2>
      {actions && <div className="absolute right-0 bottom-4 flex gap-3 z-10">{actions}</div>}
    </div>
    <div className="flex flex-col gap-8 w-full relative z-10">
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



export function SettingsToggle({ checked, danger }: any) {
  const containerBase = "w-12 h-6 rounded-full transition-all duration-300 flex items-center p-1 shrink-0 border backdrop-blur-md box-border";
  const checkedAccent = "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] theme-border-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]";
  const checkedDanger = "bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border-[var(--danger)] shadow-[0_0_15px_rgba(255,0,0,0.2)]";
  const uncheckedClass = "bg-black/20 border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-inner";
  
  const containerClasses = `${containerBase} ${checked ? (danger ? checkedDanger : checkedAccent) : uncheckedClass}`;
  
  return (
    <div className={containerClasses}>
      <div className={`w-4 h-4 rounded-full transition-all duration-300 ${checked ? "translate-x-[22px] bg-white shadow-[0_0_10px_white]" : "translate-x-0 bg-[var(--text)] opacity-40"}`} />
    </div>
  );
}
