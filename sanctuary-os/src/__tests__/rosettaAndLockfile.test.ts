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

import { translateExternalModlistToBlueprint } from "../utils/jsonAssetDropInstaller";
import {
  buildSanctuaryBlueprintLockfile,
  extractLockfileHydrationPlan,
  isSanctuaryBlueprintLockfile,
  normalizeReleaseChannel,
  resolveChannelDisplayOrder,
} from "../utils/blueprintLockfile";

describe("Rosetta Modlist Translator & Blueprint Lockfile Hydration", () => {
  it("translates Modrinth .mrpack, CurseForge manifest.json, Nexus collection.json, and Wabbajack modlists", () => {
    const mrpack = translateExternalModlistToBlueprint("synth-pack.mrpack", {
      formatVersion: 1,
      name: "Synthetic Pack",
      summary: "Universal runtime pack",
      files: [
        {
          path: "mods/alpha_module.modbin",
          hashes: { sha256: "abc123sha" },
          downloads: ["https://cdn.example.com/alpha_module.modbin"],
        },
      ],
    });
    expect(mrpack?.sanctuary_profile).toBe(true);
    expect(mrpack?.source_format).toBe("mrpack");
    expect(mrpack?.modHashes?.["alpha_module.modbin"]).toBe("abc123sha");

    const curseforge = translateExternalModlistToBlueprint("manifest.json", {
      manifestType: "minecraftModpack",
      name: "CF Pack",
      author: "MasonA",
      version: "2.1.0",
      files: [{ projectID: 101, fileID: 202 }, { fileName: "custom_lib.plug" }],
    });
    expect(curseforge?.source_format).toBe("curseforge");
    expect(curseforge?.mods).toEqual(["curseforge-101-202", "custom_lib.plug"]);

    const collection = translateExternalModlistToBlueprint("collection.json", {
      info: { name: "Edge Collection", author: "Curator" },
      mods: [
        {
          source: {
            logicalFilename: "patch_a.modbin",
            md5: "deadbeefmd5",
            url: "https://cdn.example.com/patch_a.modbin",
          },
        },
      ],
      modRules: [
        {
          source: { logicalFilename: "patch_a.modbin" },
          reference: { logicalFilename: "base_b.modbin" },
          type: "after",
        },
      ],
    });
    expect(collection?.source_format).toBe("nexus_collection");
    expect(collection?.loadRules).toHaveLength(1);
    expect(collection?.loadRules?.[0]).toMatchObject({
      modA: "patch_a.modbin",
      modB: "base_b.modbin",
      type: "after",
    });

    const wabbajack = translateExternalModlistToBlueprint("modlist", {
      Name: "Universal WJ List",
      Author: "Builder",
      Version: "1.4",
      ModListType: 1,
      Archives: [
        {
          Name: "wj_texture_pack.modbin",
          Hash: "wjhash==",
          State: { Url: "https://cdn.example.com/wj_texture_pack.modbin" },
        },
      ],
    });
    expect(wabbajack?.source_format).toBe("wabbajack");
    expect(wabbajack?.modHashes?.["wj_texture_pack.modbin"]).toBe("wjhash==");
  });

  it("builds deterministic .sanctuary-blueprint.lock.json payloads and resolves hydration plans", () => {
    const lockfile = buildSanctuaryBlueprintLockfile({
      exportBase: {
        sanctuary_profile: true,
        name: "Rig Zero",
        mods: [
          {
            id: "mod-uuid-1",
            name: "VisualSuite/core_fx.modbin",
            hash: "sha_fx_01",
            url: "https://cdn.example.com/core_fx.modbin",
            channel: "BETA",
          },
        ],
      },
      vaultLockState: {
        mod_entries: {
          VisualSuite: {
            fomod_wizard_kind: "fomod",
            fomod_selections: ["s0_g0_o1", "s1_g0_o0"],
            hidden_files: ["optional/unwanted.cfg"],
          },
        },
        config_deltas: [
          {
            rel_path: "VisualSuite/settings.cfg",
            sha256: "cfg_sha_01",
            content: "enable_bloom=true\n",
          },
        ],
      },
      hiddenFilesMap: {
        "VisualSuite/core_fx.modbin": ["legacy/duplicate.modbin"],
      },
    });

    expect(isSanctuaryBlueprintLockfile(lockfile)).toBe(true);
    expect(lockfile.sanctuary_lockfile_version).toBe("1.0");
    expect(lockfile.artifacts[0].channel).toBe("beta");
    expect(lockfile.artifacts[0].fomod_selections).toEqual(["s0_g0_o1", "s1_g0_o0"]);
    expect(lockfile.artifacts[0].hidden_files).toEqual([
      "optional/unwanted.cfg",
      "legacy/duplicate.modbin",
    ]);

    const plan = extractLockfileHydrationPlan(lockfile, [
      { name: "VisualSuite/core_fx.modbin", hash: "SHA_FX_01" },
    ]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({
      id: "mod-uuid-1",
      download_url: "https://cdn.example.com/core_fx.modbin",
      expected_sha256: "SHA_FX_01",
      target_folder: "VisualSuite",
      fomod_selections: ["s0_g0_o1", "s1_g0_o0"],
      hidden_files: ["optional/unwanted.cfg", "legacy/duplicate.modbin"],
    });
    expect(plan.configDeltas).toHaveLength(1);

    expect(normalizeReleaseChannel("Alpha")).toBe("alpha");
    expect(normalizeReleaseChannel("unknown")).toBe("stable");
    expect(resolveChannelDisplayOrder({ alpha: {}, stable: {} })).toEqual(["stable", "alpha"]);
  });
});
