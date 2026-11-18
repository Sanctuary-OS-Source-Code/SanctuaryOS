export interface GlossaryTermDefinition {
  key: string;
  token: string;
  labelKey: string;
  icon: string;
  defaults: {
    'en-default': string;
    'en-sanctuary': string;
  };
}

export const CORE_GLOSSARY_TERMS: GlossaryTermDefinition[] = [
  {
    key: 'term_mod',
    token: 'Mod',
    labelKey: 'term_mod_label',
    icon: 'extension',
    defaults: { 'en-default': 'Mod', 'en-sanctuary': 'Artifact' },
  },
  {
    key: 'term_mods',
    token: 'Mods',
    labelKey: 'term_mods_label',
    icon: 'widgets',
    defaults: { 'en-default': 'Mods', 'en-sanctuary': 'Artifacts' },
  },
  {
    key: 'term_vault',
    token: 'Vault',
    labelKey: 'term_vault_label',
    icon: 'inventory_2',
    defaults: { 'en-default': 'Library', 'en-sanctuary': 'Vault' },
  },
  {
    key: 'term_blueprint',
    token: 'Blueprint',
    labelKey: 'term_blueprint_label',
    icon: 'map',
    defaults: { 'en-default': 'Play Set', 'en-sanctuary': 'Blueprint' },
  },
  {
    key: 'term_blueprints',
    token: 'Blueprints',
    labelKey: 'term_blueprints_label',
    icon: 'collections_bookmark',
    defaults: { 'en-default': 'Play Sets', 'en-sanctuary': 'Blueprints' },
  },
  {
    key: 'term_mason',
    token: 'Mason',
    labelKey: 'term_mason_label',
    icon: 'construction',
    defaults: { 'en-default': 'Creator', 'en-sanctuary': 'Mason' },
  },
  {
    key: 'term_masons',
    token: 'Masons',
    labelKey: 'term_masons_label',
    icon: 'engineering',
    defaults: { 'en-default': 'Creators', 'en-sanctuary': 'Masons' },
  },
  {
    key: 'term_citizen',
    token: 'Citizen',
    labelKey: 'term_citizen_label',
    icon: 'person',
    defaults: { 'en-default': 'User', 'en-sanctuary': 'Citizen' },
  },
  {
    key: 'term_citizens',
    token: 'Citizens',
    labelKey: 'term_citizens_label',
    icon: 'group',
    defaults: { 'en-default': 'Users', 'en-sanctuary': 'Citizens' },
  },
  {
    key: 'term_backups',
    token: 'Backups',
    labelKey: 'term_backups_label',
    icon: 'history',
    defaults: { 'en-default': 'Backups', 'en-sanctuary': 'Time Capsule' },
  },
  {
    key: 'term_lab',
    token: 'Lab',
    labelKey: 'term_lab_label',
    icon: 'science',
    defaults: { 'en-default': 'Testing Lab', 'en-sanctuary': 'Homestead' },
  },
  {
    key: 'term_settings',
    token: 'Settings',
    labelKey: 'term_settings_label',
    icon: 'settings',
    defaults: { 'en-default': 'Settings', 'en-sanctuary': 'System Preferences' },
  },
  {
    key: 'term_nexus',
    token: 'Nexus',
    labelKey: 'term_nexus_label',
    icon: 'hub',
    defaults: { 'en-default': 'Marketplace', 'en-sanctuary': 'Nexus' },
  },
  {
    key: 'term_chameleon',
    token: 'Chameleon',
    labelKey: 'term_chameleon_label',
    icon: 'palette',
    defaults: { 'en-default': 'Theme', 'en-sanctuary': 'Chameleon' },
  },
  {
    key: 'term_chameleons',
    token: 'Chameleons',
    labelKey: 'term_chameleons_label',
    icon: 'style',
    defaults: { 'en-default': 'Themes', 'en-sanctuary': 'Chameleons' },
  },
  {
    key: 'term_lexicon',
    token: 'Lexicon',
    labelKey: 'term_lexicon_label',
    icon: 'translate',
    defaults: { 'en-default': 'Language', 'en-sanctuary': 'Lexicon' },
  },
  {
    key: 'term_lexicons',
    token: 'Lexicons',
    labelKey: 'term_lexicons_label',
    icon: 'g_translate',
    defaults: { 'en-default': 'Languages', 'en-sanctuary': 'Lexicons' },
  },
  {
    key: 'term_dispatch',
    token: 'Dispatch',
    labelKey: 'term_dispatch_label',
    icon: 'podcasts',
    defaults: { 'en-default': 'Post', 'en-sanctuary': 'Transmission' },
  },
  {
    key: 'term_dispatches',
    token: 'Dispatches',
    labelKey: 'term_dispatches_label',
    icon: 'cell_tower',
    defaults: { 'en-default': 'Posts', 'en-sanctuary': 'Transmissions' },
  },
  {
    key: 'term_delete',
    token: 'Delete',
    labelKey: 'term_delete_label',
    icon: 'delete_forever',
    defaults: { 'en-default': 'Delete', 'en-sanctuary': 'Purge' },
  },
  {
    key: 'term_remove',
    token: 'Remove',
    labelKey: 'term_remove_label',
    icon: 'eject',
    defaults: { 'en-default': 'Remove', 'en-sanctuary': 'Yeet' },
  },
];

