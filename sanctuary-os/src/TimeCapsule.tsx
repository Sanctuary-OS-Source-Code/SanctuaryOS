import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, HubTabButton, SearchBar, CustomDropdown, CustomDatePicker, DashboardStatTile, ActionButton } from "./shared";
import { TimeCapsuleSidePanel } from "./side-panels/TimeCapsuleSidePanels";
import { useModalStore } from "./store/modalStore";

export default function TimeCapsule({
  selectedVersion, isBackingUp, triggerPrePatchSnapshot, triggerFullEngineBackup,
  restoreGameBackup, renameGameBackup, deleteBackup, backupList, getBackupSignature
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

  const totalWorldSize = backupList?.reduce((acc: number, b: any) => acc + (b.name?.toLowerCase().includes('world') ? (b.size_mb || 0) : 0), 0) || 0;
  const totalEngineSize = backupList?.reduce((acc: number, b: any) => acc + (b.name?.toLowerCase().includes('engine') ? (b.size_mb || 0) : 0), 0) || 0;
  const totalSpace = totalWorldSize + totalEngineSize;
  const vaultCapacityGb = config?.vault_capacity_gb || 0;
  const vaultCapacityMb = vaultCapacityGb * 1024;

  const usagePercentage = vaultCapacityMb > 0 ? Math.min(100, (totalSpace / vaultCapacityMb) * 100) : 0;
  const worldPercentage = vaultCapacityMb > 0 ? Math.min(100, (totalWorldSize / vaultCapacityMb) * 100) : 0;
  const enginePercentage = vaultCapacityMb > 0 ? Math.min(100, (totalEngineSize / vaultCapacityMb) * 100) : 0;

  const uniqueVersions = useMemo(() => {
    const versions = new Set<string>();
    (backupList || []).forEach((backup: any) => {
      const backupName = typeof backup === 'string' ? backup : backup.name;
      const sig = getBackupSignature ? getBackupSignature(backupName) : null;
      if (sig?.version) versions.add(sig.version);
    });
    return Array.from(versions);
  }, [backupList, getBackupSignature]);

  const passesFilters = (backup: any) => {
    const backupName = typeof backup === 'string' ? backup : backup.name;
    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    const title = sig?.alias || (sig?.isEngine ? t("engine_full") : t("world_state"));

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!title.toLowerCase().includes(q) && !backupName.toLowerCase().includes(q)) {
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

  const worldBackups = (backupList || []).filter((backup: any) => {
    const backupName = typeof backup === 'string' ? backup : backup.name;
    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    const isWorld = sig ? !sig.isEngine : !backupName.toLowerCase().includes("engine");
    return isWorld && passesFilters(backup);
  });

  const engineBackups = (backupList || []).filter((backup: any) => {
    const backupName = typeof backup === 'string' ? backup : backup.name;
    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    const isEngine = sig ? sig.isEngine : backupName.toLowerCase().includes("engine");
    return isEngine && passesFilters(backup);
  });

  const renderBackupCard = (backup: any) => {
    const backupName = typeof backup === 'string' ? backup : backup.name;
    const sizeMb = typeof backup === 'string' ? 0 : backup.size_mb;
    const logicalSizeMb = typeof backup === 'string' ? 0 : (backup.logical_size_mb ?? backup.size_mb);
    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    const isEngine = sig ? sig.isEngine : backupName.toLowerCase().includes("engine");
    const title = sig?.alias || (isEngine ? t("engine_full") : t("world_state"));
    const icon = isEngine ? t("icon_settings") : t("icon_public");

    const themeColor = isEngine ? 'text-rose-500' : 'text-indigo-500';
    const themeBg = isEngine ? 'bg-rose-500/10' : 'bg-indigo-500/10';
    const themeBorder = isEngine ? 'border-rose-500/20' : 'border-indigo-500/20';
    const themeHoverBorder = isEngine ? 'hover:border-rose-500/40' : 'hover:border-indigo-500/40';
    const themeGradient = isEngine ? 'from-rose-500/5' : 'from-indigo-500/5';
    const themeLed = isEngine ? 'bg-rose-500 shadow-[0_0_8px_rgba(225,29,72,0.8)]' : 'bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.8)]';

    return (
      <div key={backupName} className={`relative bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-5 rounded-[var(--radius)] flex flex-col gap-4 shadow-xl min-h-[13rem] overflow-hidden group ${themeHoverBorder} transition-all duration-300`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${themeGradient} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />

        <div className="flex justify-between items-start relative z-10">
          <div className={`w-12 h-12 rounded-xl theme-glass-panel border ${themeBorder} shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0`}>
            <span className={`material-symbols-outlined !text-[24px] ${themeColor} opacity-90 drop-shadow-lg`}>{icon}</span>
          </div>

          <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 px-2.5 py-1 rounded-lg">
            {sizeMb < 1 ? (sizeMb * 1024).toFixed(2) + " MB" : (sizeMb / 1024).toFixed(2) + " " + t("unit_gb")}
          </span>
        </div>

        <div className="flex flex-col relative z-10 mt-1">
          <h3 className="text-lg font-black text-[var(--text)] tracking-tighter uppercase leading-none mb-2.5 truncate">{title}</h3>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-black ${themeColor} uppercase tracking-widest`}>{sig ? sig.version : backupName.replace(".tar.zst", "")}</span>
            {sig?.timestamp && sig.timestamp !== "0" && (
              <>
                <span className="text-[var(--subtext)] opacity-50">•</span>
                <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest">{new Date(Number(sig.timestamp) * 1000).toLocaleDateString()}</span>
              </>
            )}
          </div>
        </div>

        <div className="mt-auto relative z-20 h-10">

          <div className={`absolute inset-0 flex gap-2 transition-all duration-300 ${confirmRestoreBackup === backupName || confirmDeleteBackup === backupName ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
            <button
              onClick={() => setConfirmRestoreBackup(backupName)}
              className={`flex-[2] h-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:${themeColor} bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-all rounded-xl shadow-sm backdrop-blur-md`}
            >
              <span className={`material-symbols-outlined !text-sm`}>{t("icon_restore")}</span>
              {t("btn_restore")}
            </button>
            <button
              onClick={() => { setSelectedBackupForInspection(backupName); setIsSidePanelOpen(true); }}
              className="flex-[1] h-full flex items-center justify-center text-[var(--text)]/80 hover:text-[var(--text)] bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 hover:border-[var(--text)]/30 transition-all rounded-xl shadow-sm backdrop-blur-md group/ins"
            >
              <span className="material-symbols-outlined !text-sm group-hover/ins:scale-110 transition-transform">search</span>
            </button>
            <button
              onClick={() => setConfirmDeleteBackup(backupName)}
              className="flex-[1] h-full flex items-center justify-center text-red-500/80 hover:text-red-500 bg-black/5 dark:bg-white/5 hover:bg-red-500/10 border border-black/10 dark:border-white/10 hover:border-red-500/30 transition-all rounded-xl shadow-sm backdrop-blur-md group/del"
            >
              <span className="material-symbols-outlined !text-sm group-hover/del:scale-110 transition-transform">{t("icon_delete")}</span>
            </button>
          </div>

          <div className={`absolute inset-0 flex gap-2 transition-all duration-300 ${confirmRestoreBackup === backupName ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
            <button
              onClick={() => { setConfirmRestoreBackup(null); useModalStore.getState().setRestoreType(isEngine ? 'engine' : 'world'); if (restoreGameBackup) restoreGameBackup(backupName); }}
              className={`flex-[2] h-full ${themeColor} ${themeBg} hover:brightness-110 border ${themeBorder} transition-all text-[10px] font-black uppercase tracking-widest rounded-xl shadow-sm backdrop-blur-md`}
            >
              {isEngine ? t("confirm_restore_engine_card") : t("confirm_restore_state")}
            </button>
            <button onClick={() => setConfirmRestoreBackup(null)} className="flex-[1] h-full text-[var(--text)] hover:text-[var(--text)] transition-colors bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 border border-black/10 dark:border-white/10 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm backdrop-blur-md">
              {t("btn_cancel")}
            </button>
          </div>

          <div className={`absolute inset-0 flex gap-2 transition-all duration-300 ${confirmDeleteBackup === backupName ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
            <button
              onClick={() => { setConfirmDeleteBackup(null); if (deleteBackup) deleteBackup(backupName); }}
              className="flex-[2] h-full text-red-500 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all text-[10px] font-black uppercase tracking-widest rounded-xl shadow-sm backdrop-blur-md"
            >
              {isEngine ? t("confirm_delete_engine_card") : t("confirm_delete_state")}
            </button>
            <button onClick={() => setConfirmDeleteBackup(null)} className="flex-[1] h-full text-[var(--text)] hover:text-[var(--text)] transition-colors bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 border border-black/10 dark:border-white/10 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm backdrop-blur-md">
              {t("btn_cancel")}
            </button>
          </div>

        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700 pb-32 w-full">
      <ViewHeader title={t("backups_title")} subtitle={t("backups_subtitle")} icon={t("icon_history")} iconColorClass="text-[var(--accent)] border-[var(--accent)]/30" />

      <div className="flex flex-col gap-8 animate-in slide-in-from-top-4 duration-500 w-full mb-2">
        <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
          <HubTabButton id="LANDING" icon="dashboard" label={t("tab_landing") || "LANDING"} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="WORLD" icon="public" label={t("world_state")} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="ENGINE" icon="settings" label={t("engine_full")} activeTab={activeTab} setTab={setActiveTab} />
        </div>
      </div>

      {activeTab === "LANDING" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full relative z-10 animate-in slide-in-from-top-4 duration-500 mb-6">
          <DashboardStatTile
            icon={<span className="material-symbols-outlined !text-4xl">{t("icon_verified_user")}</span>}
            number={selectedVersion || t("status_unknown")}
            label={t("target_patch")}
            colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20"
          />
          <DashboardStatTile
            icon={<span className="material-symbols-outlined !text-4xl">{t("icon_public")}</span>}
            number={(totalWorldSize / 1024).toFixed(2)}
            label={`${t("unit_gb")} / ${t("world_space")}`}
            colorClass="border-indigo-500/30 text-indigo-500 hover:border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20 cursor-pointer"
            onClick={() => setActiveTab("WORLD")}
          />
          <DashboardStatTile
            icon={<span className="material-symbols-outlined !text-4xl">{t("icon_settings")}</span>}
            number={(totalEngineSize / 1024).toFixed(2)}
            label={`${t("unit_gb")} / ${t("engine_space")}`}
            colorClass="border-rose-500/30 text-rose-500 hover:border-rose-500 bg-rose-500/10 hover:bg-rose-500/20 cursor-pointer"
            onClick={() => setActiveTab("ENGINE")}
          />
          <DashboardStatTile
            icon={<span className="material-symbols-outlined !text-4xl">{t("icon_storage")}</span>}
            number={(totalSpace / 1024).toFixed(2)}
            label={`${t("unit_gb")} / ${t("total_space")}`}
            colorClass="border-cyan-500/30 text-cyan-500 hover:border-cyan-500 bg-cyan-500/10 hover:bg-cyan-500/20"
          />
        </div>
      )}

      {activeTab !== "LANDING" && (
        <div className="flex items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full">
          <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl theme-glass-panel border ${activeTab === "WORLD" ? "border-indigo-500/30" : activeTab === "ENGINE" ? "border-rose-500/30" : "border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"} shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0`}>
              <span className={`material-symbols-outlined !text-[24px] ${activeTab === "WORLD" ? "text-indigo-500" : activeTab === "ENGINE" ? "text-rose-500" : "theme-text-accent"} opacity-90 drop-shadow-lg`}>
                {activeTab === "WORLD" ? "public" : activeTab === "ENGINE" ? "settings" : "history"}
              </span>
            </div>
            <span className="truncate">
              {activeTab === "LANDING" ? t("timecapsule_recent") || "RECENT CHRONOGRAMS" : activeTab === "WORLD" ? t("world_state") : t("section_engine")}
            </span>
          </h2>

          <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end flex-wrap">
            <div className="relative flex-1 h-12 min-w-[200px] max-w-[350px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
              <input
                type="text"
                placeholder={t("timecapsule_search") || "Search Chronograms..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                  <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
                </button>
              )}
            </div>

            <div className="w-max min-w-[180px] shrink-0">
              <CustomDropdown disableTint={true}
                value={versionFilter}
                onChange={(val: string[]) => setVersionFilter(val[0])}
                options={[
                  { id: "ALL", label: t("ql_all") },
                  ...uniqueVersions.map((v: string) => ({ id: v, label: v }))
                ]}
              />
            </div>

            <div className="w-max min-w-[150px] shrink-0">
              <CustomDatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder={t("filter_start_date") || "Start Date"}
              />
            </div>
            <div className="w-max min-w-[150px] shrink-0">
              <CustomDatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder={t("filter_end_date") || "End Date"}
              />
            </div>

            {activeTab === "WORLD" && (
              <div className="shrink-0 h-12">
                {!confirmSealWorld ? (
                  <ActionButton
                    icon="public"
                    className="h-12 px-6 py-0"
                    label={t("btn_seal_state")}
                    onClick={() => setConfirmSealWorld(true)}
                  />
                ) : (
                  <div className="flex gap-2 shrink-0">
                    <ActionButton
                      icon="check_circle"
                      label={t("btn_confirm")}
                      onClick={() => { triggerPrePatchSnapshot && triggerPrePatchSnapshot(true); setConfirmSealWorld(false); }}
                      className="h-12 px-6 py-0"
                    />
                    <ActionButton
                      icon="close"
                      onClick={() => setConfirmSealWorld(false)}
                      className="h-12 w-12 px-0 py-0 flex items-center justify-center"
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === "ENGINE" && (
              <div className="shrink-0 h-12">
                {!confirmSealEngine ? (
                  <ActionButton
                    icon="settings"
                    className="h-12 px-6 py-0"
                    label={t("btn_seal_engine")}
                    onClick={() => setConfirmSealEngine(true)}
                  />
                ) : (
                  <div className="flex gap-2 shrink-0">
                    <ActionButton
                      icon="warning_amber"
                      label={t("btn_confirm")}
                      onClick={() => { triggerFullEngineBackup && triggerFullEngineBackup(); setConfirmSealEngine(false); }}
                      className="h-12 px-6 py-0"
                    />
                    <ActionButton
                      icon="close"
                      onClick={() => setConfirmSealEngine(false)}
                      className="h-12 w-12 px-0 py-0 flex items-center justify-center"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-10 pt-4">
        {backupList?.length > 0 ? (
          <>
            {activeTab === "LANDING" && (
              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {worldBackups.length > 0 && (
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
                      <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-[0.2em] flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl theme-glass-panel border border-indigo-500/30 shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[24px] text-indigo-500 opacity-90 drop-shadow-lg">{t("icon_public")}</span>
                        </div>
                        {t("recent_world_states") || "RECENT WORLD STATES"}
                      </h3>
                      {!confirmSealWorld ? (
                        <ActionButton
                          icon="public"
                          className="h-10 px-6 py-0 shrink-0"
                          label={t("btn_seal_state")}
                          onClick={() => setConfirmSealWorld(true)}
                        />
                      ) : (
                        <div className="flex gap-2 shrink-0">
                          <ActionButton
                            icon="check_circle"
                            label={t("btn_confirm")}
                            onClick={() => { triggerPrePatchSnapshot && triggerPrePatchSnapshot(true); setConfirmSealWorld(false); }}
                            className="h-10 px-6 py-0"
                          />
                          <ActionButton
                            icon="close"
                            onClick={() => setConfirmSealWorld(false)}
                            className="h-10 w-10 px-0 py-0 flex items-center justify-center"
                          />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
                      {worldBackups.slice(0, 6).map(renderBackupCard)}
                    </div>
                  </div>
                )}

                {engineBackups.length > 0 && (
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
                      <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-[0.2em] flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl theme-glass-panel border border-rose-500/30 shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[24px] text-rose-500 opacity-90 drop-shadow-lg">{t("icon_settings")}</span>
                        </div>
                        {t("recent_engine_cores") || "RECENT ENGINE CORES"}
                      </h3>
                      {!confirmSealEngine ? (
                        <ActionButton
                          icon="settings"
                          className="h-10 px-6 py-0 shrink-0"
                          label={t("btn_seal_engine")}
                          onClick={() => setConfirmSealEngine(true)}
                        />
                      ) : (
                        <div className="flex gap-2 shrink-0">
                          <ActionButton
                            icon="warning_amber"
                            label={t("btn_confirm")}
                            onClick={() => { triggerFullEngineBackup && triggerFullEngineBackup(); setConfirmSealEngine(false); }}
                            className="h-10 px-6 py-0"
                          />
                          <ActionButton
                            icon="close"
                            onClick={() => setConfirmSealEngine(false)}
                            className="h-10 w-10 px-0 py-0 flex items-center justify-center"
                          />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
                      {engineBackups.slice(0, 6).map(renderBackupCard)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "WORLD" && worldBackups.length > 0 && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                  {worldBackups.map(renderBackupCard)}
                </div>
              </div>
            )}

            {activeTab === "ENGINE" && engineBackups.length > 0 && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                  {engineBackups.map(renderBackupCard)}
                </div>
              </div>
            )}

            {activeTab === "LANDING" && worldBackups.length === 0 && engineBackups.length === 0 && (
              <div className="flex items-center justify-center h-64 theme-glass-panel border border-white/5 rounded-[var(--radius)] shadow-xl w-full">
                <span className="text-[var(--subtext)] font-black uppercase tracking-widest opacity-60 flex items-center gap-4">
                  <span className="material-symbols-outlined !text-3xl opacity-50">{t("icon_hourglass_empty")}</span>
                  {t("timecapsule_no_backups")}
                </span>
              </div>
            )}

            {activeTab === "WORLD" && worldBackups.length === 0 && (
              <div className="flex items-center justify-center h-64 theme-glass-panel border border-white/5 rounded-[var(--radius)] shadow-xl w-full">
                <span className="text-[var(--subtext)] font-black uppercase tracking-widest opacity-60 flex items-center gap-4">
                  <span className="material-symbols-outlined !text-3xl opacity-50">{t("icon_hourglass_empty")}</span>
                  {t("timecapsule_no_backups")}
                </span>
              </div>
            )}

            {activeTab === "ENGINE" && engineBackups.length === 0 && (
              <div className="flex items-center justify-center h-64 theme-glass-panel border border-white/5 rounded-[var(--radius)] shadow-xl w-full">
                <span className="text-[var(--subtext)] font-black uppercase tracking-widest opacity-60 flex items-center gap-4">
                  <span className="material-symbols-outlined !text-3xl opacity-50">{t("icon_hourglass_empty")}</span>
                  {t("timecapsule_no_backups")}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-64 theme-glass-panel border border-white/5 rounded-[var(--radius)] shadow-xl">
            <span className="text-[var(--subtext)] font-black uppercase tracking-widest opacity-60 flex items-center gap-4">
              <span className="material-symbols-outlined !text-3xl opacity-50">{t("icon_hourglass_empty")}</span>
              {t("timecapsule_no_backups")}
            </span>
          </div>
        )}
      </div>
      <TimeCapsuleSidePanel isOpen={isSidePanelOpen} onClose={() => setIsSidePanelOpen(false)} selectedBackup={selectedBackupForInspection} config={config} />
    </div>
  );
}
