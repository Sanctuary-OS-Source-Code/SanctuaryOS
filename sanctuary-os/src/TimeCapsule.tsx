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
    const themeColor = isEngine
      ? "text-[var(--danger)]"
      : "text-[var(--accent)]";
    const themeBorder = isEngine
      ? "border-[color-mix(in_srgb,var(--danger)_38%,transparent)]"
      : "border-[color-mix(in_srgb,var(--accent)_38%,transparent)]";
    const themeHoverBorder = isEngine
      ? "hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)]"
      : "hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]";

    return (
      <div
        onClick={() => !isConfirming && setConfirming(true)}
        className={`relative glass-panel p-5 rounded-2xl border border-dashed ${themeBorder} ${themeHoverBorder} flex flex-col justify-between gap-4 min-h-[13.5rem] overflow-hidden group cursor-pointer transition-all duration-300`}
      >
        {/* Top Row: Outline Icon Box + Outline Badge */}
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div
            className={`w-11 h-11 rounded-xl border bg-transparent ${themeBorder} ${themeColor} flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105`}
          >
            <span className="material-symbols-outlined !text-[22px]">
              {t("icon_add", "add")}
            </span>
          </div>

          <span
            className={`px-2.5 py-1 rounded-lg border bg-transparent ${themeBorder} ${themeColor} text-[10px] font-black uppercase tracking-wider flex items-center gap-1 whitespace-nowrap`}
          >
            <span className="material-symbols-outlined !text-[12px]">
              {t("icon_archive", "archive")}
            </span>
            {t("tc_card_new_badge", "New Snapshot")}
          </span>
        </div>

        {/* Middle Block: Category Overline, Title & Concise Description */}
        <div className="flex flex-col gap-1 relative z-10">
          <span
            className={`text-[10px] font-black uppercase tracking-[0.2em] ${themeColor}`}
          >
            {isEngine
              ? t("engine_full", "Engine Core")
              : t("world_state", "World State")}
          </span>
          <h3 className="text-lg font-black text-[var(--text)] tracking-tight leading-snug m-0">
            {isEngine
              ? t("btn_seal_engine", "Seal Engine Core")
              : t("btn_seal_state", "Seal World State")}
          </h3>
          <p className="text-xs font-medium text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 m-0 mt-0.5">
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

        {/* Bottom Footer Bar */}
        <div
          className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-20"
          onClick={(e) => e.stopPropagation()}
        >
          {!isConfirming ? (
            <>
              <span className="text-[11px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate">
                {cleanActiveVersion ||
                  t("create_new_snapshot", "Create New Snapshot")}
              </span>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className={`px-3 h-8 rounded-lg border bg-transparent ${themeBorder} ${themeColor} hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0`}
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_add", "add")}
                </span>
                {t("create_new_snapshot", "Create New Snapshot")}
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2 w-full">
              <span
                className={`text-[10px] font-black uppercase tracking-wider ${themeColor} truncate`}
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
                  className={`px-3 h-8 rounded-lg border bg-transparent ${themeBorder} ${themeColor} hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer`}
                >
                  {t("btn_confirm", "Confirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="px-2.5 h-8 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  {t("btn_cancel", "Cancel")}
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
    const isConfirmingRestore = confirmRestoreBackup === backupName;
    const isConfirmingDelete = confirmDeleteBackup === backupName;

    return (
      <div
        key={backupName}
        onClick={() => {
          setSelectedBackupForInspection(backupName);
          setIsSidePanelOpen(true);
        }}
        className={`relative glass-panel p-5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] ${themeHoverBorder} flex flex-col justify-between gap-4 min-h-[13.5rem] overflow-hidden group cursor-pointer transition-all duration-300`}
      >
        {/* Top Row: Outline Icon Box on Left, Outline Status + Delta Size Badges on Right */}
        <div className="flex justify-between items-start gap-3 relative z-10">
          <div
            className={`w-11 h-11 rounded-xl border bg-transparent ${themeBorder} ${themeColor} flex items-center justify-center shrink-0`}
          >
            <span className="material-symbols-outlined !text-[22px]">
              {icon}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {isLatest && (
              <span className="px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--success)_42%,transparent)] text-[var(--success)] text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                {t("tc_badge_latest", "Latest")}
              </span>
            )}
            <span
              className={`px-2.5 py-1 rounded-lg bg-transparent border text-[10px] font-black font-mono tracking-wider inline-flex items-center gap-1 whitespace-nowrap ${
                isZeroDelta
                  ? "border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)]"
                  : `${themeBorder} ${themeColor}`
              }`}
            >
              <span className="material-symbols-outlined !text-[12px]">
                {isZeroDelta
                  ? t("icon_link", "link")
                  : t("icon_hard_drive", "hard_drive")}
              </span>
              {isZeroDelta
                ? t("tc_delta_filter_dedup", "Hardlinked")
                : formatSizeMb(sizeMb)}
            </span>
          </div>
        </div>

        {/* Middle Block: Category Overline, Prominent Version Number, and Timestamp + Total Logical Size */}
        <div className="flex flex-col gap-1 relative z-10">
          <span
            className={`text-[10px] font-black uppercase tracking-[0.2em] ${themeColor}`}
          >
            {title}
          </span>
          <h3 className="text-xl font-black font-mono text-[var(--text)] tracking-tight leading-tight m-0">
            {versionLabel}
          </h3>

          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-[var(--subtext)] opacity-85">
            {sig?.timestamp && sig.timestamp !== "0" && (
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_schedule", "schedule")}
                </span>
                <span className="text-[11px] font-semibold tracking-wide">
                  {new Date(Number(sig.timestamp) * 1000).toLocaleDateString()}{" "}
                  &bull;{" "}
                  {new Date(Number(sig.timestamp) * 1000).toLocaleTimeString(
                    [],
                    {
                      hour: "numeric",
                      minute: "2-digit",
                    }
                  )}
                </span>
              </div>
            )}

            {logicalSizeMb > 0 && (
              <div className="flex items-center gap-1 font-mono text-[11px] font-bold">
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_inventory_2", "inventory_2")}
                </span>
                <span>{formatSizeMb(logicalSizeMb)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Sleek Bottom Footer Bar (Matches Workspace & Homestead Lab Cards) */}
        <div
          className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-20"
          onClick={(e) => e.stopPropagation()}
        >
          {isConfirmingRestore ? (
            <div className="flex items-center justify-between gap-2 w-full">
              <span
                className={`text-[10px] font-black uppercase tracking-wider ${themeColor} truncate`}
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
                  className={`px-3 h-8 rounded-lg border bg-transparent ${themeBorder} ${themeColor} hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer`}
                >
                  {t("btn_confirm", "Confirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRestoreBackup(null)}
                  className="px-2.5 h-8 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  {t("btn_cancel", "Cancel")}
                </button>
              </div>
            </div>
          ) : isConfirmingDelete ? (
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--danger)] truncate">
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
                  className="px-3 h-8 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  {t("btn_confirm", "Confirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteBackup(null)}
                  className="px-2.5 h-8 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  {t("btn_cancel", "Cancel")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedBackupForInspection(backupName);
                  setIsSidePanelOpen(true);
                }}
                className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] group-hover:text-[var(--text)] inline-flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_folder_open", "folder_open")}
                </span>
                <span>{t("tc_card_inspect_cta", "Inspect Snapshot")}</span>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmRestoreBackup(backupName)}
                  className={`px-3 h-8 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:${themeBorder} text-[var(--text)] hover:${themeColor} text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer`}
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_restore", "restore")}
                  </span>
                  {t("btn_restore", "Restore")}
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmDeleteBackup(backupName)}
                  className="w-8 h-8 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all relative cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_delete", "delete")}
                  </span>
                  <HoverTooltip
                    title={t("btn_delete", "Delete")}
                    variant="danger"
                  />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
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
            { id: "ALL", label: t("ql_all", "All") },
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
        title={t("backups_title", "Time Capsule")}
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
              : t("engine_core", "Engine Core")
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
          title={t("backups_title", "Time Capsule")}
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

      <div className="hidden md:flex flex-col w-full gap-3 mb-6">
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

      <div className="flex flex-col gap-10 pt-4">
        {activeTab === "LANDING" && (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* World States Section */}
            <div className="flex flex-col gap-6">
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
            <div className="flex flex-col gap-6">
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
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
