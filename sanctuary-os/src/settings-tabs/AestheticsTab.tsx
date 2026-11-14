import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import { useStore } from '../store';
import { supabaseAuth } from '../supabase';
import { TabContainer, SettingsGrid, SettingsToggle, CustomSettingsDropdown } from './shared';
import ChameleonSidePanel from '../side-panels/ChameleonSidePanel';
import { ChameleonEditorPanel } from '../side-panels/ChameleonEditorPanel';
import LexiconSidePanel from '../side-panels/LexiconSidePanel';
import { UniversalCard } from '../components/universal/UniversalCard';
import { LiquidGlassAlertCard } from '../components/BlueprintPatchReadiness';
import { VAULT_CHIP_CLASS, HoverTooltip } from '../shared';
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
} from '../chameleon-components/ThemeCard';
import { getLuminance } from '../chameleon-components/ChameleonShared';

const getReadOnlySpokeClient = (url: string, anonKey: string, suffix: string) => {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const w = window as any;
  if (!w.__sanctuaryThemeClients) w.__sanctuaryThemeClients = new Map();
  const cacheKey = `${cleanUrl}::${anonKey.slice(0, 16)}`;
  if (w.__sanctuaryThemeClients.has(cacheKey)) {
    return w.__sanctuaryThemeClients.get(cacheKey);
  }
  const client = createClient(cleanUrl, anonKey.trim(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `sb-lex-ro-${suffix}`,
    },
  });
  w.__sanctuaryThemeClients.set(cacheKey, client);
  return client;
};

const isValidHttpUrl = (raw?: string) => {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
  } catch {
    return false;
  }
};

