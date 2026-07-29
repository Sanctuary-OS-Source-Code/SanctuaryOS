import { handleOpenUrl, getFileLabel, formatDisplayName, getModIcon, processModsIntoCollections, enrichBlueprintsWithPremiumStatus } from './shared';
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";
import MarkdownRenderer from "./MarkdownRenderer";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { ViewHeader, stripMarkdown, SidePanel, standardPrimaryButtonClass, standardButtonClass, standardAccentGlassButtonClass, CustomDropdown, HubTabButton, compareVersions, cleanSearchName, DashboardStatTile, LoadingScreen } from "./shared";
import MasonPostCard from "./MasonPostCard";
import { readDir, readTextFile, exists } from '@tauri-apps/plugin-fs';
import * as importFs from '@tauri-apps/plugin-fs';
import { MarketBlueprintPanel } from './side-panels/NexusSidePanels';
import MasonProfileHeader from "./MasonProfileHeader";
import MasonProfileOverview from "./MasonProfileOverview";
import MasonProfileCommLink from "./MasonProfileCommLink";
import MasonProfileArtifacts from "./MasonProfileArtifacts";
import MasonProfileAssets from "./MasonProfileAssets";


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

const getSearchUrl = (mod: any) => {
  return `https://www.google.com/search?q=${encodeURIComponent(cleanSearchName(mod.name || mod.displayName, useStore.getState().activeGameSchema) + ' ' + (useStore.getState().activeGameSchema?.display_name || "Game") + ' mod')}`;
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
      } catch (e) { }
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
  const [hidePaid, setHidePaid] = useState<boolean>(() => localStorage.getItem("sanctuary_hide_paid") === "true");
  const [hideEarlyAccess, setHideEarlyAccess] = useState<boolean>(() => localStorage.getItem("sanctuary_hide_ea") === "true");
  const [marketAssets, setMarketAssets] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<string>("OVERVIEW");
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
        if (blueprintsData && blueprintsData.length > 0) {
          const premiumMap = await enrichBlueprintsWithPremiumStatus(supabase, blueprintsData);

          newAssets = [
            ...newAssets,
            ...blueprintsData.map(b => {
              const artifacts = b.json_data?.artifacts || b.artifacts || [];
              const premiumInfo = premiumMap[b.id];
              const isPaid = premiumInfo?.is_paid || b.is_paid || artifacts.some((a: any) => a.is_paid);
              const isEarlyAccess = premiumInfo?.is_early_access || b.is_early_access || artifacts.some((a: any) => a.is_early_access);

              return {
                id: b.id,
                name: b.name,
                author: mData.name,
                description: (artifacts.length || 0) + (t("items")),
                created_at: b.created_at,
                asset_type: 'blueprint',
                is_paid: isPaid,
                is_early_access: isEarlyAccess,
                json_data: b
              };
            })
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
      const { error } = await supabase.from('mason_followers').insert({ user_id: userId, mason_id: masonId });
      if (error && (error.code === '23505' || error.message.includes('Conflict') || error.code === '409')) {
        setIsFollowing(true);
      } else if (!error) {
        setFollowerCount(prev => prev + 1);
        setIsFollowing(true);
      } else {
        useStore.getState().pushStatus("Failed to follow Mason.");
      }
    }
  };

  if (loading) return <LoadingScreen title={t("accessing") || "ACCESSING MASON PROFILE"} />;
  if (!mason) return <div className="p-12 text-center text-[var(--subtext)] opacity-60 font-black tracking-widest uppercase">{t("not_found")}</div>;

  const filteredMods = mods.filter(m => {
    if (hidePaid && m.is_paid) return false;
    if (hideEarlyAccess && m.is_early_access) return false;
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

      <MasonProfileHeader mason={mason} masonId={masonId} followerCount={followerCount} isFollowing={isFollowing} masonAlerts={masonAlerts} toggleFollow={toggleFollow} toggleMasonAlert={toggleMasonAlert} t={t} />

      <div className="flex flex-col gap-1 w-full mb-0">
        <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5">
          <HubTabButton id="OVERVIEW" icon={t("icon_home") || "home"} label={t("tab_overview") || "OVERVIEW"} activeTab={activeView} setTab={setActiveView as any} />
          <HubTabButton id="COMM-LINK" icon={t("icon_satellite_alt") || "satellite_alt"} label={t("tab_commlink") || "COMM-LINK"} activeTab={activeView} setTab={setActiveView as any} />
          <HubTabButton id="MODS" icon={t("icon_account_balance") || "account_balance"} label={t("items") || "ARTIFACTS"} activeTab={activeView} setTab={setActiveView as any} />
          <HubTabButton id="BLUEPRINTS" icon={t("icon_map") || "map"} label={t("playsets_title") || "BLUEPRINTS"} activeTab={activeView} setTab={setActiveView as any} />
          <HubTabButton id="LEXICONS" icon={t("icon_translate") || "translate"} label={t("tab_lexicons") || "LEXICONS"} activeTab={activeView} setTab={setActiveView as any} />
          <HubTabButton id="CHAMELEONS" icon={t("icon_palette") || "palette"} label={t("type_theme") || "CHAMELEONS"} activeTab={activeView} setTab={setActiveView as any} />
          <HubTabButton id="TEMPLATES" icon={t("icon_draw") || "draw"} label={t("ql_templates") || "TEMPLATES"} activeTab={activeView} setTab={setActiveView as any} />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 w-full mt-4">
        {activeView === 'OVERVIEW' ? (
          <MasonProfileOverview posts={posts} mods={mods} marketAssets={marketAssets} mason={mason} setActiveView={setActiveView} setModCategory={setModCategory} setModSearch={setModSearch} setActiveAsset={setActiveAsset} setSelectedBlueprint={setSelectedBlueprint} onModClick={onModClick} activeGameSchema={activeGameSchema} handlePostClick={handlePostClick} handleToggleLike={handleToggleLike} t={t} />
        ) : (
          <div className="flex flex-col gap-6 h-full w-full">
            <div className="flex flex-wrap items-start justify-between gap-4 w-full px-4 py-2 shrink-0 border-b border-white/5 overflow-visible mb-2">
              {(() => {
                const getTitleConfig = () => {
                  switch (activeView) {
                    case 'COMM-LINK': return { title: t("tab_commlink") || "COMM-LINK", icon: "satellite_alt", color: "text-cyan-400", border: "border-cyan-500/30" };
                    case 'MODS': return { title: t("items") || "ARTIFACTS", icon: "account_balance", color: "text-teal-400", border: "border-teal-500/30" };
                    case 'BLUEPRINTS': return { title: t("playsets_title") || "BLUEPRINTS", icon: "map", color: "text-blue-400", border: "border-blue-500/30" };
                    case 'LEXICONS': return { title: t("tab_lexicons") || "LEXICONS", icon: "translate", color: "text-indigo-400", border: "border-indigo-500/30" };
                    case 'CHAMELEONS': return { title: t("type_theme") || "CHAMELEONS", icon: "palette", color: "text-purple-400", border: "border-purple-500/30" };
                    case 'TEMPLATES': return { title: t("ql_templates") || "TEMPLATES", icon: "draw", color: "text-pink-400", border: "border-pink-500/30" };
                    default: return { title: "VIEW", icon: "folder", color: "text-[var(--accent)]", border: "border-[var(--accent)]/30" };
                  }
                };
                const conf = getTitleConfig();
                return (
                  <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3 min-w-[200px] shrink-0">
                    <div className={`w-12 h-12 rounded-xl theme-glass-panel border ${conf.border} shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0`}>
                      <span className={`material-symbols-outlined !text-2xl ${conf.color} opacity-90 drop-shadow-lg`}>{conf.icon}</span>
                    </div>
                    <span className="truncate hidden sm:block">{conf.title}</span>
                  </h2>
                );
              })()}
              <div className="flex flex-col items-end gap-2 flex-1 min-w-[300px] w-full">
                <div className="flex flex-row items-center gap-3 w-full">
                  <input value={modSearch} onChange={e => setModSearch(e.target.value)} placeholder={activeView === 'COMM-LINK' ? t("mason_search_placeholder") || "Search posts..." : activeView === 'LEXICONS' ? (t("ui_search_lexicons")) : activeView === 'CHAMELEONS' ? (t("ui_search_chameleons")) : activeView === 'TEMPLATES' ? (t("ui_search_templates") || "Search Templates...") : activeView === 'BLUEPRINTS' ? (t("search_blueprints")) : (t("search_ph"))} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full flex-1 transition-all border border-transparent shadow-inner" />
                  {activeView !== 'COMM-LINK' && (
                    <div className="w-[220px] shrink-0">
                      <CustomDropdown disableTint={true}
                        value={modCategory}
                        onChange={(v: any) => setModCategory(v[0])}
                        options={(() => {
                          let rawOpts: any[] = [];
                          if (activeView === 'MODS') {
                            rawOpts = [
                              { id: "ALL", label: t("all_classes"), icon: t("icon_folder") },
                              ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                                id: cat.id,
                                label: t(cat.lexicon_key) || cat.id,
                                icon: t(cat.icon_key) || t("icon_folder")
                              })) || [])
                            ];
                          } else if (activeView === 'LEXICONS') {
                            rawOpts = [
                              { id: "ALL", label: t("filter_type"), icon: t("icon_folder") },
                              { id: "Default", label: t("type_default"), icon: t("icon_inventory_2") },
                              { id: "Theme", label: t("type_theme"), icon: t("icon_palette") }
                            ];
                          } else if (activeView === 'BLUEPRINTS') {
                            rawOpts = [{ id: "ALL", label: t("filter_all_versions"), icon: t("icon_folder") }];
                            if (gameVersions && gameVersions.length > 0) {
                              rawOpts = [...rawOpts, ...gameVersions.map((v: string) => ({ id: v, label: v, icon: t("icon_map") }))];
                            }
                          } else if (activeView === 'CHAMELEONS') {
                            rawOpts = [
                              { id: "ALL", label: t("filter_mode"), icon: t("icon_folder") },
                              { id: "Dark", label: t("mode_dark"), icon: "dark_mode" },
                              { id: "Light", label: t("mode_light"), icon: "light_mode" }
                            ];
                          } else if (activeView === 'TEMPLATES') {
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
                  )}
                </div>
                {(activeView === 'MODS' || activeView === 'BLUEPRINTS') && (
                  <div className="flex items-center justify-end gap-2 w-full flex-wrap">
                    <button
                      onClick={() => { 
                        const newVal = !hidePaid;
                        setHidePaid(newVal); 
                        localStorage.setItem('sanctuary_hide_paid', String(newVal));
                        setModPage(1); 
                      }}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-inner border flex items-center gap-1.5 ${hidePaid ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' : 'theme-glass-inner border-white/5 text-[var(--subtext)] hover:text-[var(--text)] hover:border-white/10'}`}
                    >
                      <span className="material-symbols-outlined !text-[12px]">{hidePaid ? 'visibility_off' : 'monetization_on'}</span>
                      {t("filter_hide_paid") || "Hide Paid"}
                    </button>
                    <button
                      onClick={() => { 
                        const newVal = !hideEarlyAccess;
                        setHideEarlyAccess(newVal); 
                        localStorage.setItem('sanctuary_hide_ea', String(newVal));
                        setModPage(1); 
                      }}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-inner border flex items-center gap-1.5 ${hideEarlyAccess ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'theme-glass-inner border-white/5 text-[var(--subtext)] hover:text-[var(--text)] hover:border-white/10'}`}
                    >
                      <span className="material-symbols-outlined !text-[12px]">{hideEarlyAccess ? 'visibility_off' : 'science'}</span>
                      {t("filter_hide_early_access") || "Hide Early Access"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar content-start p-6 pb-32">
              {activeView === 'COMM-LINK' && <MasonProfileCommLink posts={posts} modSearch={modSearch} handlePostClick={handlePostClick} handleToggleLike={handleToggleLike} t={t} />}
              {activeView === 'MODS' && <MasonProfileArtifacts filteredMods={filteredMods} onModClick={onModClick} mason={mason} activeGameSchema={activeGameSchema} t={t} />}
              {['BLUEPRINTS', 'LEXICONS', 'CHAMELEONS', 'TEMPLATES'].includes(activeView) && <MasonProfileAssets activeView={activeView} marketAssets={marketAssets} modSearch={modSearch} modCategory={modCategory} hidePaid={hidePaid} hideEarlyAccess={hideEarlyAccess} mason={mason} setSelectedBlueprint={setSelectedBlueprint} setActiveAsset={setActiveAsset} isInstalled={isInstalled} isOutdated={isOutdated} importLexicon={importLexicon} importTheme={importTheme} vaultPath={vaultPath} exists={exists} importFs={importFs} setInstalledTemplates={setInstalledTemplates} getAssetDisplayVersion={getAssetDisplayVersion} useStore={useStore} t={t} />}
            </div>
          </div>
        )}
      </div>

      {selectedPost && (
        <MasonPostViewer
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onAssetClick={(type, id) => setActiveAsset({ type, id })}
          userId={userId}
        />
      )}

      <MarketBlueprintPanel
        selectedBlueprint={selectedBlueprint}
        setSelectedBlueprint={setSelectedBlueprint}
        onOpenDossier={onModClick}
        cleanModName={cleanModName}
        syncBlueprintByCode={syncBlueprintByCode}
      />

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