const TOKEN_TO_TERM_DEF: Record<
  string,
  { def: GlossaryTermDefinition; casing: 'title' | 'lower' | 'upper' }
> = {};
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
  'CI', 'CD', 'CI/CD', 'PR', 'SDK', 'CLI', 'GUI', 'HUD', 'RNG', 'RPG', 'MMO', 'NPC',
  'PDF', 'PNG', 'JPG', 'JPEG', 'WEBP', 'SVG', 'GIF', 'MP4', 'WEBM', 'MP3', 'WAV', 'OGG',
  'UTC', 'GMT', 'EST', 'PST', 'CST', 'MST', 'EDT', 'PDT', 'MM', 'DD', 'YY', 'YYYY', 'US', 'UK', 'EU', 'ISO', 'AI', 'ML', 'LLM', 'WEBGL', 'GLSL', 'RBAC', 'ACL', 'CORS', 'CSRF', 'XSS', 'DDOS', 'P2P', 'CDN', 'OTA', 'EOF', 'EOL', 'NULL', 'NAN', 'OK', 'FAQ', 'TOS', 'EULA', 'DMCA', 'GDPR', 'CCPA',
]);

export function normalizeAllCapsForThemeCase(str: string): string {
  if (typeof str !== 'string') return str;
  if (/[a-z]/.test(str) || !/[A-Z]{2,}/.test(str)) return str;
  const formatPart = (part: string): string => {
    if (PRESERVED_ACRONYMS.has(part)) return part;
    if (/^\d+$/.test(part)) return part;
    const apoMatch = part.match(/^([A-Z0-9]+)(['\u2019][A-Z0-9]+)$/);
    if (apoMatch) {
      const stem = PRESERVED_ACRONYMS.has(apoMatch[1])
        ? apoMatch[1]
        : apoMatch[1].charAt(0).toUpperCase() + apoMatch[1].slice(1).toLowerCase();
      return stem + apoMatch[2].toLowerCase();
    }
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  };
  return str.replace(/[A-Z0-9]+(?:[-'\u2019][A-Z0-9]+)*/g, (word) => {
    if (PRESERVED_ACRONYMS.has(word)) return word;
    if (/^\d+$/.test(word)) return word;
    if (word.includes('-')) {
      return word.split('-').map(formatPart).join('-');
    }
    return formatPart(word);
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
    if (!entry) {
      if (tokName === 'Glossary') return 'Glossary';
      if (tokName === 'glossary') return 'glossary';
      if (tokName === 'GLOSSARY') return 'GLOSSARY';
      if (tokName === 'Token') return 'Token';
      if (tokName === 'token') return 'token';
      if (tokName === 'TOKEN') return 'TOKEN';
      return null;
    }
    const langBucket =
      activeLang === 'en-sanctuary'
        ? 'en-sanctuary'
        : 'en-default';
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

  const withDefiniteArticles = withArticles.replace(
    /\b(the|The|THE)(\s+)\{\{?\{?([A-Za-z_]+)\}?\}?\}/g,
    (full, article, space, tokName) => {
      const resolved = resolveToken(tokName);
      if (resolved === null) return full;
      if (/^the\s+/i.test(resolved.trim())) {
        return article === 'THE' ? resolved.toUpperCase() : resolved;
      }
      return `${article}${space}${resolved}`;
    }
  );

  // Strip a leading "The " from glossary values when used attributively after determiners or modifiers
  const stripLeadingThe = (val: string) => val.replace(/^the\s+/i, '');

  const withPrecedingDeterminers = withDefiniteArticles.replace(
    /\b(public|global|official|community|local|shared|cloud|curated|your|our|this|that)(\s+)\{\{?\{?([A-Za-z_]+)\}?\}?\}/gi,
    (full, modifier, space, tokName) => {
      const resolved = resolveToken(tokName);
      if (resolved === null) return full;
      return `${modifier}${space}${stripLeadingThe(resolved)}`;
    }
  );

  const withAttributiveModifiers = withPrecedingDeterminers.replace(
    /\{\{?\{?([A-Za-z_]+)\}?\}?\}(?=\s+(?:\{\{?\{?[A-Za-z_]+\}?\}?\}|[A-Z][A-Za-z0-9-]+))/g,
    (full, tokName) => {
      const resolved = resolveToken(tokName);
      if (resolved === null) return full;
      return stripLeadingThe(resolved);
    }
  );

  return withAttributiveModifiers.replace(/\{\{?\{?([A-Za-z_]+)\}?\}?\}/g, (full, tokName) => {
    const resolved = resolveToken(tokName);
    return resolved !== null ? resolved : full;
  });
}
