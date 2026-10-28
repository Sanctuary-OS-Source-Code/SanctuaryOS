import {
  handleOpenUrl,
  getFileLabel,
  processModsIntoCollections,
  enrichBlueprintsWithPremiumStatus,
  CustomDropdown,
  DashboardStatTile,
  EmptyState,
  ActionPill,
  LoadingScreen,
  SidePanel,
  SidePanelHeroCard,
  ActionButton,
  compareVersions
} from "./shared";
import { useState, useEffect } from "react";
import { supabase, getActiveGameClient } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { useStore } from "./store";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { readDir, readTextFile, exists } from "@tauri-apps/plugin-fs";
import * as importFs from "@tauri-apps/plugin-fs";
import { MarketBlueprintPanel } from "./side-panels/NexusSidePanels";
import MasonProfileHeader from "./MasonProfileHeader";
import MasonProfileOverview from "./MasonProfileOverview";
import MasonProfileCommLink from "./MasonProfileCommLink";
import MasonProfileArtifacts from "./MasonProfileArtifacts";
import MasonProfileAssets from "./MasonProfileAssets";
import SidePanelMasonPin from "./side-panels/SidePanelMasonPin";
import { StatTileCarousel } from "./hub-components/SharedCommandScreenLayout";
import {
  getSupporterState,
  toggleLocalFollow,
  syncLocalMasonSupporterBridge,
  removeLocalMasonSupporterBridge,
  findLocalMasonSupporterPass,
  LocalMasonSupporter,
} from "./utils/supporterManager";
import { UniversalGroup, UniversalInput } from "./components/universal/UniversalLayout";

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
  } else if (filename.includes(".")) {
    const splitExt = filename.split(".");
    ext = splitExt[splitExt.length - 1].toUpperCase();
    name = splitExt.slice(0, -1).join(".");
  }
  return { name: name.replace(/_/g, " "), ext };
};

