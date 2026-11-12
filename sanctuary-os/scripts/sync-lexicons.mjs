import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.resolve(projectRoot, 'src');
const lexiconsDir = path.resolve(srcDir, 'lexicons');

const KEEPER_LOCKED_KEYS = new Set([
  'sidebar_app_title',
  'sidebar_app_subtitle_core',
  'sidebar_app_subtitle_citizen',
]);

const GLOSSARY_DEFAULTS = {
  term_mod: { 'en-default': 'Mod', 'en-sanctuary': 'Artifact', 'en-sims': 'Mod', Simlish: 'Moddi' },
  term_mods: { 'en-default': 'Mods', 'en-sanctuary': 'Artifacts', 'en-sims': 'Mods', Simlish: 'Moddis' },
  term_vault: { 'en-default': 'Library', 'en-sanctuary': 'Vault', 'en-sims': 'Library', Simlish: 'Stashi' },
  term_blueprint: { 'en-default': 'Play Set', 'en-sanctuary': 'Blueprint', 'en-sims': 'Modpack', Simlish: 'Playset' },
  term_blueprints: { 'en-default': 'Play Sets', 'en-sanctuary': 'Blueprints', 'en-sims': 'Modpacks', Simlish: 'Playsets' },
  term_nexus: { 'en-default': 'Marketplace', 'en-sanctuary': 'The Nexus', 'en-sims': 'The Gallery', Simlish: 'Galleri' },
  term_citizen: { 'en-default': 'User', 'en-sanctuary': 'Citizen', 'en-sims': 'Simmer', Simlish: 'Simma' },
  term_citizens: { 'en-default': 'Users', 'en-sanctuary': 'Citizens', 'en-sims': 'Simmers', Simlish: 'Simmas' },
  term_mason: { 'en-default': 'Creator', 'en-sanctuary': 'Mason', 'en-sims': 'Creator', Simlish: 'Maker' },
  term_masons: { 'en-default': 'Creators', 'en-sanctuary': 'Masons', 'en-sims': 'Creators', Simlish: 'Makers' },
  term_dispatch: { 'en-default': 'Post', 'en-sanctuary': 'Transmission', 'en-sims': 'Post', Simlish: 'Posti' },
  term_dispatches: { 'en-default': 'Posts', 'en-sanctuary': 'Transmissions', 'en-sims': 'Posts', Simlish: 'Postis' },
  term_lab: { 'en-default': 'Testing Lab', 'en-sanctuary': 'Homestead', 'en-sims': 'Testing Lab', Simlish: 'Testi Lab' },
  term_backups: { 'en-default': 'Backups', 'en-sanctuary': 'Time Capsule', 'en-sims': 'Backups', Simlish: 'Save-Capsules' },
  term_settings: { 'en-default': 'Settings', 'en-sanctuary': 'System Preferences', 'en-sims': 'Settings', Simlish: 'Tweakis' },
  term_chameleon: { 'en-default': 'Theme', 'en-sanctuary': 'Chameleon', 'en-sims': 'Theme', Simlish: 'Vibe' },
  term_chameleons: { 'en-default': 'Themes', 'en-sanctuary': 'Chameleons', 'en-sims': 'Themes', Simlish: 'Vibes' },
  term_lexicon: { 'en-default': 'Language', 'en-sanctuary': 'Lexicon', 'en-sims': 'Language', Simlish: 'Lingo' },
  term_lexicons: { 'en-default': 'Languages', 'en-sanctuary': 'Lexicons', 'en-sims': 'Languages', Simlish: 'Lingos' },
  term_delete: { 'en-default': 'Delete', 'en-sanctuary': 'Purge', 'en-sims': 'Delete', Simlish: 'Zoop' },
  term_remove: { 'en-default': 'Remove', 'en-sanctuary': 'Yeet', 'en-sims': 'Remove', Simlish: 'Shoo' },
};

