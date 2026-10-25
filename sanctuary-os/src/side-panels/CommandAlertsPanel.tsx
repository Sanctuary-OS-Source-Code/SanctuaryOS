import { useState, useMemo, useEffect } from "react";
import {
  formatDisplayName,
  CustomDropdown,
  mapDlcCode,
  isVersionMatch,
  SidePanel,
  getHighestVersion,
  getExtensionRegex,
  HoverTooltip,
  parseStringArray,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
  InlineFilterGroup,
  getModIcon,
  SidePanelHeroCard,
  StatBox,
  DashboardStatTile,
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../shared";
import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";
import { tauriBridge } from "../lib/tauri-bridge";
import { usePlaySetLogic } from "../hooks/usePlaySetLogic";
import { UniversalCard } from "../components/universal/UniversalCard";
import {
  evaluateModIssues,
  groupBrokenMods,
  renderGroupedIncompatibleSections,
  extractValidCreator,
} from "./CommandIncompatiblePanel";

export default function CommandAlertsPanel({
  isOpen,
  onClose,
  playSet,
  modList,
  toggleInActiveSet,
  allow_write,
  vaultPath,
  onRefreshMods,
  mode = "critical",
}: any) {
  const { t } = useLexicon();
  const ownedDLC = useStore((state: any) => state.ownedDLC);
  const maskedDLC = useStore((state: any) => state.maskedDLC);
  const selectedVersion = useStore((state: any) => state.selectedVersion);
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const ignoredGlobal = useStore((state: any) => state.ignoredGlobal);
  const showImages = useStore((state: any) => state.showImages);
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(new Set());
  const [ignoredBroken, setIgnoredBroken] = useState<Set<string>>(new Set());
  const [, setActiveTab] = useState<"broken" | "conflicts">("broken");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const extRegex = useMemo(() => getExtensionRegex(activeGameSchema), [activeGameSchema]);
  const activeMods = useMemo(() => {
    const safeMods = Array.isArray(playSet?.mods) ? playSet.mods : [];
    const safeList = Array.isArray(modList) ? modList : [];

    const exactMatchMap = new Map();
    const baseMatchMap = new Map();

    for (const m of safeList) {
      if (!m.name) continue;
      const exactKey = m.name.toLowerCase().replace(/\\/g, "/");
      exactMatchMap.set(exactKey, m);

      const baseKey = m.name.split(/[\\/]/).pop()?.replace(extRegex, "").toLowerCase();
      if (baseKey && !baseMatchMap.has(baseKey)) {
        baseMatchMap.set(baseKey, m);
      }
    }

    return safeMods.map((rawMod: any) => {
      const modName = typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
      const cleanModName = modName.replace(/^(sanctuary[/\\])+/i, "");
      const modNameLow = cleanModName.toLowerCase().replace(/\\/g, "/");

      const exactMatch = exactMatchMap.get(modNameLow);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };

      const mBase = modName.split(/[\\/]/).pop()?.replace(extRegex, "").toLowerCase();
      const baseMatch = mBase ? baseMatchMap.get(mBase) : undefined;

      if (baseMatch) return { ...baseMatch, _originalSetName: modName };

      return { name: modName, isFallback: true, _originalSetName: modName };
    });
  }, [playSet?.mods, modList, extRegex]);

  const activeConflicts = useMemo(() => {
    const conflicts: any[] = [];
    try {
      const stored = null;
      if (stored) {
        const localConflicts = JSON.parse(stored);
        localConflicts.forEach((lc: any) => {
          if (ignoredGlobal.includes(lc.mod_pair)) return;

          const modAMatch = activeMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || "").toUpperCase();
            const cleanDisp = String(em.displayName || "").toUpperCase();
            const targetClean = String(lc.modA || lc.mod_a || "").toUpperCase();
            return (
              cleanN.includes(targetClean) ||
              cleanDisp.includes(targetClean) ||
              targetClean.includes(cleanN)
            );
          });
          const modBMatch = activeMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || "").toUpperCase();
            const cleanDisp = String(em.displayName || "").toUpperCase();
            const targetClean = String(lc.modB || lc.mod_b || "").toUpperCase();
            return (
              cleanN.includes(targetClean) ||
              cleanDisp.includes(targetClean) ||
              targetClean.includes(cleanN)
            );
          });

          if (modAMatch && modBMatch) {
            const isWinnerA =
              modAMatch._originalSetName?.toLowerCase().startsWith("sanctuary") ||
              modAMatch.name?.toLowerCase().startsWith("sanctuary");
            const isWinnerB =
              modBMatch._originalSetName?.toLowerCase().startsWith("sanctuary") ||
              modBMatch.name?.toLowerCase().startsWith("sanctuary");
            if (isWinnerA || isWinnerB) return;

            conflicts.push({
              pairId: lc.mod_pair,
              modA: modAMatch,
              modB: modBMatch,
              conflict: {
                severity_rank: lc.severity_rank,
                resolution_note: lc.resolution_note || t("tier3_conflict", "Tuning Overlap"),
              },
            });
          }
        });
      }
    } catch (e) {}

    return conflicts.filter((c) =>
      mode === "critical" ? c.conflict.severity_rank == 4 : c.conflict.severity_rank == 3
    );
  }, [activeMods, ignoredGlobal, mode, t]);

  const brokenMods = useMemo(() => {
    return activeMods
      .map((mod: any) =>
        evaluateModIssues(mod, {
          activeMods,
          selectedVersion,
          ownedDLC,
          maskedDLC,
          t,
          activeGameSchema,
        })
      )
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (a._alert_type === "red" && b._alert_type === "amber") return -1;
        if (a._alert_type === "amber" && b._alert_type === "red") return 1;
        return 0;
      })
      .filter((m: any) =>
        mode === "critical" ? m._alert_type === "red" : m._alert_type === "amber"
      );
  }, [activeMods, selectedVersion, ownedDLC, maskedDLC, t, mode, activeGameSchema]);

  useEffect(() => {
    if (isOpen) {
      if (brokenMods.length === 0 && activeConflicts.length > 0) {
        setActiveTab("conflicts");
      } else {
        setActiveTab("broken");
      }
    }
  }, [isOpen, brokenMods.length, activeConflicts.length]);

  const redMods = useMemo(
    () => brokenMods.filter((m: any) => m._alert_type === "red"),
    [brokenMods]
  );
  const amberMods = useMemo(
    () => brokenMods.filter((m: any) => m._alert_type === "amber"),
    [brokenMods]
  );

  const { applyConflictOverride } = usePlaySetLogic();

  const getPriorityDrop = (modData: any) => {
    if (!modData || modData.isFallback || !allow_write) return null;
    let currentPriority = "";
    if (modData.path) {
      const firstPart = modData.path.split(/[/\\]/)[0];
      if (["!Sanctuary", "!Sanctuary2", "!Sanctuary3"].includes(firstPart)) {
        currentPriority = firstPart;
      }
    }
    return (
      <div className="w-full mt-2">
        <CustomDropdown
          disableTint={true}
          value={currentPriority}
          onChange={async (newPrio: string) => {
            try {
              await tauriBridge.moveModToPriorityFolder(vaultPath, modData.name, newPrio);
              if (onRefreshMods) onRefreshMods();
            } catch (e) {
              console.error("Failed to move mod priority", e);
            }
          }}
          options={[
            { id: "", label: t("bp_priority_default", "Standard Priority") },
            { id: "!Sanctuary", label: t("bp_priority_sanctuary", "Priority 1") },
            { id: "!Sanctuary2", label: t("bp_priority_sanctuary2", "Priority 2") },
            { id: "!Sanctuary3", label: t("bp_priority_sanctuary3", "Priority 3") },
          ]}
        />
      </div>
    );
  };

  const groupedBrokenMods = useMemo(() => groupBrokenMods(brokenMods), [brokenMods]);
  const groupedRedMods = useMemo(
    () => groupedBrokenMods.filter((m) => m._alert_type === "red"),
    [groupedBrokenMods]
  );
  const groupedAmberMods = useMemo(
    () => groupedBrokenMods.filter((m) => m._alert_type === "amber"),
    [groupedBrokenMods]
  );

  const filteredGroupedBrokenMods = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groupedBrokenMods.filter((mod: any) => {
      const cats: string[] = Array.isArray(mod._categories)
        ? mod._categories
        : [mod._alert_category];

      if (categoryFilter === "corrupted") {
        if (!cats.includes("corrupted")) return false;
      } else if (categoryFilter === "version_mismatch") {
        if (!cats.includes("version_mismatch")) return false;
      } else if (categoryFilter === "missing_reqs") {
        if (!cats.includes("missing_dlc") && !cats.includes("missing_deps")) {
          return false;
        }
      } else if (categoryFilter === "unstable") {
        if (!cats.includes("unstable") && mod._alert_type !== "amber") return false;
      }

      if (!q) return true;
      const title = String(mod._groupedTitle || mod.displayName || mod.name || "").toLowerCase();
      const author = String(mod.author || "").toLowerCase();
      const reason = String(mod._alert_reason || "").toLowerCase();
      return title.includes(q) || author.includes(q) || reason.includes(q);
    });
  }, [groupedBrokenMods, searchQuery, categoryFilter]);

  const filteredConflicts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeConflicts;
    return activeConflicts.filter((ac) => {
      const nameA = String(ac.modA?.displayName || ac.modA?.name || "").toLowerCase();
      const nameB = String(ac.modB?.displayName || ac.modB?.name || "").toLowerCase();
      const note = String(ac.conflict?.resolution_note || "").toLowerCase();
      return nameA.includes(q) || nameB.includes(q) || note.includes(q);
    });
  }, [activeConflicts, searchQuery]);

  const totalIssues = groupedBrokenMods.length + activeConflicts.length;

  const corruptedCount = useMemo(
    () =>
      groupedBrokenMods.filter((m: any) =>
        (Array.isArray(m._categories) ? m._categories : [m._alert_category]).includes("corrupted")
      ).length,
    [groupedBrokenMods]
  );
  const mismatchCount = useMemo(
    () =>
      groupedBrokenMods.filter((m: any) =>
        (Array.isArray(m._categories) ? m._categories : [m._alert_category]).includes(
          "version_mismatch"
        )
      ).length,
    [groupedBrokenMods]
  );
  const missingReqsCount = useMemo(
    () =>
      groupedBrokenMods.filter((m: any) => {
        const cats = Array.isArray(m._categories) ? m._categories : [m._alert_category];
        return cats.includes("missing_dlc") || cats.includes("missing_deps");
      }).length,
    [groupedBrokenMods]
  );
  const unstableCount = useMemo(
    () =>
      groupedBrokenMods.filter((m: any) => {
        const cats = Array.isArray(m._categories) ? m._categories : [m._alert_category];
        return cats.includes("unstable") || m._alert_type === "amber";
      }).length,
    [groupedBrokenMods]
  );

  if (!playSet) return null;

  const isCriticalMode = mode === "critical";
  const heroIcon = isCriticalMode ? t("icon_gpp_bad", "gpp_bad") : t("icon_gpp_maybe", "gpp_maybe");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        isCriticalMode
          ? t("action_required", "Critical Action Required")
          : t("system_alerts_title", "System Alerts")
      }
      subtitle={`${totalIssues} ${t("term_mods", "Items")} • ${activeMods.length} ${t("active", "Active")}`}
      icon={heroIcon}
      iconColorClass={isCriticalMode ? "text-[var(--danger)]" : "text-[var(--warning)]"}
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        allow_write && groupedBrokenMods.length > 0 ? (
          <PanelHeaderGroup>
            {groupedRedMods.length > 0 && (
              <PanelHeaderButton
                icon={t("icon_delete_sweep", "delete_sweep")}
                tooltip={t("bp_purge_corrupted", "Purge {0} Corrupted").replace(
                  "{0}",
                  String(groupedRedMods.length)
                )}
                variant="danger"
                onClick={() => {
                  redMods.forEach((m: any) =>
                    toggleInActiveSet(m._originalSetName || m.name, true, true)
                  );
                }}
              />
            )}
            {groupedAmberMods.length > 0 && (
              <PanelHeaderButton
                icon={t("icon_delete_sweep", "delete_sweep")}
                tooltip={t("bp_purge_unstable", "Purge {0} Unstable").replace(
                  "{0}",
                  String(groupedAmberMods.length)
                )}
                variant="default"
                onClick={() => {
                  amberMods.forEach((m: any) =>
                    toggleInActiveSet(m._originalSetName || m.name, true, true)
                  );
                }}
              />
            )}
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={heroIcon}
          overline={
            isCriticalMode
              ? t("action_required", "Critical Action Required")
              : t("system_alerts_title", "System Alerts")
          }
          title={playSet?.name || t("active", "Active")}
          description={
            isCriticalMode
              ? t("incompatible_broken", "Incompatible {Mods}")
              : t("bp_load_order_conflicts", "Load Order & Tuning Conflicts")
          }
          badge={`${totalIssues} ${t("term_mods", "Items")}`}
          badgeIcon={heroIcon}
          variant={isCriticalMode ? "danger" : "warning"}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <StatBox
              label={t("active", "Active")}
              value={activeMods.length}
              icon={t("icon_inventory_2", "inventory_2")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("citizen_action_incompatible", "Incompatible")}
              value={groupedBrokenMods.length}
              icon={t("icon_gpp_bad", "gpp_bad")}
              iconColorClass={isCriticalMode ? "text-[var(--danger)]" : "text-[var(--warning)]"}
            />
            <StatBox
              label={t("tab_matrix", "Conflicts")}
              value={activeConflicts.length}
              icon={t("icon_crisis_alert", "crisis_alert")}
              iconColorClass={isCriticalMode ? "text-[var(--danger)]" : "text-[var(--warning)]"}
            />
          </div>
        </SidePanelHeroCard>

        {totalIssues > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("nav_search", "Search...")}
            primaryPopover={{
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters"),
              content: (
                <div className="flex flex-col gap-4 w-[280px] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                      {t("status", "Status")}
                    </span>
                    <InlineFilterGroup
                      value={categoryFilter}
                      onChange={(v: string) => setCategoryFilter(v)}
                      options={[
                        { id: "all", label: t("filter_all", "All") },
                        { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                        { id: "version_mismatch", label: t("modal_version_mismatch", "Version Mismatch") },
                        { id: "missing_reqs", label: t("badge_missing_dep", "Missing Dependency") },
                        { id: "unstable", label: t("label_unstable", "Unstable") },
                      ]}
                    />
                  </div>
                </div>
              ),
            }}
          />
        )}

        {/* Conflicts Section */}
        {filteredConflicts.length > 0 && (
          <UniversalGroup
            title={`${t("bp_load_order_conflicts", "Conflicts Detected")} (${filteredConflicts.length})`}
            icon={t("icon_crisis_alert", "crisis_alert")}
          >
            <div className="flex flex-col gap-4">
              {filteredConflicts.map((ac) => {
                const isIgnored = ignoredConflicts.has(ac.pairId);
                const isTier4 = ac.conflict.severity_rank == 4;

                const prefixA =
                  (ac.modA._originalSetName || ac.modA.name)?.split(/[/\\]/).slice(0, -1).join("/") ||
                  "";
                const prefixB =
                  (ac.modB._originalSetName || ac.modB.name)?.split(/[/\\]/).slice(0, -1).join("/") ||
                  "";
                const isWinnerA = prefixA.toLowerCase() === "sanctuary";
                const isWinnerB = prefixB.toLowerCase() === "sanctuary";

                const iconName = isTier4
                  ? t("icon_crisis_alert", "crisis_alert")
                  : t("icon_tune", "tune");

                const imageA =
                  showImages &&
                  (ac.modA.image_url || ac.modA.imageUrl) &&
                  String(ac.modA.image_url || ac.modA.imageUrl) !== "null"
                    ? ac.modA.image_url || ac.modA.imageUrl
                    : undefined;
                const imageB =
                  showImages &&
                  (ac.modB.image_url || ac.modB.imageUrl) &&
                  String(ac.modB.image_url || ac.modB.imageUrl) !== "null"
                    ? ac.modB.image_url || ac.modB.imageUrl
                    : undefined;

                const conflictTitle =
                  ac.conflict.resolution_note ||
                  (isTier4
                    ? t("conflict_sev4_desc", "Fatal Collision — Cannot be installed together")
                    : t("conflict_sev3_desc", "Tuning Overlap — Load order override or minor feature overlap"));

                const severityBadgeClass = isTier4
                  ? `${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)]`
                  : `${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--warning)_40%,transparent)] !text-[var(--warning)]`;

                const winnerBadgeClass = `${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--success)_40%,transparent)] !text-[var(--success)]`;

                const loserBadgeClass = `${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--text)_18%,transparent)] !text-[var(--subtext)]`;

                return (
                  <UniversalCard
                    key={ac.pairId}
                    layout="horizontal"
                    isGhosted={isIgnored}
                    icon={iconName}
                    title={conflictTitle}
                    badges={
                      <div className={severityBadgeClass}>
                        <span
                          className={`material-symbols-outlined !text-[12px] ${
                            isTier4 ? "text-[var(--danger)]" : "text-[var(--warning)]"
                          }`}
                        >
                          {iconName}
                        </span>
                        <span>
                          {isTier4
                            ? t("fatal_conflict", "Fatal Conflict")
                            : t("tier3_conflict", "Tuning Overlap")}
                        </span>
                      </div>
                    }
                    actions={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const newSet = new Set(ignoredConflicts);
                          if (isIgnored) newSet.delete(ac.pairId);
                          else newSet.add(ac.pairId);
                          setIgnoredConflicts(newSet);
                        }}
                        className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] opacity-80 hover:opacity-100 transition-all cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {isIgnored
                            ? t("icon_visibility", "visibility")
                            : t("icon_visibility_off", "visibility_off")}
                        </span>
                        <HoverTooltip
                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                          title={
                            isIgnored
                              ? t("bp_restore_alert", "Restore Alert")
                              : t("btn_ignore", "Ignore")
                          }
                          icon={
                            isIgnored
                              ? t("icon_visibility", "visibility")
                              : t("icon_visibility_off", "visibility_off")
                          }
                        />
                      </button>
                    }
                  >
                    <div
                      className={`grid grid-cols-1 sm:grid-cols-2 gap-3 w-full ${
                        isIgnored ? "pointer-events-none" : ""
                      }`}
                    >
                      {[
                        { mod: ac.modA, image: imageA, isWinner: isWinnerA, isLoser: isWinnerB },
                        { mod: ac.modB, image: imageB, isWinner: isWinnerB, isLoser: isWinnerA },
                      ].map((slot, sIdx) => {
                        const mTitle = formatDisplayName(slot.mod.displayName || slot.mod.name);
                        const mAuthor = extractValidCreator(slot.mod);
                        const mIcon = getModIcon(slot.mod, activeGameSchema, t);
                        return (
                          <UniversalCard
                            key={`${ac.pairId}-${sIdx}`}
                            layout="compact"
                            isActive={slot.isWinner && !isTier4}
                            image={slot.image}
                            icon={!slot.image ? mIcon : undefined}
                            title={mTitle}
                            subtitle={mAuthor || undefined}
                            actions={
                              <div className="flex items-center gap-1.5 shrink-0">
                                {ac.conflict.severity_rank == 4 ? (
                                  allow_write && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleInActiveSet(
                                          slot.mod._originalSetName || slot.mod.name,
                                          true,
                                          true
                                        )
                                      }
                                      className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] opacity-80 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:text-[var(--danger)] transition-all cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined !text-[16px]">
                                        {t("icon_close", "close")}
                                      </span>
                                      <HoverTooltip
                                        className="z-[100] !right-0 !translate-x-0 !left-auto"
                                        title={t("btn_remove", "{Remove}")}
                                        icon={t("icon_delete", "delete")}
                                        variant="danger"
                                      />
                                    </button>
                                  )
                                ) : ac.conflict.severity_rank == 3 ? (
                                  slot.isWinner ? (
                                    <div className={winnerBadgeClass}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                        {t("icon_check_circle", "check_circle")}
                                      </span>
                                      <span>
                                        {t("winner", "WINNING {MOD}")}
                                      </span>
                                    </div>
                                  ) : slot.isLoser ? (
                                    <div className={loserBadgeClass}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                        {t("icon_block", "block")}
                                      </span>
                                      <span>
                                        {t("bp_overridden_by_winner", "Overridden")}
                                      </span>
                                    </div>
                                  ) : (
                                    allow_write &&
                                    playSet?.name && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          applyConflictOverride(
                                            slot.mod._originalSetName || slot.mod.name,
                                            ac.pairId,
                                            playSet.name
                                          )
                                        }
                                        className="relative group/actionbtn w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] opacity-80 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)] transition-all cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined !text-[16px]">
                                          {t("icon_check_circle", "check_circle")}
                                        </span>
                                        <HoverTooltip
                                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                                          title={t("bp_select_winning_artifact", "Select Winner")}
                                          icon={t("icon_check_circle", "check_circle")}
                                          variant="accent"
                                        />
                                      </button>
                                    )
                                  )
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="w-28">{getPriorityDrop(slot.mod)}</div>
                                  </div>
                                )}
                              </div>
                            }
                          />
                        );
                      })}
                    </div>
                  </UniversalCard>
                );
              })}
            </div>
          </UniversalGroup>
        )}

        {/* Compromised Mods Section */}
        {filteredGroupedBrokenMods.length === 0 && filteredConflicts.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <EmptyState
              icon={t("icon_check_circle", "check_circle")}
              title={t("bp_no_broken_mods_detected", "All active {mods} passed compliance checks.")}
            />
          </div>
        ) : filteredGroupedBrokenMods.length > 0 ? (
          <UniversalGroup
            title={`${t("citizen_action_incompatible", "Incompatible")} (${filteredGroupedBrokenMods.length})`}
            icon={heroIcon}
          >
            {renderGroupedIncompatibleSections({
              groupedBrokenMods: filteredGroupedBrokenMods,
              ignoredBroken,
              setIgnoredBroken,
              toggleInActiveSet,
              allow_write,
              t,
              activeGameSchema,
            })}
          </UniversalGroup>
        ) : null}
      </div>
    </SidePanel>
  );
}
