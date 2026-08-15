import { useState } from 'react';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import { TabContainer, SettingsGrid } from './shared';
import ChameleonSidePanel from '../side-panels/ChameleonSidePanel';
import LexiconSidePanel from '../side-panels/LexiconSidePanel';
import { UniversalCard } from '../components/universal/UniversalCard';

export default function AestheticsTab({ config }: any) {
  const { t } = useLexicon();
  const [isChameleonOpen, setIsChameleonOpen] = useState(false);
  const [isLexiconOpen, setIsLexiconOpen] = useState(false);

  return (
    <>
      <TabContainer title={t("tab_aesthetics")} icon="format_paint">
        <SettingsGrid>
          <UniversalCard
            title={t("chameleon_title")}
            subtitle={t("chameleon_desc")}
            icon="palette"
            onClick={() => setIsChameleonOpen(true)}
            actions={
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center transition-all shadow-inner backdrop-blur-md">
                <span className="material-symbols-outlined !text-[20px] theme-text-accent">open_in_new</span>
              </div>
            }
          />
          <UniversalCard
            title={t("lexicon_title")}
            subtitle={t("lexicon_desc")}
            icon="language"
            onClick={() => setIsLexiconOpen(true)}
            actions={
              <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center transition-all shadow-inner backdrop-blur-md">
                <span className="material-symbols-outlined !text-[20px] theme-text-accent">open_in_new</span>
              </div>
            }
          />

        </SettingsGrid>
      </TabContainer>

      <ChameleonSidePanel config={config} isOpen={isChameleonOpen} onClose={() => setIsChameleonOpen(false)} />
      <LexiconSidePanel isOpen={isLexiconOpen} onClose={() => setIsLexiconOpen(false)} />
    </>
  );
}


