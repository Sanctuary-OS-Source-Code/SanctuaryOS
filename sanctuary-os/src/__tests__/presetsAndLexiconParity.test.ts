import { describe, expect, it } from "vitest";
import { GAME_ARCHITECTURE_PRESETS } from "../utils/gameArchitecturePresets";
import { CORE_GLOSSARY_TERMS, interpolateGlossaryTokens } from "../utils/glossaryInterpolator";

async function loadNodeFsAndProjectRoot() {
  const fsMod = "node:fs";
  const pathMod = "node:path";
  const fs: any = await import(/* @vite-ignore */ fsMod);
  const path: any = await import(/* @vite-ignore */ pathMod);
  const cwd = (globalThis as any).process.cwd();
  const root = fs.existsSync(path.resolve(cwd, "src/lexicons/en-default.json"))
    ? cwd
    : path.resolve(cwd, "sanctuary-os");
  return { fs, path, root };
}

describe("27 Engine Presets & Lexicon Sparse-Delta Parity", () => {
  it("validates all 27 architectural presets have unique IDs, valid load-order strategies, and clean extension descriptors", () => {
    const entries = Object.entries(GAME_ARCHITECTURE_PRESETS);
    expect(entries).toHaveLength(27);

    const seenIds = new Set<string>();
    const validStrategies = new Set(["folder_priority", "manifest_list", "numeric_prefix", "timestamp"]);
    const disallowedWrapperExts = new Set([".7z", ".rar"]);

    for (const [key, preset] of entries) {
      expect(preset.id).toBeTruthy();
      expect(preset.id).toBe(key);
      expect(seenIds.has(preset.id)).toBe(false);
      seenIds.add(preset.id);

      expect(typeof preset.display_name).toBe("string");
      expect(preset.display_name.length).toBeGreaterThan(0);

      if (key !== "universal") {
        expect(Array.isArray(preset.executable_names)).toBe(true);
        expect(preset.executable_names.length).toBeGreaterThan(0);
      }

      expect(Array.isArray(preset.extensions?.supported)).toBe(true);
      if (key !== "universal") {
        expect(preset.extensions.supported.length).toBeGreaterThan(0);
      }
      for (const ext of preset.extensions.supported) {
        expect(disallowedWrapperExts.has(String(ext).toLowerCase())).toBe(false);
      }

      expect(validStrategies.has(preset.load_order?.strategy)).toBe(true);
      expect(typeof preset.paths?.default_mod_dir_windows).toBe("string");
    }
  });

  it("interpolates {Glossary} tokens with casing, indefinite articles, definite deduplication, and attributive rules", () => {
    const sanctuaryDict = {
      term_mod: "Artifact",
      term_mods: "Artifacts",
      term_nexus: "The Nexus",
      term_vault: "Vault",
    };
    expect(
      interpolateGlossaryTokens("Install a {mod} from your {nexus}", sanctuaryDict, "en-sanctuary")
    ).toBe("Install an artifact from your nexus");

    expect(
      interpolateGlossaryTokens("Install a {Mod} from your {Nexus}", sanctuaryDict, "en-sanctuary")
    ).toBe("Install an Artifact from your Nexus");

    expect(
      interpolateGlossaryTokens("Visit the {Nexus} {Vault}", sanctuaryDict, "en-sanctuary")
    ).toBe("Visit The Nexus Vault");

    expect(CORE_GLOSSARY_TERMS.length).toBeGreaterThanOrEqual(15);
  });

  it("enforces Sparse Delta Lexicon invariants across en-default and delta theme packs", async () => {
    const { fs, path, root } = await loadNodeFsAndProjectRoot();
    const lexDir = path.resolve(root, "src/lexicons");
    const enDefault = JSON.parse(fs.readFileSync(path.join(lexDir, "en-default.json"), "utf8"));

    expect(Object.keys(enDefault).length).toBeGreaterThan(7000);

    // No redundant icon_<glyph> === <glyph> entries inside en-default
    for (const [k, v] of Object.entries(enDefault)) {
      if (k.startsWith("icon_")) {
        expect(v).not.toBe(k.slice(5));
      }
    }

    for (const packFile of ["en-sanctuary.json", "en-sims.json", "Simlish.json"]) {
      const pack = JSON.parse(fs.readFileSync(path.join(lexDir, packFile), "utf8"));
      const duplicateEntries = Object.entries(pack).filter(
        ([k, v]) => !k.startsWith("_meta") && !k.startsWith("term_") && v === enDefault[k]
      );
      expect(duplicateEntries).toEqual([]);
    }
  });
});
