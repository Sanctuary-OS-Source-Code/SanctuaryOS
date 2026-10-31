import React from 'react';
import { useLexicon } from '../LexiconContext';
import { getLuminance } from './ChameleonShared';
import { DEFAULT_CORE_THEMES, computeGlassOpticalVars } from '../ThemeContext';
import { UniversalCard } from '../components/universal/UniversalCard';
import { HoverTooltip } from '../shared';

const VAULT_CHIP_CLASS =
  'px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0';

export function resolveThemePreviewData(raw: any): any {
  if (!raw) return DEFAULT_CORE_THEMES.architect;
  let inner: any = { ...raw };
  if (typeof raw.json_data === 'string') {
    try {
      inner = { ...raw, ...JSON.parse(raw.json_data) };
    } catch {
      inner = { ...raw };
    }
  } else if (raw.json_data && typeof raw.json_data === 'object') {
    inner = { ...raw, ...raw.json_data };
  } else if (raw.theme_data && typeof raw.theme_data === 'object') {
    inner = { ...raw, ...raw.theme_data };
  }
  if (raw.name) {
    inner.name = raw.name;
  }

  const isLightMode =
    String(inner.theme_mode || '').toLowerCase() === 'light' ||
    (inner.bg && inner.bg !== 'transparent' && getLuminance(inner.bg) >= 0.5);
  const baseDefaults = isLightMode ? DEFAULT_CORE_THEMES.radiant : DEFAULT_CORE_THEMES.architect;

  if (!inner.bg && !inner.accent) {
    const rawName = String(inner.name || inner.id || '').toLowerCase().trim();
    const matchedBuiltin = Object.entries(DEFAULT_CORE_THEMES).find(
      ([k, v]: [string, any]) =>
        k.toLowerCase() === rawName ||
        String(v?.name || '').toLowerCase() === rawName ||
        (rawName.length > 2 && rawName.includes(k.toLowerCase()))
    );
    if (matchedBuiltin) {
      inner = { ...(matchedBuiltin[1] as any), ...inner };
    } else {
      inner = { ...baseDefaults, ...inner };
    }
  } else {
    const { bgImage: _defaultBgImg, name: _defaultName, ...opticalDefaults } = baseDefaults;
    inner = { ...opticalDefaults, ...inner };
  }
  return inner;
}

