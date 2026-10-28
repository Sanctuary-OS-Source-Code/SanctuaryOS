import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './utils/envUtils';
import { isRootDomain } from './utils/routingUtils';
import { mkdir, writeTextFile, readDir, readTextFile, remove, exists } from '@tauri-apps/plugin-fs';
import enSanctuary from './lexicons/en-sanctuary.json';
import enDefault from './lexicons/en-default.json';
import enSimlish from './lexicons/Simlish.json';
import enSimsJson from './lexicons/en-sims.json';
import { supabase, supabaseAuth } from './supabase';
import { useStore } from './store';
import {
  applyThematicGlossaryToProse,
  getAutoTranslateDynamicPref,
  setAutoTranslateDynamicPref,
  getCachedDynamicTranslation,
  resolveTargetLanguageIso,
  translatePostedTextAsync,
} from './utils/translationEngine';

const enSims: Record<string, any> = { ...enSimlish, ...enSimsJson };

export interface GlossaryTermDefinition {
  key: string;
  token: string;
  labelKey: string;
  icon: string;
  defaults: {
    'en-default': string;
    'en-sanctuary': string;
    'en-sims': string;
  };
}

export const CORE_GLOSSARY_TERMS: GlossaryTermDefinition[] = [
  {
    key: 'term_mod',
    token: 'Mod',
    labelKey: 'term_mod_label',
    icon: 'extension',
    defaults: { 'en-default': 'Mod', 'en-sanctuary': 'Artifact', 'en-sims': 'Mod' },
  },
  {
    key: 'term_mods',
    token: 'Mods',
    labelKey: 'term_mods_label',
    icon: 'widgets',
    defaults: { 'en-default': 'Mods', 'en-sanctuary': 'Artifacts', 'en-sims': 'Mods' },
  },
  {
    key: 'term_vault',
    token: 'Vault',
    labelKey: 'term_vault_label',
    icon: 'inventory_2',
    defaults: { 'en-default': 'Library', 'en-sanctuary': 'Vault', 'en-sims': 'Library' },
  },
  {
    key: 'term_blueprint',
    token: 'Blueprint',
    labelKey: 'term_blueprint_label',
    icon: 'map',
    defaults: { 'en-default': 'Play Set', 'en-sanctuary': 'Blueprint', 'en-sims': 'Modpack' },
  },
  {
    key: 'term_blueprints',
    token: 'Blueprints',
    labelKey: 'term_blueprints_label',
    icon: 'collections_bookmark',
    defaults: { 'en-default': 'Play Sets', 'en-sanctuary': 'Blueprints', 'en-sims': 'Modpacks' },
  },
  {
    key: 'term_mason',
    token: 'Mason',
    labelKey: 'term_mason_label',
    icon: 'construction',
    defaults: { 'en-default': 'Creator', 'en-sanctuary': 'Mason', 'en-sims': 'Creator' },
  },
  {
    key: 'term_masons',
    token: 'Masons',
    labelKey: 'term_masons_label',
    icon: 'engineering',
    defaults: { 'en-default': 'Creators', 'en-sanctuary': 'Masons', 'en-sims': 'Creators' },
  },
  {
    key: 'term_citizen',
    token: 'Citizen',
    labelKey: 'term_citizen_label',
    icon: 'person',
    defaults: { 'en-default': 'User', 'en-sanctuary': 'Citizen', 'en-sims': 'Simmer' },
  },
  {
    key: 'term_citizens',
    token: 'Citizens',
    labelKey: 'term_citizens_label',
    icon: 'group',
    defaults: { 'en-default': 'Users', 'en-sanctuary': 'Citizens', 'en-sims': 'Simmers' },
  },
  {
    key: 'term_backups',
    token: 'Backups',
    labelKey: 'term_backups_label',
    icon: 'history',
    defaults: { 'en-default': 'Backups', 'en-sanctuary': 'Time Capsule', 'en-sims': 'Backups' },
  },
  {
    key: 'term_lab',
    token: 'Lab',
    labelKey: 'term_lab_label',
    icon: 'science',
    defaults: { 'en-default': 'Testing Lab', 'en-sanctuary': 'Homestead', 'en-sims': 'Testing Lab' },
  },
  {
    key: 'term_settings',
    token: 'Settings',
    labelKey: 'term_settings_label',
    icon: 'settings',
    defaults: { 'en-default': 'Settings', 'en-sanctuary': 'System Preferences', 'en-sims': 'Settings' },
  },
  {
    key: 'term_nexus',
    token: 'Nexus',
    labelKey: 'term_nexus_label',
    icon: 'hub',
    defaults: { 'en-default': 'Marketplace', 'en-sanctuary': 'The Nexus', 'en-sims': 'The Gallery' },
  },
  {
    key: 'term_chameleon',
    token: 'Chameleon',
    labelKey: 'term_chameleon_label',
    icon: 'palette',
    defaults: { 'en-default': 'Theme', 'en-sanctuary': 'Chameleon', 'en-sims': 'Theme' },
  },
  {
    key: 'term_chameleons',
    token: 'Chameleons',
    labelKey: 'term_chameleons_label',
    icon: 'style',
    defaults: { 'en-default': 'Themes', 'en-sanctuary': 'Chameleons', 'en-sims': 'Themes' },
  },
  {
    key: 'term_lexicon',
    token: 'Lexicon',
    labelKey: 'term_lexicon_label',
    icon: 'translate',
    defaults: { 'en-default': 'Language', 'en-sanctuary': 'Lexicon', 'en-sims': 'Language' },
  },
  {
    key: 'term_lexicons',
    token: 'Lexicons',
    labelKey: 'term_lexicons_label',
    icon: 'g_translate',
    defaults: { 'en-default': 'Languages', 'en-sanctuary': 'Lexicons', 'en-sims': 'Languages' },
  },
  {
    key: 'term_dispatch',
    token: 'Dispatch',
    labelKey: 'term_dispatch_label',
    icon: 'podcasts',
    defaults: { 'en-default': 'Post', 'en-sanctuary': 'Transmission', 'en-sims': 'Post' },
  },
  {
    key: 'term_dispatches',
    token: 'Dispatches',
    labelKey: 'term_dispatches_label',
    icon: 'cell_tower',
    defaults: { 'en-default': 'Posts', 'en-sanctuary': 'Transmissions', 'en-sims': 'Posts' },
  },
  {
    key: 'term_delete',
    token: 'Delete',
    labelKey: 'term_delete_label',
    icon: 'delete_forever',
    defaults: { 'en-default': 'Delete', 'en-sanctuary': 'Purge', 'en-sims': 'Delete' },
  },
  {
    key: 'term_remove',
    token: 'Remove',
    labelKey: 'term_remove_label',
    icon: 'eject',
    defaults: { 'en-default': 'Remove', 'en-sanctuary': 'Yeet', 'en-sims': 'Remove' },
  },
];

