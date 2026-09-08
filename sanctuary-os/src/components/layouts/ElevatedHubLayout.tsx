import React from 'react';
import { ScreenUtilityBar, DashboardStatTile, useIsMobile } from '../../shared';

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
  children,
  className = "",
  isHiddenTab = false
}: ElevatedHubLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className={`flex flex-col gap-0 animate-in fade-in duration-700 w-full h-full relative overflow-hidden ${className} ${isHiddenTab ? 'hidden' : ''}`}>
      {!isHiddenTab && !hideHeader && (
        <ScreenUtilityBar
          search={search}
          onSearchChange={onSearchChange!}
          searchPlaceholder={searchPlaceholder || "Search..."}
          hideSearch={hideSearch}
          className="mb-8"
        >
          {leftContent}
          {headerActions}
        </ScreenUtilityBar>
      )}

      <div className="flex-1 flex flex-col h-full overflow-hidden px-6 pt-4">
        {/* Navigation Tabs (Big Stat Tiles) */}
        {tabs.length > 0 && (
          <div className={`grid grid-cols-2 ${tabs.length === 2 ? 'md:grid-cols-2' : tabs.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4 lg:gap-6 w-full relative z-10 animate-in slide-in-from-top-4 duration-500 mb-4 md:mb-8 shrink-0`}>
            {tabs.map((tab) => (
              <DashboardStatTile
                key={tab.id}
                isActive={activeTab === tab.id}
                icon={isMobile || !tab.icon ? null : <span className="material-symbols-outlined">{tab.icon}</span>}
                label={tab.label}
                number={tab.number?.toString()}
                onClick={() => onTabChange(tab.id)}
                colorClass={activeTab === tab.id ? (tab.colorClass || "text-[var(--accent)]") : "text-[var(--subtext)] hover:text-[var(--text)]"}
                className={activeTab !== tab.id ? "cursor-pointer shadow-none border-transparent" : "cursor-pointer shadow-[0_0_30px_color-mix(in_srgb,currentColor_15%,transparent)] border-[color-mix(in_srgb,currentColor_30%,transparent)] scale-[1.02]"}
              />
            ))}
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


