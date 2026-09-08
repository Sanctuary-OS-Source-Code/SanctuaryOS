import React from 'react';

interface TabOption {
  id: string;
  label: string;
  icon?: string;
}

interface MobileSegmentedControlProps {
  tabs: TabOption[];
  activeTab: string;
  setTab: (tab: string) => void;
  className?: string;
}

export function MobileSegmentedControl({ tabs, activeTab, setTab, className = "" }: MobileSegmentedControlProps) {
  return (
    <div className={`w-full overflow-x-auto custom-scrollbar md:hidden ${className}`}>
      <div className="flex items-center w-max min-w-full border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`relative flex items-center justify-center gap-2 px-6 py-4 transition-all duration-300 group
                ${isActive ? 'text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)]'}`}
            >
              {tab.icon && (
                <span className={`material-symbols-outlined !text-[18px] transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                  {tab.icon}
                </span>
              )}
              <span className="font-black uppercase tracking-widest text-[10px] whitespace-nowrap">
                {tab.label}
              </span>

              <div
                className={`absolute bottom-0 left-0 right-0 h-[2px] transition-all duration-300 
                  ${isActive
                    ? 'bg-[var(--accent)] opacity-100 scale-x-100'
                    : 'bg-[color-mix(in_srgb,var(--text)_20%,transparent)] opacity-0 scale-x-50 group-hover:opacity-100 group-hover:scale-x-75'
                  }`}
              />

              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent pointer-events-none opacity-50" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
