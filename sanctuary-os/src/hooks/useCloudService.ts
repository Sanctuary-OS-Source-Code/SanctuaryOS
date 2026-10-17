import { getExtensionRegex } from "../shared";
import { supabase } from "../supabase";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { logUserAction } from "../lib/audit";
import { packageBlueprintLoadOrder, unpackBlueprintLoadOrder } from "./usePlaySetLogic";

export function useCloudService(activeMasonProfileId: string | null, tier2Hashes: string[]) {
  const { t } = useLexicon();
  const { playSets, setPlaySets, setStatus, modList, session, selectedVersion , activeGameSchema } = useStore();
  const { 
    setSyncCode, setPendingImportSet, setMissingImportMods, setIngestProgress 
  } = useModalStore();

  async function uploadBlueprintToCloud(setName: string, isPublic: boolean = true, isLocked: boolean = false, allowedMods?: any[], isMarketListed: boolean = false) {
    if (!session) {
      useStore.getState().pushStatus(t("alert_guest_mode_uploads"));
      return;
    }

    let actualMasonId = activeMasonProfileId;
    try {
      if (!actualMasonId) {
        let { data: masonData } = await supabase.from('masons').select("id").eq('profile_id', session.user.id).maybeSingle();
        
        if (!masonData) {
          const username = session.user.user_metadata?.username;
          if (username) {
            let { data: byName } = await supabase.from('masons').select("id").ilike('name', username).maybeSingle();
            if (byName) {
              masonData = byName;
            } else {
              const { data: newMason } = await supabase.from('masons').insert({ name: username, profile_id: session.user.id }).select("id").maybeSingle();
              if (newMason) masonData = newMason;
            }
          }
        }
        if (masonData) actualMasonId = masonData.id;
      }
    } catch (e) {
      console.warn("Could not fetch or create mason id for current user", e);
    }

    const targetSet = playSets.find((s) => s.name === setName);
    if (!targetSet) return;
    
    let code = targetSet.code;
    
    if (code && actualMasonId) {
      const { data: codeCheck } = await supabase.from('blueprints').select('mason_id').eq('code', code).maybeSingle();
      if (codeCheck && codeCheck.mason_id !== actualMasonId) {
        code = undefined;
      }
    }

    if (!code && actualMasonId) {
      try {
        const { data: existing } = await supabase
          .from('blueprints')
          .select('code, is_market_listed, is_public, is_locked')
          .eq('mason_id', actualMasonId)
          .eq('name', targetSet.name)
          .maybeSingle();
        if (existing) {
          code = existing.code;
          if (existing.is_market_listed) isMarketListed = true;
          if (existing.is_public) isPublic = true;
          if (existing.is_locked) isLocked = true;
        }
      } catch (err) {
        console.warn("Failed to check existing blueprint code", err);
      }
    }
    
    if (!code) {
      code = Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    const packagedLO = packageBlueprintLoadOrder(targetSet, activeGameSchema, modList);

    const rawModsToUpload = allowedMods ? allowedMods.map(m => ({ name: m.name, hash: m.hash, url: m.url, author: m.author })) : (() => {
      const byExact = new Map<string, any>();
      const byCleanLower = new Map<string, any>();
      for (let i = 0; i < modList.length; i++) {
        const m = modList[i];
        if (!m || !m.name) continue;
        if (!byExact.has(m.name)) byExact.set(m.name, m);
        const lastSlash = Math.max(m.name.lastIndexOf("/"), m.name.lastIndexOf("\\"));
        const clean = (lastSlash >= 0 ? m.name.slice(lastSlash + 1) : m.name).toLowerCase();
        if (!byCleanLower.has(clean)) byCleanLower.set(clean, m);
      }
      return targetSet.mods.map((rawMod: any) => {
        const modName = typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
        const lastSlash = Math.max(modName.lastIndexOf("/"), modName.lastIndexOf("\\"));
        const cleanName = lastSlash >= 0 ? modName.slice(lastSlash + 1) || modName : modName;
        const mod = byExact.get(modName) || byCleanLower.get(cleanName.toLowerCase());
        return { name: modName, hash: mod?.hash || targetSet.modHashes?.[modName] || targetSet.modHashes?.[cleanName] || "", url: mod?.url || targetSet.modMeta?.[modName]?.url || "", author: mod?.author || targetSet.modMeta?.[modName]?.author || "Unknown", compliance_tier: mod?.compliance_tier || 0, isVirtual: mod?.isVirtual };
      }).filter((m: any) => {
        if (m.isVirtual || m.name.startsWith("FOLDER_") || m.name.startsWith("SET_") || m.name.startsWith("LOCAL_SET_")) return false;
        const lower = m.name.toLowerCase();
        if (lower.includes("customchallenge_")) return true;
        return !lower.includes("merged") && !lower.includes("simmatticly") && !lower.includes("batch fix") && !lower.includes("batch_fix") && m.compliance_tier !== 1 && m.compliance_tier !== 2;
      }).map((m: any) => ({ name: m.name, hash: m.hash, url: m.url, author: m.author }));
    })();

    const modsToUpload = packagedLO.enrichAndSortArtifacts(rawModsToUpload);

    const blueprintData = {
      name: targetSet.name,
      mods: modsToUpload,
      code: code
    };
    
    const tier2Set = new Set(tier2Hashes);
    const hasTier2 = blueprintData.mods.some((m: any) => m.hash && tier2Set.has(m.hash));
    if (hasTier2) {
      useStore.getState().pushStatus(t("status_explicit_signature", "Explicit signature detected."));
      return;
    }

    try {
      const { error } = await supabase.from('blueprints').upsert([{
        code: code,
        name: targetSet.name,
        artifacts: blueprintData.mods,
        mason_id: actualMasonId,
        is_public: isPublic,
        is_locked: isLocked,
        is_market_listed: isMarketListed,
        game_version: selectedVersion
      }], { onConflict: 'code' });
      
      if (error) throw error;
      
      setPlaySets((prev: any[]) => {
        const updatedSets = prev.map(ps => ps.name === targetSet.name ? { ...ps, code, is_public: isPublic, is_locked: isLocked, is_market_listed: isMarketListed } : ps);

        return updatedSets;
      });

      await logUserAction(`Uploaded Blueprint: ${targetSet.name}`, 'blueprints', code, `Visibility: ${isPublic ? 'Public' : 'Private'}, Nexus: ${isMarketListed ? 'Listed' : 'Unlisted'}`);

      setStatus(`${t("status_blueprint_uplinked")} ${code}`);
      setSyncCode(code);
      return code;
    } catch (err: any) {
      setStatus(`${t("icon_block")} ${t("status_uplink_failed")}${err.message || err}`);
      return undefined;
    }
  }

  async function syncBlueprintByCode(code: string, suffix: string = " (Synced)") {
    if (!code) return;
    setStatus(`${t("icon_radar")} ${t("status_sync_blueprint")}${code}...`);
    try {
      const { data, error } = await supabase.from('blueprints').select('*').eq('code', code.toUpperCase()).single();
      if (error || !data) throw new Error(t("status_invalid_code"));
      const isCodeInUse = playSets.some((s: any) => s.code && s.code === code.toUpperCase());
      const finalCode = isCodeInUse ? undefined : code.toUpperCase();

      let baseName = `${data.name}${suffix}`;
      let finalName = baseName;
      let copyIndex = 1;
      while (playSets.some((s: any) => s.name.toLowerCase() === finalName.toLowerCase())) {
        finalName = `${baseName} (${copyIndex})`;
        copyIndex++;
      }

      const extRegex = getExtensionRegex(activeGameSchema);
      const modMap = new Map();
      const hashToMod = new Map();
      const baseToMod = new Map();
      
      modList.forEach((local: any) => {
         modMap.set(local.name, local);
         const cleanLocal = local.name.split(/[\\/]/).pop() || local.name;
         modMap.set(cleanLocal, local);
         if (local.hash) hashToMod.set(local.hash, local);
         const mBase = cleanLocal.replace(extRegex, '');
         if (mBase) baseToMod.set(mBase, local);
      });

      const missing: any[] = [];
      const rawAvailableMods: string[] = [];
      const nextModHashes: Record<string, string> = {};
      const nextModMeta: Record<string, { url?: string; author?: string }> = {};
      const nameRemap = new Map<string, string>();
      const rawArtifacts = Array.isArray(data.artifacts) ? data.artifacts : [];

      rawArtifacts.forEach((m: any) => {
         let found = null;
         const rawNameToCheck = typeof m === 'string' ? m : (m.name || m.path || '');
         const cleanArtifactFile = rawNameToCheck.split(/[\\/]/).pop() || rawNameToCheck;

         if (m && typeof m !== 'string' && m.hash) found = hashToMod.get(m.hash);
         if (!found) {
            found = modMap.get(rawNameToCheck) || modMap.get(cleanArtifactFile);
            if (!found) {
               const targetBase = cleanArtifactFile.replace(extRegex, '');
               if (targetBase) found = baseToMod.get(targetBase);
            }
         }
         if (found) {
            const resolvedClean = found.name.split(/[\\/]/).pop() || found.name;
            if (cleanArtifactFile) {
               nameRemap.set(cleanArtifactFile.toLowerCase(), resolvedClean);
            }
            rawAvailableMods.push(found.name);
            if (found.hash) nextModHashes[found.name] = found.hash;
            else if (typeof m !== 'string' && m.hash) nextModHashes[found.name] = m.hash;
         } else {
            missing.push(m);
            if (typeof m !== 'string') {
               if (m.hash) nextModHashes[rawNameToCheck] = m.hash;
               if (m.url || m.author) {
                  nextModMeta[rawNameToCheck] = { url: m.url, author: m.author };
               }
            }
         }
      });

      const { loadRules, modTiers, loadOrder, formatModWithTier } = unpackBlueprintLoadOrder(
        { mods: rawArtifacts, ...data },
        nameRemap,
        activeGameSchema
      );
      const availableMods = rawAvailableMods.map((mName) => formatModWithTier(mName));

      const readySet = {
        name: finalName,
        mods: availableMods,
        code: finalCode,
        modHashes: nextModHashes,
        modMeta: nextModMeta,
        loadRules,
        modTiers,
        loadOrder,
        ignoredGhosts: [],
      };

      setPendingImportSet(readySet);
      if (missing.length > 0) {
        setMissingImportMods(missing);
      } else {
        const updatedSets = [...playSets, readySet];
        setPlaySets(updatedSets);

        setStatus(`${t("icon_check_circle")} ${t("status_blueprint_synced")}`);
      }
    } catch (err: any) {
      setStatus(`${t("icon_block")} ${t("status_sync_error")}${err.message || err}`);
    }
  }

  async function massIngestToCloud() {
    if (!session) {
      useStore.getState().pushStatus(t("alert_guest_mode_uploads"));
      return;
    }
    const rawGhosts = modList.filter((m) => m && !m.isSynced);
    const ghosts = Array.from(
      new Map(
        rawGhosts.map((item) => [item.displayName || item.name, item]),
      ).values(),
    );
    if (ghosts.length === 0) {
      setStatus(t("status_bunker_synced"));
      useStore.getState().pushStatus(t("auto_all_mods_are_45"));
      return;
    }
    setIngestProgress({ current: 0, total: ghosts.length, active: true });
    setStatus(
      `${t("status_mass_ingestion_prefix")}${ghosts.length}${t("status_mass_ingestion_suffix")}`,
    );
    let successCount = 0;
    for (let i = 0; i < ghosts.length; i++) {
      const ghost = ghosts[i];
      const cleanName = (ghost.displayName || ghost.name).trim();
      try {
        let { data: existingMod } = await supabase
          .from("mods")
          .select("id")
          .eq("name", cleanName)
          .single();

        if (!existingMod) {
          const { data: newMod, error } = await supabase
            .from("mods")
            .insert([{ name: cleanName, status: "unverified" }])
            .select()
            .single();
          if (error) throw error;
          existingMod = newMod;
        }

        if (existingMod && ghost.hash) {
          await supabase.from("mod_versions").upsert(
            [
              {
                mod_id: existingMod.id,
                dna_hash: ghost.hash,
                version_label: "v.System",
              },
            ],
            { onConflict: "dna_hash" },
          );
        }
        successCount++;
      } catch (err) {
        console.warn(`Failed to ingest ${cleanName}:`, err);
      }
      setIngestProgress({ current: i + 1, total: ghosts.length, active: true });
    }
    setIngestProgress(null);
    setStatus(
      `${t("icon_check_circle")} Ingested ${successCount}/${ghosts.length} unknowns to the Network.`,
    );
  }

  return { uploadBlueprintToCloud, syncBlueprintByCode, massIngestToCloud };
}
