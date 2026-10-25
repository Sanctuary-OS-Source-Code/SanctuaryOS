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
// (Modeled after Login, Malware, Metadata & Defcon)
// ==========================================
export interface SidePanelHeroCardProps {
  icon: string;
  overline?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  badgeIcon?: string;
  variant?: "accent" | "danger" | "warning" | "success";
  children?: React.ReactNode;
  className?: string;
}

export function SidePanelHeroCard({
  icon,
  overline,
  title,
  description,
  badge,
  badgeIcon,
  variant = "accent",
  children,
  className = "",
}: SidePanelHeroCardProps) {
  const colorVar =
    variant === "danger"
      ? "--danger"
      : variant === "warning"
        ? "--warning"
        : variant === "success"
          ? "--success"
          : "--accent";

  return (
    <div
      className={`glass-panel rounded-2xl p-4 sm:p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3.5 shrink-0 ${className}`}
    >
      <div className="flex items-start justify-between gap-3.5">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div
            className="w-11 h-11 rounded-xl border bg-transparent flex items-center justify-center shrink-0"
            style={{
              borderColor: `color-mix(in srgb, var(${colorVar}) 42%, transparent)`,
              color: `var(${colorVar})`,
            }}
          >
            <span className="material-symbols-outlined !text-[22px]">{icon}</span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            {overline && (
              <span
                className="text-[10px] font-black uppercase tracking-[0.18em]"
                style={{ color: `var(${colorVar})` }}
              >
                {overline}
              </span>
            )}
            {title && (
              <h3 className="text-sm sm:text-base font-black tracking-tight text-[var(--text)] m-0 leading-snug">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {description}
              </p>
            )}
          </div>
        </div>

        {badge && (
          <span
            className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border bg-transparent flex items-center gap-1 shrink-0"
            style={{
              borderColor: `color-mix(in srgb, var(${colorVar}) 42%, transparent)`,
              color: `var(${colorVar})`,
            }}
          >
            {badgeIcon && (
              <span className="material-symbols-outlined !text-[12px]">
                {badgeIcon}
              </span>
            )}
            {badge}
          </span>
        )}
      </div>

      {children}
    </div>
  );
}

export interface SidePanelTitleInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange?: (value: string) => void;
  label?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: string;
  wrapperClassName?: string;
}

export function SidePanelTitleInput({
  value,
  onChange,
  label,
  subtitle,
  icon,
  placeholder,
  readOnly = false,
  wrapperClassName = "",
  className = "",
  ...rest
}: SidePanelTitleInputProps) {
  const headerLabel = label || subtitle || placeholder;
  const secondaryMeta = label && subtitle ? subtitle : undefined;

  return (
    <div
      className={`glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0 ${wrapperClassName}`}
    >
      {headerLabel && (
        <div className="px-4 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
              {icon || (readOnly || !onChange ? "label" : "edit_note")}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] truncate">
              {headerLabel}
            </span>
          </div>
          {secondaryMeta && (
            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate shrink-0">
              {secondaryMeta}
            </span>
          )}
        </div>
      )}
      <div className="p-3.5 flex flex-col gap-1.5">
        <input
          {...rest}
          value={value}
          readOnly={readOnly || !onChange}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className={`w-full glass-surface rounded-xl px-4 py-3 text-sm md:text-base font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all placeholder:opacity-40 ${className}`}
        />
      </div>
    </div>
  );
}

export interface SidePanelPillToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  icon?: string;
  variant?: "accent" | "warning" | "success" | "danger";
  activeColor?: string;
  disabled?: boolean;
  className?: string;
}

export function SidePanelPillToggle({
  checked,
  onChange,
  label,
  icon,
  variant = "accent",
  activeColor,
  disabled = false,
  className = ""
}: SidePanelPillToggleProps) {
  const colorVar =
    activeColor?.includes("--warning") || variant === "warning" ? "--warning" :
    activeColor?.includes("--success") || variant === "success" ? "--success" :
    activeColor?.includes("--danger") || variant === "danger" ? "--danger" :
    "--accent";

  return (
    <label
      className={`w-full glass-surface rounded-xl px-4 h-12 flex items-center justify-between cursor-pointer transition-all border group hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] ${
        checked
          ? `!border-[color-mix(in_srgb,var(${colorVar})_45%,transparent)]`
          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
      } ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`}
    >
      <span
        className={`text-xs font-bold tracking-wide transition-colors flex items-center gap-2 min-w-0 truncate ${
          checked ? `text-[var(${colorVar})]` : "text-[var(--subtext)] group-hover:text-[var(--text)]"
        }`}
      >
        {icon && <span className="material-symbols-outlined !text-[16px] shrink-0">{icon}</span>}
        <span className="truncate">{label}</span>
      </span>
      <div
        className={`w-11 h-6 rounded-full transition-all relative shrink-0 border bg-transparent ${
          checked
            ? `border-[color-mix(in_srgb,var(${colorVar})_55%,transparent)]`
            : "border-[color-mix(in_srgb,var(--text)_18%,transparent)]"
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
// UNIVERSAL GROUP (STRUCTURED SIDEPANEL CARD)
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
  headerColorClass = "text-[var(--text)]",
  headerAction,
  children,
  className = "",
  innerClassName = "flex flex-col gap-3.5",
  delayClass = ""
}: UniversalGroupProps) {
  const heading = title || label;
  return (
    <div
      className={`glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col relative ${delayClass} ${className}`}
    >
      {heading && (
        <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                {icon}
              </span>
            )}
            <h4
              className={`text-[11px] font-black uppercase tracking-wider m-0 truncate flex items-center gap-2 ${headerColorClass}`}
            >
              {heading}
            </h4>
          </div>
          {headerAction && <div className="ml-auto shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className={`p-4 ${innerClassName}`}>{children}</div>
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
        className={`w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] rounded-xl px-4 pl-10 text-xs font-bold text-[var(--text)] focus:border-[var(--accent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 focus:outline-none ${inputClassName}`}
      />
      <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 !text-[18px] pointer-events-none">
        search
      </span>
      {value.trim() !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 hover:opacity-100 hover:text-[var(--danger)] transition-all"
        >
          <span className="material-symbols-outlined !text-[16px]">close</span>
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
    <div className={`flex flex-col gap-1.5 ${wrapperClassName}`}>
      {label && (
        <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
          {label}
        </label>
      )}
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all ${className}`}
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
    <div className={`flex flex-col gap-1.5 ${wrapperClassName}`}>
      {label && (
        <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
          {label}
        </label>
      )}
      <textarea
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all resize-y overflow-y-auto min-h-[88px] custom-scrollbar ${className}`}
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


