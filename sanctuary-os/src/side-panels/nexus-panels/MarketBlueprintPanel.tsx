import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../supabase";
import { useLexicon } from "../../LexiconContext";
import { CustomDropdown, SidePanel, SidePanelHeroCard, UniversalGroup, StatBox, DashboardStatTile, SidePanelFilterBar, ActionButton, PanelHeaderGroup, PanelHeaderButton, ActionPill, VAULT_CHIP_CLASS, EmptyState, isScriptExtension } from "../../shared";
import { formatCleanModTitle, extractValidCreator } from "../CommandIncompatiblePanel";
import { useStore } from "../../store";
import { useModalStore } from "../../store/modalStore";
import { isDesktop } from "../../utils/envUtils";
import { groupBlueprintArtifactsByFamily, BlueprintInspectorModCard } from "./blueprintComplianceAndInspector";

export function MarketBlueprintPanel({
  selectedBlueprint,
  setSelectedBlueprint,
  onOpenDossier,
  syncBlueprintByCode,
  onDownloadSuccess,
  onReportBlueprint,
  backdropZ = "z-[15000]",
  panelZ = "z-[15001]",
}: any) {
  const { t } = useLexicon();

  const [enrichedBlueprint, setEnrichedBlueprint] = useState(selectedBlueprint);
  const [cloudEnrichmentMap, setCloudEnrichmentMap] = useState<Map<string, any>>(
    () => new Map()
  );
  const [visibleCount, setVisibleCount] = useState(40);
  const [filterTab, setFilterTab] = useState<"ALL" | "MISSING" | "IN_VAULT">("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PACKAGE" | "SCRIPT" | "SUITE">("ALL");
  const [accessFilter, setAccessFilter] = useState<"ALL" | "FREE" | "EARLY_ACCESS" | "PAID">("ALL");
  const [creatorFilter, setCreatorFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<
    "default" | "name_asc" | "creator_asc" | "modules_desc" | "load_order"
  >("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const modList = useStore((state) => state.modList);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const playSets = useStore((state) => state.playSets) || [];

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

  const allGroupedFamilies = useMemo(() => {
    const rawArtifacts =
      enrichedBlueprint?.json_data?.artifacts ||
      enrichedBlueprint?.artifacts ||
      enrichedBlueprint?.originalBlueprint?.artifacts ||
      [];
    const grouped = groupBlueprintArtifactsByFamily(rawArtifacts, {
      modList,
      activeGameSchema,
      localVaultHashes,
      cloudEnrichmentMap,
    });
    return grouped.sort((a: any, b: any) => {
      const aPremium = a.is_paid || a.is_early_access ? 1 : 0;
      const bPremium = b.is_paid || b.is_early_access ? 1 : 0;
      if (aPremium !== bPremium) return bPremium - aPremium;
      return String(a._groupedTitle || a.name || "").localeCompare(
        String(b._groupedTitle || b.name || "")
      );
    });
  }, [enrichedBlueprint, modList, activeGameSchema, localVaultHashes, cloudEnrichmentMap]);

  const missingFamiliesCount = useMemo(
    () => allGroupedFamilies.filter((f: any) => !f._allOwned).length,
    [allGroupedFamilies]
  );

  const availableCreators = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of allGroupedFamilies) {
      const c = extractValidCreator(f, ...(Array.isArray(f._groupedMods) ? f._groupedMods : []));
      if (c) {
        const clean = formatCleanModTitle(c) || c;
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ id: name, label: `${name} (${count})` }));
  }, [allGroupedFamilies]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterTab !== "ALL") count++;
    if (typeFilter !== "ALL") count++;
    if (accessFilter !== "ALL") count++;
    if (creatorFilter !== "ALL") count++;
    if (sortBy !== "default") count++;
    return count;
  }, [filterTab, typeFilter, accessFilter, creatorFilter, sortBy]);

  const resetAllFilters = () => {
    setFilterTab("ALL");
    setTypeFilter("ALL");
    setAccessFilter("ALL");
    setCreatorFilter("ALL");
    setSortBy("default");
    setVisibleCount(40);
  };

  const displayArtifacts = useMemo(() => {
    let filtered = allGroupedFamilies;
    if (filterTab === "MISSING") {
      filtered = filtered.filter((f: any) => !f._allOwned);
    } else if (filterTab === "IN_VAULT") {
      filtered = filtered.filter((f: any) => Boolean(f._allOwned));
    }

    if (typeFilter !== "ALL") {
      filtered = filtered.filter((f: any) => {
        const gMods = Array.isArray(f._groupedMods) && f._groupedMods.length > 0 ? f._groupedMods : [f];
        const hasScript = gMods.some((gm: any) =>
          isScriptExtension(String(gm?._cleanFilePart || gm?.name || ""), activeGameSchema)
        );
        const isSuite = Boolean(f.isCollection || gMods.length > 1);
        if (typeFilter === "SUITE") return isSuite;
        if (typeFilter === "SCRIPT") return hasScript;
        if (typeFilter === "PACKAGE") return !hasScript && !isSuite;
        return true;
      });
    }

    if (accessFilter !== "ALL") {
      filtered = filtered.filter((f: any) => {
        if (accessFilter === "PAID") return Boolean(f.is_paid);
        if (accessFilter === "EARLY_ACCESS") return Boolean(f.is_early_access);
        if (accessFilter === "FREE") return !f.is_paid && !f.is_early_access;
        return true;
      });
    }

    if (creatorFilter !== "ALL") {
      filtered = filtered.filter((f: any) => {
        const c = extractValidCreator(f, ...(Array.isArray(f._groupedMods) ? f._groupedMods : []));
        const clean = c ? formatCleanModTitle(c) || c : "";
        return clean.toLowerCase() === creatorFilter.toLowerCase();
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((f: any) => {
        if (String(f._groupedTitle || f.name || "").toLowerCase().includes(q)) {
          return true;
        }
        if (String(f.author || "").toLowerCase().includes(q)) {
          return true;
        }
        if (Array.isArray(f._groupedMods)) {
          return f._groupedMods.some(
            (gm: any) =>
              String(gm._cleanModuleTitle || "").toLowerCase().includes(q) ||
              String(gm._cleanFilePart || gm.name || "").toLowerCase().includes(q) ||
              String(gm.author || "").toLowerCase().includes(q)
          );
        }
        return false;
      });
    }

    if (sortBy !== "default") {
      filtered = [...filtered].sort((a: any, b: any) => {
        if (sortBy === "name_asc") {
          return String(a._groupedTitle || a.name || "").localeCompare(
            String(b._groupedTitle || b.name || "")
          );
        }
        if (sortBy === "creator_asc") {
          const ca =
            extractValidCreator(a, ...(Array.isArray(a._groupedMods) ? a._groupedMods : [])) ||
            "zzzz";
          const cb =
            extractValidCreator(b, ...(Array.isArray(b._groupedMods) ? b._groupedMods : [])) ||
            "zzzz";
          const cmp = ca.localeCompare(cb);
          if (cmp !== 0) return cmp;
          return String(a._groupedTitle || a.name || "").localeCompare(
            String(b._groupedTitle || b.name || "")
          );
        }
        if (sortBy === "modules_desc") {
          const ma = Number(a._moduleCount || a._groupedMods?.length || 1);
          const mb = Number(b._moduleCount || b._groupedMods?.length || 1);
          if (mb !== ma) return mb - ma;
          return String(a._groupedTitle || a.name || "").localeCompare(
            String(b._groupedTitle || b.name || "")
          );
        }
        if (sortBy === "load_order") {
          const la = typeof a.load_order_index === "number" ? a.load_order_index : 999999;
          const lb = typeof b.load_order_index === "number" ? b.load_order_index : 999999;
          return la - lb;
        }
        return 0;
      });
    }

    return filtered;
  }, [
    allGroupedFamilies,
    filterTab,
    typeFilter,
    accessFilter,
    creatorFilter,
    searchQuery,
    sortBy,
  ]);

  const visibleArtifacts = useMemo(
    () => displayArtifacts.slice(0, visibleCount),
    [displayArtifacts, visibleCount]
  );
  const premiumMods = useMemo(
    () => visibleArtifacts.filter((m: any) => m.is_paid || m.is_early_access),
    [visibleArtifacts]
  );
  const standardMods = useMemo(
    () => visibleArtifacts.filter((m: any) => !m.is_paid && !m.is_early_access),
    [visibleArtifacts]
  );

  useEffect(() => {
    if (!selectedBlueprint) {
      setEnrichedBlueprint(null);
      setCloudEnrichmentMap(new Map());
      return;
    }

    let cancelled = false;
    let enrichTimer: ReturnType<typeof setTimeout> | null = null;

    const processBlueprint = (bp: any) => {
      let parsedJson = bp.json_data;
      if (typeof parsedJson === "string") {
        try {
          parsedJson = JSON.parse(parsedJson);
        } catch {
          parsedJson = {};
        }
      }
      parsedJson = parsedJson || {};
      parsedJson.artifacts =
        parsedJson.artifacts ||
        bp.artifacts ||
        selectedBlueprint.originalBlueprint?.artifacts ||
        selectedBlueprint.artifacts ||
        [];

      if (!cancelled) {
        setEnrichedBlueprint({
          ...selectedBlueprint,
          ...bp,
          master_author: selectedBlueprint.master_author || bp.master_author,
          author: selectedBlueprint.author || bp.author,
          json_data: parsedJson,
        });
        setVisibleCount(40);
      }

      const fetchCloudMetadataAndFamilies = async () => {
        const artifacts = parsedJson.artifacts || [];
        const hashes: string[] = Array.from(
          new Set(artifacts.map((a: any) => a?.hash).filter(Boolean))
        );
        if (hashes.length === 0) return;

        const chunkSize = 200;
        const verPromises = [];
        for (let i = 0; i < hashes.length; i += chunkSize) {
          const chunk = hashes.slice(i, i + chunkSize);
          verPromises.push(
            supabase
              .from("mod_versions")
              .select(
                "dna_hash, version_label, download_url, mods(id, name, master_author, category_override, image_url, url, is_paid, is_early_access)"
              )
              .in("dna_hash", chunk)
          );
        }

        const verResults = await Promise.all(verPromises);
        if (cancelled) return;

        const hashRows: any[] = [];
        const modIdsSet = new Set<string>();
        const modsById = new Map<string, any>();

        verResults.forEach(({ data, error }) => {
          if (!error && Array.isArray(data)) {
            data.forEach((d: any) => {
              const dbMod = Array.isArray(d.mods) ? d.mods[0] : d.mods;
              if (dbMod?.id) {
                modIdsSet.add(String(dbMod.id));
                modsById.set(String(dbMod.id), dbMod);
              }
              hashRows.push({
                dna_hash: d.dna_hash,
                versionLabel: d.version_label,
                downloadUrl: d.download_url,
                dbMod,
              });
            });
          }
        });

        const modIds = Array.from(modIdsSet);
        const childToParentId = new Map<string, string>();
        const modToCollection = new Map<string, any>();

        if (modIds.length > 0) {
          const relPromises = [];
          const colPromises = [];
          for (let i = 0; i < modIds.length; i += chunkSize) {
            const idChunk = modIds.slice(i, i + chunkSize);
            relPromises.push(
              supabase
                .from("mod_relationships")
                .select("child_id, parent_id, relationship_type")
                .in("child_id", idChunk)
                .in("relationship_type", ["twin", "addon", "flavor", "set_item", "beta"])
            );
            colPromises.push(
              supabase
                .from("collection_members")
                .select("mod_id, set_id, collections(id, name, mason_id, masons(name), image_url, url, compliance_tier, has_pending_flag)")
                .in("mod_id", idChunk)
            );
          }

          const [relResults, colResults] = await Promise.all([
            Promise.all(relPromises),
            Promise.all(colPromises),
          ]);
          if (cancelled) return;

          const missingParentIds = new Set<string>();
          relResults.forEach(({ data }) => {
            if (Array.isArray(data)) {
              data.forEach((r: any) => {
                if (r.child_id && r.parent_id) {
                  const pId = String(r.parent_id);
                  childToParentId.set(String(r.child_id), pId);
                  if (!modsById.has(pId)) missingParentIds.add(pId);
                }
              });
            }
          });

          colResults.forEach(({ data }) => {
            if (Array.isArray(data)) {
              data.forEach((c: any) => {
                const col = Array.isArray(c.collections) ? c.collections[0] : c.collections;
                if (
                  c.mod_id &&
                  col &&
                  Number(col.compliance_tier ?? 0) === 0 &&
                  col.has_pending_flag !== true
                ) {
                  const colMason = Array.isArray(col.masons) ? col.masons[0]?.name : col.masons?.name;
                  modToCollection.set(String(c.mod_id), {
                    ...col,
                    creator_name: colMason || undefined,
                  });
                }
              });
            }
          });

          if (missingParentIds.size > 0) {
            const parentChunk = Array.from(missingParentIds);
            const { data: pMods } = await supabase
              .from("mods")
              .select("id, name, master_author, category_override, image_url, url, is_paid, is_early_access")
              .in("id", parentChunk.slice(0, 200));
            if (Array.isArray(pMods)) {
              pMods.forEach((pm: any) => {
                if (pm?.id) modsById.set(String(pm.id), pm);
              });
            }
          }
        }

        if (cancelled) return;

        const nextMap = new Map<string, any>();
        let anyPaid = false;
        let anyEarlyAccess = false;

        hashRows.forEach((row) => {
          const modId = row.dbMod?.id ? String(row.dbMod.id) : null;
          const parentId = modId ? childToParentId.get(modId) || modId : null;
          const parentMod = parentId ? modsById.get(parentId) : null;
          const collection = modId ? modToCollection.get(modId) : null;

          if (row.dbMod?.is_paid || parentMod?.is_paid) anyPaid = true;
          if (row.dbMod?.is_early_access || parentMod?.is_early_access) {
            anyEarlyAccess = true;
          }

          nextMap.set(String(row.dna_hash), {
            dbMod: row.dbMod,
            parentMod,
            familyId: parentId,
            collection,
            versionLabel: row.versionLabel,
            downloadUrl: row.downloadUrl,
          });
        });

        setCloudEnrichmentMap(nextMap);
        if (anyPaid || anyEarlyAccess) {
          setEnrichedBlueprint((prev: any) =>
            prev
              ? {
                  ...prev,
                  is_paid: prev.is_paid || anyPaid,
                  is_early_access: prev.is_early_access || anyEarlyAccess,
                }
              : null
          );
        }
      };

      if (enrichTimer) clearTimeout(enrichTimer);
      enrichTimer = setTimeout(() => {
        if (!cancelled) fetchCloudMetadataAndFamilies();
      }, 60);
    };

    if (
      selectedBlueprint.json_data === undefined &&
      !selectedBlueprint.originalBlueprint?.artifacts &&
      !selectedBlueprint.artifacts
    ) {
      supabase
        .from("blueprints")
        .select("*")
        .eq("id", selectedBlueprint.id)
        .single()
        .then(({ data }) => {
          if (cancelled) return;
          if (data) {
            processBlueprint(data);
          } else {
            processBlueprint(selectedBlueprint);
          }
        });
    } else {
      processBlueprint(selectedBlueprint);
      if (selectedBlueprint.json_data === undefined && selectedBlueprint.id) {
        supabase
          .from("blueprints")
          .select("*")
          .eq("id", selectedBlueprint.id)
          .single()
          .then(({ data }) => {
            if (!cancelled && data) {
              processBlueprint(data);
            }
          });
      }
    }

    return () => {
      cancelled = true;
      if (enrichTimer) clearTimeout(enrichTimer);
    };
  }, [selectedBlueprint]);

  if (!enrichedBlueprint) return null;

  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={() => setSelectedBlueprint(null)}
        widthClass="w-[90vw] md:w-[760px]"
        backdropZ={backdropZ}
        panelZ={panelZ}
        icon={t("icon_map", "map")}
        iconColorClass="text-[var(--accent)]"
        title={t("blueprint_inspector", "Blueprint Inspector")}
        subtitle={t("blueprint_desc", "{Mod} metadata and Asset repository")}
        headerActions={
          onReportBlueprint && enrichedBlueprint?.id ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_flag", "flag")}
                tooltip={t("report_title", "Report Content")}
                variant="danger"
                onClick={() => onReportBlueprint(enrichedBlueprint.id)}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_map", "map")}
            overline={
              enrichedBlueprint.creator_name ||
              enrichedBlueprint.master_author ||
              enrichedBlueprint.author ||
              t("role_citizen", "{Citizen}")
            }
            title={enrichedBlueprint.name}
            description={t("blueprint_desc", "{Mod} metadata and Asset repository")}
            badge={`${allGroupedFamilies.length} ${t("term_mods", "{Mods}")}`}
            badgeIcon={t("icon_inventory_2", "inventory_2")}
            variant={enrichedBlueprint.is_paid ? "warning" : "accent"}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {enrichedBlueprint.is_early_access && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                      {t("icon_science", "science")}
                    </span>
                    {t("badge_early_access", "Early Access")}
                  </span>
                )}
                {enrichedBlueprint.is_paid && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                      {t("icon_monetization_on", "monetization_on")}
                    </span>
                    {t("badge_paid", "Paid")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                {!isDesktop() ? (
                  <ActionButton
                    variant="accent"
                    icon={t("icon_phonelink", "phonelink")}
                    label={t("staging_btn_stage_blueprint", "Stage {Blueprint} to PC")}
                    onClick={() => {
                      useModalStore
                        .getState()
                        .stageBlueprintToDraft(enrichedBlueprint);
                      useStore
                        .getState()
                        .pushStatus(
                          t(
                            "status_staging_blueprint_loaded",
                            "Blueprint loaded into Payload Editor."
                          )
                        );
                      setSelectedBlueprint(null);
                      useStore.getState().setView("playsets");
                    }}
                  />
                ) : (
                  <ActionButton
                    variant="accent"
                    icon={
                      isSyncing
                        ? t("icon_sync", "sync")
                        : t("icon_download", "download")
                    }
                    label={
                      playSets.some(
                        (p: any) =>
                          p.code &&
                          selectedBlueprint?.json_data?.code &&
                          p.code === selectedBlueprint.json_data.code
                      )
                        ? t("btn_install_copy", "Install Copy")
                        : t("update_panel_install", "Install")
                    }
                    onClick={async () => {
                      if (
                        playSets.some(
                          (p: any) =>
                            p.code &&
                            selectedBlueprint?.json_data?.code &&
                            p.code === selectedBlueprint.json_data.code
                        )
                      ) {
                        setIsSyncing(true);
                        await syncBlueprintByCode(selectedBlueprint.json_data.code);
                        setIsSyncing(false);
                      } else {
                        onDownloadSuccess?.();
                      }
                      setSelectedBlueprint(null);
                    }}
                  />
                )}
              </div>
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("tab_metadata", "Metadata & Telemetry")}
            icon={t("icon_analytics", "analytics")}
          >
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                label={t("role_creator", "Creator")}
                value={
                  enrichedBlueprint.creator_name ||
                  enrichedBlueprint.master_author ||
                  enrichedBlueprint.author ||
                  t("role_citizen", "{Citizen}")
                }
                icon={t("icon_person", "person")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("blueprint_version_label", "Game Version")}
                value={
                  enrichedBlueprint.game_version ||
                  enrichedBlueprint.json_data?.game_version ||
                  t("unknown", "UNKNOWN")
                }
                icon={t("icon_sell", "sell")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("sort_downloads", "Downloads")}
                value={enrichedBlueprint.downloads || 0}
                icon={t("icon_download", "download")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("created_date", "Published")}
                value={new Date(
                  enrichedBlueprint.created_at
                ).toLocaleDateString()}
                icon={t("icon_calendar_today", "calendar_today")}
                iconColorClass="text-[var(--accent)]"
              />
            </div>
          </UniversalGroup>

          <SidePanelFilterBar className="grid-cols-2 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_inventory_2", "inventory_2")}
              label={t("filter_all", "Global")}
              value={allGroupedFamilies.length}
              isActive={filterTab === "ALL"}
              onClick={() => {
                setFilterTab("ALL");
                setVisibleCount(40);
              }}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_rule", "rule")}
              label={t("filter_missing", "Missing Only")}
              value={missingFamiliesCount}
              isActive={filterTab === "MISSING"}
              onClick={() => {
                setFilterTab("MISSING");
                setVisibleCount(40);
              }}
            />
          </SidePanelFilterBar>

          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={(val: string) => {
              setSearchQuery(val);
              setVisibleCount(40);
            }}
            searchPlaceholder={t("search_ph", "Search {mods}...")}
            primaryPopover={{
              icon: t("icon_tune", "tune"),
              label:
                activeFiltersCount > 0
                  ? `${t("filters", "Filters")} (${activeFiltersCount})`
                  : t("filters", "Filters"),
              content: (
                <div className="flex flex-col w-[450px] p-3.5 max-w-[calc(100vw-40px)] gap-3">
                  {/* Sort By */}
                  <div className="flex flex-col w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                      {t("sort_by", "Sort By")}
                      <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: "default", label: t("sort_default", "Default") },
                        { id: "name_asc", label: t("sort_name", "Name (A-Z)") },
                        { id: "creator_asc", label: t("sort_author", "{Mason} (A-Z)") },
                        { id: "modules_desc", label: t("sort_modules_desc", "Most Modules") },
                        { id: "load_order", label: t("sort_load_order", "Load Order") },
                      ].map((opt) => {
                        const active = sortBy === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSortBy(opt.id as any);
                              setVisibleCount(40);
                            }}
                            className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vault Status */}
                  <div className="flex flex-col w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                      {t("filter_status", "Filter Status")}
                      <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { id: "ALL", label: t("filter_all", "Global") },
                        { id: "MISSING", label: t("filter_missing", "Missing Only") },
                        { id: "IN_VAULT", label: t("status_in_vault", "In {Vault}") },
                      ].map((opt) => {
                        const active = filterTab === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setFilterTab(opt.id as any);
                              setVisibleCount(40);
                            }}
                            className={`sa-dropdown-item flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Module Type */}
                  <div className="flex flex-col w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                      {t("filter_type", "Type")}
                      <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: "ALL", label: t("filter_all_types", "All Types") },
                        { id: "PACKAGE", label: t("type_package", "Module") },
                        { id: "SCRIPT", label: t("type_script", "Script") },
                        { id: "SUITE", label: t("suite_label", "Suite") },
                      ].map((opt) => {
                        const active = typeFilter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setTypeFilter(opt.id as any);
                              setVisibleCount(40);
                            }}
                            className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Access Tier */}
                  <div className="flex flex-col w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-1.5 px-1 flex items-center gap-2">
                      {t("filter_access_tier", "Access Tier")}
                      <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: "ALL", label: t("filter_all", "All") },
                        { id: "FREE", label: t("standard_artifacts", "Standard {Mods}") },
                        { id: "EARLY_ACCESS", label: t("badge_early_access", "Early Access") },
                        { id: "PAID", label: t("badge_paid", "Paid") },
                      ].map((opt) => {
                        const active = accessFilter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setAccessFilter(opt.id as any);
                              setVisibleCount(40);
                            }}
                            className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-1.5 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                              active ? "is-selected font-bold" : "font-semibold"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {active && (
                              <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                                {t("icon_check", "check")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Creator Dropdown */}
                  {availableCreators.length > 0 && (
                    <div className="flex flex-col w-full">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2 px-1 flex items-center gap-2">
                        {t("role_creator", "Creator")}
                        <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
                      </div>
                      <div className="h-10 w-full relative z-[60]">
                        <CustomDropdown
                          disableTint={true}
                          flat={true}
                          variant="pill"
                          value={creatorFilter}
                          onChange={(val: string[]) => {
                            setCreatorFilter(val[0] || "ALL");
                            setVisibleCount(40);
                          }}
                          options={[
                            { id: "ALL", label: t("filter_all_creators", "All {Masons}") },
                            ...availableCreators,
                          ]}
                        />
                      </div>
                    </div>
                  )}

                  {activeFiltersCount > 0 && (
                    <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex justify-end">
                      <ActionButton
                        variant="glass"
                        icon={t("icon_restart_alt", "restart_alt")}
                        label={t("clear", "Clear")}
                        onClick={resetAllFilters}
                      />
                    </div>
                  )}
                </div>
              ),
            }}
          />

          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {filterTab !== "ALL" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_filter_alt", "filter_alt")}
                    </span>
                    <span>
                      {filterTab === "MISSING"
                        ? t("filter_missing", "Missing Only")
                        : t("status_in_vault", "In {Vault}")}
                    </span>
                  </span>
                )}
                {typeFilter !== "ALL" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_category", "category")}
                    </span>
                    <span>
                      {typeFilter === "PACKAGE"
                        ? t("type_package", "Module")
                        : typeFilter === "SCRIPT"
                          ? t("type_script", "Script")
                          : t("suite_label", "Suite")}
                    </span>
                  </span>
                )}
                {accessFilter !== "ALL" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_workspace_premium", "workspace_premium")}
                    </span>
                    <span>
                      {accessFilter === "PAID"
                        ? t("badge_paid", "Paid")
                        : accessFilter === "EARLY_ACCESS"
                          ? t("badge_early_access", "Early Access")
                          : t("standard_artifacts", "Standard {Mods}")}
                    </span>
                  </span>
                )}
                {creatorFilter !== "ALL" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_person", "person")}
                    </span>
                    <span>{creatorFilter}</span>
                  </span>
                )}
                {sortBy !== "default" && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_sort", "sort")}
                    </span>
                    <span>
                      {sortBy === "name_asc"
                        ? t("sort_name", "Name (A-Z)")
                        : sortBy === "creator_asc"
                          ? t("sort_author", "{Mason} (A-Z)")
                          : sortBy === "modules_desc"
                            ? t("sort_modules_desc", "Most Modules")
                            : t("sort_load_order", "Load Order")}
                    </span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] hover:underline cursor-pointer"
              >
                {t("clear", "Clear")}
              </button>
            </div>
          )}

          {premiumMods.length > 0 && (
            <UniversalGroup
              title={`${t("premium_artifacts", "Premium {Mods}")} (${premiumMods.length})`}
              icon={t("icon_workspace_premium", "workspace_premium")}
              headerColorClass="text-[var(--warning)]"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {premiumMods.map((mod: any, i: number) => (
                  <BlueprintInspectorModCard
                    key={`${mod.hash || mod.name}_${i}`}
                    mod={mod}
                    onOpenDossier={onOpenDossier}
                    activeGameSchema={activeGameSchema}
                    t={t}
                    showLoadOrderChip={sortBy === "load_order"}
                  />
                ))}
              </div>
            </UniversalGroup>
          )}

          {standardMods.length > 0 && (
            <UniversalGroup
              title={`${t("standard_artifacts", "Standard {Mods}")} (${standardMods.length})`}
              icon={t("icon_inventory_2", "inventory_2")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {standardMods.map((mod: any, i: number) => (
                  <BlueprintInspectorModCard
                    key={`${mod.hash || mod.name}_${i}`}
                    mod={mod}
                    onOpenDossier={onOpenDossier}
                    activeGameSchema={activeGameSchema}
                    t={t}
                    showLoadOrderChip={sortBy === "load_order"}
                  />
                ))}
              </div>
            </UniversalGroup>
          )}

          {displayArtifacts.length === 0 && (
            <EmptyState
              icon={t("icon_inventory_2", "inventory_2")}
              title={t("empty_title", "No matching {mods} found")}
              subtitle={t(
                "empty_desc",
                "Everything in this {Blueprint} is already in Your {Vault} or filtered out."
              )}
            />
          )}

          {displayArtifacts.length > visibleCount && (
            <ActionButton
              variant="glass"
              icon={t("icon_expand_more", "expand_more")}
              label={`${t("load_more_artifacts", "Load More Artifacts")} (${displayArtifacts.length - visibleCount})`}
              onClick={() => setVisibleCount((prev: number) => prev + 80)}
              className="w-full"
            />
          )}
        </div>
      </SidePanel>
    </>
  );
}

