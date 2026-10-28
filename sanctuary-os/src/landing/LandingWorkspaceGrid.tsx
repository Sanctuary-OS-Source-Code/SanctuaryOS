import { useLexicon } from '../LexiconContext';
import { isDesktop } from '../utils/envUtils';

interface LandingWorkspaceGridProps {
  list: any[];
  loading: boolean;
  activeWorkspaceId?: string;
  workspaces?: any[];
  onNavigateToGame: (gameId: string) => void;
}

export function LandingWorkspaceGrid({
  list,
  loading,
  activeWorkspaceId,
  workspaces,
  onNavigateToGame,
}: LandingWorkspaceGridProps) {
  const { t } = useLexicon();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {loading ? (
        <div className="col-span-full py-12 flex justify-center">
          <span className="material-symbols-outlined animate-spin text-4xl text-[var(--accent)] drop-shadow-[0_0_15px_var(--accent)]">
            {t('icon_autorenew', 'autorenew')}
          </span>
        </div>
      ) : (
        <>
          {list.map((game) => {
            const isActive =
              isDesktop() && game.schema_id === activeWorkspaceId;
            const matchingWs = (workspaces || []).find(
              (w: any) =>
                w.schema_id === game.schema_id || w.id === game.schema_id
            );
            const isWorkspaceConfigured = Boolean(
              matchingWs?.mods_path ||
                matchingWs?.live_path ||
                matchingWs?.vault_path ||
                isActive
            );

            return (
              <div
                key={game.id}
                role="button"
                tabIndex={0}
                onClick={() => onNavigateToGame(game.schema_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigateToGame(game.schema_id);
                  }
                }}
                className={`relative glass-panel p-5 rounded-2xl flex flex-col gap-3.5 border text-left group cursor-pointer transition-all duration-300 hover:-translate-y-0.5 ${
                  isActive
                    ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_65%,transparent)]'
                    : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                }`}
              >
                {/* Top Row: Icon Box on Left + Outline Status Badge on Right */}
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
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                          {t('icon_check_circle', 'check_circle')}
                        </span>
                        <span>
                          {isWorkspaceConfigured
                            ? t('workspace_badge_configured', 'Configured')
                            : t('workspace_badge_ready', 'Ready')}
                        </span>
                      </span>
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
                  <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 m-0">
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

