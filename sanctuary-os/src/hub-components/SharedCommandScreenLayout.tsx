import React from 'react';
import { useLexicon } from '../LexiconContext';
import { extractPostImage, stripMarkdown } from '../shared';

export function CommandScreenLayout({ children }: any) {
  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pr-4 pb-32 mt-8">
      {children}
    </div>
  );
}

export function CommandScreenStats({ children }: any) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 w-full">
      {children}
    </div>
  );
}

export function CommandScreenBody({ children }: any) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full">
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

export function CommandScreenSidebar({ title, children }: any) {
  const { t } = useLexicon();
  return (
    <div className="w-[380px] shrink-0 flex flex-col">
      <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6">{title}</h2>
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
    <div onClick={() => setViewingPost({ ...urgentBroadcast, content: urgentBroadcast.message || urgentBroadcast.content, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className="w-full theme-glass-panel border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-[var(--radius)] p-6 flex flex-col md:flex-row items-center gap-6 shadow-[0_0_40px_rgba(239,68,68,0.1)] cursor-pointer hover:bg-[var(--danger)]/20 transition-all group overflow-hidden relative backdrop-blur-md">
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--danger)]/5 to-transparent z-0 pointer-events-none" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--danger)]/10 blur-[50px] rounded-full pointer-events-none" />
      <div className="w-16 h-16 rounded-[var(--radius)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 flex items-center justify-center shrink-0 z-10 group-hover:scale-110 transition-transform shadow-inner">
        <span className="material-symbols-outlined !text-4xl text-[var(--danger)] animate-pulse">{t("icon_warning_amber")}</span>
      </div>
      <div className="flex flex-col gap-2 flex-1 z-10">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-[var(--danger)]/20 border border-[var(--danger)]/40 text-[var(--danger)] text-[10px] font-black uppercase tracking-widest rounded-lg shadow-inner animate-pulse flex items-center gap-1"><span className="material-symbols-outlined !text-[12px]"></span>{t("urgent_alert")}</span>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-60 text-[var(--danger)]">{new Date(urgentBroadcast.created_at).toLocaleDateString()}</span>
        </div>
        <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest text-[var(--danger)] group-hover:text-red-400 transition-colors drop-shadow-md">{urgentBroadcast.title}</h3>
      </div>
      <div className="flex items-center gap-2 z-10 ml-auto">
        <button onClick={(e) => { e.stopPropagation(); sessionStorage.setItem('dismissedAlertId', urgentBroadcast.id); setUrgentBroadcast(null); }} className="w-10 h-10 rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] flex items-center justify-center transition-colors shadow-inner backdrop-blur-md hover:scale-110 active:scale-95 group/close" >
          <span className="material-symbols-outlined !text-[20px] group-hover/close:rotate-90 transition-transform duration-300">close</span>
        </button>
      </div>
    </div>
  );
}


export function SystemBroadcastsGrid({ broadcasts, setViewingPost }: any) {
  const { t } = useLexicon();
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
      {broadcasts.length > 0 ? broadcasts.map((post: any, index: number) => {
        const isFeatured = index === 0;
        return (
          <div key={post.id} onClick={() => setViewingPost({ ...post, content: post.message, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className={`group cursor-pointer w-full theme-glass-panel rounded-[var(--radius)] overflow-hidden hover:scale-[1.01] transition-all shadow-xl hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 flex flex-col ${isFeatured ? 'xl:flex-row xl:col-span-2' : 'min-h-[10rem]'}`}>
            {isFeatured && (
              <div className="w-full h-48 xl:h-auto relative overflow-hidden bg-[var(--bg)] border-b xl:w-1/2 xl:border-b-0 xl:border-r border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent z-10 pointer-events-none" />
                {extractPostImage(post) ? (
                  <img src={extractPostImage(post)} className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-luminosity group-hover:scale-105 transition-transform duration-1000" />
                ) : (
                  <span className="material-symbols-outlined !text-6xl grayscale opacity-30 drop-shadow-lg group-hover:scale-110 group-hover:opacity-100 transition-all duration-500 group-hover:grayscale-0 relative z-10">{t("icon_satellite_alt")}</span>
                )}
              </div>
            )}
            <div className="flex-1 p-8 flex flex-col min-w-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--bg)_40%,transparent)] to-transparent relative z-10">
              <div className="flex items-center gap-2 mb-4 shrink-0 flex-wrap">
                <span className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] text-[9px] font-black uppercase tracking-widest rounded-lg">{post.category || t("comms_btn_update") || "UPDATE"}</span>
                <span className="px-3 py-1 theme-glass-inner text-[var(--text)] text-[9px] font-black uppercase tracking-widest rounded-lg">{t("category_system")}</span>
              </div>
              <h3 className="text-xl font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors mb-4 leading-normal line-clamp-4">{post.title}</h3>
              {isFeatured && <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 mb-6 line-clamp-3">{post.description ? post.description : stripMarkdown(post.message)}</p>}
              <div className="mt-auto flex items-center justify-between pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)] flex items-center gap-2"><span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today")}</span> {new Date(post.created_at).toLocaleDateString()}</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 text-[var(--accent)]">{t("wayfinder_read_more")} <span className="material-symbols-outlined !text-lg">{t("icon_arrow_forward")}</span></span>
              </div>
            </div>
          </div>
        );
      }) : (
        <div className="w-full xl:col-span-2 theme-glass-panel rounded-[var(--radius)] p-12 text-center text-[var(--subtext)] opacity-50 uppercase font-black text-sm tracking-widest border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          {t("system_no_broadcasts")}
        </div>
      )}
    </div>
  );
}


export function CommandScreenMetricTile({ value, label, valueColorClass = "theme-text-accent", hoverBorderClass = "hover:border-[var(--accent)]/30" }: any) {
  return (
    <div className={`theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 ${hoverBorderClass} transition-all text-center h-32`}>
      <span className={`text-3xl font-black ${valueColorClass}`}>{value}</span>
      <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{label}</span>
    </div>
  );
}

export function CommandScreenQuickLink({ icon, title, subtitle, onClick, dotColorClass = "bg-[var(--accent)] shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]", textColorClass = "text-[var(--accent)]", hoverTextColorClass = "group-hover:text-[var(--accent)]", iconShadowClass = "drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]", iconBorderHoverClass = "group-hover:border-[var(--accent)]/30", isAlert = false }: any) {
  return (
    <button onClick={onClick} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[var(--radius)] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
      <div className="flex items-center gap-5 h-full relative z-10">
        <div className={`w-12 h-12 rounded-xl theme-glass-inner border flex items-center justify-center shrink-0 transition-colors border-white/10 ${iconBorderHoverClass} ${isAlert ? 'text-[var(--danger)] border-[var(--danger)]/30 group-hover:bg-[var(--danger)]/10 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''}`}>
          <span className={`material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 ${iconShadowClass} ${isAlert ? 'animate-pulse' : ''}`}>{icon}</span>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <h3 className={`text-[11px] font-black uppercase tracking-widest transition-colors truncate ${isAlert ? 'text-[var(--danger)] group-hover:text-red-400' : 'text-[var(--text)] group-hover:text-[var(--accent)]'}`}>{title}</h3>
          <span className={`text-[8px] uppercase font-bold opacity-80 tracking-widest flex items-center gap-2 ${textColorClass} ${hoverTextColorClass}`}>{subtitle}
          </span>
        </div>
      </div>
    </button>
  );
}
