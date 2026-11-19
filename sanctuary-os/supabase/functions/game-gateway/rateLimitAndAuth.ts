const JWT_SUB_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RateLimitTier {
  maxRequests: number;
  windowMs: number;
  bucketName: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSec: number;
  limit: number;
  remaining: number;
  bucketKey: string;
}

interface RateBucketState {
  windowStartMs: number;
  count: number;
}

const gatewayRateBuckets = new Map<string, RateBucketState>();
const MAX_TRACKED_RATE_BUCKETS = 10_000;

const READ_ACTIONS = new Set([
  'spoke_query',
  'spoke_query_batch',
  'check_spoke_health',
  'list_public_spokes',
  'get_spoke_schema_version',
]);

const SENSITIVE_PREAUTH_ACTIONS = new Set([
  'consume_staging_handshake',
  'claim_legacy_profile',
  'webauthn_assertion_options',
  'webauthn_assertion_verify',
  'webauthn_register_options',
  'webauthn_register_verify',
]);

export function resolveRateLimitTier(action: string): RateLimitTier {
  const clean = String(action || '').trim().toLowerCase();
  if (READ_ACTIONS.has(clean)) {
    return { bucketName: 'read', maxRequests: 300, windowMs: 60_000 };
  }
  if (SENSITIVE_PREAUTH_ACTIONS.has(clean)) {
    return { bucketName: 'ceremony', maxRequests: 30, windowMs: 60_000 };
  }
  return { bucketName: 'mutation', maxRequests: 90, windowMs: 60_000 };
}

export function clearGatewayRateBuckets() {
  gatewayRateBuckets.clear();
}

