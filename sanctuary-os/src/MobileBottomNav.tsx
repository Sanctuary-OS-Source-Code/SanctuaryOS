import React, { useState } from 'react';
import { useStore } from './store';
import { useLexicon } from './LexiconContext';
import { useTheme } from './ThemeContext';
import { isRootDomain } from './utils/routingUtils';

export function MobileBottomNav({ view, setView }: { view: string, setView: (v: string) => void }) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const userRole = useStore((state) => state.userRole);
  const osRole = useStore((state) => state.osRole);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const schemaFeatures = activeGameSchema?.features || { has_cc: true, has_saves: true };
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const tabs = [];

  if (isRootDomain()) {
    tabs.push({ id: 'workspaces', icon: 'public', label: t("landing_workspaces") || 'Workspaces' });
    tabs.push({ id: 'news', icon: 'newspaper', label: t("landing_news") || 'News' });
    tabs.push({ id: 'download', icon: 'download', label: t("landing_download_sidebar") || 'Download' });
    tabs.push({ id: 'menu', icon: 'menu', label: t("ui_btn_more") || 'More' });
  } else {
    tabs.push({ id: 'dashboard', icon: t("icon_desktop_windows") || "desktop_windows", label: t("center_title") || 'Dashboard' });
    if (localStorage.getItem("sanctuary_blacklisted") !== "true") {
      tabs.push({ id: 'nexus', icon: t("icon_hub") || "hub", label: t("market_title") || 'Nexus' });
      tabs.push({ id: 'GlobalFeed', icon: t("icon_satellite_alt") || "satellite_alt", label: t("feed_title") || 'Feed' });
    }

    // Everyone gets the "More" menu
    tabs.push({ id: 'menu', icon: 'menu', label: t("ui_btn_more") || 'More' });
  }

  const handleTabClick = (tabId: string) => {
    if (tabId === 'menu') {
      setIsMenuOpen(!isMenuOpen);
    } else if (isRootDomain()) {
      if (tabId === 'workspaces') {
        setView('landing');
        setTimeout(() => document.getElementById('workspaces')?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else if (tabId === 'news') {
        setView('landing');
        setTimeout(() => document.getElementById('news')?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else if (tabId === 'download') {
        setView('landing');
        setTimeout(() => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        setIsMenuOpen(false);
        setView(tabId);
      }
    } else {
      setIsMenuOpen(false);
      setView(tabId);
    }
  };

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-[80px] z-[999999] flex items-center justify-around px-2 glass-panel !rounded-none !border-x-0 !border-b-0 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(tab => {
          const isActive = view === tab.id || (tab.id === 'menu' && isMenuOpen);
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all duration-500 relative ${isActive ? 'text-[var(--accent)] opacity-100' : 'text-[var(--text)] opacity-50 hover:opacity-80'}`}
            >
              {isActive && (
                <div className="absolute inset-0 top-1/2 -translate-y-1/2 w-12 h-12 mx-auto bg-[var(--accent)] blur-[20px] opacity-20 rounded-full pointer-events-none" />
              )}
              <span className={`material-symbols-outlined relative z-10 transition-all duration-500 ${isActive ? 'text-[24px] -translate-y-3 drop-shadow-[0_0_8px_var(--accent)]' : 'text-[20px] translate-y-0'}`}>
                {tab.icon}
              </span>
              <span className={`text-[9px] font-black w-full text-center px-1 leading-[1.1] uppercase tracking-[0.2em] transition-all duration-500 absolute bottom-2 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className={`md:hidden fixed inset-x-0 bottom-[80px] z-[999998] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isMenuOpen ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'}`}
      >
        <div className="mx-4 mb-4 p-4 glass-panel !rounded-3xl shadow-2xl flex flex-col gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div className="w-12 h-1 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-auto mb-2 shrink-0" />

          {/* System Navigation */}
          {!isRootDomain() && (
            <button onClick={() => {
              const parts = window.location.host.split('.');
              if (parts.length > 1) {
                window.location.href = `http://${parts.slice(1).join('.')}`;
              } else {
                window.location.href = "/";
              }
            }} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-[var(--accent)] text-[20px]">public</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("return_to_hub") || "Workspaces"}</span>
            </button>
          )}

          {!session?.user && (
            <button onClick={() => {
              localStorage.setItem("sanctuary_show_login", "true");
              window.location.reload();
            }} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-[var(--accent)] text-[20px]">{t("icon_key") || "key"}</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("sidebar_signin") || "Sign In"}</span>
            </button>
          )}

          <button onClick={() => { setIsMenuOpen(false); handleTabClick('settings'); }} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
            <span className="material-symbols-outlined text-[var(--accent)] text-[20px]">{t("icon_settings") || "settings"}</span>
            <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("btn_settings") || "Settings"}</span>
          </button>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent my-1" />

          {["mason", "architect", "oversight", "wayfinder", "admin"].includes(userRole) && !isRootDomain() && (
            <button onClick={() => handleTabClick('MasonHub')} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-orange-400 text-[20px]">{t("icon_construction") || "construction"}</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("sidebar_mason_hub") || "Mason Hub"}</span>
            </button>
          )}

          {["architect", "oversight", "wayfinder", "admin"].includes(userRole) && !isRootDomain() && (
            <button onClick={() => handleTabClick('ArchitectHub')} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-purple-400 text-[20px]">{t("icon_analytics") || "analytics"}</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("sidebar_architect_hub") || "Architect Hub"}</span>
            </button>
          )}

          {["oversight", "wayfinder", "admin"].includes(userRole) && !isRootDomain() && (
            <button onClick={() => handleTabClick('Oversight')} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-red-400 text-[20px]">{t("icon_security") || "security"}</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("wf_tab_command") || "Oversight"}</span>
            </button>
          )}

          {(userRole === "wayfinder" || userRole === "admin") && !isRootDomain() && (
            <button onClick={() => handleTabClick('WayfinderHub')} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-blue-400 text-[20px]">{t("icon_terminal") || "terminal"}</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("ui_btn_operations") || "Wayfinder Tools"}</span>
            </button>
          )}

          {["core_dev", "admin", "keeper"].includes(osRole) && (
            <button onClick={() => handleTabClick('KeepersCore')} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-green-400 text-[20px]">{t("icon_terminal") || "terminal"}</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("sidebar_keepers_core") || "Keepers Core"}</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
