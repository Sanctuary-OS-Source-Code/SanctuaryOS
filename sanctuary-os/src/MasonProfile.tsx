import { handleOpenUrl, getFileLabel, formatDisplayName, getModIcon, processModsIntoCollections } from './shared';
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";
import MarkdownRenderer from "./MarkdownRenderer";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { stripMarkdown, SidePanel, standardPrimaryButtonClass, standardButtonClass, standardAccentGlassButtonClass, CustomDropdown, HubTabButton, compareVersions } from "./shared";
import MasonPostCard from "./MasonPostCard";
import { readDir, readTextFile, exists } from '@tauri-apps/plugin-fs';

const cleanModName = (raw: string) => {
  if (!raw) return { name: "Unknown Mod", ext: "UNKNOWN" };
  const parts = raw.split(/[/\\]/);
  const filename = parts[parts.length - 1];
  let ext = "PACKAGE";
  let name = filename;
  if (getFileLabel(filename, useStore.getState().activeGameSchema) === "SCRIPT") {
    ext = "SCRIPT";
    name = filename.substring(0, filename.length - 10);
  } else if (getFileLabel(filename, useStore.getState().activeGameSchema) === "PACKAGE") {
    name = filename.substring(0, filename.length - 8);
  } else if (filename.includes('.')) {
    const splitExt = filename.split('.');
    ext = splitExt[splitExt.length - 1].toUpperCase();
    name = splitExt.slice(0, -1).join('.');
  }
  return { name: name.replace(/_/g, ' '), ext };
};

const getModUrl = (mod: any) => {
  if (mod.url && mod.url.trim() !== '') return mod.url;
  const parts = (mod.name || "").split(/[/\\]/);
  const filename = parts[parts.length - 1] || "";
  const searchName = formatDisplayName(filename, undefined, useStore.getState().activeGameSchema) || mod.name;
  return `https://www.google.com/search?q=${encodeURIComponent(searchName + ' ' + (useStore.getState().activeGameSchema?.display_name || "Game") + ' mod')}`;
};

