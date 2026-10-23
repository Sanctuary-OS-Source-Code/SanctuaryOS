import { createPortal } from "react-dom";
import { useStore } from "../store";
import { StatBox } from "../shared";

export function BackupRestoreModals({
  isBackingUp,
  isRestoring,
  backupType,
  restoreType,
  t,
}: any) {
  const backupProgress = useStore((state) => state.backupProgress);
  const selectedVersion = useStore((state) => state.selectedVersion);

  if (!isBackingUp && !isRestoring) return null;

  const isEngineBackup = backupType === "engine";
  const isEngineRestore = restoreType === "engine";
  const isEngineMode = isBackingUp ? isEngineBackup : isEngineRestore;

  const title = isBackingUp
    ? isEngineBackup
      ? t("overlay_sealing_engine", "Sealing Engine Core")
      : t("overlay_sealing_world", "Sealing World State")
    : isEngineRestore
      ? t("overlay_restoring_engine", "Restoring Engine Core")
      : t("overlay_restoring_world", "Restoring World State");

  const desc = isBackingUp
    ? isEngineBackup
      ? t(
          "overlay_sealing_engine_desc",
          "Sanctuary OS is temporarily locked while the Engine Core is sealed."
        )
      : t(
          "overlay_sealing_world_desc",
          "Sanctuary OS is temporarily locked while your World State is sealed."
        )
    : isEngineRestore
      ? t(
          "overlay_restoring_engine_desc",
          "Sanctuary OS is temporarily locked while the Engine Core is restored."
        )
      : t(
          "overlay_restoring_world_desc",
          "Sanctuary OS is temporarily locked while your World State is restored."
        );

  const categoryLabel = isEngineMode
    ? t("engine_full", "Engine Core")
    : t("world_state", "World State");

  const icon = isBackingUp
    ? t("icon_archive", "archive")
    : t("icon_unarchive", "unarchive");

  const rawPct = backupProgress
    ? Math.round(((backupProgress.current || 0) / (backupProgress.total || 100)) * 100)
    : 0;
  const pct = Math.min(100, Math.max(0, rawPct));

  const cleanVersion = selectedVersion
    ? String(selectedVersion).replace(/^v\.?/i, "").trim()
    : "";

  const versionDisplay = cleanVersion
    ? `${t("tc_version_prefix", "v.")}${cleanVersion}`
    : categoryLabel;

  const filesDisplay = backupProgress?.files_total
    ? `${Number(backupProgress.files_done || 0).toLocaleString()} / ${Number(
        backupProgress.files_total
      ).toLocaleString()}`
    : `${pct}%`;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999999] flex items-center justify-center p-6 animate-in fade-in duration-300"
      style={{
        backgroundColor: "var(--glass-backdrop-dim, rgba(0, 0, 0, 0.18))",
      }}
    >
      <div
        className="relative w-full max-w-xl glass-panel portal-glass-fix portal-glass-modal rounded-3xl border p-6 md:p-7 flex flex-col gap-5 overflow-hidden animate-in zoom-in-95 duration-300"
        style={{
          borderTopColor: "var(--glass-border-top, rgba(255, 255, 255, 0.28))",
          borderLeftColor: "var(--glass-border-left, rgba(255, 255, 255, 0.18))",
          borderRightColor: "var(--glass-border-right, rgba(255, 255, 255, 0.10))",
          borderBottomColor: "var(--glass-border-bottom, rgba(255, 255, 255, 0.08))",
          boxShadow: "var(--glass-drawer-shadow)",
        }}
      >
        {/* Liquid Glass Specular Edge Catchlights (Matches SidePanel) */}
        <div className="pointer-events-none absolute inset-x-8 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/35 to-transparent z-40" />
        <div className="pointer-events-none absolute inset-y-8 left-0 w-[1px] bg-gradient-to-b from-white/25 via-white/10 to-transparent z-40" />

        {/* 1. Top Header Row */}
        <div className="flex items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl border bg-transparent border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[22px] animate-pulse">
                {icon}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                {categoryLabel}
              </span>
              <h2 className="text-lg md:text-xl font-black tracking-tight text-[var(--text)] leading-tight m-0 truncate">
                {title}
              </h2>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-2xl md:text-3xl font-black font-mono tracking-tight leading-none text-[var(--accent)]">
              {pct}%
            </span>
          </div>
        </div>

        {/* 2. 2-Column StatBox Row (Zero dark drop-shadows, luminous inner bevels) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
          <StatBox
            icon={isEngineMode ? t("icon_settings", "settings") : t("icon_public", "public")}
            iconColorClass="text-[var(--accent)]"
            label={t("game_version", "Game Version")}
            value={<span className="font-mono">{versionDisplay}</span>}
          />
          <StatBox
            icon={t("icon_folder", "folder")}
            iconColorClass="text-[var(--accent)]"
            label={t("label_files", "Files")}
            value={<span className="font-mono">{filesDisplay}</span>}
          />
        </div>

        {/* 3. Progress Track & Live File Stream */}
        <div className="w-full rounded-2xl p-4 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 relative z-10">
          <div className="w-full h-2.5 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
            <div
              className="h-full transition-all duration-300 rounded-full relative overflow-hidden"
              style={{
                width: `${Math.max(4, pct)}%`,
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--accent) 75%, white), var(--accent))",
                boxShadow: "0 0 12px color-mix(in srgb, var(--accent) 55%, transparent)",
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-[11px] font-mono text-[var(--subtext)]">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                {t("icon_folder_open", "folder_open")}
              </span>
              <span className="truncate">
                {backupProgress?.current_file ||
                  backupProgress?.action ||
                  t("defcon_stand_by", "Stand by...")}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Subtle Footer Lock Notice */}
        <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed m-0 text-center relative z-10">
          {desc}
        </p>
      </div>
    </div>
  );

  const portalRoot =
    (typeof document !== "undefined" && document.getElementById("sa-portals")) ||
    (typeof document !== "undefined" ? document.body : null);

  return portalRoot ? createPortal(modalContent, portalRoot) : modalContent;
}

