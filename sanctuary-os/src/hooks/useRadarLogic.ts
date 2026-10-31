import { isDesktop } from "../utils/envUtils";
import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { supabase, supabaseAuth, getActiveGameClient, submitThreatManifestToSpoke } from "../supabase";
import { isVersionMatch, getExtensionRegex, parseStringArray } from "../shared";
import { hashString } from "../lib/cryptoUtils";
import { useState } from "react";
import { useModalStore } from "../store/modalStore";
import { notifyOS } from "../utils/notificationHelper";
import { precomputeBlueprintConflicts } from "./usePlaySetLogic";

const recentlyShreddedSet = new Set<string>();

export function markQuarantineFileShredded(filename: string) {
  if (!filename) return;
  const base = filename.split(/[\\/]/).pop() || filename;
  recentlyShreddedSet.add(base);
  recentlyShreddedSet.add(filename);
  setTimeout(() => {
    recentlyShreddedSet.delete(base);
    recentlyShreddedSet.delete(filename);
  }, 3000);
}

export function useRadarLogic(checkNetworkUpdates: (currentModList: any[]) => Promise<void>) {
  const { setQuarantineList, setShelterContents, ownedDLC, setOwnedDLC, maskedDLC, setMaskedDLC, setModList, activeGameSchema, session, selectedVersion, setStatus, setScanProgress } = useStore();
  const { setScoutQueue } = useModalStore();
    const [malwareAlert, setMalwareAlert] = useState<any[]>([]);
  const { t } = useLexicon();

async function fetchVault() {
    if (!isDesktop()) return;
    const [rawQList, sList] = await Promise.all([
      invoke<string[]>("get_quarantine_list").catch(() => []),
      invoke<string[]>("get_shelter_list").catch(() => []),
    ]);
    const qList = (rawQList || []).filter(
      (q) => q && !q.startsWith(".shredding_") && !recentlyShreddedSet.has(q)
    );
    setQuarantineList(qList);
    setShelterContents(sList || []);
    
    if (qList.length > 0) {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        try {
          const cfg: any = await invoke("get_saved_coordinates");
          vaultPath = cfg?.vault_path || "";
        } catch {}
      }

      const enrichedItems = await Promise.all(
        qList.map(async (q) => {
          let volatileOrig: string | null = null;
          try {
            volatileOrig = await invoke<string | null>("get_volatile_original_path", {
              hash: "",
              filename: q,
            });
          } catch {}
          if (vaultPath) {
            try {
              const sep = vaultPath.includes("/") ? "/" : "\\";
              const cleanVaultRoot = vaultPath
                .replace(/[\\/]+$/, "")
                .replace(/[\\/]Mods$/i, "");
              const manifestPath = `${cleanVaultRoot}${sep}Quarantine${sep}${q}.manifest.json`;
              const rawJson = await invoke<string>("read_config_file", { path: manifestPath });
              if (rawJson) {
                const parsed = JSON.parse(rawJson);
                if (!volatileOrig && parsed.detected_hash) {
                  try {
                    volatileOrig = await invoke<string | null>("get_volatile_original_path", {
                      hash: parsed.detected_hash,
                      filename: q,
                    });
                  } catch {}
                }
                return {
                  hash: parsed.detected_hash || q,
                  name: q,
                  displayName: parsed.artifact_name || q,
                  matched_signature: parsed.signature || undefined,
                  original_path: parsed.original_path || undefined,
                  volatile_original_path: volatileOrig || undefined,
                  original_exists: Boolean(parsed.original_exists),
                  original_shredded: Boolean(parsed.original_shredded),
                  quarantined_file_shredded: Boolean(parsed.quarantined_file_shredded),
                  source_moved: Boolean(parsed.source_moved),
                  ingest_mode: parsed.ingest_mode || undefined,
                  file_size_bytes:
                    typeof parsed.file_size_bytes === "number"
                      ? parsed.file_size_bytes
                      : undefined,
                  file_extension: parsed.file_extension || undefined,
                  matched_entry: parsed.matched_entry || undefined,
                  detection_type: parsed.detection_type || undefined,
                  detected_at: parsed.detected_at || undefined,
                  quarantine_path: parsed.quarantine_path || undefined,
                  status: "QUARANTINED",
                  compliance_tier: 5,
                };
              }
            } catch {}
          }
          return {
            hash: q,
            name: q,
            displayName: q,
            volatile_original_path: volatileOrig || undefined,
            status: "QUARANTINED",
            compliance_tier: 5,
          };
        })
      );

      setMalwareAlert((prev: any[]) => {
        const existingList = prev || [];
        const updatedExisting = existingList.map((item) => {
          const match = enrichedItems.find(
            (e) => e.name === item.name || (e.hash && e.hash === item.hash)
          );
          return match
            ? {
                ...item,
                ...match,
                volatile_original_path:
                  match.volatile_original_path || item.volatile_original_path,
              }
            : item;
        });
        const newItems = enrichedItems.filter(
          (e) =>
            !updatedExisting.some(
              (p) => p.name === e.name || (e.hash && p.hash === e.hash)
            )
        );

        if (newItems.length > 0) {
          if (localStorage.getItem("sanctuary_share_malware_reports") === "true") {
            newItems.forEach((m: any) => {
              submitThreatManifestToSpoke(m, {
                isAuto: true,
                defaultSignature: "Persistent Quarantine Artifact",
              }).catch((e: any) => console.error("Malware Report Insert Exception (fetchVault):", e));
            });
          }
          notifyOS("Quarantine Lockdown", `Sanctuary OS has quarantined ${newItems.length} persistent dangerous artifacts on boot.`, 'MALWARE_ALERT');
          return [...updatedExisting, ...newItems];
        }
        return updatedExisting;
      });
    }
  }

