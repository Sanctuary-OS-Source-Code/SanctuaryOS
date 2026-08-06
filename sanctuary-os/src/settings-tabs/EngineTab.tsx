import { useLexicon } from '../LexiconContext';
import { TabContainer, CustomSettingsDropdown, SettingsGrid, SettingCard } from './shared';

export default function EngineTab({ config, updateConfig }: any) {
  const { t } = useLexicon();

  return (
    <div className="flex flex-col gap-30 w-full pb-48">
      <TabContainer
        title={t("lineage_version_history")}
        icon="history"
      >
        <SettingsGrid>
          <SettingCard title={t("timeline_copies")} description={t("timeline_copies_desc")} icon="content_copy">
            <CustomSettingsDropdown
              value={config.timeline_retention_copies || 50}
              onChange={(val: any) => updateConfig('timeline_retention_copies', val)}
              options={[
                { id: 10, label: t("timeline_10") },
                { id: 50, label: t("timeline_50") },
                { id: 100, label: t("timeline_100") },
                { id: 500, label: t("timeline_500") }
              ]}
            />
          </SettingCard>
          <SettingCard title={t("timeline_size")} description={t("timeline_size_desc")} icon="hard_drive">
            <CustomSettingsDropdown
              value={config.timeline_retention_size_mb || 100}
              onChange={(val: any) => updateConfig('timeline_retention_size_mb', val)}
              options={[
                { id: 50, label: t("timeline_size_50") },
                { id: 100, label: t("timeline_size_100") },
                { id: 500, label: t("timeline_size_500") },
                { id: 1024, label: t("timeline_size_1024") }
              ]}
            />
          </SettingCard>
        </SettingsGrid>
      </TabContainer>

      <TabContainer
        title={t("backups_title")}
        icon="history"
      >
        <SettingsGrid>
          <SettingCard title={t("vault_capacity")} description={t("vault_capacity_desc")} icon="inventory_2">
            <CustomSettingsDropdown
              value={config.vault_capacity_gb || 0}
              onChange={(val: any) => updateConfig('vault_capacity_gb', val)}
              options={[
                { id: 0, label: t("capacity_unlimited") },
                { id: 10, label: t("capacity_10") },
                { id: 25, label: t("capacity_25") },
                { id: 50, label: t("capacity_50") },
                { id: 100, label: t("capacity_100") }
              ]}
            />
          </SettingCard>
          <SettingCard title={t("engine_agency")} description={t("engine_agency_desc")} icon="memory">
            <CustomSettingsDropdown
              value={config.engine_agency_level || 0}
              onChange={(val: any) => updateConfig('engine_agency_level', val)}
              options={[
                { id: 0, label: t("agency_none") },
                { id: 1, label: t("agency_basic") },
                { id: 2, label: t("agency_adv") }
              ]}
            />
          </SettingCard>
          <SettingCard title={t("defcon_target")} description={t("defcon_target_desc")} icon="security">
            <CustomSettingsDropdown
              value={config.defcon_backup_target || 0}
              onChange={(val: any) => updateConfig('defcon_backup_target', val)}
              options={[
                { id: 0, label: t("target_both") },
                { id: 1, label: t("target_world") },
                { id: 2, label: t("target_engine") }
              ]}
            />
          </SettingCard>
          <SettingCard title={t("engine_retention")} description={t("engine_retention_desc")} icon="storage">
            <CustomSettingsDropdown
              value={config.engine_retention_cycles || 5}
              onChange={(val: any) => updateConfig('engine_retention_cycles', val)}
              options={[
                { id: 1, label: t("keep_1") },
                { id: 3, label: t("keep_3") },
                { id: 5, label: t("keep_5") },
                { id: 10, label: t("keep_10") },
                { id: 999, label: t("keep_all") }
              ]}
            />
          </SettingCard>
          <SettingCard title={t("world_retention")} description={t("world_retention_desc")} icon="public">
            <CustomSettingsDropdown
              value={config.world_retention_cycles || 5}
              onChange={(val: any) => updateConfig('world_retention_cycles', val)}
              options={[
                { id: 1, label: t("keep_1") },
                { id: 3, label: t("keep_3") },
                { id: 5, label: t("keep_5") },
                { id: 10, label: t("keep_10") },
                { id: 999, label: t("keep_all") }
              ]}
            />
          </SettingCard>
        </SettingsGrid>
      </TabContainer>
    </div>
  );
}
