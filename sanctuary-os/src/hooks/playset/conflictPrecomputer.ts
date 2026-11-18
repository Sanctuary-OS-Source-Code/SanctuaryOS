import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { getExtensionRegex } from "../../shared";

export async function precomputeBlueprintConflicts(
  scopeName: string,
  targetMods?: any[],
  vaultPathOverride?: string
): Promise<{
  fatal: any[];
  tuning: any[];
  clone: any[];
  soft: any[];
  packages: number;
  totalClashes: number;
  timestamp: number;
} | null> {
  if (!scopeName) return null;
  try {
    let vaultPath = vaultPathOverride;
    let config: any = null;
    if (!vaultPath) {
      config = await invoke("get_saved_coordinates");
      vaultPath = config?.vault_path;
    }
    if (!vaultPath) return null;

    const state = useStore.getState();
    const sets = state.playSets || [];
    const set = sets.find((s: any) => s.name === scopeName);
    const rawMods = targetMods || set?.mods || [];
    const targetFiles = rawMods
      .map((m: any) => (typeof m === "string" ? m : m?.name || m?.path || ""))
      .filter(Boolean);

    const targetPath = state.modsPath || config?.mods_path || vaultPath;
    const report = await invoke<any>("run_conflict_radar", {
      modsPath: targetPath,
      targetFiles,
      gameSchema: state.activeGameSchema,
    });

    const isClone = (modA: string, modB: string) => {
      if (!modA || !modB) return false;
      const clean = (s: string) => {
        const file = s.split(/[\\/]/).pop() || s;
        const extMatch = file.match(getExtensionRegex(state.activeGameSchema));
        const ext = extMatch ? extMatch[1].toLowerCase() : "";
        const cleaned = file
          .toLowerCase()
          .replace(/(_v\d+|_alt|_remake|remake|\.[a-zA-Z0-9]+)/g, "")
          .replace(/[^a-z0-9]/g, "");
        return cleaned + "_" + ext;
      };
      return clean(modA) === clean(modB);
    };

    const fatal: any[] = [];
    const tuning: any[] = [];
    const clone: any[] = [];
    const soft: any[] = [];
    let actionableClashes = 0;

    (report?.conflicts || []).forEach((c: any) => {
      const parts = String(c.mod_pair || "").split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
      const modA = parts[0];
      const modB = parts.length > 1 ? parts[1] : "Unknown Overlap";
      const enrichedConflict = { ...c, modA, modB };

      if (isClone(modA, modB)) {
        clone.push(enrichedConflict);
        actionableClashes++;
      } else if (c.severity_rank == 4) {
        fatal.push(enrichedConflict);
        actionableClashes++;
      } else if (c.severity_rank == 3) {
        tuning.push(enrichedConflict);
        actionableClashes++;
      } else {
        soft.push(enrichedConflict);
      }
    });

    if (report?.installed_mods && navigator.onLine && localStorage.getItem("sanctuary_local_only") !== "true") {
      try {
        const { supabase } = await import("../../supabase");
        const { data: hitList, error: dbError } = await supabase.from("logical_conflicts").select(`
          *,
          mod_a_rel:mods!logical_conflicts_mod_a_id_fkey(name),
          mod_b_rel:mods!logical_conflicts_mod_b_id_fkey(name)
        `);
        if (hitList && !dbError) {
          const installedLower = (report.installed_mods || []).map((m: string) => ({
            orig: m,
            lower: m ? m.toLowerCase() : "",
          }));
          hitList.forEach((hit: any) => {
            const modAName = hit.mod_a_rel?.name || hit.mod_a;
            const modBName = hit.mod_b_rel?.name || hit.mod_b;
            if (!modAName || !modBName) return;
            const lowerA = String(modAName).toLowerCase();
            const lowerB = String(modBName).toLowerCase();
            const actualA = installedLower.find((item: any) => item.lower.includes(lowerA))?.orig;
            const actualB = installedLower.find((item: any) => item.lower.includes(lowerB))?.orig;
            if (actualA && actualB) {
              const ghostPair = `${actualA} 👻 ${actualB}`;
              actionableClashes++;
              const ghostConflict = {
                mod_pair: ghostPair,
                modA: actualA,
                modB: actualB,
                is_ghost: true,
                resolution_note: hit.resolution_note,
                severity_rank: hit.severity_rank,
              };
              if (Number(hit.severity_rank) === 4) fatal.push(ghostConflict);
              else if (Number(hit.severity_rank) === 3) tuning.push(ghostConflict);
            }
          });
        }
      } catch { }
    }

    const payload = {
      fatal,
      tuning,
      clone,
      soft,
      packages: report?.total_packages || 0,
      totalClashes: actionableClashes,
      timestamp: Date.now(),
    };

    try {
      const ignored: string[] = JSON.parse(localStorage.getItem("sanctuary_ignored_conflicts") || "[]");
      localStorage.setItem(`sanctuary_radar_cache_${scopeName}`, JSON.stringify(payload));
      localStorage.setItem(
        `radar_stats_${scopeName}`,
        JSON.stringify({
          fatal: fatal.filter((c) => !ignored.includes(c.mod_pair)).length,
          tuning: tuning.filter((c) => !ignored.includes(c.mod_pair)).length,
          clone: clone.filter((c) => !ignored.includes(c.mod_pair)).length,
          soft: soft.filter((c) => !ignored.includes(c.mod_pair)).length,
        })
      );
      window.dispatchEvent(
        new CustomEvent("sanctuary-radar-cache-updated", { detail: { scope: scopeName, payload } })
      );
    } catch { }

    return payload;
  } catch (e) {
    console.warn("Failed to precompute blueprint conflicts:", e);
    return null;
  }
}

