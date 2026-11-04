import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  EmptyState,
  DashboardStatTile,
  VAULT_CHIP_CLASS,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { isDesktop } from "../utils/envUtils";

export function SystemQueuesSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();

  const setView = useStore((state) => state.setView);
  const quarantineList = useStore((state) => state.quarantineList);
  const nexusUpdatesCount = useStore((state) => state.nexusUpdatesCount);
  const activeConflictCount =
    useStore((state) => state.activeConflictCount) || { tier4: 0, tier3: 0 };
  const activeBrokenCounts =
    useStore((state) => state.activeBrokenCounts) || { broken: 0, unstable: 0 };

  const {
    updatePayload,
    setIsUpdatePanelOpen,
    dnaMatchQueue,
    setIsDnaModalOpen,
    volatileSignatureQueue,
    setVolatileSignatureQueue,
    setActiveSignatureQueueIndex,
    setIsSignatureQueueOpen,
    stagingDraftItems,
    scoutQueue,
    setIsScoutPanelOpen,
    setIsNexusUpdatesPanelOpen,
    setIsConflictRadarOpen,
    setIsBlueprintSwapOpen,
    setIsSystemStatusOpen,
    setIsLogExpanded,
    useInternalBrowser,
    setIsSideBrowserOpen,
  } = useModalStore();

  const quarantineCount = Array.isArray(quarantineList)
    ? quarantineList.length
    : 0;
  const dnaCount = Array.isArray(dnaMatchQueue) ? dnaMatchQueue.length : 0;
  const volatileSignatureQueues = useModalStore((state) => state.volatileSignatureQueues);
  const stagingDraftRemovedItems = useModalStore((state) => state.stagingDraftRemovedItems);
  const totalCloudQueues =
    Array.isArray(volatileSignatureQueues) && volatileSignatureQueues.length > 0
      ? volatileSignatureQueues.length
      : volatileSignatureQueue
        ? 1
        : 0;
  const sigQueueCount =
    Array.isArray(volatileSignatureQueues) && volatileSignatureQueues.length > 0
      ? volatileSignatureQueues.filter((q: any) => !q?.isCompletedLocally).length
      : volatileSignatureQueue && !(volatileSignatureQueue as any)?.isCompletedLocally
        ? 1
        : 0;
  const hasStagingDraft =
    (Array.isArray(stagingDraftItems) &&
      stagingDraftItems.length > 0 &&
      stagingDraftItems.length <= 200) ||
    (Array.isArray(stagingDraftRemovedItems) &&
      stagingDraftRemovedItems.length > 0);
  const blueprintQueueCount = sigQueueCount + (hasStagingDraft ? 1 : 0);
  const scoutCount = Array.isArray(scoutQueue) ? scoutQueue.length : 0;
  const nexusCount = nexusUpdatesCount || 0;
  const hasAppUpdate = Boolean(updatePayload);

  const totalQueueItems =
    quarantineCount +
    dnaCount +
    blueprintQueueCount +
    scoutCount +
    nexusCount +
    (hasAppUpdate ? 1 : 0);

  const heroVariant: "danger" | "warning" | "success" | "accent" =
    quarantineCount > 0
      ? "danger"
      : dnaCount > 0
        ? "warning"
        : blueprintQueueCount > 0 &&
            scoutCount === 0 &&
            nexusCount === 0 &&
            !hasAppUpdate
          ? "success"
          : "accent";

  const activeQueues: {
    id: string;
    icon: string;
    statusColor?: string;
    title: string;
    subtitle: string;
    description: string;
    badgeLabel: string;
    badgeIcon: string;
    badgeColorClass: string;
    onClick: () => void;
  }[] = [];

  if (hasAppUpdate) {
    const rawVer = String(updatePayload?.version || "")
      .replace(/^v/i, "")
      .trim();
    const isDev = Boolean(updatePayload?.isDevChannel || /dev/i.test(rawVer));
    activeQueues.push({
      id: "os_update",
      icon: t("icon_system_update_alt", "system_update_alt"),
      statusColor: "accent",
      title: isDev
        ? t("sys_stat_dev_update_available", "Dev Build Available")
        : t("card_update_available", "Update Available"),
      subtitle: rawVer
        ? `v${rawVer}`
        : t("updates_ready", "Updates Ready"),
      description: t(
        "sys_stat_click_to_update",
        "Click to view release notes and install update"
      ),
      badgeLabel: t("updates_ready", "Updates Ready"),
      badgeIcon: t("icon_download", "download"),
      badgeColorClass: "text-[var(--accent)]",
      onClick: () => {
        setIsUpdatePanelOpen(true);
      },
    });
  }

  if (quarantineCount > 0) {
    activeQueues.push({
      id: "quarantine",
      icon: t("icon_warning_amber", "warning_amber"),
      statusColor: "danger",
      title: t("malware_alert_title", "Malware Detected"),
      subtitle: `${quarantineCount} ${t("status_quarantined", "Quarantined")}`,
      description: t(
        "malware_and_manifests_subtitle",
        "Active malware quarantine, Spoke & Core heuristics, and incoming Threat Manifests."
      ),
      badgeLabel: `${quarantineCount}`,
      badgeIcon: t("icon_gpp_bad", "gpp_bad"),
      badgeColorClass: "text-[var(--danger)]",
      onClick: () => {
        setView("vault");
      },
    });
  }

  if (dnaCount > 0) {
    activeQueues.push({
      id: "dna_match",
      icon: t("icon_difference", "difference"),
      statusColor: "warning",
      title: t("overlay_dna_match_title", "DNA Match & Collision Queue"),
      subtitle: `${dnaCount} ${t("term_mods", "{Mods}")}`,
      description: t(
        "overlay_dna_match_desc",
        "Resolve duplicate artifacts, settings collisions, and Edge overrides."
      ),
      badgeLabel: `${dnaCount}`,
      badgeIcon: t("icon_difference", "difference"),
      badgeColorClass: "text-[var(--warning)]",
      onClick: () => {
        setIsDnaModalOpen(true);
      },
    });
  }

  if (blueprintQueueCount > 0 || totalCloudQueues > 0) {
    const isAllCompletedLocally = blueprintQueueCount === 0 && totalCloudQueues > 0;
    activeQueues.push({
      id: "signature_queue",
      icon: t("icon_phonelink_ring", "phonelink_ring"),
      statusColor: isAllCompletedLocally ? "accent" : "success",
      title: t("sig_queue_title", "Signature Queue"),
      subtitle: isAllCompletedLocally
        ? t("sig_queue_badge_completed_local", "Completed Here • Pending on Other Systems")
        : `${blueprintQueueCount} ${t("playsets_title", "{Blueprints}")}`,
      description: t(
        "sig_queue_subtitle",
        "Volatile In-Memory Resolution • Awaiting {Citizen}'s Signature"
      ),
      badgeLabel: isAllCompletedLocally
        ? t("sig_queue_badge_completed_short", "Completed on Rig")
        : `${blueprintQueueCount}`,
      badgeIcon: isAllCompletedLocally
        ? t("icon_task_alt", "task_alt")
        : t("icon_draw", "draw"),
      badgeColorClass: isAllCompletedLocally
        ? "text-[var(--text-muted)]"
        : "text-[var(--success)]",
      onClick: () => {
        if (sigQueueCount > 0 || totalCloudQueues > 0) {
          if (Array.isArray(volatileSignatureQueues) && volatileSignatureQueues.length > 0) {
            const firstPendingIdx = volatileSignatureQueues.findIndex(
              (q: any) => !q?.isCompletedLocally
            );
            const targetIdx = firstPendingIdx >= 0 ? firstPendingIdx : 0;
            setActiveSignatureQueueIndex(targetIdx);
            setVolatileSignatureQueue(volatileSignatureQueues[targetIdx]);
          }
          setIsSignatureQueueOpen(true);
        } else {
          setIsBlueprintSwapOpen(true);
        }
      },
    });
  }

  if (nexusCount > 0) {
    activeQueues.push({
      id: "nexus_updates",
      icon: t("icon_cloud_download", "cloud_download"),
      statusColor: "accent",
      title: t("nexus_updates_title", "Nexus Updates"),
      subtitle: `${nexusCount} ${t("updates_ready", "Updates Ready")}`,
      description: t(
        "nexus_updates_subtitle",
        "Available updates for your installed Nexus assets."
      ),
      badgeLabel: `${nexusCount}`,
      badgeIcon: t("icon_new_releases", "new_releases"),
      badgeColorClass: "text-[var(--accent)]",
      onClick: () => {
        setIsNexusUpdatesPanelOpen(true);
      },
    });
  }

  if (scoutCount > 0) {
    activeQueues.push({
      id: "scout_queue",
      icon: t("icon_biotech", "biotech"),
      statusColor: "accent",
      title: t("queue_title", "Unidentified Files"),
      subtitle: `${scoutCount} ${t("term_mods", "{Mods}")}`,
      description: t("queue_desc", "Unidentified {mods} detected."),
      badgeLabel: `${scoutCount}`,
      badgeIcon: t("icon_biotech", "biotech"),
      badgeColorClass: "text-[var(--accent)]",
      onClick: () => {
        setIsScoutPanelOpen(true);
      },
    });
  }

  const tier4Count = activeConflictCount.tier4 || 0;
  const tier3Count = activeConflictCount.tier3 || 0;
  const brokenCount = activeBrokenCounts.broken || 0;
  const unstableCount = activeBrokenCounts.unstable || 0;
  const radarHasCritical = tier4Count > 0 || brokenCount > 0;
  const radarHasWarning = tier3Count > 0 || unstableCount > 0;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("system_queues_title", "System Queues & Updates")}
      subtitle={t(
        "system_queues_subtitle",
        "Pending updates, file verification queues, and quick system utilities."
      )}
      icon={t("icon_layers", "layers")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[92vw] md:w-[720px]"
      backdropZ="z-[15000]"
      panelZ="z-[15001]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={
            quarantineCount > 0
              ? t("icon_warning_amber", "warning_amber")
              : hasAppUpdate
                ? t("icon_system_update_alt", "system_update_alt")
                : t("icon_layers", "layers")
          }
          overline={t("system_queues_title", "System Queues & Updates")}
          title={
            totalQueueItems > 0
              ? `${totalQueueItems} ${t("system_queues_active_group", "Active Queues")}`
              : t("system_queues_empty_title", "All System Queues Clear")
          }
          description={t(
            "system_queues_subtitle",
            "Pending updates, file verification queues, and quick system utilities."
          )}
          badge={`${activeQueues.length}`}
          badgeIcon={t("icon_pending_actions", "pending_actions")}
          variant={heroVariant}
        />

        <UniversalGroup
          title={t("system_queues_active_group", "Active Queues")}
          icon={t("icon_pending_actions", "pending_actions")}
          count={activeQueues.length}
        >
          {activeQueues.length === 0 ? (
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={t("system_queues_empty_title", "All System Queues Clear")}
              subtitle={t(
                "system_queues_empty_sub",
                "No pending {mod} updates, signature queues, or verification tasks."
              )}
              minHeightClass="min-h-[160px]"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeQueues.map((q) => (
                <UniversalCard
                  key={q.id}
                  layout="vertical"
                  icon={q.icon}
                  statusColor={q.statusColor}
                  title={q.title}
                  subtitle={q.subtitle}
                  description={q.description}
                  imageOverlay={
                    <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
                      <span className={VAULT_CHIP_CLASS}>
                        <span
                          className={`material-symbols-rounded !text-[12px] shrink-0 ${q.badgeColorClass}`}
                        >
                          {q.badgeIcon}
                        </span>
                        <span>{q.badgeLabel}</span>
                      </span>
                    </div>
                  }
                  onClick={q.onClick}
                />
              ))}
            </div>
          )}
        </UniversalGroup>

        <UniversalGroup
          title={t("system_queues_utilities_group", "System Utilities")}
          icon={t("icon_build_circle", "build_circle")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isDesktop() && (
              <DashboardStatTile
                variant="filter"
                icon={t("icon_radar", "radar")}
                label={t("btn_radar", "Conflict Scan")}
                value={
                  radarHasCritical
                    ? t("status_critical", "Critical Alert")
                    : radarHasWarning
                      ? t("warning", "Warning")
                      : t("status_stable", "Stable")
                }
                colorClass={
                  radarHasCritical
                    ? "text-[var(--danger)]"
                    : radarHasWarning
                      ? "text-[var(--warning)]"
                      : "text-[var(--success)]"
                }
                onClick={() => {
                  setIsConflictRadarOpen(true);
                }}
              />
            )}

            <DashboardStatTile
              variant="filter"
              icon={t("icon_map", "map")}
              label={t("playsets_title", "{Blueprints}")}
              value={t("cmd_palette_activate_blueprint", "Activate {Blueprint}")}
              onClick={() => {
                setIsBlueprintSwapOpen(true);
              }}
            />

            <DashboardStatTile
              variant="filter"
              icon={t("icon_memory", "memory")}
              label={t("system_status", "System Status")}
              value={t("sys_panel_desc", "Hardware & Environment Telemetry")}
              onClick={() => {
                setIsSystemStatusOpen(true);
              }}
            />

            <DashboardStatTile
              variant="filter"
              icon={t("icon_terminal", "terminal")}
              label={t("sys_log_history", "System Log History")}
              value={t("audit_logs", "Audit Logs")}
              onClick={() => {
                setIsLogExpanded(true);
              }}
            />

            {useInternalBrowser && isDesktop() && (
              <DashboardStatTile
                variant="filter"
                icon={t("icon_public", "public")}
                label={t("sidebar_web_browser", "Sanctuary Browser")}
                value={t("active", "Active")}
                onClick={() => {
                  onClose();
                  setIsSideBrowserOpen(true);
                }}
              />
            )}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