const TOKEN_TO_TERM_KEY = {
  mod: 'term_mod',
  mods: 'term_mods',
  vault: 'term_vault',
  blueprint: 'term_blueprint',
  blueprints: 'term_blueprints',
  nexus: 'term_nexus',
  citizen: 'term_citizen',
  citizens: 'term_citizens',
  mason: 'term_mason',
  masons: 'term_masons',
  dispatch: 'term_dispatch',
  dispatches: 'term_dispatches',
  lab: 'term_lab',
  backups: 'term_backups',
  settings: 'term_settings',
  chameleon: 'term_chameleon',
  chameleons: 'term_chameleons',
  lexicon: 'term_lexicon',
  lexicons: 'term_lexicons',
  delete: 'term_delete',
  remove: 'term_remove',
};

const NEW_THEMATIC_SEEDS = {
  'en-sanctuary': {
    show_more: 'Expand Buffer',
  },
  'en-sims': {
    lex_studio_auto_translate_title: '1-Click Pack Auto-Translate',
    dlc_type_ep: 'Expansion (EP)',
    dlc_type_fp: 'Free Pack (FP)',
    dlc_type_game_pack: 'Game Pack',
    dlc_type_gp: 'Game Pack (GP)',
    dlc_type_kit: 'Kit',
    dlc_type_sp: 'Stuff Pack (SP)',
    dlc_type_stuff_pack: 'Stuff Pack',
  },
  Simlish: {
    show_more: 'Shoo Moor',
    lex_studio_auto_translate_btn: 'Sim-Translatish',
    lex_studio_run_translate_btn: 'Translatish {Lexicon}',
  },
};

function walkCodeFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'lexicons' || entry.name === 'node_modules') continue;
      walkCodeFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function unescapeJsString(raw, quote) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[++i];
      if (next === 'n') out += '\n';
      else if (next === 'r') out += '\r';
      else if (next === 't') out += '\t';
      else if (next === '\\') out += '\\';
      else if (next === quote) out += quote;
      else if (next === '"' || next === "'" || next === '`') out += next;
      else out += next;
    } else {
      out += ch;
    }
  }
  return out;
}

