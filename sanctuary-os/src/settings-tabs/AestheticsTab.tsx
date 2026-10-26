import { useState } from 'react';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import { useStore } from '../store';
import { TabContainer, SettingsGrid } from './shared';
import ChameleonSidePanel from '../side-panels/ChameleonSidePanel';
import { ChameleonEditorPanel } from '../side-panels/ChameleonEditorPanel';
import LexiconSidePanel from '../side-panels/LexiconSidePanel';
import { UniversalCard } from '../components/universal/UniversalCard';
import { VAULT_CHIP_CLASS, HoverTooltip } from '../shared';
import {
  DynamicThemePreviewBanner,
  DynamicLexiconPreviewBanner,
} from '../chameleon-components/ThemeCard';
import { getLuminance } from '../chameleon-components/ChameleonShared';

export default function AestheticsTab({ config }: any) {
  const { t, activeLang, registry, lexiconMeta, useGlobalLexicon } = useLexicon();
  const { currentTheme, activeThemeId, useGlobalTheme } = useTheme();
  const activeGameSchema = useStore((state) => state.activeGameSchema);

  const [isChameleonOpen, setIsChameleonOpen] = useState(false);
  const [isForgeOpen, setIsForgeOpen] = useState(false);
  const [isLexiconOpen, setIsLexiconOpen] = useState(false);

  const isDarkMode = getLuminance(currentTheme?.bg || '#060b14') < 0.5;
  const modeLabel = isDarkMode ? t('mode_dark', 'Dark') : t('mode_light', 'Light');
  const themeScopeLabel = useGlobalTheme
    ? t('scope_global', 'Global Network')
    : t('scope_workspace', 'Local Workspace');

  const getActiveLexiconMeta = (code: string) => {
    const cleanName = (val: string) => (val.includes(':') ? val.split(':')[1].trim() : val);
    if (code === 'en-sanctuary') {
      return {
        community: t('badge_sanctuary', 'Sanctuary'),
        language: 'English',
        name: cleanName(t('lang_sanctuary', 'Sanctuary')),
      };
    }
    if (code === 'en-default') {
      return {
        community: t('badge_sanctuary', 'Sanctuary'),
        language: 'English',
        name: cleanName(t('lang_standard', 'Standard English')),
      };
    }
    if (code === 'en-sims' || code === 'Simlish') {
      const simsMeta = lexiconMeta?.find((m: any) => m.id === code);
      return {
        community:
          simsMeta?.badge && simsMeta.badge !== 'Sanctuary'
            ? simsMeta.badge
            : activeGameSchema?.display_name || 'The Sims 4',
        language: simsMeta?.lang || 'English',
        name: simsMeta?.name || cleanName(t('lang_sims', 'Simlish')),
      };
    }
    const meta = lexiconMeta?.find((m: any) => m.id === code);
    if (meta) {
      return {
        community: meta.badge || t('badge_custom', 'Custom'),
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
    ? t('scope_global', 'Global Network')
    : t('scope_workspace', 'Local Workspace');

  const themeSwatches = [
    currentTheme?.bg || '#000000',
    currentTheme?.sidebar || '#050914',
    currentTheme?.accent || '#38bdf8',
    currentTheme?.text || '#f8fafc',
    currentTheme?.success || '#10b981',
  ];

  return (
    <>
      <TabContainer title={t('tab_aesthetics', 'Aesthetics')} icon={t('icon_format_paint', 'format_paint')}>
        <SettingsGrid>
          <UniversalCard
            layout="vertical"
            title={t('chameleon_title', '{Chameleon} {Vault}')}
            subtitle={t('chameleon_desc', 'Customize the visual theme, Liquid Glass optics, and color palette.')}
            onClick={() => setIsChameleonOpen(true)}
            customIcon={<DynamicThemePreviewBanner data={currentTheme} heightClass="h-full" />}
            imageOverlay={
              <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between gap-2 z-20">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--accent)_45%,transparent)]`}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t('icon_palette', 'palette')}
                    </span>
                    <span className="truncate max-w-[160px]">{currentTheme?.name || activeThemeId}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                    <HoverTooltip title={t('btn_open_theme_forge', 'Open Theme Forge')} variant="accent" vAlign="bottom" />
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
                    <HoverTooltip title={t('chameleon_title', '{Chameleon} {Vault}')} variant="accent" vAlign="bottom" />
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
                    {isDarkMode ? t('icon_dark_mode', 'dark_mode') : t('icon_light_mode', 'light_mode')}
                  </span>
                  <span>{modeLabel}</span>
                </div>
                <div className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                    {useGlobalTheme ? t('icon_public', 'public') : t('icon_workspaces', 'workspaces')}
                  </span>
                  <span>{themeScopeLabel}</span>
                </div>
              </>
            }
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
                  <span className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--accent)_45%,transparent)]`}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t('icon_language', 'language')}
                    </span>
                    <span className="truncate max-w-[160px]">{activeLexiconMeta.name}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                    <HoverTooltip title={t('lexicon_title', '{Lexicon} {Vault}')} variant="accent" vAlign="bottom" />
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
                    {useGlobalLexicon ? t('icon_public', 'public') : t('icon_workspaces', 'workspaces')}
                  </span>
                  <span>{lexiconScopeLabel}</span>
                </div>
              </>
            }
          />
        </SettingsGrid>
      </TabContainer>

      <ChameleonSidePanel config={config} isOpen={isChameleonOpen} onClose={() => setIsChameleonOpen(false)} />
      <ChameleonEditorPanel isOpen={isForgeOpen} onClose={() => setIsForgeOpen(false)} />
      <LexiconSidePanel isOpen={isLexiconOpen} onClose={() => setIsLexiconOpen(false)} />
    </>
  );
}
