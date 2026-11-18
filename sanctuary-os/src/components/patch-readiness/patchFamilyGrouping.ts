import { useStore } from "../../store";
import {
  cleanSearchName,
  formatDisplayName,
  stripPriorityTierPrefix,
  deduplicateBlueprintArtifacts,
} from "../../shared";
import {
  normalizeModGroupTitle,
  extractValidCreator,
  isKnownCreatorName,
  getCachedVaultGroupLookups,
  formatCleanModTitle,
  type MissingDepTarget,
  type StackedModIssue,
} from "../../side-panels/CommandIncompatiblePanel";
import { PatchEvaluatedMod, isWildcardVersion } from "./patchNavigationAndTypes";


export interface VaultFamilyParentMeta {
  key: string;
  title: string;
  author: string | null;
  url: string | null;
  isCollection: boolean;
}

export interface VaultFamilyLookup {
  parentByKey: Map<string, VaultFamilyParentMeta>;
  childNameToParentKey: Map<string, string>;
  childHashToParentKey: Map<string, string>;
}

export const vaultFamilyLookupCache = new WeakMap<readonly any[], VaultFamilyLookup>();

export function getVaultFamilyLookup(
  modList: readonly any[] | undefined | null,
  activeGameSchema: any
): VaultFamilyLookup {
  if (Array.isArray(modList)) {
    const cached = vaultFamilyLookupCache.get(modList);
    if (cached) return cached;
  }

  const parentByKey = new Map<string, VaultFamilyParentMeta>();
  const childNameToParentKey = new Map<string, string>();
  const childHashToParentKey = new Map<string, string>();

  const registerPath = (rawPath: any, parentKey: string) => {
    const str = String(rawPath || "").trim();
    if (!str) return;
    const norm = str.toLowerCase().replace(/\\/g, "/");
    if (!childNameToParentKey.has(norm)) {
      childNameToParentKey.set(norm, parentKey);
    }
    const stripped = stripPriorityTierPrefix(str, activeGameSchema)
      .toLowerCase()
      .replace(/\\/g, "/");
    if (stripped && !childNameToParentKey.has(stripped)) {
      childNameToParentKey.set(stripped, parentKey);
    }
  };

  if (Array.isArray(modList)) {
    for (let i = 0; i < modList.length; i++) {
      const vm = modList[i];
      if (!vm) continue;

      const rawId = String(vm.id || "").trim();
      const rawDb = String(vm.dbId || "").split("@")[0].trim();
      const rawTitle = formatDisplayName(
        vm.displayName || vm.meta_name || vm.name || ""
      );
      const title = formatCleanModTitle(rawTitle) || rawTitle;
      const author = extractValidCreator(vm);
      const url = vm.download_url || vm.url || null;
      const isCollection = Boolean(
        vm.isCollection || rawId.startsWith("set_")
      );

      let folderKey = "";
      if (rawId.startsWith("virtual_")) {
        folderKey = `fam:${rawId.replace(/^virtual_/, "").trim()}`;
      } else if (rawId.startsWith("set_")) {
        folderKey = `set:${rawId.replace(/^set_/, "").trim()}`;
      } else if (rawDb && rawDb !== "null" && rawDb !== "undefined") {
        folderKey = isCollection ? `set:${rawDb}` : `fam:${rawDb}`;
      } else if (Array.isArray(vm.flavors) && vm.flavors.length > 1 && vm.name) {
        folderKey = `folder:${String(vm.name).toLowerCase()}`;
      }

      if (folderKey && title) {
        const existing = parentByKey.get(folderKey);
        if (!existing || rawId.startsWith("virtual_") || rawId.startsWith("set_")) {
          parentByKey.set(folderKey, {
            key: folderKey,
            title,
            author: author || existing?.author || null,
            url: url || existing?.url || null,
            isCollection,
          });
        }
      }

      if (folderKey && Array.isArray(vm.flavors) && vm.flavors.length > 0) {
        for (let j = 0; j < vm.flavors.length; j++) {
          const fl = vm.flavors[j];
          if (!fl) continue;
          registerPath(fl.name, folderKey);
          registerPath(fl.physical_path, folderKey);
          if (fl.hash && !isWildcardVersion(fl.hash)) {
            const h = String(fl.hash).trim().toLowerCase();
            if (h && !childHashToParentKey.has(h)) {
              childHashToParentKey.set(h, folderKey);
            }
          }
        }
      }
    }
  }

  const built: VaultFamilyLookup = {
    parentByKey,
    childNameToParentKey,
    childHashToParentKey,
  };
  if (Array.isArray(modList)) {
    vaultFamilyLookupCache.set(modList, built);
  }
  return built;
}

