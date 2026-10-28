import { useLexicon } from '../LexiconContext';
import { TabContainer, CustomSettingsDropdown, SettingsGrid } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';

export default function EngineTab({ config, updateConfig }: any) {
  const { t } = useLexicon();

  return (
    <div className="flex flex-col gap-30 w-full pb-48">
      <TabContainer
        title={t("btn_timeline", "VERSION HISTORY")}
        icon="history"
      >
        <SettingsGrid>
          <UniversalCard
            title={t("timeline_copies", "Version Copies")}
            subtitle={t("timeline_copies_desc", "How many distinct timeline iterations to preserve before overwriting.")}
            icon="content_copy"
            footer={
              <CustomSettingsDropdown
                value={config.timeline_retention_copies ?? 50}
                onChange={(val: any) => updateConfig('timeline_retention_copies', val)}
                options={[
                  { id: 10, label: t("timeline_10", "Keep 10 Versions") },
                  { id: 50, label: t("timeline_50", "Keep 50 Versions (Default)") },
                  { id: 100, label: t("timeline_100", "Keep 100 Versions") },
                  { id: 500, label: t("timeline_500", "Keep 500 Versions") }
                ]}
              />
            }
          />
          <UniversalCard
            title={t("timeline_size", "Version Storage Limit")}
            subtitle={t("timeline_size_desc", "Maximum vault space allocated for timeline histories before purging oldest records.")}
            icon="hard_drive"
            footer={
              <CustomSettingsDropdown
                value={config.timeline_retention_size_mb ?? 100}
                onChange={(val: any) => updateConfig('timeline_retention_size_mb', val)}
                options={[
                  { id: 50, label: t("timeline_size_50", "Storage cap: 50 MB") },
                  { id: 100, label: t("timeline_size_100", "Storage cap: 100 MB (Default)") },
                  { id: 500, label: t("timeline_size_500", "Storage cap: 500 MB") },
                  { id: 1024, label: t("timeline_size_1024", "Storage cap: 1 GB") }
                ]}
              />
            }
          />
        </SettingsGrid>
      </TabContainer>

      <TabContainer
        title={t("term_backups", "Backups")}
        icon="history"
      >
        <SettingsGrid>
          <UniversalCard
            title={t("vault_capacity", "{Backups} Limit")}
            subtitle={t("vault_capacity_desc", "Maximum storage allocated for {Backups} backups on your drive.")}
            icon="inventory_2"
            footer={
              <CustomSettingsDropdown
                value={config.vault_capacity_gb ?? 0}
                onChange={(val: any) => updateConfig('vault_capacity_gb', val)}
                options={[
                  { id: 0, label: t("capacity_unlimited", "Unlimited") },
                  { id: 10, label: t("capacity_10", "10 Gb") },
                  { id: 25, label: t("capacity_25", "25 Gb") },
                  { id: 50, label: t("capacity_50", "50 Gb") },
                  { id: 100, label: t("capacity_100", "100 Gb") }
                ]}
              />
            }
          />
          <UniversalCard
            title={t("engine_agency", "Emergency Backup Level")}
            subtitle={t("engine_agency_desc", "Permission level for the engine to autonomously execute maintenance protocols.")}
            icon="memory"
            footer={
              <CustomSettingsDropdown
                value={config.engine_agency_level ?? 0}
                onChange={(val: any) => updateConfig('engine_agency_level', val)}
                options={[
                  { id: 0, label: t("agency_none", "None (Passive Monitoring)") },
                  { id: 1, label: t("agency_basic", "Basic (Alerts Only)") },
                  { id: 2, label: t("agency_adv", "Advanced (Auto-Intercept)") }
                ]}
              />
            }
          />
          <UniversalCard
            title={t("defcon_target", "Emergency Backup Target")}
            subtitle={t("defcon_target_desc", "Where to route critical backups when Defcon protocols are initiated.")}
            icon="security"
            footer={
              <CustomSettingsDropdown
                value={config.defcon_backup_target ?? 0}
                onChange={(val: any) => updateConfig('defcon_backup_target', val)}
                options={[
                  { id: 0, label: t("target_both", "Both (Recommended)") },
                  { id: 1, label: t("target_world", "Save Files Only") },
                  { id: 2, label: t("target_engine", "Game Files Only") }
                ]}
              />
            }
          />
          <UniversalCard
            title={t("engine_retention", "Game Files Retention Policy")}
            subtitle={t("engine_retention_desc", "How long core engine metrics and cache are retained locally.")}
            icon="storage"
            footer={
              <CustomSettingsDropdown
                value={config.engine_retention_cycles ?? 5}
                onChange={(val: any) => updateConfig('engine_retention_cycles', val)}
                options={[
                  { id: 1, label: t("keep_1", "Keep Last 1") },
                  { id: 3, label: t("keep_3", "Keep Last 3") },
                  { id: 5, label: t("keep_5", "Keep Last 5 (Default)") },
                  { id: 10, label: t("keep_10", "Keep Last 10") },
                  { id: 999, label: t("keep_all", "Never Auto-Purge") }
                ]}
              />
            }
          />
          <UniversalCard
            title={t("world_retention", "Save Files Retention Policy")}
            subtitle={t("world_retention_desc", "How long to retain the planetary state coordinates and local overrides.")}
            icon="public"
            footer={
              <CustomSettingsDropdown
                value={config.world_retention_cycles ?? 5}
                onChange={(val: any) => updateConfig('world_retention_cycles', val)}
                options={[
                  { id: 1, label: t("keep_1", "Keep Last 1") },
                  { id: 3, label: t("keep_3", "Keep Last 3") },
                  { id: 5, label: t("keep_5", "Keep Last 5 (Default)") },
                  { id: 10, label: t("keep_10", "Keep Last 10") },
                  { id: 999, label: t("keep_all", "Never Auto-Purge") }
                ]}
              />
            }
          />
        </SettingsGrid>
      </TabContainer>
    </div>
  );
}
