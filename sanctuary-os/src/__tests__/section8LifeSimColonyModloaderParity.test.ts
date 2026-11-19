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
import sims4Bundled from "../data/schemas/sims4.json";
import { GAME_ARCHITECTURE_PRESETS } from "../utils/gameArchitecturePresets";
import { getSafeSchema } from "../store";

describe("Section 8: Package/Life-Sim, Colony & Modloader Parity", () => {
  it("synchronizes default.json and root schema.json at v8 with neutral Section 8 defaults", () => {
    expect(defaultBundled).toEqual(rootSchemaJson);
    expect(defaultBundled.schema_version).toBe(8);
    expect(defaultBundled.paths.discover_steam_workshop).toBe(false);
    expect(defaultBundled.constraints.max_nested_archive_depth).toBe(0);
    expect(defaultBundled.constraints.max_depth_by_extension).toEqual({});
    expect(defaultBundled.deployment.post_deploy_hooks).toEqual([]);
    expect(defaultBundled.deployment.profile_isolated_dirs).toEqual([]);
    expect(defaultBundled.artifact_groups).toEqual([]);
    expect(defaultBundled.preview_extractors).toEqual([]);
    expect(defaultBundled.exception_correlation.enabled).toBe(false);
  });

  it("equips Sims 4 bundled schema & preset at v18 with per-ext depth, nested unpack, artifact groups, preview extractors, and exception correlation", () => {
    for (const target of [sims4Bundled, GAME_ARCHITECTURE_PRESETS.sims4]) {
      expect(target.schema_version).toBe(18);
      expect(target.constraints?.max_nested_archive_depth).toBe(2);
      expect(target.constraints?.max_depth_by_extension).toEqual({
        ".ts4script": 1,
        ".package": 5,
      });
      expect(Array.isArray(target.artifact_groups)).toBe(true);
      expect(target.artifact_groups[0]?.key_strategy).toBe("shared_hex_stem");
      expect(Array.isArray(target.preview_extractors)).toBe(true);
      expect(target.preview_extractors[0]?.scan_embedded_png_jpeg).toBe(true);
      expect(target.exception_correlation?.enabled).toBe(true);
    }
  });

  it("equips colony, compiler hook, and BepInEx profile isolation presets cleanly", () => {
    for (const id of ["rimworld", "citiesskylines2", "terraria"]) {
      expect(GAME_ARCHITECTURE_PRESETS[id].paths?.discover_steam_workshop).toBe(true);
    }

    const cpHooks = GAME_ARCHITECTURE_PRESETS.cyberpunk2077.deployment?.post_deploy_hooks;
    expect(Array.isArray(cpHooks)).toBe(true);
    expect(cpHooks[0]?.id).toBe("redmod_deploy");
    expect(cpHooks[0]?.optional_if_missing).toBe(true);

    for (const id of ["valheim", "lethalcompany", "riskofrain2"]) {
      const iso = GAME_ARCHITECTURE_PRESETS[id].deployment?.profile_isolated_dirs;
      expect(Array.isArray(iso)).toBe(true);
      expect(iso[0]?.id).toBe("bepinex_config");
    }
  });

  it("preserves and coerces Section 8 fields inside getSafeSchema without stripping", () => {
    const hydrated = getSafeSchema(
      {
        id: "sims4",
        game_id: "sims4",
        constraints: {
          max_folder_depth: "5",
          max_nested_archive_depth: "3",
          max_depth_by_extension: { ".ts4script": "1", ".package": "5" },
        },
        deployment: {
          post_deploy_hooks: [
            {
              id: "custom_hook",
              executable: "bin/compiler.exe",
              args: ["--deploy"],
              working_dir_source: "live_path",
            },
          ],
          profile_isolated_dirs: [
            { id: "cfg", root_source: "live_path", relative_path: "Loader/config" },
          ],
        },
        artifact_groups: [
          { id: "bundle", extensions: [".a", ".b"], key_strategy: "shared_stem" },
        ],
        preview_extractors: [
          { id: "thumb", extensions: [".a"], scan_embedded_png_jpeg: true },
        ],
        exception_correlation: {
          enabled: true,
          id_regexes: ["0x[0-9a-f]+"],
          match_chunk_keys: true,
          match_relative_paths: true,
        },
      },
      "sims4"
    );

    expect(hydrated.constraints.max_nested_archive_depth).toBe(3);
    expect(hydrated.constraints.max_depth_by_extension).toEqual({
      ".ts4script": 1,
      ".package": 5,
    });
    expect(hydrated.deployment.post_deploy_hooks[0].id).toBe("custom_hook");
    expect(hydrated.deployment.profile_isolated_dirs[0].relative_path).toBe("Loader/config");
    expect(hydrated.artifact_groups[0].key_strategy).toBe("shared_stem");
    expect(hydrated.preview_extractors[0].id).toBe("thumb");
    expect(hydrated.exception_correlation.enabled).toBe(true);
  });
});
