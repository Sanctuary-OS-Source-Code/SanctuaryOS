import { getExtensionRegex } from "../shared";
import { supabase } from "../supabase";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { logUserAction } from "../lib/audit";

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

    const modsToUpload = allowedMods ? allowedMods.map(m => ({ name: m.name, hash: m.hash, url: m.url, author: m.author })) : targetSet.mods.map((modName: string) => {
        const mod = modList.find(m => m.name === modName);
        return { name: modName, hash: mod?.hash || "", url: mod?.url || "", author: mod?.author || "Unknown", compliance_tier: mod?.compliance_tier || 0, isVirtual: mod?.isVirtual };
      }).filter((m: any) => {
        if (m.isVirtual || m.name.startsWith("FOLDER_") || m.name.startsWith("SET_") || m.name.startsWith("LOCAL_SET_")) return false;
        const lower = m.name.toLowerCase();
        if (lower.includes("customchallenge_")) return true;
        return !lower.includes("merged") && !lower.includes("simmatticly") && !lower.includes("batch fix") && !lower.includes("batch_fix") && m.compliance_tier !== 1 && m.compliance_tier !== 2;
      }).map((m: any) => ({ name: m.name, hash: m.hash, url: m.url, author: m.author }));

    const blueprintData = {
      name: targetSet.name,
      mods: modsToUpload
    };
    
    const hasTier2 = blueprintData.mods.some((m: any) => tier2Hashes.includes(m.hash));
    if (hasTier2) {
      useStore.getState().pushStatus(t("status_explicit_signature"));
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
        localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
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

  async function syncBlueprintByCode(code: string) {
    if (!code) return;
    setStatus(`${t("icon_radar")} ${t("status_sync_blueprint")}${code}...`);
    try {
      const { data, error } = await supabase.from('blueprints').select('*').eq('code', code.toUpperCase()).single();
      if (error || !data) throw new Error(t("status_invalid_code"));
      const parsed = { sanctuary_profile: true, name: data.name, mods: data.artifacts };
      const missing: any[] = [];
      parsed.mods.forEach((m: any) => {
        const exists = modList.some((local: any) => {
          if (local.hash && m.hash && local.hash === m.hash) return true;
          if (local.name === m.name) return true;
          const mBase = local.name.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
          const targetBase = typeof m === 'string' ? m.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '') : (m.name || '').split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
          return mBase && targetBase && mBase === targetBase;
        });
        if (!exists) missing.push(m);
      });
      setPendingImportSet(parsed);
      if (missing.length > 0) {
        setMissingImportMods(missing);
      } else {
        const updatedSets = [...playSets, { name: `${parsed.name} (Synced)`, mods: parsed.mods.map((m: any) => m.name) }];
        setPlaySets(updatedSets);
        localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
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
      useStore.getState().pushStatus(t("auto_all_mods_are_already_synced_no_unknown_m"));
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
