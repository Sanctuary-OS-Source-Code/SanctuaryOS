import React from 'react';
import { ActionPill } from '../../shared-components/alerts';
import { DashboardStatTile, HeaderActionPortal, SidePanelContext } from '../../shared-components/layout';
import { StatTileCarousel } from '../../hub-components/SharedCommandScreenLayout';
import { useLexicon } from '../../LexiconContext';
export {
  HubOverviewLanding,
  HubOverviewSection,
  HubListGrid,
  SidePanelHeroCard, SidePanelTitleInput,
  SidePanelPillToggle,
  UniversalGroup,
  UniversalInput,
  UniversalTextArea,
  UniversalToggle
} from '../universal/UniversalLayout';

export interface HubTab {
  id: string;
  label: string;
  icon?: string;
  number?: string | number;
  colorClass?: string; activeColor?: string;
}

interface ElevatedHubLayoutProps {
  // Header Props
  headerTitle?: string;
  headerSubtitle?: string;
  headerIcon?: string;
  headerIconColorClass?: string;
  headerBreadcrumb?: string;
  onHeaderTitleClick?: () => void;
  backButton?: React.ReactNode;
  headerCenter?: React.ReactNode;
  headerRight?: React.ReactNode;
  customStatsBar?: React.ReactNode;
  centerTitle?: boolean;
  hideTitleBlock?: boolean;


  // Utility Bar Props
  search?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  headerActions?: React.ReactNode;
  hideSearch?: boolean;
  hideHeader?: boolean;

  actions?: {
    id: string;
    icon: React.ReactNode;
    label: string;
    onClick: (e?: any) => void;
    activeClassName?: string;
  }[];

  leftContent?: React.ReactNode;
  primaryPopover?: {
    icon: string;
    label: string;
    content?: React.ReactNode; renderContent?: () => React.ReactNode; id?: string; isActive?: boolean; badgeCount?: number; widthClass?: string;
    hideLabelOnMobile?: boolean;
    buttonClassName?: string;
  };

  // Navigation (Big Stat Tiles below header)
  tabs?: HubTab[];
  activeTab?: string | any;
  onTabChange?: (id: string | any) => void;

  // Custom Content Above Scroll
  topContent?: React.ReactNode;

  // Content
  children: React.ReactNode;

  // Customization
  className?: string;
  isHiddenTab?: boolean;
}

