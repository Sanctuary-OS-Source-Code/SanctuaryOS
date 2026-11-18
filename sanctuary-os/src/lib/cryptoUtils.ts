export async function hashString(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

/**
 * Synchronous non-reversible 64-bit FNV-1a hex digest for obfuscating local filesystem paths
 * and draft/manifest identifiers inside `localStorage` keys without storing raw PII/usernames.
 */
export function fnv1aHashHex(input: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    const str = String(input || '');
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 ^= ch;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= ch ^ (i & 0xff);
        h2 = Math.imul(h2, 0x01000193);
    }
    return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function isValidUUID(val: unknown): boolean {
    if (typeof val !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}
