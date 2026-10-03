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

import { SidePanelContext } from "./layout";
export const handleOpenUrl = (url: string) => {
  const { useInternalBrowser, setSideBrowserUrl, setIsSideBrowserOpen } =
    useModalStore.getState();
  if (useInternalBrowser) {
    setSideBrowserUrl(url);
    setIsSideBrowserOpen(true);
  } else {
    openUrl(url);
  }
};
export const fetchAllPaginated = async (queryFn: () => any) => {
  let allData: any[] = [];
  let from = 0;
  const step = 999;
  while (true) {
    const { data, error } = await queryFn().range(from, from + step);
    if (error || !data || data.length === 0) break;
    allData = [...allData, ...data];
    if (data.length <= step) break;
    from += step + 1;
  }
  return { data: allData, error: null };
};
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}
export function FilterPopover({
  className = "",
  buttonClassName = "",
  icon = "tune",
  label,
  options,
  multiSelect,
  children,
  activeTab,
  setTab,
  defaultTab,
  variant = "default",
}: any) {
  const isInsideSidePanel = React.useContext(SidePanelContext);
  const effectiveVariant =
    variant === "panel" ? "panel" : isInsideSidePanel ? "panel" : variant;

  const [isOpen, setIsOpen] = useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const isMobile = useIsMobile();

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        let leftPos = rect.left;

        if (popoverRef.current) {
          const popWidth = popoverRef.current.offsetWidth;
          leftPos =
            rect.left >= window.innerWidth / 2
              ? rect.right - popWidth
              : rect.left;
          leftPos = Math.max(
            8,
            Math.min(leftPos, window.innerWidth - popWidth - 8),
          );
        } else {
          // Fallback before render
          leftPos =
            rect.left >= window.innerWidth / 2 ? rect.right - 200 : rect.left;
          leftPos = Math.max(8, Math.min(leftPos, window.innerWidth - 200 - 8));

          // Re-trigger layout effect after popup paints
          requestAnimationFrame(() => {
            updatePosition();
          });
        }

        setCoords({
          top: rect.bottom + 8,
          left: leftPos,
        });
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const isOptionActive = (id: string) => {
    if (multiSelect) {
      return Array.isArray(activeTab)
        ? activeTab.includes(id)
        : activeTab === id;
    }
    return activeTab === id;
  };

  const effectiveDefaultTab =
    defaultTab !== undefined
      ? defaultTab
      : options && options.length > 0
        ? options[0].id
        : undefined;

  const hasActiveFilter =
    activeTab === "active" ||
    (multiSelect
      ? Array.isArray(activeTab) && activeTab.length > 0
      : activeTab !== undefined &&
        activeTab !== null &&
        String(activeTab).toLowerCase() !== "all" &&
        String(activeTab).toLowerCase() !== "any" &&
        activeTab !== effectiveDefaultTab);

  const baseBg =
    effectiveVariant === "panel"
      ? "bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
      : "glass-surface";
  const hoverBg =
    effectiveVariant === "panel"
      ? "hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
      : "";
  const borderClass =
    effectiveVariant === "panel"
      ? "border border-transparent text-[var(--text)] opacity-70 hover:opacity-100"
      : "border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-70 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]";

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center gap-0 h-12 ${label ? "px-5" : "w-12"} rounded-[var(--radius)] transition-all duration-300 ${baseBg} ${hoverBg} ${
          isOpen || hasActiveFilter
            ? "border !border-[var(--accent)] text-[var(--accent)] shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]"
            : borderClass
        } ${buttonClassName}`}
      >
        <span className="material-symbols-outlined !text-[20px]">{icon}</span>
        {label && (
          <span className="text-[10px] font-black uppercase tracking-widest leading-none pt-0.5">
            {label}
          </span>
        )}
      </button>

      {isOpen &&
        (() => {
          const portalRoot = document.getElementById("sa-portals");
          if (!portalRoot) return null;

          return createPortal(
            <>
              <div
                className="!fixed inset-0 pointer-events-auto"
                style={{ zIndex: 200000 }}
                onClick={() => setIsOpen(false)}
              />
              <div
                ref={popoverRef}
                className={`!fixed backdrop-blur-[24px] backdrop-saturate-[140%] border ${effectiveVariant === "panel" ? "border-[color-mix(in_srgb,var(--text)_10%,transparent)]" : "border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"} shadow-[0_30px_60px_rgba(0,0,0,0.6),0_0_40px_rgba(var(--accent-rgb),0.15)] pointer-events-auto animate-in fade-in zoom-in-95 duration-200 flex flex-col
                  min-w-[200px] p-2 gap-1 !rounded-xl w-max max-w-[calc(100vw-32px)] max-h-[80vh] overflow-y-auto custom-scrollbar`}
                style={{
                  zIndex: 200001,
                  top: coords.top,
                  left: coords.left,
                  margin: 0,
                  bottom: "auto",
                  transition: "none",
                  background:
                    "linear-gradient(135deg, rgb(var(--panelTint-rgb-spaces, 255 255 255) / 0.15) 0%, rgb(var(--panelTint-rgb-spaces, 255 255 255) / 0.02) 100%)",
                }}
              >
                {children
                  ? children
                  : options?.map((opt: any) => {
                      const active = isOptionActive(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => {
                            if (multiSelect) {
                              const current = Array.isArray(activeTab)
                                ? activeTab
                                : activeTab
                                  ? [activeTab]
                                  : [];
                              const newVals = current.includes(opt.id)
                                ? current.filter((v: any) => v !== opt.id)
                                : [...current, opt.id];
                              setTab(newVals);
                            } else {
                              setTab(opt.id);
                              setIsOpen(false);
                            }
                          }}
                          className={`flex items-center justify-center gap-3 w-full px-4 py-3 rounded-lg transition-all duration-300 group relative overflow-hidden ${
                            active
                              ? "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] shadow-[inset_0_0_15px_rgba(0,0,0,0.1)]"
                              : "text-[var(--text)] opacity-80 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                          }`}
                        >
                          {multiSelect && (
                            <div
                              className={`absolute left-4 w-4 h-4 rounded-[4px] border-[1.5px] flex items-center justify-center transition-colors shrink-0 ${active ? "bg-[var(--accent)] border-[var(--accent)] text-[#0a0a0c]" : "border-[color-mix(in_srgb,var(--text)_30%,transparent)] group-hover:border-[var(--text)]"}`}
                            >
                              {active && (
                                <span className="material-symbols-outlined !text-[12px] font-bold">
                                  check
                                </span>
                              )}
                            </div>
                          )}
                          <span
                            className={`text-[11px] font-black capitalize tracking-widest leading-none pt-0.5 text-center ${active ? "drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]" : ""}`}
                          >
                            {opt.label}
                          </span>
                          {active && !multiSelect && (
                            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] absolute right-4 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]">
                              check
                            </span>
                          )}
                        </button>
                      );
                    })}
              </div>
            </>,
            portalRoot,
          );
        })()}
    </div>
  );
}

