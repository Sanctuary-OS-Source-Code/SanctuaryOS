import React from 'react';
import { useStore } from "../store";

export function BackupRestoreModals({ isBackingUp, isRestoring, backupType, restoreType, t }: any) {
  const backupProgress = useStore((state) => state.backupProgress);

  const isEngineBackup = backupType === 'engine';
  const isEngineRestore = restoreType === 'engine';

  const title = isBackingUp
    ? (isEngineBackup ? t("overlay_sealing_engine") : t("overlay_sealing_world"))
    : (isEngineRestore ? t("overlay_restoring_engine") : t("overlay_restoring_world"));

  const desc = isBackingUp
    ? (isEngineBackup ? t("overlay_sealing_engine_desc") : t("overlay_sealing_world_desc"))
    : (isEngineRestore ? t("overlay_restoring_engine_desc") : t("overlay_restoring_world_desc"));

  const themeVar = (isEngineBackup || isEngineRestore) ? '#f43f5e' : '#6366f1';
  const icon = isBackingUp ? 'archive' : 'unarchive';

  if (!isBackingUp && !isRestoring) return null;

  return (
    <div className="fixed inset-0 z-[9999999] flex flex-col items-center justify-center bg-[var(--bg)]/30 backdrop-blur-md animate-in fade-in duration-500 p-8">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] pointer-events-none mix-blend-screen" 
           style={{ backgroundColor: `color-mix(in srgb, ${themeVar} 10%, transparent)` }} />
      
      <div className="relative w-full max-w-4xl bg-white/[0.02] backdrop-blur-2xl border rounded-[var(--radius)] p-12 flex flex-col gap-8 overflow-hidden"
           style={{ 
             borderColor: `color-mix(in srgb, ${themeVar} 20%, transparent)`,
             boxShadow: `0 40px 100px color-mix(in srgb, ${themeVar} 20%, transparent), inset 0 1px 1px rgba(255,255,255,0.05)` 
           }}>
        <div className="absolute inset-0 animate-pulse pointer-events-none" style={{ backgroundColor: `color-mix(in srgb, ${themeVar} 5%, transparent)` }} />
        <div className="absolute top-0 left-0 w-full h-1 opacity-80" style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, ${themeVar} 50%, transparent), transparent)` }} />
        <div className="absolute bottom-0 left-0 w-full h-1 opacity-80" style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, ${themeVar} 20%, transparent), transparent)` }} />
        
        <div className="flex items-start gap-8 relative z-10 text-left">
          <div className="relative w-32 h-32 rounded-2xl flex items-center justify-center shrink-0"
               style={{ 
                 backgroundColor: `color-mix(in srgb, ${themeVar} 5%, transparent)`,
                 borderColor: `color-mix(in srgb, ${themeVar} 30%, transparent)`,
                 borderWidth: '1px',
                 boxShadow: `0 0 30px color-mix(in srgb, ${themeVar} 10%, transparent), inset 0 0 20px color-mix(in srgb, ${themeVar} 5%, transparent)`
               }}>
            <div className="absolute inset-0 rounded-2xl border animate-ping opacity-30" style={{ borderColor: `color-mix(in srgb, ${themeVar} 20%, transparent)` }} />
            <span className="material-symbols-outlined !text-6xl animate-pulse"
                  style={{ color: themeVar, filter: `drop-shadow(0 0 15px ${themeVar})` }}>{icon}</span>
          </div>

          <div className="flex flex-col gap-3 pt-2 flex-1">
            <h2 className="text-5xl font-black text-white tracking-tighter uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] leading-none">{t("backups_title") || "TIME CAPSULE"}</h2>
            <h3 className="text-xl font-bold uppercase tracking-[0.3em] opacity-90"
                style={{ color: themeVar, filter: `drop-shadow(0 0 10px color-mix(in srgb, ${themeVar} 30%, transparent))` }}>{title}</h3>
            <div className="w-full h-px my-3" style={{ background: `linear-gradient(to right, color-mix(in srgb, ${themeVar} 30%, transparent), transparent)` }} />
            <p className="text-sm font-bold text-[var(--subtext)] leading-relaxed uppercase tracking-[0.15em] max-w-2xl opacity-80">
              {desc}
            </p>
          </div>
        </div>

        <div className="relative z-10 w-full mt-4 bg-[var(--bg)]/10 backdrop-blur-xl p-8 rounded-2xl border flex flex-col gap-6 shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)]"
             style={{ borderColor: `color-mix(in srgb, ${themeVar} 10%, transparent)` }}>
          {backupProgress ? (
          <>
            <div className="flex justify-between items-end text-[11px] font-black uppercase tracking-[0.3em]"
                 style={{ color: `color-mix(in srgb, ${themeVar} 90%, transparent)`, filter: `drop-shadow(0 0 10px color-mix(in srgb, ${themeVar} 20%, transparent))` }}>
              <span className="truncate pr-4">{backupProgress.action}</span>
              <span className="shrink-0 opacity-80">{backupProgress.current} / {backupProgress.total}</span>
            </div>
            <div className="w-full bg-black/80 rounded-full h-3 overflow-hidden border shadow-[inset_0_2px_5px_rgba(0,0,0,0.8)]"
                 style={{ borderColor: `color-mix(in srgb, ${themeVar} 10%, transparent)` }}>
              <div 
                className="h-full transition-all duration-300 relative" 
                style={{ 
                  width: `${Math.max(2, (backupProgress.current / backupProgress.total) * 100)}%`,
                  background: `linear-gradient(to right, color-mix(in srgb, ${themeVar} 50%, transparent), color-mix(in srgb, ${themeVar} 80%, transparent), ${themeVar})`,
                  boxShadow: `0 0 10px color-mix(in srgb, ${themeVar} 50%, transparent)`
                }}
              >
                <div className="absolute inset-0 bg-white/20 animate-[pulse_2s_ease-in-out_infinite]" />
                <div className="absolute top-0 right-0 w-10 h-full bg-gradient-to-r from-transparent to-white/30 blur-sm" />
              </div>
            </div>
          </>
          ) : (
            <>
              <div className="flex justify-between items-end text-[11px] font-black uppercase tracking-[0.3em]"
                   style={{ color: `color-mix(in srgb, ${themeVar} 90%, transparent)` }}>
                <span>{t("defcon_init_secure") || "INITIALIZING DATA STREAM..."}</span>
                <span className="animate-pulse opacity-80">{t("defcon_stand_by") || "STAND BY"}</span>
              </div>
              <div className="w-full bg-black/80 rounded-full h-3 overflow-hidden border shadow-[inset_0_2px_5px_rgba(0,0,0,0.8)]"
                   style={{ borderColor: `color-mix(in srgb, ${themeVar} 10%, transparent)` }}>
                <div className="h-full w-full relative" style={{ backgroundColor: `color-mix(in srgb, ${themeVar} 30%, transparent)` }}>
                  <div className="absolute top-0 left-0 w-1/3 h-full animate-[scan_2s_ease-in-out_infinite]"
                       style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, ${themeVar} 50%, transparent), transparent)` }} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
