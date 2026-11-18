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

import { parseDeepLinkItem } from "../utils/deepLinkParser";

describe("Tri-OS Deep-Link Parser", () => {
  it("parses sanctuary:// direct HTTPS install payloads with sha256 and target metadata", () => {
    const uri =
      "sanctuary://install?url=https%3A%2F%2Fcdn.example.com%2Fmods%2Fpack.zip&sha256=deadbeef&name=pack.zip&folder=Overrides";
    const parsed = parseDeepLinkItem(uri, "Artifact");
    expect(parsed).toEqual({
      kind: "direct_https_install",
      scheme: "sanctuary",
      targetUrl: "https://cdn.example.com/mods/pack.zip",
      host: "cdn.example.com",
      labelName: "pack.zip",
      suggestedName: "pack.zip",
      targetFolder: "Overrides",
      expectedSha256: "deadbeef",
    });
  });

  it("parses sanctuary-uplink:// bundles and extracts target Supabase hostname", () => {
    const payload = btoa(
      JSON.stringify({
        supabase_url: "https://spoke-hub.example.supabase.co",
        supabase_anon_key: "anon-key-token",
      })
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const uri = `sanctuary-uplink://${payload}`;
    expect(parseDeepLinkItem(uri)).toEqual({
      kind: "uplink_prompt",
      rawUri: uri,
      supabaseHost: "spoke-hub.example.supabase.co",
    });
  });

  it("strips CLI quotes and preserves nxm:// fileId in Guided Browser URL", () => {
    const parsed = parseDeepLinkItem('"nxm://sampledomain/mods/42/files/999?key=abc&expires=123"');
    expect(parsed).toEqual({
      kind: "guided_browser",
      scheme: "nxm",
      id: "42:999",
      displayName: "sampledomain #42 (File #999)",
      browseUrl: "https://www.nexusmods.com/sampledomain/mods/42?tab=files&file_id=999",
      modId: "42",
      fileId: "999",
    });
  });

  it("parses curseforge:// deep links with addonId and fileId without dropping them", () => {
    const parsed = parseDeepLinkItem("curseforge://install?addonId=884422&fileId=551100");
    expect(parsed).toEqual({
      kind: "guided_browser",
      scheme: "curseforge",
      id: "884422:551100",
      displayName: "CurseForge #884422 (File #551100)",
      browseUrl: "https://www.curseforge.com/projects/884422",
      modId: "884422",
      fileId: "551100",
    });
  });

  it("parses ror2mm:// thunderstore install links to HTTPS package archive URLs", () => {
    const parsed = parseDeepLinkItem("ror2mm://v1/install/thunderstore.io/AuthorName/UtilityPack/1.4.2/");
    expect(parsed).toEqual({
      kind: "direct_https_install",
      scheme: "ror2mm",
      targetUrl: "https://thunderstore.io/package/download/AuthorName/UtilityPack/1.4.2/",
      host: "thunderstore.io",
      labelName: "UtilityPack-1.4.2.zip",
      suggestedName: "UtilityPack-1.4.2.zip",
      targetFolder: null,
      expectedSha256: null,
    });
  });

  it("accepts local file paths while ignoring unsupported URL schemes", () => {
    expect(parseDeepLinkItem("C:\\Users\\Citizen\\Downloads\\mod_pack.zip")).toEqual({
      kind: "local_path",
      path: "C:\\Users\\Citizen\\Downloads\\mod_pack.zip",
    });
    expect(parseDeepLinkItem("unknownscheme://foo/bar")).toBeNull();
  });
});
