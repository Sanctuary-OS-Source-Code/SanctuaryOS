import React from 'react';
import { HoverTooltip } from "./alerts";
export function ActionButton({
  icon,
  label,
  onClick,
  onDoubleClick,
  disabled,
  className = "",
  type = "button",
  form,
  children,
  variant = "default",
  iconOnly = false,
}: {
  icon?: string;
  label?: React.ReactNode;
  onClick?: (e?: any) => void;
  onDoubleClick?: (e?: any) => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  form?: string;
  children?: React.ReactNode;
  variant?:
    | "default"
    | "primary"
    | "success"
    | "danger"
    | "accent"
    | "glass"
    | "warning"
    | "world"
    | "engine"
    | "solid";
  iconOnly?: boolean;
}) {
  let variantClasses = "";
  let iconColorClass = "text-[var(--accent)]";

  switch (variant) {
    case "solid":
    case "primary":
    case "accent":
    case "world":
      variantClasses =
        "glass-surface sa-glass-pill-active !text-[var(--text)] opacity-95 hover:opacity-100";
      iconColorClass = "text-[var(--accent)]";
      break;
    case "engine":
    case "danger":
      variantClasses =
        "glass-surface sa-glass-pill-danger !text-[var(--text)] opacity-90 hover:opacity-100";
      iconColorClass = "text-[var(--danger)]";
      break;
    case "success":
      variantClasses =
        "glass-surface sa-glass-pill-success !text-[var(--text)] opacity-90 hover:opacity-100";
      iconColorClass = "text-[var(--success)]";
      break;
    case "warning":
      variantClasses =
        "glass-surface sa-glass-pill-warning !text-[var(--text)] opacity-90 hover:opacity-100";
      iconColorClass = "text-[var(--warning)]";
      break;
    case "default":
    case "glass":
    default:
      variantClasses =
        "glass-surface sa-glass-pill-hover border-[color-mix(in_srgb,var(--text)_14%,transparent)] !text-[var(--text)] opacity-85 hover:opacity-100 group-hover/card:border-[color-mix(in_srgb,var(--accent)_48%,rgba(255,255,255,0.32))]";
      iconColorClass = "text-[var(--accent)]";
      break;
  }

  const basePadding = iconOnly
    ? "w-10 h-10 rounded-xl !p-0 shrink-0"
    : "px-6 py-3.5 rounded-xl";

  return (
    <div className={`relative ${iconOnly ? "inline-block" : className.includes("w-full") ? "w-full" : ""}`}>
      <button
        type={type}
        form={form}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        disabled={disabled}
        className={`relative overflow-hidden border ${basePadding} text-[11px] font-semibold capitalize tracking-wider transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none group ${variantClasses} ${className}`}
      >
        {icon && (
          <span
            className={`material-symbols-outlined ${iconOnly ? "!text-[18px]" : "!text-[16px]"} ${iconColorClass} relative z-10 transition-transform group-hover:-translate-y-0.5`}
          >
            {icon}
          </span>
        )}
        {!iconOnly && (
          <span className="relative z-10 flex items-center gap-2">
            {label}
            {children}
          </span>
        )}
      </button>
      {iconOnly && (label || typeof children === "string") && (
        <HoverTooltip title={label || children} />
      )}
    </div>
  );
}
export const standardAccentGlassButtonClass =
  "px-8 py-4 rounded-[var(--radius)] glass-surface sa-glass-pill-active text-[var(--text)] text-xs font-black capitalize tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none transition-all duration-300 active:scale-95";
export function SidebarFooterButton({
  icon,
  label,
  onClick,
  variant = "default",
  className = "",
}: any) {
  let variantClasses =
    "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)] border-transparent";

  if (variant === "danger") {
    variantClasses =
      "text-[var(--danger)] opacity-80 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[var(--danger)] border-transparent";
  } else if (variant === "success") {
    variantClasses =
      "text-[var(--success)] opacity-80 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:text-[var(--success)] border-transparent";
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group ${variantClasses} ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />

      {icon && (
        <span
          className={`material-symbols-outlined !text-[20px] transition-all duration-500 shrink-0 relative z-10 group-hover:scale-110`}
        >
          {icon}
        </span>
      )}
      <span
        className="font-black capitalize tracking-[0.15em] truncate leading-none pt-0.5 relative z-10 text-left flex-1"
        style={{ fontSize: "var(--fontSizeSidebar, 11px)" }}
      >
        {label}
      </span>
    </button>
  );
}
export function PanelHeaderButton({
  icon,
  label,
  tooltip,
  onClick,
  disabled = false,
  variant = "default",
  isDestructive = false,
  isAccent = false,
  isActive = false,
  tooltipAlign = "center",
  tooltipVariant,
  className = "",
}: any) {
  const resolvedVariant = isDestructive ? "danger" : isAccent ? "accent" : variant;
  let colorClass =
    "border border-transparent text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";
  let activeIconClass = "";

  if (isActive) {
    if (resolvedVariant === "accent") {
      colorClass = "sa-glass-pill-active !text-[var(--text)] !opacity-100";
      activeIconClass = "text-[var(--accent)]";
    } else if (resolvedVariant === "default") {
      colorClass = "sa-glass-pill-active !text-[var(--text)] !opacity-100";
      activeIconClass = "text-[var(--accent)]";
    } else if (resolvedVariant === "error" || resolvedVariant === "danger") {
      colorClass = "sa-glass-pill-danger !text-[var(--text)] !opacity-100";
      activeIconClass = "text-[var(--danger)]";
    } else if (resolvedVariant === "success") {
      colorClass = "sa-glass-pill-success !text-[var(--text)] !opacity-100";
      activeIconClass = "text-[var(--success)]";
    } else if (resolvedVariant === "warning") {
      colorClass = "sa-glass-pill-warning !text-[var(--text)] !opacity-100";
      activeIconClass = "text-[var(--warning)]";
    }
  } else {
    if (resolvedVariant === "error" || resolvedVariant === "danger") {
      colorClass =
        "border border-transparent text-[var(--danger)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";
    } else if (resolvedVariant === "success") {
      colorClass =
        "border border-transparent text-[var(--success)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";
    } else if (resolvedVariant === "warning") {
      colorClass =
        "border border-transparent text-[var(--warning)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";
    } else if (resolvedVariant === "accent") {
      colorClass =
        "border border-transparent text-[var(--accent)] opacity-80 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";
    }
  }

  if (disabled) {
    colorClass =
      "border border-transparent text-[var(--text)] opacity-30 cursor-not-allowed";
  }

  const tVariant =
    tooltipVariant ||
    (resolvedVariant === "default" || resolvedVariant === "accent" ? "info" : resolvedVariant);

  return (
    <div className={`relative group/btn shrink-0 ${className}`}>
      <button
        onClick={(e) => {
          if (!disabled && onClick) onClick(e);
        }}
        className={`flex items-center justify-center transition-all rounded-xl ${!disabled ? "active:scale-95" : ""} ${label ? "px-4 h-9 gap-2" : "w-9 h-9"} ${colorClass}`}
      >
        <span
          className={`material-symbols-outlined ${label ? "!text-[15px] normal-case" : "!text-[18px]"} ${activeIconClass}`}
        >
          {icon}
        </span>
        {label && (
          <span className="text-[10px] font-bold capitalize tracking-wider">
            {label}
          </span>
        )}
      </button>
      {tooltip && (
        <HoverTooltip
          title={tooltip}
          variant={disabled ? "error" : tVariant}
          align={tooltipAlign}
          vAlign="bottom"
          className="z-[100]"
        />
      )}
    </div>
  );
}
