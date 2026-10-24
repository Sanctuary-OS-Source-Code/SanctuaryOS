import React from 'react';
import { EmptyState } from '../../shared-components/layout';
import { HoverTooltip } from '../../shared-components/alerts';

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
    <div className={`glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-md flex flex-col gap-2 shrink-0 ${wrapperClassName}`}>
      {label && (
        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 tracking-wide">
          {label}
        </span>
      )}
      <input
        {...rest}
        value={value}
        readOnly={readOnly || !onChange}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`bg-transparent text-xl md:text-2xl font-bold text-[var(--text)] tracking-tight leading-snug truncate focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 ${!readOnly && onChange ? "border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)] pb-1.5" : ""} w-full ${className}`}
      />
      {subtitle && (
        <span className="text-xs font-medium text-[var(--subtext)] opacity-75 tracking-normal">
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
          : "border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
      } ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`}
    >
      <span
        className={`text-xs font-bold tracking-wide transition-colors flex items-center gap-2 ${
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
  variant?: string;
  collapsible?: boolean;
  delayClass?: string;
}

export function UniversalGroup({
  title,
  label,
  icon,
  headerColorClass = "text-[var(--text)] opacity-85",
  headerAction,
  children,
  className = "",
  innerClassName = "flex flex-col gap-3.5",
  delayClass = ""
}: UniversalGroupProps) {
  const heading = title || label;
  return (
    <div className={`flex flex-col gap-3.5 relative ${delayClass} ${className}`}>
      {heading && (
        <div className="flex items-center gap-2.5 px-1">
          {icon && (
            <span className="material-symbols-outlined !text-[17px] text-[var(--accent)] opacity-90">
              {icon}
            </span>
          )}
          <h4 className={`text-xs font-semibold tracking-wide capitalize flex items-center gap-2 ${headerColorClass}`}>
            {heading}
          </h4>
          {headerAction && <div className="ml-auto shrink-0">{headerAction}</div>}
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
        className={`w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all resize-y overflow-y-auto min-h-[88px] custom-scrollbar ${className}`}
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

// ==========================================
// STAT BOX (TELEMETRY / INFO CARD)
// ==========================================
export interface StatBoxProps {
  label: string;
  value: React.ReactNode;
  icon: string;
  iconColorClass?: string;
  tooltipTitle?: string;
  tooltipSubtitle?: string;
  tooltipVariant?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
}

export function StatBox({
  label,
  value,
  icon,
  iconColorClass = "text-[var(--accent)]",
  tooltipTitle,
  tooltipSubtitle,
  tooltipVariant = "default",
  onClick,
  className = "",
}: StatBoxProps) {
  const extractNodeText = (node: React.ReactNode): string => {
    if (node === null || node === undefined || typeof node === "boolean") {
      return "";
    }
    if (typeof node === "string" || typeof node === "number") {
      return String(node);
    }
    if (Array.isArray(node)) {
      return node.map(extractNodeText).join("");
    }
    if (React.isValidElement(node)) {
      return extractNodeText((node.props as any)?.children);
    }
    return "";
  };
  const rawText = extractNodeText(value).trim();
  const valueSizeClass =
    rawText.length > 28
      ? "text-xs md:text-sm"
      : rawText.length > 18
        ? "text-sm md:text-[15px]"
        : "text-base md:text-lg";

  return (
    <div
      onClick={onClick}
      style={{
        "--glass-outer-shadow": "0 0 #0000",
        "--glass-nested-shadow": "0 0 #0000",
        boxShadow: "var(--glass-inset-highlight, inset 0 1px 0 0 rgba(255, 255, 255, 0.12))",
      } as React.CSSProperties}
      className={`glass-panel shadow-none rounded-2xl py-2.5 px-3 sm:py-3.5 sm:px-4 md:py-4 md:px-5 hover:border-[rgba(var(--text-rgb),0.28)] flex items-center gap-2.5 sm:gap-3 md:gap-3.5 relative overflow-hidden transition-all duration-300 group ${
        onClick ? "cursor-pointer active:scale-[0.99]" : "cursor-default"
      } ${className}`}
    >
      <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 flex items-center justify-center shrink-0 relative z-10 ${iconColorClass}`}>
        <span className="material-symbols-outlined !text-[18px] sm:!text-[20px] md:!text-[22px]">{icon}</span>
      </div>

      <div className="flex flex-col min-w-0 flex-1 relative z-10">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-80 mb-0.5 sm:mb-1 truncate">
          {label}
        </span>
        <div className={`${valueSizeClass} font-black tracking-tight leading-snug text-[var(--text)] truncate`}>
          {value}
        </div>
      </div>

      {tooltipSubtitle && (
        <HoverTooltip
          title={tooltipTitle || label}
          subtitle={tooltipSubtitle}
          icon={icon}
          variant={tooltipVariant}
        />
      )}
    </div>
  );
}


