import { invoke } from "@tauri-apps/api/core";
import {
  SidePanel,
  EmptyState,
  ActionButton,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { LabVerificationBadge } from "../components/LabVerificationGate";

export function ScoutQueueSidePanel({
  scoutQueue,
  setScoutQueue,
  onOpenScoutDossier,
}: any) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const requireScoutLabTest =
    activeGameSchema?.lab_verification?.require_for_scout_approval !== false;
  const { isScoutPanelOpen, setIsScoutPanelOpen } = useModalStore();
  const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";

  const queueItems = Array.isArray(scoutQueue) ? scoutQueue : [];

  return (
    <SidePanel
      isOpen={isScoutPanelOpen}
      onClose={() => setIsScoutPanelOpen(false)}
      backdropZ="z-[99998]"
      panelZ="z-[99999]"
      title={t("queue_title", "Scout Verification Queue")}
      subtitle={t(
        "queue_desc",
        "Contribute unverified artifact telemetry to the Sanctuary Registry."
      )}
      icon={t("icon_biotech", "biotech")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_biotech", "biotech")}
          overline={t("queue_title", "Scout Verification Queue")}
          title={t(
            "queue_desc",
            "Contribute unverified artifact telemetry to the Sanctuary Registry."
          )}
          badge={`${queueItems.length} ${t("items", "Items")}`}
          badgeIcon={t("icon_biotech", "biotech")}
          variant={!session || isBanned ? "danger" : "accent"}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <StatBox
              label={t("queue_target", "Queued Artifacts")}
              value={queueItems.length}
              icon={t("icon_biotech", "biotech")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("status", "Lab Verification")}
              value={
                requireScoutLabTest
                  ? t("citizen_action_required", "Required")
                  : t("status_dd_stable", "Optional")
              }
              icon={t("icon_verified_user", "verified_user")}
              iconColorClass="text-[var(--success)]"
            />
          </div>
        </SidePanelHeroCard>

        {!session || isBanned ? (
          <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <EmptyState
              icon={t("icon_block", "block")}
              title={
                isBanned
                  ? t("alert_comm_banned", "Communications Restricted")
                  : t("alert_guest_mode_uploads", "Authentication Required")
              }
              subtitle={
                isBanned
                  ? t(
                      "alert_comm_banned_desc",
                      "Your account is restricted from submitting Scout telemetry."
                    )
                  : t(
                      "alert_guest_mode_desc",
                      "Sign in to submit unverified artifacts to the Sanctuary Registry."
                    )
              }
            />
          </div>
        ) : queueItems.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={t("queue_title", "Scout Queue Empty")}
            />
          </div>
        ) : (
          <UniversalGroup
            title={`${t("queue_title", "Scout Verification Queue")} (${queueItems.length})`}
            icon={t("icon_biotech", "biotech")}
          >
            <div className="flex flex-col gap-3">
              {queueItems.map((mod: any, index: number) => (
                <div
                  key={index}
                  className="w-full glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex flex-col gap-3.5 text-left transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[20px]">
                          {t("icon_biotech", "biotech")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <span className="self-start px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--accent)]">
                          {t("queue_target", "Scout Target")}
                        </span>
                        <span className="text-sm font-black text-[var(--text)] truncate">
                          {mod.displayName || mod.name}
                        </span>
                      </div>
                    </div>
                    <LabVerificationBadge dnaHash={mod.hash} required={requireScoutLabTest} />
                  </div>

                  <div className="flex items-center gap-2.5 w-full pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <ActionButton
                      onClick={() => {
                        onOpenScoutDossier(mod);
                        setScoutQueue((prev: any[]) =>
                          prev.filter((_: any, i: number) => i !== index)
                        );
                      }}
                      icon={t("icon_cloud_upload", "cloud_upload")}
                      label={t("queue_btn_upload", "Upload Dossier")}
                      variant="glass"
                      className="flex-1"
                    />
                    <ActionButton
                      onClick={async () => {
                        try {
                          const config: any = await invoke("get_saved_coordinates");
                          await invoke("mark_explicitly_local", {
                            vaultPath: config.vault_path,
                            filePath: mod.path || mod.name,
                          });
                          setScoutQueue((prev: any[]) =>
                            prev.filter((_: any, i: number) => i !== index)
                          );
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      icon={t("icon_flag", "flag")}
                      label={t("queue_btn_flag", "Mark Local")}
                      variant="glass"
                      className="flex-1"
                    />
                  </div>
                </div>
              ))}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
