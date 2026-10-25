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
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../shared";
import { useStore } from "../store";

export function parseBackupSignatureFallback(
  filename: string,
  t: (k: string, f?: string) => string
) {
  const strippedPrefix = filename.replace(/^Secured:\s*/i, "").trim();
  const cleanName = strippedPrefix
    .replace(/\.tar\.zst$/i, "")
    .replace(/\.tar$/i, "")
    .replace(/\.zst$/i, "");
  const isEngine = strippedPrefix.toLowerCase().includes("engine");
  if (cleanName.includes("--")) {
    const parts = cleanName.split("--");
    return {
      alias: parts[0].replace(/_/g, " "),
      version: parts[1] ? `v.${parts[1].replace(/^v\.?/i, "")}` : "",
      timestamp: parts[2] || "0",
      isEngine,
    };
  }
  const parts = cleanName.split("_");
  const versionPart = parts.find((p) => p.includes(".")) || "LEGACY";
  const versionIndex = parts.indexOf(versionPart);
  const alias =
    versionIndex > 0 ? parts.slice(0, versionIndex).join(" ") : parts[0];
  return {
    alias: alias || t("unknown", "Local"),
    version:
      versionPart === "LEGACY"
        ? isEngine
          ? "v.CORE"
          : "v.LEGACY"
        : `v.${versionPart}`,
    timestamp: parts[parts.length - 1] || "0",
    isEngine,
  };
}

