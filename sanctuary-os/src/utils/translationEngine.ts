import { interpolateGlossaryTokens } from '../LexiconContext';

const TRANSLATION_CACHE_KEY = 'sanctuary_dynamic_translation_cache_v1';
const AUTO_TRANSLATE_PREF_KEY = 'sanctuary_auto_translate_dynamic';
const MAX_CACHE_ENTRIES = 600;

const memoryCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string>>();

let cacheHydrated = false;
function hydrateCache() {
  if (cacheHydrated) return;
  cacheHydrated = true;
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') {
          memoryCache.set(k, v);
        }
      }
    }
  } catch {
    // ignore storage parse errors
  }
}

let persistTimer: number | null = null;
function schedulePersistCache() {
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      const entries = Array.from(memoryCache.entries());
      const trimmed = entries.slice(Math.max(0, entries.length - MAX_CACHE_ENTRIES));
      const obj: Record<string, string> = {};
      for (const [k, v] of trimmed) {
        obj[k] = v;
      }
      localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(obj));
    } catch {
      // ignore storage quota errors
    }
  }, 600);
}

export function getAutoTranslateDynamicPref(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_TRANSLATE_PREF_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setAutoTranslateDynamicPref(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_TRANSLATE_PREF_KEY, String(enabled));
  } catch {
    // ignore
  }
}

const LANGUAGE_NAME_TO_ISO: Record<string, string> = {
  english: 'en',
  spanish: 'es',
  espanol: 'es',
  french: 'fr',
  francais: 'fr',
  german: 'de',
  deutsch: 'de',
  portuguese: 'pt',
  portugues: 'pt',
  italian: 'it',
  italiano: 'it',
  russian: 'ru',
  japanese: 'ja',
  korean: 'ko',
  chinese: 'zh-CN',
  'chinese (simplified)': 'zh-CN',
  'chinese (traditional)': 'zh-TW',
  dutch: 'nl',
  nederlands: 'nl',
  polish: 'pl',
  polski: 'pl',
  turkish: 'tr',
  arabic: 'ar',
  swedish: 'sv',
  danish: 'da',
  finnish: 'fi',
  norwegian: 'no',
  czech: 'cs',
  hungarian: 'hu',
  ukrainian: 'uk',
  vietnamese: 'vi',
  thai: 'th',
  indonesian: 'id',
  hindi: 'hi',
  greek: 'el',
  hebrew: 'iw',
  romanian: 'ro',
};

export function resolveTargetLanguageIso(
  activeLang: string,
  dictionary?: Record<string, any>,
  lexiconMeta?: any[],
  forceSystemFallback: boolean = false
): string {
  const cleanCode = String(activeLang || '').trim();
  if (
    cleanCode === 'en-sanctuary' ||
    cleanCode === 'en-default' ||
    cleanCode === 'en-sims' ||
    cleanCode === 'Simlish'
  ) {
    if (forceSystemFallback && typeof navigator !== 'undefined' && navigator.language) {
      const sysIso = navigator.language.split('-')[0].toLowerCase();
      if (sysIso && sysIso !== 'en') return sysIso;
    }
    return 'en';
  }

  // Check explicit ISO prefix on lexicon code (e.g. "es-default", "fr", "de_DE", "pt-BR")
  const codeMatch = cleanCode.match(/^([a-z]{2})(?:[-_]([a-z]{2}))?$/i);
  if (codeMatch) {
    const primary = codeMatch[1].toLowerCase();
    if (primary !== 'en') return primary;
  }

  const metaEntry = Array.isArray(lexiconMeta)
    ? lexiconMeta.find((m: any) => m?.id === cleanCode)
    : undefined;
  const rawLangName = String(
    dictionary?._meta_lang || metaEntry?.lang || cleanCode
  )
    .trim()
    .toLowerCase();

  if (LANGUAGE_NAME_TO_ISO[rawLangName]) {
    return LANGUAGE_NAME_TO_ISO[rawLangName];
  }

  for (const [langKey, iso] of Object.entries(LANGUAGE_NAME_TO_ISO)) {
    if (rawLangName.includes(langKey)) {
      return iso;
    }
  }

  return 'en';
}

function matchWordCasing(source: string, replacement: string): string {
  if (!source || !replacement) return replacement;
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (
    source[0] === source[0].toUpperCase() &&
    source.slice(1) === source.slice(1).toLowerCase()
  ) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  if (source === source.toLowerCase()) {
    return replacement.toLowerCase();
  }
  return replacement;
}

