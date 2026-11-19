import { describe, it, expect } from "vitest";
import {
  buildSanctuaryBlueprintLockfile,
  isSanctuaryBlueprintLockfile,
  extractLockfileHydrationPlan,
  normalizeReleaseChannel,
  resolveChannelDisplayOrder,
  type BlueprintVaultLockState,
} from "../utils/blueprintLockfile";

describe("Deterministic Blueprint Lockfiles & Mason Release Channels", () => {
  it("builds sanctuary-blueprint.lock.json v1.0 with FOMOD choices, hidden files & Workbench config deltas", () => {
    const exportBase = {
      sanctuary_profile: true,
      name: "Heavy Loadout",
      game_id: "universal_rpg",
      mods: [
        {
          name: "CoolFramework/framework.bin",
          hash: "sha_framework_1",
          version: "2.1.0",
          download_url: "https://cdn.example.org/framework.zip",
          manifest_url: "https://cdn.example.org/.sanctuary.manifest.json",
          channel: "Beta",
        },
        {
          name: "GatedOverhaul/overhaul.bin",
          hash: "sha_overhaul_2",
          url: "https://nexusmods.com/game/mods/999",
        },
      ],
    };

    const vaultLockState: BlueprintVaultLockState = {
      mod_entries: {
        CoolFramework: {
          fomod_wizard_kind: "fomod",
          fomod_selections: ["s0_g0_o1", "s1_g0_o0"],
          hidden_files: ["textures/unused_optional.dds"],
        },
      },
      config_deltas: [
        {
          rel_path: "CoolFramework/config/settings.json",
          sha256: "cfg_sha_1",
          content: '{"difficulty":"hardcore"}',
        },
      ],
    };

    const lockfile = buildSanctuaryBlueprintLockfile({
      exportBase,
      vaultLockState,
      hiddenFilesMap: {
        GatedOverhaul: ["readme_bloat.txt"],
      },
    });

    expect(isSanctuaryBlueprintLockfile(lockfile)).toBe(true);
    expect(lockfile.sanctuary_lockfile_version).toBe("1.0");
    expect(lockfile.artifacts).toHaveLength(2);
    expect(lockfile.artifacts[0].channel).toBe("beta");
    expect(lockfile.artifacts[0].fomod_selections).toEqual(["s0_g0_o1", "s1_g0_o0"]);
    expect(lockfile.artifacts[0].hidden_files).toEqual(["textures/unused_optional.dds"]);
    expect(lockfile.artifacts[1].hidden_files).toEqual(["readme_bloat.txt"]);
    expect(lockfile.config_deltas).toHaveLength(1);
    expect(lockfile.config_deltas[0].rel_path).toBe("CoolFramework/config/settings.json");

    const plan = extractLockfileHydrationPlan(
      {
        artifacts: lockfile.artifacts,
        configDeltas: lockfile.config_deltas,
      },
      [
        { name: "CoolFramework/framework.bin", hash: "sha_framework_1" },
        { name: "GatedOverhaul/overhaul.bin", hash: "sha_overhaul_2" },
      ]
    );

    expect(plan.items).toHaveLength(2);
    expect(plan.items[0].download_url).toBe("https://cdn.example.org/framework.zip");
    expect(plan.items[0].expected_sha256).toBe("sha_framework_1");
    expect(plan.items[0].target_folder).toBe("CoolFramework");
    expect(plan.items[0].fomod_selections).toEqual(["s0_g0_o1", "s1_g0_o0"]);
    expect(plan.items[1].download_url).toBe("https://nexusmods.com/game/mods/999");
    expect(plan.items[1].hidden_files).toEqual(["readme_bloat.txt"]);
    expect(plan.configDeltas).toHaveLength(1);
  });

  it("normalizes release channels and preserves deterministic channel display order", () => {
    expect(normalizeReleaseChannel("ALPHA")).toBe("alpha");
    expect(normalizeReleaseChannel(" Beta ")).toBe("beta");
    expect(normalizeReleaseChannel("nightly")).toBe("stable");
    expect(normalizeReleaseChannel(undefined)).toBe("stable");

    expect(
      resolveChannelDisplayOrder({
        alpha: { version: "3.0.0-alpha.1" },
        stable: { version: "2.4.0" },
      })
    ).toEqual(["stable", "alpha"]);
    expect(resolveChannelDisplayOrder(null)).toEqual(["stable"]);
  });
});
