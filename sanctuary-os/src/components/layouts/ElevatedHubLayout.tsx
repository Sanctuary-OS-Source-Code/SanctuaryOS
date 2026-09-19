import React from 'react';
import { ActionPill, DashboardStatTile, useIsMobile, HeaderActionPortal, HubTabButton } from '../../shared';
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
  leftContent?: React.ReactNode;

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
  tabs = [],
  activeTab = "",
  onTabChange = () => { },
  topContent,
  children,
  className = "",
  isHiddenTab = false
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
          />
        </HeaderActionPortal>
      )}

      <div className="flex-1 flex flex-col h-full px-6 pt-4">
        {/* Navigation Tabs (Big Stat Tiles) */}
        {tabs.length > 0 && (
          <div className="w-full relative z-10 animate-in slide-in-from-top-4 duration-500 mb-4 md:mb-8 shrink-0">
            <div className="grid grid-cols-2 md:flex md:flex-row w-full gap-3">
              {tabs.map((tab) => (
                <HubTabButton
                  key={tab.id}
                  id={tab.id}
                  icon={tab.icon}
                  label={tab.label}
                  activeTab={activeTab}
                  setTab={onTabChange}
                />
              ))}
            </div>
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


