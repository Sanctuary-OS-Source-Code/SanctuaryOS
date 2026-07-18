import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../supabase";
import { isVersionMatch, getExtensionRegex } from "../shared";
import { useState } from "react";
import { useModalStore } from "../store/modalStore";

export function useRadarLogic(checkNetworkUpdates: (currentModList: any[]) => Promise<void>) {
  const { 
    setQuarantineList, setShelterContents, 
    ownedDLC, setOwnedDLC, maskedDLC, setMaskedDLC,
    setModList, activeGameSchema, session, selectedVersion, setStatus, scanProgress, setScanProgress
  } = useStore();
  const { setScoutQueue, isScanning, setIsScanning } = useModalStore();
    const [malwareAlert, setMalwareAlert] = useState<any[]>([]);
  const { t } = useLexicon();

async function fetchVault() {
    const qList = await invoke<string[]>("get_quarantine_list");
    setQuarantineList(qList);
    const sList = await invoke<string[]>("get_shelter_list");
    setShelterContents(sList);
  }

async function runRadarSweep(isSilent: boolean = false, quickScan: boolean = false) {
    if (isScanning) return;
    if (!isSilent) {
      setIsScanning(true);
      setScanProgress({
        current: 5,
        total: 100,
        message: t("scan_interrogating_dna"),
      });
    }
    try {
      const config: any = await invoke("get_saved_coordinates");
      let currentOwnedDLC = ownedDLC;
      let currentMaskedDLC = maskedDLC;
      if (!quickScan) {
        try {
          const physicalDLC = await invoke<string[]>("scan_installed_dlc", {
            livePath: config.live_path,
          });
          setOwnedDLC(physicalDLC);
          currentOwnedDLC = physicalDLC;
          
          if (config.launch_args) {
            const maskMatch = config.launch_args.match(/-disablepack:([\w,]+)/i);
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

        try {
          if (navigator.onLine && localStorage.getItem("sanctuary_local_only") !== "true") {
            const { data: malwareData } = await supabase
              .from("mod_versions")
              .select("dna_hash, mods!inner(compliance_tier)")
              .eq("mods.compliance_tier", 3);
            if (malwareData && malwareData.length > 0) {
              const malwareHashes = malwareData.map((d: any) => d.dna_hash).filter(Boolean);
              await invoke("sync_security_definitions", { malware: malwareHashes, tier2: [] });
            }
          }
        } catch (err) {
          console.error("Malware sync failed", err);
        }
      }

      const rawLocalMods = await invoke<any[]>("scan_bunker", {
        vaultPath: config.vault_path,
        shelterActive: true,
      });

      let sandboxMods: any[] = [];
      try {
        sandboxMods = await invoke<any[]>("scan_sandbox", { vaultPath: config.vault_path });
      } catch (e) {
        console.error("Failed to scan sandbox:", e);
      }

      const allLocalMods = [...rawLocalMods, ...sandboxMods];

      const evasionDetected = allLocalMods.some(m => m.status === "☣️ EVASION DETECTED");
      if (evasionDetected) {
        try {
          const hwid = await invoke<string>("get_hardware_id");
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user) {
            await supabase.from('profiles').update({ is_banned: true, hardware_id: hwid, blacklist_reason: "Malware Evasion" }).eq('id', sessionData.session.user.id);
          } else {
            await supabase.from('profiles').update({ is_banned: true, blacklist_reason: "Malware Evasion" }).eq('hardware_id', hwid);
          }
          localStorage.setItem("sanctuary_blacklisted", "true");
        } catch(err) {
          console.error("Evasion ban failed", err);
        }
      }

      if (!allLocalMods || allLocalMods.length === 0) {
        setModList([]);
      if (!isSilent) setIsScanning(false);
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
        status: t("status_identifying"),
        color: "var(--text-secondary)",
        displayName: m.name,
        isSynced: false,
      }));
      setModList((prev) => {
        if (prev.length > 0) {
          const prevByHash = new Map(
            prev.filter((p) => p.hash).map((p) => [p.hash, p]),
          );
          const prevByName = new Map(
            prev.filter((p) => p.name).map((p) => [p.name, p]),
          );
          const cachedVirtuals = prev.filter((p) => p.isVirtual);
          const updatedPhysical = initialList.map((m) => {
            const existing = prevByHash.get(m.hash) || prevByName.get(m.name);
            return existing || m;
          });
          return [...cachedVirtuals, ...updatedPhysical];
        }
        return initialList;
      });
      const hashes = localMods.map((m) => m.hash).filter((h) => !!h);
      let allCloudData: any[] = [];
      const isOfflineMode = !navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true";
      if (!isOfflineMode) {
        const promises = [];
        for (let i = 0; i < hashes.length; i += 200) {
          const chunk = hashes.slice(i, i + 200);
          promises.push((async () => {
            let { data, error } = await supabase
              .from("mod_versions")
              .select("dna_hash, version_label, game_version, download_url, mods (id, name, status, requiredDLC, category_override, sub_type, image_url, url, master_author, allow_write, compliance_tier, mason_id, created_at, updated_at, folder_structure, masons(name))")
              .in("dna_hash", chunk);
            
            if (error) {
              console.warn("Schema mismatch detected, falling back to safe query...");
              const fallback = await supabase
                .from("mod_versions")
                .select("dna_hash, version_label, game_version, download_url, mods (id, name, status, requiredDLC, category_override, sub_type, image_url, url, master_author, allow_write, mason_id, created_at, updated_at, folder_structure, masons(name))")
                .in("dna_hash", chunk);
              data = fallback.data as any;
            }
            return data || [];
          })());
        }
        const results = await Promise.all(promises);
        allCloudData = results.flat();
      }
      const getDbMod = (sig: any) =>
        Array.isArray(sig?.mods) ? sig.mods[0] : sig?.mods;
      const identifiedIds = allCloudData
        .map((c) => getDbMod(c)?.id)
        .filter(Boolean);
      let allRels: any[] = [],
        allDeps: any[] = [],
        parentNameMap: Record<string, any> = {};
      let flavorData: any[] = [],
        flavorGroupNames: Record<string, string> = {};
      let setMembership: any[] = [],
        collectionsMetadata: any[] = [],
        globalConflicts: any[] = [];
      try {
        if (!isOfflineMode) {
          const { data: members } = await supabase
          .from("collection_members")
          .select("set_id, mod_id");
        const { data: sets } = await supabase.from("collections").select("*, masons(name)");
        const { data: rawConflicts } = await supabase.from("logical_conflicts").select("*");
        setMembership = members || [];
        collectionsMetadata = sets || [];
        globalConflicts = rawConflicts || [];
        if (hashes.length > 0) {
          const fPromises = [];
          for (let i = 0; i < hashes.length; i += 200) {
            const chunk = hashes.slice(i, i + 200);
            fPromises.push(
              supabase
                .from("flavor_group_members")
                .select("group_id, mod_hash")
                .in("mod_hash", chunk)
                .then((r: any) => r.data || [])
            );
          }
          const fResults = await Promise.all(fPromises);
          flavorData = fResults.flat();
          const uniqueGroupIds = [
            ...new Set(flavorData.map((f) => f.group_id)),
          ];
          if (uniqueGroupIds.length > 0) {
            const gPromises = [];
            const pPromises = [];
            for (let i = 0; i < uniqueGroupIds.length; i += 200) {
              const chunk = uniqueGroupIds.slice(i, i + 200);
              gPromises.push(
                supabase
                  .from("flavor_groups")
                  .select("id, name")
                  .in("id", chunk)
                  .then((r: any) => r.data || [])
              );
              pPromises.push(
                supabase
                  .from("mods")
                  .select("id, name, master_author, mason_id, image_url, url")
                  .in("id", chunk)
                  .then((r: any) => r.data || [])
              );
            }
            const gResults = await Promise.all(gPromises);
            const pResults = await Promise.all(pPromises);

            gResults.flat().forEach((g: any) => {
              flavorGroupNames[String(g.id)] = g.name;
            });
            pResults.flat().forEach((pm: any) => {
              parentNameMap[String(pm.id)] = {
                name: pm.name,
                author: pm.master_author || "Unknown",
                mason_id: pm.mason_id,
                image_url: pm.image_url,
                url: pm.url,
              };
            });
          }
        }
        }
      } catch (err) {
        console.error("Bridge Error:", err);
      }
      if (identifiedIds.length > 0 && !isOfflineMode) {
        const relChildPromises = [];
        const relParentPromises = [];
        const depChildPromises = [];
        const depParentPromises = [];

        for (let i = 0; i < identifiedIds.length; i += 200) {
          const chunk = identifiedIds.slice(i, i + 200);
          relChildPromises.push(
            supabase
              .from("mod_relationships")
              .select("*")
              .in("child_id", chunk)
              .then((r: any) => r.data || [])
          );
          relParentPromises.push(
            supabase
              .from("mod_relationships")
              .select("*")
              .in("parent_id", chunk)
              .then((r: any) => r.data || [])
          );
          depChildPromises.push(
            supabase
              .from("mod_dependencies")
              .select("*")
              .in("child_id", chunk)
              .then((r: any) => r.data || [])
          );
          depParentPromises.push(
            supabase
              .from("mod_dependencies")
              .select("*")
              .in("parent_id", chunk)
              .then((r: any) => r.data || [])
          );
        }
        
        const [rC, rP, dC, dP] = await Promise.all([
          Promise.all(relChildPromises),
          Promise.all(relParentPromises),
          Promise.all(depChildPromises),
          Promise.all(depParentPromises)
        ]);
        
        allRels = [...rC.flat(), ...rP.flat()];
        allDeps = [...dC.flat(), ...dP.flat()];
        const pIds = [
          ...new Set([
            ...allRels.map((r: any) => String(r.parent_id)),
            ...allRels.map((r: any) => String(r.child_id)),
            ...allDeps.map((d) => String(d.parent_id)),
            ...allDeps.map((d) => String(d.child_id)),
          ]),
        ];
        if (pIds.length > 0) {
          const pPromises = [];
          for (let i = 0; i < pIds.length; i += 200) {
            const chunk = pIds.slice(i, i + 200);
            pPromises.push(
              supabase
                .from("mods")
                .select("id, name, master_author, image_url, url")
                .in("id", chunk)
                .then((r: any) => r.data || [])
            );
          }
          const pResults = await Promise.all(pPromises);
          pResults.flat().forEach((pm: any) => {
            parentNameMap[String(pm.id)] = {
              name: pm.name,
              author: pm.master_author || "Unknown",
              image_url: pm.image_url,
              url: pm.url,
            };
          });
        }
      }
      const cloudMap = new Map();
      allCloudData.forEach(c => cloudMap.set(String(c.dna_hash), c));
      const setRelMap = new Map();
      setMembership.forEach(sm => setRelMap.set(String(sm.mod_id), sm));
      const flavorMap = new Map();
      flavorData.forEach(f => flavorMap.set(String(f.mod_hash), f));
      
      const dbVersionMap = new Map<string, string[]>();
      allCloudData.forEach(c => {
          const dbM = getDbMod(c);
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
        const cm = cloudMap.get(String(m.hash));
        const dbM = getDbMod(cm);
        const f = flavorMap.get(String(m.hash));
        
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

        if (bId || cm) {
            const dir = m.name.substring(0, Math.max(m.name.lastIndexOf("\\"), m.name.lastIndexOf("/")));
            if (dir && dir.length > 0) {
                const existing = dirMap.get(dir);
                const isTwinGroup = myParentRels.some((r: any) => r.relationship_type === "twin") || myChildRels.some((r: any) => r.relationship_type === "twin");
                
                if (!existing || bId === dbId) {
                    let shouldSet = true;
                    let nextBossId: string | null = bId;
                    if (existing && existing.bossId === bId) {
                        if (!existing.isTwinGroup && isTwinGroup) {
                            existing.isTwinGroup = true; 
                        }
                        if (existing.cloudMatch?.version_label && !cm?.version_label) {
                            shouldSet = false;
                        } 
                        else if (existing.cloudMatch?.version_label && cm?.version_label && cm.version_label.localeCompare(existing.cloudMatch.version_label, undefined, { numeric: true, sensitivity: 'base' }) >= 0) {
                            shouldSet = false; 
                        }
                    } else if (existing && existing.bossId !== bId) {
                        nextBossId = null;
                    } else if (existing && existing.isTwinGroup && !isTwinGroup) {
                        shouldSet = false; 
                    }
                    if (shouldSet) {
                        dirMap.set(dir, { bossId: nextBossId, cloudMatch: cm, dbMod: dbM, isTwinGroup: existing?.isTwinGroup || isTwinGroup });
                    }
                }
            }
        }
      });

      const physicalMods = localMods.map((mod) => {
        const cloudMatch = cloudMap.get(String(mod.hash));
        const dbMod = getDbMod(cloudMatch);
        const dbId = dbMod?.id ? String(dbMod.id) : null;
        
        const mySetRel = dbId ? setRelMap.get(dbId) : undefined;
        const myFlavor = flavorMap.get(String(mod.hash));
        
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

        let rawDLC = dbMod?.requiredDLC || [];
        if (typeof rawDLC === 'string') rawDLC = rawDLC.split(',').map((s: string) => s.trim()).filter(Boolean);
        const isDlcMissing = rawDLC.some(
          (dlc: string) => {
            const baseCode = dlc.split(' ')[0].toUpperCase();
            return !currentOwnedDLC.includes(baseCode) || currentMaskedDLC.includes(baseCode);
          }
        );
        let myBossId = dbId;
        let myRelType = null;
        if (addonRel) {
          myBossId = String(addonRel.parent_id);
          myRelType = "addon";
        } else if (setItemRel) {
          myBossId = String(setItemRel.parent_id);
          myRelType = "set_item";
        } else if (twinRel) {
          myBossId = String(twinRel.parent_id) < String(twinRel.child_id) ? String(twinRel.parent_id) : String(twinRel.child_id);
          myRelType = "twin";
        } else if (betaRel) {
          myBossId = String(betaRel.parent_id) < String(betaRel.child_id) ? String(betaRel.parent_id) : String(betaRel.child_id);
          myRelType = "beta";
        } else if (childTwinRel) {
          myBossId = String(childTwinRel.parent_id) < String(childTwinRel.child_id) ? String(childTwinRel.parent_id) : String(childTwinRel.child_id);
          myRelType = "twin";
        } else if (childBetaRel) {
          myBossId = String(childBetaRel.parent_id) < String(childBetaRel.child_id) ? String(childBetaRel.parent_id) : String(childBetaRel.child_id);
          myRelType = "core";
        } else if (myFlavor) {
          myBossId = String(myFlavor.group_id);
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
                            myChildRels.some((r: any) => r.relationship_type === "twin");
                            
        if (!myBossId && !hasOwnTwins && dirData && dirData.bossId) {
            myBossId = dirData.bossId;
        }
        
        let effectiveCloudMatch = cloudMatch;
        let effectiveDbMod = dbMod;
        
        if (!dbId && dirData && myBossId === dirData.bossId) {
            effectiveCloudMatch = dirData.cloudMatch;
            effectiveDbMod = dirData.dbMod || dbMod;
        }

        let unifiedVersion = null;

        if (!unifiedVersion && myBossId) {
            const isDirBossValid = dirData && (dirData.bossId === myBossId || myParentRels.some((r: any) => String(r.parent_id) === String(dirData.bossId)));
            if (isDirBossValid && dirData.cloudMatch?.version_label) {
                unifiedVersion = dirData.cloudMatch.version_label;
            } else if (!effectiveCloudMatch?.version_label) {
                unifiedVersion = bossVersionMap.get(myBossId);
            }
        }

        let finalVersion = effectiveCloudMatch?.version_label || "v.Local";
        if (unifiedVersion) {
            finalVersion = unifiedVersion; 
        }

        const compVerRaw = effectiveCloudMatch?.game_version || effectiveDbMod?.compatible_versions || [];
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
            isVersionMismatch = !compVerArray.some((v: string) => v === selectedVersion);
        }

        return {
          ...mod,
          physical_path: mod.name,
          dbId,
          hasChildren: myChildRels.length > 0,
          setId: mySetRel ? String(mySetRel.set_id) : null,
          flavorGroupId: myFlavor ? String(myFlavor.group_id) : null,
          flavorGroupName: myFlavor
            ? flavorGroupNames[String(myFlavor.group_id)]
            : null,
          created_at: effectiveCloudMatch?.created_at || effectiveDbMod?.created_at || mod.created_at || null,
          updated_at: effectiveCloudMatch?.updated_at || effectiveDbMod?.updated_at || mod.updated_at || null,
          requiredDLC: rawDLC,
          category_override: effectiveDbMod?.category_override,
          sub_type: effectiveDbMod?.sub_type,
          image_url: effectiveDbMod?.image_url,
          folder_structure: effectiveDbMod?.folder_structure,
          url: effectiveCloudMatch?.download_url || effectiveDbMod?.url || mod.url || null,
          author:
            (Array.isArray(effectiveDbMod?.masons)
              ? effectiveDbMod.masons[0]?.name
              : effectiveDbMod?.masons?.name) ||
            effectiveDbMod?.master_author ||
            mod.author,
          version: finalVersion,
          compatible_versions: effectiveCloudMatch?.game_version || effectiveDbMod?.compatible_versions || [],
          familyId: myBossId || dbId ? `${myBossId || dbId}` : `local_${mod.hash}`,
          baseFamilyId: myBossId || dbId ? myBossId : `local_${mod.hash}`,
          relationshipType: myRelType,
          invisibleRivals:
            invisibleRivalIds.length > 0 ? invisibleRivalIds : undefined,
          requirements: myDeps.length > 0 || myParentRels.some((r: any) => r.relationship_type === "addon")
            ? [
                ...myDeps,
                ...myParentRels.filter((r: any) => r.relationship_type === "addon").map((r: any) => ({
                  id: String(r.parent_id),
                  name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
                  url: parentNameMap[String(r.parent_id)]?.url || null
                }))
              ]
            : undefined,
          twins:
            myParentRels.some((r: any) => r.relationship_type === "twin") || myChildRels.some((r: any) => r.relationship_type === "twin")
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
              : undefined,
          interchangeableIds: [
            ...myParentRels.filter((r: any) => r.relationship_type === "beta" || r.relationship_type === "twin").map((r: any) => String(r.parent_id)),
            ...myChildRels.filter((r: any) => r.relationship_type === "beta" || r.relationship_type === "twin").map((r: any) => String(r.child_id))
          ],
          displayName: (() => {
            const rawName = mod.name.split(/[\\/]/).pop() || "";
            const match = rawName.match(getExtensionRegex(activeGameSchema));
            let base = rawName.replace(getExtensionRegex(activeGameSchema), "").replace(/_/g, " ");
            return base.toUpperCase();
          })(),
          allow_write: dbMod?.allow_write || false,
          compliance_tier: dbMod?.compliance_tier || 0,
          mason_id: dbMod?.mason_id || null,
          status: dbMod
            ? dbMod.status === "verified"
              ? t("verified")
              : dbMod.status === "unverified"
                ? t("unverified")
                : dbMod.status
            : mod.status?.includes("EXPLICIT LOCAL") ? "🚫 EXPLICIT LOCAL" : t("unlinked_badge"),
          isSynced: !!dbMod,
          isVirtual: false,
          isGhosted: isDlcMissing || isVersionMismatch,
          ghostReason: isDlcMissing ? "MISSING_DLC" : (isVersionMismatch ? "VERSION_MISMATCH" : null),
        };
      });

        const unidentified = physicalMods.filter(
          (m: any) => !m.isSynced && !m.status?.includes("EXPLICIT LOCAL") && !m.name.toLowerCase().includes("customchallenge") && !m.name.toLowerCase().includes("sandbox") && !m.name.match(/\.(cfg|ini|json|xml|log|txt|dat|tmbin)$/i)
        );
        const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";
        if (unidentified.length > 0 && !isSilent && !isOfflineMode && session && !isBanned) {
          setScoutQueue(unidentified);
        }
      const virtualCards: any[] = [];
      collectionsMetadata.forEach((set) => {
        const setMembers = physicalMods.filter(
          (m) => String(m.setId) === String(set.id),
        );
        if (setMembers.length > 0) {
          const verifiedCount = setMembers.filter((m) => m.status === (t("verified"))).length;
          const isAllVerified = verifiedCount === setMembers.length;
          const isNoneVerified = verifiedCount === 0;
          const isAnyBroken = setMembers.some((m) => typeof m.status === 'string' && m.status.toLowerCase().includes("broken"));
          
          let folderStatus = "";
          if (isAnyBroken) {
            folderStatus = "broken";
          } else if (isAllVerified) {
            folderStatus = t("verified");
          } else if (isNoneVerified) {
            folderStatus = t("unverified");
          } else {
            folderStatus = t("status_mixed");
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
      const uniqueFamilyGroups = [
        ...new Set(physicalMods.map((m) => m.familyId).filter(Boolean)),
      ];
      uniqueFamilyGroups.forEach((fId) => {
        const familyMembers = physicalMods.filter(
          (m) => String(m.familyId) === String(fId)
        );
        const baseFId = fId.split('@')[0];
        const isFlavorFolder = !!flavorGroupNames[String(baseFId)] && !parentNameMap[String(baseFId)];
        
        if (familyMembers.length <= 1 && !isFlavorFolder) return;
        
        const isTwinGroup = familyMembers.some(
          (m) => m.relationshipType === "twin" || m.relationshipType === "beta"
        );
        const pData = parentNameMap[String(baseFId)] || {
          name: isFlavorFolder
            ? flavorGroupNames[String(baseFId)]
            : familyMembers[0].displayName,
          author: familyMembers[0].author,
        };
          const safeName = pData.name || t("status_unknown_folder") || "Unknown Folder";
          const verifiedCount = familyMembers.filter((m) => m.status === (t("verified"))).length;
          const isAllVerified = verifiedCount === familyMembers.length;
          const isNoneVerified = verifiedCount === 0;
          const isAnyBroken = familyMembers.some((m) => typeof m.status === 'string' && m.status.toLowerCase().includes("broken"));
          
          let folderStatus = "";
          if (isAnyBroken) {
            folderStatus = "broken";
          } else if (isAllVerified) {
            folderStatus = t("verified");
          } else if (isNoneVerified) {
            folderStatus = t("unverified");
          } else {
            folderStatus = t("status_mixed");
          }

          const myParentRels = allRels.filter((r: any) => String(r.child_id) === String(baseFId));
          const myChildRels = allRels.filter((r: any) => String(r.parent_id) === String(baseFId));
          const folderDeps = [
            ...allDeps.filter((d) => String(d.child_id) === String(baseFId)).map((d) => ({
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

          virtualCards.push({
            hash: "virtual_" + fId,
            name: "FOLDER_" + fId,
            dbId: String(fId),
            baseFamilyId: String(baseFId),
            displayName: safeName.toUpperCase(),
            author: pData.author,
            mason_id: pData.mason_id || (familyMembers.length > 0 ? familyMembers[0].mason_id : null),
            status: folderStatus,
            color: isFlavorFolder ? "var(--warning)" : "var(--accent)",
            isSynced: true,
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
        localStorage.getItem("sanctuary_local_sets") || "[]",
      );
      let overriddenMods = physicalMods.map((m: any) =>
        localOvr[m.hash]
          ? { ...m, ...localOvr[m.hash], isLocalOverride: true }
          : m,
      );
      const localVirtualCards: any[] = [];
      localSts.forEach((set: any) => {
        const setMembers = overriddenMods.filter((m: any) =>
          set.items.includes(m.hash),
        );
        if (setMembers.length > 0) {
          const isSet = !!set.isCollection;
          const verifiedCount = setMembers.filter((m: any) => m.status === (t("verified"))).length;
          const isAllVerified = verifiedCount === setMembers.length;
          const isNoneVerified = verifiedCount === 0;
          const isAnyBroken = setMembers.some((m: any) => typeof m.status === 'string' && m.status.toLowerCase().includes("broken"));
          
          let folderStatus = "";
          if (isAnyBroken) {
            folderStatus = "broken";
          } else if (isAllVerified) {
            folderStatus = t("verified");
          } else if (isNoneVerified) {
            folderStatus = t("unverified");
          } else {
            folderStatus = t("status_mixed");
          }

          localVirtualCards.push({
            hash: "local_set_" + set.id,
            name: "LOCAL_SET_" + set.id,
            dbId: String(set.id),
            displayName: set.name.toUpperCase(),
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
        }
      });
      localSts.forEach((set: any) => {
        overriddenMods = overriddenMods.map((m: any) =>
          set.items.includes(m.hash)
            ? { ...m, setId: set.id, familyId: set.id }
            : m,
        );
      });
      const rawMasterList = [
        ...virtualCards.map((m: any) => localOvr[m.hash] ? { ...m, ...localOvr[m.hash], isLocalOverride: true } : m),
        ...localVirtualCards.map((m: any) => localOvr[m.hash] ? { ...m, ...localOvr[m.hash], isLocalOverride: true } : m),
        ...overriddenMods,
      ];

      const masterList = rawMasterList.map((m: any) => {
        if (!m.name) return m;
        const cleanName = m.name.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase() || "";
        const cleanDisplayName = m.displayName?.toUpperCase() || "";

        const myConflicts = globalConflicts.filter((c: any) => {
           if (c.mod_a_id && c.mod_a_id === m.dbId) return true;
           if (c.mod_b_id && c.mod_b_id === m.dbId) return true;
           const cModA = c.mod_a ? c.mod_a.toUpperCase() : "";
           const cModB = c.mod_b ? c.mod_b.toUpperCase() : "";
           if (cModA && (cModA === cleanName || cModA === cleanDisplayName)) return true;
           if (cModB && (cModB === cleanName || cModB === cleanDisplayName)) return true;
           return false;
        }).map((c: any) => {
           const isModA = c.mod_a_id === m.dbId || (c.mod_a && c.mod_a.toUpperCase() === cleanName) || (c.mod_a && c.mod_a.toUpperCase() === cleanDisplayName);
           const enemyId = isModA ? c.mod_b_id : c.mod_a_id;
           const enemyLegacyName = isModA ? c.mod_b : c.mod_a;
           return {
              id: c.id,
              enemy_id: enemyId,
              enemy_name: enemyLegacyName,
              severity_rank: c.severity_rank,
              resolution_note: c.resolution_note
           };
        });
        return { ...m, conflicts: myConflicts.length > 0 ? myConflicts : undefined };
      });

      const detectedMalware = masterList.filter((m: any) => (m.compliance_tier === 3 || (typeof m.status === 'string' && m.status.includes("QUARANTINED"))) && !m.isVirtual && !m.isLocalOverride);
      if (detectedMalware.length > 0) {
        if (localStorage.getItem("sanctuary_share_malware_reports") === "true") {
          try {
            const { data: existingReports } = await supabase.from('malware_reports').select('detected_hash');

            const insertPayloads = detectedMalware
              .filter((m: any) => !existingReports?.some((r: any) => r.detected_hash === m.hash))
              .map((m: any) => ({
                artifact_name: m.displayName || m.name || 'Unknown',
                detected_hash: m.hash || 'unknown-hash',
                signature: 'Radar Sweep Detection',
                status: 'pending',
                original_exists: m.original_exists,
                original_shredded: m.original_shredded
              }));

            if (insertPayloads.length > 0) {
              const { error } = await supabase.from('malware_reports').insert(insertPayloads);
              if (error) console.error("Malware Report Insert Error (sweep):", error);
            }
          } catch(e) {
            console.error("Malware Report Insert Exception (sweep):", e);
          }
        }

        setMalwareAlert((prev: any[]) => {
          if (!prev) return detectedMalware;
          const newAlerts = detectedMalware.filter((m: any) => !prev.some((p: any) => p.hash === m.hash || p.dbId === m.dbId));
          return [...prev, ...newAlerts];
        });
      }

      setModList(masterList);
      setScanProgress({ current: 100, total: 100, message: t("status_done") });
      if (!isSilent) setStatus(t("status_radar_done"));
      try {
        const config: any = await invoke("get_saved_coordinates");
        if (config.vault_path) {
          invoke("save_master_cache", {
            vaultPath: config.vault_path,
            content: JSON.stringify(masterList),
          });
        }
      } catch (cacheErr) {
        console.warn("Cache save failed:", cacheErr);
      }
      checkNetworkUpdates(masterList);
    } catch (err) {
      console.error("RADAR CRASH:", err);
    } finally {
      if (!isSilent) setIsScanning(false);
    }
  }

  return { runRadarSweep, fetchVault, malwareAlert, setMalwareAlert };
}