export default function MasonProfile({ masonId, initialPostId, onModClick, syncBlueprintByCode }: { masonId: string, initialPostId?: string | null, onModClick: (mod: any) => void, syncBlueprintByCode?: (code: string) => void }) {
  const { t, importLexicon, registry, onSetStatus } = useLexicon();
  const { importTheme, CORE_THEMES, customThemes } = useTheme();
  const selectedVersion = useStore(state => state.selectedVersion);
  const activeGameSchema = useStore(state => state.activeGameSchema);

  const [installedTemplates, setInstalledTemplates] = useState<Record<string, string>>({});
  const vaultPath = useStore((state) => state.vaultPath);

  useEffect(() => {
    const fetchLocalTemplates = async () => {
      try {
        if (!vaultPath) return;
        const templatesDir = `${vaultPath}\\Data\\Templates`;
        if (await exists(templatesDir)) {
          const files = await readDir(templatesDir);
          const map: Record<string, string> = {};
          for (const file of files) {
            if (file.name?.endsWith('_template.json')) {
              try {
                const content = await readTextFile(`${templatesDir}\\${file.name}`);
                const parsed = JSON.parse(content);
                const d = Array.isArray(parsed) ? parsed[0] : parsed;
                if (d.name) {
                  map[d.name] = d.version || '1.0.0';
                }
              } catch { }
            }
          }
          setInstalledTemplates(map);
        }
      } catch { }
    };
    fetchLocalTemplates();
  }, [vaultPath]);

  const isInstalled = (asset: any) => {
    if (!asset) return false;
    if (asset.asset_type === 'chameleon') {
      return Object.values({ ...CORE_THEMES, ...customThemes }).some((th: any) => th.name === asset.name);
    } else if (asset.asset_type === 'workbench_template') {
      return !!installedTemplates[asset.name];
    } else if (asset.asset_type === 'lexicon') {
      return !!registry?.[asset.name];
    }
    return false;
  };

  const getLocalVersion = (asset: any) => {
    if (!asset) return null;
    if (asset.asset_type === 'chameleon') {
      const theme = Object.values({ ...CORE_THEMES, ...customThemes }).find((th: any) => th.name === asset.name) as any;
      return theme?.version || '1.0.0';
    } else if (asset.asset_type === 'workbench_template') {
      return installedTemplates[asset.name];
    } else if (asset.asset_type === 'lexicon') {
      const lex = registry?.[asset.name];
      return lex?._meta_version || '1.0.0';
    }
    return null;
  };

  const getAssetDisplayVersion = (asset: any) => {
    let version = asset.version || '1.0.0';
    if (asset.asset_type === 'workbench_template' && asset.json_data) {
      try {
        const parsedRaw = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
        const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
        if (parsed && parsed.template_version) {
          version = parsed.template_version;
        }
      } catch (e) {}
    }
    return version;
  };

  const isOutdated = (asset: any) => {
    if (!isInstalled(asset)) return false;
    const localVersion = getLocalVersion(asset);
    return compareVersions(getAssetDisplayVersion(asset), localVersion) > 0;
  };

  const [mason, setMason] = useState<any>(null);
  const [mods, setMods] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllPosts, setShowAllPosts] = useState(false);
  const [modPage, setModPage] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);

  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [modSearch, setModSearch] = useState("");
  const [modCategory, setModCategory] = useState("ALL");
  const [marketAssets, setMarketAssets] = useState<any[]>([]);
  const [profileTab, setProfileTab] = useState<string>("MODS");
  const [lastInitialPostId, setLastInitialPostId] = useState<string | null>(null);

  const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);
  const [gameVersions, setGameVersions] = useState<string[]>([]);
  const [selectedGameVersion, setSelectedGameVersion] = useState<string>(selectedVersion || "ALL");

  const [masonAlerts, setMasonAlerts] = useState<Record<string, boolean>>(() => JSON.parse(localStorage.getItem("sanctuary_mason_alerts") || "{}"));

  const toggleMasonAlert = () => {
    const newAlerts = { ...masonAlerts, [masonId]: !masonAlerts[masonId] };
    setMasonAlerts(newAlerts);
    localStorage.setItem("sanctuary_mason_alerts", JSON.stringify(newAlerts));
  };

  useEffect(() => {
    async function loadVersions() {
      const { data } = await supabase.from('game_versions').select('version').order('version', { ascending: false });
      if (data) setGameVersions(data.map(v => v.version));
    }
    loadVersions();
  }, []);

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

      const { data: modsDataRaw } = await supabase.from('mods').select('*').eq('mason_id', masonId).order('name');
      
      const [
        flavorGroupsRes,
        collectionsRes,
        relationshipsRes,
        flavorMembersRes,
        setMembersRes
      ] = await Promise.all([
        supabase.from("flavor_groups").select("*"),
        supabase.from("collections").select("*"),
        supabase.from("mod_relationships").select("parent_id, child_id, relationship_type").in("relationship_type", ["twin", "addon", "flavor", "set_item", "beta"]),
        supabase.from("flavor_group_members").select("group_id, mod_hash"),
        supabase.from("collection_members").select("set_id, mod_id")
      ]);

      if (modsDataRaw) {
        const matureEnabled = localStorage.getItem("sanctuary_mature_transmissions") === "true";
        const filteredModsRaw = modsDataRaw.filter((m: any) => {
          if (m.compliance_tier > 1) return false;
          if (!matureEnabled && m.compliance_tier > 0) return false;
          if (m.hash?.startsWith('dev_sandbox_') || m.status?.toLowerCase().includes('sandbox')) return false;
          return true;
        });
        
        const groupedMods = processModsIntoCollections(
          filteredModsRaw,
          flavorGroupsRes?.data || [],
          collectionsRes?.data || [],
          relationshipsRes?.data || [],
          flavorMembersRes?.data || [],
          setMembersRes?.data || []
        );
        
        setMods(groupedMods);
      }

      const { data: postsData } = await supabase.from('mason_posts').select('*, masons(name, patreon_url, discord_url, website_url, profile_id), likes:mason_post_likes(count), views:mason_post_views(count), comments:mason_post_comments(count)').eq('mason_id', masonId).order('created_at', { ascending: false });
      if (postsData) setPosts(postsData);

      if (mData) {
        let orQuery = `author.ilike.%${mData.name}%`;
        const fallbackName = session?.user?.user_metadata?.username;
        if (fallbackName) {
          orQuery += `,author.ilike.%${fallbackName}%`;
        }
        const { data: assetsData } = await supabase.from('nexus_assets').select('*').or(orQuery).or('is_public.eq.true,is_public.is.null').order('created_at', { ascending: false });
        const { data: blueprintsData } = await supabase.from('blueprints').select('*').eq('mason_id', masonId).eq('is_market_listed', true).order('created_at', { ascending: false });

        let newAssets = assetsData || [];
        if (blueprintsData) {
          newAssets = [
            ...newAssets,
            ...blueprintsData.map(b => ({
              id: b.id,
              name: b.name,
              author: mData.name,
              description: (b.artifacts?.length || 0) + (t("items")),
              created_at: b.created_at,
              asset_type: 'blueprint',
              json_data: b
            }))
          ];
        }
        setMarketAssets(newAssets);
      }

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
    if (!userId) { useStore.getState().pushStatus(t("auto_guest_mode_active_45")); return; }
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

  if (loading) return <div className="p-12 text-center theme-text-accent animate-pulse font-black tracking-widest uppercase">{t("accessing")}</div>;
  if (!mason) return <div className="p-12 text-center text-[var(--subtext)] opacity-60 font-black tracking-widest uppercase">{t("not_found")}</div>;

  const filteredMods = mods.filter(m => {
    if (modCategory !== "ALL" && m.category_override !== modCategory) return false;
    if (modSearch && !m.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
    return true;
  });

  const modsPerPage = 12;
  const paginatedMods = filteredMods.slice((modPage - 1) * modsPerPage, modPage * modsPerPage);
  const totalModPages = Math.ceil(filteredMods.length / modsPerPage);

  const handleToggleLike = async (e: React.MouseEvent, post: any) => {
    e.stopPropagation();
    if (!userId) return useStore.getState().pushStatus(t("auto_guest_mode_active_45"));

    const { error } = await supabase.from('mason_post_likes').insert({ post_id: post.id, user_id: userId });
    let increment = 1;
    if (error && error.code === '23505') {
      await supabase.from('mason_post_likes').delete().match({ post_id: post.id, user_id: userId });
      increment = -1;
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: [{ count: Math.max(0, (p.likes?.[0]?.count || 0) + increment) }] } : p));
  };

  const handlePostClick = async (post: any) => {
    setSelectedPost(post);
    if (userId) {
      await supabase.from('mason_post_views').upsert({ post_id: post.id, user_id: userId }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
    } else {
      try { await supabase.from('mason_post_views').insert({ post_id: post.id }); } catch (e) { }
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: [{ count: (p.views?.[0]?.count || 0) + 1 }] } : p));
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 min-h-full w-full pb-36 pt-4 px-6 max-w-[1600px] mx-auto">

      <div className="relative mb-8 flex flex-col w-full">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-0.5 w-12 theme-bg-accent opacity-50" />
          <span className="text-[10px] font-mono text-[var(--subtext)] uppercase tracking-[0.3em] opacity-80">
            {t("personnel_dossier")} // {masonId.substring(0, 8)}
          </span>
          <div className="h-0.5 flex-1 bg-white/5 relative">
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[var(--accent)]/50 to-transparent opacity-30" />
          </div>
        </div>

        <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-8 shadow-2xl relative overflow-hidden backdrop-blur-3xl group flex flex-col xl:flex-row gap-8 items-start xl:items-center">

          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-20 pointer-events-none" />
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-30" />
          <div className="absolute bottom-0 right-0 w-[40rem] h-[40rem] theme-bg-accent opacity-[0.04] blur-[120px] rounded-full pointer-events-none translate-y-1/2 translate-x-1/4" />

          <div className="relative shrink-0 flex items-center justify-center">
            <div className="absolute inset-0 border border-[var(--accent)] rotate-45 scale-[1.1] rounded-[var(--radius)] opacity-20 group-hover:rotate-90 transition-transform duration-1000 blur-[2px]" />
            <div className="w-[120px] h-[120px] rounded-[var(--radius)] bg-[var(--sidebar)] border border-white/10 flex items-center justify-center overflow-hidden relative shadow-[0_0_30px_rgba(0,0,0,0.8)] z-10 backdrop-blur-xl">
              <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent)]/20 to-transparent z-20 pointer-events-none mix-blend-overlay" />
              {mason.avatar_url ? (
                <img src={mason.avatar_url} alt={t("auto_avatar")} className="w-full h-full object-cover filter contrast-[1.1] group-hover:scale-105 transition-transform duration-700" />
              ) : (
                <span className="text-5xl opacity-40 grayscale material-symbols-outlined">{t("icon_construction")}</span>
              )}
            </div>
            {mason.is_verified && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full shadow-[0_4px_20px_rgba(16,185,129,0.3)] z-30 flex items-center gap-1 backdrop-blur-2xl">
                <span className="material-symbols-outlined !text-[12px] text-emerald-400">{t("icon_verified_user")}</span>
                <span className="text-[9px] text-emerald-400 font-black tracking-[0.2em]">{t("verified")}</span>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-4 relative z-10 w-full">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-4">
                <h1 className="text-4xl font-black uppercase tracking-tighter text-[var(--text)] drop-shadow-md">{mason.name}</h1>
                <span className="hidden sm:block h-6 w-px bg-white/10" />
                <div className="flex gap-4 text-[10px] font-mono uppercase tracking-[0.2em]">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--subtext)] opacity-60">{t("followers")}</span>
                    <span className="theme-text-accent font-black text-sm">{followerCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--subtext)] opacity-60">{t("status")}</span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-md text-emerald-400 font-black flex items-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                      {t("status_active")}
                    </span>
                  </div>
                </div>
              </div>
              {!mason.is_verified && (
                <span className="text-[10px] text-[var(--subtext)] opacity-50 font-mono tracking-widest">{t("status_standard_clearance")}</span>
              )}
            </div>

            <div className="bg-black/20 rounded-2xl p-5 border border-white/5 relative">
              <div className="absolute top-0 left-4 w-8 h-px theme-bg-accent opacity-50" />
              <p className="text-[13px] font-medium text-[var(--text)] opacity-80 leading-relaxed font-mono whitespace-pre-wrap max-w-4xl">
                {mason.bio || t("no_bio") || "No dossier data on file."}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex flex-col gap-3 relative z-10 w-full xl:w-auto xl:min-w-[200px]">
            <button onClick={toggleFollow} className={`w-full h-12 px-6 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border flex items-center justify-center gap-2 transition-all shadow-lg ${isFollowing ? 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]' : 'theme-bg-accent text-[var(--bg)] border-transparent hover:scale-105 hover:shadow-[0_0_20px_var(--accent)]'}`}>
              <span className="material-symbols-outlined !text-[16px]">{isFollowing ? 'check_circle' : 'person_add'}</span>
              {isFollowing ? (t("btn_unfollow")) : (t("btn_follow"))}
            </button>

            <div className="flex gap-2">
              <button onClick={toggleMasonAlert} className={`relative group/btn flex-1 h-10 flex items-center justify-center rounded-xl border transition-all ${masonAlerts[masonId] ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] theme-text-accent' : 'bg-black/20 border-white/5 text-[var(--subtext)] hover:bg-white/5 hover:text-[var(--text)]'}`}>
                <span className="material-symbols-outlined !text-[16px]">{masonAlerts[masonId] ? 'notifications_active' : 'notifications_off'}</span>
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 pointer-events-none backdrop-blur-2xl z-[100] translate-y-1 group-hover/btn:translate-y-0">
                  {t("profile_notify")}
                </span>
              </button>

              {mason.patreon_url && (
                <button onClick={() => handleOpenUrl(mason.patreon_url)} className="relative group/btn w-10 h-10 rounded-xl bg-[#FF424D]/10 border border-[#FF424D]/20 text-[#FF424D] flex items-center justify-center hover:bg-[#FF424D]/20 transition-all">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_favorite")}</span>
                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-[#FF424D]/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#FF424D] whitespace-nowrap shadow-[0_10px_30px_rgba(255,66,77,0.3)] opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 pointer-events-none backdrop-blur-2xl z-[100] translate-y-1 group-hover/btn:translate-y-0">
                    {t("link_patreon")}
                  </span>
                </button>
              )}
              {mason.website_url && (
                <button onClick={() => handleOpenUrl(mason.website_url)} className="relative group/btn w-10 h-10 rounded-xl bg-[#06B6D4]/10 border border-[#06B6D4]/20 text-[#06B6D4] flex items-center justify-center hover:bg-[#06B6D4]/20 transition-all">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_public")}</span>
                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-[#06B6D4]/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#06B6D4] whitespace-nowrap shadow-[0_10px_30px_rgba(6,182,212,0.3)] opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 pointer-events-none backdrop-blur-2xl z-[100] translate-y-1 group-hover/btn:translate-y-0">
                    {t("link_website")}
                  </span>
                </button>
              )}
              {mason.discord_url && (
                <button onClick={() => handleOpenUrl(mason.discord_url)} className="relative group/btn w-10 h-10 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/20 text-[#5865F2] flex items-center justify-center hover:bg-[#5865F2]/20 transition-all">
                  <span className="material-symbols-outlined !text-[16px]">{t("icon_chat")}</span>
                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-[#5865F2]/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#5865F2] whitespace-nowrap shadow-[0_10px_30px_rgba(88,101,242,0.3)] opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all duration-300 pointer-events-none backdrop-blur-2xl z-[100] translate-y-1 group-hover/btn:translate-y-0">
                    {t("link_discord")}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-full">

        <div className="w-full lg:w-1/3 flex flex-col gap-4">
          <h3 className="text-xs font-black theme-text-accent uppercase tracking-widest ml-4 flex items-center gap-2">
            <span className="material-symbols-outlined !text-[16px]">{t("icon_satellite_alt")}</span> {t("tab_commlink")}
          </h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
            {posts.length === 0 && <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("profile_no_posts")}</div>}
            <div className="flex flex-col gap-6">
              {posts.map((p, index) => (
                <div key={p.id} className="break-inside-avoid">
                  <MasonPostCard
                    post={p}
                    index={index}
                    onPostClick={handlePostClick}
                    onToggleLike={handleToggleLike}
                    isFeatured={true}
                    isCompact={false}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-full lg:w-2/3 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4 w-full theme-glass-panel p-3 rounded-[var(--radius)] shadow-xl overflow-visible">
            <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/5 shadow-inner shrink-0 max-w-full">
              <HubTabButton id="MODS" icon={t("icon_account_balance")} label={t("items")} activeTab={profileTab} setTab={(tStr: string) => { setProfileTab(tStr); setModCategory('ALL'); setModSearch(''); }} />
              <HubTabButton id="BLUEPRINTS" icon={t("icon_map")} label={t("playsets_title")} activeTab={profileTab} setTab={(tStr: string) => { setProfileTab(tStr); setModCategory('ALL'); setModSearch(''); }} />
              <HubTabButton id="LEXICONS" icon={t("icon_translate")} label={t("tab_lexicons")} activeTab={profileTab} setTab={(tStr: string) => { setProfileTab(tStr); setModCategory('ALL'); setModSearch(''); }} />
              <HubTabButton id="CHAMELEONS" icon={t("icon_palette")} label={t("type_theme")} activeTab={profileTab} setTab={(tStr: string) => { setProfileTab(tStr); setModCategory('ALL'); setModSearch(''); }} />
              <HubTabButton id="TEMPLATES" icon="draw" label={t("ql_templates")} activeTab={profileTab} setTab={(tStr: string) => { setProfileTab(tStr); setModCategory('ALL'); setModSearch(''); }} />
            </div>

            <div className="flex flex-row items-center gap-3 flex-1 justify-end min-w-[300px]">
              <input value={modSearch} onChange={e => setModSearch(e.target.value)} placeholder={profileTab === 'LEXICONS' ? (t("ui_search_lexicons")) : profileTab === 'CHAMELEONS' ? (t("ui_search_chameleons")) : profileTab === 'TEMPLATES' ? (t("search_tmpl")) : profileTab === 'BLUEPRINTS' ? (t("search_blueprints")) : (t("search_ph"))} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full min-w-[150px] flex-1 transition-all border border-transparent shadow-inner" />
              <div className="w-max min-w-[180px] max-w-xs xl:w-[220px] shrink-0">
                <CustomDropdown disableTint={true}
                  value={modCategory}
                  onChange={(v: string[]) => setModCategory(v[0])}
                  options={(() => {
                    let rawOpts: any[] = [];
                    if (profileTab === 'MODS') {
                      rawOpts = [
                        { id: "ALL", label: t("all_classes"), icon: t("icon_folder") },
                        ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                          id: cat.id,
                          label: t(cat.lexicon_key) || cat.id,
                          icon: t(cat.icon_key) || t("icon_folder")
                        })) || [])
                      ];
                    } else if (profileTab === 'LEXICONS') {
                      rawOpts = [
                        { id: "ALL", label: t("filter_type"), icon: t("icon_folder") },
                        { id: "Default", label: t("type_default"), icon: t("icon_inventory_2") },
                        { id: "Theme", label: t("type_theme"), icon: t("icon_palette") }
                      ];
                    } else if (profileTab === 'BLUEPRINTS') {
                      rawOpts = [{ id: "ALL", label: t("filter_all_versions"), icon: t("icon_folder") }];
                      if (gameVersions && gameVersions.length > 0) {
                        rawOpts = [...rawOpts, ...gameVersions.map((v: string) => ({ id: v, label: v, icon: t("icon_map") }))];
                      }
                    } else if (profileTab === 'CHAMELEONS') {
                      rawOpts = [
                        { id: "ALL", label: t("filter_mode"), icon: t("icon_folder") },
                        { id: "Dark", label: t("mode_dark"), icon: "dark_mode" },
                        { id: "Light", label: t("mode_light"), icon: "light_mode" }
                      ];
                    } else if (profileTab === 'TEMPLATES') {
                      rawOpts = [
                        { id: "ALL", label: t("filter_type"), icon: t("icon_folder") }
                      ];
                    }

                    return rawOpts.map(opt => ({
                      id: opt.id,
                      label: (
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined !text-[16px] opacity-70">{opt.icon}</span>
                          <span>{opt.label}</span>
                        </div>
                      )
                    }));
                  })()}
                />
              </div>
            </div>
          </div>
          <div className="flex-1 theme-glass-panel rounded-[var(--radius)] rounded-[var(--radius)] p-6 shadow-2xl overflow-y-auto custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
            {profileTab === 'MODS' && (
              <>
                {filteredMods.length === 0 && <div className="col-span-full text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_mods")}</div>}
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">

                  {filteredMods.map(mod => (
                    <div key={mod.id} onClick={() => onModClick({ ...mod, author: mason.name, isNexusView: true })} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
                      <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                        {mod.image_url ? (
                          <img
                            src={mod.image_url}
                            alt={mod.name}
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700"
                          />
                        ) : (
                          <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>
                            {getModIcon(mod, useStore.getState().activeGameSchema, t)}
                          </span>
                        )}
                        <div className="absolute top-4 left-4 z-30 pointer-events-auto">
                          <div className={`backdrop-blur-md border px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 transition-all ${mod.status === 'verified' ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)]' : 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]'}`}>

                            <span className={`text-[8px] font-black uppercase tracking-widest ${mod.status === 'verified' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                              {(() => {
                                let s = mod.status || 'UNVERIFIED';
                                s = s.replace(/[\[\]"]/g, "");
                                if (s.toUpperCase().includes('SANDBOX')) return 'SANDBOX';
                                return s;
                              })()}
                            </span>
                          </div>
                        </div>
                        <div className="absolute top-4 right-4 flex gap-2 z-30">
                          <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">
                            {mod.category_override || "MOD"}
                          </span>
                        </div>
                      </div>

                      <div className="p-5 flex flex-col flex-1">
                        <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                          {mod.name}
                        </h3>
                        <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                          {mason.name || "UNKNOWN MASON"}{(mod.latest_version) ? ` • ${mod.latest_version}` : ""}
                        </p>
                        {mod.description && (
                          <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                            {mod.description}
                          </p>
                        )}

                        <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                          <div className="flex items-center gap-2">
                             {(mod.isVirtual || mod.isParent || mod.familyCount > 1) && (
                                <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] rounded-lg uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                                    <span className="material-symbols-outlined !text-[10px]">folder</span>
                                    {mod.familyCount || (mod.flavors?.length || 0)} {t("items")}
                                </span>
                             )}
                          </div>
                          <span className="text-[10px] font-black theme-text-accent uppercase opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">{t("btn_view")}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {profileTab === 'BLUEPRINTS' && (() => {
              const filteredBlueprints = marketAssets.filter(a => {
                if (a.asset_type !== 'blueprint') return false;
                if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
                if (modCategory && modCategory !== 'ALL' && modCategory !== 'all') {
                  if (a.json_data.game_version !== modCategory) return false;
                }
                return true;
              });
              return (
                <>
                  {filteredBlueprints.length === 0 && <div className="col-span-full text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_blueprints")}</div>}
                  <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredBlueprints.map(asset => (
                      <div key={asset.id} onClick={() => setSelectedBlueprint(asset)} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
                        <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                          {asset.image_url ? (
                            <img
                              src={asset.image_url}
                              alt={asset.name}
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>{t("icon_map")}</span>
                          )}

                          <div className="absolute top-4 right-4 flex gap-2 z-30">
                            <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">
                              {t("type_blueprint")}
                            </span>
                          </div>
                        </div>

                        <div className="p-5 flex flex-col flex-1">
                          <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                            {asset.name}
                          </h3>
                          <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                            {mason.name || "UNKNOWN MASON"} • {(asset.json_data?.artifacts?.length || 0)} {t("items")}
                          </p>
                          {asset.description && (
                            <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                              {asset.description}
                            </p>
                          )}

                          <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                            <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                              {asset.downloads || 0} {t("auto_dl")}
                            </span>
                            <div className="flex gap-2 relative z-40">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBlueprint(asset);
                                }}
                                className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105"
                              >
                                {t("update_panel_install")}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {profileTab === 'LEXICONS' && (() => {
              const filteredLexicons = marketAssets.filter(a => {
                if (a.asset_type !== 'lexicon') return false;
                if (modCategory !== "ALL" && a.lexicon_type !== modCategory) return false;
                if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
                return true;
              }).sort((a: any, b: any) => {
                const aOutdated = isOutdated(a) ? 1 : 0;
                const bOutdated = isOutdated(b) ? 1 : 0;
                return bOutdated - aOutdated;
              });
              return (
                <>
                  {filteredLexicons.length === 0 && <div className="col-span-full text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_lexicons")}</div>}
                  <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredLexicons.map(asset => (
                      <div key={asset.id} onClick={() => setActiveAsset({ type: 'lexicon', id: asset.id })} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
                        <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                          {asset.image_url ? (
                            <img
                              src={asset.image_url}
                              alt={asset.name}
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>{t("icon_translate")}</span>
                          )}

                          <div className="absolute top-4 right-4 flex gap-2 z-30">
                            <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">
                              {t("auto_lexicon")} {asset.language || "Custom"}
                            </span>
                          </div>
                        </div>

                        <div className="p-5 flex flex-col flex-1">
                          <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                            {asset.name}
                          </h3>
                          <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                            {mason.name || "UNKNOWN MASON"}
                          </p>
                          {asset.description && (
                            <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                              {asset.description}
                            </p>
                          )}

                          <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                            <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                              {asset.downloads || 0} {t("auto_dl")}
                            </span>
                            <div className="flex gap-2 relative z-40">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const parsedData = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                                  importLexicon({ ...parsedData, _meta_language: asset.language || "Custom" }, asset.name);
                                  onSetStatus(`Successfully Installed Lexicon: ${asset.name}`);
                                }}
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 ${isInstalled(asset)
                                  ? isOutdated(asset)
                                    ? 'bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] border border-[color-mix(in_srgb,#3b82f6_30%,transparent)] text-[#3b82f6] hover:bg-[color-mix(in_srgb,#3b82f6_20%,transparent)]'
                                    : 'bg-[color-mix(in_srgb,var(--subtext)_10%,transparent)] border border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--subtext)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--subtext)_15%,transparent)] backdrop-blur-md'
                                  : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'
                                  }`}
                              >
                                {isInstalled(asset) ? isOutdated(asset) ? "UPDATE" : (t("btn_reinstall")) : (t("update_panel_install"))}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {profileTab === 'CHAMELEONS' && (() => {
              const filteredChameleons = marketAssets.filter(a => {
                if (a.asset_type !== 'chameleon') return false;
                if (modCategory !== "ALL" && a.theme_mode !== modCategory) return false;
                if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
                return true;
              }).sort((a: any, b: any) => {
                const aOutdated = isOutdated(a) ? 1 : 0;
                const bOutdated = isOutdated(b) ? 1 : 0;
                return bOutdated - aOutdated;
              });
              return (
                <>
                  {filteredChameleons.length === 0 && <div className="col-span-full text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_chameleons")}</div>}
                  <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredChameleons.map(asset => (
                      <div key={asset.id} onClick={() => setActiveAsset({ type: 'chameleon', id: asset.id })} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
                        <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                          {asset.image_url ? (
                            <img
                              src={asset.image_url}
                              alt={asset.name}
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-transform duration-700"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>{t("icon_palette")}</span>
                          )}

                          <div className="absolute top-4 right-4 flex gap-2 z-30">
                            <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">
                              {t("auto_chameleon")} {asset.theme_mode || "Dark"}
                            </span>
                          </div>
                        </div>

                        <div className="p-5 flex flex-col flex-1">
                          <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                            {asset.name}
                          </h3>
                          <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                            {mason.name || "UNKNOWN MASON"}
                          </p>
                          {asset.description && (
                            <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                              {asset.description}
                            </p>
                          )}

                          <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                            <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                              {asset.downloads || 0} {t("auto_dl")}
                            </span>
                            <div className="flex gap-2 relative z-40">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  importTheme(asset.json_data);
                                  onSetStatus(`Successfully Installed Theme: ${asset.name}`);
                                }}
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 ${isInstalled(asset)
                                  ? isOutdated(asset)
                                    ? 'bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] border border-[color-mix(in_srgb,#3b82f6_30%,transparent)] text-[#3b82f6] hover:bg-[color-mix(in_srgb,#3b82f6_20%,transparent)]'
                                    : 'bg-[color-mix(in_srgb,var(--subtext)_10%,transparent)] border border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--subtext)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--subtext)_15%,transparent)] backdrop-blur-md'
                                  : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'
                                  }`}
                              >
                                {isInstalled(asset) ? isOutdated(asset) ? "UPDATE" : (t("btn_reinstall")) : (t("update_panel_install"))}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {profileTab === 'TEMPLATES' && (() => {
              const filteredTemplates = marketAssets.filter(a => {
                if (a.asset_type !== 'workbench_template') return false;
                if (modSearch && !a.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
                return true;
              }).sort((a: any, b: any) => {
                const aOutdated = isOutdated(a) ? 1 : 0;
                const bOutdated = isOutdated(b) ? 1 : 0;
                return bOutdated - aOutdated;
              });
              return (
                <>
                  {filteredTemplates.length === 0 && <div className="col-span-full text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("empty_title_templates")}</div>}
                  <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredTemplates.map(asset => (
                      <div key={asset.id} onClick={() => setActiveAsset({ type: 'workbench_template', id: asset.id })} className="relative flex flex-col h-full theme-glass-panel rounded-[var(--radius)] overflow-hidden transition-all duration-500 shadow-xl hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group">
                        <div className="relative z-20 h-40 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors duration-700 overflow-hidden">
                          <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-60 group-hover:scale-110 group-hover:text-[var(--accent)] transition-all duration-700" style={{ fontSize: '120px' }}>{t("auto_draw")}</span>
                          <div className="absolute top-4 right-4 flex gap-2 z-30">
                            <span className="text-[8px] font-black px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] uppercase tracking-widest">
                              {t("type_template")}
                            </span>
                          </div>
                        </div>

                        <div className="p-5 flex flex-col flex-1">
                          <h3 className="text-xs font-black truncate uppercase tracking-tight group-hover:theme-text-accent transition-colors mb-1">
                            {asset.name}
                          </h3>
                          <p className="text-[9px] font-black text-[var(--text)]/30 uppercase tracking-widest truncate mb-2">
                            {mason.name || "UNKNOWN MASON"}
                          </p>
                          {asset.description && (
                            <p className="text-[10px] text-[var(--subtext)] opacity-70 line-clamp-2 leading-relaxed mb-4">
                              {stripMarkdown(asset.description)}
                            </p>
                          )}

                          <div className="mt-auto pt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                            <span className="text-[8px] font-mono text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                              {asset.downloads || 0} {t("auto_dl")}
                            </span>
                            <div className="flex gap-2 relative z-40">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const parsed = typeof asset.json_data === 'string' ? JSON.parse(asset.json_data) : asset.json_data;
                                  if (vaultPath) {
                                    const templatesDir = `${vaultPath}\\Data\\Templates`;
                                    if (!(await exists(templatesDir))) await import("@tauri-apps/plugin-fs").then(m => m.mkdir(templatesDir, { recursive: true }));
                                    await import("@tauri-apps/plugin-fs").then(m => m.writeTextFile(`${templatesDir}\\${asset.name}_template.json`, JSON.stringify(parsed, null, 2)));
                                    useStore.getState().pushStatus(`Successfully Installed Template: ${asset.name}`);
                                    setInstalledTemplates(prev => ({ ...prev, [asset.name]: getAssetDisplayVersion(asset) }));
                                  }
                                }}
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 ${isInstalled(asset)
                                  ? isOutdated(asset)
                                    ? 'bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] border border-[color-mix(in_srgb,#3b82f6_30%,transparent)] text-[#3b82f6] hover:bg-[color-mix(in_srgb,#3b82f6_20%,transparent)]'
                                    : 'bg-[color-mix(in_srgb,var(--subtext)_10%,transparent)] border border-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--subtext)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--subtext)_15%,transparent)] backdrop-blur-md'
                                  : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'
                                  }`}
                              >
                                {isInstalled(asset) ? isOutdated(asset) ? "UPDATE" : (t("btn_reinstall")) : (t("update_panel_install"))}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {selectedPost && (
        <MasonPostViewer
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onAssetClick={(type, id) => setActiveAsset({ type, id })}
          userId={userId}
        />
      )}

      {selectedBlueprint && createPortal(
        <>
          <div className="fixed top-0 right-0 bottom-10 z-[15000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setSelectedBlueprint(null)}></div>
          <div className="fixed top-10 right-0 bottom-10 w-full max-w-4xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[15001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px] rounded-tl-[3rem] rounded-bl-[3rem]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedBlueprint(null)} className="absolute top-8 right-8 z-50 w-10 h-10 theme-glass-panel hover:theme-bg-danger text-[var(--text)] hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="material-symbols-outlined !text-[24px]">{t("icon_close")}</span>
            </button>
            <div className="h-48 relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex flex-col items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-[var(--accent)]/5 blur-[50px] pointer-events-none rounded-full transform scale-150"></div>
              <div className="w-24 h-24 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-inner flex items-center justify-center relative z-10">
                <span className="material-symbols-outlined text-[var(--accent)] drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]" style={{ fontSize: '48px' }}>{t("icon_map")}</span>
              </div>
            </div>

            <div className="px-10 pt-8 pb-4 relative shrink-0">
              <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">{selectedBlueprint.name || "Blueprint"}</h3>
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2 flex gap-4">
                <span>{mason?.name || selectedBlueprint.author || "Citizen"} &bull; {selectedBlueprint.created_at ? new Date(selectedBlueprint.created_at).toLocaleDateString() : ""}</span>
                <span className="text-[var(--accent)] font-mono">{selectedBlueprint.json_data?.game_version ? `${t("blueprint_verified")} ${selectedBlueprint.json_data.game_version}` : (t("blueprint_verified_unknown"))}</span>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-10 pb-32 flex flex-col gap-8 relative z-10">
              {selectedBlueprint.description && (
                <div className="theme-glass-inner p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
                  <p className="text-sm font-medium text-[var(--text)] leading-relaxed whitespace-pre-wrap">{selectedBlueprint.description}</p>
                </div>
              )}

              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] opacity-80 flex items-center gap-2">
                  <span className="theme-text-accent px-2 py-0.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded">{selectedBlueprint.json_data?.artifacts?.length || 0}</span> {t("blueprint_included")}
                </h3>
                <div className="flex flex-col gap-2">
                  {(selectedBlueprint.json_data?.artifacts || []).map((mod: any, i: number) => (
                    <div key={i} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-4 rounded-2xl hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all group">
                      <button
                        onClick={() => onModClick(mod)}
                        className="flex flex-col items-start hover:theme-text-accent transition-colors text-left"
                      >
                        <span className="text-sm font-black text-[var(--text)] uppercase tracking-tight">{cleanModName(mod.name || mod.id).name}</span>
                        <span className="text-[9px] font-mono theme-text-accent tracking-[0.2em] uppercase opacity-70 mt-1">{cleanModName(mod.name || mod.id).ext}</span>
                      </button>
                      {mod.author && <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-4 shrink-0">{mod.author}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-10 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] flex justify-between gap-4 shrink-0">
              <button
                onClick={() => {
                  if (syncBlueprintByCode && selectedBlueprint) syncBlueprintByCode(selectedBlueprint.json_data.code);
                  setSelectedBlueprint(null);
                }}
                className={standardAccentGlassButtonClass + " w-full"}
              >
                {t("update_panel_install")}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {activeAsset && (
        <AssetPreviewSidebar
          assetType={activeAsset.type}
          assetId={activeAsset.id}
          onClose={() => setActiveAsset(null)}
        />
      )}
    </div>
  );
}
