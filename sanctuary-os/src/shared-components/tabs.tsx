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

import { ActionButton, SidebarFooterButton } from "./buttons";
import { MobileSegmentedControl } from "./layout";
export function HubTabs({ tabs, activeTab, setTab, className = "" }: any) {
  return (
    <FilterTabs className={className}>
      {tabs.map((tab: any) => (
        <FilterTabButton
          key={tab.id}
          {...tab}
          activeTab={activeTab}
          setTab={setTab}
        />
      ))}
    </FilterTabs>
  );
}
export function HubTabButton({ id, icon, label, activeTab, setTab }: any) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`h-full px-4 py-3 flex-1 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap ${
        isActive
          ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]"
          : "text-[var(--subtext)] hover:bg-white/5 hover:text-[var(--text)] opacity-60 hover:opacity-100"
      }`}
    >
      {icon && (
        <span className="material-symbols-outlined !text-lg">{icon}</span>
      )}
      {label}
    </button>
  );
}
export function FilterTabs({
  children,
  className = "",
  icon = "tune",
  label,
  buttonClassName = "",
}: any) {
  const childrenArray = React.Children.toArray(children);
  if (childrenArray.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {childrenArray.map((child: any) => {
        const isActive = child.props.activeTab === child.props.id;
        let cIcon = child.props.icon;

        if (!cIcon) {
          const cId = String(child.props.id).toLowerCase();
          if (cId.includes("pending") || cId.includes("review"))
            cIcon = "schedule";
          else if (
            cId.includes("live") ||
            cId.includes("active") ||
            cId.includes("published")
          )
            cIcon = "public";
          else if (cId.includes("archive")) cIcon = "archive";
          else if (
            cId.includes("reject") ||
            cId.includes("corrupt") ||
            cId.includes("error")
          )
            cIcon = "block";
          else if (cId.includes("all")) cIcon = "all_inclusive";
          else if (cId.includes("draft")) cIcon = "edit_document";
          else cIcon = "filter_list";
        }

        return (
          <ActionButton
            key={child.props.id}
            icon={cIcon}
            label={child.props.label || child.props.children || child.props.id}
            iconOnly={true}
            variant={isActive ? "accent" : "glass"}
            onClick={() =>
              child.props.setTab && child.props.setTab(child.props.id)
            }
            className={buttonClassName}
          />
        );
      })}
    </div>
  );
}
export function FilterTabButton({
  id,
  icon,
  label,
  activeTab,
  setTab,
  className = "",
  children,
}: any) {
  return <></>;
}
export function PillTabs({
  children,
  className = "",
  buttonClassName = "",
  variant = "default",
}: any) {
  const childrenArray = React.Children.toArray(children).filter(
    React.isValidElement,
  );
  if (childrenArray.length === 0) return null;

  const [highlightStyle, setHighlightStyle] = React.useState({
    left: 4,
    width: 0,
    opacity: 0,
  });
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Need a small timeout to allow layout to settle before calculating widths
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const activeIndex = childrenArray.findIndex(
        (c: any) => c.props.activeTab === c.props.id,
      );
      if (activeIndex >= 0) {
        const btns = containerRef.current.querySelectorAll("button");
        const activeBtn = btns[activeIndex];
        if (activeBtn) {
          setHighlightStyle({
            left: activeBtn.offsetLeft,
            width: activeBtn.offsetWidth,
            opacity: 1,
          });
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [childrenArray.map((c: any) => c.props.activeTab).join(",")]);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center gap-1 ${variant === "flat" ? "" : "p-1 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner rounded-full"} w-fit shrink-0 ${className}`}
    >
      {/* Sliding Highlight */}
      <div
        className={`absolute ${variant === "flat" ? "top-0 bottom-0" : "top-1 bottom-1"} rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none`}
        style={{
          left: highlightStyle.left,
          width: highlightStyle.width,
          opacity: highlightStyle.opacity,
        }}
      />

      {childrenArray.map((child: any) => {
        const isActive = child.props.activeTab === child.props.id;
        let cIcon = child.props.icon;

        if (cIcon === undefined && typeof child.props.id === "string") {
          const cId = child.props.id.toLowerCase();
          if (cId.includes("pending") || cId.includes("review"))
            cIcon = "schedule";
          else if (
            cId.includes("live") ||
            cId.includes("active") ||
            cId.includes("published")
          )
            cIcon = "public";
          else if (cId.includes("archive")) cIcon = "archive";
          else if (
            cId.includes("reject") ||
            cId.includes("corrupt") ||
            cId.includes("error")
          )
            cIcon = "block";
          else if (cId.includes("all")) cIcon = "all_inclusive";
          else if (cId.includes("draft")) cIcon = "edit_document";
        }

        return (
          <button
            key={child.props.id}
            onClick={() =>
              child.props.setTab && child.props.setTab(child.props.id)
            }
            className={`relative z-10 h-8 px-4 flex items-center justify-center gap-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
              isActive
                ? "text-[var(--accent)] drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]"
                : "text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
            } ${buttonClassName} ${child.props.className || ""}`}
          >
            {cIcon && (
              <span className="material-symbols-outlined !text-[14px] transition-transform duration-300 group-hover:scale-110">
                {cIcon}
              </span>
            )}
            <span className="leading-none pt-0.5 whitespace-nowrap">
              {child.props.label ||
                child.props.children ||
                String(child.props.id)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
export function PillTabButton({
  id,
  icon,
  label,
  activeTab,
  setTab,
  className = "",
  children,
}: any) {
  return <></>;
}
export function VerticalTabButton({
  id,
  icon,
  label,
  activeTab,
  setTab,
  badge,
  badgeColorClass,
}: any) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group
        ${
          isActive
            ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] backdrop-blur-md border border-transparent"
            : "text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--accent)] border-transparent"
        }`}
    >
      {/* Sweep Micro-Animation on Hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />

      {icon && (
        <span
          className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 relative z-10 ${isActive ? "scale-110" : "group-hover:scale-110"}`}
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
      {badge !== undefined && badge !== null && (
        <span
          className={`ml-2 px-2 py-0.5 rounded-[calc(var(--radius)-6px)] border text-[10px] font-black shrink-0 relative z-10 ${badgeColorClass ? badgeColorClass : isActive ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)]" : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)]"}`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
export function HoverTabDrawer({
  title = "Navigation",
  tabs,
  activeTab,
  setTab,
  children,
  footer,
  position = "right",
  className = "",
  panelClassName = "",
  panelStyle = {},
  onHoverChange,
  hideMobilePills,
}: any) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isLeft = position === "left";
  const extractedTabs: any[] = [];
  React.Children.forEach(children, (child: any) => {
    if (
      React.isValidElement(child) &&
      (child as React.ReactElement<any>).props &&
      (child as React.ReactElement<any>).props.id
    ) {
      const props = (child as React.ReactElement<any>).props;
      extractedTabs.push({
        id: props.id,
        label: props.label || props.id,
        icon: props.icon,
        setTab: props.setTab,
      });
    }
  });

  return (
    <>
      {/* Mobile Segmented Control */}
      {!hideMobilePills && extractedTabs.length > 0 && (
        <MobileSegmentedControl
          tabs={extractedTabs}
          activeTab={activeTab}
          setTab={setTab}
          className="mb-6 -mt-2 animate-in fade-in slide-in-from-top-2 duration-500"
        />
      )}

      {/* Desktop Hover Drawer */}
      <div
        className={`fixed ${isLeft ? "left-0" : "right-0"} top-[72px] bottom-[24px] z-[9999] group hidden md:flex ${isLeft ? "justify-start" : "justify-end"} w-[284px] pointer-events-none ${className}`}
        onMouseEnter={() => onHoverChange && onHoverChange(true)}
        onMouseLeave={() => onHoverChange && onHoverChange(false)}
      >
        {/* Invisible Trigger Area */}
        <div
          className={`absolute ${isLeft ? "left-0" : "right-0"} top-0 bottom-0 w-6 pointer-events-auto`}
        />

        {/* Invisible Expanded Area Catcher */}
        <div className="absolute inset-0 pointer-events-none group-hover:pointer-events-auto" />

        {/* Sliding Panel */}
        <div
          className={`h-full w-[260px] ${isLeft ? "ml-6 rounded-3xl -translate-x-[calc(100%+40px)]" : "mr-6 rounded-3xl translate-x-[calc(100%+40px)]"} shrink-0 group-hover:translate-x-0 transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1)] transform-gpu will-change-transform backface-hidden flex flex-col items-start pt-6 relative pointer-events-auto border border-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[var(--glassBlur,24px)] ${panelClassName}`}
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, var(--text) 2%, transparent) 0%, transparent 100%), color-mix(in srgb, var(--sidebar) calc(var(--glassOpacityDecimal, 0.8) * 100%), transparent)`,
            ...panelStyle,
          }}
        >
          <div className="w-full px-6 mb-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100 shrink-0">
            <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">
              {isLeft ? "folder_open" : "swipe_left"}
            </span>
            <div className="font-black text-[10px] tracking-widest text-[var(--subtext)] capitalize">
              {title}
            </div>
          </div>

          <div
            className={`flex flex-col w-full gap-2 px-3 overflow-y-auto accent-scrollbar pb-6 flex-1 opacity-0 md:group-hover:opacity-100 ${mobileOpen ? "!opacity-100" : ""} transition-opacity duration-500 delay-100`}
          >
            {tabs &&
              tabs.map((tab: any) => (
                <VerticalTabButton
                  key={tab.id}
                  {...tab}
                  activeTab={activeTab}
                  setTab={setTab}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            {React.Children.map(children, (child) => {
              if (
                React.isValidElement<any>(child) &&
                (child.type === VerticalTabButton ||
                  child.type === SidebarFooterButton)
              ) {
                return React.cloneElement(child, {
                  ...child.props,
                  onClick: (e: any) => {
                    if (child.props.onClick) child.props.onClick(e);
                    if (child.type === VerticalTabButton) {
                      setMobileOpen(false);
                    }
                  },
                } as any);
              }
              return child;
            })}
          </div>

          {footer && (
            <div
              className={`w-full px-3 pb-4 mt-auto opacity-0 md:group-hover:opacity-100 ${mobileOpen ? "!opacity-100" : ""} transition-opacity duration-500 delay-100 shrink-0 flex flex-col gap-1`}
            >
              <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent mb-2" />
              {React.Children.map(footer.props?.children || footer, (child) => {
                if (React.isValidElement<any>(child)) {
                  return React.cloneElement(child, {
                    ...child.props,
                    onClick: (e: any) => {
                      if (child.props.onClick) child.props.onClick(e);
                      setMobileOpen(false);
                    },
                  } as any);
                }
                return child;
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
export function ViewToggle({
  options,
  activeTab,
  setTab,
  className = "",
}: any) {
  return (
    <div
      className={`flex items-center gap-1 p-1 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner rounded-full w-fit ${className}`}
    >
      {options.map((opt: any) => {
        const isActive = activeTab === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setTab(opt.id)}
            className={`h-7 px-4 flex items-center justify-center gap-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
              isActive
                ? "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--text)] shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
                : "border border-transparent text-[var(--subtext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
            }`}
          >
            {opt.icon && (
              <span className="material-symbols-outlined !text-[14px]">
                {opt.icon}
              </span>
            )}
            <span className="leading-none pt-0.5">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
export function CycleSwitcher({
  options,
  activeId,
  onChange,
  className = "",
}: any) {
  const currentIndex = options.findIndex((o: any) => o.id === activeId);
  const activeOpt = options[currentIndex] || options[0];

  const handlePrev = () => {
    const nextIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
    onChange(options[nextIndex].id);
  };

  const handleNext = () => {
    const nextIndex = currentIndex >= options.length - 1 ? 0 : currentIndex + 1;
    onChange(options[nextIndex].id);
  };

  return (
    <div
      className={`flex items-center justify-between px-2 h-8 rounded-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] min-w-[130px] shrink-0 overflow-hidden relative ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
      <button
        onClick={handlePrev}
        className="text-[var(--accent)] hover:text-[var(--text)] hover:scale-110 hover:drop-shadow-[0_0_10px_var(--accent)] transition-all flex items-center justify-center p-1 z-10 shrink-0"
      >
        <span className="material-symbols-outlined !text-[18px]">
          chevron_left
        </span>
      </button>
      <span className="text-[10px] font-black tracking-[0.2em] uppercase text-[var(--accent)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_80%,transparent)] z-10 flex-1 text-center truncate pt-0.5">
        {activeOpt?.label}
      </span>
      <button
        onClick={handleNext}
        className="text-[var(--accent)] hover:text-[var(--text)] hover:scale-110 hover:drop-shadow-[0_0_10px_var(--accent)] transition-all flex items-center justify-center p-1 z-10 shrink-0"
      >
        <span className="material-symbols-outlined !text-[18px]">
          chevron_right
        </span>
      </button>
    </div>
  );
}
export function RadioCardGroup({ children, className = "" }: any) {
  return (
    <div
      className={`grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4 w-full ${className}`}
    >
      {children}
    </div>
  );
}
export function RadioCard({
  id,
  icon,
  label,
  description,
  activeValue,
  onChange,
  className = "",
}: any) {
  const isActive = activeValue === id;
  return (
    <button
      type="button"
      onClick={() => onChange(id)}
      className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border transition-all duration-300 ${
        isActive
          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[var(--accent)] text-[var(--accent)] shadow-lg scale-[1.02] z-10"
          : "glass-panel bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
      } ${className}`}
    >
      {icon && (
        <span
          className={`material-symbols-outlined !text-3xl mb-1 ${isActive ? "scale-110 drop-shadow-[0_0_10px_currentColor]" : "opacity-70"} transition-all duration-500`}
        >
          {icon}
        </span>
      )}
      <span className="text-[11px] font-black uppercase tracking-widest leading-none text-center pt-1">
        {label}
      </span>
      {description && (
        <span className="text-[9px] font-bold text-center opacity-60 mt-1 leading-relaxed">
          {description}
        </span>
      )}
    </button>
  );
}

