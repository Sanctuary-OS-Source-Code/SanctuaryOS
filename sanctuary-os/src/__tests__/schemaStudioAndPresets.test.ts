import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const mem = new Map<string, string>();
  const storageStub = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storageStub,
    configurable: true,
    writable: true,
  });
});

import sims4Bundled from "../data/schemas/sims4.json";
import stardewBundled from "../data/schemas/stardew.json";
import defaultBundled from "../data/schemas/default.json";
import rootSchemaJson from "../../schema.json";
import { GAME_ARCHITECTURE_PRESETS } from "../utils/gameArchitecturePresets";
import { getSafeSchema } from "../store";

describe("Section 6: GameSchema ground-truth audit & 27 presets", () => {
  it("contains all 27 architectural presets with valid identity and safe save targets", () => {
    const keys = Object.keys(GAME_ARCHITECTURE_PRESETS);
    expect(keys.length).toBe(27);

    for (const [key, preset] of Object.entries(GAME_ARCHITECTURE_PRESETS)) {
      expect(preset.id).toBe(key);
      expect(typeof preset.game_id).toBe("string");
      expect(preset.game_id.length).toBeGreaterThan(0);
      expect(typeof preset.display_name).toBe("string");
      expect(preset.display_name.length).toBeGreaterThan(0);
      expect(preset.paths).toBeTruthy();
      expect(preset.extensions).toBeTruthy();

      const airgapTargets: string[] = preset.time_capsule?.save_airgap_targets || [];
      for (const target of airgapTargets) {
        expect(target.trim()).not.toBe("");
        expect(target.trim()).not.toBe(".");
      }

      const worldTargets: any[] = preset.time_capsule?.world_state_targets || [];
      for (const wt of worldTargets) {
        expect(String(wt.path || "").trim()).not.toBe("");
        expect(String(wt.path || "").trim()).not.toBe(".");
      }

      expect(String(preset.paths?.user_data_dir_windows || "")).not.toMatch(
        /Steam\/userdata$/i
      );
    }
  });

  it("repairs Bethesda, Starfield, Oblivion, Cyberpunk, BG3, Factorio, Witcher3, Elden Ring, RDR2 & BepInEx presets", () => {
    for (const bethesdaId of ["skyrim", "fallout4", "starfield", "fnv", "oblivion"]) {
      expect(
        GAME_ARCHITECTURE_PRESETS[bethesdaId].extensions.relative_root_anchors
      ).toContain("Data");
    }

    expect(GAME_ARCHITECTURE_PRESETS.starfield.extensions.supported).toContain(".esl");
    expect(GAME_ARCHITECTURE_PRESETS.starfield.extensions.vault_visible).toContain(".esl");
    expect(
      GAME_ARCHITECTURE_PRESETS.starfield.load_order.manifest_targets[0].include_extensions
    ).toContain(".esl");
    expect(GAME_ARCHITECTURE_PRESETS.oblivion.mod_metadata_extractor.binary_master_header).toBe(
      "tes4_20"
    );

    expect(GAME_ARCHITECTURE_PRESETS.cyberpunk2077.time_capsule.save_airgap_targets).toEqual([
      "Cyberpunk 2077",
    ]);
    expect(GAME_ARCHITECTURE_PRESETS.cyberpunk2077.log_subdirs).toContain("r6/logs");

    expect(GAME_ARCHITECTURE_PRESETS.bg3.load_order.manifest_targets[0].format).toBe(
      "declarative_template"
    );
    expect(GAME_ARCHITECTURE_PRESETS.factorio.load_order.manifest_targets[0].relative_path).toBe(
      "mod-list.json"
    );
    expect(GAME_ARCHITECTURE_PRESETS.witcher3.load_order.manifest_targets[0].relative_path).toBe(
      "mods.settings"
    );
    expect(GAME_ARCHITECTURE_PRESETS.eldenring.load_order.manifest_targets[0].format).toBe(
      "toml_array_table"
    );
    expect(GAME_ARCHITECTURE_PRESETS.eldenring.time_capsule.save_airgap_targets).toEqual(["*"]);
    expect(GAME_ARCHITECTURE_PRESETS.rdr2.load_order.manifest_targets[0].relative_path).toBe(
      "lml/mods.xml"
    );

    for (const bepId of ["valheim", "lethalcompany", "riskofrain2"]) {
      const p = GAME_ARCHITECTURE_PRESETS[bepId];
      expect(p.extensions.relative_root_anchors).toContain("BepInEx/plugins");
      const doorstopRoute = p.install_routes.find((r: any) => r.id === "doorstop_root");
      expect(doorstopRoute?.file_names).toContain("winhttp.dll");
    }

    expect(GAME_ARCHITECTURE_PRESETS.palworld.extensions.supported).not.toContain(".sav");
    expect(GAME_ARCHITECTURE_PRESETS.palworld.extensions.twin_extensions).toContainEqual([
      ".utoc",
      ".ucas",
    ]);
    expect(GAME_ARCHITECTURE_PRESETS.palworld.version_extraction.fallback_paths).toContain(
      "Build/Build.version"
    );
  });

  it("syncs bundled sims4.json, stardew.json, default.json, schema.json & preserves exception_rules in getSafeSchema", () => {
    for (const s4 of [GAME_ARCHITECTURE_PRESETS.sims4, sims4Bundled]) {
      expect(s4.extensions.supported).not.toContain(".zip");
      expect(s4.extensions.supported).not.toContain(".rar");
      expect(s4.extensions.supported).not.toContain(".7z");
      expect(s4.extensions.supported).toContain(".trayitem");
      expect(s4.install_routes.some((r: any) => r.target_subdir === "Tray")).toBe(true);
    }

    expect(stardewBundled.mod_unit_mode).toBe("folder");
    expect(stardewBundled.mod_unit_markers).toContain("manifest.json");
    expect(defaultBundled).toEqual(rootSchemaJson);
    expect(defaultBundled).toHaveProperty("mod_unit_mode");
    expect(defaultBundled).toHaveProperty("wine_dll_overrides");
    expect(defaultBundled.load_order).toHaveProperty("manifest_targets");

    const safe = getSafeSchema(
      {
        id: "custom_game",
        game_id: "custom_game",
        exception_rules: [{ id: "rule1", pattern: "MissingMesh" }],
        load_order: {
          strategy: "manifest_list",
          manifest_targets: [{ root_source: "docs_path", relative_path: "mods.txt", format: "plain_lines" }],
        },
      },
      "custom_game"
    );
    expect(safe.exception_rules).toEqual([{ id: "rule1", pattern: "MissingMesh" }]);
    expect(safe.load_order.manifest_targets).toHaveLength(1);
  });
});
