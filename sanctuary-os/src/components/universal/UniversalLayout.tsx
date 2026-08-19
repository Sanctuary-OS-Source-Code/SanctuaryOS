import React from 'react';

// ==========================================
// UNIVERSAL GROUP
// ==========================================
export interface UniversalGroupProps {
  title: string | React.ReactNode;
  icon?: string;
  headerColorClass?: string;
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  innerClassName?: string;
}

export function UniversalGroup({
  title,
  icon,
  headerColorClass = "text-[var(--text)] opacity-80",
  headerAction,
  children,
  className = "",
  innerClassName = "flex flex-col gap-2"
}: UniversalGroupProps) {
  return (
    <div className={`flex flex-col gap-6 relative mb-2 ${className}`}>
      <div className="flex items-center justify-start border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2">
        <h4 className={`text-[10px] font-black capitalize tracking-widest flex items-center gap-2 ${headerColorClass}`}>
          {icon && <span className="material-symbols-outlined !text-[14px]">{icon}</span>}
          {title}
        </h4>
        {headerAction && <div className="ml-auto">{headerAction}</div>}
      </div>
      <div className={innerClassName}>
        {children}
      </div>
    </div>
  );
}

// ==========================================
// UNIVERSAL SEARCH
// ==========================================
export interface UniversalSearchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  wrapperClassName?: string;
  inputClassName?: string;
}

export function UniversalSearch({
  value,
  onChange,
  placeholder = "SEARCH...",
  wrapperClassName = "",
  inputClassName = "",
  ...rest
}: UniversalSearchProps) {
  return (
    <div className={`relative shrink-0 ${wrapperClassName}`}>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-14 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] rounded-2xl px-6 pl-12 text-[12px] capitalize tracking-widest font-black text-[var(--text)] focus:border-[var(--accent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 focus:outline-none bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner ${inputClassName}`}
      />
      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-[20px] pointer-events-none">
        search
      </span>
      {value.trim() !== "" && (
        <button
          onClick={() => onChange("")}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 hover:opacity-100 hover:text-[var(--danger)] transition-all"
        >
          <span className="material-symbols-outlined !text-[18px]">close</span>
        </button>
      )}
    </div>
  );
}

// ==========================================
// UNIVERSAL INPUT
// ==========================================
export interface UniversalInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  wrapperClassName?: string;
}

export function UniversalInput({
  value,
  onChange,
  label,
  wrapperClassName = "",
  className = "",
  ...rest
}: UniversalInputProps) {
  return (
    <div className={`flex flex-col gap-2 ${wrapperClassName}`}>
      {label && <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{label}</label>}
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all ${className}`}
      />
    </div>
  );
}

// ==========================================
// UNIVERSAL TEXTAREA
// ==========================================
export interface UniversalTextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  wrapperClassName?: string;
}

export function UniversalTextArea({
  value,
  onChange,
  label,
  wrapperClassName = "",
  className = "",
  ...rest
}: UniversalTextAreaProps) {
  return (
    <div className={`flex flex-col gap-2 ${wrapperClassName}`}>
      {label && <label className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{label}</label>}
      <textarea
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all resize-none ${className}`}
      />
    </div>
  );
}

// ==========================================
// UNIVERSAL TOGGLE
// ==========================================
export interface UniversalToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  layout?: "horizontal" | "vertical" | "horizontal-reverse";
  className?: string;
}

export function UniversalToggle({
  checked,
  onChange,
  label,
  layout = "horizontal",
  className = ""
}: UniversalToggleProps) {
  const toggleNode = (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="w-11 h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[color-mix(in_srgb,var(--text)_10%,transparent)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white shadow-inner"></div>
    </label>
  );

  if (!label) return toggleNode;

  if (layout === "horizontal-reverse") {
    return (
      <div className={`flex items-center justify-start gap-4 w-full ${className}`}>
        <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80">{label}</span>
        {toggleNode}
      </div>
    );
  }

  if (layout === "horizontal") {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        {toggleNode}
        <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80">{label}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)]">{label}</span>
      {toggleNode}
    </div>
  );
}


