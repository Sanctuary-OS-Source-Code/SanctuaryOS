import React, { useEffect, useMemo } from "react";
import { useStore } from "../store";
import { isScriptExtension } from "../shared";
import { normalizeModGroupTitle, formatCleanModTitle } from "../side-panels/CommandIncompatiblePanel";
import {
  UUID_REGEX,
  extractCleanUuid,
  collectAllCandidateUuids,
  isPlaceholderAuthorStr,
  getCachedGroupTitles,
  normTitleForMatch,
  mergeHydratedMod,
  DossierFilterSection,
} from "../mod-dossier/dossierHelpersAndFetch";

export function useModDossierRelations({
  t,
  vaultIndex,
  collectionFilter,
  deferredCollectionSearch,
  collectionEquipFilter,
  setCollectionEquipFilter,
  collectionCategoryFilter,
  setCollectionCategoryFilter,
  collectionStatusFilter,
  setCollectionStatusFilter,
  setVisibleKidsLimit,
  visibleKidsLimit,
  kidsSentinelRef,
  mod,
  combinedDbMap,
  isNexusView,
  isModNameEquipped,
}: any) {
  const buildGroupedCollectionModules = React.useCallback(
    (localItems: any[], dbCollectionChildren: any[]): any[] => {
      const combinedSource = [
        ...(Array.isArray(localItems) ? localItems : []),
        ...(Array.isArray(dbCollectionChildren) ? dbCollectionChildren : []),
      ];
      if (combinedSource.length === 0) return [];

      const map = new Map<string, any>();

      for (const rawKid of combinedSource) {
        if (!rawKid) continue;
        const kidUuid = extractCleanUuid(rawKid.dbId, rawKid.id).toLowerCase();
        const kidHash =
          rawKid.hash && !/^(virtual_|set_|local_)/i.test(String(rawKid.hash))
            ? String(rawKid.hash).toLowerCase()
            : "";

        const matchedSet = new Set<any>();
        const addMatches = (arr?: any[]) => {
          if (!arr) return;
          for (let i = 0; i < arr.length; i++) {
            matchedSet.add(arr[i]);
          }
        };

        if (kidHash) {
          addMatches(vaultIndex.physicalByHash.get(kidHash));
        }
        if (Array.isArray(rawKid.mod_versions)) {
          for (let i = 0; i < rawKid.mod_versions.length; i++) {
            const vHash = String(
              rawKid.mod_versions[i]?.dna_hash || rawKid.mod_versions[i]?.hash || ""
            )
              .trim()
              .toLowerCase();
            if (vHash) addMatches(vaultIndex.physicalByHash.get(vHash));
          }
        }
        if (kidUuid) {
          addMatches(vaultIndex.physicalByUuid.get(kidUuid));
        }
        if (
          rawKid.name &&
          typeof rawKid.name === "string" &&
          !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(rawKid.name) &&
          !UUID_REGEX.test(rawKid.name.split("@")[0])
        ) {
          addMatches(vaultIndex.physicalByName.get(rawKid.name));
          addMatches(vaultIndex.physicalByName.get(rawKid.name.toLowerCase()));
        }
        if (matchedSet.size === 0) {
          const fallbackTitle = normTitleForMatch(
            rawKid.displayName || rawKid.name
          );
          if (fallbackTitle) {
            addMatches(vaultIndex.physicalByNormTitle.get(fallbackTitle));
          }
        }

        const matchedPhysical = Array.from(matchedSet);
        const isKidInstalled = matchedPhysical.length > 0;
        const dbMeta = kidUuid ? combinedDbMap[kidUuid] || rawKid : rawKid;
        const hydratedKid = mergeHydratedMod(
          isKidInstalled ? matchedPhysical[0] : rawKid,
          dbMeta,
          vaultIndex,
          t
        );

        const resolvedSubMods = isKidInstalled
          ? matchedPhysical.map((pm: any) =>
            mergeHydratedMod(pm, dbMeta, vaultIndex, t)
          )
          : [hydratedKid];

        const rawTitle = (
          (hydratedKid.displayName &&
            !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(hydratedKid.displayName)) &&
            !UUID_REGEX.test(String(hydratedKid.displayName).split("@")[0])
            ? hydratedKid.displayName
            : (hydratedKid.name || "")
              .replace(/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i, "")
              .split(/[/\\]/)
              .pop()) || ""
        )
          .replace(/_/g, " ")
          .replace(/\.[^/.]+$/, "");
        const { groupTitle } = getCachedGroupTitles(rawTitle);
        const groupKey = groupTitle.toLowerCase();

        if (!map.has(groupKey)) {
          map.set(groupKey, {
            ...hydratedKid,
            displayName: groupTitle,
            _groupedTitle: groupTitle,
            _groupedMods: [...resolvedSubMods],
            _groupedIds: collectAllCandidateUuids(hydratedKid),
            isInstalled: isKidInstalled,
            relationType: "manifest" as const,
          });
        } else {
          const existing = map.get(groupKey);
          if (isKidInstalled && !existing.isInstalled) {
            existing.isInstalled = true;
            existing._groupedMods = [...resolvedSubMods];
          } else if (isKidInstalled === existing.isInstalled) {
            for (const rsm of resolvedSubMods) {
              const alreadyHas = existing._groupedMods.some(
                (gm: any) =>
                  (gm.name && rsm.name && gm.name === rsm.name) ||
                  (gm.hash && rsm.hash && gm.hash === rsm.hash) ||
                  (extractCleanUuid(gm.dbId, gm.id) &&
                    extractCleanUuid(gm.dbId, gm.id) ===
                    extractCleanUuid(rsm.dbId, rsm.id))
              );
              if (!alreadyHas) {
                existing._groupedMods.push(rsm);
              }
            }
          }
          for (const cid of collectAllCandidateUuids(hydratedKid)) {
            if (!existing._groupedIds.includes(cid)) {
              existing._groupedIds.push(cid);
            }
          }
          if (
            isPlaceholderAuthorStr(existing.author, t) &&
            !isPlaceholderAuthorStr(hydratedKid.author, t)
          ) {
            existing.author = hydratedKid.author;
          }
          if (!existing.description && hydratedKid.description) {
            existing.description = hydratedKid.description;
          }
          if (!existing.url && hydratedKid.url) {
            existing.url = hydratedKid.url;
          }
          if (!existing.created_at && hydratedKid.created_at) {
            existing.created_at = hydratedKid.created_at;
          }
          if (!existing.updated_at && hydratedKid.updated_at) {
            existing.updated_at = hydratedKid.updated_at;
          }
          if (
            (!existing.version ||
              /^(v\.?local|local|unknown)$/i.test(String(existing.version))) &&
            hydratedKid.version &&
            !/^(v\.?local|local|unknown)$/i.test(String(hydratedKid.version))
          ) {
            existing.version = hydratedKid.version;
          }
        }
      }

      return Array.from(map.values());
    },
    [vaultIndex, combinedDbMap, t]
  );

  const groupedKids = useMemo(() => {
    if (!mod) return [];
    const localKids = mod.flavors || [];
    if (
      (Array.isArray(localKids) && localKids.length > 0) ||
      mod.isVirtual ||
      mod.isParent ||
      mod.isCollection
    ) {
      return buildGroupedCollectionModules(
        localKids,
        mod.hydratedCollectionChildren || []
      );
    }
    return [];
  }, [mod, buildGroupedCollectionModules]);

  const inVaultKidsCount = useMemo(
    () => groupedKids.filter((k: any) => k.isInstalled !== false).length,
    [groupedKids]
  );
  const missingKidsCount = useMemo(
    () => groupedKids.filter((k: any) => k.isInstalled === false).length,
    [groupedKids]
  );

  const isKidGroupEquipped = React.useCallback(
    (k: any): boolean => {
      if (!k || k.isInstalled === false) return false;
      const gMods =
        Array.isArray(k._groupedMods) && k._groupedMods.length > 0
          ? k._groupedMods
          : [k];
      return gMods.some(
        (gm: any) => gm?.name && isModNameEquipped(gm.name)
      );
    },
    [isModNameEquipped]
  );

  const resolveKidCategoryKey = React.useCallback((k: any): string => {
    const gMods =
      Array.isArray(k?._groupedMods) && k._groupedMods.length > 0
        ? k._groupedMods
        : [k];
    const explicitCat = String(
      k?.category_override || k?.category || ""
    ).trim();
    if (
      explicitCat &&
      !/^(package|module|script|collection|folder|local|unknown|mod)$/i.test(explicitCat)
    ) {
      return explicitCat;
    }
    const hasScript = gMods.some((gm: any) =>
      isScriptExtension(
        String(gm?.name || gm?.file_extension || gm?._originalSetName || ""),
        useStore.getState().activeGameSchema
      )
    );
    if (hasScript) return "Script";
    return explicitCat || "Module";
  }, []);

  const availableCollectionCategories = useMemo(() => {
    const set = new Set<string>();
    for (const k of groupedKids) {
      const cat = resolveKidCategoryKey(k);
      if (cat) set.add(cat);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [groupedKids, resolveKidCategoryKey]);

  const filteredGroupedKids = useMemo(() => {
    const normSearch = deferredCollectionSearch
      .trim()
      .toLowerCase()
      .replace(/[_.\-/\\]+/g, " ")
      .replace(/\s+/g, " ");

    return groupedKids.filter((k: any) => {
      if (collectionFilter === "in_vault" && k.isInstalled === false) return false;
      if (collectionFilter === "missing" && k.isInstalled !== false) return false;

      if (collectionEquipFilter === "EQUIPPED" && !isKidGroupEquipped(k)) {
        return false;
      }
      if (collectionEquipFilter === "UNEQUIPPED" && isKidGroupEquipped(k)) {
        return false;
      }

      if (collectionCategoryFilter !== "ALL") {
        const cat = resolveKidCategoryKey(k);
        if (cat.toLowerCase() !== collectionCategoryFilter.toLowerCase()) {
          return false;
        }
      }

      if (collectionStatusFilter !== "ALL") {
        const rawStatus = String(k.status || "").toLowerCase();
        const isLocalOnly =
          !k.dbId ||
          rawStatus === "local" ||
          rawStatus === "unverified" ||
          String(k.version || "").toLowerCase() === "v.local";
        if (collectionStatusFilter === "UNVERIFIED") {
          if (!isLocalOnly) return false;
        } else if (rawStatus !== collectionStatusFilter.toLowerCase()) {
          return false;
        }
      }

      if (normSearch) {
        const gMods =
          Array.isArray(k._groupedMods) && k._groupedMods.length > 0
            ? k._groupedMods
            : [k];
        const titleStr = String(
          k._groupedTitle || k.displayName || k.name || ""
        )
          .toLowerCase()
          .replace(/[_.\-/\\]+/g, " ");
        const authorStr = String(k.author || k.master_author || "")
          .toLowerCase()
          .replace(/[_.\-/\\]+/g, " ");
        const catStr = resolveKidCategoryKey(k).toLowerCase();
        const matchesSubFile = gMods.some((gm: any) =>
          String(gm?.name || gm?.displayName || "")
            .toLowerCase()
            .replace(/[_.\-/\\]+/g, " ")
            .includes(normSearch)
        );
        if (
          !titleStr.includes(normSearch) &&
          !authorStr.includes(normSearch) &&
          !catStr.includes(normSearch) &&
          !matchesSubFile
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    groupedKids,
    collectionFilter,
    collectionEquipFilter,
    collectionCategoryFilter,
    collectionStatusFilter,
    deferredCollectionSearch,
    isKidGroupEquipped,
    resolveKidCategoryKey,
  ]);

  useEffect(() => {
    setVisibleKidsLimit(30);
  }, [
    collectionFilter,
    collectionEquipFilter,
    collectionCategoryFilter,
    collectionStatusFilter,
    deferredCollectionSearch,
  ]);

  useEffect(() => {
    if (visibleKidsLimit >= filteredGroupedKids.length) return;
    const node = kidsSentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          React.startTransition(() => {
            setVisibleKidsLimit((prev: any) =>
              Math.min(filteredGroupedKids.length, prev + 36)
            );
          });
        }
      },
      { rootMargin: "420px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleKidsLimit, filteredGroupedKids.length]);

  const visibleGroupedKids = useMemo(
    () =>
      filteredGroupedKids.length > visibleKidsLimit
        ? filteredGroupedKids.slice(0, visibleKidsLimit)
        : filteredGroupedKids,
    [filteredGroupedKids, visibleKidsLimit]
  );

  const hasActiveCollectionFilters =
    collectionEquipFilter !== "ALL" ||
    collectionCategoryFilter !== "ALL" ||
    collectionStatusFilter !== "ALL";

  const collectionFilterPopoverContent = useMemo(
    () => (
      <div className="flex flex-col w-[440px] p-4 max-w-[calc(100vw-40px)] text-left">
        {!isNexusView && (
          <DossierFilterSection
            t={t}
            title={t("blueprint", "{Blueprint}")}
            value={collectionEquipFilter}
            onChange={(val: "ALL" | "EQUIPPED" | "UNEQUIPPED") =>
              setCollectionEquipFilter(val)
            }
            options={[
              { id: "ALL", label: t("filter_all", "All") },
              {
                id: "EQUIPPED",
                label: t("filter_in_blueprint", "In {Blueprint}"),
              },
              {
                id: "UNEQUIPPED",
                label: t("filter_not_equipped", "Not Equipped"),
              },
            ]}
          />
        )}

        {availableCollectionCategories.length > 1 && (
          <DossierFilterSection
            t={t}
            title={t("filter_category", "Filter Category")}
            value={collectionCategoryFilter}
            onChange={(val: string) => setCollectionCategoryFilter(val)}
            options={[
              { id: "ALL", label: t("filter_all", "All") },
              ...availableCollectionCategories.map((cat) => ({
                id: cat,
                label:
                  cat === "Script"
                    ? t("type_script", "Script")
                    : cat === "Module" || cat === "Package"
                      ? t("type_package", "Module")
                      : cat,
              })),
            ]}
          />
        )}

        <DossierFilterSection
          t={t}
          title={t("filter_status", "Filter Status")}
          value={collectionStatusFilter}
          onChange={(val: string) => setCollectionStatusFilter(val)}
          options={[
            { id: "ALL", label: t("filter_all", "All") },
            { id: "stable", label: t("status_stable", "STABLE") },
            { id: "UNVERIFIED", label: t("unverified", "Unverified") },
            { id: "unstable", label: t("label_unstable", "Unstable") },
            { id: "corrupted", label: t("status_corrupted", "Corrupted") },
          ]}
        />

        {hasActiveCollectionFilters && (
          <button
            type="button"
            onClick={() => {
              setCollectionEquipFilter("ALL");
              setCollectionCategoryFilter("ALL");
              setCollectionStatusFilter("ALL");
            }}
            className="mt-1 px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[11px] font-bold text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
              {t("icon_filter_alt_off", "filter_alt_off")}
            </span>
            <span>{t("btn_clear", "Clear Filters")}</span>
          </button>
        )}
      </div>
    ),
    [
      isNexusView,
      t,
      collectionEquipFilter,
      availableCollectionCategories,
      collectionCategoryFilter,
      collectionStatusFilter,
      hasActiveCollectionFilters,
    ]
  );

  const groupedRelations = useMemo(() => {
    if (!mod) return [];
    const rawReqs = [
      ...(mod.requirements || mod.requires || []),
      ...(mod.isVirtual && Array.isArray(mod.flavors)
        ? mod.flavors.flatMap((fl: any) => fl?.requirements || fl?.requires || [])
        : []),
    ];
    const rawTwins = [
      ...(mod.twins || []),
      ...(mod.isVirtual && Array.isArray(mod.flavors)
        ? mod.flavors.flatMap((fl: any) => fl?.twins || [])
        : []),
    ];
    if (rawReqs.length === 0 && rawTwins.length === 0) return [];

    const selfUuids = new Set<string>(
      mod.isVirtual && Array.isArray(mod.flavors) && mod.flavors.length > 0
        ? mod.flavors.flatMap((fl: any) => collectAllCandidateUuids(fl))
        : [extractCleanUuid(mod.dbId, mod.id).toLowerCase()].filter(Boolean)
    );
    const selfNames = new Set<string>(
      mod.isVirtual && Array.isArray(mod.flavors) && mod.flavors.length > 0
        ? mod.flavors
          .map((fl: any) => String(fl?.name || "").toLowerCase())
          .filter(Boolean)
        : [String(mod.name || "").toLowerCase()].filter(Boolean)
    );

    const combinedEntries: Array<{ rawItem: any; relType: "requirement" | "twin" }> = [
      ...rawReqs.map((r: any) => ({ rawItem: r, relType: "requirement" as const })),
      ...rawTwins.map((tw: any) => ({ rawItem: tw, relType: "twin" as const })),
    ];

    const map = new Map<string, any>();

    for (const { rawItem, relType } of combinedEntries) {
      if (!rawItem) continue;
      const rawId =
        typeof rawItem === "string"
          ? rawItem
          : rawItem.id || rawItem.dbId || rawItem.hash || "";
      const cleanId = extractCleanUuid(rawId).toLowerCase();
      const rawHash = (
        typeof rawItem === "object" && rawItem?.hash
          ? String(rawItem.hash)
          : !cleanId && typeof rawId === "string"
            ? rawId
            : ""
      ).toLowerCase();

      if (cleanId && selfUuids.has(cleanId)) continue;

      const matchedSet = new Set<any>();
      if (cleanId) {
        const byId = vaultIndex.physicalByUuid.get(cleanId);
        if (byId) byId.forEach((pm: any) => matchedSet.add(pm));
      }
      if (rawHash) {
        const byHash = vaultIndex.physicalByHash.get(rawHash);
        if (byHash) byHash.forEach((pm: any) => matchedSet.add(pm));
      }
      const matchedPhysical = Array.from(matchedSet);

      if (
        matchedPhysical.length > 0 &&
        matchedPhysical.every((pm: any) =>
          selfNames.has(String(pm.name || "").toLowerCase())
        )
      ) {
        continue;
      }

      const dbHydrated = cleanId ? combinedDbMap[cleanId] : null;
      const virtualMatch = cleanId
        ? vaultIndex.virtualByUuid.get(cleanId) || null
        : null;

      let primaryMatch: any = null;
      let isInstalled = false;
      let resolvedModules: any[] = [];

      if (matchedPhysical.length > 0) {
        isInstalled = true;
        resolvedModules = matchedPhysical.map((pm: any) =>
          mergeHydratedMod(pm, dbHydrated, vaultIndex, t)
        );
        primaryMatch = resolvedModules[0];
      } else if (virtualMatch) {
        const nonSelfFlavors = (virtualMatch.flavors || []).filter(
          (fl: any) => !selfNames.has(String(fl?.name || "").toLowerCase())
        );
        if (nonSelfFlavors.length === 0 && mod.isVirtual) continue;
        isInstalled = true;
        resolvedModules =
          nonSelfFlavors.length > 0
            ? nonSelfFlavors.map((fl: any) =>
              mergeHydratedMod(fl, dbHydrated, vaultIndex, t)
            )
            : [mergeHydratedMod(virtualMatch, dbHydrated, vaultIndex, t)];
        primaryMatch = mergeHydratedMod(
          { ...virtualMatch, ...(resolvedModules[0] || {}) },
          dbHydrated,
          vaultIndex,
          t
        );
      } else {
        isInstalled = false;
        const fallbackBase =
          typeof rawItem === "string"
            ? {
              id: rawItem,
              dbId: cleanId || undefined,
              name: dbHydrated?.name || rawItem,
              displayName: dbHydrated?.name || rawItem,
            }
            : {
              ...rawItem,
              dbId: cleanId || rawItem.dbId || rawItem.id,
              name: dbHydrated?.name || rawItem.name || rawItem.displayName || String(rawId),
              displayName:
                dbHydrated?.name || rawItem.displayName || rawItem.name || String(rawId),
            };
        primaryMatch = mergeHydratedMod(fallbackBase, dbHydrated, vaultIndex, t);
        resolvedModules = [primaryMatch];
      }

      const rawDisplay =
        dbHydrated?.name ||
        (primaryMatch.displayName &&
          !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(primaryMatch.displayName))
          ? primaryMatch.displayName
          : "") ||
        (typeof rawItem === "object" && (rawItem.displayName || rawItem.name)) ||
        primaryMatch.name ||
        String(rawId);

      const cleanedRaw =
        String(rawDisplay)
          .replace(/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i, "")
          .split(/[/\\]/)
          .pop()
          ?.replace(/_/g, " ")
          .replace(/\.[^/.]+$/, "")
          .trim() || String(rawDisplay);

      const cleanTitle = formatCleanModTitle(cleanedRaw) || cleanedRaw;
      const groupTitle = normalizeModGroupTitle(cleanTitle) || cleanTitle;
      const groupKey = groupTitle.toLowerCase();

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          ...primaryMatch,
          displayName: groupTitle,
          _groupedTitle: groupTitle,
          _groupedMods: [...resolvedModules],
          _groupedIds: cleanId
            ? Array.from(new Set([cleanId, ...collectAllCandidateUuids(primaryMatch)]))
            : collectAllCandidateUuids(primaryMatch),
          isInstalled,
          relationType: relType,
        });
      } else {
        const existing = map.get(groupKey);
        if (isInstalled) existing.isInstalled = true;
        if (relType === "requirement") existing.relationType = "requirement";

        for (const rm of resolvedModules) {
          const alreadyHas = existing._groupedMods.some(
            (gm: any) =>
              (gm.name && rm.name && gm.name === rm.name) ||
              (gm.hash && rm.hash && gm.hash === rm.hash) ||
              (extractCleanUuid(gm.dbId, gm.id) &&
                extractCleanUuid(gm.dbId, gm.id) === extractCleanUuid(rm.dbId, rm.id))
          );
          if (!alreadyHas) {
            existing._groupedMods.push(rm);
          }
        }
        if (cleanId && !existing._groupedIds.includes(cleanId)) {
          existing._groupedIds.push(cleanId);
        }
        for (const cid of collectAllCandidateUuids(primaryMatch)) {
          if (!existing._groupedIds.includes(cid)) {
            existing._groupedIds.push(cid);
          }
        }
        if (
          isPlaceholderAuthorStr(existing.author, t) &&
          !isPlaceholderAuthorStr(primaryMatch.author, t)
        ) {
          existing.author = primaryMatch.author;
        }
        if (!existing.description && primaryMatch.description) {
          existing.description = primaryMatch.description;
        }
        if (!existing.url && primaryMatch.url) {
          existing.url = primaryMatch.url;
        }
        if (!existing.created_at && primaryMatch.created_at) {
          existing.created_at = primaryMatch.created_at;
        }
        if (!existing.updated_at && primaryMatch.updated_at) {
          existing.updated_at = primaryMatch.updated_at;
        }
        if (
          (!existing.version || /^(v\.?local|local|unknown)$/i.test(String(existing.version))) &&
          primaryMatch.version &&
          !/^(v\.?local|local|unknown)$/i.test(String(primaryMatch.version))
        ) {
          existing.version = primaryMatch.version;
        }
      }
    }

    return Array.from(map.values());
  }, [mod, vaultIndex, combinedDbMap, t]);

  return {
    buildGroupedCollectionModules,
    groupedKids,
    inVaultKidsCount,
    missingKidsCount,
    isKidGroupEquipped,
    resolveKidCategoryKey,
    filteredGroupedKids,
    visibleGroupedKids,
    collectionFilterPopoverContent,
    groupedRelations,
  };
}
