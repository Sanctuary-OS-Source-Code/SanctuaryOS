import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./utils/envUtils";
import { resolvePayloadDependencies } from "./utils/stagingCrypto";
import { useLexicon } from "./LexiconContext";
import { supabase, submitThreatManifestToSpoke } from "./supabase";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";
import {
  GameVersionMultiSelect,
  deriveHumanReadableVersion,
  CustomDatePicker,
  CustomDropdown,
  CustomClassificationDropdown,
  CustomComplianceDropdown,
  getHighestVersion,
  getLowestVersion,
  getFileLabel,
  getExtensionRegex,
  getModIcon,
  isVersionMatch,
  mapDlcCode,
  parseStringArray,
  cleanSearchName,
  formatDisplayName,
  HoverTooltip,
  SidePanel,
  SidePanelHeroCard,
  SidePanelTitleInput,
  SidePanelPillToggle,
  UniversalGroup,
  StatBox,
  ActionButton,
  DashboardStatTile,
  getModFallbackUrl,
  handleOpenUrl,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
  stripPriorityTierPrefix,
  ActionPill,
  isScriptExtension,
  isModBinaryExtension,
} from "./shared";
import {
  normalizeModGroupTitle,
  formatCleanModTitle,
} from "./side-panels/CommandIncompatiblePanel";
import {
  LabVerificationGate,
  LabVerificationBadge,
  checkDnaHashVerification,
} from "./components/LabVerificationGate";
import {
  groupModVersionPoolItems,
  ModVersionHistorySidePanel,
  ModVersionBinaryGroup,
} from "./side-panels/VaultSidePanels";
import { UniversalTextArea } from "./components/universal/UniversalLayout";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractCleanUuid(...vals: any[]): string {
  for (const v of vals) {
    if (!v) continue;
    const cleaned = String(v)
      .trim()
      .replace(/^(FOLDER_|SET_|LOCAL_SET_|COLLECTION_|FLAVOR_|virtual_)/i, "")
      .split("@")[0]
      .trim();
    if (UUID_REGEX.test(cleaned)) return cleaned;
  }
  return "";
}

function collectAllCandidateUuids(target: any): string[] {
  if (!target) return [];
  const seen = new Set<string>();
  const add = (v: any) => {
    const u = extractCleanUuid(v);
    if (u) seen.add(u.toLowerCase());
  };
  const directUuid = extractCleanUuid(target.dbId, target.id);
  add(target.dbId);
  add(target.id);
  if (target.isVirtual || target.isParent || target.isCollection || !directUuid) {
    add(target.baseFamilyId);
    add(target.familyId);
    add(target.collectionId);
    add(target.flavorGroupId);
  }
  add(target.name);
  if (Array.isArray(target._groupedIds)) {
    target._groupedIds.forEach(add);
  }
  if (Array.isArray(target._groupedMods)) {
    target._groupedMods.forEach((gm: any) => {
      add(gm?.dbId);
      add(gm?.id);
    });
  }
  if (Array.isArray(target.flavors)) {
    target.flavors.forEach((fl: any) => {
      add(fl?.dbId);
      add(fl?.id);
    });
  }
  return Array.from(seen);
}

function isPlaceholderAuthorStr(val?: any, t?: any): boolean {
  if (!val || typeof val !== "string") return true;
  const low = val.trim().toLowerCase();
  if (
    low === "" ||
    low === "unknown" ||
    low === "unknown creator" ||
    low === "unknown mason" ||
    low === "unknown architect" ||
    low === "local" ||
    low === "local node" ||
    low === "local folder" ||
    low === "local vault" ||
    low === "local override" ||
    low === "unlinked" ||
    low === "v.local" ||
    low === "vlocal" ||
    low === "null" ||
    low === "undefined"
  ) {
    return true;
  }
  if (t) {
    const tLocal = String(t("source_local", "Local") || "").trim().toLowerCase();
    const tNode = String(t("local_node", "Local Node") || "").trim().toLowerCase();
    const tUnk = String(t("unknown", "Unknown") || "").trim().toLowerCase();
    if (low === tLocal || low === tNode || low === tUnk) return true;
  }
  return false;
}

function isPlaceholderVersionStr(val: any, t?: any): boolean {
  if (!val || typeof val !== "string") return true;
  const low = val.trim().toLowerCase();
  if (
    low === "" ||
    low === "unknown" ||
    low === "v.unknown" ||
    low === "vunknown" ||
    low === "local" ||
    low === "local node" ||
    low === "v.local" ||
    low === "vlocal" ||
    low === "vv.local" ||
    low === "null" ||
    low === "undefined"
  ) {
    return true;
  }
  if (t) {
    const tLocal = String(t("source_local", "Local") || "").trim().toLowerCase();
    const tNode = String(t("local_node", "Local Node") || "").trim().toLowerCase();
    const tUnk = String(t("unknown", "Unknown") || "").trim().toLowerCase();
    if (low === tLocal || low === tNode || low === tUnk) return true;
  }
  return false;
}

function pickFirstValidAuthor(t: any, ...candidates: any[]): string {
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") {
      if (!isPlaceholderAuthorStr(c, t)) return c.trim();
      continue;
    }
    const direct =
      (Array.isArray(c.masons) ? c.masons[0]?.name : c.masons?.name) ||
      c.author ||
      c.master_author ||
      c.creator_name ||
      c.suggested_author;
    if (direct && !isPlaceholderAuthorStr(direct, t)) {
      return String(direct).trim();
    }
  }
  return "";
}

const MOD_SELECT =
  "id, name, created_at, category_override, master_author, mason_id, masons(name), compliance_tier, image_url, description, url, compatible_versions, requiredDLC, status, status_reason, is_paid, is_early_access, mod_versions(dna_hash, version_label, created_at)";

const spokeMetadataCache = new Map<string, any>();
const cleanTitleCache = new Map<string, { cleanTitle: string; groupTitle: string }>();
const normTitleMatchCache = new Map<string, string>();
let cachedDossierVersionPoolItems: any[] | null = null;
let cachedDossierVersionPoolTimestamp = 0;

function getDossierTargetCacheKey(targetMod: any): string {
  if (!targetMod) return "";
  const idPart = extractCleanUuid(
    targetMod.dbId,
    targetMod.id,
    targetMod.baseFamilyId,
    targetMod.familyId,
    targetMod.name
  );
  const hashPart = String(targetMod.hash || "").trim();
  const namePart = String(targetMod.name || targetMod.displayName || "").trim();
  return `${idPart}::${hashPart}::${namePart}`.toLowerCase();
}

function getCachedGroupTitles(rawStr: string): { cleanTitle: string; groupTitle: string } {
  const cached = cleanTitleCache.get(rawStr);
  if (cached) return cached;
  const cleanTitle = formatCleanModTitle(rawStr) || rawStr;
  const groupTitle = normalizeModGroupTitle(cleanTitle) || cleanTitle;
  const res = { cleanTitle, groupTitle };
  if (cleanTitleCache.size > 6000) cleanTitleCache.clear();
  cleanTitleCache.set(rawStr, res);
  return res;
}