/**
 * Layer 1: Synchronous Dynamic Glossary & Thematic Lexicon Adaptation for Posted / Database Content.
 * Adapts domain nouns (Vault/Library/Stashi, Blueprint/Play Set/Modpack, Mason/Creator/Maker,
 * Citizen/User/Simmer, Comm-Link/Community Feed, etc.) while protecting code blocks, URLs, and icons.
 */
export function applyThematicGlossaryToProse(
  rawText: string,
  dictionary: Record<string, any>,
  activeLang: string
): string {
  if (!rawText || typeof rawText !== 'string') return rawText;

  // First interpolate any explicit {Mod}, {Vault}, {Blueprint} tokens
  let text = interpolateGlossaryTokens(rawText, dictionary, activeLang);

  // Protect code blocks, inline code, markdown links, asset links, and [ICON:...]/[IMG:...] tags
  const protectedSegments: string[] = [];
  const maskSegment = (match: string) => {
    const idx = protectedSegments.length;
    protectedSegments.push(match);
    return `\u0000SA_PROT_${idx}\u0000`;
  };

  text = text
    .replace(/```[\s\S]*?```/g, maskSegment)
    .replace(/`[^`\n]+`/g, maskSegment)
    .replace(/\\?\[(?:IMG|ICON|ASSET):[^\]]+\\?\]/gi, maskSegment)
    .replace(/\[[^\]]*\]\((?:https?:\/\/|asset:\/\/|icon:\/\/)[^)]+\)/gi, maskSegment)
    .replace(/https?:\/\/[^\s)]+/gi, maskSegment);

  const resolveTerm = (key: string, fallback: string): string => {
    const raw = dictionary?.[key];
    if (typeof raw === 'string' && raw.trim() && !raw.includes('{')) {
      return raw.trim();
    }
    return fallback;
  };

  const isStandard = activeLang === 'en-default';
  const isSims = activeLang === 'en-sims' || activeLang === 'Simlish';
  const isSimlish = activeLang === 'Simlish';

  const termVault = resolveTerm('term_vault', isSimlish ? 'Stashi' : isStandard || isSims ? 'Library' : 'Vault');
  const termBlueprint = resolveTerm('term_blueprint', isSimlish ? 'Playset' : isSims ? 'Modpack' : isStandard ? 'Play Set' : 'Blueprint');
  const termBlueprints = resolveTerm('term_blueprints', isSimlish ? 'Playsets' : isSims ? 'Modpacks' : isStandard ? 'Play Sets' : 'Blueprints');
  const termMason = resolveTerm('term_mason', isSimlish ? 'Maker' : isStandard || isSims ? 'Creator' : 'Mason');
  const termMasons = resolveTerm('term_masons', isSimlish ? 'Makers' : isStandard || isSims ? 'Creators' : 'Masons');
  const termCitizen = resolveTerm('term_citizen', isSims ? 'Simmer' : isStandard ? 'User' : 'Citizen');
  const termCitizens = resolveTerm('term_citizens', isSims ? 'Simmers' : isStandard ? 'Users' : 'Citizens');
  const termBackups = resolveTerm('term_backups', isSimlish ? 'Save-Capsules' : isStandard || isSims ? 'Backups' : 'Time Capsule');
  const termLab = resolveTerm('term_lab', isSimlish ? 'Testi Lab' : isStandard || isSims ? 'Testing Lab' : 'Homestead');
  const termNexus = resolveTerm('term_nexus', isSims ? 'The Gallery' : isStandard ? 'Marketplace' : 'The Nexus');
  const termDispatch = resolveTerm('term_dispatch', isSimlish ? 'Posti' : isStandard || isSims ? 'Post' : 'Transmission');
  const termDispatches = resolveTerm('term_dispatches', isSimlish ? 'Postis' : isStandard || isSims ? 'Posts' : 'Transmissions');

  if (isStandard || isSims) {
    text = text
      .replace(/\bComm-Link\s+Feed\b/gi, (m) => matchWordCasing(m, isSimlish ? 'Plumbob Feed' : 'Community Feed'))
      .replace(/\bComm-Link\b/gi, (m) => matchWordCasing(m, isSimlish ? 'Plumbob Feed' : 'Community Feed'))
      .replace(/\bTime\s+Capsule\b/gi, (m) => matchWordCasing(m, termBackups))
      .replace(/\bHomestead\b/gi, (m) => matchWordCasing(m, termLab))
      .replace(/\bThe\s+Nexus\b/gi, (m) => matchWordCasing(m, termNexus))
      .replace(/\bBlueprints\b/gi, (m) => matchWordCasing(m, termBlueprints))
      .replace(/\bBlueprint\b/gi, (m) => matchWordCasing(m, termBlueprint))
      .replace(/\bMasons\b/gi, (m) => matchWordCasing(m, termMasons))
      .replace(/\bMason\b/gi, (m) => matchWordCasing(m, termMason))
      .replace(/\bCitizens\b/gi, (m) => matchWordCasing(m, termCitizens))
      .replace(/\bCitizen\b/gi, (m) => matchWordCasing(m, termCitizen))
      .replace(/\bTransmissions\b/gi, (m) => matchWordCasing(m, termDispatches))
      .replace(/\bTransmission\b/gi, (m) => matchWordCasing(m, termDispatch))
      .replace(/\bVault\b/gi, (m) => matchWordCasing(m, termVault));
  } else {
    // Sanctuary theme mode: adapt plain terms if present in database posts
    text = text
      .replace(/\bPlay\s+Sets\b/gi, (m) => matchWordCasing(m, termBlueprints))
      .replace(/\bPlay\s+Set\b/gi, (m) => matchWordCasing(m, termBlueprint))
      .replace(/\bModpacks\b/gi, (m) => matchWordCasing(m, termBlueprints))
      .replace(/\bModpack\b/gi, (m) => matchWordCasing(m, termBlueprint));
  }

  // Restore protected segments
  text = text.replace(/\u0000SA_PROT_(\d+)\u0000/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return protectedSegments[idx] ?? '';
  });

  return text;
}

/**
 * Layer 2: Asynchronous Neural / Cloud Translation with Markdown & Icon Masking + Persistent Caching
 */
export function getCachedDynamicTranslation(text: string, targetIso: string): string | null {
  if (!text || !targetIso || targetIso === 'en') return null;
  hydrateCache();
  const key = `${targetIso}::${text}`;
  return memoryCache.get(key) ?? null;
}

export async function translatePostedTextAsync(
  rawText: string,
  targetIso: string
): Promise<string> {
  if (!rawText || typeof rawText !== 'string') return rawText;
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.length < 2 || !/[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(trimmed)) {
    return rawText;
  }
  if (!targetIso || targetIso === 'en') return rawText;

  hydrateCache();
  const cacheKey = `${targetIso}::${rawText}`;
  const cached = memoryCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const existingInflight = inflightRequests.get(cacheKey);
  if (existingInflight) return existingInflight;

  const promise = (async () => {
    try {
      // Mask code blocks, icons, asset links, and URLs with numeric tokens that translators keep intact
      const masks: string[] = [];
      const addMask = (m: string) => {
        const id = masks.length;
        masks.push(m);
        return `[#${id}#]`;
      };

      const maskedText = rawText
        .replace(/```[\s\S]*?```/g, addMask)
        .replace(/`[^`\n]+`/g, addMask)
        .replace(/\\?\[(?:IMG|ICON|ASSET):[^\]]+\\?\]/gi, addMask)
        .replace(/\[[^\]]*\]\((?:https?:\/\/|asset:\/\/|icon:\/\/)[^)]+\)/gi, addMask)
        .replace(/https?:\/\/[^\s)]+/gi, addMask);

      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
        targetIso
      )}&dt=t&q=${encodeURIComponent(maskedText)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      let translated = '';
      if (Array.isArray(data?.[0])) {
        for (const seg of data[0]) {
          if (typeof seg?.[0] === 'string') {
            translated += seg[0];
          }
        }
      }

      if (!translated.trim()) {
        return rawText;
      }

      // Restore masked tokens
      const restored = translated.replace(/\[\s*#\s*(\d+)\s*#\s*\]/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return masks[idx] ?? '';
      });

      memoryCache.set(cacheKey, restored);
      schedulePersistCache();
      window.dispatchEvent(
        new CustomEvent('sanctuary-dynamic-translation-ready', {
          detail: { cacheKey, targetIso },
        })
      );
      return restored;
    } catch {
      return rawText;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}

