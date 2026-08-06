import { useLexicon } from '../LexiconContext';
import { TabContainer, SettingsGrid, SettingCard, SettingsToggle } from './shared';

export default function LogicTab({ anarchyRules, setAnarchyRules }: any) {
  const { t } = useLexicon();
  const rules = anarchyRules || { highlander: true, family: true, dependencies: true, intercept: true };

  const toggleRule = (key: string) => {
    if (setAnarchyRules) setAnarchyRules({ ...rules, [key]: !rules[key as keyof typeof rules] });
  };

  return (
    <TabContainer title={t("anarchy_title")} icon="psychology">
      <SettingsGrid>
        <SettingCard 
          title={t("anarchy_highlander")} 
          description={t("anarchy_highlander_desc")} 
          icon="sports_martial_arts"
          danger={!rules.highlander} 
          onClick={() => toggleRule('highlander')}
          action={<SettingsToggle checked={rules.highlander} danger={!rules.highlander} />}
        />
        <SettingCard 
          title={t("anarchy_family")} 
          description={t("anarchy_family_desc")} 
          icon="family_restroom"
          danger={!rules.family} 
          onClick={() => toggleRule('family')}
          action={<SettingsToggle checked={rules.family} danger={!rules.family} />}
        />
        <SettingCard 
          title={t("anarchy_deps")} 
          description={t("anarchy_deps_desc")} 
          icon="account_tree"
          danger={!rules.dependencies} 
          onClick={() => toggleRule('dependencies')}
          action={<SettingsToggle checked={rules.dependencies} danger={!rules.dependencies} />}
        />
        <SettingCard 
          title={t("anarchy_intercept")} 
          description={t("anarchy_intercept_desc")} 
          icon="gavel"
          danger={!rules.intercept} 
          onClick={() => toggleRule('intercept')}
          action={<SettingsToggle checked={rules.intercept} danger={!rules.intercept} />}
        />
      </SettingsGrid>
    </TabContainer>
  );
}
