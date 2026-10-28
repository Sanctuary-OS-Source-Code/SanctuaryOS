import { useLexicon, normalizeAllCapsForThemeCase } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PanelHeaderButton } from "./buttons";
import { ActionPill } from "./alerts";
export const HeaderActionPortalContext = React.createContext(false);

type HubActionsStoreState = {
  hubActions: any[];
  portalCount: number;
};

const hubActionsStore: {
  state: HubActionsStoreState;
  listeners: Set<() => void>;
} = {
  state: { hubActions: [], portalCount: 0 },
  listeners: new Set(),
};

function notifyHubActionsListeners() {
  hubActionsStore.listeners.forEach((l) => l());
}

export function setGlobalHubActions(actions: any[]) {
  hubActionsStore.state = { ...hubActionsStore.state, hubActions: actions };
  notifyHubActionsListeners();
}

export function adjustHeaderPortalCount(delta: number) {
  hubActionsStore.state = {
    ...hubActionsStore.state,
    portalCount: Math.max(0, hubActionsStore.state.portalCount + delta),
  };
  notifyHubActionsListeners();
}

export function useHubActionsState() {
  const [state, setState] = React.useState(hubActionsStore.state);
  React.useEffect(() => {
    const listener = () => setState(hubActionsStore.state);
    hubActionsStore.listeners.add(listener);
    listener();
    return () => {
      hubActionsStore.listeners.delete(listener);
    };
  }, []);
  return state;
}

