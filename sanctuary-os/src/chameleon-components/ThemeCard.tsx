import React from 'react';
import { useLexicon } from '../LexiconContext';
import { getLuminance } from './ChameleonShared';
import { DEFAULT_CORE_THEMES } from '../ThemeContext';
import { UniversalCard } from '../components/universal/UniversalCard';
import { HoverTooltip } from '../shared';

const VAULT_CHIP_CLASS =
  'px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0';

function resolveThemePreviewData(raw: any): any {
  if (!raw) return DEFAULT_CORE_THEMES.architect;
  let inner: any = raw;
  if (typeof raw.json_data === 'string') {
    try {
      inner = { ...raw, ...JSON.parse(raw.json_data) };
    } catch {
      inner = raw;
    }
  } else if (raw.json_data && typeof raw.json_data === 'object') {
    inner = { ...raw, ...raw.json_data };
  } else if (raw.theme_data && typeof raw.theme_data === 'object') {
    inner = { ...raw, ...raw.theme_data };
  }

  if (!inner.bg && !inner.accent) {
    const rawName = String(inner.name || inner.id || '').toLowerCase().trim();
    const matchedBuiltin = Object.entries(DEFAULT_CORE_THEMES).find(
      ([k, v]: [string, any]) =>
        k.toLowerCase() === rawName ||
        String(v?.name || '').toLowerCase() === rawName ||
        rawName.includes(k.toLowerCase())
    );
    if (matchedBuiltin) {
      inner = { ...(matchedBuiltin[1] as any), ...inner };
    } else if (String(inner.theme_mode || '').toLowerCase() === 'light') {
      inner = { ...DEFAULT_CORE_THEMES.radiant, ...inner };
    }
  }
  return inner;
}

