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

import { FilterPopover } from "./misc";
export function LoadingScreen({
  title,
  subtitle,
  icon = "sync",
}: {
  title: string;
  subtitle?: string;
  icon?: string;
}) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] max-w-[600px] max-h-[600px] rounded-full blur-[100px] opacity-10 pointer-events-none"
        style={{ backgroundColor: "var(--accent)" }}
      />

      <div className="flex flex-col items-center gap-12 relative z-10 text-center">
        <div className="relative w-24 h-24 flex items-center justify-center">
          {/* Subtle background glow */}
          <div className="absolute inset-0 rounded-full bg-[var(--accent)] opacity-[0.05] blur-xl animate-pulse" />

          {/* Outer track */}
          <div className="absolute inset-0 rounded-full border border-[color-mix(in_srgb,var(--accent)_15%,transparent)]" />

          {/* Smooth spinning gradient ring */}
          <div
            className="absolute inset-0 rounded-full border-[2px] border-transparent border-t-[var(--accent)] border-r-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
            style={{ animation: "spin 1.2s linear infinite" }}
          />

          {/* Icon Box */}
          <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)] relative z-10">
            <span
              className={`material-symbols-outlined !text-[22px] text-[var(--accent)] ${icon === "sync" ? "animate-spin" : ""}`}
            >
              {icon}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-6 opacity-90">
            <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[var(--accent)] opacity-50" />
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-[var(--text)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_50%,transparent)]">
              {title}
            </h2>
            <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[var(--accent)] opacity-50" />
          </div>
          {subtitle && (
            <p className="text-[10px] font-bold text-[var(--subtext)] tracking-[0.2em] uppercase opacity-50">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export function SystemAlertBanner({
  type = "info",
  title,
  message,
  icon,
  action,
  onClose,
  className = "",
}: any) {
  const themeType = type === "info" ? "accent" : type;

  const iconName =
    icon ||
    (type === "danger"
      ? "gpp_bad"
      : type === "warning"
        ? "warning"
        : type === "success"
          ? "check_circle"
          : "info");

  return (
    <div
      className={`w-full theme-panel-${themeType} p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden transition-all duration-300 animate-in fade-in zoom-in-95 group rounded-[var(--radius)] ${className}`}
    >
      <div
        className={`absolute inset-0 z-0 pointer-events-none bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:translate-x-full duration-1000 transition-all ease-in-out`}
      />

      <div className="flex items-center gap-5 z-10 flex-1 min-w-0">
        <div
          className={`w-12 h-12 rounded-full border border-current flex items-center justify-center shrink-0 shadow-md transition-transform group-hover:scale-105 opacity-80 theme-text-${themeType}`}
        >
          <span className="material-symbols-outlined !text-[24px] drop-shadow-md">
            {typeof iconName === "string" ? iconName : iconName}
          </span>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {message && (
            <span
              className={`text-[9px] capitalize font-bold tracking-widest leading-tight truncate opacity-80 theme-text-${themeType}`}
            >
              {message}
            </span>
          )}
          <h3
            className={`text-base font-black capitalize tracking-widest leading-tight truncate theme-text-${themeType}`}
          >
            {title}
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-3 z-10 shrink-0">
        {action}
        {onClose && (
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-full border border-current flex items-center justify-center transition-colors opacity-50 hover:opacity-100 ml-2 hover:bg-white/10 theme-text-${themeType}`}
          >
            <span className="material-symbols-outlined !text-[16px]">
              close
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
export function HoverTooltip({
  title,
  subtitle,
  variant = "default",
  className = "",
  noIcon = false,
  icon,
  normalFont = false,
  align: explicitAlign,
  vAlign: explicitVAlign,
  content,
  delay = 300,
}: any) {
  const { setTooltip, clearTooltip } = useTooltipStore();
  const ref = React.useRef<HTMLDivElement>(null);
  const propsRef = React.useRef({
    title,
    subtitle,
    variant,
    className,
    noIcon,
    icon,
    normalFont,
    explicitAlign,
    explicitVAlign,
    content,
  });
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Keep ref in sync and update store if currently hovered and already shown
  React.useEffect(() => {
    propsRef.current = {
      title,
      subtitle,
      variant,
      className,
      noIcon,
      icon,
      normalFont,
      explicitAlign,
      explicitVAlign,
      content,
    };
    const parent = ref.current?.parentElement;
    if (parent && parent.matches(":hover") && !timerRef.current) {
      const p = propsRef.current;
      const rect = parent.getBoundingClientRect();
      let x = rect.left + rect.width / 2;
      let y = rect.top - 8;
      let align: "center" | "left" | "right" = p.explicitAlign || "center";
      let vAlign: "top" | "bottom" = p.explicitVAlign || "top";

      if (!p.explicitAlign) {
        if (
          p.className.includes("!right-0") ||
          p.className.includes("right-0")
        ) {
          align = "right";
        } else if (
          p.className.includes("!left-0") ||
          p.className.includes("left-0")
        ) {
          align = "left";
        }
      }

      if (!p.explicitVAlign) {
        if (p.className.includes("bottom-[calc(100%")) {
          vAlign = "top";
        } else if (p.className.includes("top-[calc(100%")) {
          vAlign = "bottom";
        }
      }

      // Calculate base x and y based on final align/vAlign
      if (align === "left") {
        x = rect.left;
      } else if (align === "right") {
        x = rect.right;
      }

      if (vAlign === "bottom") {
        y = rect.bottom + 8;
      } else {
        y = rect.top - 8;
      }

      setTooltip({ ...p, x, y, align, vAlign });
    }
  }, [
    title,
    subtitle,
    variant,
    className,
    noIcon,
    icon,
    normalFont,
    explicitAlign,
    explicitVAlign,
    content,
    setTooltip,
  ]);

  // Bind DOM events exactly once
  React.useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;

    const showTooltip = () => {
      const p = propsRef.current;
      const rect = parent.getBoundingClientRect();
      let x = rect.left + rect.width / 2;
      let y = rect.top - 8;
      let align: "center" | "left" | "right" = p.explicitAlign || "center";
      let vAlign: "top" | "bottom" = p.explicitVAlign || "top";

      if (!p.explicitAlign) {
        if (
          p.className.includes("!right-0") ||
          p.className.includes("right-0")
        ) {
          align = "right";
        } else if (
          p.className.includes("!left-0") ||
          p.className.includes("left-0")
        ) {
          align = "left";
        }
      }

      if (!p.explicitVAlign) {
        if (p.className.includes("bottom-[calc(100%")) {
          vAlign = "top";
        } else if (p.className.includes("top-[calc(100%")) {
          vAlign = "bottom";
        }
      }

      // Calculate base x and y based on final align/vAlign
      if (align === "left") {
        x = rect.left;
      } else if (align === "right") {
        x = rect.right;
      }

      if (vAlign === "bottom") {
        y = rect.bottom + 8;
      } else {
        y = rect.top - 8;
      }

      setTooltip({ ...p, x, y, align, vAlign });
      timerRef.current = null;
    };

    const handleMouseEnter = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const isTooltipActive = useTooltipStore.getState().tooltip !== null;
      timerRef.current = setTimeout(showTooltip, isTooltipActive ? 0 : delay);
    };

    const handleMouseLeave = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      clearTooltip();
    };

    parent.addEventListener("mouseenter", handleMouseEnter);
    parent.addEventListener("mouseleave", handleMouseLeave);

    if (parent.matches(":hover")) {
      handleMouseEnter();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      parent.removeEventListener("mouseenter", handleMouseEnter);
      parent.removeEventListener("mouseleave", handleMouseLeave);
      clearTooltip();
    };
  }, [setTooltip, clearTooltip, delay]);

  return <div ref={ref} className="hidden" />;
}
export function ActionPill({
  searchQuery,
  setSearchQuery,
  searchPlaceholder,
  primaryPopover,
  actions,
  hideSearch = false,
  leftContent,
  rightContent,
  className = "",
  isLoading,
}: ActionPillProps) {
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);

  const hasSearch = !hideSearch && !!setSearchQuery;
  const hasActions = (actions && actions.length > 0) || !!primaryPopover || !!rightContent;
  const hasContent = !!leftContent || hasSearch || hasActions;

  if (!hasContent) return null;

  return (
    <div
      className={`flex items-center w-[fit-content] md:max-w-md lg:max-w-lg h-13 glass-panel rounded-full shadow-lg divide-x divide-[color-mix(in_srgb,var(--text)_6%,transparent)] animate-in slide-in-from-top-4 duration-500 relative z-20 max-w-full overflow-hidden transition-all ${className} ${!hasSearch && !leftContent ? 'md:max-w-[fit-content]' : 'w-full'}`}
    >
      {/* Integrated Search or Left Content */}
      {leftContent ? (
        <div className="relative flex items-center flex-1 transition-all duration-300 h-full px-4">
          {leftContent}
        </div>
      ) : hasSearch ? (
        <div className="relative flex items-center group flex-1 min-w-[60px] transition-all duration-300">
          <span
            className={`material-symbols-outlined !text-[20px] transition-colors shrink-0 ml-4 ${isSearchFocused ? "text-[var(--accent)]" : "text-[var(--subtext)]"}`}
          >
            {isLoading ? "hourglass_empty" : "search"}
          </span>
          <input
            value={searchQuery || ""}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder={searchPlaceholder || "Search..."}
            className="bg-transparent border-none outline-none text-[13px] font-medium text-[var(--text)] w-full transition-all duration-300 px-3 placeholder:text-[var(--subtext)]/50 h-13 min-w-0"
          />
        </div>
      ) : (
        <div className="flex-1 hidden" />
      )}

      {/* Action Buttons Container (Collapses on search focus for mobile) */}
      <div
        className={`flex items-center h-full divide-x divide-[color-mix(in_srgb,var(--text)_6%,transparent)] shrink-0 transition-all duration-500 ease-in-out overflow-hidden sm:!max-w-[1000px] sm:!opacity-100 ${isSearchFocused ? "max-w-0 opacity-0 border-transparent" : "max-w-[500px] opacity-100"}`}
      >
        {/* Primary Popover (e.g., Filters) */}
        {primaryPopover && (
          <FilterPopover
            icon={primaryPopover.icon}
            label={primaryPopover.label}
            className="shrink-0 h-full"
            buttonClassName="!h-13 px-4 sm:px-5 !rounded-none !bg-transparent hover:!bg-[color-mix(in_srgb,var(--text)_5%,transparent)] !border-none !shadow-none transition-colors text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center gap-2 font-semibold shrink-0 !w-auto"
          >
            {primaryPopover.content}
          </FilterPopover>
        )}

        {/* DESKTOP Action Icons */}
        {actions && actions.length > 0 && (
          <div className="hidden sm:flex items-center h-full divide-x divide-[color-mix(in_srgb,var(--text)_6%,transparent)] shrink-0">
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={action.onClick}
                className={`h-13 px-4 flex items-center justify-center gap-2 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors text-[var(--subtext)] hover:text-[var(--text)] group relative ${action.activeClassName || ""}`}
              >
                <span className="material-symbols-outlined !text-[20px]">
                  {action.icon}
                </span>
                <HoverTooltip title={action.label} />
              </button>
            ))}
          </div>
        )}

        {/* Custom Right Content */}
        {rightContent && (
          <div className="hidden sm:flex items-center h-full shrink-0">
            {rightContent}
          </div>
        )}

        {/* MOBILE "More" Menu */}
        {actions && actions.length > 0 && (
          <div className="flex sm:hidden h-full shrink-0 items-center justify-center border-l border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
            <FilterPopover
              icon="more_vert"
              className="shrink-0 h-full"
              buttonClassName="!h-13 w-12 !rounded-none !bg-transparent hover:!bg-[color-mix(in_srgb,var(--text)_5%,transparent)] !border-none !shadow-none transition-colors text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center shrink-0"
            >
              <div className="flex flex-col p-2 min-w-[200px] gap-1">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    onClick={action.onClick}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-left transition-colors group ${action.activeClassName?.includes("bg-") ? action.activeClassName : ""}`}
                  >
                    <span className="shrink-0 group-hover:text-[var(--text)] transition-colors">
                      {action.icon}
                    </span>
                    <span
                      className={`text-[12px] font-bold ${action.activeClassName?.includes("text-[var(--success)]") ? "text-[var(--success)]" : "text-[var(--text)]"}`}
                    >
                      {action.label}
                    </span>
                  </button>
                ))}
              </div>
            </FilterPopover>
          </div>
        )}
      </div>
    </div>
  );
}
export interface ActionPillProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  searchPlaceholder?: string;
  primaryPopover?: {
    icon: string;
    label: string;
    content: React.ReactNode;
  };
  actions?: {
    id: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    activeClassName?: string;
  }[];
  hideSearch?: boolean;
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

