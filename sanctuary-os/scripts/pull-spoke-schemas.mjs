import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const schemasDir = path.resolve(projectRoot, 'src/data/schemas');
const rootSchemaPath = path.resolve(projectRoot, 'schema.json');

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_SCHEMA_JSON_BYTES = 512 * 1024;
export const MAX_SPOKES = 100;
export const MAX_SCHEMAS_PER_SPOKE = 25;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isSafePublicHttpsUrl(rawUrl) {
  const str = String(rawUrl || '').trim();
  if (!str) return false;
  let parsed;
  try {
    parsed = new URL(str);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (!host) return false;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((n) => Number(n));
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31)
    ) {
      return false;
    }
  }

  if (host.includes(':')) {
    if (host === '::1' || host === '::' || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host)) {
      return false;
    }
    if (host.startsWith('::ffff:')) {
      const mapped = host.slice(7);
      if (!isSafePublicHttpsUrl(`https://${mapped}`)) return false;
    }
  }

  return true;
}

function hasForbiddenPrototypeKeys(value, seen = new Set(), depth = 0) {
  if (!value || typeof value !== 'object') return false;
  if (depth > 64) return true;
  if (seen.has(value)) return true;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      if (hasForbiddenPrototypeKeys(item, seen, depth + 1)) return true;
    }
    return false;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenPrototypeKeys(value[key], seen, depth + 1)) return true;
  }
  return false;
}

export function validatePulledSchemaObject(rawSchema, expectedId = '') {
  if (!rawSchema || typeof rawSchema !== 'object' || Array.isArray(rawSchema)) {
    return { valid: false, reason: 'Schema payload must be a plain JSON object.' };
  }
  if (hasForbiddenPrototypeKeys(rawSchema)) {
    return { valid: false, reason: 'Schema payload contains forbidden prototype-pollution keys.' };
  }

  const rawId = String(rawSchema.id || expectedId || '').trim().toLowerCase();
  if (!rawId || rawId.length > 64 || !/^[a-z0-9_-]+$/.test(rawId)) {
    return { valid: false, reason: `Invalid schema id "${rawId}".` };
  }

  if (rawSchema.name !== undefined) {
    if (typeof rawSchema.name !== 'string' || !rawSchema.name.trim() || rawSchema.name.length > 160) {
      return { valid: false, reason: 'Schema name must be a non-empty string (<= 160 chars).' };
    }
  }

  if (rawSchema.schema_version !== undefined) {
    const v = rawSchema.schema_version;
    if (!Number.isInteger(v) || v < 1 || v > 1_000_000) {
      return { valid: false, reason: 'schema_version must be a positive integer.' };
    }
  }

  for (const section of ['extensions', 'folders', 'load_order', 'deployment']) {
    const val = rawSchema[section];
    if (val !== undefined && val !== null && (typeof val !== 'object' || Array.isArray(val))) {
      return { valid: false, reason: `Schema field "${section}" must be a plain object when present.` };
    }
  }

  const serialized = JSON.stringify(rawSchema);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SCHEMA_JSON_BYTES) {
    return { valid: false, reason: `Schema "${rawId}" exceeds ${MAX_SCHEMA_JSON_BYTES} byte limit.` };
  }

  return { valid: true, id: rawId };
}

