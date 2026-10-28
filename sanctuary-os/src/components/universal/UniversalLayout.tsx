import React from 'react';
import { EmptyState } from '../../shared-components/layout';
import { HoverTooltip } from '../../shared-components/alerts';
import { normalizeAllCapsForThemeCase, useLexicon } from '../../LexiconContext';

// ==========================================
// HUB OVERVIEW LANDING & SECTION (GOLD STANDARD)
// ==========================================
export interface HubOverviewLandingProps {
  children: React.ReactNode;
  className?: string;
}

export function HubOverviewLanding({ children, className = "" }: HubOverviewLandingProps) {
  return (
    <div className={`grid grid-cols-1 xl:grid-cols-2 gap-10 xl:gap-12 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500 ${className}`}>
      {children}
    </div>
  );
}

export interface HubOverviewSectionProps {
  title: React.ReactNode;
  icon?: string;
  iconColorClass?: string;
  badgeCount?: number;
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
  gridClassName = "grid grid-cols-1 md:grid-cols-2 gap-6",
  className = "",
  children
}: HubOverviewSectionProps) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center justify-between gap-4 w-full min-w-0">
        <div className="glass-panel rounded-2xl px-3.5 py-2 md:px-4 md:py-2.5 flex items-center gap-3 md:gap-3.5 shrink-0 min-w-0 max-w-full">
          {icon && (
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] flex items-center justify-center shrink-0">
              <span className={`material-symbols-outlined !text-[17px] md:!text-[19px] opacity-90 ${iconColorClass}`}>{icon}</span>
            </div>
          )}
          <h2 className="text-sm sm:text-base font-black text-[var(--text)] capitalize tracking-tight leading-tight min-w-0 m-0 truncate">
            {title}
          </h2>
        </div>
        <div className="h-px flex-1 min-w-[16px] bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_20%,transparent)] via-[color-mix(in_srgb,var(--text)_8%,transparent)] to-transparent" />
        {headerAction && <div className="shrink-0">{headerAction}</div>}
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
export interface SidePanelHeroCardBadge {
  icon?: string;
  label: React.ReactNode;
  colorClass?: string;
}

export interface SidePanelHeroCardProps {
  icon: string;
  overline?: React.ReactNode;
  label?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  badgeIcon?: string;
  badges?: SidePanelHeroCardBadge[];
  variant?: "accent" | "danger" | "warning" | "success" | "default";
  children?: React.ReactNode;
  className?: string;
}

