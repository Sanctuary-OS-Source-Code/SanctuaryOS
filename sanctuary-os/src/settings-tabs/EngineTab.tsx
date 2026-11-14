import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { ActionButton, VAULT_CHIP_CLASS } from '../shared';
import { isDesktop } from '../utils/envUtils';
import { TabContainer, CustomSettingsDropdown, SettingsGrid, SettingsToggle } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { LiquidGlassAlertCard } from '../components/BlueprintPatchReadiness';

const obfuscatePath = (p: string, unsetLabel: string) =>
  p && p !== 'web'
    ? p
        .replace(/([A-Za-z]:\\[Uu]sers\\[^\\]+)/, (_match, p1) => {
          const parts = p1.split('\\');
          parts[2] = '***';
          return parts.join('\\');
        })
        .replace(/^(\/(?:home|Users)\/)[^/]+/, '$1***')
    : unsetLabel;

export default function EngineTab({
  config,
  pickPath,
  updateConfig,
  gamePathMap,
  activeSpokeName,
}: any) {
  const { t } = useLexicon();
  const isDefconDisabled = Number(config?.engine_agency_level ?? 2) === 0;
  const capacityGb = Number(config?.vault_capacity_gb ?? 0);

  const [postLaunchAction, setPostLaunchAction] = useState<string>(() => {
    return localStorage.getItem('sanctuary_post_launch_action') || 'keep_open';
  });
  const [autoPurgeCachesOnLaunch, setAutoPurgeCachesOnLaunch] = useState<boolean>(() => {
    return localStorage.getItem('sanctuary_auto_purge_caches_on_launch') !== 'false';
  });
  const [detectingPaths, setDetectingPaths] = useState(false);

  const handlePostLaunchActionChange = (val: string) => {
    const clean = val === 'minimize' || val === 'close' ? val : 'keep_open';
    setPostLaunchAction(clean);
    localStorage.setItem('sanctuary_post_launch_action', clean);
  };

  const handleToggleAutoPurgeCaches = () => {
    const next = !autoPurgeCachesOnLaunch;
    setAutoPurgeCachesOnLaunch(next);
    localStorage.setItem('sanctuary_auto_purge_caches_on_launch', String(next));
  };

  // Strictly detects ONLY game-specific paths from the active GameSchema — NEVER modifies Master Vault Path
  const handleAutoDetectGamePaths = async () => {
    if (detectingPaths) return;
    setDetectingPaths(true);
    try {
      const activeGameSchema = useStore.getState().activeGameSchema;
      const detected: any = await invoke('auto_detect_paths', { gameSchema: activeGameSchema });
      const patch: Record<string, string> = {};
      if (detected?.live_path) patch.live_path = detected.live_path;
      if (detected?.mods_path) patch.mods_path = detected.mods_path;
      if (detected?.docs_path || detected?.user_data_path) {
        patch.docs_path = detected.docs_path || detected.user_data_path;
      }
      if (Object.keys(patch).length > 0) {
        await updateConfig(patch);
        useStore.getState().pushStatus(
          t('settings_auto_detect_success', 'Paths Auto-Detected Successfully!'),
          'success'
        );
      } else {
        useStore.getState().pushStatus(
          t('settings_auto_detect_fail', 'Failed to auto-detect paths.'),
          'warning'
        );
      }
    } catch {
      useStore.getState().pushStatus(
        t('settings_auto_detect_fail', 'Failed to auto-detect paths.'),
        'error'
      );
    } finally {
      setDetectingPaths(false);
    }
  };

  const unsetLabel = t('path_not_set', 'Not Set');
  const safeGamePaths = Array.isArray(gamePathMap) ? gamePathMap : [];
  const missingGamePathsCount = safeGamePaths.filter(
    (dir: any) => !dir?.value || !String(dir.value).trim() || dir.value === 'web'
  ).length;

  const postLaunchBadgeLabel =
    postLaunchAction === 'minimize'
      ? t('settings_post_launch_minimize_short', 'Minimize')
      : postLaunchAction === 'close'
        ? t('close', 'Close')
        : t('settings_post_launch_keep_short', 'Stay Open');

  return (
    <div className="flex flex-col gap-12 w-full pb-32">
      {/* SECTION 1: Active Game Workspace Paths (Game-Only Auto Detect) */}
      {isDesktop() && safeGamePaths.length > 0 && (
        <TabContainer
          title={
            activeSpokeName
              ? `${activeSpokeName} • ${t('settings_game_paths_section', 'Game Paths')}`
              : t('settings_game_paths_section', 'Game Paths')
          }
          icon={t('icon_folder_managed', 'folder_managed')}
        >
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={missingGamePathsCount > 0}
              icon={
                missingGamePathsCount > 0
                  ? t('icon_folder_off', 'folder_off')
                  : t('icon_sports_esports', 'sports_esports')
              }
              accentVar={missingGamePathsCount > 0 ? 'var(--warning)' : 'var(--accent)'}
              iconColorClass={
                missingGamePathsCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'
              }
              badgeIcon={
                missingGamePathsCount > 0
                  ? t('icon_warning', 'warning')
                  : t('icon_check_circle', 'check_circle')
              }
              badgeLabel={
                missingGamePathsCount > 0
                  ? `${missingGamePathsCount} ${unsetLabel}`
                  : t('workspace_badge_configured', 'Configured')
              }
              overline={activeSpokeName || t('scope_workspace', 'Workspace Scope')}
              title={
                missingGamePathsCount > 0
                  ? t('settings_coords_missing_title', 'Workspace Paths Incomplete')
                  : t('settings_game_paths_ready_title', 'Game Executable, {Mods} & Saves Linked')
              }
              description={t(
                'settings_game_paths_guide_desc',
                'These folders bind strictly to the active game workspace so Quick Launch, {Blueprint} deployment, and {Backups} target the right installation. Auto Detect scans schema locations for this game without altering your OS-wide Master {Vault} Path.'
              )}
              actionLabel={t('auto_detect', 'Auto Detect')}
              actionIcon={t('icon_troubleshoot', 'troubleshoot')}
              actionVariant={missingGamePathsCount > 0 ? 'warning' : 'glass'}
              onAction={handleAutoDetectGamePaths}
            />

            {safeGamePaths.map((dir: any) => {
              const isUnset = !dir.value || !String(dir.value).trim() || dir.value === 'web';
              return (
                <UniversalCard
                  key={dir.rustKey}
                  headerStyle="inline"
                  title={dir.label}
                  subtitle={dir.description}
                  statusColor={isUnset ? 'warning' : undefined}
                  icon={dir.icon || t('icon_folder', 'folder')}
                  actions={
                    <span className={VAULT_CHIP_CLASS}>
                      <span
                        className={`material-symbols-outlined !text-[12px] ${
                          isUnset ? 'text-[var(--warning)]' : 'text-[var(--accent)]'
                        }`}
                      >
                        {t('icon_workspaces', 'workspaces')}
                      </span>
                      <span className="truncate max-w-[140px]">
                        {activeSpokeName || t('scope_workspace', 'Workspace Scope')}
                      </span>
                    </span>
                  }
                  onClick={() => pickPath(dir.rustKey, dir.label)}
                  footer={
                    <ActionButton
                      variant="glass"
                      icon={t('icon_folder_open', 'folder_open')}
                      label={t('btn_calibrate', 'Select Folder')}
                      className="w-full justify-center pointer-events-none"
                    />
                  }
                >
                  <div
                    className={`px-3 py-2 rounded-lg glass-surface border font-mono text-[11px] break-all leading-snug ${
                      isUnset
                        ? 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]'
                        : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-90'
                    }`}
                  >
                    {obfuscatePath(dir.value, unsetLabel)}
                  </div>
                </UniversalCard>
              );
            })}
          </SettingsGrid>
        </TabContainer>
      )}

      {/* SECTION 2: Quick Launch Behavior */}
      {isDesktop() && (
        <TabContainer
          title={t('settings_quick_launch_section', 'Quick Launch')}
          icon={t('icon_rocket_launch', 'rocket_launch')}
        >
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={false}
              icon={t('icon_rocket_launch', 'rocket_launch')}
              accentVar="var(--accent)"
              iconColorClass="text-[var(--accent)]"
              badgeIcon={t('icon_check_circle', 'check_circle')}
              badgeLabel={postLaunchBadgeLabel}
              overline={t('settings_launch_guide_overline', 'Game Startup')}
              title={t('settings_launch_guide_title', 'Window & Cache Startup Behavior')}
              description={t(
                'settings_launch_guide_desc',
                'Control what happens to the Sanctuary OS window after Quick Launch starts your game and whether temporary game cache files are automatically cleared beforehand so newly equipped {mods} load cleanly.'
              )}
            />

            <UniversalCard
              headerStyle="inline"
              title={t('settings_post_launch_title', 'Post-Launch Window Behavior')}
              subtitle={t(
                'settings_post_launch_desc',
                'Choose whether Sanctuary OS stays open, minimizes to the taskbar, or closes automatically after Quick Launch starts your game.'
              )}
              icon={t('icon_rocket_launch', 'rocket_launch')}
              footer={
                <CustomSettingsDropdown
                  value={postLaunchAction}
                  onChange={handlePostLaunchActionChange}
                  options={[
                    {
                      id: 'keep_open',
                      label: t('settings_post_launch_keep', 'Stay Open (Default)'),
                    },
                    {
                      id: 'minimize',
                      label: t('settings_post_launch_minimize', 'Minimize Window on Launch'),
                    },
                    {
                      id: 'close',
                      label: t('settings_post_launch_close', 'Close Sanctuary OS on Launch'),
                    },
                  ]}
                />
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('settings_auto_purge_cache_title', 'Purge Stale Game Caches on Launch')}
              subtitle={t(
                'settings_auto_purge_cache_desc',
                'ON: Clears temporary game cache files before launching so updated {mods} load cleanly.\nOFF: Leaves existing game cache files untouched.'
              )}
              icon={t('icon_cleaning_services', 'cleaning_services')}
              isActive={autoPurgeCachesOnLaunch}
              onClick={handleToggleAutoPurgeCaches}
              actions={<SettingsToggle checked={autoPurgeCachesOnLaunch} />}
            />
          </SettingsGrid>
        </TabContainer>
      )}

      {/* SECTION 3: Backups / Time Capsule (Save & Game Engine Protection) */}
      {isDesktop() && (
        <TabContainer
          title={
            activeSpokeName
              ? `${activeSpokeName} • ${t('term_backups', 'Backups')}`
              : t('term_backups', 'Backups')
          }
          icon={t('icon_history', 'history')}
        >
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={isDefconDisabled}
              icon={
                isDefconDisabled
                  ? t('icon_shield_question', 'shield_question')
                  : t('icon_verified_user', 'verified_user')
              }
              accentVar={isDefconDisabled ? 'var(--warning)' : 'var(--accent)'}
              iconColorClass={
                isDefconDisabled ? 'text-[var(--warning)]' : 'text-[var(--accent)]'
              }
              badgeIcon={t('icon_inventory_2', 'inventory_2')}
              badgeLabel={
                capacityGb > 0
                  ? `${capacityGb} GB`
                  : t('capacity_unlimited', 'Unlimited')
              }
              overline={t('settings_backups_guide_overline', 'Copy-on-Write Protection')}
              title={
                isDefconDisabled
                  ? t('settings_backups_manual_title', 'Autonomous Patch Backups Disabled')
                  : t('settings_backups_armed_title', 'Zero-Bloat {Backups} & Patch Shield')
              }
              description={t(
                'settings_backups_guide_desc',
                '{Backups} seals Copy-on-Write / hardlinked snapshots of your Save Files and Game Engine binaries—only changed files consume new disk space. Storage limits and retention counts automatically prune older snapshots while always preserving your newest baseline.'
              )}
              actionLabel={
                isDefconDisabled
                  ? t('settings_enable_auto_backup', 'Enable Auto Backup')
                  : undefined
              }
              actionIcon={t('icon_bolt', 'bolt')}
              actionVariant="warning"
              onAction={
                isDefconDisabled
                  ? () => updateConfig('engine_agency_level', 2)
                  : undefined
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('vault_capacity', '{Backups} Limit')}
              subtitle={t(
                'vault_capacity_v2_desc',
                'Maximum physical delta storage allocated to {Backups} snapshots in this workspace before auto-pruning oldest backups.'
              )}
              icon={t('icon_inventory_2', 'inventory_2')}
              footer={
                <CustomSettingsDropdown
                  value={config?.vault_capacity_gb ?? 0}
                  onChange={(val: any) => updateConfig('vault_capacity_gb', val)}
                  options={[
                    { id: 0, label: t('capacity_unlimited', 'Unlimited') },
                    { id: 10, label: t('capacity_10_gb', '10 GB') },
                    { id: 25, label: t('capacity_25_gb', '25 GB') },
                    { id: 50, label: t('capacity_50_gb', '50 GB') },
                    { id: 100, label: t('capacity_100_gb', '100 GB') },
                  ]}
                />
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('engine_agency', 'Emergency Backup Level')}
              subtitle={t(
                'engine_agency_desc',
                'How Sanctuary OS responds on Desktop open or live DEFCON when a game patch is detected.'
              )}
              icon={t('icon_memory', 'memory')}
              statusColor={isDefconDisabled ? 'warning' : undefined}
              footer={
                <CustomSettingsDropdown
                  value={config?.engine_agency_level ?? 2}
                  onChange={(val: any) => updateConfig('engine_agency_level', val)}
                  options={[
                    { id: 2, label: t('agency_adv', 'Auto Backup (Recommended)') },
                    { id: 1, label: t('agency_basic', 'Alert Only') },
                    { id: 0, label: t('agency_none', 'Lone Wolf (No Alerts)') },
                  ]}
                />
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('defcon_target', 'Emergency Backup Target')}
              subtitle={t(
                'defcon_target_v2_desc',
                'Choose whether emergency pre-patch {Backups} seal your Save Files, Game Engine binaries, or both.'
              )}
              icon={t('icon_security', 'security')}
              footer={
                <CustomSettingsDropdown
                  value={config?.defcon_backup_target ?? 0}
                  onChange={(val: any) => updateConfig('defcon_backup_target', val)}
                  options={[
                    { id: 0, label: t('target_both', 'Both (Recommended)') },
                    { id: 1, label: t('target_world', 'Save Files Only') },
                    { id: 2, label: t('target_engine', 'Game Files Only') },
                  ]}
                />
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('engine_retention', 'Game Files Retention Policy')}
              subtitle={t(
                'engine_retention_v2_desc',
                'Number of Game Engine binary snapshots retained in {Backups} for version rollback before purging older builds.'
              )}
              icon={t('icon_storage', 'storage')}
              footer={
                <CustomSettingsDropdown
                  value={config?.engine_retention_cycles ?? 5}
                  onChange={(val: any) => updateConfig('engine_retention_cycles', val)}
                  options={[
                    { id: 1, label: t('keep_1', 'Keep Last 1') },
                    { id: 3, label: t('keep_3', 'Keep Last 3') },
                    { id: 5, label: t('keep_5', 'Keep Last 5 (Default)') },
                    { id: 10, label: t('keep_10', 'Keep Last 10') },
                    { id: 999, label: t('keep_all', 'Never Auto-Purge') },
                  ]}
                />
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('world_retention', 'Save Files Retention Policy')}
              subtitle={t(
                'world_retention_v2_desc',
                'Number of Save File & User Data snapshots retained in {Backups} before rotating the oldest snapshot.'
              )}
              icon={t('icon_public', 'public')}
              footer={
                <CustomSettingsDropdown
                  value={config?.world_retention_cycles ?? 5}
                  onChange={(val: any) => updateConfig('world_retention_cycles', val)}
                  options={[
                    { id: 1, label: t('keep_1', 'Keep Last 1') },
                    { id: 3, label: t('keep_3', 'Keep Last 3') },
                    { id: 5, label: t('keep_5', 'Keep Last 5 (Default)') },
                    { id: 10, label: t('keep_10', 'Keep Last 10') },
                    { id: 999, label: t('keep_all', 'Never Auto-Purge') },
                  ]}
                />
              }
            />
          </SettingsGrid>
        </TabContainer>
      )}
    </div>
  );
}
