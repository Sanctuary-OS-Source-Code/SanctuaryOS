import { SearchBar, ScreenUtilityBar } from "../shared";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, supabaseAuth } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { IconPlugin } from '../IconPlugin';
import { SidePanel, standardButtonClass, standardAccentGlassButtonClass, CustomDropdown, HoverTooltip, EmptyState, extractPostImage, stripMarkdown, HubTabs, ActionButton, ViewToggle, RadioCardGroup, RadioCard, FilterPopover, PanelHeaderGroup, PanelHeaderButton, LinkAssetSidePanel } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";
import MasonPostCard from "../MasonPostCard";
import MarkdownRenderer from "../MarkdownRenderer";
import IconPicker from "../IconPicker";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import { logArchitectAction } from "../lib/audit";

export default function KeepersWebNewsEditor({ isSidePanel = false, isOpen = true, onClose = () => {} }: any = {}) {
  const session = useStore((state) => state.session);
  const currentUserId = session?.user?.id;
  const isPostPinned = (p: any) => p?.is_pinned === true || p?.is_pinned === "true";
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState<string[]>(["Public"]);
  const targetAudienceOptions = ["All", "Public", "Citizens", "Masons", "Architects", "Oversight", "Wayfinders", "Keepers"];
  const [communityOptions, setCommunityOptions] = useState<string[]>([]);
  const [category, setCategory] = useState("Announcement");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("Standard");
  const [isUrgent, setIsUrgent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [codeSnippet, setCodeSnippet] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [inlineImageUrl, setInlineImageUrl] = useState("");

  const [masonName, setWayfinderName] = useState<string>("");
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [filterAudience, setFilterAudience] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Active");

  const wayfinderDrafts = useStore(state => state.wayfinderDrafts);
  const setWayfinderDrafts = useStore(state => state.setWayfinderDrafts);

  useEffect(() => {
    if (isEditorOpen) {
      const draftId = editingPostId || 'new';

      let isUnchanged = false;
      if (editingPost) {
        let rawContent = editingPost.message || editingPost.content || '';
        let parsedImage = extractPostImage(editingPost) || "";
        if (rawContent.startsWith('[IMG:')) {
          const endIdx = rawContent.indexOf(']');
          if (endIdx !== -1) {
            rawContent = rawContent.substring(endIdx + 1).trim();
          }
        }

        isUnchanged =
          title === editingPost.title &&
          content === rawContent &&
          targetAudience.join(',') === (editingPost.target_audience || "All") &&
          category === (editingPost.category || "Update") &&
          codeSnippet === (editingPost.code_snippet || "") &&
          
          true;
      } else {
        isUnchanged = title === "" &&
          description === "" &&
          content === "" &&
          targetAudience.length === 0 &&
          category === "Update" &&
          imageUrl === "" &&
          codeSnippet === "" &&
          
          
          isActive === true;
      }

      if (isUnchanged) {
        setWayfinderDrafts(prev => {
          if (!prev[draftId]) return prev;
          const next = { ...prev };
          delete next[draftId];
          return next;
        });
      } else {
        setWayfinderDrafts(prev => ({
          ...prev,
          [draftId]: { title, description, content, targetAudience, category, imageUrl, codeSnippet, isActive }
        }));
      }
    }
  }, [isEditorOpen, editingPostId, editingPost, title, description, content, targetAudience, category, imageUrl, codeSnippet, isActive]);

  const updateTimeoutRef = useRef<any>(null);



  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      IconPlugin,
      Image
    ],
    content: content,
    onUpdate: ({ editor }) => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        setContent((editor.storage as any).markdown.getMarkdown());
      }, 500);
    },
    editorProps: {
      attributes: {
        class: 'w-full flex-1 px-6 py-6 text-[var(--text)] text-sm font-sans focus:outline-none custom-scrollbar min-h-[350px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-[var(--accent)] [&_img]:rounded-xl [&_img]:max-w-full [&_code]:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_code]:px-1 [&_code]:rounded [&_hr]:border-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_hr]:my-8',
      },
    },
  });

  const fetchPostsAndAssets = async () => {
    const targetTable = 'system_broadcasts';
    const { data } = await supabaseAuth.from(targetTable)
      .select('*')
      .in('category', ['Announcement', 'Blog', 'Press', 'Update', 'Maintenance'])
      .ilike('target_audience', '%Public%')
      .order('created_at', { ascending: false });
    if (data) {
      const activeSchema = useStore.getState().activeGameSchema;
      const gameName = activeSchema ? (activeSchema.name || "Sanctuary") : "Sanctuary";

      const hydratedData = data.map((post: any) => {
        let teamName = "Sanctuary OS";
        return {
          ...post,
          mason_id: post.mason_id || 'system',
          masons: {
            ...post.masons,
            name: teamName
          }
        };
      });
      setPosts(hydratedData);
    }

    if (currentUserId) {
      if (currentUserId === 'system') {
        setWayfinderName("SYSTEM");
      } else {
        const { data: profileData } = await supabase.from('profiles').select('username').eq('id', currentUserId).maybeSingle();
        if (profileData?.username) setWayfinderName(profileData.username);
      }
    }



    if (true) {
      const { data: gamesData } = await supabase.from('sanctuary_games').select('name').not('is_active', 'eq', false);
      if (gamesData) {
      }
    }
  };

  useEffect(() => { fetchPostsAndAssets(); }, []);

  const handleInsertText = (prefix: string, suffix: string = "") => {
    if (editor) {
      editor.chain().focus().insertContent(prefix + suffix).run();
    }
  };

  const handleLinkAsset = (asset: any) => {
    const linkStr = `asset://${asset.type}/${asset.id}`;

    const typeKey = `masonhub_asset_type_${asset.type}`;
    const translatedType = t(typeKey) !== typeKey ? t(typeKey) : (asset.type === 'mod' ? 'Artifact' : asset.type === 'blueprint' ? 'Blueprint' : asset.type === 'chameleon' ? 'Theme' : 'Lexicon');
    const translatedView = t("btn_view");

    const text = `${translatedType}: ${asset.name}`;

    if (editor) {
      editor.chain().focus()
        .insertContent({
          type: 'text',
          text: text,
          marks: [{ type: 'link', attrs: { href: linkStr } }]
        })
        .insertContent(' ')
        .run();
    }

    setIsAssetPanelOpen(false);
  };

  const openEditor = (post?: any) => {
    const draftId = post ? post.id : 'new';
    const draft = useStore.getState().wayfinderDrafts[draftId];

    if (post) {
      setEditingPostId(post.id);
      setEditingPost(post);
      let rawContent = post.message || post.content || '';
      let parsedImage = extractPostImage(post) || "";

      if (parsedImage) {
        rawContent = rawContent.replace(new RegExp(`\\[IMG:${parsedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*`), '');
        rawContent = rawContent.replace(new RegExp(`!\\[.*?\\]\\(${parsedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*`), '');
        rawContent = rawContent.replace(new RegExp(`<img[^>]+src=["']${parsedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*`, 'i'), '');
      }
      rawContent = rawContent.replace(/\[IMG:.*?\]\s*/, '').trim();

      setTitle(draft?.title ?? post.title);
      setDescription(draft?.description ?? (post.description || ""));
      setTargetAudience(draft?.targetAudience ?? (post.target_audience ? post.target_audience.split(',') : ["All"]));
      setCategory(draft?.category ?? (post.category || "Announcement"));
      setCodeSnippet(draft?.codeSnippet ?? (post.code_snippet || ""));
      setShowCodeInput(!!(draft?.codeSnippet ?? post.code_snippet));
      
      
      setIsActive(draft?.isActive ?? (post.is_active !== false));

      const contentToSet = draft?.content ?? rawContent;
      setContent(contentToSet);
      if (editor) {
        editor.commands.setContent(contentToSet);
      }
      setImageUrl(draft?.imageUrl ?? parsedImage);
    } else {
      setEditingPost(null);
      setTitle(draft?.title ?? "");
      setDescription(draft?.description ?? "");
      setTargetAudience(draft?.targetAudience ?? []);
      setCategory(draft?.category ?? "Announcement");

      const contentToSet = draft?.content ?? "";
      setContent(contentToSet);
      if (editor) {
        editor.commands.setContent(contentToSet);
      }
      setImageUrl(draft?.imageUrl ?? "");
      setCodeSnippet(draft?.codeSnippet ?? "");
      setShowCodeInput(!!draft?.codeSnippet);
      
      
      setIsActive(draft?.isActive ?? true);
    }
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    if (editingPostId) {
      const post = posts.find(p => p.id === editingPostId);
      if (post) {
        setTitle(post.title);
        setDescription(post.description || "");
        setContent(post.content);
        if (editor) editor.commands.setContent(post.content);
        setTargetAudience(post.target_audience ? post.target_audience.split(',') : ['All']);
        setCategory(post.category || 'Announcement');
      }
    } else {
      setTitle("");
      setDescription("");
      setContent("");
      if (editor) editor.commands.setContent("");
      setTargetAudience([]);
      setCategory("Announcement");
    }
    setTimeout(() => {
      setEditingPostId(null);
      setIsSubmitting(false);
      setPreviewPost(null);
    }, 300);
    setImageUrl("");
    setCodeSnippet("");
    setShowCodeInput(false);
    setShowImageInput(false);
    setShowIconPicker(false);
    
    
    setIsActive(true);
  };

  const handleDiscardChanges = () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      setTimeout(() => setConfirmDiscard(false), 3000);
      return;
    }
    const draftId = editingPostId || 'new';
    setWayfinderDrafts(prev => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
    setConfirmDiscard(false);
    closeEditor();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalContent = content;
    if (editor) {
      finalContent = (editor.storage as any).markdown.getMarkdown();
      setContent(finalContent);
    }

    if (!title.trim() || !finalContent.trim()) return;

    setIsSubmitting(true);
    let finalCategory = category;
    let isPinned = false;
    let payload: any = { title: title.trim(), description: description.trim() || null, message: finalContent.trim(), category: finalCategory, target_audience: "Public", code_snippet: codeSnippet.trim() || null, is_pinned: false, is_active: isActive };
    if (imageUrl.trim()) payload.message = `[IMG:${imageUrl.trim()}]\n\n` + payload.message;

    let error = null;
    let newPostId: string | null = null;
    const targetTable = 'system_broadcasts';
    const performSave = async (data: any) => {
      const payloadWithId = editingPostId ? { id: editingPostId, ...data } : data;
      let res = await supabaseAuth.from(targetTable).upsert(payloadWithId).select();

      if (!res.error && (!res.data || res.data.length === 0) && editingPostId) {
        res.error = { message: "Permission denied or post not found. Check your roles." } as any;
      }

      if (editingPostId) {
        if (!res.error) await logArchitectAction("Updated Dispatch", targetTable, data.title, undefined, "Wayfinder Operations");
      } else {
        if (!res.error && res.data && res.data.length > 0) {
          newPostId = res.data[0].id;
          await logArchitectAction("Created Dispatch", targetTable, data.title, undefined, "Wayfinder Operations");
        }
      }
      return { error: res.error, data: res.data };
    };

    let resObj = await performSave(payload);
    error = resObj.error;

    if (!error) {
      if (!editingPostId && newPostId) {
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
          const { data: followers } = await supabase.from('profiles').select("id");
          console.log("Followers for dispatch:", followers);
          if (followers && followers.length > 0) {
            const activeSchema = useStore.getState().activeGameSchema;
            let teamName = "Sanctuary OS Team";
            if (false) {
              teamName = false ? (activeSchema ? `${activeSchema.display_name || activeSchema.name} Oversight Team` : "Oversight Team") : (activeSchema ? `${activeSchema.display_name || activeSchema.name} Team` : "Wayfinder Team");
            }

            const notifications = followers.map(f => {
              let actionWord = "a new System Dispatch";
              if (payload.category === "Alert" || payload.category.includes("Alert")) {
                actionWord = payload.is_pinned ? "an Urgent Alert" : "a new Alert";
              } else if (payload.category === "Maintenance") {
                actionWord = "a Maintenance Notice";
              } else if (payload.category === "Update") {
                actionWord = "a new Update";
              } else if (payload.category === "Community") {
                actionWord = "a Community Announcement";
              }

              return {
                id: crypto.randomUUID(),
                user_id: f.id,
                actor_id: authUser.user!.id,
                type: 'system_broadcast',
                reference_id: newPostId,
                message: `${teamName} has posted ${actionWord}: ${payload.title}`
              };
            });
            try {
              await Promise.all(notifications.map(notif =>
                supabase.from('notifications').upsert(notif).then(res => {
                  if (res.error) console.error("Notification insert error:", res.error);
                })
              ));
              window.dispatchEvent(new CustomEvent('refresh_notifications'));
            } catch (e) {
              console.error("Failed to insert notifications:", e);
            }
          }
        }
      }

      useStore.getState().setWayfinderDrafts(prev => {
        const next = { ...prev };
        delete next[editingPostId || 'new'];
        return next;
      });

      closeEditor();
      fetchPostsAndAssets();
      useStore.getState().pushStatus(editingPostId ? "Transmission Updated!" : t("post_success"), 'success');
    } else {
      useStore.getState().pushStatus(`Transmission Failed: ${error.message}`, 'error');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const targetTable = 'system_broadcasts';
    const postToDelete = posts.find(p => p.id === id);

    const res = await supabaseAuth.from(targetTable).delete().eq('id', id);
    let error = res.error;

    if (!error && postToDelete) await logArchitectAction("Deleted Dispatch", targetTable, postToDelete.title || id, undefined, "Wayfinder Operations");
    fetchPostsAndAssets();
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      const searchMatch = p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.message || p.content)?.toLowerCase().includes(searchTerm.toLowerCase());
      const audienceMatch = filterAudience === "All" || (p.target_audience && p.target_audience.includes(filterAudience));
      const categoryMatch = filterCategory === "All" || p.category === filterCategory;
      const statusMatch = filterStatus === "All" || (filterStatus === "Active" ? p.is_active !== false : p.is_active === false);
      return searchMatch && audienceMatch && categoryMatch && statusMatch;
    });
  }, [posts, searchTerm, filterAudience, filterCategory, filterStatus]);



  const draftKeysStr = useMemo(() => Object.keys(wayfinderDrafts).sort().join(','), [wayfinderDrafts]);

  const renderPostCard = (post: any) => {
    const draftSet = new Set(draftKeysStr.split(','));
    const hasUnsavedEdits = draftSet.has(post.id);
    return (
      <MasonPostCard
        key={post.id}
        post={post}
        index={0}
        onPostClick={() => openEditor(post)}
        onToggleLike={() => { }}
        hasUnsavedEdits={hasUnsavedEdits}
        actions={
          <div className={`flex items-center gap-2 w-full transition-opacity duration-300 relative z-20 ${confirmDelete === post.id ? 'justify-center' : 'justify-end opacity-0 group-hover:opacity-100'}`}>
            {confirmDelete === post.id ? (
              <>
                <span className="text-[10px] font-black text-[var(--danger)] capitalize tracking-widest self-center animate-pulse flex items-center gap-1.5 opacity-80 mr-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_warning_amber")}</span> {t("btn_confirm")}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black capitalize tracking-widest text-[var(--text)] opacity-60 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_close")}</span> {t("nav_cancel")}</button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(post.id); setConfirmDelete(null); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black capitalize tracking-widest text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-md transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_delete_forever")}</span> {t("purge")}</button>
              </>
            ) : (
              <>
                <button onClick={(e) => { e.stopPropagation(); setPreviewPost(post); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black capitalize tracking-widest text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:shadow-md border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_visibility")}</span> {t("btn_view")}</button>
                <button onClick={(e) => { e.stopPropagation(); openEditor(post); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black capitalize tracking-widest text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] hover:shadow-md border border-transparent hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_edit")}</span> {t("emote_edit")}</button>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(post.id); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black capitalize tracking-widest text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:shadow-md border border-transparent hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_delete")}</span> {t("purge")}</button>
              </>
            )}
          </div>
        }
      />
    );
  };

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
    },
    {
      id: "Active",
      label: t("status_active"),
      icon: "newspaper",
      number: posts.filter(p => p.is_active !== false).length,
    },
    {
      id: "Inactive",
      label: t("status_inactive"),
      icon: "hide_source",
      number: posts.filter(p => p.is_active === false).length,
    }
  ];

  const renderLanding = () => {
    const activePosts = posts.filter(p => p.is_active !== false);
    const inactivePosts = posts.filter(p => p.is_active === false);

    return (
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
            <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase flex items-center gap-2">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">newspaper</span>
              {t("recent_active_news") || "Recent Active News"}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
            {activePosts.slice(0, 10).map(renderPostCard)}
            {activePosts.length === 0 && <EmptyState icon="newspaper" title={t("no_transmissions")} className="py-8" />}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
            <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase flex items-center gap-2">
              <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)]">hide_source</span>
              {t("recent_inactive_news") || "Recent Inactive News"}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
            {inactivePosts.slice(0, 10).map(renderPostCard)}
            {inactivePosts.length === 0 && <EmptyState icon="newspaper" title={t("no_transmissions")} className="py-8" />}
          </div>
        </div>
      </div>
    );
  };

  const contentBlock = (
    <ElevatedHubLayout
      headerTitle={t("web_news") || "Web News"}
      headerSubtitle={t("web_news_subtitle") || "Manage website announcements and blog posts"}
      headerIcon="newspaper"
      headerIconColorClass="theme-text-accent"
      hideHeader={isSidePanel}
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("mason_search_placeholder")}
      tabs={tabs}
      activeTab={filterStatus === 'overview' ? 'overview' : filterStatus}
      onTabChange={(id) => setFilterStatus(id as any)}
      headerActions={
        <div className="flex items-center gap-2">
            <FilterPopover icon="tune" label="" className="shrink-0">
                <div className="flex flex-col gap-2 p-4">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-1">{t("filter_category")}</label>
                    <CustomDropdown
                        value={filterCategory}
                        onChange={(v: string[]) => setFilterCategory(v[0])}
                        options={[
                            { id: "All", label: t("all_classes") },
                            { id: "Announcement", label: "Announcement" },
                            { id: "Blog", label: "Blog" },
                            { id: "Press", label: "Press" },
                            { id: "Update", label: "Update" },
                            { id: "Maintenance", label: "Maintenance" }
                        ]}
                    />
                </div>
            </FilterPopover>
            <ActionButton
                onClick={() => openEditor()}
                iconOnly={true}
                icon={t("icon_cell_tower")}
                label={<>{wayfinderDrafts['new'] ? t("action_unsaved_draft") : t("post_broadcast")}</>}
                variant={wayfinderDrafts['new'] ? "warning" : "default"}
            />
        </div>
      }
    >
      {filterStatus === 'overview' ? renderLanding() : (
          <div className="flex flex-col gap-4">
            {filteredPosts.length === 0 ? (
              <EmptyState icon={t("icon_cell_tower")} title={t("no_transmissions")} className="col-span-full py-16" />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
                {filteredPosts.map(renderPostCard)}
              </div>
            )}
          </div>
      )}
    </ElevatedHubLayout>
  );

  const wrappedContent = contentBlock;

  return (
    <>
      {wrappedContent}

      {isEditorOpen && (
        <>
          <SidePanel
            isOpen={isEditorOpen}
            onClose={closeEditor}
            icon="cell_tower"
            widthClass="w-[800px]"
            title={editingPostId ? (t("update_transmission")) : (t("post_broadcast"))}
            subtitle={editingPostId ? (t("editing_record")) : (t("composing_broadcast"))}
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  onClick={() => setIsActive(!isActive)}
                  tooltip={isActive ? t("active", "Active") : t("filter_inactive", "Inactive")}
                  icon={isActive ? "sensors" : "sensors_off"}
                  variant={isActive ? "success" : "default"}
                  isActive={isActive}
                />
                <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-2" />
                {((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) ? (
                  <PanelHeaderButton
                    onClick={handleDiscardChanges}
                    disabled={isSubmitting}
                    tooltip={confirmDiscard ? (t("ui_confirm_discard")) : (t("ui_btn_discard_edits"))}
                    icon={confirmDiscard ? "warning" : "delete"}
                    variant="danger"
                    className={confirmDiscard ? "animate-pulse" : ""}
                  />
                ) : (
                  <PanelHeaderButton
                    onClick={closeEditor}
                    disabled={isSubmitting}
                    tooltip={t("nav_cancel")}
                    icon="close"
                  />
                )}
                <PanelHeaderButton
                  onClick={handleSubmit}
                  disabled={isSubmitting || !title || !content}
                  tooltip={isSubmitting ? t("btn_saving") : (editingPostId ? t("update_transmission") : t("btn_post"))}
                  icon={isSubmitting ? "sync" : "send"}
                  variant={((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) ? "warning" : "accent"}
                  className={isSubmitting ? "animate-pulse" : ""}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-6">

              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* RadioCardGroup removed */}
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("post_title")}</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("post_title")} className="glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all w-full" />
                </div>

                <div className="flex flex-col gap-2 w-full">
                  <div className="flex justify-between items-center ml-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">{t("post_description")}</label>
                    <span className={`text-[9px] font-black ${description.length >= 250 ? 'text-[var(--warning)]' : 'text-[var(--subtext)] opacity-60'}`}>{description.length} / 250</span>
                  </div>
                  <input maxLength={250} value={description} onChange={e => setDescription(e.target.value)} placeholder={t("post_description_ph")} className="glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all w-full" />
                </div>

                <div className="flex gap-4 w-full">
                  <div className="flex flex-col gap-2 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("category")}</label>
                    <div className="h-14">
                      <CustomDropdown disableTint={true}
                        searchable={true}
                        allowCustom={true}
                        value={category}
                        onChange={(v: string[]) => setCategory(v[0])}
                          options={[
                            { id: "Announcement", label: "Announcement" },
                            { id: "Blog", label: "Blog" },
                            { id: "Press", label: "Press" },
                            { id: "Update", label: "Update" },
                            { id: "Maintenance", label: "Maintenance" }
                          ].map(c => ({ id: c.id, label: c.label }))}
                        placeholder={t("auto_select_category")}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("header_image_placeholder")}</label>
                  <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder={t("header_image_placeholder")} className="glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all" />
                </div>

                <div className="flex flex-col gap-2 flex-1 min-h-[400px]">
                  <div className="flex items-center justify-between ml-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">{t("post_content")}</label>
                  </div>
                  <div className="flex flex-col flex-1 glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl border focus-within:border-[var(--accent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all">
                    <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
                      <div className="relative flex flex-col items-center pointer-events-auto w-fit">
                        <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-[1.25rem] shadow-xl backdrop-blur-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]" style={{ backgroundColor: 'color-mix(in srgb, color-mix(in srgb, var(--text) 5%, var(--bg)) 85%, transparent)' }}>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bold') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_bold")}</span></button><HoverTooltip title={t("editor_tt_bold")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('italic') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_italic")}</span></button><HoverTooltip title={t("editor_tt_italic")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h1")}</span></button><HoverTooltip title={t("editor_tt_h1")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h2")}</span></button><HoverTooltip title={t("editor_tt_h2")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bulletList') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_bulleted")}</span></button><HoverTooltip title={t("editor_tt_bullets")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('orderedList') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_numbered")}</span></button><HoverTooltip title={t("editor_tt_numbers")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => setShowImageInput(!showImageInput)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showImageInput ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_image")}</span></button><HoverTooltip title={t("editor_tt_image")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('codeBlock') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_code")}</span></button><HoverTooltip title={t("editor_tt_code")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"><span className="material-symbols-outlined !text-[18px]">{t("icon_horizontal_rule")}</span></button><HoverTooltip title={t("editor_tt_hr")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => setShowIconPicker(!showIconPicker)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showIconPicker ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">sentiment_satisfied</span></button><HoverTooltip title={t("editor_tt_icon")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                        </div>
                        {showIconPicker && (
                          <IconPicker
                            onSelect={(icon) => {
                              editor?.chain().focus().insertContent(`[ICON:${icon}] `).run();
                              setShowIconPicker(false);
                            }}
                            onClose={() => setShowIconPicker(false)}
                          />
                        )}
                      </div>
                    </div>

                    {showImageInput && (
                      <div className="border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner animate-in slide-in-from-top-2 duration-300 flex items-center gap-3 relative z-10 backdrop-blur-xl">
                        <input
                          value={inlineImageUrl}
                          onChange={e => setInlineImageUrl(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && inlineImageUrl) {
                              e.preventDefault();
                              editor?.chain().focus().setImage({ src: inlineImageUrl }).run();
                              setInlineImageUrl('');
                              setShowImageInput(false);
                            }
                          }}
                          placeholder={t("image_url_placeholder")}
                          className="flex-1 glass-surface rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] transition-all shadow-inner"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (inlineImageUrl) {
                              editor?.chain().focus().setImage({ src: inlineImageUrl }).run();
                              setInlineImageUrl('');
                              setShowImageInput(false);
                            }
                          }}
                          className="px-6 py-2 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] rounded-xl font-black text-[10px] capitalize tracking-widest shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] transition-all hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                        >
                          {t("ui_btn_insert")}
                        </button>
                      </div>
                    )}

                    <div className="w-full flex-1 relative min-h-[350px]">
                      <EditorContent editor={editor} className="h-full w-full custom-scrollbar" />
                    </div>

                    {showCodeInput && (
                      <div className="border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner animate-in slide-in-from-bottom-2 duration-300">
                        <textarea
                          value={codeSnippet}
                          onChange={(e) => setCodeSnippet(e.target.value)}
                          placeholder={t("code_snippet_placeholder")}
                          className="w-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-xl text-[var(--text)] p-4 text-xs font-mono placeholder-[var(--subtext)] outline-none h-48 custom-scrollbar focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:border-[var(--accent)]"
                          spellCheck={false}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between p-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-b-2xl shrink-0">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowCodeInput(!showCodeInput)} className={`px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest flex items-center gap-1.5 ${showCodeInput ? 'theme-bg-accent/20 theme-text-accent' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_data_object")}</span> {showCodeInput ? (t("hide_code")) : (t("masonhub_add_code"))}
                        </button>
                        <button type="button" onClick={() => setIsAssetPanelOpen(true)} className="px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_link")}</span> {t("link_asset")}
                        </button>
                      </div>
                      <div className="text-[9px] font-black tracking-widest capitalize opacity-40 flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("icon_markdown")}</span> {t("icon_markdown")}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SidePanel>
        </>
      )}

      <LinkAssetSidePanel
        isOpen={isAssetPanelOpen}
        onClose={() => setIsAssetPanelOpen(false)}
        onAssetSelect={handleLinkAsset}
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      />

      {previewPost && (
        <MasonPostViewer
          post={{ ...previewPost, content: previewPost.message || previewPost.content || '' }}
          onClose={() => setPreviewPost(null)}
          userId={session?.user?.id || ''}
          onOpenMasonProfile={undefined}
          onAssetClick={(type: string, id: string) => setActiveAsset({ type, id })}
        />
      )}

      {activeAsset && <AssetPreviewSidebar assetType={activeAsset.type} assetId={activeAsset.id} onClose={() => setActiveAsset(null)} />}
    </>
  );
}






