export function groupPatchEvaluatedMods(
  items: PatchEvaluatedMod[],
  modList: any[],
  activeGameSchema: any,
  t: (key: string, fallback?: string) => string
): PatchEvaluatedMod[] {
  if (!Array.isArray(items) || items.length <= 1) return items || [];

  const lookup = getVaultFamilyLookup(modList, activeGameSchema);
  const {
    vaultByHash,
    vaultUpdateLookup,
    virtualByFamilyId,
    collectionBySetId,
    parentByDbId,
    vaultFamilyCounts,
    vaultSetCounts,
  } = getCachedVaultGroupLookups(modList || []);

  const listFamilyCounts = new Map<string, number>();
  const listSetCounts = new Map<string, number>();
  const twinCounts = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const raw = it.rawMod;
    const matchedVault =
      (raw?.hash
        ? vaultByHash.get(String(raw.hash).toLowerCase())
        : undefined) ||
      vaultUpdateLookup.get(String(raw?.name || "").toLowerCase()) ||
      vaultUpdateLookup.get(String(raw?.displayName || "").toLowerCase());

    const explicitFam = String(
      matchedVault?.baseFamilyId ||
        matchedVault?.familyId ||
        raw?.baseFamilyId ||
        raw?.familyId ||
        ""
    )
      .split("@")[0]
      .trim();
    const selfDb = String(matchedVault?.dbId || raw?.dbId || "")
      .split("@")[0]
      .trim();

    if (
      explicitFam &&
      explicitFam !== "null" &&
      explicitFam !== "undefined" &&
      !explicitFam.startsWith("local_")
    ) {
      listFamilyCounts.set(
        explicitFam,
        (listFamilyCounts.get(explicitFam) || 0) + 1
      );
    }
    if (
      selfDb &&
      selfDb !== "null" &&
      selfDb !== "undefined" &&
      !selfDb.startsWith("local_") &&
      selfDb !== explicitFam
    ) {
      listFamilyCounts.set(selfDb, (listFamilyCounts.get(selfDb) || 0) + 1);
    }

    const setRaw = String(raw?.setId || matchedVault?.setId || "")
      .split("@")[0]
      .trim();
    if (setRaw && setRaw !== "null" && setRaw !== "undefined") {
      listSetCounts.set(setRaw, (listSetCounts.get(setRaw) || 0) + 1);
    }

    const twinNorm = normalizeModGroupTitle(it.title).toLowerCase().trim();
    if (twinNorm.length >= 3) {
      const cr = (it.author || "").toLowerCase().trim();
      const tKey = cr ? `${cr}::${twinNorm}` : twinNorm;
      twinCounts.set(tKey, (twinCounts.get(tKey) || 0) + 1);
      twinCounts.set(twinNorm, (twinCounts.get(twinNorm) || 0) + 1);
    }
  }

  const resolveGroupKey = (item: PatchEvaluatedMod): string => {
    const raw = item.rawMod;
    if (raw) {
      const matchedVault =
        (raw.hash
          ? vaultByHash.get(String(raw.hash).toLowerCase())
          : undefined) ||
        vaultUpdateLookup.get(String(raw.name || "").toLowerCase()) ||
        vaultUpdateLookup.get(String(raw.displayName || "").toLowerCase());

      const origNorm = stripPriorityTierPrefix(
        String(raw._originalSetName || raw.name || ""),
        activeGameSchema
      )
        .toLowerCase()
        .replace(/\\/g, "/");
      const nameNorm = String(raw.name || "")
        .toLowerCase()
        .replace(/\\/g, "/");
      const hashNorm =
        raw.hash && !isWildcardVersion(raw.hash)
          ? String(raw.hash).trim().toLowerCase()
          : "";

      const mappedFolder =
        (origNorm && lookup.childNameToParentKey.get(origNorm)) ||
        (nameNorm && lookup.childNameToParentKey.get(nameNorm)) ||
        (hashNorm && lookup.childHashToParentKey.get(hashNorm));
      if (mappedFolder) return mappedFolder;

      const explicitFam = String(
        matchedVault?.baseFamilyId ||
          matchedVault?.familyId ||
          raw.baseFamilyId ||
          raw.familyId ||
          ""
      )
        .split("@")[0]
        .trim();
      const selfDb = String(matchedVault?.dbId || raw.dbId || "")
        .split("@")[0]
        .trim();

      const famRaw =
        explicitFam &&
        explicitFam !== "null" &&
        explicitFam !== "undefined" &&
        !explicitFam.startsWith("local_")
          ? explicitFam
          : selfDb &&
              selfDb !== "null" &&
              selfDb !== "undefined" &&
              !selfDb.startsWith("local_") &&
              !raw.isCollection &&
              !matchedVault?.isCollection &&
              (virtualByFamilyId.has(selfDb) ||
                (vaultFamilyCounts.get(selfDb) || 0) > 1 ||
                (listFamilyCounts.get(selfDb) || 0) > 1)
            ? selfDb
            : "";

      if (famRaw) {
        if (lookup.parentByKey.has(`set:${famRaw}`) || collectionBySetId.has(famRaw)) {
          return `set:${famRaw}`;
        }
        return `fam:${famRaw}`;
      }

      const setRaw = String(raw.setId || matchedVault?.setId || "")
        .split("@")[0]
        .trim();
      if (
        setRaw &&
        setRaw !== "null" &&
        setRaw !== "undefined" &&
        (collectionBySetId.has(setRaw) ||
          (vaultSetCounts.get(setRaw) || 0) > 1 ||
          (listSetCounts.get(setRaw) || 0) > 1 ||
          lookup.parentByKey.has(`set:${setRaw}`))
      ) {
        return `set:${setRaw}`;
      }

      const cgRaw = String(
        raw.communityGroupId || matchedVault?.communityGroupId || ""
      ).trim();
      if (cgRaw && cgRaw !== "null" && cgRaw !== "undefined") {
        return `comm:${cgRaw}`;
      }
    }

    if (item.suiteKey && !item.suiteKey.startsWith("art:")) {
      return item.suiteKey;
    }

    const twinNorm = normalizeModGroupTitle(item.title).toLowerCase().trim();
    if (twinNorm.length >= 3) {
      const cr = (item.author || "").toLowerCase().trim();
      const tKey = cr ? `${cr}::${twinNorm}` : twinNorm;
      if ((twinCounts.get(tKey) || 0) > 1) {
        return `twin:${tKey}`;
      }
      if ((twinCounts.get(twinNorm) || 0) > 1) {
        return `twin:${twinNorm}`;
      }
    }

    return item.key;
  };

  const buckets = new Map<string, PatchEvaluatedMod[]>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const gKey = resolveGroupKey(it);
    const arr = buckets.get(gKey);
    if (arr) arr.push(it);
    else buckets.set(gKey, [it]);
  }

  const mergeEvaluatedGroup = (
    members: PatchEvaluatedMod[],
    gKey: string
  ): PatchEvaluatedMod => {
    if (members.length === 1) return members[0];

    const famSuffix = gKey.startsWith("fam:") ? gKey.slice(4) : "";
    const setSuffix = gKey.startsWith("set:") ? gKey.slice(4) : "";
    const parentMeta = lookup.parentByKey.get(gKey);
    const vaultFamilyParent = famSuffix
      ? virtualByFamilyId.get(famSuffix) || parentByDbId.get(famSuffix)
      : null;
    const vaultCollectionFolder = setSuffix
      ? collectionBySetId.get(setSuffix)
      : null;

    const coreMember =
      members.find((m) => {
        const selfDb = String(m.rawMod?.dbId || "").split("@")[0].trim();
        if (famSuffix && selfDb === famSuffix) return true;
        const rt = String(m.rawMod?.relationshipType || "").toLowerCase();
        return rt === "core" || rt === "parent" || Boolean(m.rawMod?.isParent);
      }) ||
      members.find((m) => m.downloadUrl || m.targetModVersion) ||
      members[0];

    const rawParentTitle = vaultFamilyParent
      ? formatCleanModTitle(
          formatDisplayName(
            vaultFamilyParent.displayName || vaultFamilyParent.name || ""
          )
        )
      : vaultCollectionFolder
        ? formatCleanModTitle(
            formatDisplayName(
              vaultCollectionFolder.displayName ||
                vaultCollectionFolder.name ||
                ""
            )
          )
        : "";
    const normalizedBaseTitle =
      formatCleanModTitle(normalizeModGroupTitle(coreMember.title)) ||
      coreMember.title;

    let folderTitle =
      parentMeta?.title ||
      (rawParentTitle
        ? formatCleanModTitle(normalizeModGroupTitle(rawParentTitle)) ||
          rawParentTitle
        : "") ||
      normalizedBaseTitle ||
      coreMember.title;

    const isCollectionFolder = Boolean(
      parentMeta?.isCollection ||
        vaultCollectionFolder ||
        gKey.startsWith("set:")
    );

    const combinedRawMods: any[] = [];
    const seenRawSet = new Set<any>();
    const compatSet = new Set<string>();
    const combinedIssues: StackedModIssue[] = [];
    const seenIssueKeys = new Set<string>();
    const combinedDepTargets: MissingDepTarget[] = [];
    const seenDepTargetKeys = new Set<string>();
    const flatMembers: PatchEvaluatedMod[] = [];
    let hasAnyScript = false;

    for (let i = 0; i < members.length; i++) {
      const mem = members[i];
      if (mem.isScript) hasAnyScript = true;
      if (Array.isArray(mem.memberEvaluations) && mem.memberEvaluations.length > 0) {
        for (let k = 0; k < mem.memberEvaluations.length; k++) {
          flatMembers.push(mem.memberEvaluations[k]);
        }
      } else {
        flatMembers.push(mem);
      }
      for (let j = 0; j < mem.compatibleVersions.length; j++) {
        compatSet.add(mem.compatibleVersions[j]);
      }
      for (let j = 0; j < mem.groupedMods.length; j++) {
        const gm = mem.groupedMods[j];
        if (gm && !seenRawSet.has(gm)) {
          seenRawSet.add(gm);
          combinedRawMods.push(gm);
        }
      }
      if (Array.isArray(mem.issues)) {
        for (let j = 0; j < mem.issues.length; j++) {
          const iss = mem.issues[j];
          const ik = `${iss.category}::${iss.title}::${iss.detail || ""}`;
          if (!seenIssueKeys.has(ik)) {
            seenIssueKeys.add(ik);
            combinedIssues.push(iss);
          }
        }
      }
      if (Array.isArray(mem.missingDepTargets)) {
        for (let j = 0; j < mem.missingDepTargets.length; j++) {
          const dt = mem.missingDepTargets[j];
          const dk = dt.name.toLowerCase();
          if (!seenDepTargetKeys.has(dk)) {
            seenDepTargetKeys.add(dk);
            combinedDepTargets.push(dt);
          }
        }
      }
    }

    const hasRootParentInMembers = famSuffix
      ? flatMembers.some(
          (m) => String(m.rawMod?.dbId || "").split("@")[0].trim() === famSuffix
        )
      : true;
    if (
      coreMember.issueKind === "dependency" &&
      !hasRootParentInMembers &&
      combinedDepTargets.some(
        (dt) => dt.name.toLowerCase() === folderTitle.toLowerCase()
      )
    ) {
      const modulesWord = t("badge_modules_count", "Modules");
      if (!folderTitle.toLowerCase().includes(modulesWord.toLowerCase())) {
        folderTitle = `${folderTitle} (${modulesWord})`;
      }
    }

    const bestAuthor =
      (parentMeta?.author && isKnownCreatorName(parentMeta.author)
        ? parentMeta.author
        : null) ||
      extractValidCreator(vaultFamilyParent, vaultCollectionFolder) ||
      members.find((m) => isKnownCreatorName(m.author))?.author ||
      parentMeta?.author ||
      members.find((m) => m.author)?.author ||
      null;
    const bestDownloadUrl =
      members.find((m) => m.downloadUrl)?.downloadUrl ||
      parentMeta?.url ||
      vaultFamilyParent?.download_url ||
      vaultFamilyParent?.url ||
      vaultCollectionFolder?.url ||
      null;
    const bestTargetVer =
      members.find((m) => m.targetModVersion)?.targetModVersion || null;
    const bestInstVer =
      members.find((m) => m.installedVersion)?.installedVersion || null;

    return {
      ...coreMember,
      key: `group:${gKey}:${coreMember.bucket}:${coreMember.source}`,
      suiteKey: gKey,
      title: folderTitle,
      author: bestAuthor,
      icon: isCollectionFolder
        ? t("icon_inventory_2", "inventory_2")
        : t("icon_folder_special", "folder_special"),
      isScript: hasAnyScript,
      isCollectionFolder,
      moduleCount: Math.max(flatMembers.length, combinedRawMods.length),
      installedVersion: bestInstVer,
      targetModVersion: bestTargetVer,
      compatibleVersions: Array.from(compatSet),
      downloadUrl: bestDownloadUrl,
      groupedMods: combinedRawMods,
      memberEvaluations: flatMembers,
      issues: combinedIssues.length > 0 ? combinedIssues : coreMember.issues,
      missingDepTargets:
        combinedDepTargets.length > 0
          ? combinedDepTargets
          : coreMember.missingDepTargets,
    };
  };

  const passOneEntries: PatchEvaluatedMod[] = [];
  buckets.forEach((members, gKey) => {
    passOneEntries.push(mergeEvaluatedGroup(members, gKey));
  });

  // Second pass: merge prefix-based Addons/Modules and equal-normalized-title twins into their parent mod card
  const mergedOut = new Set<number>();
  for (let i = 0; i < passOneEntries.length; i++) {
    if (mergedOut.has(i)) continue;
    let parent = passOneEntries[i];
    const pTitle = String(parent.title || "").trim();
    if (pTitle.length < 4) continue;
    const pLower = pTitle.toLowerCase();
    const pNorm = normalizeModGroupTitle(pTitle).toLowerCase().trim();

    for (let j = 0; j < passOneEntries.length; j++) {
      if (i === j || mergedOut.has(j)) continue;
      const candidate = passOneEntries[j];
      const cTitle = String(candidate.title || "").trim();
      const cLower = cTitle.toLowerCase();
      const cNorm = normalizeModGroupTitle(cTitle).toLowerCase().trim();

      const isEqualTwin = Boolean(
        pNorm.length >= 4 &&
          pNorm === cNorm &&
          !parent.isCollectionFolder &&
          !candidate.isCollectionFolder
      );
      const isPrefixAddon =
        isEqualTwin ||
        (cLower.length > pLower.length &&
          cLower.startsWith(pLower) &&
          /^(\s*[-:–_(\[]|\s+(addon|add-on|module|pack|part|script|scripts)\b)/i.test(
            cTitle.slice(pTitle.length)
          ));

      if (isPrefixAddon) {
        mergedOut.add(j);
        parent = mergeEvaluatedGroup(
          [parent, candidate],
          parent.suiteKey || `merged:${pNorm}`
        );
        passOneEntries[i] = parent;
      }
    }
  }

  return passOneEntries.filter((_, idx) => !mergedOut.has(idx));
}

export function matchesPatchSearchQuery(item: PatchEvaluatedMod, q: string): boolean {
  if (!q) return true;
  if (item.title.toLowerCase().includes(q)) return true;
  if (item.author && item.author.toLowerCase().includes(q)) return true;
  if (item.reasonLabel.toLowerCase().includes(q)) return true;
  if (Array.isArray(item.memberEvaluations)) {
    for (let i = 0; i < item.memberEvaluations.length; i++) {
      const mem = item.memberEvaluations[i];
      if (
        mem.title.toLowerCase().includes(q) ||
        (mem.author && mem.author.toLowerCase().includes(q)) ||
        String(mem.rawMod?.name || "").toLowerCase().includes(q)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function equipMissingDepsIntoBlueprint(
  blueprintName: string | undefined,
  depsToEquip: MissingDepTarget[],
  t: (key: string, fallback?: string) => string
) {
  if (!Array.isArray(depsToEquip) || depsToEquip.length === 0) return;
  const store = useStore.getState();
  const currentSets = Array.isArray(store.playSets) ? store.playSets : [];
  if (currentSets.length === 0) return;

  const targetIdx = blueprintName
    ? currentSets.findIndex((ps: any) => ps?.name === blueprintName)
    : store.activePlaySetIndex;
  const resolvedIdx = targetIdx >= 0 ? targetIdx : store.activePlaySetIndex;
  const targetSet = currentSets[resolvedIdx];
  if (!targetSet) return;

  const allVaultMods: any[] = Array.isArray(store.modList) ? store.modList : [];
  const schema = store.activeGameSchema;
  const namesToAdd: string[] = [];
  const hashesToAdd: Record<string, string> = {};
  const equippedLabels: string[] = [];

  for (let i = 0; i < depsToEquip.length; i++) {
    const dep = depsToEquip[i];
    if (!dep?.vaultModName) continue;
    const primaryVm = allVaultMods.find(
      (vm: any) =>
        vm &&
        !vm.isVirtual &&
        !vm.isCollection &&
        String(vm.name || "").toLowerCase() === dep.vaultModName!.toLowerCase()
    );
    if (!primaryVm) {
      namesToAdd.push(dep.vaultModName);
      equippedLabels.push(dep.name);
      continue;
    }

    equippedLabels.push(dep.name);
    const primaryBase = cleanSearchName(primaryVm.name, schema)
      .toLowerCase()
      .trim();
    const anchorFam = String(
      primaryVm.baseFamilyId || primaryVm.familyId || primaryVm.dbId || ""
    )
      .split("@")[0]
      .trim();

    for (let j = 0; j < allVaultMods.length; j++) {
      const vm = allVaultMods[j];
      if (!vm || vm.isVirtual || vm.isCollection || !vm.name) continue;
      const isSelf = vm.name === primaryVm.name;
      const vmBase = cleanSearchName(vm.name, schema).toLowerCase().trim();
      const isTwinBase =
        Boolean(primaryBase) && vmBase === primaryBase && !isSelf;
      const vmFam = String(vm.baseFamilyId || vm.familyId || vm.dbId || "")
        .split("@")[0]
        .trim();
      const rel = String(vm.relationshipType || "").toLowerCase();
      const isCoreTwinSibling =
        Boolean(anchorFam) &&
        anchorFam !== "null" &&
        anchorFam !== "undefined" &&
        !anchorFam.startsWith("local_") &&
        vmFam === anchorFam &&
        (rel === "core" || rel === "twin" || (!rel && isTwinBase));

      if (isSelf || isTwinBase || isCoreTwinSibling) {
        namesToAdd.push(vm.name);
        if (vm.hash) {
          hashesToAdd[vm.name] = String(vm.hash);
        }
      }
    }
  }

  if (namesToAdd.length === 0) return;

  const existingMods = Array.isArray(targetSet.mods) ? targetSet.mods : [];
  const mergedMods = deduplicateBlueprintArtifacts(
    [...existingMods, ...namesToAdd],
    schema
  );
  const nextSet = {
    ...targetSet,
    mods: mergedMods,
    modHashes: {
      ...(targetSet.modHashes || {}),
      ...hashesToAdd,
    },
  };
  const nextSets = [...currentSets];
  nextSets[resolvedIdx] = nextSet;
  store.setPlaySets(nextSets);

  store.pushStatus(
    t("patch_sim_equipped_dep_toast", 'Equipped {0} into "{1}".')
      .replace("{0}", equippedLabels.join(", "))
      .replace("{1}", targetSet.name),
    "success"
  );
}

