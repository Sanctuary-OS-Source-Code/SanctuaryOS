import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  DashboardStatTile,
  StatBox,
  ActionButton,
  ActionPill,
  UniversalGroup,
  HoverTooltip,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
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
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"DEFAULT" | "NAME" | "SIZE" | "SECTOR">(
    "DEFAULT"
  );
  const [listLimit, setListLimit] = useState(40);

  const docsPath = useMemo(() => {
    if (activeConfig?.mods_path) {
      return activeConfig.mods_path.replace(/[\\/]Mods[\\/]?$/i, "");
    }
    return "";
  }, [activeConfig]);

  useEffect(() => {
    setListLimit(40);
    setSearchQuery("");
    setSectorFilter("ALL");
    setStatusFilter("ALL");
    setSortBy("DEFAULT");
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
          id: "BIN",
          icon: t("icon_terminal", "terminal"),
          label: t("tc_engine_cat_bin", "Binaries"),
          colorVar: "var(--accent)",
          colorClass: "text-[var(--accent)]",
        };
      }
      if (isEngineDeltaFile(filePath)) {
        return {
          id: "DELTA",
          icon: t("icon_difference", "difference"),
          label: t("tc_engine_cat_delta", "Delta"),
          colorVar: "var(--warning)",
          colorClass: "text-[var(--warning)]",
        };
      }
      if (isEngineDataFile(filePath)) {
        return {
          id: "DATA",
          icon: t("icon_inventory_2", "inventory_2"),
          label: t("tc_engine_cat_data", "Base Game"),
          colorVar: "var(--success)",
          colorClass: "text-[var(--success)]",
        };
      }
      return {
        id: "PACKS",
        icon: t("icon_extension", "extension"),
        label: t("tc_engine_cat_packs", "Packs"),
        colorVar: "var(--subtext)",
        colorClass: "text-[var(--subtext)]",
      };
    }

    if (isSaveFile(filePath)) {
      return {
        id: "SAVES",
        icon: t("icon_save", "save"),
        label: t("label_saves", "Saves"),
        colorVar: "var(--accent)",
        colorClass: "text-[var(--accent)]",
      };
    }
    if (isTrayFile(filePath)) {
      return {
        id: "TRAY",
        icon: t("icon_group", "Holiday_Village"),
        label: t("label_tray_files", "Tray Files"),
        colorVar: "var(--success)",
        colorClass: "text-[var(--success)]",
      };
    }
    return {
      id: "CONFIGS",
      icon: t("icon_tune", "tune"),
      label: t("tc_panel_filter_configs", "Configs & Data"),
      colorVar: "var(--subtext)",
      colorClass: "text-[var(--subtext)]",
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

  const sectorOptions = useMemo(() => {
    if (isEngine) {
      return [
        { id: "ALL", label: t("filter_all", "All") },
        { id: "BIN", label: t("tc_engine_cat_bin", "Binaries") },
        { id: "DATA", label: t("tc_engine_cat_data", "Base Game") },
        { id: "DELTA", label: t("tc_engine_cat_delta", "Delta") },
        { id: "PACKS", label: t("tc_engine_cat_packs", "Packs") },
      ];
    }
    return [
      { id: "ALL", label: t("filter_all", "All") },
      { id: "SAVES", label: t("label_saves", "Saves") },
      { id: "CONFIGS", label: t("tc_panel_filter_configs", "Configs & Data") },
      { id: "TRAY", label: t("label_tray_files", "Tray Files") },
    ];
  }, [isEngine, t]);

  const sortItems = (list: any[]) => {
    if (sortBy === "DEFAULT") return list;
    const copy = [...list];
    copy.sort((a, b) => {
      const fileA = (a.path || "").split("/").pop() || a.path || "";
      const fileB = (b.path || "").split("/").pop() || b.path || "";
      if (sortBy === "NAME") {
        return fileA.localeCompare(fileB);
      }
      if (sortBy === "SIZE") {
        const sizeA = a.size_mb ?? a.live_size_mb ?? 0;
        const sizeB = b.size_mb ?? b.live_size_mb ?? 0;
        if (sizeB !== sizeA) return sizeB - sizeA;
        return fileA.localeCompare(fileB);
      }
      if (sortBy === "SECTOR") {
        const catA = getFileCategoryInfo(a.path || "").label;
        const catB = getFileCategoryInfo(b.path || "").label;
        const cmp = catA.localeCompare(catB);
        if (cmp !== 0) return cmp;
        return fileA.localeCompare(fileB);
      }
      return 0;
    });
    return copy;
  };

  // Structured Category Groups for EXTRACT view
  const extractGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = (f: any) => !q || f.path.toLowerCase().includes(q);
    const sumMb = (list: any[]) =>
      list.reduce((acc, f) => acc + (f.size_mb || 0), 0);

    if (isEngine) {
      const bin = sortItems(engineBinFiles.filter(matchesSearch));
      const data = sortItems(engineDataFiles.filter(matchesSearch));
      const delta = sortItems(engineDeltaFiles.filter(matchesSearch));
      const packs = sortItems(enginePackFiles.filter(matchesSearch));
      return [
        {
          id: "BIN",
          label: t("tc_engine_cat_bin", "Binaries"),
          icon: t("icon_terminal", "terminal"),
          colorVar: "var(--accent)",
          files: bin,
          sizeMb: sumMb(bin),
        },
        {
          id: "DATA",
          label: t("tc_engine_cat_data", "Base Game"),
          icon: t("icon_inventory_2", "inventory_2"),
          colorVar: "var(--success)",
          files: data,
          sizeMb: sumMb(data),
        },
        {
          id: "DELTA",
          label: t("tc_engine_cat_delta", "Delta"),
          icon: t("icon_difference", "difference"),
          colorVar: "var(--warning)",
          files: delta,
          sizeMb: sumMb(delta),
        },
        {
          id: "PACKS",
          label: t("tc_engine_cat_packs", "Packs"),
          icon: t("icon_extension", "extension"),
          colorVar: "var(--subtext)",
          files: packs,
          sizeMb: sumMb(packs),
        },
      ].filter(
        (g) =>
          (sectorFilter === "ALL" || sectorFilter === g.id) &&
          g.files.length > 0
      );
    }

    const savesList = sortItems(
      (showVerRevisions ? saveFiles : primarySaveFiles).filter(matchesSearch)
    );
    const configsList = sortItems(configFiles.filter(matchesSearch));
    const trayList = sortItems(trayFiles.filter(matchesSearch));

    return [
      {
        id: "SAVES",
        label: t("label_saves", "Saves"),
        icon: t("icon_save", "save"),
        colorVar: "var(--accent)",
        files: savesList,
        sizeMb: sumMb(savesList),
        hasVerToggle: verRevisionFiles.length > 0,
      },
      {
        id: "CONFIGS",
        label: t("tc_panel_filter_configs", "Configs & Data"),
        icon: t("icon_tune", "tune"),
        colorVar: "var(--subtext)",
        files: configsList,
        sizeMb: sumMb(configsList),
      },
      {
        id: "TRAY",
        label: t("label_tray_files", "Tray Files"),
        icon: t("icon_group", "Holiday_Village"),
        colorVar: "var(--success)",
        files: trayList,
        sizeMb: sumMb(trayList),
      },
    ].filter(
      (g) =>
        (sectorFilter === "ALL" || sectorFilter === g.id) &&
        (g.files.length > 0 ||
          (g.id === "SAVES" && verRevisionFiles.length > 0 && !q))
    );
  }, [
    isEngine,
    searchQuery,
    sectorFilter,
    sortBy,
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
    const base = allDeltaEntries.filter((item) => {
      if (item.delta_status === "Deduplicated") return false;
      if (!showVerRevisions && item.path.toLowerCase().includes(".save.ver")) {
        return false;
      }
      if (q && !item.path.toLowerCase().includes(q)) return false;
      if (sectorFilter !== "ALL") {
        const cat = getFileCategoryInfo(item.path);
        if (cat.id !== sectorFilter) return false;
      }
      if (statusFilter !== "ALL") {
        if (statusFilter === "MODIFIED" && item.delta_status !== "Updated")
          return false;
        if (
          statusFilter === "ADDED" &&
          item.delta_status !== "Added" &&
          item.delta_status !== "Baseline"
        )
          return false;
        if (statusFilter === "REMOVED" && item.delta_status !== "Removed")
          return false;
      }
      return true;
    });
    return sortItems(base);
  }, [
    allDeltaEntries,
    searchQuery,
    sectorFilter,
    statusFilter,
    sortBy,
    showVerRevisions,
  ]);

  const filteredDiff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = visibleDiffEntries.filter((d) => {
      if (d.status === "Identical") return false;
      if (!showVerRevisions && d.path.toLowerCase().includes(".save.ver")) {
        return false;
      }
      if (q && !d.path.toLowerCase().includes(q)) return false;
      if (sectorFilter !== "ALL") {
        const cat = getFileCategoryInfo(d.path);
        if (cat.id !== sectorFilter) return false;
      }
      if (statusFilter !== "ALL") {
        if (statusFilter === "MODIFIED" && d.status !== "Modified") return false;
        if (statusFilter === "MISSING" && d.status !== "Missing in Current")
          return false;
        if (statusFilter === "ADDED" && d.status !== "Added in Current")
          return false;
      }
      return true;
    });
    return sortItems(base);
  }, [
    visibleDiffEntries,
    searchQuery,
    sectorFilter,
    statusFilter,
    sortBy,
    showVerRevisions,
  ]);

  if (!normalizedBackup) {
    return (
      <div className="text-[var(--subtext)] text-xs p-6 text-center">
        {t("no_backup_selected", "No backup selected")}
      </div>
    );
  }

  const showRestoreBar =
    Boolean(onRestoreBackup && !isPostBackupSummary) ||
    changedDiffPaths.length > 0 ||
    selectedPaths.size > 0;

  const hasActiveFilters =
    sectorFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    sortBy !== "DEFAULT" ||
    showVerRevisions;

  // Unified 2-Row Sanctuary Card Renderer for Snapshot Files
  const renderCapsuleFileCard = (
    item: {
      path: string;
      sizeLabel: string;
      badgeIcon: string;
      badgeColorVar: string;
      badgeLabel: string;
      canExtract: boolean;
      refreshDiffOnExtract: boolean;
      actionLabel: string;
      selectable?: boolean;
    },
    idx: number
  ) => {
    const catInfo = getFileCategoryInfo(item.path);
    const folderSub = getFileFolderSubtitle(item.path);
    const fileName = item.path.split("/").pop() || item.path;
    const isSelected = Boolean(item.selectable && selectedPaths.has(item.path));
    const isDone = extractedSet.has(item.path);
    const isBusy = extracting === item.path;
    const isConfirmingThis = confirmExtractPath === item.path;

    return (
      <div
        key={`${item.path}-${idx}`}
        onClick={() => {
          if (item.selectable) toggleSelectPath(item.path);
        }}
        className={`flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border transition-all group/item ${
          item.selectable ? "cursor-pointer" : ""
        } ${
          isSelected
            ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
        }`}
      >
        {/* Row 1: Liquid Glass Icon Well + Filename & Folder/Footprint Subtitle */}
        <div className="flex items-center gap-3 min-w-0 w-full">
          <div
            className={`w-10 h-10 rounded-xl glass-surface border flex items-center justify-center shrink-0 transition-colors ${
              isSelected
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)]"
            }`}
            style={{
              color: isSelected ? "var(--accent)" : catInfo.colorVar,
            }}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {isSelected ? t("icon_check", "check") : catInfo.icon}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="relative group/tctitle flex items-center min-w-0 w-fit max-w-full">
              <span className="text-xs font-black tracking-tight text-[var(--text)] group-hover/item:text-[var(--accent)] transition-colors truncate">
                {fileName}
              </span>
              <HoverTooltip title={item.path} />
            </div>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
              {folderSub} &bull; {item.sizeLabel}
            </span>
          </div>
        </div>

        {/* Row 2: Bottom-Left Status/Category Badges + Bottom-Right Action Controls */}
        <div
          className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className={VAULT_CHIP_CLASS}>
              <span
                className="material-symbols-outlined !text-[12px] shrink-0"
                style={{ color: item.badgeColorVar }}
              >
                {item.badgeIcon}
              </span>
              <span className="truncate">{item.badgeLabel}</span>
            </span>

            {!item.selectable && (
              <span className={VAULT_CHIP_CLASS}>
                <span
                  className="material-symbols-outlined !text-[12px] shrink-0"
                  style={{ color: catInfo.colorVar }}
                >
                  {catInfo.icon}
                </span>
                <span className="truncate">{catInfo.label}</span>
              </span>
            )}

            {isSelected && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)] shrink-0">
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>{t("selected", "Selected")}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {item.canExtract &&
              (isConfirmingThis ? (
                <>
                  <button
                    type="button"
                    disabled={isBusy || isBatchExtracting}
                    onClick={() =>
                      handleExtractSingle(item.path, item.refreshDiffOnExtract)
                    }
                    className="px-2.5 h-7 rounded-lg glass-surface sa-glass-pill-active text-[var(--text)] text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                      {t("icon_check", "check")}
                    </span>
                    <span>{t("confirm", "Confirm")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmExtractPath(null)}
                    className="w-7 h-7 rounded-lg glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer transition-all"
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
                  className={`px-2.5 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
                    isDone
                      ? "sa-glass-pill-success text-[var(--text)]"
                      : "sa-glass-pill-hover text-[var(--text)]"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined !text-[13px] ${
                      isDone
                        ? "text-[var(--success)]"
                        : "text-[var(--accent)]"
                    } ${isBusy ? "animate-spin" : ""}`}
                  >
                    {isDone
                      ? t("icon_check_circle", "check_circle")
                      : isBusy
                        ? t("icon_sync", "sync")
                        : t("icon_restore", "restore")}
                  </span>
                  <span>
                    {isDone
                      ? t("tc_panel_extracted_badge", "Extracted")
                      : item.actionLabel}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  };

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
        {/* 2x2 Spacious StatBox Grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatBox
            icon={t("icon_hard_drive", "hard_drive")}
            iconColorClass="text-[var(--accent)]"
            label={t("tc_stat_actually_backed_up", "Written to Disk")}
            value={
              <span className="tabular-nums">
                {formatStorageBytes(actualWrittenBytes)}
              </span>
            }
          />
          <StatBox
            icon={t("icon_link", "link")}
            iconColorClass="text-[var(--success)]"
            label={t("tc_stat_deduplicated", "Storage Saved")}
            value={
              <span className="tabular-nums text-[var(--success)]">
                {formatStorageBytes(savedBytes)} ({savedPct}%)
              </span>
            }
          />
          <StatBox
            icon={t("icon_inventory_2", "inventory_2")}
            iconColorClass="text-[var(--accent)]"
            label={t("logical_size", "Snapshot Size")}
            value={
              <span className="tabular-nums">
                {formatStorageBytes(logicalSize)}
              </span>
            }
          />
          <StatBox
            icon={t("icon_folder", "folder")}
            iconColorClass="text-[var(--accent)]"
            label={t("tc_stat_indexed_files", "Indexed Files")}
            value={
              <span className="tabular-nums">
                {visibleBackupFiles.length.toLocaleString()} (
                {deltaStats.written.toLocaleString()}{" "}
                {t("tc_badge_written", "Written")})
              </span>
            }
          />
        </div>

        {/* Clean Integrated Restore & Batch Extract Bar */}
        {showRestoreBar && (
          <div className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0 flex-1 min-w-[200px]">
              {selectedPaths.size > 0
                ? (
                    t(
                      "tc_extract_selected_btn",
                      "Extract Selected ({COUNT})"
                    ) || "Extract Selected ({COUNT})"
                  ).replace("{COUNT}", String(selectedPaths.size))
                : isEngine
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
              {selectedPaths.size > 0 ? (
                confirmBatchExtract ? (
                  <>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_close", "close")}
                      label={t("btn_cancel", "Cancel")}
                      onClick={() => setConfirmBatchExtract(false)}
                      className="!px-3.5 !py-2"
                    />
                    <ActionButton
                      variant="accent"
                      icon={t("icon_check", "check")}
                      label={`${t("confirm", "Confirm")} (${selectedPaths.size})`}
                      disabled={isBatchExtracting}
                      onClick={() =>
                        handleBatchExtract(Array.from(selectedPaths), true)
                      }
                      className="!px-4 !py-2"
                    />
                  </>
                ) : (
                  <>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_clear_all", "clear_all")}
                      label={t("clear", "Clear")}
                      onClick={() => setSelectedPaths(new Set())}
                      className="!px-3 !py-2"
                    />
                    <ActionButton
                      variant="accent"
                      icon={t("icon_restore", "restore")}
                      label={(
                        t(
                          "tc_extract_selected_btn",
                          "Extract Selected ({COUNT})"
                        ) || "Extract Selected ({COUNT})"
                      ).replace("{COUNT}", String(selectedPaths.size))}
                      disabled={isBatchExtracting}
                      onClick={() => setConfirmBatchExtract(true)}
                      className="!px-4 !py-2"
                    />
                  </>
                )
              ) : confirmFullRestore ? (
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
            setStatusFilter("ALL");
            setListLimit(40);
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
            setStatusFilter("ALL");
            setListLimit(40);
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
            setStatusFilter("ALL");
            setListLimit(40);
          }}
        />
      </div>

      {/* 3. OS-Standard ActionPill Search & Filter Popover */}
      <ActionPill
        searchQuery={searchQuery}
        setSearchQuery={(val: string) => {
          setSearchQuery(val);
          setListLimit(40);
        }}
        searchPlaceholder={t("search_files", "Search files...")}
        primaryPopover={{
          icon: t("icon_tune", "tune"),
          label: t("filters", "Filters"),
          content: (
            <div className="flex flex-col w-[360px] max-w-[calc(100vw-32px)] p-4 gap-3.5 text-left">
              {/* Sort By */}
              <div className="flex flex-col w-full">
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                  {t("sort_by", "Sort By")}
                  <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { id: "DEFAULT", label: t("default", "Default") },
                    { id: "NAME", label: t("sort_name", "Name (A-Z)") },
                    { id: "SIZE", label: t("tc_col_size", "Size") },
                    { id: "SECTOR", label: t("category", "Category") },
                  ].map((opt) => {
                    const active = sortBy === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSortBy(opt.id as any);
                          setListLimit(40);
                        }}
                        className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                          active ? "is-selected font-bold" : "font-semibold"
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active && (
                          <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                            {t("icon_check", "check")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sector / Category Filter */}
              <div className="flex flex-col w-full">
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                  {t("category", "Category")}
                  <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {sectorOptions.map((opt) => {
                    const active = sectorFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSectorFilter(opt.id);
                          setListLimit(40);
                        }}
                        className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                          active ? "is-selected font-bold" : "font-semibold"
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active && (
                          <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                            {t("icon_check", "check")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Filter (DELTA & DIFF views) */}
              {activeView !== "EXTRACT" && (
                <div className="flex flex-col w-full">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                    {t("status", "Status")}
                    <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(activeView === "DIFF"
                      ? [
                          { id: "ALL", label: t("filter_all", "All") },
                          { id: "MODIFIED", label: t("modified", "Modified") },
                          {
                            id: "MISSING",
                            label: t(
                              "tc_diff_filter_missing",
                              "Missing in Active"
                            ),
                          },
                          {
                            id: "ADDED",
                            label: t(
                              "tc_diff_filter_new_in_active",
                              "New in Active"
                            ),
                          },
                        ]
                      : [
                          { id: "ALL", label: t("filter_all", "All") },
                          {
                            id: "MODIFIED",
                            label: t("tc_delta_filter_updated", "Updated"),
                          },
                          {
                            id: "ADDED",
                            label: t("tc_delta_filter_added", "New Files"),
                          },
                          {
                            id: "REMOVED",
                            label: t("diff_status_removed", "Removed"),
                          },
                        ]
                    ).map((opt) => {
                      const active = statusFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setStatusFilter(opt.id);
                            setListLimit(40);
                          }}
                          className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                            active ? "is-selected font-bold" : "font-semibold"
                          }`}
                        >
                          <span className="truncate">{opt.label}</span>
                          {active && (
                            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                              {t("icon_check", "check")}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* .ver Save Revisions Toggle (World State) */}
              {!isEngine && verRevisionFiles.length > 0 && (
                <div className="flex flex-col w-full">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                    {t("label_saves", "Saves")}
                    <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowVerRevisions((v) => !v)}
                    className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] tracking-wide text-left cursor-pointer ${
                      showVerRevisions
                        ? "is-selected font-bold"
                        : "font-semibold"
                    }`}
                  >
                    <span className="truncate">
                      {t("tc_show_ver_backups", "Show .ver Revisions")} (
                      {verRevisionFiles.length})
                    </span>
                    {showVerRevisions && (
                      <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                        {t("icon_check", "check")}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {hasActiveFilters && (
                <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSectorFilter("ALL");
                      setStatusFilter("ALL");
                      setSortBy("DEFAULT");
                      setShowVerRevisions(false);
                      setListLimit(40);
                    }}
                    className="px-3 py-1.5 rounded-xl glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                      {t("icon_restart_alt", "restart_alt")}
                    </span>
                    <span>{t("clear", "Clear")}</span>
                  </button>
                </div>
              )}
            </div>
          ),
        }}
      />

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          {sectorFilter !== "ALL" && (
            <button
              type="button"
              onClick={() => setSectorFilter("ALL")}
              className={`${VAULT_CHIP_CLASS} cursor-pointer hover:border-[var(--accent)]`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_folder", "folder")}
              </span>
              <span>
                {sectorOptions.find((s) => s.id === sectorFilter)?.label ||
                  sectorFilter}
              </span>
              <span className="material-symbols-outlined !text-[12px] opacity-60">
                {t("icon_close", "close")}
              </span>
            </button>
          )}
          {statusFilter !== "ALL" && (
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`${VAULT_CHIP_CLASS} cursor-pointer hover:border-[var(--accent)]`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_filter_alt", "filter_alt")}
              </span>
              <span>{statusFilter}</span>
              <span className="material-symbols-outlined !text-[12px] opacity-60">
                {t("icon_close", "close")}
              </span>
            </button>
          )}
          {sortBy !== "DEFAULT" && (
            <button
              type="button"
              onClick={() => setSortBy("DEFAULT")}
              className={`${VAULT_CHIP_CLASS} cursor-pointer hover:border-[var(--accent)]`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_sort", "sort")}
              </span>
              <span>{sortBy}</span>
              <span className="material-symbols-outlined !text-[12px] opacity-60">
                {t("icon_close", "close")}
              </span>
            </button>
          )}
          {showVerRevisions && (
            <button
              type="button"
              onClick={() => setShowVerRevisions(false)}
              className={`${VAULT_CHIP_CLASS} cursor-pointer hover:border-[var(--accent)]`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_history", "history")}
              </span>
              <span>{t("tc_show_ver_backups", "Show .ver Revisions")}</span>
              <span className="material-symbols-outlined !text-[12px] opacity-60">
                {t("icon_close", "close")}
              </span>
            </button>
          )}
        </div>
      )}

      {/* 4. 2-Column 2-Row Sanctuary Card Grids Inside UniversalGroup Containers */}
      {isLoading ? (
        <EmptyState
          icon={t("icon_sync", "sync")}
          title={
            activeView === "DIFF"
              ? t("calculating_diff", "Calculating differences...")
              : t("loading_contents", "Loading contents...")
          }
        />
      ) : activeView === "DELTA" ? (
        filteredDelta.length === 0 ? (
          <EmptyState
            icon={t("icon_link", "link")}
            title={
              deltaStats.changed === 0 && !searchQuery && !hasActiveFilters
                ? t(
                    "tc_delta_zero_changes_title",
                    "Zero Changed Files Since Previous Snapshot (100% Deduplicated)"
                  )
                : t("no_files_found", "No editable {mods} located.")
            }
          />
        ) : (
          <UniversalGroup
            title={`${t("tc_tab_backed_up_delta", "Backed Up Delta")} (${filteredDelta.length.toLocaleString()})`}
            icon={t("icon_archive", "archive")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
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

                return renderCapsuleFileCard(
                  {
                    path: item.path,
                    sizeLabel: formatFileSizeMb(item.size_mb),
                    badgeIcon,
                    badgeColorVar,
                    badgeLabel,
                    canExtract: !isRemoved,
                    refreshDiffOnExtract: true,
                    actionLabel: t("tab_extract", "Extract"),
                  },
                  idx
                );
              })}
            </div>

            {filteredDelta.length > listLimit && (
              <div className="pt-3 flex justify-center">
                <ActionButton
                  variant="glass"
                  icon={t("icon_expand_more", "expand_more")}
                  label={`${t("load_more", "Load More")} (${(
                    filteredDelta.length - listLimit
                  ).toLocaleString()})`}
                  onClick={() => setListLimit((l) => l + 60)}
                  className="w-full justify-center"
                />
              </div>
            )}
          </UniversalGroup>
        )
      ) : activeView === "EXTRACT" ? (
        extractGroups.length === 0 ? (
          <EmptyState
            icon={t("icon_folder", "folder")}
            title={t("no_files_found", "No editable {mods} located.")}
          />
        ) : (
          <div className="flex flex-col gap-4 w-full">
            {extractGroups.map((group: any) => {
              const isCollapsed = collapsedGroups.has(group.id);
              const groupPaths: string[] = group.files.map((f: any) => f.path);
              const allGroupSelected =
                groupPaths.length > 0 &&
                groupPaths.every((p) => selectedPaths.has(p));

              return (
                <UniversalGroup
                  key={group.id}
                  title={`${group.label} (${group.files.length.toLocaleString()} • ${formatFileSizeMb(group.sizeMb)})`}
                  icon={group.icon}
                  headerAction={
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {group.hasVerToggle && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowVerRevisions((v) => !v);
                          }}
                          className={`px-2.5 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] cursor-pointer transition-all flex items-center gap-1.5 ${
                            showVerRevisions
                              ? "sa-glass-pill-active text-[var(--text)]"
                              : "sa-glass-pill-hover text-[var(--subtext)] hover:text-[var(--text)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                            {t("icon_history", "history")}
                          </span>
                          <span>
                            {showVerRevisions
                              ? t("tc_hide_ver_backups", "Hide .ver Revisions")
                              : `${t("tc_show_ver_backups", "Show .ver Revisions")} (${verRevisionFiles.length})`}
                          </span>
                        </button>
                      )}

                      {group.files.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPaths((prev) => {
                              const next = new Set(prev);
                              if (allGroupSelected) {
                                groupPaths.forEach((p) => next.delete(p));
                              } else {
                                groupPaths.forEach((p) => next.add(p));
                              }
                              return next;
                            });
                          }}
                          className={`px-2.5 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] cursor-pointer transition-all flex items-center gap-1.5 ${
                            allGroupSelected
                              ? "sa-glass-pill-active text-[var(--text)]"
                              : "sa-glass-pill-hover text-[var(--text)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                            {allGroupSelected
                              ? t("icon_deselect", "deselect")
                              : t("icon_select_all", "select_all")}
                          </span>
                          <span>
                            {allGroupSelected
                              ? t("clear", "Clear")
                              : t("all", "All")}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(group.id)}
                        className="w-7 h-7 rounded-lg glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer transition-all"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {isCollapsed
                            ? t("icon_expand_more", "expand_more")
                            : t("icon_expand_less", "expand_less")}
                        </span>
                      </button>
                    </div>
                  }
                >
                  {!isCollapsed && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                        {group.files
                          .slice(0, listLimit)
                          .map((file: any, idx: number) => {
                            const catInfo = getFileCategoryInfo(file.path);
                            return renderCapsuleFileCard(
                              {
                                path: file.path,
                                sizeLabel: formatFileSizeMb(file.size_mb),
                                badgeIcon: catInfo.icon,
                                badgeColorVar: catInfo.colorVar,
                                badgeLabel: catInfo.label,
                                canExtract: true,
                                refreshDiffOnExtract: false,
                                actionLabel: t("tab_extract", "Extract"),
                                selectable: true,
                              },
                              idx
                            );
                          })}
                      </div>

                      {group.files.length > listLimit && (
                        <div className="pt-3 flex justify-center">
                          <ActionButton
                            variant="glass"
                            icon={t("icon_expand_more", "expand_more")}
                            label={`${t("load_more", "Load More")} (${(
                              group.files.length - listLimit
                            ).toLocaleString()})`}
                            onClick={() => setListLimit((l) => l + 60)}
                            className="w-full justify-center"
                          />
                        </div>
                      )}
                    </>
                  )}
                </UniversalGroup>
              );
            })}
          </div>
        )
      ) : filteredDiff.length === 0 ? (
        <EmptyState
          icon={t("icon_verified", "verified")}
          title={
            diffCounts.changes === 0 && !searchQuery && !hasActiveFilters
              ? t("everything_identical", "Everything is identical")
              : t("no_files_found", "No editable {mods} located.")
          }
        />
      ) : (
        <UniversalGroup
          title={`${t("tc_tab_live_diff", "Live Folder Diff")} (${filteredDiff.length.toLocaleString()})`}
          icon={t("icon_compare_arrows", "compare_arrows")}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
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

              const badgeLabel = isMod
                ? t("modified", "Modified")
                : isMiss
                  ? t("tc_diff_filter_missing", "Missing in Active")
                  : isNewActive
                    ? t("tc_diff_filter_new_in_active", "New in Active")
                    : t("tc_diff_filter_identical", "Unchanged");

              const canRestoreFromSnapshot = isMod || isMiss;

              const sizeLabel =
                isNewActive && typeof diff.live_size_mb === "number"
                  ? formatFileSizeMb(diff.live_size_mb)
                  : isMod &&
                      typeof diff.live_size_mb === "number" &&
                      Math.abs((diff.size_mb || 0) - diff.live_size_mb) > 0.001
                    ? `${formatFileSizeMb(diff.size_mb)} → ${formatFileSizeMb(
                        diff.live_size_mb
                      )}`
                    : formatFileSizeMb(diff.size_mb);

              return renderCapsuleFileCard(
                {
                  path: diff.path,
                  sizeLabel,
                  badgeIcon,
                  badgeColorVar,
                  badgeLabel,
                  canExtract: canRestoreFromSnapshot,
                  refreshDiffOnExtract: true,
                  actionLabel: t("btn_restore", "Restore"),
                },
                i
              );
            })}
          </div>

          {filteredDiff.length > listLimit && (
            <div className="pt-3 flex justify-center">
              <ActionButton
                variant="glass"
                icon={t("icon_expand_more", "expand_more")}
                label={`${t("load_more", "Load More")} (${(
                  filteredDiff.length - listLimit
                ).toLocaleString()})`}
                onClick={() => setListLimit((l) => l + 60)}
                className="w-full justify-center"
              />
            </div>
          )}
        </UniversalGroup>
      )}
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
