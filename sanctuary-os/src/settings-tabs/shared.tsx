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
    <div className="flex items-center justify-start w-full gap-4 relative z-10 min-w-0">
      <div className="glass-panel rounded-xl flex items-stretch shrink-0 min-w-0 max-w-full overflow-hidden">
        <div className="p-2 pr-3.5 md:p-2.5 md:pr-4 flex items-center gap-3 md:gap-3.5 min-w-0">
          {icon && (
            <span className="w-8 h-8 md:w-9 md:h-9 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[17px] md:!text-[19px]">{icon}</span>
            </span>
          )}
          <h2 className="text-sm sm:text-base font-black text-[var(--text)] capitalize tracking-tight leading-tight m-0 truncate">
            {title}
          </h2>
        </div>
        {actions && (
          <div className="flex items-stretch self-stretch shrink-0 border-l border-[color-mix(in_srgb,var(--text)_8%,transparent)] divide-x divide-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            {actions}
          </div>
        )}
      </div>
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
