import { useState } from 'react';
import { useLexicon } from '../LexiconContext';
import { TabContainer, SettingsGrid } from './shared';
import ChameleonSidePanel from '../side-panels/ChameleonSidePanel';
import LexiconSidePanel from '../side-panels/LexiconSidePanel';
import { UniversalCard } from '../components/universal/UniversalCard';
import { ActionButton } from '../shared';

export default function AestheticsTab({ config }: any) {
  const { t } = useLexicon();
  const [isChameleonOpen, setIsChameleonOpen] = useState(false);
  const [isLexiconOpen, setIsLexiconOpen] = useState(false);

  return (
    <>
      <TabContainer title={t("tab_aesthetics", "Aesthetics")} icon={t("icon_format_paint", "format_paint")}>
        <SettingsGrid>
          <UniversalCard
            title={t("chameleon_title", "Themes")}
            subtitle={t("chameleon_desc", "Customize the visual theme and color palette.")}
            icon={t("icon_palette", "palette")}
            onClick={() => setIsChameleonOpen(true)}
            actions={
              <div className="w-10 h-10 rounded-xl glass-surface flex items-center justify-center transition-all">
                <span className="material-symbols-outlined !text-[20px] theme-text-accent">{t("icon_open_in_new", "open_in_new")}</span>
              </div>
            }
          >
            <ActionButton
              variant="glass"
              icon={t("icon_palette", "palette")}
              label={t("chameleon_title", "Themes")}
              className="w-full pointer-events-none mt-2"
            />
          </UniversalCard>
          <UniversalCard
            title={t("lexicon_title", "Language & Lexicon")}
            subtitle={t("lexicon_desc", "Select your interface language and thematic terminology.")}
            icon={t("icon_language", "language")}
            onClick={() => setIsLexiconOpen(true)}
            actions={
              <div className="w-10 h-10 rounded-xl glass-surface flex items-center justify-center transition-all">
                <span className="material-symbols-outlined !text-[20px] theme-text-accent">{t("icon_open_in_new", "open_in_new")}</span>
              </div>
            }
          >
            <ActionButton
              variant="glass"
              icon={t("icon_language", "language")}
              label={t("lexicon_title", "Language & Lexicon")}
              className="w-full pointer-events-none mt-2"
            />
          </UniversalCard>
        </SettingsGrid>
      </TabContainer>

      <ChameleonSidePanel config={config} isOpen={isChameleonOpen} onClose={() => setIsChameleonOpen(false)} />
      <LexiconSidePanel isOpen={isLexiconOpen} onClose={() => setIsLexiconOpen(false)} />
    </>
  );
}


