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

import defaultBundled from "../data/schemas/default.json";
import rootSchemaJson from "../../schema.json";
import { GAME_ARCHITECTURE_PRESETS } from "../utils/gameArchitecturePresets";
import { getSafeSchema } from "../store";
import { evalCondition } from "../app-modals/FomodInstallerSidePanel";

describe("Creation Engine, Unreal & Heavy-Modding Parity", () => {
  it("equips Creation Engine presets with runtime output capture, INI archive invalidation, and LOOT sources", () => {
    for (const id of ["skyrim", "fallout4", "starfield", "fnv", "oblivion"]) {
      const preset = GAME_ARCHITECTURE_PRESETS[id];
      expect(preset.deployment?.runtime_output_capture?.enabled).toBe(true);
      expect(preset.deployment?.runtime_output_capture?.target_vault_folder).toBe("_RuntimeOutput");
      expect(Array.isArray(preset.load_order?.external_rules_sources)).toBe(true);
      expect(preset.load_order.external_rules_sources.length).toBeGreaterThan(0);
    }

    expect(GAME_ARCHITECTURE_PRESETS.skyrim.deployment.ini_mutations.length).toBeGreaterThanOrEqual(2);
    expect(GAME_ARCHITECTURE_PRESETS.fallout4.deployment.ini_mutations.length).toBeGreaterThanOrEqual(2);
    expect(GAME_ARCHITECTURE_PRESETS.starfield.deployment.ini_mutations.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves deployment and external_rules_sources in getSafeSchema and syncs default schemas", () => {
    expect(defaultBundled).toEqual(rootSchemaJson);
    expect(defaultBundled).toHaveProperty("deployment");
    expect(defaultBundled.load_order).toHaveProperty("external_rules_sources");

    const custom = getSafeSchema(
      {
        id: "skyrim",
        game_id: "skyrim",
        deployment: {
          runtime_output_capture: {
            enabled: true,
            target_vault_folder: "_CustomOverwrite",
            watch_roots: ["mods_path"],
          },
          ini_mutations: [
            {
              root_source: "docs_path",
              relative_path: "Custom.ini",
              section: "Archive",
              key: "bInvalidateOlderFiles",
              value: "1",
            },
          ],
        },
        load_order: {
          strategy: "manifest_list",
          external_rules_sources: [{ id: "user_rules", relative_paths: ["userlist.yaml"] }],
        },
      },
      "skyrim"
    );

    expect(custom.deployment.runtime_output_capture.target_vault_folder).toBe("_CustomOverwrite");
    expect(custom.deployment.ini_mutations).toHaveLength(1);
    expect(custom.load_order.external_rules_sources[0].id).toBe("user_rules");
  });

  it("evaluates FOMOD version_dependency conditions inside composite trees", () => {
    expect(
      evalCondition(
        {
          kind: "composite",
          operator: "And",
          children: [
            { kind: "flag_dependency", flag: "MODE", value: "OK" },
            {
              kind: "version_dependency",
              target: "game",
              required_version: "1.6.1170",
              detected_version: "1.6.1170.0",
              satisfied: true,
            },
          ],
        },
        { MODE: "OK" }
      )
    ).toBe(true);

    expect(
      evalCondition(
        {
          kind: "version_dependency",
          target: "game",
          required_version: "1.6.1170",
          detected_version: "1.5.97",
          satisfied: false,
        },
        {}
      )
    ).toBe(false);
  });
});
