import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase, spokeOversightFrom } from "../supabase";
import { invalidateNexusCatalogCache } from "../utils/nexusCatalogStats";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel, CustomDropdown, GameVersionMultiSelect, ModSearchDropdown, EmptyState,
  fetchAllPaginated, PanelHeaderGroup, PanelHeaderButton, ActionButton, VAULT_CHIP_CLASS,
  isVersionMatch, formatVersionRangesLabel, SidePanelPillToggle,
  AccordionDrawer, HoverTooltip, openModDossier, stripMarkdown,
} from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import { UniversalGroup, UniversalTextArea, SidePanelHeroCard, StatBox } from "../components/universal/UniversalLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import { openSanctuaryContextMenu } from "../ContextMenu";
import { DynamicArtifactPreviewBanner } from "../chameleon-components/ThemeCard";
import { buildFamilyHierarchy } from "../components/artifact-studio/artifactStudioUtils";
import { logArchitectAction, parseAuditLogEntry, formatAuditTableLabel } from "../lib/audit";

const normalizeModStatusKey = (rawStatus: any): string => {
  const raw = String(rawStatus || "").trim().toLowerCase();
  if (!raw || raw === "unverified" || raw === "pending") return "pending";
  if (raw === "verified" || raw === "stable") return "stable";
  if (raw === "broken" || raw === "corrupted") return "corrupted";
  if (raw === "unstable") return "unstable";
  if (raw === "under_review" || raw === "under review") return "under_review";
  return raw;
};

