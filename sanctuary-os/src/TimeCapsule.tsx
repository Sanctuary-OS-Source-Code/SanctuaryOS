import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import {
  ViewHeader,
  CustomDropdown,
  CustomDatePicker,
  DashboardStatTile,
  HoverTabDrawer,
  VerticalTabButton,
  ActionPill,
  HoverTooltip,
} from "./shared";
import { TimeCapsuleSidePanel } from "./side-panels/TimeCapsuleSidePanels";
import { useModalStore } from "./store/modalStore";
import {
  CommandScreenSectionHeading,
  StatTileCarousel,
} from "./hub-components/SharedCommandScreenLayout";
import { UniversalCard } from "./components/universal/UniversalCard";
import { openSanctuaryContextMenu } from "./ContextMenu";
import { VAULT_CHIP_CLASS } from "./shared-components/constants";

export default function TimeCapsule({
  selectedVersion,
  triggerPrePatchSnapshot,
  triggerFullEngineBackup,
  restoreGameBackup,
  deleteBackup,
  backupList,
  getBackupSignature,
}: any) {
  const { t } = useLexicon();
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [confirmRestoreBackup, setConfirmRestoreBackup] = useState<
    string | null
  >(null);
  const [confirmDeleteBackup, setConfirmDeleteBackup] = useState<string | null>(
    null
  );
  const [confirmSealWorld, setConfirmSealWorld] = useState<boolean>(false);
  const [confirmSealEngine, setConfirmSealEngine] = useState<boolean>(false);
  const [config, setConfig] = useState<any>(null);
  const [selectedBackupForInspection, setSelectedBackupForInspection] =
    useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("LANDING");
  const [searchQuery, setSearchQuery] = useState("");
  const [versionFilter, setVersionFilter] = useState("ALL");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const data = await invoke<any>("get_saved_coordinates");
        setConfig(data);
      } catch (err) {
        console.error(err);
      }
    }
    fetchConfig();
  }, []);

  useEffect(() => {
    const handleTourInspector = (e: Event) => {
      const open = Boolean((e as CustomEvent)?.detail?.open);
      if (open) {
        const firstBackup = backupList?.[0];
        const firstName =
          typeof firstBackup === "string"
            ? firstBackup
            : firstBackup?.name || "World_State--Preview";
        setSelectedBackupForInspection(firstName);
        setIsSidePanelOpen(true);
      } else {
        setIsSidePanelOpen(false);
        setSelectedBackupForInspection(null);
      }
    };
    window.addEventListener("sanctuary-tour-time-capsule-panel", handleTourInspector);
    return () =>
      window.removeEventListener("sanctuary-tour-time-capsule-panel", handleTourInspector);
  }, [backupList]);

  const getBackupTimestamp = (backup: any): number => {
    const backupName =
      typeof backup === "string" ? backup : backup?.name || "";
    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    if (sig?.timestamp && sig.timestamp !== "0") {
      const parsed = Number(sig.timestamp);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const clean = backupName
      .replace(/\.tar\.zst$/i, "")
      .replace(/\.zst$/i, "");
    const parts = clean.includes("--") ? clean.split("--") : clean.split("_");
    const last = parts[parts.length - 1];
    const num = Number(last);
    return !isNaN(num) ? num : 0;
  };

  const totalWorldSize =
    backupList?.reduce(
      (acc: number, b: any) =>
        acc + (b.name?.toLowerCase().includes("world") ? b.size_mb || 0 : 0),
      0
    ) || 0;
  const totalEngineSize =
    backupList?.reduce(
      (acc: number, b: any) =>
        acc + (b.name?.toLowerCase().includes("engine") ? b.size_mb || 0 : 0),
      0
    ) || 0;

  const uniqueVersions = useMemo(() => {
    const versions = new Set<string>();
    (backupList || []).forEach((backup: any) => {
      const backupName = typeof backup === "string" ? backup : backup.name;
      const sig = getBackupSignature ? getBackupSignature(backupName) : null;
      if (sig?.version) versions.add(sig.version);
    });
    return Array.from(versions);
  }, [backupList, getBackupSignature]);

  const passesFilters = (backup: any) => {
    const backupName = typeof backup === "string" ? backup : backup.name;
    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    const title =
      sig?.alias ||
      (sig?.isEngine
        ? t("engine_full", "Engine Core")
        : t("world_state", "World State"));

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const ver = (sig?.version || "").toLowerCase();
      if (
        !title.toLowerCase().includes(q) &&
        !backupName.toLowerCase().includes(q) &&
        !ver.includes(q)
      ) {
        return false;
      }
    }

    if (versionFilter !== "ALL") {
      if (sig?.version !== versionFilter) return false;
    }

    if (startDate || endDate) {
      if (!sig?.timestamp || sig.timestamp === "0") return false;
      const backupDate = new Date(Number(sig.timestamp) * 1000);
      backupDate.setHours(0, 0, 0, 0);

      if (startDate) {
        const sd = new Date(startDate);
        sd.setHours(0, 0, 0, 0);
        if (backupDate < sd) return false;
      }
      if (endDate) {
        const ed = new Date(endDate);
        ed.setHours(0, 0, 0, 0);
        if (backupDate > ed) return false;
      }
    }

    return true;
  };

  const { oldestWorldName, oldestEngineName } = useMemo(() => {
    const allWorld: any[] = [];
    const allEngine: any[] = [];
    (backupList || []).forEach((b: any) => {
      const name = typeof b === "string" ? b : b?.name || "";
      if (!name) return;
      const sig = getBackupSignature ? getBackupSignature(name) : null;
      const isEng = sig ? sig.isEngine : name.toLowerCase().includes("engine");
      if (isEng) allEngine.push(b);
      else allWorld.push(b);
    });
    allWorld.sort(
      (a: any, b: any) => getBackupTimestamp(b) - getBackupTimestamp(a)
    );
    allEngine.sort(
      (a: any, b: any) => getBackupTimestamp(b) - getBackupTimestamp(a)
    );
    const lastWorld = allWorld[allWorld.length - 1];
    const lastEngine = allEngine[allEngine.length - 1];
    return {
      oldestWorldName:
        typeof lastWorld === "string" ? lastWorld : lastWorld?.name || null,
      oldestEngineName:
        typeof lastEngine === "string" ? lastEngine : lastEngine?.name || null,
    };
  }, [backupList, getBackupSignature]);

  // Sorted Newest to Oldest
  const worldBackups = useMemo(() => {
    return (backupList || [])
      .filter((backup: any) => {
        const backupName = typeof backup === "string" ? backup : backup.name;
        const sig = getBackupSignature ? getBackupSignature(backupName) : null;
        const isWorld = sig
          ? !sig.isEngine
          : !backupName.toLowerCase().includes("engine");
        return isWorld && passesFilters(backup);
      })
      .sort((a: any, b: any) => getBackupTimestamp(b) - getBackupTimestamp(a));
  }, [
    backupList,
    searchQuery,
    versionFilter,
    startDate,
    endDate,
    getBackupSignature,
  ]);

  const engineBackups = useMemo(() => {
    return (backupList || [])
      .filter((backup: any) => {
        const backupName = typeof backup === "string" ? backup : backup.name;
        const sig = getBackupSignature ? getBackupSignature(backupName) : null;
        const isEngine = sig
          ? sig.isEngine
          : backupName.toLowerCase().includes("engine");
        return isEngine && passesFilters(backup);
      })
      .sort((a: any, b: any) => getBackupTimestamp(b) - getBackupTimestamp(a));
  }, [
    backupList,
    searchQuery,
    versionFilter,
    startDate,
    endDate,
    getBackupSignature,
  ]);

  const formatSizeMb = (mb: number) => {
    if (!mb || mb <= 0) return `0.00 ${t("unit_mb", "MB")}`;
    if (mb < 1) {
      const kb = Math.max(0.1, mb * 1024);
      return `${kb.toFixed(1)} ${t("unit_kb", "KB")}`;
    }
    if (mb < 1000) {
      return `${mb.toFixed(2)} ${t("unit_mb", "MB")}`;
    }
    return `${(mb / 1024).toFixed(2)} ${t("unit_gb", "GB")}`;
  };

  const cleanActiveVersion = selectedVersion
    ? `${t("tc_version_prefix", "v.")}${String(selectedVersion)
        .replace(/^v\.?/i, "")
        .trim()}`
    : "";

  const renderSealCard = (isEngine: boolean) => {
    const isConfirming = isEngine ? confirmSealEngine : confirmSealWorld;
    const setConfirming = isEngine ? setConfirmSealEngine : setConfirmSealWorld;
    const accentVar = isEngine ? "var(--danger)" : "var(--accent)";
    const themeColor = isEngine
      ? "text-[var(--danger)]"
      : "text-[var(--accent)]";
    const themeBorder = isEngine
      ? "border-[color-mix(in_srgb,var(--danger)_42%,transparent)]"
      : "border-[color-mix(in_srgb,var(--accent)_42%,transparent)]";
    const themeDashedBorder = isEngine
      ? "border-[color-mix(in_srgb,var(--danger)_32%,transparent)] group-hover:border-[color-mix(in_srgb,var(--danger)_65%,transparent)]"
      : "border-[color-mix(in_srgb,var(--accent)_32%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_65%,transparent)]";
    const themeHoverBorder = isEngine
      ? "hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)]"
      : "hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]";
    const categoryIcon = isEngine
      ? t("icon_settings", "settings")
      : t("icon_public", "public");

    return (
      <div
        onClick={() => !isConfirming && setConfirming(true)}
        className={`glass-panel rounded-[var(--radius)] relative flex flex-col justify-between p-5 min-h-[276px] group cursor-pointer transition-all duration-300 overflow-hidden select-none ${themeHoverBorder}`}
      >
        {/* 3D Liquid Glass Meniscus Rim Overlay */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] z-20"
          style={{
            boxShadow: "var(--glass-inset-highlight)",
          }}
        />

        {/* Ambient Radial Glow */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-70 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle at 50% 42%, color-mix(in srgb, ${accentVar} 18%, transparent) 0%, transparent 68%)`,
          }}
        />

        {/* Inset Dashed Create-Slot Frame */}
        <div
          className={`pointer-events-none absolute inset-2 rounded-[calc(var(--radius)-6px)] border border-dashed transition-colors duration-300 z-10 ${themeDashedBorder}`}
        />

        {/* Top Header Pill Row */}
        <div className="flex items-center justify-between gap-2 px-2 pt-1 relative z-20">
          <span
            className={`px-2.5 py-1 rounded-lg border bg-transparent ${themeBorder} ${themeColor} text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 shrink-0`}
          >
            <span className="material-symbols-outlined !text-[12px]">
              {t("icon_add_circle", "add_circle")}
            </span>
            <span>{t("tc_card_new_badge", "New Snapshot")}</span>
          </span>

          <span className="px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] inline-flex items-center gap-1.5 truncate">
            <span
              className={`material-symbols-outlined !text-[11px] ${themeColor}`}
            >
              {categoryIcon}
            </span>
            <span className="truncate">
              {cleanActiveVersion ||
                (isEngine
                  ? t("engine_full", "Engine Core")
                  : t("world_state", "World State"))}
            </span>
          </span>
        </div>

        {/* Center Hero Add Medallion & Copy */}
        <div className="flex flex-col items-center justify-center text-center gap-2.5 my-auto py-2 px-3 relative z-20">
          <div className="relative mb-0.5">
            <div
              className={`pointer-events-none absolute -inset-1.5 rounded-[18px] border border-dashed opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300 ${themeBorder}`}
            />
            <div
              className={`w-13 h-13 rounded-2xl glass-surface border ${themeBorder} ${themeColor} flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-300 relative`}
              style={{
                boxShadow: `0 8px 24px -6px color-mix(in srgb, ${accentVar} 35%, transparent)`,
              }}
            >
              <span className="material-symbols-outlined !text-[26px]">
                {t("icon_add", "add")}
              </span>
              <span
                className={`w-5 h-5 rounded-md glass-surface border ${themeBorder} ${themeColor} flex items-center justify-center absolute -bottom-1.5 -right-1.5 shadow-md`}
              >
                <span className="material-symbols-outlined !text-[11px]">
                  {categoryIcon}
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <h3
              className={`text-base md:text-[17px] font-black tracking-tight text-[var(--text)] group-hover:${themeColor} transition-colors m-0 leading-snug`}
            >
              {isEngine
                ? t("btn_seal_engine", "Seal Engine Core")
                : t("btn_seal_state", "Seal World State")}
            </h3>
            <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 max-w-[28ch] m-0">
              {isEngine
                ? t(
                    "tc_seal_engine_desc",
                    "Capture game installation binaries, delta patches, and base game data."
                  )
                : t(
                    "tc_seal_world_desc",
                    "Capture Saves, Tray library, and user config files using hardlink deduplication."
                  )}
            </p>
          </div>

          <span className={VAULT_CHIP_CLASS}>
            <span className={`material-symbols-outlined !text-[12px] ${themeColor}`}>
              {t("icon_shield_lock", "shield_lock")}
            </span>
            <span>{t("tc_cow_badge", "Copy-on-Write Protected")}</span>
          </span>
        </div>

        {/* Bottom Full-Width Action Bar */}
        <div
          className="px-2 pb-1 pt-1 relative z-20 w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {!isConfirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={`w-full h-9 rounded-xl glass-surface border ${themeBorder} ${themeColor} hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-all cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_add_circle", "add_circle")}
              </span>
              <span>{t("create_new_snapshot", "Create New Snapshot")}</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                type="button"
                onClick={() => {
                  if (isEngine) {
                    triggerFullEngineBackup && triggerFullEngineBackup();
                  } else {
                    triggerPrePatchSnapshot && triggerPrePatchSnapshot();
                  }
                  setConfirming(false);
                }}
                className={`w-full h-9 rounded-xl glass-surface border ${themeBorder} ${themeColor} hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer`}
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_check", "check")}
                </span>
                <span>{t("confirm", "Confirm")}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="w-full h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_close", "close")}
                </span>
                <span>{t("cancel", "Cancel")}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderBackupCard = (backup: any, index: number) => {
    const backupName = typeof backup === "string" ? backup : backup.name;
    const sizeMb = typeof backup === "string" ? 0 : backup.size_mb || 0;
    const logicalSizeMb =
      typeof backup === "string"
        ? 0
        : typeof backup.logical_size_mb === "number"
          ? backup.logical_size_mb
          : sizeMb;

    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    const isEngine = sig
      ? sig.isEngine
      : backupName.toLowerCase().includes("engine");
    const rawAlias = (sig?.alias || "").replace(/^Secured:\s*/i, "").trim();
    const isDefaultAlias =
      !rawAlias ||
      rawAlias.toLowerCase() === "world state" ||
      rawAlias.toLowerCase() === "engine core";
    const categoryLabel = isEngine
      ? t("engine_full", "Engine Core")
      : t("world_state", "World State");
    const icon = isEngine
      ? t("icon_settings", "settings")
      : t("icon_public", "public");

    const themeColor = isEngine
      ? "text-[var(--danger)]"
      : "text-[var(--accent)]";
    const themeBorder = isEngine
      ? "border-[color-mix(in_srgb,var(--danger)_38%,transparent)]"
      : "border-[color-mix(in_srgb,var(--accent)_38%,transparent)]";
    const themeHoverBorder = isEngine
      ? "hover:border-[color-mix(in_srgb,var(--danger)_48%,transparent)]"
      : "hover:border-[color-mix(in_srgb,var(--accent)_48%,transparent)]";

    const versionLabel = sig?.version || backupName.replace(".tar.zst", "");
    const isLatest = index === 0;
    const isBaselineSnapshot =
      backupName === (isEngine ? oldestEngineName : oldestWorldName);
    const isZeroDelta = !isBaselineSnapshot && sizeMb <= 0.00005;
    const showSeparateLogicalSize =
      !isBaselineSnapshot && logicalSizeMb > 0;
    const isConfirmingRestore = confirmRestoreBackup === backupName;
    const isConfirmingDelete = confirmDeleteBackup === backupName;

    const formattedDate =
      sig?.timestamp && sig.timestamp !== "0"
        ? new Date(Number(sig.timestamp) * 1000).toLocaleDateString()
        : "";

    const cardTitle = isDefaultAlias ? versionLabel : rawAlias;
    const cardSubtitle = isDefaultAlias
      ? formattedDate
        ? `${categoryLabel} • ${formattedDate}`
        : categoryLabel
      : formattedDate
        ? `${versionLabel} • ${formattedDate}`
        : versionLabel;

    const bannerTopRight = isLatest
      ? t("lineage_latest", "Latest")
      : formattedDate || t("verified", "Verified");

    const bannerBottom = isBaselineSnapshot
      ? t("tc_cow_baseline_status", "Copy-on-Write • Baseline")
      : isZeroDelta
        ? t("tc_cow_dedup_status", "Copy-on-Write • 0 MB Delta")
        : `${t("tc_badge_delta", "Delta")}: ${formatSizeMb(sizeMb)} / ${formatSizeMb(logicalSizeMb || sizeMb)}`;

    return (
      <UniversalCard
        key={backupName}
        layout="vertical"
        title={cardTitle}
        subtitle={cardSubtitle}
        icon={icon}
        bannerTopLabel={categoryLabel}
        bannerTopRightLabel={bannerTopRight}
        bannerBottomLabel={bannerBottom}
        onClick={() => {
          setSelectedBackupForInspection(backupName);
          setIsSidePanelOpen(true);
        }}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, {
            title: cardTitle,
            subtitle: cardSubtitle,
            statusLabel: isZeroDelta
              ? t("tc_delta_filter_dedup", "Hardlinked")
              : formatSizeMb(sizeMb),
            statusColorClass: isEngine ? "text-[var(--danger)]" : "text-[var(--accent)]",
            icon,
            iconColorClass: isEngine ? "text-[var(--danger)]" : "text-[var(--accent)]",
            items: [
              {
                id: "inspect",
                label: t("tc_card_inspect_cta", "Inspect Snapshot"),
                icon: t("icon_open_in_new", "open_in_new"),
                onClick: () => {
                  setSelectedBackupForInspection(backupName);
                  setIsSidePanelOpen(true);
                },
              },
              {
                id: "restore",
                label: t("btn_restore", "Restore"),
                icon: t("icon_restore", "restore"),
                variant: "success",
                onClick: () => {
                  useModalStore.getState().setRestoreType(isEngine ? "engine" : "world");
                  if (restoreGameBackup) restoreGameBackup(backupName);
                },
              },
              {
                id: "delete",
                label: t("btn_delete", "{Delete}"),
                icon: t("icon_delete_forever", "delete_forever"),
                variant: "danger",
                dividerBefore: true,
                onClick: () => {
                  if (deleteBackup) deleteBackup(backupName);
                },
              },
            ],
          });
        }}
        className={themeHoverBorder}
        badges={
          <>
            {isLatest && (
              <div className="px-2 py-0.5 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--success)] inline-flex items-center gap-1 whitespace-nowrap">
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>{t("lineage_latest", "Latest")}</span>
              </div>
            )}
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isZeroDelta ? "text-[var(--subtext)]" : themeColor
                }`}
              >
                {isZeroDelta
                  ? t("icon_link", "link")
                  : t("icon_hard_drive", "hard_drive")}
              </span>
              <span>
                {isBaselineSnapshot
                  ? `${t("tc_delta_badge_baseline", "Baseline")}: ${formatSizeMb(logicalSizeMb || sizeMb)}`
                  : isZeroDelta
                    ? t("tc_delta_filter_dedup", "Hardlinked")
                    : `${t("tc_badge_delta", "Delta")}: ${formatSizeMb(sizeMb)}`}
              </span>
            </div>
            {showSeparateLogicalSize && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_inventory_2", "inventory_2")}
                </span>
                <span>
                  {`${t("tc_badge_total", "Total")}: ${formatSizeMb(logicalSizeMb)}`}
                </span>
              </div>
            )}
          </>
        }
        footer={
          <div
            className="flex items-center justify-between gap-2 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {isConfirmingRestore ? (
              <div className="grid grid-cols-2 gap-2 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRestoreBackup(null);
                    useModalStore
                      .getState()
                      .setRestoreType(isEngine ? "engine" : "world");
                    if (restoreGameBackup) restoreGameBackup(backupName);
                  }}
                  className={`w-full h-8 rounded-xl glass-surface border ${themeBorder} ${themeColor} hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[10px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer`}
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_check", "check")}
                  </span>
                  <span>{t("confirm", "Confirm")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRestoreBackup(null)}
                  className="w-full h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[10px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                  <span>{t("btn_cancel", "Cancel")}</span>
                </button>
              </div>
            ) : isConfirmingDelete ? (
              <div className="grid grid-cols-2 gap-2 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeleteBackup(null);
                    if (deleteBackup) deleteBackup(backupName);
                  }}
                  className="w-full h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[10px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_check", "check")}
                  </span>
                  <span>{t("confirm", "Confirm")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteBackup(null)}
                  className="w-full h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[10px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                  <span>{t("btn_cancel", "Cancel")}</span>
                </button>
              </div>
            ) : (
              <>
                <span className="text-[10px] font-bold text-[var(--subtext)] opacity-70 truncate flex items-center gap-1">
                  {formattedDate ? (
                    <>
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_schedule", "schedule")}
                      </span>
                      <span>{formattedDate}</span>
                    </>
                  ) : (
                    t("tc_card_inspect_cta", "Inspect Snapshot")
                  )}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreBackup(backupName)}
                    className={`px-3 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:${themeBorder} text-[var(--text)] hover:${themeColor} text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer`}
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_restore", "restore")}
                    </span>
                    {t("btn_restore", "Restore")}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteBackup(backupName)}
                    className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all relative cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_delete", "delete")}
                    </span>
                    <HoverTooltip
                      title={t("btn_delete", "{Delete}")}
                      variant="danger"
                    />
                  </button>
                </div>
              </>
            )}
          </div>
        }
      />
    );
  };

  const FilterContent = () => (
    <div className="flex flex-col gap-4 min-w-[280px]">
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black tracking-widest text-[var(--subtext)] uppercase">
          {t("game_version", "Game Version")}
        </label>
        <CustomDropdown
          disableTint={true}
          variant="panel"
          value={versionFilter}
          onChange={(val: string[]) => setVersionFilter(val[0])}
          options={[
            { id: "ALL", label: t("filter_all", "All") },
            ...uniqueVersions.map((v: string) => ({ id: v, label: v })),
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black tracking-widest text-[var(--subtext)] uppercase">
          {t("date_range", "Date Range")}
        </label>
        <div className="flex items-center gap-2">
          <CustomDatePicker
            value={startDate}
            onChange={setStartDate}
            placeholder={t("filter_start_date", "Start Date")}
          />
          <span className="text-[var(--subtext)] text-[10px] uppercase font-bold opacity-50 px-1">
            {t("tc_date_to", "to")}
          </span>
          <CustomDatePicker
            value={endDate}
            onChange={setEndDate}
            placeholder={t("filter_end_date", "End Date")}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-0 animate-in fade-in duration-700 pb-32 w-full">
      <ViewHeader
        title={t("term_backups", "Time Capsule")}
        subtitle={t(
          "backups_subtitle",
          "Backups, restores, and versioned world states"
        )}
        icon={t("icon_history", "history")}
        iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
        breadcrumb={
          activeTab !== "LANDING"
            ? activeTab === "WORLD"
              ? t("world_state", "World State")
              : t("engine_full", "Engine Core")
            : undefined
        }
        onTitleClick={() => setActiveTab("LANDING")}
      >
        <div className="flex-1 xl:w-auto w-full mb-4 md:mb-0 max-w-sm">
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={
              (t("timecapsule_search", "Search Chronograms...") as string) ||
              "Search Chronograms..."
            }
            primaryPopover={{
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters") || "Filters",
              content: <FilterContent />,
            }}
          />
        </div>
      </ViewHeader>

      <div className="md:hidden">
        <HoverTabDrawer
          title={t("term_backups", "Time Capsule")}
          activeTab={activeTab}
          setTab={setActiveTab}
        >
          <VerticalTabButton
            id="LANDING"
            icon={t("icon_dashboard", "dashboard")}
            label={t("tab_landing", "Overview")}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="WORLD"
            icon={t("icon_public", "public")}
            label={t("world_state", "World State")}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="ENGINE"
            icon={t("icon_settings", "settings")}
            label={t("engine_full", "Engine Core")}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
        </HoverTabDrawer>
      </div>

      <div className="flex flex-col w-full gap-3 mb-8 md:mb-10">
        <StatTileCarousel>
          <DashboardStatTile
            variant="tab"
            icon={t("icon_dashboard", "dashboard")}
            label={t("tab_landing", "Overview")}
            number={selectedVersion || ""}
            onClick={() => setActiveTab("LANDING")}
            isActive={activeTab === "LANDING"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_public", "public")}
            label={t("world_state", "World State")}
            number={`${worldBackups.length} / ${formatSizeMb(totalWorldSize)}`}
            onClick={() => setActiveTab("WORLD")}
            isActive={activeTab === "WORLD"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_settings", "settings")}
            label={t("engine_full", "Engine Core")}
            number={`${engineBackups.length} / ${formatSizeMb(totalEngineSize)}`}
            onClick={() => setActiveTab("ENGINE")}
            isActive={activeTab === "ENGINE"}
          />
        </StatTileCarousel>
      </div>

      <div className="flex flex-col gap-10">
        {activeTab === "LANDING" && (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 xl:gap-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* World States Section */}
            <div className="flex flex-col gap-4">
              <CommandScreenSectionHeading
                title={t("recent_world_states", "Recent World States")}
                icon={t("icon_public", "public")}
                iconColorClass="text-[var(--accent)]"
                className="!mb-0"
              />

              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
                {renderSealCard(false)}
                {worldBackups
                  .slice(0, 5)
                  .map((b: any, idx: number) => renderBackupCard(b, idx))}
              </div>
            </div>

            {/* Engine Cores Section */}
            <div className="flex flex-col gap-4">
              <CommandScreenSectionHeading
                title={t("recent_engine_cores", "Recent Engine Cores")}
                icon={t("icon_settings", "settings")}
                iconColorClass="text-[var(--danger)]"
                className="!mb-0"
              />

              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
                {renderSealCard(true)}
                {engineBackups
                  .slice(0, 5)
                  .map((b: any, idx: number) => renderBackupCard(b, idx))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "WORLD" && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CommandScreenSectionHeading
              title={t("world_state", "World State")}
              icon={t("icon_public", "public")}
              iconColorClass="text-[var(--accent)]"
              className="!mb-0"
            />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-6">
              {renderSealCard(false)}
              {worldBackups.map((b: any, idx: number) =>
                renderBackupCard(b, idx)
              )}
            </div>
          </div>
        )}

        {activeTab === "ENGINE" && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CommandScreenSectionHeading
              title={t("engine_full", "Engine Core")}
              icon={t("icon_settings", "settings")}
              iconColorClass="text-[var(--danger)]"
              className="!mb-0"
            />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-6">
              {renderSealCard(true)}
              {engineBackups.map((b: any, idx: number) =>
                renderBackupCard(b, idx)
              )}
            </div>
          </div>
        )}
      </div>

      <TimeCapsuleSidePanel
        isOpen={isSidePanelOpen}
        onClose={() => setIsSidePanelOpen(false)}
        selectedBackup={selectedBackupForInspection}
        config={config}
        getBackupSignature={getBackupSignature}
        onRestoreBackup={(name: string, isEng: boolean) => {
          useModalStore.getState().setRestoreType(isEng ? "engine" : "world");
          if (restoreGameBackup) restoreGameBackup(name);
        }}
      />
    </div>
  );
}
