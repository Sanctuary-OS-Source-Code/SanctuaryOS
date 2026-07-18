import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { SidePanel, CustomDropdown, extractPostImage, stripMarkdown, EmptyState } from '../shared';
import MasonPostViewer from "./MasonPostViewer";
import { useStore } from '../store';

export function SanctuaryAlertsSidePanel({ isOpen, onClose, audience }: { isOpen: boolean, onClose: () => void, audience?: string }) {
  const { t } = useLexicon();
  const session = useStore(state => state.session);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("Active");
  const [filterCategory, setFilterCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingPost, setViewingPost] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    const fetchPosts = async () => {
      setLoading(true);
      let query = supabase.from('system_broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (audience) {
        query = query.or(`target_audience.ilike.%All%,target_audience.eq.${audience},target_audience.ilike."${audience},%",target_audience.ilike."%,${audience},%",target_audience.ilike."%,${audience}"`);
      }

      if (filterStatus === "Active") {
        query = query.eq('is_active', true);
      } else if (filterStatus === "Inactive") {
        query = query.eq('is_active', false);
      }

      if (filterCategory !== "All") {
        query = query.eq('category', filterCategory);
      } else {
        query = query.in('category', ['Alert', 'Game Version Alert', 'Malware Alert', 'Artifact Alert']);
      }

      const { data } = await query;

      if (data) setPosts(data);
      setLoading(false);
    };
    fetchPosts();
  }, [isOpen, filterStatus, filterCategory]);

  const filteredPosts = useMemo(() => {
    return [...posts].filter(p => !searchQuery || (p.title?.toLowerCase().includes(searchQuery.toLowerCase()) || p.message?.toLowerCase().includes(searchQuery.toLowerCase()))).sort((a, b) => {
      const aPinned = a.is_pinned === true || a.is_pinned === "true";
      const bPinned = b.is_pinned === true || b.is_pinned === "true";
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [posts, searchQuery]);

  const isPostPinned = (p: any) => p?.is_pinned === true || p?.is_pinned === "true";
  const hasActiveAlert = posts.some(isPostPinned);

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        icon={hasActiveAlert ? "priority_high" : "warning_off"}
        widthClass="w-[1000px]"
        panelClass={hasActiveAlert ? "danger-accent-override" : undefined}
        title={t("title_sanctuary_alerts") || "Sanctuary Alerts"}
        subtitle={t("subtitle_sanctuary_alerts") || "System Broadcasts & Urgent Alerts"}
      >
        <div className="flex flex-col h-full relative z-10">
          <div className="p-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 z-10 relative">
            <h2 className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined !text-[14px]">filter_list</span>
              {t("ui_btn_filter")}
            </h2>
            <div className="flex items-center gap-4 flex-1 justify-end">
              <div className="w-64 relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] !text-[18px]">search</span>
                <input
                  type="text"
                  placeholder={t("ui_placeholder_search") || "Search alerts..."}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-12 bg-black/20 border border-white/5 rounded-xl pl-12 pr-4 text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)]/50 transition-all placeholder-[var(--subtext)]"
                />
              </div>
              <div className="w-max min-w-48 max-w-xs">
                <CustomDropdown disableTint={true}
                  value={filterCategory}
                  onChange={(v: string[]) => setFilterCategory(v[0])}
                  options={[
                    { id: "All", label: t("all_classes") || "All Categories" },
                    { id: "Alert", label: t("category_alert") || "Alert" },
                    { id: "Game Version Alert", label: t("category_game_version_alert") || "Game Version Alert" },
                    { id: "Malware Alert", label: t("category_malware_alert") || "Malware Alert" },
                    { id: "Artifact Alert", label: t("category_artifact_alert") || "Artifact Alert" }
                  ]}
                />
              </div>
              <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl border border-white/5 shadow-inner h-12 shrink-0 divide-x divide-white/5">
                <button onClick={() => setFilterStatus('Active')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === 'Active' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("status_active") || "Active"}</button>
                <button onClick={() => setFilterStatus('Inactive')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === 'Inactive' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("status_inactive") || "Inactive"}</button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-transparent">
            <div className="p-6 h-full flex flex-col">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 opacity-50">
                  <span className="material-symbols-outlined animate-spin-slow !text-4xl text-[var(--accent)] mb-4">sync</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">{t("ui_loading")}</span>
                </div>
              ) : filteredPosts.length === 0 ? (
                <EmptyState icon="satellite_alt" title={t("system_no_broadcasts")} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredPosts.map(post => {
                    const isPinned = isPostPinned(post);
                    const isInactive = !post.is_active;
                    return (
                      <div key={post.id} onClick={() => setViewingPost({ ...post, content: post.message, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className={`theme-glass-panel p-6 rounded-[var(--radius)] cursor-pointer relative group flex flex-col gap-4 transition-all duration-500 hover:-translate-y-1 shadow-lg backdrop-blur-3xl overflow-hidden ${isPinned ? '!border-[var(--danger)]/50 shadow-[0_10px_30px_rgba(239,68,68,0.15)]' : 'border border-white/5 hover:border-white/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]'} ${isInactive ? 'opacity-60 hover:opacity-100 grayscale-[50%]' : ''}`}>
                        <div className={`absolute -top-32 -right-32 w-64 h-64 blur-[80px] rounded-full pointer-events-none transition-opacity duration-700 z-0 ${isPinned ? 'bg-[var(--danger)] opacity-20' : 'bg-[var(--text)] opacity-0 group-hover:opacity-[0.03]'}`} />

                        <div className="flex justify-between items-start z-10 relative">
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              {isPinned && (
                                <span className="px-3 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/30 shadow-inner flex items-center gap-1">
                                  {t("urgent_alert") || "Urgent Alert"}
                                </span>
                              )}
                              <span className={`px-3 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner ${isPinned ? 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20' : 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20'}`}>
                                {post.category || t("comms_btn_update") || "UPDATE"}
                              </span>
                              {isInactive && (
                                <span className="px-3 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner bg-black/40 text-[var(--subtext)] border-white/10">
                                  {t("status_inactive") || "Inactive"}
                                </span>
                              )}
                            </div>
                            <h3 className={`font-black text-xl leading-tight uppercase tracking-widest line-clamp-4 transition-colors ${isPinned ? 'text-[var(--danger)] group-hover:text-red-400' : 'text-[var(--text)] group-hover:text-[var(--accent)]'}`}>
                              {post.title}
                            </h3>
                          </div>
                          <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 bg-white/5 text-[var(--subtext)] border-white/10 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity`}>
                            <span className="material-symbols-outlined !text-[14px]">calendar_today</span>
                            {new Date(post.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        {extractPostImage(post) && (
                          <div className="w-full h-32 rounded-xl overflow-hidden relative border border-white/5 shadow-inner mt-2 z-10 bg-[var(--bg)]">
                            <div className="absolute inset-0 bg-[var(--danger)]/20 z-0" />
                            <div className="absolute inset-0 bg-gradient-to-br from-[var(--danger)]/20 to-transparent z-10 pointer-events-none" />
                            <img src={extractPostImage(post)} className="w-full h-full object-cover relative z-0 opacity-60 mix-blend-luminosity group-hover:scale-105 group-hover:mix-blend-normal group-hover:opacity-100 transition-all duration-700" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent opacity-80 z-10 pointer-events-none" />
                          </div>
                        )}

                        <p className="text-xs text-[var(--subtext)] line-clamp-3 leading-relaxed font-bold z-10 relative opacity-80 group-hover:opacity-100 transition-opacity">
                          {post.description ? post.description : stripMarkdown(post.message)}
                        </p>

                        <div className="flex justify-between items-center mt-2 pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] gap-4 relative z-10">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60 shrink-0">
                              <span className="material-symbols-outlined !text-[14px]">groups</span>
                              {(post.target_audience || "All Elevated").split(',').map((a: string) => a.trim() === 'Senior Architects' ? 'Oversight' : a.trim()).join(', ')}
                            </span>
                          </div>
                          <button className={`text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 shrink-0 ${isPinned ? 'text-[var(--danger)] group-hover:text-red-400' : 'text-[var(--text)] group-hover:text-[var(--accent)]'} opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0`}>
                            {t("wayfinder_read_more")} <span className="text-lg leading-none">&rarr;</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </SidePanel>
      {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId={session?.user?.id || null} />}
    </>
  );
}

