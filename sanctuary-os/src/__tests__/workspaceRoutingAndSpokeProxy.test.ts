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

import { findWorkspaceByIdentifier, hasValidSpokeHttpUrl } from "../supabase";

describe("Workspace Routing & Spoke Endpoint Validation", () => {
  const sampleWorkspaces = [
    {
      id: "0f5fc08a-1111-2222-3333-444455556666",
      schema_id: "ALPHA_ENGINE",
      game_id: "alpha-game-uuid",
      name: "Alpha Engine Workspace",
      supabase_url: "https://alpha-spoke.supabase.co",
    },
    {
      id: "8a85ad29-9999-8888-7777-666655554444",
      schema_id: "sandbox_stub",
      name: "Sandbox Stub",
      supabase_url: "test",
    },
  ];

  it("matches workspaces case-insensitively across id, schema_id, and game_id", () => {
    expect(findWorkspaceByIdentifier(sampleWorkspaces, "alpha_engine")?.id).toBe(
      "0f5fc08a-1111-2222-3333-444455556666"
    );
    expect(findWorkspaceByIdentifier(sampleWorkspaces, "ALPHA_ENGINE")?.schema_id).toBe(
      "ALPHA_ENGINE"
    );
    expect(findWorkspaceByIdentifier(sampleWorkspaces, "alpha-game-uuid")?.schema_id).toBe(
      "ALPHA_ENGINE"
    );
    expect(
      findWorkspaceByIdentifier(sampleWorkspaces, "0F5FC08A-1111-2222-3333-444455556666")?.name
    ).toBe("Alpha Engine Workspace");
  });

  it("ignores empty and placeholder workspace keys", () => {
    expect(findWorkspaceByIdentifier(sampleWorkspaces, "")).toBeUndefined();
    expect(findWorkspaceByIdentifier(sampleWorkspaces, null)).toBeUndefined();
    expect(findWorkspaceByIdentifier(sampleWorkspaces, "default_workspace")).toBeUndefined();
    expect(findWorkspaceByIdentifier(sampleWorkspaces, "default_schema")).toBeUndefined();
    expect(findWorkspaceByIdentifier(sampleWorkspaces, "web")).toBeUndefined();
  });

  it("accepts valid HTTP/HTTPS Spoke URLs with anon keys and rejects invalid placeholder strings", () => {
    expect(
      hasValidSpokeHttpUrl({
        supabase_url: "https://alpha-spoke.supabase.co",
        supabase_anon_key: "anon-key-123",
      })
    ).toBe(true);
    expect(
      hasValidSpokeHttpUrl({
        supabase_url: "http://127.0.0.1:54321",
        supabase_anon_key: "local-key",
      })
    ).toBe(true);
    expect(
      hasValidSpokeHttpUrl({
        supabase_url: "  https://custom-spoke.example.com  ",
        supabase_anon_key: "key-abc",
      })
    ).toBe(true);

    expect(hasValidSpokeHttpUrl({ supabase_url: "test", supabase_anon_key: "anon" })).toBe(false);
    expect(hasValidSpokeHttpUrl({ supabase_url: "", supabase_anon_key: "anon" })).toBe(false);
    expect(
      hasValidSpokeHttpUrl({ supabase_url: "https://alpha-spoke.supabase.co", supabase_anon_key: "" })
    ).toBe(false);
    expect(hasValidSpokeHttpUrl(null)).toBe(false);
    expect(
      hasValidSpokeHttpUrl({ supabase_url: "ftp://example.com", supabase_anon_key: "anon" })
    ).toBe(false);
    expect(
      hasValidSpokeHttpUrl({ supabase_url: "https://not a url", supabase_anon_key: "anon" })
    ).toBe(false);
  });
});
