import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  ActionPill,
  DashboardStatTile,
  SidePanelFilterBar,
  EmptyState,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
} from "../shared";
import { useStore } from "../store";
import { usePlaySetLogic } from "../hooks/usePlaySetLogic";
import {
  groupBlueprintArtifactsByFamily,
  BlueprintInspectorModCard,
} from "./NexusSidePanels";
import {
  getCachedComplianceHashTiers,
  resolveComplianceHashTiers,
  collectComplianceLookupHashes,
  resolveEffectiveModComplianceTier,
} from "../utils/complianceHashTiers";

const PAGE_SIZE = 40;

export default function ArtifactResolutionSidePanel({
  isOpen,
  onClose,
  type: _type,
  offendingMods,
}: {
  isOpen: boolean;
  onClose: () => void;
  type: "vault" | "blueprint" | "support_lock" | null;
  offendingMods: any[];
}) {
  const { t } = useLexicon();
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<
    "ALL" | "UNKNOWN" | "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4"
  >("ALL");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [depLimit, setDepLimit] = useState(20);
  const [hashTierMap, setHashTierMap] = useState<Map<string, number>>(() =>
    getCachedComplianceHashTiers()
  );

  const activeSet = useStore((state) => state.playSets[state.activePlaySetIndex]);
  const modList = useStore((state) => state.modList);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const { toggleInActiveSet } = usePlaySetLogic();

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery("");
    setTierFilter("ALL");
    setVisibleLimit(PAGE_SIZE);
    setDepLimit(20);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const hydrate = async (forceRefresh = false) => {
      const hashes = collectComplianceLookupHashes({
        modList,
        playSet: activeSet,
        extraMods: offendingMods,
      });
      if (hashes.length === 0) return;
      const nextMap = await resolveComplianceHashTiers(supabase, hashes, { forceRefresh });
      if (!cancelled) setHashTierMap(nextMap);
    };
    hydrate(false);
    const onComplianceUpdated = () => hydrate(true);
    window.addEventListener("sanctuary-compliance-updated", onComplianceUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("sanctuary-compliance-updated", onComplianceUpdated);
    };
  }, [isOpen, modList, activeSet, offendingMods]);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [searchQuery, tierFilter]);

  useEffect(() => {
    if (!isOpen || !offendingMods || offendingMods.length === 0) {
      setDependencies([]);
      return;
    }

    const checkDependencies = async () => {
      setLoading(true);
      const modIds = offendingMods.map((m) => m.id).filter(Boolean);
      if (modIds.length > 0) {
        const { data: deps } = await supabase
          .from("mod_dependencies")
          .select("parent_id")
          .in("child_id", modIds);

        if (deps && deps.length > 0) {
          const parentIds = [...new Set(deps.map((d) => d.parent_id))];
          const localParents = modList.filter((m) => parentIds.includes(m.id));

          if (activeSet?.mods) {
            const activeModsSet = new Set(activeSet.mods);
            const activeDeps = localParents.filter((p) => activeModsSet.has(p.name));
            setDependencies(activeDeps);
          } else {
            setDependencies([]);
          }
        } else {
          setDependencies([]);
        }
      } else {
        setDependencies([]);
      }
      setLoading(false);
    };

    checkDependencies();
  }, [isOpen, offendingMods, modList, activeSet]);

  const localVaultHashes = useMemo(() => {
    const hashes = new Set<string>();
    (modList || []).forEach((m: any) => {
      if (m?.hash) hashes.add(m.hash);
      if (Array.isArray(m?.flavors)) {
        m.flavors.forEach((fl: any) => {
          if (fl?.hash) hashes.add(fl.hash);
        });
      }
    });
    return hashes;
  }, [modList]);

  const enrichedOffending = useMemo(() => {
    return (offendingMods || []).map((m: any) => {
      if (!m) return m;
      const resolvedTier = resolveEffectiveModComplianceTier(m, hashTierMap);
      const finalTier = resolvedTier > 0 ? resolvedTier : 0;
      return {
        ...m,
        tier: finalTier,
        compliance_tier: finalTier,
      };
    });
  }, [offendingMods, hashTierMap]);

  const groupedOffending = useMemo(
    () =>
      groupBlueprintArtifactsByFamily(enrichedOffending, {
        modList,
        activeGameSchema,
        localVaultHashes,
      }),
    [enrichedOffending, modList, activeGameSchema, localVaultHashes]
  );

  const getGroupMaxTier = (group: any): number => {
    const members =
      Array.isArray(group?._groupedMods) && group._groupedMods.length > 0
        ? group._groupedMods
        : [group];
    let maxTier = 0;
    for (const gm of members) {
      const resolved = resolveEffectiveModComplianceTier(gm, hashTierMap);
      if (resolved > maxTier) maxTier = resolved;
    }
    return maxTier;
  };

  const tierCounts = useMemo(() => {
    const counts = { all: 0, unknown: 0, t1: 0, t2: 0, t3: 0, t4: 0 };
    for (const g of groupedOffending) {
      counts.all++;
      const tier = getGroupMaxTier(g);
      if (tier === 1) counts.t1++;
      else if (tier === 2) counts.t2++;
      else if (tier === 3) counts.t3++;
      else if (tier >= 4) counts.t4++;
      else counts.unknown++;
    }
    return counts;
  }, [groupedOffending, hashTierMap]);

  const filteredOffending = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groupedOffending.filter((f: any) => {
      const tier = getGroupMaxTier(f);
      if (tierFilter === "UNKNOWN" && tier >= 1) return false;
      if (tierFilter === "TIER_1" && tier !== 1) return false;
      if (tierFilter === "TIER_2" && tier !== 2) return false;
      if (tierFilter === "TIER_3" && tier !== 3) return false;
      if (tierFilter === "TIER_4" && tier < 4) return false;

      if (!q) return true;
      if (String(f._groupedTitle || f.name || "").toLowerCase().includes(q)) return true;
      if (String(f.author || "").toLowerCase().includes(q)) return true;
      if (Array.isArray(f._groupedMods)) {
        return f._groupedMods.some(
          (gm: any) =>
            String(gm._cleanModuleTitle || "").toLowerCase().includes(q) ||
            String(gm._cleanFilePart || gm.origName || gm.name || "").toLowerCase().includes(q) ||
            String(gm.author || "").toLowerCase().includes(q)
        );
      }
      return false;
    });
  }, [groupedOffending, searchQuery, tierFilter, hashTierMap]);

  const groupedDependencies = useMemo(
    () =>
      groupBlueprintArtifactsByFamily(dependencies, {
        modList,
        activeGameSchema,
        localVaultHashes,
      }),
    [dependencies, modList, activeGameSchema, localVaultHashes]
  );

  const unequipGroup = (group: any) => {
    const members =
      Array.isArray(group?._groupedMods) && group._groupedMods.length > 0
        ? group._groupedMods
        : [group];
    let removed = 0;
    for (const item of members) {
      const fileKey = item?.origName || item?._originalSetName || item?._rawFirstPath || item?.name;
      if (fileKey) {
        toggleInActiveSet(fileKey, true, true, false);
        removed += 1;
      }
    }
    if (removed > 0) {
      useStore
        .getState()
        .pushStatus(
          t("support_lock_item_removed_msg", "Unequipped {0} from your active {blueprint}.").replace(
            "{0}",
            String(group?._groupedTitle || group?.displayName || group?.name || removed)
          ),
          "success"
        );
    }
  };

  const resolveAlerts = async () => {
    setResolving(true);
    try {
      let unequippedCount = 0;
      for (const mod of offendingMods) {
        const fileKey = mod.origName || mod.name;
        if (fileKey) {
          toggleInActiveSet(fileKey, true, true, false);
          unequippedCount += 1;
        }
      }
      useStore
        .getState()
        .pushStatus(
          (
            t(
              "support_lock_resolved_msg",
              "Removed {0} restricted or unverified {mods} from your active {blueprint}. Your files in Your {Vault} were not deleted."
            ) || "Removed {0} items from active blueprint."
          ).replace("{0}", String(unequippedCount)),
          "success"
        );
      onClose();
    } catch (e) {
      console.error(e);
      useStore
        .getState()
        .pushStatus(t("err_resolve_support_lock", "Failed to update active {blueprint}."), "error");
    } finally {
      setResolving(false);
    }
  };

  const title = t("support_blueprint_lock", "{Blueprint} Support Lock");
  const desc = t(
    "support_blueprint_lock_resolve_desc",
    "Unequipping these restricted or unverified {mods} removes them only from your active {blueprint} so you can submit community support tickets with clean logs. No files will be deleted from disk."
  );
  const panelIcon = t("icon_lock", "lock");
  const actionLabel = t("support_lock_unequip_all", "Unequip All From {Blueprint}");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={t("support_lock_resolve_sub", "Review & Unequip")}
      icon={panelIcon}
      iconColorClass="text-[var(--danger)]"
      widthClass="w-[92vw] md:w-[820px]"
      backdropZ="z-[110000]"
      panelZ="z-[110001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={resolving ? t("icon_sync", "sync") : t("icon_playlist_remove", "playlist_remove")}
            tooltip={actionLabel}
            variant="error"
            className={resolving ? "animate-spin" : ""}
            onClick={resolveAlerts}
            disabled={resolving || loading || (offendingMods || []).length === 0}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-10">
        <SidePanelHeroCard
          icon={panelIcon}
          overline={t("support_lock_resolve_sub", "Review & Unequip")}
          title={title}
          description={desc}
          badge={`${groupedOffending.length} ${t("term_mods", "{Mods}")}`}
          badgeIcon={panelIcon}
          variant="danger"
        >
          <div className="grid grid-cols-2 gap-3 pt-1">
            <StatBox
              label={t("support_lock_unverified_mods", "Unverified {Mods}")}
              value={(offendingMods || []).length}
              icon={t("icon_extension", "extension")}
              iconColorClass="text-[var(--danger)]"
            />
            <StatBox
              label={t("support_lock_dependent_mods", "Dependent {Mods}")}
              value={dependencies.length}
              icon={t("icon_link", "link")}
              iconColorClass={
                dependencies.length > 0 ? "text-[var(--warning)]" : "text-[var(--success)]"
              }
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 ml-auto w-full pt-1">
            <ActionButton
              variant="danger"
              icon={resolving ? t("icon_sync", "sync") : t("icon_playlist_remove", "playlist_remove")}
              label={actionLabel}
              disabled={resolving || loading || (offendingMods || []).length === 0}
              onClick={resolveAlerts}
            />
          </div>
        </SidePanelHeroCard>

        <SidePanelFilterBar className="grid-cols-2 sm:grid-cols-3 gap-2.5">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_warning_amber", "warning_amber")}
            label={t("all", "All")}
            value={tierCounts.all}
            isActive={tierFilter === "ALL"}
            onClick={() => setTierFilter("ALL")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_help", "help")}
            label={t("unknown", "Unknown")}
            value={tierCounts.unknown}
            isActive={tierFilter === "UNKNOWN"}
            onClick={() => setTierFilter("UNKNOWN")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_shield", "shield")}
            label={`${t("stat_tier", "Tier")} 1`}
            value={tierCounts.t1}
            isActive={tierFilter === "TIER_1"}
            onClick={() => setTierFilter("TIER_1")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_shield", "shield")}
            label={`${t("stat_tier", "Tier")} 2`}
            value={tierCounts.t2}
            isActive={tierFilter === "TIER_2"}
            onClick={() => setTierFilter("TIER_2")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_shield", "shield")}
            label={`${t("stat_tier", "Tier")} 3`}
            value={tierCounts.t3}
            isActive={tierFilter === "TIER_3"}
            onClick={() => setTierFilter("TIER_3")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_shield", "shield")}
            label={`${t("stat_tier", "Tier")} 4+`}
            value={tierCounts.t4}
            isActive={tierFilter === "TIER_4"}
            onClick={() => setTierFilter("TIER_4")}
          />
        </SidePanelFilterBar>

        <ActionPill
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchPlaceholder={t("playsets_search_ph", "Search {mods}...")}
          className="shrink-0 w-full"
        />

        <UniversalGroup
          title={`${t("support_lock_unverified_mods", "Unverified {Mods}")} (${filteredOffending.length})`}
          icon={t("icon_extension", "extension")}
        >
          {filteredOffending.length === 0 ? (
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={
                searchQuery.trim() || tierFilter !== "ALL"
                  ? t("no_matches_found", "No matching {mods} found.")
                  : t("tier_clean", "Clean")
              }
              minHeightClass="min-h-[140px]"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {filteredOffending.slice(0, visibleLimit).map((m: any, idx: number) => {
                const maxTier = getGroupMaxTier(m);
                return (
                  <BlueprintInspectorModCard
                    key={`${m._groupKey || m.name || idx}-${idx}`}
                    mod={m}
                    activeGameSchema={activeGameSchema}
                    t={t}
                    onUnequip={() => unequipGroup(m)}
                    unequipTooltip={t("remove_from_blueprint", "Remove from {Blueprint}")}
                    statusBadge={{
                      label:
                        maxTier > 0
                          ? `${t("stat_tier", "Tier")} ${maxTier}`
                          : t("status_unknown_unverified", "Unknown / Unverified"),
                      icon:
                        maxTier > 0
                          ? t("icon_shield", "shield")
                          : t("icon_help_outline", "help_outline"),
                      iconColorClass:
                        maxTier > 0 ? "text-[var(--danger)]" : "text-[var(--warning)]",
                    }}
                  />
                );
              })}

              {filteredOffending.length > visibleLimit && (
                <div className="col-span-full w-full flex justify-center mt-2">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_expand_more", "expand_more")}
                    label={`${t("btn_show_more", "Show More")} (${
                      filteredOffending.length - visibleLimit
                    })`}
                    onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
                  />
                </div>
              )}
            </div>
          )}
        </UniversalGroup>

        <UniversalGroup
          title={`${t("support_lock_dependent_mods", "Dependent {Mods}")} (${groupedDependencies.length})`}
          icon={t("icon_link", "link")}
        >
          {loading ? (
            <div className="flex items-center gap-2 text-[var(--subtext)] text-xs font-bold p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="material-symbols-outlined animate-spin">
                {t("icon_sync", "sync")}
              </span>
              <span>
                {t(
                  "scanning_dependencies_clean",
                  "Checking {blueprint} for dependent {mods}..."
                )}
              </span>
            </div>
          ) : groupedDependencies.length > 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "affected_deps_desc",
                  "The following {mods} are currently active in your {blueprint} and depend on the items above. They may become unstable if left active without their dependencies."
                )}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                {groupedDependencies.slice(0, depLimit).map((dep: any, i: number) => (
                  <BlueprintInspectorModCard
                    key={`${dep._groupKey || dep.name || i}-${i}`}
                    mod={dep}
                    activeGameSchema={activeGameSchema}
                    t={t}
                    statusBadge={{
                      label: t("badge_dependent_mod", "Dependent"),
                      icon: t("icon_link", "link"),
                      iconColorClass: "text-[var(--warning)]",
                    }}
                  />
                ))}
                {groupedDependencies.length > depLimit && (
                  <div className="col-span-full w-full flex justify-center mt-1">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_expand_more", "expand_more")}
                      label={`${t("btn_show_more", "Show More")} (${
                        groupedDependencies.length - depLimit
                      })`}
                      onClick={() => setDepLimit((prev) => prev + 20)}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--success)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_check_circle", "check_circle")}
                </span>
              </div>
              <span className="text-xs font-bold text-[var(--text)]">
                {t("no_affected_deps", "No other {mods} in the active {blueprint} depend on these.")}
              </span>
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
