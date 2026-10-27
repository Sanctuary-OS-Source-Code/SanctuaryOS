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

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

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
          className={`pointer-events-none absolute inset-2.5 rounded-[calc(var(--radius)-8px)] border-2 border-dashed transition-colors duration-300 z-10 ${themeDashedBorder}`}
        />

        {/* Top Header Pill Row */}
        <div className="flex items-center justify-between gap-2 px-1.5 pt-0.5 relative z-20">
          <span
            className={`px-2.5 py-1 rounded-lg border bg-transparent ${themeBorder} ${themeColor} text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 shrink-0`}
          >
            <span className="material-symbols-outlined !text-[12px]">
              {t("icon_add_circle", "add_circle")}
            </span>
            <span>{t("tc_card_new_badge", "New Snapshot")}</span>
          </span>

          <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] inline-flex items-center gap-1.5 truncate">
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
        <div className="flex flex-col items-center justify-center text-center gap-2.5 my-auto py-3 px-3 relative z-20">
          <div className="relative mb-0.5">
            <div
              className={`pointer-events-none absolute -inset-1.5 rounded-[18px] border border-dashed opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300 ${themeBorder}`}
            />
            <div
              className={`w-14 h-14 rounded-2xl glass-surface border ${themeBorder} ${themeColor} flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-300 relative`}
              style={{
                boxShadow: `0 8px 24px -6px color-mix(in srgb, ${accentVar} 35%, transparent)`,
              }}
            >
              <span className="material-symbols-outlined !text-[28px]">
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
        </div>

        {/* Bottom Full-Width Action Bar */}
        <div
          className="px-1.5 pb-0.5 pt-1 relative z-20 w-full"
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
            <div className="flex items-center justify-between gap-2 w-full h-9 px-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)]">
              <span
                className={`text-[9px] font-black uppercase tracking-wider ${themeColor} truncate`}
              >
                {isEngine
                  ? t("confirm_seal_engine_prompt", "Seal Engine Core?")
                  : t("confirm_seal_world_prompt", "Seal World State?")}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
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
                  className={`px-2.5 h-6 rounded-lg border bg-transparent ${themeBorder} ${themeColor} hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer`}
                >
                  {t("confirm", "Confirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="px-2.5 h-6 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  {t("cancel", "Cancel")}
                </button>
              </div>
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
    const themeBorder = isEngine
      ? "border-[color-mix(in_srgb,var(--danger)_38%,transparent)]"
      : "border-[color-mix(in_srgb,var(--accent)_38%,transparent)]";
    const themeHoverBorder = isEngine
      ? "hover:border-[color-mix(in_srgb,var(--danger)_48%,transparent)]"
      : "hover:border-[color-mix(in_srgb,var(--accent)_48%,transparent)]";

    const versionLabel = sig?.version || backupName.replace(".tar.zst", "");
    const isLatest = index === 0;
    const isZeroDelta = sizeMb <= 0.00005;
    const showSeparateLogicalSize =
      logicalSizeMb > 0 && Math.abs(logicalSizeMb - sizeMb) > 0.05;
    const isConfirmingRestore = confirmRestoreBackup === backupName;
    const isConfirmingDelete = confirmDeleteBackup === backupName;

    const formattedDate =
      sig?.timestamp && sig.timestamp !== "0"
        ? new Date(Number(sig.timestamp) * 1000).toLocaleDateString()
        : "";

    return (
      <UniversalCard
        key={backupName}
        layout="vertical"
        title={versionLabel}
        subtitle={title}
        icon={icon}
        onClick={() => {
          setSelectedBackupForInspection(backupName);
          setIsSidePanelOpen(true);
        }}
        className={themeHoverBorder}
        imageOverlay={
          isLatest ? (
            <div className="absolute top-2.5 left-2.5 z-30 pointer-events-none">
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>{t("lineage_latest", "Latest")}</span>
              </div>
            </div>
          ) : undefined
        }
        badges={
          <>
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
                {isZeroDelta
                  ? t("tc_delta_filter_dedup", "Hardlinked")
                  : formatSizeMb(sizeMb)}
              </span>
            </div>
            {showSeparateLogicalSize && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_inventory_2", "inventory_2")}
                </span>
                <span>{formatSizeMb(logicalSizeMb)}</span>
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
              <div className="flex items-center justify-between gap-2 w-full">
                <span
                  className={`text-[9px] font-black uppercase tracking-wider ${themeColor} truncate`}
                >
                  {isEngine
                    ? t("confirm_restore_engine_card", "Confirm Engine Restore")
                    : t("confirm_restore_state", "Confirm Restore")}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmRestoreBackup(null);
                      useModalStore
                        .getState()
                        .setRestoreType(isEngine ? "engine" : "world");
                      if (restoreGameBackup) restoreGameBackup(backupName);
                    }}
                    className={`px-2.5 h-7 rounded-lg border bg-transparent ${themeBorder} ${themeColor} hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer`}
                  >
                    {t("confirm", "Confirm")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreBackup(null)}
                    className="px-2.5 h-7 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    {t("btn_cancel", "Cancel")}
                  </button>
                </div>
              </div>
            ) : isConfirmingDelete ? (
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--danger)] truncate">
                  {isEngine
                    ? t("confirm_delete_engine_card", "Confirm Engine Delete")
                    : t("confirm_delete_state", "Confirm Delete")}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteBackup(null);
                      if (deleteBackup) deleteBackup(backupName);
                    }}
                    className="px-2.5 h-7 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    {t("confirm", "Confirm")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteBackup(null)}
                    className="px-2.5 h-7 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    {t("btn_cancel", "Cancel")}
                  </button>
                </div>
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
                    className={`px-2.5 h-7 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:${themeBorder} text-[var(--text)] hover:${themeColor} text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 transition-all cursor-pointer`}
                  >
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_restore", "restore")}
                    </span>
                    {t("btn_restore", "Restore")}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteBackup(backupName)}
                    className="w-7 h-7 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all relative cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
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

      <div className="hidden md:flex flex-col w-full gap-3 mb-8 md:mb-10">
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
