import React from 'react';
import { useLexicon } from '../LexiconContext';
import { extractPostImage, stripMarkdown, DashboardStatTile } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { extractDispatchMetadata, formatDispatchCategory } from '../components/universal/DispatchPollAndMeta';

export { DashboardStatTile };

export function StatTileCarousel({ children, innerClassName = "px-1" }: any) {
    const { t } = useLexicon();
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [canScrollRight, setCanScrollRight] = React.useState(false);
    const [canScrollLeft, setCanScrollLeft] = React.useState(false);

    const activeIndex = React.useMemo(() => {
        const arr = React.Children.toArray(children);
        return arr.findIndex((child: any) => Boolean(child?.props?.isActive));
    }, [children]);

    const checkScroll = React.useCallback(() => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 2);
            setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth - 5);
        }
    }, []);

    React.useEffect(() => {
        const timer = setTimeout(checkScroll, 80);
        window.addEventListener('resize', checkScroll);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', checkScroll);
        };
    }, [children, checkScroll]);

    React.useEffect(() => {
        if (activeIndex < 0 || !scrollRef.current) return;
        const container = scrollRef.current;
        const activeEl = container.children[activeIndex] as HTMLElement | undefined;
        if (!activeEl) return;

        const targetLeft =
            activeEl.offsetLeft -
            container.clientWidth / 2 +
            activeEl.offsetWidth / 2;

        container.scrollTo({
            left: Math.max(0, targetLeft),
            behavior: 'smooth',
        });

        const timer = setTimeout(checkScroll, 320);
        return () => clearTimeout(timer);
    }, [activeIndex, checkScroll]);

    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener('scroll', checkScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', checkScroll);
        };
    }, [checkScroll]);

    const scrollBy = (amount: number) => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    return (
      <div className="relative group flex items-center w-full">
        {canScrollLeft && (
            <button type="button" onClick={() => scrollBy(-300)} className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center glass-panel border border-[color-mix(in_srgb,var(--text)_20%,transparent)] rounded-xl shadow-xl text-[var(--text)] opacity-85 hover:opacity-100 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all cursor-pointer">
                <span className="material-symbols-outlined !text-[18px]">{t("icon_chevron_left", "chevron_left")}</span>
            </button>
        )}
        <div ref={scrollRef} className={`flex w-full overflow-x-auto gap-4 md:gap-6 py-4 items-stretch snap-x scroll-smooth hide-scrollbar ${innerClassName}`}>
          {children}
        </div>
        {canScrollRight && (
            <button type="button" onClick={() => scrollBy(300)} className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center glass-panel border border-[color-mix(in_srgb,var(--text)_20%,transparent)] rounded-xl shadow-xl text-[var(--text)] opacity-85 hover:opacity-100 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all cursor-pointer">
                <span className="material-symbols-outlined !text-[18px]">{t("icon_chevron_right", "chevron_right")}</span>
            </button>
        )}
      </div>
    );
}

export function AlertStatTile({ broadcast, alertType, onClick, active, className = "" }: any) {
    const { t } = useLexicon();
    const resolvedAlertType = React.useMemo(() => {
        if (alertType) return alertType;
        if (broadcast) {
            const meta = extractDispatchMetadata(broadcast);
            return formatDispatchCategory(meta.alertOrDispatchType, t);
        }
        return t("comms_btn_alert", "Alert");
    }, [alertType, broadcast, t]);
    
    return (
        <DashboardStatTile
            className={className}
            icon={<span className="material-symbols-outlined ">{broadcast?.icon || t("icon_campaign", "campaign")}</span>}
            number={resolvedAlertType}
            label={t("tile_global_alert", "Global Alert")}
            disableBgStrip={true}
            colorClass={active ? "!bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] !border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)] shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_15%,transparent)] animate-pulse w-full" : "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] w-full"}
            onClick={onClick}
        />
    );
}

export function CommandScreenLayout({ children }: any) {
    return (
        <div className="flex flex-col gap-10 w-full pr-0 md:pr-4 pb-36 md:pb-32">
            {children}
        </div>
    );
}

