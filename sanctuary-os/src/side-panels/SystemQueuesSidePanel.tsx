import { useState, useEffect } from "react";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  EmptyState,
  DashboardStatTile,
  ActionButton,
  VAULT_CHIP_CLASS,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { isDesktop } from "../utils/envUtils";
import { navigateToBlueprintsTab } from "../components/BlueprintPatchReadiness";

export interface IgnoredSystemCardEntry {
  tokens?: string[];
  maxCount?: number;
  ignoredAt?: number;
}

const IGNORED_SYSTEM_CARDS_EVENT = "sanctuary-ignored-system-cards-changed";

function getIgnoredSystemCardsKey(workspaceId?: string | null): string {
  const scope = String(workspaceId || "default")
    .trim()
    .toLowerCase();
  return `sanctuary_ignored_system_cards_${scope || "default"}`;
}

export function extractQueueTokens(
  items: any[] | null | undefined,
  prefix = ""
): string[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const out: string[] = [];
  const limit = Math.min(items.length, 400);
  for (let i = 0; i < limit; i++) {
    const it = items[i];
    const raw =
      typeof it === "string"
        ? it
        : it?.hash ||
        it?.file_hash ||
        it?.localHash ||
        it?.id ||
        it?.payload?.handshakeCode ||
        it?.name ||
        it?.fileName ||
        it?.path ||
        it?.blueprint_name ||
        it?.created_at ||
        String(i);
    const short = String(raw || i)
      .trim()
      .toLowerCase()
      .slice(0, 24);
    out.push(prefix ? `${prefix}:${short}` : short);
  }
  return out;
}

