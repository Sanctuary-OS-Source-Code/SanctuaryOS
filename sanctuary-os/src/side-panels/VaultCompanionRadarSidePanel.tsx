import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import {
  ActionPill,
  DashboardStatTile,
  EmptyState,
  SidePanel,
  cleanSearchName,
   getModIcon,
} from "../shared";
import { SidePanelHeroCard, UniversalGroup } from "../components/layouts/ElevatedHubLayout";
import {
  VaultCompanionSnapshot,
  resolvePayloadDependencies,
} from "../utils/stagingCrypto";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

function resolveKnownAuthor(mod: any, fallbackText: string): string {
  const explicit = String(mod?.master_author || mod?.author || "").trim();
  if (
    explicit &&
    explicit.toLowerCase() !== "unknown" &&
    explicit.toLowerCase() !== "unknown creator" &&
    explicit.toLowerCase() !== "unknown cc creator" &&
    explicit.toLowerCase() !== "unknown mason"
  ) {
    return explicit;
  }
  const n = String(mod?.name || mod?.displayName || "").toLowerCase();
  if (n.includes("mc command") || n.startsWith("mc ") || n.startsWith("mc_") || n.includes("mccc"))
    return "Deaderpool";
  if (n.includes("wickedwhims") || n.includes("wonderfulwhims") || n.startsWith("ww_"))
    return "TURBODRIVER";
  if (n.includes("ui cheats") || n.includes("ui_cheats")) return "weerbesu";
  if (n.includes("xml injector") || n.includes("xmlinjector")) return "Scumbumbo";
  if (n.includes("basemental")) return "Basemental";
  if (n.includes("lumpinou") || n.includes("rpo_") || n.includes("relationship & pregnancy"))
    return "Lumpinou";
  if (n.includes("littlemssam") || n.startsWith("lms_")) return "LittleMsSam";
  if (n.includes("twistedmexi") || n.includes("betterbuildbuy") || n.includes("tool mod"))
    return "TwistedMexi";
  if (n.includes("kawaiistacie")) return "KawaiiStacie";
  if (n.includes("adeepindigo")) return "adeepindigo";
  if (n.includes("kiarasims")) return "KiaraSims4Mods";
  if (n.includes("lot51") || n.includes("lot 51")) return "Lot 51";
  if (n.includes("pandasama")) return "PandaSama";
  return fallbackText;
}

