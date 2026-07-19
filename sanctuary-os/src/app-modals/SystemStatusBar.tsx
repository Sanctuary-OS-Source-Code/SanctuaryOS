import React from 'react';
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";

export function SystemStatusBar({ isSidebarCollapsed, isNotificationSidebarOpen, setIsNotificationSidebarOpen, unreadNotificationCount, isLogExpanded, setIsLogExpanded, status, isScanning, scanProgress, isErrorStatus, isSuccessStatus, statusBgClass, statusAccentClass, statusIconClass, statusTextClass, updatePayload, isSystemStatusOpen, setIsSystemStatusOpen, setIsSideBrowserOpen }: any) {
  const { t } = useLexicon();
  const nexusUpdatesCount = useStore(state => state.nexusUpdatesCount);
  const nexusUpdateTabs = useStore(state => state.nexusUpdateTabs);
  const setView = useStore(state => state.setView);
  const setMarketTab = useStore(state => state.setMarketTab);
  const isSideBrowserOpen = useModalStore(state => state.isSideBrowserOpen);
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 h-10 backdrop-blur-2xl border-t flex items-center z-[999] font-mono text-[10px] tracking-widest uppercase transition-all duration-300 ${statusBgClass} select-none border-[color-mix(in_srgb,var(--text)_5%,transparent)]`}
    >
      <div
        className="h-full flex items-center justify-center border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0"
        style={{ width: isSidebarCollapsed ? '80px' : 'var(--sidebarWidth, 288px)' }}
      >
        <div
          className="flex-1 h-full flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors relative border-l border-[color-mix(in_srgb,var(--text)_5%,transparent)] group"
          onClick={() => setIsNotificationSidebarOpen(!isNotificationSidebarOpen)}
        >
          <div className="relative flex items-center justify-center">
            <span className={`material-symbols-outlined text-[16px] transition-all ${isNotificationSidebarOpen ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent)]' : unreadNotificationCount > 0 ? 'text-[var(--accent)] animate-pulse drop-shadow-[0_0_5px_var(--accent)]' : 'opacity-70 group-hover:opacity-100'}`}>
              {t("icon_notifications")}
            </span>
          </div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none backdrop-blur-xl">
            {t("tab_notifs")}
          </div>
        </div>

        <div
          className="flex-1 h-full flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors relative group"
          onClick={() => setView('settings')}
        >
          <span className="material-symbols-outlined text-[16px] opacity-70 group-hover:opacity-100 transition-opacity">
            {t("icon_settings")}
          </span>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none backdrop-blur-xl">
            {t("sidebar_settings")}
          </div>
        </div>
      </div>

      <div
        className="flex-1 flex items-center gap-3 px-6 h-full cursor-pointer hover:brightness-110 active:brightness-95"
        onClick={() => setIsLogExpanded(!isLogExpanded)}
      >
        <span className={`material-symbols-outlined text-sm shrink-0 opacity-70 ${statusIconClass}`}>
          {isErrorStatus ? 'error' : isSuccessStatus ? 'check_circle' : 'terminal'}
        </span>
        <span className={`${statusTextClass} opacity-50 shrink-0`}>{t("status")} </span>
        <span className={`${isErrorStatus ? 'text-red-100' : isSuccessStatus ? 'text-emerald-100' : 'text-[var(--text)]'} font-bold truncate flex-1 flex items-center drop-shadow-md`}>
          {(() => {
            if (typeof status !== 'string') return status;
            const match = status.match(/^([a-z_0-9]+)\s+(.*)$/);
            const knownIcons = ['check_circle', 'warning', 'error', 'info', 'sync', 'flight_takeoff', 'radar', 'terminal', 'bug_report', 'extension', 'block', 'update', 'done', 'download', 'delete', 'close', 'add', 'verified', 'new_releases', 'local_fire_department', 'health_and_safety', 'folder_open', 'inventory_2', 'account_tree', 'priority_high'];
            if (match && (knownIcons.includes(match[1]) || match[1].includes('_'))) {
              return (
                <span className="flex items-center gap-2">
                  <span className={`material-symbols-outlined !text-[14px] leading-none ${statusIconClass}`}>{match[1]}</span>
                  <span className="truncate">{match[2]}</span>
                </span>
              );
            }
            return <span className="truncate">{status}</span>;
          })()}
        </span>

        {isScanning && (
          <div className={`flex items-center gap-4 h-full pl-6 shrink-0 w-80 animate-in fade-in duration-300 ${isErrorStatus ? 'border-red-500/20' : isSuccessStatus ? 'border-emerald-500/20' : 'border-white/5'}`}>
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-lg animate-spin-slow ${statusIconClass}`}>{t("icon_radar")}</span>
              <span className={`text-[9px] font-black uppercase tracking-widest ${isErrorStatus ? 'text-red-300' : isSuccessStatus ? 'text-emerald-300' : 'text-[var(--text)]'}`}>{t("btn_radar")}</span>
            </div>
            <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isErrorStatus ? 'bg-red-900/50' : isSuccessStatus ? 'bg-emerald-900/50' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
              <div className={`h-full transition-all duration-300 relative ${statusAccentClass}`} style={{ width: `${scanProgress?.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%` }}>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-[200%] animate-pulse" />
              </div>
            </div>
            <span className={`text-[9px] font-mono font-bold w-8 text-right ${statusTextClass}`}>{scanProgress?.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0}%</span>
          </div>
        )}

        {nexusUpdatesCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setView('nexus');
              if (nexusUpdateTabs && nexusUpdateTabs.length > 0) {
                setMarketTab(nexusUpdateTabs[0]);
              }
            }}
            className="flex items-center justify-center h-full px-5 shrink-0 cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group text-[var(--accent)] relative"
          >
            <span className="material-symbols-outlined !text-[16px] animate-pulse">cloud_download</span>
            <div className="absolute bottom-full right-0 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none backdrop-blur-xl z-[100]">
              {nexusUpdatesCount} {t("updates_ready")}
            </div>
          </button>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); setIsSystemStatusOpen((prev: boolean) => !prev); }}
          className={`flex items-center justify-center h-full px-5 shrink-0 cursor-pointer transition-colors group relative
              ${isSystemStatusOpen ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-[var(--text)] opacity-90 hover:opacity-100'}
              ${updatePayload ? 'theme-text-accent hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] font-bold' : ''}
              ${isErrorStatus ? 'text-red-500 hover:bg-red-500/10' : ''}
              ${isSuccessStatus ? 'text-emerald-500 hover:bg-emerald-500/10' : ''}`}
        >
          <div className="relative flex items-center justify-center">
            <span className={`material-symbols-outlined !text-[16px] transition-transform duration-500 group-hover:scale-110 ${updatePayload || isErrorStatus ? 'animate-pulse' : ''}`}>
              memory
            </span>
            {updatePayload && (
              <span className="material-symbols-outlined absolute -bottom-1 -right-1 !text-[10px] text-[var(--accent)] drop-shadow-[0_0_5px_rgba(var(--accent-rgb),1)]">
                download
              </span>
            )}
          </div>
          <div className="absolute bottom-full right-0 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none backdrop-blur-xl z-[100]">
            {updatePayload ? t("sys_stat_update_available") : t("system_status")}
          </div>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setIsSideBrowserOpen(!isSideBrowserOpen); }}
          className={`flex items-center justify-center h-full px-5 shrink-0 cursor-pointer transition-colors group relative ${isSideBrowserOpen ? 'bg-white/10 text-white opacity-100' : 'hover:bg-white/5 text-[var(--text)] opacity-90 hover:opacity-100'}`}
        >
          <span className="material-symbols-outlined !text-[16px] transition-transform duration-500 group-hover:scale-110">public</span>
          <div className="absolute bottom-full right-0 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none backdrop-blur-xl z-[100]">
            {t("sidebar_web_browser")}
          </div>
        </button>
      </div>
    </div>
  );
}
