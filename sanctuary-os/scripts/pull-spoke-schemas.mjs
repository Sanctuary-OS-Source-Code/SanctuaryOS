import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const schemasDir = path.resolve(projectRoot, 'src/data/schemas');
const rootSchemaPath = path.resolve(projectRoot, 'schema.json');

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
  fs.writeFileSync(filePath, serialized, 'utf-8');
  return true;
}

async function fetchJsonWithTimeout(url, apiKey, bearerToken, timeoutMs = 6000) {
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
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { hubUrl, hubAnonKey, hubServiceKey } = readHubCredentials();
  if (!hubUrl || !hubAnonKey) {
    console.log('[pull-schemas] No Hub credentials configured; keeping bundled offline schemas.');
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
    const defaultData = {
      ...hubDefaultRows[0].schema_data,
      id: 'default',
      game_id:
        hubDefaultRows[0].schema_data.game_id &&
        String(hubDefaultRows[0].schema_data.game_id).trim()
          ? hubDefaultRows[0].schema_data.game_id
          : 'default',
    };
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
  for (const game of games) {
    const spokeUrl = String(game?.supabase_url || '').trim().replace(/\/+$/, '');
    const spokeKey = String(game?.supabase_anon_key || '').trim();
    if (!spokeUrl.startsWith('https://') || !spokeKey) continue;

    const spokeRows = await fetchJsonWithTimeout(
      `${spokeUrl}/rest/v1/sanctuary_schemas?select=id,name,version,schema_data`,
      spokeKey,
      spokeKey
    );
    if (!Array.isArray(spokeRows)) continue;

    for (const row of spokeRows) {
      const rawId = String(row?.id || game?.schema_id || '').trim().toLowerCase();
      if (!rawId || rawId === 'default' || !/^[a-z0-9_-]+$/.test(rawId)) continue;
      if (!row?.schema_data || typeof row.schema_data !== 'object') continue;

      const cleanSchema = {
        ...row.schema_data,
        id: row.schema_data.id || rawId,
        game_id:
          row.schema_data.game_id && String(row.schema_data.game_id).trim()
            ? row.schema_data.game_id
            : row.schema_data.id || rawId,
      };
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

main().catch((err) => {
  console.warn('[pull-schemas] Non-fatal schema sync warning:', err?.message || err);
  process.exit(0);
});

