import React from 'react';
import { useLexicon } from "../LexiconContext";
import { useStore } from '../store';

export function SystemLogModal({ isLogExpanded, setIsLogExpanded, statusLog, clearStatusLog, logModalRef, handleLogPointerDown, handleLogPointerMove, handleLogPointerUp }: any) {
  const { t } = useLexicon();

  if (!isLogExpanded || !statusLog || statusLog.length === 0) return null;

  return (
    <div
      ref={logModalRef}
      className="fixed bottom-14 right-4 w-[420px] max-h-[60vh] theme-glass-panel border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_30px_rgba(var(--accent-rgb),0.15)] rounded-[var(--radius)] z-[99998] flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-300 overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none"
    >
      <div
        className="flex items-center justify-between p-5 border-b border-white/10 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shrink-0 relative z-10 cursor-move"
        onPointerDown={handleLogPointerDown}
        onPointerMove={handleLogPointerMove}
        onPointerUp={handleLogPointerUp}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl theme-glass-inner border border-white/5 flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_receipt_long")}</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">
            {t("sys_log_history")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { clearStatusLog(); setIsLogExpanded(false); }} className="p-2 hover:bg-red-500/10 text-[var(--subtext)] hover:text-red-400 rounded-xl transition-all border border-transparent hover:border-red-500/20">
            <span className="material-symbols-outlined !text-[16px]">{t("icon_delete_sweep")}</span>
          </button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setIsLogExpanded(false)} className="p-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] rounded-xl transition-all border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <span className="material-symbols-outlined !text-[16px]">{t("icon_close")}</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2 relative z-10">
        {statusLog.map((log: any) => {
          const match = log.message.match(/^([a-z_0-9]+)\s+(.*)$/);
          const knownIcons = ['check_circle', 'warning', 'error', 'info', 'sync', 'flight_takeoff', 'radar', 'terminal', 'bug_report', 'extension', 'block', 'update', 'done', 'download', 'delete', 'close', 'add', 'verified', 'new_releases', 'local_fire_department', 'health_and_safety', 'folder_open', 'inventory_2', 'account_tree', 'priority_high'];

          let logIcon = 'terminal';
          let logText = log.message;

          if (match && (knownIcons.includes(match[1]) || match[1].includes('_'))) {
            logIcon = match[1];
            logText = match[2];
          }

          let logTextNode: React.ReactNode = logText;

          const cachedMatch = (typeof logText === 'string') ? logText.match(/^(.*?) (has|have) cached changes from your last session\.$/) : null;
          if (cachedMatch) {
            const filesString = cachedMatch[1];
            const isPlural = cachedMatch[2] === 'have';
            const parts = filesString.split(" and ");
            const fileNames = parts[0].split(", ");
            const otherFilesPart = parts.length > 1 ? ` and ${parts[1]}` : '';

            logTextNode = (
              <span className="flex flex-wrap gap-1.5 items-center leading-normal">
                {fileNames.map((f: string, idx: number) => (
                  <React.Fragment key={f}>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      const lower = f.toLowerCase();
                      if (lower.endsWith('.json')) {
                        useStore.getState().setCwMainTab('TEMPLATES');
                        useStore.getState().setView('CitizensWorkbench');
                      } else if (lower.endsWith('.cfg') || lower.endsWith('.ini')) {
                        useStore.getState().setCwMainTab('CONFIGS');
                        useStore.getState().setView('CitizensWorkbench');
                      } else if (lower.endsWith('.wayfinder')) {
                        useStore.getState().setWayfinderActiveTab('wf_comms_title');
                        useStore.getState().setView('WayfinderHub');
                      } else if (lower.endsWith('.masonhub')) {
                        useStore.getState().setMasonActiveTab('posts');
                        useStore.getState().setView('MasonHub');
                      } else {
                        useStore.getState().setView('MasonHub');
                        useStore.getState().setMasonActiveTab('ide');
                      }
                      setIsLogExpanded(false);
                    }} className="px-2 py-0.5 bg-black/20 border border-white/5 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] rounded-md transition-all uppercase tracking-widest cursor-pointer">
                      {f.replace(/\.wayfinder$/i, '').replace(/\.masonhub$/i, '')}
                    </button>
                    {idx < fileNames.length - 1 && <span className="opacity-50">,</span>}
                  </React.Fragment>
                ))}
                {otherFilesPart} <span className="opacity-80 ml-1">{isPlural ? 'have' : 'has'} {t("cached_changes")}</span>
              </span>
            );
            if (logIcon === 'terminal') logIcon = 'save';
          }

          const isErr = log.type === 'error' || logIcon === 'error' || logIcon === 'bug_report';
          const isSucc = log.type === 'success' || logIcon === 'check_circle' || logIcon === 'done' || logIcon === 'verified';
          const isWarn = log.type === 'warning' || logIcon === 'warning' || logIcon === 'priority_high';

          const logColor = isErr ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]' : isSucc ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : isWarn ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-[var(--accent)] drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]';
          const bgHover = isErr ? 'hover:bg-red-500/10 hover:border-red-500/20' : isSucc ? 'hover:bg-emerald-500/10 hover:border-emerald-500/20' : isWarn ? 'hover:bg-amber-500/10 hover:border-amber-500/20' : 'hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/20';
          const iconBg = isErr ? 'bg-red-500/10 border-red-500/20' : isSucc ? 'bg-emerald-500/10 border-emerald-500/20' : isWarn ? 'bg-amber-500/10 border-amber-500/20' : 'bg-[var(--accent)]/10 border-[var(--accent)]/20';

          return (
            <div key={log.id} className={`flex items-start gap-4 p-4 rounded-[1rem] border border-transparent transition-all duration-300 group ${bgHover}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${iconBg}`}>
                <span className={`material-symbols-outlined !text-[18px] ${logColor}`}>{logIcon}</span>
              </div>
              <div className="flex flex-col gap-1.5 min-w-0 pt-0.5">
                <div className="text-[10px] font-bold text-[var(--text)] uppercase tracking-wider whitespace-pre-wrap leading-relaxed break-words opacity-90 group-hover:opacity-100 transition-opacity">{logTextNode}</div>
                <span className="text-[9px] font-mono font-bold text-[var(--subtext)] opacity-50 flex items-center gap-1.5"><span className="material-symbols-outlined !text-[10px]">{t("icon_schedule")}</span>{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
