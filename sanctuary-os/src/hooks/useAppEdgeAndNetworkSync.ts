import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { supabase } from "../supabase";
import { listen } from "@tauri-apps/api/event";
import { ModData } from "../shared";
import { isDesktop } from "../utils/envUtils";
import { invalidateCloudSyncCache } from "../utils/cloudSyncGuard";

export function useAppEdgeAndNetworkSync({
  insertingHashes,
  t,
  setModList,
  vaultPath,
  setLabQueue,
  setNetworkUpdates,
  setDnaMatchQueue,
  setEdgeOverrideQueue,
  runRadarSweepRef,
  setMalwareAlertRef,
}: any) {
  const ignoredHashesRef = useRef<Set<string>>(new Set());
  const networkCheckIdRef = useRef<number>(0);
  useEffect(() => {
    let unlistenEdge: (() => void) | null = null;
    let unlistenMalware: (() => void) | null = null;
    let unlistenCloudSessionClean: (() => void) | null = null;
    let cancelled = false;
    if (isDesktop()) {
      listen("edge_override_detected", async (event: any) => {
        if (cancelled) return;
          try {
            const payload = event.payload || {};
            const data = payload.override_json ? JSON.parse(payload.override_json) : {};
            let embeddedManifest: any = null;
            if (payload.manifest_json) {
              try {
                embeddedManifest = JSON.parse(payload.manifest_json);
              } catch {}
            } else if (data.last_fetched_metadata) {
              try {
                embeddedManifest = JSON.parse(data.last_fetched_metadata);
              } catch {}
            } else if (data.artifact || data.atomic_logic) {
              embeddedManifest = data;
            }

            const extractedHashes: string[] = Array.isArray(payload.extracted_hashes)
              ? payload.extracted_hashes.filter(Boolean)
              : [];
            const targetHash =
              data.target_hash ||
              embeddedManifest?.payload?.sha256 ||
              extractedHashes[0] ||
              "";
            const archiveHashes: string[] = Array.isArray(data.archive_hashes)
              ? data.archive_hashes.filter(Boolean)
              : [];
            const moduleHashes: string[] = Array.isArray(embeddedManifest?.modules)
              ? embeddedManifest.modules.map((m: any) => m?.sha256).filter(Boolean)
              : [];
            const currentHashes: string[] = Array.isArray(embeddedManifest?.current_hashes)
              ? embeddedManifest.current_hashes.filter(Boolean)
              : [];
            const previousHashes: string[] = Array.isArray(embeddedManifest?.previous_hashes)
              ? embeddedManifest.previous_hashes.filter(Boolean)
              : [];
            const flavorHashes: string[] = Array.isArray(embeddedManifest?.atomic_logic?.flavors)
              ? embeddedManifest.atomic_logic.flavors.filter(Boolean)
              : [];

            const allCandidateHashes = Array.from(
              new Set(
                [
                  targetHash,
                  ...extractedHashes,
                  ...archiveHashes,
                  ...moduleHashes,
                  ...currentHashes,
                  ...previousHashes,
                  ...flavorHashes,
                ].filter(Boolean),
              ),
            );
            const lowerCandidateSet = new Set(allCandidateHashes.map((h) => String(h).toLowerCase()));

            const currentMods = useStore.getState().modList || [];
            const artifactId =
              data.artifact_id ||
              embeddedManifest?.artifact?.id ||
              embeddedManifest?.artifact?.name ||
              targetHash ||
              "edge_artifact";
            const normSlug = (s: string) =>
              String(s || "")
                .split(/[\\/]/)
                .pop()
                ?.replace(/\.[^/.]+$/, "")
                .replace(/[^a-z0-9]/gi, "")
                .toLowerCase() || "";
            const targetSlug = normSlug(embeddedManifest?.artifact?.name || artifactId);

            const matchedMods = currentMods.filter((m: any) => {
              const mh = String(m.hash || "").toLowerCase();
              if (mh && lowerCandidateSet.has(mh)) return true;
              if (Array.isArray(m.flavors)) {
                if (m.flavors.some((f: any) => f.hash && lowerCandidateSet.has(String(f.hash).toLowerCase()))) {
                  return true;
                }
              }
              if (allCandidateHashes.length === 0 && targetSlug && !m.isVirtual) {
                return normSlug(m.name) === targetSlug || normSlug(m.displayName) === targetSlug;
              }
              return false;
            });

            matchedMods.forEach((mm: any) => {
              if (mm.hash) allCandidateHashes.push(mm.hash);
              if (Array.isArray(mm.flavors)) {
                mm.flavors.forEach((f: any) => {
                  if (f.hash) allCandidateHashes.push(f.hash);
                });
              }
            });

            const uniqueFamilyHashes = Array.from(new Set(allCandidateHashes.filter(Boolean)));
            const resolvedHash = matchedMods[0]?.hash || targetHash || uniqueFamilyHashes[0] || "";

            // Only require manual intervention if Rust flagged a conflicting URL on an existing artifact
            if (payload.auto_accepted === false) {
              setEdgeOverrideQueue((prev: any[]) => [...prev, payload]);
              setDnaMatchQueue((prev: any[]) => {
                const isDuplicate = prev.some(
                  (m) => m.reason === "EDGE_OVERRIDE" && m.override_json === payload.override_json,
                );
                if (isDuplicate) return prev;
                return [
                  ...prev,
                  {
                    ...payload,
                    reason: "EDGE_OVERRIDE",
                    hash: resolvedHash,
                    matched_mod_name:
                      matchedMods[0]?.displayName ||
                      matchedMods[0]?.name ||
                      embeddedManifest?.artifact?.name ||
                      artifactId,
                  },
                ];
              });
              return;
            }

            // One-time drag & drop auto-registration: apply metadata, lineage, and edge logic immediately
            const edgeUrl = (data.manifest_url || embeddedManifest?.manifest_url || "").trim();
            const masonId = data.mason_id || embeddedManifest?.artifact?.author || "Unknown";
            const gameId =
              data.game_id ||
              embeddedManifest?.artifact?.game_id ||
              useStore.getState().activeGameSchema?.id ||
              useStore.getState().activeWorkspaceId ||
              "default_workspace";
            const activeVaultPath = useStore.getState().vaultPath || vaultPath;

            let fetchedManifest: any = embeddedManifest;
            if (activeVaultPath && (edgeUrl || artifactId)) {
              try {
                await invoke("register_edge_override", {
                  vaultPath: activeVaultPath,
                  overrideData: {
                    artifact_id: artifactId,
                    mason_id: masonId,
                    game_id: gameId,
                    manifest_url: edgeUrl,
                    target_hash: resolvedHash,
                    archive_hashes: uniqueFamilyHashes.filter((h) => h !== resolvedHash),
                    last_fetched_hash: resolvedHash || undefined,
                    last_fetched_metadata: embeddedManifest ? JSON.stringify(embeddedManifest) : undefined,
                  },
                });
                if (
                  edgeUrl &&
                  /^https?:\/\//i.test(edgeUrl) &&
                  !edgeUrl.includes("your-domain.com") &&
                  !edgeUrl.includes("example.com") &&
                  navigator.onLine
                ) {
                  const synced = await invoke<any>("fetch_and_sync_edge_manifest", {
                    vaultPath: activeVaultPath,
                    artifactId,
                  });
                  if (synced && synced.artifact) fetchedManifest = synced;
                }
              } catch {}
            }

            if (fetchedManifest) {
              if (fetchedManifest.payload?.sha256) uniqueFamilyHashes.push(fetchedManifest.payload.sha256);
              if (Array.isArray(fetchedManifest.modules)) {
                fetchedManifest.modules.forEach((m: any) => {
                  if (m?.sha256) uniqueFamilyHashes.push(m.sha256);
                });
              }
              if (Array.isArray(fetchedManifest.current_hashes)) {
                fetchedManifest.current_hashes.forEach((h: string) => {
                  if (h) uniqueFamilyHashes.push(h);
                });
              }
              if (Array.isArray(fetchedManifest.previous_hashes)) {
                fetchedManifest.previous_hashes.forEach((h: string) => {
                  if (h) uniqueFamilyHashes.push(h);
                });
              }
            }

            const finalHashes = Array.from(new Set(uniqueFamilyHashes.filter(Boolean)));
            const localOvrMap = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
            const edgeLogicMap = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");

            const activeCurrentHashes = Array.from(
              new Set(
                [
                  ...extractedHashes,
                  ...(Array.isArray(fetchedManifest?.current_hashes) ? fetchedManifest.current_hashes : []),
                  ...(Array.isArray(fetchedManifest?.modules)
                    ? fetchedManifest.modules.map((m: any) => m?.sha256).filter(Boolean)
                    : []),
                  fetchedManifest?.payload?.sha256 || targetHash,
                ].filter(Boolean),
              ),
            );
            const isMultiModule = activeCurrentHashes.length > 1;

            for (const h of finalHashes) {
              const existingOvr = localOvrMap[h] || {};
              const isUserDossier = !!existingOvr.is_user_dossier;
              const modDisplayName = fetchedManifest?.artifact?.name || data.artifact_id || undefined;
              localOvrMap[h] = {
                ...existingOvr,
                ...(isMultiModule
                  ? { parentName: modDisplayName }
                  : {
                      displayName: isUserDossier
                        ? existingOvr.displayName
                        : modDisplayName || existingOvr.displayName,
                    }),
                author: isUserDossier
                  ? existingOvr.author
                  : fetchedManifest?.artifact?.author || masonId || existingOvr.author,
                version: isUserDossier
                  ? existingOvr.version
                  : fetchedManifest?.artifact?.version || existingOvr.version,
                url: isUserDossier
                  ? existingOvr.url
                  : fetchedManifest?.payload?.download_url || existingOvr.url || edgeUrl || undefined,
                manifest_url: existingOvr.manifest_url || edgeUrl || undefined,
                requiredDLC: isUserDossier
                  ? existingOvr.requiredDLC
                  : fetchedManifest?.atomic_logic?.required_dlc || existingOvr.requiredDLC,
                compatible_versions: isUserDossier
                  ? existingOvr.compatible_versions
                  : fetchedManifest?.artifact?.game_version
                    ? [fetchedManifest.artifact.game_version]
                    : existingOvr.compatible_versions,
              };

              edgeLogicMap[h] = {
                ...(edgeLogicMap[h] || {}),
                ...(fetchedManifest?.atomic_logic || {}),
                manifest_url: edgeUrl || edgeLogicMap[h]?.manifest_url,
                artifact_id: fetchedManifest?.artifact?.id || artifactId,
                name: fetchedManifest?.artifact?.name || data.artifact_id || edgeLogicMap[h]?.name,
                author: fetchedManifest?.artifact?.author || masonId || edgeLogicMap[h]?.author,
                version: fetchedManifest?.artifact?.version || edgeLogicMap[h]?.version,
                game_version: fetchedManifest?.artifact?.game_version || edgeLogicMap[h]?.game_version,
                download_url: fetchedManifest?.payload?.download_url || edgeLogicMap[h]?.download_url,
                sha256: fetchedManifest?.payload?.sha256 || resolvedHash,
                current_hashes: activeCurrentHashes,
                previous_hashes: Array.isArray(fetchedManifest?.previous_hashes)
                  ? fetchedManifest.previous_hashes
                  : [],
                modules: Array.isArray(fetchedManifest?.modules) ? fetchedManifest.modules : [],
                changelog: fetchedManifest?.changelog || edgeLogicMap[h]?.changelog || [],
              };
            }

            localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOvrMap));
            localStorage.setItem("sanctuary_edge_logic", JSON.stringify(edgeLogicMap));
            runRadarSweepRef.current?.(true);
          } catch (e) {
            console.error("Failed to process edge_override_detected payload", e);
          }
      }).then((unlisten) => {
        if (cancelled) unlisten();
        else unlistenEdge = unlisten;
      });

      listen("malware_detected", async (event: any) => {
        if (cancelled) return;
        const debounceKey = `${event.payload.hash}`;
        if (!event.payload.hash || insertingHashes.current.has(debounceKey)) return;
        insertingHashes.current.add(debounceKey);
        setTimeout(() => insertingHashes.current.delete(debounceKey), 250);

        setMalwareAlertRef.current?.((prev: any[]) => {
          if (!prev) return [event.payload];
          const existingIdx = prev.findIndex((m) => {
            const mName = (m.name || m.path || "").split(/[/\\]/).pop()?.toLowerCase();
            const pName = (event.payload.name || event.payload.path || "").split(/[/\\]/).pop()?.toLowerCase();
            return event.payload.hash
              ? m.hash === event.payload.hash && (!mName || !pName || mName === pName)
              : m.path === event.payload.path;
          });
          if (existingIdx !== -1) {
            const existing = prev[existingIdx];
            if (event.payload.volatile_original_path && !existing.volatile_original_path) {
              const next = [...prev];
              next[existingIdx] = {
                ...existing,
                volatile_original_path: event.payload.volatile_original_path,
              };
              return next;
            }
            return prev;
          }
          return [...prev, event.payload];
        });

        if (localStorage.getItem("sanctuary_share_malware_reports") === "true") {
          try {
            const { submitThreatManifestToSpoke } = await import("../supabase");
            const { error } = await submitThreatManifestToSpoke(event.payload, {
              isAuto: true,
              defaultSignature: "Malware DNA Match",
            });
            if (error) console.error("Malware Report Insert Error (listen):", error);
          } catch (e) {
            console.error("Malware Report Insert Exception (listen):", e);
          }
        }
      }).then((unlisten) => {
        if (cancelled) unlisten();
        else unlistenMalware = unlisten;
      });

      listen("sanctuary-cloud-session-mods-cleaned", () => {
        if (cancelled) return;
        invalidateCloudSyncCache();
        useStore.getState().pushStatus(
          t(
            "cloud_guard_session_cleaned_toast",
            "Game closed — {Mods} symlinks cleaned so cloud sync stays clear."
          ),
          "success"
        );
      }).then((unlisten) => {
        if (cancelled) unlisten();
        else unlistenCloudSessionClean = unlisten;
      });
    }

    return () => {
      cancelled = true;
      if (unlistenEdge) unlistenEdge();
      if (unlistenMalware) unlistenMalware();
      if (unlistenCloudSessionClean) unlistenCloudSessionClean();
    };
  }, []);

  async function fetchCloudLabQueue() {
    try {
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;
      const { data, error } = await supabase
        .from("mod_versions")
        .select(`dna_hash, mods!inner ( name, status )`)
        .eq("mods.status", "under_review");
      if (error) throw error;
      if (data) {
        const cloudQueue = data.map((dbMod: any) => ({
          name: dbMod.mods.name,
          hash: dbMod.dna_hash,
          status: t("status_dd_review", "Under Review"),
          color: "var(--warning)",
          displayName: dbMod.mods.name,
          isSynced: true,
        }));
        setLabQueue(cloudQueue);
      }
    } catch (err) {
      console.error("Failed to fetch cloud lab queue", err);
    }
  }

  async function checkNetworkUpdates(currentModList: ModData[], isManualSweep: boolean = false) {
    const currentCheckId = ++networkCheckIdRef.current;
    try {
      const syncedMods = currentModList.filter(
        (m) => !m.isVirtual,
      );
      if (syncedMods.length === 0) return;
      const broken: any[] = [];
      const obsolete: any[] = [];
      const updated: any[] = [];
      let cloudData: any[] = [];
      let hasError = false;
      const BATCH_SIZE = 120;
      const cloudEligibleMods = syncedMods.filter(
        (m: any) =>
          m.isSynced &&
          m.dbId &&
          Number(m.compliance_tier || 0) === 0 &&
          String(m.status || "").toLowerCase() !== "unverified",
      );
      const allDbIds = [...new Set(cloudEligibleMods.map((m) => m.dbId).filter(Boolean))];
      const queryPromises: Promise<void>[] = [];

      for (let i = 0; i < allDbIds.length; i += BATCH_SIZE) {
        const batchIds = allDbIds.slice(i, i + BATCH_SIZE);
        queryPromises.push(
          Promise.resolve(
            supabase
              .from("mods")
              .select("id, name, status, compliance_tier, folder_structure, mod_versions(version_label, dna_hash, game_version, download_url)")
              .in("id", batchIds)
              .eq("compliance_tier", 0)
              .order("created_at", { referencedTable: "mod_versions", ascending: false })
              .limit(1, { referencedTable: "mod_versions" })
          ).then(({ data, error }) => {
            if (error) { console.error(error); hasError = true; }
            if (data) cloudData.push(...data);
          })
        );
      }

      if (queryPromises.length > 0) {
        await Promise.all(queryPromises);
      }

      // --- DECENTRALIZED STATIC EDGE MANIFEST POLLING (V2 BATCHED) ---
      type EdgeBindingEntry = {
        bindingKey: string;
        manifestUrl: string;
        artifactId: string;
        hashes: Set<string>;
        masonId?: string;
        localHash?: string;
        localVersion?: string;
      };
      const edgeBindings = new Map<string, EdgeBindingEntry>();
      const hashToBindingKey = new Map<string, string>();
      let localOvrMap: Record<string, any> = {};
      let edgeLogicMap: Record<string, any> = {};
      try {
        localOvrMap = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      } catch (e) {}
      try {
        edgeLogicMap = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      } catch (e) {}

      const addEdgeBinding = (
        url: string | undefined,
        hash?: string,
        artifactId?: string,
        masonId?: string,
        localVersion?: string,
      ) => {
        if (!url) return;
        const cleanUrl = url.trim();
        if (
          !/^https:\/\//i.test(cleanUrl) ||
          cleanUrl.includes("your-domain.com") ||
          cleanUrl.includes("example.com")
        ) {
          return;
        }
        const cleanHash = hash ? String(hash).trim() : "";
        const hashLookupKey = cleanHash ? `${cleanUrl}::${cleanHash.toLowerCase()}` : "";
        const existingKeyForHash = hashLookupKey ? hashToBindingKey.get(hashLookupKey) : undefined;

        const normArtifactId = String(artifactId || cleanHash || cleanUrl).trim();
        const compositeKey = existingKeyForHash || `${cleanUrl}::${normArtifactId.toLowerCase()}`;

        if (!edgeBindings.has(compositeKey)) {
          edgeBindings.set(compositeKey, {
            bindingKey: compositeKey,
            manifestUrl: cleanUrl,
            artifactId: normArtifactId,
            hashes: new Set<string>(),
            masonId,
            localHash: cleanHash || undefined,
            localVersion: localVersion || undefined,
          });
        }
        const entry = edgeBindings.get(compositeKey)!;
        if (artifactId && (!entry.artifactId || entry.artifactId === entry.localHash)) {
          entry.artifactId = String(artifactId).trim();
        }
        if (masonId && !entry.masonId) entry.masonId = masonId;
        if (cleanHash) {
          entry.hashes.add(cleanHash);
          if (!entry.localHash) entry.localHash = cleanHash;
          hashToBindingKey.set(hashLookupKey, compositeKey);
        }
        if (localVersion && !entry.localVersion) {
          entry.localVersion = localVersion;
        }
      };

      const storeSnapshot = useStore.getState();
      const currentVaultPath = storeSnapshot.vaultPath || vaultPath;
      const activeGameId = String(
        storeSnapshot.activeWorkspaceId || storeSnapshot.activeGameSchema?.id || "",
      ).trim();
      let edgeLogicDirty = false;
      let localOvrDirty = false;

      if (isDesktop() && currentVaultPath) {
        try {
          const sqliteRows = await invoke<any[]>("get_all_edge_manifests", {
            vaultPath: currentVaultPath,
            gameId: activeGameId || null,
          });
          for (const row of sqliteRows || []) {
            addEdgeBinding(row.manifest_url, row.target_hash, row.artifact_id, row.mason_id);
            const rowHashes = [
              row.target_hash,
              ...(Array.isArray(row.archive_hashes) ? row.archive_hashes : []),
            ].filter(Boolean);
            rowHashes.forEach((ah: string) =>
              addEdgeBinding(row.manifest_url, ah, row.artifact_id, row.mason_id),
            );
            if (row.last_fetched_metadata) {
              try {
                const cachedManifest = JSON.parse(row.last_fetched_metadata);
                if (cachedManifest && cachedManifest.artifact) {
                  for (const rh of rowHashes) {
                    if (!edgeLogicMap[rh]) {
                      edgeLogicMap[rh] = {
                        ...(cachedManifest.atomic_logic || {}),
                        manifest_url: row.manifest_url,
                        artifact_id: cachedManifest.artifact?.id || row.artifact_id,
                        name: cachedManifest.artifact?.name || row.artifact_id,
                        author: cachedManifest.artifact?.author || row.mason_id,
                        version: cachedManifest.artifact?.version,
                        game_version: cachedManifest.artifact?.game_version,
                        download_url: cachedManifest.payload?.download_url,
                        sha256: cachedManifest.payload?.sha256 || row.target_hash,
                        current_hashes: Array.isArray(cachedManifest.current_hashes)
                          ? cachedManifest.current_hashes
                          : [],
                        previous_hashes: Array.isArray(cachedManifest.previous_hashes)
                          ? cachedManifest.previous_hashes
                          : [],
                        modules: Array.isArray(cachedManifest.modules) ? cachedManifest.modules : [],
                        changelog: cachedManifest.changelog || [],
                      };
                      edgeLogicDirty = true;
                    }
                  }
                }
              } catch {}
            }
          }
        } catch (e) {}
      }

      Object.entries(localOvrMap).forEach(([h, ovr]: [string, any]) => {
        if (ovr?.manifest_url) {
          addEdgeBinding(ovr.manifest_url, h, ovr.artifact_id || ovr.displayName, ovr.author, ovr.version);
        } else if (typeof ovr?.url === "string" && /\.json(\?.*)?$/i.test(ovr.url.trim())) {
          addEdgeBinding(ovr.url.trim(), h, ovr.artifact_id || ovr.displayName, ovr.author, ovr.version);
        }
      });
      Object.entries(edgeLogicMap).forEach(([h, logic]: [string, any]) => {
        if (logic?.manifest_url) {
          addEdgeBinding(logic.manifest_url, h, logic.artifact_id || logic.name, logic.author, logic.version);
        }
      });
      syncedMods.forEach((m: any) => {
        if (m.manifest_url && m.hash) {
          addEdgeBinding(m.manifest_url, m.hash, m.artifact_id || m.displayName || m.name, m.author, m.version);
        } else if (
          m.hash &&
          typeof m.url === "string" &&
          /\.json(\?.*)?$/i.test(m.url.trim()) &&
          (Number(m.compliance_tier || 0) >= 1 || !m.dbId || String(m.status || "").toLowerCase() === "unverified")
        ) {
          addEdgeBinding(m.url.trim(), m.hash, m.artifact_id || m.displayName || m.name, m.author, m.version);
        }
      });

      if (hasError && cloudData.length === 0 && edgeBindings.size === 0) {
        console.warn("Network check encountered errors and returned no data. Aborting to prevent wiping cached updates.");
        return;
      }

      let debugLog = "";

      if (edgeBindings.size > 0 && navigator.onLine && isDesktop() && currentVaultPath) {
        const bindingList = Array.from(edgeBindings.values());
        const urlBindingCounts = new Map<string, number>();
        for (const b of bindingList) {
          urlBindingCounts.set(b.manifestUrl, (urlBindingCounts.get(b.manifestUrl) || 0) + 1);
        }

        const targets = bindingList.map((b) => ({
          artifact_id: b.artifactId,
          manifest_url: b.manifestUrl,
          local_hash: b.localHash || Array.from(b.hashes)[0] || null,
          local_version: b.localVersion || null,
        }));

        try {
          const pollResults = await invoke<any[]>("poll_edge_manifests_batch", {
            vaultPath: currentVaultPath,
            gameId: activeGameId,
            targets,
            force: Boolean(isManualSweep),
          });

          const resultsByKey = new Map<string, any>();
          for (const item of pollResults || []) {
            if (item?.manifest_url && item?.artifact_id) {
              resultsByKey.set(
                `${String(item.manifest_url).trim()}::${String(item.artifact_id).trim().toLowerCase()}`,
                item,
              );
            }
          }

          for (let idx = 0; idx < bindingList.length; idx++) {
            const binding = bindingList[idx];
            const manifestUrl = binding.manifestUrl;
            const itemResult =
              resultsByKey.get(`${manifestUrl}::${binding.artifactId.toLowerCase()}`) ||
              pollResults?.[idx];
            const manifest = itemResult?.manifest;
            if (!manifest || !manifest.artifact) continue;

            const currentReleaseHashes = new Set<string>(
              [
                manifest.payload?.sha256,
                ...(Array.isArray(manifest.current_hashes) ? manifest.current_hashes : []),
                ...(Array.isArray(manifest.modules)
                  ? manifest.modules.map((m: any) => m?.sha256)
                  : []),
              ]
                .filter(Boolean)
                .map((h: any) => String(h).toLowerCase().trim()),
            );

            const previousLineageHashes = new Set<string>(
              (Array.isArray(manifest.previous_hashes) ? manifest.previous_hashes : [])
                .filter(Boolean)
                .map((h: any) => String(h).toLowerCase().trim()),
            );

            const allFamilyHashes = new Set<string>(
              [
                ...Array.from(binding.hashes),
                manifest.payload?.sha256,
                ...(Array.isArray(manifest.current_hashes) ? manifest.current_hashes : []),
                ...(Array.isArray(manifest.modules)
                  ? manifest.modules.map((m: any) => m?.sha256)
                  : []),
                ...(Array.isArray(manifest.previous_hashes) ? manifest.previous_hashes : []),
                ...(Array.isArray(manifest.atomic_logic?.flavors) ? manifest.atomic_logic.flavors : []),
              ].filter(Boolean),
            );

            const lowerFamilyHashes = new Set<string>(
              Array.from(allFamilyHashes).map((h) => h.toLowerCase()),
            );
            const isSharedUrl = (urlBindingCounts.get(manifestUrl) || 0) > 1;
            const matchedLocalMods = syncedMods.filter((m: any) => {
              const mHashLower = m.hash ? String(m.hash).toLowerCase() : "";
              if (mHashLower && lowerFamilyHashes.has(mHashLower)) return true;
              if (!isSharedUrl) {
                return (
                  m.manifest_url === manifestUrl ||
                  (m.hash && localOvrMap[m.hash]?.manifest_url === manifestUrl)
                );
              }
              const needle = String(manifest.artifact?.id || binding.artifactId || "").toLowerCase();
              const mNameLower = String(m.displayName || m.name || "").toLowerCase();
              return Boolean(needle && mNameLower && mNameLower === needle);
            });

            matchedLocalMods.forEach((m: any) => {
              if (m.hash) allFamilyHashes.add(m.hash);
            });

            const isMultiModule = currentReleaseHashes.size > 1 || matchedLocalMods.length > 1;

            for (const famHash of allFamilyHashes) {
              if (manifest.atomic_logic || manifest.artifact) {
                edgeLogicMap[famHash] = {
                  ...(edgeLogicMap[famHash] || {}),
                  ...(manifest.atomic_logic || {}),
                  manifest_url: manifestUrl,
                  artifact_id: manifest.artifact?.id || binding.artifactId,
                  name: manifest.artifact?.name || binding.artifactId,
                  author: manifest.artifact?.author || binding.masonId,
                  version: manifest.artifact?.version,
                  game_version: manifest.artifact?.game_version,
                  status:
                    manifest.artifact?.status ||
                    manifest.status ||
                    manifest.atomic_logic?.status,
                  download_url: manifest.payload?.download_url,
                  sha256: manifest.payload?.sha256,
                  current_hashes: Array.from(currentReleaseHashes),
                  previous_hashes: Array.from(previousLineageHashes),
                  modules: Array.isArray(manifest.modules) ? manifest.modules : [],
                  changelog: manifest.changelog || [],
                };
                edgeLogicDirty = true;
              }
              if (localOvrMap[famHash]) {
                localOvrMap[famHash] = {
                  ...localOvrMap[famHash],
                  ...(isMultiModule &&
                  manifest.artifact?.name &&
                  !localOvrMap[famHash]?.is_user_dossier &&
                  !localOvrMap[famHash]?.parentName
                    ? { parentName: manifest.artifact.name }
                    : {}),
                  manifest_url: localOvrMap[famHash].manifest_url || manifestUrl,
                  requiredDLC:
                    localOvrMap[famHash].is_user_dossier ||
                    localOvrMap[famHash].requiredDLC !== undefined
                      ? localOvrMap[famHash].requiredDLC
                      : manifest.atomic_logic?.required_dlc || localOvrMap[famHash].requiredDLC,
                };
                localOvrDirty = true;
              }
            }

            if (matchedLocalMods.length > 0) {
              const latestSha = String(manifest.payload?.sha256 || "").toLowerCase().trim();
              const cleanEdgeVer = String(manifest.artifact?.version || "").toLowerCase().replace(/^v/, "").trim();
              const edgeStatusRaw = String(
                manifest.artifact?.status ||
                  manifest.status ||
                  manifest.atomic_logic?.status ||
                  "",
              )
                .toLowerCase()
                .trim();

              for (const localMod of matchedLocalMods) {
                const localHash = String(localMod.hash || "").toLowerCase().trim();
                const cleanLocalVer = String(localMod.version || "").toLowerCase().replace(/^v/, "").trim();

                if (edgeStatusRaw === "broken" || edgeStatusRaw === "corrupted") {
                  if (!broken.some((b) => (b.hash && b.hash === localMod.hash) || b.name === localMod.name)) {
                    broken.push(localMod);
                  }
                } else if (edgeStatusRaw === "obsolete") {
                  if (!obsolete.some((o) => (o.hash && o.hash === localMod.hash) || o.name === localMod.name)) {
                    obsolete.push(localMod);
                  }
                }

                const isInCurrentRelease = Boolean(localHash && currentReleaseHashes.has(localHash));
                const isDeprecatedLineageHash = Boolean(localHash && previousLineageHashes.has(localHash));
                const hashDiffers = isDeprecatedLineageHash || Boolean(latestSha && localHash && !isInCurrentRelease && latestSha !== localHash);
                const versionDiffers = Boolean(
                  cleanEdgeVer &&
                  cleanLocalVer &&
                  cleanLocalVer !== "local" &&
                  cleanLocalVer !== ".local" &&
                  cleanEdgeVer !== cleanLocalVer &&
                  !isInCurrentRelease,
                );

                if (hashDiffers || versionDiffers) {
                  if (!updated.some((u) => u.hash === localMod.hash && u.name === localMod.name)) {
                    updated.push({
                      ...localMod,
                      newVersion: manifest.artifact?.version || "Update",
                      newGameVersion: manifest.artifact?.game_version,
                      download_url: manifest.payload?.download_url || manifestUrl,
                      edge_changelog: manifest.changelog || [],
                      is_edge_update: true,
                    });
                  }
                }
              }
            }
          }
        } catch (edgeErr) {
          console.warn("Edge manifest batch poll failed", edgeErr);
        }
      }

      if (edgeLogicDirty) {
        localStorage.setItem("sanctuary_edge_logic", JSON.stringify(edgeLogicMap));
      }
      if (localOvrDirty) {
        localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOvrMap));
      }
      // ---------------------------------------------------

      cloudData.forEach((cloudMod) => {
        const localMods = syncedMods.filter((m) => String(m.dbId) === String(cloudMod.id) || m.name === cloudMod.name);
        if (localMods.length === 0) return;

        if (cloudMod.status === "broken") broken.push(...localMods);
        else if (cloudMod.status === "obsolete") obsolete.push(...localMods);
        else {
          const latestData =
            cloudMod.mod_versions && cloudMod.mod_versions.length > 0
              ? cloudMod.mod_versions[0]
              : null;

          if (!latestData) return;

          const anyHashMatch = localMods.some(m => m.hash && latestData.dna_hash && m.hash.toLowerCase() === latestData.dna_hash.toLowerCase());
          const hashMismatch = latestData.dna_hash ? !anyHashMatch : false;

          const isRealVer = (v: any) =>
            Boolean(
              v &&
                !/^(v?\.?local|vv\.?local|local node|unknown|v\.?unknown)$/i.test(
                  String(v).trim()
                )
            );
          const primaryMod =
            localMods.find((m) => isRealVer(m.version)) || localMods[0];

          const cleanLocalVer = String(primaryMod.version || "")
            .toLowerCase()
            .replace(/^v\.?/, "")
            .trim();
          const cleanCloudVer = String(latestData.version_label || "")
            .toLowerCase()
            .replace(/^v\.?/, "")
            .trim();

          const hasBothVersions =
            isRealVer(primaryMod.version) && isRealVer(latestData.version_label);
          const isExactVersionMatch =
            hasBothVersions && cleanLocalVer === cleanCloudVer;
          const versionMismatch =
            hasBothVersions && cleanLocalVer !== cleanCloudVer;

          debugLog += `Mod: ${primaryMod.name} | anyHashMatch: ${anyHashMatch} | cloudHash: ${latestData.dna_hash} | hashMismatch: ${hashMismatch} | isExactVersionMatch: ${isExactVersionMatch}\n`;

          const needsUpdate = !isExactVersionMatch && (hashMismatch || versionMismatch);

          if (needsUpdate) {
            localMods.forEach(m => {
              updated.push({
                ...m,
                newVersion: latestData.version_label,
                newGameVersion: latestData.game_version,
                download_url: latestData.download_url
              });
            });
          }
        }
      });

      try {
        localStorage.setItem("network_updates_debug", debugLog);
      } catch (e) { }

      if (networkCheckIdRef.current !== currentCheckId) {
        console.warn("checkNetworkUpdates superseded by a newer sweep. Aborting stale state update.");
        return;
      }

      setNetworkUpdates({ broken, obsolete, updated });

      let bgLocalOvrMap: Record<string, any> = {};
      try {
        bgLocalOvrMap = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}") || {};
      } catch {}

      setModList((prevList: any[]) => {
        let changed = false;
        const applyUpdateToMod = (m: any) => {
          let needsUpdate = false;
          let newMod = { ...m };

          const localOvrEntry = m.hash
            ? bgLocalOvrMap[m.hash] || bgLocalOvrMap[String(m.hash).toLowerCase()]
            : undefined;
          const hasLocalStatusOvr = Boolean(
            localOvrEntry?.status && String(localOvrEntry.status).trim() !== ""
          );
          const edgeEntry = m.hash ? edgeLogicMap[m.hash] : undefined;
          const edgeStatus = String(edgeEntry?.status || "").toLowerCase().trim();

          if (!hasLocalStatusOvr) {
            if (broken.some(b => (b.hash && b.hash === m.hash) || b.name === m.name)) {
              if (newMod.status !== 'broken') {
                newMod.status = 'broken';
                needsUpdate = true;
              }
            } else if (obsolete.some(b => (b.hash && b.hash === m.hash) || b.name === m.name)) {
              if (newMod.status !== 'obsolete') {
                newMod.status = 'obsolete';
                needsUpdate = true;
              }
            } else if (edgeStatus === 'unstable' && newMod.status !== 'unstable') {
              newMod.status = 'unstable';
              needsUpdate = true;
            }
          }

          if (edgeEntry) {
            if (
              localOvrEntry?.compatible_versions === undefined &&
              edgeEntry.game_version &&
              (!Array.isArray(newMod.compatible_versions) || newMod.compatible_versions.length === 0)
            ) {
              newMod.compatible_versions = [edgeEntry.game_version];
              needsUpdate = true;
            }
            if (
              localOvrEntry?.requiredDLC === undefined &&
              Array.isArray(edgeEntry.required_dlc) &&
              edgeEntry.required_dlc.length > 0 &&
              (!Array.isArray(newMod.requiredDLC) || newMod.requiredDLC.length === 0)
            ) {
              newMod.requiredDLC = edgeEntry.required_dlc;
              needsUpdate = true;
            }
            if (
              localOvrEntry?.dependencies === undefined &&
              localOvrEntry?.requirements === undefined &&
              Array.isArray(edgeEntry.dependencies) &&
              edgeEntry.dependencies.length > 0 &&
              (!Array.isArray(newMod.dependencies) || newMod.dependencies.length === 0)
            ) {
              newMod.dependencies = edgeEntry.dependencies;
              newMod.requirements = edgeEntry.dependencies;
              needsUpdate = true;
            }
          }

          const update = updated.find(u => (u.hash && u.hash === m.hash) || u.name === m.name);
          if (update) {
            if (!newMod.hasUpdate || newMod.newVersion !== update.newVersion) {
              newMod.hasUpdate = true;
              newMod.newVersion = update.newVersion;
              newMod.newGameVersion = update.newGameVersion;
              newMod.download_url = update.download_url;
              needsUpdate = true;
            }
          } else if (newMod.hasUpdate) {
            delete newMod.hasUpdate;
            delete newMod.newVersion;
            delete newMod.newGameVersion;
            delete newMod.download_url;
            needsUpdate = true;
          }

          if (Array.isArray(newMod.flavors)) {
            let flavorChanged = false;
            const nextFlavors = newMod.flavors.map((fl: any) => {
              const updatedFl = applyUpdateToMod(fl);
              if (updatedFl !== fl) flavorChanged = true;
              return updatedFl;
            });
            if (flavorChanged) {
              newMod.flavors = nextFlavors;
              needsUpdate = true;
            }
          }

          if (needsUpdate) {
            changed = true;
            return newMod;
          }
          return m;
        };
        const newList = prevList.map(applyUpdateToMod);
        return changed ? newList : prevList;
      });
    } catch (err) {
      console.error("Update check failed", err);
    }
  }

  return {
    ignoredHashesRef,
    fetchCloudLabQueue,
    checkNetworkUpdates,
  };
}