const TOKEN_TO_TERM_DEF: Record<string, { def: GlossaryTermDefinition; casing: 'title' | 'lower' | 'upper' }> = {};
for (const item of CORE_GLOSSARY_TERMS) {
  TOKEN_TO_TERM_DEF[item.token] = { def: item, casing: 'title' };
  TOKEN_TO_TERM_DEF[item.token.toLowerCase()] = { def: item, casing: 'lower' };
  TOKEN_TO_TERM_DEF[item.token.toUpperCase()] = { def: item, casing: 'upper' };
  TOKEN_TO_TERM_DEF[item.key] = { def: item, casing: 'title' };
}

export function sanitizeLexiconMojibake(str: string): string {
  if (typeof str !== 'string' || !str.includes('Ã')) return str;
  return str
    .replace(/Ã¢â‚¬Â¢/g, '•')
    .replace(/Ã¢â‚¬â€\s*/g, '— ')
    .replace(/Ã¢â‚¬â€/g, '—')
    .replace(/Ã‚Â©/g, '©');
}

const PRESERVED_ACRONYMS = new Set([
  'OS', 'UI', 'UX', 'ID', 'IDS', 'URL', 'URLS', 'URI', 'API', 'APIS', 'DLC', 'DLCS', 'CC', 'PC', 'HQ',
  '2FA', 'MFA', 'SSO', 'VIP', 'PWA', 'IDE', 'SQL', 'RLS', 'JSON', 'CSV', 'XML', 'YAML', 'TOML', 'HTML', 'CSS', 'JS', 'TS', 'TSX', 'MD',
  'SHA', 'SHA-256', 'MD5', 'DEFCON', 'FIDO2', 'TOTP', 'JWT', 'UUID', 'HEX', 'RGB', 'RGBA', 'HSL',
  'MSI', 'EXE', 'DMG', 'PKG', 'DEB', 'RPM', 'APPIMAGE', 'ZIP', 'RAR', '7Z', 'CFG', 'INI',
  'AV', 'GB', 'MB', 'KB', 'TB', 'PB', 'B', 'MS', 'FPS', 'HZ', 'GHZ', 'MHZ',
  'CPU', 'GPU', 'RAM', 'VRAM', 'SSD', 'NVME', 'HDD', 'IO', 'I/O', 'LAN', 'WAN', 'VPN', 'DNS', 'IP', 'TCP', 'UDP', 'HTTP', 'HTTPS', 'SSL', 'TLS', 'SSH', 'FTP',
  'CI', 'CD', 'CI/CD', 'PR', 'SDK', 'CLI', 'GUI', 'HUD', 'RNG', 'RPG', 'MMO', 'NPC', 'CAS', 'BB', 'TS4', 'WW', 'MCCC',
  'PDF', 'PNG', 'JPG', 'JPEG', 'WEBP', 'SVG', 'GIF', 'MP4', 'WEBM', 'MP3', 'WAV', 'OGG',
  'UTC', 'GMT', 'EST', 'PST', 'CST', 'MST', 'EDT', 'PDT', 'AI', 'ML', 'LLM', 'WEBGL', 'GLSL', 'RBAC', 'ACL', 'CORS', 'CSRF', 'XSS', 'DDOS', 'P2P', 'CDN', 'OTA', 'EOF', 'EOL', 'NULL', 'NAN', 'OK', 'FAQ', 'TOS', 'EULA', 'DMCA', 'GDPR', 'CCPA',
]);