function extractFromSourceFiles(files) {
  const extracted = new Map();
  const referencedIdentifiers = new Set();

  // Matches t("key", "fallback") across quotes and linebreaks
  const tCallRegex =
    /\bt\(\s*(['"])([^'"\n]+)\1\s*,\s*(['"`])((?:\\.|(?!\3)[\s\S])*)\3/g;
  const anyStringLiteralRegex = /(['"])([a-zA-Z0-9_.-]{2,80})\1/g;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8');

    let m;
    while ((m = tCallRegex.exec(src)) !== null) {
      const key = m[2].trim();
      const quote = m[3];
      const rawFallback = m[4];
      if (!key || key.startsWith('icon_')) continue;
      if (quote === '`' && rawFallback.includes('${')) continue;

      const cleanFallback = unescapeJsString(rawFallback, quote);
      if (!extracted.has(key) && cleanFallback.trim() !== '') {
        extracted.set(key, cleanFallback);
      }
    }

    let sm;
    while ((sm = anyStringLiteralRegex.exec(src)) !== null) {
      referencedIdentifiers.add(sm[2]);
    }
  }

  return { extracted, referencedIdentifiers };
}

function normalizeNewFallbackForStandardDefault(rawFallback) {
  if (!rawFallback || typeof rawFallback !== 'string') {
    return { standard: rawFallback, hadSanctuaryBranding: false };
  }

  const masks = [];
  let text = rawFallback.replace(/\{[A-Za-z0-9_]+\}/g, (tok) => {
    const idx = masks.length;
    masks.push(tok);
    return `\u0000TOK_${idx}\u0000`;
  });

  const before = text;
  text = text
    .replace(/\bComm-Link\s+Feed\b/g, 'Community Feed')
    .replace(/\bcomm-link\s+feed\b/gi, 'community feed')
    .replace(/\bComm-Link\b/g, 'Community Feed')
    .replace(/\bcomm-link\b/gi, 'community feed')
    .replace(/\bHomestead\s+Lab\b/g, '{Lab}')
    .replace(/\bHomestead\b/g, '{Lab}')
    .replace(/\bTime\s+Capsule\b/g, '{Backups}')
    .replace(/\bThe\s+Nexus\b/g, 'The {Nexus}')
    .replace(/\bYour\s+Vault\b/g, 'Your {Vault}')
    .replace(/\bLockdown\s+Vault\b/g, 'Lockdown {Vault}')
    .replace(/\bBlueprints\b/g, '{Blueprints}')
    .replace(/\bBlueprint\b/g, '{Blueprint}')
    .replace(/\bChameleons\b/g, '{Chameleons}')
    .replace(/\bChameleon\b/g, '{Chameleon}');

  const hadSanctuaryBranding = text !== before;

  text = text.replace(/\u0000TOK_(\d+)\u0000/g, (_, i) => masks[Number(i)] ?? '');
  return { standard: text, hadSanctuaryBranding };
}

function interpolateSimple(str, termMap) {
  if (typeof str !== 'string' || !str.includes('{')) return str;
  return str.replace(/\{([A-Za-z_]+)\}/g, (full, rawName) => {
    const termKey = TOKEN_TO_TERM_KEY[rawName.toLowerCase()];
    if (!termKey) return full;
    const resolved = termMap[termKey];
    if (!resolved) return full;
    if (rawName === rawName.toUpperCase()) return resolved.toUpperCase();
    if (rawName === rawName.toLowerCase()) return resolved.toLowerCase();
    return resolved;
  });
}

function sortLexiconKeys(dict) {
  const metaKeys = [];
  const termKeys = [];
  const restKeys = [];

  for (const k of Object.keys(dict)) {
    if (k.startsWith('_meta')) metaKeys.push(k);
    else if (k.startsWith('term_')) termKeys.push(k);
    else restKeys.push(k);
  }

  metaKeys.sort((a, b) => a.localeCompare(b));
  termKeys.sort((a, b) => a.localeCompare(b));
  restKeys.sort((a, b) => a.localeCompare(b));

  const sorted = {};
  for (const k of [...metaKeys, ...termKeys, ...restKeys]) {
    sorted[k] = dict[k];
  }
  return sorted;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJsonIfChanged(filePath, obj) {
  const serialized = JSON.stringify(obj, null, 2) + '\n';
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing === serialized) return false;
  }
  fs.writeFileSync(filePath, serialized, 'utf-8');
  return true;
}

const UNIVERSAL_DLC_KEYS = new Set([
  'dlc_type_addon',
  'dlc_type_bundle',
  'dlc_type_expansion_pack',
]);

function isDynamicPreservedPrefix(k) {
  return (
    k.startsWith('font_') ||
    k.startsWith('class_dd_') ||
    k.startsWith('vault_sub_') ||
    UNIVERSAL_DLC_KEYS.has(k) ||
    k.startsWith('sidebar_app_')
  );
}

function main() {
  const files = walkCodeFiles(srcDir);
  const { extracted, referencedIdentifiers } = extractFromSourceFiles(files);

  const defaultPath = path.join(lexiconsDir, 'en-default.json');
  const sanctuaryPath = path.join(lexiconsDir, 'en-sanctuary.json');
  const simsPath = path.join(lexiconsDir, 'en-sims.json');
  const simlishPath = path.join(lexiconsDir, 'Simlish.json');

  const oldDefault = readJson(defaultPath);
  const oldSanctuary = readJson(sanctuaryPath);
  const oldSims = readJson(simsPath);
  const oldSimlish = readJson(simlishPath);

  // 1. Build clean, 100% complete en-default.json
  const nextDefault = {
    _meta_author: oldDefault._meta_author || 'Sanctuary Foundry',
    _meta_badge: oldDefault._meta_badge || 'Sanctuary',
    _meta_lang: 'en',
    _meta_name: 'English: Default',
  };
  if (oldDefault._meta_version) {
    nextDefault._meta_version = oldDefault._meta_version;
  }

  for (const [termKey, defs] of Object.entries(GLOSSARY_DEFAULTS)) {
    nextDefault[termKey] = oldDefault[termKey] || defs['en-default'];
  }

  let keptExisting = 0;
  let prunedDead = 0;
  for (const [k, v] of Object.entries(oldDefault)) {
    if (k.startsWith('_meta') || k.startsWith('term_') || k.startsWith('icon_')) continue;
    if (typeof v !== 'string' || v.trim() === '') continue;

    if (
      extracted.has(k) ||
      referencedIdentifiers.has(k) ||
      isDynamicPreservedPrefix(k) ||
      KEEPER_LOCKED_KEYS.has(k)
    ) {
      nextDefault[k] = v;
      keptExisting++;
    } else {
      prunedDead++;
    }
  }

  // Add newly extracted keys from source code
  const preservedSanctuaryExtras = {};
  let addedFromCode = 0;
  for (const [k, rawFallback] of extracted.entries()) {
    if (k in nextDefault) continue;
    if (k.startsWith('_meta') || k.startsWith('icon_')) continue;

    const { standard, hadSanctuaryBranding } = normalizeNewFallbackForStandardDefault(rawFallback);
    nextDefault[k] = standard;
    addedFromCode++;

    if (hadSanctuaryBranding && !(k in oldSanctuary)) {
      preservedSanctuaryExtras[k] = rawFallback;
    }
  }

  const sortedDefault = sortLexiconKeys(nextDefault);

  // 2. Build Sparse Delta en-sanctuary.json
  const nextSanctuary = {
    _meta_author: oldSanctuary._meta_author || 'Sanctuary Foundry',
    _meta_badge: oldSanctuary._meta_badge || 'Sanctuary',
    _meta_lang: 'en',
    _meta_name: 'English: Sanctuary',
  };
  if (oldSanctuary._meta_version) {
    nextSanctuary._meta_version = oldSanctuary._meta_version;
  }
  for (const [termKey, defs] of Object.entries(GLOSSARY_DEFAULTS)) {
    nextSanctuary[termKey] = oldSanctuary[termKey] || defs['en-sanctuary'];
  }

  const mergedSanctuaryCandidates = {
    ...preservedSanctuaryExtras,
    ...oldSanctuary,
    ...NEW_THEMATIC_SEEDS['en-sanctuary'],
  };

  for (const [k, v] of Object.entries(mergedSanctuaryCandidates)) {
    if (k.startsWith('_meta') || k.startsWith('term_')) continue;
    if (typeof v !== 'string' || v.trim() === '') continue;

    if (k.startsWith('icon_')) {
      const rawGlyph = k.slice(5);
      if (v !== rawGlyph) nextSanctuary[k] = v;
      continue;
    }

    const isDynamicDomain =
      k.startsWith('class_dd_') || k.startsWith('vault_sub_') || k.startsWith('dlc_type_');
    const defVal = sortedDefault[k];
    if (defVal === undefined && !isDynamicDomain) continue;
    if (v === defVal) continue;
    if (
      defVal !== undefined &&
      interpolateSimple(v, nextSanctuary) === interpolateSimple(defVal, nextSanctuary)
    ) {
      continue;
    }
    nextSanctuary[k] = v;
  }

  const sortedSanctuary = sortLexiconKeys(nextSanctuary);

  // 3. Build Sparse Delta en-sims.json (stripping verbatim en-default AND accidental old en-sanctuary sci-fi clones)
  const nextSims = {
    _meta_author:
      oldSims._meta_author && oldSims._meta_author !== 'Sanctuary Foundry'
        ? oldSims._meta_author
        : 'The Sims 4',
    _meta_badge:
      oldSims._meta_badge && oldSims._meta_badge !== 'Sanctuary'
        ? oldSims._meta_badge
        : 'The Sims 4',
    _meta_lang: 'en',
    _meta_name:
      oldSims._meta_name && oldSims._meta_name !== 'English: Sanctuary'
        ? oldSims._meta_name
        : 'English: The Sims',
  };
  if (oldSims._meta_version) {
    nextSims._meta_version = oldSims._meta_version;
  }
  for (const [termKey, defs] of Object.entries(GLOSSARY_DEFAULTS)) {
    nextSims[termKey] = oldSims[termKey] || defs['en-sims'];
  }

  const mergedSimsCandidates = {
    ...oldSims,
    ...NEW_THEMATIC_SEEDS['en-sims'],
  };

  for (const [k, v] of Object.entries(mergedSimsCandidates)) {
    if (k.startsWith('_meta') || k.startsWith('term_')) continue;
    if (typeof v !== 'string' || v.trim() === '') continue;
    if (KEEPER_LOCKED_KEYS.has(k)) continue;

    if (k.startsWith('icon_')) {
      const rawGlyph = k.slice(5);
      if (v !== rawGlyph) nextSims[k] = v;
      continue;
    }

    const isDynamicDomain =
      k.startsWith('class_dd_') || k.startsWith('vault_sub_') || k.startsWith('dlc_type_');
    const defVal = sortedDefault[k];
    if (defVal === undefined && !isDynamicDomain) continue;
    if (v === defVal) continue;
    // Strip accidental verbatim sci-fi clones copied from old en-sanctuary
    if (!isDynamicDomain && oldSanctuary[k] && v === oldSanctuary[k] && v !== defVal) {
      continue;
    }
    if (
      defVal !== undefined &&
      interpolateSimple(v, nextSims) === interpolateSimple(defVal, nextSims)
    ) {
      continue;
    }
    nextSims[k] = v;
  }

  const sortedSims = sortLexiconKeys(nextSims);

  // 4. Build Sparse Delta Simlish.json (pure Simlish + Sims domain keys; English fallbacks inherit automatically)
  const nextSimlish = {
    _meta_author:
      oldSimlish._meta_author && oldSimlish._meta_author !== 'Sanctuary Foundry'
        ? oldSimlish._meta_author
        : 'The Sims 4',
    _meta_badge:
      oldSimlish._meta_badge && oldSimlish._meta_badge !== 'Sanctuary'
        ? oldSimlish._meta_badge
        : 'The Sims 4',
    _meta_lang: 'Simlish',
    _meta_name: 'Simlish',
  };
  if (oldSimlish._meta_version) {
    nextSimlish._meta_version = oldSimlish._meta_version;
  }
  for (const [termKey, defs] of Object.entries(GLOSSARY_DEFAULTS)) {
    nextSimlish[termKey] = oldSimlish[termKey] || defs.Simlish;
  }

  const mergedSimlishCandidates = {
    ...oldSimlish,
    ...NEW_THEMATIC_SEEDS.Simlish,
  };

  for (const [k, v] of Object.entries(mergedSimlishCandidates)) {
    if (k.startsWith('_meta') || k.startsWith('term_')) continue;
    if (typeof v !== 'string' || v.trim() === '') continue;
    if (KEEPER_LOCKED_KEYS.has(k)) continue;

    if (k.startsWith('icon_')) {
      const rawGlyph = k.slice(5);
      if (v !== rawGlyph) nextSimlish[k] = v;
      continue;
    }

    const isDynamicDomain =
      k.startsWith('class_dd_') || k.startsWith('vault_sub_') || k.startsWith('dlc_type_');
    const defVal = sortedDefault[k];
    if (defVal === undefined && !isDynamicDomain) continue;
    if (v === defVal) continue;
    if (!isDynamicDomain && oldSanctuary[k] && v === oldSanctuary[k]) continue;
    if (sortedSims[k] && v === sortedSims[k]) continue;

    nextSimlish[k] = v;
  }

  const sortedSimlish = sortLexiconKeys(nextSimlish);

  const cDef = writeJsonIfChanged(defaultPath, sortedDefault);
  const cSanc = writeJsonIfChanged(sanctuaryPath, sortedSanctuary);
  const cSims = writeJsonIfChanged(simsPath, sortedSims);
  const cSiml = writeJsonIfChanged(simlishPath, sortedSimlish);

  if (cDef || cSanc || cSims || cSiml) {
    console.log(
      `[sync-lexicons] Synced lexicons -> en-default: ${Object.keys(sortedDefault).length} keys (+${addedFromCode} extracted, -${prunedDead} dead, ${keptExisting} kept) | Sparse Deltas -> en-sanctuary: ${Object.keys(sortedSanctuary).length}, en-sims: ${Object.keys(sortedSims).length}, Simlish: ${Object.keys(sortedSimlish).length}`
    );
  } else {
    console.log(
      `[sync-lexicons] All lexicons up to date (en-default: ${Object.keys(sortedDefault).length} keys | deltas: en-sanctuary=${Object.keys(sortedSanctuary).length}, en-sims=${Object.keys(sortedSims).length}, Simlish=${Object.keys(sortedSimlish).length}).`
    );
  }
}

main();
