import { useStore } from '../store';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useModalStore } from '../store/modalStore';
import { useTooltipStore } from '../store/tooltipStore';
import { supabase } from '../supabase';
import { UniversalCard } from '../components/universal/UniversalCard';

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
        "!border-[color-mix(in_srgb,var(--accent)_30%,transparent)] !bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] !text-indigo-500 hover:!border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]";
      customHoverColor = "rgba(99, 102, 241, 0.5)";
      break;
    case "engine":
      variantClasses =
        "!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] !text-rose-500 hover:!border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:shadow-[0_0_20px_rgba(244,63,94,0.2)]";
      customHoverColor = "rgba(244, 63, 94, 0.5)";
      break;
    case "danger":
      variantClasses =
        "!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] !text-[var(--danger)] hover:!border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_20%,transparent)]";
      borderColorVar = "--danger";
      break;
    case "success":
      variantClasses =
        "!border-[color-mix(in_srgb,var(--success)_30%,transparent)] !bg-[color-mix(in_srgb,var(--success)_5%,transparent)] !text-[var(--success)] hover:!border-[color-mix(in_srgb,var(--success)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--success)_20%,transparent)]";
      borderColorVar = "--success";
      break;
    case "warning":
      variantClasses =
        "!border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] !text-[var(--warning)] hover:!border-[color-mix(in_srgb,var(--warning)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_20%,transparent)]";
      borderColorVar = "--warning";
      break;
    case "accent":
    case "primary":
    case "default":
      variantClasses =
        "!border-[color-mix(in_srgb,var(--accent)_30%,transparent)] !bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] !text-[var(--accent)] hover:!border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:!bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]";
      borderColorVar = "--accent";
      break;
    case "glass":
      variantClasses =
        "!border-[color-mix(in_srgb,var(--text)_15%,transparent)] !bg-[color-mix(in_srgb,var(--text)_5%,transparent)] !text-[var(--text)] hover:!border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:!bg-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--text)_10%,transparent)]";
      borderColorVar = "--text";
      break;
  }

  const basePadding = iconOnly
    ? "w-10 h-10 rounded-full !p-0 shrink-0"
    : "px-8 py-4 rounded-[var(--radius)]";

  return (
    <div className={`relative ${iconOnly ? "inline-block" : ""}`}>
      <button
        type={type}
        form={form}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        disabled={disabled}
        className={`${variant === "solid" ? "shadow-md border" : "relative overflow-hidden shadow-lg border hover:shadow-xl"} ${basePadding} text-[10px] font-black capitalize tracking-[0.2em] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none group ${variantClasses} ${className}`}
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
        {variant !== "solid" && (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,white_5%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none"
              style={{ backgroundColor: `var(${borderColorVar})` }}
            />
          </>
        )}
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
export const standardButtonClass =
  "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-black capitalize tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardGlassButtonClass =
  "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-xs font-black capitalize tracking-[0.2em] transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none";
export const standardPrimaryButtonClass =
  "px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black capitalize tracking-[0.2em] transition-all hover:theme-bg-accent/20 hover:theme-text-accent hover:theme-border-accent hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.4)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none group";
export const standardSuccessButtonClass =
  "px-8 py-4 rounded-[var(--radius)] theme-panel-success theme-btn-success text-xs font-black capitalize tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none hover:shadow-md hover:scale-105 active:scale-95";
export const standardDangerButtonClass =
  "px-8 py-4 rounded-[var(--radius)] theme-panel-danger theme-btn-danger text-xs font-black capitalize tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none hover:shadow-md hover:scale-105 active:scale-95";
export const standardAccentGlassButtonClass =
  "px-8 py-4 rounded-[var(--radius)] theme-panel-accent theme-btn-accent text-xs font-black capitalize tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:pointer-events-none hover:shadow-md hover:scale-105 active:scale-95";
export function SidebarActionButton({
  id,
  icon,
  label,
  subtext,
  active,
  onClick,
  danger,
  success,
  customColorClass,
  className,
  iconClassName,
}: any) {
  const { t } = useLexicon();
  return (
    <button
      onClick={() => onClick(id)}
      className={`glass-surface w-full px-5 py-4 h-auto min-h-[64px] flex items-center justify-start gap-4 rounded-[var(--radius)] font-black text-[10px] capitalize tracking-widest transition-all duration-300 group ${
        customColorClass
          ? customColorClass
          : active
            ? "!border-[var(--accent)] !text-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] scale-[1.02]"
            : danger
              ? "text-[var(--danger)] hover:!border-[var(--danger)]"
              : success
                ? "text-[var(--success)] hover:!border-[var(--success)]"
                : "text-[var(--text)] hover:!border-[var(--text)] hover:text-[var(--accent)]"
      } ${className || ""}`}
      style={
        active || danger || success
          ? ({
              "--panelTint": active
                ? "var(--accent)"
                : danger
                  ? "var(--danger)"
                  : "var(--success)",
            } as React.CSSProperties)
          : undefined
      }
    >
      {icon && (
        <span
          className={`material-symbols-outlined !text-[20px] shrink-0 relative z-10 transition-transform duration-300 group-hover:scale-110 ${active ? "opacity-100 drop-shadow-md" : "opacity-80"} ${iconClassName || ""}`}
        >
          {icon}
        </span>
      )}
      <div className="flex flex-col items-start gap-1 relative z-10 w-full pr-6 overflow-hidden">
        <span className="tracking-[0.15em] truncate w-full text-left pt-0.5">
          {label}
        </span>
        {subtext && (
          <span className="text-[8px] font-bold opacity-60 normal-case tracking-normal whitespace-normal text-left leading-tight mt-0.5 w-full">
            {subtext}
          </span>
        )}
      </div>

      <span
        className={`material-symbols-outlined !text-[16px] shrink-0 absolute right-5 opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 ${active ? "opacity-100 translate-x-0" : ""}`}
      >
        {t("icon_chevron_right")}
      </span>
    </button>
  );
}
export function HubActionButton({
  icon,
  label,
  onClick,
  className = "",
  isDanger = false,
  isWarning = false,
}: any) {
  return (
    <button
      onClick={onClick}
      className={`glass-surface h-10 px-5 !rounded-full transition-all duration-300 flex items-center justify-center gap-2 shrink-0 font-black capitalize tracking-widest group ${
        isDanger
          ? "!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-red-500 hover:text-red-400"
          : isWarning
            ? "!border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-amber-500 hover:text-amber-400"
            : "text-[var(--text)] hover:text-[var(--accent)] hover:!border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
      } ${className}`}
      style={
        isDanger || isWarning
          ? ({
              "--panelTint": isDanger ? "var(--danger)" : "var(--warning)",
            } as React.CSSProperties)
          : undefined
      }
    >
      <span
        className={`material-symbols-outlined !text-[18px] transition-transform ${isDanger ? "animate-bounce" : "opacity-70 group-hover:opacity-100 group-hover:scale-110"}`}
      >
        {icon}
      </span>
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
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
  isActive = false,
  tooltipAlign = "center",
  tooltipVariant,
  className = "",
}: any) {
  let colorClass =
    "border border-transparent text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";

  if (isActive) {
    if (variant === "accent" || variant === "default")
      colorClass =
        "!text-[var(--accent)] !opacity-100 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[inset_0_0_10px_color-mix(in_srgb,var(--accent)_10%,transparent)]";
    else if (variant === "error" || variant === "danger")
      colorClass =
        "!text-[var(--danger)] !opacity-100 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[inset_0_0_10px_color-mix(in_srgb,var(--danger)_10%,transparent)]";
    else if (variant === "success")
      colorClass =
        "!text-[var(--success)] !opacity-100 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_20%,transparent)] shadow-[inset_0_0_10px_color-mix(in_srgb,var(--success)_10%,transparent)]";
  } else {
    if (variant === "error" || variant === "danger") {
      colorClass =
        "border border-transparent text-[var(--danger)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]";
    } else if (variant === "success") {
      colorClass =
        "border border-transparent text-[var(--success)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]";
    } else if (variant === "warning") {
      colorClass =
        "border border-transparent text-[var(--warning)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]";
    }
  }

  if (disabled) {
    colorClass =
      "border border-transparent text-[var(--text)] opacity-30 cursor-not-allowed";
  }

  const tVariant =
    tooltipVariant ||
    (variant === "default" || variant === "accent" ? "info" : variant);

  return (
    <div className={`relative group/btn shrink-0 ${className}`}>
      <button
        onClick={(e) => {
          if (!disabled && onClick) onClick(e);
        }}
        className={`flex items-center justify-center transition-all rounded-full ${!disabled ? "active:scale-95" : ""} ${label ? "px-4 h-9 gap-2" : "w-9 h-9"} ${colorClass}`}
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