export function ElevatedHubLayout({
  headerTitle,
  headerSubtitle,
  headerIcon,
  headerIconColorClass,
  headerBreadcrumb,
  onHeaderTitleClick,
  backButton,
  headerCenter,
  headerRight,
  customStatsBar,
  centerTitle = false,
  hideTitleBlock,
  search,
  onSearchChange,
  searchPlaceholder,
  headerActions,
  hideSearch = false,
  hideHeader = false,
  leftContent,
  primaryPopover,
  tabs = [],
  activeTab = "",
  onTabChange = () => { },
  topContent,
  children,
  className = "",
  isHiddenTab = false,
  actions
}: ElevatedHubLayoutProps) {
  const { t } = useLexicon();
  const isInsideSidePanel = React.useContext(SidePanelContext);
  const ownHeaderRef = React.useRef<HTMLElement | null>(null);
  const [hasAncestorViewHeader, setHasAncestorViewHeader] = React.useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    return Boolean(document.getElementById("hub-header-actions"));
  });

  React.useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const existing = document.getElementById("hub-header-actions");
    const isExternal = Boolean(existing && (!ownHeaderRef.current || !ownHeaderRef.current.contains(existing)));
    setHasAncestorViewHeader(isExternal);
  }, []);

  const isOverviewTab = activeTab === 'overview' || activeTab === 'LANDING';
  const hasActionPillContent = (!hideSearch && !!onSearchChange) || !!leftContent || !!headerActions || !!primaryPopover || Boolean(actions && actions.length > 0);
  const resolvedHideTitleBlock = hideTitleBlock ?? hasAncestorViewHeader;
  const shouldRenderTitleBlock = !hideHeader && !resolvedHideTitleBlock && Boolean(headerTitle);
  const shouldRenderHeaderBar = !hideHeader && (Boolean(backButton) || shouldRenderTitleBlock || Boolean(headerCenter) || Boolean(headerRight));

  return (
    <div className={`flex flex-col gap-0 animate-in fade-in duration-700 w-full h-full relative overflow-hidden ${className} ${isHiddenTab ? 'hidden' : ''}`}>
      {shouldRenderHeaderBar && (
        <header
          ref={ownHeaderRef}
          className={`flex flex-col md:flex-row w-full items-stretch md:items-center mb-6 md:mb-8 shrink-0 gap-3 md:gap-5 ${centerTitle ? 'justify-between' : 'justify-between'}`}
        >
          <div className={`flex items-center gap-3 min-w-0 ${centerTitle ? 'flex-1 justify-start' : 'shrink-0'}`}>
            {backButton}
            {shouldRenderTitleBlock && !centerTitle && (
              <div className="glass-panel rounded-2xl p-2.5 pr-4 md:p-3 md:pr-5 flex items-center gap-3 md:gap-3.5 shrink-0 min-w-0 w-fit max-w-full">
                {headerIcon && (
                  <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))]">
                    <span className={`material-symbols-outlined !text-[18px] md:!text-[22px] ${(headerIconColorClass || 'text-[var(--accent)]').split(' ').filter((c) => !c.startsWith('border-') && !c.startsWith('bg-')).join(' ')}`}>
                      {headerIcon}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-0.5 items-start justify-center text-left flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
                    <h1
                      className={`text-base md:text-xl font-black tracking-tight leading-tight m-0 text-left text-[var(--text)] shrink-0 transition-colors ${onHeaderTitleClick ? 'hover:theme-text-accent cursor-pointer' : ''}`}
                      onClick={onHeaderTitleClick}
                    >
                      {headerTitle}
                    </h1>
                    {headerBreadcrumb && (
                      <span className="px-2.5 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] md:text-[11px] font-black uppercase tracking-wider text-[var(--text)] leading-tight">
                        {headerBreadcrumb}
                      </span>
                    )}
                  </div>
                  {headerSubtitle && (
                    <h2 className="text-[10px] md:text-[11px] font-medium tracking-wide text-[var(--subtext)] m-0 text-left opacity-80 leading-snug break-words max-w-2xl">
                      {headerSubtitle}
                    </h2>
                  )}
                </div>
              </div>
            )}
          </div>

          {shouldRenderTitleBlock && centerTitle && (
            <div className="glass-panel rounded-2xl p-2.5 px-4 md:p-3 md:px-5 flex items-center justify-center gap-3 shrink-0 min-w-0 mx-auto">
              {headerIcon && (
                <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))]">
                  <span className={`material-symbols-outlined !text-[18px] md:!text-[22px] ${(headerIconColorClass || 'text-[var(--accent)]').split(' ').filter((c) => !c.startsWith('border-') && !c.startsWith('bg-')).join(' ')}`}>
                    {headerIcon}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-0.5 items-center justify-center text-center min-w-0">
                <div className="flex flex-wrap items-center justify-center gap-2 min-w-0">
                  <h1
                    className={`text-base md:text-xl font-black tracking-tight leading-tight m-0 text-[var(--text)] transition-colors ${onHeaderTitleClick ? 'hover:theme-text-accent cursor-pointer' : ''}`}
                    onClick={onHeaderTitleClick}
                  >
                    {headerTitle}
                  </h1>
                  {headerBreadcrumb && (
                    <span className="px-2.5 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] md:text-[11px] font-black uppercase tracking-wider text-[var(--text)] leading-tight">
                      {headerBreadcrumb}
                    </span>
                  )}
                </div>
                {headerSubtitle && (
                  <h2 className="text-[10px] md:text-[11px] font-medium tracking-wide text-[var(--subtext)] m-0 opacity-80 leading-snug">
                    {headerSubtitle}
                  </h2>
                )}
              </div>
            </div>
          )}

          {headerCenter && (
            <div className="flex items-center justify-center shrink-0 min-w-0">
              {headerCenter}
            </div>
          )}

          <div
            id={!hasAncestorViewHeader ? 'hub-header-actions' : undefined}
            className={`flex items-center justify-end gap-3 ${centerTitle ? 'flex-1' : 'w-full md:flex-1 max-w-5xl md:ml-auto'} empty:hidden`}
          >
            {headerRight}
          </div>
        </header>
      )}

      {!isHiddenTab && !hideHeader && !isOverviewTab && hasActionPillContent && (
        <HeaderActionPortal>
          <ActionPill
            searchQuery={search || ""}
            setSearchQuery={onSearchChange || (() => {})}
            searchPlaceholder={searchPlaceholder}
            hideSearch={hideSearch || !onSearchChange}
            leftContent={leftContent}
            rightContent={headerActions}
            primaryPopover={primaryPopover ? { ...primaryPopover, content: primaryPopover.content ?? primaryPopover.renderContent?.() } : undefined}
            actions={actions}
          />
        </HeaderActionPortal>
      )}

      <div className={`flex-1 flex flex-col h-full ${hideHeader ? "px-6 pt-4" : "px-0 pt-0"}`}>
        {/* Custom Stats Bar or Navigation Tabs (Big Stat Tiles) */}
        {customStatsBar ? (
          <div className="flex flex-col w-full gap-3 mb-8 md:mb-10 relative z-10 animate-in slide-in-from-top-4 duration-500 shrink-0">
            {customStatsBar}
          </div>
        ) : tabs.length > 0 ? (
          <div className="flex flex-col w-full gap-3 mb-8 md:mb-10 relative z-10 animate-in slide-in-from-top-4 duration-500 shrink-0">
            {isInsideSidePanel ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                {tabs.map((tab) => (
                  <DashboardStatTile
                    key={tab.id}
                    variant="filter"
                    isActive={activeTab === tab.id}
                    icon={tab.icon || t("icon_dashboard", "dashboard")}
                    label={tab.label}
                    number={tab.number}
                    onClick={() => onTabChange(tab.id)}
                    colorClass={tab.colorClass}
                  />
                ))}
              </div>
            ) : (
              <StatTileCarousel>
                {tabs.map((tab) => (
                  <DashboardStatTile
                    key={tab.id}
                    variant="tab"
                    isActive={activeTab === tab.id}
                    icon={tab.icon || t("icon_dashboard", "dashboard")}
                    label={tab.label}
                    number={tab.number}
                    onClick={() => onTabChange(tab.id)}
                    colorClass={tab.colorClass}
                  />
                ))}
              </StatTileCarousel>
            )}
          </div>
        ) : null}

        {/* Inline ActionPill when rendered inside a SidePanel (hideHeader=true) */}
        {!isHiddenTab && hideHeader && !isOverviewTab && hasActionPillContent && (
          <div className="w-full shrink-0 mb-6 relative z-20">
            <ActionPill
              className="!max-w-none !w-full"
              searchQuery={search || ""}
              setSearchQuery={onSearchChange || (() => {})}
              searchPlaceholder={searchPlaceholder}
              hideSearch={hideSearch || !onSearchChange}
              leftContent={leftContent}
              rightContent={headerActions}
              primaryPopover={primaryPopover ? { ...primaryPopover, content: primaryPopover.content ?? primaryPopover.renderContent?.() } : undefined}
              actions={actions}
            />
          </div>
        )}

        {/* Custom Top Content */}
        {topContent && (
          <div className="w-full shrink-0 relative z-10">
            {topContent}
          </div>
        )}

        {/* Global Content Wrapper */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 pb-12 md:pb-32">
          {children}
        </div>
      </div>
    </div>
  );
}


