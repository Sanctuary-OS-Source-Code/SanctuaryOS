import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, SidePanel, SidebarActionButton } from "./shared";
import { useModalStore } from "./store/modalStore";

export default function TimeCapsule({
  selectedVersion, isBackingUp, triggerPrePatchSnapshot, triggerFullEngineBackup,
  restoreGameBackup, renameGameBackup, deleteBackup, backupList, getBackupSignature
}: any) {
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const { t } = useLexicon();
  const [confirmRestoreBackup, setConfirmRestoreBackup] = useState<string | null>(null);
  const [confirmDeleteBackup, setConfirmDeleteBackup] = useState<string | null>(null);
  const [confirmSealWorld, setConfirmSealWorld] = useState<boolean>(false);
  const [confirmSealEngine, setConfirmSealEngine] = useState<boolean>(false);
  const [config, setConfig] = useState<any>(null);

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

  const worldBackups = (backupList || []).filter((backup: any) => {
    const backupName = typeof backup === 'string' ? backup : backup.name;
    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    return sig ? !sig.isEngine : !backupName.toLowerCase().includes("engine");
  });

  const engineBackups = (backupList || []).filter((backup: any) => {
    const backupName = typeof backup === 'string' ? backup : backup.name;
    const sig = getBackupSignature ? getBackupSignature(backupName) : null;
    return sig ? sig.isEngine : backupName.toLowerCase().includes("engine");
  });

  const renderBackupCard = (backup: any) => {
    const backupName = typeof backup === 'string' ? backup : backup.name;
    const sizeMb = typeof backup === 'string' ? 0 : backup.size_mb;
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
          <div className={`w-12 h-12 rounded-2xl ${themeBg} flex items-center justify-center ${themeColor} ${themeBorder} border shadow-sm shrink-0`}>
            <span className="material-symbols-outlined !text-2xl">{icon}</span>
          </div>

          {sizeMb > 0 && (
            <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 px-2.5 py-1 rounded-lg">{(sizeMb / 1024).toFixed(2)} {t("unit_gb")}</span>
          )}
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
              className={`flex-[3] h-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:${themeColor} bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-all rounded-xl shadow-sm backdrop-blur-md`}
            >
              <span className={`material-symbols-outlined !text-sm`}>{t("icon_restore")}</span>
              {t("btn_restore")}
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
      <ViewHeader title={t("backups_title")} subtitle={t("backups_subtitle")} icon={t("icon_history")} iconColorClass="text-[var(--accent)] border-[var(--accent)]/30">
        <div className="flex gap-4 items-center ml-auto shrink-0">
          <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner">
            <button onClick={() => setIsSidePanelOpen(true)} className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
              <span className="material-symbols-outlined text-xl normal-case">{t("icon_tune")}</span>
              <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_operations")}</span>
            </button>
          </div>
        </div>
      </ViewHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10 w-full mb-4">

        <div className="bg-black/5 dark:bg-white/5 p-6 rounded-[var(--radius)] border border-black/5 dark:border-white/5 shadow-md flex flex-col gap-6 relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[40px] rounded-full pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-700" />

          <div className="flex justify-between items-start relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 shadow-sm shrink-0">
              <span className="material-symbols-outlined !text-[24px]">{t("icon_public")}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 opacity-80 mb-1">{t("world_space")}</span>
              <span className="text-2xl font-black text-[var(--text)] tracking-tighter">{(totalWorldSize / 1024).toFixed(2)} <span className="text-sm text-[var(--subtext)]">{t("unit_gb")}</span></span>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full mt-2 relative z-10">
            <div className="flex justify-end items-center w-full">
              <span className="text-[10px] font-black text-indigo-500 tracking-widest">{vaultCapacityGb > 0 ? `${worldPercentage.toFixed(1)}%` : t("capacity_unlimited")}</span>
            </div>
            <div className="h-1.5 w-full bg-black/10 dark:bg-black/40 rounded-full overflow-hidden flex shadow-inner border border-black/5 dark:border-white/5">
              <div className="h-full bg-gradient-to-r from-indigo-500/60 to-indigo-500 transition-all duration-1000 relative" style={{ width: `${vaultCapacityGb > 0 ? worldPercentage : Math.max(0, (totalWorldSize / Math.max(1, totalSpace)) * 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-black/5 dark:bg-white/5 p-6 rounded-[var(--radius)] border border-black/5 dark:border-white/5 shadow-md flex flex-col gap-6 relative overflow-hidden group hover:border-rose-500/30 transition-all duration-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-[40px] rounded-full pointer-events-none group-hover:bg-rose-500/20 transition-all duration-700" />

          <div className="flex justify-between items-start relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-sm shrink-0">
              <span className="material-symbols-outlined !text-[24px]">{t("icon_settings")}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500 opacity-80 mb-1">{t("engine_space")}</span>
              <span className="text-2xl font-black text-[var(--text)] tracking-tighter">{(totalEngineSize / 1024).toFixed(2)} <span className="text-sm text-[var(--subtext)]">{t("unit_gb")}</span></span>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full mt-2 relative z-10">
            <div className="flex justify-end items-center w-full">
              <span className="text-[10px] font-black text-rose-500 tracking-widest">{vaultCapacityGb > 0 ? `${enginePercentage.toFixed(1)}%` : t("capacity_unlimited")}</span>
            </div>
            <div className="h-1.5 w-full bg-black/10 dark:bg-black/40 rounded-full overflow-hidden flex shadow-inner border border-black/5 dark:border-white/5">
              <div className="h-full bg-gradient-to-r from-rose-500/60 to-rose-500 transition-all duration-1000 relative" style={{ width: `${vaultCapacityGb > 0 ? enginePercentage : Math.max(0, (totalEngineSize / Math.max(1, totalSpace)) * 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-black/5 dark:bg-white/5 p-6 rounded-[var(--radius)] border border-black/5 dark:border-white/5 shadow-md flex flex-col gap-6 relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[40px] rounded-full pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-700" />

          <div className="flex justify-between items-start relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
              <span className="material-symbols-outlined !text-[24px]">{t("icon_storage")}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 opacity-80 mb-1">{t("total_space")}</span>
              <span className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {(totalSpace / 1024).toFixed(2)}
                <span className="text-sm text-[var(--subtext)] ml-1">
                  {vaultCapacityGb > 0 ? `/ ${vaultCapacityGb}` : ''} {t("unit_gb")}
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full mt-2 relative z-10">
            <div className="flex justify-end items-center w-full">
              <span className="text-[10px] font-black text-emerald-500 tracking-widest">{vaultCapacityGb > 0 ? `${(worldPercentage + enginePercentage).toFixed(1)}%` : t("capacity_unlimited")}</span>
            </div>
            <div className="h-1.5 w-full bg-black/10 dark:bg-black/40 rounded-full overflow-hidden flex shadow-inner border border-black/5 dark:border-white/5">
              <div className="h-full bg-gradient-to-r from-indigo-500/80 to-indigo-500 transition-all duration-1000" style={{ width: `${vaultCapacityGb > 0 ? worldPercentage : Math.max(0, (totalWorldSize / Math.max(1, totalSpace)) * 100)}%` }} />
              <div className="h-full bg-gradient-to-r from-rose-500/80 to-rose-500 transition-all duration-1000" style={{ width: `${vaultCapacityGb > 0 ? enginePercentage : Math.max(0, (totalEngineSize / Math.max(1, totalSpace)) * 100)}%` }} />
            </div>
          </div>
        </div>

      </div>

      <div className="flex flex-col gap-10 pt-4">
        {backupList?.length > 0 ? (
          <>
            {worldBackups.length > 0 && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-[0.2em] flex items-center gap-4 border-b border-black/5 dark:border-white/5 pb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-sm">
                    <span className="text-indigo-500 text-[20px] material-symbols-outlined">{t("icon_public")}</span>
                  </div>
                  {t("section_world")}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {worldBackups.map(renderBackupCard)}
                </div>
              </div>
            )}

            {engineBackups.length > 0 && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-[0.2em] flex items-center gap-4 border-b border-black/5 dark:border-white/5 pb-4 mt-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shadow-sm">
                    <span className="text-rose-500 text-[20px] material-symbols-outlined">{t("icon_settings")}</span>
                  </div>
                  {t("section_engine")}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {engineBackups.map(renderBackupCard)}
                </div>
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

      <SidePanel
        isOpen={isSidePanelOpen}
        onClose={() => setIsSidePanelOpen(false)}
        title={t("tools_title")}
        subtitle={t("tools_subtitle")}
        icon="tune"
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
        <div className="flex flex-col gap-6">
          <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 shadow-lg relative overflow-hidden group/card">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="flex items-center gap-4 mb-6 relative z-10">
              <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-emerald-500">
                <span className="material-symbols-outlined !text-[20px]">{t("icon_verified_user")}</span>
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("target_patch")}</h3>
            </div>

            <div className="relative z-10">
              <div className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/10 rounded-2xl px-6 py-4 flex items-center justify-between shadow-inner">
                <span className="text-sm font-black tracking-widest text-[var(--text)] uppercase flex items-center gap-3">
                  <span className="material-symbols-outlined !text-[18px] text-emerald-500">{t("icon_verified_user")}</span>
                  {selectedVersion || "Latest"}
                </span>
              </div>
            </div>
          </div>

          <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 shadow-lg relative overflow-hidden group/card">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="flex items-center gap-4 mb-6 relative z-10">
              <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[20px]">{t("icon_bolt")}</span>
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("sidebar_actions")}</h3>
            </div>

            <div className="relative z-10 flex flex-col gap-3">
              {!confirmSealWorld ? (
                <SidebarActionButton
                  icon="globe"
                  customColorClass="text-indigo-500 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.25)]"
                  label={t("btn_seal_state")}
                  onClick={() => setConfirmSealWorld(true)}
                />
              ) : (
                <div className="flex gap-2 h-16">
                  <button onClick={() => { triggerPrePatchSnapshot && triggerPrePatchSnapshot(true); setIsSidePanelOpen(false); setConfirmSealWorld(false); }} className="flex-[2] h-full rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 border border-indigo-500/30 font-black text-[10px] tracking-widest flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined !text-sm">{t("icon_check_circle")}</span> {t("ui_btn_confirm")}
                  </button>
                  <button onClick={() => setConfirmSealWorld(false)} className="flex-[1] h-full rounded-2xl bg-white/5 hover:bg-white/10 text-[var(--subtext)] hover:text-[var(--text)] border border-white/10 font-black text-[10px] tracking-widest flex items-center justify-center">
                    {t("shared_cancel")}
                  </button>
                </div>
              )}

              {!confirmSealEngine ? (
                <SidebarActionButton
                  id="SEAL_ENGINE"
                  icon="settings"
                  customColorClass="text-rose-500 border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 hover:border-rose-500/50 hover:shadow-[0_0_20px_rgba(244,63,94,0.25)]"
                  label={t("btn_seal_engine")}
                  onClick={() => setConfirmSealEngine(true)}
                />
              ) : (
                <div className="flex gap-2 h-16">
                  <button onClick={() => { triggerFullEngineBackup && triggerFullEngineBackup(); setIsSidePanelOpen(false); setConfirmSealEngine(false); }} className="flex-[2] h-full rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 font-black text-[10px] tracking-widest flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined !text-sm">{t("icon_warning_amber")}</span> {t("ui_btn_confirm")}
                  </button>
                  <button onClick={() => setConfirmSealEngine(false)} className="flex-[1] h-full rounded-2xl bg-white/5 hover:bg-white/10 text-[var(--subtext)] hover:text-[var(--text)] border border-white/10 font-black text-[10px] tracking-widest flex items-center justify-center">
                    {t("shared_cancel")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