export function CommandScreenSectionHeading({ 
  title, subtitle, icon, actions, rightContent, onBack, breadcrumb,
  className = "", shape = "circle", 
  colorClass = "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]", 
  iconColorClass = "text-[var(--text)] opacity-85" 
}: any) {
  const { t } = useLexicon();
  const shapeClass = shape === "square" ? "rounded-lg" : "rounded-xl";
  
  return (
    <div className={`flex justify-start items-center border-b border-[color-mix(in_srgb,var(--text)_12%,transparent)] pb-6 w-full mb-8 relative z-10 min-w-0 ${className}`}>
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_22%,transparent)] via-[color-mix(in_srgb,var(--text)_8%,transparent)] to-transparent" />
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {icon && (
          <div className={`w-12 h-12 ${shapeClass} flex items-center justify-center shrink-0 glass-surface relative group shadow-md`}>
            <div className="absolute inset-0 rounded-[inherit] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className={`material-symbols-outlined !text-[24px] relative z-10 ${iconColorClass}`}>{icon}</span>
          </div>
        )}
        <div className="flex flex-col gap-1 items-start text-left flex-1 min-w-0">
          <div className="flex items-center gap-2 w-full">
            <h2 
                onClick={onBack}
                className={`text-lg sm:text-2xl font-black text-[var(--text)] capitalize tracking-wider sm:tracking-widest drop-shadow-lg m-0 truncate min-w-0 ${onBack ? 'cursor-pointer hover:text-[var(--accent)] transition-colors' : ''}`}
            >
              {title}
            </h2>
            {breadcrumb && (
              <div className="flex items-center gap-2 truncate">
                <span className="text-[var(--subtext)] opacity-40 font-black text-2xl leading-none">/</span>
                <span className="text-2xl font-black tracking-widest text-[var(--subtext)] animate-in fade-in slide-in-from-left-2 duration-300 leading-tight truncate capitalize drop-shadow-sm">
                  {breadcrumb}
                </span>
              </div>
            )}
          </div>
          {subtitle && (
            <p className="font-black tracking-[0.3em] text-[10px] capitalize opacity-70 m-0 text-[var(--subtext)] drop-shadow-sm truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {(actions || rightContent) && (
        <div className="flex items-center gap-3 shrink-0 ml-4 relative z-10">{actions || rightContent}</div>
      )}
    </div>
  );
}

export function CommandScreenStats({ children, gridClassOverride }: any) {
    const flatChildren = React.Children.toArray(children).flatMap((child: any) => React.isValidElement(child) && child.type === React.Fragment ? React.Children.toArray((child.props as any).children) : [child]).filter(Boolean);
    const validCount = flatChildren.length;
    
    let gridClass = "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
    if (gridClassOverride) gridClass = gridClassOverride;
    else if (validCount === 4) gridClass = "grid-cols-2 lg:grid-cols-4";
    else if (validCount === 3) gridClass = "grid-cols-2 md:grid-cols-3";
    else if (validCount === 2) gridClass = "grid-cols-2";
    else if (validCount === 1) gridClass = "grid-cols-1";

    return (
        <div className={`grid ${gridClass} gap-4 w-full`}>
            {children}
        </div>
    );
}

export function CommandScreenBody({ children }: any) {
    return (
        <div className="flex flex-col lg:flex-row gap-8 w-full min-h-0 flex-1">
            {children}
        </div>
    );
}

export function CommandScreenMain({ children }: any) {
    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {children}
        </div>
    );
}

export function CommandScreenSidebar({ title, icon, shape = "square", children }: any) {
    const { t } = useLexicon();
    const shapeClass = shape === "square" ? "rounded-xl" : "rounded-2xl";
    return (
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col">
            <div className="flex items-center gap-3.5 mb-6 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-5 relative z-10 w-full">
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-[var(--accent)]/50 to-transparent" />
                {icon && (
                    <div className={`w-11 h-11 sm:w-12 sm:h-12 ${shapeClass} flex items-center justify-center shrink-0 border glass-panel relative group shadow-md`}>
                        <div className="absolute inset-0 rounded-[inherit] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="material-symbols-outlined !text-[22px] sm:!text-[24px] relative z-10 theme-text-accent">{icon}</span>
                    </div>
                )}
                <h2 className="text-base sm:text-xl font-black capitalize tracking-wider sm:tracking-widest text-[var(--text)] m-0 p-0 text-left leading-snug flex-1 min-w-0">
                    {title}
                </h2>
            </div>
            <div className="flex flex-col gap-4">
                {children}
            </div>
        </div>
    );
}

export function CommandScreenStatusbar({ children }: any) {
    return (
        <div className="w-full shrink-0 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-4 mt-8 relative z-10">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--accent)]/50 to-transparent" />
            <div className="flex items-center gap-4 w-full">
                {children}
            </div>
        </div>
    );
}


