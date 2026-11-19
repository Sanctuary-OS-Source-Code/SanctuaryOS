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
  getConfiguredUpdaterPubkey,
  resolveSanctuaryConfig,
  type SanctuaryForkOverlay,
} from "../supabase";

async function loadNodeHelpers() {
  const fsMod = "node:fs";
  const pathMod = "node:path";
  const urlMod = "node:url";
  const fs: any = await import(/* @vite-ignore */ fsMod);
  const path: any = await import(/* @vite-ignore */ pathMod);
  const { pathToFileURL }: any = await import(/* @vite-ignore */ urlMod);

  const nodeCwd = (globalThis as any).process.cwd();
  const projectRoot = fs.existsSync(path.resolve(nodeCwd, "scripts/configure-fork.mjs"))
    ? nodeCwd
    : path.resolve(nodeCwd, "sanctuary-os");
  const repoRoot = path.resolve(projectRoot, "..");

  const configureForkUrl = pathToFileURL(
    path.resolve(projectRoot, "scripts/configure-fork.mjs")
  ).href;
  const pullSchemasUrl = pathToFileURL(
    path.resolve(projectRoot, "scripts/pull-spoke-schemas.mjs")
  ).href;

  const configureFork: any = await import(/* @vite-ignore */ configureForkUrl);
  const pullSchemas: any = await import(/* @vite-ignore */ pullSchemasUrl);
  return { fs, path, projectRoot, repoRoot, configureFork, pullSchemas };
}

