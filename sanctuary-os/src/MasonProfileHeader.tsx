import { handleOpenUrl, HoverTooltip } from './shared';

export default function MasonProfileHeader({ mason, masonId, followerCount, isFollowing, isVerifiedSupporter, onOpenSupportModal, masonAlerts, toggleFollow, toggleMasonAlert, activeView, setActiveView, t, children }: any) {
  const isCompact = activeView && activeView !== 'OVERVIEW';

  return (
    <div className="relative flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className={`relative glass-panel rounded-3xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] shadow-xl transition-all duration-500 overflow-visible ${isCompact ? 'p-4 md:px-6 md:py-4' : 'p-6 md:p-8'}`}>
        {/* Subtle Ambient Glow */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none z-0">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[var(--accent)] opacity-[0.04] blur-[90px]" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[var(--text)] opacity-[0.02] blur-[80px]" />
        </div>

        <div className="relative z-10 w-full flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5">
          {/* Left Block: Avatar + Identity */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 min-w-0 flex-1">
            {/* Clean Glass Avatar Frame */}
            <div
              onClick={() => isCompact && setActiveView && setActiveView('OVERVIEW')}
              className={`relative shrink-0 rounded-2xl glass-surface bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-[0_8px_24px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.12)] flex items-center justify-center overflow-hidden group/avatar transition-all duration-500 ${isCompact ? 'w-14 h-14 cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]' : 'w-20 h-20 md:w-24 md:h-24'}`}
            >
              {mason.avatar_url ? (
                <img
                  src={mason.avatar_url}
                  alt={t("auto_avatar", "Avatar")}
                  className="w-full h-full object-cover group-hover/avatar:scale-105 transition-transform duration-500 ease-out"
                />
              ) : (
                <span className={`opacity-40 material-symbols-outlined text-[var(--text)] ${isCompact ? '!text-2xl' : '!text-4xl'}`}>
                  {t("icon_construction", "construction")}
                </span>
              )}
            </div>

            {/* Identity, Verified Icon, Followers & Bio */}
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  onClick={() => isCompact && setActiveView && setActiveView('OVERVIEW')}
                  className={`${isCompact ? 'text-xl md:text-2xl cursor-pointer hover:theme-text-accent' : 'text-2xl md:text-3xl lg:text-4xl'} font-black capitalize tracking-tight text-[var(--text)] leading-none transition-colors truncate`}
                >
                  {mason.name}
                </h1>

                {mason.is_verified && (
                  <div className="relative flex items-center justify-center">
                    <HoverTooltip title={t("verified", "Verified")} noIcon={true} />
                    <span className={`material-symbols-outlined text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.45)] ${isCompact ? '!text-[20px]' : '!text-[24px]'}`}>
                      {t("icon_verified_user", "verified_user")}
                    </span>
                  </div>
                )}

                {isVerifiedSupporter && (
                  <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 flex items-center gap-1 shadow-sm">
                    <span className="material-symbols-outlined !text-[12px]">{t("icon_verified", "verified")}</span>
                    {t("supporter_badge_verified_patron", "VERIFIED SUPPORTER")}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtext)]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--accent)]">{followerCount}</span>
                  <span className="opacity-70">{t("followers", "Followers")}</span>
                </div>
                {!mason.is_verified && (
                  <>
                    <span className="opacity-30">•</span>
                    <span className="opacity-60">{t("status_standard_clearance", "Standard Clearance")}</span>
                  </>
                )}
                {isVerifiedSupporter && (
                  <>
                    <span className="opacity-30">•</span>
                    <span className="text-[var(--accent)] flex items-center gap-1">
                      <span className="material-symbols-outlined !text-[12px]">{t("icon_bolt", "bolt")}</span>
                      {t("supporter_badge_expedited_support", "EXPEDITED SUPPORT PATH")}
                    </span>
                  </>
                )}
              </div>

              {!isCompact && mason.bio && (
                <p className="text-xs md:text-[13px] text-[var(--subtext)] opacity-80 leading-relaxed max-w-3xl line-clamp-2 whitespace-pre-wrap mt-0.5">
                  {mason.bio}
                </p>
              )}
            </div>
          </div>

          {/* Right Block: Search/Filters (when on sub-tab) + Notifications, Social Links & Follow Controls */}
          <div className="flex flex-wrap items-center justify-end gap-3 w-full xl:w-auto shrink-0">
            {isCompact && children && (
              <div className="flex-1 sm:flex-initial min-w-[240px] flex items-center justify-end">
                {children}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMasonAlert}
                className={`relative w-10 h-10 rounded-xl glass-surface backdrop-blur-md border flex items-center justify-center transition-all duration-300 ${masonAlerts[masonId] ? 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]' : 'bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}
              >
                <HoverTooltip title={t("profile_notify", "Notifications")} noIcon={true} />
                <span className="material-symbols-outlined !text-[18px]">
                  {masonAlerts[masonId] ? t("icon_notifications_active", "notifications_active") : t("icon_notifications_off", "notifications_off")}
                </span>
              </button>

              {mason.patreon_url && (
                <button
                  onClick={() => handleOpenUrl(mason.patreon_url)}
                  className="relative w-10 h-10 rounded-xl glass-surface bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-md text-[#FF424D] hover:bg-[#FF424D]/15 hover:border-[#FF424D]/35 flex items-center justify-center transition-all duration-300"
                >
                  <HoverTooltip title={t("link_patreon", "Patreon")} noIcon={true} />
                  <span className="material-symbols-outlined !text-[18px]">{t("icon_favorite", "favorite")}</span>
                </button>
              )}

              {mason.website_url && (
                <button
                  onClick={() => handleOpenUrl(mason.website_url)}
                  className="relative w-10 h-10 rounded-xl glass-surface bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-md text-[#06B6D4] hover:bg-[#06B6D4]/15 hover:border-[#06B6D4]/35 flex items-center justify-center transition-all duration-300"
                >
                  <HoverTooltip title={t("link_website", "Website")} noIcon={true} />
                  <span className="material-symbols-outlined !text-[18px]">{t("icon_public", "public")}</span>
                </button>
              )}

              {mason.discord_url && (
                <button
                  onClick={() => handleOpenUrl(mason.discord_url)}
                  className="relative w-10 h-10 rounded-xl glass-surface bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-md text-[#5865F2] hover:bg-[#5865F2]/15 hover:border-[#5865F2]/35 flex items-center justify-center transition-all duration-300"
                >
                  <HoverTooltip title={t("link_discord", "Discord")} noIcon={true} />
                  <span className="material-symbols-outlined !text-[18px]">{t("icon_chat", "chat")}</span>
                </button>
              )}

              {onOpenSupportModal && (
                <button
                  onClick={onOpenSupportModal}
                  className={`h-10 px-4 rounded-xl glass-surface backdrop-blur-md border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all duration-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] ${
                    isVerifiedSupporter
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/25'
                      : 'bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]'
                  }`}
                >
                  <span className="material-symbols-outlined !text-[16px]">
                    {isVerifiedSupporter ? t("icon_verified", "verified") : t("icon_volunteer_activism", "volunteer_activism")}
                  </span>
                  <span>
                    {isVerifiedSupporter
                      ? t("supporter_badge_verified_patron", "VERIFIED SUPPORTER")
                      : t("supporter_btn_support_creator", "Support (0% Fee)")}
                  </span>
                </button>
              )}

              <button
                onClick={toggleFollow}
                className={`h-10 px-5 rounded-xl glass-surface backdrop-blur-md border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] ${isFollowing ? 'bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]' : 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]'}`}
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {isFollowing ? t("icon_check_circle", "check_circle") : t("icon_person_add", "person_add")}
                </span>
                <span>{isFollowing ? t("btn_unfollow", "Unfollow") : t("btn_follow", "Follow")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

