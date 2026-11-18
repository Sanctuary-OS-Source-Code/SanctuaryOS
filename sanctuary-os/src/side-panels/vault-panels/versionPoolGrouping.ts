import { isScriptExtension, formatDisplayName, getExtensionRegex } from "../../shared";
import { useStore } from "../../store";
import { formatCleanModTitle } from "../CommandIncompatiblePanel";

export function formatByteSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val >= 10 || idx === 0 ? Math.round(val) : val.toFixed(1)} ${units[idx]}`;
}

export function normalizeVersionPoolSearch(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[_.\-/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ModVersionBinaryGroup {
  key: string;
  relPath: string;
  fileName: string;
  displayTitle: string;
  isScript: boolean;
  typeLabel: string;
  versions: any[];
  activeVersion: any | null;
  isPinned?: boolean;
  totalBytes: number;
  reclaimableBytes: number;
  latestRecordedAt: number;
  searchIndex: string;
}

export interface ModVersionFamilyEntry {
  key: string;
  displayTitle: string;
  groups: ModVersionBinaryGroup[];
  isMultiModule: boolean;
  isScript: boolean;
  hasPackage: boolean;
  typeLabel: string;
  totalVersions: number;
  maxModuleVersions: number;
  totalBytes: number;
  reclaimableBytes: number;
  isPinned: boolean;
  compatLabel: string;
  isAllLinked: boolean;
  searchIndex: string;
}

export function groupModVersionPoolItems(
  items: any[],
  t: (k: string, f?: string) => string
): ModVersionBinaryGroup[] {
  const map = new Map<string, any[]>();
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item || !item.rel_path) continue;
    const rawRel = String(item.rel_path).replace(/\\/g, "/");
    const fileName = (rawRel.split("/").pop() || rawRel).toLowerCase();
    const arr = map.get(fileName);
    if (arr) {
      arr.push(item);
    } else {
      map.set(fileName, [item]);
    }
  }

  const groups: ModVersionBinaryGroup[] = [];
  map.forEach((rawVersions, key) => {
    // Deduplicate by dna_hash across duplicate subfolder paths, merging metadata
    const byHash = new Map<string, any>();
    for (const v of rawVersions) {
      const h = String(v.dna_hash || "").toLowerCase();
      if (!h) continue;
      const existing = byHash.get(h);
      if (!existing) {
        byHash.set(h, {
          ...v,
          compatible_versions: Array.isArray(v.compatible_versions)
            ? [...v.compatible_versions]
            : [],
        });
      } else {
        if (v.is_active && !existing.is_active) {
          existing.is_active = true;
          existing.rel_path = v.rel_path;
        }
        if (v.is_pinned && !existing.is_pinned) {
          existing.is_pinned = true;
        }
        if (!existing.mod_version && v.mod_version) {
          existing.mod_version = v.mod_version;
        }
        if (Array.isArray(v.compatible_versions)) {
          const mergedCompat = new Set([
            ...(existing.compatible_versions || []),
            ...v.compatible_versions,
          ]);
          existing.compatible_versions = Array.from(mergedCompat);
        }
        if ((Number(v.recorded_at) || 0) > (Number(existing.recorded_at) || 0)) {
          existing.recorded_at = v.recorded_at;
        }
      }
    }

    const versions = Array.from(byHash.values()).sort((a: any, b: any) => {
      const diff = (Number(b.recorded_at) || 0) - (Number(a.recorded_at) || 0);
      if (diff !== 0) return diff;
      if (Boolean(a.is_active) !== Boolean(b.is_active)) {
        return a.is_active ? -1 : 1;
      }
      return 0;
    });
    if (versions.length === 0) return;

    // Enforce at most one active version per binary group
    let foundActive = false;
    for (const v of versions) {
      if (v.is_active) {
        if (!foundActive) {
          foundActive = true;
        } else {
          v.is_active = false;
        }
      }
    }

    const activeVersion =
      versions.find((v: any) => v.is_active) || versions[0] || null;
    const relPath = String(activeVersion?.rel_path || versions[0].rel_path || key);
    const fileName = relPath.split(/[\\/]/).pop() || relPath;
    const isScript =
      isScriptExtension(fileName, useStore.getState().activeGameSchema) ||
      /\.script$/i.test(fileName);
    const typeLabel = isScript
      ? t("type_script", "Script")
      : t("type_package", "Module");
    const rawDisplay = formatDisplayName(fileName);
    const displayTitle = formatCleanModTitle(rawDisplay) || rawDisplay;

    let totalBytes = 0;
    let reclaimableBytes = 0;
    let latestRecordedAt = 0;
    const versionTokens: string[] = [];

    for (const v of versions) {
      const sz = Number(v.size_bytes) || 0;
      totalBytes += sz;
      if (!v.is_active) reclaimableBytes += sz;
      if ((Number(v.recorded_at) || 0) > latestRecordedAt) {
        latestRecordedAt = Number(v.recorded_at) || 0;
      }
      if (v.mod_version) versionTokens.push(String(v.mod_version));
      if (Array.isArray(v.compatible_versions)) {
        versionTokens.push(...v.compatible_versions.map(String));
      }
    }

    const searchIndex = normalizeVersionPoolSearch(
      `${displayTitle} ${fileName} ${relPath} ${typeLabel} ${versionTokens.join(" ")}`
    );
    const isPinned = versions.some((v: any) => Boolean(v.is_pinned));

    groups.push({
      key,
      relPath,
      fileName,
      displayTitle,
      isScript,
      typeLabel,
      versions,
      activeVersion,
      isPinned,
      totalBytes,
      reclaimableBytes,
      latestRecordedAt,
      searchIndex,
    });
  });

  groups.sort((a, b) => {
    const aMulti = a.versions.length > 1 ? 1 : 0;
    const bMulti = b.versions.length > 1 ? 1 : 0;
    if (bMulti !== aMulti) return bMulti - aMulti;
    if (b.versions.length !== a.versions.length) {
      return b.versions.length - a.versions.length;
    }
    return a.displayTitle.localeCompare(b.displayTitle);
  });

  return groups;
}

export function matchVersionGroupsForMod(
  target: any,
  groups: ModVersionBinaryGroup[]
): ModVersionBinaryGroup[] {
  if (!target || !Array.isArray(groups) || groups.length === 0) return [];
  const names = new Set<string>();
  const baseStems = new Set<string>();
  const hashes = new Set<string>();
  const extRegex = getExtensionRegex(useStore.getState().activeGameSchema);
  const addCandidate = (m: any) => {
    if (!m) return;
    const raw = String(m.name || m.file || "").replace(/\\/g, "/").toLowerCase();
    if (raw) {
      if (!/^(folder_|set_|local_set_|virtual_)/i.test(raw)) {
        names.add(raw);
        const base = raw.split("/").pop();
        if (base) {
          names.add(base);
          const stem = base
            .replace(extRegex, "")
            .replace(/\.(script|zip|rar|7z|tar|gz)$/i, "")
            .replace(/[_-]+/g, " ")
            .trim();
          if (stem.length >= 3) baseStems.add(stem);
        }
      }
    }
    const disp = String(m.displayName || "")
      .replace(/^(folder_|set_|local_set_|virtual_)/i, "")
      .replace(extRegex, "")
      .replace(/\.(script|zip|rar|7z|tar|gz)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase();
    if (disp.length >= 3 && !Boolean(m.isVirtual || m.isParent)) {
      baseStems.add(disp);
    }
    if (m.hash && !String(m.hash).startsWith("virtual_")) {
      hashes.add(String(m.hash).toLowerCase());
    }
  };
  addCandidate(target);
  if (Array.isArray(target.flavors)) target.flavors.forEach(addCandidate);
  if (Array.isArray(target._groupedModules))
    target._groupedModules.forEach(addCandidate);

  return groups.filter((g) => {
    const rel = String(g.relPath || "").replace(/\\/g, "/").toLowerCase();
    const base = rel.split("/").pop() || rel;
    const stem = base
      .replace(extRegex, "")
      .replace(/\.(script|zip|rar|7z|tar|gz)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
    if (names.has(rel) || names.has(base)) return true;
    if (stem && baseStems.has(stem)) return true;
    return g.versions.some((v: any) =>
      hashes.has(String(v.dna_hash || "").toLowerCase())
    );
  });
}

export function groupBinaryGroupsIntoFamilies(
  allGroups: ModVersionBinaryGroup[],
  displayModList: any[],
  t: (k: string, f?: string) => string
): ModVersionFamilyEntry[] {
  if (!Array.isArray(allGroups) || allGroups.length === 0) return [];

  const assignedKeys = new Set<string>();
  const rawBuckets: { key: string; title: string; groups: ModVersionBinaryGroup[] }[] = [];

  // Tier 1: Match parent suites from displayModList
  if (Array.isArray(displayModList) && displayModList.length > 0) {
    for (const m of displayModList) {
      if (
        !m ||
        !(m.isParent || (m.isVirtual && Array.isArray(m.flavors) && m.flavors.length > 1))
      ) {
        continue;
      }
      const matched = matchVersionGroupsForMod(m, allGroups).filter(
        (g) => !assignedKeys.has(g.key)
      );
      if (matched.length >= 2) {
        matched.forEach((g) => assignedKeys.add(g.key));
        const rawSuiteName = formatDisplayName(m.displayName || m.name || "");
        const cleanSuiteTitle = formatCleanModTitle(rawSuiteName) || rawSuiteName;
        rawBuckets.push({
          key: `suite_${String(m.hash || m.name || cleanSuiteTitle).toLowerCase()}`,
          title: cleanSuiteTitle,
          groups: matched,
        });
      }
    }
  }

  // Tier 2: Group remaining binaries that share the exact same clean displayTitle (e.g. binary module + script companion pair)
  const byCleanTitle = new Map<string, ModVersionBinaryGroup[]>();
  for (const g of allGroups) {
    if (assignedKeys.has(g.key)) continue;
    const normTitle = g.displayTitle
      .toLowerCase()
      .replace(/\b(script|scripts|package|pkg|core)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const key = normTitle || g.displayTitle.toLowerCase();
    const list = byCleanTitle.get(key);
    if (list) list.push(g);
    else byCleanTitle.set(key, [g]);
  }

  byCleanTitle.forEach((list, normKey) => {
    if (list.length >= 2) {
      list.forEach((g) => assignedKeys.add(g.key));
      rawBuckets.push({
        key: `pair_${normKey}`,
        title: list[0].displayTitle,
        groups: list,
      });
    }
  });

  // Remaining standalone binaries
  for (const g of allGroups) {
    if (assignedKeys.has(g.key)) continue;
    assignedKeys.add(g.key);
    rawBuckets.push({
      key: g.key,
      title: g.displayTitle,
      groups: [g],
    });
  }

  const entries: ModVersionFamilyEntry[] = rawBuckets.map((bucket) => {
    const sortedGroups = [...bucket.groups].sort((a, b) =>
      a.displayTitle.localeCompare(b.displayTitle)
    );
    const isMultiModule = sortedGroups.length > 1;
    const isScript = sortedGroups.some((g) => g.isScript);
    const hasPackage = sortedGroups.some((g) => !g.isScript);
    const typeLabel = isMultiModule
      ? `${sortedGroups.length} ${t("badge_modules_count", "Modules")}`
      : sortedGroups[0].typeLabel;
    const totalVersions = sortedGroups.reduce((s, g) => s + g.versions.length, 0);
    const maxModuleVersions = Math.max(
      0,
      ...sortedGroups.map((g) => g.versions.length)
    );
    const totalBytes = sortedGroups.reduce((s, g) => s + g.totalBytes, 0);
    const reclaimableBytes = sortedGroups.reduce((s, g) => s + g.reclaimableBytes, 0);
    const isPinned = sortedGroups.some((g) => Boolean(g.isPinned));
    const isAllLinked = sortedGroups.every((g) => Boolean(g.activeVersion?.is_active));

    const compatSet = new Set<string>();
    sortedGroups.forEach((g) => {
      const av = g.activeVersion || g.versions[0];
      if (Array.isArray(av?.compatible_versions)) {
        av.compatible_versions.forEach((cv: string) => {
          if (cv && String(cv).trim()) compatSet.add(String(cv).trim());
        });
      }
    });
    const compatLabel =
      compatSet.size > 0 ? Array.from(compatSet).join(", ") : t("any", "Any");

    const searchIndex = normalizeVersionPoolSearch(
      `${bucket.title} ${typeLabel} ${compatLabel} ${sortedGroups
        .map((g) => g.searchIndex)
        .join(" ")}`
    );

    return {
      key: bucket.key,
      displayTitle: bucket.title,
      groups: sortedGroups,
      isMultiModule,
      isScript,
      hasPackage,
      typeLabel,
      totalVersions,
      maxModuleVersions,
      totalBytes,
      reclaimableBytes,
      isPinned,
      compatLabel,
      isAllLinked,
      searchIndex,
    };
  });

  entries.sort((a, b) => {
    const aMultiVer = a.maxModuleVersions > 1 ? 1 : 0;
    const bMultiVer = b.maxModuleVersions > 1 ? 1 : 0;
    if (bMultiVer !== aMultiVer) return bMultiVer - aMultiVer;
    if (a.isMultiModule !== b.isMultiModule) return a.isMultiModule ? -1 : 1;
    if (b.totalVersions !== a.totalVersions) return b.totalVersions - a.totalVersions;
    return a.displayTitle.localeCompare(b.displayTitle);
  });

  return entries;
}
