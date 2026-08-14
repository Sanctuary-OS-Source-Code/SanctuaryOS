import React from 'react';
import { useLexicon } from '../LexiconContext';
import { extractPostImage, stripMarkdown, DashboardStatTile } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';

export { DashboardStatTile };

export function CommandScreenLayout({ children }: any) {
    return (
        <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pr-4 pb-32">
            {children}
        </div>
    );
}

export function CommandScreenSectionHeading({ 
  title, subtitle, icon, actions, rightContent, 
  className = "", shape = "circle", 
  colorClass = "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]", 
  iconColorClass = "theme-text-accent" 
}: any) {
  const { t } = useLexicon();
  const shapeClass = shape === "square" ? "rounded-lg" : "rounded-full";
  
  return (
    <div className={`flex justify-start items-center border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-6 w-full mb-8 relative z-10 ${className}`}>
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-[var(--accent)]/50 to-transparent" />
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {icon && (
     <div className={`w-12 h-12 ${shapeClass} flex items-center justify-center shrink-0 border glass-panel relative group shadow-md`}>
            <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className={`material-symbols-outlined !text-[24px] relative z-10 ${iconColorClass}`}>{icon}</span>
          </div>
        )}
        <div className="flex flex-col gap-1 items-start text-left flex-1 min-w-0">
          <h2 className="text-2xl font-black text-[var(--text)] capitalize tracking-widest drop-shadow-lg m-0 truncate">
            {title}
          </h2>
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

export function CommandScreenStats({ children }: any) {
    const validCount = React.Children.toArray(children).filter(Boolean).length;
    
    let gridClass = "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
    if (validCount === 4) gridClass = "grid-cols-2 lg:grid-cols-4";
    else if (validCount === 3) gridClass = "grid-cols-1 md:grid-cols-3";
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
    const shapeClass = shape === "square" ? "rounded-lg" : "rounded-full";
    return (
        <div className="w-[380px] shrink-0 flex flex-col">
            <div className="flex items-center gap-4 mb-6 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-6 relative z-10 w-full">
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-[var(--accent)]/50 to-transparent" />
                {icon && (
          <div className={`w-12 h-12 ${shapeClass} flex items-center justify-center shrink-0 border glass-panel relative group shadow-md`}>
                        <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="material-symbols-outlined !text-[24px] relative z-10 theme-text-accent">{icon}</span>
                    </div>
                )}
                <h2 className="text-xl font-black capitalize tracking-widest text-[var(--text)] m-0 p-0 text-left truncate flex-1 min-w-0">
                    {title}
                </h2>
            </div>
            <div className="flex flex-col gap-4">
                {children}
            </div>
        </div>
    );
}


export function UrgentBroadcastBanner({ urgentBroadcast, setViewingPost, setUrgentBroadcast }: any) {
    const { t } = useLexicon();
    if (!urgentBroadcast || localStorage.getItem("sanctuary_notify_alert_banner") === "false") return null;

    return (
    <div onClick={() => setViewingPost({ ...urgentBroadcast, content: urgentBroadcast.message || urgentBroadcast.content, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className="w-full glass-panel rounded-[1.25rem] p-5 md:p-6 flex flex-col md:flex-row items-center gap-6 shadow-xl hover:shadow-2xl cursor-pointer transition-all duration-700 ease-out group relative border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_60%,transparent)]">
            <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] z-0 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
            
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--danger)_50%,transparent)] to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="w-14 h-14 rounded-[1rem] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] flex items-center justify-center shrink-0 z-10 group-hover:scale-110 transition-transform duration-500 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--danger)_20%,transparent)]">
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
                    className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition-colors opacity-50 hover:opacity-100"
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
                        imageOverlay={
                            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                                <span className="px-2 py-0.5 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] text-[9px] font-black capitalize tracking-widest rounded-lg backdrop-blur-md">{post.category || t("comms_btn_update") || "UPDATE"}</span>
                                <span className="px-2 py-0.5 glass-surface text-[var(--text)] text-[9px] font-black capitalize tracking-widest rounded-lg backdrop-blur-md">{t("category_system")}</span>
                            </div>
                        }
                        footer={
                            <div className="flex items-center justify-start w-full mt-2">
                                <span className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2">
                                    <span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today")}</span> {new Date(post.created_at).toLocaleDateString()}
                                </span>
                                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-[var(--accent)]">
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
                <div className="w-full lg:col-span-3 glass-panel rounded-[var(--radius)] p-12 text-center text-[var(--subtext)] opacity-50 capitalize font-black text-sm tracking-widest border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
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
        <button onClick={onClick} className={`w-full p-5 glass-panel rounded-[1.25rem] transition duration-500 text-left group relative h-24 shadow-md ${isAlert ? 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_15%,transparent)]'}`}>
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-[inherit] overflow-hidden ${isAlert ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]' : 'bg-radial-[at_0%_0%] from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent'}`} />

            <div className="flex items-center gap-4 h-full relative z-10">
                <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-110 shadow-[inset_0_0_15px_color-mix(in_srgb,var(--text)_5%,transparent)] border ${isAlert ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] group-hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--text)] group-hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:shadow-[0_0_20px_color-mix(in_srgb,var(--text)_15%,transparent)]'}`}>
                    <span className={`material-symbols-outlined !text-[28px] opacity-80 group-hover:opacity-100 transition-all duration-300 ${isAlert ? 'animate-pulse drop-shadow-[0_0_10px_currentColor]' : 'group-hover:drop-shadow-[0_0_10px_currentColor]'}`}>{icon}</span>
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0 justify-center">
                    <h3 className={`text-[11px] font-[900] uppercase tracking-widest transition-colors duration-500 truncate ${isAlert ? 'text-[var(--danger)] group-hover:text-red-400' : 'text-[var(--text)] group-hover:brightness-125'}`}>{title}</h3>
                    <span className={`text-[9px] capitalize font-bold opacity-70 group-hover:opacity-100 transition-opacity duration-500 tracking-widest flex items-center gap-2 truncate ${isAlert ? 'text-[var(--danger)]' : 'text-[var(--subtext)]'}`}>{subtitle}</span>
                </div>
            </div>
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        </button>
    );
}

