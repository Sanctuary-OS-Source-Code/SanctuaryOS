import React from "react";
import { SidebarFooterButton } from "./buttons";
import { MobileSegmentedControl } from "./layout";

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
