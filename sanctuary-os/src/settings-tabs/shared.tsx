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
  <div className="flex flex-col gap-5 w-full relative">
    <div className="flex items-center justify-between w-full gap-4 relative z-10 min-w-0">
      <div className="glass-panel rounded-2xl px-3.5 py-2 md:px-4 md:py-2.5 flex items-center gap-3 md:gap-3.5 shrink-0 min-w-0 max-w-full">
        {icon && (
          <span className="w-8 h-8 md:w-9 md:h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] flex items-center justify-center shrink-0 text-[var(--accent)]">
            <span className="material-symbols-outlined !text-[17px] md:!text-[19px]">{icon}</span>
          </span>
        )}
        <h2 className="text-sm sm:text-base font-black text-[var(--text)] capitalize tracking-tight leading-tight m-0 truncate">
          {title}
        </h2>
      </div>
      <div className="h-px flex-1 min-w-[16px] bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_20%,transparent)] via-[color-mix(in_srgb,var(--text)_8%,transparent)] to-transparent" />
      {actions && <div className="flex items-center gap-2.5 shrink-0 z-10">{actions}</div>}
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
  return (
    <div
      className={`sa-glass-toggle ${checked ? "is-on" : ""}`}
      style={
        danger
          ? ({ "--toggle-accent": "var(--danger)" } as React.CSSProperties)
          : undefined
      }
    >
      <div className="sa-glass-toggle-thumb" />
    </div>
  );
}
