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
  const masonActiveTab = useStore((state: any) => state.masonActiveTab);
  const setMasonActiveTab = useStore((state: any) => state.setMasonActiveTab);
  const architectActiveTab = useStore((state: any) => state.architectActiveTab);
  const setArchitectActiveTab = useStore((state: any) => state.setArchitectActiveTab);
  const oversightActiveTab = useStore((state: any) => state.oversightActiveTab);
  const setOversightActiveTab = useStore((state: any) => state.setOversightActiveTab);
  const wayfinderActiveTab = useStore((state: any) => state.wayfinderActiveTab);
  const setWayfinderActiveTab = useStore((state: any) => state.setWayfinderActiveTab);
  const keepersActiveTab = useStore((state: any) => state.keepersActiveTab);
  const setKeepersActiveTab = useStore((state: any) => state.setKeepersActiveTab);
  const schemaFeatures = activeGameSchema?.features || { has_cc: true, has_saves: true };
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHubNavOpen, setIsHubNavOpen] = useState(false);

  const tabs = [];

  let hubNavLabel = "";
  let hubNavIcon = "";

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

    if (view === "MasonHub") { hubNavLabel = t("sidebar_mason_hub") || 'Mason Workshop'; hubNavIcon = 'construction'; }
    else if (view === "ArchitectHub") { hubNavLabel = t("sidebar_architect_hub") || 'Architect Hub'; hubNavIcon = 'analytics'; }
    else if (view === "Oversight") { hubNavLabel = t("wf_tab_command") || 'Oversight'; hubNavIcon = 'security'; }
    else if (view === "WayfinderHub") { hubNavLabel = t("ui_btn_operations") || 'Wayfinder Tools'; hubNavIcon = 'terminal'; }
    else if (view === "KeepersCore") { hubNavLabel = t("sidebar_keepers_core") || 'Keepers Core'; hubNavIcon = 'terminal'; }

    if (hubNavLabel) {
      tabs.push({ id: 'hub_nav', icon: hubNavIcon, label: hubNavLabel });
    }

    // Everyone gets the "More" menu
    tabs.push({ id: 'menu', icon: 'menu', label: t("ui_btn_more") || 'More' });
  }

  const handleTabClick = (tabId: string) => {
    if (tabId === 'menu') {
      setIsMenuOpen(!isMenuOpen);
      setIsHubNavOpen(false);
    } else if (tabId === 'hub_nav') {
      setIsHubNavOpen(!isHubNavOpen);
      setIsMenuOpen(false);
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
        setIsHubNavOpen(false);
        setView(tabId);
      }
    } else {
      setIsMenuOpen(false);
      setIsHubNavOpen(false);
      setView(tabId);
    }
  };

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-[80px] z-[999999] flex items-center justify-around px-2 glass-panel !rounded-none !border-x-0 !border-b-0 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(tab => {
          const isActive = view === tab.id || (tab.id === 'menu' && isMenuOpen) || (tab.id === 'hub_nav' && (isHubNavOpen || ["MasonHub", "ArchitectHub", "Oversight", "WayfinderHub", "KeepersCore"].includes(view)));
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
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("mason_hub_title") || "Mason Workshop"}</span>
            </button>
          )}

          {["architect", "oversight", "wayfinder", "admin"].includes(userRole) && !isRootDomain() && (
            <button onClick={() => handleTabClick('ArchitectHub')} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-purple-400 text-[20px]">{t("icon_analytics") || "analytics"}</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("hub_title") || "Architect Hub"}</span>
            </button>
          )}

          {["oversight", "wayfinder", "admin"].includes(userRole) && !isRootDomain() && (
            <button onClick={() => handleTabClick('Oversight')} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-red-400 text-[20px]">{t("icon_security") || "security"}</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("sa_title") || "Oversight"}</span>
            </button>
          )}

          {(userRole === "wayfinder" || userRole === "admin") && !isRootDomain() && (
            <button onClick={() => handleTabClick('WayfinderHub')} className="p-4 rounded-xl flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
              <span className="material-symbols-outlined text-blue-400 text-[20px]">{t("icon_terminal") || "terminal"}</span>
              <span className="font-black tracking-widest text-[12px] uppercase text-[var(--text)]">{t("wf_hub_title") || "Wayfinder Tools"}</span>
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

      {/* Hub Navigation Drawer */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-[80px] z-[999998] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isHubNavOpen ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'}`}
      >
        <div className="mx-4 mb-4 p-4 glass-panel !rounded-3xl shadow-2xl flex flex-col gap-2 max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar">
          <div className="w-12 h-1 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-auto mb-4 shrink-0" />

          <div className="flex items-center gap-2 mb-2 px-4 shrink-0">
            <span className="material-symbols-outlined text-[var(--accent)] !text-[20px]">{hubNavIcon}</span>
            <span className="font-black tracking-widest text-[14px] uppercase text-[var(--text)]">{hubNavLabel}</span>
          </div>

          <div className="flex flex-col gap-1 w-full pb-8">
            {view === "MasonHub" && [
              { id: "command_center", icon: t("icon_desktop_windows") || "desktop_windows", label: (t("wf_tab_command") || "Command Center").replace(/^[^\w]*/, '').trim() },
              { id: "registry", icon: t("icon_deployed_code") || "deployed_code", label: (t("items") || "Registry").replace(/^[^\w]*/, '').trim() },
              { id: "nexus", icon: t("icon_hub") || "hub", label: (t("tab_nexus") || "Nexus").replace(/^[^\w]*/, '').trim() },
              { id: "collections", icon: t("icon_collections_bookmark") || "collections_bookmark", label: (t("tab_cc") || "Collections").replace(/^[^\w]*/, '').trim() },
              { id: "protocols", icon: t("icon_link") || "link", label: (t("tab_protocols") || "Protocols").replace(/^[^\w]*/, '').trim() },
              { id: "structure", icon: t("icon_architecture") || "architecture", label: (t("tab_structure") || "Structure").replace(/^[^\w]*/, '').trim() },
              { id: "conflicts", icon: t("icon_security") || "security", label: (t("tab_matrix") || "Conflicts").replace(/^[^\w]*/, '').trim() },
              { id: "posts", icon: t("icon_edit_document") || "edit_document", label: (t("tab_posts") || "Posts").replace(/^[^\w]*/, '').trim() },
              { id: "bug_reports", icon: t("icon_bug_report") || "bug_report", label: (t("stat_bugs") || "Bug Reports").replace(/^[^\w]*/, '').trim() },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setMasonActiveTab(tab.id);
                  setIsHubNavOpen(false);
                }}
                className={`p-4 rounded-xl flex items-center gap-4 transition-all ${masonActiveTab === tab.id ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
              >
                <span className={`material-symbols-outlined text-[20px] ${masonActiveTab === tab.id ? 'text-[var(--accent)]' : ''}`}>{tab.icon}</span>
                <span className="font-black tracking-widest text-[12px] uppercase">{tab.label}</span>
              </button>
            ))}

            {view === "ArchitectHub" && [
              { id: "command_center", icon: t("icon_desktop_windows") || "desktop_windows", label: (t("wf_tab_command") || "Command Center").replace(/^[^\w]*/, '').trim() },
              { id: "registry", icon: t("icon_inventory_2") || "inventory_2", label: (t("items") || "Registry").replace(/^[^\w]*/, '').trim() },
              { id: "queue", icon: t("icon_search") || "search", label: (t("tab_queue") || "Queue").replace(/^[^\w]*/, '').trim() },
              { id: "lab", icon: t("icon_monitor_heart") || "monitor_heart", label: (t("tab_diagnostics") || "Diagnostics").replace(/^[^\w]*/, '').trim() },
              { id: "collections", icon: t("icon_collections_bookmark") || "collections_bookmark", label: (t("tab_cc") || "Collections").replace(/^[^\w]*/, '').trim() },
              { id: "protocols", icon: t("icon_link") || "link", label: (t("tab_protocols") || "Protocols").replace(/^[^\w]*/, '').trim() },
              { id: "structure", icon: t("icon_architecture") || "architecture", label: (t("tab_structure") || "Structure").replace(/^[^\w]*/, '').trim() },
              { id: "matrix", icon: t("icon_security") || "security", label: (t("tab_matrix") || "Matrix").replace(/^[^\w]*/, '').trim() },
              { id: "mason_queue", icon: t("icon_construction") || "construction", label: (t("mason") || "Mason").replace(/^[^\w]*/, '').trim() },
              { id: "template_oversight", icon: t("icon_data_object") || "data_object", label: (t("ql_templates") || "Templates").replace(/^[^\w]*/, '').trim() },
              { id: "nexus_reports", icon: t("icon_flag") || "flag", label: (t("stat_bugs") || "Bug Reports").replace(/^[^\w]*/, '').trim() },
              { id: "support_tickets", icon: t("icon_local_activity") || "local_activity", label: (t("wf_tab_tickets") || "Tickets").replace(/^[^\w]*/, '').trim() },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setArchitectActiveTab(tab.id);
                  setIsHubNavOpen(false);
                }}
                className={`p-4 rounded-xl flex items-center gap-4 transition-all ${architectActiveTab === tab.id ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
              >
                <span className={`material-symbols-outlined text-[20px] ${architectActiveTab === tab.id ? 'text-[var(--accent)]' : ''}`}>{tab.icon}</span>
                <span className="font-black tracking-widest text-[12px] uppercase">{tab.label}</span>
              </button>
            ))}

            {view === "Oversight" && [
              { id: "command_center", icon: t("icon_desktop_windows") || "desktop_windows", label: (t("wf_tab_command") || "Command Center").replace(/^[^\w]*/, '').trim() },
              { id: "oversight_comms", icon: t("icon_satellite_alt") || "satellite_alt", label: (t("wf_tab_dispatch") || "Dispatch").replace(/^[^\w]*/, '').trim() },
              { id: "identities", icon: t("icon_group") || "group", label: (t("tab_identities") || "Identities").replace(/^[^\w]*/, '').trim() },
              { id: "compliance", icon: t("icon_policy") || "policy", label: (t("tab_compliance") || "Compliance").replace(/^[^\w]*/, '').trim() },
              { id: "linker", icon: t("icon_link") || "link", label: (t("tab_linker") || "Linker").replace(/^[^\w]*/, '').trim() },
              { id: "malware_oversight", icon: t("icon_coronavirus") || "coronavirus", label: (t("rating_malware") || "Malware").replace(/^[^\w]*/, '').trim() },
              { id: "oversight_reports", icon: t("icon_threat_intelligence") || "threat_intelligence", label: (t("tab_malware_logs") || "Threats").replace(/^[^\w]*/, '').trim() },
              { id: "sanctuary_tickets", icon: t("icon_local_activity") || "local_activity", label: (t("wf_tab_tickets") || "Tickets").replace(/^[^\w]*/, '').trim() },
              { id: "mass_update", icon: t("icon_dynamic_feed") || "dynamic_feed", label: (t("tab_mass_update") || "Mass Update").replace(/^[^\w]*/, '').trim() },
              { id: "game_versions", icon: t("icon_settings") || "settings", label: (t("tab_game_versions") || "Game Versions").replace(/^[^\w]*/, '').trim() },
              { id: "support_settings", icon: t("icon_support_agent") || "support_agent", label: (t("wf_tab_support") || "Support").replace(/^[^\w]*/, '').trim() },
              { id: "audit_logs", icon: t("icon_history") || "history", label: (t("tab_audit") || "Audit Logs").replace(/^[^\w]*/, '').trim() },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setOversightActiveTab(tab.id);
                  setIsHubNavOpen(false);
                }}
                className={`p-4 rounded-xl flex items-center gap-4 transition-all ${oversightActiveTab === tab.id ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
              >
                <span className={`material-symbols-outlined text-[20px] ${oversightActiveTab === tab.id ? 'text-[var(--accent)]' : ''}`}>{tab.icon}</span>
                <span className="font-black tracking-widest text-[12px] uppercase">{tab.label}</span>
              </button>
            ))}

            {view === "WayfinderHub" && [
              { id: "command_center", icon: t("icon_desktop_windows") || "desktop_windows", label: (t("wf_tab_command") || "Command Center").replace(/^[^\w]*/, '').trim() },
              { id: "wf_comms_title", icon: t("icon_satellite_alt") || "satellite_alt", label: (t("wf_tab_dispatch") || "Dispatch").replace(/^[^\w]*/, '').trim() },
              { id: "sanctuary_tickets", icon: t("icon_local_activity") || "local_activity", label: (t("wf_tab_tickets") || "Tickets").replace(/^[^\w]*/, '').trim() },
              { id: "identities", icon: t("icon_group") || "group", label: (t("tab_identities") || "Identities").replace(/^[^\w]*/, '').trim() },
              { id: "linker", icon: t("icon_link") || "link", label: (t("tab_linker") || "Linker").replace(/^[^\w]*/, '').trim() },
              { id: "compliance", icon: t("icon_policy") || "policy", label: (t("tab_compliance") || "Compliance").replace(/^[^\w]*/, '').trim() },
              { id: "malware_oversight", icon: t("icon_coronavirus") || "coronavirus", label: (t("rating_malware") || "Malware").replace(/^[^\w]*/, '').trim() },
              { id: "oversight_reports", icon: t("icon_threat_intelligence") || "threat_intelligence", label: (t("tab_malware_logs") || "Threats").replace(/^[^\w]*/, '').trim() },
              { id: "reports", icon: t("icon_flag") || "flag", label: (t("stat_bugs") || "Reports").replace(/^[^\w]*/, '').trim() },
              { id: "audit_logs", icon: t("icon_history") || "history", label: (t("tab_audit") || "Audit Logs").replace(/^[^\w]*/, '').trim() },
              { id: "support_settings", icon: t("icon_support_agent") || "support_agent", label: (t("wf_tab_support") || "Support Settings").replace(/^[^\w]*/, '').trim() },
              { id: "ide", icon: "code", label: "WAYFINDER IDE" },
              { id: "chameleons", icon: "palette", label: (t("wf_master_themes") || "Themes").replace(/^[^\w]*/, '').trim() },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setWayfinderActiveTab(tab.id);
                  setIsHubNavOpen(false);
                }}
                className={`p-4 rounded-xl flex items-center gap-4 transition-all ${wayfinderActiveTab === tab.id ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
              >
                <span className={`material-symbols-outlined text-[20px] ${wayfinderActiveTab === tab.id ? 'text-[var(--accent)]' : ''}`}>{tab.icon}</span>
                <span className="font-black tracking-widest text-[12px] uppercase">{tab.label}</span>
              </button>
            ))}

            {view === "KeepersCore" && [
              { id: "command_center", icon: t("icon_desktop_windows") || "desktop_windows", label: (t("wf_tab_command") || "Command Center").replace(/^[^\w]*/, '').trim() },
              { id: "keepers_comms", icon: t("icon_satellite_alt") || "satellite_alt", label: (t("wf_tab_dispatch") || "Dispatch").replace(/^[^\w]*/, '').trim() },
              { id: "web_directives", icon: "folder_special", label: "System Directives" },
              { id: "web_news", icon: "public", label: "Website News" },
              { id: "web_legal", icon: "gavel", label: "Legal Documents" },
              { id: "active_games", icon: "dns", label: "Active Workspaces" },
              { id: "identities", icon: "group", label: "Citizen Oversight" },
              { id: "support", icon: t("icon_support_agent") || "support_agent", label: "Support Center" },
              { id: "support_settings", icon: t("icon_support_agent") || "support_agent", label: (t("wf_tab_support") || "Support Settings").replace(/^[^\w]*/, '').trim() },
              { id: "audit_logs", icon: t("icon_history") || "history", label: (t("audit_title") || "Audit").replace(/^[^\w]*/, '').trim() },
              { id: "ide", icon: "code", label: "Keepers IDE" },
              { id: "chameleons", icon: "palette", label: (t("wf_master_themes") || "Themes").replace(/^[^\w]*/, '').trim() },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setKeepersActiveTab(tab.id);
                  setIsHubNavOpen(false);
                }}
                className={`p-4 rounded-xl flex items-center gap-4 transition-all ${keepersActiveTab === tab.id ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
              >
                <span className={`material-symbols-outlined text-[20px] ${keepersActiveTab === tab.id ? 'text-[var(--accent)]' : ''}`}>{tab.icon}</span>
                <span className="font-black tracking-widest text-[12px] uppercase">{tab.label}</span>
              </button>
            ))}

          </div>
        </div>
      </div>

    </>
  );
}