export default function AestheticsTab({ config }: any) {
  const {
    t,
    activeLang,
    registry,
    lexiconMeta,
    useGlobalLexicon,
    setUseGlobalLexicon,
    globalLexiconId,
    setGlobalLexiconId,
    getWorkspaceLexiconId,
    setWorkspaceLexiconId,
    activeSpaceKey: activeLexSpaceKey,
    autoTranslateDynamic,
    setAutoTranslateDynamic,
  } = useLexicon();

  const {
    currentTheme,
    activeThemeId,
    allThemes,
    CORE_THEMES,
    customThemes,
    devThemes,
    gameThemes,
    useGlobalTheme,
    setUseGlobalTheme,
    globalThemeId,
    setGlobalThemeId,
    getWorkspaceThemeId,
    setWorkspaceThemeId,
    activeSpaceKey: activeThemeSpaceKey,
  } = useTheme();

  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const workspaces = useStore((state) => state.workspaces);
  const osRole = useStore((state) => state.osRole);
  const localOnly = useStore((state) => state.localOnly);
  const showImages = useStore((state) => state.showImages);
  const setShowImages = useStore((state) => state.setShowImages);
  const showCommLinkImages = useStore((state) => state.showCommLinkImages);
  const setShowCommLinkImages = useStore((state) => state.setShowCommLinkImages);
  const dateFormat = useStore((state) => state.dateFormat);
  const setDateFormat = useStore((state) => state.setDateFormat);

  const [isChameleonOpen, setIsChameleonOpen] = useState(false);
  const [isForgeOpen, setIsForgeOpen] = useState(false);
  const [isLexiconOpen, setIsLexiconOpen] = useState(false);
  const [globalGames, setGlobalGames] = useState<any[]>([]);
  const [spokeLexiconMetaMap, setSpokeLexiconMetaMap] = useState<Record<string, any[]>>({});

  useEffect(() => {
    let cancelled = false;
    if (localOnly || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return;
    }
    Promise.resolve(
      supabaseAuth
        .from('sanctuary_games')
        .select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active, is_keepers_only')
        .eq('is_active', true)
        .order('name')
    )
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data)) {
          setGlobalGames(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [osRole, localOnly]);

  const isKeeper = osRole === 'keeper';
  const currentSpaceKey = activeThemeSpaceKey || activeLexSpaceKey || 'default_workspace';

  const spokeSpaces = useMemo(() => {
    const list: Array<{
      wsKey: string;
      schemaKey: string;
      name: string;
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    }> = [];
    const seen = new Set<string>();
    const safeWorkspaces = Array.isArray(workspaces) ? workspaces : [];

    for (const game of globalGames) {
      const schemaRaw = String(game?.schema_id || game?.id || '').trim();
      if (!schemaRaw || schemaRaw === 'default_workspace' || schemaRaw === 'default_schema') continue;
      const isCurrentlyMounted =
        String(activeWorkspaceId || '').toLowerCase() === schemaRaw.toLowerCase() ||
        String(activeWorkspaceId || '').toLowerCase() === String(game?.id || '').toLowerCase();
      if (game?.is_keepers_only === true && !isCurrentlyMounted) continue;

      const matchedWs = safeWorkspaces.find(
        (w: any) =>
          w?.id !== 'default_workspace' &&
          (String(w?.schema_id || '').toLowerCase() === schemaRaw.toLowerCase() ||
            String(w?.id || '').toLowerCase() === schemaRaw.toLowerCase())
      );
      const resolvedKey = String(matchedWs?.id || schemaRaw).trim();
      const norm = resolvedKey.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      list.push({
        wsKey: resolvedKey,
        schemaKey: schemaRaw.toLowerCase(),
        name: game?.name || matchedWs?.name || resolvedKey,
        supabaseUrl: game?.supabase_url || matchedWs?.supabase_url,
        supabaseAnonKey: game?.supabase_anon_key || matchedWs?.supabase_anon_key,
      });
    }

    for (const ws of safeWorkspaces) {
      if (!ws || ws.id === 'default_workspace' || ws.id === 'default' || ws.id === 'web') continue;
      const resolvedKey = String(ws.id || ws.schema_id || '').trim();
      if (!resolvedKey) continue;
      const isCurrentlyMounted =
        String(activeWorkspaceId || '').toLowerCase() === resolvedKey.toLowerCase();
      if (ws.is_keepers_only === true && !isCurrentlyMounted) continue;
      const norm = resolvedKey.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      list.push({
        wsKey: resolvedKey,
        schemaKey: String(ws.schema_id || resolvedKey).toLowerCase(),
        name: ws.name || ws.display_name || resolvedKey,
        supabaseUrl: ws.supabase_url,
        supabaseAnonKey: ws.supabase_anon_key,
      });
    }

    return list;
  }, [globalGames, workspaces, activeWorkspaceId]);

  useEffect(() => {
    let cancelled = false;
    const initialCached: Record<string, any[]> = {};
    for (const sp of spokeSpaces) {
      try {
        const raw =
          localStorage.getItem(`sanctuary_${sp.wsKey}_lexicon_meta`) ||
          localStorage.getItem(`sanctuary_${sp.wsKey.toUpperCase()}_lexicon_meta`) ||
          localStorage.getItem(`sanctuary_${sp.wsKey.toLowerCase()}_lexicon_meta`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) initialCached[sp.wsKey] = parsed;
        }
      } catch {}
    }
    if (Object.keys(initialCached).length > 0) {
      setSpokeLexiconMetaMap((prev) => ({ ...initialCached, ...prev }));
    }

    if (localOnly || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return;
    }

    Promise.allSettled(
      spokeSpaces.map(async (sp) => {
        if (!isValidHttpUrl(sp.supabaseUrl) || !sp.supabaseAnonKey) return null;
        const client = getReadOnlySpokeClient(sp.supabaseUrl!, sp.supabaseAnonKey!, sp.wsKey);
        const { data, error } = await client
          .from('sanctuary_lexicons')
          .select('id, name, badge, version, lexicon_data');
        if (error || !Array.isArray(data)) return null;
        const meta = data
          .filter((d: any) => d?.id && d.id !== 'en-default' && d.id !== 'en-sanctuary')
          .map((d: any) => ({
            id: d.id,
            name: d.name || d.id,
            badge: d.badge || sp.name,
            version: d.version || 1,
            lang: d.lexicon_data?._meta_lang || 'English',
            is_default: Boolean(d.lexicon_data?._meta_default),
          }));
        try {
          if (meta.length > 0) {
            localStorage.setItem(`sanctuary_${sp.wsKey}_lexicon_meta`, JSON.stringify(meta));
          }
        } catch {}
        return { wsKey: sp.wsKey, meta };
      })
    ).then((results) => {
      if (cancelled) return;
      const updates: Record<string, any[]> = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value && r.value.meta.length > 0) {
          updates[r.value.wsKey] = r.value.meta;
        }
      }
      if (Object.keys(updates).length > 0) {
        setSpokeLexiconMetaMap((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [spokeSpaces, localOnly]);

  const spaceRows = useMemo(() => {
    const hubRow = {
      wsKey: 'default_workspace',
      name: t('keepers_title', 'Keepers Core'),
      isHub: true,
    };
    const spokeRows = spokeSpaces.map((sp) => ({
      wsKey: sp.wsKey,
      name: sp.name,
      isHub: false,
    }));
    return [hubRow, ...spokeRows];
  }, [spokeSpaces, t]);

  const [selectedThemeSpace, setSelectedThemeSpace] = useState<string>(() => currentSpaceKey);
  const [selectedLexSpace, setSelectedLexSpace] = useState<string>(() => currentSpaceKey);

  useEffect(() => {
    const matched = spaceRows.find(
      (s) => s.wsKey.toLowerCase() === String(currentSpaceKey || '').toLowerCase()
    );
    if (matched) {
      setSelectedThemeSpace(matched.wsKey);
      setSelectedLexSpace(matched.wsKey);
    }
  }, [currentSpaceKey, spaceRows]);

  const resolvedThemeSpaceRow =
    spaceRows.find((s) => s.wsKey.toLowerCase() === String(selectedThemeSpace || '').toLowerCase()) ||
    spaceRows[0];
  const resolvedLexSpaceRow =
    spaceRows.find((s) => s.wsKey.toLowerCase() === String(selectedLexSpace || '').toLowerCase()) ||
    spaceRows[0];

  const spacePickerOptions = useMemo(() => {
    return spaceRows.map((sp) => {
      const isActiveNow = sp.wsKey.toLowerCase() === String(currentSpaceKey || '').toLowerCase();
      return {
        id: sp.wsKey,
        label: isActiveNow ? `${sp.name} (${t('active', 'Active')})` : sp.name,
      };
    });
  }, [spaceRows, currentSpaceKey, t]);

  const isDarkMode = getLuminance(currentTheme?.bg || '#060b14') < 0.5;
  const modeLabel = isDarkMode ? t('mode_dark', 'Dark') : t('mode_light', 'Light');
  const themeScopeLabel = useGlobalTheme
    ? t('scope_global', 'Global Scope')
    : t('scope_workspace', 'Workspace Scope');

  const cleanLexName = (val: string) => (val.includes(':') ? val.split(':')[1].trim() : val);

  const getActiveLexiconMeta = (code: string) => {
    if (code === 'en-sanctuary') {
      return {
        community: t('badge_sanctuary', 'Sanctuary'),
        language: 'English',
        name: cleanLexName(t('lang_sanctuary', 'Sanctuary')),
      };
    }
    if (code === 'en-default') {
      return {
        community: t('badge_sanctuary', 'Sanctuary'),
        language: 'English',
        name: cleanLexName(t('lang_standard', 'Standard English')),
      };
    }
    const metaFromActive = lexiconMeta?.find((m: any) => m.id === code);
    const metaFromSpokes = Object.values(spokeLexiconMetaMap)
      .flat()
      .find((m: any) => m?.id === code);
    const meta = metaFromActive || metaFromSpokes;
    if (meta) {
      return {
        community: meta.badge || t('badge_community', 'Community'),
        language: meta.lang || 'English',
        name: meta.name || registry?.[code]?._meta_name || code,
      };
    }
    return {
      community:
        registry?.[code]?._meta_badge ||
        activeGameSchema?.display_name ||
        t('badge_custom', 'Custom'),
      language: registry?.[code]?._meta_lang || 'English',
      name: registry?.[code]?._meta_name || code,
    };
  };

  const activeLexiconMeta = getActiveLexiconMeta(activeLang || 'en-sanctuary');
  const lexiconScopeLabel = useGlobalLexicon
    ? t('scope_global', 'Global Scope')
    : t('scope_workspace', 'Workspace Scope');

  const themeSwatches = [
    currentTheme?.bg || '#000000',
    currentTheme?.sidebar || '#050914',
    currentTheme?.accent || '#38bdf8',
    currentTheme?.text || '#f8fafc',
    currentTheme?.success || '#10b981',
  ];

  // Hub-safe theme options (Core + Custom + Dev — no Spoke-only themes in Keepers Core)
  const coreAndCustomThemeOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    const pushMap = (map: Record<string, any> | undefined, suffix?: string) => {
      if (!map) return;
      for (const [id, th] of Object.entries(map)) {
        if (!id || seen.has(id) || !th) continue;
        seen.add(id);
        const baseName = th.name || id;
        opts.push({ id, label: suffix ? `${baseName} (${suffix})` : baseName });
      }
    };
    pushMap(CORE_THEMES);
    pushMap(customThemes, t('badge_custom', 'Custom'));
    if (isKeeper) {
      pushMap(devThemes, 'Dev');
    }
    return opts;
  }, [CORE_THEMES, customThemes, devThemes, isKeeper, t]);

  // All theme options (Core + Spoke + Custom + Dev) for Spoke workspaces & Global picker
  const allSpokeThemeOptions = useMemo(() => {
    const opts = [...coreAndCustomThemeOptions];
    const seen = new Set(opts.map((o) => o.id));
    if (gameThemes && typeof gameThemes === 'object') {
      for (const [id, th] of Object.entries(gameThemes as Record<string, any>)) {
        if (!id || seen.has(id) || !th) continue;
        seen.add(id);
        const badge = th.badge ? ` (${th.badge})` : '';
        opts.push({ id, label: `${th.name || id}${badge}` });
      }
    }
    return opts;
  }, [coreAndCustomThemeOptions, gameThemes]);

  // Hub-safe lexicon options (Core + Custom user packs — never Spoke-only packs)
  const coreLexiconOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = [
      { id: 'en-sanctuary', label: cleanLexName(t('lang_sanctuary', 'Sanctuary')) },
      { id: 'en-default', label: cleanLexName(t('lang_standard', 'Standard English')) },
    ];
    const seen = new Set(opts.map((o) => o.id));
    const spokeIds = new Set(
      Object.values(spokeLexiconMetaMap)
        .flat()
        .map((m: any) => m?.id)
        .filter(Boolean)
    );
    if (registry && typeof registry === 'object') {
      for (const [id, dict] of Object.entries(registry)) {
        if (!id || seen.has(id) || spokeIds.has(id)) continue;
        seen.add(id);
        const label = (dict as any)?._meta_name || id;
        opts.push({ id, label });
      }
    }
    return opts;
  }, [registry, spokeLexiconMetaMap, t]);

  // Global lexicon options (Core + all discovered Spoke & Custom lexicons)
  const allLexiconOptions = useMemo(() => {
    const opts = [...coreLexiconOptions];
    const seen = new Set(opts.map((o) => o.id));
    for (const meta of [...(lexiconMeta || []), ...Object.values(spokeLexiconMetaMap).flat()]) {
      if (!meta?.id || seen.has(meta.id)) continue;
      seen.add(meta.id);
      const badge = meta.badge && meta.badge !== 'Sanctuary' ? ` (${meta.badge})` : '';
      opts.push({ id: meta.id, label: `${meta.name || meta.id}${badge}` });
    }
    return opts;
  }, [coreLexiconOptions, lexiconMeta, spokeLexiconMetaMap]);

  const buildSpokeLexiconOptions = (wsKey: string) => {
    const opts: Array<{ id: string; label: string }> = [
      {
        id: '__auto__',
        label: t('settings_lexicon_auto_default', 'Automatic (Workspace Default)'),
      },
      ...coreLexiconOptions,
    ];
    const seen = new Set(opts.map((o) => o.id));
    const spokeMetas = spokeLexiconMetaMap[wsKey] || [];
    for (const m of spokeMetas) {
      if (!m?.id || seen.has(m.id)) continue;
      seen.add(m.id);
      opts.push({
        id: m.id,
        label: m.is_default ? `${m.name || m.id} ★` : m.name || m.id,
      });
    }
    const currentStored = getWorkspaceLexiconId(wsKey);
    if (currentStored && !seen.has(currentStored)) {
      const meta = getActiveLexiconMeta(currentStored);
      opts.push({ id: currentStored, label: meta.name || currentStored });
    }
    return opts;
  };

  const renderSwatchesForTheme = (themeId: string) => {
    const th = allThemes?.[themeId] || CORE_THEMES?.architect || currentTheme;
    const dots = [
      th?.bg && th.bg !== 'transparent' ? th.bg : '#060b14',
      th?.sidebar || '#050914',
      th?.accent || '#38bdf8',
      th?.text || '#f8fafc',
    ];
    return (
      <div className="flex items-center gap-1">
        {dots.map((hex, i) => (
          <span
            key={i}
            className="w-2.5 h-2.5 rounded-full border border-white/30 shadow-xs"
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    );
  };

  const assignedThemeForSelectedSpace = useGlobalTheme
    ? globalThemeId || activeThemeId
    : getWorkspaceThemeId(resolvedThemeSpaceRow.wsKey);

  const selectedSpaceThemeOptions = useMemo(() => {
    const base = resolvedThemeSpaceRow.isHub ? coreAndCustomThemeOptions : allSpokeThemeOptions;
    if (base.some((o) => o.id === assignedThemeForSelectedSpace)) return base;
    return [
      ...base,
      {
        id: assignedThemeForSelectedSpace,
        label:
          allThemes?.[assignedThemeForSelectedSpace]?.name || assignedThemeForSelectedSpace,
      },
    ];
  }, [
    resolvedThemeSpaceRow.isHub,
    coreAndCustomThemeOptions,
    allSpokeThemeOptions,
    assignedThemeForSelectedSpace,
    allThemes,
  ]);

  const storedLexForSelectedSpace = getWorkspaceLexiconId(resolvedLexSpaceRow.wsKey);
  const assignedLexForSelectedSpace = resolvedLexSpaceRow.isHub
    ? storedLexForSelectedSpace || 'en-sanctuary'
    : storedLexForSelectedSpace || '__auto__';
  const selectedSpaceLexOptions = resolvedLexSpaceRow.isHub
    ? coreLexiconOptions
    : buildSpokeLexiconOptions(resolvedLexSpaceRow.wsKey);

  return (
    <>
      <div className="flex flex-col gap-12 w-full pb-32">
        {/* SECTION 1: Chameleons (Visual Themes ONLY — Zero Language Mixing) */}
        <TabContainer
          title={t('term_chameleons', 'Themes')}
          icon={t('icon_palette', 'palette')}
        >
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={false}
              icon={t('icon_palette', 'palette')}
              accentVar="var(--accent)"
              iconColorClass="text-[var(--accent)]"
              badgeIcon={
                isDarkMode ? t('icon_dark_mode', 'dark_mode') : t('icon_light_mode', 'light_mode')
              }
              badgeLabel={modeLabel}
              overline={t('settings_chameleon_section_overline', 'Visual Theme Engine')}
              title={currentTheme?.name || activeThemeId}
              description={t(
                'settings_chameleon_section_desc',
                'Customize Sanctuary OS colors, wallpapers, and Liquid Glass optics. Browse installed {Chameleons} in the {Chameleon} {Vault} or craft your own in Theme Forge.'
              )}
              actionLabel={t('btn_open_theme_forge', 'Open Theme Forge')}
              actionIcon={t('icon_tune', 'tune')}
              actionVariant="glass"
              onAction={() => setIsForgeOpen(true)}
            />

            <UniversalCard
              layout="vertical"
              title={t('chameleon_title', '{Chameleon} {Vault}')}
              subtitle={t(
                'chameleon_desc',
                'Customize the visual theme, Liquid Glass optics, and color palette.'
              )}
              onClick={() => setIsChameleonOpen(true)}
              customIcon={<DynamicThemePreviewBanner data={currentTheme} heightClass="h-full" />}
              imageOverlay={
                <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between gap-2 z-20">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t('icon_palette', 'palette')}
                      </span>
                      <span className="truncate max-w-[160px]">
                        {currentTheme?.name || activeThemeId}
                      </span>
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsForgeOpen(true);
                      }}
                      className="relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] theme-text-accent cursor-pointer shadow-sm"
                    >
                      <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        {t('icon_tune', 'tune')}
                      </span>
                      <HoverTooltip
                        title={t('btn_open_theme_forge', 'Open Theme Forge')}
                        variant="accent"
                        vAlign="bottom"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsChameleonOpen(true);
                      }}
                      className="relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer shadow-sm"
                    >
                      <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        {t('icon_open_in_new', 'open_in_new')}
                      </span>
                      <HoverTooltip
                        title={t('chameleon_title', '{Chameleon} {Vault}')}
                        variant="accent"
                        vAlign="bottom"
                      />
                    </button>
                  </div>
                </div>
              }
              badges={
                <>
                  <div className={VAULT_CHIP_CLASS}>
                    <div className="flex items-center gap-1">
                      {themeSwatches.map((hex, idx) => (
                        <span
                          key={idx}
                          className="w-2.5 h-2.5 rounded-full border border-white/30 shadow-xs"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {isDarkMode
                        ? t('icon_dark_mode', 'dark_mode')
                        : t('icon_light_mode', 'light_mode')}
                    </span>
                    <span>{modeLabel}</span>
                  </div>
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                      {useGlobalTheme
                        ? t('icon_public', 'public')
                        : t('icon_workspaces', 'workspaces')}
                    </span>
                    <span>{themeScopeLabel}</span>
                  </div>
                </>
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('settings_chameleon_assignment_title', 'Workspace {Chameleon} Assignment')}
              subtitle={t(
                'settings_chameleon_assignment_desc',
                'Give Keepers Core and each game workspace their own {Chameleon}, or lock one {Chameleon} across the entire OS.'
              )}
              icon={useGlobalTheme ? t('icon_public', 'public') : t('icon_workspaces', 'workspaces')}
              actions={
                <span className={VAULT_CHIP_CLASS}>
                  {renderSwatchesForTheme(assignedThemeForSelectedSpace)}
                </span>
              }
              footer={
                <div className="flex flex-col gap-3 w-full">
                  <div className="flex flex-col gap-1 w-full">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                      {t('settings_assignment_mode_label', 'Assignment Mode')}
                    </span>
                    <CustomSettingsDropdown
                      value={useGlobalTheme ? 'global' : 'workspace'}
                      onChange={(val: string) => setUseGlobalTheme(val === 'global')}
                      options={[
                        {
                          id: 'workspace',
                          label: t(
                            'settings_scope_per_space_chameleon',
                            'Independent Per Space (Recommended)'
                          ),
                        },
                        {
                          id: 'global',
                          label: t(
                            'settings_scope_global_chameleon',
                            'Lock One {Chameleon} Across All Spaces'
                          ),
                        },
                      ]}
                    />
                  </div>

                  {useGlobalTheme ? (
                    <div className="flex flex-col gap-1 w-full">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                        {t('settings_global_chameleon_label', 'Global {Chameleon}')}
                      </span>
                      <CustomSettingsDropdown
                        value={globalThemeId || activeThemeId}
                        onChange={(val: string) => setGlobalThemeId(val)}
                        options={allSpokeThemeOptions}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1 w-full">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                          {t('tab_workspace', 'Workspace')}
                        </span>
                        <CustomSettingsDropdown
                          value={resolvedThemeSpaceRow.wsKey}
                          onChange={(val: string) => setSelectedThemeSpace(val)}
                          options={spacePickerOptions}
                        />
                      </div>
                      <div className="flex flex-col gap-1 w-full">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                          {`${resolvedThemeSpaceRow.name} • ${t('term_chameleon', 'Theme')}`}
                        </span>
                        <CustomSettingsDropdown
                          value={assignedThemeForSelectedSpace}
                          onChange={(val: string) =>
                            setWorkspaceThemeId(resolvedThemeSpaceRow.wsKey, val)
                          }
                          options={selectedSpaceThemeOptions}
                        />
                      </div>
                    </>
                  )}
                </div>
              }
            />
          </SettingsGrid>
        </TabContainer>

        {/* SECTION 2: Lexicons (Language & Terminology ONLY — Zero Theme Mixing) */}
        <TabContainer
          title={t('term_lexicons', 'Languages')}
          icon={t('icon_translate', 'translate')}
        >
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={false}
              icon={t('icon_translate', 'translate')}
              accentVar="var(--accent)"
              iconColorClass="text-[var(--accent)]"
              badgeIcon={t('icon_language', 'language')}
              badgeLabel={activeLexiconMeta.language}
              overline={t('settings_lexicon_section_overline', 'Language & Glossary Engine')}
              title={activeLexiconMeta.name}
              description={t(
                'settings_lexicon_section_desc',
                '{Lexicons} control interface language and thematic terminology (such as Standard English vs. Sanctuary sci-fi or game-themed packs). Assign a different pack per workspace or use one everywhere.'
              )}
              actionLabel={t('lexicon_title', '{Lexicon} {Vault}')}
              actionIcon={t('icon_open_in_new', 'open_in_new')}
              actionVariant="glass"
              onAction={() => setIsLexiconOpen(true)}
            />

            <UniversalCard
              layout="vertical"
              title={t('lexicon_title', '{Lexicon} {Vault}')}
              subtitle={t('lexicon_desc', 'Select your interface language and thematic terminology.')}
              onClick={() => setIsLexiconOpen(true)}
              customIcon={
                <DynamicLexiconPreviewBanner
                  data={{
                    id: activeLang,
                    name: activeLexiconMeta.name,
                    language: activeLexiconMeta.language,
                    badge: activeLexiconMeta.community,
                    json_data: registry?.[activeLang],
                  }}
                  heightClass="h-full"
                />
              }
              imageOverlay={
                <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between gap-2 z-20">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t('icon_language', 'language')}
                      </span>
                      <span className="truncate max-w-[160px]">{activeLexiconMeta.name}</span>
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsLexiconOpen(true);
                      }}
                      className="relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer shadow-sm"
                    >
                      <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        {t('icon_open_in_new', 'open_in_new')}
                      </span>
                      <HoverTooltip
                        title={t('lexicon_title', '{Lexicon} {Vault}')}
                        variant="accent"
                        vAlign="bottom"
                      />
                    </button>
                  </div>
                </div>
              }
              badges={
                <>
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t('icon_extension', 'extension')}
                    </span>
                    <span>{activeLexiconMeta.community}</span>
                  </div>
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                      {t('icon_translate', 'translate')}
                    </span>
                    <span>{activeLexiconMeta.language}</span>
                  </div>
                  <div className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                      {useGlobalLexicon
                        ? t('icon_public', 'public')
                        : t('icon_workspaces', 'workspaces')}
                    </span>
                    <span>{lexiconScopeLabel}</span>
                  </div>
                </>
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('settings_lexicon_assignment_title', 'Workspace {Lexicon} Assignment')}
              subtitle={t(
                'settings_lexicon_assignment_desc',
                'Let each game workspace load its own {Lexicon} pack automatically, or lock one {Lexicon} across every space.'
              )}
              icon={
                useGlobalLexicon ? t('icon_public', 'public') : t('icon_workspaces', 'workspaces')
              }
              footer={
                <div className="flex flex-col gap-3 w-full">
                  <div className="flex flex-col gap-1 w-full">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                      {t('settings_assignment_mode_label', 'Assignment Mode')}
                    </span>
                    <CustomSettingsDropdown
                      value={useGlobalLexicon ? 'global' : 'workspace'}
                      onChange={(val: string) => setUseGlobalLexicon(val === 'global')}
                      options={[
                        {
                          id: 'workspace',
                          label: t(
                            'settings_scope_per_space_lexicon',
                            'Independent Per Space (Recommended)'
                          ),
                        },
                        {
                          id: 'global',
                          label: t(
                            'settings_scope_global_lexicon',
                            'Lock One {Lexicon} Across All Spaces'
                          ),
                        },
                      ]}
                    />
                  </div>

                  {useGlobalLexicon ? (
                    <div className="flex flex-col gap-1 w-full">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                        {t('settings_global_lexicon_label', 'Global {Lexicon}')}
                      </span>
                      <CustomSettingsDropdown
                        value={globalLexiconId || activeLang}
                        onChange={(val: string) => setGlobalLexiconId(val)}
                        options={allLexiconOptions}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1 w-full">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                          {t('tab_workspace', 'Workspace')}
                        </span>
                        <CustomSettingsDropdown
                          value={resolvedLexSpaceRow.wsKey}
                          onChange={(val: string) => setSelectedLexSpace(val)}
                          options={spacePickerOptions}
                        />
                      </div>
                      <div className="flex flex-col gap-1 w-full">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] px-1">
                          {`${resolvedLexSpaceRow.name} • ${t('term_lexicon', 'Language')}`}
                        </span>
                        <CustomSettingsDropdown
                          value={assignedLexForSelectedSpace}
                          onChange={(val: string) =>
                            setWorkspaceLexiconId(
                              resolvedLexSpaceRow.wsKey,
                              val === '__auto__' ? null : val
                            )
                          }
                          options={selectedSpaceLexOptions}
                        />
                      </div>
                    </>
                  )}
                </div>
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('settings_auto_translate_posts_title', 'Auto-Translate Community {Dispatches}')}
              subtitle={t(
                'settings_auto_translate_posts_desc',
                'ON: Translates community {Dispatches} and posts to match your active {Lexicon}.\nOFF: Displays posts in their original language.'
              )}
              icon={t('icon_g_translate', 'g_translate')}
              isActive={Boolean(autoTranslateDynamic)}
              onClick={() => setAutoTranslateDynamic(!autoTranslateDynamic)}
              actions={<SettingsToggle checked={Boolean(autoTranslateDynamic)} />}
            />
          </SettingsGrid>
        </TabContainer>

        {/* SECTION 3: Cards & Date Format (Pure Visual Presentation) */}
        <TabContainer
          title={t('settings_cards_dates_section', 'Cards & Date Format')}
          icon={t('icon_display_settings', 'display_settings')}
        >
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={false}
              icon={t('icon_display_settings', 'display_settings')}
              accentVar="var(--accent)"
              iconColorClass="text-[var(--accent)]"
              badgeIcon={t('icon_calendar_month', 'calendar_month')}
              badgeLabel={dateFormat}
              overline={t('settings_display_guide_overline', 'Interface Presentation')}
              title={t('settings_cards_dates_guide_title', 'Card Artwork & Timestamps')}
              description={t(
                'settings_display_guide_desc',
                'Control how {Mod} cover art, Comm-Link {dispatch} media, and timestamps render across your {Vault}, {Nexus}, and dashboards. Disabling artwork switches cards to compact Liquid Glass headers for ultra-dense browsing.'
              )}
            />

            <UniversalCard
              headerStyle="inline"
              title={t('show_images', 'Show {Mod} Images')}
              subtitle={t(
                'show_images_desc',
                'ON: Displays cover artwork on {mod} cards and Dossiers.\nOFF: Uses compact Liquid Glass headers for denser browsing.'
              )}
              icon={t('icon_image', 'image')}
              isActive={Boolean(showImages)}
              onClick={() => setShowImages(!showImages)}
              actions={<SettingsToggle checked={showImages} />}
            />

            <UniversalCard
              headerStyle="inline"
              title={t('show_commlink_images', 'Show Comm-Link & Dispatch Images')}
              subtitle={t(
                'show_commlink_images_desc',
                'ON: Displays cover artwork on Comm-Link {dispatches} and broadcast cards.\nOFF: Uses compact text-first dispatch headers.'
              )}
              icon={t('icon_satellite_alt', 'satellite_alt')}
              isActive={Boolean(showCommLinkImages)}
              onClick={() => setShowCommLinkImages(!showCommLinkImages)}
              actions={<SettingsToggle checked={showCommLinkImages} />}
            />

            <UniversalCard
              headerStyle="inline"
              title={t('settings_date_format_title', 'Date Format')}
              subtitle={t(
                'settings_date_format_desc',
                'Choose how dates are displayed on Comm-Link posts, dispatches, release notes, and records across the OS.'
              )}
              icon={t('icon_calendar_month', 'calendar_month')}
              footer={
                <CustomSettingsDropdown
                  value={dateFormat}
                  onChange={(val: any) => setDateFormat(val)}
                  options={[
                    {
                      id: 'MM/DD/YYYY',
                      label: t('settings_date_format_mdy', 'MM/DD/YYYY (US — 10/28/2026)'),
                    },
                    {
                      id: 'DD/MM/YYYY',
                      label: t(
                        'settings_date_format_dmy',
                        'DD/MM/YYYY (International — 28/10/2026)'
                      ),
                    },
                    {
                      id: 'YYYY-MM-DD',
                      label: t('settings_date_format_ymd', 'YYYY-MM-DD (ISO — 2026-10-28)'),
                    },
                  ]}
                />
              }
            />
          </SettingsGrid>
        </TabContainer>
      </div>

      <ChameleonSidePanel
        config={config}
        isOpen={isChameleonOpen}
        onClose={() => setIsChameleonOpen(false)}
      />
      <ChameleonEditorPanel isOpen={isForgeOpen} onClose={() => setIsForgeOpen(false)} />
      <LexiconSidePanel isOpen={isLexiconOpen} onClose={() => setIsLexiconOpen(false)} />
    </>
  );
}