function encodeBase64UrlJson(obj: Record<string, any>): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("Zero-Conflict Fork CLI, Schema Pull Safety & CI Workflows", () => {
  it("validates fork configs, uplink bundles, and applies tauri.conf overlay immutably", async () => {
    const { configureFork } = await loadNodeHelpers();
    const validPubkey = btoa("untrusted comment: minisign public key: EXAMPLE00001\nRWTSamplePublicKeyBytes12345678901234567890=");
    const uplink = `SANCTUARY-UPLINK://${encodeBase64UrlJson({
      supabase_url: "https://community-spoke.supabase.co",
      supabase_anon_key: "sb_publishable_example_key",
      schema_id: "community-universal",
      name: "Community Hub",
      branding: {
        appTitle: "Community Sanctuary",
        githubReleaseRepo: "example-org/community-fork",
        webauthnRpId: "mods.example.org",
      },
    })}`;

    const parsedUplink = configureFork.parseUplinkBundleNode(uplink);
    expect(parsedUplink?.supabase_url).toBe("https://community-spoke.supabase.co");
    expect(configureFork.parseUplinkBundleNode("https://not-an-uplink")).toBeNull();

    const cfg = configureFork.buildAndValidateForkConfig({
      uplinkBundle: uplink,
      tauri: {
        identifier: "org.example.community-sanctuary",
        productName: "Community Sanctuary",
        updaterPubkey: validPubkey,
      },
    });
    expect(cfg.mode).toBe("standalone");
    expect(cfg.supabaseUrl).toBe("https://community-spoke.supabase.co");
    expect(cfg.branding.githubReleaseRepo).toBe("example-org/community-fork");
    expect(cfg.branding.webauthnRpId).toBe("mods.example.org");

    expect(() =>
      configureFork.buildAndValidateForkConfig({
        mode: "standalone",
        supabaseUrl: "http://127.0.0.1:54321",
        supabaseAnonKey: "local-key",
      })
    ).toThrow(/loopback|https/i);

    const localCfg = configureFork.buildAndValidateForkConfig(
      {
        mode: "standalone",
        supabaseUrl: "http://127.0.0.1:54321",
        supabaseAnonKey: "local-key",
      },
      { allowLocal: true }
    );
    expect(localCfg.supabaseUrl).toBe("http://127.0.0.1:54321");

    expect(() =>
      configureFork.buildAndValidateForkConfig({
        branding: { githubReleaseRepo: "../escape" },
      })
    ).toThrow(/Invalid GitHub release repository slug/i);

    expect(() =>
      configureFork.buildAndValidateForkConfig({
        branding: { webauthnRpId: "https://evil.org/path" },
      })
    ).toThrow(/Invalid webauthnRpId/i);

    const origTauri = {
      productName: "Sanctuary OS",
      identifier: "sanctuary-os",
      app: { windows: [{ title: "Sanctuary OS" }] },
      plugins: {
        updater: {
          endpoints: ["https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/latest/download/latest.json"],
          pubkey: "ORIG_KEY",
        },
      },
    };
    const ciPubkey = btoa("untrusted comment: minisign public key: CI0000000001\nRWTCustomCiKeyBytes123456789012345678901234=");
    const patched = configureFork.applyForkOverlayToTauriConf(origTauri, cfg, {
      TAURI_UPDATER_PUBKEY: ciPubkey,
      VITE_GITHUB_RELEASE_REPO: "ci-org/ci-fork",
    });

    expect(origTauri.productName).toBe("Sanctuary OS");
    expect(patched.productName).toBe("Community Sanctuary");
    expect(patched.identifier).toBe("org.example.community-sanctuary");
    expect(patched.app.windows[0].title).toBe("Community Sanctuary");
    expect(patched.plugins.updater.pubkey).toBe(ciPubkey);
    expect(patched.plugins.updater.endpoints).toEqual([
      "https://github.com/ci-org/ci-fork/releases/latest/download/latest.json",
    ]);
  });

  it("applies fork overlay precedence in supabase.ts without overwriting runtime uplinks", () => {
    const forkOverlay: SanctuaryForkOverlay = {
      mode: "standalone",
      supabaseUrl: "https://fork-db.supabase.co",
      supabaseAnonKey: "sb_publishable_fork",
      standaloneWorkspace: {
        id: "fork-ws",
        name: "Fork Workspace",
        schema_id: "universal",
        icon: "extension",
      },
      branding: {
        appTitle: "Fork Studio",
        orgName: "Fork Collective",
        githubReleaseRepo: "fork-org/fork-repo",
        webauthnRpId: "fork.example.org",
      },
      tauri: {
        updaterPubkey: "FORK_PUBKEY_BASE64",
      },
    };

    const resolved = resolveSanctuaryConfig(undefined, forkOverlay);
    expect(resolved.mode).toBe("standalone");
    expect(resolved.supabaseUrl).toBe("https://fork-db.supabase.co");
    expect(resolved.standaloneWorkspace.name).toBe("Fork Workspace");
    expect(resolved.branding.appTitle).toBe("Fork Studio");
    expect(resolved.branding.githubReleaseRepo).toBe("fork-org/fork-repo");
    expect(resolved.branding.webauthnRpId).toBe("fork.example.org");
    expect(getConfiguredUpdaterPubkey(forkOverlay)).toBe("FORK_PUBKEY_BASE64");
  });

  it("enforces SSRF URL filtering and JSON schema structure/size guards in pull-spoke-schemas", async () => {
    const { pullSchemas } = await loadNodeHelpers();

    expect(pullSchemas.isSafePublicHttpsUrl("https://example.supabase.co")).toBe(true);
    expect(pullSchemas.isSafePublicHttpsUrl("http://example.supabase.co")).toBe(false);
    expect(pullSchemas.isSafePublicHttpsUrl("https://user:pass@example.supabase.co")).toBe(false);
    expect(pullSchemas.isSafePublicHttpsUrl("https://localhost/rest/v1")).toBe(false);
    expect(pullSchemas.isSafePublicHttpsUrl("https://127.0.0.1/rest/v1")).toBe(false);
    expect(pullSchemas.isSafePublicHttpsUrl("https://169.254.169.254/latest")).toBe(false);
    expect(pullSchemas.isSafePublicHttpsUrl("https://10.0.0.5/rest/v1")).toBe(false);
    expect(pullSchemas.isSafePublicHttpsUrl("https://172.16.4.2/rest/v1")).toBe(false);
    expect(pullSchemas.isSafePublicHttpsUrl("https://192.168.1.50/rest/v1")).toBe(false);
    expect(pullSchemas.isSafePublicHttpsUrl("https://[::1]/rest/v1")).toBe(false);
    expect(pullSchemas.isSafePublicHttpsUrl("https://[fe80::1]/rest/v1")).toBe(false);

    expect(
      pullSchemas.validatePulledSchemaObject(
        { id: "universal", name: "Universal Game", schema_version: 2, extensions: {} },
        "universal"
      ).valid
    ).toBe(true);

    expect(pullSchemas.validatePulledSchemaObject(["not", "an", "object"], "universal").valid).toBe(false);

    const protoPolluted = JSON.parse('{"id":"universal","extensions":{"__proto__":{"polluted":true}}}');
    expect(pullSchemas.validatePulledSchemaObject(protoPolluted, "universal").valid).toBe(false);

    expect(pullSchemas.validatePulledSchemaObject({ id: "../escape" }, "../escape").valid).toBe(false);

    const hugeSchema = {
      id: "huge",
      blob: "x".repeat(pullSchemas.MAX_SCHEMA_JSON_BYTES + 1024),
    };
    expect(pullSchemas.validatePulledSchemaObject(hugeSchema, "huge").valid).toBe(false);
  });

  it("enforces CI workflow gates, removes Ubuntu toolchain PPA, and constructs canonical release URLs", async () => {
    const { fs, path, repoRoot } = await loadNodeHelpers();

    const ciYml = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    const devYml = fs.readFileSync(path.join(repoRoot, ".github/workflows/dev-build.yml"), "utf8");
    const relYml = fs.readFileSync(path.join(repoRoot, ".github/workflows/release.yml"), "utf8");

    expect(ciYml).toContain("pull_request:");
    expect(ciYml).toContain("npm run lexicon:sync -- --check");
    expect(ciYml).toContain("npx tsc --noEmit");
    expect(ciYml).toContain("npx tsc -p supabase/functions/tsconfig.json --noEmit");
    expect(ciYml).toContain("cargo test");
    expect(ciYml).toContain("Swatinem/rust-cache@v2");
    expect(ciYml).not.toContain("ppa:ubuntu-toolchain-r/test");

    for (const wf of [devYml, relYml]) {
      expect(wf).not.toContain("ppa:ubuntu-toolchain-r/test");
      expect(wf).not.toContain('asset.url.includes("/releases/download/")');
      expect(wf).toContain("/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}");
      expect(wf).toContain("npm ci");
      expect(wf).toContain("Swatinem/rust-cache@v2");
      expect(wf).toContain("npm run lexicon:sync -- --check");
      expect(wf).toContain("Configure Windows Authenticode Signing");
      expect(wf).toContain("Verify Apple Developer signing configuration");
      expect(wf).toContain("Resolve release metadata safely");
      expect(wf).toContain("node scripts/configure-fork.mjs --apply-ephemeral-tauri-conf");
    }
  });
});