export function SidePanelHeroCard({
  icon,
  overline,
  label,
  title,
  description,
  subtitle,
  badge,
  badgeIcon,
  badges,
  variant = "accent",
  children,
  className = "",
}: SidePanelHeroCardProps) {
  const rawOverline = overline ?? label;
  const resolvedOverline = typeof rawOverline === "string" ? normalizeAllCapsForThemeCase(rawOverline) : rawOverline;
  const rawDescription = description ?? subtitle;
  const resolvedDescription = typeof rawDescription === "string" ? normalizeAllCapsForThemeCase(rawDescription) : rawDescription;
  const resolvedTitle = typeof title === "string" ? normalizeAllCapsForThemeCase(title) : title;
  const resolvedBadge = typeof badge === "string" ? normalizeAllCapsForThemeCase(badge) : badge;
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
            className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0"
            style={{
              color: `var(${colorVar})`,
            }}
          >
            <span className="material-symbols-outlined !text-[22px]">{icon}</span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            {resolvedOverline && (
              <span
                className="text-[10px] font-black uppercase tracking-[0.18em]"
                style={{ color: `var(${colorVar})` }}
              >
                {resolvedOverline}
              </span>
            )}
            {resolvedTitle && (
              <h3 className="text-sm sm:text-base font-black tracking-tight text-[var(--text)] m-0 leading-snug">
                {resolvedTitle}
              </h3>
            )}
            {resolvedDescription && (
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {resolvedDescription}
              </p>
            )}
          </div>
        </div>

        {(resolvedBadge || (badges && badges.length > 0)) && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
            {resolvedBadge && (
              <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                <span
                  className="material-symbols-outlined !text-[12px]"
                  style={{ color: `var(${colorVar})` }}
                >
                  {badgeIcon || icon}
                </span>
                <span>{resolvedBadge}</span>
              </span>
            )}
            {badges?.map((b, idx) => {
              const badgeIconColorVar =
                b.colorClass?.includes("--danger") || b.colorClass?.includes("red")
                  ? "--danger"
                  : b.colorClass?.includes("--warning") ||
                      b.colorClass?.includes("amber") ||
                      b.colorClass?.includes("yellow") ||
                      b.colorClass?.includes("orange")
                    ? "--warning"
                    : b.colorClass?.includes("--success") ||
                        b.colorClass?.includes("emerald") ||
                        b.colorClass?.includes("green")
                      ? "--success"
                      : colorVar;
              const resolvedBadgeLabel = typeof b.label === "string" ? normalizeAllCapsForThemeCase(b.label) : b.label;
              return (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0"
                >
                  <span
                    className="material-symbols-outlined !text-[12px]"
                    style={{ color: `var(${badgeIconColorVar})` }}
                  >
                    {b.icon || icon}
                  </span>
                  <span>{resolvedBadgeLabel}</span>
                </span>
              );
            })}
          </div>
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
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[15px]">
                {icon || (readOnly || !onChange ? "label" : "edit_note")}
              </span>
            </div>
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
  description?: React.ReactNode;
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
  description,
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
      className={`w-full glass-surface rounded-xl px-4 ${description ? "py-3.5" : "h-12"} flex ${description ? "items-start" : "items-center"} justify-between cursor-pointer transition-all border group hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] ${
        checked
          ? `!border-[color-mix(in_srgb,var(${colorVar})_45%,transparent)]`
          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
      } ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`}
    >
      <div className={`flex ${description ? "items-start" : "items-center"} gap-3 min-w-0 flex-1 pr-3`}>
        {icon && (
          <div
            className={`w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] flex items-center justify-center shrink-0 transition-colors ${description ? "mt-0.5" : ""} ${
              checked
                ? `text-[var(${colorVar})]`
                : "text-[var(--subtext)] group-hover:text-[var(--text)]"
            }`}
          >
            <span className="material-symbols-outlined !text-[16px]">{icon}</span>
          </div>
        )}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span
            className={`text-xs font-bold tracking-wide transition-colors ${description ? "leading-snug whitespace-normal break-words" : "truncate"} ${
              checked
                ? "text-[var(--text)]"
                : "text-[var(--subtext)] group-hover:text-[var(--text)]"
            }`}
          >
            {label}
          </span>
          {description && (
            <span className="text-[11px] font-medium text-[var(--subtext)] opacity-85 leading-relaxed whitespace-normal break-words">
              {description}
            </span>
          )}
        </div>
      </div>
      <div
        className={`sa-glass-toggle shrink-0 ${description ? "mt-1" : ""} ${checked ? "is-on" : ""}`}
        style={{ "--toggle-accent": `var(${colorVar})` } as React.CSSProperties}
      >
        <div className="sa-glass-toggle-thumb" />
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
  count?: React.ReactNode;
  headerColorClass?: string;
  headerAction?: React.ReactNode;
  headerActions?: React.ReactNode;
  actions?: React.ReactNode;
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
  count,
  headerColorClass = "text-[var(--text)]",
  headerAction,
  headerActions,
  actions,
  children,
  className = "",
  innerClassName = "flex flex-col gap-3.5",
  delayClass = ""
}: UniversalGroupProps) {
  const heading = title || label;
  const resolvedHeaderAction = headerAction || headerActions || actions;
  return (
    <div
      className={`glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col relative ${delayClass} ${className}`}
    >
      {heading && (
        <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[15px]">
                  {icon}
                </span>
              </div>
            )}
            <h4
              className={`text-[11px] font-black uppercase tracking-wider m-0 truncate flex items-center gap-2 ${headerColorClass}`}
            >
              {heading}
            </h4>
            {count !== undefined && count !== null && (
              <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black text-[var(--subtext)] shrink-0">
                {count}
              </span>
            )}
          </div>
          {resolvedHeaderAction && <div className="ml-auto shrink-0">{resolvedHeaderAction}</div>}
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
  const { t } = useLexicon();
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
        {t("icon_search", "search")}
      </span>
      {value.trim() !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 hover:opacity-100 hover:text-[var(--danger)] transition-all"
        >
          <span className="material-symbols-outlined !text-[16px]">{t("icon_close", "close")}</span>
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

  const colorVar =
    variant === "warning"
      ? "--warning"
      : variant === "success"
        ? "--success"
        : variant === "danger"
          ? "--danger"
          : "--accent";

  const toggleNode = (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div
        className={`sa-glass-toggle ${checked ? "is-on" : ""}`}
        style={{ "--toggle-accent": `var(${colorVar})` } as React.CSSProperties}
      >
        <div className="sa-glass-toggle-thumb" />
      </div>
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
  icon?: string;
  iconColorClass?: string;
  colorClass?: string;
  tooltipTitle?: string;
  tooltipSubtitle?: string;
  tooltipVariant?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
}

export function StatBox({
  label,
  value,
  icon = "analytics",
  iconColorClass,
  colorClass,
  tooltipTitle,
  tooltipSubtitle,
  tooltipVariant = "default",
  onClick,
  className = "",
}: StatBoxProps) {
  const resolvedIconColorClass = iconColorClass || colorClass || "text-[var(--accent)]";
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
    rawText.length > 26
      ? "text-xs sm:text-[13px]"
      : rawText.length > 16
        ? "text-[13px] sm:text-sm md:text-[15px]"
        : "text-sm sm:text-base md:text-lg";

  return (
    <div
      onClick={onClick}
      style={{
        "--glass-outer-shadow": "0 0 #0000",
        "--glass-nested-shadow": "0 0 #0000",
        boxShadow: "var(--glass-inset-highlight, inset 0 1px 0 0 rgba(255, 255, 255, 0.12))",
      } as React.CSSProperties}
      className={`glass-panel shadow-none rounded-2xl py-3 px-3.5 hover:border-[rgba(var(--text-rgb),0.28)] flex items-center gap-3 relative overflow-hidden transition-all duration-300 group ${
        onClick ? "cursor-pointer active:scale-[0.99]" : "cursor-default"
      } ${className}`}
    >
      <div className={`w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 relative z-10 ${resolvedIconColorClass}`}>
        <span className="material-symbols-outlined !text-[18px]">{icon}</span>
      </div>

      <div className="flex flex-col min-w-0 flex-1 relative z-10">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-80 mb-0.5 truncate">
          {normalizeAllCapsForThemeCase(label)}
        </span>
        <div className={`${valueSizeClass} font-black tracking-tight leading-snug text-[var(--text)] break-words line-clamp-2`}>
          {typeof value === "string" ? normalizeAllCapsForThemeCase(value) : value}
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


