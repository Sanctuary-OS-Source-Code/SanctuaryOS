import { handleOpenUrl, getFileLabel, formatDisplayName, getModIcon, processModsIntoCollections, enrichBlueprintsWithPremiumStatus } from './shared';
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase, getActiveGameClient } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";
import MarkdownRenderer from "./MarkdownRenderer";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { ViewHeader, HoverTabDrawer, VerticalTabButton, CustomDropdown, HoverTooltip, SidebarActionButton, DashboardStatTile, EmptyState, extractPostImage, SearchBar, LoadingScreen, SidePanel, standardPrimaryButtonClass, standardButtonClass, standardAccentGlassButtonClass, compareVersions, cleanSearchName, FilterPopover } from "./shared";
import MasonPostCard from "./MasonPostCard";
import { readDir, readTextFile, exists } from '@tauri-apps/plugin-fs';
import * as importFs from '@tauri-apps/plugin-fs';
import { MarketBlueprintPanel } from './side-panels/NexusSidePanels';
import MasonProfileHeader from "./MasonProfileHeader";
import MasonProfileOverview from "./MasonProfileOverview";
import MasonProfileCommLink from "./MasonProfileCommLink";
import MasonProfileArtifacts from "./MasonProfileArtifacts";
import MasonProfileAssets from "./MasonProfileAssets";
import SidePanelMasonPin from "./side-panels/SidePanelMasonPin";


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
  const [isPinPanelOpen, setIsPinPanelOpen] = useState(false);
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

      const { data: postsData } = await supabase.from('mason_posts').select('*, masons(name, avatar_url, patreon_url, discord_url, website_url, profile_id), likes:mason_post_likes(count), views:mason_post_views(count), comments:mason_post_comments(count)').eq('mason_id', masonId).order('created_at', { ascending: false });
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

  const isOwner = userId === mason?.profile_id;

  const handlePin = async (type: 'mod' | 'asset' | 'blueprint', id: string | number) => {
    try {
      const updateData: any = {};
      if (type === 'mod') {
        if (String(id).startsWith('ccset_')) {
          updateData.pinned_ccset_id = id;
          updateData.pinned_mod_id = null;
        } else {
          updateData.pinned_mod_id = id;
          updateData.pinned_ccset_id = null;
        }
      } else if (type === 'blueprint') {
        updateData.pinned_blueprint_id = id;
        updateData.pinned_asset_id = null;
      } else {
        updateData.pinned_asset_id = id;
        updateData.pinned_blueprint_id = null;
      }

      const state = useStore.getState();
      const token = state.session?.access_token;
      const activeWs = state.workspaces?.find((w: any) => w.id === state.activeWorkspaceId);
      const url = activeWs?.supabase_url || "https://chphhvpcgcpnyvshsudh.supabase.co";
      const key = activeWs?.supabase_anon_key || "sb_publishable_EdCfD4meHLUUgoTRkfwsTA_PFXnZx8D";

      if (token) {
        const { error } = await supabase.rpc('secure_update_mason_profile', {
          p_token: token,
          p_mason_id: masonId,
          p_payload: updateData
        });
        if (error) throw error;
      } else {
        const { error } = await getActiveGameClient().from('masons').update(updateData).eq('id', masonId);
        if (error) throw error;
      }

      setMason((prev: any) => ({ ...prev, ...updateData }));
      useStore.getState().pushStatus(t("pinned_success") || `Pinned to showcase!`);
    } catch (e: any) {
      console.error("Pin Error:", e);
      useStore.getState().pushStatus(t("pinned_fail"));
    }
  };

  const toggleFollow = async () => {
    if (!userId) { useStore.getState().pushStatus(t("auto_guest_mode_active_45")); return; }
    const session = useStore.getState().session;
    if (isFollowing) {
      await supabase.rpc('secure_toggle_mason_follow', { p_mason_id: masonId, p_action: 'unfollow', p_token: session?.access_token });
      setFollowerCount(prev => prev - 1);
      setIsFollowing(false);
    } else {
      const { error } = await supabase.rpc('secure_toggle_mason_follow', { p_mason_id: masonId, p_action: 'follow', p_token: session?.access_token });
      if (error && (JSON.stringify(error).includes('23505') || JSON.stringify(error).includes('Conflict'))) {
        setIsFollowing(true);
      } else if (!error) {
        setFollowerCount(prev => prev + 1);
        setIsFollowing(true);
      } else {
        useStore.getState().pushStatus("Failed to follow Mason.");
      }
    }
  };

  if (loading) return <LoadingScreen title={t("accessing")} />;
  if (!mason) return <div className="p-12 text-center text-[var(--subtext)] opacity-60 font-black tracking-widest capitalize">{t("not_found")}</div>;

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
    const session = useStore.getState().session;

    const { error } = await supabase.rpc('secure_upsert_cloud_file', {
      p_target: 'mason_post_likes',
      p_payload: { post_id: post.id, user_id: userId },
      p_token: session?.access_token
    });
    
    let increment = 1;
    if (error && (JSON.stringify(error).includes('23505') || JSON.stringify(error).includes('duplicate key'))) {
      const { data: likeData } = await supabase.from('mason_post_likes').select('id').eq('post_id', post.id).eq('user_id', userId).maybeSingle();
      if (likeData) {
        await supabase.rpc('secure_delete_cloud_file', { p_target: 'mason_post_likes', p_id: likeData.id, p_token: session?.access_token });
      }
      increment = -1;
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: [{ count: Math.max(0, (p.likes?.[0]?.count || 0) + increment) }] } : p));
  };

  const handlePostClick = async (post: any) => {
    setSelectedPost(post);
    const session = useStore.getState().session;
    if (userId && session?.access_token) {
      try { await supabase.rpc('secure_upsert_cloud_file', { p_target: 'mason_post_views', p_payload: { post_id: post.id, user_id: userId }, p_token: session.access_token }); } catch (e) { console.warn("Failed to record view", e); }
    }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: [{ count: (p.views?.[0]?.count || 0) + 1 }] } : p));
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 min-h-full w-full pb-36 pt-0 md:pt-4 px-0 md:px-6 max-w-[1600px] mx-auto">

      <MasonProfileHeader mason={mason} masonId={masonId} followerCount={followerCount} isFollowing={isFollowing} masonAlerts={masonAlerts} toggleFollow={toggleFollow} toggleMasonAlert={toggleMasonAlert} activeView={activeView} setActiveView={setActiveView} t={t}>
        {activeView !== 'OVERVIEW' && (
          <div className="flex flex-row items-center justify-end gap-3 flex-1 w-full ml-auto">
            <div className="w-full max-w-[300px]">
              <SearchBar
                value={modSearch}
                onChange={setModSearch}
                placeholder={(activeView === 'COMM-LINK' ? t("mason_search_placeholder") : activeView === 'LEXICONS' ? (t("ui_search_lexicons")) : activeView === 'CHAMELEONS' ? (t("ui_search_chameleons")) : activeView === 'TEMPLATES' ? (t("ui_search_templates")) : activeView === 'BLUEPRINTS' ? (t("search_blueprints")) : (t("search_ph"))) as string}
                className="w-full !h-10 !rounded-xl"
              />
            </div>
            
            {activeView !== 'COMM-LINK' && (
              <FilterPopover icon="tune" label={t("filters") || "Filters"} className="shrink-0">
                <div className="flex flex-col w-[320px] p-4 max-w-[calc(100vw-40px)] gap-6">
                  
                  <div className="flex flex-col gap-2 w-full">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">{t("filter_category") || "Category"}</span>
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
                          const langs = Array.from(new Set(
                            marketAssets.filter(a => a.asset_type === 'lexicon').map(a => {
                              let lang = a.language;
                              if (!lang && a.json_data) {
                                try {
                                  const parsed = typeof a.json_data === 'string' ? JSON.parse(a.json_data) : a.json_data;
                                  lang = parsed.language;
                                } catch (e) { }
                              }
                              return lang || "Custom";
                            })
                          ));
                          rawOpts = [
                            { id: "ALL", label: t("all_languages"), icon: t("icon_folder") },
                            ...langs.map(l => ({ id: String(l), label: String(l), icon: t("icon_translate") }))
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
                            <div className="flex items-center gap-3 text-xs">
                              <span className="material-symbols-outlined !text-[16px] opacity-70">{opt.icon}</span>
                              <span className="truncate">{opt.label}</span>
                            </div>
                          )
                        }));
                      })()}
                    />
                  </div>

                  {(activeView === 'MODS' || activeView === 'BLUEPRINTS') && (
                    <div className="flex flex-col gap-3 w-full">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">{t("filters") || "Filters"}</span>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => {
                            const newVal = !hidePaid;
                            setHidePaid(newVal);
                            localStorage.setItem('sanctuary_hide_paid', String(newVal));
                            setModPage(1);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group ${hidePaid ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] backdrop-blur-md border border-transparent' : 'text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--accent)] border-transparent'}`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />
                          <span className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 relative z-10 ${hidePaid ? 'scale-110' : 'group-hover:scale-110'}`}>
                            {hidePaid ? 'visibility_off' : 'monetization_on'}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap overflow-hidden text-ellipsis pt-0.5">
                            {t("filter_hide_paid")}
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            const newVal = !hideEarlyAccess;
                            setHideEarlyAccess(newVal);
                            localStorage.setItem('sanctuary_hide_ea', String(newVal));
                            setModPage(1);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group ${hideEarlyAccess ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] backdrop-blur-md border border-transparent' : 'text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--accent)] border-transparent'}`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />
                          <span className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 relative z-10 ${hideEarlyAccess ? 'scale-110' : 'group-hover:scale-110'}`}>
                            {hideEarlyAccess ? 'visibility_off' : 'science'}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap overflow-hidden text-ellipsis pt-0.5">
                            {t("filter_hide_early_access")}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </FilterPopover>
            )}
          </div>
        )}
      </MasonProfileHeader>

      <HoverTabDrawer title="Mason Navigation" activeTab={activeView} setTab={setActiveView as any}>
        <VerticalTabButton id="OVERVIEW" icon={t("icon_home")} label={t("tab_overview")} activeTab={activeView} setTab={setActiveView as any} />
        <VerticalTabButton id="COMM-LINK" icon={t("icon_satellite_alt")} label={t("tab_commlink")} activeTab={activeView} setTab={setActiveView as any} />
        <VerticalTabButton id="MODS" icon={t("icon_account_balance")} label={t("items")} activeTab={activeView} setTab={setActiveView as any} />
        <VerticalTabButton id="BLUEPRINTS" icon={t("icon_map")} label={t("playsets_title")} activeTab={activeView} setTab={setActiveView as any} />
        <VerticalTabButton id="LEXICONS" icon={t("icon_translate")} label={t("tab_lexicons")} activeTab={activeView} setTab={setActiveView as any} />
        <VerticalTabButton id="CHAMELEONS" icon={t("icon_palette")} label={t("type_theme")} activeTab={activeView} setTab={setActiveView as any} />
        <VerticalTabButton id="TEMPLATES" icon={t("icon_draw")} label={t("ql_templates")} activeTab={activeView} setTab={setActiveView as any} />
      </HoverTabDrawer>

      <div className="flex-1 flex flex-col min-h-0 w-full mt-4">
        {activeView === 'OVERVIEW' ? (
          <MasonProfileOverview posts={posts} mods={mods} marketAssets={marketAssets} mason={mason} setActiveView={setActiveView} setModCategory={setModCategory} setModSearch={setModSearch} setActiveAsset={setActiveAsset} setSelectedBlueprint={setSelectedBlueprint} onModClick={onModClick} activeGameSchema={activeGameSchema} handlePostClick={handlePostClick} handleToggleLike={handleToggleLike} isOwner={isOwner} onEditShowcase={() => setIsPinPanelOpen(true)} t={t} />
        ) : (
          <div className="flex flex-col gap-6 h-full w-full">
            <div className="flex-1 overflow-y-auto custom-scrollbar content-start pb-32">
              {activeView === 'COMM-LINK' && <MasonProfileCommLink posts={posts} modSearch={modSearch} handlePostClick={handlePostClick} handleToggleLike={handleToggleLike} t={t} />}
              {activeView === 'MODS' && <MasonProfileArtifacts filteredMods={filteredMods} onModClick={onModClick} mason={mason} activeGameSchema={activeGameSchema} isOwner={isOwner} handlePin={handlePin} t={t} />}
              {['BLUEPRINTS', 'LEXICONS', 'CHAMELEONS', 'TEMPLATES'].includes(activeView) && <MasonProfileAssets activeView={activeView} marketAssets={marketAssets} modSearch={modSearch} modCategory={modCategory} hidePaid={hidePaid} hideEarlyAccess={hideEarlyAccess} mason={mason} setSelectedBlueprint={setSelectedBlueprint} setActiveAsset={setActiveAsset} isInstalled={isInstalled} isOutdated={isOutdated} importLexicon={importLexicon} importTheme={importTheme} vaultPath={vaultPath} exists={exists} importFs={importFs} setInstalledTemplates={setInstalledTemplates} getAssetDisplayVersion={getAssetDisplayVersion} useStore={useStore} isOwner={isOwner} handlePin={handlePin} t={t} />}
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

      <SidePanelMasonPin isOpen={isPinPanelOpen} onClose={() => setIsPinPanelOpen(false)} mason={mason} mods={mods} marketAssets={marketAssets} handlePin={handlePin} activeGameSchema={activeGameSchema} t={t} />
    </div>
  );
}


