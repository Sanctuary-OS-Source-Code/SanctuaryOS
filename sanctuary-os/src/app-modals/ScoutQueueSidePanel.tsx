import { invoke } from "@tauri-apps/api/core";
import { SidePanel, EmptyState } from "../shared";
import { useLexicon } from "../LexiconContext";
import { standardAccentGlassButtonClass, standardDangerButtonClass } from "../shared";
import { useStore } from "../store";

export function ScoutQueueSidePanel({
  scoutQueue,
  setScoutQueue,
  onOpenScoutDossier
}: any) {
  const { t } = useLexicon();
  const session = useStore(state => state.session);
  const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";

  return (
    <SidePanel
      isOpen={scoutQueue && scoutQueue.length > 0}
      onClose={() => setScoutQueue([])}
      backdropZ="z-[99998]"
      panelZ="z-[99999]"
      title={t("queue_title")}
      subtitle={t("queue_desc")}
      icon={t("icon_track_changes")}
      widthClass="w-[550px]"
    >
      {(!session || isBanned) ? (
        <EmptyState 
          icon="block"
          title={isBanned ? t("alert_comm_banned") : t("alert_guest_mode_uploads")}
          subtitle={isBanned ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {scoutQueue && scoutQueue.map((mod: any, index: number) => (
          <div key={index} className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl p-5 flex flex-col gap-4 shadow-inner text-left hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all">
             <div className="flex flex-col gap-1">
               <span className="text-[9px] font-black theme-text-accent uppercase tracking-widest">{t("queue_target")}</span>
               <span className="text-xs font-black text-[var(--text)] truncate">{mod.displayName || mod.name}</span>
             </div>
             <div className="flex justify-center items-center gap-3 w-full mt-4">
               <button
                 onClick={() => {
                   onOpenScoutDossier(mod);
                   setScoutQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                 }}
                 className={standardAccentGlassButtonClass}
               >
                 <span className="material-symbols-outlined !text-[16px]">{t("icon_cloud_upload")}</span>
                 {t("queue_btn_upload")}
               </button>
               <button
                 onClick={async () => {
                   try {
                     const config: any = await invoke("get_saved_coordinates");
                     await invoke("mark_explicitly_local", { vaultPath: config.vault_path, filePath: mod.path || mod.name });
                     setScoutQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                   } catch (e) { console.error(e); }
                 }}
                 className={standardDangerButtonClass}
               >
                 <span className="material-symbols-outlined !text-[16px]">{t("icon_flag")}</span>
                 {t("queue_btn_flag")}
               </button>
             </div>
          </div>
        ))}
        </div>
      )}
    </SidePanel>
  );
}
