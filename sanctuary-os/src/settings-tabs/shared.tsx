import { CustomDropdown } from '../shared';

export function CustomSettingsDropdown({ value, options, onChange }: any) {
  return (
    <div className="relative w-full z-10">
      <CustomDropdown
        value={value}
        options={options}
        onChange={(vals: any) => onChange(Array.isArray(vals) ? vals[0] : vals)}
        disableTint={true}
      />
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


