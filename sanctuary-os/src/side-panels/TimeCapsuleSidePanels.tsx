import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  DashboardStatTile,
  StatBox,
  ActionButton,
  EmptyState,
  HoverTooltip,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";
import { useStore } from "../store";

type ExtractCategory =
  | "ALL"
  | "SAVES"
  | "TRAY"
  | "CONFIGS"
  | "BIN"
  | "DATA"
  | "DELTA"
  | "PACKS";

type DiffStatusFilter = "CHANGES" | "MODIFIED" | "MISSING" | "IDENTICAL";

export function TimeCapsuleSidePanel({
  isOpen,
  onClose,
  selectedBackup,
  config,
  getBackupSignature,
  onRestoreBackup,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedBackup: string | null;
  config: any;
  getBackupSignature?: (name: string) => any;
  onRestoreBackup?: (name: string, isEngine: boolean) => void;
}) {
  const { t } = useLexicon();
  const [activeView, setActiveView] = useState<"EXTRACT" | "DIFF">("EXTRACT");
  const [backupFiles, setBackupFiles] = useState<any[]>([]);
  const [logicalSize, setLogicalSize] = useState<number>(0);
  const [diffSize, setDiffSize] = useState<number>(0);
  const [location, setLocation] = useState<string>("");
  const [diffEntries, setDiffEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [extracting, setExtracting] = useState<string | null>(null);
  const [isBatchExtracting, setIsBatchExtracting] = useState<boolean>(false);
  const [extractedSet, setExtractedSet] = useState<Set<string>>(new Set());
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Two-step confirmation states so nothing is ever overwritten on a single click
  const [confirmFullRestore, setConfirmFullRestore] = useState<boolean>(false);
  const [confirmExtractPath, setConfirmExtractPath] = useState<string | null>(null);
  const [confirmBatchExtract, setConfirmBatchExtract] = useState<boolean>(false);
  const [confirmRestoreAllDiff, setConfirmRestoreAllDiff] = useState<boolean>(false);

  const [extractFilter, setExtractFilter] = useState<ExtractCategory>("ALL");
  const [showVerRevisions, setShowVerRevisions] = useState<boolean>(false);
  const [diffFilter, setDiffFilter] = useState<DiffStatusFilter>("CHANGES");
  const [searchQuery, setSearchQuery] = useState("");
  const [listLimit, setListLimit] = useState(100);

  const docsPath = useMemo(() => {
    if (config?.mods_path) {
      return config.mods_path.replace(/[\\/]Mods[\\/]?$/i, "");
    }
    return "";
  }, [config]);

  useEffect(() => {
    setListLimit(100);
    setSearchQuery("");
    setExtractFilter("ALL");
    setDiffFilter("CHANGES");
    setActiveView("EXTRACT");
    setSelectedPaths(new Set());
    setExtractedSet(new Set());
    setConfirmFullRestore(false);
    setConfirmExtractPath(null);
    setConfirmBatchExtract(false);
    setConfirmRestoreAllDiff(false);
  }, [selectedBackup, isOpen]);

  const refreshDiff = async () => {
    if (!selectedBackup || !config?.vault_path) return;
    try {
      const updatedDiff: any = await invoke("diff_backup", {
        vaultPath: config?.vault_path,
        docsPath: docsPath,
        backupName: selectedBackup,
      });
      setDiffEntries(Array.isArray(updatedDiff) ? updatedDiff : []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isOpen || !selectedBackup || !config?.vault_path) return;
    setIsLoading(true);
    Promise.all([
      invoke("get_backup_contents", {
        vaultPath: config?.vault_path,
        backupName: selectedBackup,
      }).catch(() => null),
      invoke("diff_backup", {
        vaultPath: config?.vault_path,
        docsPath: docsPath,
        backupName: selectedBackup,
      }).catch(() => []),
    ])
      .then(([contentsRes, diffRes]: [any, any]) => {
        if (contentsRes) {
          setBackupFiles(contentsRes?.files || []);
          setLogicalSize(contentsRes?.logical_size_bytes || 0);
          setDiffSize(contentsRes?.diff_size_bytes || 0);
          setLocation(contentsRes?.location || "");
        }
        setDiffEntries(Array.isArray(diffRes) ? diffRes : []);
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, selectedBackup, config, docsPath]);

  const markFilesExtracted = (paths: string[]) => {
    setExtractedSet((prev) => {
      const next = new Set(prev);
      paths.forEach((p) => next.add(p));
      return next;
    });
    setTimeout(() => {
      setExtractedSet((prev) => {
        const next = new Set(prev);
        paths.forEach((p) => next.delete(p));
        return next;
      });
    }, 2500);
  };

  const handleExtractSingle = async (filePath: string, shouldRefreshDiff = false) => {
    if (!selectedBackup) return;
    setConfirmExtractPath(null);
    setExtracting(filePath);
    try {
      await invoke("extract_backup_file", {
        vaultPath: config?.vault_path,
        docsPath: docsPath,
        backupName: selectedBackup,
        filePath: filePath,
      });
      if (shouldRefreshDiff) {
        await refreshDiff();
      }
      markFilesExtracted([filePath]);
    } catch (e) {
      console.error(e);
    } finally {
      setExtracting(null);
    }
  };

  const handleBatchExtract = async (paths: string[], shouldRefreshDiff = false) => {
    if (!selectedBackup || paths.length === 0 || isBatchExtracting) return;
    setConfirmBatchExtract(false);
    setConfirmRestoreAllDiff(false);
    setIsBatchExtracting(true);
    try {
      for (const filePath of paths) {
        setExtracting(filePath);
        await invoke("extract_backup_file", {
          vaultPath: config?.vault_path,
          docsPath: docsPath,
          backupName: selectedBackup,
          filePath: filePath,
        });
      }
      if (shouldRefreshDiff) {
        await refreshDiff();
      }
      markFilesExtracted(paths);
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        paths.forEach((p) => next.delete(p));
        return next;
      });
      const pushStatus = useStore.getState().pushStatus;
      if (pushStatus) {
        const toastMsg =
          t("tc_panel_extract_toast", "Extracted {0} file(s) into active game folder!")?.replace(
            "{0}",
            String(paths.length)
          ) || `Extracted ${paths.length} file(s)`;
        pushStatus(toastMsg, "success");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setExtracting(null);
      setIsBatchExtracting(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!location) return;
    try {
      await openPath(location);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSelectPath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const isEngine = Boolean(selectedBackup?.toLowerCase().includes("engine"));
  const sig = useMemo(() => {
    if (!selectedBackup) return null;
    if (getBackupSignature) return getBackupSignature(selectedBackup);
    const clean = selectedBackup.replace(".tar.zst", "");
    if (clean.includes("--")) {
      const parts = clean.split("--");
      return {
        alias: parts[0].replace(/_/g, " "),
        version: `v.${parts[1]}`,
        timestamp: parts[2] || "0",
        isEngine,
      };
    }
    return { alias: clean, version: "", timestamp: "0", isEngine };
  }, [selectedBackup, getBackupSignature, isEngine]);

  const rawAlias = sig?.alias || "";
  const isDefaultAlias =
    !rawAlias ||
    rawAlias.toLowerCase() === "world state" ||
    rawAlias.toLowerCase() === "engine core";
  const title = isDefaultAlias
    ? isEngine
      ? t("engine_full", "Engine Core")
      : t("world_state", "World State")
    : rawAlias;
  const icon = isEngine ? t("icon_settings", "settings") : t("icon_public", "public");
  const themeColor = isEngine ? "text-[var(--danger)]" : "text-[var(--accent)]";

  const dateDisplay = useMemo(() => {
    if (!sig?.timestamp || sig.timestamp === "0") return "";
    const d = new Date(Number(sig.timestamp) * 1000);
    return `${d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} • ${d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }, [sig]);

  const visibleBackupFiles = useMemo(
    () =>
      backupFiles.filter(
        (f) => !f.path.split("/").some((part: string) => part.startsWith("."))
      ),
    [backupFiles]
  );

  const visibleDiffEntries = useMemo(
    () =>
      diffEntries.filter(
        (d) => !d.path.split("/").some((part: string) => part.startsWith("."))
      ),
    [diffEntries]
  );

  // World State file classifiers
  const isSaveFile = (path: string) => {
    const lower = path.toLowerCase();
    return lower.endsWith(".save") || lower.includes(".save.ver");
  };

  const isTrayFile = (path: string) => {
    const lower = path.toLowerCase();
    return (
      lower.startsWith("tray/") ||
      lower.endsWith(".trayitem") ||
      lower.endsWith(".blueprint") ||
      lower.endsWith(".bpi") ||
      lower.endsWith(".householdbinary") ||
      lower.endsWith(".hhi") ||
      lower.endsWith(".sgi") ||
      lower.endsWith(".rmi")
    );
  };

  // Engine Core file classifiers
  const isEngineBinFile = (path: string) => {
    const lower = path.toLowerCase();
    return (
      lower.startsWith("game/") ||
      lower.includes("/bin/") ||
      lower.endsWith(".exe") ||
      lower.endsWith(".dll") ||
      lower.endsWith(".py") ||
      lower.endsWith(".zip")
    );
  };

  const isEngineDeltaFile = (path: string) => {
    const lower = path.toLowerCase();
    return lower.startsWith("delta/") || lower.includes("/delta/");
  };

  const isEngineDataFile = (path: string) => {
    const lower = path.toLowerCase();
    return lower.startsWith("data/") || lower.includes("/data/");
  };

  const saveFiles = useMemo(
    () => visibleBackupFiles.filter((f) => isSaveFile(f.path)),
    [visibleBackupFiles]
  );
  const primarySaveFiles = useMemo(
    () => saveFiles.filter((f) => f.path.toLowerCase().endsWith(".save")),
    [saveFiles]
  );
  const verRevisionFiles = useMemo(
    () => saveFiles.filter((f) => f.path.toLowerCase().includes(".save.ver")),
    [saveFiles]
  );
  const trayFiles = useMemo(
    () => visibleBackupFiles.filter((f) => isTrayFile(f.path)),
    [visibleBackupFiles]
  );
  const configFiles = useMemo(
    () =>
      visibleBackupFiles.filter((f) => !isSaveFile(f.path) && !isTrayFile(f.path)),
    [visibleBackupFiles]
  );

  const engineBinFiles = useMemo(
    () => visibleBackupFiles.filter((f) => isEngineBinFile(f.path)),
    [visibleBackupFiles]
  );
  const engineDeltaFiles = useMemo(
    () =>
      visibleBackupFiles.filter(
        (f) => !isEngineBinFile(f.path) && isEngineDeltaFile(f.path)
      ),
    [visibleBackupFiles]
  );
  const engineDataFiles = useMemo(
    () =>
      visibleBackupFiles.filter(
        (f) =>
          !isEngineBinFile(f.path) &&
          !isEngineDeltaFile(f.path) &&
          isEngineDataFile(f.path)
      ),
    [visibleBackupFiles]
  );
  const enginePackFiles = useMemo(
    () =>
      visibleBackupFiles.filter(
        (f) =>
          !isEngineBinFile(f.path) &&
          !isEngineDeltaFile(f.path) &&
          !isEngineDataFile(f.path)
      ),
    [visibleBackupFiles]
  );

  const diffCounts = useMemo(() => {
    let modified = 0;
    let missing = 0;
    let identical = 0;
    for (const d of visibleDiffEntries) {
      if (d.status === "Modified") modified++;
      else if (d.status === "Missing in Current") missing++;
      else identical++;
    }
    return {
      changes: modified + missing,
      modified,
      missing,
      identical,
    };
  }, [visibleDiffEntries]);

  const changedDiffPaths = useMemo(
    () =>
      visibleDiffEntries
        .filter((d) => d.status !== "Identical")
        .map((d) => d.path),
    [visibleDiffEntries]
  );

  const formatStorageBytes = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    if (mb < 1000) return `${mb.toFixed(2)} ${t("unit_mb", "MB")}`;
    return `${(mb / 1024).toFixed(2)} ${t("unit_gb", "GB")}`;
  };

  const formatFileSizeMb = (sizeMb: number) => {
    if (!sizeMb || sizeMb <= 0) return `< 1 ${t("unit_kb", "KB")}`;
    if (sizeMb < 1) {
      const kb = Math.max(0.1, sizeMb * 1024);
      return `${kb.toFixed(1)} ${t("unit_kb", "KB")}`;
    }
    if (sizeMb < 1000) {
      return `${sizeMb.toFixed(2)} ${t("unit_mb", "MB")}`;
    }
    return `${(sizeMb / 1024).toFixed(2)} ${t("unit_gb", "GB")}`;
  };

  const sumGroupSizeMb = (files: any[]) =>
    files.reduce((acc, f) => acc + (f.size_mb || 0), 0);

  const categoryRows = useMemo(() => {
    if (isEngine) {
      return [
        {
          id: "BIN" as ExtractCategory,
          icon: t("icon_terminal", "terminal"),
          label: t("tc_engine_cat_bin", "Binaries & Executables"),
          count: engineBinFiles.length,
          size: formatFileSizeMb(sumGroupSizeMb(engineBinFiles)),
        },
        {
          id: "DATA" as ExtractCategory,
          icon: t("icon_inventory_2", "inventory_2"),
          label: t("tc_engine_cat_data", "Base Game Packages"),
          count: engineDataFiles.length,
          size: formatFileSizeMb(sumGroupSizeMb(engineDataFiles)),
        },
        {
          id: "DELTA" as ExtractCategory,
          icon: t("icon_difference", "difference"),
          label: t("tc_engine_cat_delta", "Delta Patch Packages"),
          count: engineDeltaFiles.length,
          size: formatFileSizeMb(sumGroupSizeMb(engineDeltaFiles)),
        },
        {
          id: "PACKS" as ExtractCategory,
          icon: t("icon_extension", "extension"),
          label: t("tc_engine_cat_packs", "Expansion & Pack Data"),
          count: enginePackFiles.length,
          size: formatFileSizeMb(sumGroupSizeMb(enginePackFiles)),
        },
      ];
    }

    return [
      {
        id: "SAVES" as ExtractCategory,
        icon: t("icon_saves", "save"),
        label: t("label_saves", "Saves"),
        count: showVerRevisions ? saveFiles.length : primarySaveFiles.length,
        size: formatFileSizeMb(sumGroupSizeMb(saveFiles)),
      },
      {
        id: "TRAY" as ExtractCategory,
        icon: t("icon_tray_files", "Holiday_Village"),
        label: t("label_tray_files", "Tray Files"),
        count: trayFiles.length,
        size: formatFileSizeMb(sumGroupSizeMb(trayFiles)),
      },
      {
        id: "CONFIGS" as ExtractCategory,
        icon: t("icon_tune", "tune"),
        label: t("tc_panel_filter_configs", "Configs & Data"),
        count: configFiles.length,
        size: formatFileSizeMb(sumGroupSizeMb(configFiles)),
      },
    ];
  }, [
    isEngine,
    t,
    engineBinFiles,
    engineDataFiles,
    engineDeltaFiles,
    enginePackFiles,
    showVerRevisions,
    saveFiles,
    primarySaveFiles,
    trayFiles,
    configFiles,
  ]);

  const filteredExtractFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = (f: any) => !q || f.path.toLowerCase().includes(q);

    if (isEngine) {
      if (extractFilter === "BIN") return engineBinFiles.filter(matchesSearch);
      if (extractFilter === "DATA") return engineDataFiles.filter(matchesSearch);
      if (extractFilter === "DELTA") return engineDeltaFiles.filter(matchesSearch);
      if (extractFilter === "PACKS") return enginePackFiles.filter(matchesSearch);
      return visibleBackupFiles.filter(matchesSearch);
    }

    const savesList = (showVerRevisions ? saveFiles : primarySaveFiles).filter(matchesSearch);
    const configsList = configFiles.filter(matchesSearch);
    const trayList = trayFiles.filter(matchesSearch);

    if (extractFilter === "SAVES") return savesList;
    if (extractFilter === "CONFIGS") return configsList;
    if (extractFilter === "TRAY") return trayList;
    return [...savesList, ...configsList, ...trayList];
  }, [
    isEngine,
    searchQuery,
    extractFilter,
    showVerRevisions,
    saveFiles,
    primarySaveFiles,
    configFiles,
    trayFiles,
    engineBinFiles,
    engineDataFiles,
    engineDeltaFiles,
    enginePackFiles,
    visibleBackupFiles,
  ]);

  const filteredDiff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleDiffEntries.filter((d) => {
      if (diffFilter === "CHANGES" && d.status === "Identical") return false;
      if (diffFilter === "MODIFIED" && d.status !== "Modified") return false;
      if (diffFilter === "MISSING" && d.status !== "Missing in Current") return false;
      if (diffFilter === "IDENTICAL" && d.status !== "Identical") return false;
      if (q && !d.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [visibleDiffEntries, diffFilter, searchQuery]);

  const activeCategoryLabel = useMemo(() => {
    if (extractFilter === "ALL") return null;
    return categoryRows.find((r) => r.id === extractFilter)?.label || null;
  }, [extractFilter, categoryRows]);

  const activeDiffFilterLabel = useMemo(() => {
    if (diffFilter === "CHANGES") return null;
    if (diffFilter === "MODIFIED") return t("tc_diff_filter_modified", "Modified");
    if (diffFilter === "MISSING") return t("tc_diff_filter_missing", "Missing in Active");
    return t("tc_diff_filter_identical", "Unchanged");
  }, [diffFilter, t]);

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={
        sig?.version
          ? `${sig.version}${dateDisplay ? ` • ${dateDisplay}` : ""}`
          : t("timecapsule_operations_subtitle", "Advanced Backup Management")
      }
      icon={icon}
      iconColorClass={themeColor}
      widthClass="w-[90vw] md:w-[820px]"
      isResizable={true}
      defaultWidth={820}
      headerActions={
        selectedBackup ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_folder_open", "folder_open")}
              tooltip={t("tc_open_in_explorer", "Open in Explorer")}
              onClick={handleOpenFolder}
              disabled={!location}
            />
            {onRestoreBackup && (
              <PanelHeaderButton
                icon={t("icon_restore", "restore")}
                tooltip={t("btn_restore", "Restore")}
                variant="accent"
                onClick={() => setConfirmFullRestore((prev) => !prev)}
              />
            )}
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      {!selectedBackup ? (
        <div className="text-[var(--subtext)] text-xs p-6 text-center">
          {t("no_backup_selected", "No backup selected")}
        </div>
      ) : (
        <div className="flex flex-col gap-4 mt-2 w-full pb-8">
          {/* 1. Top Snapshot Subject Banner Card (Matches Homestead Lab Report Banner) */}
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className={`w-11 h-11 rounded-xl border bg-transparent flex items-center justify-center shrink-0 ${
                  isEngine
                    ? "text-rose-400 border-rose-500/35"
                    : "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                }`}
              >
                <span className="material-symbols-outlined !text-[22px]">{icon}</span>
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                  {title}
                </span>
                <h3 className="text-base md:text-lg font-black font-mono text-[var(--text)] tracking-tight truncate">
                  {sig?.version || selectedBackup.replace(".tar.zst", "")}
                </h3>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase border bg-transparent flex items-center gap-1 ${
                  diffCounts.changes > 0
                    ? "text-amber-400 border-amber-500/45"
                    : "text-emerald-400 border-emerald-500/45"
                }`}
              >
                <span className="material-symbols-outlined !text-[13px]">
                  {diffCounts.changes > 0
                    ? t("icon_difference", "difference")
                    : t("icon_check_circle", "check_circle")}
                </span>
                {diffCounts.changes > 0
                  ? `${diffCounts.changes} ${t("tab_diff", "Differences")}`
                  : t("tc_badge_in_sync", "In Sync")}
              </span>
              <span className="text-[11px] font-mono font-bold text-[var(--subtext)]">
                {visibleBackupFiles.length.toLocaleString()} {t("label_files", "Files")} &bull;{" "}
                {formatStorageBytes(logicalSize)}
              </span>
            </div>
          </div>

          {/* 2. Primary Action Banner (Matches Secure Verified Artifact Banner in Lab.tsx) */}
          {onRestoreBackup &&
            (confirmFullRestore ? (
              <div className="rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-transparent border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]">
                    <span className="material-symbols-outlined !text-[18px]">
                      {t("icon_warning", "warning")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--warning)]">
                      {isEngine
                        ? t("confirm_restore_engine_card", "Confirm Engine Restore")
                        : t("confirm_restore_state", "Confirm Restore")}
                    </span>
                    <p className="text-[11px] text-[var(--subtext)] leading-snug truncate">
                      {sig?.version || selectedBackup} &bull; {formatStorageBytes(logicalSize)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_close", "close")}
                    label={t("btn_cancel", "Cancel")}
                    onClick={() => setConfirmFullRestore(false)}
                    className="!px-3.5 !py-2"
                  />
                  <ActionButton
                    variant="accent"
                    icon={t("icon_restore", "restore")}
                    label={t("btn_confirm", "Confirm")}
                    onClick={() => {
                      setConfirmFullRestore(false);
                      onClose();
                      onRestoreBackup(selectedBackup, isEngine);
                    }}
                    className="!px-4 !py-2"
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmFullRestore(true)}
                className="w-full text-left rounded-2xl p-3.5 border transition-all flex items-start gap-3 group cursor-pointer shadow-sm bg-transparent border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-transparent border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]">
                  <span className="material-symbols-outlined !text-[18px]">
                    {t("icon_restore", "restore")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)]">
                      {t("tc_restore_full_title", "Restore Full Snapshot")}
                    </span>
                    <span className="material-symbols-outlined !text-[15px] transition-all opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 text-[var(--accent)]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--subtext)] leading-snug">
                    {isEngine
                      ? t(
                          "tc_restore_engine_desc",
                          "Roll back your game installation binaries and pack data to this Engine Core snapshot."
                        )
                      : t(
                          "tc_restore_world_desc",
                          "Roll back your active Saves, Tray library, and user settings to this World State snapshot."
                        )}
                  </p>
                </div>
              </button>
            ))}

          {/* 3. 3-Column Telemetry StatBoxes (Matches Lab Report Telemetry Row) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatBox
              icon={t("icon_inventory_2", "inventory_2")}
              iconColorClass="text-[var(--accent)]"
              label={t("logical_size", "Logical Size")}
              value={formatStorageBytes(logicalSize)}
            />
            <StatBox
              icon={t("icon_hard_drive", "hard_drive")}
              iconColorClass="text-[var(--success)]"
              label={t("new_disk_used", "Disk Space Used")}
              value={formatStorageBytes(diffSize)}
            />
            <StatBox
              icon={t("icon_schedule", "schedule")}
              iconColorClass="text-[var(--accent)]"
              label={t("date_created", "Captured")}
              value={
                <span className="text-xs md:text-sm font-black tracking-tight">
                  {dateDisplay || t("tc_badge_latest", "Latest")}
                </span>
              }
            />
          </div>

          {/* 4. Side-by-Side Breakdown Cards (Matches Dependencies & Conflicts Cards in Lab.tsx) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Left Card: Snapshot Contents Breakdown */}
            <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                    {t("icon_inventory_2", "inventory_2")}
                  </span>
                  {t("tc_group_contents", "Snapshot Contents")}
                </span>
                <span className="text-[10px] font-mono font-bold text-[var(--accent)]">
                  {visibleBackupFiles.length.toLocaleString()}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {categoryRows.map((cat) => {
                  const isActiveCat =
                    activeView === "EXTRACT" && extractFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setActiveView("EXTRACT");
                        setExtractFilter((prev) =>
                          activeView === "EXTRACT" && prev === cat.id ? "ALL" : cat.id
                        );
                        setListLimit(100);
                      }}
                      className={`w-full rounded-xl px-3 py-2 flex items-center justify-between gap-2 transition-all cursor-pointer border text-left ${
                        isActiveCat
                          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          : "bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                          {cat.icon}
                        </span>
                        <span className="text-xs font-bold text-[var(--text)] truncate">
                          {cat.label}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-[var(--subtext)] shrink-0">
                        {cat.count.toLocaleString()} &bull; {cat.size}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Card: Differences vs Active Breakdown */}
            <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                    {t("icon_difference", "difference")}
                  </span>
                  {t("tab_diff", "Differences")}
                </span>
                <span className="text-[10px] font-mono font-bold text-[var(--warning)]">
                  {diffCounts.changes.toLocaleString()}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {[
                  {
                    id: "MODIFIED" as DiffStatusFilter,
                    icon: t("icon_edit", "edit"),
                    label: t("tc_diff_filter_modified", "Modified"),
                    count: diffCounts.modified,
                    colorVar: "--warning",
                  },
                  {
                    id: "MISSING" as DiffStatusFilter,
                    icon: t("icon_warning", "warning"),
                    label: t("tc_diff_filter_missing", "Missing in Active"),
                    count: diffCounts.missing,
                    colorVar: "--danger",
                  },
                  {
                    id: "IDENTICAL" as DiffStatusFilter,
                    icon: t("icon_check_circle", "check_circle"),
                    label: t("tc_diff_filter_identical", "Unchanged"),
                    count: diffCounts.identical,
                    colorVar: "--success",
                  },
                ].map((row) => {
                  const isActiveRow = activeView === "DIFF" && diffFilter === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => {
                        setActiveView("DIFF");
                        setDiffFilter((prev) =>
                          activeView === "DIFF" && prev === row.id ? "CHANGES" : row.id
                        );
                        setListLimit(100);
                      }}
                      className={`w-full rounded-xl px-3 py-2 flex items-center justify-between gap-2 transition-all cursor-pointer border text-left ${
                        isActiveRow
                          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          : "bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="material-symbols-outlined !text-[14px] shrink-0"
                          style={{ color: `var(${row.colorVar})` }}
                        >
                          {row.icon}
                        </span>
                        <span className="text-xs font-bold text-[var(--text)] truncate">
                          {row.label}
                        </span>
                      </div>
                      <span
                        className="text-[10px] font-mono font-bold shrink-0"
                        style={{
                          color:
                            row.count > 0 ? `var(${row.colorVar})` : "var(--subtext)",
                        }}
                      >
                        {row.count.toLocaleString()} {t("label_files", "Files")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 5. 2-Column StatTile View Switcher (Matches Lab Report Log Switcher in Lab.tsx) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_unarchive", "unarchive")}
              label={t("tab_extract", "Extract")}
              number={`${visibleBackupFiles.length.toLocaleString()} ${t("label_files", "Files")}`}
              isActive={activeView === "EXTRACT"}
              onClick={() => {
                setActiveView("EXTRACT");
                setListLimit(100);
              }}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_difference", "difference")}
              label={t("tab_diff", "Differences")}
              number={`${diffCounts.changes.toLocaleString()} ${t(
                "tc_diff_changes",
                "Changes"
              )}`}
              isActive={activeView === "DIFF"}
              onClick={() => {
                setActiveView("DIFF");
                setListLimit(100);
              }}
            />
          </div>

          {/* 6. Unified File Explorer Terminal Card (Matches Log Terminal Card in Lab.tsx) */}
          <div className="flex-1 min-h-[420px] glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden shadow-inner relative flex flex-col">
            {/* Terminal Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="material-symbols-outlined text-[var(--accent)] !text-[16px]">
                  {activeView === "DIFF"
                    ? t("icon_difference", "difference")
                    : t("icon_unarchive", "unarchive")}
                </span>
                <span className="text-xs font-black font-mono text-[var(--text)]">
                  {activeView === "DIFF"
                    ? `${t("tab_diff", "Differences")} (${filteredDiff.length.toLocaleString()})`
                    : `${t("tab_extract", "Extract")} (${filteredExtractFiles.length.toLocaleString()})`}
                </span>

                {/* Active Category Filter Badge (Click to Clear) */}
                {activeView === "EXTRACT" && activeCategoryLabel && (
                  <button
                    type="button"
                    onClick={() => setExtractFilter("ALL")}
                    className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] flex items-center gap-1 cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all"
                  >
                    {activeCategoryLabel}
                    <span className="material-symbols-outlined !text-[11px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                )}

                {/* Active Diff Filter Badge (Click to Clear) */}
                {activeView === "DIFF" && activeDiffFilterLabel && (
                  <button
                    type="button"
                    onClick={() => setDiffFilter("CHANGES")}
                    className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] flex items-center gap-1 cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all"
                  >
                    {activeDiffFilterLabel}
                    <span className="material-symbols-outlined !text-[11px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                )}

                {/* .ver Revisions Toggle when viewing World State Saves */}
                {activeView === "EXTRACT" &&
                  !isEngine &&
                  (extractFilter === "ALL" || extractFilter === "SAVES") &&
                  verRevisionFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowVerRevisions((v) => !v)}
                      className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border transition-all cursor-pointer ${
                        showVerRevisions
                          ? "border-[var(--accent)] text-[var(--accent)]"
                          : "border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                      }`}
                    >
                      {t("tc_show_ver_backups", "Show .ver Revisions")} (
                      {verRevisionFiles.length})
                    </button>
                  )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Batch Extract Selected Action (when files are selected in Extract view) */}
                {activeView === "EXTRACT" &&
                  selectedPaths.size > 0 &&
                  (confirmBatchExtract ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isBatchExtracting}
                        onClick={() => handleBatchExtract(Array.from(selectedPaths), true)}
                        className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] cursor-pointer"
                      >
                        {t("btn_confirm", "Confirm")} ({selectedPaths.size})
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmBatchExtract(false)}
                        className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                      >
                        {t("btn_cancel", "Cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBatchExtracting}
                      onClick={() => setConfirmBatchExtract(true)}
                      className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_restore", "restore")}
                      </span>
                      {t("tc_panel_extract_selected", "Extract Selected ({0})")?.replace(
                        "{0}",
                        String(selectedPaths.size)
                      ) || `Extract (${selectedPaths.size})`}
                    </button>
                  ))}

                {/* Restore All Changed Action (in Differences view) */}
                {activeView === "DIFF" &&
                  changedDiffPaths.length > 0 &&
                  (confirmRestoreAllDiff ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isBatchExtracting}
                        onClick={() => handleBatchExtract(changedDiffPaths, true)}
                        className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] cursor-pointer"
                      >
                        {t("btn_confirm", "Confirm")} ({changedDiffPaths.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreAllDiff(false)}
                        className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                      >
                        {t("btn_cancel", "Cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBatchExtracting}
                      onClick={() => setConfirmRestoreAllDiff(true)}
                      className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_done_all", "done_all")}
                      </span>
                      {t("tc_diff_restore_all_changes", "Restore All Changed ({0})")?.replace(
                        "{0}",
                        String(changedDiffPaths.length)
                      ) || `Restore All (${changedDiffPaths.length})`}
                    </button>
                  ))}

                {/* Inline Search Box */}
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)] absolute left-2.5 pointer-events-none">
                    {t("icon_search", "search")}
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setListLimit(100);
                    }}
                    placeholder={t("search_files", "Search files...")}
                    className="h-7 pl-7 pr-6 rounded-lg bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] focus:border-[var(--accent)] text-[11px] font-medium text-[var(--text)] placeholder:text-[var(--subtext)]/60 outline-none w-44 sm:w-52 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-1.5 text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_close", "close")}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Physical Archive Path Sub-bar */}
            {location && (
              <div className="px-5 py-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)] opacity-70 shrink-0">
                    {t("icon_hard_drive", "hard_drive")}
                  </span>
                  <span
                    className="text-[11px] font-mono text-[var(--subtext)] truncate"
                    title={location}
                  >
                    {location}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[12px]">
                    {t("icon_folder_open", "folder_open")}
                  </span>
                  {t("tc_open_in_explorer", "Open in Explorer")}
                </button>
              </div>
            )}

            {/* Scrollable File Rows List */}
            <div className="p-4 flex flex-col gap-2 max-h-[460px] overflow-y-auto custom-scrollbar flex-1">
              {isLoading ? (
                <div className="text-center text-xs text-[var(--subtext)] py-12 animate-pulse">
                  {activeView === "DIFF"
                    ? t("calculating_diff", "Calculating differences...")
                    : t("loading_contents", "Loading contents...")}
                </div>
              ) : activeView === "EXTRACT" ? (
                filteredExtractFiles.length === 0 ? (
                  <EmptyState
                    icon={t("icon_folder", "folder")}
                    title={t("no_files_found", "No matching files")}
                  />
                ) : (
                  <>
                    {filteredExtractFiles.slice(0, listLimit).map((file) => {
                      const isSave = isSaveFile(file.path);
                      const isTray = isTrayFile(file.path);
                      const fileIcon = isSave
                        ? t("icon_saves", "save")
                        : isTray
                          ? t("icon_tray_files", "Holiday_Village")
                          : t("icon_file", "Insert_Drive_File");

                      const isSelected = selectedPaths.has(file.path);
                      const isDone = extractedSet.has(file.path);
                      const isBusy = extracting === file.path;
                      const isConfirmingThis = confirmExtractPath === file.path;
                      const fileName = file.path.split("/").pop() || file.path;

                      return (
                        <div
                          key={file.path}
                          onClick={() => toggleSelectPath(file.path)}
                          className={`shrink-0 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 transition-all duration-150 cursor-pointer border ${
                            isSelected
                              ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                              : "bg-[color-mix(in_srgb,var(--text)_3%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              className={`w-8 h-8 rounded-lg border bg-transparent flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? "border-[var(--accent)] text-[var(--accent)]"
                                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[16px]">
                                {isSelected ? t("icon_check", "check") : fileIcon}
                              </span>
                            </div>

                            <div className="flex flex-col min-w-0 flex-1">
                              <span
                                className="text-xs font-bold text-[var(--text)] tracking-tight truncate leading-snug"
                                title={file.path}
                              >
                                {fileName}
                              </span>
                              <span className="text-[10px] font-mono text-[var(--subtext)] opacity-70 truncate">
                                {file.path}
                              </span>
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-2 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="px-2 py-0.5 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-mono font-bold text-[var(--subtext)] whitespace-nowrap">
                              {formatFileSizeMb(file.size_mb)}
                            </span>

                            {isConfirmingThis ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isBusy || isBatchExtracting}
                                  onClick={() => handleExtractSingle(file.path, false)}
                                  className="px-2.5 h-7 rounded-lg border bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider cursor-pointer hover:brightness-110 transition-all"
                                >
                                  {t("btn_confirm", "Confirm")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmExtractPath(null)}
                                  className="w-7 h-7 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer transition-all"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t("icon_close", "close")}
                                  </span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy || isBatchExtracting}
                                onClick={() => setConfirmExtractPath(file.path)}
                                className={`relative group/actionbtn w-7 h-7 rounded-lg border bg-transparent flex items-center justify-center transition-all shrink-0 cursor-pointer disabled:opacity-50 ${
                                  isDone
                                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                                    : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                                }`}
                              >
                                <span
                                  className={`material-symbols-outlined !text-[15px] ${
                                    isBusy ? "animate-spin" : ""
                                  }`}
                                >
                                  {isDone
                                    ? t("icon_check", "check")
                                    : isBusy
                                      ? t("icon_sync", "sync")
                                      : t("icon_restore", "restore")}
                                </span>
                                <HoverTooltip
                                  className="z-[100] !right-0 !translate-x-0 !left-auto"
                                  title={
                                    isDone
                                      ? t("tc_panel_extracted_badge", "Extracted")
                                      : t("btn_extract", "Extract")
                                  }
                                  variant={isDone ? "success" : "accent"}
                                />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {filteredExtractFiles.length > listLimit && (
                      <div className="flex flex-col items-center gap-2 mt-2 mb-1 shrink-0">
                        <div className="text-center text-[10px] text-[var(--subtext)] uppercase tracking-widest">
                          {t("showing_files", "Showing first {0} files")?.replace(
                            "{0}",
                            listLimit.toString()
                          ) || `Showing first ${listLimit} files`}
                        </div>
                        <button
                          type="button"
                          onClick={() => setListLimit((l) => l + 100)}
                          className="px-4 py-1.5 rounded-xl bg-transparent hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[10px] font-black uppercase tracking-widest border border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-colors cursor-pointer"
                        >
                          {t("load_more", "Load More")}
                        </button>
                      </div>
                    )}
                  </>
                )
              ) : filteredDiff.length === 0 ? (
                <EmptyState
                  icon={t("icon_verified", "verified")}
                  title={t("everything_identical", "Everything is identical")}
                />
              ) : (
                <>
                  {filteredDiff.slice(0, listLimit).map((diff, i) => {
                    const isMod = diff.status === "Modified";
                    const isMiss = diff.status === "Missing in Current";
                    const badgeClass = isMod
                      ? "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
                      : isMiss
                        ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
                        : "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_40%,transparent)]";
                    const badgeIcon = isMod
                      ? t("icon_edit", "edit")
                      : isMiss
                        ? t("icon_warning", "warning")
                        : t("icon_check_circle", "check_circle");

                    const isDone = extractedSet.has(diff.path);
                    const isBusy = extracting === diff.path;
                    const isConfirmingThis = confirmExtractPath === diff.path;

                    return (
                      <div
                        key={i}
                        className="shrink-0 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                            <span
                              className={`material-symbols-outlined !text-[16px] ${
                                isMod
                                  ? "text-[var(--warning)]"
                                  : isMiss
                                    ? "text-[var(--danger)]"
                                    : "text-[var(--success)]"
                              }`}
                            >
                              {badgeIcon}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span
                              className="text-xs font-bold tracking-tight text-[var(--text)] truncate"
                              title={diff.path}
                            >
                              {diff.path.split("/").pop()}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--subtext)] opacity-70 truncate">
                              {diff.path}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border bg-transparent flex items-center gap-1 shrink-0 ${badgeClass}`}
                          >
                            {isMod
                              ? t("tc_diff_filter_modified", "Modified")
                              : isMiss
                                ? t("tc_diff_filter_missing", "Missing in Active")
                                : t("tc_diff_filter_identical", "Unchanged")}
                          </span>

                          {diff.status !== "Identical" &&
                            (isConfirmingThis ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isBusy || isBatchExtracting}
                                  onClick={() => handleExtractSingle(diff.path, true)}
                                  className="px-2.5 h-7 rounded-lg border bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider cursor-pointer hover:brightness-110 transition-all"
                                >
                                  {t("btn_confirm", "Confirm")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmExtractPath(null)}
                                  className="w-7 h-7 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer transition-all"
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {t("icon_close", "close")}
                                  </span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmExtractPath(diff.path)}
                                disabled={isBusy || isBatchExtracting}
                                className={`relative group/actionbtn w-7 h-7 rounded-lg border bg-transparent flex items-center justify-center transition-all shrink-0 cursor-pointer disabled:opacity-50 ${
                                  isDone
                                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                                    : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                                }`}
                              >
                                <span
                                  className={`material-symbols-outlined !text-[15px] ${
                                    isBusy ? "animate-spin" : ""
                                  }`}
                                >
                                  {isDone
                                    ? t("icon_check", "check")
                                    : isBusy
                                      ? t("icon_sync", "sync")
                                      : t("icon_restore", "restore")}
                                </span>
                                <HoverTooltip
                                  className="z-[100] !right-0 !translate-x-0 !left-auto"
                                  title={t("btn_restore", "Restore")}
                                  variant="accent"
                                />
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })}

                  {filteredDiff.length > listLimit && (
                    <div className="flex flex-col items-center gap-2 mt-2 mb-1 shrink-0">
                      <div className="text-center text-[10px] text-[var(--subtext)] uppercase tracking-widest">
                        {t("showing_files", "Showing first {0} files")?.replace(
                          "{0}",
                          listLimit.toString()
                        ) || `Showing first ${listLimit} files`}
                      </div>
                      <button
                        type="button"
                        onClick={() => setListLimit((l) => l + 100)}
                        className="px-4 py-1.5 rounded-xl bg-transparent hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[10px] font-black uppercase tracking-widest border border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-colors cursor-pointer"
                      >
                        {t("load_more", "Load More")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </SidePanel>
  );
}
