import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../../utils/envUtils";
import { useLexicon } from "../../LexiconContext";
import { supabase } from "../../supabase";
import { useStore } from "../../store";
import { useModalStore } from "../../store/modalStore";
import { fetchEncryptedVaultCompanionSnapshots, type VaultCompanionSnapshot, type VaultCompanionArtifact } from "../../utils/stagingCrypto";
import { compareVersions, isVersionMatch, getHighestVersion, cleanSearchName, getModFallbackUrl, getModIcon, formatDisplayName, isScriptExtension, stripPriorityTierPrefix, deduplicateBlueprintArtifacts } from "../../shared";
import { evaluateModIssues, resolveActiveBlueprintMods, resolveBlueprintConflicts, normalizeModGroupTitle, extractValidCreator, formatCleanModTitle, type MissingDepTarget, type StackedModIssue } from "../../side-panels/CommandIncompatiblePanel";
import { PatchModBucket, PatchModIssueKind, PatchEvaluatedMod, BlueprintPatchReport, UUID_RE, getOrCreateWorkspaceCache, parseCompatArray, cleanVersionLabel, isWildcardVersion, buildActiveDependencyIndex, registerSuiteInTitleLookup, findUnsatisfiedSuiteDependency } from "./patchNavigationAndTypes";

export function useBlueprintPatchReadiness(opts?: {
  pinnedBlueprintNames?: string[];
  skip?: boolean;
  deferInitial?: boolean;
}) {
  const skip = Boolean(opts?.skip);
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const workspaces = useStore((s) => s.workspaces);
  const playSets = useStore((s) => s.playSets);
  const activeSetName = useStore((s) => s.activeSetName);
  const modList = useStore((s) => s.modList);
  const selectedVersion = useStore((s) => s.selectedVersion);
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const networkUpdates = useStore((s) => s.networkUpdates);
  const ownedDLC = useStore((s) => s.ownedDLC);
  const maskedDLC = useStore((s) => s.maskedDLC);
  const backupList = useStore((s) => s.backupList);
  const shelterActive = useStore((s) => s.shelterActive);
  const defconLevel = useStore((s) => s.defconLevel);
  const isPatchDetected = useStore((s) => s.isPatchDetected);
  const vaultPath = useStore((s) => s.vaultPath);
  const session = useStore((s) => s.session);
  const volatileSignatureQueues = useModalStore((s) => s.volatileSignatureQueues);

  const wsKey = activeWorkspaceId || "default";
  const storageKey = `sanctuary_${wsKey}_sim_patch_ver`;

  const [officialVersions, setOfficialVersions] = useState<string[]>(() => {
    return getOrCreateWorkspaceCache(wsKey).gameVersions;
  });
  const [companionSnapshots, setCompanionSnapshots] = useState<VaultCompanionSnapshot[]>(() => {
    return getOrCreateWorkspaceCache(wsKey).companionSnapshots || [];
  });
  const [cloudTick, setCloudTick] = useState(0);
  const [poolItems, setPoolItems] = useState<any[]>(() => {
    return getOrCreateWorkspaceCache(wsKey).poolItems || [];
  });
  const [deferredReady, setDeferredReady] = useState<boolean>(() => {
    return !opts?.deferInitial || Boolean(getOrCreateWorkspaceCache(wsKey).lastReportsCache);
  });

  useEffect(() => {
    if (skip) return;
    if (!opts?.deferInitial || getOrCreateWorkspaceCache(wsKey).lastReportsCache) {
      if (!deferredReady) setDeferredReady(true);
      return;
    }
    const timer = window.setTimeout(() => setDeferredReady(true), 0);
    return () => window.clearTimeout(timer);
  }, [skip, opts?.deferInitial, wsKey, deferredReady]);
  const [userTargetVersion, setUserTargetVersionState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (skip) return;
    try {
      setUserTargetVersionState(sessionStorage.getItem(storageKey) || "");
    } catch {
      setUserTargetVersionState("");
    }
    setOfficialVersions(getOrCreateWorkspaceCache(wsKey).gameVersions);
  }, [wsKey, storageKey, skip]);

  useEffect(() => {
    if (skip || typeof window === "undefined") return;
    const onSimVersionChange = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (detail && detail.storageKey === storageKey) {
        setUserTargetVersionState(String(detail.version || ""));
      }
    };
    window.addEventListener("sa-patch-sim-version-change", onSimVersionChange);
    return () =>
      window.removeEventListener("sa-patch-sim-version-change", onSimVersionChange);
  }, [storageKey, skip]);

  const setTargetVersion = useCallback(
    (ver: unknown) => {
      const clean = cleanVersionLabel(ver);
      setUserTargetVersionState(clean);
      try {
        if (clean) sessionStorage.setItem(storageKey, clean);
        else sessionStorage.removeItem(storageKey);
      } catch {}
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("sa-patch-sim-version-change", {
            detail: { storageKey, version: clean },
          })
        );
      }
    },
    [storageKey]
  );

  // 1. Fetch official game versions from Spoke DB
  useEffect(() => {
    if (
      skip ||
      activeWorkspaceId === "default_workspace" ||
      !workspaces ||
      workspaces.length === 0 ||
      !navigator.onLine ||
      localStorage.getItem("sanctuary_local_only") === "true"
    ) {
      return;
    }
    const cache = getOrCreateWorkspaceCache(wsKey);
    if (
      cache.gameVersions.length > 0 &&
      Date.now() - cache.lastVersionsFetch < 60_000
    ) {
      setOfficialVersions(cache.gameVersions);
      return;
    }

    let cancelled = false;
    supabase
      .from("game_versions")
      .select("version, release_date")
      .order("release_date", { ascending: false, nullsFirst: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const list = data
          .map((d: any) => cleanVersionLabel(d.version))
          .filter((v: string) => Boolean(v) && !isWildcardVersion(v));
        cache.gameVersions = list;
        cache.lastVersionsFetch = Date.now();
        setOfficialVersions(list);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, workspaces, wsKey, skip]);

  // 2. Fetch local Mod Version Archive pool on Desktop (cached across tab/view remounts)
  useEffect(() => {
    if (skip || !isDesktop()) return;
    const cache = getOrCreateWorkspaceCache(wsKey);
    const curModCount = modList?.length || 0;
    if (
      cache.lastPoolFetch > 0 &&
      Date.now() - cache.lastPoolFetch < 30_000 &&
      cache.lastPoolModCount === curModCount
    ) {
      if (poolItems !== cache.poolItems) setPoolItems(cache.poolItems);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let resolvedVaultPath = vaultPath;
        if (!resolvedVaultPath) {
          const cfg: any = await invoke("get_saved_coordinates");
          resolvedVaultPath = cfg?.vault_path || "";
        }
        if (!resolvedVaultPath || cancelled) return;
        const res: any = await invoke("get_mod_version_pool_status", {
          vaultPath: resolvedVaultPath,
        });
        if (!cancelled && Array.isArray(res?.items)) {
          cache.poolItems = res.items;
          cache.lastPoolFetch = Date.now();
          cache.lastPoolModCount = curModCount;
          setPoolItems(res.items);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultPath, modList?.length, skip, wsKey]);

  // 2B. Hydrate Web/PWA via encrypted Zero-PII Companion Snapshots (zero passkey prompt)
  useEffect(() => {
    if (
      skip ||
      isDesktop() ||
      !session?.user?.id ||
      !navigator.onLine ||
      localStorage.getItem("sanctuary_local_only") === "true"
    ) {
      return;
    }
    const cache = getOrCreateWorkspaceCache(wsKey);
    if (
      Array.isArray(cache.companionSnapshots) &&
      cache.companionSnapshots.length > 0 &&
      Date.now() - (cache.lastCompanionFetch || 0) < 30_000
    ) {
      setCompanionSnapshots(cache.companionSnapshots);
      return;
    }

    let cancelled = false;
    fetchEncryptedVaultCompanionSnapshots(session)
      .then((snaps) => {
        if (cancelled) return;
        const safeSnaps = Array.isArray(snaps) ? snaps : [];
        cache.companionSnapshots = safeSnaps;
        cache.lastCompanionFetch = Date.now();
        setCompanionSnapshots(safeSnaps);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [skip, wsKey, session?.user?.id]);

  const companionData = useMemo(() => {
    if (
      skip ||
      isDesktop() ||
      (Array.isArray(playSets) &&
        playSets.length > 0 &&
        Array.isArray(modList) &&
        modList.length > 0)
    ) {
      return null;
    }

    const activeSnap = companionSnapshots[0] || null;
    const synthMods: any[] = [];
    const modKeySet = new Set<string>();
    const rawIndexToSynth = new Map<number, any>();

    const registerSynthMod = (m: any, rawIdx?: number) => {
      const key = String(m.dbId || m.hash || m.name || "").toLowerCase().trim();
      if (key && modKeySet.has(key)) {
        const existing = synthMods.find(
          (x) => String(x.dbId || x.hash || x.name || "").toLowerCase().trim() === key
        );
        if (rawIdx !== undefined && existing) rawIndexToSynth.set(rawIdx, existing);
        return existing;
      }
      if (key) modKeySet.add(key);
      synthMods.push(m);
      if (rawIdx !== undefined) rawIndexToSynth.set(rawIdx, m);
      return m;
    };

    if (Array.isArray(activeSnap?.artifacts)) {
      activeSnap.artifacts.forEach((art: VaultCompanionArtifact, idx: number) => {
        registerSynthMod(
          {
            id: art.hash || art.dbId || art.name,
            hash: art.hash,
            dbId: art.dbId,
            name: art.name,
            displayName: art.displayName || art.name,
            author: art.author,
            version: art.version,
            status: art.status || "stable",
            hasUpdate: Boolean(art.hasUpdate),
            newVersion: art.newVersion,
            download_url: art.url,
            url: art.url,
            manifest_url: art.manifestUrl,
            compliance_tier: art.complianceTier,
            category: art.category,
            compatible_versions: art.compatibleVersions,
            isScript: Boolean(art.isScript),
            isEquipped: Boolean(art.isEquipped),
            _isCompanionArtifact: true,
          },
          idx
        );
      });
    }

    const synthPlaySets: any[] = [];
    const bpNameSet = new Set<string>();
    const toBpModEntry = (m: any) => ({
      name: m.name,
      hash: m.hash,
      dbId: m.dbId,
      displayName: m.displayName,
      version: m.version,
      compatible_versions: m.compatible_versions,
      isScript: Boolean(m.isScript),
    });

    if (Array.isArray(activeSnap?.desktopBlueprints)) {
      for (const bp of activeSnap.desktopBlueprints) {
        if (!bp?.name) continue;
        let bpMods: any[] = [];
        if (Array.isArray(bp.artifactIndices) && bp.artifactIndices.length > 0) {
          bpMods = bp.artifactIndices
            .map((idx) => rawIndexToSynth.get(idx))
            .filter(Boolean)
            .map(toBpModEntry);
        } else if (Array.isArray(bp.artifacts) && bp.artifacts.length > 0) {
          bpMods = bp.artifacts.map((art) => {
            const registered = registerSynthMod({
              id: art.hash || art.dbId || art.name,
              hash: art.hash,
              dbId: art.dbId,
              name: art.name,
              displayName: art.displayName || art.name,
              author: art.author,
              version: art.version,
              status: art.status || "stable",
              hasUpdate: Boolean(art.hasUpdate),
              newVersion: art.newVersion,
              download_url: art.url,
              url: art.url,
              manifest_url: art.manifestUrl,
              compliance_tier: art.complianceTier,
              category: art.category,
              compatible_versions: art.compatibleVersions,
              isScript: Boolean(art.isScript),
              isEquipped: Boolean(art.isEquipped),
              _isCompanionArtifact: true,
            });
            return toBpModEntry(registered);
          });
        } else if (bp.isActive) {
          bpMods = synthMods.filter((m) => m.isEquipped).map(toBpModEntry);
        }
        bpNameSet.add(bp.name.toLowerCase());
        synthPlaySets.push({
          name: bp.name,
          code: bp.code,
          mods: bpMods,
          isSyncedCompanion: true,
        });
      }
    }

    if (Array.isArray(volatileSignatureQueues)) {
      for (const q of volatileSignatureQueues) {
        const items =
          Array.isArray(q?.resolvedItems) && q.resolvedItems.length > 0
            ? q.resolvedItems
            : Array.isArray(q?.payload?.items)
              ? q.payload.items
              : [];
        const bpMods: any[] = [];
        for (const item of items) {
          if (!item?.name) continue;
          const registered = registerSynthMod({
            id: item.id || item.hash || item.dbId || item.name,
            hash: item.hash,
            dbId: item.dbId,
            name: item.name,
            displayName: item.displayName || item.name,
            author: item.author || item.master_author,
            version: item.version,
            status: item.status || "stable",
            download_url: item.url,
            url: item.url,
            manifest_url: item.manifest_url,
            compliance_tier: item.compliance_tier,
            category: item.category_override || item.category || item.type,
            compatible_versions: item.compatible_versions,
            isScript: Boolean(
              item.type && String(item.type).toLowerCase().includes("script")
            ),
          });
          bpMods.push(toBpModEntry(registered));
        }
        const qBpName = String(q?.payload?.blueprintName || "").trim();
        if (qBpName && !bpNameSet.has(qBpName.toLowerCase()) && bpMods.length > 0) {
          bpNameSet.add(qBpName.toLowerCase());
          synthPlaySets.push({
            name: qBpName,
            code: q?.payload?.code,
            mods: bpMods,
            isQueuedPipeline: true,
          });
        }
      }
    }

    return {
      playSets: synthPlaySets,
      modList: synthMods,
      activeSetName:
        activeSetName || activeSnap?.activeBlueprintName || synthPlaySets[0]?.name || "",
      selectedVersion: selectedVersion || activeSnap?.gameVersion || "",
    };
  }, [
    skip,
    companionSnapshots,
    volatileSignatureQueues,
    playSets,
    modList,
    activeSetName,
    selectedVersion,
  ]);

  const effectiveModList = companionData ? companionData.modList : modList;
  const effectivePlaySets = companionData ? companionData.playSets : playSets;
  const effectiveActiveSetName = companionData
    ? companionData.activeSetName
    : activeSetName;
  const effectiveSelectedVersion = companionData
    ? companionData.selectedVersion
    : selectedVersion;

  // 3. Fetch cloud mod_versions + parent mods.compatible_versions across the Vault
  useEffect(() => {
    if (
      skip ||
      activeWorkspaceId === "default_workspace" ||
      !workspaces ||
      workspaces.length === 0 ||
      !navigator.onLine ||
      localStorage.getItem("sanctuary_local_only") === "true" ||
      !Array.isArray(effectiveModList) ||
      effectiveModList.length === 0
    ) {
      return;
    }

    const cache = getOrCreateWorkspaceCache(wsKey);
    const neededModIds: string[] = [];
    const collectId = (raw: any) => {
      const rawId = String(raw || "").split("@")[0].trim();
      if (UUID_RE.test(rawId) && !cache.fetchedModIds.has(rawId)) {
        neededModIds.push(rawId);
      }
    };

    for (let i = 0; i < effectiveModList.length; i++) {
      const m = effectiveModList[i];
      collectId(m?.dbId);
      if (Array.isArray(m?.flavors)) {
        for (let j = 0; j < m.flavors.length; j++) {
          collectId(m.flavors[j]?.dbId);
        }
      }
    }

    const uniqueIds = Array.from(new Set(neededModIds));
    if (uniqueIds.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const CHUNK_SIZE = 200;
        for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
          if (cancelled) return;
          const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
          chunk.forEach((id) => cache.fetchedModIds.add(id));
          const { data, error } = await supabase
            .from("mod_versions")
            .select(
              "id, dna_hash, mod_id, version_label, game_version, download_url, mods(id, name, status, compliance_tier, latest_version, compatible_versions, url)"
            )
            .in("mod_id", chunk);
          if (error) {
            chunk.forEach((id) => cache.fetchedModIds.delete(id));
            continue;
          }
          if (cancelled) return;
          if (Array.isArray(data)) {
            for (const row of data) {
              const modRef = Array.isArray(row?.mods) ? row.mods[0] : row?.mods;
              const tier = Number(modRef?.compliance_tier ?? 0);
              if (tier >= 1 && tier <= 5) continue;
              const mid = String(row.mod_id || "");
              if (!mid) continue;
              const arr = cache.cloudModVersions.get(mid) || [];
              const rowKey = String(row.id || row.dna_hash || "");
              if (
                !rowKey ||
                !arr.some((existing) => String(existing.id || existing.dna_hash || "") === rowKey)
              ) {
                arr.push(row);
                cache.cloudModVersions.set(mid, arr);
              }
            }
          }
        }
        cache.lastCloudFetch = Date.now();
        if (!cancelled) setCloudTick((c) => c + 1);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, workspaces, effectiveModList, wsKey, skip]);

  const availableVersions = useMemo(() => {
    if (skip) return [];
    const set = new Set<string>();
    const addVer = (raw: any) => {
      if (!raw) return;
      const parts = String(raw)
        .split(/,|\s+-\s+|\.\./)
        .map((p) => cleanVersionLabel(p))
        .filter(Boolean);
      for (const clean of parts) {
        if (!isWildcardVersion(clean) && /^\d/.test(clean)) {
          set.add(clean);
        }
      }
    };

    officialVersions.forEach(addVer);
    addVer(effectiveSelectedVersion);

    if (Array.isArray(networkUpdates?.updated)) {
      networkUpdates.updated.forEach((u: any) => addVer(u?.newGameVersion));
    }
    if (Array.isArray(backupList)) {
      backupList.forEach((b: any) =>
        addVer(b?.gameVersion || b?.game_version || b?.version)
      );
    }
    if (Array.isArray(effectiveModList)) {
      for (let i = 0; i < Math.min(effectiveModList.length, 600); i++) {
        parseCompatArray(effectiveModList[i]?.compatible_versions).forEach(addVer);
      }
    }

    const cache = getOrCreateWorkspaceCache(wsKey);
    cache.cloudModVersions.forEach((rows) => {
      for (const r of rows) {
        addVer(r?.game_version);
        const pm = Array.isArray(r?.mods) ? r.mods[0] : r?.mods;
        parseCompatArray(pm?.compatible_versions).forEach(addVer);
      }
    });

    return Array.from(set).sort((a, b) => compareVersions(b, a));
  }, [
    skip,
    officialVersions,
    effectiveSelectedVersion,
    networkUpdates,
    backupList,
    effectiveModList,
    wsKey,
    cloudTick,
  ]);

  const cleanCurrentVersion = useMemo(
    () => cleanVersionLabel(effectiveSelectedVersion),
    [effectiveSelectedVersion]
  );

  const latestKnownVersion = availableVersions[0] || cleanCurrentVersion || "";

  const isUpdateBehindLatest = useMemo(() => {
    if (!latestKnownVersion || !cleanCurrentVersion) return false;
    return compareVersions(latestKnownVersion, cleanCurrentVersion) > 0;
  }, [latestKnownVersion, cleanCurrentVersion]);

  const targetVersion = useMemo(() => {
    if (userTargetVersion && availableVersions.includes(userTargetVersion)) {
      return userTargetVersion;
    }
    if (userTargetVersion) return userTargetVersion;
    if (latestKnownVersion) return latestKnownVersion;
    return cleanCurrentVersion;
  }, [userTargetVersion, availableVersions, latestKnownVersion, cleanCurrentVersion]);

  const versionRelation = useMemo<"upgrade" | "rollback" | "current">(() => {
    if (!targetVersion || !cleanCurrentVersion) return "current";
    const cmp = compareVersions(targetVersion, cleanCurrentVersion);
    if (cmp > 0) return "upgrade";
    if (cmp < 0) return "rollback";
    return "current";
  }, [targetVersion, cleanCurrentVersion]);

  // Index local archived versions by normalized relative path
  const archivedByRelPath = useMemo(() => {
    if (skip) return new Map<string, any[]>();
    const map = new Map<string, any[]>();
    for (const item of poolItems) {
      if (!item?.rel_path) continue;
      const key = stripPriorityTierPrefix(String(item.rel_path), activeGameSchema)
        .toLowerCase()
        .replace(/\\/g, "/");
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [skip, poolItems, activeGameSchema]);

  const pinnedNames = useMemo(() => {
    if (Array.isArray(opts?.pinnedBlueprintNames)) return opts!.pinnedBlueprintNames;
    try {
      const raw = localStorage.getItem("myPinnedBlueprints");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [opts?.pinnedBlueprintNames]);

  const pinnedKey = useMemo(() => pinnedNames.join("|"), [pinnedNames]);

  const blueprintReports = useMemo<BlueprintPatchReport[]>(() => {
    if (skip || !Array.isArray(effectivePlaySets) || effectivePlaySets.length === 0)
      return [];
    const cache = getOrCreateWorkspaceCache(wsKey);
    const prev = cache.lastReportsCache;
    if (!deferredReady && opts?.deferInitial) {
      return prev?.result || [];
    }
    if (
      prev &&
      prev.playSets === effectivePlaySets &&
      prev.activeSetName === effectiveActiveSetName &&
      prev.pinnedKey === pinnedKey &&
      prev.modList === effectiveModList &&
      prev.activeGameSchema === activeGameSchema &&
      prev.networkUpdates === networkUpdates &&
      prev.targetVersion === targetVersion &&
      prev.ownedDLC === ownedDLC &&
      prev.maskedDLC === maskedDLC &&
      prev.poolItems === poolItems &&
      prev.versionRelation === versionRelation &&
      prev.isPatchDetected === isPatchDetected &&
      prev.defconLevel === defconLevel &&
      prev.cloudTick === cloudTick
    ) {
      return prev.result;
    }

    const collectionIds = new Set<string>();
    const globalKnownFamilyIds = new Set<string>();
    const vaultDepLookup = new Map<string, any>();

    if (Array.isArray(effectiveModList)) {
      for (let i = 0; i < effectiveModList.length; i++) {
        const vm = effectiveModList[i];
        if (!vm) continue;
        const vmDbId = String(vm.dbId || "").split("@")[0].trim();
        if (vm.isCollection && vmDbId) {
          collectionIds.add(vmDbId);
        }
        const rawVmId = String(vm.id || "").trim();
        if (rawVmId.startsWith("virtual_")) {
          const vFam = rawVmId.replace(/^virtual_/, "").trim();
          if (vFam && !collectionIds.has(vFam)) globalKnownFamilyIds.add(vFam);
        }
        const vmFam = String(vm.baseFamilyId || vm.familyId || "")
          .split("@")[0]
          .trim();
        if (
          vmFam &&
          vmFam !== "null" &&
          vmFam !== "undefined" &&
          !vmFam.startsWith("local_") &&
          !vm.isCollection &&
          !collectionIds.has(vmFam)
        ) {
          globalKnownFamilyIds.add(vmFam);
        }
        if (!vm.isVirtual && !vm.isCollection && vm.name) {
          const disp = formatCleanModTitle(
            formatDisplayName(vm.displayName || vm.meta_name || vm.name || "")
          )
            .toLowerCase()
            .trim();
          const normDisp = normalizeModGroupTitle(disp).toLowerCase().trim();
          const searchBase = cleanSearchName(vm.name, activeGameSchema)
            .toLowerCase()
            .trim();
          const isRootCore =
            String(vm.relationshipType || "").toLowerCase() === "core" ||
            (vmDbId && !vmFam);
          if (disp && (!vaultDepLookup.has(disp) || isRootCore)) {
            vaultDepLookup.set(disp, vm);
          }
          if (normDisp && (!vaultDepLookup.has(normDisp) || isRootCore)) {
            vaultDepLookup.set(normDisp, vm);
          }
          if (searchBase && (!vaultDepLookup.has(searchBase) || isRootCore)) {
            vaultDepLookup.set(searchBase, vm);
          }
        }
      }
    }

    const resolveMissingDepTarget = (depLabel: string): MissingDepTarget => {
      const cleanDep = formatCleanModTitle(depLabel) || depLabel;
      const lower = cleanDep.toLowerCase().trim();
      const norm = normalizeModGroupTitle(cleanDep).toLowerCase().trim();
      const matchedVm =
        vaultDepLookup.get(lower) || vaultDepLookup.get(norm) || null;
      const depUrl =
        matchedVm?.download_url ||
        matchedVm?.url ||
        getModFallbackUrl(cleanDep, matchedVm?.hash, activeGameSchema, {
          url: matchedVm?.download_url || matchedVm?.url,
        });
      let sourceHost = "";
      try {
        const host = new URL(depUrl).hostname.replace(/^www\./i, "");
        if (
          host &&
          !host.includes("google.") &&
          !host.includes("bing.") &&
          !host.includes("duckduckgo.")
        ) {
          sourceHost = host;
        }
      } catch {
        sourceHost = "";
      }
      return {
        name: cleanDep,
        url: depUrl,
        sourceHost,
        vaultModName: matchedVm?.name || undefined,
      };
    };

    const computedReports: BlueprintPatchReport[] = effectivePlaySets.map((ps: any) => {
      const isEquipped = ps.name === effectiveActiveSetName;
      const isPinned = pinnedNames.includes(ps.name);
      const resolvedMods = resolveActiveBlueprintMods(
        ps.mods,
        effectiveModList,
        activeGameSchema,
        networkUpdates
      );

      const bpKnownFamilyIds = new Set<string>(globalKnownFamilyIds);
      for (let idx = 0; idx < resolvedMods.length; idx++) {
        const rm = resolvedMods[idx];
        if (!rm || rm.isFallback || rm.isCollection) continue;
        const fRaw = String(rm.baseFamilyId || rm.familyId || "")
          .split("@")[0]
          .trim();
        if (
          fRaw &&
          fRaw !== "null" &&
          fRaw !== "undefined" &&
          !fRaw.startsWith("local_") &&
          !collectionIds.has(fRaw)
        ) {
          bpKnownFamilyIds.add(fRaw);
        }
      }

      // Detect atomic script/module twin pairs & script-bearing non-collection suites without collapsing 1-to-1 artifact counts
      const famBuckets = new Map<
        string,
        { indices: number[]; hasAtomicCoupling: boolean }
      >();
      const twinBuckets = new Map<
        string,
        { indices: number[]; hasScript: boolean; creators: Set<string> }
      >();

      for (let idx = 0; idx < resolvedMods.length; idx++) {
        const m = resolvedMods[idx];
        if (!m || m.isFallback) continue;
        const modIsScript = isScriptExtension(
          String(m.name || m._originalSetName || ""),
          activeGameSchema
        );
        const relType = String(m.relationshipType || "").toLowerCase();
        const explicitFamRaw = String(m.baseFamilyId || m.familyId || "")
          .split("@")[0]
          .trim();
        const selfDbId = String(m.dbId || "").split("@")[0].trim();
        const famRaw =
          explicitFamRaw &&
          explicitFamRaw !== "null" &&
          explicitFamRaw !== "undefined"
            ? explicitFamRaw
            : selfDbId && bpKnownFamilyIds.has(selfDbId)
              ? selfDbId
              : "";
        if (
          famRaw &&
          famRaw !== "null" &&
          famRaw !== "undefined" &&
          !famRaw.startsWith("local_") &&
          !collectionIds.has(famRaw) &&
          !m.isCollection &&
          relType !== "set_item"
        ) {
          const fb = famBuckets.get(famRaw) || {
            indices: [],
            hasAtomicCoupling: false,
          };
          fb.indices.push(idx);
          if (
            modIsScript ||
            relType === "module" ||
            relType === "core" ||
            relType === "addon" ||
            relType === "script"
          ) {
            fb.hasAtomicCoupling = true;
          }
          famBuckets.set(famRaw, fb);
        }

        const cleanTitle = formatCleanModTitle(
          formatDisplayName(m.displayName || m.meta_name || m.name || "")
        );
        const twinNorm = normalizeModGroupTitle(cleanTitle).toLowerCase().trim();
        if (twinNorm.length >= 3) {
          const tb = twinBuckets.get(twinNorm) || {
            indices: [],
            hasScript: false,
            creators: new Set<string>(),
          };
          tb.indices.push(idx);
          if (modIsScript) tb.hasScript = true;
          const cr = (extractValidCreator(m) || "").toLowerCase();
          if (cr) tb.creators.add(cr);
          twinBuckets.set(twinNorm, tb);
        }
      }

      const suiteKeyByIndex = new Array<string>(resolvedMods.length);
      for (let idx = 0; idx < resolvedMods.length; idx++) {
        suiteKeyByIndex[idx] = `art:${idx}`;
      }

      famBuckets.forEach((fb, famRaw) => {
        if (fb.indices.length > 1 && fb.hasAtomicCoupling) {
          for (const idx of fb.indices) {
            suiteKeyByIndex[idx] = `fam:${famRaw}`;
          }
        }
      });

      twinBuckets.forEach((tb, twinNorm) => {
        if (tb.indices.length > 1 && tb.hasScript) {
          if (tb.creators.size <= 1) {
            for (const idx of tb.indices) {
              if (suiteKeyByIndex[idx].startsWith("art:")) {
                suiteKeyByIndex[idx] = `twin:${twinNorm}`;
              }
            }
          } else {
            for (const idx of tb.indices) {
              const cr = (
                extractValidCreator(resolvedMods[idx]) || ""
              ).toLowerCase();
              if (cr && suiteKeyByIndex[idx].startsWith("art:")) {
                suiteKeyByIndex[idx] = `twin:${cr}::${twinNorm}`;
              }
            }
          }
        }
      });

      const allSuiteEntries: PatchEvaluatedMod[] = [];
      const knownTitleByKey = new Map<string, string>();
      const coupledSuites = new Map<string, PatchEvaluatedMod[]>();
      let archiveSwapReadyCount = 0;

      for (let idx = 0; idx < resolvedMods.length; idx++) {
        const m = resolvedMods[idx];
        const sKey = suiteKeyByIndex[idx];
        const uniqueKey = `art:${idx}:${String(
          m?._originalSetName || m?.name || idx
        )}`;
        const rawTitle = formatDisplayName(
          m?.displayName || m?.meta_name || m?.name || ""
        );
        const title = formatCleanModTitle(rawTitle) || rawTitle;
        const isScript = isScriptExtension(
          String(m?.name || m?._originalSetName || ""),
          activeGameSchema
        );
        const icon = getModIcon(m, activeGameSchema, t);

        if (!m || m.isFallback) {
          const fallbackEntry: PatchEvaluatedMod = {
            key: uniqueKey,
            suiteKey: sKey,
            title,
            author: null,
            icon,
            isScript,
            moduleCount: 1,
            installedVersion: null,
            targetModVersion: null,
            compatibleVersions: [],
            bucket: "blocking",
            source: "awaiting_patch",
            issueKind: "corrupted",
            reasonLabel: t("blueprint_tab_missing", "Missing from {Vault}"),
            downloadUrl: null,
            rawMod: m,
            groupedMods: m ? [m] : [],
            blueprintName: ps.name,
          };
          allSuiteEntries.push(fallbackEntry);
          continue;
        }

        registerSuiteInTitleLookup(title, [m], knownTitleByKey);
        const author = extractValidCreator(m);

        // Inspect Cloud mod_versions + parent mods.compatible_versions + local Compat
        const explicitCompatSet = new Set<string>();
        let hasVersionMismatchOnTarget = false;
        let cloudCompatibleRow: any = null;
        let cloudAnyNewerRow: any = null;
        let cloudMarkedBroken = false;
        let localMarkedBrokenOrObsolete = false;

        const localStat = String(m?.status || "").toLowerCase();
        if (
          localStat === "broken" ||
          localStat === "corrupted" ||
          localStat === "obsolete"
        ) {
          localMarkedBrokenOrObsolete = true;
        }

        const mid = String(m.dbId || "").split("@")[0].trim();
        const cloudRows = mid ? cache.cloudModVersions.get(mid) || [] : [];

        let matchedInstalledRow: any = null;
        let memberParentMod: any = null;

        for (const row of cloudRows) {
          const pm = Array.isArray(row.mods) ? row.mods[0] : row.mods;
          if (pm && !memberParentMod) memberParentMod = pm;
          const parentStatus = String(pm?.status || "").toLowerCase();
          if (
            parentStatus === "broken" ||
            parentStatus === "corrupted" ||
            parentStatus === "obsolete"
          ) {
            cloudMarkedBroken = true;
          }
          if (row.dna_hash && m.hash && String(row.dna_hash) === String(m.hash)) {
            matchedInstalledRow = row;
          }
        }

        let memberCompat: string[] = [];
        const installedRowVer = parseCompatArray(
          matchedInstalledRow?.game_version
        ).filter((v) => !isWildcardVersion(v));
        const parentCloudCompat = parseCompatArray(
          memberParentMod?.compatible_versions
        ).filter((v) => !isWildcardVersion(v));
        const localCompat = parseCompatArray(m.compatible_versions).filter(
          (v) => !isWildcardVersion(v)
        );

        if (installedRowVer.length > 0) {
          memberCompat = installedRowVer;
        } else if (parentCloudCompat.length > 0) {
          memberCompat = parentCloudCompat;
        } else if (localCompat.length > 0) {
          memberCompat = localCompat;
        }

        memberCompat.forEach((v) => explicitCompatSet.add(v));

        const memberMismatch =
          Boolean(targetVersion) &&
          memberCompat.length > 0 &&
          !isVersionMatch(memberCompat, targetVersion);

        if (memberMismatch) {
          hasVersionMismatchOnTarget = true;
        }

        for (const row of cloudRows) {
          const pm = Array.isArray(row.mods) ? row.mods[0] : row.mods;
          const isDifferentHash =
            Boolean(row.dna_hash) &&
            (!m.hash || String(row.dna_hash) !== String(m.hash));
          const rowGameVer = parseCompatArray(row.game_version).filter(
            (v) => !isWildcardVersion(v)
          );
          const effectiveRowCompat =
            rowGameVer.length > 0
              ? rowGameVer
              : parseCompatArray(pm?.compatible_versions).filter(
                  (v) => !isWildcardVersion(v)
                );

          if (
            targetVersion &&
            effectiveRowCompat.length > 0 &&
            isVersionMatch(effectiveRowCompat, targetVersion)
          ) {
            if (isDifferentHash && (memberMismatch || m.hasUpdate)) {
              cloudCompatibleRow = row;
            }
          } else if (isDifferentHash && pm?.latest_version) {
            cloudAnyNewerRow = row;
          }
        }

        const compatArr = Array.from(explicitCompatSet);

        const simulatedEval = evaluateModIssues(m, {
          activeMods: resolvedMods,
          selectedVersion: targetVersion,
          ownedDLC,
          maskedDLC,
          t,
          activeGameSchema,
        });
        const simulatedIssues = simulatedEval ? [simulatedEval] : [];
        const simulatedRedIssues = simulatedIssues.filter(
          (iss: any) => iss._alert_type === "red"
        );
        const hasNonVersionAtomicRed = simulatedRedIssues.some((iss: any) =>
          Array.isArray(iss._categories)
            ? iss._categories.some((c: string) => c !== "version_mismatch")
            : iss._alert_category !== "version_mismatch"
        );
        const hasSimulatedRedIssue =
          simulatedRedIssues.length > 0 || localMarkedBrokenOrObsolete;

        let archiveMatchVersion: string | null = null;
        if (Boolean(targetVersion)) {
          const relNorm = stripPriorityTierPrefix(
            String(m._originalSetName || m.path || m.name || ""),
            activeGameSchema
          )
            .toLowerCase()
            .replace(/\\/g, "/");
          const archivedRevs = archivedByRelPath.get(relNorm) || [];
          const matchingArch = archivedRevs.find(
            (rev: any) =>
              !rev.is_active &&
              isVersionMatch(
                parseCompatArray(rev.compatible_versions),
                targetVersion
              )
          );
          if (matchingArch) {
            archiveMatchVersion =
              getHighestVersion(
                parseCompatArray(matchingArch.compatible_versions)
              ) || targetVersion;
          }
        }

        const hasLocalUpdateFlag = Boolean(m.hasUpdate);
        const rawEdgeVer = cleanVersionLabel(m.newGameVersion);
        const edgeNewGameVer =
          rawEdgeVer && !isWildcardVersion(rawEdgeVer) ? rawEdgeVer : undefined;
        const edgeMatchesTarget =
          Boolean(edgeNewGameVer) &&
          Boolean(targetVersion) &&
          isVersionMatch([edgeNewGameVer!], targetVersion);

        const parentCloudMod = cloudCompatibleRow
          ? Array.isArray(cloudCompatibleRow.mods)
            ? cloudCompatibleRow.mods[0]
            : cloudCompatibleRow.mods
          : cloudAnyNewerRow
            ? Array.isArray(cloudAnyNewerRow.mods)
              ? cloudAnyNewerRow.mods[0]
              : cloudAnyNewerRow.mods
            : null;

        const resolvedDownloadUrl =
          cloudCompatibleRow?.download_url ||
          parentCloudMod?.url ||
          m.download_url ||
          m.url ||
          getModFallbackUrl(title, m.hash, activeGameSchema, {
            url: m.download_url || m.url,
          }) ||
          null;

        const cleanInstVer =
          m.version && !isWildcardVersion(m.version)
            ? cleanVersionLabel(m.version)
            : null;

        const hasActualCandidateUpdate =
          Boolean(cloudCompatibleRow) ||
          edgeMatchesTarget ||
          hasLocalUpdateFlag ||
          Boolean(archiveMatchVersion);

        const rawCandidateModVer = hasActualCandidateUpdate
          ? cleanVersionLabel(
              cloudCompatibleRow?.version_label ||
                (cloudCompatibleRow ? parentCloudMod?.latest_version : null) ||
                m.newVersion ||
                archiveMatchVersion
            )
          : "";

        const resolvedTargetModVer =
          rawCandidateModVer && !isWildcardVersion(rawCandidateModVer)
            ? rawCandidateModVer
            : null;

        const isUncertifiedScriptOnUpgrade =
          versionRelation === "upgrade" &&
          isScript &&
          compatArr.length === 0 &&
          !cloudCompatibleRow &&
          !edgeMatchesTarget &&
          (isPatchDetected || (defconLevel > 0 && defconLevel <= 3));

        let bucket: PatchModBucket = "ready";
        let source: PatchEvaluatedMod["source"] = "vault_active";
        let issueKind: PatchModIssueKind | undefined = undefined;
        let reasonLabel =
          compatArr.length > 0 &&
          targetVersion &&
          isVersionMatch(compatArr, targetVersion)
            ? `${t("patch_sim_verified_for", "Verified for")} v${targetVersion}`
            : t("patch_sim_compatible_in_vault", "Compatible in {Vault}");

        if (
          hasNonVersionAtomicRed ||
          cloudMarkedBroken ||
          localMarkedBrokenOrObsolete
        ) {
          bucket = "blocking";
          source = "awaiting_patch";
          const primaryRed = simulatedRedIssues.find(
            (iss: any) => iss._alert_category !== "version_mismatch"
          );
          const cat = primaryRed?._alert_category;
          issueKind =
            cat === "missing_deps"
              ? "dependency"
              : cat === "missing_dlc"
                ? "dlc"
                : "corrupted";
          reasonLabel =
            primaryRed?._alert_reason ||
            t("patch_sim_broken_on_patch", "Broken on Target Game Version");
        } else if (
          (hasVersionMismatchOnTarget ||
            hasSimulatedRedIssue ||
            hasLocalUpdateFlag) &&
          archiveMatchVersion
        ) {
          bucket = "update_ready";
          source = "vault_archive";
          archiveSwapReadyCount += 1;
          reasonLabel = t(
            "patch_sim_ready_in_archive",
            "Compatible Build in {Mod} Version History (Auto-Swap)"
          );
        } else if (
          Boolean(cloudCompatibleRow) ||
          edgeMatchesTarget ||
          (hasLocalUpdateFlag &&
            !hasVersionMismatchOnTarget &&
            !hasSimulatedRedIssue)
        ) {
          bucket = "update_ready";
          source = "cloud_update";
          reasonLabel = resolvedTargetModVer
            ? `${t("updates_avail", "Updates Available")} • v${resolvedTargetModVer}`
            : t("updates_avail", "Updates Available");
        } else if (
          hasVersionMismatchOnTarget ||
          hasSimulatedRedIssue ||
          isUncertifiedScriptOnUpgrade
        ) {
          bucket = "blocking";
          source = "awaiting_patch";
          issueKind = "version";
          if (hasVersionMismatchOnTarget) {
            const highest = getHighestVersion(compatArr);
            const cleanHigh = cleanVersionLabel(highest);
            reasonLabel = `${t(
              "patch_sim_awaiting_patch",
              "Awaiting {Mason} Update"
            )} (${
              cleanHigh && !isWildcardVersion(cleanHigh)
                ? `v${cleanHigh}`
                : t("unknown", "Unknown")
            })`;
          } else if (
            simulatedIssues.length > 0 &&
            simulatedIssues[0]?._alert_reason
          ) {
            reasonLabel = simulatedIssues[0]._alert_reason;
          } else if (isUncertifiedScriptOnUpgrade) {
            reasonLabel = t(
              "patch_sim_script_unverified",
              "Script {Mod} Not Yet Verified for Target Patch"
            );
          } else {
            reasonLabel = t(
              "patch_sim_broken_on_patch",
              "Broken on Target Game Version"
            );
          }
        }

        const entryIssues: StackedModIssue[] = Array.isArray(
          simulatedEval?._issues
        )
          ? (simulatedEval._issues as StackedModIssue[])
          : [];
        const entryDepTargets: MissingDepTarget[] = [];
        const seenDepNames = new Set<string>();
        for (let di = 0; di < entryIssues.length; di++) {
          const dt = entryIssues[di]?.depTarget;
          if (dt && dt.name) {
            const dk = dt.name.toLowerCase();
            if (!seenDepNames.has(dk)) {
              seenDepNames.add(dk);
              entryDepTargets.push(dt);
            }
          }
        }

        const evalEntry: PatchEvaluatedMod = {
          key: uniqueKey,
          suiteKey: sKey,
          title,
          author,
          icon,
          isScript,
          moduleCount: 1,
          installedVersion: cleanInstVer,
          targetModVersion: resolvedTargetModVer,
          compatibleVersions: compatArr,
          bucket,
          source,
          issueKind,
          reasonLabel,
          downloadUrl: resolvedDownloadUrl,
          rawMod: m,
          groupedMods: [m],
          issues: entryIssues.length > 0 ? entryIssues : undefined,
          missingDepTargets:
            entryDepTargets.length > 0 ? entryDepTargets : undefined,
          blueprintName: ps.name,
        };
        allSuiteEntries.push(evalEntry);

        if (!sKey.startsWith("art:")) {
          const list = coupledSuites.get(sKey) || [];
          list.push(evalEntry);
          coupledSuites.set(sKey, list);
        }
      }

      // Pass 1.5: Synchronize atomic script/module twin pairs so coupled siblings share blocking/update status
      const syncCoupledSuites = (): boolean => {
        let mutated = false;
        coupledSuites.forEach((siblings) => {
          if (siblings.length <= 1) return;
          const blockingDonor = siblings.find((s) => s.bucket === "blocking");
          if (blockingDonor) {
            for (const sib of siblings) {
              if (sib.bucket !== "blocking") {
                if (sib.source === "vault_archive") {
                  archiveSwapReadyCount = Math.max(0, archiveSwapReadyCount - 1);
                }
                sib.bucket = "blocking";
                sib.source = "awaiting_patch";
                sib.issueKind = blockingDonor.issueKind || "version";
                sib.reasonLabel = blockingDonor.reasonLabel;
                if (!sib.issues && blockingDonor.issues) {
                  sib.issues = blockingDonor.issues;
                }
                if (!sib.missingDepTargets && blockingDonor.missingDepTargets) {
                  sib.missingDepTargets = blockingDonor.missingDepTargets;
                }
                mutated = true;
              }
            }
            return;
          }

          const cloudDonor = siblings.find(
            (s) => s.bucket === "update_ready" && s.source === "cloud_update"
          );
          if (cloudDonor) {
            for (const sib of siblings) {
              if (
                sib.bucket === "ready" ||
                (sib.bucket === "update_ready" && sib.source === "dep_update_pending")
              ) {
                sib.bucket = "update_ready";
                sib.source = "cloud_update";
                sib.issueKind = undefined;
                sib.targetModVersion =
                  sib.targetModVersion || cloudDonor.targetModVersion;
                sib.downloadUrl = sib.downloadUrl || cloudDonor.downloadUrl;
                sib.reasonLabel = cloudDonor.reasonLabel;
                mutated = true;
              }
            }
            return;
          }

          const archiveDonor = siblings.find(
            (s) => s.bucket === "update_ready" && s.source === "vault_archive"
          );
          if (archiveDonor) {
            for (const sib of siblings) {
              if (sib.bucket === "ready") {
                sib.bucket = "update_ready";
                sib.source = "vault_archive";
                sib.issueKind = undefined;
                sib.targetModVersion =
                  sib.targetModVersion || archiveDonor.targetModVersion;
                sib.downloadUrl = sib.downloadUrl || archiveDonor.downloadUrl;
                sib.reasonLabel = archiveDonor.reasonLabel;
                mutated = true;
              }
            }
            return;
          }

          const depDonor = siblings.find(
            (s) => s.bucket === "update_ready" && s.source === "dep_update_pending"
          );
          if (depDonor) {
            for (const sib of siblings) {
              if (sib.bucket === "ready") {
                sib.bucket = "update_ready";
                sib.source = "dep_update_pending";
                sib.issueKind = "dependency";
                sib.reasonLabel = depDonor.reasonLabel;
                mutated = true;
              }
            }
          }
        });
        return mutated;
      };

      syncCoupledSuites();

      // Pass 2A: Fixed-point Blocking Dependency Cascade (including self-safe & multi-hop dependencies)
      const suitesWithDeps = allSuiteEntries.filter((entry) =>
        entry.groupedMods.some((gm) => Boolean(gm?.dependencies || gm?.requirements))
      );

      if (suitesWithDeps.length > 0) {
        const allEquippedIndex = buildActiveDependencyIndex(resolvedMods);

        for (let pass = 0; pass < 25; pass++) {
          let changed = false;
          const nonBlockingPool: any[] = [];
          for (let i = 0; i < allSuiteEntries.length; i++) {
            const se = allSuiteEntries[i];
            if (se.bucket !== "blocking") {
              for (let j = 0; j < se.groupedMods.length; j++) {
                nonBlockingPool.push(se.groupedMods[j]);
              }
            }
          }
          const nonBlockingIndex = buildActiveDependencyIndex(nonBlockingPool);

          for (let i = 0; i < suitesWithDeps.length; i++) {
            const se = suitesWithDeps[i];
            if (se.bucket === "blocking") continue;
            const missingDep = findUnsatisfiedSuiteDependency(
              se.groupedMods,
              nonBlockingIndex,
              knownTitleByKey,
              activeGameSchema
            );
            if (missingDep) {
              if (se.source === "vault_archive") {
                archiveSwapReadyCount = Math.max(0, archiveSwapReadyCount - 1);
              }
              const trulyMissingFromBlueprint = findUnsatisfiedSuiteDependency(
                se.groupedMods,
                allEquippedIndex,
                knownTitleByKey,
                activeGameSchema
              );
              se.bucket = "blocking";
              se.source = "awaiting_patch";
              if (trulyMissingFromBlueprint) {
                se.issueKind = "dependency";
                se.reasonLabel = `${t(
                  "badge_missing_dep",
                  "Missing Dependency"
                )}: ${trulyMissingFromBlueprint}`;
                const depTarget = resolveMissingDepTarget(
                  trulyMissingFromBlueprint
                );
                const existingTargets = se.missingDepTargets || [];
                if (
                  !existingTargets.some(
                    (dt) =>
                      dt.name.toLowerCase() === depTarget.name.toLowerCase()
                  )
                ) {
                  se.missingDepTargets = [...existingTargets, depTarget];
                }
              } else {
                se.issueKind = "version";
                se.reasonLabel = `${t(
                  "patch_sim_awaiting_patch",
                  "Awaiting {Mason} Update"
                )}: ${missingDep}`;
              }
              changed = true;
            }
          }

          if (syncCoupledSuites()) changed = true;
          if (!changed) break;
        }

        // Pass 2B: Fixed-point Pending-Update Dependency Cascade (ready artifacts depending on update_ready artifacts)
        for (let pass = 0; pass < 25; pass++) {
          let changed = false;
          const strictlyReadyPool: any[] = [];
          for (let i = 0; i < allSuiteEntries.length; i++) {
            const se = allSuiteEntries[i];
            if (se.bucket === "ready") {
              for (let j = 0; j < se.groupedMods.length; j++) {
                strictlyReadyPool.push(se.groupedMods[j]);
              }
            }
          }
          const strictlyReadyIndex = buildActiveDependencyIndex(strictlyReadyPool);

          for (let i = 0; i < suitesWithDeps.length; i++) {
            const se = suitesWithDeps[i];
            if (se.bucket !== "ready") continue;
            const pendingDep = findUnsatisfiedSuiteDependency(
              se.groupedMods,
              strictlyReadyIndex,
              knownTitleByKey,
              activeGameSchema
            );
            if (pendingDep) {
              se.bucket = "update_ready";
              se.source = "dep_update_pending";
              se.issueKind = "dependency";
              se.reasonLabel = `${t(
                "patch_sim_dep_needs_update",
                "Requires Pending Update"
              )}: ${pendingDep}`;
              changed = true;
            }
          }

          if (syncCoupledSuites()) changed = true;
          if (!changed) break;
        }
      }

      const blockingMods: PatchEvaluatedMod[] = [];
      const updatableMods: PatchEvaluatedMod[] = [];
      const directUpdateMods: PatchEvaluatedMod[] = [];
      const depUpdateMods: PatchEvaluatedMod[] = [];
      const autoSwapMods: PatchEvaluatedMod[] = [];
      const readyMods: PatchEvaluatedMod[] = [];

      for (let i = 0; i < allSuiteEntries.length; i++) {
        const entry = allSuiteEntries[i];
        if (entry.bucket === "blocking") {
          blockingMods.push(entry);
        } else if (entry.bucket === "update_ready") {
          updatableMods.push(entry);
          if (entry.source === "vault_archive") {
            autoSwapMods.push(entry);
          } else if (entry.source === "dep_update_pending") {
            depUpdateMods.push(entry);
          } else {
            directUpdateMods.push(entry);
          }
        } else {
          readyMods.push(entry);
        }
      }

      const totalMods =
        blockingMods.length + updatableMods.length + readyMods.length;
      const rawPct =
        totalMods > 0 ? Math.round((readyMods.length / totalMods) * 100) : 100;
      const readinessPercent =
        totalMods === 0 || readyMods.length === totalMods
          ? 100
          : readyMods.length === 0
            ? 0
            : Math.min(99, Math.max(1, rawPct));

      const verdict: BlueprintPatchReport["verdict"] =
        totalMods === 0
          ? "empty"
          : blockingMods.length > 0
            ? "hold"
            : updatableMods.length > 0
              ? "updates_ready"
              : "safe";

      return {
        blueprintName: ps.name,
        isEquipped,
        isPinned,
        blueprintObj: ps,
        totalMods,
        blockingMods,
        updatableMods,
        directUpdateMods,
        depUpdateMods,
        autoSwapMods,
        readyMods,
        archiveSwapReadyCount,
        readinessPercent,
        verdict,
      };
    });

    cache.lastReportsCache = {
      playSets: effectivePlaySets,
      activeSetName: effectiveActiveSetName,
      pinnedKey,
      modList: effectiveModList,
      activeGameSchema,
      networkUpdates,
      targetVersion,
      ownedDLC,
      maskedDLC,
      poolItems,
      versionRelation,
      isPatchDetected,
      defconLevel,
      cloudTick,
      result: computedReports,
    };

    return computedReports;
  }, [
    skip,
    deferredReady,
    opts?.deferInitial,
    effectivePlaySets,
    effectiveActiveSetName,
    pinnedKey,
    effectiveModList,
    activeGameSchema,
    networkUpdates,
    targetVersion,
    ownedDLC,
    maskedDLC,
    poolItems,
    archivedByRelPath,
    versionRelation,
    isPatchDetected,
    defconLevel,
    wsKey,
    cloudTick,
    t,
  ]);

  const sortedBlueprintReports = useMemo(() => {
    return [...blueprintReports].sort((a, b) => {
      if (a.isEquipped !== b.isEquipped) return a.isEquipped ? -1 : 1;
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return a.blueprintName.localeCompare(b.blueprintName);
    });
  }, [blueprintReports]);

  const activeBlueprintReport = useMemo(() => {
    return (
      sortedBlueprintReports.find((r) => r.isEquipped) ||
      sortedBlueprintReports[0] ||
      null
    );
  }, [sortedBlueprintReports]);

  const hasPrePatchBackup = useMemo(() => {
    return Array.isArray(backupList) && backupList.length > 0;
  }, [backupList]);

  const versionDropdownOptions = useMemo(() => {
    return availableVersions.map((ver, idx) => {
      const isCurrent =
        Boolean(cleanCurrentVersion) && compareVersions(ver, cleanCurrentVersion) === 0;
      const isLatest = idx === 0;
      let suffix = "";
      if (isCurrent && isLatest) {
        suffix = ` (${t("current", "Current")})`;
      } else if (isCurrent) {
        suffix = ` (${t("patch_sim_installed_tag", "Installed")})`;
      } else if (isLatest) {
        suffix = ` (${t("patch_sim_latest_tag", "Latest Patch")})`;
      }
      return {
        id: ver,
        value: ver,
        label: `v${ver}${suffix}`,
      };
    });
  }, [availableVersions, cleanCurrentVersion, t]);

  return {
    availableVersions,
    versionDropdownOptions,
    currentVersion: cleanCurrentVersion,
    latestKnownVersion,
    isUpdateBehindLatest,
    targetVersion,
    setTargetVersion,
    versionRelation,
    blueprintReports: sortedBlueprintReports,
    activeBlueprintReport,
    hasPrePatchBackup,
    backupCount: Array.isArray(backupList) ? backupList.length : 0,
    shelterActive,
    defconLevel,
    isPatchDetected,
    isCompanionSynced: !isDesktop() && companionSnapshots.length > 0,
  };
}

export function clonePatchReadyBlueprint(
  report: BlueprintPatchReport,
  targetVersion: string,
  activeGameSchema: any,
  t: (key: string, fallback?: string) => string
): { newName: string; keptCount: number; skippedCount: number } | null {
  if (!report || !report.blueprintObj) return null;
  const store = useStore.getState();
  const currentPlaySets = Array.isArray(store.playSets) ? store.playSets : [];

  const excludedExact = new Set<string>();
  const excludedNormalized = new Set<string>();
  const excludedHashes = new Set<string>();
  const knownTitleByKey = new Map<string, string>();

  const markModObjectExcluded = (gm: any) => {
    if (!gm) return;
    const orig = String(gm?._originalSetName || "").trim();
    const nm = String(gm?.name || "").trim();
    if (orig) {
      excludedExact.add(orig);
      excludedNormalized.add(
        stripPriorityTierPrefix(orig, activeGameSchema)
          .toLowerCase()
          .replace(/\\/g, "/")
      );
    }
    if (nm) {
      excludedExact.add(nm);
      excludedNormalized.add(
        stripPriorityTierPrefix(nm, activeGameSchema)
          .toLowerCase()
          .replace(/\\/g, "/")
      );
    }
    if (gm?.hash && !isWildcardVersion(gm.hash)) {
      excludedHashes.add(String(gm.hash));
    }
  };

  const suiteByModNameNorm = new Map<string, PatchEvaluatedMod>();
  for (const entry of [
    ...report.blockingMods,
    ...report.updatableMods,
    ...report.readyMods,
  ]) {
    registerSuiteInTitleLookup(entry.title, entry.groupedMods || [], knownTitleByKey);
    for (const gm of entry.groupedMods || []) {
      const origNorm = stripPriorityTierPrefix(
        String(gm?._originalSetName || gm?.name || ""),
        activeGameSchema
      )
        .toLowerCase()
        .replace(/\\/g, "/");
      if (origNorm) suiteByModNameNorm.set(origNorm, entry);
      const nameNorm = stripPriorityTierPrefix(
        String(gm?.name || ""),
        activeGameSchema
      )
        .toLowerCase()
        .replace(/\\/g, "/");
      if (nameNorm) suiteByModNameNorm.set(nameNorm, entry);
    }
  }

  const extraOmittedSuites = new Set<string>();
  const excludeModAndSuite = (gm: any) => {
    if (!gm) return;
    const normKey = stripPriorityTierPrefix(
      String(gm?._originalSetName || gm?.name || ""),
      activeGameSchema
    )
      .toLowerCase()
      .replace(/\\/g, "/");
    const matchedSuite = normKey ? suiteByModNameNorm.get(normKey) : undefined;
    if (matchedSuite) {
      extraOmittedSuites.add(matchedSuite.key);
      for (const member of matchedSuite.groupedMods || []) {
        markModObjectExcluded(member);
      }
    } else {
      if (normKey) extraOmittedSuites.add(`raw:${normKey}`);
      markModObjectExcluded(gm);
    }
  };

  const requiresUpdateMods = [...report.blockingMods, ...report.updatableMods];
  for (const entry of requiresUpdateMods) {
    for (const gm of entry.groupedMods || []) {
      markModObjectExcluded(gm);
    }
  }

  const isModNameExcluded = (rawName: string): boolean => {
    const trimmed = String(rawName || "").trim();
    if (!trimmed) return true;
    if (excludedExact.has(trimmed)) return true;
    const norm = stripPriorityTierPrefix(trimmed, activeGameSchema)
      .toLowerCase()
      .replace(/\\/g, "/");
    return excludedNormalized.has(norm);
  };

  const sourceSet = report.blueprintObj;
  const rawMods = Array.isArray(sourceSet.mods) ? sourceSet.mods : [];

  const filterRawList = (list: any[]) =>
    list.filter((rawEntry: any) => {
      const modName =
        typeof rawEntry === "string"
          ? rawEntry
          : String(rawEntry?.name || rawEntry?.path || "");
      if (isModNameExcluded(modName)) return false;
      const rawHash =
        typeof rawEntry === "object" && rawEntry?.hash
          ? String(rawEntry.hash)
          : "";
      if (rawHash && excludedHashes.has(rawHash)) return false;
      return true;
    });

  let candidateRawMods = deduplicateBlueprintArtifacts(
    filterRawList(rawMods),
    activeGameSchema
  );

  const bpIgnored = [
    ...(Array.isArray(store.ignoredGlobal) ? store.ignoredGlobal : []),
    ...(Array.isArray(sourceSet?.ignoredConflicts)
      ? sourceSet.ignoredConflicts
      : []),
  ];

  // Multi-pass fixed-point atomic logic & conflict verification so zero broken links or stray alerts survive into the clone
  for (let pass = 0; pass < 25; pass++) {
    const candidateResolved = resolveActiveBlueprintMods(
      candidateRawMods,
      store.modList || [],
      activeGameSchema,
      store.networkUpdates
    );
    if (candidateResolved.length === 0) break;

    const poolIndex = buildActiveDependencyIndex(candidateResolved);
    const activeRefSet = new Set(candidateResolved);
    let newlyExcludedInPass = 0;

    for (let i = 0; i < candidateResolved.length; i++) {
      const m = candidateResolved[i];
      if (!m || m.isFallback) {
        excludeModAndSuite(m);
        newlyExcludedInPass += 1;
        continue;
      }

      const localStat = String(m.status || "").toLowerCase();
      if (
        localStat === "broken" ||
        localStat === "corrupted" ||
        localStat === "obsolete"
      ) {
        excludeModAndSuite(m);
        newlyExcludedInPass += 1;
        continue;
      }

      const missingDep = findUnsatisfiedSuiteDependency(
        [m],
        poolIndex,
        knownTitleByKey,
        activeGameSchema
      );
      if (missingDep) {
        excludeModAndSuite(m);
        newlyExcludedInPass += 1;
        continue;
      }

      const evalRes = evaluateModIssues(m, {
        activeMods: candidateResolved,
        selectedVersion: targetVersion,
        ownedDLC: store.ownedDLC || [],
        maskedDLC: store.maskedDLC || [],
        t,
        activeGameSchema,
      });
      if (evalRes && evalRes._alert_type === "red") {
        excludeModAndSuite(m);
        newlyExcludedInPass += 1;
        continue;
      }
    }

    const candidateConflicts = resolveBlueprintConflicts(
      report.blueprintName,
      candidateResolved,
      bpIgnored,
      t,
      activeGameSchema
    );
    for (const c of candidateConflicts) {
      if (!activeRefSet.has(c.modA) || !activeRefSet.has(c.modB)) continue;
      if (c.modA?.isFallback || c.modB?.isFallback) continue;
      if (Number(c.conflict?.severity_rank) === 4) {
        excludeModAndSuite(c.modB);
        newlyExcludedInPass += 1;
      }
    }

    if (newlyExcludedInPass === 0) break;

    candidateRawMods = deduplicateBlueprintArtifacts(
      filterRawList(candidateRawMods),
      activeGameSchema
    );
  }

  const dedupedMods = candidateRawMods;

  const filterRecord = (rec: any) => {
    if (!rec || typeof rec !== "object") return undefined;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (!isModNameExcluded(k)) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const cleanBaseTitle =
    report.blueprintName
      .replace(/\s*\((?:v\d[\w.-]*|Ready)\)(?:\s*#\d+)?\s*$/i, "")
      .trim() || report.blueprintName;

  const cleanVer = cleanVersionLabel(targetVersion);
  const desiredName =
    cleanVer && !isWildcardVersion(cleanVer)
      ? `${cleanBaseTitle} (v${cleanVer})`
      : `${cleanBaseTitle} (${t("patch_sim_ready_label", "Ready")})`;

  const existingLower = new Set(
    currentPlaySets.map((s: any) => String(s?.name || "").toLowerCase())
  );
  let finalName = desiredName;
  let suffix = 2;
  while (existingLower.has(finalName.toLowerCase())) {
    finalName = `${desiredName} #${suffix}`;
    suffix += 1;
  }

  const newSet = {
    name: finalName,
    mods: dedupedMods,
    modHashes: filterRecord(sourceSet.modHashes),
    modMeta: filterRecord(sourceSet.modMeta),
    modTiers: filterRecord(sourceSet.modTiers),
    loadOrder: Array.isArray(sourceSet.loadOrder)
      ? sourceSet.loadOrder.filter((k: any) => !isModNameExcluded(String(k || "")))
      : undefined,
    loadRules: Array.isArray(sourceSet.loadRules)
      ? sourceSet.loadRules
          .filter(
            (r: any) =>
              !isModNameExcluded(String(r?.mod || r?.source || "")) &&
              !isModNameExcluded(String(r?.target || r?.after || r?.before || ""))
          )
          .map((r: any) => ({ ...r }))
      : undefined,
    ignoredConflicts: Array.isArray(sourceSet.ignoredConflicts)
      ? sourceSet.ignoredConflicts.filter((pairStr: any) => {
          const parts = String(pairStr || "").split(/\s+vs\s+/i);
          if (parts.length === 2) {
            return !isModNameExcluded(parts[0]) && !isModNameExcluded(parts[1]);
          }
          return true;
        })
      : undefined,
  };

  store.setPlaySets([...currentPlaySets, newSet]);

  const skippedCount = requiresUpdateMods.length + extraOmittedSuites.size;
  const keptCount = Math.max(0, report.readyMods.length - extraOmittedSuites.size);
  store.pushStatus(
    t(
      "patch_sim_clone_toast",
      "Created \"{0}\" with {1} ready {mods} (omitted {2} requiring updates or missing dependencies)."
    )
      .replace("{0}", finalName)
      .replace("{1}", String(keptCount))
      .replace("{2}", String(skippedCount)),
    "success"
  );

  return {
    newName: finalName,
    keptCount,
    skippedCount,
  };
}

