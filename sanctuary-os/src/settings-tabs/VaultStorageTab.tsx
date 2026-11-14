import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { ActionButton, VAULT_CHIP_CLASS } from '../shared';
import { isDesktop } from '../utils/envUtils';
import { TabContainer, SettingsGrid, SettingsToggle, CustomSettingsDropdown } from './shared';
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

export default function VaultStorageTab({
  config,
  updateConfig,
  pickPath,
  masterVaultPath,
  anarchyRules,
  setAnarchyRules,
}: any) {
  const { t } = useLexicon();

  const [ingestFileMode, setIngestFileMode] = useState<'copy' | 'move'>(() => {
    const saved = localStorage.getItem('sanctuary_ingest_file_mode');
    if (saved === 'move' || saved === 'copy') return saved;
    if (config?.ingest_file_mode === 'move' || config?.ingest_file_mode === 'copy') {
      return config.ingest_file_mode;
    }
    return 'copy';
  });

  useEffect(() => {
    if (config?.ingest_file_mode && !localStorage.getItem('sanctuary_ingest_file_mode')) {
      const mode = config.ingest_file_mode === 'move' ? 'move' : 'copy';
      setIngestFileMode(mode);
      localStorage.setItem('sanctuary_ingest_file_mode', mode);
    }
  }, [config?.ingest_file_mode]);

  const handleIngestFileModeChange = (val: 'copy' | 'move') => {
    const mode = val === 'move' ? 'move' : 'copy';
    setIngestFileMode(mode);
    localStorage.setItem('sanctuary_ingest_file_mode', mode);
    if (typeof updateConfig === 'function') {
      updateConfig('ingest_file_mode', mode);
    }
  };

  const [liveVaultWatcherEnabled, setLiveVaultWatcherEnabled] = useState<boolean>(() => {
    return localStorage.getItem('sanctuary_live_vault_watcher_enabled') !== 'false';
  });

  const handleToggleLiveVaultWatcher = () => {
    const next = !liveVaultWatcherEnabled;
    setLiveVaultWatcherEnabled(next);
    localStorage.setItem('sanctuary_live_vault_watcher_enabled', String(next));
  };

  const [archiveModVersions, setArchiveModVersions] = useState<boolean>(() => {
    return localStorage.getItem('sanctuary_archive_mod_versions') !== 'false';
  });
  const [legacyVersionCount, setLegacyVersionCount] = useState<number>(0);

  useEffect(() => {
    if (!isDesktop()) return;
    const vaultPath = config?.vault_path || useStore.getState().vaultPath;
    if (!vaultPath || vaultPath === 'web') return;
    invoke('get_mod_version_pool_status', { vaultPath })
      .then((res: any) => {
        if (res && typeof res.enabled === 'boolean') {
          setArchiveModVersions(res.enabled);
          setLegacyVersionCount(Number(res.older_versions) || 0);
          localStorage.setItem('sanctuary_archive_mod_versions', res.enabled ? 'true' : 'false');
        }
      })
      .catch(() => {});
  }, [config?.vault_path]);

  const handleToggleArchiveModVersions = async () => {
    const nextVal = !archiveModVersions;
    setArchiveModVersions(nextVal);
    localStorage.setItem('sanctuary_archive_mod_versions', nextVal ? 'true' : 'false');
    if (isDesktop()) {
      const vaultPath = config?.vault_path || useStore.getState().vaultPath;
      if (vaultPath && vaultPath !== 'web') {
        try {
          await invoke('set_mod_version_archiving_enabled', {
            vaultPath,
            enabled: nextVal,
          });
          const res: any = await invoke('get_mod_version_pool_status', { vaultPath });
          if (res) {
            setLegacyVersionCount(Number(res.older_versions) || 0);
          }
        } catch {}
      }
    }
  };

  const handlePurgeLegacyFromSettings = async (e: any) => {
    e.stopPropagation();
    if (!isDesktop()) return;
    const vaultPath = config?.vault_path || useStore.getState().vaultPath;
    if (!vaultPath || vaultPath === 'web') return;
    try {
      await invoke('prune_archived_mod_versions', {
        vaultPath,
        keepActiveOnly: true,
      });
      setLegacyVersionCount(0);
      useStore.getState().pushStatus(t('version_pool_prune_older', 'Purge Legacy Versions'));
    } catch {}
  };

  const [confirmResetOverrides, setConfirmResetOverrides] = useState(false);
  const resetArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetArmTimerRef.current) clearTimeout(resetArmTimerRef.current);
    };
  }, []);

  const handleResetAllLocalOverrides = () => {
    if (!confirmResetOverrides) {
      setConfirmResetOverrides(true);
      if (resetArmTimerRef.current) clearTimeout(resetArmTimerRef.current);
      resetArmTimerRef.current = setTimeout(() => {
        setConfirmResetOverrides(false);
      }, 4500);
      return;
    }
    if (resetArmTimerRef.current) clearTimeout(resetArmTimerRef.current);
    setConfirmResetOverrides(false);
    localStorage.removeItem('sanctuary_local_overrides');
    localStorage.removeItem('sanctuary_edge_logic');
    const state = useStore.getState();
    if (Array.isArray(state.modList) && state.modList.length > 0) {
      state.setModList(
        state.modList.map((m: any) =>
          m?.isLocalOverride ? { ...m, isLocalOverride: false } : m
        )
      );
    }
    window.dispatchEvent(new CustomEvent('sanctuary_reset_all_local_overrides'));
    state.pushStatus(
      t('local_overrides_cleared', 'All local metadata overrides have been cleared.')
    );
  };

  const rules = {
    highlander: anarchyRules?.highlander !== false,
    family: anarchyRules?.family !== false,
    dependencies: anarchyRules?.dependencies !== false,
    intercept: anarchyRules?.intercept !== false,
  };

  const activeSafeguardCount = [
    rules.highlander,
    rules.family,
    rules.dependencies,
    rules.intercept,
  ].filter(Boolean).length;
  const hasBypassedRule = activeSafeguardCount < 4;

  const toggleRule = (key: keyof typeof rules) => {
    if (setAnarchyRules) {
      setAnarchyRules({ ...rules, [key]: !rules[key] });
    }
  };

  const restoreAllSafeguards = () => {
    if (setAnarchyRules) {
      setAnarchyRules({
        highlander: true,
        family: true,
        dependencies: true,
        intercept: true,
      });
    }
  };

  const unsetLabel = t('path_not_set', 'Not Set');
  const isVaultUnset = !masterVaultPath || !String(masterVaultPath).trim() || masterVaultPath === 'web';
  const vaultLabel = t('vault_path', 'The {Vault} Path');

  return (
    <div className="flex flex-col gap-12 w-full pb-32">
      {/* SECTION 1: OS-Wide Vault Storage, File Intake & Mod Version Pool */}
      <TabContainer
        title={t('settings_vault_storage_intake_section', '{Vault} Storage & Intake')}
        icon={t('icon_account_balance', 'account_balance')}
      >
        <SettingsGrid>
          <LiquidGlassAlertCard
            isAlertCard={isVaultUnset}
            icon={
              isVaultUnset
                ? t('icon_folder_off', 'folder_off')
                : t('icon_inventory_2', 'inventory_2')
            }
            accentVar={isVaultUnset ? 'var(--warning)' : 'var(--accent)'}
            iconColorClass={isVaultUnset ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}
            badgeIcon={
              isVaultUnset
                ? t('icon_warning', 'warning')
                : t('icon_public', 'public')
            }
            badgeLabel={
              isVaultUnset
                ? unsetLabel
                : t('os_label', 'Core OS')
            }
            overline={t('settings_vault_root_overline', 'OS-Wide Storage Root')}
            title={
              isVaultUnset
                ? t('settings_vault_unset_title', 'Choose Your Master {Vault} Directory')
                : t('settings_vault_intake_guide_title', 'Master {Vault}, Intake & Rollbacks')
            }
            description={t(
              'settings_vault_root_clean_desc',
              'Unlike individual game folders, the Master {Vault} Path governs the entire Sanctuary OS—storing shared {Chameleons} and {Lexicons} at the root while maintaining isolated {Mod} subfolders, file intake rules, and version rollbacks for every workspace.'
            )}
            actionLabel={isVaultUnset ? t('btn_calibrate', 'Select Folder') : undefined}
            actionIcon={t('icon_folder_open', 'folder_open')}
            actionVariant="warning"
            onAction={isVaultUnset ? () => pickPath('vault_path', vaultLabel) : undefined}
          />

          {isDesktop() && (
            <UniversalCard
              headerStyle="inline"
              title={vaultLabel}
              subtitle={t(
                'settings_path_vault_desc',
                'OS-wide storage root for all {Mods}, {Chameleons}, {Lexicons}, and {Backups} across every game workspace.'
              )}
              statusColor={isVaultUnset ? 'warning' : undefined}
              icon={t('icon_account_balance', 'account_balance')}
              actions={
                <span className={VAULT_CHIP_CLASS}>
                  <span
                    className={`material-symbols-outlined !text-[12px] ${
                      isVaultUnset ? 'text-[var(--warning)]' : 'text-[var(--accent)]'
                    }`}
                  >
                    {t('icon_public', 'public')}
                  </span>
                  <span>{t('os_label', 'Core OS')}</span>
                </span>
              }
              onClick={() => pickPath('vault_path', vaultLabel)}
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
                  isVaultUnset
                    ? 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]'
                    : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-90'
                }`}
              >
                {obfuscatePath(masterVaultPath, unsetLabel)}
              </div>
            </UniversalCard>
          )}

          <UniversalCard
            headerStyle="inline"
            title={t('settings_ingest_file_mode_title', 'Drag & Drop File Behavior')}
            subtitle={t(
              'settings_ingest_file_mode_desc',
              'Choose whether dragged and dropped {mod} files and archives are copied into your {Vault} or moved (automatically cleaning up the original source file after import).'
            )}
            icon={t('icon_drive_file_move', 'drive_file_move')}
            footer={
              <CustomSettingsDropdown
                value={ingestFileMode}
                onChange={(val: any) => handleIngestFileModeChange(val)}
                options={[
                  {
                    id: 'copy',
                    label: t('settings_ingest_mode_copy', 'Copy Original (Keep Source File)'),
                  },
                  {
                    id: 'move',
                    label: t('settings_ingest_mode_move', 'Move Original (Auto-Clean Source)'),
                  },
                ]}
              />
            }
          />

          {isDesktop() && (
            <UniversalCard
              headerStyle="inline"
              title={t('settings_live_watcher_title', 'Live {Vault} Filesystem Auto-Sweep')}
              subtitle={t(
                'settings_live_watcher_desc',
                'ON: Automatically refreshes your {Vault} and Conflict Radar when files change on disk.\nOFF: Scans only when opened or manually refreshed.'
              )}
              icon={t('icon_radar', 'radar')}
              isActive={liveVaultWatcherEnabled}
              onClick={handleToggleLiveVaultWatcher}
              actions={<SettingsToggle checked={liveVaultWatcherEnabled} />}
            />
          )}

          {isDesktop() && (
            <UniversalCard
              headerStyle="inline"
              title={t('version_pool_title', '{Mod} Version History')}
              subtitle={t(
                'version_pool_auto_archive_desc',
                'ON: Keeps multiple {mod} versions for rollback and auto-swapping.\nOFF: Keeps only one version per {mod}.'
              )}
              icon={t('icon_history', 'history')}
              isActive={archiveModVersions}
              onClick={handleToggleArchiveModVersions}
              actions={<SettingsToggle checked={archiveModVersions} />}
              footer={
                !archiveModVersions && legacyVersionCount > 0 ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]"
                  >
                    <span className="text-[11px] font-semibold text-[var(--text)] leading-snug">
                      {t(
                        'version_pool_disabled_legacy_warning',
                        'Version History System is disabled, but legacy versions are still stored. Purge legacy versions to keep only one version per {mod}.'
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={handlePurgeLegacyFromSettings}
                      className="px-3 py-1.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] hover:border-[var(--warning)] text-[var(--warning)] text-[11px] font-black tracking-wide shrink-0 cursor-pointer transition-all"
                    >
                      {t('version_pool_prune_older', 'Purge Legacy Versions')}
                    </button>
                  </div>
                ) : undefined
              }
            />
          )}

          <UniversalCard
            headerStyle="inline"
            title={t('btn_reset_all_local', 'Reset All Local Overrides')}
            subtitle={t(
              'reset_all_local_desc',
              'Permanently clear all locally saved metadata overrides for all {mods}.'
            )}
            icon={t('icon_delete_forever', 'delete_forever')}
            statusColor="danger"
            footer={
              <div className="flex items-center gap-2 w-full">
                {confirmResetOverrides && (
                  <ActionButton
                    variant="glass"
                    icon={t('icon_close', 'close')}
                    label={t('cancel', 'Cancel')}
                    onClick={() => setConfirmResetOverrides(false)}
                    className="flex-1 justify-center"
                  />
                )}
                <ActionButton
                  variant={confirmResetOverrides ? 'danger' : 'glass'}
                  icon={
                    confirmResetOverrides
                      ? t('icon_warning', 'warning')
                      : t('icon_delete_forever', 'delete_forever')
                  }
                  label={
                    confirmResetOverrides
                      ? t('confirm_purge', 'Confirm Purge')
                      : t('btn_reset_all_local', 'Reset All Local Overrides')
                  }
                  onClick={handleResetAllLocalOverrides}
                  className="flex-1 justify-center"
                />
              </div>
            }
          />
        </SettingsGrid>
      </TabContainer>

      {/* SECTION 2: Blueprint Safeguards (Sanctuary Lexicon: Atomic Logic) */}
      <TabContainer
        title={t('anarchy_title', '{Blueprint} Safeguards')}
        icon={t('icon_psychology', 'psychology')}
      >
        <SettingsGrid>
          <LiquidGlassAlertCard
            isAlertCard={hasBypassedRule}
            icon={
              hasBypassedRule
                ? t('icon_warning', 'warning')
                : t('icon_psychology', 'psychology')
            }
            accentVar={hasBypassedRule ? 'var(--warning)' : 'var(--accent)'}
            iconColorClass={hasBypassedRule ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}
            badgeIcon={
              hasBypassedRule
                ? t('icon_shield_question', 'shield_question')
                : t('icon_shield', 'shield')
            }
            badgeLabel={`${activeSafeguardCount}/4 ${t('active', 'Active')}`}
            overline={t('settings_bp_safeguards_overline', '{Blueprint} Load-Order Checks')}
            title={
              hasBypassedRule
                ? t('settings_logic_bypass_title', 'Safeguard Bypass Active')
                : t('settings_logic_armed_title', 'All {Blueprint} Safeguards Active')
            }
            description={t(
              'settings_bp_safeguards_clean_desc',
              'Automatic safety checks that run whenever you enable {mods} in your {Vault} or deploy a {Blueprint}. Keep all four on so multi-file {mods}, required frameworks, and exclusive replacements stay conflict-free.'
            )}
            actionLabel={
              hasBypassedRule
                ? t('settings_restore_safeguards', 'Restore All Safeguards')
                : undefined
            }
            actionIcon={t('icon_restart_alt', 'restart_alt')}
            actionVariant="warning"
            onAction={hasBypassedRule ? restoreAllSafeguards : undefined}
          />

          <UniversalCard
            headerStyle="inline"
            title={t('anarchy_highlander', 'Swap Exclusive {Mods}')}
            subtitle={t(
              'anarchy_highlander_desc',
              'ON: Prompts to swap when enabling two {mods} for the same single-slot feature.\nOFF: Allows equipping both without swap alerts.'
            )}
            icon={t('icon_sports_martial_arts', 'sports_martial_arts')}
            isActive={rules.highlander}
            statusColor={!rules.highlander ? 'danger' : undefined}
            onClick={() => toggleRule('highlander')}
            actions={<SettingsToggle checked={rules.highlander} danger={!rules.highlander} />}
          />

          <UniversalCard
            headerStyle="inline"
            title={t('anarchy_family', 'Keep Companion Files Paired')}
            subtitle={t(
              'anarchy_family_desc',
              "ON: Enables and disables a {mod}'s linked script and asset files together.\nOFF: Toggles individual files independently."
            )}
            icon={t('icon_family_restroom', 'family_restroom')}
            isActive={rules.family}
            statusColor={!rules.family ? 'danger' : undefined}
            onClick={() => toggleRule('family')}
            actions={<SettingsToggle checked={rules.family} danger={!rules.family} />}
          />

          <UniversalCard
            headerStyle="inline"
            title={t('anarchy_deps', 'Auto-Enable Required Dependencies')}
            subtitle={t(
              'anarchy_deps_desc',
              'ON: Automatically enables installed prerequisite {mods} and frameworks.\nOFF: Skips automatic dependency enabling.'
            )}
            icon={t('icon_account_tree', 'account_tree')}
            isActive={rules.dependencies}
            statusColor={!rules.dependencies ? 'danger' : undefined}
            onClick={() => toggleRule('dependencies')}
            actions={<SettingsToggle checked={rules.dependencies} danger={!rules.dependencies} />}
          />

          <UniversalCard
            headerStyle="inline"
            title={t('anarchy_intercept', 'Block Critical File Conflicts')}
            subtitle={t(
              'anarchy_intercept_desc',
              'ON: Warns and blocks deployment on confirmed game-breaking file collisions.\nOFF: Bypasses critical collision blocks.'
            )}
            icon={t('icon_gavel', 'gavel')}
            isActive={rules.intercept}
            statusColor={!rules.intercept ? 'danger' : undefined}
            onClick={() => toggleRule('intercept')}
            actions={<SettingsToggle checked={rules.intercept} danger={!rules.intercept} />}
          />
        </SettingsGrid>
      </TabContainer>

      {/* SECTION 4: Workbench Config Editor History (Dedicated Section — Separate from Time Capsule & Mod Versions) */}
      {isDesktop() && (
        <TabContainer
          title={t('settings_workbench_section', 'Workbench Config History')}
          icon={t('icon_construction', 'construction')}
        >
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={false}
              icon={t('icon_construction', 'construction')}
              accentVar="var(--accent)"
              iconColorClass="text-[var(--accent)]"
              badgeIcon={t('icon_history_edu', 'history_edu')}
              badgeLabel={`${config?.timeline_retention_copies ?? 50} • ${config?.timeline_retention_size_mb ?? 100} MB`}
              overline={t('settings_workbench_overline', 'Workbench Text & Config Editor')}
              title={t('settings_workbench_guide_title', 'Config File Undo Snapshots')}
              description={t(
                'settings_workbench_guide_desc',
                'Governs how many undo snapshots the Workbench editor keeps when you edit INI, JSON, or manifest config files. (Full game save and installation backups are configured separately in {Backups}.)'
              )}
            />

            <UniversalCard
              headerStyle="inline"
              title={t('settings_workbench_revisions_title', 'Workbench Revisions Per File')}
              subtitle={t(
                'timeline_copies_v2_desc',
                'Maximum number of Workbench file edit snapshots retained per configuration file before rotating the oldest revision.'
              )}
              icon={t('icon_content_copy', 'content_copy')}
              footer={
                <CustomSettingsDropdown
                  value={config?.timeline_retention_copies ?? 50}
                  onChange={(val: any) => updateConfig('timeline_retention_copies', val)}
                  options={[
                    { id: 10, label: t('timeline_10', 'Keep 10 Versions') },
                    { id: 50, label: t('timeline_50', 'Keep 50 Versions (Default)') },
                    { id: 100, label: t('timeline_100', 'Keep 100 Versions') },
                    { id: 500, label: t('timeline_500', 'Keep 500 Versions') },
                  ]}
                />
              }
            />

            <UniversalCard
              headerStyle="inline"
              title={t('settings_workbench_storage_title', 'Workbench History Storage Cap')}
              subtitle={t(
                'timeline_size_v2_desc',
                'Total {Vault} disk budget allocated to Workbench config revision history before pruning the oldest snapshots.'
              )}
              icon={t('icon_hard_drive', 'hard_drive')}
              footer={
                <CustomSettingsDropdown
                  value={config?.timeline_retention_size_mb ?? 100}
                  onChange={(val: any) => updateConfig('timeline_retention_size_mb', val)}
                  options={[
                    { id: 50, label: t('timeline_size_50', 'Storage cap: 50 MB') },
                    { id: 100, label: t('timeline_size_100', 'Storage cap: 100 MB (Default)') },
                    { id: 500, label: t('timeline_size_500', 'Storage cap: 500 MB') },
                    { id: 1024, label: t('timeline_size_1024', 'Storage cap: 1 GB') },
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
