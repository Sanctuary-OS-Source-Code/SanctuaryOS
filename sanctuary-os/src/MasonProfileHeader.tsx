import { ActionPill, handleOpenUrl, HoverTooltip, VAULT_CHIP_CLASS } from './shared';

export default function MasonProfileHeader({
  mason,
  masonId,
  followerCount,
  isFollowing,
  isVerifiedSupporter,
  onOpenSupportModal,
  masonAlerts,
  toggleFollow,
  toggleMasonAlert,
  activeView,
  setActiveView,
  searchQuery,
  setSearchQuery,
  searchPlaceholder,
  primaryPopover,
  t,
}: any) {
  const isSubView = Boolean(activeView && activeView !== 'OVERVIEW');
  const alertsEnabled = Boolean(masonAlerts?.[masonId]);

  const activeBreadcrumbLabel = (() => {
    if (!isSubView) return null;
    if (activeView === 'MODS') return t("term_mods", "Artifacts");
    if (activeView === 'BLUEPRINTS') return t("playsets_title", "{Blueprints}");
    if (activeView === 'LEXICONS') return t("tab_lexicons", "Lexicons");
    if (activeView === 'CHAMELEONS') return t("chameleon", "Chameleon");
    if (activeView === 'TEMPLATES') return t("ql_templates", "Templates");
    if (activeView === 'COMM-LINK') return t("tab_commlink", "Comm-Link");
    return activeView;
  })();

  return (
    <header className="flex flex-col lg:flex-row w-full justify-between items-stretch lg:items-center shrink-0 gap-3 md:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Left: Standard Sanctuary OS ViewHeader Glass Pill */}
      <div className="glass-panel rounded-2xl p-2.5 pr-4 md:p-3 md:pr-5 flex items-center gap-3 md:gap-3.5 shrink-0 min-w-0 w-fit max-w-full relative group/header">
        <div
          onClick={() => isSubView && setActiveView && setActiveView('OVERVIEW')}
          className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] overflow-hidden relative group/avatar transition-all duration-300 ${
            isSubView ? 'cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]' : ''
          }`}
        >
          {mason.avatar_url ? (
            <img
              src={mason.avatar_url}
              alt={t("auto_avatar", "Avatar")}
              className="w-full h-full object-cover group-hover/avatar:scale-105 transition-transform duration-500 ease-out"
            />
          ) : (
            <span className="material-symbols-outlined !text-[20px] md:!text-[24px] text-[var(--accent)] opacity-90">
              {t("icon_construction", "construction")}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-0.5 items-start justify-center text-left flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
            <h1
              onClick={() => isSubView && setActiveView && setActiveView('OVERVIEW')}
              className={`text-base md:text-xl font-black capitalize tracking-tight leading-tight m-0 text-left text-[var(--text)] shrink-0 transition-colors ${
                isSubView ? 'hover:theme-text-accent cursor-pointer' : ''
              }`}
            >
              {mason.name}
            </h1>

            {mason.is_verified && (
              <div className="relative flex items-center justify-center shrink-0">
                <HoverTooltip title={t("verified", "Verified")} noIcon={true} />
                <span className="material-symbols-outlined text-emerald-400 !text-[18px]">
                  {t("icon_verified_user", "verified_user")}
                </span>
              </div>
            )}

            <span className={VAULT_CHIP_CLASS}>
              <span className="text-[var(--accent)] font-black">{followerCount}</span>
              <span>{t("followers", "Followers")}</span>
            </span>

            {isVerifiedSupporter && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--success)]">
                  {t("icon_verified", "verified")}
                </span>
                <span>{t("supporter_badge_verified_patron", "VERIFIED SUPPORTER")}</span>
              </span>
            )}

            {activeBreadcrumbLabel && (
              <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                <span className="px-2.5 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] leading-tight">
                  {activeBreadcrumbLabel}
                </span>
              </div>
            )}
          </div>

          {mason.bio && (
            <h2 className="text-[10px] md:text-[11px] font-medium tracking-wide text-[var(--subtext)] m-0 text-left opacity-80 leading-snug line-clamp-1 max-w-2xl">
              {mason.bio}
            </h2>
          )}
        </div>
      </div>

      {/* Right: Search/Filter ActionPill on sub-tabs OR Profile Action Pill on Overview */}
      <div className="flex items-center justify-start lg:justify-end w-full lg:w-auto lg:ml-auto">
        {isSubView ? (
          <div className="w-full sm:w-auto sm:min-w-[280px] md:min-w-[340px]">
            <ActionPill
              searchQuery={searchQuery || ""}
              setSearchQuery={setSearchQuery || (() => {})}
              searchPlaceholder={searchPlaceholder}
              primaryPopover={primaryPopover}
            />
          </div>
        ) : (
          <div className="glass-panel rounded-2xl shadow-lg divide-x divide-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center h-13 shrink-0 overflow-hidden max-sm:w-full">
            <button
              type="button"
              onClick={toggleMasonAlert}
              className={`relative h-full w-12 rounded-none flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-colors cursor-pointer shrink-0 ${
                alertsEnabled
                  ? 'text-[var(--accent)] opacity-100 bg-[color-mix(in_srgb,var(--text)_6%,transparent)]'
                  : 'text-[var(--text)] opacity-75 hover:opacity-100'
              }`}
            >
              <HoverTooltip
                title={t("profile_notify", "Notifications")}
                subtitle={alertsEnabled ? t("enabled", "Enabled") : t("disabled", "Disabled")}
                icon={
                  alertsEnabled
                    ? t("icon_notifications_active", "notifications_active")
                    : t("icon_notifications_off", "notifications_off")
                }
                delay={120}
              />
              <span className="material-symbols-outlined !text-[19px]">
                {alertsEnabled
                  ? t("icon_notifications_active", "notifications_active")
                  : t("icon_notifications_off", "notifications_off")}
              </span>
            </button>

            {mason?.patreon_url && (
              <button
                type="button"
                onClick={() => handleOpenUrl(mason.patreon_url)}
                className="relative h-full w-12 rounded-none flex items-center justify-center text-[var(--text)] opacity-75 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-colors cursor-pointer shrink-0"
              >
                <HoverTooltip
                  title={t("link_patreon", "Patreon")}
                  icon={t("icon_favorite", "favorite")}
                  delay={120}
                />
                <span className="material-symbols-outlined !text-[19px]">
                  {t("icon_favorite", "favorite")}
                </span>
              </button>
            )}

            {mason?.website_url && (
              <button
                type="button"
                onClick={() => handleOpenUrl(mason.website_url)}
                className="relative h-full w-12 rounded-none flex items-center justify-center text-[var(--text)] opacity-75 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-colors cursor-pointer shrink-0"
              >
                <HoverTooltip
                  title={t("link_website", "Website")}
                  icon={t("icon_public", "public")}
                  delay={120}
                />
                <span className="material-symbols-outlined !text-[19px]">
                  {t("icon_public", "public")}
                </span>
              </button>
            )}

            {mason?.discord_url && (
              <button
                type="button"
                onClick={() => handleOpenUrl(mason.discord_url)}
                className="relative h-full w-12 rounded-none flex items-center justify-center text-[var(--text)] opacity-75 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-colors cursor-pointer shrink-0"
              >
                <HoverTooltip
                  title={t("link_discord", "Discord")}
                  icon={t("icon_chat", "chat")}
                  delay={120}
                />
                <span className="material-symbols-outlined !text-[19px]">
                  {t("icon_chat", "chat")}
                </span>
              </button>
            )}

            {onOpenSupportModal && (
              <button
                type="button"
                onClick={onOpenSupportModal}
                className="relative h-full px-3.5 sm:px-0 sm:w-12 max-sm:flex-1 rounded-none text-[var(--text)] opacity-85 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-center gap-2 text-[11px] font-bold capitalize tracking-wider transition-colors cursor-pointer"
              >
                <HoverTooltip
                  title={
                    isVerifiedSupporter
                      ? t("supporter_badge_verified_patron", "VERIFIED SUPPORTER")
                      : t("supporter_btn_support_creator", "Support")
                  }
                  icon={
                    isVerifiedSupporter
                      ? t("icon_verified", "verified")
                      : t("icon_volunteer_activism", "volunteer_activism")
                  }
                  delay={120}
                />
                <span
                  className={`material-symbols-outlined !text-[18px] ${
                    isVerifiedSupporter ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                  }`}
                >
                  {isVerifiedSupporter
                    ? t("icon_verified", "verified")
                    : t("icon_volunteer_activism", "volunteer_activism")}
                </span>
                <span className="sm:hidden">
                  {isVerifiedSupporter
                    ? t("supporter_badge_verified_patron", "VERIFIED SUPPORTER")
                    : t("supporter_btn_support_creator", "Support")}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleFollow}
              className="relative h-full px-3.5 sm:px-0 sm:w-12 max-sm:flex-1 rounded-none text-[var(--text)] opacity-85 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-center gap-2 text-[11px] font-bold capitalize tracking-wider transition-colors cursor-pointer"
            >
              <HoverTooltip
                title={isFollowing ? t("following", "Following") : t("btn_follow", "Follow")}
                icon={
                  isFollowing
                    ? t("icon_check_circle", "check_circle")
                    : t("icon_person_add", "person_add")
                }
                delay={120}
              />
              <span
                className={`material-symbols-outlined !text-[18px] ${
                  isFollowing ? 'text-[var(--success)]' : 'text-[var(--accent)]'
                }`}
              >
                {isFollowing
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_person_add", "person_add")}
              </span>
              <span className="sm:hidden">
                {isFollowing ? t("following", "Following") : t("btn_follow", "Follow")}
              </span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