export const DeferredRender = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};
export function PixelSnapper() {
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
      const timer = setTimeout(() => setVisible(true), 16);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setRender(false), 320);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!render) return null;

  return (
    <div
      className={`col-span-full relative z-30 grid transition-[grid-template-rows,opacity] duration-300 ease-out ${visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"}`}
    >
      <div className="overflow-hidden min-h-0">
        <div className="pt-2 pb-8 px-1">{children}</div>
      </div>
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
  passthroughBackdrop = false,
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
  passthroughBackdrop?: boolean;
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
    window.dispatchEvent(
      new CustomEvent("sa-close-popovers", { detail: "side-panel" }),
    );
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

  const calculatedBackdropZ = 50000 + depth * 100;
  const calculatedPanelZ = 50000 + depth * 100 + 1;
  const parsedBackdropZ = parseInt(backdropZ.replace(/\D/g, "")) || 40000;
  const parsedPanelZ = parseInt(panelZ.replace(/\D/g, "")) || 40001;
  const finalBackdropZ =
    depth > 0
      ? Math.max(calculatedBackdropZ, parsedBackdropZ)
      : parsedBackdropZ;
  const finalPanelZ =
    depth > 0 ? Math.max(calculatedPanelZ, parsedPanelZ) : parsedPanelZ;

  const isPanelClosed = !isOpen || isAnimatingOut;

  const panelContent = (
    <PanelDepthContext.Provider value={depth + 1}>
      <SidePanelContext.Provider value={true}>
        <div
          className={`sa-side-panel-wrapper ${!isPanelClosed ? "sa-panel-open" : ""}`}
          data-depth={depth}
          data-passthrough={passthroughBackdrop ? "true" : undefined}
          style={
            keepMounted && isPanelClosed
              ? {
                  display: "none",
                  opacity: 0,
                  pointerEvents: "none",
                  visibility: "hidden",
                }
              : {
                  opacity: 1,
                  pointerEvents: isPanelClosed || passthroughBackdrop ? "none" : "auto",
                  transition: "opacity 0.2s ease-in-out",
                }
          }
        >
          {isResizing && (
            <div className="fixed inset-0 z-[100010] cursor-col-resize" />
          )}
          <div
            className={`sa-side-panel-backdrop fixed inset-0 z-0 ${depth > 0 || noBackdropDim ? "bg-transparent" : ""} ${isPanelClosed || passthroughBackdrop ? "pointer-events-none" : ""} ${isAnimatingOut ? "animate-out fade-out opacity-0 duration-500" : "animate-in fade-in duration-500"}`}
            style={{
              zIndex: finalBackdropZ,
              pointerEvents: isPanelClosed || passthroughBackdrop ? "none" : "auto",
              ...(depth === 0 && !noBackdropDim
                ? {
                    backgroundColor: "var(--glass-backdrop-dim, rgba(0, 0, 0, 0.14))",
                  }
                : {}),
            }}
            onClick={isPanelClosed || passthroughBackdrop ? undefined : onClose}
          />
          <div
            ref={panelRef}
            className={`sa-side-panel-window ${position === "left" ? "sa-panel-left" : "sa-panel-right"} fixed top-0 bottom-0 h-full ${position === "left" ? "left-0 md:left-[calc(var(--sidebarWidth,260px)+1.5rem)] border-t border-b border-r border-l-0 md:rounded-r-3xl !rounded-l-none" : "right-0 border-t border-b border-l border-r-0 md:rounded-l-3xl !rounded-r-none"} overflow-hidden ${isResizable ? "" : widthClass} max-md:!w-full max-md:!max-w-[100vw] max-md:!rounded-none max-md:!border-x-0 flex flex-col ${depth > 0 ? "" : panelZ} ${isResizing ? "!transition-none !duration-0 select-none" : ""} ${panelClass || ""} ${keepMounted ? "" : isAnimatingOut ? (position === "left" ? "sa-panel-slide-out-left" : "sa-panel-slide-out-right") : isAnimatingIn ? (position === "left" ? "sa-panel-slide-left" : "sa-panel-slide-right") : ""}`}
            style={{
              zIndex: finalPanelZ,
              pointerEvents: isPanelClosed || isResizing ? "none" : "auto",
              visibility: keepMounted && isPanelClosed ? "hidden" : "visible",
              borderTopColor: "var(--glass-border-top)",
              borderLeftColor: "var(--glass-border-left)",
              borderRightColor: "var(--glass-border-right)",
              borderBottomColor: "var(--glass-border-bottom)",
              ...(position === "left"
                ? {
                    borderLeftWidth: "0px",
                    borderTopLeftRadius: "0px",
                    borderBottomLeftRadius: "0px",
                    borderTopRightRadius: "max(0px, calc(var(--radius, 1.25rem) * 1.25))",
                    borderBottomRightRadius: "max(0px, calc(var(--radius, 1.25rem) * 1.25))",
                  }
                : {
                    right: "0px",
                    borderRightWidth: "0px",
                    borderTopRightRadius: "0px",
                    borderBottomRightRadius: "0px",
                    borderTopLeftRadius: "max(0px, calc(var(--radius, 1.25rem) * 1.25))",
                    borderBottomLeftRadius: "max(0px, calc(var(--radius, 1.25rem) * 1.25))",
                  }),
              backgroundColor: "var(--glass-drawer-bg, rgba(15, 23, 42, 0.18))",
              boxShadow: "var(--glass-drawer-shadow)",
              ...(isResizable
                ? {
                    width: `${isResizing ? dragWidthRef.current : panelWidth}px`,
                  }
                : {}),
              ...panelStyle,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Liquid Glass Specular Edge Catchlights */}
            <div className="pointer-events-none absolute inset-x-8 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/35 to-transparent z-40" />
            <div className="pointer-events-none absolute inset-y-8 left-0 w-[1px] bg-gradient-to-b from-white/25 via-white/10 to-transparent z-40" />
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
                className="absolute inset-0 overflow-hidden pointer-events-none z-[-1] rounded-[inherit]"
              >
                {ambientGlows}
              </div>
            )}

            {hideHeader && (forceShowCloseBtn || headerActions) && (
              <div className="absolute top-6 right-6 z-[10000] flex items-center glass-surface rounded-2xl p-1 gap-1 shrink-0">
                {headerActions}
                {headerActions && forceShowCloseBtn && (
                  <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_15%,transparent)] mx-1" />
                )}
                {forceShowCloseBtn && (
                  <PanelHeaderGroup className={headerActions ? "ml-1" : ""}>
                    <PanelHeaderButton
                      icon="close"
                      tooltip={t("btn_close", "Close") || "Close"}
                      variant="danger"
                      onClick={onClose}
                    />
                  </PanelHeaderGroup>
                )}
              </div>
            )}

            {!hideHeader && (
              <div
                className={`px-4 py-3.5 max-md:pt-[calc(env(safe-area-inset-top,0px)+0.875rem)] sm:px-6 sm:py-4 md:px-7 md:py-5 shrink-0 relative z-30 border-b border-[color-mix(in_srgb,var(--text)_8%,rgba(255,255,255,0.16))] ${coverImage ? "pt-36 sm:pt-48" : ""} flex flex-row items-center justify-between gap-3 md:gap-5 w-full`}
              >
                {coverImage && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none z-[-1] rounded-tl-[inherit] rounded-tr-[inherit]">
                    <div
                      className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 scale-100 opacity-60"
                      style={{ backgroundImage: `url('${coverImage}')` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[color-mix(in_srgb,var(--bg)_60%,transparent)] to-[color-mix(in_srgb,var(--bg)_65%,transparent)] pointer-events-none" />
                  </div>
                )}

                <div className="glass-surface rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-3 md:gap-3.5 relative z-10 flex-1 min-w-0">
                  {icon && (
                    <div
                      className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-xl border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 relative group/iconbox"
                    >
                      <span
                        className={`material-symbols-outlined !text-[18px] sm:!text-[20px] md:!text-[22px] opacity-90 group-hover/iconbox:opacity-100 group-hover/iconbox:scale-110 transition-all duration-300 ${(iconColorClass || "theme-text-accent").split(" ").filter((c: string) => !c.startsWith("border-") && !c.startsWith("bg-")).join(" ")}`}
                      >
                        {icon}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col min-w-0 flex-1 justify-center">
                    <h2 className="leading-tight text-base sm:text-lg md:text-xl font-black text-[var(--text)] capitalize tracking-tight truncate w-full m-0">
                      {title}
                    </h2>
                    {subtitle && (
                      <span className="text-[9px] md:text-[10px] font-bold text-[var(--subtext)] opacity-80 mt-0.5 capitalize tracking-[0.14em] md:tracking-[0.18em] leading-snug break-words">
                        {subtitle}
                      </span>
                    )}
                  </div>
                </div>

                {(headerActions || !hideCloseButton) && (
                  <div className="flex items-center z-50 glass-surface rounded-2xl p-1 gap-1 shrink-0 self-center">
                    {headerActions}
                    {headerActions && !hideCloseButton && (
                      <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_15%,transparent)] mx-1" />
                    )}
                    {!hideCloseButton && (
                      <PanelHeaderGroup className={headerActions ? "ml-1" : ""}>
                        <PanelHeaderButton
                          icon="close"
                          tooltip={t("btn_close", "Close") || "Close"}
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
              className={`flex-1 min-h-0 flex flex-col relative z-10 overflow-x-hidden ${noScroll ? "" : "overflow-y-auto custom-scrollbar"} ${noPadding ? "" : "p-4 max-md:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:p-6 md:p-7"} ${isResizing ? "pointer-events-none select-none overflow-hidden" : ""}`}
            >
              {children}
            </div>

            {(footer || actions) && (
              <div
                className={`px-6 pb-6 max-md:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-5 md:px-7 md:pb-7 flex justify-center items-center gap-4 shrink-0 relative z-30 border-t border-[color-mix(in_srgb,var(--text)_8%,rgba(255,255,255,0.14))] ${footerClass || ""}`}
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
  hubActions,
}: any) {
  const { portalCount } = useHubActionsState();

  React.useLayoutEffect(() => {
    if (hubActions && hubActions.length > 0) {
      setGlobalHubActions(hubActions);
      return () => setGlobalHubActions([]);
    }
  }, [hubActions]);

  const shapeClass =
    shape === "square" ? "rounded-lg" : "rounded-xl";
  return (
    <header className="flex flex-col md:flex-row w-full justify-between items-stretch md:items-center mb-6 md:mb-8 shrink-0 gap-3 md:gap-5">
      <div className="glass-panel rounded-2xl px-3.5 py-2.5 md:px-4 md:py-3 flex items-center gap-3 md:gap-3.5 shrink-0 min-w-0 w-fit max-w-full relative group/header">
        {icon && (typeof icon !== "string" || icon.trim().length > 0) && (
          <div
            className={`w-9 h-9 md:w-11 md:h-11 ${shapeClass} flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] relative group [&_.material-symbols-outlined]:!text-[18px] md:[&_.material-symbols-outlined]:!text-[22px]`}
          >
            {typeof icon === "string" ? (
              <span
                className={`material-symbols-outlined !text-[18px] md:!text-[22px] relative z-10 ${(iconColorClass || "text-[var(--accent)]").split(" ").filter((c: string) => !c.startsWith("border-") && !c.startsWith("bg-")).join(" ")}`}
              >
                {icon}
              </span>
            ) : (
              icon
            )}
          </div>
        )}
        <div className="flex flex-col gap-0.5 items-start justify-center text-left flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
            <h1
              className={`text-base md:text-xl font-black tracking-tight leading-tight m-0 text-left text-[var(--text)] shrink-0 transition-colors ${onTitleClick ? "hover:theme-text-accent cursor-pointer" : ""}`}
              onClick={onTitleClick}
            >
              {title}
            </h1>
            {breadcrumb && (
              <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                <span className="px-2.5 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] md:text-[11px] font-black uppercase tracking-wider text-[var(--text)] leading-tight">
                  {breadcrumb}
                </span>
              </div>
            )}
          </div>
          {subtitle && (
            <h2
              className={`text-[10px] md:text-[11px] font-medium tracking-wide text-[var(--subtext)] m-0 text-left opacity-80 leading-snug break-words max-w-2xl ${onSubtitleClick ? "hover:theme-text-accent cursor-pointer transition-colors" : ""}`}
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
        {portalCount === 0 && hubActions && hubActions.length > 0 && (
          <ActionPill
            searchQuery=""
            setSearchQuery={() => {}}
            hideSearch={true}
            actions={hubActions}
          />
        )}
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

  React.useLayoutEffect(() => {
    adjustHeaderPortalCount(1);
    return () => adjustHeaderPortalCount(-1);
  }, []);

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

  const wrappedChildren = (
    <HeaderActionPortalContext.Provider value={true}>
      {children}
    </HeaderActionPortalContext.Provider>
  );

  if (portalRoot === undefined) return null; // Still searching
  if (portalRoot === null) return wrappedChildren; // Fallback to inline

  return createPortal(wrappedChildren, portalRoot);
}
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  minHeightClass = "min-h-[220px]",
  className = "",
}: {
  icon: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  minHeightClass?: string;
  className?: string;
}) {
  const { t } = useLexicon();
  const rawIcon = (icon || "inbox").trim();
  const resolvedIcon = rawIcon.startsWith("icon_")
    ? t(rawIcon, rawIcon.replace(/^icon_/, ""))
    : t(`icon_${rawIcon}`, rawIcon);

  return (
    <div
      className={`glass-panel sa-empty-state-card rounded-3xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-center py-12 px-6 sm:px-10 flex flex-col items-center justify-center gap-4 ${minHeightClass} col-span-full w-full relative overflow-hidden ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--accent)_10%,transparent)_0%,transparent_70%)] opacity-80"
      />
      <div className="w-14 h-14 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0 relative z-10">
        <span className="material-symbols-outlined !text-[26px]">
          {resolvedIcon}
        </span>
      </div>
      {(title || subtitle) && (
        <div className="flex flex-col gap-1.5 items-center text-center max-w-md relative z-10">
          {title && (
            <span className="text-sm sm:text-base font-black tracking-tight text-[var(--text)] leading-snug whitespace-pre-line">
              {normalizeAllCapsForThemeCase(title)}
            </span>
          )}
          {subtitle && (
            <span className="text-xs font-medium text-[var(--subtext)] opacity-80 leading-relaxed whitespace-pre-line">
              {normalizeAllCapsForThemeCase(subtitle)}
            </span>
          )}
        </div>
      )}
      {action && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 relative z-10">
          {action}
        </div>
      )}
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
  active = false,
  variant = "default",
}: any) {
  const resolvedActive = Boolean(isActive || active);
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

  const hasPulse =
    typeof colorClass === "string" &&
    colorClass.split(" ").includes("animate-pulse");

  const cleanColorClass =
    typeof colorClass === "string"
      ? colorClass
          .split(" ")
          .filter(
            (c: string) =>
              c !== "animate-pulse" &&
              !c.startsWith("bg-") &&
              !c.startsWith("!bg-") &&
              !c.startsWith("hover:bg-") &&
              !c.startsWith("border-") &&
              !c.startsWith("!border-") &&
              !c.startsWith("shadow-") &&
              !c.startsWith("!shadow-"),
          )
          .join(" ")
      : "";

  const strVal = String(displayValue);
  const hasValue = displayValue !== undefined && displayValue !== "";
  const isSpecial = variant === "tab" || variant === "filter";
  const isModal = variant === "modal";
  const isFilter = variant === "filter" || isModal;

  let sizeClass = "text-2xl md:text-3xl lg:text-4xl xl:text-5xl";
  const activeStyles = resolvedActive
    ? "sa-glass-pill-active z-10 !opacity-100"
    : isSpecial || isModal
      ? "opacity-65 hover:opacity-100 hover:!border-[rgba(var(--text-rgb,255,255,255),0.28)]"
      : "hover:!border-[rgba(var(--text-rgb,255,255,255),0.28)]";

  const isTextSpecial =
    isSpecial && hasValue && isNaN(Number(strVal.replace(/[,.\s%+]/g, "")));

  if (isModal || isTextSpecial) {
    sizeClass =
      strVal.length > 13
        ? "text-[11px] sm:text-xs md:text-sm"
        : "text-xs sm:text-sm md:text-base";
  } else if (strVal.length > 15) sizeClass = "text-sm sm:text-base xl:text-lg";
  else if (strVal.length > 10) sizeClass = "text-base sm:text-lg xl:text-xl";
  else if (strVal.length > 5) sizeClass = "text-lg sm:text-xl lg:text-2xl xl:text-3xl";

  const paddingClass =
    variant === "tab" || variant === "filter" || isModal
      ? "py-2.5 px-3 sm:py-3 sm:px-3.5 md:py-3.5 md:px-4"
      : "py-2.5 px-3 sm:py-3 sm:px-4 md:py-4 md:px-5 lg:p-5";
  const iconSizeClass =
    isFilter || isTextSpecial || (isSpecial && !hasValue)
      ? "w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10"
      : "w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12";
  const iconTextClass =
    isFilter || isTextSpecial || (isSpecial && !hasValue)
      ? "!text-[16px] sm:!text-[18px] md:!text-[20px]"
      : "!text-[18px] sm:!text-[20px] md:!text-[26px]";

  const sizeConstraintClass =
    variant === "tab"
      ? "w-[calc(50vw-1.5rem)] md:w-[260px] min-h-[64px] md:min-h-[88px] shrink-0"
      : variant === "filter"
        ? "w-full min-w-0 min-h-[58px] sm:min-h-[64px] md:min-h-[80px]"
        : isModal
          ? "flex-1 min-w-0 min-h-[56px] sm:min-h-[60px] md:min-h-[76px]"
          : "flex-1 min-w-0 min-h-[64px] md:min-h-[88px]";

  const mergedStyle = {
    "--glass-outer-shadow": "0 0 #0000",
    "--glass-nested-shadow": "0 0 #0000",
    ...(isModal ? { "--glassBeforeDisplay": "none" } : {}),
    ...style,
  } as React.CSSProperties;

  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={mergedStyle}
      className={`${sizeConstraintClass} h-auto self-stretch flex flex-row items-center justify-start text-left ${paddingClass} gap-2.5 sm:gap-3 md:gap-3.5 rounded-2xl glass-panel ${isModal ? "before:!hidden" : ""} ${isSpecial && !hasPulse ? "text-[var(--text)]" : `${cleanColorClass} ${textColor}`} relative group transition duration-300 ${disabled ? "opacity-50 cursor-not-allowed" : onClick ? "cursor-pointer" : ""} ${activeStyles} ${className}`}
    >
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-[inherit]" />

      {icon && (
        <div
          className={`${iconSizeClass} rounded-xl border flex items-center justify-center shrink-0 relative transition-all duration-300 ${
            resolvedActive
              ? "border-[color-mix(in_srgb,var(--accent)_75%,rgba(255,255,255,0.55))] bg-[color-mix(in_srgb,var(--accent)_24%,var(--glass-card-icon-bg,rgba(255,255,255,0.12)))] text-[var(--text)] shadow-[0_0_16px_color-mix(in_srgb,var(--accent)_28%,transparent),var(--glass-card-icon-shadow)]"
              : `border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] ${hasPulse ? textColor : isSpecial ? "text-[var(--subtext)] group-hover:text-[var(--text)]" : textColor}`
          }`}
        >
          <span
            className={`material-symbols-outlined ${iconTextClass} ${hasPulse ? `${textColor} animate-pulse` : "transition-colors"}`}
          >
            {icon}
          </span>
        </div>
      )}

      <div className={`flex flex-col flex-1 min-w-0 relative z-10 py-0.5 sm:py-1 items-start justify-center`}>
        <span
          className={`${hasValue ? "text-[9px] sm:text-[10px] mb-0.5 tracking-wider truncate" : "text-[10px] sm:text-[11px] md:text-xs tracking-wide leading-snug line-clamp-2 whitespace-normal"} uppercase font-black transition-colors duration-300 w-full ${
            resolvedActive
              ? "text-[var(--text)] opacity-100"
              : hasValue
                ? "text-[var(--subtext)] opacity-80 group-hover:opacity-100"
                : "text-[var(--subtext)] opacity-80 group-hover:text-[var(--text)] group-hover:opacity-100"
          }`}
        >
          {typeof label === "string" ? normalizeAllCapsForThemeCase(label) : label}
        </span>
        {hasValue && (
          <span
            className={`${sizeClass} capitalize font-black tracking-tighter leading-tight truncate w-full transition-opacity duration-300 ${
              hasPulse
                ? `${textColor} animate-pulse`
                : resolvedActive
                  ? "text-[var(--text)] opacity-100"
                  : isSpecial || isModal
                    ? "text-[var(--text)] opacity-75 group-hover:opacity-100"
                    : "text-[var(--text)]"
            }`}
          >
            {typeof displayValue === "string" ? normalizeAllCapsForThemeCase(displayValue) : displayValue}
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
              className={`relative flex items-center justify-center gap-2 px-6 py-3 rounded-2xl transition-all duration-300 group glass-surface overflow-hidden
                ${
                  isActive
                    ? "sa-glass-pill-active !text-[var(--text)] scale-105 z-10 !opacity-100"
                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] scale-95 opacity-70 hover:opacity-100 hover:scale-100"
                }`}
            >
              {tab.icon && (
                <span
                  className={`material-symbols-outlined !text-[16px] transition-transform duration-300 ${isActive ? "text-[var(--accent)]" : "group-hover:scale-110"}`}
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
    <div className="grid grid-cols-2 gap-1 w-full">
      {options.map((opt: any) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`sa-dropdown-item rounded-xl px-3.5 h-9 transition-all flex items-center justify-center text-[11px] capitalize tracking-wide whitespace-nowrap relative overflow-hidden ${
              active
                ? "is-selected sa-glass-active font-bold text-[var(--text)]"
                : "font-semibold text-[var(--subtext)] opacity-70 hover:opacity-100 hover:text-[var(--text)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