export function UrgentBroadcastBanner({ urgentBroadcast, setViewingPost, setUrgentBroadcast }: any) {
    const { t } = useLexicon();
    if (!urgentBroadcast || localStorage.getItem("sanctuary_notify_alert_banner") === "false") return null;

    return (
    <div onClick={() => setViewingPost({ ...urgentBroadcast, content: urgentBroadcast.message || urgentBroadcast.content, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className="w-full glass-panel rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-center gap-6 shadow-xl hover:shadow-2xl cursor-pointer transition-all duration-700 ease-out group relative border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_60%,transparent)]">
            <div className="absolute inset-0 rounded-[inherit] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] z-0 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
            
            <div className="w-14 h-14 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] flex items-center justify-center shrink-0 z-10 group-hover:scale-110 transition-transform duration-500 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--danger)_20%,transparent)]">
                <span className="material-symbols-outlined !text-[32px] text-[var(--danger)] drop-shadow-[0_0_15px_currentColor] animate-pulse">{t("icon_warning_amber")}</span>
            </div>
            
            <div className="flex flex-col gap-1 flex-1 z-10 min-w-0">
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] text-[9px] font-[900] uppercase tracking-[0.2em] rounded-lg border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center gap-1"><span className="material-symbols-outlined !text-[12px]"></span>{t("urgent_alert")}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-60 text-[var(--danger)]">{new Date(urgentBroadcast.created_at).toLocaleDateString()}</span>
                </div>
                <h3 className="text-xl font-[900] tracking-tighter text-[var(--danger)] group-hover:brightness-150 group-hover:drop-shadow-[0_0_15px_currentColor] transition-all truncate mt-1">{urgentBroadcast.title}</h3>
            </div>
            
            <div className="flex items-center gap-2 z-10 ml-auto">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        localStorage.setItem("sanctuary_notify_alert_banner", "false");
                        setUrgentBroadcast(null);
                    }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors opacity-50 hover:opacity-100"
                >
                    <span className="material-symbols-outlined !text-[20px]">{t("icon_close")}</span>
                </button>
            </div>
        </div>
    );
}


export function SystemBroadcastsGrid({ broadcasts, setViewingPost }: any) {
    const { t } = useLexicon();
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
            {broadcasts.length > 0 ? broadcasts.map((post: any, index: number) => {
                return (
                    <UniversalCard
                        key={post.id}
                        layout="vertical"
                        image={extractPostImage(post) ? extractPostImage(post) : undefined}
                        icon={!extractPostImage(post) ? t("icon_satellite_alt") : undefined}
                        title={post.title}
                        onClick={() => setViewingPost({ ...post, content: post.message, mason_id: 'system', views: 0, likes: 0, replies: 0 })}
                        className="w-full"
                        badges={
                            <>
                                <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_satellite_alt", "satellite_alt")}</span>
                                    <span>{formatDispatchCategory(post.category, t)}</span>
                                </div>
                                <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">{t("icon_shield", "shield")}</span>
                                    <span className="text-[var(--subtext)]">{t("category_system")}</span>
                                </div>
                            </>
                        }
                        footer={
                            <div className="flex items-center justify-between w-full mt-2">
                                <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                                    <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today")}</span> {new Date(post.created_at).toLocaleDateString()}
                                </span>
                                <span className="text-[10px] font-black capitalize tracking-widest opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                                    {t("wayfinder_read_more")} <span className="material-symbols-outlined !text-sm">{t("icon_arrow_forward")}</span>
                                </span>
                            </div>
                        }
                    >
                        <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 line-clamp-3 mt-1">
                            {post.description ? post.description : stripMarkdown(post.message)}
                        </p>
                    </UniversalCard>
                );
            }) : (
                <div className="w-full lg:col-span-3 glass-panel rounded-2xl p-12 text-center text-[var(--subtext)] opacity-50 capitalize font-black text-sm tracking-widest border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    {t("system_no_broadcasts")}
                </div>
            )}
        </div>
    );
}


export function CommandScreenMetricTile({ icon, value, label, valueColorClass = "theme-text-accent", hoverBorderClass = "" }: any) {
    return (
        <DashboardStatTile icon={icon} value={value} label={label} colorClass={valueColorClass} />
    );
}

export function CommandScreenQuickLink({ icon, title, subtitle, onClick, dotColorClass = "bg-[var(--accent)] shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]", textColorClass = "text-[var(--accent)]", hoverTextColorClass = "text-[var(--accent)]", iconShadowClass = "drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]", iconBorderHoverClass = "", isAlert = false }: any) {
    return (
        <button onClick={onClick} className="w-full p-5 glass-panel rounded-2xl transition duration-500 text-left group relative h-24 cursor-pointer">
            <div className={`absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden ${isAlert ? 'bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]' : 'bg-radial-[at_0%_0%] from-white/15 to-transparent'}`} />

            <div className="flex items-center gap-4 h-full relative z-10">
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-105 ${isAlert ? 'bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,rgba(255,255,255,0.22))] text-[var(--danger)] shadow-[var(--glass-card-icon-shadow)]' : 'bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] shadow-[var(--glass-card-icon-shadow)] text-[var(--text)] group-hover:text-[var(--accent)]'}`}>
                    <span className={`material-symbols-outlined !text-[25px] opacity-85 group-hover:opacity-100 transition-all duration-300 ${isAlert ? 'animate-pulse' : ''}`}>{icon}</span>
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0 justify-center">
                    <h3 className={`text-[11px] font-[900] uppercase tracking-widest transition-colors duration-500 truncate ${isAlert ? 'text-[var(--danger)] group-hover:brightness-125' : 'text-[var(--text)] group-hover:brightness-125'}`}>{title}</h3>
                    <span className={`text-[9px] capitalize font-bold opacity-75 group-hover:opacity-100 transition-opacity duration-500 tracking-widest flex items-center gap-2 truncate ${isAlert ? 'text-[var(--danger)]' : 'text-[var(--subtext)]'}`}>{subtitle}</span>
                </div>
            </div>
        </button>
    );
}
