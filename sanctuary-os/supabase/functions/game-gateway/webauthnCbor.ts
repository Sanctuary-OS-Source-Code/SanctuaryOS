/// <reference path="../deno.d.ts" />
import { b64UrlToBytes, bytesToB64Url } from './cryptoEnvelope.ts'

export function decodeCborItem(bytes: Uint8Array, offset = 0): { value: any; offset: number } {
  if (offset >= bytes.length) throw new Error('CBOR unexpected EOF');
  const initial = bytes[offset++];
  const major = initial >> 5;
  const info = initial & 0x1f;

  function readLength(): number {
    if (info < 24) return info;
    if (info === 24) return bytes[offset++];
    if (info === 25) {
      const v = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      return v;
    }
    if (info === 26) {
      const v =
        ((bytes[offset] << 24) >>> 0) +
        ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
      offset += 4;
      return v;
    }
    throw new Error('Unsupported CBOR length info: ' + info);
  }

  if (major === 0) return { value: readLength(), offset };
  if (major === 1) return { value: -1 - readLength(), offset };
  if (major === 2) {
    const len = readLength();
    const slice = bytes.subarray(offset, offset + len);
    offset += len;
    return { value: slice, offset };
  }
  if (major === 3) {
    const len = readLength();
    const str = new TextDecoder().decode(bytes.subarray(offset, offset + len));
    offset += len;
    return { value: str, offset };
  }
  if (major === 4) {
    const len = readLength();
    const arr: any[] = [];
    for (let i = 0; i < len; i++) {
      const res = decodeCborItem(bytes, offset);
      arr.push(res.value);
      offset = res.offset;
    }
    return { value: arr, offset };
  }
  if (major === 5) {
    const len = readLength();
    const map = new Map<any, any>();
    for (let i = 0; i < len; i++) {
      const k = decodeCborItem(bytes, offset);
      offset = k.offset;
      const v = decodeCborItem(bytes, offset);
      offset = v.offset;
      map.set(k.value, v.value);
    }
    return { value: map, offset };
  }
  if (major === 7) {
    if (info === 20) return { value: false, offset };
    if (info === 21) return { value: true, offset };
    if (info === 22) return { value: null, offset };
  }
  throw new Error('Unsupported CBOR major type: ' + major);
}

export function derSignatureToP1363(der: Uint8Array) {
  if (der.length === 64 && der[0] !== 0x30) return der;
  let pos = 0;
  if (der[pos++] !== 0x30) throw new Error('Invalid DER ECDSA signature');
  const seqLen = der[pos++];
  if (seqLen & 0x80) {
    const nBytes = seqLen & 0x7f;
    pos += nBytes;
  }
  if (der[pos++] !== 0x02) throw new Error('Invalid DER ECDSA r-integer tag');
  const rLen = der[pos++];
  let r = der.subarray(pos, pos + rLen);
  pos += rLen;
  if (der[pos++] !== 0x02) throw new Error('Invalid DER ECDSA s-integer tag');
  const sLen = der[pos++];
  let s = der.subarray(pos, pos + sLen);

  while (r.length > 32 && r[0] === 0x00) r = r.subarray(1);
  while (s.length > 32 && s[0] === 0x00) s = s.subarray(1);
  if (r.length > 32 || s.length > 32) throw new Error('Invalid ECDSA coordinate length');

  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

export async function verifyCoseSignature(
  publicKeyCborBytes: Uint8Array,
  signedData: Uint8Array,
  signatureBytes: Uint8Array
): Promise<boolean> {
  const { value: coseMap } = decodeCborItem(publicKeyCborBytes, 0);
  const kty = coseMap.get(1);
  const alg = coseMap.get(3);

  if (kty === 3 || alg === -257) {
    const n = coseMap.get(-1) as Uint8Array;
    const e = coseMap.get(-2) as Uint8Array;
    if (!n || !e) throw new Error('Missing RSA modulus or exponent in COSE key');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: bytesToB64Url(n), e: bytesToB64Url(e), alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signatureBytes as BufferSource,
      signedData as BufferSource
    );
  }

  if (kty === 2 || alg === -7) {
    const x = coseMap.get(-2) as Uint8Array;
    const y = coseMap.get(-3) as Uint8Array;
    if (!x || !y) throw new Error('Missing EC P-256 coordinates in COSE key');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: bytesToB64Url(x), y: bytesToB64Url(y), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const p1363Sig = derSignatureToP1363(signatureBytes);
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      p1363Sig as BufferSource,
      signedData as BufferSource
    );
  }

  if (kty === 1 || alg === -8) {
    const x = coseMap.get(-2) as Uint8Array;
    if (!x) throw new Error('Missing Ed25519 public key bytes in COSE key');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: bytesToB64Url(x), ext: true },
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signatureBytes as BufferSource,
      signedData as BufferSource
    );
  }

  throw new Error(`Unsupported COSE key type (${kty}) or algorithm (${alg})`);
}

export function isAllowedWebAuthnOrigin(originStr: string, rpId: string): boolean {
  try {
    const u = new URL(originStr);
    const host = u.hostname.toLowerCase();
    const target = (rpId || 'sanctuaryos.net').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      return u.protocol === 'http:' || u.protocol === 'https:';
    }
    return u.protocol === 'https:' && (host === target || host.endsWith('.' + target));
  } catch {
    return false;
  }
}

export async function matchesAllowedRpIdHash(
  authDataBytes: Uint8Array,
  rpId: string,
  originStr: string
): Promise<boolean> {
  const candidates = new Set<string>([rpId || 'sanctuaryos.net']);
  try {
    const u = new URL(originStr);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      candidates.add(host);
      candidates.add('localhost');
      candidates.add('127.0.0.1');
    }
  } catch {}

  for (const candidate of candidates) {
    const expectedRpIdHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(candidate))
    );
    let matches = true;
    for (let i = 0; i < 32; i++) {
      if (authDataBytes[i] !== expectedRpIdHash[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

export function formatUuidFromBytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

