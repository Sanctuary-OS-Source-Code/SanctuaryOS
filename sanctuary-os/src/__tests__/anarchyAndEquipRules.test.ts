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
  if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = globalThis;
  }
  if (typeof (globalThis as any).window.dispatchEvent !== "function") {
    (globalThis as any).window.dispatchEvent = () => true;
  }
  if (typeof (globalThis as any).window.addEventListener !== "function") {
    (globalThis as any).window.addEventListener = () => {};
  }
});

import {
  deduplicateBlueprintArtifacts,
  filterBlueprintModArtifacts,
  resolveModHighlanderSlot,
  stripPriorityTierPrefix,
} from "../shared";
import { executeConflictOverride } from "../hooks/playset/conflictOverrideEngine";
import { parseConflictPairNames } from "../hooks/playset/conflictPrecomputer";
import { useStore } from "../store";

const SYNTHETIC_SCHEMA = {
  id: "synthetic_engine",
  extensions: { supported: [".modbin", ".plug"] },
  paths: { manifest_file: "modules.cfg" },
  load_order: {
    manifest_file: "loadorder.cfg",
    priority_tiers: [
      { id: "base", folder: "00_Base", priority: 100 },
      { id: "override", folder: "90_Override", priority: 900 },
    ],
  },
};

describe("Anarchy Safeguards, Highlander Slots & Conflict Override Rules", () => {
  it("resolves Highlander exclusive slot keys from direct and nested atomic_logic fields", () => {
    expect(resolveModHighlanderSlot({ highlanderSlotKey: "slot_lighting" })).toMatchObject({
      key: "slot-lighting",
    });
    expect(
      resolveModHighlanderSlot({ atomic_logic: { highlander_group: "ui_hud_framework" } })
    ).toMatchObject({
      key: "ui-hud-framework",
    });
    expect(
      resolveModHighlanderSlot({
        edgeManifest: { atomic_logic: { exclusive_slot: "weather_controller" } },
      })
    ).toMatchObject({
      key: "weather-controller",
    });
    expect(resolveModHighlanderSlot({ name: "plain_mod.modbin" })).toBeNull();
  });

  it("strips schema priority tier prefixes and deduplicates Blueprint artifact lists", () => {
    expect(stripPriorityTierPrefix("90_Override/lighting_fix.modbin", SYNTHETIC_SCHEMA)).toBe(
      "lighting_fix.modbin"
    );
    expect(stripPriorityTierPrefix("CustomDir/lighting_fix.modbin", SYNTHETIC_SCHEMA)).toBe(
      "CustomDir/lighting_fix.modbin"
    );

    const deduped = deduplicateBlueprintArtifacts(
      [
        "00_Base/shader_patch.modbin",
        "90_Override/shader_patch.modbin",
        "FOLDER_EMPTY",
        "modules.cfg",
      ],
      SYNTHETIC_SCHEMA
    );
    expect(deduped).toEqual(["90_Override/shader_patch.modbin", "modules.cfg"]);

    const filtered = filterBlueprintModArtifacts(
      ["90_Override/shader_patch.modbin", "modules.cfg", "loadorder.cfg"],
      SYNTHETIC_SCHEMA
    );
    expect(filtered).toEqual(["90_Override/shader_patch.modbin"]);
  });

  it("executes conflict overrides by updating tier priority, replacing loadRules, and ignoring pair", () => {
    let playSetsState = [
      {
        name: "Primary Rig",
        mods: ["00_Base/alpha.modbin", "00_Base/beta.modbin"],
        modTiers: { "alpha.modbin": "00_Base", "beta.modbin": "00_Base" },
        loadRules: [{ id: "old_rule", modA: "beta.modbin", modB: "alpha.modbin", type: "after" }],
        ignoredConflicts: [] as string[],
      },
    ];
    let globalIgnored: string[] = [];

    const applied = executeConflictOverride(
      SYNTHETIC_SCHEMA,
      (updater: (prev: typeof playSetsState) => typeof playSetsState) => {
        playSetsState = updater(playSetsState);
      },
      (updater: (prev: string[]) => string[]) => {
        globalIgnored = updater(globalIgnored);
      },
      "alpha.modbin",
      "alpha.modbin::beta.modbin",
      "Primary Rig",
      "90_Override",
      "beta.modbin"
    );

    expect(applied).toBe(true);
    expect(playSetsState[0].modTiers["alpha.modbin"]).toBe("90_Override");
    expect(playSetsState[0].mods).toContain("90_Override/alpha.modbin");
    expect(playSetsState[0].loadRules).toHaveLength(1);
    expect(playSetsState[0].loadRules[0]).toMatchObject({
      modA: "alpha.modbin",
      modB: "beta.modbin",
      type: "after",
    });
    expect(playSetsState[0].ignoredConflicts).toContain("alpha.modbin::beta.modbin");
    expect(globalIgnored).toContain("alpha.modbin::beta.modbin");
    expect(parseConflictPairNames({ mod_pair: "alpha.modbin ⚡ beta.modbin" })).toEqual([
      "alpha.modbin",
      "beta.modbin",
    ]);
  });

  it("persists anarchy rule toggles cleanly in the Zustand store", () => {
    const initial = { ...useStore.getState().anarchyRules };
    useStore.getState().setAnarchyRules({ ...initial, highlander: false, intercept: false });
    expect(useStore.getState().anarchyRules.highlander).toBe(false);
    expect(useStore.getState().anarchyRules.intercept).toBe(false);
    useStore.getState().setAnarchyRules(initial);
  });
});
