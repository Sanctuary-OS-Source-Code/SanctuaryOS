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

import { PanelHeaderButton } from "./buttons";
export const DeferredRender = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(timer);
  }, []);
  return ready ? (
    <>{children}</>
  ) : (
    <div className="flex items-center justify-center p-20 w-full">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
    </div>
  );
};
export function PixelSnapper() {
  React.useEffect(() => {
    let timeout: any;
    const snap = () => {
      const elements = document.querySelectorAll(
        ".glass-panel, .glass-surface",
      );
      elements.forEach((el: any) => {
        const rect = el.getBoundingClientRect();
        // Calculate the difference between the actual fractional position and the nearest integer
        const shiftX = Math.round(rect.x) - rect.x;
        const shiftY = Math.round(rect.y) - rect.y;

        // If there is a meaningful subpixel gap (e.g. > 0.05px), we bridge it using `left` / `top`
        // We use relative positioning shifts so we don't interfere with flex/grid calculations,
        // and we don't touch `transform` so we don't clobber Tailwind hover states.
        if (Math.abs(shiftX) > 0.05) {
          el.style.left = `${shiftX}px`;
        } else {
          el.style.left = "";
        }
        if (Math.abs(shiftY) > 0.05) {
          el.style.top = `${shiftY}px`;
        } else {
          el.style.top = "";
        }

        // We intentionally do not forcefully set inline width/height here anymore.
        // Forcing exact pixel heights via inline styles overrides flex layout and causes
        // catastrophic content clipping on mobile viewports when text needs to wrap.
      });
    };

    // Run heavily debounced to ensure layout is completely settled, but only run
    // when the window actually resizes.
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(snap, 50);
    });

    // Observe the document body for major layout shifts
    observer.observe(document.body);

    // Initial run
    setTimeout(snap, 100);

    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);
  return null;
}
export const AccordionDrawer = ({
  children,
  isOpen,
}: {
  children: React.ReactNode;
  isOpen: boolean;
}) => {
  const [render, setRender] = React.useState(isOpen);
  const [visible, setVisible] = React.useState(isOpen);

  React.useEffect(() => {
    if (isOpen) {
      setRender(true);
      const timer = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setRender(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!render) return null;

  return (
    <div
      className={`col-span-full overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1)] ${visible ? "max-h-[1000px] opacity-100 scale-100" : "max-h-0 opacity-0 scale-[0.98]"}`}
    >
      <div className="pt-4 pb-12 px-2">{children}</div>
    </div>
  );
};
export const SidePanelContext = React.createContext(false);
export function SidePanel({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  iconColorClass,
  children,
  actions,
  headerActions,
  footer,
  widthClass = "w-full md:w-[600px]",
  backdropZ = "z-[40000]",
  panelZ = "z-[40001]",
  noScroll = false,
  noPadding = false,
  hideHeader = false,
  badgeText,
  ambientGlows,
  isResizable = false,
  defaultWidth = 800,
  noBackdropDim = false,
  noPanelBlur = false,
  footerClass,
  panelClass,
  panelStyle,
  position,
  keepMounted = false,
  forceShowCloseBtn = false,
  coverImage,
  hideCloseButton = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode | string;
  subtitle?: React.ReactNode;
  icon?: string;
  iconColorClass?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  backdropZ?: string;
  panelZ?: string;
  noScroll?: boolean;
  noPadding?: boolean;
  hideHeader?: boolean;
  badgeText?: string;
  ambientGlows?: React.ReactNode;
  isResizable?: boolean;
  defaultWidth?: number;
  noBackdropDim?: boolean;
  noPanelBlur?: boolean;
  footerClass?: string;
  panelClass?: string;
  panelStyle?: React.CSSProperties;
  position?: "left" | "right";
  keepMounted?: boolean;
  coverImage?: string;
  forceShowCloseBtn?: boolean;
  hideCloseButton?: boolean;
}) {
  const { t } = useLexicon();
  const theme = useTheme();
  const depth = React.useContext(PanelDepthContext);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number>(defaultWidth || 800);
  useEffect(() => {
    if (defaultWidth) setPanelWidth(defaultWidth);
  }, [defaultWidth]);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragWidthRef = useRef<number>(defaultWidth || 800);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(
        400,
        Math.min(window.innerWidth - e.clientX, window.innerWidth - 100),
      );
      dragWidthRef.current = newWidth;
      if (panelRef.current) {
        panelRef.current.style.width = `${newWidth}px`;
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      setPanelWidth(dragWidthRef.current);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, defaultWidth]);

  const [isAnimatingIn, setIsAnimatingIn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsAnimatingOut(false);
      setIsAnimatingIn(true);
      const timer = setTimeout(() => setIsAnimatingIn(false), 500); // Remove animation class after sliding in
      return () => clearTimeout(timer);
    } else if (shouldRender && !keepMounted) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsAnimatingOut(false);
      }, 500); // Wait for the 0.5s slide-out animation
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender, keepMounted]);

  if (!shouldRender && !keepMounted) return null;

  const calculatedBackdropZ = 40000 + depth * 10;
  const calculatedPanelZ = 40000 + depth * 10 + 1;
  const parsedBackdropZ = parseInt(backdropZ.replace(/\D/g, "")) || 40000;
  const parsedPanelZ = parseInt(panelZ.replace(/\D/g, "")) || 40001;
  const finalBackdropZ =
    depth > 0
      ? Math.max(calculatedBackdropZ, parsedBackdropZ)
      : parsedBackdropZ;
  const finalPanelZ =
    depth > 0 ? Math.max(calculatedPanelZ, parsedPanelZ) : parsedPanelZ;

  const panelContent = (
    <PanelDepthContext.Provider value={depth + 1}>
      <SidePanelContext.Provider value={true}>
        <div
          className={`sa-side-panel-wrapper ${isOpen && !isAnimatingOut ? "sa-panel-open" : ""}`}
          data-depth={depth}
          style={
            keepMounted && (!isOpen || isAnimatingOut)
              ? {
                  opacity: 0,
                  pointerEvents: "none",
                  transition: "opacity 0.2s ease-in-out",
                }
              : {
                  opacity: 1,
                  pointerEvents: "auto",
                  transition: "opacity 0.2s ease-in-out",
                }
          }
        >
          {isResizing && (
            <div className="fixed inset-0 z-[100010] cursor-col-resize" />
          )}
          <div
            className={`sa-side-panel-backdrop fixed inset-0 z-0 ${depth > 0 || noBackdropDim ? "bg-transparent" : "bg-black/10 backdrop-blur-[3px]"} ${isAnimatingOut ? "animate-out fade-out opacity-0 duration-500" : "animate-in fade-in duration-500"}`}
            style={{ zIndex: finalBackdropZ }}
            onClick={onClose}
          />
          <div
            ref={panelRef}
            className={`sa-side-panel-window ${position === "left" ? "sa-panel-left" : "sa-panel-right"} fixed top-[0px] bottom-[0px] ${position === "left" ? "left-0 md:left-[var(--sidebarWidth,288px)]" : "right-0"} overflow-hidden ${isResizable ? "" : widthClass} max-md:!w-full max-md:!max-w-[100vw] ${position === "left" ? "!rounded-r-3xl !rounded-l-none !border-y-0 !border-l-0 border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl" : "!rounded-l-3xl !rounded-r-none !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[[-20px_0_50px_rgba(0,0,0,0.2)]]"} flex flex-col ${depth > 0 ? "" : panelZ} ${isResizing ? "!transition-none !duration-0 select-none" : ""} ${panelClass || ""} ${keepMounted ? "" : isAnimatingOut ? (position === "left" ? "sa-panel-slide-out-left" : "sa-panel-slide-out-right") : isAnimatingIn ? (position === "left" ? "sa-panel-slide-left" : "sa-panel-slide-right") : ""} ${noPanelBlur ? "" : "backdrop-blur-[var(--glassBlur)]"}`}
            style={{
              zIndex: finalPanelZ,
              background: `linear-gradient(135deg, color-mix(in srgb, var(--text) 5%, transparent) 0%, transparent 100%), color-mix(in srgb, var(--sidebar) calc(var(--glassOpacityDecimal) * 100%), transparent)`,
              ...(isResizable
                ? {
                    width: `${isResizing ? dragWidthRef.current : panelWidth}px`,
                    pointerEvents: isResizing ? "none" : undefined,
                  }
                : {}),
              ...panelStyle,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {theme.ambientNoise && (
              <div
                className="absolute inset-0 z-[-1] opacity-[0.05] mix-blend-overlay pointer-events-none"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
                }}
              />
            )}

            {isResizable && (
              <div
                className="absolute top-0 left-[-6px] w-4 h-full cursor-col-resize hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] z-[100] transition-colors flex flex-col items-center justify-center opacity-0 hover:opacity-100"
                onMouseDown={() => setIsResizing(true)}
              >
                <div className="w-1 h-12 rounded-full bg-[var(--accent)]" />
              </div>
            )}

            {ambientGlows && (
              <div
                className={`absolute inset-0 overflow-hidden pointer-events-none z-[-1] ${position === "left" ? "rounded-r-[var(--radius)]" : "rounded-l-[var(--radius)]"}`}
              >
                {ambientGlows}
              </div>
            )}

            {hideHeader && (forceShowCloseBtn || headerActions) && (
              <div className="absolute top-8 right-8 z-[10000] flex items-center bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1 gap-1 shrink-0">
                {headerActions}
                {headerActions && forceShowCloseBtn && (
                  <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_15%,transparent)] mx-1" />
                )}
                {forceShowCloseBtn && (
                  <PanelHeaderGroup className={headerActions ? "ml-1" : ""}>
                    <PanelHeaderButton
                      icon="close"
                      tooltip={t("btn_close") || "Close"}
                      variant="danger"
                      onClick={onClose}
                    />
                  </PanelHeaderGroup>
                )}
              </div>
            )}

            {!hideHeader && (
              <div
                className={`pt-6 px-6 pb-4 md:pt-8 md:px-10 shrink-0 relative z-30 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] ${coverImage ? "pt-48" : ""} flex flex-col-reverse md:flex-row items-start md:justify-between gap-4 md:gap-6 w-full`}
              >
                {coverImage && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none z-[-1] rounded-tl-[var(--radius)] rounded-tr-[var(--radius)]">
                    <div
                      className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 scale-100 opacity-60"
                      style={{ backgroundImage: `url('${coverImage}')` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[color-mix(in_srgb,var(--bg)_60%,transparent)] to-[color-mix(in_srgb,var(--bg)_65%,transparent)] pointer-events-none" />
                  </div>
                )}

                <div className="flex flex-col justify-center gap-4 md:gap-6 relative z-10 flex-1 min-w-0">
                  <h2 className="text-lg md:text-xl font-black text-[var(--text)] capitalize tracking-widest flex items-center gap-4 md:gap-6 min-w-0 w-full">
                    {icon && (
                      <div
                        className={`w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-[1.25rem] glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shadow-lg shrink-0 relative group/iconbox ${iconColorClass || ""}`}
                      >
                        <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/iconbox:opacity-100 transition-opacity duration-500"></div>
                        <span
                          className={`material-symbols-outlined !text-[20px] md:!text-[24px] opacity-80 group-hover/iconbox:opacity-100 group-hover/iconbox:scale-110 transition-all duration-300 drop-shadow-[0_0_15px_currentColor] ${iconColorClass || ""}`}
                        >
                          {icon}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col min-w-0 w-full justify-center">
                      {badgeText && (
                        <div className="flex items-center gap-2 mb-1 md:mb-2">
                          <span
                            className={`text-[9px] md:text-[10px] font-black capitalize tracking-widest flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-current/10 border border-current/20 ${iconColorClass || "theme-text-accent"}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shadow-[0_0_8px_currentColor]"></span>
                            {badgeText}
                          </span>
                        </div>
                      )}
                      <span className="leading-tight text-xl md:text-3xl tracking-tight truncate w-full drop-shadow-md">
                        {title}
                      </span>
                      {subtitle && (
                        <span className="text-[9px] md:text-[10px] font-black text-[var(--subtext)] opacity-50 mt-1 capitalize tracking-[0.25em] line-clamp-2 break-words">
                          {subtitle}
                        </span>
                      )}
                    </div>
                  </h2>
                </div>

                {(headerActions || !hideCloseButton) && (
                  <div className="flex items-center z-50 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full shadow-xl p-1 gap-1 shrink-0 self-end md:self-auto">
                    {headerActions}
                    {headerActions && !hideCloseButton && (
                      <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_15%,transparent)] mx-1" />
                    )}
                    {!hideCloseButton && (
                      <PanelHeaderGroup className={headerActions ? "ml-1" : ""}>
                        <PanelHeaderButton
                          icon="close"
                          tooltip={t("btn_close") || "Close"}
                          variant="danger"
                          onClick={onClose}
                        />
                      </PanelHeaderGroup>
                    )}
                  </div>
                )}
              </div>
            )}

            <div
              className={`flex-1 min-h-0 flex flex-col relative z-10 overflow-x-hidden ${noScroll ? "" : "overflow-y-auto custom-scrollbar"} ${noPadding ? "" : "p-8"} ${isResizing ? "pointer-events-none select-none overflow-hidden" : ""}`}
            >
              {children}
            </div>

            {(footer || actions) && (
              <div
                className={`px-8 pb-8 pt-10 flex justify-center items-center gap-4 shrink-0 relative z-30 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] ${footerClass || ""}`}
              >
                {footer}
                {actions}
              </div>
            )}
          </div>
        </div>
      </SidePanelContext.Provider>
    </PanelDepthContext.Provider>
  );

  const portalRoot = document.getElementById("sa-portals") || document.body;
  return createPortal(panelContent, portalRoot);
}
export const PanelDepthContext = React.createContext(0);
export function PanelHeaderGroup({ children, className = "" }: any) {
  return (
    <div className={`flex items-center gap-1 shrink-0 ${className}`}>
      {children}
    </div>
  );
}
export function ViewHeader({
  title,
  subtitle,
  icon,
  iconColorClass = "text-[var(--accent)]",
  children,
  onSubtitleClick,
  onTitleClick,
  breadcrumb,
  shape = "circle",
}: any) {
  const shapeClass =
    shape === "square" ? "rounded-[var(--radius)]" : "rounded-full";
  return (
    <header className="flex flex-col md:flex-row w-full justify-start items-start md:items-center mb-4 md:mb-6 shrink-0 gap-4 md:gap-6">
      <div className="flex items-start gap-3 md:gap-4 shrink-0 min-w-0 md:max-w-[50%]">
        {icon && (
          <div
            className={`w-8 h-8 md:w-10 md:h-10 ${shapeClass} flex items-center justify-center shrink-0 border glass-panel relative group shadow-md hidden sm:flex`}
          >
            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {typeof icon === "string" ? (
              <span
                className={`material-symbols-outlined !text-[16px] md:!text-[20px] relative z-10 ${iconColorClass}`}
              >
                {icon}
              </span>
            ) : (
              icon
            )}
          </div>
        )}
        <div className="flex flex-col gap-0.5 md:gap-1 items-start text-left flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 w-full">
            <h1
              className={`text-lg md:text-2xl font-semibold tracking-tight leading-tight m-0 text-left text-[var(--text)] shrink-0 transition-colors ${onTitleClick ? "hover:theme-text-accent cursor-pointer" : ""}`}
              onClick={onTitleClick}
            >
              {title}
            </h1>
            {breadcrumb && (
              <div className="flex items-center gap-x-1.5 md:gap-x-2 truncate">
                <span className="text-[var(--subtext)] opacity-40 font-semibold text-base md:text-2xl leading-none">
                  /
                </span>
                <span className="text-base md:text-2xl font-medium tracking-tight text-[var(--subtext)] animate-in fade-in slide-in-from-left-2 duration-300 leading-tight truncate">
                  {breadcrumb}
                </span>
              </div>
            )}
          </div>
          {subtitle && (
            <h2
              className={`hidden md:block text-[11px] font-medium tracking-wide text-[var(--subtext)] m-0 text-left opacity-80 leading-snug line-clamp-2 max-w-2xl ${onSubtitleClick ? "hover:theme-text-accent cursor-pointer transition-colors" : ""}`}
              onClick={onSubtitleClick}
            >
              {subtitle}
            </h2>
          )}
        </div>
      </div>
      <div
        id="hub-header-actions"
        className="flex items-center justify-end gap-3 w-full md:flex-1 max-w-5xl md:ml-auto empty:hidden"
      >
        {children}
      </div>
    </header>
  );
}
export function HeaderActionPortal({
  children,
}: {
  children: React.ReactNode;
}) {
  const [portalRoot, setPortalRoot] = React.useState<
    HTMLElement | null | undefined
  >(undefined);

  React.useEffect(() => {
    let animationFrameId: number;
    let attempts = 0;
    const findRoot = () => {
      const root = document.getElementById("hub-header-actions");
      if (root) {
        setPortalRoot(root);
      } else {
        attempts++;
        if (attempts > 10) {
          setPortalRoot(null); // Fallback to inline
        } else {
          animationFrameId = requestAnimationFrame(findRoot);
        }
      }
    };
    findRoot();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  if (portalRoot === undefined) return null; // Still searching
  if (portalRoot === null) return <>{children}</>; // Fallback to inline

  return createPortal(children, portalRoot);
}
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  minHeightClass = "min-h-[200px]",
  className = "",
}: {
  icon: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  minHeightClass?: string;
  className?: string;
}) {
  return (
    <div
      className={`text-center py-10 px-4 flex flex-col items-center justify-center gap-4 ${minHeightClass} w-full ${className}`}
    >
      <span className="material-symbols-outlined !text-[48px] text-[var(--text)] opacity-30 drop-shadow-md mb-2">
        {icon}
      </span>
      {(title || subtitle) && (
        <div className="flex flex-col gap-1.5 items-center text-center">
          {title && (
            <span className="text-[11px] font-black capitalize tracking-[0.2em] text-[var(--text)]">
              {title}
            </span>
          )}
          {subtitle && (
            <span className="text-[9px] font-bold text-[var(--subtext)] capitalize tracking-widest max-w-sm leading-relaxed opacity-60">
              {subtitle}
            </span>
          )}
        </div>
      )}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
export function DashboardStatTile({
  icon,
  number,
  value,
  label,
  colorClass,
  style,
  onClick,
  disabled,
  onMouseEnter,
  onMouseLeave,
  disableBgStrip,
  className = "",
  isActive = false,
  variant = "default",
}: any) {
  const displayValue = number !== undefined ? number : value;
  const isStatusRed =
    colorClass?.includes("red") || colorClass?.includes("danger");
  const isStatusYellow =
    colorClass?.includes("amber") || colorClass?.includes("warning");
  const isStatusGreen =
    colorClass?.includes("emerald") ||
    colorClass?.includes("teal") ||
    colorClass?.includes("success");
  const isStatusBlue =
    colorClass?.includes("blue") ||
    colorClass?.includes("cyan") ||
    colorClass?.includes("info");

  let textColor = "text-[var(--text)]";
  if (isStatusRed) {
    textColor = "text-[var(--danger)]";
  } else if (isStatusYellow) {
    textColor = "text-[var(--warning)]";
  } else if (isStatusGreen) {
    textColor = "text-[var(--success)]";
  } else if (isStatusBlue) {
    textColor = "text-[var(--accent)]";
  } else if (colorClass) {
    textColor =
      colorClass.split(" ").find((c: string) => c.startsWith("text-")) ||
      textColor;
  }

  const cleanColorClass =
    typeof colorClass === "string"
      ? disableBgStrip
        ? colorClass
        : colorClass
            .split(" ")
            .filter(
              (c: string) => !c.startsWith("bg-") && !c.startsWith("hover:bg-"),
            )
            .join(" ")
      : "";

  const strVal = String(displayValue);
  const isSpecial = variant === "tab" || variant === "filter";
  const isFilter = variant === "filter";

  let sizeClass = "text-2xl md:text-3xl lg:text-4xl xl:text-5xl";
  const activeStyles = isActive
    ? isSpecial
      ? "border border-[var(--accent)] scale-[1.02] z-10"
      : "border border-[currentColor] shadow-[0_0_30px_-5px_currentColor,inset_0_0_20px_-5px_currentColor] scale-[1.02] z-10"
    : "border border-transparent hover:brightness-125";

  if (strVal.length > 15) sizeClass = "text-base xl:text-lg";
  else if (strVal.length > 10) sizeClass = "text-lg xl:text-xl";
  else if (strVal.length > 5) sizeClass = "text-xl lg:text-2xl xl:text-3xl";

  const paddingClass =
    variant === "tab" || variant === "filter"
      ? "py-2 px-3 md:py-3 md:px-5"
      : "py-3 px-4 md:py-4 md:px-5 lg:p-5";
  const iconSizeClass = isFilter
    ? "w-8 h-8 md:w-10 md:h-10"
    : "w-6 h-6 md:w-14 md:h-14";
  const iconTextClass = isFilter
    ? "!text-[20px] md:!text-[24px]"
    : "!text-[18px] md:!text-[32px]";
  const shadowClass = isSpecial ? "!shadow-none" : "shadow-xl";
  const activeTint = isActive && isSpecial ? "var(--accent)" : "currentColor";

  const sizeConstraintClass = isSpecial
    ? "w-[calc(50vw-1.5rem)] md:w-[260px] shrink-0"
    : "flex-1 min-w-0";

  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
      className={`${sizeConstraintClass} h-auto flex flex-col md:flex-row items-center justify-center md:justify-start text-center md:text-left ${paddingClass} gap-2 md:gap-4 rounded-3xl glass-panel ${cleanColorClass} ${isActive && isSpecial ? "text-[var(--accent)]" : textColor} relative group transition duration-500 ${shadowClass} ${disabled ? "opacity-50 cursor-not-allowed" : onClick ? "cursor-pointer hover:shadow-[0_10px_40px_rgba(0,0,0,0.3)] hover:-translate-y-1" : ""} ${activeStyles} ${className}`}
    >
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{
          backgroundColor: isActive
            ? `color-mix(in srgb, ${activeTint} 20%, transparent)`
            : `color-mix(in srgb, ${activeTint} 10%, transparent)`,
        }}
      />
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[inherit]" />

      {icon && (
        <div
          className={`${iconSizeClass} rounded-2xl flex items-center justify-center shrink-0 relative transition-all duration-500 group-hover:scale-110`}
        >
          <span
            className={`material-symbols-outlined ${iconTextClass} transition-opacity [text-shadow:0_4px_12px_rgba(0,0,0,0.5)]`}
          >
            {icon}
          </span>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0 relative z-10 py-1 items-center md:items-start">
        <span
          className={`text-[9px] md:text-xs uppercase tracking-widest font-black group-hover:text-current transition-colors duration-500 mb-0 md:mb-1 truncate w-full pr-2 md:pr-0 ${isActive && isSpecial ? "text-[var(--accent)]" : "text-[var(--subtext)]"}`}
        >
          {label}
        </span>
        {displayValue !== undefined && displayValue !== "" && (
          <span
            className={`${sizeClass} font-black tracking-tighter pr-2 md:pr-1 [text-shadow:0_2px_4px_rgba(0,0,0,0.2)] leading-none`}
          >
            {displayValue}
          </span>
        )}
      </div>
    </div>
  );
}
export function MobileSegmentedControl({
  tabs,
  activeTab,
  setTab,
  className = "",
}: any) {
  return (
    <div
      className={`w-full overflow-x-auto custom-scrollbar md:hidden relative z-10 ${className}`}
    >
      <div className="flex items-center gap-3 px-4 py-3 w-max min-w-full">
        {tabs.map((tab: any) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                tab.setTab ? tab.setTab(tab.id) : setTab(tab.id);
              }}
              className={`relative flex items-center justify-center gap-2 px-6 py-3 rounded-2xl transition-all duration-300 group backdrop-blur-[24px] backdrop-saturate-[140%] border
                ${
                  isActive
                    ? "border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[0_10px_20px_rgba(0,0,0,0.5),0_0_20px_rgba(var(--accent-rgb),0.2)] scale-105 z-10"
                    : "border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] scale-95 opacity-80 hover:opacity-100 hover:scale-100"
                }`}
              style={{
                background: isActive
                  ? "linear-gradient(135deg, rgb(var(--panelTint-rgb-spaces, 255 255 255) / 0.15) 0%, rgb(var(--panelTint-rgb-spaces, 255 255 255) / 0.05) 100%)"
                  : "linear-gradient(135deg, rgb(var(--panelTint-rgb-spaces, 255 255 255) / 0.05) 0%, rgb(var(--panelTint-rgb-spaces, 255 255 255) / 0.01) 100%)",
              }}
            >
              {tab.icon && (
                <span
                  className={`material-symbols-outlined !text-[16px] transition-transform duration-300 ${isActive ? "drop-shadow-[0_0_8px_currentColor]" : "group-hover:scale-110"}`}
                >
                  {tab.icon}
                </span>
              )}
              <span className="font-black uppercase tracking-widest text-[10px] whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function InlineFilterGroup({
  options,
  value,
  onChange,
}: {
  options: any[];
  value: string;
  onChange: (val: string) => void;
}) {
  if (!options || options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {options.map((opt: any) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-full px-4 h-10 transition-all flex items-center justify-center text-[10px] font-black uppercase tracking-widest border ${
              active
                ? "border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]"
                : "glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:text-[var(--text)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
export function MinimalFilterGroup({
  options,
  activeTab,
  setTab,
  className = "",
}: any) {
  return (
    <div
      className={`flex items-center gap-6 overflow-x-auto hide-scrollbar w-full md:w-auto shrink-0 ${className}`}
    >
      {options.map((opt: any) => {
        const isActive = activeTab === opt.id;
        const colorVar = opt.colorVar || "--accent";
        const activeClass = `text-[var(${colorVar})] border-b-2 border-[var(${colorVar})] drop-shadow-[0_0_8px_rgba(var(${colorVar}-rgb),0.8)]`;
        const inactiveClass =
          "text-[color-mix(in_srgb,var(--text)_50%,transparent)] border-b-2 border-transparent hover:text-[var(--text)]";

        return (
          <button
            key={opt.id}
            onClick={() => setTab(opt.id)}
            className={`pb-1 text-[10px] md:text-xs font-black uppercase tracking-widest transition-all shrink-0 whitespace-nowrap ${isActive ? activeClass : inactiveClass}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
export function GlassSegmentedControl({
  options,
  activeTab,
  setTab,
  className = "",
  buttonClassName = "",
}: any) {
  return (
    <div
      className={`flex items-center glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] divide-x divide-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner overflow-x-auto hide-scrollbar w-max min-w-full md:min-w-0 md:w-auto ${className}`}
    >
      {options.map((opt: any) => {
        const isActive = activeTab === opt.id;
        const colorVar = opt.colorVar || "--accent";
        const activeClass = `text-[var(${colorVar})] bg-[color-mix(in_srgb,var(${colorVar})_10%,transparent)] shadow-[0_0_15px_rgba(var(${colorVar}-rgb),0.15)]`;
        const inactiveClass =
          "text-[color-mix(in_srgb,var(--text)_50%,transparent)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]";

        return (
          <button
            key={opt.id}
            onClick={() => setTab(opt.id)}
            className={`${buttonClassName || "px-4 md:px-5 h-10 md:h-12 text-[10px] md:text-xs"} font-black capitalize tracking-widest transition-all shrink-0 flex-1 md:flex-none text-center whitespace-nowrap ${isActive ? activeClass : inactiveClass}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

