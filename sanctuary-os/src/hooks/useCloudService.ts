import { supabase } from "../supabase";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";

export function useCloudService(activeMasonProfileId: string | null, tier2Hashes: string[]) {
  const { t } = useLexicon();
  const { playSets, setPlaySets, setStatus, modList } = useStore();
  const { 
    setSyncCode, setPendingImportSet, setMissingImportMods, setIngestProgress 
  } = useModalStore();

  async function uploadBlueprintToCloud(setName: string) {
    const targetSet = playSets.find((s) => s.name === setName);
    if (!targetSet) return;
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    const blueprintData = {
      name: targetSet.name,
      mods: targetSet.mods.map((modName: string) => {
        const mod = modList.find(m => m.name === modName);
        return { name: modName, hash: mod?.hash || "", url: mod?.url || "", author: mod?.author || "Unknown" };
      })
    };
    
    const hasTier2 = blueprintData.mods.some((m: any) => tier2Hashes.includes(m.hash));
    if (hasTier2) {
      alert(t("status_explicit_signature"));
      return;
    }

    try {
      const { error } = await supabase.from('blueprints').insert([{
        code: code,
        name: targetSet.name,
        artifacts: blueprintData.mods,
        mason_id: activeMasonProfileId
      }]);
      if (error) throw error;
      setStatus(`${t("ui_icon_success")} ${t("status_blueprint_uplinked")}${code}`);
      setSyncCode(code);
    } catch (err: any) {
      setStatus(`${t("log_icon_fatal")} ${t("status_uplink_failed")}${err.message || err}`);
    }
  }

  async function syncBlueprintByCode(code: string) {
    if (!code) return;
    setStatus(`${t("log_icon_radar")} ${t("status_sync_blueprint")}${code}...`);
    try {
      const { data, error } = await supabase.from('blueprints').select('*').eq('code', code.toUpperCase()).single();
      if (error || !data) throw new Error(t("status_invalid_code"));
      const parsed = { sanctuary_profile: true, name: data.name, mods: data.artifacts };
      const missing: any[] = [];
      parsed.mods.forEach((m: any) => {
        const exists = modList.some(local => local.hash === m.hash || local.name === m.name);
        if (!exists) missing.push(m);
      });
      setPendingImportSet(parsed);
      if (missing.length > 0) {
        setMissingImportMods(missing);
      } else {
        setPlaySets([...playSets, { name: `${parsed.name} (Synced)`, mods: parsed.mods.map((m: any) => m.name) }]);
        setStatus(`${t("ui_icon_success")} ${t("status_blueprint_synced")}`);
      }
    } catch (err: any) {
      setStatus(`${t("log_icon_fatal")} ${t("status_sync_error")}${err.message || err}`);
    }
  }

  async function massIngestToCloud() {
    const rawGhosts = modList.filter((m) => m && !m.isSynced);
    const ghosts = Array.from(
      new Map(
        rawGhosts.map((item) => [item.displayName || item.name, item]),
      ).values(),
    );
    if (ghosts.length === 0) {
      setStatus(t("status_bunker_synced"));
      alert("All mods are already synced. No unknown mods found.");
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
      `${t("ui_icon_success")} Ingested ${successCount}/${ghosts.length} unknowns to the Network.`,
    );
  }

  return { uploadBlueprintToCloud, syncBlueprintByCode, massIngestToCloud };
}
