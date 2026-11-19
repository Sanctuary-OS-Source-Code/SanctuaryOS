import { beforeEach, describe, expect, it } from "vitest";
import {
  clearGatewayRateBuckets,
  clearLocalJwksCache,
  evaluateGatewayRateLimit,
  fetchAllPaginatedRows,
  verifySupabaseJwtLocally,
} from "../../supabase/functions/game-gateway/rateLimitAndAuth.ts";

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jsonToB64Url(obj: unknown): string {
  return bytesToB64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function signEs256Jwt(
  privateKey: CryptoKey,
  header: Record<string, any>,
  claims: Record<string, any>
): Promise<string> {
  const signingInput = `${jsonToB64Url(header)}.${jsonToB64Url(claims)}`;
  const raw = new TextEncoder().encode(signingInput);
  const inputBuf = new Uint8Array(new ArrayBuffer(raw.byteLength));
  inputBuf.set(raw);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    inputBuf
  );
  return `${signingInput}.${bytesToB64Url(new Uint8Array(sig))}`;
}

describe("Edge Rate Limiting, Local JWKS JWT Verification & Fan-Out Pagination", () => {
  beforeEach(() => {
    clearGatewayRateBuckets();
    clearLocalJwksCache();
  });

  it("enforces separate read (300/min), mutation (90/min), and ceremony (30/min) rate limits", () => {
    const baseNow = 1_750_000_000_000;
    for (let i = 0; i < 30; i++) {
      const dec = evaluateGatewayRateLimit({
        ip: "203.0.113.10",
        action: "consume_staging_handshake",
        nowMs: baseNow,
      });
      expect(dec.allowed).toBe(true);
    }

    const blocked = evaluateGatewayRateLimit({
      ip: "203.0.113.10",
      action: "consume_staging_handshake",
      nowMs: baseNow + 5_000,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(55);

    // Same IP reading public spokes has an independent 300/min read quota
    const readDec = evaluateGatewayRateLimit({
      ip: "203.0.113.10",
      action: "spoke_query_batch",
      nowMs: baseNow + 5_000,
    });
    expect(readDec.allowed).toBe(true);
    expect(readDec.limit).toBe(300);

    // Window resets after 60s
    const afterWindow = evaluateGatewayRateLimit({
      ip: "203.0.113.10",
      action: "consume_staging_handshake",
      nowMs: baseNow + 60_001,
    });
    expect(afterWindow.allowed).toBe(true);
  });

  it("verifies ES256 Supabase JWTs locally via cached JWKS and rejects tampered or expired tokens", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const pubJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const kid = "kid-jwks-test";
    let jwksFetchCount = 0;

    const mockFetch = (async () => {
      jwksFetchCount += 1;
      return new Response(
        JSON.stringify({ keys: [{ ...pubJwk, kid, alg: "ES256", use: "sig" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const nowSec = Math.floor(Date.now() / 1_000);
    const uid = "11111111-2222-4333-8444-555555555555";
    const validJwt = await signEs256Jwt(
      keyPair.privateKey,
      { alg: "ES256", typ: "JWT", kid },
      { sub: uid, aud: "authenticated", email: "citizen@sanctuaryos.net", exp: nowSec + 3600 }
    );

    const res1 = await verifySupabaseJwtLocally({
      token: validJwt,
      supabaseUrl: "https://example.supabase.co",
      fetchFn: mockFetch,
    });
    expect(res1.verified).toBe(true);
    expect(res1.user?.id).toBe(uid);
    expect(res1.shouldFallbackRemote).toBe(false);
    expect(jwksFetchCount).toBe(1);

    // Second call uses in-isolate JWKS cache without network hit
    const res2 = await verifySupabaseJwtLocally({
      token: validJwt,
      supabaseUrl: "https://example.supabase.co",
      fetchFn: mockFetch,
    });
    expect(res2.verified).toBe(true);
    expect(jwksFetchCount).toBe(1);

    // Tampered payload fails cryptographic signature verification locally without fallback
    const parts = validJwt.split(".");
    const tamperedClaims = jsonToB64Url({
      sub: "99999999-9999-4999-8999-999999999999",
      aud: "authenticated",
      exp: nowSec + 3600,
    });
    const tamperedJwt = `${parts[0]}.${tamperedClaims}.${parts[2]}`;
    const resTampered = await verifySupabaseJwtLocally({
      token: tamperedJwt,
      supabaseUrl: "https://example.supabase.co",
      fetchFn: mockFetch,
    });
    expect(resTampered.verified).toBe(false);
    expect(resTampered.shouldFallbackRemote).toBe(false);

    // Expired JWT is rejected immediately
    const expiredJwt = await signEs256Jwt(
      keyPair.privateKey,
      { alg: "ES256", typ: "JWT", kid },
      { sub: uid, aud: "authenticated", exp: nowSec - 120 }
    );
    const resExpired = await verifySupabaseJwtLocally({
      token: expiredJwt,
      supabaseUrl: "https://example.supabase.co",
      fetchFn: mockFetch,
    });
    expect(resExpired.verified).toBe(false);
  });

  it("paginates follower and citizen broadcasts cleanly past the 1,000-row PostgREST cap", async () => {
    const dataset = Array.from({ length: 2_540 }, (_, idx) => ({ id: `user-${idx}` }));
    const fetchedPages: Array<[number, number]> = [];
    const rows = await fetchAllPaginatedRows<{ id: string }>(async (from, to) => {
      fetchedPages.push([from, to]);
      return { data: dataset.slice(from, to + 1), error: null };
    }, 1_000);

    expect(rows.length).toBe(2_540);
    expect(fetchedPages).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
});
