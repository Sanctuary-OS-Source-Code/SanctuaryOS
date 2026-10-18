import React from "react";
import { useStore } from "../store";

export function BackupRestoreModals({ isBackingUp, isRestoring, backupType, restoreType, t }: any) {
  const backupProgress = useStore((state) => state.backupProgress);

  const isEngineBackup = backupType === "engine";
  const isEngineRestore = restoreType === "engine";

  const title = isBackingUp
    ? isEngineBackup
      ? t("overlay_sealing_engine")
      : t("overlay_sealing_world")
    : isEngineRestore
      ? t("overlay_restoring_engine")
      : t("overlay_restoring_world");

  const desc = isBackingUp
    ? isEngineBackup
      ? t("overlay_sealing_engine_desc")
      : t("overlay_sealing_world_desc")
    : isEngineRestore
      ? t("overlay_restoring_engine_desc")
      : t("overlay_restoring_world_desc");

  const accentVar = isBackingUp
    ? isEngineBackup
      ? "--danger"
      : "--accent"
    : isEngineRestore
      ? "--danger"
      : "--accent";
  const icon = isBackingUp ? "archive" : "unarchive";

  if (!isBackingUp && !isRestoring) return null;

  return (
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/35 backdrop-blur-md p-6 animate-in fade-in duration-300">
      <div
        className="relative w-full max-w-xl rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col backdrop-blur-[var(--glassBlur)] animate-in zoom-in-95 duration-300"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, var(--text) 5%, transparent) 0%, transparent 100%), color-mix(in srgb, var(--sidebar) calc(var(--glassOpacityDecimal, 0.85) * 100%), transparent)`,
        }}
      >
        <div
          className="absolute -top-24 -left-24 w-72 h-72 rounded-full opacity-15 blur-[90px] pointer-events-none z-0"
          style={{ backgroundColor: `var(${accentVar})` }}
        />

        {/* SidePanel-style Header */}
        <div className="pt-6 px-6 pb-5 md:pt-7 md:px-8 shrink-0 relative z-20 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className="w-12 h-12 md:w-14 md:h-14 rounded-2xl glass-panel before:!hidden border flex items-center justify-center shadow-lg shrink-0 relative"
              style={{
                borderColor: `color-mix(in srgb, var(${accentVar}) 30%, transparent)`,
                color: `var(${accentVar})`,
              }}
            >
              <span className="material-symbols-outlined !text-[24px] md:!text-[26px] animate-pulse drop-shadow-[0_0_12px_currentColor]">
                {icon}
              </span>
            </div>

            <div className="flex flex-col min-w-0 justify-center">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border"
                  style={{
                    color: `var(${accentVar})`,
                    backgroundColor: `color-mix(in srgb, var(${accentVar}) 12%, transparent)`,
                    borderColor: `color-mix(in srgb, var(${accentVar}) 25%, transparent)`,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shadow-[0_0_8px_currentColor]" />
                  {title}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight truncate drop-shadow-md m-0">
                {t("backups_title")}
              </h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 md:p-8 flex flex-col gap-5 relative z-10">
          <div className="glass-surface before:!hidden rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            <p className="text-sm font-medium text-[var(--text)] opacity-90 leading-relaxed whitespace-pre-line m-0">
              {desc}
            </p>
          </div>

          <div
            className="glass-surface before:!hidden p-5 rounded-2xl border flex flex-col gap-3"
            style={{ borderColor: `color-mix(in srgb, var(${accentVar}) 20%, transparent)` }}
          >
            {backupProgress ? (
              <>
                <div
                  className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest"
                  style={{ color: `var(${accentVar})` }}
                >
                  <span className="truncate pr-4">{backupProgress.action}</span>
                  <span className="shrink-0 opacity-80">
                    {backupProgress.current} / {backupProgress.total}
                  </span>
                </div>
                <div
                  className="w-full bg-black/60 rounded-full h-2.5 overflow-hidden border"
                  style={{ borderColor: `color-mix(in srgb, var(${accentVar}) 20%, transparent)` }}
                >
                  <div
                    className="h-full transition-all duration-300 relative"
                    style={{
                      width: `${Math.max(2, (backupProgress.current / backupProgress.total) * 100)}%`,
                      background: `linear-gradient(to right, color-mix(in srgb, var(${accentVar}) 50%, transparent), var(${accentVar}))`,
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div
                  className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest"
                  style={{ color: `var(${accentVar})` }}
                >
                  <span>{t("defcon_init_secure")}</span>
                  <span className="animate-pulse opacity-80">{t("defcon_stand_by")}</span>
                </div>
                <div
                  className="w-full bg-black/60 rounded-full h-2.5 overflow-hidden border"
                  style={{ borderColor: `color-mix(in srgb, var(${accentVar}) 20%, transparent)` }}
                >
                  <div
                    className="h-full w-full relative"
                    style={{ backgroundColor: `color-mix(in srgb, var(${accentVar}) 25%, transparent)` }}
                  >
                    <div
                      className="absolute top-0 left-0 w-1/3 h-full animate-[scan_2s_ease-in-out_infinite]"
                      style={{
                        background: `linear-gradient(to right, transparent, var(${accentVar}), transparent)`,
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}




