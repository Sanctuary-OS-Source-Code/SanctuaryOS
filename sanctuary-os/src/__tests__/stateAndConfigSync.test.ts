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

import { resolveSanctuaryConfig } from "../supabase";
import { useStore } from "../store";
import { resolveSchemaPriorityTiers } from "../components/staging-editor/stagingEditorHelpers";

describe("Section 4 — Store Sync, Uplink Cold Boot & Schema Staging Tiers", () => {
  it("parses lowercase URL-safe base64 sanctuary-uplink:// bundles cleanly during cold boot", () => {
    const payload = btoa(
      JSON.stringify({
        supabase_url: "https://community-spoke.example.supabase.co",
        supabase_anon_key: "spoke-anon-key",
        schema_id: "sample_engine",
        name: "Community Sample Engine",
        branding: {
          appTitle: "Sample Mod OS",
          webauthnRpId: "sample.example.org",
        },
      })
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const resolved = resolveSanctuaryConfig(`sanctuary-uplink://${payload}`);
    expect(resolved.mode).toBe("standalone");
    expect(resolved.supabaseUrl).toBe("https://community-spoke.example.supabase.co");
    expect(resolved.supabaseAnonKey).toBe("spoke-anon-key");
    expect(resolved.standaloneWorkspace.schema_id).toBe("sample_engine");
    expect(resolved.branding.appTitle).toBe("Sample Mod OS");
    expect(resolved.branding.webauthnRpId).toBe("sample.example.org");
  });

  it("coerces Error objects and non-string values safely in pushStatus and setStatus", () => {
    expect(() => useStore.getState().pushStatus(new Error("RPC timeout") as any, "error")).not.toThrow();
    expect(useStore.getState().status).toContain("RPC timeout");

    expect(() => useStore.getState().setStatus({ code: 503 } as any)).not.toThrow();
    expect(useStore.getState().status).toBe("[object Object]");
  });

  it("persists unified anarchyRules changes into localStorage", () => {
    useStore.getState().setAnarchyRules({
      highlander: false,
      family: true,
      dependencies: true,
      intercept: false,
    });
    const stateRules = useStore.getState().anarchyRules;
    expect(stateRules).toEqual({
      highlander: false,
      family: true,
      dependencies: true,
      intercept: false,
    });
    const persisted = JSON.parse(localStorage.getItem("sanctuary_anarchy") || "{}");
    expect(persisted.highlander).toBe(false);
    expect(persisted.intercept).toBe(false);
  });

  it("derives staging priority tiers from active GameSchema with neutral fallback", () => {
    const neutral = resolveSchemaPriorityTiers(null);
    expect(neutral).toHaveLength(4);
    expect(neutral.some((t) => t.fallback.includes("CC"))).toBe(false);

    const custom = resolveSchemaPriorityTiers({
      load_order: {
        priority_tiers: [
          { id: "late", label: "Late Patches", priority: 20 },
          { id: "early", label: "Early Loaders", priority: 1 },
        ],
      },
    });
    expect(custom.map((t) => t.id)).toEqual(["early", "late"]);
    expect(custom[0].fallback).toBe("Early Loaders");
  });
});