export function normalizeAllCapsForThemeCase(str: string): string {
  if (typeof str !== 'string') return str;
  if (/[a-z]/.test(str) || !/[A-Z]{2,}/.test(str)) return str;
  return str.replace(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g, (word) => {
    if (PRESERVED_ACRONYMS.has(word)) return word;
    if (/^\d+$/.test(word)) return word;
    if (word.includes('-')) {
      return word
        .split('-')
        .map((part) => (PRESERVED_ACRONYMS.has(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
        .join('-');
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

export function interpolateGlossaryTokens(
  str: string,
  dict: Record<string, any>,
  activeLang: string = 'en-sanctuary'
): string {
  if (typeof str !== 'string') return str;
  const cleaned = normalizeAllCapsForThemeCase(sanitizeLexiconMojibake(str));
  if (!cleaned.includes('{')) return cleaned;

  const resolveToken = (tokName: string): string | null => {
    const entry = TOKEN_TO_TERM_DEF[tokName];
    if (!entry) return null;
    const langBucket =
      activeLang === 'en-default'
        ? 'en-default'
        : activeLang === 'en-sims' || activeLang === 'Simlish'
          ? 'en-sims'
          : 'en-sanctuary';
    const rawDictVal = dict?.[entry.def.key];
    const validDictVal =
      typeof rawDictVal === 'string' && rawDictVal.trim() !== '' && !rawDictVal.includes('{')
        ? rawDictVal
        : undefined;
    const baseVal =
      validDictVal ||
      entry.def.defaults[langBucket] ||
      entry.def.defaults['en-default'];
    if (entry.casing === 'lower') return String(baseVal).toLowerCase();
    if (entry.casing === 'upper') return String(baseVal).toUpperCase();
    return String(baseVal);
  };

  const withArticles = cleaned.replace(
    /\b(a|A|an|An)(\s+)\{\{?\{?([A-Za-z_]+)\}?\}?\}/g,
    (full, article, space, tokName) => {
      const resolved = resolveToken(tokName);
      if (resolved === null) return full;
      const startsWithVowel = /^[aeiouAEIOU]/.test(resolved.trim());
      const isUpperFirst = article[0] === 'A';
      const isAllCaps = article === 'AN';
      const nextArticle = startsWithVowel
        ? isAllCaps
          ? 'AN'
          : isUpperFirst
            ? 'An'
            : 'an'
        : isUpperFirst
          ? 'A'
          : 'a';
      return `${nextArticle}${space}${resolved}`;
    }
  );

  return withArticles.replace(/\{\{?\{?([A-Za-z_]+)\}?\}?\}/g, (full, tokName) => {
    const resolved = resolveToken(tokName);
    return resolved !== null ? resolved : full;
  });
}

export const DEFAULT_TITLE_AREA_SUBTITLES: string[] = [
  'Dont Be Evil',
  'Advise Never Dictate',
  'Chronological By Design',
  'Your System Your Sovereignty',
  'Control Your Code',
  'Cloud Not Required',
  'Your Personal Co-Pilot',
  'Update Not Required',
  "Yeeting Conflicts Since '26",
  'King Notepad++ Dethroned',
  'No Black Boxes',
  'Private By Design',
];

export interface CoreTitleAreaConfig {
  logoUrl: string;
  appTitle: string;
  subtitles: string[];
  lockedStrings: Record<string, string>;
  updatedAt?: string;
}

export const DEFAULT_CORE_TITLE_AREA_CONFIG: CoreTitleAreaConfig = {
  logoUrl: '/icon.png',
  appTitle: 'Sanctuary OS',
  subtitles: [...DEFAULT_TITLE_AREA_SUBTITLES],
  lockedStrings: {},
};

export const CORE_TITLE_AREA_STORAGE_KEY = 'sanctuary_core_title_area_config_v1';

export function readCoreTitleAreaConfig(): CoreTitleAreaConfig {
  try {
    const raw = localStorage.getItem(CORE_TITLE_AREA_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CORE_TITLE_AREA_CONFIG, subtitles: [...DEFAULT_TITLE_AREA_SUBTITLES], lockedStrings: {} };
    const parsed = JSON.parse(raw);
    return {
      logoUrl: typeof parsed?.logoUrl === 'string' && parsed.logoUrl.trim() ? parsed.logoUrl.trim() : '/icon.png',
      appTitle: typeof parsed?.appTitle === 'string' && parsed.appTitle.trim() ? parsed.appTitle.trim() : 'Sanctuary OS',
      subtitles: Array.isArray(parsed?.subtitles) && parsed.subtitles.length > 0
        ? parsed.subtitles.map((s: any) => String(s || '').trim()).filter(Boolean)
        : [...DEFAULT_TITLE_AREA_SUBTITLES],
      lockedStrings: parsed?.lockedStrings && typeof parsed.lockedStrings === 'object' ? { ...parsed.lockedStrings } : {},
      updatedAt: parsed?.updatedAt,
    };
  } catch {
    return { ...DEFAULT_CORE_TITLE_AREA_CONFIG, subtitles: [...DEFAULT_TITLE_AREA_SUBTITLES], lockedStrings: {} };
  }
}

export function isKeeperLockedLexiconKey(key: string): boolean {
  if (!key) return false;
  const k = key.toLowerCase();
  return k === 'sidebar_app_title' || k.startsWith('sidebar_app_subtitle');
}

const LexiconContext: ReturnType<typeof createContext<any>> =
  (globalThis as any).__SANCTUARY_LEXICON_CONTEXT__ ||
  ((globalThis as any).__SANCTUARY_LEXICON_CONTEXT__ = createContext<any>(null));

async function resolveVaultLexiconRoots(): Promise<{ masterVault: string; spokeVault: string }> {
  const [globalConfig, coords]: [any, any] = await Promise.all([
    invoke('get_global_config').catch(() => null),
    invoke('get_saved_coordinates').catch(() => null),
  ]);
  const spokeVault = String(coords?.vault_path || '').trim().replace(/[\\/]+$/, '');
  let masterVault = String(globalConfig?.vault_path || '').trim().replace(/[\\/]+$/, '');
  if (!masterVault && spokeVault) {
    const lastSep = Math.max(spokeVault.lastIndexOf('\\'), spokeVault.lastIndexOf('/'));
    masterVault = lastSep > 0 ? spokeVault.slice(0, lastSep) : spokeVault;
  }
  return { masterVault: masterVault || spokeVault, spokeVault };
}

export const LexiconProvider = ({ children }: any) => {
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const isWebHubRoot = !isDesktop() && isRootDomain();
  const wsId = isWebHubRoot ? 'default_workspace' : (activeWorkspaceId || 'default');

  const BUILTIN_LEXICON_IDS = new Set(['en-default', 'en-sanctuary', 'en-sims', 'Simlish']);

  const resolveGameDefaultLexicon = (schema: any, metaList?: any[]) => {
    const cleanSchemaId = String(schema?.id || '').toLowerCase().trim();
    if (
      isWebHubRoot ||
      wsId === 'default' ||
      wsId === 'default_workspace' ||
      !cleanSchemaId ||
      cleanSchemaId === 'default' ||
      cleanSchemaId === 'default_schema' ||
      cleanSchemaId === 'default_workspace'
    ) {
      return 'en-sanctuary';
    }
    if (schema?.default_lexicon) return schema.default_lexicon;
    if (schema?.lexicon_id) return schema.lexicon_id;
    if (schema?.schema_json?.default_lexicon) return schema.schema_json.default_lexicon;

    const gameDescriptor = `${schema?.id || ''} ${schema?.name || ''} ${schema?.display_name || ''}`.toLowerCase();
    if (gameDescriptor.includes('sims')) {
      return 'en-sims';
    }

    const spokeDefault = metaList?.find(
      (m: any) => m?.is_default || (!BUILTIN_LEXICON_IDS.has(m?.id) && m?.badge && m.badge !== 'Sanctuary')
    );
    if (spokeDefault?.id) {
      return spokeDefault.id;
    }

    return 'en-sanctuary';
  };

  const readRegistryFromStorage = (workspaceId: string) => {
    try {
      const globalRaw = JSON.parse(localStorage.getItem('sanctuary_global_lexicon_registry') || '{}');
      const key = `sanctuary_${workspaceId}_lexicon_registry`;
      const raw = localStorage.getItem(key);
      const wsParsed = raw ? JSON.parse(raw) : {};
      const parsed: Record<string, any> = {
        ...(typeof wsParsed === 'object' && wsParsed ? wsParsed : {}),
        ...(typeof globalRaw === 'object' && globalRaw ? globalRaw : {}),
      };
      let hadBuiltins = false;
      for (const id of BUILTIN_LEXICON_IDS) {
        if (id in parsed) {
          delete parsed[id];
          hadBuiltins = true;
        }
      }
      if (hadBuiltins) {
        try {
          localStorage.removeItem(key);
          if (Object.keys(parsed).length > 0) {
            const cleanedStr = JSON.stringify(parsed);
            localStorage.setItem(key, cleanedStr);
            localStorage.setItem('sanctuary_global_lexicon_registry', cleanedStr);
          }
        } catch {}
      }
      return parsed;
    } catch {
      return {};
    }
  };

  const saveRegistryToStorage = (workspaceId: string, reg: Record<string, any>) => {
    const key = `sanctuary_${workspaceId}_lexicon_registry`;
    const customOnly: Record<string, any> = {};
    for (const [k, v] of Object.entries(reg || {})) {
      if (!BUILTIN_LEXICON_IDS.has(k)) {
        customOnly[k] = v;
      }
    }
    if (Object.keys(customOnly).length === 0) {
      try {
        localStorage.removeItem(key);
        localStorage.removeItem('sanctuary_global_lexicon_registry');
      } catch {}
      return;
    }
    const serialized = JSON.stringify(customOnly);
    try {
      localStorage.setItem(key, serialized);
      localStorage.setItem('sanctuary_global_lexicon_registry', serialized);
    } catch (e) {
      // Free up space from any legacy bloated lexicon_registry keys across workspaces
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.endsWith('_lexicon_registry')) {
            localStorage.removeItem(k);
          }
        }
        localStorage.setItem(key, serialized);
        localStorage.setItem('sanctuary_global_lexicon_registry', serialized);
      } catch (err) {
        console.warn('Could not persist custom lexicon registry to localStorage:', err);
      }
    }
  };

  const [useGlobalLexiconState, setUseGlobalLexiconState] = useState(() => localStorage.getItem('sanctuary_use_global_lexicon') === 'true');
  const [registry, setRegistry] = useState(() => readRegistryFromStorage(wsId));
  const [lexiconMeta, setLexiconMeta] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`sanctuary_${wsId}_lexicon_meta`) || "[]");
    } catch {
      return [];
    }
  });
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const osRoleFromStore = useStore((state) => state.osRole);
  const [builtinOverrides, setBuiltinOverrides] = useState<Record<string, Record<string, any>>>({});
  const [titleAreaConfig, setTitleAreaConfig] = useState<CoreTitleAreaConfig>(() => readCoreTitleAreaConfig());
  const [previewSubtitleText, setPreviewSubtitleText] = useState<string | null>(null);
  const [activeLangState, setActiveLangState] = useState(() => {
    const defaultLang = resolveGameDefaultLexicon(activeGameSchema, lexiconMeta);
    
    if (localStorage.getItem('sanctuary_use_global_lexicon') === 'true') {
      return localStorage.getItem('sanctuary_global_lang') || "en-sanctuary";
    }
    return localStorage.getItem(`sanctuary_${wsId}_lang`) || defaultLang;
  });
  const [dictionary, setDictionary] = useState<any>({});

  const setUseGlobalLexicon = (val: boolean) => {
    setUseGlobalLexiconState(val);
    try { localStorage.setItem('sanctuary_use_global_lexicon', String(val)); } catch {}
    if (val) {
      setActiveLangState(localStorage.getItem('sanctuary_global_lang') || "en-sanctuary");
    } else {
      const defaultLang = resolveGameDefaultLexicon(activeGameSchema, lexiconMeta);
      setActiveLangState(localStorage.getItem(`sanctuary_${wsId}_lang`) || defaultLang);
    }
  };

  const setActiveLang = (lang: string) => {
    setActiveLangState(lang);
    try {
      if (useGlobalLexiconState) {
        localStorage.setItem('sanctuary_global_lang', lang);
      } else {
        localStorage.setItem(`sanctuary_${wsId}_lang`, lang);
      }
    } catch {}
  };

  // When workspace changes, hydrate from local storage
  useEffect(() => {
    setRegistry(readRegistryFromStorage(wsId));
    let parsedMeta: any[] = [];
    try {
      parsedMeta = JSON.parse(localStorage.getItem(`sanctuary_${wsId}_lexicon_meta`) || "[]");
      setLexiconMeta(parsedMeta);
    } catch {
      setLexiconMeta([]);
    }
    if (!useGlobalLexiconState) {
      const defaultLang = resolveGameDefaultLexicon(activeGameSchema, parsedMeta);
      setActiveLangState(localStorage.getItem(`sanctuary_${wsId}_lang`) || defaultLang);
    }
  }, [wsId, useGlobalLexiconState, activeGameSchema]);

  useEffect(() => {
    const loadLang = () => {
      const baseDefault = { ...enDefault, ...(builtinOverrides['en-default'] || {}) };
      const baseSanctuary = { ...baseDefault, ...enSanctuary, ...(builtinOverrides['en-sanctuary'] || {}) };
      if (activeLangState === 'en-default') {
        setDictionary(baseDefault);
        return;
      }
      if (activeLangState === 'en-sanctuary') {
        setDictionary(baseSanctuary);
        return;
      }
      if (activeLangState === 'en-sims' || activeLangState === 'Simlish') {
        const cleanSpokeOverrides: Record<string, any> = {};
        for (const [k, v] of Object.entries(registry[activeLangState] || {})) {
          if (v !== '' && v !== null && v !== undefined && !isKeeperLockedLexiconKey(k)) {
            cleanSpokeOverrides[k] = v;
          }
        }
        setDictionary({
          ...baseDefault,
          ...enSims,
          ...(builtinOverrides[activeLangState] || {}),
          ...cleanSpokeOverrides
        });
        return;
      }
      if (registry[activeLangState]) {
        const customDict = registry[activeLangState];
        const nonEmptyCustom: Record<string, any> = {};
        for (const [k, v] of Object.entries(customDict)) {
          if (v !== "" && v !== null && v !== undefined && !isKeeperLockedLexiconKey(k)) {
            nonEmptyCustom[k] = v;
          }
        }
        setDictionary({
          ...baseDefault,
          ...nonEmptyCustom
        });
        return;
      }
      setDictionary(baseSanctuary);
      return;
    };
    loadLang();
  }, [activeLangState, registry, builtinOverrides, wsId]);

  useEffect(() => {
    const handleLiveLexiconUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail?.id || !detail?.lexiconData) return;
      const { id, lexiconData } = detail;
      if (BUILTIN_LEXICON_IDS.has(id)) {
        setBuiltinOverrides((prev) => ({ ...prev, [id]: lexiconData }));
      } else {
        setRegistry((prev: any) => {
          const next = { ...prev, [id]: lexiconData };
          saveRegistryToStorage(wsId, next);
          return next;
        });
      }
      setLexiconMeta((prev) => {
        const existsIdx = prev.findIndex((m: any) => m.id === id);
        const nextEntry = {
          id,
          name: lexiconData._meta_name || id,
          badge: lexiconData._meta_badge || "Sanctuary",
          version: lexiconData._meta_version || 1,
          lang: lexiconData._meta_lang || "English",
          is_default: Boolean(lexiconData._meta_default),
        };
        if (existsIdx >= 0) {
          const copy = [...prev];
          copy[existsIdx] = { ...copy[existsIdx], ...nextEntry };
          return copy;
        }
        return [...prev, nextEntry];
      });
    };
    window.addEventListener("sanctuary-lexicon-updated", handleLiveLexiconUpdate);
    return () => window.removeEventListener("sanctuary-lexicon-updated", handleLiveLexiconUpdate);
  }, [wsId]);

  // Sync Core OS Title Area & Brand Config from Keepers Hub (supabaseAuth) — isolated from Lexicons
  useEffect(() => {
    const syncCoreTitleAreaFromHub = async () => {
      try {
        if (!navigator.onLine || localStorage.getItem('sanctuary_local_only') === 'true') return;
        const client = supabaseAuth || supabase;
        const { data } = await client
          .from('keeper_system_broadcasts')
          .select('message, created_at')
          .eq('category', 'CoreTitleAreaConfig')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data && data.message) {
          const parsed = JSON.parse(data.message);
          const nextConfig: CoreTitleAreaConfig = {
            logoUrl: typeof parsed?.logoUrl === 'string' && parsed.logoUrl.trim() ? parsed.logoUrl.trim() : '/icon.png',
            appTitle: typeof parsed?.appTitle === 'string' && parsed.appTitle.trim() ? parsed.appTitle.trim() : 'Sanctuary OS',
            subtitles: Array.isArray(parsed?.subtitles) && parsed.subtitles.length > 0
              ? parsed.subtitles.map((s: any) => String(s || '').trim()).filter(Boolean)
              : [...DEFAULT_TITLE_AREA_SUBTITLES],
            lockedStrings: parsed?.lockedStrings && typeof parsed.lockedStrings === 'object' ? { ...parsed.lockedStrings } : {},
            updatedAt: parsed?.updatedAt || data.created_at,
          };
          setTitleAreaConfig(nextConfig);
          try {
            localStorage.setItem(CORE_TITLE_AREA_STORAGE_KEY, JSON.stringify(nextConfig));
          } catch {}
        }
      } catch {
        // Fallback to cached/default Title Area config
      }
    };
    syncCoreTitleAreaFromHub();

    const handleTitleAreaEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail === 'object') {
        setTitleAreaConfig(detail as CoreTitleAreaConfig);
      } else {
        setTitleAreaConfig(readCoreTitleAreaConfig());
      }
    };
    window.addEventListener('sanctuary-title-area-updated', handleTitleAreaEvent);
    return () => window.removeEventListener('sanctuary-title-area-updated', handleTitleAreaEvent);
  }, []);

  const saveTitleAreaConfig = async (updates: Partial<CoreTitleAreaConfig>): Promise<CoreTitleAreaConfig> => {
    const current = readCoreTitleAreaConfig();
    const cleanedSubtitles = Array.isArray(updates.subtitles)
      ? updates.subtitles.map((s) => String(s || '').trim()).filter(Boolean)
      : current.subtitles;
    const nextConfig: CoreTitleAreaConfig = {
      logoUrl: updates.logoUrl !== undefined ? (String(updates.logoUrl || '').trim() || '/icon.png') : current.logoUrl,
      appTitle: updates.appTitle !== undefined ? (String(updates.appTitle || '').trim() || 'Sanctuary OS') : current.appTitle,
      subtitles: cleanedSubtitles.length > 0 ? cleanedSubtitles : [...DEFAULT_TITLE_AREA_SUBTITLES],
      lockedStrings: updates.lockedStrings !== undefined ? { ...updates.lockedStrings } : { ...current.lockedStrings },
      updatedAt: new Date().toISOString(),
    };

    setTitleAreaConfig(nextConfig);
    try {
      localStorage.setItem(CORE_TITLE_AREA_STORAGE_KEY, JSON.stringify(nextConfig));
    } catch {}
    window.dispatchEvent(new CustomEvent('sanctuary-title-area-updated', { detail: nextConfig }));

    try {
      const client = supabaseAuth || supabase;
      const payloadStr = JSON.stringify(nextConfig);
      const { data: existing } = await client
        .from('keeper_system_broadcasts')
        .select('id')
        .eq('category', 'CoreTitleAreaConfig')
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await client
          .from('keeper_system_broadcasts')
          .update({
            title: 'CORE_OS_TITLE_AREA_CONFIG',
            message: payloadStr,
            target_audience: 'Internal_TitleArea',
            is_active: false,
            is_pinned: false,
          })
          .eq('id', existing.id);
      } else {
        await client.from('keeper_system_broadcasts').insert([
          {
            title: 'CORE_OS_TITLE_AREA_CONFIG',
            category: 'CoreTitleAreaConfig',
            message: payloadStr,
            target_audience: 'Internal_TitleArea',
            is_active: false,
            is_pinned: false,
          },
        ]);
      }
    } catch (err) {
      console.error('Failed to sync Core Title Area config to Hub:', err);
    }

    return nextConfig;
  };


  useEffect(() => {
    const scanVault = async () => {
      try {
        if (!isDesktop()) return;
        const { masterVault, spokeVault } = await resolveVaultLexiconRoots();
        if (!masterVault) return;
        const lexiconsDir = `${masterVault}\\Data\\Lexicons`;
        const legacySpokeLexiconsDir =
          spokeVault && spokeVault.toLowerCase() !== masterVault.toLowerCase()
            ? `${spokeVault}\\Data\\Lexicons`
            : '';

        let localUpdates: any = {};
        let hasLocalUpdates = false;

        for (const candidateDir of [lexiconsDir, legacySpokeLexiconsDir].filter(Boolean)) {
          if (!(await exists(candidateDir))) continue;
          const entries = await readDir(candidateDir);
          for (const entry of entries) {
            if (entry.name && entry.name.endsWith('.json')) {
              const langCode = entry.name.replace('.json', '');
              const content = await readTextFile(`${candidateDir}\\${entry.name}`);
              const parsed = JSON.parse(content);
              localUpdates[langCode] = parsed;
              hasLocalUpdates = true;
              if (candidateDir !== lexiconsDir) {
                await mkdir(lexiconsDir, { recursive: true }).catch(() => {});
                await writeTextFile(`${lexiconsDir}\\${entry.name}`, JSON.stringify(parsed, null, 2)).catch(() => {});
              }
            }
          }
        }

        if (hasLocalUpdates) {
          setRegistry((prev: any) => {
            const newReg = { ...prev, ...localUpdates };
            saveRegistryToStorage(wsId, newReg);
            return newReg;
          });
        }
      } catch (err) {
        console.error("Failed to scan vault lexicons:", err);
      }
    };
    scanVault();
  }, [wsId]);

  useEffect(() => {
    const syncMasterLexicons = async () => {
      try {
        if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

        // Fetch Core OS Lexicons ONLY if they have access
        const osRole = useStore.getState().osRole;
        const hasOSAccess = ["keeper", "admin", "core_dev"].includes(osRole);
        let osRes: { data: any[] | null, error: any } = { data: [], error: null };
        
        if (hasOSAccess) {
            osRes = await supabaseAuth.from('sanctuary_lexicons').select('id, name, badge, version, lexicon_data');
        }
        
        // Fetch Community Lexicons (via proxy to current game DB)
        const gamePromise = supabase.from('sanctuary_lexicons').select('id, name, badge, version, lexicon_data');

        const gameRes = await gamePromise;
        if (hasOSAccess && osRes.error) throw osRes.error;
        if (gameRes.error && gameRes.error.code !== '42P01') console.error("Game lexicons error:", gameRes.error); // Ignore if table doesn't exist yet
        
        // Merge them, prioritizing Game Database over OS Database if there are conflicts, OR maybe OS takes priority?
        // Actually, OS lexicons (en-sanctuary, en-default) should take priority.
        const mergedData = [...(gameRes.data || []), ...(osRes.data || [])];
        const data = Array.from(new Map(mergedData.map(item => [item.id, item])).values());

        // --- Force sync missing/updated keys to cloud ---
        if (data) {
          for (let row of data) {
            let localData: any = {};
            if (row.id === 'en-default') localData = enDefault;
            if (row.id === 'en-sanctuary') localData = enSanctuary;
            if (row.id === 'en-sims' || row.id === 'Simlish') localData = enSims;

            if (Object.keys(localData).length > 0) {
              let hasChanges = false;
              if (!row.lexicon_data) row.lexicon_data = {};
              for (const key in localData) {
                if (row.lexicon_data[key] !== localData[key]) {
                  row.lexicon_data[key] = localData[key];
                  hasChanges = true;
                }
              }
              for (const key in row.lexicon_data) {
                if (!key.startsWith('_meta') && !(key in localData)) {
                  delete row.lexicon_data[key];
                  hasChanges = true;
                }
              }

              if (hasChanges) {
                if (hasOSAccess) {
                  if (row.id === 'en-default' || row.id === 'en-sanctuary') {
                    await supabaseAuth.from('sanctuary_lexicons').upsert({
                      id: row.id,
                      name: row.name || row.id,
                      badge: row.badge || 'Sanctuary',
                      version: row.version || 1,
                      lexicon_data: row.lexicon_data,
                      updated_at: new Date().toISOString(),
                    } as any);
                  }
                  const token = useStore.getState().session?.access_token;
                  if (token) {
                    await supabase.rpc('secure_upsert_cloud_file', { p_token: token, p_target: 'sanctuary_lexicons', p_payload: row });
                  } else {
                    await supabase.from('sanctuary_lexicons').update({ lexicon_data: row.lexicon_data }).eq('id', row.id);
                  }
                }
              }
            }
          }
        }
        // --- END SYNC ---

        if (data && data.length > 0) {
          let cloudUpdates: any = {};
          for (const row of data) {
            if (!BUILTIN_LEXICON_IDS.has(row.id)) {
              cloudUpdates[row.id] = row.lexicon_data;
            }
          }

          setRegistry((prev: any) => {
            const newReg = { ...prev, ...cloudUpdates };
            saveRegistryToStorage(wsId, newReg);
            return newReg;
          });

          // Cache metadata like badges and names
          const meta = data.map(d => ({
            id: d.id,
            name: d.name,
            badge: d.badge,
            version: d.version,
            lang: d.lexicon_data?._meta_lang || 'English',
            is_default: Boolean(d.lexicon_data?._meta_default || d.is_default)
          }));
          try {
            localStorage.setItem(`sanctuary_${wsId}_lexicon_meta`, JSON.stringify(meta));
          } catch {}
          setLexiconMeta(meta);

          if (!useGlobalLexiconState && !localStorage.getItem(`sanctuary_${wsId}_lang`)) {
            const currentSchema = useStore.getState().activeGameSchema;
            const resolvedDefault = resolveGameDefaultLexicon(currentSchema, meta);
            if (resolvedDefault) {
              setActiveLangState(resolvedDefault);
            }
          }
        }
      } catch (err) {
        console.error("Failed to sync master lexicons:", err);
      }
    };
    syncMasterLexicons();
  }, [wsId, osRoleFromStore]);

  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{231A}\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}]/u;

  const schemaFallbackMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (activeGameSchema?.lexicon_defaults && typeof activeGameSchema.lexicon_defaults === 'object') {
      for (const [k, v] of Object.entries(activeGameSchema.lexicon_defaults)) {
        if (typeof v === 'string' && v.trim()) {
          map[k] = v;
        }
      }
    }
    const cats = Array.isArray(activeGameSchema?.mod_categories)
      ? activeGameSchema.mod_categories
      : [];
    for (const c of cats) {
      if (!c || typeof c !== 'object') continue;
      const catLabel = c.label || c.name || c.id;
      if (c.lexicon_key && catLabel) {
        map[c.lexicon_key] = catLabel;
      }
      if (c.icon_key && c.icon) {
        map[c.icon_key] = c.icon;
      }
      if (Array.isArray(c.subcategories)) {
        for (const sub of c.subcategories) {
          if (!sub || typeof sub !== 'object') continue;
          const subLabel = sub.label || sub.name || sub.id;
          if (sub.lexicon_key && subLabel) {
            map[sub.lexicon_key] = subLabel;
          }
        }
      }
    }
    return map;
  }, [activeGameSchema]);

  const tCache = useMemo(
    () => new Map<string, any>(),
    [dictionary, schemaFallbackMap, activeLangState, titleAreaConfig, previewSubtitleText]
  );

  const t = useCallback((key: string, fallback?: string) => {
    const cacheKey = `${key}\x00${fallback ?? ''}`;
    const cached = tCache.get(cacheKey);
    if (cached !== undefined) return cached;

    if (!key) {
      const res = fallback ? interpolateGlossaryTokens(fallback, dictionary, activeLangState) : "";
      tCache.set(cacheKey, res);
      return res;
    }

    // 1. Dedicated Core Title Area System (ONLY Title & Subtitles are isolated from Lexicon files & locked from Spokes)
    if (key === "sidebar_app_title") {
      const res = titleAreaConfig.appTitle || "Sanctuary OS";
      tCache.set(cacheKey, res);
      return res;
    }
    if (key.startsWith("sidebar_app_subtitle_")) {
      if (previewSubtitleText) return previewSubtitleText;
      const list =
        Array.isArray(titleAreaConfig.subtitles) && titleAreaConfig.subtitles.length > 0
          ? titleAreaConfig.subtitles
          : DEFAULT_TITLE_AREA_SUBTITLES;
      const num = parseInt(key.replace("sidebar_app_subtitle_", ""), 10);
      const idx = Number.isFinite(num) && num > 0 ? (num - 1) % list.length : 0;
      const res = list[idx] || DEFAULT_TITLE_AREA_SUBTITLES[0];
      tCache.set(cacheKey, res);
      return res;
    }

    let val = dictionary[key];
    if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
      val = undefined;
    }

    if (val === undefined || val === "") {
      val = schemaFallbackMap[key];
    }
    if (val === undefined || val === "") {
      val = (enDefault as any)[key];
    }
    if (val === undefined || val === "") {
      val = (enSanctuary as any)[key];
    }
    if (val === undefined || val === "") {
      val = (enSims as any)[key];
    }

    if (val !== undefined && val !== "") {
      if (key === "wf_hub_title" && val === "Dev Operations") {
        val = "Wayfinder Operations";
      } else if (key === "sidebar_wayfinder_tools" && (val === "Dev" || val === "Dev Tools")) {
        val = "Wayfinder";
      } else if (key === "supporter_keepers_title" && (val === "Sanctuary OS (Keepers Core)" || val === "Sanctuary Foundry (Keepers Core)")) {
        val = "Sanctuary Foundry";
      } else if (key === "icon_architecture" && val === "structure") {
        val = "architecture";
      }
      if (emojiRegex.test(val) && (key.includes('icon') || key.startsWith('emote_'))) {
        tCache.set(cacheKey, "");
        return "";
      }
      const res =
        key === "forge_case_upper"
          ? String(val)
          : typeof val === "string"
            ? interpolateGlossaryTokens(val, dictionary, activeLangState)
            : val;
      tCache.set(cacheKey, res);
      return res;
    }
    if (key.includes('icon') || key.startsWith('emote_')) {
      const res =
        fallback && !emojiRegex.test(fallback)
          ? fallback
          : key.startsWith('icon_')
            ? key.slice(5)
            : "";
      tCache.set(cacheKey, res);
      return res;
    }
    const res = fallback
      ? interpolateGlossaryTokens(fallback, dictionary, activeLangState)
      : fallback === "" || !key
        ? ""
        : `[${key}]`;
    tCache.set(cacheKey, res);
    return res;
  }, [tCache, dictionary, schemaFallbackMap, activeLangState, titleAreaConfig, previewSubtitleText]);

  const importLexicon = (json: any, langCode: string) => {
    const updated = { ...registry, [langCode]: json };
    setRegistry(updated);
    saveRegistryToStorage(wsId, updated);
    setActiveLang(langCode);

    (async () => {
      try {
        if (!isDesktop()) return;
        const { masterVault } = await resolveVaultLexiconRoots();
        if (masterVault) {
          const lexiconsDir = `${masterVault}\\Data\\Lexicons`;
          await mkdir(lexiconsDir, { recursive: true });
          await writeTextFile(`${lexiconsDir}\\${langCode}.json`, JSON.stringify(json, null, 2));
        }
      } catch (err) { console.error("Failed to save lexicon to vault:", err); }
    })();
  };

  const deleteLexicon = (langCode: string) => {
    const { [langCode]: removed, ...remaining } = registry;
    setRegistry(remaining);
    saveRegistryToStorage(wsId, remaining);
    if (activeLangState === langCode) setActiveLang("en-sanctuary");

    (async () => {
      try {
        if (!isDesktop()) return;
        const { masterVault, spokeVault } = await resolveVaultLexiconRoots();
        for (const base of [masterVault, spokeVault].filter(Boolean)) {
          const filePath = `${base}\\Data\\Lexicons\\${langCode}.json`;
          if (await exists(filePath)) await remove(filePath);
        }
      } catch (err) { console.error("Failed to delete lexicon from vault:", err); }
    })();
  };

  const osLogoUrl = titleAreaConfig.logoUrl || '/icon.png';
  const [autoTranslateDynamic, setAutoTranslateDynamicState] = useState<boolean>(() =>
    getAutoTranslateDynamicPref()
  );
  const [, setTranslationTick] = useState(0);

  useEffect(() => {
    const onTranslationReady = () => {
      setTranslationTick((v) => v + 1);
    };
    window.addEventListener('sanctuary-dynamic-translation-ready', onTranslationReady);
    return () => window.removeEventListener('sanctuary-dynamic-translation-ready', onTranslationReady);
  }, []);

  const setAutoTranslateDynamic = (val: boolean) => {
    setAutoTranslateDynamicState(val);
    setAutoTranslateDynamicPref(val);
  };

  const td = (
    rawText: string,
    options?: { forceTranslate?: boolean; targetIso?: string }
  ): string => {
    if (!rawText || typeof rawText !== 'string') return rawText;
    const interpolated = interpolateGlossaryTokens(rawText, dictionary, activeLangState);
    const adapted = applyThematicGlossaryToProse(interpolated, dictionary, activeLangState);
    const shouldCloudTranslate = Boolean(options?.forceTranslate || autoTranslateDynamic);
    if (!shouldCloudTranslate) return adapted;

    const targetIso =
      options?.targetIso ||
      resolveTargetLanguageIso(
        activeLangState,
        dictionary,
        lexiconMeta,
        Boolean(options?.forceTranslate)
      );

    if (!targetIso || targetIso === 'en') {
      return adapted;
    }

    const cached = getCachedDynamicTranslation(adapted, targetIso);
    if (cached !== null) {
      return cached;
    }

    translatePostedTextAsync(adapted, targetIso);
    return adapted;
  };

  const translateDynamicAsync = async (
    rawText: string,
    targetIso?: string
  ): Promise<string> => {
    if (!rawText || typeof rawText !== 'string') return rawText;
    const interpolated = interpolateGlossaryTokens(rawText, dictionary, activeLangState);
    const adapted = applyThematicGlossaryToProse(interpolated, dictionary, activeLangState);
    const resolvedIso =
      targetIso || resolveTargetLanguageIso(activeLangState, dictionary, lexiconMeta, true);
    if (!resolvedIso || resolvedIso === 'en') return adapted;
    return translatePostedTextAsync(adapted, resolvedIso);
  };

  return (
    <LexiconContext.Provider
      value={{
        t,
        td,
        translateDynamicAsync,
        autoTranslateDynamic,
        setAutoTranslateDynamic,
        activeLang: activeLangState,
        setActiveLang,
        importLexicon,
        deleteLexicon,
        registry,
        lexiconMeta,
        useGlobalLexicon: useGlobalLexiconState,
        setUseGlobalLexicon,
        osLogoUrl,
        titleAreaConfig,
        saveTitleAreaConfig,
        previewSubtitleText,
        setPreviewSubtitleText,
      }}
    >
      {children}
    </LexiconContext.Provider>
  );
};