export function DynamicThemePreviewBanner({
  data: rawData,
  heightClass = 'h-32',
  insetTopClass = 'top-11',
  expanded = false,
  children,
}: {
  data: any;
  heightClass?: string;
  insetTopClass?: string;
  expanded?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useLexicon();
  const data = resolveThemePreviewData(rawData);
  const opticalVars = computeGlassOpticalVars(data);

  const bgHex = data?.bg && data.bg !== 'transparent' ? data.bg : '#060b14';
  const sidebartextHex = data?.sidebartext || data?.text || '#f8fafc';
  const headerTextHex = data?.headerText || data?.text || '#f8fafc';
  const accentHex = data?.accent || '#38bdf8';
  const textHex = data?.text || '#f8fafc';
  const subtextHex = data?.subtext || '#94a3b8';
  const successHex = data?.success || '#10b981';
  const isLight = getLuminance(bgHex) >= 0.5;
  const radiusVal = data?.radius || '1.25rem';

  const hasCustomPreview = Boolean(data?.previewImage && String(data.previewImage).trim() !== '');
  const isPassthrough =
    !hasCustomPreview &&
    (!data?.bgImage || String(data.bgImage).trim() === '') &&
    (data?.bg === 'transparent' || Boolean(data?.transparentWindow));
  const rawBgImageUrl = hasCustomPreview
    ? data.previewImage
    : data?.bgImage && String(data.bgImage).trim() !== '' && data.bgImage !== 'none'
      ? data.bgImage
      : data?.image_url &&
          String(data.image_url).trim() !== '' &&
          !String(data.image_url).includes('placeholder')
        ? data.image_url
        : null;

  const [imgFailed, setImgFailed] = React.useState(false);
  React.useEffect(() => {
    setImgFailed(false);
  }, [rawBgImageUrl]);
  const bgImageUrl = imgFailed ? null : rawBgImageUrl;

  const hasOrbs =
    Boolean(data?.ambientOrb) ||
    (Array.isArray(data?.volumetricOrbs) && data.volumetricOrbs.length > 0);

  const bgGradient = isPassthrough
    ? `radial-gradient(circle at 20% 20%, ${accentHex}38 0%, transparent 55%), radial-gradient(circle at 80% 80%, ${successHex}28 0%, transparent 55%), linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%, rgba(255,255,255,0.04)), linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%, rgba(255,255,255,0.04))`
    : !bgImageUrl &&
        data?.bgGradient &&
        data.bgGradient !== 'none' &&
        data.bgGradient !== 'transparent' &&
        data.bgGradient !== data.bg
      ? data.bgGradient
      : !bgImageUrl && hasOrbs
        ? `radial-gradient(circle at 82% 18%, ${accentHex}42 0%, transparent 58%), radial-gradient(circle at 18% 88%, ${successHex}28 0%, transparent 55%)`
        : 'none';

  const miniPanelStyle: React.CSSProperties = {
    backgroundColor: opticalVars['--glass-base-fill'],
    backgroundImage: `${opticalVars['--glass-meniscus-top']}, ${opticalVars['--glass-sheen']}`,
    borderTop: `1px solid ${opticalVars['--glass-border-top']}`,
    borderLeft: `1px solid ${opticalVars['--glass-border-left']}`,
    borderRight: `1px solid ${opticalVars['--glass-border-right']}`,
    borderBottom: `1px solid ${opticalVars['--glass-border-bottom']}`,
    boxShadow: `${opticalVars['--glass-inset-highlight']}, 0 6px 16px rgba(0,0,0,0.22)`,
    borderRadius: `calc(${radiusVal} * 0.52)`,
  };

  const miniSurfaceStyle: React.CSSProperties = {
    backgroundColor: opticalVars['--glass-card-icon-bg'],
    borderTop: `1px solid ${opticalVars['--glass-border-top']}`,
    borderLeft: `1px solid ${opticalVars['--glass-border-left']}`,
    borderRight: `1px solid ${opticalVars['--glass-surface-border']}`,
    borderBottom: `1px solid ${opticalVars['--glass-surface-border']}`,
    boxShadow: opticalVars['--glass-surface-inset-highlight'],
    borderRadius: `calc(${radiusVal} * 0.36)`,
  };

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden select-none`}
      style={{
        backgroundColor: isPassthrough ? 'rgba(6, 11, 20, 0.32)' : bgHex,
        backgroundImage: bgGradient,
        ...(isPassthrough
          ? {
              backgroundPosition: '0 0, 0 0, 0 0, 8px 8px',
              backgroundSize: '100% 100%, 100% 100%, 16px 16px, 16px 16px',
            }
          : {}),
        fontFamily: data?.fontFamily || 'Inter, sans-serif',
      }}
    >
      {bgImageUrl && (
        <img
          src={bgImageUrl}
          alt=""
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="lazy"
        />
      )}

      {/* Subtle ambient vignette so overlaid badges & mini-OS chrome pop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isLight
            ? 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(15,23,42,0.10) 100%)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.28) 100%)',
        }}
      />

      {/* Miniature Public Sanctuary OS Workspace Preview */}
      {!hasCustomPreview && (
        <div
          className={`absolute inset-x-3 ${insetTopClass} bottom-2.5 flex gap-2 pointer-events-none z-10`}
        >
          {/* Mini Floating Public Sidebar */}
          <div
            className={`${expanded ? 'w-16' : 'w-14'} h-full flex flex-col justify-between p-1.5 backdrop-blur-md shrink-0`}
            style={{
              ...miniPanelStyle,
              backgroundColor: opticalVars['--glass-sidebar-bg'],
            }}
          >
            <div className="flex flex-col gap-1">
              {/* Brand Pill (Sanctuary OS) */}
              <div
                className="w-full h-3.5 px-1 flex items-center gap-1"
                style={miniSurfaceStyle}
              >
                <span
                  className="material-symbols-outlined !text-[8px] leading-none shrink-0"
                  style={{ color: accentHex }}
                >
                  {t('icon_shield', 'shield')}
                </span>
                <div
                  className="w-6 h-1 rounded-full opacity-90"
                  style={{ backgroundColor: sidebartextHex }}
                />
              </div>
              {/* Active Public Nav Item: Command Center */}
              <div
                className="w-full h-3.5 px-1 flex items-center gap-1"
                style={{
                  backgroundColor: opticalVars['--glass-nav-active-bg'],
                  backgroundImage: opticalVars['--glass-nav-active-sheen'],
                  borderTop: `1px solid ${opticalVars['--glass-nav-active-border-top']}`,
                  borderLeft: `1px solid ${opticalVars['--glass-nav-active-border-left']}`,
                  borderRight: `1px solid ${opticalVars['--glass-nav-active-border-right']}`,
                  borderBottom: `1px solid ${opticalVars['--glass-nav-active-border-bottom']}`,
                  boxShadow: opticalVars['--glass-nav-active-shadow'],
                  borderRadius: `calc(${radiusVal} * 0.34)`,
                }}
              >
                <span
                  className="material-symbols-outlined !text-[8px] leading-none shrink-0"
                  style={{ color: accentHex }}
                >
                  {t('icon_desktop_windows', 'desktop_windows')}
                </span>
                <div
                  className="w-6 h-1 rounded-full opacity-95"
                  style={{ backgroundColor: sidebartextHex }}
                />
              </div>
              {/* Inactive Public Nav Items: Your Vault, The Nexus, Blueprints */}
              {[
                { icon: t('icon_account_balance', 'account_balance'), w: 'w-5', op: 'opacity-70' },
                { icon: t('icon_hub', 'hub'), w: 'w-4', op: 'opacity-60' },
                { icon: t('icon_map', 'map'), w: 'w-5', op: 'opacity-50' },
                ...(expanded
                  ? [{ icon: t('icon_podcasts', 'podcasts'), w: 'w-4', op: 'opacity-45' }]
                  : []),
              ].map((nav, nIdx) => (
                <div key={nIdx} className={`px-1 flex items-center gap-1 ${nav.op}`}>
                  <span
                    className="material-symbols-outlined !text-[7px] leading-none shrink-0"
                    style={{ color: sidebartextHex }}
                  >
                    {nav.icon}
                  </span>
                  <div
                    className={`${nav.w} h-1 rounded-full`}
                    style={{ backgroundColor: subtextHex }}
                  />
                </div>
              ))}
            </div>
            {/* Quick Launch Footer */}
            <div
              className="w-full h-3.5 flex items-center justify-center gap-0.5"
              style={{
                ...miniSurfaceStyle,
                borderColor: `${successHex}55`,
              }}
            >
              <span
                className="material-symbols-outlined !text-[7px] leading-none"
                style={{ color: successHex }}
              >
                {t('icon_rocket_launch', 'rocket_launch')}
              </span>
              <div
                className="w-5 h-0.5 rounded-full opacity-90"
                style={{ backgroundColor: successHex }}
              />
            </div>
          </div>

          {/* Mini Public Workspace Area */}
          <div className="flex-1 h-full flex flex-col gap-1.5 min-w-0">
            {/* Optional Top Public Header Row (ViewHeader w-fit + ActionPill Search/Filter) */}
            {expanded && (
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div
                  className="px-2 py-1 flex items-center gap-1.5 backdrop-blur-md"
                  style={miniPanelStyle}
                >
                  <div
                    className="w-3.5 h-3.5 flex items-center justify-center shrink-0"
                    style={miniSurfaceStyle}
                  >
                    <span
                      className="material-symbols-outlined !text-[8px] leading-none"
                      style={{ color: accentHex }}
                    >
                      {t('icon_desktop_windows', 'desktop_windows')}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div
                      className="w-10 h-1 rounded-full"
                      style={{ backgroundColor: headerTextHex }}
                    />
                    <div
                      className="w-7 h-0.5 rounded-full opacity-65"
                      style={{ backgroundColor: subtextHex }}
                    />
                  </div>
                </div>

                <div
                  className="px-2 py-1 flex items-center gap-1.5 backdrop-blur-md"
                  style={miniPanelStyle}
                >
                  <span
                    className="material-symbols-outlined !text-[8px] leading-none"
                    style={{ color: accentHex }}
                  >
                    {t('icon_search', 'search')}
                  </span>
                  <div
                    className="w-7 h-0.5 rounded-full opacity-60"
                    style={{ backgroundColor: subtextHex }}
                  />
                  <span
                    className="material-symbols-outlined !text-[8px] leading-none opacity-80"
                    style={{ color: accentHex }}
                  >
                    {t('icon_tune', 'tune')}
                  </span>
                </div>
              </div>
            )}

            {/* Mini Public 3-Tile StatTileCarousel Row */}
            <div className="grid grid-cols-3 gap-1.5 shrink-0">
              {[
                { icon: t('icon_verified', 'verified'), color: successHex, w: 'w-3.5' },
                { icon: t('icon_account_balance', 'account_balance'), color: textHex, w: 'w-5' },
                { icon: t('icon_hub', 'hub'), color: accentHex, w: 'w-4' },
              ].map((tile, tIdx) => (
                <div
                  key={tIdx}
                  className="px-1.5 py-1 flex items-center gap-1.5 backdrop-blur-md min-w-0"
                  style={miniPanelStyle}
                >
                  <div
                    className="w-3.5 h-3.5 flex items-center justify-center shrink-0"
                    style={miniSurfaceStyle}
                  >
                    <span
                      className="material-symbols-outlined !text-[8px] leading-none"
                      style={{ color: tile.color }}
                    >
                      {tile.icon}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div
                      className="w-4 h-0.5 rounded-full opacity-60"
                      style={{ backgroundColor: subtextHex }}
                    />
                    <div
                      className={`${tile.w} h-1 rounded-full`}
                      style={{ backgroundColor: tIdx === 2 ? accentHex : textHex }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Mini Public 2-Column Sanctuary Cards Grid */}
            <div className="flex-1 grid grid-cols-2 gap-1.5 min-h-0">
              {[
                {
                  icon: t('icon_extension', 'extension'),
                  statusColor: successHex,
                  titleW: 'w-10',
                  subW: 'w-6',
                },
                {
                  icon: t('icon_map', 'map'),
                  statusColor: accentHex,
                  titleW: 'w-9',
                  subW: 'w-5',
                },
              ].map((card, cIdx) => (
                <div
                  key={cIdx}
                  className="p-1.5 flex flex-col justify-between gap-1 backdrop-blur-md min-w-0 overflow-hidden"
                  style={miniPanelStyle}
                >
                  <div className="flex items-start justify-between gap-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className="w-4 h-4 flex items-center justify-center shrink-0"
                        style={miniSurfaceStyle}
                      >
                        <span
                          className="material-symbols-outlined !text-[9px] leading-none"
                          style={{ color: accentHex }}
                        >
                          {card.icon}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div
                          className={`${card.titleW} h-1 rounded-full opacity-95`}
                          style={{ backgroundColor: textHex }}
                        />
                        <div
                          className={`${card.subW} h-0.5 rounded-full opacity-65`}
                          style={{ backgroundColor: subtextHex }}
                        />
                      </div>
                    </div>
                    <div
                      className="px-1 py-0.5 flex items-center gap-0.5 shrink-0"
                      style={miniSurfaceStyle}
                    >
                      <span
                        className="w-1 h-1 rounded-full"
                        style={{ backgroundColor: card.statusColor }}
                      />
                      <div
                        className="w-2.5 h-0.5 rounded-full opacity-80"
                        style={{ backgroundColor: textHex }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <div
                      className="px-1 py-0.5 flex items-center gap-0.5"
                      style={miniSurfaceStyle}
                    >
                      <div
                        className="w-3.5 h-0.5 rounded-full opacity-75"
                        style={{ backgroundColor: subtextHex }}
                      />
                    </div>
                    <div
                      className="px-1.5 py-0.5 flex items-center gap-0.5"
                      style={miniSurfaceStyle}
                    >
                      <span
                        className="material-symbols-outlined !text-[7px] leading-none"
                        style={{ color: accentHex }}
                      >
                        {t('icon_download', 'download')}
                      </span>
                      <div
                        className="w-3 h-0.5 rounded-full opacity-90"
                        style={{ backgroundColor: textHex }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

export function DynamicLexiconPreviewBanner({
  data,
  heightClass = 'h-32',
  children,
}: {
  data: any;
  heightClass?: string;
  children?: React.ReactNode;
}) {
  const { t } = useLexicon();
  const parsed = (() => {
    if (!data) return {};
    if (typeof data.json_data === 'string') {
      try {
        return JSON.parse(data.json_data);
      } catch {
        return {};
      }
    }
    if (data.json_data && typeof data.json_data === 'object') return data.json_data;
    if (data.lexicon_data && typeof data.lexicon_data === 'object') return data.lexicon_data;
    if (typeof data.rawContent === 'string') {
      try {
        return JSON.parse(data.rawContent);
      } catch {
        return {};
      }
    }
    return data;
  })();

  const rawName = String(data?.displayName || data?.name || '').toLowerCase();
  const langLabel = String(
    parsed?._meta_language || data?.language || (rawName.includes('simlish') ? 'Simlish' : 'English')
  );
  const langCode = langLabel.slice(0, 3).toUpperCase();
  const isSanctuary = rawName.includes('sanctuary') || String(data?.lexicon_type || '').toLowerCase().includes('sanctuary');
  const isSims = rawName.includes('sims') || rawName.includes('simlish') || String(data?.community || '').toLowerCase().includes('sims');
  const isSimlish = rawName.includes('simlish');

  const accentColor = isSims ? '#10b981' : isSanctuary ? '#38bdf8' : '#a855f7';

  const samplePairs = [
    {
      id: 'mod',
      icon: t('icon_extension', 'extension'),
      label: t('lex_preview_mod', 'Core Asset'),
      val:
        parsed?.term_mod ||
        (isSimlish ? 'Plumbob' : isSanctuary ? 'Artifact' : 'Mod'),
    },
    {
      id: 'vault',
      icon: t('icon_inventory_2', 'inventory_2'),
      label: t('lex_preview_vault', 'Storage'),
      val:
        parsed?.term_vault ||
        (isSimlish ? 'Bweb' : isSanctuary ? 'Vault' : 'Library'),
    },
    {
      id: 'blueprint',
      icon: t('icon_map', 'map'),
      label: t('lex_preview_blueprint', 'Collection'),
      val:
        parsed?.term_blueprint ||
        (isSimlish ? 'Nooboo' : isSims ? 'Modpack' : isSanctuary ? 'Blueprint' : 'Play Set'),
    },
    {
      id: 'mason',
      icon: t('icon_construction', 'construction'),
      label: t('lex_preview_mason', 'Author'),
      val:
        parsed?.term_mason ||
        (isSimlish ? 'Sul Sul' : isSanctuary ? 'Mason' : 'Creator'),
    },
  ];

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden select-none`}
      style={{
        background: `radial-gradient(circle at 82% 22%, ${accentColor}2e 0%, transparent 62%), var(--glass-card-banner-bg)`,
      }}
    >
      <div className="absolute inset-x-3 top-12 bottom-2.5 flex gap-2 pointer-events-none z-10">
        {/* Mini Language Identity Tile */}
        <div className="w-16 h-full rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex flex-col items-center justify-center p-1.5 gap-1 shrink-0">
          <span
            className="material-symbols-outlined !text-[18px]"
            style={{ color: accentColor }}
          >
            {t('icon_translate', 'translate')}
          </span>
          <span className="text-[10px] font-black tracking-widest uppercase text-[var(--text)] leading-none">
            {langCode}
          </span>
          <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--subtext)] opacity-75 truncate max-w-full">
            {langLabel}
          </span>
        </div>

        {/* Mini 2x2 Terminology Token Matrix */}
        <div className="flex-1 h-full grid grid-cols-2 grid-rows-2 gap-1.5 min-w-0">
          {samplePairs.map((pair) => (
            <div
              key={pair.id}
              className="px-3 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col justify-center min-w-0 overflow-hidden"
            >
              <span
                className="text-[7px] font-black uppercase tracking-wider truncate leading-tight flex items-center gap-1"
                style={{ color: accentColor }}
              >
                <span className="material-symbols-outlined !text-[9px] shrink-0">{pair.icon}</span>
                <span className="truncate">{pair.label}</span>
              </span>
              <span className="text-[9px] font-black text-[var(--text)] truncate leading-tight">
                {String(pair.val)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

export function DynamicBlueprintPreviewBanner({
  data,
  heightClass = 'h-32',
  children,
}: {
  data: any;
  heightClass?: string;
  children?: React.ReactNode;
}) {
  const { t } = useLexicon();
  const rawArtifactsList: any[] =
    data?.artifacts ||
    data?.originalBlueprint?.artifacts ||
    data?.json_data?.artifacts ||
    data?.mods ||
    [];
  const rawArtifacts = React.useMemo(() => {
    if (!Array.isArray(rawArtifactsList)) return [];
    const seen = new Set<string>();
    const out: any[] = [];
    for (let i = 0; i < rawArtifactsList.length; i++) {
      const item = rawArtifactsList[i];
      const rawName =
        typeof item === 'string'
          ? item
          : String(item?.name || item?.filename || item?.path || item?.displayName || '');
      if (
        !rawName ||
        rawName.startsWith('FOLDER_') ||
        rawName.startsWith('SET_') ||
        rawName.startsWith('LOCAL_SET_')
      ) {
        continue;
      }
      const lastSlash = Math.max(rawName.lastIndexOf('/'), rawName.lastIndexOf('\\'));
      const cleanLower = (
        lastSlash >= 0 ? rawName.slice(lastSlash + 1) || rawName : rawName
      ).toLowerCase();
      if (!cleanLower || seen.has(cleanLower)) continue;
      seen.add(cleanLower);
      out.push(item);
    }
    return out;
  }, [rawArtifactsList]);
  const modCount = rawArtifacts.length;
  const gameVer =
    data?.game_version ||
    data?.originalBlueprint?.game_version ||
    data?.version ||
    '';

  const rowCount = modCount > 0 ? Math.min(modCount, 3) : 1;
  const previewRows = Array.from({ length: rowCount }, (_, idx) => {
    const item = rawArtifacts[idx];
    const rawLabel =
      typeof item === 'string'
        ? item
        : item?.displayName || item?.name || item?.filename || '';
    const cleanLabel = rawLabel
      ? String(rawLabel)
          .split(/[\\/]/)
          .pop()!
          .replace(/\.[^/.]+$/, '')
          .replace(/(?:[\s_-]+|^)v?\d+(?:\.\d+)+[a-zA-Z0-9_-]*$/i, '')
          .replace(/[_-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : `${t('term_mod', 'Mod')} #0${idx + 1}`;
    const isScript = String(rawLabel).toLowerCase().includes('script');
    return {
      seq: `0${idx + 1}`,
      label: cleanLabel,
      isScript,
      hasReal: Boolean(rawLabel),
    };
  });

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden select-none`}
      style={{
        background:
          'radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 62%), var(--glass-card-banner-bg)',
      }}
    >
      <div className="absolute inset-x-3 top-12 bottom-2.5 flex gap-2 pointer-events-none z-10">
        {/* Mini Blueprint Node Summary */}
        <div className="w-16 h-full rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex flex-col items-center justify-center p-1.5 gap-0.5 shrink-0">
          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
            {t('icon_map', 'map')}
          </span>
          <span className="text-[11px] font-black text-[var(--text)] leading-none tabular-nums">
            {modCount}
          </span>
          <span className="text-[7px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-75 truncate max-w-full">
            {gameVer ? `v${String(gameVer).replace(/^v\.?/i, '')}` : t('term_mods', 'Mods')}
          </span>
        </div>

        {/* Mini Load-Order Stack */}
        <div className="flex-1 h-full flex flex-col justify-between gap-1 min-w-0">
          {previewRows.map((row) => (
            <div
              key={row.seq}
              className="flex-1 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-1.5 min-w-0"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[7px] font-mono font-black text-[var(--accent)] opacity-85 shrink-0">
                  #{row.seq}
                </span>
                <span
                  className={`text-[8px] font-bold text-[var(--text)] truncate ${
                    row.hasReal ? 'opacity-90' : 'opacity-45'
                  }`}
                >
                  {row.label}
                </span>
              </div>
              <span
                className={`text-[6.5px] font-mono font-black uppercase tracking-wider shrink-0 ${
                  row.isScript ? 'text-[var(--success)]' : 'text-[var(--subtext)] opacity-75'
                }`}
              >
                {row.isScript ? t('scr_short', 'SCR') : t('pkg_short', 'PKG')}
              </span>
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

export function DynamicTemplatePreviewBanner({
  data,
  heightClass = 'h-32',
  children,
}: {
  data: any;
  heightClass?: string;
  children?: React.ReactNode;
}) {
  const { t } = useLexicon();
  const parsed = (() => {
    if (!data) return {};
    try {
      const raw =
        typeof data.json_data === 'string'
          ? JSON.parse(data.json_data)
          : data.json_data || data;
      return Array.isArray(raw) ? raw[0] || {} : raw || {};
    } catch {
      return {};
    }
  })();

  const parserLabel = String(
    parsed?.parser_type ||
      (parsed?.target_file ? String(parsed.target_file).split('.').pop() : '') ||
      'JSON'
  ).toUpperCase();
  const targetFile = String(parsed?.target_file || data?.name || 'settings.cfg')
    .split(/[\\/]/)
    .pop();

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden select-none transition-transform duration-500 group-hover/card:scale-[1.02] group-hover:scale-[1.02]`}
      style={{
        background:
          'radial-gradient(circle at 80% 20%, rgba(245, 158, 11, 0.20) 0%, transparent 62%), var(--glass-card-banner-bg)',
      }}
    >
      <div className="absolute inset-x-3 top-12 bottom-2.5 flex gap-2 pointer-events-none z-10">
        {/* Mini Workbench Parser Tile */}
        <div className="w-16 h-full rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex flex-col items-center justify-center p-1.5 gap-0.5 shrink-0">
          <span className="material-symbols-outlined !text-[16px] text-[var(--warning)]">
            {t('icon_tune', 'tune')}
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] leading-none">
            {parserLabel}
          </span>
          <span className="text-[7px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate max-w-full">
            {targetFile}
          </span>
        </div>

        {/* Mini GUI Controls (Toggles + Slider) */}
        <div className="flex-1 h-full flex flex-col justify-between gap-1 min-w-0">
          <div className="grid grid-cols-2 gap-1 flex-1">
            <div className="px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-1">
              <div className="w-8 h-1.5 rounded-full bg-[var(--text)] opacity-75" />
              <div className="w-4 h-2.5 rounded-full bg-[color-mix(in_srgb,var(--success)_35%,transparent)] border border-[var(--success)] flex items-center justify-end px-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
              </div>
            </div>
            <div className="px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-1">
              <div className="w-7 h-1.5 rounded-full bg-[var(--subtext)] opacity-55" />
              <div className="w-4 h-2.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_35%,transparent)] border border-[var(--accent)] flex items-center justify-end px-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              </div>
            </div>
          </div>

          <div className="flex-1 px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-2">
            <div className="w-7 h-1.5 rounded-full bg-[var(--text)] opacity-75 shrink-0" />
            <div className="flex-1 h-1.5 rounded-full bg-[color-mix(in_srgb,var(--text)_15%,transparent)] relative flex items-center">
              <div className="w-2/3 h-full rounded-full bg-[var(--warning)]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--text)] border border-[var(--warning)] shadow-sm -ml-1" />
            </div>
            <span className="text-[7px] font-mono font-black text-[var(--warning)] shrink-0">
              75%
            </span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function DynamicArtifactPreviewBanner({
  data,
  icon,
  compact = false,
  heightClass = 'h-32',
  children,
}: {
  data: any;
  icon?: string;
  compact?: boolean;
  heightClass?: string;
  children?: React.ReactNode;
}) {
  const { t } = useLexicon();

  const rawName = String(
    data?.displayName || data?.name || data?.suggested_name || data?.artifact_name || 'Artifact'
  );
  const cleanBaseName = rawName
    .replace(/\.(package|ts4script)$/i, '')
    .replace(/_/g, ' ')
    .trim();
  const catStr = String(data?.category_override || data?.category || data?.file_type || data?.type || '').trim();
  const flavors: any[] = Array.isArray(data?.flavors) ? data.flavors : [];
  const moduleCount = Number(
    data?.familyCount || data?._familyChildrenCount || flavors.length || 0
  );
  const isSuite = Boolean(
    data?.isVirtual || data?.isParent || data?.isCollection || moduleCount > 1
  );
  const isScript =
    !isSuite &&
    (rawName.toLowerCase().endsWith('.ts4script') ||
      rawName.toLowerCase().includes('script') ||
      catStr.toLowerCase().includes('script'));

  const resolvedIcon =
    icon ||
    (isSuite
      ? t('icon_account_tree', 'account_tree')
      : isScript
        ? t('icon_terminal', 'terminal')
        : t('icon_deployed_code', 'deployed_code'));

  const typeCode = isSuite
    ? t('badge_suite', 'SUITE')
    : isScript
      ? t('scr_short', 'SCR')
      : t('pkg_short', 'PKG');

  const rawVer = String(data?.latest_version || data?.version || data?.local_version || '').trim();
  const isLocalVer = /^(v?\.?local|vv\.?local|local node|unknown|v\.?unknown)$/i.test(rawVer);
  const formatVerBadge = (v: any): string => {
    const s = String(v || '').trim();
    if (!s || /^(v?\.?local|vv\.?local|local node|unknown|v\.?unknown)$/i.test(s)) return t('unknown', 'Unknown');
    const stripped = s.replace(/^v\.?/i, '');
    return /^\d/.test(stripped) ? `v${stripped.slice(0, 7)}` : stripped.slice(0, 8);
  };

  const cleanVer = rawVer
    ? formatVerBadge(rawVer)
    : isSuite && moduleCount > 1
      ? `${moduleCount} ${t('pkg_short', 'PKG')}`
      : isScript
        ? '.SCRIPT'
        : '.PACKAGE';

  // Category / Role pill
  const categoryLabel = (() => {
    if (catStr && !['mod', 'artifact', 'unknown', 'script'].includes(catStr.toLowerCase())) {
      return catStr;
    }
    if (isSuite) return t('collection', 'Collection');
    if (isScript) return t('scr_short_label', 'Script');
    return t('package', 'Package');
  })();

  // Patch / Version pill
  const patchOrVerLabel = (() => {
    const compatArr = Array.isArray(data?.compatible_versions)
      ? data.compatible_versions
      : Array.isArray(data?.required_versions)
        ? data.required_versions
        : [];
    if (compatArr.length > 0 && compatArr[0]) {
      return formatVerBadge(compatArr[0]);
    }
    if (data?.game_version) {
      return formatVerBadge(data.game_version);
    }
    if (rawVer) {
      return formatVerBadge(rawVer);
    }
    return t('unknown', 'Unknown');
  })();

  // Requirements / Modules pill
  const parseArrLen = (v: any): number => {
    if (!v) return 0;
    if (Array.isArray(v)) return v.filter(Boolean).length;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!trimmed || trimmed === '[]' || trimmed === 'null') return 0;
      try {
        const p = JSON.parse(trimmed);
        return Array.isArray(p) ? p.filter(Boolean).length : 1;
      } catch {
        return trimmed.split(',').filter(Boolean).length;
      }
    }
    return 0;
  };
  const dlcCount = parseArrLen(data?.required_packs || data?.required_dlc);
  const depCount = parseArrLen(data?.required_mods || data?.dependencies);

  const scopePill = (() => {
    if (isSuite && moduleCount > 1) {
      return {
        icon: t('icon_account_tree', 'account_tree'),
        label: `+${moduleCount}`,
        color: 'var(--accent)',
      };
    }
    if (dlcCount > 0) {
      return {
        icon: t('icon_extension', 'extension'),
        label: `${dlcCount} ${t('dlc_short', 'DLC')}`,
        color: 'var(--warning)',
      };
    }
    if (depCount > 0) {
      return {
        icon: t('icon_hub', 'hub'),
        label: `${depCount} ${t('req_short', 'REQ')}`,
        color: 'var(--accent)',
      };
    }
    const isLocalLabel =
      isLocalVer ||
      !rawVer ||
      patchOrVerLabel.toLowerCase() === t('source_local', 'Local').toLowerCase() ||
      patchOrVerLabel.toLowerCase() === 'local';
    return {
      icon: isLocalLabel ? '' : t('icon_check_circle', 'check_circle'),
      label: patchOrVerLabel,
      color: 'var(--success)',
    };
  })();

  // Bottom context bar: sub-modules for suites, folder/file/creator for single mods
  const bottomLeftText = (() => {
    if (isSuite && flavors.length > 0) {
      return flavors
        .slice(0, 2)
        .map((f: any) =>
          String(f.displayName || f.name || f.id || '')
            .replace(/\.(package|ts4script)$/i, '')
            .replace(/_/g, ' ')
            .trim()
        )
        .filter(Boolean)
        .join(' • ');
    }
    const folderStr = String(data?.subfolder || data?.folder || '').trim();
    if (folderStr && folderStr !== '/' && folderStr !== '.') {
      return folderStr.replace(/^[\\/]+/, '');
    }
    return cleanBaseName;
  })();

  const bottomRightText = (() => {
    if (isSuite && moduleCount > 2) {
      return `+${moduleCount - 2}`;
    }
    const creator = String(data?.author || data?.master_author || '').trim();
    if (creator && creator.toLowerCase() !== 'unknown') {
      return creator.slice(0, 12);
    }
    return isScript ? t('scr_short', 'SCR') : t('pkg_short', 'PKG');
  })();

  const accentColorVar = isScript ? 'var(--success)' : 'var(--accent)';
  const radialGlow = isSuite
    ? 'radial-gradient(circle at 82% 20%, rgba(139, 92, 246, 0.22) 0%, transparent 62%)'
    : isScript
      ? 'radial-gradient(circle at 82% 20%, rgba(16, 185, 129, 0.20) 0%, transparent 62%)'
      : 'radial-gradient(circle at 82% 20%, rgba(56, 189, 248, 0.18) 0%, transparent 62%)';

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden select-none transition-transform duration-500 group-hover/card:scale-[1.02] group-hover:scale-[1.02]`}
      style={{
        background: `${radialGlow}, var(--glass-card-banner-bg)`,
      }}
    >
      {/* Subtle ambient watermark glyph */}
      <span
        className="material-symbols-outlined absolute -right-2 -bottom-3 !text-[72px] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]"
        style={{ color: accentColorVar }}
      >
        {resolvedIcon}
      </span>

      <div
        className={`absolute inset-x-3 ${
          compact ? 'top-10 bottom-2' : 'top-12 bottom-2.5'
        } flex gap-2 pointer-events-none z-10`}
      >
        {/* Left Artifact Identity Tile */}
        <div
          className={`${
            compact ? 'w-12' : 'w-14'
          } h-full rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex flex-col items-center justify-center p-1 gap-0.5 shrink-0`}
        >
          <span
            className={`material-symbols-outlined ${compact ? '!text-[14px]' : '!text-[16px]'}`}
            style={{ color: accentColorVar }}
          >
            {resolvedIcon}
          </span>
          <span className="text-[8.5px] font-black uppercase tracking-wider text-[var(--text)] leading-none mt-0.5">
            {typeCode}
          </span>
          {!compact && (
            <span className="text-[6.5px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate max-w-full">
              {cleanVer}
            </span>
          )}
        </div>

        {/* Right Mod Info Stack */}
        <div className="flex-1 h-full flex flex-col justify-between gap-1 min-w-0">
          {/* Row 1: Category (flex-1) + Scope/Version Badge (shrink-0) */}
          <div className="flex items-stretch gap-1 flex-1 min-h-0">
            <div className="flex-1 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1.5 min-w-0">
              <span
                className="material-symbols-outlined !text-[10px] shrink-0"
                style={{ color: accentColorVar }}
              >
                {t('icon_category', 'category')}
              </span>
              <span className="text-[7.5px] font-black uppercase tracking-wider text-[var(--text)] opacity-90 truncate">
                {categoryLabel}
              </span>
            </div>

            <div className="shrink-0 max-w-[46%] px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center gap-1 min-w-0">
              {scopePill.icon && (
                <span
                  className="material-symbols-outlined !text-[10px] shrink-0"
                  style={{ color: scopePill.color }}
                >
                  {scopePill.icon}
                </span>
              )}
              <span className="text-[7px] font-mono font-black uppercase tracking-wider text-[var(--text)] opacity-90 truncate">
                {scopePill.label}
              </span>
            </div>
          </div>

          {/* Row 2: Sub-modules / Folder / Creator Readout */}
          <div className="flex-1 px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="material-symbols-outlined !text-[10px] opacity-80 shrink-0"
                style={{ color: accentColorVar }}
              >
                {isSuite
                  ? t('icon_account_tree', 'account_tree')
                  : t('icon_folder', 'folder')}
              </span>
              <span className="text-[7.5px] font-bold text-[var(--text)] opacity-85 truncate">
                {bottomLeftText}
              </span>
            </div>
            <span className="text-[7px] font-mono font-black uppercase tracking-wider text-[var(--subtext)] opacity-80 shrink-0">
              {bottomRightText}
            </span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function ThemeCard({ id, data, theme, isDev = false, isFav = false, isCloud = false, isFlagged = false, flagReason = '', activeThemeId, setActiveThemeId, onClick, CORE_THEMES, handleOpenThemeEditor, toggleFavoriteTheme, handleExportTheme, setNewThemeName, setEditingThemeId, editingThemeId, newThemeName, renameTheme, confirmDelete, setConfirmDelete, deleteTheme, onDelete }: any) {
  const { t } = useLexicon();
  const raw = data || theme;
  if (!raw) return null;
  const parsedInner = (() => {
    if (raw.bg || raw.accent) return raw;
    if (typeof raw.json_data === "string") {
      try {
        return JSON.parse(raw.json_data);
      } catch {
        return raw;
      }
    }
    if (raw.json_data && typeof raw.json_data === "object") return raw.json_data;
    if (raw.theme_data && typeof raw.theme_data === "object") return raw.theme_data;
    return raw;
  })();
  const resolvedData = {
    ...parsedInner,
    name: parsedInner?.name || raw?.name || id,
  };
  const resolvedDelete = deleteTheme || onDelete;
  const isActive = activeThemeId === id;

  const getThemeBadge = (themeId: string, themeData: any) => {
    if (themeData.badgeKey) return t(themeData.badgeKey, "Community");
    if (themeData.badge) return themeData.badge;
    if (isCloud) return t("synced", "Synced");
    if (CORE_THEMES && CORE_THEMES[themeId]) return t("badge_sanctuary", "Sanctuary");
    return isDev ? t("badge_sandbox", "Sandbox") : t("badge_custom", "Custom");
  };

  const isDarkMode = getLuminance(resolvedData.bg || "#060b14") < 0.5;
  const modeLabel = isDarkMode ? t("mode_dark", "Dark") : t("mode_light", "Light");
  const badgeLabel = getThemeBadge(id, resolvedData);
  const cardSwatches = [
    resolvedData.bg || "#000000",
    resolvedData.sidebar || resolvedData.bg || "#050914",
    resolvedData.accent || "#38bdf8",
    resolvedData.text || "#f8fafc",
    resolvedData.success || "#10b981",
  ];

  const commitCardRename = () => {
    if (
      newThemeName &&
      newThemeName.trim() !== "" &&
      newThemeName.trim() !== resolvedData.name &&
      renameTheme
    ) {
      renameTheme(id, newThemeName.trim());
    }
    setEditingThemeId?.(null);
  };

  const titleNode = editingThemeId === id && setNewThemeName ? (
    <div
      onClick={e => e.stopPropagation()}
      className="w-full glass-surface rounded-xl px-2.5 py-1 flex items-center gap-2 border border-[color-mix(in_srgb,var(--accent)_48%,rgba(255,255,255,0.34))] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.32),0_4px_12px_rgba(0,0,0,0.22)] transition-all"
    >
      <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
        {t("icon_edit", "edit")}
      </span>
      <input
        autoFocus
        value={newThemeName}
        onChange={e => setNewThemeName(e.target.value)}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commitCardRename();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditingThemeId(null);
          }
        }}
        onBlur={commitCardRename}
        className="flex-1 min-w-0 bg-transparent border-none p-0 text-xs font-black tracking-tight outline-none focus:ring-0 text-[var(--text)] selection:bg-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
      />
      <button
        type="button"
        onMouseDown={e => {
          e.preventDefault();
          e.stopPropagation();
          commitCardRename();
        }}
        className="w-5 h-5 rounded-md glass-surface border border-[color-mix(in_srgb,var(--success)_45%,rgba(255,255,255,0.3))] flex items-center justify-center shrink-0 text-[var(--success)] hover:brightness-125 transition-all cursor-pointer"
      >
        <span className="material-symbols-outlined !text-[12px]">
          {t("icon_check", "check")}
        </span>
      </button>
    </div>
  ) : (
    <span className={isActive ? "text-[var(--accent)]" : ""}>{resolvedData.name}</span>
  );

  return (
    <UniversalCard
      layout="vertical"
      title={titleNode}
      subtitle={isFlagged ? `${t("flagged", "Flagged")} • ${modeLabel}` : `${badgeLabel} • ${modeLabel}`}
      isActive={isActive}
      onClick={() => {
        if (onClick) onClick();
        else if (setActiveThemeId) setActiveThemeId(id);
      }}
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <div className="flex items-center gap-1">
              {cardSwatches.map((hex, idx) => (
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
              {t("icon_palette", "palette")}
            </span>
            <span>{badgeLabel}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
              {isDarkMode ? t("icon_dark_mode", "dark_mode") : t("icon_light_mode", "light_mode")}
            </span>
            <span>{modeLabel}</span>
          </div>
        </>
      }
      imageOverlay={
        <div className="absolute inset-0 z-20">
          <DynamicThemePreviewBanner data={resolvedData} heightClass="h-full">
            <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between gap-2 z-20">
              <div className="flex items-center gap-1.5 flex-wrap">
                {isFlagged && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                      {t("icon_flag", "flag")}
                    </span>
                    <span>{t("flagged", "Flagged")}</span>
                  </span>
                )}
                {isActive && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    <span>{t("selected", "Selected")}</span>
                  </span>
                )}
                {resolvedData.previewImage && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_image", "image")}
                    </span>
                    <span>{t("theme_preview_custom_badge", "Custom Cover")}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 opacity-90 group-hover/card:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                {!isDev && toggleFavoriteTheme && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); toggleFavoriteTheme(id, e); }}
                    className={`relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] cursor-pointer shadow-sm ${isFav ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)]'}`}
                  >
                    <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}>{t("icon_star", "star")}</span>
                    <HoverTooltip title={t("favorite", "Favorite")} variant="accent" vAlign="bottom" />
                  </button>
                )}
                {handleExportTheme && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleExportTheme(e, resolvedData, isDev); }}
                    className="relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] hover:text-[var(--text)] text-[var(--subtext)] cursor-pointer shadow-sm"
                  >
                    <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_save", "save")}</span>
                    <HoverTooltip title={t("btn_export", "Export")} variant="accent" vAlign="bottom" />
                  </button>
                )}
                {(handleOpenThemeEditor || onClick) && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      if (handleOpenThemeEditor) handleOpenThemeEditor(e, id, resolvedData);
                      else if (onClick) onClick();
                    }}
                    className="relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] theme-text-accent cursor-pointer shadow-sm"
                  >
                    <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_tune", "tune")}</span>
                    <HoverTooltip title={t("btn_open_theme_forge", "Open Theme Forge")} variant="accent" vAlign="bottom" />
                  </button>
                )}
                {(!CORE_THEMES || !CORE_THEMES[id]) && (
                  <>
                    {setNewThemeName && setEditingThemeId && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setNewThemeName(resolvedData.name); setEditingThemeId(id); }}
                        className="relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] hover:text-[var(--text)] text-[var(--subtext)] cursor-pointer shadow-sm"
                      >
                        <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_edit", "edit")}</span>
                        <HoverTooltip title={t("edit", "Edit")} variant="accent" vAlign="bottom" />
                      </button>
                    )}
                    {!isCloud && resolvedDelete && setConfirmDelete && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); if (confirmDelete === id) { resolvedDelete(id); setConfirmDelete(false); } else setConfirmDelete(id); }}
                        onMouseLeave={() => setConfirmDelete(false)}
                        className={`relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] cursor-pointer shadow-sm ${confirmDelete === id ? 'border-[var(--danger)] text-[var(--danger)] scale-105' : 'hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] theme-text-danger'}`}
                      >
                        <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{confirmDelete === id ? t("icon_warning", "warning") : t("icon_delete", "delete")}</span>
                        <HoverTooltip title={t("delete", "Delete")} variant="danger" vAlign="bottom" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </DynamicThemePreviewBanner>
        </div>
      }
      footer={
        isFlagged ? (
          <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
            <span className="flex items-center gap-1.5 text-[var(--danger)]">
              <span className="material-symbols-outlined !text-[13px]">{t("icon_flag", "flag")}</span>
              <span>{t("flag_res_action_needed", "Action Needed")}</span>
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 shrink-0">
              {t("flag_res_resolve_btn_short", "Resolve & Resubmit")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        ) : undefined
      }
    >
      {isFlagged && flagReason ? (
        <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_26%,transparent)] flex items-center gap-2.5 mt-1">
          <div className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[13px] text-[var(--danger)]">
              {t("icon_flag", "flag")}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-[var(--text)] opacity-90 leading-snug line-clamp-2">
            {String(flagReason).replace(/\s+\?\s+/g, " — ")}
          </p>
        </div>
      ) : undefined}
    </UniversalCard>
  );
}
