import { invoke } from "@tauri-apps/api/core";
import {
  SidePanel,
  EmptyState,
  SidePanelHeroCard,
  UniversalGroup,
  HoverTooltip,
  cleanSearchName,
  getModIcon,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { LabVerificationBadge } from "../components/LabVerificationGate";
import { formatCleanModTitle } from "../side-panels/CommandIncompatiblePanel";

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
      subtitle={t("queue_desc", "Unidentified {mods} detected.")}
      icon={t("icon_biotech", "biotech")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_biotech", "biotech")}
          overline={t("queue_title", "Scout Verification Queue")}
          title={`${queueItems.length} ${t("queue_target", "{Mod} Targets")}`}
          description={t("queue_desc", "Unidentified {mods} detected.")}
          badge={
            requireScoutLabTest
              ? t("action_required", "Required")
              : t("status_stable", "Optional")
          }
          badgeIcon={t("icon_verified_user", "verified_user")}
          variant={!session || isBanned ? "danger" : "accent"}
        />

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {queueItems.map((mod: any, index: number) => {
                const rawFileName =
                  String(mod.name || mod.path || "")
                    .split(/[\\/]/)
                    .pop() || "";
                const rawTitle =
                  cleanSearchName(
                    mod.displayName || rawFileName || mod.name,
                    activeGameSchema
                  ) ||
                  rawFileName ||
                  mod.name;
                const cleanTitle = formatCleanModTitle(rawTitle) || rawTitle;
                const extMatch = rawFileName.match(/\.[^.]+$/);
                const extLabel = extMatch
                  ? extMatch[0].toUpperCase()
                  : t("term_mod", "{Mod}");
                const modIcon = getModIcon(mod, activeGameSchema, t);

                const handleUploadDossier = () => {
                  onOpenScoutDossier(mod);
                  setScoutQueue((prev: any[]) =>
                    prev.filter((_: any, i: number) => i !== index)
                  );
                };

                const handleMarkLocal = async () => {
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
                };

                return (
                  <div
                    key={`${mod.hash || mod.name || index}-${index}`}
                    onClick={handleUploadDossier}
                    className="w-full glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] flex flex-col justify-between gap-3 text-left transition-all cursor-pointer group"
                  >
                    {/* Top Row: Full-Width Icon + Title + Filename Identity */}
                    <div className="flex items-center gap-3 min-w-0 w-full">
                      <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[20px]">
                          {modIcon}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="relative group/scouttitle flex items-center min-w-0 w-fit max-w-full">
                          <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
                            {cleanTitle}
                          </span>
                          <HoverTooltip
                            className="z-[200]"
                            title={cleanTitle}
                            icon={modIcon}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                          <span className="opacity-85 shrink-0">{extLabel}</span>
                          {rawFileName && (
                            <>
                              <span className="opacity-40 shrink-0">•</span>
                              <span className="font-mono text-[10px] truncate opacity-80">
                                {rawFileName}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Footer Row: Lab Verification Badge on Left | Actions on Right */}
                    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <LabVerificationBadge
                          dnaHash={mod.hash}
                          required={requireScoutLabTest}
                          compact
                        />
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkLocal();
                          }}
                          className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--text)] hover:text-[var(--warning)] flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 group/btn relative"
                        >
                          <span className="material-symbols-outlined !text-[13px] text-[var(--warning)]">
                            {t("icon_flag", "flag")}
                          </span>
                          <span>{t("queue_btn_flag", "Mark Local")}</span>
                          <HoverTooltip
                            title={t("queue_btn_flag", "Mark Local")}
                            variant="warning"
                            className="group-hover/btn:flex z-[200] !right-0 !translate-x-0 !left-auto"
                          />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUploadDossier();
                          }}
                          className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0 group/btn relative"
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_cloud_upload", "cloud_upload")}
                          </span>
                          <HoverTooltip
                            title={t("queue_btn_upload", "Upload Dossier")}
                            variant="accent"
                            className="group-hover/btn:flex z-[200] !right-0 !translate-x-0 !left-auto"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