export default function MasonProfile({
  masonId,
  initialPostId,
  onModClick,
  syncBlueprintByCode,
}: {
  masonId: string;
  initialPostId?: string | null;
  onModClick: (mod: any) => void;
  syncBlueprintByCode?: (code: string) => void;
}) {
  const { t, importLexicon, registry } = useLexicon();
  const { importTheme, CORE_THEMES, customThemes } = useTheme();
  const activeGameSchema = useStore((state) => state.activeGameSchema);

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
            if (file.name?.endsWith("_template.json")) {
              try {
                const content = await readTextFile(`${templatesDir}\\${file.name}`);
                const parsed = JSON.parse(content);
                const d = Array.isArray(parsed) ? parsed[0] : parsed;
                if (d.name) {
                  map[d.name] = d.version || "1.0.0";
                }
              } catch {}
            }
          }
          setInstalledTemplates(map);
        }
      } catch {}
    };
    fetchLocalTemplates();
  }, [vaultPath]);

  const isInstalled = (asset: any) => {
    if (!asset) return false;
    if (asset.asset_type === "chameleon") {
      return Object.values({ ...CORE_THEMES, ...customThemes }).some(
        (th: any) => th.name === asset.name
      );
    } else if (asset.asset_type === "workbench_template") {
      return !!installedTemplates[asset.name];
    } else if (asset.asset_type === "lexicon") {
      return !!registry?.[asset.name];
    }
    return false;
  };

  const getLocalVersion = (asset: any) => {
    if (!asset) return null;
    if (asset.asset_type === "chameleon") {
      const theme = Object.values({ ...CORE_THEMES, ...customThemes }).find(
        (th: any) => th.name === asset.name
      ) as any;
      return theme?.version || "1.0.0";
    } else if (asset.asset_type === "workbench_template") {
      return installedTemplates[asset.name];
    } else if (asset.asset_type === "lexicon") {
      const lex = registry?.[asset.name];
      return lex?._meta_version || "1.0.0";
    }
    return null;
  };

  const getAssetDisplayVersion = (asset: any) => {
    let version = asset.version || "1.0.0";
    if (asset.asset_type === "workbench_template" && asset.json_data) {
      try {
        const parsedRaw =
          typeof asset.json_data === "string" ? JSON.parse(asset.json_data) : asset.json_data;
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
  const [localSupporterPass, setLocalSupporterPass] = useState<LocalMasonSupporter | null>(null);
  const [isSupportDrawerOpen, setIsSupportDrawerOpen] = useState(false);
  const [bridgeProvider, setBridgeProvider] = useState("patreon");
  const [bridgeToken, setBridgeToken] = useState("");
  const [bridgeTier, setBridgeTier] = useState("Supporter");
  const [isVerifyingBridge, setIsVerifyingBridge] = useState(false);

  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setModPage] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);

  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [modSearch, setModSearch] = useState("");
  const [modCategory, setModCategory] = useState("ALL");
  const [hidePaid, setHidePaid] = useState<boolean>(
    () => localStorage.getItem("sanctuary_hide_paid") === "true"
  );
  const [hideEarlyAccess, setHideEarlyAccess] = useState<boolean>(
    () => localStorage.getItem("sanctuary_hide_ea") === "true"
  );
  const [isPinPanelOpen, setIsPinPanelOpen] = useState(false);
  const [marketAssets, setMarketAssets] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<string>("OVERVIEW");
  const [lastInitialPostId, setLastInitialPostId] = useState<string | null>(null);

  const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);
  const [gameVersions, setGameVersions] = useState<string[]>([]);

  const [masonAlerts, setMasonAlerts] = useState<Record<string, boolean>>(() =>
    JSON.parse(localStorage.getItem("sanctuary_mason_alerts") || "{}")
  );

  const toggleMasonAlert = () => {
    const newAlerts = { ...masonAlerts, [masonId]: !masonAlerts[masonId] };
    setMasonAlerts(newAlerts);
    localStorage.setItem("sanctuary_mason_alerts", JSON.stringify(newAlerts));
  };

  useEffect(() => {
    async function loadVersions() {
      const { data } = await supabase
        .from("game_versions")
        .select("version")
        .order("version", { ascending: false });
      if (data) setGameVersions(data.map((v) => v.version));
    }
    loadVersions();
  }, []);

  useEffect(() => {
    if (initialPostId && initialPostId !== lastInitialPostId && posts.length > 0) {
      const target = posts.find((p) => p.id === initialPostId);
      if (target) {
        setSelectedPost(target);
        setLastInitialPostId(initialPostId);
      }
    }
  }, [initialPostId, posts, lastInitialPostId]);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || null;
      setUserId(currentUserId);

      const { data: mData } = await supabase.from("masons").select("*").eq("id", masonId).single();
      if (mData) {
        setMason(mData);
        if (mData.payment_processor) {
          setBridgeProvider(String(mData.payment_processor).toLowerCase());
        }
      }

      if (!mData || !mData.is_verified) {
        setLoading(false);
        return;
      }

      const { data: modsDataRaw } = await supabase
        .from("mods")
        .select("*")
        .eq("mason_id", masonId)
        .order("name");

      const [
        flavorGroupsRes,
        collectionsRes,
        relationshipsRes,
        flavorMembersRes,
        setMembersRes,
      ] = await Promise.all([
        supabase.from("flavor_groups").select("*"),
        supabase.from("collections").select("*"),
        supabase
          .from("mod_relationships")
          .select("parent_id, child_id, relationship_type")
          .in("relationship_type", ["twin", "addon", "flavor", "set_item", "beta"]),
        supabase.from("flavor_group_members").select("group_id, mod_hash"),
        supabase.from("collection_members").select("set_id, mod_id"),
      ]);

      if (modsDataRaw) {
        const matureEnabled = localStorage.getItem("sanctuary_mature_transmissions") === "true";
        const filteredModsRaw = modsDataRaw.filter((m: any) => {
          if (m.compliance_tier > 1) return false;
          if (!matureEnabled && m.compliance_tier > 0) return false;
          if (
            m.hash?.startsWith("dev_sandbox_") ||
            m.status?.toLowerCase().includes("sandbox")
          )
            return false;
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

      const { data: postsData } = await supabase
        .from("mason_posts")
        .select(
          "*, masons(name, avatar_url, patreon_url, discord_url, website_url, profile_id), likes:mason_post_likes(count), views:mason_post_views(count), comments:mason_post_comments(count)"
        )
        .eq("mason_id", masonId)
        .order("created_at", { ascending: false });
      if (postsData) setPosts(postsData);

      if (mData) {
        let orQuery = `author.ilike.%${mData.name}%`;
        const fallbackName = session?.user?.user_metadata?.username;
        if (fallbackName) {
          orQuery += `,author.ilike.%${fallbackName}%`;
        }
        const { data: assetsData } = await supabase
          .from("nexus_assets")
          .select("*")
          .or(orQuery)
          .or("is_public.eq.true,is_public.is.null")
          .order("created_at", { ascending: false });
        const { data: blueprintsData } = await supabase
          .from("blueprints")
          .select("*")
          .eq("mason_id", masonId)
          .eq("is_market_listed", true)
          .order("created_at", { ascending: false });

        let newAssets = assetsData || [];
        if (blueprintsData && blueprintsData.length > 0) {
          const premiumMap = await enrichBlueprintsWithPremiumStatus(supabase, blueprintsData);

          newAssets = [
            ...newAssets,
            ...blueprintsData.map((b) => {
              const artifacts = b.json_data?.artifacts || b.artifacts || [];
              const premiumInfo = premiumMap[b.id];
              const isPaid =
                premiumInfo?.is_paid || b.is_paid || artifacts.some((a: any) => a.is_paid);
              const isEarlyAccess =
                premiumInfo?.is_early_access ||
                b.is_early_access ||
                artifacts.some((a: any) => a.is_early_access);

              return {
                id: b.id,
                name: b.name,
                author: mData.name,
                description: (artifacts.length || 0) + " " + t("term_mods", "Items"),
                created_at: b.created_at,
                asset_type: "blueprint",
                is_paid: isPaid,
                is_early_access: isEarlyAccess,
                json_data: b,
              };
            }),
          ];
        }
        setMarketAssets(newAssets);
      }

      const { count } = await supabase
        .from("mason_followers")
        .select("*", { count: "exact", head: true })
        .eq("mason_id", masonId);
      const localState = await getSupporterState();
      const locallyFollowed = localState.follows.some((f) => f.mason_id === masonId);
      const matchedPass = findLocalMasonSupporterPass(
        localState.supporters,
        masonId,
        mData?.name
      );
      setLocalSupporterPass(matchedPass);

      const baseFollowers = Math.max(Number(mData?.followers_count || 0), count || 0);
      setFollowerCount(baseFollowers);
      setIsFollowing(locallyFollowed);

      setLoading(false);
    }
    if (masonId) loadProfile();
  }, [masonId]);

  const isOwner = userId === mason?.profile_id;

  const handlePin = async (type: "mod" | "asset" | "blueprint", id: string | number) => {
    try {
      const updateData: any = {};
      if (type === "mod") {
        if (String(id).startsWith("ccset_")) {
          updateData.pinned_ccset_id = id;
          updateData.pinned_mod_id = null;
        } else {
          updateData.pinned_mod_id = id;
          updateData.pinned_ccset_id = null;
        }
      } else if (type === "blueprint") {
        updateData.pinned_blueprint_id = id;
      } else {
        updateData.pinned_asset_id = id;
      }

      const state = useStore.getState();
      const token = state.session?.access_token;

      if (token) {
        const { error } = await supabase.rpc("secure_update_mason_profile", {
          p_token: token,
          p_mason_id: masonId,
          p_payload: updateData,
        });
        if (error) throw error;
      } else {
        const { error } = await getActiveGameClient()
          .from("masons")
          .update(updateData)
          .eq("id", masonId);
        if (error) throw error;
      }

      setMason((prev: any) => ({ ...prev, ...updateData }));
      useStore.getState().pushStatus(t("pinned_success", "Pinned to showcase!"));
    } catch (e: any) {
      console.error("Pin Error:", e);
      useStore.getState().pushStatus(t("pinned_fail", "Failed to pin item."));
    }
  };

  const toggleFollow = async () => {
    try {
      const nowFollowing = await toggleLocalFollow({
        masonId,
        masonName: mason?.name || "",
        avatarUrl: mason?.avatar_url || "",
      });
      setIsFollowing(nowFollowing);
      const nextCount = Math.max(0, followerCount + (nowFollowing ? 1 : -1));
      setFollowerCount(nextCount);
      await supabase.from("masons").update({ followers_count: nextCount }).eq("id", masonId);
    } catch {
      useStore.getState().pushStatus(t("err_follow_mason", "Failed to follow Mason."));
    }
  };

  const handleVerifyLocalBridge = async () => {
    if (!bridgeToken.trim()) return;
    setIsVerifyingBridge(true);
    try {
      const pass = await syncLocalMasonSupporterBridge({
        masonId,
        masonName: mason?.name || masonId,
        provider: bridgeProvider,
        tokenOrKey: bridgeToken.trim(),
        patreonCampaignId: mason?.patreon_campaign_id || "",
        tierName: bridgeTier.trim() || "Supporter",
      });
      setLocalSupporterPass(pass);
      setBridgeToken("");
      useStore
        .getState()
        .pushStatus(
          t("supporter_status_bridge_linked", "{Mason} Supporter Pass verified and saved to your local SQLite {Vault}!"),
          "success"
        );
    } catch (err: any) {
      useStore.getState().pushStatus(String(err), "error");
    } finally {
      setIsVerifyingBridge(false);
    }
  };

  const handleRemoveLocalBridge = async () => {
    try {
      await removeLocalMasonSupporterBridge(masonId);
      setLocalSupporterPass(null);
      useStore
        .getState()
        .pushStatus(
          t("supporter_status_bridge_removed", "Local {Mason} Supporter Pass removed from {Vault}."),
          "info"
        );
    } catch (err: any) {
      useStore.getState().pushStatus(String(err), "error");
    }
  };

  if (loading) return <LoadingScreen title={t("accessing", "Accessing...")} />;
  if (!mason)
    return (
      <div className="p-12 text-center text-[var(--subtext)] opacity-60 font-black tracking-widest capitalize">
        {t("not_found", "Not Found")}
      </div>
    );
  if (!mason.is_verified) {
    return (
      <div className="p-12 flex items-center justify-center min-h-[50vh] w-full">
        <EmptyState
          icon={t("icon_verified", "verified")}
          title={t("mason_verified_only_title", "Verified {Masons} Only")}
          subtitle={t("mason_profile_verified_only_desc", "Public {Mason} Profiles are exclusively available for Verified {Masons}.")}
        />
      </div>
    );
  }

  const filteredMods = mods.filter((m) => {
    if (hidePaid && m.is_paid) return false;
    if (hideEarlyAccess && m.is_early_access) return false;
    if (modCategory !== "ALL" && m.category_override !== modCategory) return false;
    if (modSearch && !m.name.toLowerCase().includes(modSearch.toLowerCase())) return false;
    return true;
  });

  const handleToggleLike = async (e: React.MouseEvent, post: any) => {
    e.stopPropagation();
    if (!userId)
      return useStore
        .getState()
        .pushStatus(t("auto_guest_mode_active_45", "Guest mode active."));
    const session = useStore.getState().session;

    const { error } = await supabase.rpc("secure_upsert_cloud_file", {
      p_target: "mason_post_likes",
      p_payload: { post_id: post.id, user_id: userId },
      p_token: session?.access_token,
    });

    let increment = 1;
    if (
      error &&
      (JSON.stringify(error).includes("23505") ||
        JSON.stringify(error).includes("duplicate key"))
    ) {
      const { data: likeData } = await supabase
        .from("mason_post_likes")
        .select("id")
        .eq("post_id", post.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (likeData) {
        await supabase.rpc("secure_delete_cloud_file", {
          p_target: "mason_post_likes",
          p_id: likeData.id,
          p_token: session?.access_token,
        });
      }
      increment = -1;
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likes: [{ count: Math.max(0, (p.likes?.[0]?.count || 0) + increment) }] }
          : p
      )
    );
  };

  const handlePostClick = async (post: any) => {
    setSelectedPost(post);
    const session = useStore.getState().session;
    if (userId && session?.access_token) {
      try {
        await supabase.rpc("secure_upsert_cloud_file", {
          p_target: "mason_post_views",
          p_payload: { post_id: post.id, user_id: userId },
          p_token: session.access_token,
        });
      } catch (e) {
        console.warn("Failed to record view", e);
      }
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, views: [{ count: (p.views?.[0]?.count || 0) + 1 }] } : p
      )
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 min-h-full w-full pb-36 pt-0 md:pt-4 px-0 md:px-6 max-w-[1600px] mx-auto">
      <MasonProfileHeader
        mason={mason}
        masonId={masonId}
        followerCount={followerCount}
        isFollowing={isFollowing}
        isVerifiedSupporter={!!localSupporterPass}
        onOpenSupportModal={() => setIsSupportDrawerOpen(true)}
        masonAlerts={masonAlerts}
        toggleFollow={toggleFollow}
        toggleMasonAlert={toggleMasonAlert}
        activeView={activeView}
        setActiveView={setActiveView}
        t={t}
      >
        {activeView !== "OVERVIEW" && (
          <div className="flex flex-row items-center justify-end gap-3 flex-1 w-full ml-auto">
            <ActionPill
              searchQuery={modSearch}
              setSearchQuery={setModSearch}
              searchPlaceholder={
                (activeView === "COMM-LINK"
                  ? t("mason_search_placeholder", "Search {dispatches}...")
                  : activeView === "LEXICONS"
                    ? t("ui_search_lexicons", "Search {Lexicons}...")
                    : activeView === "CHAMELEONS"
                      ? t("ui_search_chameleons", "Search {Chameleons}...")
                      : activeView === "TEMPLATES"
                        ? t("search_tmpl", "Search templates...")
                        : activeView === "BLUEPRINTS"
                          ? t("search_blueprints", "Search {Blueprints}...")
                          : t("search_ph", "Search {mods}...")) as string
              }
              primaryPopover={
                activeView !== "COMM-LINK"
                  ? {
                      icon: t("icon_tune", "tune"),
                      label: t("filters", "Filters"),
                      content: (
                        <div className="flex flex-col w-[320px] p-4 max-w-[calc(100vw-40px)] gap-6">
                          <div className="flex flex-col gap-2 w-full">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                              {t("filter_category", "Category")}
                            </span>
                            <CustomDropdown
                              disableTint={true}
                              flat={true}
                              variant="pill"
                              value={modCategory}
                              onChange={(v: any) => setModCategory(v[0])}
                              options={(() => {
                                let rawOpts: any[] = [];
                                if (activeView === "MODS") {
                                  rawOpts = [
                                    {
                                      id: "ALL",
                                      label: t("all_classes", "All Classes"),
                                      icon: t("icon_folder", "folder"),
                                    },
                                    ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                                      id: cat.id,
                                      label: t(cat.lexicon_key, cat.id) || cat.id,
                                      icon:
                                        t(cat.icon_key, "folder") ||
                                        t("icon_folder", "folder"),
                                    })) || []),
                                  ];
                                } else if (activeView === "LEXICONS") {
                                  const langs = Array.from(
                                    new Set(
                                      marketAssets
                                        .filter((a) => a.asset_type === "lexicon")
                                        .map((a) => {
                                          let lang = a.language;
                                          if (!lang && a.json_data) {
                                            try {
                                              const parsed =
                                                typeof a.json_data === "string"
                                                  ? JSON.parse(a.json_data)
                                                  : a.json_data;
                                              lang = parsed.language;
                                            } catch (e) {}
                                          }
                                          return lang || "Custom";
                                        })
                                    )
                                  );
                                  rawOpts = [
                                    {
                                      id: "ALL",
                                      label: t("all_languages", "All Languages"),
                                      icon: t("icon_folder", "folder"),
                                    },
                                    ...langs.map((l) => ({
                                      id: String(l),
                                      label: String(l),
                                      icon: t("icon_translate", "translate"),
                                    })),
                                  ];
                                } else if (activeView === "BLUEPRINTS") {
                                  rawOpts = [
                                    {
                                      id: "ALL",
                                      label: t("filter_all_versions", "All Versions"),
                                      icon: t("icon_folder", "folder"),
                                    },
                                  ];
                                  if (gameVersions && gameVersions.length > 0) {
                                    rawOpts = [
                                      ...rawOpts,
                                      ...gameVersions.map((v: string) => ({
                                        id: v,
                                        label: v,
                                        icon: t("icon_map", "map"),
                                      })),
                                    ];
                                  }
                                } else if (activeView === "CHAMELEONS") {
                                  rawOpts = [
                                    {
                                      id: "ALL",
                                      label: t("filter_all_modes", "All Modes"),
                                      icon: t("icon_folder", "folder"),
                                    },
                                    {
                                      id: "Dark",
                                      label: t("mode_dark", "Dark"),
                                      icon: t("icon_dark_mode", "dark_mode"),
                                    },
                                    {
                                      id: "Light",
                                      label: t("mode_light", "Light"),
                                      icon: t("icon_light_mode", "light_mode"),
                                    },
                                  ];
                                } else if (activeView === "TEMPLATES") {
                                  rawOpts = [
                                    {
                                      id: "ALL",
                                      label: t("filter_all_types", "All Types"),
                                      icon: t("icon_folder", "folder"),
                                    },
                                  ];
                                }

                                return rawOpts.map((opt) => ({
                                  id: opt.id,
                                  label: (
                                    <div className="flex items-center gap-3 text-xs">
                                      <span className="material-symbols-outlined !text-[16px] opacity-70">
                                        {opt.icon}
                                      </span>
                                      <span className="truncate">{opt.label}</span>
                                    </div>
                                  ),
                                }));
                              })()}
                            />
                          </div>

                          {(activeView === "MODS" || activeView === "BLUEPRINTS") && (
                            <div className="flex flex-col gap-3 w-full">
                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                                {t("filters", "Filters")}
                              </span>
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => {
                                    const newVal = !hidePaid;
                                    setHidePaid(newVal);
                                    localStorage.setItem("sanctuary_hide_paid", String(newVal));
                                    setModPage(1);
                                  }}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group ${
                                    hidePaid
                                      ? "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] backdrop-blur-md border border-transparent"
                                      : "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--accent)] border-transparent"
                                  }`}
                                >
                                  <span
                                    className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 relative z-10 ${
                                      hidePaid ? "scale-110" : "group-hover:scale-110"
                                    }`}
                                  >
                                    {hidePaid
                                      ? t("icon_visibility_off", "visibility_off")
                                      : t("icon_monetization_on", "monetization_on")}
                                  </span>
                                  <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap overflow-hidden text-ellipsis pt-0.5">
                                    {t("filter_hide_paid", "Hide Paid")}
                                  </span>
                                </button>
                                <button
                                  onClick={() => {
                                    const newVal = !hideEarlyAccess;
                                    setHideEarlyAccess(newVal);
                                    localStorage.setItem("sanctuary_hide_ea", String(newVal));
                                    setModPage(1);
                                  }}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group ${
                                    hideEarlyAccess
                                      ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] backdrop-blur-md border border-transparent"
                                      : "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--accent)] border-transparent"
                                  }`}
                                >
                                  <span
                                    className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 relative z-10 ${
                                      hideEarlyAccess ? "scale-110" : "group-hover:scale-110"
                                    }`}
                                  >
                                    {hideEarlyAccess
                                      ? t("icon_visibility_off", "visibility_off")
                                      : t("icon_science", "science")}
                                  </span>
                                  <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap overflow-hidden text-ellipsis pt-0.5">
                                    {t("filter_hide_early_access", "Hide Early Access")}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ),
                    }
                  : undefined
              }
            />
          </div>
        )}
      </MasonProfileHeader>

      <StatTileCarousel>
        <DashboardStatTile
          icon={t("icon_dashboard", "dashboard")}
          number={mods.length + marketAssets.length}
          label={t("tab_overview", "Overview")}
          colorClass="text-[var(--accent)]"
          onClick={() => {
            setActiveView("OVERVIEW");
            setModCategory("ALL");
            setModSearch("");
          }}
          variant="tab"
          isActive={activeView === "OVERVIEW"}
        />
        <DashboardStatTile
          icon={t("icon_account_balance", "account_balance")}
          number={mods.length}
          label={t("term_mods", "Artifacts")}
          colorClass="text-teal-500"
          onClick={() => {
            setActiveView("MODS");
            setModCategory("ALL");
            setModSearch("");
          }}
          variant="tab"
          isActive={activeView === "MODS"}
        />
        <DashboardStatTile
          icon={t("icon_map", "map")}
          number={marketAssets.filter((a: any) => a.asset_type === "blueprint").length}
          label={t("playsets_title", "{Blueprints}")}
          colorClass="text-blue-500"
          onClick={() => {
            setActiveView("BLUEPRINTS");
            setModCategory("ALL");
            setModSearch("");
          }}
          variant="tab"
          isActive={activeView === "BLUEPRINTS"}
        />
        <DashboardStatTile
          icon={t("icon_translate", "translate")}
          number={marketAssets.filter((a: any) => a.asset_type === "lexicon").length}
          label={t("tab_lexicons", "Lexicons")}
          colorClass="text-indigo-500"
          onClick={() => {
            setActiveView("LEXICONS");
            setModCategory("ALL");
            setModSearch("");
          }}
          variant="tab"
          isActive={activeView === "LEXICONS"}
        />
        <DashboardStatTile
          icon={t("icon_palette", "palette")}
          number={marketAssets.filter((a: any) => a.asset_type === "chameleon").length}
          label={t("chameleon", "Chameleon")}
          colorClass="text-purple-500"
          onClick={() => {
            setActiveView("CHAMELEONS");
            setModCategory("ALL");
            setModSearch("");
          }}
          variant="tab"
          isActive={activeView === "CHAMELEONS"}
        />
        <DashboardStatTile
          icon={t("icon_draw", "draw")}
          number={
            marketAssets.filter((a: any) => a.asset_type === "workbench_template").length
          }
          label={t("ql_templates", "Templates")}
          colorClass="text-pink-500"
          onClick={() => {
            setActiveView("TEMPLATES");
            setModCategory("ALL");
            setModSearch("");
          }}
          variant="tab"
          isActive={activeView === "TEMPLATES"}
        />
      </StatTileCarousel>

      <div className="flex-1 flex flex-col min-h-0 w-full mt-2">
        {activeView === "OVERVIEW" ? (
          <MasonProfileOverview
            posts={posts}
            mods={mods}
            marketAssets={marketAssets}
            mason={mason}
            setActiveView={setActiveView}
            setModCategory={setModCategory}
            setModSearch={setModSearch}
            setActiveAsset={setActiveAsset}
            setSelectedBlueprint={setSelectedBlueprint}
            onModClick={onModClick}
            activeGameSchema={activeGameSchema}
            handlePostClick={handlePostClick}
            handleToggleLike={handleToggleLike}
            isOwner={isOwner}
            onEditShowcase={() => setIsPinPanelOpen(true)}
            t={t}
          />
        ) : (
          <div className="flex flex-col gap-6 h-full w-full">
            <div className="flex-1 overflow-y-auto custom-scrollbar content-start pb-32">
              {activeView === "COMM-LINK" && (
                <MasonProfileCommLink
                  posts={posts}
                  modSearch={modSearch}
                  handlePostClick={handlePostClick}
                  handleToggleLike={handleToggleLike}
                  t={t}
                />
              )}
              {activeView === "MODS" && (
                <MasonProfileArtifacts
                  filteredMods={filteredMods}
                  onModClick={onModClick}
                  mason={mason}
                  activeGameSchema={activeGameSchema}
                  isOwner={isOwner}
                  handlePin={handlePin}
                  t={t}
                />
              )}
              {["BLUEPRINTS", "LEXICONS", "CHAMELEONS", "TEMPLATES"].includes(activeView) && (
                <MasonProfileAssets
                  activeView={activeView}
                  marketAssets={marketAssets}
                  modSearch={modSearch}
                  modCategory={modCategory}
                  hidePaid={hidePaid}
                  hideEarlyAccess={hideEarlyAccess}
                  mason={mason}
                  setSelectedBlueprint={setSelectedBlueprint}
                  setActiveAsset={setActiveAsset}
                  isInstalled={isInstalled}
                  isOutdated={isOutdated}
                  importLexicon={importLexicon}
                  importTheme={importTheme}
                  vaultPath={vaultPath}
                  exists={exists}
                  importFs={importFs}
                  setInstalledTemplates={setInstalledTemplates}
                  getAssetDisplayVersion={getAssetDisplayVersion}
                  useStore={useStore}
                  isOwner={isOwner}
                  handlePin={handlePin}
                  t={t}
                />
              )}
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

      <SidePanelMasonPin
        isOpen={isPinPanelOpen}
        onClose={() => setIsPinPanelOpen(false)}
        mason={mason}
        mods={mods}
        marketAssets={marketAssets}
        gameVersions={gameVersions}
        handlePin={handlePin}
        activeGameSchema={activeGameSchema}
        t={t}
      />

      <SidePanel
        isOpen={isSupportDrawerOpen}
        onClose={() => setIsSupportDrawerOpen(false)}
        title={t("supporter_bridge_modal_title", "Link {Mason} Supporter Bridge")}
        subtitle={mason?.name || ""}
        icon={t("icon_volunteer_activism", "volunteer_activism")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_volunteer_activism", "volunteer_activism")}
            overline={t("supporter_zero_fee_badge", "0% PLATFORM FEE • NON-CUSTODIAL")}
            title={mason?.name || t("supporter_bridge_modal_title", "Link {Mason} Supporter Bridge")}
            description={t("supporter_liability_notice", "Non-Custodial Notice: Partner Communities and {Masons} run their own payment processors and receive 100% of your contribution. Sanctuary OS takes a 0% cut, never touches the funds, and does not process refunds or chargebacks.")}
            badge={
              localSupporterPass
                ? t("supporter_badge_verified_patron", "VERIFIED SUPPORTER")
                : t("supporter_zero_honeypot_badge", "LOCAL SQLITE VAULT")
            }
            variant={localSupporterPass ? "success" : "accent"}
          />

          {(mason?.donation_url || mason?.patreon_url || mason?.website_url) && (
            <UniversalGroup
              title={t("supporter_btn_support_creator", "Support (0% Fee)")}
              icon={t("icon_volunteer_activism", "volunteer_activism")}
              headerAction={
                <span className="px-2.5 py-0.5 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-widest text-[var(--accent)]">
                  {mason?.payment_processor || "Patreon / Direct"}
                </span>
              }
            >
              <ActionButton
                variant="glass"
                className="w-full justify-center"
                icon={t("icon_open_in_new", "open_in_new")}
                label={t("supporter_btn_support_creator", "Support (0% Fee)")}
                onClick={() =>
                  handleOpenUrl(mason.donation_url || mason.patreon_url || mason.website_url)
                }
              />
            </UniversalGroup>
          )}

          {localSupporterPass ? (
            <UniversalGroup
              title={t("supporter_badge_verified_patron", "VERIFIED SUPPORTER")}
              icon={t("icon_verified", "verified")}
              headerColorClass="text-[var(--success)]"
              headerAction={
                <ActionButton
                  variant="danger"
                  icon={t("icon_delete", "delete")}
                  label={t("supporter_btn_unlink_bridge", "Remove Local Pass")}
                  onClick={handleRemoveLocalBridge}
                />
              }
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-4 py-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--success)_30%,transparent)]">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined !text-[20px] text-[var(--success)]">
                      {t("icon_verified", "verified")}
                    </span>
                    <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">
                      {localSupporterPass.provider} • {localSupporterPass.tier_name}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest glass-surface text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_bolt", "bolt")}
                    </span>
                    {t("supporter_badge_expedited_support", "EXPEDITED SUPPORT PATH")}
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest glass-surface text-[var(--warning)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_science", "science")}
                    </span>
                    {t("supporter_badge_early_access", "EARLY ACCESS SYNC")}
                  </span>
                </div>
              </div>
            </UniversalGroup>
          ) : (
            <UniversalGroup
              title={t("supporter_masons_vault_title", "{Mason} Supporter Passes (Local {Vault})")}
              icon={t("icon_encrypted", "encrypted")}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                    {t("supporter_bridge_provider_label", "Payment Processor / Platform")}
                  </span>
                  <CustomDropdown
                    disableTint={true}
                    value={bridgeProvider}
                    onChange={(vals: string[]) => {
                      if (vals[0]) setBridgeProvider(vals[0]);
                    }}
                    options={[
                      { id: "patreon", label: "Patreon (OAuth v2 Bridge)" },
                      { id: "kofi", label: "Ko-fi Supporter Pass" },
                      { id: "stripe", label: "Stripe / Direct Receipt" },
                    ]}
                    allowMultiSelect={false}
                  />
                </div>

                <UniversalInput
                  label={t(
                    "supporter_bridge_token_label",
                    "Patreon Access Token or Creator Supporter Key"
                  )}
                  value={bridgeToken}
                  onChange={setBridgeToken}
                  placeholder={t(
                    "supporter_bridge_token_ph",
                    "Paste token or supporter pass key (stored in local SQLite only)..."
                  )}
                />

                <UniversalInput
                  label={t("supporter_bridge_tier_label", "Supporter Tier Label (Optional)")}
                  value={bridgeTier}
                  onChange={setBridgeTier}
                  placeholder="Supporter"
                />

                <ActionButton
                  variant="glass"
                  className="w-full justify-center"
                  onClick={handleVerifyLocalBridge}
                  disabled={isVerifyingBridge || !bridgeToken.trim()}
                  icon={
                    isVerifyingBridge
                      ? t("icon_sync", "sync")
                      : t("icon_verified", "verified")
                  }
                  label={t("supporter_bridge_btn_verify", "Verify & Save to Local {Vault}")}
                />
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>
    </div>
  );
}