export function DynamicThemePreviewBanner({
  data: rawData,
  heightClass = 'h-32',
  insetTopClass = 'top-12',
  children,
}: {
  data: any;
  heightClass?: string;
  insetTopClass?: string;
  children?: React.ReactNode;
}) {
  const data = resolveThemePreviewData(rawData);
  const bgHex = data?.bg && data.bg !== 'transparent' ? data.bg : '#060b14';
  const sidebarHex = data?.sidebar && data.sidebar !== 'transparent' ? data.sidebar : bgHex;
  const sidebartextHex = data?.sidebartext || data?.text || '#f8fafc';
  const accentHex = data?.accent || '#38bdf8';
  const textHex = data?.text || '#f8fafc';
  const subtextHex = data?.subtext || '#94a3b8';
  const successHex = data?.success || '#10b981';
  const warningHex = data?.warning || '#f59e0b';
  const isLight = getLuminance(bgHex) >= 0.5;
  const radiusVal = data?.radius || '1.25rem';

  const hasCustomPreview = Boolean(data?.previewImage && String(data.previewImage).trim() !== '');
  const isPassthrough =
    !hasCustomPreview &&
    (!data?.bgImage || String(data.bgImage).trim() === '') &&
    (data?.bg === 'transparent' || Boolean(data?.transparentWindow));
  const bgImageUrl = hasCustomPreview
    ? data.previewImage
    : data?.bgImage && String(data.bgImage).trim() !== ''
      ? data.bgImage
      : data?.image_url && String(data.image_url).trim() !== '' && !String(data.image_url).includes('placeholder')
        ? data.image_url
        : null;
  const bgGradient = isPassthrough
    ? `radial-gradient(circle at 20% 20%, ${accentHex}38 0%, transparent 55%), radial-gradient(circle at 80% 80%, ${successHex}28 0%, transparent 55%), linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%, rgba(255,255,255,0.04)), linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%, rgba(255,255,255,0.04))`
    : !bgImageUrl && data?.bgGradient && data.bgGradient !== 'none' && data.bgGradient !== 'transparent'
      ? data.bgGradient
      : `radial-gradient(circle at 80% 20%, ${accentHex}33 0%, transparent 60%), radial-gradient(circle at 20% 85%, ${successHex}24 0%, transparent 55%)`;

  const glassFill = isLight ? 'rgba(255, 255, 255, 0.62)' : 'rgba(15, 23, 42, 0.54)';
  const glassBorder = isLight ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.22)';

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
          alt={data?.name || 'Theme Preview'}
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="lazy"
        />
      )}

      {/* Subtle ambient vignette so overlaid badges & mini-OS chrome pop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isLight
            ? 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(15,23,42,0.12) 100%)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.44) 100%)',
        }}
      />

      {/* Procedural Mini Sanctuary OS Window Preview (Always rendered unless a custom screenshot is uploaded) */}
      {!hasCustomPreview && (
        <div className={`absolute inset-x-3 ${insetTopClass} bottom-2.5 flex gap-2 pointer-events-none z-10`}>
          {/* Mini Floating Sidebar */}
          <div
            className="w-12 h-full flex flex-col justify-between p-1.5 backdrop-blur-md shrink-0"
            style={{
              backgroundColor: isLight ? 'rgba(255,255,255,0.68)' : `${sidebarHex}d9`,
              borderRadius: `calc(${radiusVal} * 0.55)`,
              border: `1px solid ${glassBorder}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 14px rgba(0,0,0,0.22)',
            }}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: accentHex }} />
                <div className="w-5 h-1.5 rounded-full opacity-90" style={{ backgroundColor: sidebartextHex }} />
              </div>
              <div
                className="w-full h-3 rounded-md flex items-center px-1 gap-1 mt-0.5"
                style={{
                  backgroundColor: `${accentHex}2e`,
                  border: `1px solid ${accentHex}77`,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accentHex }} />
                <div className="w-4 h-1 rounded-full opacity-95" style={{ backgroundColor: sidebartextHex }} />
              </div>
              <div className="w-6 h-1 rounded-full opacity-45 ml-0.5 mt-0.5" style={{ backgroundColor: subtextHex }} />
              <div className="w-5 h-1 rounded-full opacity-35 ml-0.5" style={{ backgroundColor: subtextHex }} />
            </div>
            <div
              className="w-full h-2.5 rounded-md opacity-90 flex items-center justify-center"
              style={{
                backgroundColor: `${successHex}28`,
                border: `1px solid ${successHex}66`,
              }}
            >
              <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: successHex }} />
            </div>
          </div>

          {/* Mini Main Workspace Area */}
          <div className="flex-1 h-full flex flex-col gap-1.5 min-w-0">
            {/* Mini Top Stat Tiles Row */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { color: accentHex, w: 'w-4' },
                { color: successHex, w: 'w-5' },
                { color: warningHex, w: 'w-3.5' },
              ].map((tile, tIdx) => (
                <div
                  key={tIdx}
                  className="px-1.5 py-1 flex items-center gap-1 backdrop-blur-md"
                  style={{
                    backgroundColor: glassFill,
                    borderRadius: `calc(${radiusVal} * 0.45)`,
                    border: tIdx === 0 ? `1px solid ${accentHex}77` : `1px solid ${glassBorder}`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.30)',
                  }}
                >
                  <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: tile.color }} />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="w-4 h-0.5 rounded-full opacity-55" style={{ backgroundColor: subtextHex }} />
                    <div className={`${tile.w} h-1 rounded-full`} style={{ backgroundColor: textHex }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Mini Liquid Glass Content Card + Swatches */}
            <div
              className="flex-1 px-2.5 py-1.5 flex items-center justify-between gap-2 backdrop-blur-md"
              style={{
                backgroundColor: glassFill,
                borderRadius: `calc(${radiusVal} * 0.55)`,
                border: `1px solid ${glassBorder}`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), 0 8px 18px rgba(0,0,0,0.18)',
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${accentHex}24`,
                    border: `1px solid ${accentHex}66`,
                  }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentHex }} />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="w-12 h-1.5 rounded-full" style={{ backgroundColor: textHex }} />
                  <div className="w-8 h-1 rounded-full opacity-65" style={{ backgroundColor: subtextHex }} />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {[bgHex, accentHex, textHex, successHex].map((swatch, idx) => (
                  <span
                    key={idx}
                    className="w-3 h-3 rounded-full border border-white/35 shadow-sm"
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
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
      token: '{Mod}',
      val:
        parsed?.term_mod ||
        (isSimlish ? 'Plumbob' : isSanctuary ? 'Artifact' : 'Mod'),
    },
    {
      token: '{Vault}',
      val:
        parsed?.term_vault ||
        (isSimlish ? 'Bweb' : isSanctuary ? 'Vault' : 'Library'),
    },
    {
      token: '{Blueprint}',
      val:
        parsed?.term_blueprint ||
        (isSimlish ? 'Nooboo' : isSims ? 'Modpack' : isSanctuary ? 'Blueprint' : 'Play Set'),
    },
    {
      token: '{Mason}',
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
              key={pair.token}
              className="px-3 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col justify-center min-w-0 overflow-hidden"
            >
              <span
                className="text-[7px] font-mono font-black tracking-wider truncate leading-tight"
                style={{ color: accentColor }}
              >
                {pair.token}
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
  const rawArtifacts: any[] =
    data?.artifacts ||
    data?.originalBlueprint?.artifacts ||
    data?.json_data?.artifacts ||
    data?.mods ||
    [];
  const modCount = Array.isArray(rawArtifacts) ? rawArtifacts.length : 0;
  const gameVer =
    data?.game_version ||
    data?.originalBlueprint?.game_version ||
    data?.version ||
    '';

  const previewRows = [0, 1, 2].map((idx) => {
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
          .replace(/_/g, ' ')
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
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  row.isScript ? 'bg-[var(--success)]' : 'bg-[var(--accent)]'
                }`}
              />
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
      ? t('script', 'SCRIPT')
      : t('pkg_short', 'PKG');

  const rawVer = data?.latest_version || data?.version || data?.local_version || '';
  const cleanVer = rawVer
    ? `v${String(rawVer).replace(/^v\.?/i, '').slice(0, 7)}`
    : isSuite && moduleCount > 1
      ? `${moduleCount} ${t('term_mods', 'Mods')}`
      : isScript
        ? '.TS4SCRIPT'
        : '.PACKAGE';

  // Category / Role pill
  const categoryLabel = (() => {
    if (catStr && !['mod', 'artifact', 'unknown'].includes(catStr.toLowerCase())) {
      return catStr;
    }
    if (isSuite) return t('collection', 'Collection');
    if (isScript) return t('script', 'Script');
    return t('term_mod', 'Artifact');
  })();

  // Patch / Version pill
  const patchOrVerLabel = (() => {
    const compatArr = Array.isArray(data?.compatible_versions)
      ? data.compatible_versions
      : Array.isArray(data?.required_versions)
        ? data.required_versions
        : [];
    if (compatArr.length > 0 && compatArr[0]) {
      return `v${String(compatArr[0]).replace(/^v\.?/i, '').slice(0, 9)}`;
    }
    if (data?.game_version) {
      return `v${String(data.game_version).replace(/^v\.?/i, '').slice(0, 9)}`;
    }
    if (rawVer) {
      return `v${String(rawVer).replace(/^v\.?/i, '').slice(0, 9)}`;
    }
    return t('verified', 'Ready');
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
        label: `${moduleCount} ${t('badge_modules_count', 'Modules')}`,
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
    return {
      icon: t('icon_check_circle', 'check_circle'),
      label: t('standalone', 'Standalone'),
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
      return creator.slice(0, 14);
    }
    return isScript ? '.TS4SCRIPT' : '.PACKAGE';
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
          {/* Row 1: Category + Patch/Version + Scope/Reqs */}
          <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-3'} gap-1 flex-1 min-h-0`}>
            <div className="px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1 min-w-0">
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

            {!compact && (
              <div className="px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1 min-w-0">
                <span className="material-symbols-outlined !text-[10px] text-[var(--subtext)] opacity-80 shrink-0">
                  {t('icon_sports_esports', 'sports_esports')}
                </span>
                <span className="text-[7.5px] font-mono font-black text-[var(--subtext)] opacity-90 truncate">
                  {patchOrVerLabel}
                </span>
              </div>
            )}

            <div className="px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1 min-w-0">
              <span
                className="material-symbols-outlined !text-[10px] shrink-0"
                style={{ color: scopePill.color }}
              >
                {scopePill.icon}
              </span>
              <span className="text-[7.5px] font-black uppercase tracking-wider text-[var(--text)] opacity-90 truncate">
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

export function ThemeCard({ id, data, theme, isDev = false, isFav = false, isCloud = false, activeThemeId, setActiveThemeId, onClick, CORE_THEMES, handleOpenThemeEditor, toggleFavoriteTheme, handleExportTheme, setNewThemeName, setEditingThemeId, editingThemeId, newThemeName, renameTheme, confirmDelete, setConfirmDelete, deleteTheme, onDelete }: any) {
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
      subtitle={`${badgeLabel} • ${modeLabel}`}
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
                {isActive && (
                  <span className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--accent)_45%,transparent)]`}>
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
    />
  );
}
