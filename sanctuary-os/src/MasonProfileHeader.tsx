import { handleOpenUrl } from './shared';

export default function MasonProfileHeader({ mason, masonId, followerCount, isFollowing, masonAlerts, toggleFollow, toggleMasonAlert, activeView, setActiveView, t, children }: any) {
  const isCompact = activeView && activeView !== 'OVERVIEW';

  return (
    <div className={`relative flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ${isCompact ? 'mb-2' : 'mb-0'}`}>
      {!isCompact && (
        <div className="flex items-center gap-4 mb-4">
          <div className="h-[2px] w-8 theme-bg-accent opacity-80" />
          <span className="text-[11px] font-black text-[var(--subtext)] uppercase tracking-[0.4em] opacity-60">
            {t("personnel_dossier")} // {masonId.substring(0, 8)}
          </span>
          <div className="h-[1px] flex-1 bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[var(--text)] opacity-30" />
          </div>
        </div>
      )}

      <div className={`relative group border border-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-visible shadow-2xl backdrop-blur-2xl bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] transition-all duration-500 ${isCompact ? 'p-4 rounded-2xl flex flex-col lg:flex-row items-center gap-6' : 'p-8 lg:p-12 rounded-3xl'}`}>

        {/* Dynamic Holographic Backgrounds - Wrapped in overflow-hidden to prevent horizontal scroll */}
        <div className={`absolute inset-0 overflow-hidden pointer-events-none z-0 ${isCompact ? 'rounded-2xl' : 'rounded-3xl'}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] via-transparent to-[color-mix(in_srgb,var(--bg)_60%,transparent)]" />
          <div className="absolute -top-[20rem] -right-[20rem] w-[50rem] h-[50rem] theme-bg-accent opacity-[0.03] blur-[120px] rounded-full group-hover:opacity-[0.05] transition-opacity duration-1000" />
          <div className="absolute -bottom-[10rem] -left-[10rem] w-[30rem] h-[30rem] bg-[var(--text)] opacity-[0.02] blur-[100px] rounded-full" />
          {/* Tech Grid Overlay */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-10 mix-blend-overlay" />
        </div>

        {/* Premium Edge Highlight */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_40%,transparent)] to-transparent opacity-50 z-0" />
        <div className="absolute inset-y-0 left-0 w-[1px] bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_20%,transparent)] to-transparent opacity-50 z-0" />

        <div className={`relative z-10 w-full ${isCompact ? 'flex flex-col xl:flex-row items-center justify-between gap-6' : 'grid grid-cols-1 xl:grid-cols-[auto_1fr_auto] gap-10 items-center'}`}>

          {/* Left Block (Avatar + Info) */}
          <div className={`flex ${isCompact ? 'items-center gap-5 w-full xl:w-auto shrink-0' : 'flex-col xl:flex-row items-center xl:items-start justify-center xl:justify-start gap-8 lg:gap-10'}`}>
            {/* Holographic Avatar Mount */}
            <div className={`relative ${isCompact ? 'w-16 h-16 shrink-0' : 'w-36 h-36'}`}>
              {/* Outer rotating scan rings */}
              <div className="absolute -inset-4 rounded-2xl border-[1px] border-transparent border-t-[var(--accent)] border-l-[color-mix(in_srgb,var(--accent)_30%,transparent)] opacity-30 animate-[spin_10s_linear_infinite]" />
              <div className="absolute -inset-2 rounded-full border-[1px] border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] opacity-40 animate-[spin_20s_linear_infinite_reverse]" />

              {/* Core Avatar Container */}
              <div className="absolute inset-0 rounded-2xl bg-[color-mix(in_srgb,var(--sidebar)_80%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-10 backdrop-blur-xl group/avatar cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all duration-500" onClick={() => isCompact && setActiveView && setActiveView('OVERVIEW')}>
                <div className="absolute inset-0 bg-gradient-to-tr from-[color-mix(in_srgb,var(--accent)_15%,transparent)] to-transparent z-20 pointer-events-none mix-blend-overlay opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-500" />
                {mason.avatar_url ? (
                  <img src={mason.avatar_url} alt={t("auto_avatar")} className="w-full h-full object-cover filter contrast-[1.15] brightness-[1.05] group-hover/avatar:scale-110 group-hover/avatar:rotate-1 transition-all duration-700 ease-out" />
                ) : (
                  <span className={`opacity-30 grayscale material-symbols-outlined ${isCompact ? 'text-3xl' : 'text-6xl'}`}>{t("icon_construction")}</span>
                )}
              </div>
            </div>

            {/* Core Info Block */}
            <div className={`flex flex-col ${isCompact ? 'gap-1' : 'gap-3 lg:gap-4 min-w-0'}`}>
              <div className="flex flex-col gap-1 lg:gap-2">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex items-center gap-2">
                    <h1
                      className={`${isCompact ? 'text-2xl' : 'text-4xl lg:text-5xl'} font-black capitalize tracking-tight text-[var(--text)] drop-shadow-[0_0_15px_color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors ${setActiveView && isCompact ? 'cursor-pointer hover:theme-text-accent' : ''}`}
                      onClick={() => isCompact && setActiveView && setActiveView('OVERVIEW')}
                    >
                      {mason.name}
                    </h1>

                    {mason.is_verified && (
                      <div className="flex items-center gap-1 mb-1" title={t("verified")}>
                        <span className={`material-symbols-outlined text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)] ${isCompact ? '!text-[20px]' : '!text-[28px]'}`}>{t("icon_verified_user")}</span>
                      </div>
                    )}
                  </div>

                  {isCompact && (
                    <div className="flex items-center gap-2 mb-[2px]">
                      <span className="text-[var(--subtext)] opacity-30 font-black text-2xl leading-none">/</span>
                      <span className="text-lg font-black tracking-widest uppercase text-[var(--accent)] animate-in fade-in slide-in-from-left-2 duration-300 drop-shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_30%,transparent)]">
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

                {/* Status / Follower Bar */}
                {!isCompact && (
                  <div className="flex flex-wrap items-center gap-4 text-[10px] lg:text-[11px] font-black uppercase tracking-[0.2em] mt-2">
                    <div className="flex items-center gap-2 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 py-2 rounded-lg">
                      <span className="text-[var(--subtext)] opacity-50">{t("followers")}</span>
                      <span className="text-[var(--text)] drop-shadow-[0_0_5px_color-mix(in_srgb,var(--text)_30%,transparent)]">{followerCount}</span>
                    </div>

                    {!mason.is_verified && (
                      <div className="flex items-center gap-2 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 py-2 rounded-lg">
                        <span className="text-[var(--text)] opacity-50">{t("status_standard_clearance")}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bio */}
              {!isCompact && mason.bio && (
                <div className="relative pl-5 py-1 mt-1">
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[var(--accent)] to-transparent rounded-full opacity-80" />
                  <p className="text-[12px] lg:text-[13px] font-medium text-[var(--subtext)] leading-relaxed max-w-3xl drop-shadow-sm font-mono whitespace-pre-wrap">
                    {mason.bio}
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Central Filters Block (When Compact) */}
          {isCompact && children && (
             <div className="flex-1 w-full flex items-center justify-end xl:justify-center px-4">
                {children}
             </div>
          )}

          {/* Action Module */}
          {!isCompact && (
            <div className={`flex flex-col gap-4 w-full xl:w-[320px] shrink-0`}>
              {/* Primary Action */}
              <button onClick={toggleFollow} className={`relative group/mainbtn rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 overflow-hidden shadow-xl w-full h-14 ${isFollowing ? 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]' : 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] hover:shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_30%,transparent)] hover:-translate-y-1'}`}>
                {!isFollowing && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_20%,transparent)] to-transparent opacity-0 group-hover/mainbtn:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                <span className={`material-symbols-outlined relative z-10 !text-[20px]`}>{isFollowing ? 'check_circle' : 'person_add'}</span>
                <span className="relative z-10">{isFollowing ? t("btn_unfollow") : t("btn_follow")}</span>
              </button>

              {/* Secondary Actions Grid */}
              <div className="grid grid-cols-4 gap-2">
                <button onClick={toggleMasonAlert} className={`relative group/btn h-12 flex items-center justify-center rounded-xl border transition-all ${masonAlerts[masonId] ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] theme-text-accent shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-[var(--text)]'}`}>
                  <span className="material-symbols-outlined !text-[18px]">{masonAlerts[masonId] ? 'notifications_active' : 'notifications_off'}</span>
                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-3 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-lg text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-2xl opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 backdrop-blur-3xl z-[100] translate-y-2 group-hover/btn:translate-y-0">
                    {t("profile_notify")}
                  </span>
                </button>

                {mason.patreon_url ? (
                  <button onClick={() => handleOpenUrl(mason.patreon_url)} className="relative group/btn h-12 rounded-xl bg-[#FF424D]/10 border border-[#FF424D]/20 text-[#FF424D] flex items-center justify-center hover:bg-[#FF424D]/20 hover:border-[#FF424D]/40 hover:shadow-[0_0_15px_rgba(255,66,77,0.2)] transition-all">
                    <span className="material-symbols-outlined !text-[18px]">{t("icon_favorite")}</span>
                    <span className="absolute top-full left-1/2 -translate-x-1/2 mt-3 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[#FF424D]/30 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#FF424D] whitespace-nowrap shadow-2xl opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 backdrop-blur-3xl z-[100] translate-y-2 group-hover/btn:translate-y-0">
                      {t("link_patreon")}
                    </span>
                  </button>
                ) : <div />}

                {mason.website_url ? (
                  <button onClick={() => handleOpenUrl(mason.website_url)} className="relative group/btn h-12 rounded-xl bg-[#06B6D4]/10 border border-[#06B6D4]/20 text-[#06B6D4] flex items-center justify-center hover:bg-[#06B6D4]/20 hover:border-[#06B6D4]/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.2)] transition-all">
                    <span className="material-symbols-outlined !text-[18px]">{t("icon_public")}</span>
                    <span className="absolute top-full left-1/2 -translate-x-1/2 mt-3 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[#06B6D4]/30 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#06B6D4] whitespace-nowrap shadow-2xl opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 backdrop-blur-3xl z-[100] translate-y-2 group-hover/btn:translate-y-0">
                      {t("link_website")}
                    </span>
                  </button>
                ) : <div />}

                {mason.discord_url ? (
                  <button onClick={() => handleOpenUrl(mason.discord_url)} className="relative group/btn h-12 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/20 text-[#5865F2] flex items-center justify-center hover:bg-[#5865F2]/20 hover:border-[#5865F2]/40 hover:shadow-[0_0_15px_rgba(88,101,242,0.2)] transition-all">
                    <span className="material-symbols-outlined !text-[18px]">{t("icon_chat")}</span>
                    <span className="absolute top-full left-1/2 -translate-x-1/2 mt-3 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[#5865F2]/30 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#5865F2] whitespace-nowrap shadow-2xl opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 backdrop-blur-3xl z-[100] translate-y-2 group-hover/btn:translate-y-0">
                      {t("link_discord")}
                    </span>
                  </button>
                ) : <div />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

