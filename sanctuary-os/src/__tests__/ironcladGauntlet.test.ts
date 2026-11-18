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

import { interpolateGlossaryTokens } from "../LexiconContext";
import { parseLootRulesText } from "../hooks/playset/lootRuleParser";
import { extractSuggestedPatternFromLog } from "../components/exception-rules/ruleStoreAndMatcher";
import { parseUplinkBundle } from "../supabase";
import { translateExternalModlistToBlueprint } from "../utils/jsonAssetDropInstaller";
import {
  GAME_ARCHITECTURE_PRESETS,
  resolvePresetForGameId,
} from "../utils/gameArchitecturePresets";

describe("Ironclad Gauntlet — Core Engine & Parity Regression Suite", () => {
  it("interpolates {Glossary} tokens with casing and indefinite article grammar", () => {
    const sanctuaryDict = {
      term_mod: "Artifact",
      term_mods: "Artifacts",
      term_vault: "Vault",
      term_blueprint: "Blueprint",
    };

    expect(
      interpolateGlossaryTokens("Deploy {Mod} or a {mod} to your {Vault} and update {MODS}.", sanctuaryDict)
    ).toBe("Deploy Artifact or an artifact to your Vault and update ARTIFACTS.");

    const modDict = {
      term_mod: "Mod",
      term_mods: "Mods",
      term_vault: "Library",
    };
    expect(
      interpolateGlossaryTokens("Remove an {mod} from your {Vault}.", modDict, "en-default")
    ).toBe("Remove a mod from your Library.");
  });

  it("parses LOOT userlist YAML and JSON rules into directional Sanctuary rules", () => {
    const yamlSample = `
plugins:
  - name: 'LatePatch.mod'
    after:
      - 'CoreMaster.mod'
      - 'Overhaul.mod'
    before: ['FinalFix.mod']
`;
    const parsedYaml = parseLootRulesText(yamlSample);
    expect(parsedYaml).toEqual([
      { modA: "LatePatch.mod", modB: "CoreMaster.mod", type: "after" },
      { modA: "LatePatch.mod", modB: "Overhaul.mod", type: "after" },
      { modA: "LatePatch.mod", modB: "FinalFix.mod", type: "before" },
    ]);

    const jsonSample = JSON.stringify({
      rules: [
        { winner: "PatchA.dat", loser: "BaseB.dat" },
        { name: "AddonC.dat", after: ["PatchA.dat"] },
      ],
    });
    const parsedJson = parseLootRulesText(jsonSample);
    expect(parsedJson).toEqual([
      { modA: "PatchA.dat", modB: "BaseB.dat", type: "after" },
      { modA: "AddonC.dat", modB: "PatchA.dat", type: "after" },
    ]);
  });

  it("extracts exception patterns generically across XML, bracket logs, and schema UI markers", () => {
    const genericSchema = {
      exception_logs: [
        { starts_with: "engine_fault", ends_with: ".log" },
        { exact: "ui_fault.log", content_markers: ["ui_widget_panic", "hud_overlay"] },
      ],
    };

    const xmlRes = extractSuggestedPatternFromLog(
      "<fault_category>audio_dsp::mixer</fault_category>\nNullReferenceException: missing buffer",
      genericSchema
    );
    expect(xmlRes.pattern).toBe("audio_dsp::mixer");
    expect(xmlRes.fileHint).toBe("engine_fault.log");

    const uiBracketRes = extractSuggestedPatternFromLog(
      "[UI] ERROR: ui_widget_panic inside hud_overlay",
      genericSchema
    );
    expect(uiBracketRes.pattern).toContain("ui_widget_panic");
    expect(uiBracketRes.fileHint).toBe("ui_fault.log");
  });

  it("parses valid SANCTUARY-UPLINK:// bundles and rejects malformed inputs", () => {
    const payload = {
      supabase_url: "https://example-spoke.supabase.co",
      supabase_anon_key: "sb_publishable_example_key_123456",
      schema_id: "community_spoke",
    };
    const b64 = btoa(JSON.stringify(payload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const parsed = parseUplinkBundle(`SANCTUARY-UPLINK://${b64}`);
    expect(parsed).not.toBeNull();
    expect(parsed.supabase_url).toBe("https://example-spoke.supabase.co");
    expect(parsed.supabase_anon_key).toBe("sb_publishable_example_key_123456");

    expect(parseUplinkBundle("")).toBeNull();
    expect(parseUplinkBundle("SANCTUARY-UPLINK://not-valid-base64!!!")).toBeNull();
    expect(parseUplinkBundle("https://unrelated.example.com")).toBeNull();
  });

  it("translates CurseForge, Modrinth, and Nexus Collections via Rosetta Protocol", () => {
    const nexusCol = translateExternalModlistToBlueprint("collection.json", {
      info: { name: "Hardcore Overhaul", author: "MasonOne" },
      mods: [
        { source: { logicalFilename: "BaseOverhaul.mod" }, domainName: "demo" },
        { source: { logicalFilename: "PatchCompat.mod" }, domainName: "demo" },
      ],
      modRules: [
        {
          type: "after",
          source: { logicalFilename: "PatchCompat.mod" },
          reference: { logicalFilename: "BaseOverhaul.mod" },
        },
      ],
    });
    expect(nexusCol?.sanctuary_profile).toBe(true);
    expect(nexusCol?.mods).toEqual(["BaseOverhaul.mod", "PatchCompat.mod"]);
    expect(nexusCol?.loadRules).toHaveLength(1);
    expect(nexusCol?.loadRules[0]).toMatchObject({
      modA: "PatchCompat.mod",
      modB: "BaseOverhaul.mod",
      type: "after",
    });

    const curseforge = translateExternalModlistToBlueprint("manifest.json", {
      name: "PackAlpha",
      minecraft: { version: "1.21" },
      files: [{ projectID: 101, fileID: 202, required: true }],
    });
    expect(curseforge?.sanctuary_profile).toBe(true);
    expect(curseforge?.mods).toHaveLength(1);
  });

  it("validates all 27 Master Schema architecture presets and alias routing", () => {
    const keys = Object.keys(GAME_ARCHITECTURE_PRESETS);
    expect(keys.length).toBeGreaterThanOrEqual(27);

    for (const key of keys) {
      const preset = GAME_ARCHITECTURE_PRESETS[key];
      expect(typeof preset.id).toBe("string");
      expect(preset.id.length).toBeGreaterThan(0);
      expect(typeof (preset.display_name || preset.name)).toBe("string");
      expect(preset.paths).toBeDefined();
      expect(typeof preset.paths.default_mod_dir_windows).toBe("string");
      expect(typeof preset.load_order?.strategy).toBe("string");
      expect(Array.isArray(preset.mod_categories)).toBe(true);
      expect(preset.mod_categories.length).toBeGreaterThan(0);
    }

    expect(resolvePresetForGameId("default").id).toBe("universal");
    expect(resolvePresetForGameId("sims4").id).toBe("sims4");
    expect(resolvePresetForGameId("stardew").id).toBe("stardew");
    expect(resolvePresetForGameId("fo4").id).toBe("fallout4");
    expect(resolvePresetForGameId("starfield").load_order?.slot_buckets?.some((b: any) => b.required_flag_mask === 2048)).toBe(true);
    expect(resolvePresetForGameId("ror2").id).toBe("riskofrain2");
    expect(resolvePresetForGameId("kcd2").id).toBe("kcd2");
  });
});
