import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const VALID_MODES = new Set(['standalone', 'hub_and_spoke']);
const GITHUB_SLUG_REGEX = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RP_ID_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;
const TAURI_ID_REGEX = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/;
const WORKSPACE_ID_REGEX = /^[a-z0-9_-]{1,64}$/i;

function isPrivateOrLocalHostname(hostname, allowLocal = false) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (!host) return true;
  if (allowLocal) return false;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((n) => Number(n));
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31)
    ) {
      return true;
    }
  }

  if (host.includes(':')) {
    if (host === '::1' || host === '::' || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host)) {
      return true;
    }
    if (host.startsWith('::ffff:')) {
      const mapped = host.slice(7);
      if (isPrivateOrLocalHostname(mapped, false)) return true;
    }
  }

  return false;
}

export function validateHttpsUrl(rawUrl, options = {}) {
  const allowLocal = Boolean(options.allowLocal);
  const str = String(rawUrl || '').trim();
  if (!str) return null;
  let parsed;
  try {
    parsed = new URL(str);
  } catch {
    throw new Error(`Invalid URL: "${str}".`);
  }
  if (parsed.protocol !== 'https:' && !(allowLocal && parsed.protocol === 'http:')) {
    throw new Error(`URL must use https:// (got "${parsed.protocol}").`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL must not contain embedded credentials.');
  }
  if (isPrivateOrLocalHostname(parsed.hostname, allowLocal)) {
    throw new Error(
      `Host "${parsed.hostname}" is loopback or private network. Pass --allow-local to permit local Supabase instances.`
    );
  }
  return str.replace(/\/+$/, '');
}

export function validateGithubRepoSlug(rawRepo) {
  const clean = String(rawRepo || '').trim().replace(/^\/+|\/+$/g, '');
  if (!clean) return '';
  if (!GITHUB_SLUG_REGEX.test(clean)) {
    throw new Error(`Invalid GitHub release repository slug "${clean}" (expected owner/repo).`);
  }
  const segments = clean.split('/');
  if (segments.some((s) => s === '.' || s === '..')) {
    throw new Error(`Invalid GitHub release repository slug "${clean}".`);
  }
  return clean;
}

export function parseUplinkBundleNode(rawBundle) {
  const clean = String(rawBundle || '').trim();
  if (!clean || !/^sanctuary-uplink:\/\//i.test(clean)) return null;
  try {
    const rawToken = clean.replace(/^sanctuary-uplink:\/\//i, '').trim();
    const b64 = rawToken.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const jsonStr = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof parsed.supabase_url === 'string' &&
      parsed.supabase_url.trim() &&
      typeof parsed.supabase_anon_key === 'string' &&
      parsed.supabase_anon_key.trim()
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function validateUpdaterPubkey(rawKey) {
  const clean = String(rawKey || '').replace(/\s+/g, '').trim();
  if (!clean) return '';
  if (!/^[A-Za-z0-9+/=]+$/.test(clean) || clean.length % 4 !== 0) {
    throw new Error('tauri.updaterPubkey must be a valid Base64 Minisign public key.');
  }
  const decoded = Buffer.from(clean, 'base64');
  if (decoded.length < 32) {
    throw new Error('tauri.updaterPubkey decoded payload must be at least 32 bytes.');
  }
  return String(rawKey).trim();
}

export function buildAndValidateForkConfig(input = {}, options = { allowLocal: false }) {
  const allowLocal = Boolean(options?.allowLocal);
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const rawUplink = String(src.uplinkBundle || '').trim();
  let uplinkParsed = null;
  if (rawUplink) {
    uplinkParsed = parseUplinkBundleNode(rawUplink);
    if (!uplinkParsed) {
      throw new Error('Invalid SANCTUARY-UPLINK:// bundle: expected valid base64url JSON with supabase_url and supabase_anon_key.');
    }
  }

  const mode = String(src.mode || (uplinkParsed ? 'standalone' : 'standalone')).trim();
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid mode "${mode}". Expected "standalone" or "hub_and_spoke".`);
  }

  const rawSupabaseUrl = String(src.supabaseUrl || uplinkParsed?.supabase_url || '').trim();
  const supabaseUrl = rawSupabaseUrl
    ? validateHttpsUrl(rawSupabaseUrl, { allowLocal })
    : '';

  const supabaseAnonKey = String(src.supabaseAnonKey || uplinkParsed?.supabase_anon_key || '').trim();
  if (supabaseUrl && !supabaseAnonKey) {
    throw new Error('supabaseAnonKey is required when supabaseUrl is configured.');
  }

  const inWs = src.standaloneWorkspace && typeof src.standaloneWorkspace === 'object'
    ? src.standaloneWorkspace
    : {};
  const schemaId = String(inWs.schema_id || uplinkParsed?.schema_id || 'universal').trim() || 'universal';
  const wsId = String(inWs.id || uplinkParsed?.schema_id || 'community-vault').trim() || 'community-vault';
  if (!WORKSPACE_ID_REGEX.test(wsId) || !WORKSPACE_ID_REGEX.test(schemaId)) {
    throw new Error('standaloneWorkspace.id and schema_id must match /^[a-z0-9_-]{1,64}$/i.');
  }
  const wsName = String(inWs.name || uplinkParsed?.name || 'Community Workspace').trim() || 'Community Workspace';
  const wsIcon = String(inWs.icon || uplinkParsed?.icon || 'sports_esports').trim() || 'sports_esports';

  const inBranding = src.branding && typeof src.branding === 'object' ? src.branding : {};
  const upBranding = uplinkParsed?.branding && typeof uplinkParsed.branding === 'object'
    ? uplinkParsed.branding
    : {};

  const githubReleaseRepo = validateGithubRepoSlug(
    inBranding.githubReleaseRepo ?? upBranding.githubReleaseRepo ?? ''
  );

  const rawRpId = String(inBranding.webauthnRpId ?? upBranding.webauthnRpId ?? '').trim();
  if (rawRpId && !RP_ID_REGEX.test(rawRpId)) {
    throw new Error(`Invalid webauthnRpId "${rawRpId}". Expected bare domain hostname (e.g. mods.example.org).`);
  }

  const rawLogoUrl = String(inBranding.logoUrl ?? upBranding.logoUrl ?? '/icon.png').trim() || '/icon.png';
  if (rawLogoUrl.startsWith('http://') || rawLogoUrl.startsWith('https://')) {
    validateHttpsUrl(rawLogoUrl, { allowLocal });
  }

  const rawSubtitles = inBranding.subtitles ?? upBranding.subtitles;
  const subtitles = Array.isArray(rawSubtitles)
    ? rawSubtitles.map((s) => String(s || '').trim()).filter(Boolean)
    : undefined;

  const inTauri = src.tauri && typeof src.tauri === 'object' ? src.tauri : {};
  const identifier = String(inTauri.identifier || '').trim();
  if (identifier && !TAURI_ID_REGEX.test(identifier)) {
    throw new Error(`Invalid tauri.identifier "${identifier}".`);
  }
  const productName = String(inTauri.productName || '').trim();
  const updaterPubkey = validateUpdaterPubkey(inTauri.updaterPubkey || '');

  const config = {
    uplinkBundle: rawUplink,
    mode,
    supabaseUrl,
    supabaseAnonKey,
    standaloneWorkspace: {
      id: wsId,
      name: wsName,
      schema_id: schemaId,
      icon: wsIcon,
    },
    branding: {
      ...(String(inBranding.appTitle ?? upBranding.appTitle ?? '').trim()
        ? { appTitle: String(inBranding.appTitle ?? upBranding.appTitle).trim() }
        : {}),
      ...(String(inBranding.orgName ?? upBranding.orgName ?? '').trim()
        ? { orgName: String(inBranding.orgName ?? upBranding.orgName).trim() }
        : {}),
      logoUrl: rawLogoUrl,
      ...(String(inBranding.supportEmail ?? upBranding.supportEmail ?? '').trim()
        ? { supportEmail: String(inBranding.supportEmail ?? upBranding.supportEmail).trim() }
        : {}),
      ...(githubReleaseRepo ? { githubReleaseRepo } : {}),
      ...(rawRpId ? { webauthnRpId: rawRpId } : {}),
      ...(subtitles && subtitles.length > 0 ? { subtitles } : {}),
    },
    tauri: {
      ...(identifier ? { identifier } : {}),
      ...(productName ? { productName } : {}),
      ...(updaterPubkey ? { updaterPubkey } : {}),
    },
  };

  return config;
}

export function applyForkOverlayToTauriConf(tauriConfObj, forkCfg = null, envOverrides = {}) {
  const next = JSON.parse(JSON.stringify(tauriConfObj && typeof tauriConfObj === 'object' ? tauriConfObj : {}));
  const productName = String(
    forkCfg?.tauri?.productName || forkCfg?.branding?.appTitle || ''
  ).trim();
  if (productName) {
    next.productName = productName;
    if (Array.isArray(next.app?.windows) && next.app.windows[0]) {
      next.app.windows[0].title = productName;
    }
  }

  const identifier = String(forkCfg?.tauri?.identifier || '').trim();
  if (identifier) {
    if (!TAURI_ID_REGEX.test(identifier)) {
      throw new Error(`Invalid tauri.identifier "${identifier}".`);
    }
    next.identifier = identifier;
  }

  const rawPubkey = String(
    envOverrides?.TAURI_UPDATER_PUBKEY || forkCfg?.tauri?.updaterPubkey || ''
  ).trim();
  const validatedPubkey = rawPubkey ? validateUpdaterPubkey(rawPubkey) : '';

  const rawRepo = String(
    envOverrides?.VITE_GITHUB_RELEASE_REPO || forkCfg?.branding?.githubReleaseRepo || ''
  ).trim();
  const validatedRepo = rawRepo ? validateGithubRepoSlug(rawRepo) : '';

  if (validatedPubkey || validatedRepo) {
    next.plugins = next.plugins || {};
    next.plugins.updater = next.plugins.updater || {};
    if (validatedPubkey) {
      next.plugins.updater.pubkey = validatedPubkey;
    }
    if (validatedRepo) {
      next.plugins.updater.endpoints = [
        `https://github.com/${validatedRepo}/releases/latest/download/latest.json`,
      ];
    }
  }

  return next;
}

function printHelp() {
  console.log(`Sanctuary OS Fork Configuration CLI (scripts/configure-fork.mjs)

Usage:
  node scripts/configure-fork.mjs [options]

Options:
  --uplink <bundle>            SANCTUARY-UPLINK://... bundle exported from Hub
  --mode <mode>                "standalone" | "hub_and_spoke"
  --supabase-url <url>         Supabase project URL (https://...)
  --anon-key <key>             Supabase publishable / anon key
  --workspace-id <id>          Standalone workspace slug
  --workspace-name <name>      Standalone workspace display name
  --schema-id <id>             Master schema ID (e.g. "universal")
  --icon <glyph>               Material symbol glyph name
  --title <name>               White-label app title (branding.appTitle)
  --org <name>                 Organization name (branding.orgName)
  --logo-url <url>             Logo URL or relative path
  --support-email <email>      Support contact email
  --repo <owner/repo>          GitHub release repository slug
  --rp-id <hostname>           WebAuthn RP ID domain hostname
  --identifier <bundle-id>     Tauri reverse-DNS identifier
  --product-name <name>        Desktop productName / window title
  --pubkey <base64>            Tauri Minisign updater public key
  --from <path>                Load base values from JSON file
  --out <path>                 Output overlay path (default: sanctuary.fork.json)
  --allow-local                Allow http://localhost / private Supabase URLs
  --dry-run                    Validate and print JSON without writing files
  --check                      Validate existing sanctuary.fork.json (exits 0 if absent)
  --apply-ephemeral-tauri-conf Apply sanctuary.fork.json + CI env overrides to src-tauri/tauri.conf.json
  --clean, --reset             Remove sanctuary.fork.json if present
  --help                       Show this help
`);
}

function parseArgs(argv) {
  const flags = {};
  const booleans = new Set([
    'allow-local',
    'dry-run',
    'check',
    'apply-ephemeral-tauri-conf',
    'clean',
    'reset',
    'help',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eqIdx = arg.indexOf('=');
    const key = eqIdx === -1 ? arg.slice(2) : arg.slice(2, eqIdx);
    if (booleans.has(key) && eqIdx === -1) {
      flags[key] = true;
      continue;
    }
    const val = eqIdx === -1 ? argv[++i] : arg.slice(eqIdx + 1);
    if (val === undefined) {
      throw new Error(`Missing value for flag --${key}.`);
    }
    flags[key] = val;
  }
  return flags;
}

export function runCli(argv = []) {
  const flags = parseArgs(argv);
  if (flags.help) {
    printHelp();
    return;
  }

  const outPath = path.resolve(projectRoot, flags.out || 'sanctuary.fork.json');

  if (flags.clean || flags.reset) {
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
      console.log(`[configure-fork] Removed ${path.relative(projectRoot, outPath)}`);
    } else {
      console.log(`[configure-fork] Nothing to remove (${path.relative(projectRoot, outPath)} absent).`);
    }
    return;
  }

  if (flags.check) {
    if (!fs.existsSync(outPath)) {
      console.log('[configure-fork] No sanctuary.fork.json present (upstream defaults active).');
      return;
    }
    const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    buildAndValidateForkConfig(existing, { allowLocal: Boolean(flags['allow-local']) });
    console.log(`[configure-fork] Validated ${path.relative(projectRoot, outPath)} cleanly.`);
    return;
  }

  if (flags['apply-ephemeral-tauri-conf']) {
    const forkCfg = fs.existsSync(outPath)
      ? buildAndValidateForkConfig(JSON.parse(fs.readFileSync(outPath, 'utf8')), {
          allowLocal: Boolean(flags['allow-local']),
        })
      : null;
    const tauriPath = path.resolve(projectRoot, 'src-tauri/tauri.conf.json');
    const origRaw = fs.readFileSync(tauriPath, 'utf8');
    const origObj = JSON.parse(origRaw);
    const patched = applyForkOverlayToTauriConf(origObj, forkCfg, process.env);
    const nextRaw = JSON.stringify(patched, null, 2) + '\n';
    if (nextRaw.trim() !== origRaw.trim()) {
      fs.writeFileSync(tauriPath, nextRaw, 'utf8');
      console.log('[configure-fork] Applied fork overlay to ephemeral src-tauri/tauri.conf.json.');
    } else {
      console.log('[configure-fork] No tauri.conf.json overrides needed.');
    }
    return;
  }

  let base = {};
  const seedPath = flags.from ? path.resolve(projectRoot, flags.from) : outPath;
  if (fs.existsSync(seedPath)) {
    base = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  }

  const mergedInput = {
    ...base,
    ...(flags.uplink !== undefined ? { uplinkBundle: flags.uplink } : {}),
    ...(flags.mode !== undefined ? { mode: flags.mode } : {}),
    ...(flags['supabase-url'] !== undefined ? { supabaseUrl: flags['supabase-url'] } : {}),
    ...(flags['anon-key'] !== undefined ? { supabaseAnonKey: flags['anon-key'] } : {}),
    standaloneWorkspace: {
      ...(base.standaloneWorkspace || {}),
      ...(flags['workspace-id'] !== undefined ? { id: flags['workspace-id'] } : {}),
      ...(flags['workspace-name'] !== undefined ? { name: flags['workspace-name'] } : {}),
      ...(flags['schema-id'] !== undefined ? { schema_id: flags['schema-id'] } : {}),
      ...(flags.icon !== undefined ? { icon: flags.icon } : {}),
    },
    branding: {
      ...(base.branding || {}),
      ...(flags.title !== undefined ? { appTitle: flags.title } : {}),
      ...(flags.org !== undefined ? { orgName: flags.org } : {}),
      ...(flags['logo-url'] !== undefined ? { logoUrl: flags['logo-url'] } : {}),
      ...(flags['support-email'] !== undefined ? { supportEmail: flags['support-email'] } : {}),
      ...(flags.repo !== undefined ? { githubReleaseRepo: flags.repo } : {}),
      ...(flags['rp-id'] !== undefined ? { webauthnRpId: flags['rp-id'] } : {}),
    },
    tauri: {
      ...(base.tauri || {}),
      ...(flags.identifier !== undefined ? { identifier: flags.identifier } : {}),
      ...(flags['product-name'] !== undefined ? { productName: flags['product-name'] } : {}),
      ...(flags.pubkey !== undefined ? { updaterPubkey: flags.pubkey } : {}),
    },
  };

  const validated = buildAndValidateForkConfig(mergedInput, {
    allowLocal: Boolean(flags['allow-local']),
  });
  const serialized = JSON.stringify(validated, null, 2) + '\n';

  if (flags['dry-run']) {
    console.log(serialized);
    return;
  }

  fs.writeFileSync(outPath, serialized, 'utf8');
  console.log(`[configure-fork] Wrote validated fork overlay to ${path.relative(projectRoot, outPath)}`);
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
  try {
    runCli(process.argv.slice(2));
  } catch (err) {
    console.error(`[configure-fork] Error: ${err?.message || err}`);
    process.exit(1);
  }
}