function DossierFilterSection({ title, options, value, onChange, t }: any) {
  if (!options || options.length === 0) return null;
  return (
    <div className="flex flex-col mb-4 w-full last:mb-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2 px-1 flex items-center gap-2">
        {title}
        <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
      </div>
      <div className="grid grid-cols-2 gap-1">
        {options.map((opt: any) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                active ? "is-selected font-bold" : "font-semibold"
              }`}
            >
              <span className="truncate flex items-center gap-2 min-w-0">
                {opt.label}
              </span>
              {active && (
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                  {t ? t("icon_check", "check") : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

async function fetchSpokeModMetadata(targetMod: any, t?: any): Promise<any | null> {
  if (!targetMod) return null;
  const cacheKey = getDossierTargetCacheKey(targetMod);
  if (cacheKey && spokeMetadataCache.has(cacheKey)) {
    return spokeMetadataCache.get(cacheKey);
  }
  const candidateIds = collectAllCandidateUuids(targetMod);
  const rawHash = String(targetMod.hash || "").trim();
  const candidateHash =
    rawHash && !/^(virtual_|set_|local_)/i.test(rawHash)
      ? rawHash
      : String(
          targetMod._groupedMods?.find(
            (gm: any) => gm?.hash && !/^(virtual_|set_|local_)/i.test(String(gm.hash))
          )?.hash ||
            targetMod.flavors?.find(
              (fl: any) => fl?.hash && !/^(virtual_|set_|local_)/i.test(String(fl.hash))
            )?.hash ||
            ""
        ).trim();

  const rawNameStr = String(
    (targetMod.displayName && !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(targetMod.displayName))
      ? targetMod.displayName
      : targetMod.name) || ""
  )
    .replace(/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i, "")
    .split(/[/\\]/)
    .pop()
    ?.replace(/\.[^/.]+$/, "")
    .trim() || "";
  const candidateName = UUID_REGEX.test(rawNameStr.split("@")[0]) ? "" : rawNameStr;

  let matchedMods: any[] = [];

  if (candidateIds.length > 0) {
    const { data } = await supabase
      .from("mods")
      .select(MOD_SELECT)
      .in("id", candidateIds.slice(0, 20));
    if (Array.isArray(data) && data.length > 0) {
      matchedMods = data;
    }
  }

  if (matchedMods.length === 0 && candidateHash) {
    const { data: vRow } = await supabase
      .from("mod_versions")
      .select(`mod_id, dna_hash, mods(${MOD_SELECT})`)
      .eq("dna_hash", candidateHash)
      .limit(1)
      .maybeSingle();
    if (vRow?.mods) {
      const mObj = Array.isArray(vRow.mods) ? vRow.mods[0] : vRow.mods;
      if (mObj) matchedMods = [mObj];
    }
  }

  if (matchedMods.length === 0 && candidateName) {
    const { data } = await supabase
      .from("mods")
      .select(MOD_SELECT)
      .ilike("name", candidateName)
      .limit(3);
    if (Array.isArray(data) && data.length > 0) {
      matchedMods = data;
    }
  }

  const allKnownIds = Array.from(
    new Set([
      ...candidateIds,
      ...matchedMods.map((m: any) => String(m?.id || "")).filter(Boolean),
    ])
  );

  let relatedMods: any[] = [];
  let hydratedRequirements: any[] = [];
  let hydratedTwins: any[] = [];
  let hydratedCollectionChildren: any[] = [];

  if (allKnownIds.length > 0) {
    const [
      { data: relParentRows },
      { data: relChildRows },
      { data: depRows },
      { data: colMemberRows },
    ] = await Promise.all([
      supabase
        .from("mod_relationships")
        .select("parent_id, child_id, relationship_type")
        .in("relationship_type", ["addon", "flavor", "set_item", "beta", "twin"])
        .in("child_id", allKnownIds.slice(0, 25))
        .limit(60),
      supabase
        .from("mod_relationships")
        .select("parent_id, child_id, relationship_type")
        .in("relationship_type", ["addon", "flavor", "set_item", "beta", "twin"])
        .in("parent_id", allKnownIds.slice(0, 25))
        .limit(500),
      supabase
        .from("mod_dependencies")
        .select("parent_id, child_id")
        .in("child_id", allKnownIds.slice(0, 25))
        .limit(60),
      supabase
        .from("collection_members")
        .select("set_id, mod_id")
        .in("set_id", allKnownIds.slice(0, 25))
        .limit(500),
    ]);

    const extraParentIds = Array.from(
      new Set([
        ...(relParentRows || []).map((r: any) => String(r.parent_id)),
        ...(relChildRows || []).map((r: any) => String(r.child_id)),
        ...(depRows || []).map((d: any) => String(d.parent_id)),
        ...(colMemberRows || []).map((c: any) => String(c.mod_id)),
      ])
    ).filter((pid) => pid && !allKnownIds.includes(pid));

    if (extraParentIds.length > 0) {
      const chunks: string[][] = [];
      const cappedIds = extraParentIds.slice(0, 450);
      for (let i = 0; i < cappedIds.length; i += 150) {
        chunks.push(cappedIds.slice(i, i + 150));
      }
      const chunkResults = await Promise.all(
        chunks.map((chunk) =>
          supabase.from("mods").select(MOD_SELECT).in("id", chunk)
        )
      );
      for (const res of chunkResults) {
        if (Array.isArray(res.data)) {
          relatedMods.push(...res.data);
        }
      }
    }

    const byId = new Map<string, any>();
    [...matchedMods, ...relatedMods].forEach((m: any) => {
      if (m?.id) byId.set(String(m.id), m);
    });

    const reqIds = Array.from(
      new Set([
        ...(depRows || []).map((d: any) => String(d.parent_id)),
        ...(relParentRows || [])
          .filter((r: any) => r.relationship_type === "addon")
          .map((r: any) => String(r.parent_id)),
      ])
    ).filter((id) => id && !allKnownIds.includes(id));

    hydratedRequirements = reqIds.map((rid) => {
      const m = byId.get(rid);
      return {
        id: rid,
        dbId: rid,
        name: m?.name || rid,
        displayName: m?.name || rid,
        url: m?.url || null,
        author: pickFirstValidAuthor(t, m) || undefined,
      };
    });

    const twinIds = Array.from(
      new Set([
        ...(relParentRows || [])
          .filter((r: any) => r.relationship_type === "twin")
          .map((r: any) => String(r.parent_id)),
        ...(relChildRows || [])
          .filter((r: any) => r.relationship_type === "twin")
          .map((r: any) => String(r.child_id)),
      ])
    ).filter((id) => id && !allKnownIds.includes(id));

    hydratedTwins = twinIds.map((tid) => {
      const m = byId.get(tid);
      return {
        id: tid,
        dbId: tid,
        name: m?.name || tid,
        displayName: m?.name || tid,
        url: m?.url || null,
        author: pickFirstValidAuthor(t, m) || undefined,
      };
    });

    const rawCollectionChildIds = Array.from(
      new Set([
        ...(relChildRows || [])
          .filter((r: any) => r.relationship_type !== "twin")
          .map((r: any) => String(r.child_id)),
        ...(colMemberRows || []).map((c: any) => String(c.mod_id)),
      ])
    ).filter(Boolean);

    if (rawCollectionChildIds.length > 0) {
      const allSuiteIds = Array.from(
        new Set([...allKnownIds, ...twinIds, ...rawCollectionChildIds])
      ).filter(Boolean);
      hydratedCollectionChildren = allSuiteIds
        .map((cid) => {
          const m = byId.get(cid);
          if (!m) return null;
          const latestV =
            Array.isArray(m.mod_versions) && m.mod_versions.length > 0
              ? m.mod_versions.find((mv: any) => !isPlaceholderVersionStr(mv?.version_label, t)) ||
                m.mod_versions[0]
              : null;
          return {
            id: cid,
            dbId: cid,
            hash: latestV?.dna_hash || undefined,
            name: m.name || cid,
            displayName: m.name || cid,
            url: m.url || null,
            author: pickFirstValidAuthor(t, m) || undefined,
            mason_id: m.mason_id || undefined,
            category_override: m.category_override || undefined,
            description: m.description || undefined,
            image_url: m.image_url || undefined,
            compatible_versions: m.compatible_versions || undefined,
            created_at: m.created_at || latestV?.created_at || undefined,
            updated_at: latestV?.created_at || m.created_at || undefined,
            version: !isPlaceholderVersionStr(latestV?.version_label, t)
              ? latestV?.version_label
              : undefined,
            status: m.status || "stable",
            mod_versions: m.mod_versions || undefined,
          };
        })
        .filter(Boolean);
    }
  }

  if (matchedMods.length === 0 && relatedMods.length === 0) return null;

  const primaryMod = matchedMods[0] || relatedMods[0];
  const allCandidates = [...matchedMods, ...relatedMods];

  const allVersions = matchedMods
    .flatMap((m: any) => (Array.isArray(m?.mod_versions) ? m.mod_versions : []))
    .concat(
      relatedMods.flatMap((m: any) => (Array.isArray(m?.mod_versions) ? m.mod_versions : []))
    );
  const latestVer =
    allVersions.find((mv: any) => !isPlaceholderVersionStr(mv?.version_label, t)) ||
    (allVersions.length > 0 ? allVersions[0] : null);

  const resolvedAuthor = pickFirstValidAuthor(t, ...allCandidates) || undefined;
  const resolvedMasonId =
    allCandidates.find((m: any) => m?.mason_id)?.mason_id || undefined;
  const resolvedDesc =
    allCandidates.find((m: any) => m?.description && String(m.description).trim() !== "")
      ?.description || undefined;
  const resolvedCategory =
    allCandidates.find((m: any) => m?.category_override)?.category_override || undefined;
  const resolvedUrl =
    allCandidates.find((m: any) => m?.url)?.url || undefined;
  const resolvedImg =
    allCandidates.find((m: any) => m?.image_url)?.image_url || undefined;
  const resolvedCompat =
    allCandidates.find(
      (m: any) => Array.isArray(m?.compatible_versions) && m.compatible_versions.length > 0
    )?.compatible_versions || undefined;
  const resolvedCreatedAt =
    matchedMods.find((m: any) => m?.created_at)?.created_at ||
    latestVer?.created_at ||
    relatedMods.find((m: any) => m?.created_at)?.created_at ||
    undefined;
  const resolvedUpdatedAt =
    latestVer?.created_at ||
    matchedMods.find((m: any) => m?.created_at)?.created_at ||
    relatedMods.find((m: any) => m?.created_at)?.created_at ||
    undefined;

  const hydratedByIdMap: Record<string, any> = {};
  for (const row of allCandidates) {
    if (!row?.id) continue;
    const rowLatestVer =
      Array.isArray(row.mod_versions) && row.mod_versions.length > 0
        ? row.mod_versions.find((mv: any) => !isPlaceholderVersionStr(mv?.version_label, t)) ||
          row.mod_versions[0]
        : null;
    const rowAuthor = pickFirstValidAuthor(t, row) || undefined;
    hydratedByIdMap[String(row.id).toLowerCase()] = {
      dbId: row.id,
      name: row.name,
      hash: rowLatestVer?.dna_hash || undefined,
      author: rowAuthor,
      master_author: rowAuthor,
      mason_id: row.mason_id || undefined,
      category_override: row.category_override || undefined,
      description: row.description || undefined,
      url: row.url || undefined,
      image_url: row.image_url || undefined,
      compatible_versions: row.compatible_versions || undefined,
      created_at: row.created_at || rowLatestVer?.created_at || undefined,
      updated_at: rowLatestVer?.created_at || row.created_at || undefined,
      version: rowLatestVer?.version_label || undefined,
      status: row.status || "stable",
      status_reason: row.status_reason || undefined,
      compliance_tier: row.compliance_tier ?? undefined,
      is_paid: Boolean(row.is_paid),
      is_early_access: Boolean(row.is_early_access),
      mod_versions: row.mod_versions || undefined,
    };
  }

  const resultPayload = {
    dbId: primaryMod?.id || candidateIds[0] || undefined,
    hash: latestVer?.dna_hash || undefined,
    author: resolvedAuthor,
    master_author: resolvedAuthor,
    mason_id: resolvedMasonId,
    category_override: resolvedCategory,
    description: resolvedDesc,
    url: resolvedUrl,
    image_url: resolvedImg,
    compatible_versions: resolvedCompat,
    created_at: resolvedCreatedAt,
    updated_at: resolvedUpdatedAt,
    version: !isPlaceholderVersionStr(latestVer?.version_label, t)
      ? latestVer?.version_label
      : undefined,
    status: primaryMod?.status || "stable",
    status_reason:
      matchedMods.find((m: any) => m?.status_reason)?.status_reason ||
      primaryMod?.status_reason ||
      undefined,
    compliance_tier: primaryMod?.compliance_tier ?? undefined,
    is_paid: matchedMods.some((m: any) => Boolean(m?.is_paid)),
    is_early_access: matchedMods.some((m: any) => Boolean(m?.is_early_access)),
    mod_versions: allVersions.length > 0 ? allVersions : undefined,
    requirements: hydratedRequirements.length > 0 ? hydratedRequirements : undefined,
    twins: hydratedTwins.length > 0 ? hydratedTwins : undefined,
    hydratedCollectionChildren:
      hydratedCollectionChildren.length > 0 ? hydratedCollectionChildren : undefined,
    hydratedByIdMap,
  };
  if (cacheKey) {
    if (spokeMetadataCache.size > 300) spokeMetadataCache.clear();
    spokeMetadataCache.set(cacheKey, resultPayload);
  }
  return resultPayload;
}

function normTitleForMatch(raw: any): string {
  if (!raw) return "";
  const rawStr = String(raw);
  const cached = normTitleMatchCache.get(rawStr);
  if (cached !== undefined) return cached;
  const s =
    rawStr
      .replace(/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i, "")
      .split(/[/\\]/)
      .pop() || "";
  if (!s || UUID_REGEX.test(s.split("@")[0])) {
    normTitleMatchCache.set(rawStr, "");
    return "";
  }
  const stripped = s
    .replace(/_/g, " ")
    .replace(/\.[^/.]+$/, "")
    .trim();
  if (!stripped) {
    normTitleMatchCache.set(rawStr, "");
    return "";
  }
  const { groupTitle } = getCachedGroupTitles(stripped);
  const res = groupTitle.toLowerCase().trim();
  if (normTitleMatchCache.size > 6000) normTitleMatchCache.clear();
  normTitleMatchCache.set(rawStr, res);
  return res;
}

interface VaultModIndex {
  allMods: any[];
  physicalMods: any[];
  virtualMods: any[];
  byUuid: Map<string, any[]>;
  physicalByUuid: Map<string, any[]>;
  physicalByHash: Map<string, any[]>;
  physicalByName: Map<string, any[]>;
  physicalByNormTitle: Map<string, any[]>;
  virtualByUuid: Map<string, any>;
}

function buildVaultModIndex(allVaultMods: any[]): VaultModIndex {
  const allMods = Array.isArray(allVaultMods) ? allVaultMods : [];
  const physicalMods: any[] = [];
  const virtualMods: any[] = [];
  const byUuid = new Map<string, any[]>();
  const physicalByUuid = new Map<string, any[]>();
  const physicalByHash = new Map<string, any[]>();
  const physicalByName = new Map<string, any[]>();
  const physicalByNormTitle = new Map<string, any[]>();
  const virtualByUuid = new Map<string, any>();

  const pushToMap = (map: Map<string, any[]>, key: string, val: any) => {
    if (!key) return;
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(val);
  };

  for (const vm of allMods) {
    if (!vm) continue;
    const vmUuid = extractCleanUuid(
      vm.dbId,
      vm.id,
      vm.baseFamilyId,
      vm.familyId
    ).toLowerCase();
    if (vmUuid) {
      pushToMap(byUuid, vmUuid, vm);
    }

    if (vm.isVirtual) {
      if (!vm.isCollection) {
        virtualMods.push(vm);
        const virtUuid = extractCleanUuid(
          vm.dbId,
          vm.baseFamilyId
        ).toLowerCase();
        if (virtUuid && !virtualByUuid.has(virtUuid)) {
          virtualByUuid.set(virtUuid, vm);
        }
      }
    } else {
      physicalMods.push(vm);
      const pmUuid = extractCleanUuid(vm.dbId, vm.id).toLowerCase();
      if (pmUuid) {
        pushToMap(physicalByUuid, pmUuid, vm);
      }
      if (vm.hash) {
        pushToMap(physicalByHash, String(vm.hash).toLowerCase(), vm);
      }
      if (vm.name && typeof vm.name === "string") {
        pushToMap(physicalByName, vm.name, vm);
        pushToMap(physicalByName, vm.name.toLowerCase(), vm);
      }
      const titleFromDisp = normTitleForMatch(vm.displayName);
      const titleFromName = normTitleForMatch(vm.name);
      if (titleFromDisp) pushToMap(physicalByNormTitle, titleFromDisp, vm);
      if (titleFromName && titleFromName !== titleFromDisp) {
        pushToMap(physicalByNormTitle, titleFromName, vm);
      }
    }
  }

  return {
    allMods,
    physicalMods,
    virtualMods,
    byUuid,
    physicalByUuid,
    physicalByHash,
    physicalByName,
    physicalByNormTitle,
    virtualByUuid,
  };
}

function mergeHydratedMod(
  baseMod: any,
  hydratedMeta: any,
  vaultOrIndex: VaultModIndex | any[],
  t: any
): any {
  if (!baseMod) return null;

  const childSources: any[] = [
    ...(Array.isArray(baseMod._groupedMods) ? baseMod._groupedMods : []),
    ...(Array.isArray(baseMod.flavors) ? baseMod.flavors : []),
  ];

  const cleanBaseId = extractCleanUuid(
    baseMod.dbId,
    baseMod.id,
    baseMod.baseFamilyId,
    baseMod.familyId,
    baseMod.name
  );

  if (cleanBaseId) {
    const cleanLower = cleanBaseId.toLowerCase();
    if (vaultOrIndex && !Array.isArray(vaultOrIndex) && vaultOrIndex.byUuid) {
      const matched = vaultOrIndex.byUuid.get(cleanLower);
      if (matched) {
        for (let i = 0; i < matched.length; i++) {
          childSources.push(matched[i]);
        }
      }
    } else if (Array.isArray(vaultOrIndex)) {
      for (const vm of vaultOrIndex) {
        if (!vm) continue;
        const vmId = extractCleanUuid(vm.dbId, vm.id, vm.baseFamilyId, vm.familyId);
        if (vmId && vmId.toLowerCase() === cleanLower) {
          childSources.push(vm);
        }
      }
    }
  }

  const resolvedAuthor =
    pickFirstValidAuthor(
      t,
      baseMod.author,
      baseMod.master_author,
      hydratedMeta?.author,
      hydratedMeta?.master_author,
      ...childSources
    ) ||
    hydratedMeta?.author ||
    baseMod.author ||
    "";

  const resolvedMasonId =
    baseMod.mason_id ||
    hydratedMeta?.mason_id ||
    childSources.find((cs: any) => cs?.mason_id)?.mason_id ||
    null;

  const resolvedCategory =
    baseMod.category_override ||
    baseMod.category ||
    baseMod.type ||
    hydratedMeta?.category_override ||
    childSources.find((cs: any) => cs?.category_override || cs?.category || cs?.type)
      ?.category_override ||
    "";

  const resolvedCompat =
    Array.isArray(baseMod.compatible_versions) && baseMod.compatible_versions.length > 0
      ? baseMod.compatible_versions
      : hydratedMeta?.compatible_versions ||
        childSources.find(
          (cs: any) =>
            Array.isArray(cs?.compatible_versions) && cs.compatible_versions.length > 0
        )?.compatible_versions ||
        [];

  const latestVerCreated =
    baseMod.mod_versions?.[0]?.created_at ||
    hydratedMeta?.mod_versions?.[0]?.created_at ||
    childSources.find((cs: any) => cs?.mod_versions?.[0]?.created_at)?.mod_versions?.[0]
      ?.created_at;

  const resolvedCreated =
    baseMod.created_at ||
    hydratedMeta?.created_at ||
    childSources.find((cs: any) => cs?.created_at)?.created_at ||
    latestVerCreated ||
    null;

  const resolvedUpdated =
    baseMod.updated_at ||
    hydratedMeta?.updated_at ||
    childSources.find((cs: any) => cs?.updated_at)?.updated_at ||
    latestVerCreated ||
    resolvedCreated ||
    null;

  const isLocalVerStr = (v: any) => isPlaceholderVersionStr(v, t);

  const resolvedVersion =
    (!isLocalVerStr(baseMod.version) ? baseMod.version : "") ||
    (!isLocalVerStr(baseMod.latest_version) ? baseMod.latest_version : "") ||
    (!isLocalVerStr(hydratedMeta?.version) ? hydratedMeta?.version : "") ||
    childSources.find((cs: any) => !isLocalVerStr(cs?.version))?.version ||
    "";

  const resolvedDesc =
    baseMod.description ||
    baseMod.desc ||
    hydratedMeta?.description ||
    childSources.find((cs: any) => cs?.description && String(cs.description).trim() !== "")
      ?.description ||
    "";

  const resolvedUrl =
    baseMod.url ||
    hydratedMeta?.url ||
    childSources.find((cs: any) => cs?.url)?.url ||
    "";

  const resolvedImageUrl =
    baseMod.image_url ||
    baseMod.imageUrl ||
    hydratedMeta?.image_url ||
    childSources.find((cs: any) => cs?.image_url || cs?.imageUrl)?.image_url ||
    "";

  return {
    ...baseMod,
    dbId:
      baseMod.dbId ||
      hydratedMeta?.dbId ||
      cleanBaseId ||
      (baseMod.isNexusView ? baseMod.id : undefined),
    hash: baseMod.hash || hydratedMeta?.hash || "",
    author: resolvedAuthor,
    master_author: resolvedAuthor,
    mason_id: resolvedMasonId,
    category: resolvedCategory,
    category_override: resolvedCategory,
    type: resolvedCategory,
    description: resolvedDesc,
    url: resolvedUrl,
    image_url: resolvedImageUrl,
    compatible_versions: resolvedCompat,
    created_at: resolvedCreated,
    updated_at: resolvedUpdated,
    version: resolvedVersion,
    status:
      baseMod.status ||
      hydratedMeta?.status ||
      childSources.find((cs: any) => cs?.status)?.status ||
      (baseMod.isNexusView ? "stable" : ""),
    status_reason:
      baseMod.status_reason ||
      hydratedMeta?.status_reason ||
      childSources.find((cs: any) => cs?.status_reason)?.status_reason ||
      undefined,
    compliance_tier:
      baseMod.compliance_tier ??
      hydratedMeta?.compliance_tier ??
      childSources.find((cs: any) => cs?.compliance_tier != null)?.compliance_tier ??
      0,
    is_paid: Boolean(
      baseMod.is_paid ||
        hydratedMeta?.is_paid ||
        childSources.some((cs: any) => Boolean(cs?.is_paid))
    ),
    is_early_access: Boolean(
      baseMod.is_early_access ||
        hydratedMeta?.is_early_access ||
        childSources.some((cs: any) => Boolean(cs?.is_early_access))
    ),
    mod_versions:
      baseMod.mod_versions ||
      hydratedMeta?.mod_versions ||
      childSources.find((cs: any) => cs?.mod_versions)?.mod_versions,
    requirements:
      Array.isArray(baseMod.requirements) && baseMod.requirements.length > 0
        ? baseMod.requirements
        : Array.isArray(baseMod.requires) && baseMod.requires.length > 0
          ? baseMod.requires
          : hydratedMeta?.requirements || undefined,
    twins:
      Array.isArray(baseMod.twins) && baseMod.twins.length > 0
        ? baseMod.twins
        : hydratedMeta?.twins || undefined,
    hydratedCollectionChildren:
      hydratedMeta?.hydratedCollectionChildren ||
      baseMod.hydratedCollectionChildren ||
      undefined,
  };
}

const DossierModuleCard = React.memo(function DossierModuleCard({
  item,
  activeMods,
  isModNameEquipped,
  isNexusView,
  activeGameSchema,
  showImages,
  t,
  onInspect,
  onToggleGroup,
  onToggleSingle,
  isSingleItemStaged,
  handleStageTargetToPc,
}: any) {
  const [isExpanded, setIsExpanded] = useState(false);

  const groupedMods: any[] =
    Array.isArray(item._groupedMods) && item._groupedMods.length > 0
      ? item._groupedMods
      : [item];
  const isInstalled = item.isInstalled !== false;
  const relationType: "manifest" | "requirement" | "twin" =
    item.relationType || "manifest";

  const checkEquipped = (n: string): boolean =>
    typeof isModNameEquipped === "function"
      ? isModNameEquipped(n)
      : Array.isArray(activeMods) && activeMods.includes(n);

  const equippableNames = groupedMods
    .map((gm: any) => gm?.name)
    .filter(
      (n: any) =>
        n &&
        typeof n === "string" &&
        !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
    );
  const isEquipped =
    isInstalled &&
    equippableNames.length > 0 &&
    equippableNames.some((n: string) => checkEquipped(n));

  const rawTitle =
    item._groupedTitle ||
    (item.displayName &&
    !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(item.displayName))
      ? item.displayName
      : (item.name || "")
          .replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "")
          .split(/[/\\]/)
          .pop() || "");
  const title =
    formatCleanModTitle(
      String(rawTitle).replace(/_/g, " ").replace(/\.[^/.]+$/, "")
    ) || String(rawTitle);

  const validCreator = pickFirstValidAuthor(t, item, ...groupedMods);

  const activeSchemaRef = useStore.getState().activeGameSchema;
  const hasScriptFile = groupedMods.some((gm: any) =>
    isScriptExtension(
      String(gm?.name || gm?.file_extension || gm?._originalSetName || ""),
      activeSchemaRef
    )
  );
  const hasPackageFile = groupedMods.some((gm: any) => {
    const rawTarget = String(gm?.name || gm?.file_extension || gm?._originalSetName || "");
    return !isScriptExtension(rawTarget, activeSchemaRef) && isModBinaryExtension(rawTarget, activeSchemaRef);
  });

  const typeLabel = hasScriptFile
    ? t("type_script", "Script")
    : hasPackageFile
      ? t("type_package", "Package")
      : item.category_override || item.type || t("type_package", "Package");

  const rawVer =
    item.mod_versions?.[0]?.version_label ||
    item.version ||
    groupedMods.find(
      (gm: any) =>
        gm?.mod_versions?.[0]?.version_label ||
        (gm?.version && !/^(v\.?local|local|unknown)$/i.test(String(gm.version)))
    )?.version ||
    "";
  const hasRealVersion = Boolean(
    rawVer && !/^(v\.?local|local|unknown)$/i.test(String(rawVer).trim())
  );
  const cleanVer = hasRealVersion
    ? String(rawVer).replace(/^v\.?/i, "").trim()
    : null;

  const image =
    showImages &&
    (item.image_url || item.imageUrl) &&
    String(item.image_url || item.imageUrl) !== "null" &&
    String(item.image_url || item.imageUrl).trim() !== ""
      ? item.image_url || item.imageUrl
      : undefined;

  const modIcon = !isInstalled
    ? t("icon_error", "error")
    : getModIcon(item, activeGameSchema, t);

  const statusRaw = String(item.status || "")
    .toLowerCase()
    .replace(/[\[\]]/g, "");
  const isBroken = statusRaw === "broken" || statusRaw === "corrupted";
  const isWarn = statusRaw === "unstable" || statusRaw === "paid";

  const iconColorClass = !isInstalled || isBroken
    ? "text-[var(--danger)]"
    : isWarn
      ? "text-[var(--warning)]"
      : "text-[var(--accent)]";

  const searchOrDownloadUrl =
    item.url ||
    getModFallbackUrl(title || item.name || "", item.hash, activeGameSchema, {
      url: item.url,
    });

  return (
    <div
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 108px" }}
      onClick={() => {
        if (isInstalled || item.dbId || (item._groupedIds && item._groupedIds.length > 0)) {
          onInspect(item);
        } else {
          handleOpenUrl(searchOrDownloadUrl);
        }
      }}
      className={`glass-panel rounded-2xl p-3.5 border flex flex-col justify-between gap-3 transition-all duration-200 cursor-pointer relative ${
        isExpanded && groupedMods.length > 1 ? "sm:col-span-2" : ""
      } ${
        !isInstalled
          ? "border-[color-mix(in_srgb,var(--danger)_32%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)]"
          : isEquipped
            ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
      }`}
    >
      {/* Top Tier: Icon Well + Title & Subtitle */}
      <div className="flex items-center gap-3 min-w-0 w-full">
        {image ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
            <img src={image} alt={title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${iconColorClass}`}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {modIcon}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
              {title}
            </span>
            <HoverTooltip className="z-[100]" title={title} icon={modIcon} />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
            {validCreator && (
              <>
                <span className="truncate opacity-85">
                  {formatCleanModTitle(validCreator)}
                </span>
                <span className="opacity-40 shrink-0">•</span>
              </>
            )}
            <span className="opacity-85 shrink-0">{typeLabel}</span>
            {groupedMods.length > 1 && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="opacity-85 shrink-0">
                  {groupedMods.length} {t("badge_modules_count", "Modules")}
                </span>
              </>
            )}
            {cleanVer && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="font-mono text-[10px] font-bold text-[var(--subtext)] opacity-85 shrink-0">
                  v{cleanVer}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Status & Action Bar */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {relationType === "requirement" ? (
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] shrink-0 ${
                  isInstalled ? "text-[var(--accent)]" : "text-[var(--danger)]"
                }`}
              >
                {isInstalled
                  ? t("icon_extension", "extension")
                  : t("icon_error", "error")}
              </span>
              <span>
                {isInstalled
                  ? t("requirement_essential", "Requirement")
                  : t("status_missing", "Missing")}
              </span>
            </span>
          ) : relationType === "twin" ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <span>{t("identity_twin", "Twin")}</span>
            </span>
          ) : !isInstalled ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--danger)]">
                {t("icon_error", "error")}
              </span>
              <span>{t("status_missing", "Missing")}</span>
            </span>
          ) : (
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] shrink-0 ${
                  isBroken
                    ? "text-[var(--danger)]"
                    : isWarn
                      ? "text-[var(--warning)]"
                      : statusRaw === "stable" ||
                          statusRaw === t("status_stable", "stable").toLowerCase()
                        ? "text-[var(--success)]"
                        : "text-[var(--subtext)]"
                }`}
              >
                {isBroken
                  ? t("icon_pest_control", "pest_control")
                  : isWarn
                    ? t("icon_warning", "warning")
                    : statusRaw === "stable" ||
                        statusRaw === t("status_stable", "stable").toLowerCase()
                      ? t("icon_verified_user", "verified_user")
                      : t("icon_label", "label")}
              </span>
              <span className="truncate">
                {isBroken
                  ? t("status_corrupted", "Broken")
                  : statusRaw === "stable" ||
                      statusRaw === t("status_stable", "stable").toLowerCase()
                    ? t("status_stable", "Stable")
                    : statusRaw
                      ? statusRaw.replace(/_/g, " ")
                      : t("badge_local", "Unlinked")}
              </span>
            </span>
          )}
        </div>

        {/* Bottom-Right Compact Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {groupedMods.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                isExpanded
                  ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${groupedMods.length} ${t("badge_modules_count", "Modules")}`}
                icon={t("icon_account_tree", "account_tree")}
              />
            </button>
          )}

          {(relationType === "requirement" || relationType === "twin" || !isInstalled) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUrl(searchOrDownloadUrl);
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {!isDesktop()
                  ? t("icon_open_in_new", "open_in_new")
                  : item.url
                    ? t("icon_download", "download")
                    : t("icon_open_in_new", "open_in_new")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={
                  !isDesktop()
                    ? item.url
                      ? t("btn_view", "View")
                      : t("btn_search_web", "Search Web")
                    : item.url
                      ? t("btn_download", "Download")
                      : t("btn_search_web", "Search Web")
                }
                icon={
                  !isDesktop()
                    ? t("icon_open_in_new", "open_in_new")
                    : item.url
                      ? t("icon_download", "download")
                      : t("icon_open_in_new", "open_in_new")
                }
              />
            </button>
          )}

          {isInstalled && !isNexusView && equippableNames.length > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleGroup(item);
              }}
              className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                isEquipped
                  ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)]"
                  : "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {isEquipped ? t("icon_close", "close") : t("icon_add", "add")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={
                  isEquipped
                    ? t("btn_unequip", "Unequip {Mod}")
                    : t("btn_equip", "Equip {Mod}")
                }
                icon={
                  isEquipped ? t("icon_close", "close") : t("icon_add", "add")
                }
                variant={isEquipped ? "danger" : "default"}
              />
            </button>
          ) : isInstalled && isNexusView && !isDesktop() ? (
            (() => {
              const kidStaged = isSingleItemStaged(item);
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStageTargetToPc(
                      { ...item, _stageSingle: true },
                      kidStaged
                    );
                  }}
                  className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                    kidStaged
                      ? "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                      : "text-[var(--subtext)] hover:text-[var(--accent)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {kidStaged
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_phonelink", "phonelink")}
                  </span>
                </button>
              );
            })()
          ) : null}
        </div>
      </div>

      {/* Expandable Child Modules Drawer */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-1.5"
        >
          {groupedMods.map((gm: any, idx: number) => {
            const rawChildFile =
              (gm?.name || "").split(/[/\\]/).pop() ||
              gm?.displayName ||
              title;
            const childExt = rawChildFile.includes(".")
              ? `.${rawChildFile.split(".").pop()?.toUpperCase()}`
              : getFileLabel(gm?.name || "", activeGameSchema);
            const childClean =
              formatCleanModTitle(
                rawChildFile.replace(/_/g, " ").replace(/\.[^/.]+$/, "")
              ) || rawChildFile;
            const childEquipped = Boolean(gm?.name && checkEquipped(gm.name));
            const isChildScript = isScriptExtension(rawChildFile, activeGameSchema);

            return (
              <div
                key={gm?.hash || gm?.name || idx}
                onClick={() => onInspect(gm)}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                    {isChildScript
                      ? t("icon_terminal", "terminal")
                      : t("icon_deployed_code", "deployed_code")}
                  </span>
                  <span className="text-xs font-bold text-[var(--text)] truncate">
                    {childClean}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={VAULT_CHIP_CLASS}>{childExt}</span>
                  {!isNexusView &&
                    gm?.name &&
                    !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(String(gm.name)) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSingle(gm.name);
                        }}
                        className={`w-6 h-6 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer ${
                          childEquipped
                            ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
                            : "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_40%,transparent)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {childEquipped
                            ? t("icon_close", "close")
                            : t("icon_add", "add")}
                        </span>
                      </button>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}, function areDossierModuleCardsEqual(prevProps: any, nextProps: any) {
  if (prevProps.item !== nextProps.item) return false;
  if (prevProps.isNexusView !== nextProps.isNexusView) return false;
  if (prevProps.showImages !== nextProps.showImages) return false;
  if (prevProps.activeGameSchema !== nextProps.activeGameSchema) return false;

  const getEquippedMask = (props: any) => {
    const it = props.item;
    if (!it || it.isInstalled === false) return "0";
    const gMods =
      Array.isArray(it._groupedMods) && it._groupedMods.length > 0
        ? it._groupedMods
        : [it];
    const check =
      typeof props.isModNameEquipped === "function"
        ? props.isModNameEquipped
        : (n: string) =>
            Array.isArray(props.activeMods) && props.activeMods.includes(n);
    let mask = "";
    for (let i = 0; i < gMods.length; i++) {
      const n = gMods[i]?.name;
      if (
        n &&
        typeof n === "string" &&
        !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
      ) {
        mask += check(n) ? "1" : "0";
      }
    }
    return mask;
  };

  if (getEquippedMask(prevProps) !== getEquippedMask(nextProps)) return false;

  if (nextProps.isNexusView) {
    const prevStaged = Boolean(prevProps.isSingleItemStaged?.(prevProps.item));
    const nextStaged = Boolean(nextProps.isSingleItemStaged?.(nextProps.item));
    if (prevStaged !== nextStaged) return false;
  }

  return true;
});

export default function ModDossier({
  mod: rawMod,
  modList,
  ownedDLC,
  maskedDLC,
  activePlaySet,
  onToggleInActiveSet,
  onShowYeetAlert,
  onClose,
  metaInputs,
  setMetaInputs,
  onSaveMetadata,
  onResetMetadata,
  onOpenMasonProfile,
  editMode,
  setEditMode,
  onSendToLab,
  onSecureShred,
  isCorrecting,
  setIsCorrecting,
  onSyncToNetwork,
}: any) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const storeModList = useStore((state: any) => state.modList);
  const selectedVersion = useStore((state: any) => state.selectedVersion);
  const storePlaySets = useStore((state: any) => state.playSets);
  const anarchyRules = useStore((state: any) => state.anarchyRules);
  const storeOwnedDLC = useStore((state: any) => state.ownedDLC);
  const storeMaskedDLC = useStore((state: any) => state.maskedDLC);
  const effectiveOwnedDLC: string[] = Array.isArray(ownedDLC) ? ownedDLC : Array.isArray(storeOwnedDLC) ? storeOwnedDLC : [];
  const effectiveMaskedDLC: string[] = Array.isArray(maskedDLC) ? maskedDLC : Array.isArray(storeMaskedDLC) ? storeMaskedDLC : [];
  const [dossierAlertPending, setDossierAlertPending] = useState<any | null>(null);
  const allAvailableMods = useMemo(() => {
    const combined: any[] = [];
    const seen = new Set<string>();
    for (const src of [modList || [], storeModList || []]) {
      for (const m of src) {
        if (!m) continue;
        const key = `${m.name || ""}::${m.hash || ""}::${m.dbId || ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(m);
        }
      }
    }
    return combined;
  }, [modList, storeModList]);

  const vaultIndex = useMemo(
    () => buildVaultModIndex(allAvailableMods),
    [allAvailableMods]
  );

  const requireScoutLabTest =
    activeGameSchema?.lab_verification?.require_for_scout_approval !== false;
  const session = useStore((state) => state.session);
  const [isDossierOpen, setIsDossierOpen] = useState(true);
  const [isModLabVerified, setIsModLabVerified] = useState<boolean>(false);
  const [hydratedMeta, setHydratedMeta] = useState<any | null>(() => {
    const k = getDossierTargetCacheKey(rawMod);
    return k ? spokeMetadataCache.get(k) || null : null;
  });
  const [kidHydratedMeta, setKidHydratedMeta] = useState<any | null>(null);
  const [relationDbMap, setRelationDbMap] = useState<Record<string, any>>({});
  const [collectionFilter, setCollectionFilter] = useState<"all" | "in_vault" | "missing">("all");
  const [collectionSearchQuery, setCollectionSearchQuery] = useState<string>("");
  const deferredCollectionSearch = React.useDeferredValue(collectionSearchQuery);
  const [collectionEquipFilter, setCollectionEquipFilter] = useState<"ALL" | "EQUIPPED" | "UNEQUIPPED">("ALL");
  const [collectionCategoryFilter, setCollectionCategoryFilter] = useState<string>("ALL");
  const [collectionStatusFilter, setCollectionStatusFilter] = useState<string>("ALL");

  const [kidCollectionFilter, setKidCollectionFilter] = useState<"all" | "in_vault" | "missing">("all");
  const [kidSearchQuery, setKidSearchQuery] = useState<string>("");
  const deferredKidSearch = React.useDeferredValue(kidSearchQuery);
  const [kidEquipFilter, setKidEquipFilter] = useState<"ALL" | "EQUIPPED" | "UNEQUIPPED">("ALL");
  const [kidCategoryFilter, setKidCategoryFilter] = useState<string>("ALL");
  const [kidStatusFilter, setKidStatusFilter] = useState<string>("ALL");

  const [versionPoolItems, setVersionPoolItems] = useState<any[]>(
    () => cachedDossierVersionPoolItems || []
  );
  const [selectedVersionGroupKeys, setSelectedVersionGroupKeys] = useState<string[]>([]);
  const [visibleKidsLimit, setVisibleKidsLimit] = useState<number>(30);
  const kidsSentinelRef = React.useRef<HTMLDivElement | null>(null);

  const loadDossierVersionPool = React.useCallback(async (forceRefresh = false) => {
    if (!isDesktop()) return;
    if (
      !forceRefresh &&
      cachedDossierVersionPoolItems &&
      Date.now() - cachedDossierVersionPoolTimestamp < 60000
    ) {
      setVersionPoolItems(cachedDossierVersionPoolItems);
      return;
    }
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (vaultPath) {
        const res: any = await invoke("get_mod_version_pool_status", { vaultPath });
        if (res && Array.isArray(res.items)) {
          cachedDossierVersionPoolItems = res.items;
          cachedDossierVersionPoolTimestamp = Date.now();
          React.startTransition(() => {
            setVersionPoolItems(res.items);
          });
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isDossierOpen && isDesktop()) {
      const timer = setTimeout(() => {
        loadDossierVersionPool(false);
      }, 220);
      return () => clearTimeout(timer);
    } else if (!isDossierOpen) {
      setSelectedVersionGroupKeys([]);
    }
  }, [isDossierOpen, rawMod?.id, rawMod?.dbId, rawMod?.hash, rawMod?.name, loadDossierVersionPool]);

  const handleActivateDossierVersion = async (relPath: string, dnaHash: string) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("activate_archived_mod_version", {
        vaultPath,
        relPath,
        dnaHash,
      });
      await loadDossierVersionPool(true);
    } catch {}
  };

  const handleDeleteDossierVersion = async (relPath: string, dnaHash: string) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("delete_archived_mod_version", {
        vaultPath,
        relPath,
        dnaHash,
      });
      await loadDossierVersionPool(true);
    } catch {}
  };

  const filterVersionGroupsForTarget = React.useCallback(
    (targetObj: any): ModVersionBinaryGroup[] => {
      if (!targetObj || versionPoolItems.length === 0) return [];
      const relPaths = new Set<string>();
      const fileNames = new Set<string>();
      const hashes = new Set<string>();

      const registerCandidate = (item: any) => {
        if (!item) return;
        if (item.hash) hashes.add(String(item.hash).toLowerCase());
        const rawName = String(item.name || "");
        if (rawName && !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(rawName)) {
          const normRel = rawName.replace(/\\/g, "/").toLowerCase();
          relPaths.add(normRel);
          const base = normRel.split("/").pop();
          if (base) fileNames.add(base);
        }
      };

      registerCandidate(targetObj);
      if (Array.isArray(targetObj.flavors)) targetObj.flavors.forEach(registerCandidate);
      if (Array.isArray(targetObj._groupedMods)) targetObj._groupedMods.forEach(registerCandidate);

      if (relPaths.size === 0 && fileNames.size === 0 && hashes.size === 0) {
        return [];
      }

      const matchedPoolItems = versionPoolItems.filter((item: any) => {
        if (!item) return false;
        const h = item.dna_hash ? String(item.dna_hash).toLowerCase() : "";
        if (h && hashes.has(h)) return true;
        const rawRel = String(item.rel_path || "").replace(/\\/g, "/").toLowerCase();
        if (rawRel && relPaths.has(rawRel)) return true;
        const base = rawRel.split("/").pop() || rawRel;
        return Boolean(base && fileNames.has(base));
      });

      if (matchedPoolItems.length === 0) return [];
      return groupModVersionPoolItems(matchedPoolItems, t);
    },
    [versionPoolItems, t]
  );

  const [activeVersionModalGroups, setActiveVersionModalGroups] = useState<ModVersionBinaryGroup[]>([]);

  const selectedVersionGroups = useMemo(() => {
    if (selectedVersionGroupKeys.length === 0) return [];
    const matchedFromActive = activeVersionModalGroups.filter((g) =>
      selectedVersionGroupKeys.includes(g.key)
    );
    if (matchedFromActive.length > 0) return matchedFromActive;
    const rawMatched = versionPoolItems.filter((item: any) => {
      const rawRel = String(item?.rel_path || "").replace(/\\/g, "/");
      const fileName = (rawRel.split("/").pop() || rawRel).toLowerCase();
      return selectedVersionGroupKeys.includes(fileName);
    });
    return groupModVersionPoolItems(rawMatched, t);
  }, [selectedVersionGroupKeys, activeVersionModalGroups, versionPoolItems, t]);

  useEffect(() => {
    const cached = getDossierTargetCacheKey(rawMod)
      ? spokeMetadataCache.get(getDossierTargetCacheKey(rawMod)) || null
      : null;
    setHydratedMeta(cached);
    setCollectionFilter("all");
    setCollectionSearchQuery("");
    setCollectionEquipFilter("ALL");
    setCollectionCategoryFilter("ALL");
    setCollectionStatusFilter("ALL");
    setVisibleKidsLimit(30);
    if (!rawMod || cached) return;
    let cancelled = false;
    fetchSpokeModMetadata(rawMod, t)
      .then((res) => {
        if (!cancelled && res) {
          React.startTransition(() => {
            setHydratedMeta(res);
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rawMod?.id, rawMod?.dbId, rawMod?.hash, rawMod?.name]);

  const mod = useMemo(
    () => mergeHydratedMod(rawMod, hydratedMeta, vaultIndex, t),
    [rawMod, hydratedMeta, vaultIndex, t]
  );

  const combinedDbMap = useMemo(
    () => ({
      ...(hydratedMeta?.hydratedByIdMap || {}),
      ...relationDbMap,
    }),
    [hydratedMeta?.hydratedByIdMap, relationDbMap]
  );

  useEffect(() => {
    if (!mod?.hash) {
      setIsModLabVerified(false);
      return;
    }
    checkDnaHashVerification(mod.hash).then((res) => {
      setIsModLabVerified(res.verified);
    });
  }, [mod?.hash]);

  const handleClose = () => {
    setIsDossierOpen(false);
    setTimeout(() => {
      if (onClose) onClose();
    }, 500);
  };

  const [selectedKid, setSelectedKid] = useState<any | null>(null);
  const [displayedKid, setDisplayedKid] = useState<any | null>(null);
  useEffect(() => {
    if (selectedKid) setDisplayedKid(selectedKid);
  }, [selectedKid]);
  const rawKidToRender = selectedKid || displayedKid;

  const handleInspectKid = React.useCallback((target: any) => {
    setSelectedKid(target);
  }, []);

  useEffect(() => {
    const cached = getDossierTargetCacheKey(rawKidToRender)
      ? spokeMetadataCache.get(getDossierTargetCacheKey(rawKidToRender)) || null
      : null;
    setKidHydratedMeta(cached);
    setKidCollectionFilter("all");
    setKidSearchQuery("");
    setKidEquipFilter("ALL");
    setKidCategoryFilter("ALL");
    setKidStatusFilter("ALL");
    if (!rawKidToRender || cached) return;
    let cancelled = false;
    fetchSpokeModMetadata(rawKidToRender, t)
      .then((res) => {
        if (!cancelled && res) {
          React.startTransition(() => {
            setKidHydratedMeta(res);
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    rawKidToRender?.id,
    rawKidToRender?.dbId,
    rawKidToRender?.hash,
    rawKidToRender?.name,
    rawKidToRender?._groupedTitle,
  ]);

  const kidToRender = useMemo(() => {
    if (!rawKidToRender) return null;
    const preHydratedId = extractCleanUuid(
      rawKidToRender.dbId,
      rawKidToRender.id,
      rawKidToRender.baseFamilyId,
      rawKidToRender.name
    );
    const fromRelMap = preHydratedId ? combinedDbMap[preHydratedId.toLowerCase()] : null;
    return mergeHydratedMod(
      rawKidToRender,
      kidHydratedMeta || fromRelMap,
      vaultIndex,
      t
    );
  }, [rawKidToRender, kidHydratedMeta, combinedDbMap, vaultIndex, t]);
  const [isSaving, setIsSaving] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const isNexusView = mod?.isNexusView;
  const targetDbId =
    mod?.dbId ||
    (isNexusView &&
    mod?.id &&
    String(mod.id).match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
      ? mod.id
      : null);
  const [isBanned, setIsBanned] = useState(false);
  const [, setBanReason] = useState("");

  useEffect(() => {
    if (session?.user?.id) {
      supabase
        .from("profiles")
        .select("is_comm_banned, comm_blacklist_reason")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          if (data?.is_comm_banned) {
            setIsBanned(true);
            setBanReason(data.comm_blacklist_reason || "Communications Ban");
          }
        });
    }
  }, [session]);

  const [localCreatedAt, setLocalCreatedAt] = useState<string | null>(
    mod?.created_at || null
  );
  const [localUpdatedAt, setLocalUpdatedAt] = useState<string | null>(
    mod?.updated_at || null
  );
  const showImages = useStore((state: any) => state.showImages);
  const [localCategory, setLocalCategory] = useState<string>(
    mod?.category_override || mod?.category || mod?.type || ""
  );
  const [localCompatibleVersions, setLocalCompatibleVersions] = useState<
    string[]
  >(mod?.compatible_versions || []);

  useEffect(() => {
    if (mod) {
      setLocalCreatedAt(mod.created_at || null);
      setLocalUpdatedAt(mod.updated_at || null);
      setLocalCategory(mod.category_override || mod.category || mod.type || "");
      setLocalCompatibleVersions(mod.compatible_versions || []);
    }
  }, [mod]);

  const userRole = useStore((state: any) => state.userRole);
  const {
    stagingDraftItems,
    setStagingDraftItems,
    toggleModInStagingDraft,
  } = useModalStore(
    useShallow((s) => ({
      stagingDraftItems: s.stagingDraftItems,
      setStagingDraftItems: s.setStagingDraftItems,
      toggleModInStagingDraft: s.toggleModInStagingDraft,
    }))
  );

  useEffect(() => {
    if (!mod) {
      setRelationDbMap({});
      return;
    }
    const alreadyHydrated = hydratedMeta?.hydratedByIdMap || {};
    const candidateSet = new Set<string>();
    const addEntry = (item: any) => {
      if (!item) return;
      const raw =
        typeof item === "string" ? item : item.id || item.dbId || item.hash || "";
      const u = extractCleanUuid(raw);
      if (u) {
        const lower = u.toLowerCase();
        if (!alreadyHydrated[lower] && !vaultIndex.byUuid.has(lower)) {
          candidateSet.add(lower);
        }
      }
    };
    (mod.requirements || mod.requires || []).forEach(addEntry);
    (mod.twins || []).forEach(addEntry);
    if (Array.isArray(mod.flavors)) {
      mod.flavors.forEach((fl: any) => {
        (fl?.requirements || fl?.requires || []).forEach(addEntry);
        (fl?.twins || []).forEach(addEntry);
      });
    }
    const uuids = Array.from(candidateSet).slice(0, 40);
    if (uuids.length === 0) return;

    let cancelled = false;
    supabase
      .from("mods")
      .select(MOD_SELECT)
      .in("id", uuids)
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return;
        const map: Record<string, any> = {};
        for (const row of data) {
          if (!row?.id) continue;
          const latestVer =
            Array.isArray(row.mod_versions) && row.mod_versions.length > 0
              ? row.mod_versions[0]
              : null;
          const resolvedAuthor = pickFirstValidAuthor(t, row) || undefined;
          map[String(row.id).toLowerCase()] = {
            dbId: row.id,
            name: row.name,
            hash: latestVer?.dna_hash || undefined,
            author: resolvedAuthor,
            master_author: resolvedAuthor,
            mason_id: row.mason_id || undefined,
            category_override: row.category_override || undefined,
            description: row.description || undefined,
            url: row.url || undefined,
            image_url: row.image_url || undefined,
            compatible_versions: row.compatible_versions || undefined,
            created_at: row.created_at || latestVer?.created_at || undefined,
            updated_at: latestVer?.created_at || row.created_at || undefined,
            version: latestVer?.version_label || undefined,
            status: row.status || "stable",
            status_reason: row.status_reason || undefined,
            compliance_tier: row.compliance_tier ?? undefined,
            is_paid: Boolean(row.is_paid),
            is_early_access: Boolean(row.is_early_access),
            mod_versions: row.mod_versions || undefined,
          };
        }
        React.startTransition(() => {
          setRelationDbMap(map);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [mod?.dbId, mod?.id, mod?.hash, mod?.requirements, mod?.twins, mod?.flavors, hydratedMeta?.hydratedByIdMap, vaultIndex, t]);

  const activeMods = activePlaySet?.mods || [];

  const equippedLookup = useMemo(() => {
    const exact = new Set<string>();
    const lowerRel = new Set<string>();
    const baseNames = new Set<string>();
    for (const rawEntry of activeMods) {
      if (!rawEntry || typeof rawEntry !== "string") continue;
      exact.add(rawEntry);
      const norm = rawEntry.replace(/\\/g, "/").toLowerCase();
      lowerRel.add(norm);
      const stripped = stripPriorityTierPrefix(rawEntry, activeGameSchema);
      if (stripped) {
        exact.add(stripped);
        lowerRel.add(stripped.replace(/\\/g, "/").toLowerCase());
      }
      const base = (rawEntry.split(/[\\/]/).pop() || rawEntry).toLowerCase();
      if (base) baseNames.add(base);
    }
    return { exact, lowerRel, baseNames };
  }, [activeMods, activeGameSchema]);

  const isModNameEquipped = React.useCallback(
    (name: any): boolean => {
      if (!name || typeof name !== "string") return false;
      if (/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(name)) return false;
      if (equippedLookup.exact.has(name)) return true;
      const norm = name.replace(/\\/g, "/").toLowerCase();
      if (equippedLookup.lowerRel.has(norm)) return true;
      const stripped = stripPriorityTierPrefix(name, activeGameSchema);
      if (
        stripped &&
        (equippedLookup.exact.has(stripped) ||
          equippedLookup.lowerRel.has(stripped.replace(/\\/g, "/").toLowerCase()))
      ) {
        return true;
      }
      const base = (name.split(/[\\/]/).pop() || name).toLowerCase();
      if (base && base.includes(".") && equippedLookup.baseNames.has(base)) {
        return true;
      }
      return false;
    },
    [equippedLookup, activeGameSchema]
  );

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
      !/^(package|script|collection|folder|local|unknown|mod)$/i.test(explicitCat)
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
    return explicitCat || "Package";
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
            setVisibleKidsLimit((prev) =>
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
                    : cat === "Package"
                      ? t("type_package", "Package")
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
            className="mt-1 px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[11px] font-bold text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center gap-2 transition-all cursor-pointer"
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
        if (byId) byId.forEach((pm) => matchedSet.add(pm));
      }
      if (rawHash) {
        const byHash = vaultIndex.physicalByHash.get(rawHash);
        if (byHash) byHash.forEach((pm) => matchedSet.add(pm));
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
  const isSingleItemStaged = (target: any) => {
    if (!target) return false;
    const targetId = String(target.id || target.dbId || "").toLowerCase();
    const targetHash = String(
      target.hash || target.mod_versions?.[0]?.dna_hash || ""
    ).toLowerCase();
    const targetName = String(target.name || target.displayName || "").toLowerCase();
    return stagingDraftItems.some((item: any) => {
      const itemId = String(item.id || item.dbId || item.mod_id || "").toLowerCase();
      const itemHash = String(item.hash || item.dna_hash || "").toLowerCase();
      const itemName = String(item.name || item.displayName || "").toLowerCase();
      return (
        (targetId && itemId === targetId) ||
        (targetHash && itemHash && itemHash === targetHash) ||
        (targetName && itemName === targetName)
      );
    });
  };

  const isModStaged = (() => {
    if (!mod) return false;
    const childList = Array.isArray(mod.flavors) ? mod.flavors : [];
    if (
      (mod.isParent || mod.isVirtual || mod.isCollection || childList.length > 1) &&
      childList.length > 0
    ) {
      return childList.every((c: any) => isSingleItemStaged(c));
    }
    return isSingleItemStaged(mod);
  })();

  const handleStageTargetToPc = async (target: any, currentlyStaged: boolean) => {
    const added = toggleModInStagingDraft(target);
    const latestItems = useModalStore.getState().stagingDraftItems || [];
    if (latestItems.length > 0) {
      const { mergedItems, addedCount } = await resolvePayloadDependencies(latestItems);
      setStagingDraftItems(
        mergedItems.map((item, idx) => ({ ...item, load_order_index: idx }))
      );
      if (added && addedCount > 0) {
        useStore
          .getState()
          .pushStatus(
            `${t("resolved", "Resolved")} ${addedCount} ${t(
              "status_deps_resolved_suffix",
              "child dependencies."
            )}`,
            "info"
          );
        return;
      }
    }
    useStore
      .getState()
      .pushStatus(
        currentlyStaged
          ? t("status_staging_item_removed", "Removed from Remote Staging Queue.")
          : t("status_staging_item_added", "Added to Remote Staging Queue.")
      );
  };

  if (!mod) return null;

  const hasExplicitStatus =
    mod.status &&
    mod.status.trim() !== "" &&
    mod.status.toLowerCase() !== "local folder" &&
    mod.status.toLowerCase() !== "local node";
  const statusType = hasExplicitStatus
    ? mod.status.toLowerCase()
    : !mod.dbId || mod.version?.toLowerCase() === "v.local"
      ? "local"
      : (mod.status || "").toLowerCase();

  const kids = mod.flavors || [];
  const isCollection = mod.isCollection;

  const localOverrides = JSON.parse(
    localStorage.getItem("sanctuary_local_overrides") || "{}"
  );
  const hasOverrides = !!localOverrides[mod.hash];

  const getVersions = (target: any) => {
    const v = target.compatible_versions;
    return typeof v === "string"
      ? v.split(",").map((s: string) => s.trim())
      : v || [];
  };

  let familyVersion = "Unknown";
  if (mod.isVirtual) {
    const highestPerFlavor = (mod.flavors || [])
      .map((f: any) => getHighestVersion(getVersions(f)))
      .filter(
        (v: string) =>
          v &&
          v !== "Unknown" &&
          v !== "ALL" &&
          v !== "ANY" &&
          v.toLowerCase() !== "global"
      );
    familyVersion =
      highestPerFlavor.length > 0
        ? getLowestVersion(highestPerFlavor)
        : getHighestVersion(getVersions(mod));
  } else {
    familyVersion = getHighestVersion(getVersions(mod));
  }

  const getBatchCasualties = (
    targetNames: string[],
    rootLabel?: string
  ): string[] => {
    if (!targetNames || targetNames.length === 0) return [];
    const extRegex = getExtensionRegex(activeGameSchema);
    const getBaseNoScript = (raw: string) =>
      String(raw || "")
        .split(/[\\/]/)
        .pop()
        ?.replace(extRegex, "")
        .toUpperCase()
        .replace(/_SCRIPT(S)?$/i, "") || "";
    const normLookup = (s: string) =>
      stripPriorityTierPrefix(String(s || ""), activeGameSchema)
        .replace(/\\/g, "/")
        .toLowerCase();

    // Build fast O(1) lookup structures over vaultIndex.physicalMods once per batch
    const byBaseNoScript = new Map<string, any[]>();
    const byNormRel = new Map<string, any>();
    const byNormBase = new Map<string, any>();
    const equippedWithReqs: any[] = [];

    for (const pm of vaultIndex.physicalMods) {
      if (!pm?.name) continue;
      const bns = getBaseNoScript(pm.name);
      if (bns) {
        let arr = byBaseNoScript.get(bns);
        if (!arr) {
          arr = [];
          byBaseNoScript.set(bns, arr);
        }
        arr.push(pm);
      }
      const nr = normLookup(pm.name);
      if (nr && !byNormRel.has(nr)) byNormRel.set(nr, pm);
      const nb = nr.split("/").pop() || "";
      if (nb && !byNormBase.has(nb)) byNormBase.set(nb, pm);

      if (isModNameEquipped(pm.name)) {
        const hasReqs =
          (Array.isArray(pm.requirements) && pm.requirements.length > 0) ||
          (Array.isArray(pm.requires) && pm.requires.length > 0) ||
          (Array.isArray(pm.twins) && pm.twins.length > 0);
        if (hasReqs) equippedWithReqs.push(pm);
      }
    }

    const resolveTargetMod = (tName: string): any => {
      const direct =
        vaultIndex.physicalByName.get(tName)?.[0] ||
        vaultIndex.physicalByName.get(tName.toLowerCase())?.[0];
      if (direct) return direct;
      const tNorm = normLookup(tName);
      const tBase = tNorm.split("/").pop() || tNorm;
      return (
        byNormRel.get(tNorm) ||
        byNormBase.get(tBase) ||
        (mod?.name === tName || normLookup(mod?.name || "") === tNorm ? mod : null)
      );
    };

    const initialTargets: any[] = [];
    const initialNameSet = new Set<string>(targetNames);
    for (const tn of targetNames) {
      const found = resolveTargetMod(tn);
      if (found) {
        if (found.isVirtual && Array.isArray(found.flavors) && found.flavors.length > 0) {
          for (const fl of found.flavors) {
            if (fl?.name) {
              initialTargets.push(fl);
              initialNameSet.add(fl.name);
            }
          }
        } else {
          initialTargets.push(found);
          if (found.name) initialNameSet.add(found.name);
        }
      }
    }
    if (initialTargets.length === 0) return [];

    const toDelete = new Set<string>();
    const deletedModMap = new Map<string, any>();
    const deletedUuids = new Set<string>();
    const deletedDbIds = new Set<string>();
    const deletedHashes = new Set<string>();
    const deletedDispUpperList: string[] = [];

    const registerDeletedMod = (mObj: any) => {
      if (!mObj?.name || toDelete.has(mObj.name)) return;
      toDelete.add(mObj.name);
      deletedModMap.set(mObj.name, mObj);
      collectAllCandidateUuids(mObj).forEach((u) => deletedUuids.add(u));
      if (mObj.dbId) deletedDbIds.add(String(mObj.dbId));
      if (mObj.hash) deletedHashes.add(String(mObj.hash).toLowerCase());
      const dispUpper = String(mObj.displayName || mObj.name || "").toUpperCase();
      if (dispUpper) {
        deletedDispUpperList.push(dispUpper);
        const spaced = dispUpper.replace(/_/g, " ");
        if (spaced !== dispUpper) deletedDispUpperList.push(spaced);
      }
    };

    const localSets = Array.isArray(storePlaySets) ? storePlaySets : [];

    for (const mItem of initialTargets) {
      if (!mItem?.name) continue;
      registerDeletedMod(mItem);

      const mItemBase = getBaseNoScript(mItem.name);
      if (mItemBase) {
        const sameBase = byBaseNoScript.get(mItemBase);
        if (sameBase) {
          for (const cand of sameBase) {
            if (cand?.name && cand.name !== mItem.name && isModNameEquipped(cand.name)) {
              registerDeletedMod(cand);
            }
          }
        }
      }

      // Only expand family/archetype siblings when checking a single item/module,
      // or if not already covered by the batch target list
      if (targetNames.length <= 4) {
        const familyAnchor = mItem.familyId || mItem.dbId;
        const isMaster = mItem.dbId && String(mItem.dbId) === String(familyAnchor);
        const isArchMember = localSets.some(
          (s: any) =>
            s?.archetypes?.core === mItem.hash ||
            s?.archetypes?.twins?.includes(mItem.hash)
        );
        if (
          mItem.isVirtual ||
          isMaster ||
          isArchMember ||
          mItem.relationshipType === "twin" ||
          mItem.relationshipType === "core" ||
          mItem.relationshipType === "beta"
        ) {
          const anchorUuid = extractCleanUuid(familyAnchor, mItem.dbId).toLowerCase();
          const famCands = anchorUuid ? vaultIndex.byUuid.get(anchorUuid) || [] : [];
          for (const fm of famCands) {
            if (fm?.name && !fm.isVirtual && isModNameEquipped(fm.name)) {
              registerDeletedMod(fm);
            }
          }
        }
      }
    }

    let keepChecking = true;
    while (keepChecking) {
      keepChecking = false;
      for (const m of equippedWithReqs) {
        if (!m?.name || toDelete.has(m.name)) continue;
        const allModReqs = [
          ...(Array.isArray(m.requirements) ? m.requirements : []),
          ...(Array.isArray(m.requires) ? m.requires : []),
          ...(Array.isArray(m.twins) ? m.twins : []),
        ];
        const isDependent = allModReqs.some((r: any) => {
          if (!r) return false;
          const rawReqId =
            typeof r === "string" ? r : r.id || r.dbId || r.hash || "";
          const cleanReqUuid = extractCleanUuid(rawReqId).toLowerCase();
          if (cleanReqUuid && deletedUuids.has(cleanReqUuid)) return true;
          if (rawReqId) {
            if (deletedDbIds.has(String(rawReqId))) return true;
            if (deletedHashes.has(String(rawReqId).toLowerCase())) return true;
          }
          const reqName =
            typeof r === "string"
              ? r.split("@").pop() || r
              : r.name || r.displayName || r.id || "";
          const isReqNumeric = !isNaN(Number(reqName));
          if (!isReqNumeric) {
            const reqBaseName = String(reqName)
              .split(/[\\/]/)
              .pop()
              ?.replace(extRegex, "")
              .toUpperCase()
              .replace(/_SCRIPT(S)?$/i, "");
            if (reqBaseName && reqBaseName.length > 2) {
              const reqSpaced = reqBaseName.replace(/_/g, " ");
              if (
                deletedDispUpperList.some(
                  (d) => d.includes(reqBaseName) || d.includes(reqSpaced)
                )
              ) {
                return true;
              }
            }
          }
          return false;
        });

        if (isDependent) {
          registerDeletedMod(m);
          keepChecking = true;
        }
      }
    }

    initialNameSet.forEach((n) => toDelete.delete(n));
    if (toDelete.size === 0) return [];

    const firstTarget = initialTargets[0];
    const cleanTarget =
      rootLabel ||
      (
        firstTarget?.displayName ||
        (firstTarget?.name || targetNames[0] || "").split(/[\\/]/).pop() ||
        ""
      )
        .replace(/_/g, " ")
        .replace(/\.[^/.]+$/, "");

    const cleanDeps = Array.from(toDelete).map((delName) => {
      const d =
        deletedModMap.get(delName) ||
        vaultIndex.physicalByName.get(delName)?.[0];
      if (!d)
        return (delName.split(/[\\/]/).pop() || delName)
          .replace(/_/g, " ")
          .replace(/\.[^/.]+$/, "");
      return (d.displayName || (d.name || "").split(/[\\/]/).pop() || "")
        .replace(/_/g, " ")
        .replace(/\.[^/.]+$/, "");
    });

    return [cleanTarget, ...Array.from(new Set(cleanDeps))];
  };

  const getCasualties = (targetName: string): string[] =>
    getBatchCasualties([targetName]);

  const evaluatePreEquipAlerts = (
    targetNames: string[],
    explicitItems: any[] = []
  ) => {
    const extRegex = getExtensionRegex(activeGameSchema);
    const resolvedTargets: any[] = [];
    const seenNames = new Set<string>();
    const targetNameSet = new Set<string>(targetNames);

    const addTargetObj = (obj: any) => {
      if (!obj) return;
      const key = String(obj.name || obj.hash || obj.dbId || "");
      if (key && seenNames.has(key)) return;
      if (key) seenNames.add(key);
      resolvedTargets.push(obj);
    };

    explicitItems.forEach(addTargetObj);
    const flavorByName = new Map<string, any>();
    if (Array.isArray(mod?.flavors)) {
      mod.flavors.forEach((f: any) => {
        if (f?.name) flavorByName.set(f.name, f);
      });
    }
    targetNames.forEach((n) => {
      const found =
        vaultIndex.physicalByName.get(n)?.[0] ||
        vaultIndex.physicalByName.get(n.toLowerCase())?.[0] ||
        flavorByName.get(n) ||
        (mod?.name === n ? mod : null);
      if (found) addTargetObj(found);
    });
    if (resolvedTargets.length === 0 && mod) {
      addTargetObj(mod);
    }

    // 1. Game Version Mismatch
    const versionCandidates: string[] = [];
    resolvedTargets.forEach((tm) => {
      const vList = getVersions(tm);
      const hv = getHighestVersion(vList);
      if (
        hv &&
        hv !== "Unknown" &&
        hv !== "ALL" &&
        hv !== "ANY" &&
        hv.toLowerCase() !== "global"
      ) {
        versionCandidates.push(hv);
      }
    });
    const effectiveTargetVer =
      versionCandidates.length > 0
        ? getLowestVersion(versionCandidates)
        : familyVersion;

    const isGameVersionMismatch = Boolean(
      selectedVersion &&
        effectiveTargetVer &&
        effectiveTargetVer !== "Unknown" &&
        effectiveTargetVer !== "ALL" &&
        effectiveTargetVer !== "ANY" &&
        effectiveTargetVer.toLowerCase() !== "global" &&
        !isVersionMatch([effectiveTargetVer], selectedVersion)
    );

    // 2. Missing DLC
    const rawDlcSet = new Set<string>();
    const collectDlc = (item: any) => {
      if (!item?.requiredDLC) return;
      parseStringArray(item.requiredDLC).forEach((d: string) => {
        const code = d.split(" ")[0].toUpperCase().trim();
        if (code && code !== "BASE") rawDlcSet.add(d.trim());
      });
    };
    collectDlc(mod);
    resolvedTargets.forEach(collectDlc);
    const missingPacks = Array.from(rawDlcSet).filter((p: string) => {
      const baseCode = p.split(" ")[0].toUpperCase().trim();
      return (
        !effectiveOwnedDLC.includes(baseCode) ||
        effectiveMaskedDLC.includes(baseCode)
      );
    });

    // 3. Missing Dependencies & Twins
    const missingDeps: any[] = [];
    const seenMissingKeys = new Set<string>();
    const selfUuids = new Set<string>();
    const selfBaseNames = new Set<string>();
    [mod, ...resolvedTargets, ...(mod?.flavors || [])].forEach((item) => {
      if (!item) return;
      collectAllCandidateUuids(item).forEach((u) => selfUuids.add(u));
      if (item.name) {
        selfBaseNames.add(
          String(item.name)
            .split(/[\\/]/)
            .pop()
            ?.replace(extRegex, "")
            .toLowerCase() || ""
        );
      }
    });

    groupedRelations.forEach((rel: any) => {
      if (rel && rel.isInstalled === false) {
        const key = String(rel.dbId || rel.hash || rel._groupedTitle || "").toLowerCase();
        if (key && !seenMissingKeys.has(key)) {
          seenMissingKeys.add(key);
          missingDeps.push(rel);
        }
      }
    });

    resolvedTargets.forEach((tm) => {
      const reqList = [
        ...(Array.isArray(tm?.requirements) ? tm.requirements : []),
        ...(Array.isArray(tm?.requires) ? tm.requires : []),
        ...(Array.isArray(tm?.twins) ? tm.twins : []),
      ];
      reqList.forEach((req: any) => {
        if (!req) return;
        const rawId =
          typeof req === "string" ? req : req.id || req.dbId || req.hash || "";
        const cleanId = extractCleanUuid(rawId).toLowerCase();
        const rawName =
          typeof req === "string"
            ? req.split("@").pop() || req
            : req.name || req.displayName || String(rawId);
        const baseName =
          String(rawName)
            .split(/[\\/]/)
            .pop()
            ?.replace(extRegex, "")
            .toLowerCase() || "";

        if (cleanId && selfUuids.has(cleanId)) return;
        if (baseName && selfBaseNames.has(baseName)) return;

        let installedMatch: any = null;
        if (cleanId) {
          installedMatch =
            vaultIndex.physicalByUuid.get(cleanId)?.[0] ||
            vaultIndex.virtualByUuid.get(cleanId) ||
            null;
        }
        if (!installedMatch && rawId) {
          installedMatch =
            vaultIndex.physicalByHash.get(String(rawId).toLowerCase())?.[0] ||
            null;
        }
        if (!installedMatch && baseName && isNaN(Number(baseName))) {
          const normTitle = normTitleForMatch(rawName);
          if (normTitle) {
            installedMatch = vaultIndex.physicalByNormTitle.get(normTitle)?.[0] || null;
          }
          if (!installedMatch) {
            installedMatch = vaultIndex.physicalMods.find((m: any) => {
              const mDisp = String(m.displayName || m.name || "").toLowerCase();
              return (
                mDisp.includes(baseName) ||
                mDisp.replace(/_/g, " ").includes(baseName.replace(/_/g, " "))
              );
            });
          }
        }
        if (!installedMatch) {
          const dedupKey = cleanId || baseName || String(rawId).toLowerCase();
          if (dedupKey && !seenMissingKeys.has(dedupKey)) {
            seenMissingKeys.add(dedupKey);
            missingDeps.push(
              typeof req === "object"
                ? req
                : { id: cleanId || rawId, name: cleanSearchName(rawName, activeGameSchema) }
            );
          }
        }
      });
    });

    // 4. Broken / Corrupted Status
    const getIsBrokenMod = (m: any) => {
      if (!m) return false;
      const st = String(m.status || "").toLowerCase();
      let broken = st === "broken" || st === "corrupted";
      if (
        broken &&
        st === "broken" &&
        m.compatible_versions &&
        m.compatible_versions.length > 0 &&
        selectedVersion
      ) {
        if (selectedVersion !== getHighestVersion(getVersions(m))) {
          broken = false;
        }
      }
      return broken;
    };
    const brokenMods = resolvedTargets.filter(getIsBrokenMod);
    if (brokenMods.length === 0 && getIsBrokenMod(mod) && !mod.isVirtual) {
      brokenMods.push(mod);
    }

    // 5. Flavor / Beta Swap Rivals & 6. Severity 4 / Severity 3 Collisions
    const flavorRivals: any[] = [];
    const fatalConflicts: any[] = [];
    const tier3Conflicts: any[] = [];
    const seenRivals = new Set<string>();
    const seenFatal = new Set<string>();
    const seenTier3 = new Set<string>();

    const equippedModObjects = vaultIndex.physicalMods.filter(
      (m: any) => m?.name && !targetNameSet.has(m.name) && isModNameEquipped(m.name)
    );
    const equippedRivalCandidates = equippedModObjects.filter(
      (eq: any) =>
        eq.flavorGroupId != null ||
        eq.communityGroupId != null ||
        eq.relationshipType === "beta"
    );
    const equippedWithConflicts = equippedModObjects.filter(
      (eq: any) => Array.isArray(eq.conflicts) && eq.conflicts.length > 0
    );
    const equippedByUuid = new Map<string, any>();
    const equippedByCleanName = new Map<string, any>();
    for (const eq of equippedModObjects) {
      collectAllCandidateUuids(eq).forEach((u) => {
        if (!equippedByUuid.has(u)) equippedByUuid.set(u, eq);
      });
      const eqBase =
        String(eq.name || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(extRegex, "")
          .toUpperCase()
          .replace(/_SCRIPT(S)?$/i, "") || "";
      if (eqBase && !equippedByCleanName.has(eqBase)) {
        equippedByCleanName.set(eqBase, eq);
      }
      const eqDisp = String(eq.displayName || "").toUpperCase();
      if (eqDisp && !equippedByCleanName.has(eqDisp)) {
        equippedByCleanName.set(eqDisp, eq);
      }
    }

    resolvedTargets.forEach((tm) => {
      if (!tm) return;
      if (anarchyRules?.highlander !== false) {
        if (mod?.isFlavorFolder && Array.isArray(mod.flavors)) {
          mod.flavors.forEach((fl: any) => {
            if (
              fl?.name &&
              fl.name !== tm.name &&
              !targetNameSet.has(fl.name) &&
              isModNameEquipped(fl.name) &&
              !seenRivals.has(fl.name)
            ) {
              seenRivals.add(fl.name);
              flavorRivals.push(fl);
            }
          });
        }

        if (
          tm.flavorGroupId != null ||
          tm.communityGroupId != null ||
          tm.relationshipType === "beta" ||
          equippedRivalCandidates.length > 0
        ) {
          equippedRivalCandidates.forEach((eq: any) => {
            if (eq.name === tm.name) return;
            const isFlavorRival =
              tm.flavorGroupId &&
              eq.flavorGroupId &&
              String(tm.flavorGroupId) === String(eq.flavorGroupId) &&
              tm.relationshipType !== "twin" &&
              eq.relationshipType !== "twin";
            const isCommunityRival =
              tm.communityGroupId &&
              eq.communityGroupId &&
              String(tm.communityGroupId) === String(eq.communityGroupId);
            const isBetaRival =
              ((tm.relationshipType === "beta" && eq.relationshipType !== "beta") ||
                (tm.relationshipType !== "beta" && eq.relationshipType === "beta")) &&
              (tm.familyId || tm.dbId) &&
              (String(eq.familyId) === String(tm.familyId || tm.dbId) ||
                String(eq.dbId) === String(tm.familyId || tm.dbId));

            if (
              (isFlavorRival || isCommunityRival || isBetaRival) &&
              !seenRivals.has(eq.name)
            ) {
              seenRivals.add(eq.name);
              flavorRivals.push(eq);
            }
          });
        }
      }

      const tmBase =
        String(tm.name || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(extRegex, "")
          .toUpperCase()
          .replace(/_SCRIPT(S)?$/i, "") || "";
      const tmDispUpper = String(tm.displayName || "").toUpperCase();
      const tmUuidSet = new Set(collectAllCandidateUuids(tm));

      const allTargetConflicts = [
        ...(Array.isArray(tm.conflicts) ? tm.conflicts : []),
        ...(Array.isArray(mod?.conflicts) ? mod.conflicts : []),
      ];

      allTargetConflicts.forEach((c: any) => {
        if (!c) return;
        const rank = Number(c.severity_rank || 4);
        const enemyId = c.enemy_id ? extractCleanUuid(c.enemy_id).toLowerCase() : "";
        const enemyClean = c.enemy_name
          ? String(c.enemy_name)
              .replace(/\.[^/.]+$/i, "")
              .toUpperCase()
              .replace(/_SCRIPT(S)?$/i, "")
          : "";

        const matchedEquipped =
          (enemyId ? equippedByUuid.get(enemyId) : null) ||
          (enemyClean ? equippedByCleanName.get(enemyClean) : null);

        if (matchedEquipped) {
          if (rank === 4 && anarchyRules?.intercept !== false) {
            if (!seenFatal.has(matchedEquipped.name)) {
              seenFatal.add(matchedEquipped.name);
              fatalConflicts.push(matchedEquipped);
            }
          } else if (rank === 3) {
            if (!seenTier3.has(matchedEquipped.name)) {
              seenTier3.add(matchedEquipped.name);
              tier3Conflicts.push(matchedEquipped);
            }
          }
        }
      });

      equippedWithConflicts.forEach((eq: any) => {
        eq.conflicts.forEach((c: any) => {
          if (!c) return;
          const rank = Number(c.severity_rank || 4);
          const enemyId = c.enemy_id ? extractCleanUuid(c.enemy_id).toLowerCase() : "";
          const enemyClean = c.enemy_name
            ? String(c.enemy_name)
                .replace(/\.[^/.]+$/i, "")
                .toUpperCase()
                .replace(/_SCRIPT(S)?$/i, "")
            : "";
          const isMatch =
            (enemyId && tmUuidSet.has(enemyId)) ||
            (enemyClean && (tmBase === enemyClean || tmDispUpper === enemyClean));
          if (isMatch) {
            if (rank === 4 && anarchyRules?.intercept !== false) {
              if (!seenFatal.has(eq.name)) {
                seenFatal.add(eq.name);
                fatalConflicts.push(eq);
              }
            } else if (rank === 3) {
              if (!seenTier3.has(eq.name)) {
                seenTier3.add(eq.name);
                tier3Conflicts.push(eq);
              }
            }
          }
        });
      });
    });

    const hasAnyAlert =
      isGameVersionMismatch ||
      missingPacks.length > 0 ||
      missingDeps.length > 0 ||
      brokenMods.length > 0 ||
      flavorRivals.length > 0 ||
      fatalConflicts.length > 0 ||
      tier3Conflicts.length > 0;

    return {
      hasAnyAlert,
      isGameVersionMismatch,
      requiredGameVersion: effectiveTargetVer,
      missingPacks,
      missingDeps,
      brokenMods,
      flavorRivals,
      fatalConflicts,
      tier3Conflicts,
    };
  };

  const allEquippableManifestNames = (() => {
    const set = new Set<string>();
    const addValidName = (n: any) => {
      if (
        n &&
        typeof n === "string" &&
        !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
      ) {
        set.add(n);
      }
    };

    if (groupedKids.length > 0) {
      groupedKids.forEach((kidGroup: any) => {
        if (kidGroup?.isInstalled === false) return;
        const gMods: any[] =
          Array.isArray(kidGroup?._groupedMods) &&
          kidGroup._groupedMods.length > 0
            ? kidGroup._groupedMods
            : [kidGroup];
        gMods.forEach((gm: any) => addValidName(gm?.name));
      });
    } else if (kids.length > 0) {
      kids.forEach((k: any) => addValidName(k?.name));
    } else if (!mod.isVirtual) {
      addValidName(mod.name);
    }

    return Array.from(set);
  })();

  const allEquipped =
    allEquippableManifestNames.length > 0 &&
    allEquippableManifestNames.every((n) => isModNameEquipped(n));

  const triggerYeetCascadeAlert = (
    casualties: string[],
    onConfirm: () => void
  ) => {
    setDossierAlertPending({
      mode: "yeet_cascade",
      casualties,
      onConfirm,
    });
  };

  const safeToggle = (targetName: string, forceMode?: "add" | "remove") => {
    if (!targetName) return;
    const isCurrentlyEquipped = isModNameEquipped(targetName);
    const shouldRemove =
      forceMode === "remove"
        ? true
        : forceMode === "add"
          ? false
          : isCurrentlyEquipped;
    const doToggle = () => {
      onToggleInActiveSet(targetName, false, shouldRemove, !shouldRemove);
      if (
        selectedKid &&
        selectedKid.name === targetName &&
        shouldRemove
      ) {
        setSelectedKid(null);
      }
    };

    if (shouldRemove) {
      const c = getCasualties(targetName);
      if (c.length > 0) {
        triggerYeetCascadeAlert(c, doToggle);
        return;
      }
    } else {
      const alerts = evaluatePreEquipAlerts([targetName]);
      if (alerts.hasAnyAlert) {
        setDossierAlertPending({
          mode: "pre_equip",
          targetLabel: formatDisplayName(targetName),
          ...alerts,
          onConfirm: doToggle,
        });
        return;
      }
    }
    doToggle();
  };

  const safeToggleGroup = (groupItem: any) => {
    const groupMods: any[] =
      Array.isArray(groupItem?._groupedMods) && groupItem._groupedMods.length > 0
        ? groupItem._groupedMods
        : Array.isArray(groupItem?.flavors) && groupItem.flavors.length > 0
          ? groupItem.flavors
          : [groupItem];
    const validNames = Array.from(
      new Set(
        groupMods
          .map((gm: any) => gm?.name)
          .filter(
            (n: any) =>
              n &&
              typeof n === "string" &&
              !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
          )
      )
    );
    if (validNames.length === 0) {
      if (groupItem?.name) safeToggle(groupItem.name);
      return;
    }

    const isGroupEquipped = validNames.some((n) => isModNameEquipped(n));
    const performGroupToggle = () => {
      if (isGroupEquipped) {
        const toRem = validNames.filter((n) => isModNameEquipped(n));
        if (toRem.length > 0) {
          onToggleInActiveSet(toRem, false, true, false);
        }
      } else {
        onToggleInActiveSet(validNames, false, false, true);
      }
    };

    const groupLabel =
      groupItem?._groupedTitle ||
      groupItem?.displayName ||
      formatDisplayName(validNames[0]);

    if (isGroupEquipped) {
      const c = getBatchCasualties(validNames, groupLabel);
      if (c.length > 0) {
        triggerYeetCascadeAlert(c, performGroupToggle);
        return;
      }
    } else {
      const alerts = evaluatePreEquipAlerts(validNames, [groupItem, ...groupMods]);
      if (alerts.hasAnyAlert) {
        setDossierAlertPending({
          mode: "pre_equip",
          targetLabel: groupLabel,
          ...alerts,
          onConfirm: performGroupToggle,
        });
        return;
      }
    }

    performGroupToggle();
  };

  const handleToggleAll = () => {
    if (allEquippableManifestNames.length === 0) {
      if (mod?.name) safeToggle(mod.name);
      return;
    }

    const rootLabel =
      mod.displayName ||
      (mod.name || "").replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "");

    if (allEquipped) {
      const equippedNames = allEquippableManifestNames.filter((n) =>
        isModNameEquipped(n)
      );
      const doRemoveAll = () => {
        if (equippedNames.length > 0) {
          onToggleInActiveSet(equippedNames, false, true, false);
        }
      };

      const c = getBatchCasualties(equippedNames, rootLabel);
      if (c.length > 0) {
        triggerYeetCascadeAlert(c, doRemoveAll);
        return;
      }
      doRemoveAll();
    } else {
      const unequippedNames = allEquippableManifestNames.filter(
        (n) => !isModNameEquipped(n)
      );
      const doEquipAll = () => {
        if (unequippedNames.length > 0) {
          onToggleInActiveSet(unequippedNames, false, false, true);
        }
      };
      const alerts = evaluatePreEquipAlerts(unequippedNames, [mod]);
      if (alerts.hasAnyAlert) {
        setDossierAlertPending({
          mode: "pre_equip",
          targetLabel: rootLabel,
          ...alerts,
          onConfirm: doEquipAll,
        });
        return;
      }
      doEquipAll();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const normStatus = String(metaInputs.status || "").toLowerCase().trim();
    await onSaveMetadata({
      created_at: localCreatedAt,
      updated_at: localUpdatedAt,
      category_override: localCategory,
      compatible_versions: localCompatibleVersions,
      manifest_url: metaInputs.manifest_url?.trim() || undefined,
      is_paid: metaInputs.is_paid || false,
      is_early_access: metaInputs.is_early_access || false,
      status_reason: metaInputs.statusMsg?.trim() || "",
      ...(normStatus === "corrupted" ||
      normStatus === "broken" ||
      normStatus === "unstable" ||
      normStatus === "stable"
        ? { status: normStatus === "broken" ? "corrupted" : normStatus }
        : {}),
    });
    setIsSaving(false);
    setEditMode(false);
    setIsCorrecting(false);
  };

  const handleExportLocalRelease = async () => {
    const vaultPath = useStore.getState().vaultPath;
    if (!vaultPath || !mod?.name) return;
    setIsSaving(true);
    try {
      const localOvr = JSON.parse(
        localStorage.getItem("sanctuary_local_overrides") || "{}"
      );
      const edgeLogic = JSON.parse(
        localStorage.getItem("sanctuary_edge_logic") || "{}"
      );
      const existingManifestUrl =
        metaInputs.manifest_url?.trim() ||
        mod.manifest_url ||
        (mod.hash && localOvr[mod.hash]?.manifest_url) ||
        (mod.hash && edgeLogic[mod.hash]?.manifest_url) ||
        "https://your-domain.com/.sanctuary.manifest.json";

      const cleanModName = (
        mod.displayName ||
        mod.name.split(/[\\/]/).pop() ||
        "local_mod"
      ).trim();
      const artifactId = cleanModName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");
      const previousHashes = Array.from(
        new Set(
          [
            ...(Array.isArray(mod.flavors)
              ? mod.flavors.map((f: any) => f.hash)
              : []),
            ...(Array.isArray(edgeLogic[mod.hash]?.previous_hashes)
              ? edgeLogic[mod.hash].previous_hashes
              : []),
          ].filter((h: any) => h && h !== mod.hash)
        )
      );

      const manifestPayload = {
        schema_version: "1.0",
        artifact: {
          id: artifactId,
          name: cleanModName,
          author: (metaInputs.author || mod.author || "Local Mason").trim(),
          version:
            (metaInputs.version || mod.version || "1.0.0")
              .replace(/^v\.?/i, "")
              .trim() || "1.0.0",
          game_version:
            (Array.isArray(localCompatibleVersions) &&
              localCompatibleVersions[0]) ||
            useStore.getState().selectedVersion ||
            "Any",
          release_date: new Date().toISOString(),
          game_id:
            useStore.getState().activeWorkspaceId ||
            useStore.getState().activeGameSchema?.id ||
            "universal",
        },
        payload: {
          download_url: (
            metaInputs.url ||
            mod.url ||
            existingManifestUrl
          ).trim(),
          sha256: mod.hash || "",
          archive_type: "zip",
        },
        atomic_logic: {
          required_dlc:
            Array.isArray(metaInputs.requiredDLC) &&
            metaInputs.requiredDLC.length > 0
              ? metaInputs.requiredDLC
              : Array.isArray(mod.requiredDLC)
                ? mod.requiredDLC
                : [],
          dependencies: Array.isArray(mod.requirements)
            ? mod.requirements.map((r: any) => ({
                hash: String(r.hash || r.id || r),
                min_version: r.min_version || null,
              }))
            : [],
          twins: Array.isArray(mod.twins)
            ? mod.twins.map((tw: any) => String(tw.hash || tw.id || tw))
            : [],
          addons: [],
          conflicts: Array.isArray(mod.conflicts)
            ? mod.conflicts.map((c: any) => ({
                hash: String(c.enemy_id || c.enemy_name || ""),
                severity: Number(c.severity_rank || 3),
                description: c.resolution_note || undefined,
              }))
            : [],
          flavors: Array.isArray(mod.flavors)
            ? mod.flavors.map((f: any) => f.hash).filter(Boolean)
            : [],
        },
        virtual_filesystem: {
          overrides: [],
          injected_folders: [],
        },
        changelog: metaInputs.desc
          ? [metaInputs.desc]
          : [t("label_initial_edge_release", "Static Edge Release")],
        previous_hashes: previousHashes,
      };

      const targetFolderOrFile = mod.physical_path || mod.name;
      await invoke("export_edge_release", {
        vaultPath,
        sandboxModName: targetFolderOrFile,
        manifest: manifestPayload,
        customUrl: existingManifestUrl,
      });

      useStore
        .getState()
        .pushStatus(
          t("msg_export_release_success", "Exported .sanctuary.manifest.json, .sanctuary.override.json, and release .zip to {mod} folder!")
        );
    } catch (err: any) {
      console.error("Failed to export edge release from Dossier:", err);
      useStore.getState().pushStatus(`Export failed: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const [flagComplianceTier, setFlagComplianceTier] = useState<number>(1);
  const [flagReasonNotes, setFlagReasonNotes] = useState<string>("");
  const [isSubmittingFlag, setIsSubmittingFlag] = useState<boolean>(false);

  const handleFlagMod = async (reason: string, customTier?: number) => {
    if (
      reason === "Outdated Information" ||
      reason === "Inaccurate Information"
    ) {
      setShowFlagModal(false);
      setIsCorrecting(true);
      setEditMode(true);
      return;
    }

    if (!targetDbId) {
      useStore.getState().pushStatus(t("auto_cannot_flag_local_32", "Cannot flag a local-only {mod}."));
      return;
    }

    if (!session) {
      useStore.getState().pushStatus(t("auto_guest_mode_active_45", "Authentication required."));
      return;
    }

    setIsSubmittingFlag(true);
    try {
      if (reason === "Suspected Malware") {
        const { error: reportError } = await submitThreatManifestToSpoke(
          {
            artifact_name: mod.name || t("unknown", "Unknown"),
            detected_hash: mod.hash || "unknown-hash",
            signature: flagReasonNotes.trim()
              ? `User Flagged: Suspected Malware — ${flagReasonNotes.trim()}`
              : "User Flagged: Suspected Malware",
            status: "pending",
            original_exists: true,
            original_shredded: false,
          },
          { isAuto: false, defaultSignature: "User Flagged: Suspected Malware" }
        );
        if (reportError) {
          useStore
            .getState()
            .pushStatus(`${t("err_flag_mod_failed", "Failed to flag {mod}:")} ${reportError.message}`);
          return;
        }
        useStore
          .getState()
          .pushStatus(
            t(
              "msg_malware_flag_routed",
              "Suspected malware signature routed to Oversight Malware Queue for verification."
            )
          );
        setShowFlagModal(false);
        setFlagReasonNotes("");
        return;
      }

      const resolvedTier = Math.min(
        4,
        Math.max(
          1,
          customTier ??
            (reason === "adult" ? 2 : reason === "NSFW" ? 1 : flagComplianceTier || 1)
        )
      );
      const cleanNotes =
        flagReasonNotes.trim() ||
        t("compliance_flag_default_reason", "Flagged for Oversight Compliance review (Tier {tier}).").replace(
          "{tier}",
          String(resolvedTier)
        );

      const { error } = await supabase.rpc("flag_mod_for_compliance", {
        p_mod_id: targetDbId,
        p_tier: resolvedTier,
        p_reason: cleanNotes,
      });

      if (!error) {
        useStore
          .getState()
          .pushStatus(
            t(
              "nexus_mod_flagged_compliance_toast",
              "{Mod} flagged for Oversight Compliance review (Pending)."
            )
          );
        setShowFlagModal(false);
        setFlagReasonNotes("");
        onClose();
      } else {
        useStore
          .getState()
          .pushStatus(`${t("err_flag_mod_failed", "Failed to flag {mod}:")} ${error.message}`);
      }
    } finally {
      setIsSubmittingFlag(false);
    }
  };

  const handleSubmitToVault = async () => {
    if (!session) {
      useStore.getState().pushStatus(t("auto_guest_mode_active_45", "Authentication required."));
      return;
    }

    if (requireScoutLabTest && mod?.hash) {
      const verRes = await checkDnaHashVerification(mod.hash);
      if (!verRes.verified) {
        useStore
          .getState()
          .pushStatus(
            t(
              "lab_gate_locked_scout_msg",
              "Submission Locked: This spoke requires a clean timed test before unlocking Scout Queue submissions."
            ),
            "error"
          );
        return;
      }
    }

    let bondedHash = metaInputs.lineage || null;
    if (bondedHash) {
      const parentMod = (modList || []).find(
        (m: any) =>
          (m.displayName || (m.name || "").split(/[\\/]/).pop() || m.name) ===
          bondedHash
      );
      if (parentMod && parentMod.hash) {
        bondedHash = parentMod.hash;
      }
    }

    setIsSaving(true);
    const { error } = await supabase.from("scout_suggestions").insert([
      {
        dna_hash: mod.hash,
        suggested_name: metaInputs.name,
        suggested_author: metaInputs.author,
        suggested_url: metaInputs.url,
        suggested_type: localCategory || mod.type || "FILE",
        suggested_bonded_to: bondedHash,
        suggested_version:
          metaInputs.version || deriveHumanReadableVersion(mod.name, mod.hash),
        suggested_sub_type:
          getFileLabel(mod.name || "", activeGameSchema) === "PACKAGE"
            ? "Package"
            : getFileLabel(mod.name || "", activeGameSchema) === "SCRIPT"
              ? "Script"
              : null,
        suggested_game_versions:
          localCompatibleVersions.length > 0 ? localCompatibleVersions : null,
        submitter_id: session.user.id,
        description: metaInputs.desc || null,
        image_url: metaInputs.image || null,
        compliance_tier: mod.compliance_tier || 0,
        is_paid: metaInputs.is_paid || false,
        is_early_access: metaInputs.is_early_access || false,
        status: "pending",
      },
    ]);

    if (error) {
      useStore
        .getState()
        .pushStatus(`Failed to submit to Vault: ${error.message}`);
    } else {
      const submitted = JSON.parse(
        localStorage.getItem("sanctuary_submitted_hashes") || "[]"
      );
      if (mod.hash && !submitted.includes(mod.hash)) {
        submitted.push(mod.hash);
        localStorage.setItem(
          "sanctuary_submitted_hashes",
          JSON.stringify(submitted)
        );
      }
      useStore
        .getState()
        .pushStatus(t("auto_successfully_submitted_to_45", "Successfully submitted to Scout Queue."));
      setEditMode(false);
    }
    setIsSaving(false);
  };

  const conflicts = mod.conflicts || [];

  const rawArtifactTitle = (
    (mod.displayName && !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(mod.displayName))
      ? mod.displayName
      : (mod.name || "").replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "").split(/[/\\]/).pop()) || ""
  )
    .replace(/_/g, " ")
    .replace(/\.[^/.]+$/, "");
  const cleanArtifactTitle = formatCleanModTitle(rawArtifactTitle) || rawArtifactTitle;

  const statusLabel = (() => {
    if (
      !hasExplicitStatus &&
      (!mod.dbId || mod.version?.toLowerCase() === "v.local")
    )
      return t("badge_local", "Unlinked");
    const raw = mod.status || "";
    const cleaned = raw.replace(/[\[\]]/g, "").toLowerCase();
    if (cleaned === "broken") return t("status_corrupted", "Broken");
    if (cleaned === "stable") return t("status_stable", "Stable");
    if (cleaned === "unverified") return t("unverified", "Unverified");
    if (cleaned === "local folder" || cleaned === "local node")
      return t("local_node", "Local Node");
    if (cleaned.includes("sandbox")) return t("filter_dev", "Sandbox");
    const translated = cleaned.includes("status_")
      ? t(cleaned, cleaned.replace(/_/g, " "))
      : cleaned.replace(/_/g, " ");
    return translated || t("badge_local", "Unlinked");
  })();

  const statusVariant: "accent" | "success" | "warning" | "danger" =
    statusType === "stable"
      ? "success"
      : statusType === "broken" || statusType === "corrupted"
        ? "danger"
        : statusType === "unstable" || statusType === "paid"
          ? "warning"
          : "accent";

  const statusIcon =
    statusType === "stable"
      ? t("icon_verified_user", "verified_user")
      : statusType === "unstable"
        ? t("icon_warning", "warning")
        : statusType === "broken" || statusType === "corrupted"
          ? t("icon_pest_control", "pest_control")
          : statusType === "under review"
            ? t("icon_science", "science")
            : statusType === "pending"
              ? t("icon_pending", "pending")
              : statusType === "early access"
                ? t("icon_experiment", "experiment")
                : statusType === "paid"
                  ? t("icon_monetization_on", "monetization_on")
                  : getModIcon(mod, activeGameSchema, t);

  const resolvedVersion = (() => {
    if (mod.isLocalOverride && mod.version && !isPlaceholderVersionStr(mod.version, t)) {
      return mod.version;
    }
    const candidates = [
      ...(Array.isArray(mod.mod_versions) ? mod.mod_versions.map((mv: any) => mv?.version_label) : []),
      mod.latest_version,
      mod.version,
      ...(Array.isArray(mod.flavors)
        ? mod.flavors.flatMap((f: any) => [
            f?.isLocalOverride ? f?.version : undefined,
            ...(Array.isArray(f?.mod_versions) ? f.mod_versions.map((mv: any) => mv?.version_label) : []),
            f?.latest_version,
            f?.version,
          ])
        : []),
    ];
    const valid = candidates.find((v) => !isPlaceholderVersionStr(v, t));
    return valid ? String(valid).trim() : t("unknown", "Unknown");
  })();

  const resolvedCreatedAt = (() => {
    let dt = mod.created_at || mod.mod_versions?.[0]?.created_at;
    if (!dt && mod.isVirtual && mod.flavors) {
      const dates = mod.flavors
        .map((f: any) => f.created_at || f.mod_versions?.[0]?.created_at)
        .filter(Boolean)
        .sort()
        .reverse();
      if (dates.length > 0) dt = dates[0];
    }
    return dt ? new Date(dt).toLocaleDateString() : t("source_local", "Local");
  })();

  const resolvedUpdatedAt = (() => {
    let dt = mod.updated_at || mod.mod_versions?.[0]?.created_at || mod.created_at;
    if (!dt && mod.isVirtual && mod.flavors) {
      const dates = mod.flavors
        .map((f: any) => f.updated_at || f.mod_versions?.[0]?.created_at || f.created_at)
        .filter(Boolean)
        .sort()
        .reverse();
      if (dates.length > 0) dt = dates[0];
    }
    return dt ? new Date(dt).toLocaleDateString() : t("source_local", "Local");
  })();

  const coverImageUrl =
    metaInputs.image || mod.image_url || mod.imageUrl || "";
  const hasValidCover =
    (showImages || editMode) &&
    coverImageUrl &&
    String(coverImageUrl) !== "null" &&
    String(coverImageUrl).trim() !== "";

  return (
    <>
      <SidePanel
        isOpen={isDossierOpen}
        onClose={handleClose}
        title={cleanArtifactTitle}
        subtitle={`${mod.author || t("unknown", "Unknown")} • ${statusLabel}`}
        icon={getModIcon(mod, activeGameSchema, t)}
        iconColorClass={
          statusVariant === "danger"
            ? "text-[var(--danger)]"
            : statusVariant === "warning"
              ? "text-[var(--warning)]"
              : statusVariant === "success"
                ? "text-[var(--success)]"
                : "text-[var(--accent)]"
        }
        widthClass="w-[820px] max-w-[100vw]"
        backdropZ="z-[120000]"
        panelZ="z-[120001]"
        headerActions={(() => {
          if (editMode) {
            return (
              <PanelHeaderGroup>
                {!isCorrecting && (
                  <>
                    <PanelHeaderButton
                      icon={t("hub_save", "save")}
                      tooltip={
                        isSaving
                          ? t("dossier_btn_saving", "Saving...")
                          : t("btn_save_local", "Save")
                      }
                      variant="success"
                      onClick={handleSave}
                      disabled={isSaving}
                    />
                    <PanelHeaderButton
                      icon={t("icon_refresh", "refresh")}
                      tooltip={t("btn_reset", "Reset")}
                      variant="danger"
                      onClick={() => {
                        if (onResetMetadata) onResetMetadata(mod.hash);
                        handleClose();
                      }}
                    />
                  </>
                )}
                {isCorrecting &&
                  session &&
                  !(Number(mod.compliance_tier || 0) >= 1 && Number(mod.compliance_tier || 0) <= 4) && (
                    <PanelHeaderButton
                      icon={
                        requireScoutLabTest && !isModLabVerified
                          ? t("icon_lock", "lock")
                          : t("icon_send", "send")
                      }
                      tooltip={
                        isSaving
                          ? t("btn_submitting", "Submitting...")
                          : t("btn_submit_corrections", "Submit")
                      }
                      variant="success"
                      onClick={handleSubmitToVault}
                      disabled={
                        isSaving || (requireScoutLabTest && !isModLabVerified)
                      }
                    />
                  )}
                <PanelHeaderButton
                  icon={t("icon_close", "close")}
                  tooltip={t("cancel", "Cancel")}
                  onClick={() => {
                    setEditMode(false);
                    setIsCorrecting(false);
                  }}
                />
              </PanelHeaderGroup>
            );
          }

          const resolvedMasonId = mod.mason_id || hydratedMeta?.mason_id;
          const canViewMasonProfile = Boolean(resolvedMasonId && onOpenMasonProfile);
          const canEquipMain = Boolean(
            !isNexusView && allEquippableManifestNames.length > 0
          );
          const canSyncSandbox = Boolean(mod.hash?.startsWith("dev_sandbox_") && isDesktop());
          const canExportRelease = Boolean(
            (mod.hash?.startsWith("dev_sandbox_") ||
              mod._isLocalSandbox ||
              mod.isSandbox ||
              String(mod.status || "").toLowerCase().includes("sandbox")) &&
              !mod.isVirtual &&
              !isNexusView &&
              !mod.name?.startsWith("LOCAL_SET_") &&
              isDesktop()
          );
          const canEditDesktop = Boolean(isDesktop());
          const canShredMalware = Boolean(
            userRole === "oversight" && mod.compliance_tier === 5
          );
          const canFlagMod = Boolean(
            !(Number(mod.compliance_tier || 0) >= 1 && Number(mod.compliance_tier || 0) <= 4) &&
              targetDbId &&
              session &&
              !isBanned
          );

          if (
            !canViewMasonProfile &&
            !canEquipMain &&
            !canSyncSandbox &&
            !canExportRelease &&
            !canEditDesktop &&
            !canShredMalware &&
            !canFlagMod
          ) {
            return undefined;
          }

          return (
            <PanelHeaderGroup>
              {canViewMasonProfile && (
                <PanelHeaderButton
                  icon={t("icon_person", "person")}
                  tooltip={t("btn_view_profile", "View Profile")}
                  onClick={() => {
                    onOpenMasonProfile?.(resolvedMasonId);
                  }}
                />
              )}
              {canEquipMain && (
                <PanelHeaderButton
                  icon={
                    allEquipped
                      ? t("icon_remove", "remove")
                      : t("icon_add", "add")
                  }
                  tooltip={
                    allEquipped
                      ? t("btn_unequip", "Unequip {Mod}")
                      : t("btn_equip", "Equip {Mod}")
                  }
                  variant={allEquipped ? "danger" : "success"}
                  onClick={handleToggleAll}
                />
              )}
              {canSyncSandbox && (
                <PanelHeaderButton
                  icon={t("icon_cloud_sync", "cloud_sync")}
                  tooltip={t("btn_sync_network", "Sync Network")}
                  variant="success"
                  onClick={() => {
                    if (onSyncToNetwork) onSyncToNetwork(mod);
                    else setEditMode(true);
                  }}
                />
              )}
              {canExportRelease && (
                <PanelHeaderButton
                  icon={t("icon_rocket_launch", "rocket_launch")}
                  tooltip={t("btn_export_release", "Export Release")}
                  onClick={handleExportLocalRelease}
                  disabled={isSaving}
                />
              )}
              {mod.name?.startsWith("LOCAL_SET_")
                ? canEditDesktop && (
                    <PanelHeaderButton
                      icon={t("icon_tune", "tune")}
                      tooltip={t("local_folders_edit", "Edit Folder")}
                      variant="warning"
                      onClick={() => {
                        handleClose();
                        window.dispatchEvent(
                          new CustomEvent("openLocalFolderEditor", {
                            detail: mod.dbId,
                          })
                        );
                      }}
                    />
                  )
                : canEditDesktop && (
                    <PanelHeaderButton
                      icon={t("icon_edit", "edit")}
                      tooltip={
                        isCorrecting
                          ? t("btn_submit_corrections", "Submit Corrections")
                          : t("btn_edit", "Edit")
                      }
                      variant="warning"
                      onClick={() => setEditMode(true)}
                    />
                  )}
              {canShredMalware && (
                <PanelHeaderButton
                  icon={t("icon_delete_forever", "delete_forever")}
                  tooltip={t("malware_alert_btn_shred", "Shred")}
                  variant="danger"
                  onClick={() => {
                    handleClose();
                    onSecureShred(mod.name);
                  }}
                />
              )}
              {canFlagMod && (
                <PanelHeaderButton
                  icon={t("icon_flag", "flag")}
                  tooltip={t("btn_flag", "Flag {Mod}")}
                  variant="warning"
                  onClick={() => setShowFlagModal(true)}
                />
              )}
            </PanelHeaderGroup>
          );
        })()}
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={statusIcon}
            overline={t("system_status", "System Status")}
            title={statusLabel}
            description={
              (mod.status_reason &&
              !/^\[ARCHITECT\b/i.test(String(mod.status_reason).trim())
                ? mod.status_reason
                : "") ||
              mod._alert_reason ||
              `${cleanArtifactTitle} • ${mod.author || t("unknown", "Unknown")}`
            }
            badge={
              mod.name?.includes(".")
                ? `.${(mod.name || "").split(".").pop()?.toUpperCase()}`
                : isCollection
                  ? t("collection", "Collection")
                  : mod.isFlavorFolder
                    ? t("exclusive", "Exclusive")
                    : mod.isParent
                      ? t("folder", "Folder")
                      : localCategory || t("label_artifact", "{Mod}")
            }
            badgeIcon={t("icon_inventory_2", "inventory_2")}
            badges={[
              ...((editMode ? metaInputs.is_early_access : mod.is_early_access)
                ? [
                    {
                      label: t("badge_early_access", "Early Access"),
                      icon: t("icon_science", "science"),
                    },
                  ]
                : []),
              ...((editMode ? metaInputs.is_paid : mod.is_paid)
                ? [
                    {
                      label: t("badge_paid", "Paid"),
                      icon: t("icon_monetization_on", "monetization_on"),
                      colorClass: "text-[var(--warning)]",
                    },
                  ]
                : []),
            ]}
            variant={statusVariant}
          >
            <div className="flex flex-col gap-3">
              {hasValidCover && (
                <div className="w-full h-40 rounded-xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_12%,transparent)] glass-surface relative">
                  <img
                    src={coverImageUrl}
                    className="w-full h-full object-cover opacity-80"
                    alt={t("cc_cover_url", "Cover")}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                {!mod.isVirtual && mod.hash && (
                  <div className="flex flex-wrap items-center gap-2">
                    <LabVerificationBadge
                      dnaHash={mod.hash}
                      required={requireScoutLabTest && isCorrecting}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  {!editMode && !isNexusView && allEquippableManifestNames.length > 0 && (
                    <ActionButton
                      variant={allEquipped ? "danger" : "success"}
                      icon={
                        allEquipped
                          ? t("icon_remove_circle_outline", "remove_circle_outline")
                          : t("icon_add_circle_outline", "add_circle_outline")
                      }
                      label={
                        allEquipped
                          ? groupedKids.length > 1
                            ? t("remove_all", "Remove All")
                            : t("btn_unequip", "Unequip {Mod}")
                          : groupedKids.length > 1
                            ? t("add_all", "Add All")
                            : t("btn_equip", "Equip {Mod}")
                      }
                      onClick={handleToggleAll}
                    />
                  )}
                  {!editMode && !isDesktop() && (
                    <ActionButton
                      variant={isModStaged ? "accent" : "glass"}
                      icon={
                        isModStaged
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_phonelink", "phonelink")
                      }
                      label={
                        isModStaged
                          ? t("staging_btn_staged", "Staged")
                          : t("staging_btn_stage_mod", "Stage to PC")
                      }
                      onClick={() => handleStageTargetToPc(mod, isModStaged)}
                    />
                  )}
                  {!editMode &&
                    mod.compliance_tier !== 1 &&
                    mod.compliance_tier !== 2 &&
                    isDesktop() && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_science", "science")}
                        label={t("btn_send_to_lab", "Send to Lab")}
                        onClick={() => {
                          handleClose();
                          onSendToLab();
                        }}
                      />
                    )}
                  {!editMode && !isNexusView && isDesktop() && versionPoolItems.length > 0 && (
                    <ActionButton
                      variant="glass"
                      icon={t("icon_history", "history")}
                      label={t("version_pool_btn_versions", "Versions")}
                      onClick={() => {
                        const mainVersionGroups = filterVersionGroupsForTarget(mod);
                        setActiveVersionModalGroups(mainVersionGroups);
                        setSelectedVersionGroupKeys(
                          mainVersionGroups.map((g) => g.key)
                        );
                      }}
                    />
                  )}
                  {!editMode && (
                    <ActionButton
                      variant="glass"
                      icon={
                        !isDesktop()
                          ? mod.url || hasOverrides
                            ? t("icon_open_in_new", "open_in_new")
                            : t("icon_search", "search")
                          : mod.url || hasOverrides
                            ? t("icon_download", "download")
                            : t("icon_search", "search")
                      }
                      label={
                        !isDesktop()
                          ? mod.url || hasOverrides
                            ? t("btn_view", "View")
                            : t("btn_search_web", "Search Web")
                          : mod.url || hasOverrides
                            ? t("btn_download", "Download")
                            : t("btn_search_web", "Search Web")
                      }
                      onClick={() => {
                        const url = getModFallbackUrl(
                          mod.displayName || mod.name || "",
                          mod.hash,
                          activeGameSchema,
                          { url: mod.url }
                        );
                        handleOpenUrl(url);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </SidePanelHeroCard>

          {editMode && (
            <SidePanelTitleInput
              value={metaInputs.name}
              onChange={setMetaInputs.name}
              placeholder={t("mod_name", "Artifact Name")}
              label={t("mod_name", "Artifact Name")}
              icon={t("icon_deployed_code", "deployed_code")}
            />
          )}

          {!mod.isVirtual &&
            !isNexusView &&
            mod.hash &&
            mod.compliance_tier !== 1 &&
            mod.compliance_tier !== 2 &&
            editMode &&
            isCorrecting && (
              <LabVerificationGate
                dnaHash={mod.hash}
                modName={mod.displayName || mod.name || "Artifact"}
                physicalPath={mod.physical_path || mod.name}
                roleContext="scout"
                isGateRequired={requireScoutLabTest}
                onStatusChange={(st) => setIsModLabVerified(st.verified)}
                onOpenInFullLab={
                  onSendToLab
                    ? () => {
                        handleClose();
                        onSendToLab();
                      }
                    : undefined
                }
              />
            )}

          <UniversalGroup
            title={t("tab_metadata", "Metadata & Telemetry")}
            icon={t("icon_analytics", "analytics")}
          >
            {!editMode ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatBox
                    label={t("mason", "{Mason}")}
                    value={mod.author || t("unknown", "Unknown")}
                    icon={t("icon_person", "person")}
                    iconColorClass="text-[var(--accent)]"
                    onClick={
                      (mod.mason_id || hydratedMeta?.mason_id) && onOpenMasonProfile
                        ? () => {
                            onOpenMasonProfile(mod.mason_id || hydratedMeta?.mason_id);
                          }
                        : undefined
                    }
                  />
                  <StatBox
                    label={t("revision", "Revision")}
                    value={resolvedVersion}
                    icon={t("icon_tag", "tag")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("label_game_version", "Game Version")}
                    value={
                      familyVersion === "Unknown" ||
                      familyVersion === "ALL" ||
                      familyVersion === ""
                        ? t("any", "Any")
                        : familyVersion
                    }
                    icon={t("icon_sports_esports", "sports_esports")}
                    iconColorClass="text-[var(--success)]"
                  />
                  <StatBox
                    label={t("label_mod_category", "{Mod} Category")}
                    value={
                      isCollection
                        ? t("collection", "Collection")
                        : mod.isFlavorFolder
                          ? t("exclusive", "Exclusive")
                          : mod.isParent
                            ? t("folder", "Folder")
                            : localCategory || t("uncategorized", "Uncategorized")
                    }
                    icon={t("icon_category", "category")}
                    iconColorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("tab_compliance", "Compliance")}
                    value={
                      mod.compliance_tier === 1
                        ? t("tier_nsfw", "NSFW")
                        : mod.compliance_tier === 2
                          ? t("tier_adult", "Adult")
                          : t("tier_clean", "Clean")
                    }
                    icon={t("icon_shield", "shield")}
                    iconColorClass={
                      mod.compliance_tier === 1 || mod.compliance_tier === 2
                        ? "text-[var(--warning)]"
                        : "text-[var(--success)]"
                    }
                  />
                  <StatBox
                    label={t("badge_early_access", "Access Tier")}
                    value={
                      mod.is_early_access
                        ? t("badge_early_access", "Early Access")
                        : mod.is_paid
                          ? t("badge_paid", "Paid")
                          : t("badge_free", "Free")
                    }
                    icon={
                      mod.is_early_access
                        ? t("icon_science", "science")
                        : mod.is_paid
                          ? t("icon_monetization_on", "monetization_on")
                          : t("icon_public", "public")
                    }
                    iconColorClass={
                      mod.is_paid
                        ? "text-[var(--warning)]"
                        : mod.is_early_access
                          ? "text-[var(--accent)]"
                          : "text-[var(--success)]"
                    }
                  />
                  <StatBox
                    label={t("label_uploaded", "Uploaded")}
                    value={resolvedCreatedAt}
                    icon={t("icon_calendar_today", "calendar_today")}
                  />
                  <StatBox
                    label={t("updated_date", "Updated")}
                    value={resolvedUpdatedAt}
                    icon={t("icon_update", "update")}
                  />
                </div>

                {(metaInputs.manifest_url || mod.manifest_url) && (
                  <div className="flex items-center justify-between gap-4 p-3.5 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_network_wifi", "network_wifi")}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">
                          {t(
                            "label_static_manifest_linked",
                            "Static Edge Manifest Linked"
                          )}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--subtext)] truncate">
                          {metaInputs.manifest_url || mod.manifest_url}
                        </span>
                      </div>
                    </div>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_sync", "sync")}
                      label={t("btn_poll_manifest", "Poll Manifest")}
                      onClick={() =>
                        onSaveMetadata({
                          manifest_url:
                            metaInputs.manifest_url || mod.manifest_url,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("mason", "{Mason}")}
                    </label>
                    <input
                      value={metaInputs.author}
                      onChange={(e) => setMetaInputs.author(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t("author_placeholder", "{Mason} Name...")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("revision", "Revision")}
                    </label>
                    <input
                      value={metaInputs.version || ""}
                      onChange={(e) => setMetaInputs.version(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-bold text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t("unknown", "1.0.0")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_mod_category", "{Mod} Category")}
                    </label>
                    <CustomClassificationDropdown
                      value={localCategory || "Script"}
                      onChange={(val: string) => setLocalCategory(val)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_game_version", "Game Version")}
                    </label>
                    <GameVersionMultiSelect
                      selectedVersions={localCompatibleVersions || []}
                      onChange={(v) => setLocalCompatibleVersions(v)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("label_uploaded", "Uploaded")}
                    </label>
                    <CustomDatePicker
                      value={localCreatedAt}
                      onChange={setLocalCreatedAt}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("updated_date", "Updated")}
                    </label>
                    <CustomDatePicker
                      value={localUpdatedAt}
                      onChange={setLocalUpdatedAt}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("registry_label_status", "Verification Status")}
                    </label>
                    <CustomDropdown
                      disableTint={true}
                      value={(() => {
                        const s = String(metaInputs.status || mod.status || "")
                          .toLowerCase()
                          .trim();
                        if (s === "corrupted" || s === "broken") return "corrupted";
                        if (s === "unstable") return "unstable";
                        return "stable";
                      })()}
                      onChange={(val: string) =>
                        setMetaInputs.status && setMetaInputs.status(val)
                      }
                      options={[
                        { id: "stable", label: t("status_stable", "Stable") },
                        { id: "unstable", label: t("label_unstable", "Unstable") },
                        { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label
                      className={`text-[10px] font-black uppercase tracking-wider px-1 flex items-center gap-1.5 ${
                        String(metaInputs.status || mod.status || "").toLowerCase() ===
                          "corrupted" ||
                        String(metaInputs.status || mod.status || "").toLowerCase() ===
                          "broken"
                          ? "text-[var(--danger)]"
                          : String(metaInputs.status || mod.status || "").toLowerCase() ===
                              "unstable"
                            ? "text-[var(--warning)]"
                            : "text-[var(--subtext)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_report_problem", "report_problem")}
                      </span>
                      {t(
                        "label_status_issue_details",
                        "Issue & Cause Details (Corrupted / Unstable)"
                      )}
                    </label>
                    <textarea
                      value={metaInputs.statusMsg || ""}
                      onChange={(e) =>
                        setMetaInputs.statusMsg &&
                        setMetaInputs.statusMsg(e.target.value)
                      }
                      placeholder={t(
                        "ph_status_issue_details",
                        "Explain what the issue is and what is causing it (shown on {Citizen} Alerts & {Mod} Dossier)..."
                      )}
                      className="w-full min-h-[72px] glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl p-3 text-xs font-semibold text-[var(--text)] resize-y focus:outline-none transition-all custom-scrollbar"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SidePanelPillToggle
                    checked={metaInputs.is_paid || false}
                    onChange={(val) => setMetaInputs.is_paid(val)}
                    icon={
                      metaInputs.is_paid
                        ? t("icon_monetization_on", "monetization_on")
                        : t("icon_money_off", "money_off")
                    }
                    label={`${t("label_is_paid", "Paid {Mod}")}: ${
                      metaInputs.is_paid
                        ? t("badge_paid", "Paid")
                        : t("badge_free", "Free")
                    }`}
                    activeColor="var(--warning)"
                  />
                  <SidePanelPillToggle
                    checked={metaInputs.is_early_access || false}
                    onChange={(val) => setMetaInputs.is_early_access(val)}
                    icon={
                      metaInputs.is_early_access
                        ? t("icon_science", "science")
                        : t("icon_public", "public")
                    }
                    label={`${t("badge_early_access", "Early Access")}: ${
                      metaInputs.is_early_access
                        ? t("badge_early_access", "Early Access")
                        : t("badge_standard", "Standard")
                    }`}
                    activeColor="var(--accent)"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("external_url_placeholder", "External URL")}
                    </label>
                    <input
                      value={metaInputs.url}
                      onChange={(e) => setMetaInputs.url(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-wider px-1">
                      {t("cc_cover_url", "Cover Image URL")}
                    </label>
                    <input
                      value={metaInputs.image}
                      onChange={(e) => setMetaInputs.image(e.target.value)}
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-[var(--accent)] uppercase tracking-wider px-1">
                      {t(
                        "edge_manifest_url_label",
                        "Static Edge Manifest URL (.sanctuary.manifest.json)"
                      )}
                    </label>
                    <input
                      value={metaInputs.manifest_url || ""}
                      onChange={(e) =>
                        setMetaInputs.manifest_url &&
                        setMetaInputs.manifest_url(e.target.value)
                      }
                      className="w-full h-11 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl px-4 text-xs font-mono text-[var(--text)] focus:outline-none transition-all"
                      placeholder={t(
                        "placeholder_static_manifest_url",
                        "https://your-domain.com/.sanctuary.manifest.json"
                      )}
                    />
                  </div>
                </div>
              </div>
            )}
          </UniversalGroup>

          <UniversalGroup
            title={t("log_manifest", "{Mod} Description")}
            icon={t("icon_description", "description")}
          >
            {editMode ? (
              <textarea
                value={metaInputs.desc}
                onChange={(e) => setMetaInputs.desc(e.target.value)}
                className="w-full h-36 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] rounded-xl p-3.5 text-xs font-medium text-[var(--text)] resize-none focus:outline-none transition-all custom-scrollbar"
                placeholder={t("local_desc_placeholder", "Enter description...")}
              />
            ) : (
              <div className="text-xs text-[var(--text)] opacity-90 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] whitespace-pre-wrap">
                {mod.description || t("no_desc_manifest", "No description provided for this {Mod}.")}
              </div>
            )}
          </UniversalGroup>

          {groupedKids.length > 0 && (
            <UniversalGroup
              title={`${t("manifest", "Manifest")} (${groupedKids.length})`}
              icon={t("icon_inventory_2", "inventory_2")}
              headerAction={
                !isNexusView && (
                  <button
                    type="button"
                    onClick={handleToggleAll}
                    className={`h-7 px-3 rounded-lg glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                      allEquipped
                        ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:border-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                        : "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_35%,transparent)] hover:border-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)]"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {allEquipped
                        ? t("icon_remove_circle_outline", "remove_circle_outline")
                        : t("icon_add_circle_outline", "add_circle_outline")}
                    </span>
                    <span>
                      {allEquipped
                        ? t("remove_all", "Remove All")
                        : t("add_all", "Add All")}
                    </span>
                  </button>
                )
              }
            >
              <div className="grid grid-cols-3 gap-2.5 mb-3">
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={t("icon_inventory_2", "inventory_2")}
                  label={t("filter_all", "All")}
                  number={groupedKids.length}
                  colorClass="text-[var(--accent)]"
                  isActive={collectionFilter === "all"}
                  onClick={() => setCollectionFilter("all")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={t("icon_check_circle", "check_circle")}
                  label={t("status_in_vault", "In {Vault}")}
                  number={inVaultKidsCount}
                  colorClass="text-[var(--success)]"
                  isActive={collectionFilter === "in_vault"}
                  onClick={() => setCollectionFilter("in_vault")}
                />
                <DashboardStatTile
                  variant="filter"
                  className="!w-full"
                  icon={t("icon_error", "error")}
                  label={t("status_missing", "Missing")}
                  number={missingKidsCount}
                  colorClass="text-[var(--danger)]"
                  isActive={collectionFilter === "missing"}
                  onClick={() => setCollectionFilter("missing")}
                />
              </div>

              <div className="mb-3">
                <ActionPill
                  searchQuery={collectionSearchQuery}
                  setSearchQuery={setCollectionSearchQuery}
                  searchPlaceholder={t("search_ph", "Search {mods}...")}
                  primaryPopover={{
                    icon: t("icon_tune", "tune"),
                    label: t("filters", "Filters"),
                    content: collectionFilterPopoverContent,
                  }}
                />
              </div>

              {filteredGroupedKids.length === 0 ? (
                <div className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-center">
                  {t("registry_no_mods", "No {Mods} Found")}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {visibleGroupedKids.map((kidGroup: any, kidIndex: number) => (
                    <DossierModuleCard
                      key={
                        kidGroup.hash ||
                        kidGroup.dbId ||
                        `${kidGroup._groupedTitle}_${kidIndex}`
                      }
                      item={kidGroup}
                      activeMods={activeMods}
                      isModNameEquipped={isModNameEquipped}
                      isNexusView={isNexusView}
                      activeGameSchema={activeGameSchema}
                      showImages={showImages}
                      t={t}
                      onInspect={handleInspectKid}
                      onToggleGroup={safeToggleGroup}
                      onToggleSingle={safeToggle}
                      isSingleItemStaged={isSingleItemStaged}
                      handleStageTargetToPc={handleStageTargetToPc}
                    />
                  ))}
                  {visibleKidsLimit < filteredGroupedKids.length && (
                    <div ref={kidsSentinelRef} className="col-span-full h-2" />
                  )}
                </div>
              )}
            </UniversalGroup>
          )}

          {(groupedRelations.length > 0 || conflicts.length > 0) && (
            <UniversalGroup
              title={t("network_protocols", "Required {Mods}")}
              icon={t("auto_extension", "extension")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupedRelations.map((relItem: any, i: number) => (
                  <DossierModuleCard
                    key={
                      relItem.dbId ||
                      relItem.hash ||
                      `${relItem._groupedTitle}_${i}`
                    }
                    item={relItem}
                    activeMods={activeMods}
                    isModNameEquipped={isModNameEquipped}
                    isNexusView={isNexusView}
                    activeGameSchema={activeGameSchema}
                    showImages={showImages}
                    t={t}
                    onInspect={handleInspectKid}
                    onToggleGroup={safeToggleGroup}
                    onToggleSingle={safeToggle}
                    isSingleItemStaged={isSingleItemStaged}
                    handleStageTargetToPc={handleStageTargetToPc}
                  />
                ))}
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      {kidToRender &&
        (() => {
          const rawKidTitle =
            kidToRender._groupedTitle ||
            (kidToRender.displayName &&
            !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(kidToRender.displayName))
              ? kidToRender.displayName
              : (kidToRender.name || "")
                  .replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "")
                  .split(/[/\\]/)
                  .pop() || "");
          const cleanKidTitle =
            formatCleanModTitle(
              String(rawKidTitle).replace(/_/g, " ").replace(/\.[^/.]+$/, "")
            ) || String(rawKidTitle);

          const kidAuthor =
            pickFirstValidAuthor(t, kidToRender, mod) ||
            t("unknown", "Unknown");

          const kidVerCandidates = [
            ...(Array.isArray(kidToRender.mod_versions)
              ? kidToRender.mod_versions.map((mv: any) => mv?.version_label)
              : []),
            kidToRender.latest_version,
            kidToRender.version,
            resolvedVersion,
          ];
          const kidResolvedVersion =
            kidVerCandidates.find((v) => !isPlaceholderVersionStr(v, t)) ||
            t("unknown", "Unknown");

          const kidCompat = getVersions(kidToRender);
          const kidHighestVer =
            kidCompat.length > 0 ? getHighestVersion(kidCompat) : familyVersion;
          const kidGameVersionLabel =
            kidHighestVer === "Unknown" ||
            kidHighestVer === "ALL" ||
            kidHighestVer === ""
              ? t("any", "Any")
              : kidHighestVer;

          const kidCreatedDt =
            kidToRender.created_at ||
            kidToRender.mod_versions?.[0]?.created_at ||
            kidToRender._groupedMods?.find((gm: any) => gm?.created_at)?.created_at ||
            kidToRender.flavors?.find((fl: any) => fl?.created_at)?.created_at ||
            mod.created_at ||
            mod.mod_versions?.[0]?.created_at;
          const kidResolvedCreatedAt = kidCreatedDt
            ? new Date(kidCreatedDt).toLocaleDateString()
            : t("source_local", "Local");

          const kidUpdatedDt =
            kidToRender.updated_at ||
            kidToRender.mod_versions?.[0]?.created_at ||
            kidToRender.created_at ||
            kidToRender._groupedMods?.find(
              (gm: any) => gm?.updated_at || gm?.created_at
            )?.updated_at ||
            kidToRender.flavors?.find(
              (fl: any) => fl?.updated_at || fl?.created_at
            )?.updated_at ||
            mod.updated_at ||
            mod.created_at;
          const kidResolvedUpdatedAt = kidUpdatedDt
            ? new Date(kidUpdatedDt).toLocaleDateString()
            : t("source_local", "Local");

          const kidModules: any[] =
            Array.isArray(kidToRender._groupedMods) &&
            kidToRender._groupedMods.length > 0
              ? kidToRender._groupedMods
              : Array.isArray(kidToRender.flavors) &&
                  kidToRender.flavors.length > 0
                ? kidToRender.flavors
                : [kidToRender];

          const groupedKidModules =
            kidModules.length > 1 ||
            kidToRender.isVirtual ||
            kidToRender.isParent ||
            kidToRender.isCollection ||
            (Array.isArray(kidToRender.hydratedCollectionChildren) &&
              kidToRender.hydratedCollectionChildren.length > 1)
              ? buildGroupedCollectionModules(
                  kidModules,
                  kidToRender.hydratedCollectionChildren || []
                )
              : [];

          const kidInVaultCount = groupedKidModules.filter(
            (k: any) => k.isInstalled !== false
          ).length;
          const kidMissingCount = groupedKidModules.filter(
            (k: any) => k.isInstalled === false
          ).length;

          const normKidSearch = deferredKidSearch
            .trim()
            .toLowerCase()
            .replace(/[_.\-/\\]+/g, " ")
            .replace(/\s+/g, " ");

          const filteredKidModules = groupedKidModules.filter((k: any) => {
            if (kidCollectionFilter === "in_vault" && k.isInstalled === false)
              return false;
            if (kidCollectionFilter === "missing" && k.isInstalled !== false)
              return false;
            if (kidEquipFilter === "EQUIPPED" && !isKidGroupEquipped(k))
              return false;
            if (kidEquipFilter === "UNEQUIPPED" && isKidGroupEquipped(k))
              return false;
            if (kidCategoryFilter !== "ALL") {
              const cat = resolveKidCategoryKey(k);
              if (cat.toLowerCase() !== kidCategoryFilter.toLowerCase())
                return false;
            }
            if (kidStatusFilter !== "ALL") {
              const rawStatus = String(k.status || "").toLowerCase();
              const isLocalOnly =
                !k.dbId ||
                rawStatus === "local" ||
                rawStatus === "unverified" ||
                String(k.version || "").toLowerCase() === "v.local";
              if (kidStatusFilter === "UNVERIFIED") {
                if (!isLocalOnly) return false;
              } else if (rawStatus !== kidStatusFilter.toLowerCase()) {
                return false;
              }
            }
            if (normKidSearch) {
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
              const matchesSub = gMods.some((gm: any) =>
                String(gm?.name || gm?.displayName || "")
                  .toLowerCase()
                  .replace(/[_.\-/\\]+/g, " ")
                  .includes(normKidSearch)
              );
              if (
                !titleStr.includes(normKidSearch) &&
                !authorStr.includes(normKidSearch) &&
                !matchesSub
              ) {
                return false;
              }
            }
            return true;
          });

          const kidEquippableNames = kidModules
            .map((km: any) => km?.name)
            .filter(
              (n: any) =>
                n &&
                typeof n === "string" &&
                !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
            );
          const isKidEquipped =
            kidEquippableNames.length > 0 &&
            kidEquippableNames.some((n: string) => isModNameEquipped(n));

          const rawKidName = String(kidToRender.name || "");

          const kidHeroDescription =
            kidToRender.status_reason || `${cleanKidTitle} • ${kidAuthor}`;

          const hasScriptKid = kidModules.some((km: any) =>
            isScriptExtension(
              String(km?.name || km?.file_extension || ""),
              activeGameSchema
            )
          );
          const kidCategoryLabel =
            kidToRender.category_override ||
            kidToRender.type ||
            (hasScriptKid
              ? t("type_script", "Script")
              : getFileLabel(rawKidName, activeGameSchema));

          const kidStatusRaw = String(kidToRender.status || "stable")
            .toLowerCase()
            .replace(/[\[\]]/g, "");
          const kidStatusLabel =
            kidStatusRaw === "broken" || kidStatusRaw === "corrupted"
              ? t("status_corrupted", "Broken")
              : kidStatusRaw === "unstable"
                ? t("label_unstable", "Unstable")
                : t("status_stable", "Stable");

          return (
            <SidePanel
              isOpen={!!selectedKid}
              onClose={() => setSelectedKid(null)}
              title={cleanKidTitle}
              subtitle={`${kidAuthor} • ${kidStatusLabel}`}
              icon={getModIcon(kidToRender, activeGameSchema, t)}
              iconColorClass="text-[var(--accent)]"
              widthClass="w-[660px] max-w-[100vw]"
              backdropZ="z-[120004]"
              panelZ="z-[120005]"
              headerActions={(() => {
                const hasKidEquip = !isNexusView && kidEquippableNames.length > 0;
                if (!hasKidEquip) return undefined;
                return (
                  <PanelHeaderGroup>
                    {hasKidEquip && (
                      <PanelHeaderButton
                        icon={
                          isKidEquipped
                            ? t("icon_remove", "remove")
                            : t("icon_add", "add")
                        }
                        tooltip={
                          isKidEquipped
                            ? t("btn_unequip", "Unequip {Mod}")
                            : t("btn_equip", "Equip {Mod}")
                        }
                        variant={isKidEquipped ? "danger" : "success"}
                        onClick={() => {
                          safeToggleGroup(kidToRender);
                          if (!isKidEquipped) setSelectedKid(null);
                        }}
                      />
                    )}
                  </PanelHeaderGroup>
                );
              })()}
            >
              <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                <SidePanelHeroCard
                  icon={getModIcon(kidToRender, activeGameSchema, t)}
                  overline={kidAuthor}
                  title={cleanKidTitle}
                  description={kidHeroDescription}
                  badge={kidResolvedVersion}
                  badgeIcon={t("icon_tag", "tag")}
                  variant="accent"
                >
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {!isNexusView && kidEquippableNames.length > 0 && (
                      <ActionButton
                        variant={isKidEquipped ? "danger" : "success"}
                        icon={
                          isKidEquipped
                            ? t("icon_remove_circle_outline", "remove_circle_outline")
                            : t("icon_add_circle_outline", "add_circle_outline")
                        }
                        label={
                          isKidEquipped
                            ? groupedKidModules.length > 1
                              ? t("remove_all", "Remove All")
                              : t("btn_unequip", "Unequip {Mod}")
                            : groupedKidModules.length > 1
                              ? t("add_all", "Add All")
                              : t("btn_equip", "Equip {Mod}")
                        }
                        onClick={() => safeToggleGroup(kidToRender)}
                      />
                    )}
                    {!isDesktop() && (
                      <ActionButton
                        variant={
                          isSingleItemStaged(kidToRender) ? "accent" : "glass"
                        }
                        icon={
                          isSingleItemStaged(kidToRender)
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_phonelink", "phonelink")
                        }
                        label={
                          isSingleItemStaged(kidToRender)
                            ? t("staging_btn_staged", "Staged")
                            : t("staging_btn_stage_mod", "Stage to PC")
                        }
                        onClick={() =>
                          handleStageTargetToPc(
                            { ...kidToRender, _stageSingle: true },
                            isSingleItemStaged(kidToRender)
                          )
                        }
                      />
                    )}
                    {!isNexusView && isDesktop() && versionPoolItems.length > 0 && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_history", "history")}
                        label={t("version_pool_btn_versions", "Versions")}
                        onClick={() => {
                          const kidVersionGroups = filterVersionGroupsForTarget(kidToRender);
                          setActiveVersionModalGroups(kidVersionGroups);
                          setSelectedVersionGroupKeys(
                            kidVersionGroups.map((g) => g.key)
                          );
                        }}
                      />
                    )}
                    <ActionButton
                      variant="glass"
                      icon={
                        !isDesktop()
                          ? kidToRender.url || mod.url
                            ? t("icon_open_in_new", "open_in_new")
                            : t("icon_search", "search")
                          : kidToRender.url || mod.url
                            ? t("icon_download", "download")
                            : t("icon_search", "search")
                      }
                      label={
                        !isDesktop()
                          ? kidToRender.url || mod.url
                            ? t("btn_view", "View")
                            : t("btn_search_web", "Search Web")
                          : kidToRender.url || mod.url
                            ? t("btn_download", "Download")
                            : t("btn_search_web", "Search Web")
                      }
                      onClick={() => {
                        const url = getModFallbackUrl(
                          cleanKidTitle || kidToRender.name || "",
                          kidToRender.hash,
                          activeGameSchema,
                          { url: kidToRender.url || mod.url }
                        );
                        handleOpenUrl(url);
                      }}
                    />
                  </div>
                </SidePanelHeroCard>

                <UniversalGroup
                  title={t("tab_metadata", "Metadata & Telemetry")}
                  icon={t("icon_analytics", "analytics")}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <StatBox
                      label={t("mason", "{Mason}")}
                      value={kidAuthor}
                      icon={t("icon_person", "person")}
                      iconColorClass="text-[var(--accent)]"
                      onClick={
                        kidToRender.mason_id && onOpenMasonProfile
                          ? () => {
                              onOpenMasonProfile(kidToRender.mason_id);
                            }
                          : undefined
                      }
                    />
                    <StatBox
                      label={t("revision", "Revision")}
                      value={kidResolvedVersion}
                      icon={t("icon_tag", "tag")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    <StatBox
                      label={t("label_game_version", "Game Version")}
                      value={kidGameVersionLabel}
                      icon={t("icon_sports_esports", "sports_esports")}
                      iconColorClass="text-[var(--success)]"
                    />
                    <StatBox
                      label={t("label_mod_category", "{Mod} Category")}
                      value={kidCategoryLabel}
                      icon={t("icon_category", "category")}
                      iconColorClass="text-[var(--accent)]"
                    />
                    <StatBox
                      label={t("tab_compliance", "Compliance")}
                      value={
                        kidToRender.compliance_tier === 1
                          ? t("tier_nsfw", "NSFW")
                          : kidToRender.compliance_tier === 2
                            ? t("tier_adult", "Adult")
                            : t("tier_clean", "Clean")
                      }
                      icon={t("icon_shield", "shield")}
                      iconColorClass={
                        kidToRender.compliance_tier === 1 ||
                        kidToRender.compliance_tier === 2
                          ? "text-[var(--warning)]"
                          : "text-[var(--success)]"
                      }
                    />
                    <StatBox
                      label={t("badge_early_access", "Access Tier")}
                      value={
                        kidToRender.is_early_access
                          ? t("badge_early_access", "Early Access")
                          : kidToRender.is_paid
                            ? t("badge_paid", "Paid")
                            : t("badge_free", "Free")
                      }
                      icon={
                        kidToRender.is_early_access
                          ? t("icon_science", "science")
                          : kidToRender.is_paid
                            ? t("icon_monetization_on", "monetization_on")
                            : t("icon_public", "public")
                      }
                      iconColorClass={
                        kidToRender.is_paid
                          ? "text-[var(--warning)]"
                          : kidToRender.is_early_access
                            ? "text-[var(--accent)]"
                            : "text-[var(--success)]"
                      }
                    />
                    <StatBox
                      label={t("label_uploaded", "Uploaded")}
                      value={kidResolvedCreatedAt}
                      icon={t("icon_calendar_today", "calendar_today")}
                    />
                    <StatBox
                      label={t("updated_date", "Updated")}
                      value={kidResolvedUpdatedAt}
                      icon={t("icon_update", "update")}
                    />
                  </div>
                </UniversalGroup>

                <UniversalGroup
                  title={t("log_manifest", "{Mod} Description")}
                  icon={t("icon_description", "description")}
                >
                  <div className="text-xs text-[var(--text)] opacity-90 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] whitespace-pre-wrap">
                    {kidToRender.description ||
                      mod.description ||
                      t(
                        "no_desc_sub",
                        "No specific local description provided for this sub-{mod}."
                      )}
                  </div>
                </UniversalGroup>

                {groupedKidModules.length > 1 && (
                  <UniversalGroup
                    title={`${t("manifest", "Manifest")} (${groupedKidModules.length})`}
                    icon={t("icon_inventory_2", "inventory_2")}
                    headerAction={
                      !isNexusView &&
                      kidEquippableNames.length > 0 && (
                        <button
                          type="button"
                          onClick={() => safeToggleGroup(kidToRender)}
                          className={`h-7 px-3 rounded-lg glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                            isKidEquipped
                              ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:border-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                              : "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_35%,transparent)] hover:border-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {isKidEquipped
                              ? t("icon_remove_circle_outline", "remove_circle_outline")
                              : t("icon_add_circle_outline", "add_circle_outline")}
                          </span>
                          <span>
                            {isKidEquipped
                              ? t("remove_all", "Remove All")
                              : t("add_all", "Add All")}
                          </span>
                        </button>
                      )
                    }
                  >
                    <div className="grid grid-cols-3 gap-2.5 mb-3">
                      <DashboardStatTile
                        variant="filter"
                        className="!w-full"
                        icon={t("icon_inventory_2", "inventory_2")}
                        label={t("filter_all", "All")}
                        number={groupedKidModules.length}
                        colorClass="text-[var(--accent)]"
                        isActive={kidCollectionFilter === "all"}
                        onClick={() => setKidCollectionFilter("all")}
                      />
                      <DashboardStatTile
                        variant="filter"
                        className="!w-full"
                        icon={t("icon_check_circle", "check_circle")}
                        label={t("status_in_vault", "In {Vault}")}
                        number={kidInVaultCount}
                        colorClass="text-[var(--success)]"
                        isActive={kidCollectionFilter === "in_vault"}
                        onClick={() => setKidCollectionFilter("in_vault")}
                      />
                      <DashboardStatTile
                        variant="filter"
                        className="!w-full"
                        icon={t("icon_error", "error")}
                        label={t("status_missing", "Missing")}
                        number={kidMissingCount}
                        colorClass="text-[var(--danger)]"
                        isActive={kidCollectionFilter === "missing"}
                        onClick={() => setKidCollectionFilter("missing")}
                      />
                    </div>

                    <div className="mb-3">
                      <ActionPill
                        searchQuery={kidSearchQuery}
                        setSearchQuery={setKidSearchQuery}
                        searchPlaceholder={t("search_ph", "Search {mods}...")}
                        primaryPopover={{
                          icon: t("icon_tune", "tune"),
                          label: t("filters", "Filters"),
                          content: (
                            <div className="flex flex-col w-[440px] p-4 max-w-[calc(100vw-40px)] text-left">
                              {!isNexusView && (
                                <DossierFilterSection
                                  t={t}
                                  title={t("blueprint", "{Blueprint}")}
                                  value={kidEquipFilter}
                                  onChange={(val: "ALL" | "EQUIPPED" | "UNEQUIPPED") =>
                                    setKidEquipFilter(val)
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
                              <DossierFilterSection
                                t={t}
                                title={t("filter_status", "Filter Status")}
                                value={kidStatusFilter}
                                onChange={(val: string) => setKidStatusFilter(val)}
                                options={[
                                  { id: "ALL", label: t("filter_all", "All") },
                                  { id: "stable", label: t("status_stable", "STABLE") },
                                  { id: "UNVERIFIED", label: t("unverified", "Unverified") },
                                  { id: "unstable", label: t("label_unstable", "Unstable") },
                                  { id: "corrupted", label: t("status_corrupted", "Corrupted") },
                                ]}
                              />
                            </div>
                          ),
                        }}
                      />
                    </div>

                    {filteredKidModules.length === 0 ? (
                      <div className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed font-medium glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-center">
                        {t("registry_no_mods", "No {Mods} Found")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredKidModules.map((kmGroup: any, kmIdx: number) => (
                          <DossierModuleCard
                            key={
                              kmGroup?.hash ||
                              kmGroup?.dbId ||
                              `${kmGroup?._groupedTitle}_${kmIdx}`
                            }
                            item={kmGroup}
                            activeMods={activeMods}
                            isModNameEquipped={isModNameEquipped}
                            isNexusView={isNexusView}
                            activeGameSchema={activeGameSchema}
                            showImages={showImages}
                            t={t}
                            onInspect={handleInspectKid}
                            onToggleGroup={safeToggleGroup}
                            onToggleSingle={safeToggle}
                            isSingleItemStaged={isSingleItemStaged}
                            handleStageTargetToPc={handleStageTargetToPc}
                          />
                        ))}
                      </div>
                    )}
                  </UniversalGroup>
                )}
              </div>
            </SidePanel>
          );
        })()}

      <ModVersionHistorySidePanel
        groups={selectedVersionGroups}
        isOpen={selectedVersionGroups.length > 0}
        onClose={() => {
          setSelectedVersionGroupKeys([]);
          setActiveVersionModalGroups([]);
        }}
        onActivateVersion={handleActivateDossierVersion}
        onDeleteVersion={handleDeleteDossierVersion}
        onRefresh={() => loadDossierVersionPool(true)}
        runRadarSweep={() => window.dispatchEvent(new CustomEvent("runRadarSweep"))}
        setStatus={(msg: string) => useStore.getState().pushStatus(msg)}
        parentTitle={cleanArtifactTitle}
      />

      {showFlagModal && (
        <SidePanel
          isOpen={showFlagModal}
          onClose={() => setShowFlagModal(false)}
          title={t("flag_title", "Flag {Mod}")}
          subtitle={t("flag_desc", "Route {Mod} compliance or metadata issues for review.")}
          icon={t("icon_flag", "flag")}
          iconColorClass="text-[var(--warning)]"
          widthClass="w-[520px] max-w-[100vw]"
          backdropZ="z-[120008]"
          panelZ="z-[120009]"
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_flag", "flag")}
              overline={t("flag_title", "Flag {Mod}")}
              title={cleanArtifactTitle}
              description={t(
                "nexus_compliance_flag_desc",
                "Tier 1–4 compliance flags route directly to Oversight Compliance as Pending until verified by Oversight or Wayfinder staff."
              )}
              variant="warning"
            />

            <UniversalGroup
              title={t("compliance_tier", "Compliance Tier (Tier 1–4)")}
              icon={t("icon_policy", "policy")}
            >
              <div className="space-y-3">
                <CustomComplianceDropdown
                  value={Math.min(4, Math.max(1, Number(flagComplianceTier || 1)))}
                  onChange={(val) => setFlagComplianceTier(val)}
                  minTier={1}
                  maxTier={4}
                />
                <UniversalTextArea
                  label={t("reason", "Reason")}
                  value={flagReasonNotes}
                  onChange={(val) => setFlagReasonNotes(val)}
                  placeholder={t(
                    "placeholder_provide_specific_details_or_context",
                    "Provide specific details or context..."
                  )}
                  rows={3}
                />
                <ActionButton
                  variant="warning"
                  icon={t("icon_policy", "policy")}
                  label={
                    isSubmittingFlag
                      ? t("submitting", "Submitting...")
                      : t("submit_compliance_flag_btn", "Submit to Oversight Compliance")
                  }
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("compliance", flagComplianceTier)}
                  className="!w-full !h-11 !justify-center"
                />
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("metadata_and_security", "Metadata & Security")}
              icon={t("icon_edit_note", "edit_note")}
            >
              <div className="flex flex-col gap-2.5">
                <ActionButton
                  variant="glass"
                  icon={t("icon_history", "history")}
                  label={t("dossier_flag_outdated", "Outdated Information")}
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("Outdated Information")}
                  className="!w-full !h-11 !justify-start !px-4"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_edit_note", "edit_note")}
                  label={t("flag_inaccurate", "Inaccurate Information")}
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("Inaccurate Information")}
                  className="!w-full !h-11 !justify-start !px-4"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_gpp_bad", "gpp_bad")}
                  label={t("flag_malware", "Suspected Malware")}
                  disabled={isSubmittingFlag}
                  onClick={() => handleFlagMod("Suspected Malware")}
                  className="!w-full !h-11 !justify-start !px-4 !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                />
              </div>
            </UniversalGroup>
          </div>
        </SidePanel>
      )}

      {dossierAlertPending &&
        (() => {
          const isCascade = dossierAlertPending.mode === "yeet_cascade";
          const handleConfirmDossierAlert = () => {
            const cb = dossierAlertPending.onConfirm;
            setDossierAlertPending(null);
            cb?.();
          };

          if (isCascade) {
            const casualties: string[] = Array.isArray(
              dossierAlertPending.casualties
            )
              ? dossierAlertPending.casualties
              : [];
            return (
              <SidePanel
                isOpen={true}
                onClose={() => setDossierAlertPending(null)}
                title={t("yeet_cascade_detected", "Cascade Removal Detected")}
                subtitle={t(
                  "yeet_removing_following",
                  "Removing the following dependent artifacts"
                )}
                icon={t("icon_warning_amber", "warning")}
                iconColorClass="text-[var(--danger)] animate-pulse"
                backdropZ="z-[125000]"
                panelZ="z-[125001]"
                widthClass="w-[90vw] md:w-[620px]"
                headerActions={
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={t("icon_delete", "delete")}
                      tooltip={t("yeet_btn_confirm", "Confirm Removal")}
                      variant="danger"
                      onClick={handleConfirmDossierAlert}
                    />
                  </PanelHeaderGroup>
                }
              >
                <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                  <SidePanelHeroCard
                    icon={t("icon_warning_amber", "warning")}
                    overline={t("protocol_override", "Protocol Override")}
                    title={t(
                      "yeet_cascade_detected",
                      "Cascade Removal Detected"
                    )}
                    description={t(
                      "yeet_removing_following",
                      "These dependent artifacts require the target module and will also be unequipped."
                    )}
                    badge={`${casualties.length} ${t("term_mods", "Items")}`}
                    badgeIcon={t("icon_delete", "delete")}
                    variant="danger"
                  >
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <ActionButton
                        variant="glass"
                        icon={t("icon_close", "close")}
                        label={t("cancel", "Cancel")}
                        onClick={() => setDossierAlertPending(null)}
                      />
                      <ActionButton
                        variant="danger"
                        icon={t("icon_delete", "delete")}
                        label={t("yeet_btn_confirm", "Confirm Removal")}
                        onClick={handleConfirmDossierAlert}
                      />
                    </div>
                  </SidePanelHeroCard>

                  <UniversalGroup
                    title={`${t("yeet_removing_following", "Affected Artifacts")} (${casualties.length})`}
                    icon={t("icon_delete", "delete")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {casualties.map((c: any, i: number) => (
                        <div
                          key={i}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_delete", "delete")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {String(c).replace(/_/g, " ")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                              {t("icon_link_off", "link_off")}
                            </span>
                            <span>{t("protocol_override", "Dependent")}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                </div>
              </SidePanel>
            );
          }

          const {
            targetLabel,
            isGameVersionMismatch,
            requiredGameVersion,
            missingPacks = [],
            missingDeps = [],
            brokenMods = [],
            flavorRivals = [],
            fatalConflicts = [],
            tier3Conflicts = [],
          } = dossierAlertPending;

          const primaryTitle = isGameVersionMismatch
            ? t("unsupported_version", "Unsupported Game Version")
            : missingDeps.length > 0
              ? t("missing_artifacts", "Missing {Mods}")
              : missingPacks.length > 0
                ? t("missing_dlc", "Missing DLC")
                : brokenMods.length > 0
                  ? t("broken_artifacts", "Corrupted {Mods}")
                  : fatalConflicts.length > 0
                    ? t("fatal_conflict", "Severity 4 Collision")
                    : flavorRivals.length > 0
                      ? t("flavor_swap", "Flavor Swap")
                      : t("tier3_conflict", "Severity 3 Collision");

          const primaryIcon = isGameVersionMismatch
            ? t("icon_sports_esports", "sports_esports")
            : missingDeps.length > 0
              ? t("icon_extension", "extension")
              : missingPacks.length > 0
                ? t("icon_currency_exchange", "currency_exchange")
                : brokenMods.length > 0
                  ? t("icon_broken_image", "broken_image")
                  : fatalConflicts.length > 0
                    ? t("icon_crisis_alert", "crisis_alert")
                    : flavorRivals.length > 0
                      ? t("icon_swap_horiz", "swap_horiz")
                      : t("icon_tune", "tune");

          const primaryVariant: "danger" | "warning" | "accent" =
            isGameVersionMismatch ||
            missingDeps.length > 0 ||
            missingPacks.length > 0 ||
            brokenMods.length > 0 ||
            fatalConflicts.length > 0
              ? "danger"
              : flavorRivals.length > 0
                ? "accent"
                : "warning";

          return (
            <SidePanel
              isOpen={true}
              onClose={() => setDossierAlertPending(null)}
              title={primaryTitle}
              subtitle={targetLabel || cleanArtifactTitle}
              icon={primaryIcon}
              iconColorClass={
                primaryVariant === "danger"
                  ? "text-[var(--danger)]"
                  : primaryVariant === "accent"
                    ? "text-[var(--accent)]"
                    : "text-[var(--warning)]"
              }
              backdropZ="z-[125000]"
              panelZ="z-[125001]"
              widthClass="w-[90vw] md:w-[620px]"
              headerActions={
                <PanelHeaderGroup>
                  <PanelHeaderButton
                    icon={t("icon_check", "check")}
                    tooltip={t("btn_equip", "Equip {Mod}")}
                    variant={primaryVariant === "danger" ? "danger" : "warning"}
                    onClick={handleConfirmDossierAlert}
                  />
                </PanelHeaderGroup>
              }
            >
              <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
                <SidePanelHeroCard
                  icon={primaryIcon}
                  overline={t("protocol_override", "Protocol Override")}
                  title={primaryTitle}
                  description={targetLabel || cleanArtifactTitle}
                  badge={
                    selectedVersion
                      ? `${t("label_game_version", "Game Version")}: ${selectedVersion}`
                      : undefined
                  }
                  badgeIcon={t("icon_sports_esports", "sports_esports")}
                  variant={primaryVariant}
                >
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_close", "close")}
                      label={t("cancel", "Cancel")}
                      onClick={() => setDossierAlertPending(null)}
                    />
                    <ActionButton
                      variant={primaryVariant === "danger" ? "danger" : "warning"}
                      icon={t("icon_add_circle_outline", "add_circle_outline")}
                      label={t("btn_equip", "Equip {Mod}")}
                      onClick={handleConfirmDossierAlert}
                    />
                  </div>
                </SidePanelHeroCard>

                {isGameVersionMismatch && (
                  <UniversalGroup
                    title={t("unsupported_version", "Unsupported Game Version")}
                    icon={t("icon_sports_esports", "sports_esports")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <StatBox
                        label={t("required_version", "Required Game Version")}
                        value={requiredGameVersion || familyVersion}
                        icon={t("icon_sports_esports", "sports_esports")}
                        iconColorClass="text-[var(--danger)]"
                      />
                      <StatBox
                        label={t("label_game_version", "Game Version")}
                        value={selectedVersion || t("unknown", "Unknown")}
                        icon={t("icon_verified", "verified")}
                        iconColorClass="text-[var(--accent)]"
                      />
                    </div>
                  </UniversalGroup>
                )}

                {missingPacks.length > 0 && (
                  <UniversalGroup
                    title={`${t("missing_dlc", "Missing DLC")} (${missingPacks.length})`}
                    icon={t("icon_currency_exchange", "currency_exchange")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {missingPacks.map((p: string) => (
                        <div
                          key={p}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_currency_exchange", "currency_exchange")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {mapDlcCode(p)}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {p.split(" ")[0].toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {missingDeps.length > 0 && (
                  <UniversalGroup
                    title={`${t("missing_artifacts", "Missing {Mods}")} (${missingDeps.length})`}
                    icon={t("icon_extension", "extension")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {missingDeps.map((dep: any, idx: number) => {
                        const depTitle =
                          dep?._groupedTitle ||
                          dep?.displayName ||
                          dep?.name ||
                          String(dep?.id || dep || "");
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setDossierAlertPending(null);
                              handleInspectKid(dep);
                            }}
                            className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)] flex items-center justify-between gap-3 cursor-pointer transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-[15px]">
                                  {t("icon_extension", "extension")}
                                </span>
                              </div>
                              <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                                {formatDisplayName(depTitle)}
                              </span>
                            </div>
                            <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                                {t("icon_error", "error")}
                              </span>
                              <span>{t("status_missing", "Missing")}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </UniversalGroup>
                )}

                {brokenMods.length > 0 && (
                  <UniversalGroup
                    title={`${t("broken_artifacts", "Corrupted {Mods}")} (${brokenMods.length})`}
                    icon={t("icon_broken_image", "broken_image")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {brokenMods.map((bm: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_broken_image", "broken_image")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(bm.displayName || bm.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("status_corrupted", "Corrupted")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {flavorRivals.length > 0 && (
                  <UniversalGroup
                    title={`${t("flavor_swap", "Flavor Swap")} (${flavorRivals.length})`}
                    icon={t("icon_swap_horiz", "swap_horiz")}
                    headerColorClass="text-[var(--accent)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {flavorRivals.map((rv: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_32%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_swap_horiz", "swap_horiz")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(rv.displayName || rv.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("flavor_replaced", "Will Replace")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {fatalConflicts.length > 0 && (
                  <UniversalGroup
                    title={`${t("fatal_conflict", "Severity 4 Collision")} (${fatalConflicts.length})`}
                    icon={t("icon_crisis_alert", "crisis_alert")}
                    headerColorClass="text-[var(--danger)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {fatalConflicts.map((fc: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_crisis_alert", "crisis_alert")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(fc.displayName || fc.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("artifact_removed", "Will {Remove}")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}

                {tier3Conflicts.length > 0 && (
                  <UniversalGroup
                    title={`${t("tier3_conflict", "Severity 3 Collision")} (${tier3Conflicts.length})`}
                    icon={t("icon_tune", "tune")}
                    headerColorClass="text-[var(--warning)]"
                  >
                    <div className="flex flex-col gap-2.5">
                      {tier3Conflicts.map((tc: any, idx: number) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--warning)_32%,transparent)] text-[var(--warning)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_tune", "tune")}
                              </span>
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">
                              {formatDisplayName(tc.displayName || tc.name || "")}
                            </span>
                          </div>
                          <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                            {t("tier3_conflict", "Severity 3 Collision")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </UniversalGroup>
                )}
              </div>
            </SidePanel>
          );
        })()}
    </>
  );
}