export function readIgnoredSystemCards(
  workspaceId?: string | null
): Record<string, IgnoredSystemCardEntry> {
  try {
    const raw = localStorage.getItem(getIgnoredSystemCardsKey(workspaceId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function isSystemCardIgnored(
  entry: IgnoredSystemCardEntry | undefined,
  tokens?: string[],
  count?: number
): boolean {
  if (!entry) return false;
  if (Array.isArray(tokens) && tokens.length > 0) {
    if (!Array.isArray(entry.tokens) || entry.tokens.length === 0) return false;
    const known = new Set(entry.tokens);
    return tokens.every((tok) => known.has(tok));
  }
  if (typeof count === "number") {
    return (
      count > 0 &&
      typeof entry.maxCount === "number" &&
      count <= entry.maxCount
    );
  }
  return false;
}

export function ignoreSystemCard(
  workspaceId: string | null | undefined,
  cardId: string,
  opts: { tokens?: string[]; count?: number }
) {
  try {
    const current = readIgnoredSystemCards(workspaceId);
    current[cardId] = {
      tokens:
        Array.isArray(opts.tokens) && opts.tokens.length > 0
          ? Array.from(new Set(opts.tokens))
          : undefined,
      maxCount: typeof opts.count === "number" ? opts.count : undefined,
      ignoredAt: Date.now(),
    };
    localStorage.setItem(
      getIgnoredSystemCardsKey(workspaceId),
      JSON.stringify(current)
    );
    window.dispatchEvent(new CustomEvent(IGNORED_SYSTEM_CARDS_EVENT));
  } catch {
    // Ignore storage errors
  }
}

export function restoreIgnoredSystemCard(
  workspaceId: string | null | undefined,
  cardId?: string
) {
  try {
    if (!cardId) {
      localStorage.removeItem(getIgnoredSystemCardsKey(workspaceId));
    } else {
      const current = readIgnoredSystemCards(workspaceId);
      if (!(cardId in current)) return;
      delete current[cardId];
      localStorage.setItem(
        getIgnoredSystemCardsKey(workspaceId),
        JSON.stringify(current)
      );
    }
    window.dispatchEvent(new CustomEvent(IGNORED_SYSTEM_CARDS_EVENT));
  } catch {
    // Ignore storage errors
  }
}

export function useIgnoredSystemCards(workspaceId?: string | null) {
  const [ignoredMap, setIgnoredMap] = useState<
    Record<string, IgnoredSystemCardEntry>
  >(() => readIgnoredSystemCards(workspaceId));

  useEffect(() => {
    const sync = () => setIgnoredMap(readIgnoredSystemCards(workspaceId));
    sync();
    window.addEventListener(IGNORED_SYSTEM_CARDS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(IGNORED_SYSTEM_CARDS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [workspaceId]);

  return ignoredMap;
}

export function SystemQueuesSidePanel({
  isOpen,
  onClose,
  onTriggerShelter,
}: {
  isOpen: boolean;
  onClose: () => void;
  onTriggerShelter?: (enable: boolean) => void;
}) {
  const { t } = useLexicon();

  const setView = useStore((state) => state.setView);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const shelterActive = useStore((state) => state.shelterActive);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const patchFireDrillEnabled = useStore((state) => state.patchFireDrillEnabled);
  const selectedVersion = useStore((state) => state.selectedVersion);
  const defconLevel = useStore((state) => state.defconLevel);
  const isPatchDetected = useStore((state) => state.isPatchDetected);
  const nexusUpdatesCount = useStore((state) => state.nexusUpdatesCount);
  const activeConflictCount =
    useStore((state) => state.activeConflictCount) || { tier4: 0, tier3: 0 };
  const activeBrokenCounts =
    useStore((state) => state.activeBrokenCounts) || { broken: 0, unstable: 0 };
  const ignoredMap = useIgnoredSystemCards(activeWorkspaceId);

  const {
    updatePayload,
    setIsUpdatePanelOpen,
    showDefconAlert,
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
    pendingPasskeyHandshakes,
    setIsPasskeyHandshakePanelOpen,
  } = useModalStore(
    useShallow((s) => ({
      updatePayload: s.updatePayload,
      setIsUpdatePanelOpen: s.setIsUpdatePanelOpen,
      showDefconAlert: s.showDefconAlert,
      volatileSignatureQueue: s.volatileSignatureQueue,
      setVolatileSignatureQueue: s.setVolatileSignatureQueue,
      setActiveSignatureQueueIndex: s.setActiveSignatureQueueIndex,
      setIsSignatureQueueOpen: s.setIsSignatureQueueOpen,
      stagingDraftItems: s.stagingDraftItems,
      scoutQueue: s.scoutQueue,
      setIsScoutPanelOpen: s.setIsScoutPanelOpen,
      setIsNexusUpdatesPanelOpen: s.setIsNexusUpdatesPanelOpen,
      setIsConflictRadarOpen: s.setIsConflictRadarOpen,
      setIsBlueprintSwapOpen: s.setIsBlueprintSwapOpen,
      setIsSystemStatusOpen: s.setIsSystemStatusOpen,
      setIsLogExpanded: s.setIsLogExpanded,
      useInternalBrowser: s.useInternalBrowser,
      setIsSideBrowserOpen: s.setIsSideBrowserOpen,
      pendingPasskeyHandshakes: s.pendingPasskeyHandshakes,
      setIsPasskeyHandshakePanelOpen: s.setIsPasskeyHandshakePanelOpen,
    }))
  );

  const schemaFeatures = activeGameSchema?.features || {
    has_cc: true,
    has_saves: true,
  };
  const hasCcSupport = schemaFeatures.has_cc !== false;
  const hasSavesSupport = schemaFeatures.has_saves !== false;
  const isDefconActive = Boolean(
    isPatchDetected ||
    showDefconAlert ||
    (typeof defconLevel === "number" && defconLevel > 0 && defconLevel < 5)
  );
  const volatileSignatureQueues = useModalStore((state) => state.volatileSignatureQueues);
  const stagingDraftRemovedItems = useModalStore((state) => state.stagingDraftRemovedItems);
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
  const hasAppUpdate = isDesktop() && Boolean(updatePayload);
  const passkeyHandshakeCount = Array.isArray(pendingPasskeyHandshakes)
    ? pendingPasskeyHandshakes.length
    : 0;

  const isVaultLockdownActive = isDesktop() && hasCcSupport && Boolean(shelterActive);

  const totalQueueItems =
    (isDefconActive ? 1 : 0) +
    (isVaultLockdownActive ? 1 : 0) +
    passkeyHandshakeCount +
    (hasAppUpdate ? 1 : 0) +
    blueprintQueueCount +
    nexusCount +
    scoutCount;

  const heroVariant: "danger" | "warning" | "success" | "accent" =
    isDefconActive || isVaultLockdownActive
      ? "danger"
      : passkeyHandshakeCount > 0
        ? "warning"
        : hasAppUpdate || blueprintQueueCount > 0
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
    isIgnored?: boolean;
    onClick: () => void;
  }[] = [];

  if (isDefconActive) {
    const isNetworkLockdown =
      typeof defconLevel === "number" && defconLevel > 0 && defconLevel < 5;
    const tokens = [
      `defcon:${isNetworkLockdown ? `lvl_${defconLevel}` : "patch"}:${selectedVersion || "active"}`,
    ];
    activeQueues.push({
      id: "defcon",
      icon: t("icon_gpp_maybe", "gpp_maybe"),
      statusColor: "danger",
      title: isNetworkLockdown
        ? t("defcon_active", "Defcon 1 Active")
        : t("defcon_lockdown_cursor_tooltip", "Emergency Patch Alert Active"),
      subtitle: isNetworkLockdown
        ? t("defcon_val_locked", "Locked (DEFCON 1)")
        : t("defcon_patch_detected", "Patch Detected"),
      description: t(
        "defcon_queue_card_desc",
        "A game patch or network safety alert is active. Verify {Backups} and {Blueprint} readiness before launching."
      ),
      badgeLabel: isNetworkLockdown
        ? t("defcon_status_locked_badge", "Lockdown Active")
        : t("defcon_patch_detected", "Patch Detected"),
      badgeIcon: t("icon_gpp_maybe", "gpp_maybe"),
      badgeColorClass: "text-[var(--danger)]",
      isIgnored: isSystemCardIgnored(ignoredMap.defcon, tokens),
      onClick: () => {
        onClose();
        if (isDesktop() && hasSavesSupport && setView) {
          setView("backups");
        } else if (hasCcSupport && patchFireDrillEnabled) {
          navigateToBlueprintsTab("READINESS", { setView });
        } else {
          setIsSystemStatusOpen(true);
        }
      },
    });
  }

  if (isVaultLockdownActive) {
    const tokens = ["shelter:active"];
    activeQueues.push({
      id: "vault_lockdown",
      icon: t("icon_lock", "lock"),
      statusColor: "danger",
      title: t("btn_lockdown", "Lockdown {Vault}").replace(/^[^\w]*/, "").trim(),
      subtitle: t("active", "Active"),
      description: t(
        "cmd_lockdown_active_desc",
        "Your {Vault} is currently air-gapped to protect {mods} during a game patch. Click to reclaim."
      ),
      badgeLabel: t("active", "Active"),
      badgeIcon: t("icon_shield_lock", "shield_lock"),
      badgeColorClass: "text-[var(--danger)]",
      isIgnored: isSystemCardIgnored(ignoredMap.vault_lockdown, tokens),
      onClick: () => {
        onClose();
        if (onTriggerShelter) {
          onTriggerShelter(false);
        } else if (setView) {
          setView("dashboard");
        }
      },
    });
  }

  if (passkeyHandshakeCount > 0 && pendingPasskeyHandshakes[0]?.payload) {
    const activeReq = pendingPasskeyHandshakes[0];
    const tokens = extractQueueTokens(pendingPasskeyHandshakes, "pk");
    activeQueues.push({
      id: "passkey_handshake",
      icon: t("icon_phonelink_lock", "phonelink_lock"),
      statusColor: "warning",
      title: t(
        "passkey_handshake_approve_banner_title",
        "Approve Rig Passkey Handshake"
      ),
      subtitle: `${activeReq.payload.requestingDevice} • ${activeReq.payload.targetScope}`,
      description: t(
        "passkey_handshake_approve_banner_desc",
        "Confirm the 6-digit code shown on your other rig and authenticate with your FIDO2 Passkey right now to authorize elevated access."
      ),
      badgeLabel: activeReq.payload.handshakeCode,
      badgeIcon: t("icon_passkey", "passkey"),
      badgeColorClass: "text-[var(--warning)]",
      isIgnored: isSystemCardIgnored(ignoredMap.passkey_handshake, tokens),
      onClick: () => {
        setIsPasskeyHandshakePanelOpen(true);
      },
    });
  }

  if (hasAppUpdate) {
    const rawVer = String(updatePayload?.version || "")
      .replace(/^v/i, "")
      .trim();
    const isDev = Boolean(updatePayload?.isDevChannel || /dev/i.test(rawVer));
    const tokens = [`ver:${rawVer || "latest"}`];
    activeQueues.push({
      id: "os_update",
      icon: t("icon_system_update_alt", "system_update_alt"),
      statusColor: "success",
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
      badgeColorClass: "text-[var(--success)]",
      isIgnored: isSystemCardIgnored(ignoredMap.os_update, tokens),
      onClick: () => {
        setIsUpdatePanelOpen(true);
      },
    });
  }

  if (blueprintQueueCount > 0) {
    const sigTokens = [
      ...extractQueueTokens(
        Array.isArray(volatileSignatureQueues) && volatileSignatureQueues.length > 0
          ? volatileSignatureQueues
          : volatileSignatureQueue
            ? [volatileSignatureQueue]
            : [],
        "sig"
      ),
      ...(hasStagingDraft ? ["sig:local_draft"] : []),
    ];
    activeQueues.push({
      id: "signature_queue",
      icon: t("icon_phonelink_ring", "phonelink_ring"),
      statusColor: "success",
      title: t("sig_queue_title", "Signature Queue"),
      subtitle: `${blueprintQueueCount} ${t("playsets_title", "{Blueprints}")}`,
      description: t(
        "sig_queue_subtitle",
        "Volatile In-Memory Resolution • Awaiting {Citizen}'s Signature"
      ),
      badgeLabel: `${blueprintQueueCount}`,
      badgeIcon: t("icon_draw", "draw"),
      badgeColorClass: "text-[var(--success)]",
      isIgnored: isSystemCardIgnored(ignoredMap.signature_queue, sigTokens),
      onClick: () => {
        if (sigQueueCount > 0) {
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
      isIgnored: isSystemCardIgnored(
        ignoredMap.nexus_updates,
        undefined,
        nexusCount
      ),
      onClick: () => {
        setIsNexusUpdatesPanelOpen(true);
      },
    });
  }

  if (scoutCount > 0) {
    const tokens = extractQueueTokens(scoutQueue, "scout");
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
      isIgnored: isSystemCardIgnored(ignoredMap.scout_queue, tokens),
      onClick: () => {
        setIsScoutPanelOpen(true);
      },
    });
  }

  const ignoredQueueCount = activeQueues.filter((q) => q.isIgnored).length;

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
            isDefconActive
              ? t("icon_gpp_maybe", "gpp_maybe")
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
        >
          {ignoredQueueCount > 0 && (
            <div className="flex items-center justify-end w-full">
              <ActionButton
                variant="glass"
                icon={t("icon_visibility", "visibility")}
                label={`${t("btn_restore", "Restore")} (${ignoredQueueCount})`}
                onClick={() => restoreIgnoredSystemCard(activeWorkspaceId)}
              />
            </div>
          )}
        </SidePanelHeroCard>

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
                    <div className="absolute top-3 inset-x-3 z-20 flex items-center gap-1.5">
                      <span className={VAULT_CHIP_CLASS}>
                        <span
                          className={`material-symbols-rounded !text-[12px] shrink-0 ${q.isIgnored ? "text-[var(--subtext)]" : q.badgeColorClass
                            }`}
                        >
                          {q.isIgnored ? t("icon_visibility_off", "visibility_off") : q.badgeIcon}
                        </span>
                        <span>{q.isIgnored ? t("ignored", "Ignored") : q.badgeLabel}</span>
                      </span>
                    </div>
                  }
                  footer={
                    q.isIgnored ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-end w-full"
                      >
                        <ActionButton
                          variant="glass"
                          icon={t("icon_visibility", "visibility")}
                          label={t("btn_restore", "Restore")}
                          onClick={() => {
                            restoreIgnoredSystemCard(activeWorkspaceId, q.id);
                            if (q.id === "cloud_sync_detected") {
                              restoreIgnoredSystemCard(activeWorkspaceId, "cloud_sync_guard");
                            }
                          }}
                          className="!px-3.5 !py-2"
                        />
                      </div>
                    ) : undefined
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
              icon={t("icon_devices", "devices")}
              label={t("sig_queue_title", "Signature Queue")}
              value={
                blueprintQueueCount > 0
                  ? `${blueprintQueueCount} ${t("playsets_title", "{Blueprints}")}`
                  : t("blueprint_tab_pipeline", "Personal Rig Pipeline")
              }
              colorClass={
                blueprintQueueCount > 0 ? "text-[var(--success)]" : undefined
              }
              onClick={() => {
                setIsSignatureQueueOpen(true);
              }}
            />

            <DashboardStatTile
              variant="filter"
              icon={t("icon_memory", "memory")}
              label={t("sys_telemetry_title", "System Telemetry")}
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

            {isDesktop() && (
              <DashboardStatTile
                variant="filter"
                icon={t("icon_public", "public")}
                label={t("sidebar_web_browser", "Sanctuary Browser")}
                value={
                  useInternalBrowser
                    ? t("active", "Active")
                    : t("open", "Open")
                }
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
