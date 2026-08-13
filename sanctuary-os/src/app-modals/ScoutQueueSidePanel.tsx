import { invoke } from "@tauri-apps/api/core";
import { SidePanel, EmptyState, ActionButton } from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";

export function ScoutQueueSidePanel({
  scoutQueue,
  setScoutQueue,
  onOpenScoutDossier
}: any) {
  const { t } = useLexicon();
  const session = useStore(state => state.session);
  const { isScoutPanelOpen, setIsScoutPanelOpen } = useModalStore();
  const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";

  return (
    <SidePanel
      isOpen={isScoutPanelOpen}
      onClose={() => setIsScoutPanelOpen(false)}
      backdropZ="z-[99998]"
      panelZ="z-[99999]"
      title={t("queue_title")}
      subtitle={t("queue_desc")}
      icon={t("icon_biotech")}
      widthClass="w-[575px]"
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
            <div key={index} className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl p-5 flex flex-col gap-4 shadow-inner text-left hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black theme-text-accent capitalize tracking-widest">{t("queue_target")}</span>
                <span className="text-xs font-black text-[var(--text)] truncate">{mod.displayName || mod.name}</span>
              </div>
              <div className="flex justify-center items-center gap-3 w-full mt-4">
                <ActionButton
                  onClick={() => {
                    onOpenScoutDossier(mod);
                    setScoutQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                  }}
                  icon={t("icon_cloud_upload")}
                  label={t("queue_btn_upload")}
                  variant="success"
                  className="flex-1"
                />
                <ActionButton
                  onClick={async () => {
                    try {
                      const config: any = await invoke("get_saved_coordinates");
                      await invoke("mark_explicitly_local", { vaultPath: config.vault_path, filePath: mod.path || mod.name });
                      setScoutQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                    } catch (e) { console.error(e); }
                  }}
                  icon={t("icon_flag")}
                  label={t("queue_btn_flag")}
                  variant="accent"
                  className="flex-1"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </SidePanel>
  );
}
