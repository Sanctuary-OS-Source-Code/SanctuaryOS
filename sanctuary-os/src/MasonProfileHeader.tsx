import { handleOpenUrl } from './shared';

export default function MasonProfileHeader({ mason, masonId, followerCount, isFollowing, masonAlerts, toggleFollow, toggleMasonAlert, activeView, setActiveView, t }: any) {
  return (
    <div className="relative mb-8 flex flex-col w-full">
      <div className="flex items-center gap-4 mb-4">
        <div className="h-0.5 w-12 theme-bg-accent opacity-50" />
        <span className="text-[10px] font-mono text-[var(--subtext)] capitalize tracking-[0.3em] opacity-80">
          {t("personnel_dossier")} // {masonId.substring(0, 8)}
        </span>
        <div className="h-0.5 flex-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] relative">
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[color-mix(in_srgb,var(--accent)_50%,transparent)] to-transparent opacity-30" />
        </div>
      </div>

      <div className="relative py-8 group grid grid-cols-1 xl:grid-cols-[auto_1fr_280px] gap-8 items-start xl:items-center border-y border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--bg)_10%,transparent)] to-transparent backdrop-blur-sm">

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-10 pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-20" />
        <div className="absolute bottom-0 right-0 w-[40rem] h-[40rem] theme-bg-accent opacity-[0.02] blur-[100px] rounded-full pointer-events-none translate-y-1/2 translate-x-1/4" />

        <div className="flex items-center justify-center pl-4 xl:justify-start">
          <div className="relative w-[120px] h-[120px]">
            <div className="absolute inset-0 border border-[var(--accent)] rotate-45 scale-[1.15] rounded-[var(--radius)] opacity-20 group-hover:rotate-90 group-hover:scale-100 transition-all duration-1000 blur-[2px] group-hover:blur-[1px]" />
            <div className="absolute inset-0 rounded-[var(--radius)] bg-[var(--sidebar)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center overflow-hidden shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] z-10 backdrop-blur-xl">
              <div className="absolute inset-0 bg-gradient-to-tr from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent z-20 pointer-events-none mix-blend-overlay" />
              {mason.avatar_url ? (
                <img src={mason.avatar_url} alt={t("auto_avatar")} className="w-full h-full object-cover filter contrast-[1.1] group-hover:scale-105 transition-transform duration-700" />
              ) : (
                <span className="text-5xl opacity-40 grayscale material-symbols-outlined">{t("icon_construction")}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 relative z-10 min-w-0">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <h1 
                  className={`text-4xl font-black capitalize tracking-tighter text-[var(--text)] drop-shadow-md transition-colors ${setActiveView ? 'cursor-pointer hover:theme-text-accent' : ''}`}
                  onClick={() => setActiveView && setActiveView('OVERVIEW')}
                >
                  {mason.name}
                </h1>
                {mason.is_verified && (
                  <span className="material-symbols-outlined !text-[28px] text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)] mt-1" title={t("verified")}>{t("icon_verified_user")}</span>
                )}
                {activeView && activeView !== 'OVERVIEW' && (
                  <div className="flex items-center gap-3 ml-2">
                    <span className="text-[var(--subtext)] opacity-40 font-semibold text-3xl leading-none">/</span>
                    <span className="text-3xl font-medium tracking-tight text-[var(--subtext)] animate-in fade-in slide-in-from-left-2 duration-300 leading-tight truncate">
                      {activeView === 'COMM-LINK' ? t("tab_commlink") : 
                       activeView === 'MODS' ? t("items") : 
                       activeView === 'BLUEPRINTS' ? t("playsets_title") : 
                       activeView === 'LEXICONS' ? t("tab_lexicons") : 
                       activeView === 'CHAMELEONS' ? t("type_theme") : 
                       activeView === 'TEMPLATES' ? t("ql_templates") : activeView}
                    </span>
                  </div>
                )}
              </div>
              <span className="hidden sm:block h-6 w-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
              <div className="flex gap-6 text-[10px] font-mono capitalize tracking-[0.2em] items-center">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--subtext)] opacity-60">{t("followers")}</span>
                  <span className="theme-text-accent font-black text-sm">{followerCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--subtext)] opacity-60">{t("status")}</span>
                  <div className="flex items-center gap-1.5 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--success)_20%,transparent)]">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                    <span className="text-emerald-400 font-black tracking-widest">{t("status_active")}</span>
                  </div>
                </div>
              </div>
            </div>
            {!mason.is_verified && (
              <span className="text-[10px] text-[var(--subtext)] opacity-50 font-mono tracking-widest">{t("status_standard_clearance")}</span>
            )}
          </div>

          <div className="relative pl-4 border-l-2 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] py-1">
            <p className="text-[13px] font-medium text-[var(--text)] opacity-70 leading-relaxed font-mono whitespace-pre-wrap max-w-4xl">
              {mason.bio || t("no_bio")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 relative z-10 w-full">
          <button onClick={toggleFollow} className={`w-full h-12 px-6 text-[10px] font-black capitalize tracking-[0.2em] rounded-xl border flex items-center justify-center gap-2 transition-all shadow-lg ${isFollowing ? 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]' : 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105'}`}>
            <span className="material-symbols-outlined !text-[16px]">{isFollowing ? 'check_circle' : 'person_add'}</span>
            {isFollowing ? (t("btn_unfollow")) : (t("btn_follow"))}
          </button>

          <div className="flex gap-2">
            <button onClick={toggleMasonAlert} className={`relative group/btn flex-1 h-10 flex items-center justify-center rounded-xl border transition-all ${masonAlerts[masonId] ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] theme-text-accent' : 'bg-black/20 border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]'}`}>
              <span className="material-symbols-outlined !text-[16px]">{masonAlerts[masonId] ? 'notifications_active' : 'notifications_off'}</span>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl text-[10px] font-black capitalize tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 pointer-events-none backdrop-blur-2xl z-[100] translate-y-1 group-hover/btn:translate-y-0">
                {t("profile_notify")}
              </span>
            </button>

            {mason.patreon_url && (
              <button onClick={() => handleOpenUrl(mason.patreon_url)} className="relative group/btn w-10 h-10 rounded-xl bg-[#FF424D]/10 border border-[#FF424D]/20 text-[#FF424D] flex items-center justify-center hover:bg-[#FF424D]/20 transition-all">
                <span className="material-symbols-outlined !text-[16px]">{t("icon_favorite")}</span>
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-[#FF424D]/30 rounded-xl text-[10px] font-black capitalize tracking-widest text-[#FF424D] whitespace-nowrap shadow-[0_10px_30px_rgba(255,66,77,0.3)] opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 pointer-events-none backdrop-blur-2xl z-[100] translate-y-1 group-hover/btn:translate-y-0">
                  {t("link_patreon")}
                </span>
              </button>
            )}
            {mason.website_url && (
              <button onClick={() => handleOpenUrl(mason.website_url)} className="relative group/btn w-10 h-10 rounded-xl bg-[#06B6D4]/10 border border-[#06B6D4]/20 text-[#06B6D4] flex items-center justify-center hover:bg-[#06B6D4]/20 transition-all">
                <span className="material-symbols-outlined !text-[16px]">{t("icon_public")}</span>
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-[#06B6D4]/30 rounded-xl text-[10px] font-black capitalize tracking-widest text-[#06B6D4] whitespace-nowrap shadow-[0_10px_30px_rgba(6,182,212,0.3)] opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 pointer-events-none backdrop-blur-2xl z-[100] translate-y-1 group-hover/btn:translate-y-0">
                  {t("link_website")}
                </span>
              </button>
            )}
            {mason.discord_url && (
              <button onClick={() => handleOpenUrl(mason.discord_url)} className="relative group/btn w-10 h-10 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/20 text-[#5865F2] flex items-center justify-center hover:bg-[#5865F2]/20 transition-all">
                <span className="material-symbols-outlined !text-[16px]">{t("icon_chat")}</span>
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-[#5865F2]/30 rounded-xl text-[10px] font-black capitalize tracking-widest text-[#5865F2] whitespace-nowrap shadow-[0_10px_30px_rgba(88,101,242,0.3)] opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 pointer-events-none backdrop-blur-2xl z-[100] translate-y-1 group-hover/btn:translate-y-0">
                  {t("link_discord")}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
