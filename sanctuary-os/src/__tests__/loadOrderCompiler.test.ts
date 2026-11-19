import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const memStore = new Map<string, string>();
  const storageStub = {
    getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
    setItem: (k: string, v: string) => {
      memStore.set(String(k), String(v));
    },
    removeItem: (k: string) => {
      memStore.delete(String(k));
    },
    clear: () => memStore.clear(),
  };
  if (typeof globalThis.localStorage === "undefined") {
    (globalThis as any).localStorage = storageStub;
  }
  if (typeof globalThis.sessionStorage === "undefined") {
    (globalThis as any).sessionStorage = storageStub;
  }
});

import {
  compileLoadOrder,
  packageBlueprintLoadOrder,
  unpackBlueprintLoadOrder,
} from "../hooks/playset/loadOrderCompiler";
import { parseLootRulesText } from "../hooks/playset/lootRuleParser";

const SYNTHETIC_SCHEMA = {
  id: "synthetic_engine",
  extensions: { supported: [".modbin", ".plug", ".cfg"] },
  load_order: {
    strategy: "folder_priority",
    direction: "higher_wins",
    priority_tiers: [
      { id: "base", label: "Base Modules", folder: "00_Base", priority: 100 },
      { id: "mid", label: "Feature Modules", folder: "50_Features", priority: 500 },
      { id: "over", label: "Overrides", folder: "90_Overrides", priority: 900 },
    ],
  },
};

describe("Load Order Compiler & LOOT Rule Ingestion", () => {
  it("resolves directional DAG rules and promotes dependent winners across folder_priority tiers", () => {
    const res = compileLoadOrder(
      ["50_Features/weather.modbin", "50_Features/lighting.modbin", "00_Base/core_fix.modbin"],
      [
        {
          id: "r_after",
          modA: "core_fix.modbin",
          modB: "weather.modbin",
          type: "after",
        },
        {
          id: "r_before",
          modA: "lighting.modbin",
          modB: "weather.modbin",
          type: "before",
        },
      ],
      {},
      ["weather.modbin", "lighting.modbin", "core_fix.modbin"],
      SYNTHETIC_SCHEMA,
      [],
      true
    );

    const names = res.items.map((item) => item.cleanName);
    expect(names.indexOf("lighting.modbin")).toBeLessThan(names.indexOf("weather.modbin"));
    expect(names.indexOf("weather.modbin")).toBeLessThan(names.indexOf("core_fix.modbin"));

    const promotedCoreFix = res.items.find((i) => i.cleanName === "core_fix.modbin");
    expect(promotedCoreFix?.autoPromoted).toBe(true);
    expect(promotedCoreFix?.tierFolder).toBe("90_Overrides");
    expect(res.cycles).toHaveLength(0);
  });

  it("breaks cyclic load rules cleanly without losing items or stalling", () => {
    const res = compileLoadOrder(
      ["alpha.plug", "beta.plug", "gamma.plug"],
      [
        { id: "c1", modA: "beta.plug", modB: "alpha.plug", type: "after" },
        { id: "c2", modA: "alpha.plug", modB: "beta.plug", type: "after" },
      ],
      {},
      [],
      SYNTHETIC_SCHEMA,
      [],
      true
    );

    expect(res.items).toHaveLength(3);
    expect(res.cycles.length).toBeGreaterThan(0);
    expect(new Set(res.items.map((i) => i.cleanName))).toEqual(
      new Set(["alpha.plug", "beta.plug", "gamma.plug"])
    );
  });

  it("formats numeric_prefix, manifest_list, and timestamp strategies according to schema", () => {
    const numSchema = {
      ...SYNTHETIC_SCHEMA,
      load_order: { strategy: "numeric_prefix", direction: "higher_wins", prefix_format: "{index:03}_" },
    };
    const numRes = compileLoadOrder(["first.plug", "second.plug"], [], {}, [], numSchema, [], true);
    expect(numRes.items[0].previewPath).toBe("001_first.plug");
    expect(numRes.items[1].previewPath).toBe("002_second.plug");

    const manSchema = {
      ...SYNTHETIC_SCHEMA,
      load_order: {
        strategy: "manifest_list",
        direction: "lower_wins",
        manifest_file: "modules_order.txt",
      },
    };
    const manRes = compileLoadOrder(["first.plug"], [], {}, [], manSchema, [], true);
    expect(manRes.direction).toBe("lower_wins");
    expect(manRes.manifestFile).toBe("modules_order.txt");
    expect(manRes.items[0].previewPath).toBe("modules_order.txt #001 ➔ first.plug");

    const tsSchema = {
      ...SYNTHETIC_SCHEMA,
      load_order: { strategy: "timestamp", direction: "higher_wins" },
    };
    const tsRes = compileLoadOrder(["first.plug"], [], {}, [], tsSchema, [], true);
    expect(tsRes.strategy).toBe("timestamp");
    expect(tsRes.manifestFile).toBe("mtime");
  });

  it("parses YAML and JSON LOOT rules and round-trips blueprint load order payloads", () => {
    const yamlRules = parseLootRulesText(`
plugins:
  - name: "weather_patch.modbin"
    after: [base_weather.modbin] # ensure weather_patch overrides
    req:
      - 'framework_core.plug'
  - name: "lighting_base.modbin"
    before: "weather_patch.modbin"
`);

    expect(yamlRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modA: "weather_patch.modbin", modB: "base_weather.modbin", type: "after" }),
        expect.objectContaining({ modA: "weather_patch.modbin", modB: "framework_core.plug", type: "after" }),
        expect.objectContaining({ modA: "lighting_base.modbin", modB: "weather_patch.modbin", type: "before" }),
      ])
    );

    const packed = packageBlueprintLoadOrder(
      {
        mods: ["00_Base/framework_core.plug", "50_Features/base_weather.modbin", "90_Overrides/weather_patch.modbin"],
        loadRules: yamlRules.map((r, i) => ({ id: `loot_${i}`, ...r })),
        modTiers: { "weather_patch.modbin": "90_Overrides" },
        ignoredConflicts: ["base_weather.modbin::lighting_base.modbin"],
      },
      SYNTHETIC_SCHEMA
    );

    const unpacked = unpackBlueprintLoadOrder(
      {
        mods: packed.load_order,
        mod_tiers: packed.mod_tiers,
        load_rules: packed.load_rules,
        load_order: packed.load_order,
        ignored_conflicts: packed.ignored_conflicts,
      },
      undefined,
      SYNTHETIC_SCHEMA
    );

    expect(unpacked.loadRules).toHaveLength(3);
    expect(unpacked.ignoredConflicts).toEqual(["base_weather.modbin::lighting_base.modbin"]);
    expect(unpacked.formatModWithTier("weather_patch.modbin")).toBe("90_Overrides/weather_patch.modbin");
  });
});