export function readForkOverlayConfig(rootDir = projectRoot) {
  try {
    const forkPath = path.resolve(rootDir, 'sanctuary.fork.json');
    if (!fs.existsSync(forkPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(forkPath, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readHubCredentials() {
  let hubUrl = process.env.VITE_SUPABASE_URL || '';
  let hubAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

  const envPath = path.resolve(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    const envRaw = fs.readFileSync(envPath, 'utf-8');
    for (const line of envRaw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      const v = vRaw.replace(/^['"]|['"]$/g, '').trim();
      if (k === 'VITE_SUPABASE_URL' && !hubUrl && v) hubUrl = v;
      if (k === 'VITE_SUPABASE_ANON_KEY' && !hubAnonKey && v) hubAnonKey = v;
    }
  }

  if (!hubUrl || !hubAnonKey) {
    const supaPath = path.resolve(projectRoot, 'src/supabase.ts');
    if (fs.existsSync(supaPath)) {
      const supaSrc = fs.readFileSync(supaPath, 'utf-8');
      const urlMatch = supaSrc.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
      const keyMatch = supaSrc.match(/sb_publishable_[A-Za-z0-9_-]+/);
      if (!hubUrl && urlMatch) hubUrl = urlMatch[0];
      if (!hubAnonKey && keyMatch) hubAnonKey = keyMatch[0];
    }
  }

  return {
    hubUrl: hubUrl.replace(/\/+$/, ''),
    hubAnonKey: hubAnonKey.trim(),
    hubServiceKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  };
}

function writeJsonIfChanged(filePath, obj) {
  const serialized = JSON.stringify(obj, null, 2) + '\n';
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing.trim() === serialized.trim()) return false;
  } else {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
  return true;
}

async function fetchJsonWithTimeout(url, apiKey, bearerToken, timeoutMs = 6000) {
  if (!isSafePublicHttpsUrl(url)) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${bearerToken || apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const declaredLen = Number(res.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLen) && declaredLen > MAX_RESPONSE_BYTES) {
      return null;
    }

    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            try {
              await reader.cancel();
            } catch {}
            return null;
          }
          chunks.push(Buffer.from(value));
        }
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    }

    const txt = await res.text();
    if (Buffer.byteLength(txt, 'utf8') > MAX_RESPONSE_BYTES) {
      return null;
    }
    return JSON.parse(txt);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function main() {
  const forkOverlay = readForkOverlayConfig(projectRoot);
  if (
    process.env.SANCTUARY_SKIP_SPOKE_PULL === '1' ||
    String(process.env.VITE_SANCTUARY_MODE || '').trim().toLowerCase() === 'standalone' ||
    String(forkOverlay?.mode || '').trim().toLowerCase() === 'standalone' ||
    /^sanctuary-uplink:\/\//i.test(String(forkOverlay?.uplinkBundle || '').trim())
  ) {
    console.log('[pull-schemas] Offline/standalone mode active; keeping bundled schemas.');
    return;
  }

  const { hubUrl, hubAnonKey, hubServiceKey } = readHubCredentials();
  if (!hubUrl || !hubAnonKey || !isSafePublicHttpsUrl(hubUrl)) {
    console.log('[pull-schemas] No valid Hub URL/credentials configured; keeping bundled offline schemas.');
    return;
  }

  const hubAuthBearer = hubServiceKey || hubAnonKey;

  // 1. Pull latest Default Master Schema template from Core Hub
  const hubDefaultRows = await fetchJsonWithTimeout(
    `${hubUrl}/rest/v1/sanctuary_schemas?id=eq.default&select=id,name,version,schema_data`,
    hubAnonKey,
    hubAuthBearer
  );

  if (Array.isArray(hubDefaultRows) && hubDefaultRows[0]?.schema_data) {
    const defaultValidation = validatePulledSchemaObject(hubDefaultRows[0].schema_data, 'default');
    if (!defaultValidation.valid) {
      console.warn(`[pull-schemas] Ignoring invalid default schema: ${defaultValidation.reason}`);
      return;
    }
    const defaultData = {
      ...hubDefaultRows[0].schema_data,
      id: 'default',
      game_id:
        hubDefaultRows[0].schema_data.game_id &&
        String(hubDefaultRows[0].schema_data.game_id).trim()
          ? hubDefaultRows[0].schema_data.game_id
          : 'default',
    };
    delete defaultData.dlc_catalog;
    delete defaultData.exception_rules;
    delete defaultData.mod_categories;
    delete defaultData.taxonomy;
    const c1 = writeJsonIfChanged(path.resolve(schemasDir, 'default.json'), defaultData);
    const c2 = writeJsonIfChanged(rootSchemaPath, defaultData);
    if (c1 || c2) {
      console.log(`[pull-schemas] Synced Core Hub Default Master Schema (v${defaultData.schema_version || hubDefaultRows[0].version || 1}).`);
    }
  } else {
    console.log('[pull-schemas] Offline or Hub unreachable; preserving bundled offline schemas.');
    return;
  }

  // 2. Pull latest Spoke Master Schemas into src/data/schemas/<id>.json for offline first-time setups
  const games = await fetchJsonWithTimeout(
    `${hubUrl}/rest/v1/sanctuary_games?is_active=eq.true&select=id,name,schema_id,supabase_url,supabase_anon_key,is_keepers_only`,
    hubAnonKey,
    hubAuthBearer
  );

  if (!Array.isArray(games) || games.length === 0) {
    return;
  }

  let syncedSpokes = 0;
  for (const game of games.slice(0, MAX_SPOKES)) {
    const spokeUrl = String(game?.supabase_url || '').trim().replace(/\/+$/, '');
    const spokeKey = String(game?.supabase_anon_key || '').trim();
    if (!isSafePublicHttpsUrl(spokeUrl) || !spokeKey) continue;

    const spokeRows = await fetchJsonWithTimeout(
      `${spokeUrl}/rest/v1/sanctuary_schemas?select=id,name,version,schema_data`,
      spokeKey,
      spokeKey
    );
    if (!Array.isArray(spokeRows)) continue;

    for (const row of spokeRows.slice(0, MAX_SCHEMAS_PER_SPOKE)) {
      const rawId = String(row?.id || game?.schema_id || '').trim().toLowerCase();
      if (!rawId || rawId === 'default' || !/^[a-z0-9_-]+$/.test(rawId)) continue;
      const validation = validatePulledSchemaObject(row?.schema_data, rawId);
      if (!validation.valid) {
        console.warn(`[pull-schemas] Skipping invalid spoke schema "${rawId}": ${validation.reason}`);
        continue;
      }

      const cleanSchema = {
        ...row.schema_data,
        id: row.schema_data.id || rawId,
        game_id:
          row.schema_data.game_id && String(row.schema_data.game_id).trim()
            ? row.schema_data.game_id
            : row.schema_data.id || rawId,
      };
      delete cleanSchema.dlc_catalog;
      delete cleanSchema.mod_categories;
      delete cleanSchema.taxonomy;
      const targetPath = path.resolve(schemasDir, `${rawId}.json`);
      if (writeJsonIfChanged(targetPath, cleanSchema)) {
        syncedSpokes++;
        console.log(`[pull-schemas] Updated offline Spoke Master Schema snapshot: ${rawId}.json (v${cleanSchema.schema_version || row.version || 1})`);
      }
    }
  }

  if (syncedSpokes === 0) {
    console.log('[pull-schemas] All bundled Spoke Master Schemas are up to date.');
  }
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  const argPath = path.resolve(process.argv[1]);
  const selfPath = path.resolve(__filename);
  return process.platform === 'win32'
    ? argPath.toLowerCase() === selfPath.toLowerCase()
    : argPath === selfPath;
})();

if (isMainModule) {
  main().catch((err) => {
    console.warn('[pull-schemas] Non-fatal schema sync warning:', err?.message || err);
    process.exit(0);
  });
}
