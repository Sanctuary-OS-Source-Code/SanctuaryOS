import { useEffect } from 'react';
import { supabase } from './supabase';
import { useStore } from './store';
import { useLexicon } from './LexiconContext';
import { useTheme } from './ThemeContext';
import { invoke } from '@tauri-apps/api/core';
import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { compareVersions } from './shared';

export function NexusUpdatesChecker() {
  const setNexusUpdatesCount = useStore(state => state.setNexusUpdatesCount);
  const setNexusUpdateTabs = useStore(state => state.setNexusUpdateTabs);
  const { registry } = useLexicon();
  const { CORE_THEMES, customThemes } = useTheme();

  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const { data: assets, error } = await supabase
          .from('nexus_assets')
          .select('name, asset_type, version, json_data')
          .or('is_public.eq.true,is_public.is.null');
        if (error || !assets) return;

        let templatesMap: Record<string, string> = {};
        try {
          const config: any = await invoke('get_saved_coordinates');
          const vaultPath = config.vault_path;
          if (vaultPath) {
            const templatesDir = `${vaultPath}\\Data\\Templates`;
            if (await exists(templatesDir)) {
              const files = await readDir(templatesDir);
              for (const file of files) {
                if (file.name?.endsWith('.json')) {
                  try {
                    const content = await readTextFile(`${templatesDir}\\${file.name}`);
                    const parsed = JSON.parse(content);
                    const data = Array.isArray(parsed) ? parsed[0] : parsed;
                    if (data.name) {
                      const currentVersion = templatesMap[data.name] || '0.0.0';
                      const parsedVersion = data.template_version || data.version || '1.0.0';
                      if (compareVersions(parsedVersion, currentVersion) >= 0) {
                         templatesMap[data.name] = parsedVersion;
                      }
                    }
                  } catch {}
                }
              }
            }
          }
        } catch {}

        let updatesCount = 0;
        const updateTabs = new Set<string>();
        const allThemes = { ...CORE_THEMES, ...customThemes };

        for (const asset of assets) {
          let localVersion = null;
          let mappedTab = '';
          if (asset.asset_type === 'chameleon') {
            const theme = Object.values(allThemes).find((th: any) => th.name === asset.name) as any;
            if (theme) localVersion = theme.version || '1.0.0';
            mappedTab = 'CHAMELEONS';
          } else if (asset.asset_type === 'workbench_template') {
            localVersion = templatesMap[asset.name];
            mappedTab = 'TEMPLATES';
          } else if (asset.asset_type === 'lexicon') {
            const lex = registry?.[asset.name];
            if (lex) localVersion = lex._meta_version || '1.0.0';
            mappedTab = 'LEXICONS';
          }

          if (localVersion) {
            let assetDisplayVersion = asset.version || '1.0.0';
            if (asset.asset_type === 'workbench_template' && asset.json_data) {
              try {
                const parsedRaw = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
                if (parsed && parsed.template_version) {
                  assetDisplayVersion = parsed.template_version;
                }
              } catch (e) {}
            }

            if (compareVersions(assetDisplayVersion, localVersion) > 0) {
              updatesCount++;
              updateTabs.add(mappedTab);
            }
          }
        }

        setNexusUpdatesCount(updatesCount);
        setNexusUpdateTabs(Array.from(updateTabs));
      } catch (err) {
        console.error("Failed to check for Nexus updates", err);
      }
    };

    checkUpdates();
    const interval = setInterval(checkUpdates, 1000 * 60 * 60); // Check every hour
    return () => clearInterval(interval);
  }, [registry, CORE_THEMES, customThemes]);

  return null;
}
