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
  if (typeof (globalThis as any).window.addEventListener !== "function") {
    (globalThis as any).window.addEventListener = () => {};
  }
});

import {
  getRuntimeUplinkBundle,
  parseUplinkBundle,
  setRuntimeUplinkBundle,
} from "../supabase";
import {
  buildSpokeRelinkToken,
  decryptStagingPayload,
  deriveSpokeRelinkCommitmentHash,
  deriveSpokeRelinkSecret,
  encryptStagingPayload,
  parseSpokeRelinkToken,
  type StagedCloudPayload,
} from "../utils/stagingCrypto";

function toBase64Url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

describe("Sovereign Uplink Bundles & Zero-PII Staging Cryptography", () => {
  it("parses valid SANCTUARY-UPLINK:// bundles case-insensitively and rejects insecure URLs", () => {
    const rawJson = JSON.stringify({
      supabase_url: "https://partner-spoke.example.com/",
      supabase_anon_key: "sb_publishable_partner_key_123",
      app_title: "Partner Hub",
      game_id: "synth-game-1",
    });
    const uri = `sanctuary-uplink://${toBase64Url(rawJson)}`;
    const parsed = parseUplinkBundle(uri);
    expect(parsed).toEqual({
      supabase_url: "https://partner-spoke.example.com",
      supabase_anon_key: "sb_publishable_partner_key_123",
      app_title: "Partner Hub",
      game_id: "synth-game-1",
    });

    expect(setRuntimeUplinkBundle(uri)).toBe(true);
    expect(getRuntimeUplinkBundle()).toBe(uri);
    expect(setRuntimeUplinkBundle(null)).toBe(true);
    expect(getRuntimeUplinkBundle()).toBe("");

    const insecure = `SANCTUARY-UPLINK://${toBase64Url(
      JSON.stringify({ supabase_url: "http://insecure.example.com", supabase_anon_key: "abc" })
    )}`;
    expect(parseUplinkBundle(insecure)).toBeNull();
    expect(parseUplinkBundle("SANCTUARY-UPLINK://not-valid-base64!!!")).toBeNull();
  });

  it("encrypts and decrypts compressed Zero-PII staging payloads with WebCrypto AES-256-GCM", async () => {
    const userId = "11111111-2222-3333-4444-555555555555";
    const otherUserId = "99999999-8888-7777-6666-555555555555";
    localStorage.setItem(
      `sanctuary_staging_secret_v2_${userId}`,
      "secret-material-alpha-0123456789abcdef"
    );
    localStorage.setItem(
      `sanctuary_staging_secret_v2_${otherUserId}`,
      "secret-material-beta-fedcba9876543210"
    );

    const largeItems = Array.from({ length: 24 }, (_, idx) => ({
      id: `mod_${idx}`,
      name: `module_${idx}.modbin`,
      hash: `hash_${idx}_0123456789abcdef`,
      url: `https://cdn.example.com/module_${idx}.modbin`,
      load_order_index: idx,
    }));
    const payload: StagedCloudPayload = {
      mode: "blueprint",
      blueprintName: "Rig Zero",
      targetDesktopBlueprint: "Rig Zero",
      autoEquip: true,
      items: largeItems,
      stagedAt: "2026-11-18T00:00:00Z",
      sourceDevice: "vitest-runner",
    };

    const sealed = await encryptStagingPayload(payload, userId, "citizen@example.org");
    expect(sealed.encrypted_payload.length).toBeGreaterThan(20);

    const opened = await decryptStagingPayload(
      sealed.encrypted_payload,
      sealed.iv,
      sealed.salt,
      userId,
      "citizen@example.org"
    );
    expect(opened?.blueprintName).toBe("Rig Zero");
    expect(opened?.items).toHaveLength(24);
    expect(opened?.items[0].name).toBe("module_0.modbin");

    // Wrong user cannot decrypt
    const wrongUserOpen = await decryptStagingPayload(
      sealed.encrypted_payload,
      sealed.iv,
      sealed.salt,
      otherUserId,
      "other@example.org"
    );
    expect(wrongUserOpen).toBeNull();
  });

  it("derives deterministic Spoke Relink tokens and parses SRK1 bundles strictly", async () => {
    const userId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const explicitSecret = "0123456789abcdef0123456789abcdef";

    const secret = await deriveSpokeRelinkSecret(userId, explicitSecret);
    const commitment = await deriveSpokeRelinkCommitmentHash(userId, explicitSecret);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(commitment).toMatch(/^[0-9a-f]{64}$/);
    expect(secret).not.toBe(commitment);

    const token = await buildSpokeRelinkToken(userId, explicitSecret);
    expect(token).toBe(`SRK1.${userId}.${secret}`);
    expect(parseSpokeRelinkToken(token)).toEqual({
      legacyUuid: userId,
      claimSecret: secret,
    });
    expect(parseSpokeRelinkToken("SRK1.invalid-uuid.short")).toBeNull();
  });
});
