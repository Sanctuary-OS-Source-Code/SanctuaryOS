import { useLexicon } from '../LexiconContext';
import { TabContainer, SettingsGrid, SettingsToggle } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';

export default function LogicTab({ anarchyRules, setAnarchyRules }: any) {
  const { t } = useLexicon();
  const rules = anarchyRules || { highlander: true, family: true, dependencies: true, intercept: true };

  const toggleRule = (key: string) => {
    if (setAnarchyRules) setAnarchyRules({ ...rules, [key]: !rules[key as keyof typeof rules] });
  };

  return (
    <TabContainer title={t("anarchy_title")} icon="psychology">
      <SettingsGrid>
        <UniversalCard 
          title={t("anarchy_highlander")} 
          subtitle={t("anarchy_highlander_desc")} 
          icon="sports_martial_arts"
          statusColor={!rules.highlander ? "border-red-500" : undefined}
          onClick={() => toggleRule('highlander')}
          actions={<SettingsToggle checked={rules.highlander} danger={!rules.highlander} />}
        />
        <UniversalCard 
          title={t("anarchy_family")} 
          subtitle={t("anarchy_family_desc")} 
          icon="family_restroom"
          statusColor={!rules.family ? "border-red-500" : undefined}
          onClick={() => toggleRule('family')}
          actions={<SettingsToggle checked={rules.family} danger={!rules.family} />}
        />
        <UniversalCard 
          title={t("anarchy_deps")} 
          subtitle={t("anarchy_deps_desc")} 
          icon="account_tree"
          statusColor={!rules.dependencies ? "border-red-500" : undefined}
          onClick={() => toggleRule('dependencies')}
          actions={<SettingsToggle checked={rules.dependencies} danger={!rules.dependencies} />}
        />
        <UniversalCard 
          title={t("anarchy_intercept")} 
          subtitle={t("anarchy_intercept_desc")} 
          icon="gavel"
          statusColor={!rules.intercept ? "border-red-500" : undefined}
          onClick={() => toggleRule('intercept')}
          actions={<SettingsToggle checked={rules.intercept} danger={!rules.intercept} />}
        />
      </SettingsGrid>
    </TabContainer>
  );
}
