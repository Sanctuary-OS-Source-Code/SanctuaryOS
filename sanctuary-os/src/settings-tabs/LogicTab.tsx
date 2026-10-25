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
    <TabContainer title={t("anarchy_title", "Logic Integrity (Advanced Rules)")} icon="psychology">
      <SettingsGrid>
        <UniversalCard 
          title={t("anarchy_highlander", "Highlander Enforcement (Flavors)")} 
          subtitle={t("anarchy_highlander_desc", "ON: Auto-evict rivals. OFF: The More the Merrier (Gladiator Mode).")} 
          icon="sports_martial_arts"
          statusColor={!rules.highlander ? "border-red-500" : undefined}
          onClick={() => toggleRule('highlander')}
          actions={<SettingsToggle checked={rules.highlander} danger={!rules.highlander} />}
        />
        <UniversalCard 
          title={t("anarchy_family", "Nuclear Family Cohesion (Twins)")} 
          subtitle={t("anarchy_family_desc", "ON: Auto-selects siblings. OFF: Single Parent Mode.")} 
          icon="family_restroom"
          statusColor={!rules.family ? "border-red-500" : undefined}
          onClick={() => toggleRule('family')}
          actions={<SettingsToggle checked={rules.family} danger={!rules.family} />}
        />
        <UniversalCard 
          title={t("anarchy_deps", "Dependency Chain-Link")} 
          subtitle={t("anarchy_deps_desc", "ON: Pulls in required libraries. OFF: Lone Wolf (Script Call Failed).")} 
          icon="account_tree"
          statusColor={!rules.dependencies ? "border-red-500" : undefined}
          onClick={() => toggleRule('dependencies')}
          actions={<SettingsToggle checked={rules.dependencies} danger={!rules.dependencies} />}
        />
        <UniversalCard 
          title={t("anarchy_intercept", "Conflict Intercept (Severity 4 Collision)")} 
          subtitle={t("anarchy_intercept_desc", "ON: Block mortal enemies. OFF: Let them fight.")} 
          icon="gavel"
          statusColor={!rules.intercept ? "border-red-500" : undefined}
          onClick={() => toggleRule('intercept')}
          actions={<SettingsToggle checked={rules.intercept} danger={!rules.intercept} />}
        />
      </SettingsGrid>
    </TabContainer>
  );
}
