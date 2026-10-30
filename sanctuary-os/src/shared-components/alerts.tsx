import { useLexicon } from '../LexiconContext';
import React from 'react';
import { useTooltipStore } from '../store/tooltipStore';
import { FilterPopover } from "./misc";
import { SidePanelContext, HeaderActionPortalContext, useHubActionsState, EmptyState } from "./layout";
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
    <div className="w-full flex-1 flex flex-col items-center justify-center py-6">
      <EmptyState
        icon={icon}
        title={title}
        subtitle={subtitle}
      />
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
  onlyWhenTruncated = false,
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
    onlyWhenTruncated,
  });
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
      onlyWhenTruncated,
    };
    const parent = ref.current?.parentElement;
    if (parent && parent.matches(":hover") && !timerRef.current) {
      const p = propsRef.current;
      if (p.onlyWhenTruncated) {
        const truncateEl = parent.classList.contains("truncate")
          ? parent
          : (parent.querySelector(".truncate") as HTMLElement | null) || parent;
        if (truncateEl.scrollWidth <= truncateEl.clientWidth + 1) {
          return;
        }
      }
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
    onlyWhenTruncated,
    setTooltip,
  ]);

  // Bind DOM events exactly once
  React.useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;

    const showTooltip = () => {
      const p = propsRef.current;
      if (p.onlyWhenTruncated) {
        const truncateEl = parent.classList.contains("truncate")
          ? parent
          : (parent.querySelector(".truncate") as HTMLElement | null) || parent;
        if (truncateEl.scrollWidth <= truncateEl.clientWidth + 1) {
          timerRef.current = null;
          return;
        }
      }
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
  const { t } = useLexicon();
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const isInsideSidePanel = React.useContext(SidePanelContext);
  const isInsideHeaderPortal = React.useContext(HeaderActionPortalContext);
  const { hubActions } = useHubActionsState();

  const mergedActions = React.useMemo(() => {
    if (
      !isInsideHeaderPortal ||
      isInsideSidePanel ||
      !hubActions ||
      hubActions.length === 0
    ) {
      return actions;
    }
    const base = actions || [];
    const existingIds = new Set(base.map((a: any) => a.id));
    return [...base, ...hubActions.filter((a: any) => !existingIds.has(a.id))];
  }, [actions, hubActions, isInsideHeaderPortal, isInsideSidePanel]);

  const hasSearch = !hideSearch && !!setSearchQuery;
  const hasActions =
    (mergedActions && mergedActions.length > 0) ||
    !!primaryPopover ||
    !!rightContent;
  const hasContent = !!leftContent || hasSearch || hasActions;

  if (!hasContent) return null;

  const isIconsOnly = !hasSearch && !leftContent && !primaryPopover;

  const widthClasses = !hasSearch
    ? "w-[fit-content] md:max-w-[fit-content]"
    : isInsideSidePanel
      ? "w-full max-w-full"
      : "w-full md:w-auto md:flex-1 md:min-w-[280px] md:max-w-lg";

  return (
    <div
      className={`flex items-center ${widthClasses} h-13 glass-panel rounded-2xl shadow-lg divide-x divide-[color-mix(in_srgb,var(--text)_6%,transparent)] animate-in slide-in-from-top-4 duration-500 relative z-20 max-w-full overflow-hidden transition-all ${className}`}
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
            {isLoading
              ? t("icon_hourglass_empty", "hourglass_empty") || "hourglass_empty"
              : t("icon_search", "search") || "search"}
          </span>
          <input
            value={searchQuery || ""}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder={searchPlaceholder || t("btn_search", "Search") || "Search..."}
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
            variant="inline"
            iconOnly={true}
            className="shrink-0 h-full flex items-center px-1.5"
            buttonClassName="!h-10 !w-10 !rounded-xl"
          >
            {primaryPopover.content}
          </FilterPopover>
        )}

        {/* DESKTOP (or Icons-Only) Action Icons */}
        {mergedActions && mergedActions.length > 0 && (
          <div
            className={`${isIconsOnly ? "flex" : "hidden sm:flex"} items-center h-full divide-x divide-[color-mix(in_srgb,var(--text)_6%,transparent)] shrink-0`}
          >
            {mergedActions.map((action) => (
              <div key={action.id} className="h-full flex items-center px-1.5">
                <button
                  onClick={action.onClick}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center gap-2 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--subtext)] hover:text-[var(--text)] group relative ${action.activeClassName || ""}`}
                >
                  <span className="material-symbols-outlined !text-[20px]">
                    {action.icon}
                  </span>
                  <HoverTooltip title={action.label} />
                </button>
              </div>
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
        {!isIconsOnly && mergedActions && mergedActions.length > 0 && (
          <div className="flex sm:hidden h-full shrink-0 items-center justify-center border-l border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
            <FilterPopover
              icon={t("icon_more_vert", "more_vert") || "more_vert"}
              variant="inline"
              iconOnly={true}
              className="shrink-0 h-full"
              buttonClassName="!h-13 w-12 !rounded-none"
            >
              <div className="flex flex-col p-2 min-w-[200px] gap-1">
                {mergedActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={action.onClick}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-left transition-colors group ${action.activeClassName?.includes("bg-") ? action.activeClassName : ""}`}
                  >
                    <span className="material-symbols-outlined !text-[18px] shrink-0 group-hover:text-[var(--text)] transition-colors">
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
