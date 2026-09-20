import React from 'react';
import { ActionPill, DashboardStatTile, useIsMobile, HeaderActionPortal } from '../../shared';
import { StatTileCarousel } from '../../hub-components/SharedCommandScreenLayout';

export interface HubTab {
  id: string;
  label: string;
  icon?: string;
  number?: string | number;
  colorClass?: string;
}

interface ElevatedHubLayoutProps {
  // Header Props
  headerTitle?: string;
  headerSubtitle?: string;
  headerIcon?: string;
  headerIconColorClass?: string;
  headerBreadcrumb?: string;
  onHeaderTitleClick?: () => void;


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
    content: React.ReactNode;
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
  const isMobile = useIsMobile();

  return (
    <div className={`flex flex-col gap-0 animate-in fade-in duration-700 w-full h-full relative overflow-hidden ${className} ${isHiddenTab ? 'hidden' : ''}`}>
      {!isHiddenTab && !hideHeader && (
        <HeaderActionPortal>
          <ActionPill
            searchQuery={search || ""}
            setSearchQuery={onSearchChange || (() => {})}
            searchPlaceholder={searchPlaceholder || "Search..."}
            hideSearch={hideSearch}
            leftContent={leftContent}
            rightContent={headerActions}
            primaryPopover={primaryPopover}
            actions={actions}
          />
        </HeaderActionPortal>
      )}

      <div className="flex-1 flex flex-col h-full px-6 pt-4">
        {/* Navigation Tabs (Big Stat Tiles) */}
        {tabs.length > 0 && (
          <div className="flex flex-col w-[calc(100%+3rem)] -mx-6 md:w-full md:mx-0 md:-translate-x-0 md:left-0 gap-3 mb-6 md:mb-8 -mt-4 relative z-10 animate-in slide-in-from-top-4 duration-500 shrink-0">
            <StatTileCarousel innerClassName="px-6 md:px-0">
              {tabs.map((tab) => (
                <DashboardStatTile
                  key={tab.id}
                  variant="tab"
                  isActive={activeTab === tab.id}
                  icon={tab.icon || "dashboard"}
                  label={tab.label}
                  number={tab.number}
                  onClick={() => onTabChange(tab.id)}
                  colorClass={tab.colorClass}
                />
              ))}
            </StatTileCarousel>
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