export const useLexicon = () => {
  const ctx = useContext(LexiconContext);
  if (!ctx) {
    return {
      t: (key: string, fallback?: string) => {
        if (!key) {
          return fallback
            ? interpolateGlossaryTokens(fallback, enSanctuary, 'en-sanctuary')
            : '';
        }
        const raw =
          (enSanctuary as any)[key] ||
          (enDefault as any)[key] ||
          fallback ||
          (key.startsWith('icon_') ? key.slice(5) : key.replace(/_/g, ' '));
        return typeof raw === 'string'
          ? interpolateGlossaryTokens(raw, enSanctuary, 'en-sanctuary')
          : raw;
      },
      td: (rawText: string) =>
        typeof rawText === 'string'
          ? interpolateGlossaryTokens(rawText, enSanctuary, 'en-sanctuary')
          : rawText,
      translateDynamicAsync: async (rawText: string) => rawText,
      autoTranslateDynamic: true,
      setAutoTranslateDynamic: () => {},
      activeLang: 'en-sanctuary',
      setActiveLang: () => {},
      importLexicon: () => {},
      deleteLexicon: () => {},
      registry: {},
      lexiconMeta: [],
      useGlobalLexicon: false,
      setUseGlobalLexicon: () => {},
      osLogoUrl: '/icon.png',
      titleAreaConfig: DEFAULT_CORE_TITLE_AREA_CONFIG,
      saveTitleAreaConfig: async () => DEFAULT_CORE_TITLE_AREA_CONFIG,
      previewSubtitleText: null,
      setPreviewSubtitleText: () => {},
    };
  }
  return ctx;
};
