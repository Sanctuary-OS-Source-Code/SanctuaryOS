import React from 'react';
import { EmptyState } from '../../shared-components/layout';

// ==========================================
// HUB OVERVIEW LANDING & SECTION (GOLD STANDARD)
// ==========================================
export interface HubOverviewLandingProps {
  children: React.ReactNode;
  className?: string;
}

export function HubOverviewLanding({ children, className = "" }: HubOverviewLandingProps) {
  return (
    <div className={`grid grid-cols-1 xl:grid-cols-2 gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500 ${className}`}>
      {children}
    </div>
  );
}

export interface HubOverviewSectionProps {
  title: React.ReactNode;
  icon?: string;
  iconColorClass?: string;
  headerAction?: React.ReactNode;
  isEmpty?: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyState?: React.ReactNode;
  gridClassName?: string;
  className?: string;
  children?: React.ReactNode;
}

export function HubOverviewSection({
  title,
  icon = "schedule",
  iconColorClass = "text-[var(--accent)]",
  headerAction,
  isEmpty = false,
  emptyIcon = "inventory_2",
  emptyTitle,
  emptySubtitle,
  emptyState,
  gridClassName = "grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6",
  className = "",
  children
}: HubOverviewSectionProps) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-2">
        {icon && <span className={`material-symbols-outlined ${iconColorClass}`}>{icon}</span>}
        <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{title}</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
        {headerAction && <div className="ml-auto shrink-0">{headerAction}</div>}
      </div>
      {isEmpty ? (
        emptyState ? <>{emptyState}</> : <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} className="py-8" />
      ) : (
        <div className={gridClassName}>
          {children}
        </div>
      )}
    </div>
  );
}

export interface HubListGridProps {
  isEmpty?: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  gridClassName?: string;
  className?: string;
  children?: React.ReactNode;
}

export function HubListGrid({
  isEmpty = false,
  emptyIcon = "inventory_2",
  emptyTitle,
  emptySubtitle,
  gridClassName = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pr-2",
  className = "",
  children
}: HubListGridProps) {
  return (
    <div className={`flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500 ${className}`}>
      {isEmpty ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} className="py-8" />
      ) : (
        <div className={gridClassName}>
          {children}
        </div>
      )}
    </div>
  );
}

// ==========================================
// SIDEPANEL GOLD STANDARD PRIMITIVES
// ==========================================
export interface SidePanelTitleInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange?: (value: string) => void;
  label?: React.ReactNode;
  subtitle?: React.ReactNode;
  wrapperClassName?: string;
}

export function SidePanelTitleInput({
  value,
  onChange,
  label,
  subtitle,
  placeholder,
  readOnly = false,
  wrapperClassName = "",
  className = "",
  ...rest
}: SidePanelTitleInputProps) {
  return (
    <div className={`flex flex-col gap-3 shrink-0 mb-4 mt-2 ${wrapperClassName}`}>
      {label && (
        <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1">
          {label}
        </span>
      )}
      <input
        {...rest}
        value={value}
        readOnly={readOnly || !onChange}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`bg-transparent text-3xl font-black text-[var(--text)] capitalize tracking-widest leading-tight truncate focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pb-1 w-full ${className}`}
      />
      {subtitle && (
        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1">
          {subtitle}
        </span>
      )}
    </div>
  );
}

export interface SidePanelPillToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  icon?: string;
  variant?: "accent" | "warning" | "success" | "danger";
  disabled?: boolean;
  className?: string;
}

export function SidePanelPillToggle({
  checked,
  onChange,
  label,
  icon,
  variant = "accent",
  disabled = false,
  className = ""
}: SidePanelPillToggleProps) {
  const colorVar =
    variant === "warning" ? "--warning" :
    variant === "success" ? "--success" :
    variant === "danger" ? "--danger" :
    "--accent";

  return (
    <label
      className={`w-full glass-surface rounded-2xl px-5 h-12 flex items-center justify-between cursor-pointer transition-all border shadow-inner group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${
        checked
          ? `bg-[color-mix(in_srgb,var(${colorVar})_10%,transparent)] !border-[color-mix(in_srgb,var(${colorVar})_35%,transparent)]`
          : "border-[color-mix(in_srgb,var(--text)_5%,transparent)]"
      } ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`}
    >
      <span
        className={`text-xs font-black capitalize tracking-widest transition-colors flex items-center gap-2 ${
          checked ? `text-[var(${colorVar})]` : "text-[var(--subtext)] group-hover:text-[var(--text)]"
        }`}
      >
        {icon && <span className="material-symbols-outlined !text-[16px]">{icon}</span>}
        {label}
      </span>
      <div
        className={`w-11 h-6 rounded-full transition-all relative shrink-0 border backdrop-blur-md ${
          checked
            ? `bg-[color-mix(in_srgb,var(${colorVar})_15%,transparent)] border-[color-mix(in_srgb,var(${colorVar})_50%,transparent)]`
            : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)] shadow-inner"
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full absolute top-[3px] transition-all duration-300 ${
            checked
              ? `translate-x-[22px] bg-[var(${colorVar})] shadow-[0_0_8px_var(${colorVar})]`
              : "translate-x-[3px] bg-[color-mix(in_srgb,var(--text)_40%,transparent)]"
          }`}
        />
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        className="hidden"
      />
    </label>
  );
}

// ==========================================
// UNIVERSAL GROUP
// ==========================================
export interface UniversalGroupProps {
  title?: string | React.ReactNode;
  label?: string | React.ReactNode;
  icon?: string;
  headerColorClass?: string;
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  innerClassName?: string;
}

export function UniversalGroup({
  title,
  label,
  icon,
  headerColorClass = "text-[var(--text)] opacity-80",
  headerAction,
  children,
  className = "",
  innerClassName = "flex flex-col gap-4"
}: UniversalGroupProps) {
  const heading = title || label;
  return (
    <div className={`flex flex-col gap-4 relative mb-2 ${className}`}>
      {heading && (
        <div className="flex items-center gap-2">
          {icon && <span className={`material-symbols-outlined !text-[16px] text-[var(--accent)]`}>{icon}</span>}
          <h4 className={`text-[10px] font-black capitalize tracking-widest flex items-center gap-2 ${headerColorClass}`}>
            {heading}
          </h4>
          <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
          {headerAction && <div className="ml-auto">{headerAction}</div>}
        </div>
      )}
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
      {label && <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{label}</label>}
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all ${className}`}
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
      {label && <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{label}</label>}
      <textarea
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all resize-none custom-scrollbar ${className}`}
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
  icon?: string;
  variant?: "accent" | "warning" | "success" | "danger";
  layout?: "horizontal" | "vertical" | "horizontal-reverse" | "pill";
  className?: string;
}

export function UniversalToggle({
  checked,
  onChange,
  label,
  icon,
  variant = "accent",
  layout = "pill",
  className = ""
}: UniversalToggleProps) {
  if (label && layout === "pill") {
    return (
      <SidePanelPillToggle
        checked={checked}
        onChange={onChange}
        label={label}
        icon={icon}
        variant={variant}
        className={className}
      />
    );
  }

  const toggleNode = (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="w-10 h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full peer peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:bg-[var(--bg)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 shadow-inner"></div>
    </label>
  );

  if (!label) return toggleNode;

  if (layout === "horizontal-reverse") {
    return (
      <div className={`flex items-center justify-between gap-4 w-full ${className}`}>
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
      <span className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-60 ml-2">{label}</span>
      {toggleNode}
    </div>
  );
}



