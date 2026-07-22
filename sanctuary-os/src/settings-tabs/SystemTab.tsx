import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { TabContainer, CustomSettingsDropdown } from './shared';

export default function SystemTab({ config, updateConfig, pickPath, pathMap }: any) {
  const { t } = useLexicon();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-30 w-full pb-48">
      <TabContainer
        title={t("sys_coords")}
        icon="push_pin"
        actions={
          <button onClick={async () => {
            try {
              const detected: any = await invoke("auto_detect_paths");
              updateConfig("live_path", detected.live_path);
              updateConfig("mods_path", detected.mods_path);
              updateConfig("vault_path", detected.vault_path);
              useStore.getState().pushStatus(t("settings_auto_detect_success"));
            } catch (err) {
              useStore.getState().pushStatus(t("settings_auto_detect_fail"), 'error');
            }
          }} className="px-6 py-3 rounded-2xl theme-glass-inner text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-white/10 backdrop-blur-xl flex items-center gap-3 hover:bg-white/5">
            <span className="material-symbols-outlined !text-lg text-[var(--accent)] drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("icon_troubleshoot")}</span>
            {t("auto_detect")}
          </button>
        }
      >
        <div className="grid gap-8">
          {pathMap.map((dir: any) => {
            const isHovered = hoveredKey === dir.rustKey;
            return (
              <div key={dir.rustKey} className="group relative" onMouseEnter={() => setHoveredKey(dir.rustKey)} onMouseLeave={() => setHoveredKey(null)}>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-2 text-[var(--subtext)] opacity-70 transition-colors group-hover:theme-text-accent">{dir.label}</label>
                <div onClick={() => pickPath(dir.rustKey, dir.label)} className="relative flex items-center cursor-pointer group/input hover:scale-[1.01] transition-transform">
                  <input
                    readOnly value={dir.value || ""}
                    style={{ paddingLeft: isHovered ? '4.5rem' : '1.5rem' }}
                    className={`w-full py-6 pr-32 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] shadow-inner transition-all duration-500 pointer-events-none outline-none backdrop-blur-xl group-hover/input:border-[color-mix(in_srgb,var(--text)_20%,transparent)] ${isHovered ? 'theme-border-accent theme-glass-inner' : 'theme-glass-inner'}`}
                    placeholder={t("path_not_set")}
                  />
                  <div className="absolute right-3 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-300 theme-glass-inner border border-white/20 hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg hover:theme-border-accent bg-black/40 text-[var(--text)]">
                    <span className="material-symbols-outlined !text-sm text-[var(--accent)]">{t("icon_sync")}</span>
                    {t("btn_calibrate")}
                  </div>
                  <div className="absolute left-[-2.5rem] text-xl opacity-0 group-hover:opacity-100 group-hover:left-6 transition-all duration-500 text-[var(--text)]"><span className="material-symbols-outlined">{dir.icon}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </TabContainer>

      <TabContainer
        title={t("lineage_version_history")}
        icon="history"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full">

          <div className="group">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">
              {t("timeline_copies")}
            </label>
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
          </div>

          <div className="group">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">
              {t("timeline_size")}
            </label>
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
          </div>

        </div>

      </TabContainer>
      <TabContainer
        title={t("backups_title")}
        icon="history"
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="flex flex-col gap-8">
            <div className="group">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("engine_agency")}</label>
              <CustomSettingsDropdown
                value={config.engine_agency_level || 0}
                onChange={(val: any) => updateConfig('engine_agency_level', val)}
                options={[
                  { id: 0, label: t("agency_none") },
                  { id: 1, label: t("agency_basic") },
                  { id: 2, label: t("agency_adv") }
                ]}
              />
            </div>
            <div className="group">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("engine_retention")}</label>
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
            </div>
            <div className="group">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("vault_capacity")}</label>
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
            </div>
          </div>
          <div className="flex flex-col gap-8">
            <div className="group">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("defcon_target")}</label>
              <CustomSettingsDropdown
                value={config.defcon_backup_target || 0}
                onChange={(val: any) => updateConfig('defcon_backup_target', val)}
                options={[
                  { id: 0, label: t("target_both") },
                  { id: 1, label: t("target_world") },
                  { id: 2, label: t("target_engine") }
                ]}
              />
            </div>
            <div className="group">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 ml-4 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("world_retention")}</label>
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
            </div>
          </div>
        </div>
      </TabContainer>
    </div>
  );
}