async function runRadarSweep(isSilent: boolean = false, quickScan: boolean = isSilent) {
    if (activeGameSchema?.features?.has_cc === false) return;
    if (!isDesktop()) return;
    if (useModalStore.getState().isScanning || useModalStore.getState().isSilentScanning) return;
    
    useModalStore.getState().setIsScanning(!isSilent);
    useModalStore.getState().setIsSilentScanning(isSilent);

    const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const updateProgress = (pct: number, message: string) => {
      if (isSilent) return;
      setScanProgress((prev: any) => {
        const nextPct = prev && prev.current > pct && prev.current < 100 ? prev.current : pct;
        return { current: nextPct, total: 100, message };
      });
    };
    
    if (!isSilent) {
      setScanProgress({
        current: 1,
        total: 100,
        message: t("scan_interrogating_dna", "Interrogating Loadout Hash..."),
      });
    }
    try {
      const config: any = await invoke("get_saved_coordinates");
      const isOfflineMode = !navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true";

      let currentOwnedDLC = ownedDLC;
      let currentMaskedDLC = maskedDLC;

      // Refresh security definitions from cloud (or localStorage when offline) BEFORE scanning disk so removed Tier 5 flags never quarantine files
      try {
        const cachedVerified: string[] = JSON.parse(localStorage.getItem("sanctuary_verified_hashes") || "[]");
        if (!isOfflineMode) {
          const { data: malwareData } = await supabase
            .from("mod_versions")
            .select("dna_hash, mods!inner(compliance_tier)")
            .eq("mods.compliance_tier", 5);
          if (malwareData) {
            const malwareHashes = malwareData.map((d: any) => d.dna_hash).filter(Boolean);
            localStorage.setItem("sanctuary_malware_hashes", JSON.stringify(malwareHashes));
            await invoke("sync_security_definitions", { malware: malwareHashes, tier2: cachedVerified }).catch(() => {});
          }
        } else {
          const cachedMalware: string[] = JSON.parse(localStorage.getItem("sanctuary_malware_hashes") || "[]");
          await invoke("sync_security_definitions", { malware: cachedMalware, tier2: cachedVerified }).catch(() => {});
        }
      } catch {}

      try {
        await invoke("sanitize_vault", { vaultPath: config.vault_path });
      } catch (e) {
        console.error("Failed to sanitize vault during radar sweep:", e);
      }

      // Start global metadata + security signature refresh in parallel with disk scan
      const globalMetadataPromise = !isOfflineMode
        ? Promise.all([
            supabase.from("collection_members").select("set_id, mod_id"),
            supabase.from("collections").select("*, masons(name)"),
            supabase.from("logical_conflicts").select("*"),
          ]).catch((err) => {
            console.error("Global metadata prefetch error:", err);
            return [{ data: [] }, { data: [] }, { data: [] }];
          })
        : Promise.resolve([{ data: [] }, { data: [] }, { data: [] }]);

      const backgroundMaintenancePromise = (async () => {
        if (quickScan) return;
        try {
          const physicalDLC = await invoke<string[]>("scan_installed_dlc", {
            livePath: config.live_path,
          });
          setOwnedDLC(physicalDLC);
          currentOwnedDLC = physicalDLC;

          if (config.launch_args) {
            const tpl = activeGameSchema?.launch_args_dlc_mask_template;
            let maskRegex = /-disablepack:([\w,]+)/i;
            if (typeof tpl === "string" && tpl.includes("{packs}")) {
              const escaped = tpl
                .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                .replace("\\{packs\\}", "([\\w,.-]+)");
              try {
                maskRegex = new RegExp(escaped, "i");
              } catch {}
            }
            const maskMatch = config.launch_args.match(maskRegex);
            if (maskMatch?.[1]) {
              const masked = maskMatch[1]
                .split(",")
                .map((s: string) => s.trim().toUpperCase());
              setMaskedDLC(masked);
              currentMaskedDLC = masked;
            }
          }
        } catch (e) {
          console.error("DLC scan failed during sweep", e);
        }

        if (!isOfflineMode) {
          try {
            const cachedVerified: string[] = JSON.parse(localStorage.getItem("sanctuary_verified_hashes") || "[]");
            const [{ data: malwareData }, { data: coreHeuristics }, { data: spokeHeuristics }] = await Promise.all([
              supabase.from("mod_versions").select("dna_hash, mods!inner(compliance_tier)").eq("mods.compliance_tier", 5),
              supabaseAuth.from("keeper_heuristic_signatures").select("*"),
              supabase.from("heuristic_signatures").select("*"),
            ]);
            if (malwareData) {
              const malwareHashes = malwareData.map((d: any) => d.dna_hash).filter(Boolean);
              localStorage.setItem("sanctuary_malware_hashes", JSON.stringify(malwareHashes));
              await invoke("sync_security_definitions", { malware: malwareHashes, tier2: cachedVerified });
            }
            const mergedMap = new Map<string, any>();
            (coreHeuristics || []).forEach((s: any) => mergedMap.set(`core_${s.id}`, { ...s, source: s.source || "keepers_core" }));
            (spokeHeuristics || []).forEach((s: any) => mergedMap.set(`spoke_${s.id}`, { ...s, source: s.source || "spoke_oversight" }));
            if (mergedMap.size > 0 && config.vault_path) {
              await invoke("save_heuristic_signatures", {
                vaultPath: config.vault_path,
                signatures: Array.from(mergedMap.values()),
              });
            }
          } catch (err) {
            console.error("Malware sync failed", err);
          }
        }
      })();

      const [, rawLocalMods, sandboxMods] = await Promise.all([
        fetchVault(),
        invoke<any[]>("scan_bunker", {
          vaultPath: config.vault_path,
          shelterActive: true,
        }),
        invoke<any[]>("scan_sandbox", { vaultPath: config.vault_path }).catch((e) => {
          console.error("Failed to scan sandbox:", e);
          return [];
        }),
        backgroundMaintenancePromise,
      ]);

      const allLocalMods = [...rawLocalMods, ...sandboxMods];
      updateProgress(52, t("scan_identifying", "IDENTIFYING FILES..."));
      await yieldToMain();

      const evasionDetected = allLocalMods.some(m => m.status === "☣️ EVASION DETECTED");
      if (evasionDetected) {
        try {
          const rawHwid = await invoke<string>("get_hardware_id");
          const hwid = await hashString(rawHwid);
          
          await supabase.from('hardware_bans').insert({ hwid_hash: hwid, reason: 'Malware Evasion' });
          
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user) {
            await supabaseAuth.from('profiles').update({ is_banned: true, blacklist_reason: "Malware Evasion" }).eq('id', sessionData.session.user.id);
            
            const gameClient = getActiveGameClient();
            if (gameClient) {
               await supabase.rpc('secure_sync_hub_ban_to_spokes', { p_target_user_id: sessionData.session.user.id });
            }
          }
          localStorage.setItem("sanctuary_blacklisted", "true");
        } catch(err) {
          console.error("Evasion ban failed", err);
        }
      }

      if (!allLocalMods || allLocalMods.length === 0) {
        setModList([]);
        useModalStore.getState().setIsScanning(false);
        useModalStore.getState().setIsSilentScanning(false);
        useStore.setState({ isGlobalConfigLoaded: true });
        return;
      }
      const uniqueMap = new Map();
      allLocalMods.forEach((m) => {
        if (m.hash) uniqueMap.set(m.hash, m);
        else uniqueMap.set(m.name, m);
      });
      const localMods = Array.from(uniqueMap.values());
      const initialList = localMods.map((m) => ({
        name: m.name,
        hash: m.hash,
        status: t("status_identifying", "Identifying..."),
        color: "var(--text-secondary)",
        displayName: m.name,
        isSynced: false,
      }));
      setModList((prev) => {
        if (prev.length > 0) {
          const flatPrev = prev.flatMap((p: any) => (Array.isArray(p?.flavors) ? [...p.flavors, p] : [p]));
          const prevByHash = new Map(
            flatPrev.filter((p) => p?.hash && !p?.isVirtual).map((p) => [p.hash, p]),
          );
          const prevByName = new Map(
            flatPrev.filter((p) => p?.name && !p?.isVirtual).map((p) => [p.name, p]),
          );
          const cachedVirtuals = prev.filter((p) => p.isVirtual);
          const updatedPhysical = initialList.map((m) => {
            const existing = prevByHash.get(m.hash) || prevByName.get(m.name);
            if (existing) {
              const isSameHash = existing.hash === m.hash;
              if (isSameHash) {
                return {
                  ...existing,
                  name: m.name,
                  hash: m.hash,
                  displayName: existing.displayName || m.displayName,
                };
              }
              return {
                ...existing,
                ...m,
                displayName: existing.displayName || m.displayName,
                status: existing.status && existing.status !== t("status_identifying", "Identifying...") ? existing.status : m.status,
                color: existing.color && existing.color !== "var(--text-secondary)" ? existing.color : m.color,
              };
            }
            return m;
          });
          return [...cachedVirtuals, ...updatedPhysical];
        }
        return initialList;
      });
      await yieldToMain();
      const hashes = [...new Set(localMods.map((m) => m.hash).filter((h) => !!h))];
      let allCloudData: any[] = [];
      let flavorData: any[] = [],
        flavorGroupNames: Record<string, string> = {};
      let communityData: any[] = [],
        communityGroupNames: Record<string, string> = {};
      
        const runInBatches = async (items: any[], chunkSize: number, concurrency: number, processor: (chunk: any[]) => Promise<void>) => {
         const chunks = [];
         for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
         await Promise.all(chunks.map(chunk => processor(chunk)));
        };

        if (hashes.length > 0 && !isOfflineMode) {
          const totalChunks = Math.ceil(hashes.length / 200);
          let completedChunks = 0;
          await runInBatches(hashes, 200, 0, async (chunk) => {
            const [verRes, fRes, cRes] = await Promise.all([
              supabase
                .from("mod_versions")
                .select("dna_hash, version_label, game_version, download_url, mods (id, name, status, file_extension, requiredDLC, category_override, sub_type, image_url, url, master_author, allow_write, compliance_tier, mason_id, created_at, updated_at, folder_structure, masons(name))")
                .in("dna_hash", chunk),
              supabase
                .from("flavor_group_members")
                .select("group_id, mod_hash")
                .in("mod_hash", chunk),
              supabase
                .from("community_group_members")
                .select("group_id, mod_hash")
                .in("mod_hash", chunk),
            ]);

            let data = verRes.data;
            if (verRes.error) {
              console.warn("Schema mismatch detected, falling back to safe query...");
              const fallback = await supabase
                .from("mod_versions")
                .select("dna_hash, version_label, game_version, download_url, mods (id, name, status, file_extension, requiredDLC, category_override, sub_type, image_url, url, master_author, allow_write, mason_id, created_at, updated_at, folder_structure, masons(name))")
                .in("dna_hash", chunk);
              data = fallback.data as any;
            }
            allCloudData.push(...((data as any[]) || []));
            flavorData.push(...((fRes.data as any[]) || []));
            communityData.push(...((cRes.data as any[]) || []));
            completedChunks++;
            updateProgress(55 + Math.floor((completedChunks / totalChunks) * 20), t("scan_identifying", "IDENTIFYING FILES..."));
          });
        }
        updateProgress(75, t("scan_identifying", "IDENTIFYING FILES..."));
      
      const getDbMod = (sig: any) =>
        Array.isArray(sig?.mods) ? sig.mods[0] : sig?.mods;
      const isCloudMetadataRestricted = (dbM: any) => {
        if (!dbM) return true;
        const tier = Number(dbM.compliance_tier ?? 0);
        if (tier >= 1 && tier <= 4) return true;
        if (String(dbM.status || "").toLowerCase() === "unverified") return true;
        return false;
      };
      try {
        const verifiedCloudHashes = allCloudData
          .filter((c) => {
            const dbMod = getDbMod(c);
            return c?.dna_hash && dbMod && !isCloudMetadataRestricted(dbMod) && Number(dbMod.compliance_tier ?? 0) !== 5;
          })
          .map((c) => c.dna_hash);
        if (verifiedCloudHashes.length > 0) {
          const prevVerified: string[] = JSON.parse(localStorage.getItem("sanctuary_verified_hashes") || "[]");
          const mergedVerified = Array.from(new Set([...prevVerified, ...verifiedCloudHashes]));
          localStorage.setItem("sanctuary_verified_hashes", JSON.stringify(mergedVerified));
          const cachedMalware: string[] = JSON.parse(localStorage.getItem("sanctuary_malware_hashes") || "[]");
          await invoke("sync_security_definitions", { malware: cachedMalware, tier2: mergedVerified });
        }
      } catch (e) {
        console.warn("Failed to sync verified Registry hashes:", e);
      }
      const identifiedIds = [...new Set(allCloudData
        .filter((c) => !isCloudMetadataRestricted(getDbMod(c)))
        .map((c) => getDbMod(c)?.id)
        .filter(Boolean))];
      let allRels: any[] = [],
        allDeps: any[] = [],
        parentNameMap: Record<string, any> = {};
      let setMembership: any[] = [],
        collectionsMetadata: any[] = [],
        globalConflicts: any[] = [];
      try {
        if (!isOfflineMode) {
          updateProgress(78, t("scan_fetching", "FETCHING METADATA..."));
          const [membersRes, setsRes, conflictsRes] = await globalMetadataPromise;
          setMembership = membersRes?.data || [];
          collectionsMetadata = setsRes?.data || [];
          globalConflicts = conflictsRes?.data || [];
          if (hashes.length > 0) {
            const uniqueGroupIds = [
              ...new Set(flavorData.map((f) => f.group_id)),
            ];
            const uniqueCommunityGroupIds = [
              ...new Set(communityData.map((f) => f.group_id)),
            ];
            if (uniqueGroupIds.length > 0 || uniqueCommunityGroupIds.length > 0) {
              let gResults: any[] = [];
              let cgResults: any[] = [];
              let pResults: any[] = [];
              await runInBatches([...new Set([...uniqueGroupIds, ...uniqueCommunityGroupIds])], 200, 0, async (chunk) => {
                const [gRes, cgRes, pRes] = await Promise.all([
                  supabase.from("flavor_groups").select("id, name").in("id", chunk),
                  supabase.from("community_groups").select("id, name").in("id", chunk),
                  supabase.from("mods").select("id, name, master_author, mason_id, masons(name), image_url, url, description, category_override, compatible_versions, created_at").in("id", chunk)
                ]);
                gResults.push(...((gRes.data as any[]) || []));
                cgResults.push(...((cgRes.data as any[]) || []));
                pResults.push(...((pRes.data as any[]) || []));
              });

              gResults.forEach((g: any) => {
                flavorGroupNames[String(g.id)] = g.name;
              });
              cgResults.forEach((g: any) => {
                communityGroupNames[String(g.id)] = g.name;
              });
              pResults.flat().forEach((pm: any) => {
                const pmMasonName = Array.isArray(pm.masons) ? pm.masons[0]?.name : pm.masons?.name;
                parentNameMap[String(pm.id)] = {
                  name: pm.name,
                  author: pmMasonName || pm.master_author || null,
                  mason_id: pm.mason_id,
                  image_url: pm.image_url,
                  url: pm.url,
                  description: pm.description || null,
                  category_override: pm.category_override || null,
                  compatible_versions: pm.compatible_versions || null,
                  created_at: pm.created_at || null,
                };
              });
            }
          }
        }
      } catch (err) {
        console.error("Bridge Error:", err);
      }
      if (identifiedIds.length > 0 && !isOfflineMode) {
        updateProgress(85, t("scan_relationships", "ANALYZING RELATIONSHIPS..."));
        const totalRelChunks = Math.ceil(identifiedIds.length / 200);
        let completedRelChunks = 0;
        await runInBatches(identifiedIds, 200, 0, async (chunk) => {
          const [rC, rP, dC, dP] = await Promise.all([
            supabase.from("mod_relationships").select("*").in("child_id", chunk),
            supabase.from("mod_relationships").select("*").in("parent_id", chunk),
            supabase.from("mod_dependencies").select("*").in("child_id", chunk),
            supabase.from("mod_dependencies").select("*").in("parent_id", chunk)
          ]);
          
          allRels.push(...((rC.data as any[]) || []), ...((rP.data as any[]) || []));
          allDeps.push(...((dC.data as any[]) || []), ...((dP.data as any[]) || []));

          completedRelChunks++;
          updateProgress(85 + Math.floor((completedRelChunks / totalRelChunks) * 10), t("scan_relationships", "ANALYZING RELATIONSHIPS..."));
        });
        const pIds = [
          ...new Set([
            ...allRels.map((r: any) => String(r.parent_id)),
            ...allRels.map((r: any) => String(r.child_id)),
            ...allDeps.map((d) => String(d.parent_id)),
            ...allDeps.map((d) => String(d.child_id)),
          ]),
        ];
        if (pIds.length > 0) {
          await runInBatches(pIds, 200, 0, async (chunk) => {
            const { data } = await supabase
                .from("mods")
                .select("id, name, master_author, mason_id, masons(name), image_url, url, description, category_override, compatible_versions, created_at")
                .in("id", chunk);
            
            ((data as any[]) || []).forEach((pm: any) => {
              const pmMasonName = Array.isArray(pm.masons) ? pm.masons[0]?.name : pm.masons?.name;
              parentNameMap[String(pm.id)] = {
                name: pm.name,
                author: pmMasonName || pm.master_author || null,
                mason_id: pm.mason_id,
                image_url: pm.image_url,
                url: pm.url,
                description: pm.description || null,
                category_override: pm.category_override || null,
                compatible_versions: pm.compatible_versions || null,
                created_at: pm.created_at || null,
              };
            });
          });
        }
      }
      updateProgress(95, t("scan_relationships", "ANALYZING RELATIONSHIPS..."));
      await yieldToMain();
      const cloudMap = new Map();
      allCloudData.forEach(c => cloudMap.set(String(c.dna_hash), c));
      const setRelMap = new Map();
      setMembership.forEach(sm => setRelMap.set(String(sm.mod_id), sm));
      const flavorMap = new Map();
      const communityMap = new Map();
      flavorData.forEach(f => flavorMap.set(String(f.mod_hash), f));
      communityData.forEach(f => communityMap.set(String(f.mod_hash), f));
      
      const dbVersionMap = new Map<string, string[]>();
      allCloudData.forEach(c => {
          const dbM = getDbMod(c);
          if (isCloudMetadataRestricted(dbM)) return;
          const dbId = dbM?.id ? String(dbM.id) : null;
          const v = c.game_version || dbM?.compatible_versions;
          if (dbId && v) {
              const vArr = typeof v === 'string' ? v.split(',').map((s: string) => s.trim()) : v;
              const existing = dbVersionMap.get(dbId) || [];
              dbVersionMap.set(dbId, Array.from(new Set([...existing, ...vArr])));
          }
      });
      
      const parentRelMap = new Map();
      const childRelMap = new Map();
      allRels.forEach(r => {
         const cid = String(r.child_id);
         const pid = String(r.parent_id);
         if (!parentRelMap.has(cid)) parentRelMap.set(cid, []);
         parentRelMap.get(cid).push(r);
         if (!childRelMap.has(pid)) childRelMap.set(pid, []);
         childRelMap.get(pid).push(r);
      });
      
      const depsMap = new Map();
      allDeps.forEach(d => {
         const cid = String(d.child_id);
         if (!depsMap.has(cid)) depsMap.set(cid, []);
         depsMap.get(cid).push(d);
      });

      const dirMap = new Map();
      const bossVersionMap = new Map();
      
      localMods.forEach(m => {
        const rawCm = cloudMap.get(String(m.hash));
        const rawDbM = getDbMod(rawCm);
        const isRestricted = isCloudMetadataRestricted(rawDbM);
        const cm = isRestricted ? null : rawCm;
        const dbM = isRestricted ? null : rawDbM;
        const f = isRestricted ? undefined : flavorMap.get(String(m.hash));
        
        const dbId = dbM?.id ? String(dbM.id) : null;
        const myParentRels = dbId ? (parentRelMap.get(dbId) || []) : [];
        const myChildRels = dbId ? (childRelMap.get(dbId) || []) : [];
        
        const twinRel = myParentRels.find((r: any) => r.relationship_type === "twin");
        const addonRel = myParentRels.find((r: any) => r.relationship_type === "addon");
        const childTwinRel = myChildRels.find((r: any) => r.relationship_type === "twin");
        
        let bId = dbId || (f ? String(f.group_id) : null);
        if (addonRel) {
            bId = String(addonRel.parent_id);
        } else if (twinRel) {
            bId = String(twinRel.parent_id) < String(twinRel.child_id) ? String(twinRel.parent_id) : String(twinRel.child_id);
        } else if (childTwinRel) {
            bId = String(childTwinRel.parent_id) < String(childTwinRel.child_id) ? String(childTwinRel.parent_id) : String(childTwinRel.child_id);
        }

        let isTracingBoss1 = true;
        let safetyTraceCount1 = 0;
        
        while (isTracingBoss1 && bId && safetyTraceCount1 < 5) {
            const nextLevelRels = parentRelMap.get(bId) || [];
            const nextAddonRel = nextLevelRels.find((r: any) => r.relationship_type === "addon");
            const nextTwinRel = nextLevelRels.find((r: any) => r.relationship_type === "twin");
            
            let upperBossId = null;
            if (nextAddonRel) {
                upperBossId = String(nextAddonRel.parent_id);
            } else if (nextTwinRel) {
                upperBossId = String(nextTwinRel.parent_id) < String(nextTwinRel.child_id) ? String(nextTwinRel.parent_id) : String(nextTwinRel.child_id);
            }

            if (upperBossId && upperBossId !== bId) {
                bId = upperBossId; 
                safetyTraceCount1++;
            } else {
                isTracingBoss1 = false; 
            }
        }

        if (bId && cm && cm.version_label && !cm.version_label.includes(',')) {
           const existing = bossVersionMap.get(bId);
           if (!existing || cm.version_label.localeCompare(existing, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
               bossVersionMap.set(bId, cm.version_label);
           }
        }

        const dir = m.name.substring(0, Math.max(m.name.lastIndexOf("\\"), m.name.lastIndexOf("/")));
        if (dir && dir.length > 0) {
            const existing = dirMap.get(dir);
            const isTwinGroup = myParentRels.some((r: any) => r.relationship_type === "twin") || myChildRels.some((r: any) => r.relationship_type === "twin");
            
            const effectiveBossId = bId || `local_dir_${dir}`;
            
            if (!existing || effectiveBossId === dbId || bId === dbId) {
                let shouldSet = true;
                let nextBossId: string | null = effectiveBossId;
                if (existing && existing.bossId === effectiveBossId) {
                    if (!existing.isTwinGroup && isTwinGroup) {
                        existing.isTwinGroup = true; 
                    }
                    if (existing.cloudMatch?.version_label && !cm?.version_label) {
                        shouldSet = false;
                    } 
                    else if (existing.cloudMatch?.version_label && cm?.version_label && cm.version_label.localeCompare(existing.cloudMatch.version_label, undefined, { numeric: true, sensitivity: 'base' }) >= 0) {
                        shouldSet = false; 
                    }
                } else if (existing && existing.bossId !== effectiveBossId) {
                    if (existing.bossId?.startsWith('local_dir_') && !effectiveBossId.startsWith('local_dir_')) {
                        nextBossId = effectiveBossId;
                    } else if (!existing.bossId?.startsWith('local_dir_')) {
                        nextBossId = existing.bossId;
                    }
                } else if (existing && existing.isTwinGroup && !isTwinGroup) {
                    shouldSet = false; 
                }
                if (shouldSet) {
                    dirMap.set(dir, { bossId: nextBossId, cloudMatch: cm || existing?.cloudMatch, dbMod: dbM || existing?.dbMod, isTwinGroup: existing?.isTwinGroup || isTwinGroup });
                }
            }
        }
      });

      // Hydrate static Edge Network manifests from local SQLite + localStorage
      const edgeLogic: Record<string, any> = (() => {
        try {
          return JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
        } catch (e) {
          return {};
        }
      })();
      const earlyLocalOvr: Record<string, any> = (() => {
        try {
          return JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
        } catch (e) {
          return {};
        }
      })();

      try {
        if (config?.vault_path) {
          const sqliteManifests = await invoke<any[]>("get_all_edge_manifests", {
            vaultPath: config.vault_path,
          }).catch(() => []);
          let edgeChanged = false;
          let ovrChanged = false;

          for (const row of sqliteManifests || []) {
            let parsedMeta: any = null;
            if (row.last_fetched_metadata) {
              try {
                parsedMeta = JSON.parse(row.last_fetched_metadata);
              } catch (e) {}
            } else if (!isOfflineMode && !quickScan && row.artifact_id) {
              try {
                parsedMeta = await invoke<any>("fetch_and_sync_edge_manifest", {
                  vaultPath: config.vault_path,
                  artifactId: row.artifact_id,
                });
              } catch (e) {}
            }

            const familyHashes = Array.from(
              new Set(
                [
                  row.target_hash,
                  ...(Array.isArray(row.archive_hashes) ? row.archive_hashes : []),
                  parsedMeta?.payload?.sha256,
                  ...(Array.isArray(parsedMeta?.current_hashes) ? parsedMeta.current_hashes : []),
                  ...(Array.isArray(parsedMeta?.modules)
                    ? parsedMeta.modules.map((m: any) => m?.sha256)
                    : []),
                  ...(Array.isArray(parsedMeta?.previous_hashes) ? parsedMeta.previous_hashes : []),
                  ...(Array.isArray(parsedMeta?.atomic_logic?.flavors) ? parsedMeta.atomic_logic.flavors : []),
                ].filter(Boolean),
              ),
            );

            const lowerFamSet = new Set(familyHashes.map((fh: any) => String(fh).toLowerCase()));
            const matchingInstalledCount = localMods.filter(
              (lm: any) => lm?.hash && lowerFamSet.has(String(lm.hash).toLowerCase()),
            ).length;
            const isMultiModule =
              matchingInstalledCount > 1 ||
              (Array.isArray(parsedMeta?.modules) && parsedMeta.modules.length > 1) ||
              (Array.isArray(parsedMeta?.current_hashes) && parsedMeta.current_hashes.length > 1);

            const edgeFamilyKey = `edge_family_${row.artifact_id}`;
            if (row.artifact_id) {
              parentNameMap[edgeFamilyKey] = {
                name: parsedMeta?.artifact?.name || row.artifact_id,
                author: parsedMeta?.artifact?.author || row.mason_id || "Unknown",
                url: parsedMeta?.payload?.download_url || row.manifest_url || null,
              };
            }

            for (const h of familyHashes) {
              if (row.manifest_url && (!earlyLocalOvr[h] || !earlyLocalOvr[h].manifest_url)) {
                if (earlyLocalOvr[h]?.is_user_dossier) {
                  earlyLocalOvr[h] = {
                    ...earlyLocalOvr[h],
                    manifest_url: earlyLocalOvr[h].manifest_url || row.manifest_url,
                  };
                } else {
                  const canonicalName = parsedMeta?.artifact?.name || row.artifact_id || undefined;
                  earlyLocalOvr[h] = {
                    ...(earlyLocalOvr[h] || {}),
                    ...(isMultiModule
                      ? { parentName: canonicalName }
                      : { displayName: earlyLocalOvr[h]?.displayName || canonicalName }),
                    author: earlyLocalOvr[h]?.author || parsedMeta?.artifact?.author || row.mason_id || "Unknown",
                    version: earlyLocalOvr[h]?.version || parsedMeta?.artifact?.version || undefined,
                    url: earlyLocalOvr[h]?.url || parsedMeta?.payload?.download_url || row.manifest_url,
                    manifest_url: row.manifest_url,
                    requiredDLC: earlyLocalOvr[h]?.requiredDLC || parsedMeta?.atomic_logic?.required_dlc,
                    compatible_versions: earlyLocalOvr[h]?.compatible_versions || (parsedMeta?.artifact?.game_version
                      ? [parsedMeta.artifact.game_version]
                      : undefined),
                  };
                }
                ovrChanged = true;
              }
              if (parsedMeta?.atomic_logic || row.manifest_url) {
                edgeLogic[h] = {
                  ...(edgeLogic[h] || {}),
                  ...(parsedMeta?.atomic_logic || {}),
                  manifest_url: row.manifest_url,
                  artifact_id: parsedMeta?.artifact?.id || row.artifact_id,
                  name: parsedMeta?.artifact?.name || row.artifact_id,
                  author: parsedMeta?.artifact?.author || row.mason_id,
                  version: parsedMeta?.artifact?.version,
                  game_version: parsedMeta?.artifact?.game_version,
                  download_url: parsedMeta?.payload?.download_url,
                  sha256: parsedMeta?.payload?.sha256 || row.target_hash,
                  current_hashes: Array.isArray(parsedMeta?.current_hashes)
                    ? parsedMeta.current_hashes
                    : [],
                  previous_hashes: Array.isArray(parsedMeta?.previous_hashes)
                    ? parsedMeta.previous_hashes
                    : [],
                  modules: Array.isArray(parsedMeta?.modules) ? parsedMeta.modules : [],
                  changelog: parsedMeta?.changelog || [],
                };
                edgeChanged = true;
              }
            }
          }

          if (edgeChanged) {
            localStorage.setItem("sanctuary_edge_logic", JSON.stringify(edgeLogic));
          }
          if (ovrChanged) {
            localStorage.setItem("sanctuary_local_overrides", JSON.stringify(earlyLocalOvr));
          }
        }
      } catch (e) {
        console.warn("SQLite edge manifest hydration error:", e);
      }

      // Push Edge Network conflicts into globalConflicts (works both online & offline)
      try {
        Object.keys(edgeLogic).forEach((hash) => {
          const item = edgeLogic[hash];
          if (item?.conflicts && Array.isArray(item.conflicts)) {
            item.conflicts.forEach((c: any) => {
              const targetRef =
                typeof c === "string"
                  ? c.trim()
                  : String(c?.hash || c?.id || c?.name || "").trim();
              if (!targetRef) return;
              const targetLabel =
                typeof c === "string"
                  ? c.trim()
                  : String(c?.name || c?.id || c?.hash || targetRef).trim();
              globalConflicts.push({
                id: `edge_${hash}_${targetRef}`,
                mod_a_id: hash,
                mod_b_id: targetRef,
                mod_a: hash,
                mod_b: targetLabel,
                severity_rank:
                  typeof c === "object" && (c?.severity || c?.tier)
                    ? Number(c.severity || c.tier)
                    : 3,
                resolution_note:
                  (typeof c === "object" && c?.description) ||
                  "Edge Network Override Conflict",
              });
            });
          }
        });
      } catch (e) {}

      const localByHash = new Map<string, any>();
      const localByNormName = new Map<string, any>();
      const extRegex = getExtensionRegex(activeGameSchema);
      const normModKey = (s: string) =>
        String(s || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(extRegex, "")
          .replace(/[^a-z0-9]/gi, "")
          .toLowerCase() || "";
      localMods.forEach((m: any) => {
        if (m.hash) localByHash.set(String(m.hash), m);
        const nk = normModKey(m.name);
        if (nk) localByNormName.set(nk, m);
      });

      await yieldToMain();

      const physicalMods = localMods.map((mod) => {
        const rawCloudMatch = cloudMap.get(String(mod.hash));
        const rawDbMod = getDbMod(rawCloudMatch);
        const detectedComplianceTier = Number(rawDbMod?.compliance_tier ?? mod.compliance_tier ?? 0);
        const isRestrictedCloud = isCloudMetadataRestricted(rawDbMod);
        const cloudMatch = isRestrictedCloud ? null : rawCloudMatch;
        const dbMod = isRestrictedCloud ? null : rawDbMod;
        const dbId = dbMod?.id ? String(dbMod.id) : null;
        const modEdgeLogic = mod.hash ? edgeLogic[String(mod.hash)] : null;
        const modLocalOvr = mod.hash ? earlyLocalOvr[String(mod.hash)] : null;
        
        const mySetRel = dbId ? setRelMap.get(dbId) : undefined;
        const myFlavor = isRestrictedCloud ? undefined : flavorMap.get(String(mod.hash));
        const myCommunityGroup = isRestrictedCloud ? undefined : communityMap.get(String(mod.hash));
        
        const myParentRels = dbId ? (parentRelMap.get(dbId) || []) : [];
        const myChildRels = dbId ? (childRelMap.get(dbId) || []) : [];
        
        const twinRel = myParentRels.find((r: any) => r.relationship_type === "twin");
        const betaRel = myParentRels.find((r: any) => r.relationship_type === "beta");
        const addonRel = myParentRels.find((r: any) => r.relationship_type === "addon");
        const setItemRel = myParentRels.find((r: any) => r.relationship_type === "set_item");
        
        const childTwinRel = myChildRels.find((r: any) => r.relationship_type === "twin");
        const childBetaRel = myChildRels.find((r: any) => r.relationship_type === "beta");
        
        const invisibleRivalIds = myChildRels
          .filter((r: any) => r.relationship_type === "rival")
          .map((r: any) => String(r.child_id));
          
        const myDeps = dbId ? (depsMap.get(dbId) || []).map((d: any) => ({
            id: String(d.parent_id),
            name: parentNameMap[String(d.parent_id)]?.name || String(d.parent_id),
            url: parentNameMap[String(d.parent_id)]?.url || null
        })) : [];

        // Merge Edge Network dependencies & addons
        const edgeDeps = [
          ...(Array.isArray(modEdgeLogic?.dependencies)
            ? modEdgeLogic.dependencies.map((d: any) => {
                const depRef =
                  typeof d === "string"
                    ? d.trim()
                    : String(d?.hash || d?.id || d?.name || "").trim();
                const matchedLocal = depRef
                  ? localByHash.get(depRef) || localByNormName.get(normModKey(depRef))
                  : null;
                return {
                  id: String(matchedLocal?.hash || depRef),
                  hash: String(matchedLocal?.hash || depRef),
                  name:
                    matchedLocal?.name?.split(/[\\/]/).pop() ||
                    (typeof d === "object" && (d?.name || d?.id)) ||
                    String(depRef),
                  min_version: typeof d === "object" ? d.min_version : undefined,
                  url: null,
                };
              })
            : []),
          ...(Array.isArray(modEdgeLogic?.addons)
            ? modEdgeLogic.addons.map((addonHash: string) => {
                const matchedLocal =
                  localByHash.get(String(addonHash)) ||
                  localByNormName.get(normModKey(String(addonHash)));
                return {
                  id: String(matchedLocal?.hash || addonHash),
                  hash: String(matchedLocal?.hash || addonHash),
                  name: matchedLocal?.name?.split(/[\\/]/).pop() || String(addonHash),
                  url: null,
                };
              })
            : []),
        ];

        const edgeTwins = Array.isArray(modEdgeLogic?.twins)
          ? modEdgeLogic.twins.map((twinHash: string) => {
              const matchedLocal =
                localByHash.get(String(twinHash)) ||
                localByNormName.get(normModKey(String(twinHash)));
              return {
                id: String(matchedLocal?.hash || twinHash),
                hash: String(matchedLocal?.hash || twinHash),
                name: matchedLocal?.name?.split(/[\\/]/).pop() || String(twinHash),
                url: null,
              };
            })
          : [];

        // Local Dossier takes top priority for requiredDLC
        let rawDLC = parseStringArray(
          modLocalOvr?.requiredDLC !== undefined
            ? modLocalOvr.requiredDLC
            : (dbMod?.requiredDLC || modEdgeLogic?.required_dlc || [])
        );
        if (!modLocalOvr?.is_user_dossier && Array.isArray(modEdgeLogic?.required_dlc) && modEdgeLogic.required_dlc.length > 0) {
          rawDLC = Array.from(new Set([...rawDLC, ...parseStringArray(modEdgeLogic.required_dlc)]));
        }
        rawDLC = rawDLC.filter((dlc: string) => {
          const code = dlc.split(' ')[0].toUpperCase().trim();
          return Boolean(code) && code !== "BASE";
        });
        const isDlcMissing = rawDLC.some(
          (dlc: string) => {
            const baseCode = dlc.split(' ')[0].toUpperCase().trim();
            return !currentOwnedDLC.includes(baseCode) || currentMaskedDLC.includes(baseCode);
          }
        );
        let myBossId = dbId;
        let myRelType = null;
        if (twinRel) {
          myBossId = String(twinRel.parent_id) < String(twinRel.child_id) ? String(twinRel.parent_id) : String(twinRel.child_id);
          myRelType = "twin";
        } else if (childTwinRel) {
          myBossId = String(childTwinRel.parent_id) < String(childTwinRel.child_id) ? String(childTwinRel.parent_id) : String(childTwinRel.child_id);
          myRelType = "twin";
        } else if (addonRel) {
          myBossId = String(addonRel.parent_id);
          myRelType = "addon";
        } else if (setItemRel) {
          myBossId = String(setItemRel.parent_id);
          myRelType = "set_item";
        } else if (betaRel) {
          myBossId = String(betaRel.parent_id) < String(betaRel.child_id) ? String(betaRel.parent_id) : String(betaRel.child_id);
          myRelType = "beta";
        } else if (childBetaRel) {
          myBossId = String(childBetaRel.parent_id) < String(childBetaRel.child_id) ? String(childBetaRel.parent_id) : String(childBetaRel.child_id);
          myRelType = "core";
        } else if (myFlavor) {
          myBossId = String(myFlavor.group_id);
        } else if (modEdgeLogic?.artifact_id && Array.isArray(modEdgeLogic?.flavors) && modEdgeLogic.flavors.length > 0) {
          myBossId = `edge_flavor_${modEdgeLogic.artifact_id}`;
          flavorGroupNames[myBossId] =
            modEdgeLogic.name ||
            modLocalOvr?.parentName ||
            modLocalOvr?.displayName ||
            modEdgeLogic.artifact_id;
        } else if (modEdgeLogic?.artifact_id) {
          myBossId = `edge_family_${modEdgeLogic.artifact_id}`;
          if (!parentNameMap[myBossId]) {
            parentNameMap[myBossId] = {
              name:
                modEdgeLogic.name ||
                modLocalOvr?.parentName ||
                modLocalOvr?.displayName ||
                modEdgeLogic.artifact_id,
              author: modEdgeLogic.author || modLocalOvr?.author || "Unknown",
              url: modEdgeLogic.download_url || modEdgeLogic.manifest_url || null,
            };
          }
        }

        let isTracingBoss2 = true;
        let safetyTraceCount2 = 0;
        
        while (isTracingBoss2 && myBossId && safetyTraceCount2 < 5) {
            const nextLevelRels = parentRelMap.get(myBossId) || [];
            const nextAddonRel = nextLevelRels.find((r: any) => r.relationship_type === "addon");
            const nextTwinRel = nextLevelRels.find((r: any) => r.relationship_type === "twin");
            
            let upperBossId = null;
            if (nextAddonRel) {
                upperBossId = String(nextAddonRel.parent_id);
            } else if (nextTwinRel) {
                upperBossId = String(nextTwinRel.parent_id) < String(nextTwinRel.child_id) ? String(nextTwinRel.parent_id) : String(nextTwinRel.child_id);
            }

            if (upperBossId && upperBossId !== myBossId) {
                myBossId = upperBossId; 
                safetyTraceCount2++;
            } else {
                isTracingBoss2 = false; 
            }
        }
        
        const originalDir = mod.name.substring(0, Math.max(mod.name.lastIndexOf("\\"), mod.name.lastIndexOf("/")));
        let dirData = null;
        let currentDir = originalDir;

        while (currentDir && currentDir.length > 0) {
             const data = dirMap.get(currentDir);
             if (data) {
                 dirData = data;
                 break;
             }
             const lastSlash = Math.max(currentDir.lastIndexOf("\\"), currentDir.lastIndexOf("/"));
             if (lastSlash > 0) {
                 currentDir = currentDir.substring(0, lastSlash);
             } else {
                 break;
             }
        }
        
        const hasOwnTwins = myParentRels.some((r: any) => r.relationship_type === "twin") || 
                            myChildRels.some((r: any) => r.relationship_type === "twin") ||
                            edgeTwins.length > 0;
                            
        if (!myBossId && !hasOwnTwins && dirData && dirData.bossId && !isRestrictedCloud) {
            myBossId = dirData.bossId;
        }
        
        let effectiveCloudMatch = cloudMatch;
        let effectiveDbMod = dbMod;
        
        if (!dbId && !isRestrictedCloud && dirData && myBossId === dirData.bossId && !isCloudMetadataRestricted(dirData.dbMod)) {
            effectiveCloudMatch = dirData.cloudMatch;
            effectiveDbMod = dirData.dbMod || dbMod;
        }

        let unifiedVersion = null;

        if (!unifiedVersion && myBossId && !isRestrictedCloud) {
            const isDirBossValid = dirData && (dirData.bossId === myBossId || myParentRels.some((r: any) => String(r.parent_id) === String(dirData.bossId)));
            if (isDirBossValid && dirData.cloudMatch?.version_label) {
                unifiedVersion = dirData.cloudMatch.version_label;
            } else if (!effectiveCloudMatch?.version_label) {
                unifiedVersion = bossVersionMap.get(myBossId);
            }
        }

        // Local Dossier takes priority if overwritten
        let finalVersion = modLocalOvr?.version || unifiedVersion || effectiveCloudMatch?.version_label || modEdgeLogic?.version || "v.Local";

        const compVerRaw = (modLocalOvr?.compatible_versions && modLocalOvr.compatible_versions.length > 0)
          ? modLocalOvr.compatible_versions
          : (effectiveCloudMatch?.game_version || effectiveDbMod?.compatible_versions || (modEdgeLogic?.game_version ? [modEdgeLogic.game_version] : []));
        const compVerArray = Array.isArray(compVerRaw) ? compVerRaw : (typeof compVerRaw === 'string' ? compVerRaw.split(',').map((s: string) => s.trim()) : []);
        if (myBossId && myBossId !== dbId && myBossId !== `local_${mod.hash}`) {
            const myVersionsRaw = effectiveCloudMatch?.game_version || effectiveDbMod?.compatible_versions;
            if (myVersionsRaw) {
                const myVArr = typeof myVersionsRaw === 'string' ? myVersionsRaw.split(',').map((s:string) => s.trim()) : myVersionsRaw;
                const bossVArr = dbVersionMap.get(myBossId);
                if (bossVArr && myVArr.length > 0 && bossVArr.length > 0) {
                    let hasOverlap = false;
                    if (myVArr.some((v:string) => ['vlocal', 'any', 'all', ''].includes(v.toLowerCase())) || 
                        bossVArr.some((v:string) => ['vlocal', 'any', 'all', ''].includes(v.toLowerCase()))) {
                        hasOverlap = true;
                    } else {
                        hasOverlap = myVArr.some((mv: string) => isVersionMatch(bossVArr, mv)) || bossVArr.some((bv: string) => isVersionMatch(myVArr, bv));
                    }
                    if (!hasOverlap) {
                        myBossId = dbId;
                        myRelType = null;
                    }
                }
            }
        }

        let isVersionMismatch = false;
        if (selectedVersion && compVerArray.length > 0) {
            isVersionMismatch = !isVersionMatch(compVerArray, selectedVersion);
        }

        const mergedRequirements = [
          ...myDeps,
          ...myParentRels.filter((r: any) => r.relationship_type === "addon").map((r: any) => ({
            id: String(r.parent_id),
            name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
            url: parentNameMap[String(r.parent_id)]?.url || null
          })),
          ...edgeDeps,
        ];

        const mergedTwins = [
          ...myParentRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
            id: String(r.parent_id),
            name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
            url: parentNameMap[String(r.parent_id)]?.url || null
          })),
          ...myChildRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
            id: String(r.child_id),
            name: parentNameMap[String(r.child_id)]?.name || String(r.child_id),
            url: parentNameMap[String(r.child_id)]?.url || null
          })),
          ...edgeTwins,
        ];

        const resolvedImageUrl = modLocalOvr?.image_url !== undefined
          ? modLocalOvr.image_url
          : (modLocalOvr?.imageUrl !== undefined ? modLocalOvr.imageUrl : effectiveDbMod?.image_url);

        return {
          ...mod,
          ...(modLocalOvr || {}),
          physical_path: mod.name,
          name: mod.name,
          hash: mod.hash,
          dbId,
          hasChildren: myChildRels.length > 0,
          setId: mySetRel ? String(mySetRel.set_id) : null,
          flavorGroupId: myFlavor
            ? String(myFlavor.group_id)
            : (modEdgeLogic?.artifact_id && Array.isArray(modEdgeLogic?.flavors) && modEdgeLogic.flavors.length > 0
                ? `edge_flavor_${modEdgeLogic.artifact_id}`
                : null),
          flavorGroupName: myFlavor
            ? flavorGroupNames[String(myFlavor.group_id)]
            : (modEdgeLogic?.artifact_id ? modEdgeLogic.artifact_id : null),
          communityGroupId: myCommunityGroup ? String(myCommunityGroup.group_id) : null,
          communityGroupName: myCommunityGroup
            ? communityGroupNames[String(myCommunityGroup.group_id)]
            : null,
          created_at: modLocalOvr?.created_at || effectiveCloudMatch?.created_at || effectiveDbMod?.created_at || mod.created_at || null,
          updated_at: modLocalOvr?.updated_at || effectiveCloudMatch?.updated_at || effectiveDbMod?.updated_at || mod.updated_at || null,
          requiredDLC: rawDLC,
          category_override: modLocalOvr?.category_override || effectiveDbMod?.category_override,
          sub_type: modLocalOvr?.sub_type || effectiveDbMod?.sub_type,
          image_url: resolvedImageUrl,
          imageUrl: resolvedImageUrl,
          description: modLocalOvr?.description !== undefined ? modLocalOvr.description : (effectiveDbMod?.description || mod.description),
          folder_structure: effectiveDbMod?.folder_structure,
          file_extension:
            modLocalOvr?.file_extension ||
            effectiveDbMod?.file_extension ||
            dbMod?.file_extension ||
            mod.file_extension ||
            (() => {
              const extMatch = (mod.name || "").match(/\.([a-z0-9]{2,12})$/i);
              return extMatch ? extMatch[1].toLowerCase() : undefined;
            })(),
          url: modLocalOvr?.url || effectiveCloudMatch?.download_url || effectiveDbMod?.url || modEdgeLogic?.download_url || mod.url || null,
          manifest_url: modLocalOvr?.manifest_url || modEdgeLogic?.manifest_url || mod.manifest_url || undefined,
          author:
            modLocalOvr?.author ||
            modEdgeLogic?.author ||
            (Array.isArray(effectiveDbMod?.masons)
              ? effectiveDbMod.masons[0]?.name
              : effectiveDbMod?.masons?.name) ||
            effectiveDbMod?.master_author ||
            mod.author,
          version: finalVersion,
          compatible_versions: compVerArray,
          familyId: myBossId || dbId ? `${myBossId || dbId}` : `local_${mod.hash}`,
          baseFamilyId: myBossId || dbId ? myBossId : `local_${mod.hash}`,
          relationshipType: myRelType,
          invisibleRivals:
            invisibleRivalIds.length > 0 ? invisibleRivalIds : undefined,
          requirements: mergedRequirements.length > 0 ? mergedRequirements : undefined,
          dependencies: mergedRequirements.length > 0 ? mergedRequirements : undefined,
          twins: mergedTwins.length > 0 ? mergedTwins : undefined,
          interchangeableIds: [
            ...myParentRels.filter((r: any) => r.relationship_type === "beta" || r.relationship_type === "twin").map((r: any) => String(r.parent_id)),
            ...myChildRels.filter((r: any) => r.relationship_type === "beta" || r.relationship_type === "twin").map((r: any) => String(r.child_id)),
            ...edgeTwins.map((t: any) => String(t.id)),
          ],
          displayName: modLocalOvr?.displayName || effectiveDbMod?.name || (() => {
            const rawName = mod.name.split(/[\\/]/).pop() || "";
            const base = rawName.replace(extRegex, "").replace(/_/g, " ");
            return base.toUpperCase();
          })(),
          allow_write: modLocalOvr?.allow_write !== undefined ? modLocalOvr.allow_write : (dbMod?.allow_write || false),
          is_paid: modLocalOvr?.is_paid !== undefined ? modLocalOvr.is_paid : (effectiveDbMod?.is_paid || false),
          is_early_access: modLocalOvr?.is_early_access !== undefined ? modLocalOvr.is_early_access : (effectiveDbMod?.is_early_access || false),
          compliance_tier: detectedComplianceTier,
          mason_id: dbMod?.mason_id || null,
          status: dbMod
            ? dbMod.status === "stable" || dbMod.status === "verified"
              ? t("status_stable", "STABLE")
              : dbMod.status === "unverified"
                ? t("unverified", "Unverified")
                : dbMod.status
            : (detectedComplianceTier >= 1 && detectedComplianceTier <= 4) || mod.status?.includes("EXPLICIT LOCAL")
              ? "🚫 EXPLICIT LOCAL"
              : (modEdgeLogic || modLocalOvr?.manifest_url)
                ? t("status_stable", "STABLE")
                : t("badge_local", "Local"),
          color: dbMod
            ? mod.color
            : (detectedComplianceTier >= 1 && detectedComplianceTier <= 4) || mod.status?.includes("EXPLICIT LOCAL")
              ? mod.color
              : (modEdgeLogic || modLocalOvr?.manifest_url)
                ? "var(--success)"
                : mod.color,
          isSynced: !!(dbMod || modEdgeLogic || modLocalOvr?.manifest_url),
          isLocalOverride: !!modLocalOvr,
          isVirtual: false,
          isGhosted: isDlcMissing || isVersionMismatch,
          ghostReason: isDlcMissing ? "MISSING_DLC" : (isVersionMismatch ? "VERSION_MISMATCH" : null),
        };
      });

      await yieldToMain();

      const ignoredExtensions = (activeGameSchema?.extensions?.ignore_unidentified || [".cfg", ".ini", ".json", ".xml", ".log", ".txt", ".dat", ".tmbin"]).map((ext: string) => ext.toLowerCase());
      const submittedHashesSet = new Set<string>(
        (() => {
          try {
            return JSON.parse(localStorage.getItem('sanctuary_submitted_hashes') || '[]');
          } catch {
            return [];
          }
        })()
      );
      const unidentified = physicalMods.filter(
        (m: any) => {
          const lowerName = m.name.toLowerCase();
          const isIgnored = ignoredExtensions.some((ext: string) => lowerName.endsWith(ext));
          const hasEdgeBinding = !!(m.manifest_url || earlyLocalOvr[m.hash]?.manifest_url || edgeLogic[m.hash]);
          return !m.isSynced && !hasEdgeBinding && !m.status?.includes("EXPLICIT LOCAL") && !lowerName.includes("customchallenge") && !lowerName.includes("sandbox") && !isIgnored && !submittedHashesSet.has(m.hash);
        }
      );
      const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";
      if (!isOfflineMode && session && !isBanned) {
        setScoutQueue(unidentified);
      }
      const virtualCards: any[] = [];
      const setMembersMap = new Map<string, any[]>();
      physicalMods.forEach(m => {
          if (m.setId) {
              const sid = String(m.setId);
              if (!setMembersMap.has(sid)) setMembersMap.set(sid, []);
              setMembersMap.get(sid)!.push(m);
          }
      });
      collectionsMetadata.forEach((set) => {
        const setMembers = setMembersMap.get(String(set.id)) || [];
        if (setMembers.length > 0) {
          const brokenCount = setMembers.filter((m) => typeof m.status === 'string' && m.status.toLowerCase().includes("broken")).length;
          const unstableCount = setMembers.filter((m) => typeof m.status === 'string' && m.status.toLowerCase().includes("unstable")).length;
          const stableCount = setMembers.filter((m) => m.status === (t("status_stable", "STABLE"))).length;
          const isAllStable = stableCount === setMembers.length;
          const isNoneStable = stableCount === 0;
          
          let folderStatus = "";
          if (brokenCount > 0) {
            folderStatus = t("status_corrupted", "Corrupted");
          } else if (unstableCount > 0) {
            folderStatus = t("label_unstable", "Unstable");
          } else if (isAllStable) {
            folderStatus = t("status_stable", "STABLE");
          } else if (isNoneStable) {
            folderStatus = t("unverified", "Unverified");
          } else {
            folderStatus = t("status_mixed", "Mixed Status");
          }

          virtualCards.push({
            hash: "set_" + set.id,
            name: "SET_" + set.id,
            dbId: String(set.id),
            displayName: set.name.toUpperCase(),
            author: set.masons?.name || set.creator_name || "Unknown Architect",
            mason_id: set.mason_id || set.creator_id,
            status: folderStatus,
            color: "var(--accent)",
            isSynced: true,
            isVirtual: true,
            isParent: true,
            isCollection: true,
            url: set.url || null,
            image_url: set.image_url,
            flavors: setMembers,
            isGhosted: setMembers.some(m => m.isGhosted)
          });
        }
      });
      const familyMembersMap = new Map<string, any[]>();
      physicalMods.forEach(m => {
          if (m.familyId) {
              const fid = String(m.familyId);
              if (!familyMembersMap.has(fid)) familyMembersMap.set(fid, []);
              familyMembersMap.get(fid)!.push(m);
          }
      });
      
      const uniqueFamilyGroups = Array.from(familyMembersMap.keys());
      uniqueFamilyGroups.forEach((fId) => {
        const familyMembers = familyMembersMap.get(String(fId)) || [];
        const baseFId = fId.split('@')[0];
        const isFlavorFolder = !!flavorGroupNames[String(baseFId)] && !parentNameMap[String(baseFId)];
        
        if (familyMembers.length <= 1 && !isFlavorFolder) return;
        
        const pData = parentNameMap[String(baseFId)] || {
          name: isFlavorFolder
            ? flavorGroupNames[String(baseFId)]
            : familyMembers[0].displayName,
          author: familyMembers[0].author,
        };
        const virtualOvr = earlyLocalOvr["virtual_" + fId];
        const dossierMember =
          familyMembers.find((fm: any) => fm.isLocalOverride && fm.is_user_dossier) ||
          familyMembers.find((fm: any) => fm.isLocalOverride);
          const safeName = virtualOvr?.displayName || pData.name || t("status_unknown_folder", "Unknown Folder");
          const brokenCount = familyMembers.filter((m) => typeof m.status === 'string' && m.status.toLowerCase().includes("broken")).length;
          const unstableCount = familyMembers.filter((m) => typeof m.status === 'string' && m.status.toLowerCase().includes("unstable")).length;
          const stableCount = familyMembers.filter((m) => m.status === (t("status_stable", "STABLE"))).length;
          const isAllStable = stableCount === familyMembers.length;
          const isNoneStable = stableCount === 0;
          
          let folderStatus = "";
          if (brokenCount > 0) {
            folderStatus = t("status_corrupted", "Corrupted");
          } else if (unstableCount > 0) {
            folderStatus = t("label_unstable", "Unstable");
          } else if (isAllStable) {
            folderStatus = t("status_stable", "STABLE");
          } else if (isNoneStable) {
            folderStatus = t("unverified", "Unverified");
          } else {
            folderStatus = t("status_mixed", "Mixed Status");
          }

          const baseFIdKey = String(baseFId);
          const myParentRels = parentRelMap.get(baseFIdKey) || [];
          const myChildRels = childRelMap.get(baseFIdKey) || [];
          const myDirectDeps = depsMap.get(baseFIdKey) || [];
          const folderDeps = [
            ...myDirectDeps.map((d: any) => ({
              id: String(d.parent_id),
              name: parentNameMap[String(d.parent_id)]?.name || String(d.parent_id),
              url: parentNameMap[String(d.parent_id)]?.url || null
            })),
            ...myParentRels.filter((r: any) => r.relationship_type === "addon").map((r: any) => ({
              id: String(r.parent_id),
              name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
              url: parentNameMap[String(r.parent_id)]?.url || null
            }))
          ];
            
          const folderTwins = myParentRels.some((r: any) => r.relationship_type === "twin") || myChildRels.some((r: any) => r.relationship_type === "twin")
            ? [
                ...myParentRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
                  id: String(r.parent_id),
                  name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
                  url: parentNameMap[String(r.parent_id)]?.url || null
                })),
                ...myChildRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
                  id: String(r.child_id),
                  name: parentNameMap[String(r.child_id)]?.name || String(r.child_id),
                  url: parentNameMap[String(r.child_id)]?.url || null
                })),
              ]
            : undefined;

          const validFolderAuthor = [
            virtualOvr?.author,
            dossierMember?.author,
            pData.author,
            ...familyMembers.map((fm: any) => fm.author),
          ].find(
            (a) =>
              a &&
              typeof a === "string" &&
              a.trim() !== "" &&
              a.trim().toLowerCase() !== "unknown" &&
              a.trim().toLowerCase() !== "local" &&
              a.trim().toLowerCase() !== "local node"
          );

          virtualCards.push({
            hash: "virtual_" + fId,
            name: "FOLDER_" + fId,
            dbId: String(fId),
            baseFamilyId: String(baseFId),
            displayName: (virtualOvr?.displayName || safeName).toUpperCase(),
            author: validFolderAuthor || pData.author || familyMembers[0]?.author || "Unknown",
            url: virtualOvr?.url || dossierMember?.url || pData.url || familyMembers[0]?.url || null,
            image_url: virtualOvr?.image_url ?? dossierMember?.image_url ?? pData.image_url ?? familyMembers[0]?.image_url,
            description:
              virtualOvr?.description ??
              dossierMember?.description ??
              pData.description ??
              familyMembers.find((fm: any) => fm.description)?.description,
            category_override: virtualOvr?.category_override || dossierMember?.category_override || pData.category_override || familyMembers[0]?.category_override,
            compatible_versions: virtualOvr?.compatible_versions || dossierMember?.compatible_versions || pData.compatible_versions || familyMembers[0]?.compatible_versions,
            requiredDLC: virtualOvr?.requiredDLC || dossierMember?.requiredDLC || familyMembers[0]?.requiredDLC,
            created_at:
              virtualOvr?.created_at ||
              dossierMember?.created_at ||
              pData.created_at ||
              familyMembers.find((fm: any) => fm.created_at)?.created_at ||
              null,
            updated_at:
              virtualOvr?.updated_at ||
              dossierMember?.updated_at ||
              familyMembers.find((fm: any) => fm.updated_at)?.updated_at ||
              pData.created_at ||
              familyMembers.find((fm: any) => fm.created_at)?.created_at ||
              null,
            version:
              virtualOvr?.version ||
              dossierMember?.version ||
              familyMembers.find((fm: any) => fm.version && fm.version !== "v.Local")?.version ||
              familyMembers[0]?.version ||
              "v.Local",
            mason_id: pData.mason_id || (familyMembers.length > 0 ? familyMembers[0].mason_id : null),
            status: folderStatus,
            color: isFlavorFolder ? "var(--warning)" : "var(--accent)",
            isSynced: true,
            isLocalOverride: !!(virtualOvr || dossierMember),
            isVirtual: true,
            isParent: true,
            isFlavorFolder: isFlavorFolder,
            twins: folderTwins,
            requirements: folderDeps.length > 0 ? folderDeps : undefined,
            flavors: [...familyMembers].sort((a, b) => {
              if (a.relationshipType === "beta" && b.relationshipType !== "beta") return 1;
              if (a.relationshipType !== "beta" && b.relationshipType === "beta") return -1;
              return 0;
            }),
          });
      });
      const localOvr = JSON.parse(
        localStorage.getItem("sanctuary_local_overrides") || "{}",
      );
      const localSts = JSON.parse(
        localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]",
      );
      let overriddenMods = physicalMods.map((m: any) =>
        localOvr[m.hash]
          ? { ...m, ...localOvr[m.hash], isLocalOverride: true }
          : m,
      );
      const localVirtualCards: any[] = [];
      const modToPlaysetMap = new Map<string, any>();
      localSts.forEach((set: any) => {
        if (!set || !set.id || !Array.isArray(set.items) || Array.isArray(set.mods)) return;
        const setIdStr = String(set.id);
        if (!setIdStr.startsWith("f_") && !setIdStr.startsWith("local_")) return;
        const setItemHashes = new Set<string>(set.items);
        setItemHashes.forEach((h) => modToPlaysetMap.set(h, set.id));
        const setMembers = overriddenMods.filter((m: any) =>
          setItemHashes.has(m.hash),
        );
        const isSet = !!set.isCollection;
        const brokenCount = setMembers.filter((m: any) => typeof m.status === 'string' && m.status.toLowerCase().includes("broken")).length;
        const unstableCount = setMembers.filter((m: any) => typeof m.status === 'string' && m.status.toLowerCase().includes("unstable")).length;
        const stableCount = setMembers.filter((m) => m.status === (t("status_stable", "STABLE"))).length;
        const isAllStable = setMembers.length > 0 && stableCount === setMembers.length;
        
        let folderStatus = "";
        if (brokenCount > 0) {
          folderStatus = t("status_corrupted", "Corrupted");
        } else if (unstableCount > 0) {
          folderStatus = t("label_unstable", "Unstable");
        } else if (isAllStable) {
          folderStatus = t("status_stable", "STABLE");
        } else {
          folderStatus = t("local_node", "Local Folder");
        }

        localVirtualCards.push({
          hash: "local_set_" + set.id,
          name: "LOCAL_SET_" + set.id,
          dbId: String(set.id),
          displayName: (set.name || "").toUpperCase(),
          author: "Local Override",
          status: folderStatus,
          color: isSet ? "var(--accent)" : "var(--success)",
          isSynced: false,
          isVirtual: true,
          isParent: true,
          isCollection: isSet,
          url: set.url || null,
          isLocalOverride: true,
          image_url: "",
          flavors: setMembers,
        });
      });
      if (modToPlaysetMap.size > 0) {
        overriddenMods = overriddenMods.map((m: any) => {
          const assignedSetId = modToPlaysetMap.get(m.hash);
          return assignedSetId
            ? { ...m, setId: assignedSetId, familyId: assignedSetId }
            : m;
        });
      }
      const rawMasterList = [
        ...virtualCards.map((m: any) => localOvr[m.hash] ? { ...m, ...localOvr[m.hash], isLocalOverride: true } : m),
        ...localVirtualCards.map((m: any) => localOvr[m.hash] ? { ...m, ...localOvr[m.hash], isLocalOverride: true } : m),
        ...overriddenMods,
      ];

      await yieldToMain();

      const rawByHashOrDbId = new Map<string, any>();
      rawMasterList.forEach((rm: any) => {
        if (rm.hash) rawByHashOrDbId.set(String(rm.hash), rm);
        if (rm.dbId) rawByHashOrDbId.set(String(rm.dbId), rm);
      });

      const conflictsById = new Map<string, any[]>();
      const conflictsByName = new Map<string, any[]>();
      const pushConflict = (map: Map<string, any[]>, key: string, c: any) => {
        if (!key) return;
        let arr = map.get(key);
        if (!arr) {
          arr = [];
          map.set(key, arr);
        }
        arr.push(c);
      };
      for (const c of globalConflicts) {
        if (c.mod_a_id != null) pushConflict(conflictsById, String(c.mod_a_id), c);
        if (c.mod_b_id != null) pushConflict(conflictsById, String(c.mod_b_id), c);
        if (c.mod_a) pushConflict(conflictsByName, String(c.mod_a).toUpperCase(), c);
        if (c.mod_b) pushConflict(conflictsByName, String(c.mod_b).toUpperCase(), c);
      }

      const masterList = rawMasterList.map((m: any) => {
        if (!m.name || globalConflicts.length === 0) return m;
        const cleanName = m.name.split(/[\\/]/).pop()?.replace(extRegex, "").toUpperCase() || "";
        const cleanDisplayName = m.displayName?.toUpperCase() || "";
        const upperHash = m.hash ? String(m.hash).toUpperCase() : "";

        const matchedSet = new Set<any>();
        if (m.dbId != null) {
          const list = conflictsById.get(String(m.dbId));
          if (list) for (const c of list) matchedSet.add(c);
        }
        if (m.hash) {
          const list = conflictsById.get(String(m.hash));
          if (list) for (const c of list) matchedSet.add(c);
        }
        if (cleanName) {
          const list = conflictsByName.get(cleanName);
          if (list) for (const c of list) matchedSet.add(c);
        }
        if (cleanDisplayName && cleanDisplayName !== cleanName) {
          const list = conflictsByName.get(cleanDisplayName);
          if (list) for (const c of list) matchedSet.add(c);
        }
        if (upperHash) {
          const list = conflictsByName.get(upperHash);
          if (list) for (const c of list) matchedSet.add(c);
        }

        if (matchedSet.size === 0) return m;

        const myConflicts = Array.from(matchedSet).map((c: any) => {
           const isModA =
             (m.dbId && c.mod_a_id === m.dbId) ||
             (m.hash && c.mod_a_id === m.hash) ||
             (c.mod_a && String(c.mod_a).toUpperCase() === cleanName) ||
             (c.mod_a && String(c.mod_a).toUpperCase() === cleanDisplayName);
           const enemyId = isModA ? c.mod_b_id : c.mod_a_id;
           const enemyLegacyName = isModA ? c.mod_b : c.mod_a;
           const matchedEnemy = enemyId
             ? rawByHashOrDbId.get(String(enemyId))
             : null;
           return {
              id: c.id,
              enemy_id: enemyId,
              enemy_name: matchedEnemy?.displayName || matchedEnemy?.name || enemyLegacyName,
              severity_rank: c.severity_rank,
              resolution_note: c.resolution_note
           };
        });
        return { ...m, conflicts: myConflicts.length > 0 ? myConflicts : undefined };
      });

      const detectedMalware = masterList.filter((m: any) => (m.compliance_tier === 5 || (typeof m.status === 'string' && m.status.includes("QUARANTINED") && ![1, 2, 3, 4].includes(m.compliance_tier))) && !m.isVirtual && !m.isLocalOverride);
      if (detectedMalware.length > 0) {
        const hydratedDetectedMalware = await Promise.all(
          detectedMalware.map(async (m: any) => {
            if (m.volatile_original_path) return m;
            try {
              const filename = (m.path || m.name || "").split(/[/\\]/).pop() || m.name || "";
              const volatileOrig = await invoke<string | null>("get_volatile_original_path", {
                hash: m.hash || "",
                filename,
              });
              if (volatileOrig) {
                return { ...m, volatile_original_path: volatileOrig };
              }
            } catch {}
            return m;
          })
        );

        setMalwareAlert((prev: any[]) => {
          if (!prev) return hydratedDetectedMalware;
          const updatedPrev = prev.map((p: any) => {
            const match = hydratedDetectedMalware.find(
              (m: any) => (m.hash && p.hash === m.hash) || (m.dbId && p.dbId === m.dbId)
            );
            return match && match.volatile_original_path && !p.volatile_original_path
              ? { ...p, volatile_original_path: match.volatile_original_path }
              : p;
          });
          const newAlerts = hydratedDetectedMalware.filter(
            (m: any) => !updatedPrev.some((p: any) => p.hash === m.hash || (p.dbId && p.dbId === m.dbId))
          );
          return [...updatedPrev, ...newAlerts];
        });

        notifyOS("Radar Sweep Alert", `Sanctuary OS has detected ${hydratedDetectedMalware.length} dangerous artifacts during the radar sweep.`, 'MALWARE_ALERT');

        if (localStorage.getItem("sanctuary_share_malware_reports") === "true") {
          for (const m of hydratedDetectedMalware) {
            await submitThreatManifestToSpoke(m, {
              isAuto: true,
              defaultSignature: "Radar Sweep Detection",
            });
          }
        }
      } else {
        setMalwareAlert([]);
      }

      const prevList = useStore.getState().modList;
      const flatPrevList = prevList.flatMap((p: any) => (Array.isArray(p?.flavors) ? [...p.flavors, p] : [p]));
      const prevByHash = new Map(flatPrevList.filter((p: any) => p?.hash).map((p: any) => [p.hash, p]));
      const prevByName = new Map(flatPrevList.filter((p: any) => p?.name).map((p: any) => [p.name, p]));
      const cachedNetUpdates = useStore.getState().networkUpdates;
      const netUpdated = Array.isArray(cachedNetUpdates?.updated) ? cachedNetUpdates.updated : [];
      const netBroken = Array.isArray(cachedNetUpdates?.broken) ? cachedNetUpdates.broken : [];
      const netObsolete = Array.isArray(cachedNetUpdates?.obsolete) ? cachedNetUpdates.obsolete : [];

      const netUpdatedByHash = new Map<string, any>();
      const netUpdatedByName = new Map<string, any>();
      for (const u of netUpdated) {
        if (u?.hash) netUpdatedByHash.set(u.hash, u);
        if (u?.name) netUpdatedByName.set(u.name, u);
      }
      const netBrokenHashes = new Set<string>();
      const netBrokenNames = new Set<string>();
      for (const b of netBroken) {
        if (b?.hash) netBrokenHashes.add(b.hash);
        if (b?.name) netBrokenNames.add(b.name);
      }
      const netObsoleteHashes = new Set<string>();
      const netObsoleteNames = new Set<string>();
      for (const o of netObsolete) {
        if (o?.hash) netObsoleteHashes.add(o.hash);
        if (o?.name) netObsoleteNames.add(o.name);
      }

      const preserveModState = (m: any): any => {
        const existing = prevByHash.get(m.hash) || prevByName.get(m.name);
        const netUpd = (m.hash && netUpdatedByHash.get(m.hash)) || (m.name && netUpdatedByName.get(m.name));
        const isNetBroken = Boolean((m.hash && netBrokenHashes.has(m.hash)) || (m.name && netBrokenNames.has(m.name)));
        const isNetObsolete = Boolean((m.hash && netObsoleteHashes.has(m.hash)) || (m.name && netObsoleteNames.has(m.name)));

        let nextFlavors = m.flavors;
        if (Array.isArray(m.flavors)) {
          nextFlavors = m.flavors.map(preserveModState);
        }

        if (existing) {
          const isSameHash = existing.hash === m.hash;
          const cleanMVer = String(m.version || "").toLowerCase().replace(/^v/, '').trim();
          const candidateNewVer = existing.newVersion || netUpd?.newVersion;
          const cleanNewVer = String(candidateNewVer || "").toLowerCase().replace(/^v/, '').trim();
          const isStillOutdated = (isSameHash || !!netUpd) && (cleanMVer !== cleanNewVer && !!cleanNewVer);

          let resolvedStatus = m.status !== t("status_identifying", "Identifying...") ? m.status : (existing.status || m.status);
          if (isNetBroken) resolvedStatus = 'broken';
          else if (isNetObsolete) resolvedStatus = 'obsolete';

          return {
            ...existing,
            ...m,
            conflicts: m.conflicts,
            isVirtual: m.isVirtual !== undefined ? m.isVirtual : existing.isVirtual,
            isLocalVirtual: m.isLocalVirtual !== undefined ? m.isLocalVirtual : existing.isLocalVirtual,
            flavors: nextFlavors !== undefined ? nextFlavors : existing.flavors,
            hasUpdate: isStillOutdated ? (existing.hasUpdate || !!netUpd) : undefined,
            newVersion: isStillOutdated ? candidateNewVer : undefined,
            newGameVersion: isStillOutdated ? (existing.newGameVersion || netUpd?.newGameVersion) : undefined,
            download_url: isStillOutdated ? (existing.download_url || netUpd?.download_url || m.download_url) : m.download_url,
            status: resolvedStatus,
            isSynced: m.isSynced !== undefined ? m.isSynced : existing.isSynced,
            color: m.color !== "var(--text-secondary)" ? m.color : (existing.color || m.color),
          };
        }

        if (netUpd || isNetBroken || isNetObsolete || nextFlavors !== m.flavors) {
          return {
            ...m,
            ...(nextFlavors !== undefined ? { flavors: nextFlavors } : {}),
            ...(netUpd ? {
              hasUpdate: true,
              newVersion: netUpd.newVersion,
              newGameVersion: netUpd.newGameVersion,
              download_url: netUpd.download_url || m.download_url,
            } : {}),
            ...(isNetBroken ? { status: 'broken' } : isNetObsolete ? { status: 'obsolete' } : {}),
          };
        }
        return m;
      };

      const finalMasterList = masterList.map(preserveModState);

      await yieldToMain();
      setModList(finalMasterList);
      useStore.setState({ isGlobalConfigLoaded: true });
      if (!isSilent) {
        setScanProgress({ current: 100, total: 100, message: t("status_done", "Done.") });
        setTimeout(() => setScanProgress({ current: 0, total: 100, message: "" }), 2000);
        setStatus(t("status_radar_done", "SCANNER: Loadout Reorganized."));
      }
      setTimeout(async () => {
        try {
          if (config && config.vault_path) {
            const serialized = JSON.stringify(finalMasterList);
            await yieldToMain();
            invoke("save_master_cache", {
              vaultPath: config.vault_path,
              content: serialized,
            }).catch(() => {});
          }
        } catch (cacheErr) {
          console.warn("Cache save failed:", cacheErr);
        }
        await yieldToMain();
        checkNetworkUpdates(finalMasterList);
        await yieldToMain();
        const stateSnap = useStore.getState();
        const activeBpName = stateSnap.activeSetName || stateSnap.playSets?.[stateSnap.activePlaySetIndex]?.name || stateSnap.playSets?.[0]?.name;
        if (activeBpName) {
          precomputeBlueprintConflicts(activeBpName, undefined, config?.vault_path).catch(() => {});
        }
      }, 150);
    } catch (err) {
      console.error("RADAR CRASH:", err);
      useStore.setState({ isGlobalConfigLoaded: true });
      useModalStore.getState().setIsScanning(false);
      useModalStore.getState().setIsSilentScanning(false);
      setScanProgress({ current: 0, total: 100, message: "" });
    } finally {
      useModalStore.getState().setIsScanning(false);
      useModalStore.getState().setIsSilentScanning(false);
    }
  }

  return { runRadarSweep, fetchVault, malwareAlert, setMalwareAlert };
}

