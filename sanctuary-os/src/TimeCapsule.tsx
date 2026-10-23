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
  const [confirmRestoreBackup, setConfirmRestoreBackup] = useState<string | null>(null);
  const [confirmDeleteBackup, setConfirmDeleteBackup] = useState<string | null>(null);
  const [confirmSealWorld, setConfirmSealWorld] = useState<boolean>(false);
  const [confirmSealEngine, setConfirmSealEngine] = useState<boolean>(false);
  const [config, setConfig] = useState<any>(null);
  const [selectedBackupForInspection, setSelectedBackupForInspection] = useState<string | null>(null);

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
    const backupName = typeof backup === "string" ? backup : backup?.name || "";
    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    if (sig?.timestamp && sig.timestamp !== "0") {
      const parsed = Number(sig.timestamp);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const clean = backupName.replace(/\.tar\.zst$/i, "").replace(/\.zst$/i, "");
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
      (sig?.isEngine ? t("engine_full", "Engine Core") : t("world_state", "World State"));

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
        const isWorld = sig ? !sig.isEngine : !backupName.toLowerCase().includes("engine");
        return isWorld && passesFilters(backup);
      })
      .sort((a: any, b: any) => getBackupTimestamp(b) - getBackupTimestamp(a));
  }, [backupList, searchQuery, versionFilter, startDate, endDate, getBackupSignature]);

  const engineBackups = useMemo(() => {
    return (backupList || [])
      .filter((backup: any) => {
        const backupName = typeof backup === "string" ? backup : backup.name;
        const sig = getBackupSignature ? getBackupSignature(backupName) : null;
        const isEngine = sig ? sig.isEngine : backupName.toLowerCase().includes("engine");
        return isEngine && passesFilters(backup);
      })
      .sort((a: any, b: any) => getBackupTimestamp(b) - getBackupTimestamp(a));
  }, [backupList, searchQuery, versionFilter, startDate, endDate, getBackupSignature]);

  const renderSealCard = (isEngine: boolean) => {
    const isConfirming = isEngine ? confirmSealEngine : confirmSealWorld;
    const setConfirming = isEngine ? setConfirmSealEngine : setConfirmSealWorld;
    const themeColor = isEngine ? "text-rose-400" : "text-indigo-400";
    const themeBorderHover = isEngine
      ? "hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
      : "hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]";
    const themeGradient = isEngine ? "from-rose-500/10" : "from-indigo-500/10";
    const confirmBtnClasses = isEngine
      ? "text-rose-400 bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
      : "text-indigo-400 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]";

    return (
      <div
        onClick={() => !isConfirming && setConfirming(true)}
        className={`relative glass-panel p-5 rounded-2xl flex flex-col justify-center items-center gap-3 shadow-xl min-h-[13.5rem] overflow-hidden group cursor-pointer ${themeBorderHover} transition-all duration-300`}
      >
        <div
          className={`absolute inset-0 rounded-[inherit] bg-gradient-to-br ${themeGradient} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
        />

        {!isConfirming ? (
          <div className="flex flex-col items-center gap-3 text-center z-10 transition-transform duration-300 group-hover:scale-105">
            <div className="w-12 h-12 rounded-2xl glass-surface flex items-center justify-center shadow-inner transition-colors">
              <span
                className={`material-symbols-outlined !text-2xl text-[var(--subtext)] group-hover:${themeColor} transition-colors`}
              >
                {t("icon_add", "add")}
              </span>
            </div>
            <div>
              <h3 className="text-xs font-black text-[var(--text)] uppercase tracking-widest transition-colors">
                {isEngine
                  ? t("btn_seal_engine", "Seal Engine Core")
                  : t("btn_seal_state", "Seal World State")}
              </h3>
              <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1">
                {t("create_new_snapshot", "Create New Snapshot")}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center w-full h-full gap-3 z-20 animate-in fade-in zoom-in-95 duration-200 px-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className={`text-[10px] font-black uppercase tracking-widest ${themeColor} mb-1`}>
              {isEngine
                ? t("confirm_seal_engine_prompt", "Seal Engine Core?")
                : t("confirm_seal_world_prompt", "Seal World State?")}
            </span>
            <div className="flex gap-2 w-full h-10">
              <button
                type="button"
                onClick={() => {
                  if (isEngine) {
                    triggerFullEngineBackup && triggerFullEngineBackup();
                  } else {
                    triggerPrePatchSnapshot && triggerPrePatchSnapshot(true);
                  }
                  setConfirming(false);
                }}
                className={`flex-[2] h-full border transition-colors text-[10px] font-black uppercase tracking-widest rounded-xl shadow-sm cursor-pointer ${confirmBtnClasses}`}
              >
                {t("btn_confirm", "Confirm")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-[1] h-full text-[var(--text)] glass-surface hover:bg-white/10 transition-colors font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm cursor-pointer"
              >
                {t("btn_cancel", "Cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const formatSizeMb = (mb: number) => {
    if (mb < 1000) {
      return `${mb.toFixed(2)} ${t("unit_mb", "MB")}`;
    }
    return `${(mb / 1024).toFixed(2)} ${t("unit_gb", "GB")}`;
  };

  const renderBackupCard = (backup: any, index: number) => {
    const backupName = typeof backup === "string" ? backup : backup.name;
    const sizeMb = typeof backup === "string" ? 0 : backup.size_mb || 0;

    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    const isEngine = sig ? sig.isEngine : backupName.toLowerCase().includes("engine");
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

    const themeColor = isEngine ? "text-rose-500" : "text-indigo-500";
    const themeBg = isEngine
      ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
      : "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]";
    const themeBorder = isEngine
      ? "border-[color-mix(in_srgb,var(--danger)_25%,transparent)]"
      : "border-[color-mix(in_srgb,var(--accent)_25%,transparent)]";
    const themeHoverBorder = isEngine
      ? "hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
      : "hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]";
    const themeGradient = isEngine ? "from-rose-500/5" : "from-indigo-500/5";

    const versionLabel = sig?.version || backupName.replace(".tar.zst", "");
    const isLatest = index === 0;

    return (
      <div
        key={backupName}
        onClick={() => {
          setSelectedBackupForInspection(backupName);
          setIsSidePanelOpen(true);
        }}
        className={`relative glass-panel p-5 rounded-2xl flex flex-col gap-4 shadow-xl min-h-[13.5rem] overflow-hidden group cursor-pointer ${themeHoverBorder} transition-colors duration-300`}
      >
        <div
          className={`absolute inset-0 rounded-[inherit] bg-gradient-to-br ${themeGradient} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
        />

        {/* Top Row: Icon on Left, Latest + Size Badges on Right */}
        <div className="flex justify-between items-start gap-3 relative z-10">
          <div
            className={`w-11 h-11 rounded-xl glass-surface border ${themeBorder} flex items-center justify-center shrink-0`}
          >
            <span className={`material-symbols-outlined !text-[22px] ${themeColor}`}>
              {icon}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isLatest && (
              <span className="px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)] text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                {t("tc_badge_latest", "Latest")}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black font-mono text-[var(--subtext)] tracking-wider whitespace-nowrap">
              {formatSizeMb(sizeMb)}
            </span>
          </div>
        </div>

        {/* Middle Block: Full-Width Category, Prominent Version Number, and Timestamp */}
        <div className="flex flex-col gap-1 relative z-10 mt-0.5">
          <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${themeColor}`}>
            {title}
          </span>
          <h3 className="text-xl font-black font-mono text-[var(--text)] tracking-tight leading-tight">
            {versionLabel}
          </h3>
          {sig?.timestamp && sig.timestamp !== "0" && (
            <div className="flex items-center gap-1.5 mt-0.5 text-[var(--subtext)] opacity-80">
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_schedule", "schedule")}
              </span>
              <span className="text-[11px] font-bold tracking-wide">
                {new Date(Number(sig.timestamp) * 1000).toLocaleDateString()} &bull;{" "}
                {new Date(Number(sig.timestamp) * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Bottom Action Tray */}
        <div
          className="mt-auto relative z-20 h-10"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={`grid grid-cols-[2fr_1fr_1fr] gap-2 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-1.5 border border-[color-mix(in_srgb,var(--text)_6%,transparent)] shadow-inner rounded-xl transition-all duration-300 ${
              confirmRestoreBackup === backupName || confirmDeleteBackup === backupName
                ? "opacity-0 translate-y-4 pointer-events-none absolute inset-x-0"
                : "opacity-100 translate-y-0 relative"
            }`}
          >
            <button
              type="button"
              onClick={() => setConfirmRestoreBackup(backupName)}
              className={`h-[32px] flex items-center justify-center gap-2 text-[10px] font-black capitalize tracking-widest text-[var(--text)] hover:${themeColor} bg-[color-mix(in_srgb,var(--text)_2%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border border-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_12%,transparent)] transition-all duration-300 rounded-lg cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_restore", "restore")}
              </span>
              {t("btn_restore", "Restore")}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedBackupForInspection(backupName);
                setIsSidePanelOpen(true);
              }}
              className="h-[32px] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all duration-300 rounded-lg relative group/ins cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_search", "search")}
              </span>
              <HoverTooltip title={t("tc_btn_inspect", "Inspect")} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteBackup(backupName)}
              className="h-[32px] flex items-center justify-center text-[color-mix(in_srgb,var(--danger)_70%,transparent)] hover:text-[var(--danger)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] transition-all duration-300 rounded-lg relative group/del cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_delete", "delete")}
              </span>
              <HoverTooltip title={t("btn_delete", "Delete")} />
            </button>
          </div>

          <div
            className={`absolute inset-0 rounded-[inherit] flex gap-2 transition-all duration-300 ${
              confirmRestoreBackup === backupName
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-4 pointer-events-none"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setConfirmRestoreBackup(null);
                useModalStore.getState().setRestoreType(isEngine ? "engine" : "world");
                if (restoreGameBackup) restoreGameBackup(backupName);
              }}
              className={`flex-[2] h-full ${themeColor} ${themeBg} hover:brightness-110 border ${themeBorder} transition-colors duration-300 text-[10px] font-black capitalize tracking-widest rounded-xl shadow-sm cursor-pointer`}
            >
              {isEngine
                ? t("confirm_restore_engine_card", "Confirm Engine Restore")
                : t("confirm_restore_state", "Confirm Restore")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRestoreBackup(null)}
              className="flex-[1] h-full text-[var(--text)] glass-surface hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors duration-300 font-black text-[10px] capitalize tracking-widest rounded-xl shadow-sm cursor-pointer"
            >
              {t("btn_cancel", "Cancel")}
            </button>
          </div>

          <div
            className={`absolute inset-0 rounded-[inherit] flex gap-2 transition-all duration-300 ${
              confirmDeleteBackup === backupName
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-4 pointer-events-none"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteBackup(null);
                if (deleteBackup) deleteBackup(backupName);
              }}
              className="flex-[2] h-full text-red-500 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors duration-300 text-[10px] font-black capitalize tracking-widest rounded-xl shadow-sm cursor-pointer"
            >
              {isEngine
                ? t("confirm_delete_engine_card", "Confirm Engine Delete")
                : t("confirm_delete_state", "Confirm Delete")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteBackup(null)}
              className="flex-[1] h-full text-[var(--text)] glass-surface hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors duration-300 font-black text-[10px] capitalize tracking-widest rounded-xl shadow-sm cursor-pointer"
            >
              {t("btn_cancel", "Cancel")}
            </button>
          </div>
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
        subtitle={t("backups_subtitle", "Backups, restores, and versioned world states")}
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
                iconColorClass="text-indigo-400"
                className="!mb-0"
              />

              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
                {renderSealCard(false)}
                {worldBackups.slice(0, 5).map((b: any, idx: number) => renderBackupCard(b, idx))}
              </div>
            </div>

            {/* Engine Cores Section */}
            <div className="flex flex-col gap-6">
              <CommandScreenSectionHeading
                title={t("recent_engine_cores", "Recent Engine Cores")}
                icon={t("icon_settings", "settings")}
                iconColorClass="text-rose-400"
                className="!mb-0"
              />

              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
                {renderSealCard(true)}
                {engineBackups.slice(0, 5).map((b: any, idx: number) => renderBackupCard(b, idx))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "WORLD" && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CommandScreenSectionHeading
              title={t("world_state", "World State")}
              icon={t("icon_public", "public")}
              iconColorClass="text-indigo-400"
              className="!mb-0"
            />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-6">
              {renderSealCard(false)}
              {worldBackups.map((b: any, idx: number) => renderBackupCard(b, idx))}
            </div>
          </div>
        )}

        {activeTab === "ENGINE" && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CommandScreenSectionHeading
              title={t("engine_full", "Engine Core")}
              icon={t("icon_settings", "settings")}
              iconColorClass="text-rose-400"
              className="!mb-0"
            />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-6">
              {renderSealCard(true)}
              {engineBackups.map((b: any, idx: number) => renderBackupCard(b, idx))}
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
