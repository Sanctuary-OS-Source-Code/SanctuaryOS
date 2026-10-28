import React from 'react';
import { useLexicon } from '../LexiconContext';
import { extractPostImage, stripMarkdown, DashboardStatTile, SidePanelContext } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { extractDispatchMetadata, formatDispatchCategory } from '../components/universal/DispatchPollAndMeta';

export { DashboardStatTile };

export function StatTileCarousel({ children, innerClassName = "px-1" }: any) {
    const { t } = useLexicon();
    const isInsideSidePanel = React.useContext(SidePanelContext);
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
        const onWheel = (e: WheelEvent) => {
            if (el.scrollWidth <= el.clientWidth + 2) return;
            const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            if (delta === 0) return;
            e.preventDefault();
            e.stopPropagation();
            el.scrollLeft += delta;
            checkScroll();
        };
        el.addEventListener('scroll', checkScroll, { passive: true });
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            el.removeEventListener('scroll', checkScroll);
            el.removeEventListener('wheel', onWheel);
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
          <div className="absolute left-1.5 inset-y-0 z-20 flex items-center pointer-events-none">
            <button
              type="button"
              onClick={() => scrollBy(-300)}
              className="pointer-events-auto w-8 h-8 p-0 flex items-center justify-center glass-panel border border-[color-mix(in_srgb,var(--text)_20%,transparent)] rounded-xl shadow-xl text-[var(--text)] opacity-85 hover:opacity-100 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[18px] leading-none flex items-center justify-center">
                {t("icon_chevron_left", "chevron_left")}
              </span>
            </button>
          </div>
        )}
        <div
          ref={scrollRef}
          className={`flex w-full overflow-x-auto sa-stat-tile-carousel ${isInsideSidePanel ? "gap-3 md:gap-4 sa-sidepanel-tile-carousel" : "gap-3 md:gap-6"} py-1 items-stretch hide-scrollbar ${innerClassName}`}
        >
          {children}
        </div>
        {canScrollRight && (
          <div className="absolute right-1.5 inset-y-0 z-20 flex items-center pointer-events-none">
            <button
              type="button"
              onClick={() => scrollBy(300)}
              className="pointer-events-auto w-8 h-8 p-0 flex items-center justify-center glass-panel border border-[color-mix(in_srgb,var(--text)_20%,transparent)] rounded-xl shadow-xl text-[var(--text)] opacity-85 hover:opacity-100 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[18px] leading-none flex items-center justify-center">
                {t("icon_chevron_right", "chevron_right")}
              </span>
            </button>
          </div>
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
        <div className="flex flex-col gap-10 md:gap-12 w-full pr-0 md:pr-4 pb-36 md:pb-32">
            {children}
        </div>
    );
}

export function CommandScreenSectionHeading({ 
  title, subtitle, icon, actions, rightContent, onBack, breadcrumb,
  className = "", shape = "circle", 
  colorClass = "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]", 
  iconColorClass = "text-[var(--accent)]" 
}: any) {
  const shapeClass = shape === "square" ? "rounded-lg" : "rounded-xl";
  
  return (
    <div className={`flex items-center justify-between w-full relative z-10 min-w-0 gap-4 ${className}`}>
      <div className="glass-panel rounded-2xl px-3.5 py-2 md:px-4 md:py-2.5 flex items-center gap-3 md:gap-3.5 shrink-0 min-w-0 max-w-full">
        {icon && (
          <div className={`w-8 h-8 md:w-9 md:h-9 ${shapeClass} flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] relative group`}>
            <span className={`material-symbols-outlined !text-[17px] md:!text-[19px] relative z-10 ${iconColorClass}`}>{icon}</span>
          </div>
        )}
        <div className="flex flex-col gap-0.5 items-start justify-center text-left min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 
                onClick={onBack}
                className={`text-sm sm:text-base font-black text-[var(--text)] capitalize tracking-tight leading-tight m-0 truncate min-w-0 ${onBack ? 'cursor-pointer hover:text-[var(--accent)] transition-colors' : ''}`}
            >
              {title}
            </h2>
            {breadcrumb && (
              <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] leading-tight truncate">
                  {breadcrumb}
                </span>
              </div>
            )}
          </div>
          {subtitle && (
            <p className="font-medium tracking-wide text-[10px] opacity-80 m-0 text-[var(--subtext)] leading-snug break-words max-w-full">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="h-px flex-1 min-w-[16px] bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_20%,transparent)] via-[color-mix(in_srgb,var(--text)_8%,transparent)] to-transparent" />
      {(actions || rightContent) && (
        <div className="flex items-center gap-2.5 shrink-0 relative z-10">{actions || rightContent}</div>
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
        <div className="flex flex-col lg:flex-row gap-8 xl:gap-10 w-full min-h-0 flex-1">
            {children}
        </div>
    );
}

export function CommandScreenMain({ children }: any) {
    return (
        <div className="flex-1 flex flex-col gap-10 min-w-0 min-h-0">
            {children}
        </div>
    );
}

export function CommandScreenSidebar({ title, icon, shape = "square", children }: any) {
    const shapeClass = shape === "square" ? "rounded-lg" : "rounded-xl";
    return (
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
            <div className="flex items-center justify-between w-full relative z-10 min-w-0 gap-4">
                <div className="glass-panel rounded-2xl px-3.5 py-2 md:px-4 md:py-2.5 flex items-center gap-3 md:gap-3.5 shrink-0 min-w-0 max-w-full">
                    {icon && (
                        <div className={`w-8 h-8 md:w-9 md:h-9 ${shapeClass} flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] relative group`}>
                            <span className="material-symbols-outlined !text-[17px] md:!text-[19px] relative z-10 theme-text-accent">{icon}</span>
                        </div>
                    )}
                    <h2 className="text-sm sm:text-base font-black capitalize tracking-tight text-[var(--text)] m-0 p-0 text-left leading-tight min-w-0 truncate">
                        {title}
                    </h2>
                </div>
                <div className="h-px flex-1 min-w-[16px] bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_20%,transparent)] via-[color-mix(in_srgb,var(--text)_8%,transparent)] to-transparent" />
            </div>
            <div className="flex flex-col gap-4">
                {children}
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
                        icon={!extractPostImage(post) ? t("icon_satellite_alt", "satellite_alt") : undefined}
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
                                    <span className="text-[var(--subtext)]">{t("category_system", "System")}</span>
                                </div>
                            </>
                        }
                        footer={
                            <div className="flex items-center justify-between w-full mt-2">
                                <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                                    <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today", "calendar_today")}</span> {new Date(post.created_at).toLocaleDateString()}
                                </span>
                                <span className="text-[10px] font-black capitalize tracking-widest opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
                                    {t("wayfinder_read_more", "Read More")} <span className="material-symbols-outlined !text-sm">{t("icon_arrow_forward", "arrow_forward")}</span>
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
                    {t("system_no_broadcasts", "No Recent Posts")}
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
            <div className="absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden bg-radial-[at_0%_0%] from-white/15 to-transparent" />

            <div className="flex items-center gap-4 h-full relative z-10">
                <div className={`w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-105 ${isAlert ? 'text-[var(--danger)]' : 'text-[var(--text)] group-hover:text-[var(--accent)]'}`}>
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