export function TimeCapsuleSnapshotDossier({
  selectedBackup,
  config: propConfig,
  getBackupSignature,
  onRestoreBackup,
  onClosePanel,
  isPostBackupSummary = false,
  onLocationChange,
}: {
  selectedBackup: string | null;
  config?: any;
  getBackupSignature?: (name: string) => any;
  onRestoreBackup?: (name: string, isEngine: boolean) => void;
  onClosePanel?: () => void;
  isPostBackupSummary?: boolean;
  onLocationChange?: (loc: string) => void;
}) {
  const { t } = useLexicon();
  const [localConfig, setLocalConfig] = useState<any>(propConfig || null);
  const activeConfig = propConfig || localConfig;

  const normalizedBackup = useMemo(
    () =>
      selectedBackup ? selectedBackup.replace(/^Secured:\s*/i, "").trim() : null,
    [selectedBackup]
  );

  useEffect(() => {
    if (propConfig) {
      setLocalConfig(propConfig);
      return;
    }
    invoke("get_saved_coordinates")
      .then((c: any) => setLocalConfig(c))
      .catch(() => {});
  }, [propConfig]);

  const [activeView, setActiveView] = useState<"DELTA" | "DIFF" | "EXTRACT">(
    isPostBackupSummary ? "DELTA" : "DIFF"
  );
  const [backupFiles, setBackupFiles] = useState<any[]>([]);
  const [removedFromPrevious, setRemovedFromPrevious] = useState<any[]>([]);
  const [previousBackupName, setPreviousBackupName] = useState<string | null>(
    null
  );
  const [isBaseline, setIsBaseline] = useState<boolean>(false);
  const [logicalSize, setLogicalSize] = useState<number>(0);
  const [diffSize, setDiffSize] = useState<number>(0);
  const [rawDiffSize, setRawDiffSize] = useState<number>(0);
  const [location, setLocation] = useState<string>("");
  const [diffEntries, setDiffEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [extracting, setExtracting] = useState<string | null>(null);
  const [isBatchExtracting, setIsBatchExtracting] = useState<boolean>(false);
  const [extractedSet, setExtractedSet] = useState<Set<string>>(new Set());
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const [confirmFullRestore, setConfirmFullRestore] = useState<boolean>(false);
  const [confirmExtractPath, setConfirmExtractPath] = useState<string | null>(
    null
  );
  const [confirmBatchExtract, setConfirmBatchExtract] =
    useState<boolean>(false);
  const [confirmRestoreAllDiff, setConfirmRestoreAllDiff] =
    useState<boolean>(false);

  const [showVerRevisions, setShowVerRevisions] = useState<boolean>(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [listLimit, setListLimit] = useState(100);

  const docsPath = useMemo(() => {
    if (activeConfig?.mods_path) {
      return activeConfig.mods_path.replace(/[\\/]Mods[\\/]?$/i, "");
    }
    return "";
  }, [activeConfig]);

  useEffect(() => {
    setListLimit(100);
    setSearchQuery("");
    setCollapsedGroups(new Set());
    setActiveView(isPostBackupSummary ? "DELTA" : "DIFF");
    setSelectedPaths(new Set());
    setExtractedSet(new Set());
    setConfirmFullRestore(false);
    setConfirmExtractPath(null);
    setConfirmBatchExtract(false);
    setConfirmRestoreAllDiff(false);
  }, [normalizedBackup, isPostBackupSummary]);

  const refreshDiff = async () => {
    if (!normalizedBackup || !activeConfig?.vault_path) return;
    try {
      const updatedDiff: any = await invoke("diff_backup", {
        vaultPath: activeConfig.vault_path,
        docsPath: docsPath,
        backupName: normalizedBackup,
      });
      setDiffEntries(Array.isArray(updatedDiff) ? updatedDiff : []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!normalizedBackup || !activeConfig?.vault_path) return;
    setIsLoading(true);
    setBackupFiles([]);
    setRemovedFromPrevious([]);
    setPreviousBackupName(null);
    setDiffEntries([]);
    Promise.all([
      invoke("get_backup_contents", {
        vaultPath: activeConfig.vault_path,
        backupName: normalizedBackup,
      }).catch(() => null),
      invoke("diff_backup", {
        vaultPath: activeConfig.vault_path,
        docsPath: docsPath,
        backupName: normalizedBackup,
      }).catch(() => []),
    ])
      .then(([contentsRes, diffRes]: [any, any]) => {
        if (contentsRes) {
          setBackupFiles(contentsRes?.files || []);
          setRemovedFromPrevious(contentsRes?.removed_from_previous || []);
          setPreviousBackupName(contentsRes?.previous_backup_name || null);
          const baseline = Boolean(contentsRes?.is_baseline);
          setIsBaseline(baseline);
          setLogicalSize(contentsRes?.logical_size_bytes || 0);
          setDiffSize(contentsRes?.diff_size_bytes || 0);
          setRawDiffSize(
            typeof contentsRes?.raw_diff_size_bytes === "number"
              ? contentsRes.raw_diff_size_bytes
              : contentsRes?.diff_size_bytes || 0
          );
          const loc = contentsRes?.location || "";
          setLocation(loc);
          if (onLocationChange) onLocationChange(loc);
        }
        const diffs = Array.isArray(diffRes) ? diffRes : [];
        setDiffEntries(diffs);

        if (!isPostBackupSummary) {
          const hasLiveDrift = diffs.some(
            (d: any) =>
              !String(d.path || "")
                .split("/")
                .some((p: string) => p.startsWith(".")) &&
              d.status !== "Identical"
          );
          if (!hasLiveDrift) {
            setActiveView("DELTA");
          } else {
            setActiveView("DIFF");
          }
        }
      })
      .finally(() => setIsLoading(false));
  }, [normalizedBackup, activeConfig, docsPath, isPostBackupSummary]);

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

  const handleExtractSingle = async (
    filePath: string,
    shouldRefreshDiff = false
  ) => {
    if (!normalizedBackup || !activeConfig?.vault_path) return;
    setConfirmExtractPath(null);
    setExtracting(filePath);
    try {
      await invoke("extract_backup_file", {
        vaultPath: activeConfig.vault_path,
        docsPath: docsPath,
        backupName: normalizedBackup,
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

  const handleBatchExtract = async (
    paths: string[],
    shouldRefreshDiff = false
  ) => {
    if (
      !normalizedBackup ||
      !activeConfig?.vault_path ||
      paths.length === 0 ||
      isBatchExtracting
    )
      return;
    setConfirmBatchExtract(false);
    setConfirmRestoreAllDiff(false);
    setIsBatchExtracting(true);
    try {
      for (const filePath of paths) {
        setExtracting(filePath);
        await invoke("extract_backup_file", {
          vaultPath: activeConfig.vault_path,
          docsPath: docsPath,
          backupName: normalizedBackup,
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
          t(
            "tc_panel_extract_toast",
            "Extracted {0} file(s) into active game folder!"
          )?.replace("{0}", String(paths.length)) ||
          `Extracted ${paths.length} file(s)`;
        pushStatus(toastMsg, "success");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setExtracting(null);
      setIsBatchExtracting(false);
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

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const isEngine = Boolean(normalizedBackup?.toLowerCase().includes("engine"));

  const prevSig = useMemo(() => {
    if (!previousBackupName) return null;
    if (getBackupSignature) return getBackupSignature(previousBackupName);
    return parseBackupSignatureFallback(previousBackupName, t);
  }, [previousBackupName, getBackupSignature, t]);

  const icon = isEngine
    ? t("icon_settings", "settings")
    : t("icon_public", "public");

  const prevDateDisplay = useMemo(() => {
    if (!prevSig?.timestamp || prevSig.timestamp === "0") return "";
    const d = new Date(Number(prevSig.timestamp) * 1000);
    return `${d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })} ${d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }, [prevSig]);

  const visibleBackupFiles = useMemo(
    () =>
      backupFiles.filter(
        (f) => !f.path.split("/").some((part: string) => part.startsWith("."))
      ),
    [backupFiles]
  );

  const visibleRemovedFromPrev = useMemo(
    () =>
      removedFromPrevious.filter(
        (f) => !f.path.split("/").some((part: string) => part.startsWith("."))
      ),
    [removedFromPrevious]
  );

  const visibleDiffEntries = useMemo(
    () =>
      diffEntries.filter(
        (d) => !d.path.split("/").some((part: string) => part.startsWith("."))
      ),
    [diffEntries]
  );

  // Classifiers
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

  const getFileFolderSubtitle = (filePath: string) => {
    const parts = filePath.split("/");
    if (parts.length > 1) {
      return parts.slice(0, -1).join("/");
    }
    return t("tc_folder_root", "Root Config");
  };

  const getFileCategoryInfo = (filePath: string) => {
    if (isEngine) {
      if (isEngineBinFile(filePath)) {
        return {
          icon: t("icon_terminal", "terminal"),
          label: t("tc_engine_cat_bin", "Binaries"),
          colorVar: "var(--accent)",
          colorClass:
            "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_38%,transparent)]",
        };
      }
      if (isEngineDeltaFile(filePath)) {
        return {
          icon: t("icon_difference", "difference"),
          label: t("tc_engine_cat_delta", "Delta"),
          colorVar: "var(--warning)",
          colorClass:
            "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_38%,transparent)]",
        };
      }
      if (isEngineDataFile(filePath)) {
        return {
          icon: t("icon_inventory_2", "inventory_2"),
          label: t("tc_engine_cat_data", "Base Game"),
          colorVar: "var(--success)",
          colorClass:
            "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_38%,transparent)]",
        };
      }
      return {
        icon: t("icon_extension", "extension"),
        label: t("tc_engine_cat_packs", "Packs"),
        colorVar: "var(--subtext)",
        colorClass:
          "text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_18%,transparent)]",
      };
    }

    if (isSaveFile(filePath)) {
      return {
        icon: t("icon_save", "save"),
        label: t("label_saves", "Saves"),
        colorVar: "var(--accent)",
        colorClass:
          "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_38%,transparent)]",
      };
    }
    if (isTrayFile(filePath)) {
      return {
        icon: t("icon_group", "Holiday_Village"),
        label: t("label_tray_files", "Tray Files"),
        colorVar: "var(--success)",
        colorClass:
          "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_38%,transparent)]",
      };
    }
    return {
      icon: t("icon_tune", "tune"),
      label: t("tc_panel_filter_configs", "Configs & Data"),
      colorVar: "var(--subtext)",
      colorClass:
        "text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_18%,transparent)]",
    };
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
      visibleBackupFiles.filter(
        (f) => !isSaveFile(f.path) && !isTrayFile(f.path)
      ),
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

  // Delta counts + written bytes
  const deltaStats = useMemo(() => {
    let added = 0;
    let updated = 0;
    let dedup = 0;
    let writtenMb = 0;
    for (const f of visibleBackupFiles) {
      const st = f.delta_status || (isBaseline ? "Baseline" : "Deduplicated");
      if (st === "Added" || st === "Baseline") {
        added++;
        writtenMb += f.size_mb || 0;
      } else if (st === "Updated") {
        updated++;
        writtenMb += f.size_mb || 0;
      } else {
        dedup++;
      }
    }
    const removed = visibleRemovedFromPrev.length;
    return {
      written: added + updated,
      changed: added + updated + removed,
      added,
      updated,
      removed,
      dedup,
      writtenBytes: Math.round(writtenMb * 1_048_576),
    };
  }, [visibleBackupFiles, visibleRemovedFromPrev, isBaseline]);

  const diffCounts = useMemo(() => {
    let modified = 0;
    let missing = 0;
    let addedInCurrent = 0;
    let identical = 0;
    for (const d of visibleDiffEntries) {
      if (d.status === "Modified") modified++;
      else if (d.status === "Missing in Current") missing++;
      else if (d.status === "Added in Current") addedInCurrent++;
      else identical++;
    }
    return {
      changes: modified + missing + addedInCurrent,
      restorableChanges: modified + missing,
      modified,
      missing,
      addedInCurrent,
      identical,
    };
  }, [visibleDiffEntries]);

  const changedDiffPaths = useMemo(
    () =>
      visibleDiffEntries
        .filter(
          (d) =>
            d.status === "Modified" || d.status === "Missing in Current"
        )
        .map((d) => d.path),
    [visibleDiffEntries]
  );

  const formatStorageBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return `0.00 ${t("unit_mb", "MB")}`;
    const mb = bytes / 1024 / 1024;
    if (mb < 1) {
      const kb = Math.max(0.1, bytes / 1024);
      return `${kb.toFixed(1)} ${t("unit_kb", "KB")}`;
    }
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

  const actualWrittenBytes = isBaseline
    ? logicalSize
    : deltaStats.writtenBytes > 0 || deltaStats.written === 0
      ? Math.min(logicalSize, deltaStats.writtenBytes)
      : rawDiffSize || diffSize;
  const savedBytes = Math.max(0, logicalSize - actualWrittenBytes);
  const savedPct =
    logicalSize > 0
      ? Math.min(100, Math.max(0, Math.round((savedBytes / logicalSize) * 100)))
      : 0;

  // Structured Category Groups for EXTRACT view (Zero Pill Filters!)
  const extractGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = (f: any) => !q || f.path.toLowerCase().includes(q);
    const sumMb = (list: any[]) =>
      list.reduce((acc, f) => acc + (f.size_mb || 0), 0);

    if (isEngine) {
      const bin = engineBinFiles.filter(matchesSearch);
      const data = engineDataFiles.filter(matchesSearch);
      const delta = engineDeltaFiles.filter(matchesSearch);
      const packs = enginePackFiles.filter(matchesSearch);
      return [
        {
          id: "BIN",
          label: t("tc_engine_cat_bin", "Binaries"),
          icon: t("icon_terminal", "terminal"),
          colorVar: "var(--accent)",
          colorClass:
            "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_38%,transparent)]",
          files: bin,
          sizeMb: sumMb(bin),
        },
        {
          id: "DATA",
          label: t("tc_engine_cat_data", "Base Game"),
          icon: t("icon_inventory_2", "inventory_2"),
          colorVar: "var(--success)",
          colorClass:
            "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_38%,transparent)]",
          files: data,
          sizeMb: sumMb(data),
        },
        {
          id: "DELTA",
          label: t("tc_engine_cat_delta", "Delta"),
          icon: t("icon_difference", "difference"),
          colorVar: "var(--warning)",
          colorClass:
            "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_38%,transparent)]",
          files: delta,
          sizeMb: sumMb(delta),
        },
        {
          id: "PACKS",
          label: t("tc_engine_cat_packs", "Packs"),
          icon: t("icon_extension", "extension"),
          colorVar: "var(--subtext)",
          colorClass:
            "text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_18%,transparent)]",
          files: packs,
          sizeMb: sumMb(packs),
        },
      ].filter((g) => g.files.length > 0);
    }

    const savesList = (showVerRevisions ? saveFiles : primarySaveFiles).filter(
      matchesSearch
    );
    const configsList = configFiles.filter(matchesSearch);
    const trayList = trayFiles.filter(matchesSearch);

    return [
      {
        id: "SAVES",
        label: t("label_saves", "Saves"),
        icon: t("icon_save", "save"),
        colorVar: "var(--accent)",
        colorClass:
          "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_38%,transparent)]",
        files: savesList,
        sizeMb: sumMb(savesList),
        hasVerToggle: verRevisionFiles.length > 0,
      },
      {
        id: "CONFIGS",
        label: t("tc_panel_filter_configs", "Configs & Data"),
        icon: t("icon_tune", "tune"),
        colorVar: "var(--subtext)",
        colorClass:
          "text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_18%,transparent)]",
        files: configsList,
        sizeMb: sumMb(configsList),
      },
      {
        id: "TRAY",
        label: t("label_tray_files", "Tray Files"),
        icon: t("icon_group", "Holiday_Village"),
        colorVar: "var(--success)",
        colorClass:
          "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_38%,transparent)]",
        files: trayList,
        sizeMb: sumMb(trayList),
      },
    ].filter((g) => g.files.length > 0 || (g.id === "SAVES" && verRevisionFiles.length > 0 && !q));
  }, [
    isEngine,
    searchQuery,
    showVerRevisions,
    saveFiles,
    primarySaveFiles,
    verRevisionFiles.length,
    configFiles,
    trayFiles,
    engineBinFiles,
    engineDataFiles,
    engineDeltaFiles,
    enginePackFiles,
    t,
  ]);

  const allDeltaEntries = useMemo(() => {
    const list = [
      ...visibleBackupFiles.map((f) => ({
        path: f.path,
        size_mb: f.size_mb || 0,
        delta_status:
          f.delta_status || (isBaseline ? "Baseline" : "Deduplicated"),
      })),
      ...visibleRemovedFromPrev.map((r) => ({
        path: r.path,
        size_mb: r.size_mb || 0,
        delta_status: "Removed",
      })),
    ];
    const order = (st: string) => {
      if (st === "Updated") return 0;
      if (st === "Added" || st === "Baseline") return 1;
      if (st === "Removed") return 2;
      return 3;
    };
    list.sort((a, b) => {
      const oa = order(a.delta_status);
      const ob = order(b.delta_status);
      if (oa !== ob) return oa - ob;
      return a.path.localeCompare(b.path);
    });
    return list;
  }, [visibleBackupFiles, visibleRemovedFromPrev, isBaseline]);

  const filteredDelta = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allDeltaEntries.filter((item) => {
      if (item.delta_status === "Deduplicated") return false;
      if (q && !item.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allDeltaEntries, searchQuery]);

  const filteredDiff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleDiffEntries.filter((d) => {
      if (d.status === "Identical") return false;
      if (q && !d.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [visibleDiffEntries, searchQuery]);

  if (!normalizedBackup) {
    return (
      <div className="text-[var(--subtext)] text-xs p-6 text-center">
        {t("no_backup_selected", "No backup selected")}
      </div>
    );
  }

  const showRestoreBar =
    Boolean(onRestoreBackup && !isPostBackupSummary) ||
    changedDiffPaths.length > 0;

  return (
    <div className="flex flex-col gap-4 w-full pb-6">
      {/* 1. Unified Snapshot Overview & Restore Card */}
      <SidePanelHeroCard
        icon={icon}
        overline={
          isEngine
            ? t("engine_full", "Engine Core")
            : t("world_state", "World State")
        }
        title={
          isBaseline
            ? t(
                "tc_delta_baseline_note",
                "Initial Baseline Snapshot (100% Newly Written)"
              )
            : previousBackupName
              ? (
                  t("tc_delta_compared_to", "Compared to {PREV}") ||
                  "Compared to {PREV}"
                ).replace(
                  "{PREV}",
                  `${prevSig?.version || previousBackupName}${
                    prevDateDisplay ? ` (${prevDateDisplay})` : ""
                  }`
                )
              : t(
                  "tc_complete_subtitle",
                  "Point-in-time backup verified and indexed"
                )
        }
        description={location || undefined}
        badge={
          diffCounts.changes > 0
            ? `${diffCounts.changes} ${t("tab_diff", "Differences")}`
            : t("diff_in_sync", "In Sync")
        }
        badgeIcon={
          diffCounts.changes > 0
            ? t("icon_difference", "difference")
            : t("icon_check_circle", "check_circle")
        }
        variant={isEngine ? "danger" : "accent"}
      >
        {/* 2x2 Spacious StatBox Grid — Wide columns so labels and values are never cut off */}
        <div className="grid grid-cols-2 gap-3">
          <StatBox
            icon={t("icon_hard_drive", "hard_drive")}
            iconColorClass="text-[var(--accent)]"
            label={t("tc_stat_actually_backed_up", "Written to Disk")}
            value={
              <span className="font-mono">
                {formatStorageBytes(actualWrittenBytes)}
              </span>
            }
          />
          <StatBox
            icon={t("icon_link", "link")}
            iconColorClass="text-[var(--success)]"
            label={t("tc_stat_deduplicated", "Storage Saved")}
            value={
              <span className="font-mono text-[var(--success)]">
                {formatStorageBytes(savedBytes)} ({savedPct}%)
              </span>
            }
          />
          <StatBox
            icon={t("icon_inventory_2", "inventory_2")}
            iconColorClass="text-[var(--accent)]"
            label={t("logical_size", "Snapshot Size")}
            value={
              <span className="font-mono">
                {formatStorageBytes(logicalSize)}
              </span>
            }
          />
          <StatBox
            icon={t("icon_folder", "folder")}
            iconColorClass="text-[var(--accent)]"
            label={t("tc_stat_indexed_files", "Indexed Files")}
            value={
              <span className="font-mono">
                {visibleBackupFiles.length.toLocaleString()} (
                {deltaStats.written.toLocaleString()}{" "}
                {t("tc_badge_written", "Written")})
              </span>
            }
          />
        </div>

        {/* Clean Integrated Restore Bar */}
        {showRestoreBar && (
          <div className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0 flex-1 min-w-[220px]">
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

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {confirmFullRestore ? (
                <>
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
                    label={
                      isEngine
                        ? t(
                            "confirm_restore_engine_card",
                            "Confirm Engine Restore"
                          )
                        : t("confirm_restore_state", "Confirm Restore")
                    }
                    onClick={() => {
                      setConfirmFullRestore(false);
                      if (onClosePanel) onClosePanel();
                      if (onRestoreBackup)
                        onRestoreBackup(normalizedBackup, isEngine);
                    }}
                    className="!px-4 !py-2"
                  />
                </>
              ) : confirmRestoreAllDiff ? (
                <>
                  <ActionButton
                    variant="glass"
                    icon={t("icon_close", "close")}
                    label={t("btn_cancel", "Cancel")}
                    onClick={() => setConfirmRestoreAllDiff(false)}
                    className="!px-3.5 !py-2"
                  />
                  <ActionButton
                    variant="accent"
                    icon={t("icon_done_all", "done_all")}
                    label={`${t("confirm", "Confirm")} (${changedDiffPaths.length})`}
                    disabled={isBatchExtracting}
                    onClick={() => handleBatchExtract(changedDiffPaths, true)}
                    className="!px-4 !py-2"
                  />
                </>
              ) : (
                <>
                  {changedDiffPaths.length > 0 && (
                    <ActionButton
                      variant="glass"
                      icon={t("icon_done_all", "done_all")}
                      label={(
                        t(
                          "tc_restore_changed_btn",
                          "Restore Changed ({COUNT})"
                        ) || "Restore Changed ({COUNT})"
                      ).replace("{COUNT}", String(changedDiffPaths.length))}
                      disabled={isBatchExtracting}
                      onClick={() => setConfirmRestoreAllDiff(true)}
                      className="!px-3.5 !py-2"
                    />
                  )}
                  {onRestoreBackup && !isPostBackupSummary && (
                    <ActionButton
                      variant="accent"
                      icon={t("icon_restore", "restore")}
                      label={t(
                        "tc_restore_full_title",
                        "Restore Full Snapshot"
                      )}
                      onClick={() => setConfirmFullRestore(true)}
                      className="!px-4 !py-2"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </SidePanelHeroCard>

      {/* 2. 3-Column DashboardStatTile View Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        <DashboardStatTile
          variant="filter"
          className="!w-full"
          icon={t("icon_archive", "archive")}
          label={t("tc_tab_backed_up_delta", "Backed Up Delta")}
          number={
            isBaseline
              ? `${deltaStats.written.toLocaleString()} (${t(
                  "tc_delta_badge_baseline",
                  "Baseline"
                )})`
              : `${deltaStats.changed.toLocaleString()} ${t(
                  "tc_diff_changes",
                  "Changes"
                )}`
          }
          isActive={activeView === "DELTA"}
          onClick={() => {
            setActiveView("DELTA");
            setListLimit(100);
          }}
        />
        <DashboardStatTile
          variant="filter"
          className="!w-full"
          icon={t("icon_compare_arrows", "compare_arrows")}
          label={t("tc_tab_live_diff", "Live Folder Diff")}
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
        <DashboardStatTile
          variant="filter"
          className="!w-full"
          icon={t("icon_unarchive", "unarchive")}
          label={t("tab_extract", "Extract")}
          number={`${visibleBackupFiles.length.toLocaleString()} ${t(
            "modal_files",
            "Files"
          )}`}
          isActive={activeView === "EXTRACT"}
          onClick={() => {
            setActiveView("EXTRACT");
            setListLimit(100);
          }}
        />
      </div>

      {/* 3. Structured OS File Table with Integrated Search Toolbar (No Pill Filters) */}
      <div className="glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden flex flex-col">
        {/* Integrated Table Search & Batch Action Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] opacity-70 shrink-0">
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
              className="bg-transparent border-none outline-none text-xs font-semibold text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-50 w-full min-w-0"
            />
            {searchQuery.trim() !== "" && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_close", "close")}
                </span>
              </button>
            )}
          </div>

          {activeView === "EXTRACT" && selectedPaths.size > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              {confirmBatchExtract ? (
                <>
                  <button
                    type="button"
                    disabled={isBatchExtracting}
                    onClick={() =>
                      handleBatchExtract(Array.from(selectedPaths), true)
                    }
                    className="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-transparent border border-[var(--accent)] text-[var(--accent)] cursor-pointer"
                  >
                    {t("confirm", "Confirm")} ({selectedPaths.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBatchExtract(false)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                  >
                    {t("btn_cancel", "Cancel")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isBatchExtracting}
                  onClick={() => setConfirmBatchExtract(true)}
                  className="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t("icon_restore", "restore")}
                  </span>
                  {(
                    t(
                      "tc_extract_selected_btn",
                      "Extract Selected ({COUNT})"
                    ) || "Extract Selected ({COUNT})"
                  ).replace("{COUNT}", String(selectedPaths.size))}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table Column Header */}
        <div className="grid grid-cols-[minmax(0,1fr)_96px_132px_104px] items-center gap-3 px-4 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
          <span>{t("tc_col_file", "File")}</span>
          <span className="text-right">{t("tc_col_size", "Size")}</span>
          <span className="text-center">{t("tc_col_status", "Status")}</span>
          <span className="text-right">{t("action", "Action")}</span>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)] max-h-[440px] overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="text-center text-xs text-[var(--subtext)] py-12 animate-pulse">
              {activeView === "DIFF"
                ? t("calculating_diff", "Calculating differences...")
                : t("loading_contents", "Loading contents...")}
            </div>
          ) : activeView === "DELTA" ? (
            filteredDelta.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={t("icon_link", "link")}
                  title={
                    deltaStats.changed === 0
                      ? t(
                          "tc_delta_zero_changes_title",
                          "Zero Changed Files Since Previous Snapshot (100% Deduplicated)"
                        )
                      : t("no_files_found", "No editable {mods} located.")
                  }
                />
              </div>
            ) : (
              <>
                {filteredDelta.slice(0, listLimit).map((item, idx) => {
                  const st = item.delta_status;
                  const isAdded = st === "Added" || st === "Baseline";
                  const isUpdated = st === "Updated";
                  const isRemoved = st === "Removed";

                  const badgeColorVar = isUpdated
                    ? "var(--warning)"
                    : isAdded
                      ? "var(--success)"
                      : isRemoved
                        ? "var(--danger)"
                        : "var(--subtext)";

                  const badgeIcon = isUpdated
                    ? t("icon_edit", "edit")
                    : isAdded
                      ? t("icon_add_circle", "add_circle")
                      : isRemoved
                        ? t("icon_remove_circle", "remove_circle")
                        : t("icon_link", "link");

                  const badgeLabel =
                    st === "Baseline"
                      ? t("tc_delta_badge_baseline", "Baseline")
                      : isUpdated
                        ? t("tc_delta_filter_updated", "Updated")
                        : isAdded
                          ? t("tc_delta_filter_added", "New Files")
                          : isRemoved
                            ? t("diff_status_removed", "Removed")
                            : t("tc_delta_filter_dedup", "Hardlinked");

                  const catInfo = getFileCategoryInfo(item.path);
                  const folderSub = getFileFolderSubtitle(item.path);
                  const isDone = extractedSet.has(item.path);
                  const isBusy = extracting === item.path;
                  const isConfirmingThis = confirmExtractPath === item.path;
                  const fileName = item.path.split("/").pop() || item.path;

                  return (
                    <div
                      key={`${item.path}-${idx}`}
                      className="grid grid-cols-[minmax(0,1fr)_96px_132px_104px] items-center gap-3 px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors"
                    >
                      {/* Col 1: File & Folder */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl border glass-surface flex items-center justify-center shrink-0"
                          style={{
                            color: catInfo.colorVar,
                            borderColor: `color-mix(in srgb, ${catInfo.colorVar} 25%, var(--border))`,
                          }}
                        >
                          <span className="material-symbols-rounded !text-[16px]">
                            {catInfo.icon}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold tracking-tight text-[var(--text)] truncate">
                            {fileName}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)] opacity-75 truncate">
                            {folderSub} &bull; {catInfo.label}
                          </span>
                        </div>
                      </div>

                      {/* Col 2: Size */}
                      <span className="text-right text-[11px] font-mono font-bold text-[var(--subtext)] whitespace-nowrap">
                        {formatFileSizeMb(item.size_mb)}
                      </span>

                      {/* Col 3: Status Badge */}
                      <div className="flex justify-center">
                        <span
                          className={`${VAULT_CHIP_CLASS} whitespace-nowrap`}
                          style={{
                            color: badgeColorVar,
                            borderColor: `color-mix(in srgb, ${badgeColorVar} 35%, var(--border))`,
                          }}
                        >
                          <span className="material-symbols-rounded !text-[12px] shrink-0">
                            {badgeIcon}
                          </span>
                          <span>{badgeLabel}</span>
                        </span>
                      </div>

                      {/* Col 4: Action */}
                      <div className="flex items-center justify-end gap-1.5">
                        {!isRemoved &&
                          (isConfirmingThis ? (
                            <>
                              <button
                                type="button"
                                disabled={isBusy || isBatchExtracting}
                                onClick={() =>
                                  handleExtractSingle(item.path, true)
                                }
                                className="px-2.5 h-7 rounded-lg border bg-transparent border-[var(--accent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all"
                              >
                                {t("confirm", "Confirm")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmExtractPath(null)}
                                className="w-7 h-7 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer transition-all"
                              >
                                <span className="material-symbols-outlined !text-[13px]">
                                  {t("icon_close", "close")}
                                </span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmExtractPath(item.path)}
                              disabled={isBusy || isBatchExtracting}
                              className={`px-2.5 h-7 rounded-lg border bg-transparent inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
                                isDone
                                  ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                                  : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                              }`}
                            >
                              <span
                                className={`material-symbols-outlined !text-[13px] ${
                                  isBusy ? "animate-spin" : ""
                                }`}
                              >
                                {isDone
                                  ? t("icon_check", "check")
                                  : isBusy
                                    ? t("icon_sync", "sync")
                                    : t("icon_restore", "restore")}
                              </span>
                              <span>
                                {isDone
                                  ? t("tc_panel_extracted_badge", "Extracted")
                                  : t("tab_extract", "Extract")}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}

                {filteredDelta.length > listLimit && (
                  <div className="flex items-center justify-between px-4 py-3 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                    <span className="text-[10px] font-mono text-[var(--subtext)] uppercase tracking-widest">
                      {t(
                        "showing_files",
                        "Showing first {0} files"
                      )?.replace("{0}", listLimit.toString()) ||
                        `Showing first ${listLimit} files`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setListLimit((l) => l + 100)}
                      className="px-3.5 py-1.5 rounded-xl bg-transparent hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[10px] font-black uppercase tracking-widest border border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-colors cursor-pointer"
                    >
                      {t("load_more", "Load More")}
                    </button>
                  </div>
                )}
              </>
            )
          ) : activeView === "EXTRACT" ? (
            extractGroups.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={t("icon_folder", "folder")}
                  title={t("no_files_found", "No editable {mods} located.")}
                />
              </div>
            ) : (
              <>
                {extractGroups.map((group: any) => {
                  const isCollapsed = collapsedGroups.has(group.id);
                  return (
                    <div key={group.id} className="flex flex-col">
                      {/* Collapsible Category Section Header inside the Table */}
                      <div
                        onClick={() => toggleGroupCollapse(group.id)}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">
                            {isCollapsed
                              ? t("icon_chevron_right", "chevron_right")
                              : t("icon_expand_more", "expand_more")}
                          </span>
                          <span
                            className={VAULT_CHIP_CLASS}
                            style={{
                              color: group.colorVar,
                              borderColor: `color-mix(in srgb, ${group.colorVar} 35%, var(--border))`,
                            }}
                          >
                            <span className="material-symbols-rounded !text-[12px] shrink-0">
                              {group.icon}
                            </span>
                            <span>{group.label}</span>
                          </span>
                          <span className="text-[11px] font-mono text-[var(--subtext)]">
                            {group.files.length.toLocaleString()}{" "}
                            {t("modal_files", "Files")} &bull;{" "}
                            {formatFileSizeMb(group.sizeMb)}
                          </span>
                        </div>

                        {group.hasVerToggle && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowVerRevisions((v) => !v);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border bg-transparent cursor-pointer transition-all ${
                              showVerRevisions
                                ? "border-[var(--accent)] text-[var(--accent)]"
                                : "border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                            }`}
                          >
                            {showVerRevisions
                              ? t("tc_hide_ver_backups", "Hide .ver Revisions")
                              : `${t("tc_show_ver_backups", "Show .ver Revisions")} (${verRevisionFiles.length})`}
                          </button>
                        )}
                      </div>

                      {/* Category Files */}
                      {!isCollapsed &&
                        group.files.slice(0, listLimit).map((file: any) => {
                          const catInfo = getFileCategoryInfo(file.path);
                          const folderSub = getFileFolderSubtitle(file.path);
                          const isSelected = selectedPaths.has(file.path);
                          const isDone = extractedSet.has(file.path);
                          const isBusy = extracting === file.path;
                          const isConfirmingThis =
                            confirmExtractPath === file.path;
                          const fileName =
                            file.path.split("/").pop() || file.path;

                          return (
                            <div
                              key={file.path}
                              onClick={() => toggleSelectPath(file.path)}
                              className={`grid grid-cols-[minmax(0,1fr)_96px_132px_104px] items-center gap-3 px-4 py-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                                  : "hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
                              }`}
                            >
                              {/* Col 1: File & Folder */}
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className="w-9 h-9 rounded-xl border glass-surface flex items-center justify-center shrink-0 transition-colors"
                                  style={{
                                    color: isSelected ? "var(--accent)" : catInfo.colorVar,
                                    borderColor: isSelected
                                      ? "var(--accent)"
                                      : `color-mix(in srgb, ${catInfo.colorVar} 25%, var(--border))`,
                                  }}
                                >
                                  <span className="material-symbols-rounded !text-[16px]">
                                    {isSelected
                                      ? t("icon_check", "check")
                                      : catInfo.icon}
                                  </span>
                                </div>

                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-bold text-[var(--text)] tracking-tight truncate">
                                    {fileName}
                                  </span>
                                  <span className="text-[10px] font-mono text-[var(--subtext)] opacity-75 truncate">
                                    {folderSub}
                                  </span>
                                </div>
                              </div>

                              {/* Col 2: Size */}
                              <span className="text-right text-[11px] font-mono font-bold text-[var(--subtext)] whitespace-nowrap">
                                {formatFileSizeMb(file.size_mb)}
                              </span>

                              {/* Col 3: Category Badge */}
                              <div className="flex justify-center">
                                <span
                                  className={`${VAULT_CHIP_CLASS} whitespace-nowrap`}
                                  style={{
                                    color: catInfo.colorVar,
                                    borderColor: `color-mix(in srgb, ${catInfo.colorVar} 35%, var(--border))`,
                                  }}
                                >
                                  <span className="material-symbols-rounded !text-[12px] shrink-0">
                                    {catInfo.icon}
                                  </span>
                                  <span>{catInfo.label}</span>
                                </span>
                              </div>

                              {/* Col 4: Action */}
                              <div
                                className="flex items-center justify-end gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isConfirmingThis ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isBusy || isBatchExtracting}
                                      onClick={() =>
                                        handleExtractSingle(file.path, false)
                                      }
                                      className="px-2.5 h-7 rounded-lg border bg-transparent border-[var(--accent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all"
                                    >
                                      {t("confirm", "Confirm")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmExtractPath(null)
                                      }
                                      className="w-7 h-7 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer transition-all"
                                    >
                                      <span className="material-symbols-outlined !text-[13px]">
                                        {t("icon_close", "close")}
                                      </span>
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isBusy || isBatchExtracting}
                                    onClick={() =>
                                      setConfirmExtractPath(file.path)
                                    }
                                    className={`px-2.5 h-7 rounded-lg border bg-transparent inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
                                      isDone
                                        ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                                        : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                                    }`}
                                  >
                                    <span
                                      className={`material-symbols-outlined !text-[13px] ${
                                        isBusy ? "animate-spin" : ""
                                      }`}
                                    >
                                      {isDone
                                        ? t("icon_check", "check")
                                        : isBusy
                                          ? t("icon_sync", "sync")
                                          : t("icon_restore", "restore")}
                                    </span>
                                    <span>
                                      {isDone
                                        ? t(
                                            "tc_panel_extracted_badge",
                                            "Extracted"
                                          )
                                        : t("tab_extract", "Extract")}
                                    </span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                      {!isCollapsed && group.files.length > listLimit && (
                        <div className="flex items-center justify-between px-4 py-3 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                          <span className="text-[10px] font-mono text-[var(--subtext)] uppercase tracking-widest">
                            {t(
                              "showing_files",
                              "Showing first {0} files"
                            )?.replace("{0}", listLimit.toString()) ||
                              `Showing first ${listLimit} files`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setListLimit((l) => l + 100)}
                            className="px-3.5 py-1.5 rounded-xl bg-transparent hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[10px] font-black uppercase tracking-widest border border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-colors cursor-pointer"
                          >
                            {t("load_more", "Load More")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )
          ) : filteredDiff.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={t("icon_verified", "verified")}
                title={t("everything_identical", "Everything is identical")}
              />
            </div>
          ) : (
            <>
              {filteredDiff.slice(0, listLimit).map((diff, i) => {
                const isMod = diff.status === "Modified";
                const isMiss = diff.status === "Missing in Current";
                const isNewActive = diff.status === "Added in Current";

                const badgeColorVar = isMod
                  ? "var(--warning)"
                  : isMiss
                    ? "var(--danger)"
                    : isNewActive
                      ? "var(--accent)"
                      : "var(--success)";

                const badgeIcon = isMod
                  ? t("icon_edit", "edit")
                  : isMiss
                    ? t("icon_warning", "warning")
                    : isNewActive
                      ? t("icon_add_circle", "add_circle")
                      : t("icon_check_circle", "check_circle");

                const catInfo = getFileCategoryInfo(diff.path);
                const folderSub = getFileFolderSubtitle(diff.path);
                const isDone = extractedSet.has(diff.path);
                const isBusy = extracting === diff.path;
                const isConfirmingThis = confirmExtractPath === diff.path;
                const canRestoreFromSnapshot = isMod || isMiss;

                const sizeLabel =
                  isNewActive && typeof diff.live_size_mb === "number"
                    ? formatFileSizeMb(diff.live_size_mb)
                    : isMod &&
                        typeof diff.live_size_mb === "number" &&
                        Math.abs((diff.size_mb || 0) - diff.live_size_mb) >
                          0.001
                      ? `${formatFileSizeMb(diff.size_mb)} → ${formatFileSizeMb(
                          diff.live_size_mb
                        )}`
                      : formatFileSizeMb(diff.size_mb);

                return (
                  <div
                    key={`${diff.path}-${i}`}
                    className="grid grid-cols-[minmax(0,1fr)_96px_132px_104px] items-center gap-3 px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors"
                  >
                    {/* Col 1: File & Folder */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl border glass-surface flex items-center justify-center shrink-0"
                        style={{
                          color: catInfo.colorVar,
                          borderColor: `color-mix(in srgb, ${catInfo.colorVar} 25%, var(--border))`,
                        }}
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {catInfo.icon}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold tracking-tight text-[var(--text)] truncate">
                          {diff.path.split("/").pop()}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--subtext)] opacity-75 truncate">
                          {folderSub} &bull; {catInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* Col 2: Size */}
                    <span className="text-right text-[11px] font-mono font-bold text-[var(--subtext)] whitespace-nowrap">
                      {sizeLabel}
                    </span>

                    {/* Col 3: Status Badge */}
                    <div className="flex justify-center">
                      <span
                        className={VAULT_CHIP_CLASS}
                        style={{
                          color: badgeColorVar,
                          borderColor: `color-mix(in srgb, ${badgeColorVar} 35%, var(--border))`,
                        }}
                      >
                        <span className="material-symbols-rounded !text-[12px] shrink-0">
                          {badgeIcon}
                        </span>
                        <span>
                          {isMod
                            ? t("modified", "Modified")
                            : isMiss
                              ? t("tc_diff_filter_missing", "Missing in Active")
                              : isNewActive
                                ? t(
                                    "tc_diff_filter_new_in_active",
                                    "New in Active"
                                  )
                                : t("tc_diff_filter_identical", "Unchanged")}
                        </span>
                      </span>
                    </div>

                    {/* Col 4: Action */}
                    <div className="flex items-center justify-end gap-1.5">
                      {canRestoreFromSnapshot &&
                        (isConfirmingThis ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy || isBatchExtracting}
                              onClick={() =>
                                handleExtractSingle(diff.path, true)
                              }
                              className="px-2.5 h-7 rounded-lg border bg-transparent border-[var(--accent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all"
                            >
                              {t("confirm", "Confirm")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmExtractPath(null)}
                              className="w-7 h-7 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer transition-all"
                            >
                              <span className="material-symbols-outlined !text-[13px]">
                                {t("icon_close", "close")}
                              </span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmExtractPath(diff.path)}
                            disabled={isBusy || isBatchExtracting}
                            className={`px-2.5 h-7 rounded-lg border bg-transparent inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
                              isDone
                                ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                                : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                            }`}
                          >
                            <span
                              className={`material-symbols-outlined !text-[13px] ${
                                isBusy ? "animate-spin" : ""
                              }`}
                            >
                              {isDone
                                ? t("icon_check", "check")
                                : isBusy
                                  ? t("icon_sync", "sync")
                                  : t("icon_restore", "restore")}
                            </span>
                            <span>
                              {isDone
                                ? t("tc_panel_extracted_badge", "Extracted")
                                : t("btn_restore", "Restore")}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}

              {filteredDiff.length > listLimit && (
                <div className="flex items-center justify-between px-4 py-3 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                  <span className="text-[10px] font-mono text-[var(--subtext)] uppercase tracking-widest">
                    {t("showing_files", "Showing first {0} files")?.replace(
                      "{0}",
                      listLimit.toString()
                    ) || `Showing first ${listLimit} files`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setListLimit((l) => l + 100)}
                    className="px-3.5 py-1.5 rounded-xl bg-transparent hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[10px] font-black uppercase tracking-widest border border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-colors cursor-pointer"
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
  );
}

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
  const [location, setLocation] = useState<string>("");

  const normalizedBackup = useMemo(
    () =>
      selectedBackup ? selectedBackup.replace(/^Secured:\s*/i, "").trim() : null,
    [selectedBackup]
  );

  const isEngine = Boolean(normalizedBackup?.toLowerCase().includes("engine"));
  const sig = useMemo(() => {
    if (!normalizedBackup) return null;
    if (getBackupSignature) return getBackupSignature(normalizedBackup);
    return parseBackupSignatureFallback(normalizedBackup, t);
  }, [normalizedBackup, getBackupSignature, t]);

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
  const icon = isEngine
    ? t("icon_settings", "settings")
    : t("icon_public", "public");
  const themeColor = isEngine
    ? "text-[var(--danger)]"
    : "text-[var(--accent)]";

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

  const handleOpenFolder = async () => {
    if (!location) return;
    try {
      await openPath(location);
    } catch (e) {
      console.error(e);
    }
  };

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
      widthClass="w-[90vw] md:w-[840px]"
      isResizable={true}
      defaultWidth={840}
      headerActions={
        normalizedBackup ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_folder_open", "folder_open")}
              tooltip={t("tc_open_in_explorer", "Open in Explorer")}
              onClick={handleOpenFolder}
              disabled={!location}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <TimeCapsuleSnapshotDossier
          selectedBackup={normalizedBackup}
          config={config}
          getBackupSignature={getBackupSignature}
          onRestoreBackup={onRestoreBackup}
          onClosePanel={onClose}
          isPostBackupSummary={false}
          onLocationChange={setLocation}
        />
      </div>
    </SidePanel>
  );
}
