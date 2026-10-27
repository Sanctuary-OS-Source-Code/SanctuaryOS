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
  let borderColorVar = "--accent";
  let customHoverColor = "";

  switch (variant) {
    case "solid":
      variantClasses =
        "!border-[var(--accent)] !bg-[var(--accent)] !text-[var(--bg)] hover:!bg-[color-mix(in_srgb,var(--accent)_80%,white)] hover:!border-[color-mix(in_srgb,var(--accent)_80%,white)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_40%,transparent)]";
      borderColorVar = "transparent";
      break;
    case "world":
      variantClasses =
        "glass-surface !border-[color-mix(in_srgb,var(--accent)_40%,transparent)] !text-[var(--accent)] hover:!border-[color-mix(in_srgb,var(--accent)_65%,transparent)]";
      borderColorVar = "--accent";
      break;
    case "engine":
      variantClasses =
        "glass-surface !border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)] hover:!border-[color-mix(in_srgb,var(--danger)_65%,transparent)]";
      borderColorVar = "--danger";
      break;
    case "danger":
      variantClasses =
        "glass-surface !border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)] hover:!border-[color-mix(in_srgb,var(--danger)_65%,transparent)]";
      borderColorVar = "--danger";
      break;
    case "success":
      variantClasses =
        "glass-surface !border-[color-mix(in_srgb,var(--success)_40%,transparent)] !text-[var(--success)] hover:!border-[color-mix(in_srgb,var(--success)_65%,transparent)]";
      borderColorVar = "--success";
      break;
    case "warning":
      variantClasses =
        "glass-surface !border-[color-mix(in_srgb,var(--warning)_40%,transparent)] !text-[var(--warning)] hover:!border-[color-mix(in_srgb,var(--warning)_65%,transparent)]";
      borderColorVar = "--warning";
      break;
    case "accent":
    case "primary":
    case "default":
      variantClasses =
        "glass-surface !border-[color-mix(in_srgb,var(--accent)_42%,rgba(255,255,255,0.35))] !text-[var(--text)] hover:!border-[color-mix(in_srgb,var(--accent)_65%,rgba(255,255,255,0.55))] hover:!text-[var(--accent)]";
      borderColorVar = "--accent";
      break;
    case "glass":
      variantClasses =
        "glass-surface !border-[color-mix(in_srgb,var(--text)_14%,transparent)] !text-[var(--text)] hover:!border-[color-mix(in_srgb,var(--text)_28%,transparent)]";
      borderColorVar = "--text";
      break;
  }

  const basePadding = iconOnly
    ? "w-10 h-10 rounded-xl !p-0 shrink-0"
    : "px-6 py-3.5 rounded-xl";

  return (
    <div className={`relative ${iconOnly ? "inline-block" : ""}`}>
      <button
        type={type}
        form={form}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        disabled={disabled}
        className={`${variant === "solid" ? "shadow-md border" : "relative overflow-hidden border"} ${basePadding} text-[11px] font-semibold capitalize tracking-wider transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none group ${variantClasses} ${className}`}
        style={
          !disabled
            ? ({
                "--tw-hover-border-color":
                  customHoverColor ||
                  `color-mix(in srgb, var(${borderColorVar}) 50%, transparent)`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {icon && (
          <span
            className={`material-symbols-outlined ${iconOnly ? "!text-[18px]" : "!text-[16px]"} relative z-10 transition-transform group-hover:-translate-y-0.5`}
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
  "px-8 py-4 rounded-[var(--radius)] theme-panel-accent theme-btn-accent text-xs font-black capitalize tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none hover:shadow-md hover:scale-105 active:scale-95";
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

  if (isActive) {
    if (resolvedVariant === "accent")
      colorClass = "sa-glass-active !text-[var(--accent)] !opacity-100";
    else if (resolvedVariant === "default")
      colorClass = "sa-glass-active !text-[var(--text)] !opacity-100";
    else if (resolvedVariant === "error" || resolvedVariant === "danger")
      colorClass = "sa-glass-active !text-[var(--danger)] !opacity-100";
    else if (resolvedVariant === "success")
      colorClass = "sa-glass-active !text-[var(--success)] !opacity-100";
    else if (resolvedVariant === "warning")
      colorClass = "sa-glass-active !text-[var(--warning)] !opacity-100";
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
          className={`material-symbols-outlined ${label ? "!text-[15px] normal-case" : "!text-[18px]"}`}
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
