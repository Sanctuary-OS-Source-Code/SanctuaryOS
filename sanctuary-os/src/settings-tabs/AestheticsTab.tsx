import { useState } from 'react';
import { useLexicon } from '../LexiconContext';
import { TabContainer, SettingsGrid, SettingCard } from './shared';
import ChameleonSidePanel from '../side-panels/ChameleonSidePanel';
import LexiconSidePanel from '../side-panels/LexiconSidePanel';

export default function AestheticsTab({ config }: any) {
  const { t } = useLexicon();
  const [isChameleonOpen, setIsChameleonOpen] = useState(false);
  const [isLexiconOpen, setIsLexiconOpen] = useState(false);

  return (
    <>
      <TabContainer title={t("tab_aesthetics") || "Aesthetics"} icon="format_paint">
        <SettingsGrid>
          <SettingCard 
            title={t("chameleon_title")} 
            description={t("chameleon_desc")} 
            icon="palette"
            onClick={() => setIsChameleonOpen(true)}
            action={
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center transition-all shadow-inner backdrop-blur-md">
                <span className="material-symbols-outlined !text-[20px] theme-text-accent">open_in_new</span>
              </div>
            }
          />
          <SettingCard 
            title={t("lexicon_title")} 
            description={t("lexicon_desc")} 
            icon="language"
            onClick={() => setIsLexiconOpen(true)}
            action={
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center transition-all shadow-inner backdrop-blur-md">
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