export function evaluateGatewayRateLimit(params: {
  ip: string;
  userId?: string | null;
  action: string;
  nowMs?: number;
}): RateLimitDecision {
  const nowMs = params.nowMs ?? Date.now();
  const tier = resolveRateLimitTier(params.action);
  const subject = params.userId
    ? `u:${params.userId}`
    : `ip:${String(params.ip || 'unknown').trim() || 'unknown'}`;
  const bucketKey = `${tier.bucketName}:${subject}`;

  if (gatewayRateBuckets.size >= MAX_TRACKED_RATE_BUCKETS) {
    for (const [k, st] of gatewayRateBuckets.entries()) {
      if (nowMs - st.windowStartMs >= tier.windowMs) {
        gatewayRateBuckets.delete(k);
      }
      if (gatewayRateBuckets.size < MAX_TRACKED_RATE_BUCKETS / 2) {
        break;
      }
    }
  }

  const existing = gatewayRateBuckets.get(bucketKey);
  if (!existing || nowMs - existing.windowStartMs >= tier.windowMs) {
    gatewayRateBuckets.set(bucketKey, { windowStartMs: nowMs, count: 1 });
    return {
      allowed: true,
      retryAfterSec: 0,
      limit: tier.maxRequests,
      remaining: Math.max(0, tier.maxRequests - 1),
      bucketKey,
    };
  }

  if (existing.count >= tier.maxRequests) {
    const remainingMs = Math.max(1_000, tier.windowMs - (nowMs - existing.windowStartMs));
    return {
      allowed: false,
      retryAfterSec: Math.ceil(remainingMs / 1_000),
      limit: tier.maxRequests,
      remaining: 0,
      bucketKey,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    retryAfterSec: 0,
    limit: tier.maxRequests,
    remaining: Math.max(0, tier.maxRequests - existing.count),
    bucketKey,
  };
}

export function extractClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

export function checkGatewayRateLimit(
  req: Request,
  action: string,
  userId: string | null,
  corsHeaders: Record<string, string>
): Response | null {
  const decision = evaluateGatewayRateLimit({
    ip: extractClientIp(req),
    userId,
    action,
  });
  if (decision.allowed) {
    return null;
  }
  return new Response(
    JSON.stringify({
      error: 'Too Many Requests: Edge gateway rate limit exceeded.',
      retry_after_seconds: decision.retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(decision.retryAfterSec),
        'X-RateLimit-Limit': String(decision.limit),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

export interface LocalVerifiedJwtUser {
  id: string;
  email?: string;
  role?: string;
  user_metadata?: Record<string, any>;
}

export interface LocalJwtVerifyResult {
  verified: boolean;
  user: LocalVerifiedJwtUser | null;
  shouldFallbackRemote: boolean;
}

interface CachedJwks {
  keys: any[];
  expiresAtMs: number;
}

const jwksCacheByIssuer = new Map<string, CachedJwks>();
const JWKS_CACHE_TTL_MS = 10 * 60 * 1_000;

export function clearLocalJwksCache() {
  jwksCacheByIssuer.clear();
}

function toArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  out.set(bytes);
  return out;
}

function encodeAsciiBytes(text: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(text);
  return toArrayBufferBytes(encoded);
}

function decodeB64UrlBytes(input: string): Uint8Array<ArrayBuffer> {
  const clean = String(input || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  const pad = clean.length % 4 === 0 ? '' : '='.repeat(4 - (clean.length % 4));
  const raw = atob(clean + pad);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function decodeB64UrlJson(part: string): any | null {
  try {
    const bytes = decodeB64UrlBytes(part);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function loadJwksKeys(
  supabaseUrl: string,
  forceRefresh: boolean,
  fetchFn: typeof fetch,
  nowMs: number
): Promise<any[]> {
  const baseUrl = String(supabaseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) return [];
  const cached = jwksCacheByIssuer.get(baseUrl);
  if (!forceRefresh && cached && cached.expiresAtMs > nowMs) {
    return cached.keys;
  }
  const jwksUrl = `${baseUrl}/auth/v1/.well-known/jwks.json`;
  const resp = await fetchFn(jwksUrl, { headers: { Accept: 'application/json' } });
  if (!resp.ok) {
    throw new Error(`JWKS HTTP ${resp.status}`);
  }
  const body = await resp.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  jwksCacheByIssuer.set(baseUrl, {
    keys,
    expiresAtMs: nowMs + JWKS_CACHE_TTL_MS,
  });
  return keys;
}

async function verifySignatureWithJwk(
  jwk: any,
  alg: string,
  signingInputBytes: Uint8Array<ArrayBuffer>,
  signatureBytes: Uint8Array<ArrayBuffer>
): Promise<boolean> {
  if (!jwk || typeof jwk !== 'object') return false;
  if (alg === 'ES256' && jwk.kty === 'EC') {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: String(jwk.crv || 'P-256') },
      false,
      ['verify']
    );
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signatureBytes,
      signingInputBytes
    );
  }
  if (alg === 'RS256' && jwk.kty === 'RSA') {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signatureBytes,
      signingInputBytes
    );
  }
  return false;
}

export async function verifySupabaseJwtLocally(params: {
  token: string;
  supabaseUrl: string;
  jwtSecret?: string;
  fetchFn?: typeof fetch;
  nowMs?: number;
}): Promise<LocalJwtVerifyResult> {
  const token = String(params.token || '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { verified: false, user: null, shouldFallbackRemote: false };
  }

  const header = decodeB64UrlJson(parts[0]);
  const claims = decodeB64UrlJson(parts[1]);
  if (!header || !claims || typeof header.alg !== 'string') {
    return { verified: false, user: null, shouldFallbackRemote: false };
  }

  const nowSec = Math.floor((params.nowMs ?? Date.now()) / 1_000);
  const exp = Number(claims.exp || 0);
  if (!Number.isFinite(exp) || exp <= nowSec - 5) {
    return { verified: false, user: null, shouldFallbackRemote: false };
  }
  if (claims.nbf !== undefined && Number(claims.nbf) > nowSec + 5) {
    return { verified: false, user: null, shouldFallbackRemote: false };
  }
  const audMatches =
    typeof claims.aud === 'string'
      ? claims.aud === 'authenticated'
      : Array.isArray(claims.aud)
      ? claims.aud.includes('authenticated')
      : false;
  const sub = String(claims.sub || '').trim();
  if (!audMatches || !JWT_SUB_UUID_REGEX.test(sub)) {
    return { verified: false, user: null, shouldFallbackRemote: false };
  }

  const signingInput = encodeAsciiBytes(`${parts[0]}.${parts[1]}`);
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = decodeB64UrlBytes(parts[2]);
  } catch {
    return { verified: false, user: null, shouldFallbackRemote: false };
  }

  const alg = header.alg.toUpperCase();
  if (alg === 'HS256') {
    const secret = String(params.jwtSecret || '').trim();
    if (!secret) {
      return { verified: false, user: null, shouldFallbackRemote: true };
    }
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      encodeAsciiBytes(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify('HMAC', hmacKey, sigBytes, signingInput);
    if (!valid) {
      return { verified: false, user: null, shouldFallbackRemote: false };
    }
    return {
      verified: true,
      shouldFallbackRemote: false,
      user: {
        id: sub,
        email: typeof claims.email === 'string' ? claims.email : undefined,
        role: typeof claims.role === 'string' ? claims.role : undefined,
        user_metadata:
          claims.user_metadata && typeof claims.user_metadata === 'object'
            ? claims.user_metadata
            : undefined,
      },
    };
  }

  if (alg !== 'ES256' && alg !== 'RS256') {
    return { verified: false, user: null, shouldFallbackRemote: true };
  }

  const fetchFn = params.fetchFn || fetch;
  const nowMs = params.nowMs ?? Date.now();
  try {
    let keys = await loadJwksKeys(params.supabaseUrl, false, fetchFn, nowMs);
    let candidate =
      typeof header.kid === 'string'
        ? keys.find((k: any) => k?.kid === header.kid)
        : keys.find((k: any) => !k?.alg || String(k.alg).toUpperCase() === alg);

    if (!candidate) {
      keys = await loadJwksKeys(params.supabaseUrl, true, fetchFn, nowMs);
      candidate =
        typeof header.kid === 'string'
          ? keys.find((k: any) => k?.kid === header.kid)
          : keys.find((k: any) => !k?.alg || String(k.alg).toUpperCase() === alg);
    }

    if (!candidate) {
      return { verified: false, user: null, shouldFallbackRemote: true };
    }

    const valid = await verifySignatureWithJwk(candidate, alg, signingInput, sigBytes);
    if (!valid) {
      return { verified: false, user: null, shouldFallbackRemote: false };
    }

    return {
      verified: true,
      shouldFallbackRemote: false,
      user: {
        id: sub,
        email: typeof claims.email === 'string' ? claims.email : undefined,
        role: typeof claims.role === 'string' ? claims.role : undefined,
        user_metadata:
          claims.user_metadata && typeof claims.user_metadata === 'object'
            ? claims.user_metadata
            : undefined,
      },
    };
  } catch {
    return { verified: false, user: null, shouldFallbackRemote: true };
  }
}

export async function fetchAllPaginatedRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize = 1_000,
  maxRows = 500_000
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const safePageSize = Math.max(1, Math.min(1_000, Math.floor(pageSize)));
  while (all.length < maxRows) {
    const to = offset + safePageSize - 1;
    const { data, error } = await fetchPage(offset, to);
    if (error) {
      throw error;
    }
    const batch = Array.isArray(data) ? data : [];
    if (batch.length === 0) {
      break;
    }
    all.push(...batch);
    if (batch.length < safePageSize) {
      break;
    }
    offset += safePageSize;
  }
  return all;
}
