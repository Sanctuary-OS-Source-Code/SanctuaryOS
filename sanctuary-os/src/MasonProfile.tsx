import { openUrl } from '@tauri-apps/plugin-opener';
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";

function CustomCategoryDropdown({ value, onChange }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const options = [
    { id: "ALL", label: t("profile_all_classes"), icon: t("ui_icon_folder") },
    { id: "Script", label: t("profile_script"), icon: t("ui_icon_scroll") },
    { id: "BuildBuy", label: t("profile_buildbuy"), icon: t("ui_icon_couch") },
    { id: "CAS", label: t("profile_cas"), icon: t("ui_icon_shirt") },
    { id: "Animation", label: t("profile_animation"), icon: t("ui_icon_clapper") }
  ];
  const selected = options.find(o => o.id === value) || options[0];

  return (
    <div className="relative z-50">
      <button onClick={() => setIsOpen(!isOpen)} className="theme-glass-inner rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-widest focus:outline-none flex justify-between items-center transition-all text-[var(--text)] min-w-[160px]">
        <div className="flex items-center gap-2"><span>{selected.icon}</span> {selected.label}</div>
        <span className="text-[var(--subtext)] opacity-60 ml-4">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          {options.map(opt => (
            <button key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); }} className="w-full text-left flex items-center gap-2 px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-all hover:bg-white/5 text-[var(--text)]">
              <span>{opt.icon}</span> {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export default function MasonProfile({ masonId, initialPostId, onModClick }: { masonId: string, initialPostId?: string | null, onModClick: (mod: any) => void }) {
  const { t } = useLexicon();
  const [mason, setMason] = useState<any>(null);
  const [mods, setMods] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [modSearch, setModSearch] = useState("");
  const [modCategory, setModCategory] = useState("ALL");
  const [lastInitialPostId, setLastInitialPostId] = useState<string | null>(null);

  useEffect(() => {
    if (initialPostId && initialPostId !== lastInitialPostId && posts.length > 0) {
      const target = posts.find(p => p.id === initialPostId);
      if (target) {
        setSelectedPost(target);
        setLastInitialPostId(initialPostId);
      }
    }
  }, [initialPostId, posts, lastInitialPostId]);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || null;
      setUserId(currentUserId);

      const { data: mData } = await supabase.from('masons').select('*').eq('id', masonId).single();
      if (mData) setMason(mData);

      const { data: modsData } = await supabase.from('mods').select('*').eq('mason_id', masonId).order('name');
      if (modsData) {
        const matureEnabled = localStorage.getItem("sanctuary_mature_transmissions") === "true";
        setMods(modsData.filter((m: any) => {
          if (m.compliance_tier > 1) return false;
          if (!matureEnabled && m.compliance_tier > 0) return false;
          return true;
        }));
      }

      const { data: postsData } = await supabase.from('mason_posts').select('*').eq('mason_id', masonId).order('created_at', { ascending: false });
      if (postsData) setPosts(postsData);

      const { count } = await supabase.from('mason_followers').select('*', { count: 'exact', head: true }).eq('mason_id', masonId);
      setFollowerCount(count || 0);

      if (currentUserId) {
        const { data: followData } = await supabase.from('mason_followers').select('*').eq('mason_id', masonId).eq('user_id', currentUserId).maybeSingle();
        setIsFollowing(!!followData);
      }

      setLoading(false);
    }
    if (masonId) loadProfile();
  }, [masonId]);

  const toggleFollow = async () => {
    if (!userId) { alert("You must be logged in to follow Masons."); return; }
    if (isFollowing) {
      await supabase.from('mason_followers').delete().match({ user_id: userId, mason_id: masonId });
      setFollowerCount(prev => prev - 1);
      setIsFollowing(false);
    } else {
      await supabase.from('mason_followers').insert({ user_id: userId, mason_id: masonId });
      setFollowerCount(prev => prev + 1);
      setIsFollowing(true);
    }
  };

  if (loading) return <div className="p-12 text-center theme-text-accent animate-pulse font-black tracking-widest uppercase">{t("profile_accessing")}</div>;
  if (!mason) return <div className="p-12 text-center text-[var(--subtext)] opacity-60 font-black tracking-widest uppercase">{t("profile_not_found")}</div>;

  const filteredMods = mods.filter(m => {
     if (modCategory !== "ALL" && m.category_override !== modCategory) return false;
     if (modSearch && !m.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
     return true;
  });

const parsePostContent = (post: any) => {
  let content = post.content || '';
  let imageUrl = post.image_url || '';
  if (content.startsWith('[IMG:')) {
    const endIdx = content.indexOf(']');
    if (endIdx !== -1) {
      imageUrl = content.substring(5, endIdx);
      content = content.substring(endIdx + 1).trim();
    }
  }
  return { content, imageUrl };
};

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full w-full pb-20">

      <div className="theme-glass-panel border border-white/10 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center md:items-start gap-8">
        <div className="absolute top-0 right-0 w-64 h-64 theme-bg-accent opacity-10 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="w-32 h-32 shrink-0 rounded-full border-4 theme-border-accent flex items-center justify-center overflow-hidden theme-glass-inner shadow-lg relative z-10">
          {mason.avatar_url ? (
            <img src={mason.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-5xl opacity-50">{t("ui_icon_mason")}</span>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left relative z-10 min-w-0">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-4xl font-black text-[var(--text)] uppercase tracking-tighter truncate">{mason.name}</h1>
            {mason.is_verified && <span className="theme-bg-success text-[var(--bg)] px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">{t("status_verified")}</span>}
          </div>
          <p className="text-sm font-medium text-[var(--subtext)] opacity-80 max-w-2xl leading-relaxed mb-6">{mason.bio || t("profile_no_bio")}</p>
          
          <div className="flex flex-wrap items-center gap-4 pb-2">
            <button onClick={toggleFollow} className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg ${isFollowing ? 'theme-btn-standard' : 'theme-bg-accent text-[var(--bg)] hover:scale-105 active:scale-95'}`}>
              {isFollowing ? t("profile_btn_unfollow") : t("profile_btn_follow")}
            </button>
            <div className="px-5 py-3 theme-glass-inner rounded-xl flex items-center gap-3">
              <span className="text-[10px] text-[var(--subtext)] opacity-60 uppercase font-bold tracking-widest">{t("profile_followers")}</span>
              <span className="text-sm font-black theme-text-accent">{followerCount}</span>
            </div>
            {mason.patreon_url && (
              <button onClick={() => openUrl(mason.patreon_url)} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/5 transition-all text-lg">{t("ui_icon_patreon")}</button>
            )}
            {mason.website_url && (
              <button onClick={() => openUrl(mason.website_url)} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/5 transition-all text-lg">{t("ui_icon_web")}</button>
            )}
            {mason.discord_url && (
              <button onClick={() => openUrl(mason.discord_url)} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/5 transition-all text-lg">{t("ui_icon_chat")}</button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-full">
        
        <div className="w-full lg:w-1/3 flex flex-col gap-4">
          <h3 className="text-xs font-black theme-text-accent uppercase tracking-widest ml-2 flex items-center gap-2">
            <span>{t("ui_icon_broadcast")}</span> {t("profile_tab_commlink")}
          </h3>
          <div className="flex-1 theme-glass-panel rounded-[2rem] rounded-[2rem] p-6 shadow-2xl overflow-y-auto custom-scrollbar flex flex-col gap-4">
            {posts.length === 0 && <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("profile_no_posts")}</div>}
            {posts.map(post => (
              <div key={post.id} onClick={() => setSelectedPost(post)} className="theme-glass-inner p-5 rounded-2xl flex flex-col gap-2 cursor-pointer hover:border-white/20 transition-all hover:scale-[1.02]">
                {post.image_url && <img src={post.image_url} className="w-full h-24 object-cover rounded-xl mb-2" alt="Post Cover" />}
                <div className="flex justify-between items-start gap-4">
                  <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-tight leading-tight">{post.title}</h4>
                  <span className="text-[8px] font-mono text-[var(--subtext)] opacity-60 shrink-0 mt-1">{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed whitespace-pre-wrap mt-2 line-clamp-3">{post.content}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full lg:w-2/3 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4 ml-2">
             <h3 className="text-xs font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-2">
               <span>{t("ui_icon_collection")}</span> {t("profile_tab_artifacts")}
             </h3>
             <div className="flex gap-2">
                <input value={modSearch} onChange={e => setModSearch(e.target.value)} placeholder={t("ui_search_placeholder")} className="theme-glass-inner rounded-xl px-4 py-2 text-[var(--text)] text-[10px] font-bold focus:outline-none focus:theme-border-accent w-40" />
                <CustomCategoryDropdown value={modCategory} onChange={setModCategory} />
             </div>
          </div>
          <div className="flex-1 theme-glass-panel rounded-[2rem] rounded-[2rem] p-6 shadow-2xl overflow-y-auto custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
            {filteredMods.length === 0 && <div className="col-span-full text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("profile_no_mods")}</div>}
            {filteredMods.map(mod => (
              <div key={mod.id} onClick={() => onModClick({...mod, author: mason.name})} className="theme-glass-inner p-4 rounded-2xl flex items-center gap-4 cursor-pointer hover:theme-border-accent group transition-all">
                <div className="w-12 h-12 rounded-xl theme-glass-panel overflow-hidden shrink-0">
                  {mod.image_url ? <img src={mod.image_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" /> : <div className="w-full h-full flex items-center justify-center opacity-30">{t("ui_icon_package")}</div>}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-[var(--text)] uppercase tracking-tight truncate">{mod.name}</span>
                  <span className={`text-[8px] font-bold uppercase tracking-widest mt-1 ${mod.status === 'verified' ? 'theme-text-success' : 'text-[var(--subtext)] opacity-60'}`}>{mod.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedPost && (() => {
        const parsed = parsePostContent(selectedPost);
        return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in p-6">
           <div className="w-full max-w-2xl bg-[var(--sidebar)] border border-white/10 rounded-[3rem] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
              {parsed.imageUrl && <img src={parsed.imageUrl} className="w-full h-64 object-cover" alt="Post Cover" />}
              <div className="p-8 flex flex-col overflow-y-auto custom-scrollbar flex-1 gap-6">
                 <div>
                    <h2 className="text-3xl font-black uppercase text-[var(--text)] tracking-tighter leading-none mb-2">{selectedPost.title}</h2>
                    <p className="text-[10px] font-mono theme-text-accent">{new Date(selectedPost.created_at).toLocaleString()}</p>
                 </div>
                 <p className="text-sm font-medium text-gray-300 leading-relaxed whitespace-pre-wrap">{parsed.content}</p>
              </div>
              <div className="p-6 theme-glass-inner border-t border-white/5 flex justify-end">
                 <button onClick={() => setSelectedPost(null)} className="px-8 py-3 bg-white/10 hover:bg-white/20 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl transition-all">{t("mason_btn_close_post")}</button>
              </div>
           </div>
        </div>
        ); })()}

    </div>
  );
}