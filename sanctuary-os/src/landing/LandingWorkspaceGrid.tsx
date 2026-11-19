import React from 'react';
import { useLexicon } from '../LexiconContext';
import { isDesktop } from '../utils/envUtils';
import { EmptyState, HoverTooltip, VAULT_CHIP_CLASS } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import {
  isWorkspacePinned,
  isWorkspaceSetupConfigured,
} from '../utils/workspacePrefs';

interface LandingWorkspaceGridProps {
  list: any[];
  loading: boolean;
  activeWorkspaceId?: string;
  workspaces?: any[];
  pinnedIds?: string[];
  onTogglePin?: (game: any, e: React.MouseEvent) => void;
  onNavigateToGame: (gameId: string) => void;
  emptyIcon?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  gridClassName?: string;
}

export function LandingWorkspaceGrid({
  list,
  loading,
  activeWorkspaceId,
  workspaces,
  pinnedIds = [],
  onTogglePin,
  onNavigateToGame,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  gridClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full',
}: LandingWorkspaceGridProps) {
  const { t } = useLexicon();

  return (
    <div className={gridClassName}>
      {loading ? (
        <EmptyState
          icon={t('icon_sync', 'sync')}
          title={t('workspace_loading', 'Loading Workspaces...')}
          className="col-span-full py-12 animate-pulse"
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={emptyIcon || t('icon_search', 'search')}
          title={emptyTitle || t('no_matches', 'No Matches Found')}
          subtitle={emptySubtitle}
          className="col-span-full py-10"
        />
      ) : (
        <>
          {list.map((game) => {
            const isActive =
              isDesktop() &&
              String(game.schema_id || '').toLowerCase() ===
                String(activeWorkspaceId || '').toLowerCase();
            const isWorkspaceConfigured = isWorkspaceSetupConfigured(
              game,
              workspaces,
              activeWorkspaceId
            );
            const isPinned = isWorkspacePinned(game, pinnedIds);
            const statusText = isActive
              ? t('active', 'Active')
              : isWorkspaceConfigured
                ? t('workspace_badge_configured', 'Configured')
                : t('workspace_badge_not_setup', 'Not Setup');
            const statusIcon = isActive || isWorkspaceConfigured
              ? t('icon_check_circle', 'check_circle')
              : t('icon_pending', 'pending');
            const statusIconColor = isActive
              ? 'text-[var(--accent)]'
              : isWorkspaceConfigured
                ? 'text-[var(--success)]'
                : 'text-[var(--subtext)]';
            const schemaCode = String(game.schema_id || '').toUpperCase();

            return (
              <UniversalCard
                key={game.id || game.schema_id}
                layout="vertical"
                isActive={isActive}
                statusColor={isActive ? 'success' : undefined}
                icon={t('icon_sports_esports', 'sports_esports')}
                bannerTopLabel={t('workspace_card_overline', 'Game Workspace')}
                bannerTopRightLabel={schemaCode || undefined}
                bannerBottomLabel={`${game.name} • ${statusText}`}
                title={game.name}
                subtitle={
                  <span className="text-[10px] font-mono tracking-widest uppercase">
                    {schemaCode}
                  </span>
                }
                onClick={() => onNavigateToGame(game.schema_id || game.id)}
                className="w-full h-full"
                imageOverlay={
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-30">
                    <span className={`${VAULT_CHIP_CLASS} pointer-events-none`}>
                      <span className={`material-symbols-outlined !text-[12px] ${statusIconColor}`}>
                        {statusIcon}
                      </span>
                      <span>{statusText}</span>
                    </span>

                    {onTogglePin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(game, e);
                        }}
                        className="h-6 w-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center transition-all relative group/pin cursor-pointer pointer-events-auto"
                      >
                        <span
                          className={`material-symbols-outlined !text-[13px] transition-colors ${
                            isPinned
                              ? 'text-[var(--accent)] opacity-90 group-hover/pin:opacity-100'
                              : 'text-[var(--subtext)] opacity-55 group-hover/pin:opacity-100 group-hover/pin:text-[var(--text)]'
                          }`}
                          style={{
                            fontVariationSettings: isPinned
                              ? '"FILL" 1'
                              : '"FILL" 0',
                          }}
                        >
                          {t('icon_keep', 'keep')}
                        </span>
                        <HoverTooltip
                          title={
                            isPinned
                              ? t('workspace_btn_unpin', 'Unpin Workspace')
                              : t('workspace_btn_pin', 'Pin Workspace')
                          }
                        />
                      </button>
                    )}
                  </div>
                }
                footer={
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5 truncate">
                      <span className="material-symbols-outlined !text-[12px]">
                        {t('icon_sports_esports', 'sports_esports')}
                      </span>
                      <span className="truncate font-mono">{schemaCode}</span>
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      <span>
                        {isActive
                          ? t('workspace_btn_enter', 'Enter Workspace')
                          : t('launch', 'Launch')}
                      </span>
                      <span className="material-symbols-outlined !text-sm">
                        {t('icon_arrow_forward', 'arrow_forward')}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
                  {isActive
                    ? t(
                        'workspace_card_desc_active',
                        'Currently active environment for {mod} deployment, diagnostics, and backups.'
                      )
                    : t(
                        'workspace_card_desc_available',
                        'Select to mount this game workspace and load its {vault}, {blueprints}, and tools.'
                      )}
                </p>
              </UniversalCard>
            );
          })}
        </>
      )}
    </div>
  );
}