export default function VaultCompanionRadarSidePanel({
  isOpen,
  onClose,
  snapshot,
  enrichedArtifacts,
  initialFilter = "ISSUES",
  onOpenDossier,
  onNavigateToBlueprints,
}: {
  isOpen: boolean;
  onClose: () => void;
  snapshot: VaultCompanionSnapshot | null;
  enrichedArtifacts: any[];
  initialFilter?: "ISSUES" | "CRITICAL" | "ALERTS" | "UPDATES" | "ALL";
  onOpenDossier?: (mod: any) => void;
  onNavigateToBlueprints?: () => void;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const {
    stagingDraftItems,
    setStagingDraftItems,
    stagingDraftRemovedItems,
    toggleModInStagingDraft,
    toggleRemoveModInStagingDraft,
    setStagingDraftMode,
    setStagingDraftName,
    setStagingTargetDesktopBlueprint,
  } = useModalStore();

  const [filterMode, setFilterMode] = useState<
    "ISSUES" | "CRITICAL" | "ALERTS" | "UPDATES" | "ALL"
  >(initialFilter);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(80);
  const [selectedBpScope, setSelectedBpScope] = useState<string>(() => {
    return localStorage.getItem("sanctuary_mod_alerts_bp_scope") || "ACTIVE";
  });
  const [equipFilter, setEquipFilter] = useState<"ALL" | "IN_BP" | "NOT_IN_BP">("ALL");

  useEffect(() => {
    if (isOpen) {
      setFilterMode(initialFilter);
      setSearchQuery("");
      setVisibleCount(80);
    }
  }, [isOpen, initialFilter]);

  const desktopBlueprints = useMemo(
    () => (Array.isArray(snapshot?.desktopBlueprints) ? snapshot!.desktopBlueprints! : []),
    [snapshot]
  );

  const resolvedTargetBp = useMemo(() => {
    if (desktopBlueprints.length === 0) return null;
    if (selectedBpScope && selectedBpScope !== "ACTIVE" && selectedBpScope !== "ALL_VAULT") {
      const found = desktopBlueprints.find(
        (b) => b.name.toLowerCase() === selectedBpScope.toLowerCase()
      );
      if (found) return found;
    }
    return (
      desktopBlueprints.find((b) => b.isActive) ||
      desktopBlueprints.find(
        (b) =>
          snapshot?.activeBlueprintName &&
          b.name.toLowerCase() === snapshot.activeBlueprintName.toLowerCase()
      ) ||
      desktopBlueprints[0] ||
      null
    );
  }, [desktopBlueprints, selectedBpScope, snapshot?.activeBlueprintName]);

  const targetBpName =
    resolvedTargetBp?.name ||
    snapshot?.activeBlueprintName ||
    t("staging_mode_blueprint", "Curated {Blueprint}");

  const targetBpModKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!resolvedTargetBp) return keys;
    const bpArts = Array.isArray(resolvedTargetBp.artifacts) ? resolvedTargetBp.artifacts : [];
    bpArts.forEach((a: any) => {
      if (a?.dbId) keys.add(`id:${String(a.dbId).toLowerCase()}`);
      if (a?.hash) keys.add(`hash:${String(a.hash).toLowerCase()}`);
      if (a?.name) keys.add(`name:${String(a.name).toLowerCase()}`);
      if (a?.displayName) keys.add(`name:${String(a.displayName).toLowerCase()}`);
    });
    return keys;
  }, [resolvedTargetBp]);

  const isArtifactInTargetBp = (art: any): boolean => {
    if (targetBpModKeys.size === 0) {
      return Boolean(art?.isEquipped ?? true);
    }
    const id = art?.dbId ? `id:${String(art.dbId).toLowerCase()}` : "";
    const hash = art?.hash ? `hash:${String(art.hash).toLowerCase()}` : "";
    const name = art?.name ? `name:${String(art.name).toLowerCase()}` : "";
    const display = art?.displayName ? `name:${String(art.displayName).toLowerCase()}` : "";
    return Boolean(
      (id && targetBpModKeys.has(id)) ||
        (hash && targetBpModKeys.has(hash)) ||
        (name && targetBpModKeys.has(name)) ||
        (display && targetBpModKeys.has(display))
    );
  };

  const rawCriticalItems = useMemo(() => {
    if (Array.isArray(snapshot?.criticalArtifacts)) {
      return snapshot!.criticalArtifacts!.map((a) => ({
        ...a,
        isBroken: true,
        alertType: "critical" as const,
        needsAttention: true,
      }));
    }
    const list = enrichedArtifacts.filter(
      (a) => a.alertType === "critical" || a.isBroken
    );
    return typeof snapshot?.criticalCount === "number"
      ? list.slice(0, snapshot.criticalCount)
      : list;
  }, [snapshot, enrichedArtifacts]);

  const rawAlertItems = useMemo(() => {
    if (Array.isArray(snapshot?.alertArtifacts)) {
      return snapshot!.alertArtifacts!.map((a) => ({
        ...a,
        isBroken: false,
        alertType: "alert" as const,
        needsAttention: true,
      }));
    }
    const list = enrichedArtifacts.filter(
      (a) =>
        a.alertType === "alert" ||
        (!a.isBroken &&
          String(a.status || "").toLowerCase().includes("unstable"))
    );
    return typeof snapshot?.alertsCount === "number"
      ? list.slice(0, snapshot.alertsCount)
      : list;
  }, [snapshot, enrichedArtifacts]);

  const rawUpdatesItems = useMemo(() => {
    if (Array.isArray(snapshot?.updateArtifacts)) {
      return snapshot!.updateArtifacts!.map((a) => ({
        ...a,
        hasUpdate: true,
        needsAttention: true,
      }));
    }
    const list = enrichedArtifacts.filter((a) => a.hasUpdate);
    return typeof snapshot?.updatesCount === "number"
      ? list.slice(0, snapshot.updatesCount)
      : list;
  }, [snapshot, enrichedArtifacts]);

  const filterByScope = (list: any[]) => {
    if (
      selectedBpScope === "ALL_VAULT" ||
      selectedBpScope === "ACTIVE" ||
      targetBpModKeys.size === 0
    ) {
      return list;
    }
    return list.filter((item) => isArtifactInTargetBp(item));
  };

  const criticalItems = useMemo(
    () => filterByScope(rawCriticalItems),
    [rawCriticalItems, selectedBpScope, targetBpModKeys]
  );
  const alertItems = useMemo(
    () => filterByScope(rawAlertItems),
    [rawAlertItems, selectedBpScope, targetBpModKeys]
  );
  const updatesItems = useMemo(
    () => filterByScope(rawUpdatesItems),
    [rawUpdatesItems, selectedBpScope, targetBpModKeys]
  );

  const issueItemsToYeet = useMemo(() => {
    const seen = new Set<string>();
    const combined: any[] = [];
    const source =
      filterMode === "CRITICAL"
        ? criticalItems
        : filterMode === "ALERTS"
          ? alertItems
          : [...criticalItems, ...alertItems];
    source.forEach((item) => {
      const k = String(item.dbId || item.hash || item.name || "").toLowerCase();
      if (k && !seen.has(k)) {
        seen.add(k);
        combined.push(item);
      }
    });
    return combined;
  }, [criticalItems, alertItems, filterMode]);

  const attentionItems = useMemo(() => {
    const seen = new Set<string>();
    const combined: any[] = [];
    [...criticalItems, ...alertItems, ...updatesItems].forEach((item) => {
      const k = String(item.dbId || item.hash || item.name || "").toLowerCase();
      if (k && !seen.has(k)) {
        seen.add(k);
        combined.push(item);
      }
    });
    return combined;
  }, [criticalItems, alertItems, updatesItems]);

  const isCustomBpScope =
    selectedBpScope !== "ALL_VAULT" &&
    selectedBpScope !== "ACTIVE" &&
    targetBpModKeys.size > 0;

  const displayVaultCount = snapshot?.vaultCount ?? enrichedArtifacts.length;
  const displayCriticalCount = isCustomBpScope
    ? criticalItems.length
    : (snapshot?.criticalCount ?? criticalItems.length);
  const displayAlertsCount = isCustomBpScope
    ? alertItems.length
    : (snapshot?.alertsCount ?? alertItems.length);
  const displayUpdatesCount = isCustomBpScope
    ? updatesItems.length
    : (snapshot?.updatesCount ?? updatesItems.length);

  const filteredItems = useMemo(() => {
    let base = enrichedArtifacts;
    if (filterMode === "CRITICAL") {
      base = criticalItems;
    } else if (filterMode === "ALERTS") {
      base = alertItems;
    } else if (filterMode === "UPDATES") {
      base = updatesItems;
    } else if (filterMode === "ISSUES") {
      base = attentionItems.length > 0 ? attentionItems : enrichedArtifacts;
    }
    if (equipFilter === "IN_BP") {
      base = base.filter((a) => isArtifactInTargetBp(a));
    } else if (equipFilter === "NOT_IN_BP") {
      base = base.filter((a) => !isArtifactInTargetBp(a));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(
        (a) =>
          String(a.displayName || a.name || "").toLowerCase().includes(q) ||
          String(a.author || "").toLowerCase().includes(q)
      );
    }
    return base;
  }, [
    enrichedArtifacts,
    criticalItems,
    alertItems,
    updatesItems,
    attentionItems,
    filterMode,
    equipFilter,
    targetBpModKeys,
    searchQuery,
  ]);

  const isSingleModStaged = (mod: any) => {
    const targetId = String(mod.id || mod.dbId || mod.hash || mod.name || "");
    const targetHash = String(mod.hash || "");
    const targetName = String(mod.name || mod.displayName || "").toLowerCase();
    return (stagingDraftItems || []).some(
      (item: any) =>
        (targetId && String(item.id) === targetId) ||
        (targetHash && item.hash && String(item.hash) === targetHash) ||
        (targetName && String(item.name || "").toLowerCase() === targetName)
    );
  };

  const isSingleModRemoved = (mod: any) => {
    const targetId = String(mod.id || mod.dbId || mod.hash || mod.name || "");
    const targetHash = String(mod.hash || "");
    const targetName = String(mod.name || mod.displayName || "").toLowerCase();
    return (stagingDraftRemovedItems || []).some(
      (item: any) =>
        (targetId && String(item.id) === targetId) ||
        (targetHash && item.hash && String(item.hash) === targetHash) ||
        (targetName && String(item.name || "").toLowerCase() === targetName)
    );
  };

  const handleYeetSingleMod = (art: any) => {
    setStagingDraftMode("blueprint");
    if (targetBpName) {
      setStagingDraftName(targetBpName);
      setStagingTargetDesktopBlueprint(targetBpName);
    }
    toggleRemoveModInStagingDraft({
      id: art.dbId || art.hash || art.name,
      dbId: art.dbId,
      hash: art.hash,
      name: art.name,
      displayName: art.displayName || art.name,
      author: art.author,
      version: art.version,
      category_override: art.category,
    });
  };

  const handleYeetAllIssues = () => {
    if (issueItemsToYeet.length === 0) return;
    setStagingDraftMode("blueprint");
    if (targetBpName) {
      setStagingDraftName(targetBpName);
      setStagingTargetDesktopBlueprint(targetBpName);
    }
    let count = 0;
    issueItemsToYeet.forEach((art) => {
      if (!isSingleModRemoved(art)) {
        toggleRemoveModInStagingDraft({
          id: art.dbId || art.hash || art.name,
          dbId: art.dbId,
          hash: art.hash,
          name: art.name,
          displayName: art.displayName || art.name,
          author: art.author,
          version: art.version,
          category_override: art.category,
        });
        count++;
      }
    });
    useStore
      .getState()
      .pushStatus(
        t(
          "staging_radar_yeeted_all_toast",
          "Marked {0} {mods} for removal from {Blueprint}!"
        ).replace("{0}", String(count || issueItemsToYeet.length)),
        "info"
      );
    if (onNavigateToBlueprints) {
      onClose();
      onNavigateToBlueprints();
    }
  };

  const handleStageSingleMod = async (art: any) => {
    setStagingDraftMode("blueprint");
    if (targetBpName) {
      setStagingDraftName(targetBpName);
      setStagingTargetDesktopBlueprint(targetBpName);
    }
    toggleModInStagingDraft({
      id: art.dbId || art.hash,
      dbId: art.dbId,
      hash: art.hash,
      name: art.name,
      displayName: art.displayName || art.name,
      author: art.author,
      url: art.url,
      version: art.newVersion || art.version,
      category_override: art.category,
    });
    const latestItems = useModalStore.getState().stagingDraftItems || [];
    if (latestItems.length > 0) {
      const { mergedItems } = await resolvePayloadDependencies(latestItems);
      setStagingDraftItems(
        mergedItems.map((item, idx) => ({ ...item, load_order_index: idx }))
      );
    }
  };

  const handleStageAllUpdates = () => {
    if (updatesItems.length === 0) return;
    setStagingDraftMode("blueprint");
    if (targetBpName) {
      setStagingDraftName(targetBpName);
      setStagingTargetDesktopBlueprint(targetBpName);
    }
    let added = 0;
    updatesItems.forEach((art) => {
      if (!isSingleModStaged(art)) {
        toggleModInStagingDraft({
          id: art.dbId || art.hash,
          dbId: art.dbId,
          hash: art.hash,
          name: art.name,
          displayName: art.displayName || art.name,
          author: art.author,
          url: art.url,
          version: art.newVersion || art.version,
          category_override: art.category,
        });
        added++;
      }
    });
    useStore
      .getState()
      .pushStatus(
        t(
          "staging_radar_staged_all_toast",
          "Added {0} {mod} updates to your staging queue!"
        ).replace("{0}", String(added || updatesItems.length)),
        "success"
      );
    if (onNavigateToBlueprints) {
      onClose();
      onNavigateToBlueprints();
    }
  };

  if (!isOpen) return null;

  const heroVariant =
    displayCriticalCount > 0
      ? "danger"
      : displayAlertsCount > 0 || displayUpdatesCount > 0
        ? "warning"
        : "success";
  const heroIcon =
    displayCriticalCount > 0
      ? t("icon_gpp_bad", "gpp_bad")
      : displayAlertsCount > 0
        ? t("icon_warning_amber", "warning_amber")
        : displayUpdatesCount > 0
          ? t("icon_update", "update")
          : t("icon_verified", "verified");

  return createPortal(
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("staging_radar_hero_title", "My {Vault} Patch Radar")}
      subtitle={
        snapshot
          ? `${displayVaultCount} ${t("term_mods", "Items")} • ${t(
              "staging_radar_last_synced",
              "Synced {0}"
            ).replace("{0}", new Date(snapshot.syncedAt).toLocaleDateString())}`
          : t("staging_radar_empty_title", "No Desktop {Vault} Synced Yet")
      }
      icon={t("icon_radar", "radar")}
      widthClass="w-full max-w-3xl"
      backdropZ="z-[100000]"
      panelZ="z-[100001]"
    >
      <div className="flex flex-col gap-4 pb-10">
        {!snapshot ? (
          <EmptyState
            icon={t("icon_radar", "radar")}
            title={t("staging_radar_empty_title", "No Desktop {Vault} Synced Yet")}
            subtitle={t(
              "staging_radar_empty_desc",
              "Sign in on your Windows PC or Steam Deck and run a Radar Sweep to sync your encrypted {Vault} DNA snapshot."
            )}
          />
        ) : (
          <>
            <SidePanelHeroCard
              icon={heroIcon}
              overline={t("staging_radar_hero_title", "My {Vault} Patch Radar")}
              title={
                selectedBpScope === "ALL_VAULT"
                  ? t("filter_all_vault_scope", "All {Vault}")
                  : targetBpName
              }
              description={t(
                "staging_radar_summary_context",
                "Monitoring {0} installed {mods} from your desktop {Vault} — {1} updates available, {2} broken in patch, and {3} verified stable. Select any {mod} to inspect its Dossier or stage updates to your desktop."
              )
                .replace("{0}", String(displayVaultCount))
                .replace("{1}", String(displayUpdatesCount))
                .replace("{2}", String(displayCriticalCount))
                .replace(
                  "{3}",
                  String(
                    Math.max(
                      0,
                      displayVaultCount -
                        displayCriticalCount -
                        displayAlertsCount -
                        displayUpdatesCount
                    )
                  )
                )}
              badge={
                attentionItems.length === 0
                  ? t("sys_stable", "System Stable")
                  : `${attentionItems.length} ${t("staging_radar_filter_issues", "Needs Attention")}`
              }
              badgeIcon={heroIcon}
              variant={heroVariant}
            >
              <div className="flex flex-wrap items-center gap-2.5 w-full mt-1">
                {updatesItems.length > 0 &&
                  filterMode !== "CRITICAL" &&
                  filterMode !== "ALERTS" && (
                    <button
                      type="button"
                      onClick={handleStageAllUpdates}
                      className="flex-1 min-w-[160px] h-10 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border glass-surface border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_playlist_add", "playlist_add")}
                      </span>
                      <span>
                        {t(
                          "staging_radar_stage_all_btn",
                          "Stage All Updates ({0})"
                        ).replace("{0}", String(updatesItems.length))}
                      </span>
                    </button>
                  )}

                {issueItemsToYeet.length > 0 &&
                  (filterMode === "CRITICAL" ||
                    filterMode === "ALERTS" ||
                    updatesItems.length === 0) && (
                    <button
                      type="button"
                      onClick={handleYeetAllIssues}
                      className="flex-1 min-w-[160px] h-10 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border glass-surface border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] hover:border-[var(--danger)] cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_remove_circle_outline", "remove_circle_outline")}
                      </span>
                      <span>
                        {t(
                          "staging_radar_yeet_all_btn",
                          "{Remove} All Issues ({0})"
                        ).replace("{0}", String(issueItemsToYeet.length))}
                      </span>
                    </button>
                  )}
              </div>
            </SidePanelHeroCard>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full">
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_gpp_bad", "gpp_bad")}
                label={t("crit_fail", "Critical Failures")}
                number={displayCriticalCount}
                isActive={filterMode === "CRITICAL"}
                onClick={() => setFilterMode("CRITICAL")}
              />
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_warning_amber", "warning_amber")}
                label={t("system_alerts_title", "System Alerts")}
                number={displayAlertsCount}
                isActive={filterMode === "ALERTS"}
                onClick={() => setFilterMode("ALERTS")}
              />
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_update", "update")}
                label={t("updates_avail", "Updates Available")}
                number={displayUpdatesCount}
                isActive={filterMode === "UPDATES"}
                onClick={() => setFilterMode("UPDATES")}
              />
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_account_balance", "account_balance")}
                label={t("vault_title", "Your {Vault}")}
                number={displayVaultCount}
                isActive={filterMode === "ALL"}
                onClick={() => setFilterMode("ALL")}
              />
            </div>

            <ActionPill
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchPlaceholder={t("search_ph", "Search {mods}...")}
              primaryPopover={{
                icon: t("icon_tune", "tune"),
                label: t("filters", "Filters"),
                content: (
                  <div className="flex flex-col gap-4 w-64 sm:w-72">
                    {desktopBlueprints.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 px-2">
                          {t("filter_blueprint_scope", "{Blueprint} Scope")}
                        </span>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBpScope("ALL_VAULT");
                              localStorage.setItem("sanctuary_mod_alerts_bp_scope", "ALL_VAULT");
                            }}
                            className={`px-3 py-2 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                              selectedBpScope === "ALL_VAULT"
                                ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                : "text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent"
                            }`}
                          >
                            <span>{t("filter_all_vault_scope", "All {Vault}")}</span>
                            {selectedBpScope === "ALL_VAULT" && (
                              <span className="material-symbols-outlined !text-[14px]">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                          {desktopBlueprints.map((bp) => {
                            const isSelected =
                              selectedBpScope.toLowerCase() === bp.name.toLowerCase() ||
                              (selectedBpScope === "ACTIVE" && bp.isActive);
                            return (
                              <button
                                key={bp.name}
                                type="button"
                                onClick={() => {
                                  setSelectedBpScope(bp.name);
                                  localStorage.setItem("sanctuary_mod_alerts_bp_scope", bp.name);
                                }}
                                className={`px-3 py-2 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                  isSelected
                                    ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                    : "text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent"
                                }`}
                              >
                                <span className="truncate">{bp.name}</span>
                                <span className="text-[10px] opacity-65 shrink-0">
                                  {bp.modsCount}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 px-2">
                        {t("filter_status", "Filter Status")}
                      </span>
                      <div className="flex flex-col gap-1">
                        {[
                          { id: "ALL" as const, label: t("filter_all", "All") },
                          {
                            id: "IN_BP" as const,
                            label: t("filter_in_blueprint", "In {Blueprint}"),
                          },
                          {
                            id: "NOT_IN_BP" as const,
                            label: t("filter_not_in_blueprint", "Not in {Blueprint}"),
                          },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setEquipFilter(opt.id)}
                            className={`px-3 py-2 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                              equipFilter === opt.id
                                ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                                : "text-[var(--text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent"
                            }`}
                          >
                            <span>{opt.label}</span>
                            {equipFilter === opt.id && (
                              <span className="material-symbols-outlined !text-[14px]">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ),
              }}
            />

            <UniversalGroup
              title={`${
                filterMode === "CRITICAL"
                  ? t("crit_fail", "Critical Failures")
                  : filterMode === "ALERTS"
                    ? t("system_alerts_title", "System Alerts")
                    : filterMode === "UPDATES"
                      ? t("updates_avail", "Updates Available")
                      : filterMode === "ISSUES"
                        ? t("staging_radar_filter_issues", "Needs Attention")
                        : t("vault_title", "Your {Vault}")
              } (${filteredItems.length})`}
              icon={t("icon_radar", "radar")}
            >
              {filteredItems.length === 0 ? (
                <EmptyState
                  icon={t("icon_check_circle", "check_circle")}
                  title={t("no_results", "No matching {mods} found.")}
                  minHeightClass="min-h-[160px]"
                  className="py-6"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                  {filteredItems.slice(0, visibleCount).map((art, idx) => {
                    const staged = isSingleModStaged(art);
                    const markedForRemoval = isSingleModRemoved(art);
                    const inBp = isArtifactInTargetBp(art);
                    const shouldOfferYeet =
                      art.isBroken ||
                      art.alertType === "alert" ||
                      filterMode === "CRITICAL" ||
                      filterMode === "ALERTS" ||
                      (filterMode === "ALL" && inBp && !art.hasUpdate);

                    return (
                      <div
                        key={`${art.hash || art.name}_${idx}`}
                        onClick={() => {
                          const knownAuthor = resolveKnownAuthor(art, "");
                          onOpenDossier?.({
                            ...art,
                            id: art.dbId || art.hash || art.name,
                            dbId: art.dbId,
                            status: art.isBroken
                              ? "broken"
                              : art.status || "stable",
                            author: knownAuthor || art.author || "",
                            master_author: knownAuthor || art.author || "",
                            category_override: art.category || "",
                            isNexusView: true,
                          });
                        }}
                        className={`p-4 rounded-2xl glass-surface border transition-all cursor-pointer flex flex-col justify-between gap-3 group ${
                          markedForRemoval
                            ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 w-full">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[20px]">
                              {getModIcon(art, activeGameSchema, t)}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug group-hover:text-[var(--accent)] transition-colors truncate">
                              {cleanSearchName(
                                art.displayName || art.name,
                                activeGameSchema
                              )}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate">
                              {resolveKnownAuthor(
                                art,
                                t("unknown_mason", "Unknown {Mason}")
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            {art.isBroken ? (
                              <span
                                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]`}
                              >
                                <span className="material-symbols-outlined !text-[12px]">
                                  {t("icon_warning", "warning")}
                                </span>
                                <span>
                                  {t("staging_radar_broken_count", "Broken in Patch")}
                                </span>
                              </span>
                            ) : art.alertType === "alert" ? (
                              <span
                                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]`}
                              >
                                <span className="material-symbols-outlined !text-[12px]">
                                  {t("icon_warning_amber", "warning_amber")}
                                </span>
                                <span>{t("status_unstable", "UNSTABLE")}</span>
                              </span>
                            ) : art.hasUpdate ? (
                              <span
                                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]`}
                              >
                                <span className="material-symbols-outlined !text-[12px]">
                                  {t("icon_update", "update")}
                                </span>
                                <span>
                                  {art.newVersion
                                    ? `${art.version || "v1.0"} → ${art.newVersion}`
                                    : t("btn_update", "Update")}
                                </span>
                              </span>
                            ) : (
                              <span
                                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]`}
                              >
                                <span className="material-symbols-outlined !text-[12px]">
                                  {t("icon_verified", "verified")}
                                </span>
                                <span>{t("status_stable", "STABLE")}</span>
                              </span>
                            )}
                            {filterMode === "ALL" && inBp && (
                              <span
                                className={`${VAULT_CHIP_CLASS} border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]`}
                              >
                                <span className="material-symbols-outlined !text-[12px]">
                                  {t("icon_check_circle", "check_circle")}
                                </span>
                                <span>
                                  {t("filter_in_blueprint", "In {Blueprint}")}
                                </span>
                              </span>
                            )}
                            {!art.hasUpdate && art.version && (
                              <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                                <span>{art.version}</span>
                              </span>
                            )}
                          </div>

                          <div
                            className="flex items-center gap-1.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {art.hasUpdate && (
                              <button
                                type="button"
                                onClick={() => handleStageSingleMod(art)}
                                className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                                  staged
                                    ? "sa-glass-active text-[var(--accent)]"
                                    : "glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {staged
                                    ? t("icon_playlist_add_check", "playlist_add_check")
                                    : t("icon_playlist_add", "playlist_add")}
                                </span>
                                <span>
                                  {staged
                                    ? t("staging_btn_staged", "Staged")
                                    : t("nexus_btn_stage_compact", "Stage to Desktop")}
                                </span>
                              </button>
                            )}

                            {shouldOfferYeet ? (
                              <button
                                type="button"
                                onClick={() => handleYeetSingleMod(art)}
                                className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                                  markedForRemoval
                                    ? "glass-surface border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)]"
                                    : "glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {markedForRemoval
                                    ? t("icon_undo", "undo")
                                    : t(
                                        "icon_remove_circle_outline",
                                        "remove_circle_outline"
                                      )}
                                </span>
                                <span>
                                  {markedForRemoval
                                    ? t("staging_badge_removing", "Queued to {Remove}")
                                    : t("btn_remove", "{Remove}")}
                                </span>
                              </button>
                            ) : !art.hasUpdate ? (
                              <button
                                type="button"
                                onClick={() => handleStageSingleMod(art)}
                                className={`h-8 px-3 rounded-xl border text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                                  staged
                                    ? "sa-glass-active text-[var(--accent)]"
                                    : "glass-surface border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {staged
                                    ? t("icon_playlist_add_check", "playlist_add_check")
                                    : t("icon_playlist_add", "playlist_add")}
                                </span>
                                <span>
                                  {staged
                                    ? t("staging_btn_staged", "Staged")
                                    : t("nexus_btn_stage_compact", "Stage to Desktop")}
                                </span>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filteredItems.length > visibleCount && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + 100)}
                      className="col-span-full w-full py-3 mt-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_expand_more", "expand_more")}
                      </span>
                      {t("load_more_artifacts", "Load More {Mods}")} (
                      {filteredItems.length - visibleCount})
                    </button>
                  )}
                </div>
              )}
            </UniversalGroup>
          </>
        )}
      </div>
    </SidePanel>,
    document.body
  );
}

