
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { IconPlugin } from '../IconPlugin';
import { SidePanel, standardButtonClass, standardAccentGlassButtonClass, CustomDropdown, HoverTooltip, EmptyState, extractPostImage, stripMarkdown, HubTabs, ActionButton, LinkAssetSidePanel, PanelHeaderGroup, PanelHeaderButton, RadioCardGroup, RadioCard } from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import MarkdownRenderer from "../MarkdownRenderer";
import IconPicker from "../IconPicker";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import { logArchitectAction } from "../lib/audit";
import { extractDispatchMetadata, DispatchMetadataHeader, DispatchPollBuilder, DispatchPollViewer, DispatchPollData } from "../components/universal/DispatchPollAndMeta";

export function KeeperPostsEditor({ authorId, authorProfileId, handleOpenWayfinderProfile, isOversight, isSidePanel, isOpen, onClose }: { authorId: string, authorProfileId: string, handleOpenWayfinderProfile?: (authorId: string, postId?: string) => void, isOversight?: boolean, isSidePanel?: boolean, isOpen?: boolean, onClose?: () => void }) {
  if (isSidePanel && !isOpen) return null;
  const isPostPinned = (p: any) => p?.is_pinned === true || p?.is_pinned === "true";
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState<string[]>(["All Communities"]);
  const [category, setCategory] = useState("Update");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [partnerDatabases, setPartnerDatabases] = useState<any[]>([]);
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

  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"Dispatch" | "Alert">("Dispatch");
  const [isUrgent, setIsUrgent] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [actionRequired, setActionRequired] = useState<string>("");
  const [pollData, setPollData] = useState<DispatchPollData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [filterAudience, setFilterAudience] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState("overview");

  const wayfinderDrafts = useStore(state => state.wayfinderDrafts);
  const setWayfinderDrafts = useStore(state => state.setWayfinderDrafts);
  const session = useStore(state => state.session);

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
        const parsedMeta = extractDispatchMetadata(editingPost, rawContent);

        isUnchanged =
          title === editingPost.title &&
          content === parsedMeta.cleanContent &&
          targetAudience.join(',') === (editingPost.target_audience || "All") &&
          category === (editingPost.category || "Update") &&
          codeSnippet === (editingPost.code_snippet || "") &&
          deliveryMethod === (editingPost.category?.includes("Alert") || isPostPinned(editingPost) ? "Alert" : "Dispatch") &&
          isUrgent === isPostPinned(editingPost) &&
          actionRequired === (editingPost.action_required || parsedMeta.actionRequired || "") &&
          JSON.stringify(pollData || null) === JSON.stringify(editingPost.poll_data || null);
      } else {
        isUnchanged = title === "" &&
          description === "" &&
          content === "" &&
          targetAudience.length === 0 &&
          category === "Update" &&
          imageUrl === "" &&
          codeSnippet === "" &&
          deliveryMethod === "Dispatch" &&
          isUrgent === false &&
          isActive === true &&
          actionRequired === "" &&
          pollData === null;
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
          [draftId]: { title, description, content, targetAudience, category, imageUrl, codeSnippet, deliveryMethod, isUrgent, isActive, actionRequired, pollData }
        }));
      }
    }
  }, [isEditorOpen, editingPostId, editingPost, title, description, content, targetAudience, category, imageUrl, codeSnippet, deliveryMethod, isUrgent, isActive, actionRequired, pollData]);

  const updateTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (deliveryMethod === "Dispatch" && targetAudience.includes("Citizens")) {
      setTargetAudience(targetAudience.filter(a => a !== "Citizens"));
    }
  }, [deliveryMethod]);

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
    const { data } = await supabase.from('keeper_system_broadcasts').select('*').order('created_at', { ascending: false });
    if (data) setPosts(data);

    if (authorId) {
      if (authorId === 'system') {
        setWayfinderName("SYSTEM");
      } else {
        const { data: profileData } = await supabase.from('profiles').select('username').eq('id', authorId).maybeSingle();
        if (profileData?.username) setWayfinderName(profileData.username);
      }
    }

    const { data: gamesData } = await supabase.from('sanctuary_games').select('id, name');
    if (gamesData) setPartnerDatabases(gamesData);


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
    setViewMode('edit');
    setConfirmDelete(null);
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
      const parsedMeta = extractDispatchMetadata(post, rawContent);

      setTitle(draft?.title ?? post.title);
      setDescription(draft?.description ?? (post.description || ""));
      setTargetAudience(draft?.targetAudience ?? (post.target_audience ? post.target_audience.split(',') : ["All"]));
      const rawCat = draft?.category ?? (post.category || "Update");
      setCategory(rawCat === "Info" ? "Information" : rawCat);
      setCodeSnippet(draft?.codeSnippet ?? (post.code_snippet || ""));
      setShowCodeInput(!!(draft?.codeSnippet ?? post.code_snippet));
      setDeliveryMethod(draft?.deliveryMethod ?? (post?.category?.includes("Alert") || isPostPinned(post) ? "Alert" : "Dispatch"));
      setIsUrgent(draft?.isUrgent ?? isPostPinned(post));
      setIsActive(draft?.isActive ?? (post.is_active !== false));
      setActionRequired(draft?.actionRequired ?? (post.action_required || parsedMeta.actionRequired || ""));
      setPollData(draft?.pollData !== undefined ? draft.pollData : (post.poll_data || null));

      const contentToSet = draft?.content ?? parsedMeta.cleanContent;
      setContent(contentToSet);
      if (editor) {
        editor.commands.setContent(contentToSet);
      }
      setImageUrl(draft?.imageUrl ?? parsedImage);
    } else {
      setEditingPostId(null);
      setEditingPost(null);
      setTitle(draft?.title ?? "");
      setDescription(draft?.description ?? "");
      setTargetAudience(draft?.targetAudience ?? []);
      setCategory(draft?.category ?? "Update");

      const contentToSet = draft?.content ?? "";
      setContent(contentToSet);
      if (editor) {
        editor.commands.setContent(contentToSet);
      }
      setImageUrl(draft?.imageUrl ?? "");
      setCodeSnippet(draft?.codeSnippet ?? "");
      setShowCodeInput(!!draft?.codeSnippet);
      setDeliveryMethod(draft?.deliveryMethod ?? "Dispatch");
      setIsUrgent(draft?.isUrgent ?? false);
      setIsActive(draft?.isActive ?? true);
      setActionRequired(draft?.actionRequired ?? "");
      setPollData(draft?.pollData ?? null);
    }
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setConfirmDelete(null);
    if (editingPostId) {
      const post = posts.find(p => p.id === editingPostId);
      if (post) {
        setTitle(post.title);
        setDescription(post.description || "");
        setContent(post.content);
        if (editor) editor.commands.setContent(post.content);
        setTargetAudience(post.target_audience ? post.target_audience.split(',') : ['All']);
        setCategory(post.category || 'Update');
      }
    } else {
      setTitle("");
      setDescription("");
      setContent("");
      if (editor) editor.commands.setContent("");
      setTargetAudience([]);
      setCategory("Update");
    }
    setTimeout(() => {
      setEditingPostId(null);
      setIsSubmitting(false);
      setPreviewPost(null);
      setViewMode('edit');
    }, 300);
    setImageUrl("");
    setCodeSnippet("");
    setShowCodeInput(false);
    setShowImageInput(false);
    setShowIconPicker(false);
    setDeliveryMethod("Dispatch");
    setIsUrgent(false);
    setIsActive(true);
    setActionRequired("");
    setPollData(null);
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

    if (pollData && (!pollData.question?.trim() || pollData.options?.filter(o => o.label?.trim()).length < 2)) {
      alert(t("poll_err_incomplete", "Please enter a poll question and at least 2 options, or remove the poll before posting."));
      return;
    }

    setIsSubmitting(true);
    let finalCategory = category;
    if (deliveryMethod === "Alert" && !category.toLowerCase().includes("alert")) finalCategory = "Alert";
    let isPinned = deliveryMethod === "Alert" && isUrgent;
    let validPollData = pollData && pollData.question?.trim() && pollData.options?.filter(o => o.label?.trim()).length >= 2
      ? {
          ...pollData,
          question: pollData.question.trim(),
          options: pollData.options.filter(o => o.label?.trim()).map(o => ({ ...o, label: o.label.trim() }))
        }
      : null;
    let payload: any = { title: title.trim(), description: description.trim() || null, message: finalContent.trim(), category: finalCategory, target_audience: targetAudience.join(','), code_snippet: codeSnippet.trim() || null, is_pinned: isPinned, is_active: isActive, action_required: actionRequired.trim() || null, poll_data: validPollData };
    if (imageUrl.trim()) payload.message = `[IMG:${imageUrl.trim()}]\n\n` + payload.message;

    let error = null;
    let newPostId: string | null = null;
    const performSave = async (data: any) => {
      if (editingPostId) {
        const res = await supabase.from('keeper_system_broadcasts').update(data).eq('id', editingPostId).select();
        if (!res.error) await logArchitectAction("Updated Dispatch", "keeper_system_broadcasts", data.title, undefined, "Keeper Hub", true);
        return { error: res.error, data: res.data };
      } else {
        const res = await supabase.from('keeper_system_broadcasts').insert([data]).select();
        if (!res.error && res.data && res.data.length > 0) {
          newPostId = res.data[0].id;
          await logArchitectAction("Created Dispatch", "keeper_system_broadcasts", data.title, undefined, "Keeper Hub", true);
        }
        return { error: res.error, data: res.data };
      }
    };

    let resObj = await performSave(payload);
    error = resObj.error;

    if (!error) {
      if (!editingPostId && newPostId) {
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
          const { data: followers } = await supabase.from('profiles').select("id");
          if (followers && followers.length > 0) {
            const notifications = followers.map(f => ({
              user_id: f.id,
              actor_id: authUser.user!.id,
              type: 'system_broadcast',
              reference_id: newPostId,
              message: `${masonName || 'A Wayfinder'} has broadcasted a new System Dispatch.`
            }));
            try {
              await supabase.rpc('secure_upsert_cloud_file', {
                p_target: 'notifications',
                p_payload: notifications,
                p_token: useStore.getState().session?.access_token || ''
              });
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
    const postToDelete = posts.find(p => p.id === id);
    const { error } = await supabase.from('keeper_system_broadcasts').delete().eq('id', id);
    if (!error && postToDelete) await logArchitectAction("Deleted Dispatch", "keeper_system_broadcasts", postToDelete.title || id, undefined, "Keeper Hub", true);
    fetchPostsAndAssets();
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      const searchMatch = p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.message || p.content)?.toLowerCase().includes(searchTerm.toLowerCase());
      const audienceMatch = filterAudience === "All" || (p.target_audience && p.target_audience.includes(filterAudience));
      const categoryMatch = filterCategory === "All" || p.category === filterCategory || ((filterCategory === "Info" || filterCategory === "Information") && (p.category === "Info" || p.category === "Information"));
      const statusMatch = filterStatus === "All" || filterStatus === "overview" || (filterStatus === "Active" ? p.is_active !== false : p.is_active === false);
      return searchMatch && audienceMatch && categoryMatch && statusMatch;
    });
  }, [posts, searchTerm, filterAudience, filterCategory, filterStatus]);



  const draftKeysStr = useMemo(() => Object.keys(wayfinderDrafts).sort().join(','), [wayfinderDrafts]);

  const renderPostCard = (post: any) => {
    const draftSet = new Set(draftKeysStr.split(','));
    const hasUnsavedEdits = draftSet.has(post.id);
    return (
        <UniversalCard
          key={post.id}
          onClick={() => openEditor(post)}
          layout="vertical"
          title={post.title}
          icon={isPostPinned(post) ? "notification_important" : hasUnsavedEdits ? "edit_note" : "feed"}
          statusColor={hasUnsavedEdits ? "border-[var(--warning)]" : isPostPinned(post) ? "border-[var(--danger)]" : undefined}
          badges={[
              <span key="date" className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">{new Date(post.created_at).toLocaleDateString()}</span>,
              isPostPinned(post) ? <span key="urgent" className="text-[9px] font-black capitalize tracking-widest text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] px-2 py-0.5 rounded-md flex items-center gap-1 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] backdrop-blur-md"><span className="material-symbols-outlined !text-[10px]">warning_amber</span>{t("urgent_alert")}</span> : null,
              post.poll_data && post.poll_data.question ? <span key="poll" className="text-[9px] font-black capitalize tracking-widest text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] px-2 py-0.5 rounded-md flex items-center gap-1 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] backdrop-blur-md"><span className="material-symbols-outlined !text-[10px]">{t("icon_poll", "poll")}</span>{t("poll_badge", "Poll")}</span> : null,
              hasUnsavedEdits ? <span key="unsaved" className="text-[9px] font-black capitalize tracking-widest text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] px-2 py-0.5 rounded-md flex items-center gap-1 border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] backdrop-blur-xl"><span className="material-symbols-outlined !text-[10px]">edit_note</span>{t("ph_unsaved_changes")}</span> : null
          ].filter(Boolean)}
        >
          {extractPostImage(post) && (
            <div className="w-full h-32 rounded-xl overflow-hidden mb-3 relative group">
              <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--background)_60%,transparent)] to-transparent z-10 pointer-events-none" />
              <img src={extractPostImage(post)} alt={t("auto_cover")} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
            </div>
          )}
          <p className="text-[11px] font-mono text-[var(--subtext)] opacity-70 leading-relaxed whitespace-pre-wrap break-words line-clamp-3">
            {post.description ? post.description : (stripMarkdown(post.message || post.content || '').length > 200 ? stripMarkdown(post.message || post.content || '').substring(0, 200) + '...' : stripMarkdown(post.message || post.content || ''))}
          </p>
        </UniversalCard>
    );
  };

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: posts.length.toString(),
    },
    {
      id: "Active",
      label: t("status_active"),
      icon: "cell_tower",
      number: posts.filter(p => p.is_active !== false).length.toString(),
    },
    {
      id: "Inactive",
      label: t("status_inactive"),
      icon: "portable_wifi_off",
      number: posts.filter(p => p.is_active === false).length.toString(),
    }
  ];

  const renderLanding = () => {
    const activePosts = posts.filter(p => p.is_active !== false);
    const inactivePosts = posts.filter(p => p.is_active === false);

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          title={t("recent_active_transmissions") || "Recent Active Transmissions"}
          icon="cell_tower"
          iconColorClass="text-[var(--accent)]"
          isEmpty={activePosts.length === 0}
          emptyState={<EmptyState icon="feed" title={t("no_transmissions")} className="py-8" />}
        >
          {activePosts.slice(0, 4).map(renderPostCard)}
        </HubOverviewSection>

        <HubOverviewSection
          title={t("recent_inactive_transmissions") || "Recent Inactive Transmissions"}
          icon="portable_wifi_off"
          iconColorClass="text-[var(--subtext)]"
          isEmpty={inactivePosts.length === 0}
          emptyState={<EmptyState icon="feed" title={t("no_transmissions")} className="py-8" />}
        >
          {inactivePosts.slice(0, 4).map(renderPostCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const contentBlock = (
    <ElevatedHubLayout
      headerTitle={t("wf_tab_dispatch")}
      headerSubtitle={isOversight ? t("oversight_posts_editor") : t("keeper_system_broadcasts")}
      headerIcon="satellite_alt"
      headerIconColorClass="theme-text-accent"
      hideHeader={isSidePanel}
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("mason_search_placeholder")}
      hideSearch={filterStatus === 'overview'}
      tabs={tabs}

      activeTab={filterStatus}
      onTabChange={(id) => setFilterStatus(id as any)}
      primaryPopover={
        filterStatus !== 'overview' ? {
          icon: "tune",
          label: t("filters") || "Filters",
          content: (
            <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category") || "Category"}</span>
                <CustomDropdown
                  flat={true}
                  variant="pill"
                  disableTint={true}
                  value={filterCategory}
                  onChange={(v: string[]) => setFilterCategory(v[0])}
                  options={[
                    { id: "All", label: t("all_classes") },
                    { id: "Update", label: t("category_update") },
                    { id: "Information", label: t("category_info") },
                    { id: "Alert", label: t("category_alert") }
                  ]}
                />
              </div>
            </div>
          )
        } : undefined
      }
      actions={
        filterStatus !== 'overview' ? [
          {
            id: "post",
            icon: t("icon_cell_tower") || "cell_tower",
            label: wayfinderDrafts['new'] ? t("action_unsaved_draft") : t("post_broadcast"),
            onClick: () => openEditor()
          }
        ] : undefined
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

  const wrappedContent = isSidePanel ? (
    <SidePanel isOpen={isOpen!} onClose={onClose!} title={t("wf_tab_dispatch")} subtitle={isOversight ? t("oversight_posts_editor") : t("keeper_system_broadcasts")} icon="satellite_alt" iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]" widthClass="w-[90vw] max-w-[1200px]">
      {contentBlock}
    </SidePanel>
  ) : contentBlock;

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
                {editingPostId && (
                  <>
                    {confirmDelete === editingPostId ? (
                      <PanelHeaderButton
                        onClick={() => { handleDelete(editingPostId); setConfirmDelete(null); closeEditor(); }}
                        tooltip={t("btn_confirm_delete", "Click again to permanently delete")}
                        icon="delete_forever"
                        variant="danger"
                        className="animate-pulse"
                      />
                    ) : (
                      <PanelHeaderButton
                        onClick={() => setConfirmDelete(editingPostId)}
                        tooltip={t("purge", "Delete Post")}
                        icon="delete"
                        variant="danger"
                      />
                    )}
                    <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-2" />
                  </>
                )}
                {((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) && (
                  <PanelHeaderButton icon={confirmDiscard ? "warning" : "close"} variant={confirmDiscard ? "danger" : "default"} tooltip={confirmDiscard ? (t("ui_confirm_discard")) : (t("ui_btn_discard_edits"))} onClick={handleDiscardChanges} disabled={isSubmitting} />
                )}
                <PanelHeaderButton
                  icon={isActive ? "cell_tower" : "portable_wifi_off"}
                  variant={isActive ? "success" : "default"}
                  tooltip={isActive ? (t("status_active") || "Live / Active") : (t("status_inactive") || "Draft Mode")}
                  onClick={() => setIsActive(!isActive)}
                />
                <div className="relative group/btn flex">
                  <PanelHeaderButton icon="check" variant="success" tooltip={isSubmitting ? t("btn_saving") : (editingPostId ? t("update_transmission") : t("btn_post"))} onClick={handleSubmit} disabled={isSubmitting || !title || !content} />
                  {((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) && (
                    <HoverTooltip title={t("ph_unsaved_changes")} variant="warning" className="group-hover/btn:flex z-[100] mt-10 right-0" />
                  )}
                </div>
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-6">

              <div className="flex justify-start items-center border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] mb-4 pb-4">
                <div className="w-56 shrink-0">
                  <HubTabs 
                    tabs={[{id: 'edit', label: t("editor")}, {id: 'preview', label: t("preview")}]}
 
                    activeTab={viewMode} 
                    setTab={setViewMode} 
                  />
                </div>
              </div>

              {viewMode === 'edit' ? (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <SidePanelTitleInput
                    label={t("post_title")}
                    value={title}
                    onChange={setTitle}
                    placeholder={t("post_title")}
                  />

                  <div className="flex flex-col gap-2 w-full">
                    <span className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-60 ml-2">{t("trans_type")}</span>
                    <RadioCardGroup>
                      <RadioCard
                        active={deliveryMethod === "Dispatch"}
                        onClick={() => { setDeliveryMethod("Dispatch"); setIsUrgent(false); if (category === "Alert") setCategory("Update"); }}
                        icon="feed"
                        label="Dispatch"
                        desc="Standard broadcast"
                      />
                      <RadioCard
                        active={deliveryMethod === "Alert" && !isUrgent}
                        onClick={() => { setDeliveryMethod("Alert"); setIsUrgent(false); if (["Update", "Info", "Information"].includes(category)) setCategory("Alert"); }}
                        icon="notifications"
                        label="Standard Alert"
                        desc="High visibility notice"
                      />
                      <RadioCard
                        active={deliveryMethod === "Alert" && isUrgent}
                        onClick={() => { setDeliveryMethod("Alert"); setIsUrgent(true); if (["Update", "Info", "Information"].includes(category)) setCategory("Alert"); }}
                        icon="notification_important"
                        label="Urgent Alert"
                        desc="Critical system banner"
                      />
                    </RadioCardGroup>
                  </div>

                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex justify-between items-center ml-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">{t("post_description")}</label>
                      <span className={`text-[9px] font-black ${description.length >= 250 ? 'text-[var(--warning)]' : 'text-[var(--subtext)] opacity-60'}`}>{description.length} / 250</span>
                    </div>
                    <input maxLength={250} value={description} onChange={e => setDescription(e.target.value)} placeholder={t("post_description_ph")} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-xs font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all w-full" />
                  </div>

                  <div className="flex gap-4 w-full">
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("wf_target_audience")}</label>
                      <div className="h-14">
                        <CustomDropdown disableTint={true}
                          searchable={true}
                          multiSelect={true}
                          value={targetAudience}
                          onChange={setTargetAudience}
                          options={[
                            { id: "All Communities", label: "All Communities" },
                            { id: "Keeper Core", label: "Keeper Core" },
                            ...partnerDatabases.map(db => ({ id: db.name, label: db.name }))
                          ]}
                          placeholder={t("auto_select_audience")}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("category")}</label>
                      <div className="h-14">
                        <CustomDropdown disableTint={true}
                          searchable={true}
                          allowCustom={true}
                          value={category}
                          onChange={(v: string[]) => setCategory(v[0])}
                          options={
                            deliveryMethod === "Alert" ? [
                              { id: "Alert", label: t("category_alert") }
                            ] : [
                              { id: "Update", label: t("category_update") },
                              { id: "Information", label: t("category_info", "Information") }
                            ]
                          }
                          placeholder={t("auto_select_category")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 w-full">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("dispatch_action_required", "Action Required")}</label>
                    <div className="h-14">
                      <CustomDropdown
                        disableTint={true}
                        searchable={true}
                        allowCustom={true}
                        value={actionRequired || "No Action Required"}
                        onChange={(v: string[]) => setActionRequired(v[0] === "No Action Required" ? "" : (v[0] || ""))}
                        options={[
                          { id: "No Action Required", label: t("dispatch_action_none", "No Action Required") },
                          { id: "Review Required", label: t("dispatch_action_review", "Review Required") },
                          { id: "Review Prior to Updating", label: t("dispatch_action_review_update", "Review Prior to Updating") },
                          { id: "Update Required", label: t("dispatch_action_update", "Update Required") },
                          { id: "Global Alerts - Elevated Malware Risk", label: t("dispatch_action_malware", "Global Alerts - Elevated Malware Risk") },
                          { id: "Clarify with Oversight & Architect Teams", label: t("dispatch_action_clarify", "Clarify with Oversight & Architect Teams") },
                          ...(actionRequired && !["No Action Required", "Review Required", "Review Prior to Updating", "Update Required", "Global Alerts - Elevated Malware Risk", "Clarify with Oversight & Architect Teams"].includes(actionRequired)
                            ? [{ id: actionRequired, label: actionRequired }]
                            : [])
                        ]}
                        placeholder={t("dispatch_action_ph", "Select or enter custom action required...")}
                      />
                    </div>
                  </div>

                  <DispatchMetadataHeader
                    categoryOverride={category || "Dispatch"}
                    audienceOverride={targetAudience}
                    availableTargets={["Keeper Core", ...partnerDatabases.map(db => db.name)]}
                    deliveryMethodOverride={deliveryMethod}
                    isUrgentOverride={isUrgent}
                    actionRequiredOverride={actionRequired}
                  />

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("header_image_placeholder")}</label>
                    <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder={t("header_image_placeholder")} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-xs font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all w-full" />
                  </div>

                  <div className="flex flex-col gap-2 flex-1 min-h-[400px]">
                    <div className="flex items-center justify-between ml-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">{t("post_content")}</label>
                    </div>
                    <div className="flex flex-col flex-1 glass-surface !overflow-visible bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl border focus-within:border-[var(--accent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all">
                      <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
                        <div className="relative flex flex-col items-center pointer-events-auto w-fit">
                          <div className="glass-panel portal-glass-fix backdrop-blur-[var(--glassBlur)] flex flex-wrap items-center gap-1 p-1.5 !rounded-[1.25rem] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[0_14px_34px_rgba(0,0,0,0.45)]">
                            <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bold') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_bold") || "format_bold"}</span></button><HoverTooltip title={t("editor_tt_bold") || "Bold"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                            <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('italic') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_italic") || "format_italic"}</span></button><HoverTooltip title={t("editor_tt_italic") || "Italic"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                            <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h1") || "format_h1"}</span></button><HoverTooltip title={t("editor_tt_h1") || "Heading 1"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                            <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h2") || "format_h2"}</span></button><HoverTooltip title={t("editor_tt_h2") || "Heading 2"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                            <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bulletList') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_bulleted") || "format_list_bulleted"}</span></button><HoverTooltip title={t("editor_tt_bullets") || "Bullet List"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                            <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('orderedList') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_numbered") || "format_list_numbered"}</span></button><HoverTooltip title={t("editor_tt_numbers") || "Numbered List"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                            <div className="relative group/btn flex"><button type="button" onClick={() => setShowImageInput(!showImageInput)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showImageInput ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_image") || "image"}</span></button><HoverTooltip title={t("editor_tt_image") || "Image"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                            <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('codeBlock') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_code") || "code"}</span></button><HoverTooltip title={t("editor_tt_code") || "Code Block"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                            <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"><span className="material-symbols-outlined !text-[18px]">{t("icon_horizontal_rule") || "horizontal_rule"}</span></button><HoverTooltip title={t("editor_tt_hr") || "Horizontal Line"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                            <div className="relative group/btn flex"><button type="button" onClick={() => setShowIconPicker(!showIconPicker)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showIconPicker ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_sentiment_satisfied") || "sentiment_satisfied"}</span></button><HoverTooltip title={t("editor_tt_icon") || "Insert Icon"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
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

                  <DispatchPollBuilder
                    pollData={pollData}
                    onChange={setPollData}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-6 mt-4">
                  <h3 className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-2">{t("live_preview")}</h3>

                  {imageUrl && (
                    <div className="w-full h-48 sm:h-64 relative shrink-0 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl overflow-hidden shadow-lg -mb-8">
                      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-transparent via-transparent to-[var(--background)] z-10 opacity-90" />
                      <img src={imageUrl} className="w-full h-full object-cover object-center relative z-0 opacity-80 mix-blend-screen" alt={t("auto_post_cover_preview")} />
                    </div>
                  )}

                  <div className={`relative z-20 ${imageUrl ? 'p-6 -mx-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--background)_40%,transparent)] backdrop-blur-2xl shadow-2xl mt-4 mb-2' : 'mb-6'}`}>
                    <h1 className="text-3xl font-black text-[var(--text)] capitalize tracking-tight">{title || (t("untitled"))}</h1>
                  </div>

                  <DispatchMetadataHeader
                    categoryOverride={category || "Dispatch"}
                    audienceOverride={targetAudience}
                    availableTargets={["Keeper Core", ...partnerDatabases.map(db => db.name)]}
                    deliveryMethodOverride={deliveryMethod}
                    isUrgentOverride={isUrgent}
                    actionRequiredOverride={actionRequired}
                  />

                  <div className="markdown-body p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shadow-inner relative z-20">
                    {content ? <MarkdownRenderer content={content} onAssetClick={(type: string, id: string) => setActiveAsset({ type, id })} /> : <p className="text-[var(--subtext)] opacity-50 italic">{t("no_content_preview")}</p>}
                  </div>

                  {pollData && (
                    <DispatchPollViewer
                      post={{ id: editingPostId || "preview", poll_data: pollData, _sourceTable: "keeper_system_broadcasts" }}
                      userId={null}
                    />
                  )}

                  {pollData && (
                    <DispatchPollViewer
                      post={{ id: editingPostId || "preview", poll_data: pollData, _sourceTable: "keeper_system_broadcasts" }}
                    />
                  )}
                </div>
              )}
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
          onOpenMasonProfile={handleOpenWayfinderProfile}
          onAssetClick={(type: string, id: string) => setActiveAsset({ type, id })}
        />
      )}

      {activeAsset && <AssetPreviewSidebar assetType={activeAsset.type} assetId={activeAsset.id} onClose={() => setActiveAsset(null)} />}
    </>
  );
}







