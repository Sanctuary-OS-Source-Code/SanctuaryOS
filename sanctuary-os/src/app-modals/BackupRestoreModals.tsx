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
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-md p-6 animate-in fade-in duration-300">
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full blur-[110px] pointer-events-none mix-blend-screen"
        style={{
          backgroundColor: `color-mix(in srgb, var(${accentVar}) 14%, transparent)`,
        }}
      />

      <div
        className="relative w-full max-w-lg glass-panel sanctuary-modal-glass backdrop-blur-2xl border rounded-3xl p-8 md:p-10 flex flex-col items-center text-center gap-6 overflow-hidden animate-in zoom-in-95 duration-300"
        style={{
          borderColor: `color-mix(in srgb, var(${accentVar}) 35%, transparent)`,
          boxShadow: `0 35px 90px color-mix(in srgb, var(${accentVar}) 22%, transparent), inset 0 0 36px color-mix(in srgb, var(${accentVar}) 8%, transparent), inset 0 1px 1px rgba(255, 255, 255, 0.22)`,
        }}
      >
        <div
          className="absolute inset-0 rounded-[inherit] animate-pulse pointer-events-none"
          style={{
            backgroundColor: `color-mix(in srgb, var(${accentVar}) 4%, transparent)`,
          }}
        />
        <div
          className="absolute top-0 left-0 w-full h-[2px] opacity-85 pointer-events-none"
          style={{
            background: `linear-gradient(to right, transparent, color-mix(in srgb, var(${accentVar}) 75%, transparent), transparent)`,
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-full h-px opacity-75 pointer-events-none"
          style={{
            background: `linear-gradient(to right, transparent, color-mix(in srgb, var(${accentVar}) 45%, transparent), transparent)`,
          }}
        />

        {/* Centered Circular Beacon Emblem */}
        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center shrink-0 border-2 z-10 mt-1"
          style={{
            backgroundColor: `color-mix(in srgb, var(${accentVar}) 10%, transparent)`,
            borderColor: `color-mix(in srgb, var(${accentVar}) 35%, transparent)`,
            boxShadow: `0 0 30px color-mix(in srgb, var(${accentVar}) 20%, transparent), inset 0 0 20px color-mix(in srgb, var(${accentVar}) 10%, transparent)`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full border-2 animate-ping opacity-35"
            style={{
              borderColor: `color-mix(in srgb, var(${accentVar}) 50%, transparent)`,
            }}
          />
          <span
            className="material-symbols-outlined !text-[36px] animate-pulse"
            style={{
              color: `var(${accentVar})`,
              filter: `drop-shadow(0 0 14px var(${accentVar}))`,
            }}
          >
            {icon}
          </span>
        </div>

        {/* Title & Description */}
        <div className="flex flex-col items-center gap-2 relative z-10 w-full">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none text-[var(--text)] drop-shadow-md m-0">
            {t("backups_title")}
          </h2>
          <span
            className="text-[10px] font-black uppercase tracking-[0.35em] opacity-85"
            style={{ color: `var(${accentVar})` }}
          >
            {title}
          </span>

          <div
            className="w-36 h-px my-2 opacity-60"
            style={{
              background: `linear-gradient(to right, transparent, var(${accentVar}), transparent)`,
            }}
          />

          <p className="text-sm font-medium text-[var(--text)] opacity-90 leading-relaxed whitespace-pre-line max-w-md m-0">
            {desc}
          </p>
        </div>

        {/* Progress Bar */}
        <div
          className="w-full glass-surface p-5 rounded-2xl border flex flex-col gap-3 relative z-10"
          style={{ borderColor: `color-mix(in srgb, var(${accentVar}) 25%, transparent)` }}
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
  );
}
