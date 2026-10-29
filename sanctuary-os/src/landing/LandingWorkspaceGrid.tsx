import React from 'react';
import { useLexicon } from '../LexiconContext';
import { isDesktop } from '../utils/envUtils';
import { EmptyState, HoverTooltip } from '../shared';
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
}: LandingWorkspaceGridProps) {
  const { t } = useLexicon();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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

            return (
              <div
                key={game.id || game.schema_id}
                role="button"
                tabIndex={0}
                onClick={() => onNavigateToGame(game.schema_id || game.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigateToGame(game.schema_id || game.id);
                  }
                }}
                className={`relative glass-panel p-5 rounded-2xl flex flex-col gap-3.5 border text-left group cursor-pointer transition-all duration-300 hover:-translate-y-0.5 ${
                  isActive
                    ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_65%,transparent)]'
                    : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                }`}
              >
                {/* Top Row: Icon Box on Left + Status Badge & Pin Button on Right */}
                <div className="flex justify-between items-start gap-3 relative z-10">
                  <div
                    className={`w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors duration-300 ${
                      isActive
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--subtext)] group-hover:text-[var(--accent)]'
                    }`}
                  >
                    {game.icon ? (
                      <img
                        src={game.icon}
                        alt=""
                        className="w-6 h-6 object-contain drop-shadow-sm"
                      />
                    ) : (
                      <span className="material-symbols-outlined !text-[22px]">
                        {t('icon_sports_esports', 'sports_esports')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t('icon_check_circle', 'check_circle')}
                        </span>
                        <span>{t('active', 'Active')}</span>
                      </span>
                    ) : isWorkspaceConfigured ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                          {t('icon_check_circle', 'check_circle')}
                        </span>
                        <span>
                          {t('workspace_badge_configured', 'Configured')}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                          {t('icon_pending', 'pending')}
                        </span>
                        <span>
                          {t('workspace_badge_not_setup', 'Not Setup')}
                        </span>
                      </span>
                    )}

                    {onTogglePin && (
                      <button
                        type="button"
                        onClick={(e) => onTogglePin(game, e)}
                        className={`w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all relative group/pin cursor-pointer ${
                          isPinned
                            ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]'
                            : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] opacity-75 hover:opacity-100 hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:text-[var(--accent)]'
                        }`}
                      >
                        <span
                          className="material-symbols-outlined !text-[15px]"
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
                </div>

                {/* Middle Block: Overline + Prominent Title + Concise Description */}
                <div className="flex flex-col gap-1 relative z-10 mt-0.5">
                  <span
                    className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                      isActive
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--subtext)] opacity-75'
                    }`}
                  >
                    {t('workspace_card_overline', 'Game Workspace')}
                  </span>
                  <h3 className="text-lg font-black text-[var(--text)] tracking-tight leading-snug group-hover:text-[var(--accent)] transition-colors duration-300 truncate m-0">
                    {game.name}
                  </h3>
                  <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed m-0">
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
                </div>

                {/* Bottom Footer Row: Schema Code + Action Label */}
                <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                    {game.schema_id}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shrink-0 text-[var(--text)] opacity-80 group-hover:text-[var(--accent)] group-hover:opacity-100 transition-colors duration-300">
                    <span>
                      {isActive
                        ? t('workspace_btn_enter', 'Enter Workspace')
                        : t('launch', 'Launch')}
                    </span>
                    <span className="material-symbols-outlined !text-[14px]">
                      {t('icon_arrow_forward', 'arrow_forward')}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