export function MassUpdateOversight() {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s: any) => s.activeGameSchema);
  const [mods, setMods] = useState<any[]>([]);
  const [modRelationships, setModRelationships] = useState<any[]>([]);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [groupFamilies, setGroupFamilies] = useState<boolean>(true);
  const [cascadeChildren, setCascadeChildren] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(100);
  const [recentChanges, setRecentChanges] = useState<any[]>([]);
  const lastClickedIndexRef = useRef<number | null>(null);
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);

  const getModStatusMeta = (rawStatus: any) => {
    const key = normalizeModStatusKey(rawStatus);
    switch (key) {
      case "stable":
        return {
          key,
          label: t("status_stable", "Stable"),
          icon: t("icon_verified", "verified"),
          iconColor: "text-[var(--success)]",
        };
      case "unstable":
        return {
          key,
          label: t("label_unstable", "Unstable"),
          icon: t("icon_warning", "warning"),
          iconColor: "text-[var(--warning)]",
        };
      case "corrupted":
        return {
          key,
          label: t("status_corrupted", "Corrupted"),
          icon: t("icon_gpp_maybe", "gpp_maybe"),
          iconColor: "text-[var(--danger)]",
        };
      case "under_review":
        return {
          key,
          label: t("status_dd_review", "Under Review"),
          icon: t("icon_policy", "policy"),
          iconColor: "text-[var(--warning)]",
        };
      case "pending":
        return {
          key,
          label: t("status_pending", "Pending"),
          icon: t("icon_schedule", "schedule"),
          iconColor: "text-[var(--subtext)]",
        };
      default:
        return {
          key,
          label: String(rawStatus || t("status_pending", "Pending")).replace(/_/g, " "),
          icon: t("icon_schedule", "schedule"),
          iconColor: "text-[var(--subtext)]",
        };
    }
  };

  const [filterMason, setFilterMason] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterTier, setFilterTier] = useState<string>("");
  const [filterGameVersions, setFilterGameVersions] = useState<string[]>([]);
  const [versionFilterMode, setVersionFilterMode] = useState<"match" | "missing">("match");
  const [massStatus, setMassStatus] = useState<string>("");
  const [massGameVersions, setMassGameVersions] = useState<string[]>([]);
  const [versionMode, setVersionMode] = useState<"unchanged" | "append" | "replace" | "clear">("unchanged");
  const [massCategory, setMassCategory] = useState<string>("");
  const [massSubCategory, setMassSubCategory] = useState<string>("");
  const [massCompliance, setMassCompliance] = useState<string>("");
  const [massConflictId, setMassConflictId] = useState<any>(null);

  const [editReason, setEditReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ done: number; total: number } | null>(null);
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [modsRes, relRes, masonsRes, auditRes] = await Promise.all([
      fetchAllPaginated(() =>
        spokeOversightFrom('mods')
          .select('id, name, status, status_reason, category_override, sub_type, file_extension, compliance_tier, compatible_versions, latest_version, description, is_paid, is_early_access, created_at, updated_at, master_author, mason_id, image_url')
          .order('name')
          .order('id', { ascending: true })
      ),
      fetchAllPaginated(() =>
        supabase
          .from('mod_relationships')
          .select('id, parent_id, child_id, relationship_type')
          .order('id', { ascending: true })
      ),
      fetchAllPaginated(() =>
        supabase
          .from('masons')
          .select('id, name')
          .order('name')
      ),
      supabase
        .from('audit_logs')
        .select('*')
        .ilike('action', 'Mass Updated%')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (modsRes.data) setMods(modsRes.data.filter((m: any) => Number(m?.compliance_tier || 0) < 5));
    if (relRes.data) setModRelationships(relRes.data);
    if (masonsRes.data) setMasonsList(masonsRes.data);
    if (auditRes.data) setRecentChanges(auditRes.data);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const masonNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ms of masonsList) {
      if (ms?.id && ms?.name) map.set(String(ms.id), String(ms.name).trim());
    }
    return map;
  }, [masonsList]);

  const resolveCreatorName = (m: any): string =>
    String((m?.mason_id && masonNameById.get(String(m.mason_id))) || m?.master_author || "").trim();

  const modById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of mods) {
      if (m?.id) map.set(String(m.id), m);
    }
    return map;
  }, [mods]);

  const familyHierarchy = useMemo(
    () => buildFamilyHierarchy(modRelationships, new Set(mods.map((m) => m.id))),
    [modRelationships, mods]
  );

  const relTypeByPair = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of modRelationships) {
      if (r?.parent_id && r?.child_id && r?.relationship_type) {
        map.set(`${r.parent_id}:${r.child_id}`, String(r.relationship_type));
      }
    }
    return map;
  }, [modRelationships]);

  const relTypeByChildId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of modRelationships) {
      if (r?.child_id && r?.relationship_type && !map.has(String(r.child_id))) {
        map.set(String(r.child_id), String(r.relationship_type));
      }
    }
    return map;
  }, [modRelationships]);

  const getChildMods = (parentId: string): { mod: any; relType: string }[] => {
    const childIds = familyHierarchy.childrenByRootId.get(parentId);
    if (!childIds || childIds.size === 0) return [];
    const list: { mod: any; relType: string }[] = [];
    for (const cid of childIds) {
      const childMod = modById.get(cid);
      if (!childMod) continue;
      const relType =
        relTypeByPair.get(`${parentId}:${cid}`) ||
        relTypeByChildId.get(String(cid)) ||
        t("family_addon", "Add-on");
      list.push({ mod: childMod, relType });
    }
    return list.sort((a, b) =>
      String(a.mod.name || "").localeCompare(String(b.mod.name || ""), undefined, { sensitivity: "base" })
    );
  };

  const baseDisplayMods = useMemo(() => {
    if (!groupFamilies) return mods;
    return mods.filter((m) => !familyHierarchy.childToRootMap.has(m.id));
  }, [mods, groupFamilies, familyHierarchy]);

  const masonFilterOptions = useMemo(() => {
    const counts = new Map<string, { key: string; label: string; count: number }>();
    for (const m of baseDisplayMods) {
      const name = resolveCreatorName(m);
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { key, label: name, count: 1 });
      }
    }
    const sorted = Array.from(counts.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    return [
      { id: "", label: t("all", "All") },
      ...sorted.map((entry) => ({
        id: entry.key,
        label: `${entry.label} (${entry.count})`,
        searchText: entry.label,
      })),
    ];
  }, [baseDisplayMods, masonNameById, t]);

  const { availableChildCount, effectiveTargetIds } = useMemo(() => {
    const set = new Set<string>(selectedIds);
    let childCount = 0;
    const countedChildren = new Set<string>();
    for (const id of selectedIds) {
      const children = familyHierarchy.childrenByRootId.get(id);
      if (!children) continue;
      for (const cid of children) {
        if (!modById.has(cid) || selectedIds.has(cid)) continue;
        if (!countedChildren.has(cid)) {
          countedChildren.add(cid);
          childCount += 1;
        }
        if (cascadeChildren) {
          set.add(cid);
        }
      }
    }
    return { availableChildCount: childCount, effectiveTargetIds: set };
  }, [selectedIds, familyHierarchy, modById, cascadeChildren]);

  const handleToggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const hasVersionEdit =
    versionMode === "clear" ||
    ((versionMode === "append" || versionMode === "replace") &&
      massGameVersions.length > 0);

  const executeMassUpdate = async () => {
    if (effectiveTargetIds.size === 0 || !editReason.trim()) return;
    setIsUpdating(true);

    const baseUpdates: any = {};
    if (massStatus) baseUpdates.status = massStatus;
    if (massCategory) baseUpdates.category_override = massCategory;
    if (massSubCategory) baseUpdates.sub_type = massSubCategory;
    if (massCompliance) baseUpdates.compliance_tier = parseInt(massCompliance);

    const nowIso = new Date().toISOString();
    const token = useStore.getState().session?.access_token || "";

    try {
      const ids = Array.from(effectiveTargetIds);
      const CHUNK_SIZE = 10;
      setUpdateProgress({ done: 0, total: ids.length });

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (id) => {
            const mod = modById.get(id) || mods.find((m) => m.id === id);
            const modUpdates: any = { ...baseUpdates };

            if (versionMode === "append" && massGameVersions.length > 0) {
              const existing = Array.isArray(mod?.compatible_versions)
                ? mod.compatible_versions
                : [];
              modUpdates.compatible_versions = Array.from(
                new Set([...existing, ...massGameVersions])
              );
            } else if (versionMode === "replace" && massGameVersions.length > 0) {
              modUpdates.compatible_versions = massGameVersions;
            } else if (versionMode === "clear") {
              modUpdates.compatible_versions = [];
            }

            if (massConflictId && mod) {
              const { error: cErr } = await supabase.rpc('secure_upsert_cloud_file', {
                p_token: token,
                p_target: 'logical_conflicts',
                p_payload: {
                  mod_a_id: id,
                  mod_b_id: massConflictId.id,
                  mod_a: mod.name,
                  mod_b: massConflictId.name,
                  severity_rank: 4,
                },
              });
              if (cErr) throw cErr;
            }

            if (Object.keys(modUpdates).length > 0) {
              modUpdates.updated_at = nowIso;
              const { error: mErr } = await supabase.rpc('secure_upsert_cloud_file', {
                p_token: token,
                p_target: 'mods',
                p_payload: { id, ...modUpdates },
              });
              if (mErr) throw mErr;
            }
          })
        );
        setUpdateProgress({
          done: Math.min(i + chunk.length, ids.length),
          total: ids.length,
        });
      }

      let actionStr = `Mass Updated ${ids.length} Artifacts: `;
      const changes = [];
      const diffPayload: Record<string, any> = {
        affected_artifacts: { to: ids.length },
      };
      if (massStatus) {
        changes.push(`Status->${massStatus}`);
        diffPayload.status = { to: massStatus };
      }
      if (massCategory) {
        changes.push(`Cat->${massCategory}`);
        diffPayload.category_override = { to: massCategory };
      }
      if (massSubCategory) {
        diffPayload.sub_type = { to: massSubCategory };
      }
      if (massCompliance) {
        changes.push(`Tier->${massCompliance}`);
        diffPayload.compliance_tier = { to: massCompliance };
      }
      if (versionMode === "clear") {
        changes.push("Versions Cleared");
        diffPayload.compatible_versions = { to: "Cleared" };
      } else if (hasVersionEdit) {
        changes.push(versionMode === "append" ? "Versions Appended" : "Versions Replaced");
        diffPayload.compatible_versions = { to: massGameVersions.join(", ") };
      }
      if (massConflictId) {
        changes.push(`Added Conflict`);
        diffPayload.conflict_linked = { to: massConflictId.name || massConflictId.id };
      }
      actionStr += changes.join(", ");

      await logArchitectAction(
        actionStr,
        'mods',
        `BATCH OPERATION (${ids.length})`,
        editReason.trim(),
        'Oversight Mass Update',
        false,
        diffPayload
      );

      setMassStatus("");
      setMassCategory("");
      setMassSubCategory("");
      setMassCompliance("");
      setMassGameVersions([]);
      setVersionMode("unchanged");
      setMassConflictId(null);
      setEditReason("");
      setSelectedIds(new Set());
      if (activeTab === "selected") setActiveTab("mass_select");
      setIsActionPanelOpen(false);
      invalidateNexusCatalogCache({ dispatchEvent: true });
      await loadData();
      useStore.getState().pushStatus(t("auto_mass_update_completed_39", "Mass update completed."));
    } catch (e) {
      console.error(e);
      useStore.getState().pushStatus(t("auto_mass_update_failed", "Mass update failed."));
    } finally {
      setUpdateProgress(null);
      setIsUpdating(false);
    }
  };

  const matchesFilters = (m: any) => {
    if (filterCategory && m.category_override !== filterCategory) return false;
    if (filterStatus && normalizeModStatusKey(m.status) !== filterStatus) return false;
    if (filterTier !== "" && Number(m.compliance_tier ?? 0) !== Number(filterTier)) return false;

    if (filterMason) {
      const selfMatchesMason = resolveCreatorName(m).toLowerCase() === filterMason;
      if (!selfMatchesMason) {
        if (!groupFamilies) return false;
        const childIds = familyHierarchy.childrenByRootId.get(m.id);
        let childMatches = false;
        if (childIds) {
          for (const cid of childIds) {
            const cm = modById.get(cid);
            if (cm && resolveCreatorName(cm).toLowerCase() === filterMason) {
              childMatches = true;
              break;
            }
          }
        }
        if (!childMatches) return false;
      }
    }

    if (filterGameVersions.length > 0) {
      const rawVers = Array.isArray(m.compatible_versions) ? m.compatible_versions : [];
      const hasMatch =
        rawVers.length > 0 &&
        filterGameVersions.some(
          (v) => rawVers.includes(v) || isVersionMatch(rawVers, v)
        );
      if (versionFilterMode === "missing") {
        if (hasMatch) return false;
      } else {
        if (!hasMatch) return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const selfMatches =
        String(m.name || "").toLowerCase().includes(q) ||
        resolveCreatorName(m).toLowerCase().includes(q);
      if (!selfMatches) {
        if (!groupFamilies) return false;
        const childIds = familyHierarchy.childrenByRootId.get(m.id);
        let childMatches = false;
        if (childIds) {
          for (const cid of childIds) {
            const cm = modById.get(cid);
            if (
              cm &&
              (String(cm.name || "").toLowerCase().includes(q) ||
                resolveCreatorName(cm).toLowerCase().includes(q))
            ) {
              childMatches = true;
              break;
            }
          }
        }
        if (!childMatches) return false;
      }
    }
    return true;
  };

  const massSelectMods = baseDisplayMods.filter(matchesFilters);
  const selectedDisplayMods = mods.filter((m) => selectedIds.has(m.id)).filter(matchesFilters);
  const filteredMods = activeTab === "selected" ? selectedDisplayMods : massSelectMods;

  useEffect(() => {
    setVisibleCount(100);
    lastClickedIndexRef.current = null;
    setExpandedFamilyId(null);
  }, [activeTab, searchQuery, filterMason, filterCategory, filterStatus, filterTier, filterGameVersions, versionFilterMode, groupFamilies]);

  const visibleModsSlice = filteredMods.slice(0, visibleCount);
  const areAllFilteredSelected =
    filteredMods.length > 0 &&
    filteredMods.every((m) => selectedIds.has(m.id));

  const handleItemSelect = (id: string, indexInVisible: number, e?: React.MouseEvent) => {
    if (
      e?.shiftKey &&
      lastClickedIndexRef.current !== null &&
      lastClickedIndexRef.current !== indexInVisible
    ) {
      const start = Math.min(lastClickedIndexRef.current, indexInVisible);
      const end = Math.max(lastClickedIndexRef.current, indexInVisible);
      const shouldSelect = !selectedIds.has(id);
      const next = new Set(selectedIds);
      for (let i = start; i <= end; i++) {
        const target = visibleModsSlice[i];
        if (!target?.id) continue;
        if (shouldSelect) next.add(target.id);
        else next.delete(target.id);
      }
      setSelectedIds(next);
      lastClickedIndexRef.current = indexInVisible;
      return;
    }
    handleToggle(id);
    lastClickedIndexRef.current = indexInVisible;
  };

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedIds);
    let allSelected = filteredMods.length > 0;
    for (const m of filteredMods) {
      if (!next.has(m.id)) {
        allSelected = false;
        break;
      }
    }
    if (allSelected) {
      filteredMods.forEach((m) => next.delete(m.id));
    } else {
      filteredMods.forEach((m) => next.add(m.id));
    }
    setSelectedIds(next);
  };

  const queuedFieldCount = [
    Boolean(massStatus),
    Boolean(massCompliance),
    Boolean(massCategory),
    hasVersionEdit,
    Boolean(massConflictId),
  ].filter(Boolean).length;

  const hasAnyAction = queuedFieldCount > 0;

  const tabs = [
    { id: "overview", label: t("overview", "Overview"), icon: t("icon_dashboard", "dashboard"), number: baseDisplayMods.length.toString() },
    { id: "mass_select", label: t("mass_update_apply", "Mass Select"), icon: t("icon_checklist", "checklist"), number: massSelectMods.length.toString() },
    {
      id: "selected",
      label: t("selected", "Selected"),
      icon: t("icon_task_alt", "task_alt"),
      number: selectedIds.size.toString(),
    },
    { id: "recent", label: t("tab_recent", "Recent Changes"), icon: t("icon_history", "history"), number: recentChanges.length.toString() }
  ];

  const renderModCard = (
    m: any,
    onCardClick: (e?: React.MouseEvent) => void,
    opts?: { isChildCard?: boolean; relType?: string }
  ) => {
    const isSelected = selectedIds.has(m.id);
    const statusMeta = getModStatusMeta(m.status);
    const childMods = !opts?.isChildCard && groupFamilies ? getChildMods(m.id) : [];
    const isFamilyExpanded = groupFamilies && expandedFamilyId === m.id;
    const previewNames = childMods.slice(0, 6).map((c) => c.mod.name).filter(Boolean).join(", ");
    const familyTooltipSubtitle = childMods.length > 6
      ? `${previewNames} (+${childMods.length - 6})`
      : previewNames;
    const creatorLabel = resolveCreatorName(m) || t("unknown_mason", "Unknown {Mason}");
    const versionDisplay = m.compatible_versions?.length
      ? formatVersionRangesLabel(m.compatible_versions)
      : t("untagged", "Untagged");
    const rawReason = String(m.status_reason || "").trim();
    const cleanReason = /^\[ARCHITECT\b/i.test(rawReason) ? "" : rawReason;
    const cleanDescription = stripMarkdown(String(m.description || "")).trim();
    const dateStr = (m.updated_at || m.created_at)
      ? new Date(m.updated_at || m.created_at).toLocaleDateString()
      : "";

    return (
      <div key={m.id} className="relative flex flex-col h-full">
        <HoverTooltip
          delay={350}
          content={
            <div className="py-1.5 w-[280px] sm:w-[320px] flex flex-col gap-2 text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-[var(--text)] leading-snug break-words">
                    {m.name}
                  </div>
                  <div className="text-[11px] font-medium text-[var(--subtext)] break-words">
                    {t("by_prefix", "By")} {creatorLabel}
                    {m.latest_version ? ` • ${m.latest_version}` : ""}
                  </div>
                </div>
                <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5 shrink-0`}>
                  <span className={`material-symbols-outlined !text-[11px] ${statusMeta.iconColor}`}>
                    {statusMeta.icon}
                  </span>
                  <span>{statusMeta.label}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                  <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                    {t("icon_shield", "shield")}
                  </span>
                  <span>T{m.compliance_tier ?? 0}</span>
                </span>
                {m.category_override && (
                  <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                    <span className="material-symbols-outlined !text-[11px] text-[var(--subtext)]">
                      {t("icon_category", "category")}
                    </span>
                    <span>
                      {m.category_override}
                      {m.sub_type ? ` • ${m.sub_type}` : ""}
                    </span>
                  </span>
                )}
                {m.file_extension && (
                  <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                    <span className="material-symbols-outlined !text-[11px] text-[var(--subtext)]">
                      {t("icon_deployed_code", "deployed_code")}
                    </span>
                    <span className="font-mono">{String(m.file_extension).trim()}</span>
                  </span>
                )}
                {m.is_paid && (
                  <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                    <span className="material-symbols-outlined !text-[11px] text-[var(--warning)]">
                      {t("icon_monetization_on", "monetization_on")}
                    </span>
                    <span>{t("badge_paid", "Paid")}</span>
                  </span>
                )}
                {m.is_early_access && (
                  <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                    <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                      {t("icon_science", "science")}
                    </span>
                    <span>{t("badge_early_access", "Early Access")}</span>
                  </span>
                )}
                {opts?.isChildCard && opts.relType && (
                  <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                    <span className="material-symbols-outlined !text-[11px] text-[var(--subtext)]">
                      {t("icon_subdirectory_arrow_right", "subdirectory_arrow_right")}
                    </span>
                    <span className="capitalize">{opts.relType.replace(/_/g, " ")}</span>
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1 text-[11px] text-[var(--subtext)]">
                <div className="flex items-start gap-1.5">
                  <span className="material-symbols-outlined !text-[13px] opacity-75 shrink-0 mt-0.5">
                    {t("icon_videogame_asset", "videogame_asset")}
                  </span>
                  <span className="font-mono text-[10.5px] text-[var(--text)] break-words">
                    {versionDisplay}
                  </span>
                </div>
                {dateStr && (
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[13px] opacity-75 shrink-0">
                      {t("icon_schedule", "schedule")}
                    </span>
                    <span>{t("updated_date", "Last Updated")}: {dateStr}</span>
                  </div>
                )}
              </div>

              {cleanReason ? (
                <div className="text-[11px] text-[var(--warning)] leading-snug line-clamp-2 break-words">
                  {cleanReason}
                </div>
              ) : cleanDescription ? (
                <div className="text-[11px] text-[var(--subtext)] leading-relaxed line-clamp-3 break-words">
                  {cleanDescription}
                </div>
              ) : null}

              {childMods.length > 0 && (
                <div className="flex items-start gap-1.5 text-[11px] text-[var(--subtext)]">
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0 mt-0.5">
                    {t("icon_account_tree", "account_tree")}
                  </span>
                  <span className="leading-snug break-words">
                    <strong className="text-[var(--text)] font-bold">
                      +{childMods.length} {t("badge_modules_count", "Modules")}:
                    </strong>{" "}
                    {familyTooltipSubtitle}
                  </span>
                </div>
              )}

              <div className="text-[10px] text-[var(--subtext)] opacity-65 pt-0.5">
                {t("mass_card_inspect_hint", "Right-click -> Inspect to open {Mod} Dossier")}
              </div>
            </div>
          }
        />
        <UniversalCard
          onClick={(e) => onCardClick(e)}
          onContextMenu={(e) => {
            openSanctuaryContextMenu(e, [
              {
                label: isSelected ? t("deselect", "Deselect") : t("select", "Select"),
                icon: isSelected ? t("icon_check_box_outline_blank", "check_box_outline_blank") : t("icon_check_box", "check_box"),
                onClick: () => onCardClick(),
              },
              {
                label: t("inspect", "Inspect"),
                icon: t("icon_open_in_new", "open_in_new"),
                onClick: () => openModDossier({ ...m, isNexusView: true }),
              },
              ...(childMods.length > 0
                ? [
                    {
                      label: isFamilyExpanded
                        ? t("collapse_family", "Collapse Family")
                        : `${t("expand_family", "Expand Family")} (${childMods.length})`,
                      icon: t("icon_account_tree", "account_tree"),
                      onClick: () => setExpandedFamilyId((prev) => (prev === m.id ? null : m.id)),
                    },
                  ]
                : []),
              ...(selectedIds.size > 0
                ? [
                    {
                      label: `${t("tab_mass_update", "Mass Update")} (${effectiveTargetIds.size})`,
                      icon: t("icon_tune", "tune"),
                      onClick: () => setIsActionPanelOpen(true),
                    },
                  ]
                : []),
              {
                divider: true,
                label: t("copy_title", "Copy Title"),
                icon: t("icon_content_copy", "content_copy"),
                onClick: () => navigator.clipboard?.writeText(m.name || ""),
              },
            ]);
          }}
          layout="vertical-compact"
          className={isSelected ? "!border-[color-mix(in_srgb,var(--text)_32%,transparent)] h-full" : "h-full"}
          icon={isSelected ? t("icon_check", "check") : t("icon_extension", "extension")}
          customIcon={
            <DynamicArtifactPreviewBanner
              data={m}
              compact={true}
              icon={isSelected ? t("icon_check", "check") : t("icon_extension", "extension")}
              heightClass="h-full"
            />
          }
          title={m.name}
          subtitle={`${t("by_prefix", "By")} ${creatorLabel}`}
          imageOverlay={
            <div className="absolute inset-x-3 top-2.5 flex items-center justify-between gap-2 z-30 pointer-events-none">
              <div className={VAULT_CHIP_CLASS}>
                <span className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColor}`}>
                  {statusMeta.icon}
                </span>
                <span>{statusMeta.label}</span>
              </div>
              <div
                className={`w-6 h-6 rounded-lg glass-surface border flex items-center justify-center transition-all shrink-0 ${
                  isSelected
                    ? "bg-[color-mix(in_srgb,var(--text)_12%,transparent)] border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[var(--accent)]"
                    : "border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-transparent"
                }`}
              >
                <span className="material-symbols-outlined !text-[14px] font-black">
                  {t("icon_check", "check")}
                </span>
              </div>
            </div>
          }
          badges={
            <>
              {opts?.isChildCard && opts.relType && (
                <div className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                    {t("icon_subdirectory_arrow_right", "subdirectory_arrow_right")}
                  </span>
                  <span className="capitalize">{opts.relType.replace(/_/g, " ")}</span>
                </div>
              )}
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_shield", "shield")}
                </span>
                <span>T{m.compliance_tier ?? 0}</span>
              </div>
              {m.category_override && (
                <div className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                    {t("icon_category", "category")}
                  </span>
                  <span>{m.category_override}</span>
                </div>
              )}
            </>
          }
          footer={
            <div className="flex items-center justify-between gap-2 w-full min-h-[20px] text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="material-symbols-outlined !text-[12px] opacity-70 shrink-0">
                  {t("icon_videogame_asset", "videogame_asset")}
                </span>
                <span className="truncate font-mono normal-case">{versionDisplay}</span>
              </span>
              {childMods.length > 0 && (
                <button
                  type="button"
                  aria-expanded={isFamilyExpanded}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedFamilyId((prev) => (prev === m.id ? null : m.id));
                  }}
                  className={`ml-auto h-6 px-2.5 -my-0.5 rounded-full glass-surface border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 transition-all cursor-pointer pointer-events-auto shadow-sm ${
                    isFamilyExpanded
                      ? "sa-glass-pill-active border-[color-mix(in_srgb,var(--text)_36%,transparent)] text-[var(--text)]"
                      : "sa-glass-pill-hover bg-[color-mix(in_srgb,var(--text)_8%,transparent)] border-[color-mix(in_srgb,var(--text)_22%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_36%,transparent)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                    {isFamilyExpanded
                      ? t("icon_folder_open", "folder_open")
                      : t("icon_account_tree", "account_tree")}
                  </span>
                  <span className="tabular-nums">
                    +{childMods.length} {t("badge_modules_count", "Modules")}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[14px] transition-transform duration-300 ${
                      isFamilyExpanded
                        ? "rotate-180 text-[var(--text)]"
                        : "text-[var(--subtext)]"
                    }`}
                  >
                    {t("icon_expand_more", "expand_more")}
                  </span>
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  };

  const renderFamilyDrawer = (m: any) => {
    const childMods = groupFamilies ? getChildMods(m.id) : [];
    if (childMods.length === 0) return null;
    const isFamilyOpen = groupFamilies && expandedFamilyId === m.id;
    const familyIds = [m.id, ...childMods.map((c) => c.mod.id)];
    const allFamilySelected = familyIds.every((fid) => selectedIds.has(fid));

    return (
      <AccordionDrawer isOpen={isFamilyOpen}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] p-4 sm:p-5 flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                  {t("icon_account_tree", "account_tree")}
                </span>
              </div>
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-xs font-black text-[var(--text)] truncate max-w-[320px]">
                  {m.name}
                </span>
                <span className={VAULT_CHIP_CLASS}>
                  {childMods.length} {t("badge_modules_count", "Modules")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const next = new Set(selectedIds);
                  if (allFamilySelected) {
                    familyIds.forEach((fid) => next.delete(fid));
                  } else {
                    familyIds.forEach((fid) => next.add(fid));
                  }
                  setSelectedIds(next);
                }}
                className="sa-dropdown-action-chip px-3 h-7 text-[10px] font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                  {allFamilySelected
                    ? t("icon_deselect", "deselect")
                    : t("icon_done_all", "done_all")}
                </span>
                <span>
                  {allFamilySelected
                    ? t("deselect_family", "Deselect Family")
                    : t("select_family", "Select Family")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setExpandedFamilyId(null)}
                className="sa-dropdown-action-chip px-2.5 h-7 text-[10px] font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_close", "close")}
                </span>
                <span>{t("close", "Close")}</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
            {childMods.map((c) =>
              renderModCard(
                c.mod,
                () => handleToggle(c.mod.id),
                { isChildCard: true, relType: c.relType }
              )
            )}
          </div>
        </div>
      </AccordionDrawer>
    );
  };

  const renderBatchLogCard = (log: any) => {
    const parsed = parseAuditLogEntry(log);
    return (
      <UniversalCard
        key={log.id}
        layout="vertical"
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(log.action || ""),
            },
          ]);
        }}
        icon={t("icon_history", "history")}
        title={log.action}
        subtitle={log.target_name || t("batch_operation", "Batch Operation")}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {t("icon_done_all", "done_all")}
              </span>
              <span>{t("completed", "Completed")}</span>
            </div>
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_database", "database")}
              </span>
              <span>{formatAuditTableLabel(log.target_table, t)}</span>
            </div>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_calendar_today", "calendar_today")}
              </span>
              <span>{new Date(log.created_at).toLocaleDateString()}</span>
            </div>
          </>
        }
        footer={
          <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
            <span className="flex items-center gap-1.5 truncate pr-2">
              <span className="material-symbols-outlined !text-[12px] opacity-70">
                {t("icon_schedule", "schedule")}
              </span>
              {new Date(log.created_at).toLocaleTimeString()}
            </span>
            <span className="text-[var(--text)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 shrink-0">
              {t("status_recorded", "Recorded")}
            </span>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 m-0">
            {parsed.cleanReason || t("no_reason", "No reason provided")}
          </p>
          {parsed.changes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {parsed.changes.slice(0, 3).map((chg, idx) => (
                <span key={`${chg.field}-${idx}`} className={VAULT_CHIP_CLASS}>
                  <span className="opacity-70">{chg.label}:</span>
                  <span className="text-[var(--accent)]">
                    {chg.to ?? chg.from ?? ""}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </UniversalCard>
    );
  };

  const isSelectionTab = activeTab === 'mass_select' || activeTab === 'selected';

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_mass_update", "Mass Update")}
      headerSubtitle={t("mass_update_subtitle", "Select {mods} to perform batch operations")}
      headerIcon={t("icon_batch_prediction", "batch_prediction")}
      headerIconColorClass="theme-text-accent"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("search_placeholder", "Search {Mods} or {Masons}...") as string}
      hideSearch={!isSelectionTab}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={tabs}
      headerActions={
        isSelectionTab && selectedIds.size > 0 ? (
          <button
            type="button"
            onClick={() => setIsActionPanelOpen(true)}
            className="h-full px-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
              {t("icon_tune", "tune")}
            </span>
            <span>
              {t("edit", "Edit")} ({effectiveTargetIds.size})
            </span>
          </button>
        ) : undefined
      }
      actions={isSelectionTab ? [
        {
          id: "toggle_group_families",
          icon: groupFamilies ? t("icon_account_tree", "account_tree") : t("icon_view_module", "view_module"),
          label: groupFamilies
            ? t("studio_group_families", "Group {Mod} Families")
            : t("studio_flat_list", "Flat List"),
          onClick: () => setGroupFamilies((prev) => !prev),
        },
        ...(filteredMods.length > 0 ? [{
          id: "selectAll",
          icon: areAllFilteredSelected ? t("icon_deselect", "deselect") : t("icon_done_all", "done_all"),
          label: areAllFilteredSelected
            ? t("deselect", "Deselect")
            : `${t("btn_select_all", "Select All")} (${filteredMods.length})`,
          onClick: handleSelectAllFiltered,
        }] : []),
        ...(selectedIds.size > 0 ? [{
          id: "clearSelection",
          icon: t("icon_close", "close"),
          label: t("clear", "Clear"),
          onClick: () => {
            setSelectedIds(new Set());
            if (activeTab === "selected") setActiveTab("mass_select");
          },
        }] : []),
      ] : undefined}
      primaryPopover={isSelectionTab ? {
        icon: t("icon_tune", "tune"),
        label: t("filters", "Filters"),
        isActive: Boolean(filterMason || filterCategory || filterStatus || filterTier !== "" || filterGameVersions.length > 0),
        content: (
          <div className="flex flex-col w-[340px] p-4 max-w-[calc(100vw-40px)] gap-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                {t("filters", "Filters")}
              </span>
              {(filterMason || filterCategory || filterStatus || filterTier !== "" || filterGameVersions.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterMason("");
                    setFilterCategory("");
                    setFilterStatus("");
                    setFilterTier("");
                    setFilterGameVersions([]);
                    setVersionFilterMode("match");
                  }}
                  className="sa-dropdown-action-chip px-2.5 h-6 text-[9px] font-bold uppercase tracking-wider cursor-pointer shrink-0"
                >
                  {t("reset", "Reset")}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("mason", "{Mason}")}</span>
              <CustomDropdown
                disableTint={true}
                searchable={true}
                searchPlaceholder={t("search_masons", "Search {Masons}...")}
                value={filterMason}
                onChange={(v: string[]) => setFilterMason(v[0] || "")}
                options={masonFilterOptions}
              />
            </div>
            <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category", "Category")}</span>
              <CustomDropdown
                disableTint={true}
                value={filterCategory}
                onChange={(v: string[]) => setFilterCategory(v[0])}
                options={[
                  { id: "", label: t("filter_all", "All Categories") },
                  ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                    id: cat.id,
                    label: t(cat.lexicon_key, cat.id)
                  })) || [])
                ]}
              />
            </div>
            <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("compliance_tier", "Compliance Tier")}</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "", label: t("all", "All") },
                  { id: "0", label: "T0" },
                  { id: "1", label: "T1" },
                  { id: "2", label: "T2" },
                  { id: "3", label: "T3" },
                  { id: "4", label: "T4" },
                ].map((tr) => (
                  <button
                    key={tr.id || "all"}
                    type="button"
                    onClick={() => setFilterTier(tr.id)}
                    className={`sa-dropdown-filter-tab px-2.5 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer truncate ${
                      filterTier === tr.id ? "is-active" : ""
                    }`}
                  >
                    {tr.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("status", "Status")}</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "", label: t("all", "All") },
                  { id: "stable", label: t("status_stable", "Stable") },
                  { id: "unstable", label: t("label_unstable", "Unstable") },
                  { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                  { id: "under_review", label: t("status_dd_review", "Under Review") },
                  { id: "pending", label: t("status_pending", "Pending") },
                ].map((st) => (
                  <button
                    key={st.id || "all"}
                    type="button"
                    onClick={() => setFilterStatus(st.id)}
                    className={`sa-dropdown-filter-tab px-2.5 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer truncate ${
                      filterStatus === st.id ? "is-active" : ""
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("sa_game_versions", "Game Versions")}</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "match" as const, label: t("mass_ver_matches", "Matches Version") },
                  { id: "missing" as const, label: t("mass_ver_missing", "Missing Version") },
                ].map((vm) => (
                  <button
                    key={vm.id}
                    type="button"
                    onClick={() => setVersionFilterMode(vm.id)}
                    className={`sa-dropdown-filter-tab px-2.5 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer truncate ${
                      versionFilterMode === vm.id ? "is-active" : ""
                    }`}
                  >
                    {vm.label}
                  </button>
                ))}
              </div>
              <GameVersionMultiSelect mode="filter" selectedVersions={filterGameVersions} onChange={setFilterGameVersions} />
            </div>
          </div>
        )
      } : undefined}
    >
      <div className="flex flex-col gap-5 relative w-full">
        {loading ? (
          <EmptyState
            icon={t("icon_sync", "sync")}
            title={t("loading_registry", "Loading Registry...")}
          />
        ) : activeTab === 'overview' ? (
          <HubOverviewLanding>
            <HubOverviewSection
              icon={t("icon_inventory_2", "inventory_2")}
              iconColorClass="text-[var(--accent)]"
              title={t("term_mods", "Artifact Registry")}
              isEmpty={baseDisplayMods.length === 0}
              emptyIcon={t("icon_inventory_2", "inventory_2")}
              emptyTitle={t("no_artifacts", "Creator No {Mods}")}
            >
              {baseDisplayMods.slice(0, 4).map(mod => (
                <React.Fragment key={mod.id}>
                  {renderModCard(mod, () => {
                    handleToggle(mod.id);
                    setActiveTab('mass_select');
                  })}
                  {renderFamilyDrawer(mod)}
                </React.Fragment>
              ))}
            </HubOverviewSection>
            <HubOverviewSection
              icon={t("icon_history", "history")}
              iconColorClass="text-[var(--success)]"
              title={t("recent_activity", "Recent Batch Updates")}
              isEmpty={recentChanges.length === 0}
              emptyIcon={t("icon_history", "history")}
              emptyTitle={t("mass_update_no_recent", "No recent mass updates recorded yet.")}
            >
              {recentChanges.slice(0, 4).map(renderBatchLogCard)}
            </HubOverviewSection>
          </HubOverviewLanding>
        ) : activeTab === 'recent' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {recentChanges.map(renderBatchLogCard)}
            {recentChanges.length === 0 && (
              <EmptyState
                icon={t("icon_history", "history")}
                title={t("mass_update_no_recent", "No recent mass updates recorded yet.")}
                className="col-span-full py-16"
              />
            )}
          </div>
        ) : (
          <>
            {visibleModsSlice.length > 0 && (
              <div className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5 w-full">
                {visibleModsSlice.map((m, idx) => (
                  <React.Fragment key={m.id}>
                    {renderModCard(m, (e) => handleItemSelect(m.id, idx, e))}
                    {renderFamilyDrawer(m)}
                  </React.Fragment>
                ))}
              </div>
            )}

            {filteredMods.length > visibleCount && (
              <div className="flex justify-center w-full py-6">
                <button
                  type="button"
                  onClick={() => setVisibleCount(v => v + 100)}
                  className="px-10 py-3.5 rounded-full glass-panel sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] font-black capitalize tracking-widest transition-all shadow-xl flex items-center gap-3 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[20px] text-[var(--accent)]">{t("icon_expand_more", "expand_more")}</span>
                  <span>{t("load_more", "Load More")} ({visibleCount} / {filteredMods.length})</span>
                </button>
              </div>
            )}

            {!loading && filteredMods.length === 0 && (
              <EmptyState icon={t("icon_extension_off", "extension_off")} title={t("sa_no_artifacts", "No {mods} found.")} className="py-16" />
            )}
          </>
        )}
      </div>

      <SidePanel
        isOpen={isActionPanelOpen}
        onClose={() => setIsActionPanelOpen(false)}
        title={t("tab_mass_update", "Mass Update")}
        subtitle={`${effectiveTargetIds.size} ${t("artifacts_selected", "{Mods} Selected")}`}
        icon={t("icon_batch_prediction", "batch_prediction")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[92vw] md:w-[760px]"
        keepMounted={true}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_done_all", "done_all")}
              variant="success"
              tooltip={isUpdating ? t("ui_btn_processing", "Executing...") : t("tab_mass_update", "Mass Update")}
              disabled={isUpdating || effectiveTargetIds.size === 0 || !hasAnyAction || !editReason.trim()}
              onClick={executeMassUpdate}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_batch_prediction", "batch_prediction")}
            overline={t("tab_mass_update", "Mass Update")}
            title={`${effectiveTargetIds.size} ${t("artifacts_selected", "{Mods} Selected")}`}
            description={t("mass_update_subtitle", "Select {mods} to perform batch operations")}
            badge={`${queuedFieldCount} ${t("mass_queued_edits", "Queued Edits")}`}
            badgeIcon={t("icon_tune", "tune")}
            variant="default"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("artifacts_selected", "{Mods} Selected")}
                value={effectiveTargetIds.size}
                icon={t("icon_checklist", "checklist")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("mass_queued_edits", "Queued Field Edits")}
                value={queuedFieldCount}
                icon={t("icon_tune", "tune")}
                iconColorClass={queuedFieldCount > 0 ? "text-[var(--success)]" : "text-[var(--subtext)]"}
              />
            </div>
            {availableChildCount > 0 && (
              <SidePanelPillToggle
                label={`${t("mass_cascade_children", "Include Linked Child / Add-on {Mods}")} (+${availableChildCount})`}
                icon={t("icon_account_tree", "account_tree")}
                checked={cascadeChildren}
                onChange={setCascadeChildren}
              />
            )}
          </SidePanelHeroCard>

          <UniversalGroup title={t("tab_metadata", "Metadata & Telemetry")} icon={t("icon_tune", "tune")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 relative z-50">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("status", "Status")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={massStatus}
                  onChange={(v: string[]) => setMassStatus(v[0])}
                  options={[
                    { id: "", label: t("no_change", "No Change") },
                    { id: "stable", label: t("status_stable", "Stable") },
                    { id: "unstable", label: t("label_unstable", "Unstable") },
                    { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                    { id: "under_review", label: t("status_dd_review", "Under Review") },
                    { id: "pending", label: t("status_pending", "Pending") },
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1.5 relative z-40">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("compliance_tier", "Compliance Tier")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={massCompliance}
                  onChange={(v: string[]) => setMassCompliance(v[0])}
                  options={[
                    { id: "", label: t("no_change", "No Change") },
                    { id: "0", label: t("tier_0_label", "Clean / Safe (T0)") },
                    { id: "1", label: t("tier_1_label", "Adult / NSFW (T1)") },
                    { id: "2", label: t("tier_2_label", "Illicit / Substance (T2)") },
                    { id: "3", label: t("tier_3_label", "Extreme / Violence (T3)") },
                    { id: "4", label: t("tier_4_label", "Taboo / Sensitive (T4)") },
                    { id: "5", label: t("tier_5_label", "Malware / Security Threat (T5)") }
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1.5 relative z-30">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("category", "Category")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={massCategory}
                  onChange={(v: string[]) => setMassCategory(v[0])}
                  options={[
                    { id: "", label: t("no_change", "No Change") },
                    ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                      id: cat.id,
                      label: t(cat.lexicon_key, cat.id) || cat.id
                    })) || [])
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1.5 relative z-20">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("mass_assign_conflict", "Assign Logical Conflict")}
                </label>
                <ModSearchDropdown
                  placeholder={t("auto_select_artifact_to_32", "Select {Mods} to Assign...")}
                  selectedItem={massConflictId}
                  onSelect={setMassConflictId}
                  onClear={() => setMassConflictId(null)}
                  modList={mods}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 relative z-10">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                {t("sa_game_versions", "Game Versions")}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "unchanged" as const, label: t("no_change", "No Change") },
                  { id: "append" as const, label: t("mass_ver_append", "Append Versions") },
                  { id: "replace" as const, label: t("mass_ver_replace", "Replace Versions") },
                  { id: "clear" as const, label: t("mass_ver_clear", "Clear Versions") },
                ].map((vm) => (
                  <button
                    key={vm.id}
                    type="button"
                    onClick={() => setVersionMode(vm.id)}
                    className={`sa-dropdown-filter-tab px-3 h-9 rounded-xl glass-surface border text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all truncate ${
                      versionMode === vm.id ? "is-active" : ""
                    }`}
                  >
                    {vm.label}
                  </button>
                ))}
              </div>
              {(versionMode === "append" || versionMode === "replace") && (
                <GameVersionMultiSelect
                  selectedVersions={massGameVersions}
                  onChange={setMassGameVersions}
                />
              )}
            </div>
          </UniversalGroup>

          <UniversalGroup title={t("reason", "Reason")} icon={t("icon_edit_note", "edit_note")}>
            <UniversalTextArea
              label={`${t("reason", "Reason")} *`}
              value={editReason}
              onChange={setEditReason}
              placeholder={t("reason_update", "Enter reason for mass update...")}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-[11px] font-bold text-[var(--subtext)] opacity-75">
                {effectiveTargetIds.size === 0
                  ? t("mass_hint_select", "Select at least one {mod} to update.")
                  : !hasAnyAction
                    ? t("mass_hint_action", "Choose at least one field change above.")
                    : !editReason.trim()
                      ? t("mass_hint_reason", "Enter an audit justification to apply.")
                      : `${effectiveTargetIds.size} ${t("artifacts_selected", "{Mods} Selected")}`}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <ActionButton
                  variant="glass"
                  icon={t("icon_close", "close")}
                  label={t("cancel", "Cancel")}
                  onClick={() => setIsActionPanelOpen(false)}
                />
                <ActionButton
                  variant="primary"
                  icon={t("icon_done_all", "done_all")}
                  label={
                    isUpdating
                      ? updateProgress
                        ? `${t("ui_btn_processing", "Executing...")} (${updateProgress.done}/${updateProgress.total})`
                        : t("ui_btn_processing", "Executing...")
                      : `${t("tab_mass_update", "Mass Update")} (${effectiveTargetIds.size})`
                  }
                  disabled={
                    isUpdating ||
                    effectiveTargetIds.size === 0 ||
                    !hasAnyAction ||
                    !editReason.trim()
                  }
                  onClick={executeMassUpdate}
                />
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("artifacts_selected", "{Mods} Selected")}
            count={selectedIds.size}
            icon={t("icon_inventory_2", "inventory_2")}
            headerAction={
              selectedIds.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="my-auto sa-dropdown-action-chip px-3 h-7 text-[10px] font-bold uppercase tracking-wider cursor-pointer shrink-0"
                >
                  {t("clear", "Clear")}
                </button>
              ) : undefined
            }
          >
            {selectedIds.size === 0 ? (
              <EmptyState
                icon={t("icon_extension_off", "extension_off")}
                title={t("mass_hint_select", "Select at least one {mod} to update.")}
                className="py-6"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                {Array.from(selectedIds).map((selId) => {
                  const selMod = modById.get(selId) || mods.find((m) => m.id === selId);
                  const creatorLabel = selMod
                    ? resolveCreatorName(selMod) || t("unknown_mason", "Unknown {Mason}")
                    : t("unknown_mason", "Unknown {Mason}");
                  let cascadeExtra = 0;
                  if (cascadeChildren) {
                    const children = familyHierarchy.childrenByRootId.get(selId);
                    if (children) {
                      for (const cid of children) {
                        if (modById.has(cid) && !selectedIds.has(cid)) {
                          cascadeExtra += 1;
                        }
                      }
                    }
                  }
                  return (
                    <UniversalCard
                      key={selId}
                      layout="compact"
                      image={selMod?.image_url}
                      icon={t("icon_extension", "extension")}
                      title={selMod?.name || selId.substring(0, 8)}
                      subtitle={creatorLabel}
                      onClick={() => selMod && openModDossier({ ...selMod, isNexusView: true })}
                      actions={
                        <div className="flex items-center gap-1.5 shrink-0">
                          {cascadeExtra > 0 && (
                            <span className={VAULT_CHIP_CLASS}>+{cascadeExtra}</span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggle(selId);
                            }}
                            aria-label={t("remove", "Remove")}
                            className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_close", "close")}
                            </span>
                          </button>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            )}
          </UniversalGroup>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}
