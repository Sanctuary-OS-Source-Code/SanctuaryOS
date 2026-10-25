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
import {
  SidePanel, standardButtonClass, standardAccentGlassButtonClass, CustomDropdown, HoverTooltip, EmptyState,
  extractPostImage, stripMarkdown, HubTabs, ActionButton, ViewToggle, RadioCardGroup, RadioCard,
  PanelHeaderGroup, PanelHeaderButton, LinkAssetSidePanel,
  SidePanelHeroCard, SidePanelTitleInput, SidePanelPillToggle, UniversalGroup, StatBox
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import MasonPostCard from "../MasonPostCard";
import MarkdownRenderer from "../MarkdownRenderer";
import IconPicker from "../IconPicker";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";
import { extractDispatchMetadata, DispatchMetadataHeader, DispatchPollBuilder, DispatchPollData } from "../components/universal/DispatchPollAndMeta";
import { ReleaseNotesShowcase } from "../components/ReleaseNotesShowcase";

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
  const [actionRequired, setActionRequired] = useState("No Action Required");
  const [pollData, setPollData] = useState<DispatchPollData | null>(null);
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
  const [filterStatus, setFilterStatus] = useState("overview");

  const wayfinderDrafts = useStore(state => state.wayfinderDrafts);
  const setWayfinderDrafts = useStore(state => state.setWayfinderDrafts);

  useEffect(() => {
    if (isEditorOpen) {
      const draftId = editingPostId || 'new';

      let isUnchanged = false;
      if (editingPost) {
        let rawContent = editingPost.message || editingPost.content || '';
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
          category === (editingPost.category || "Announcement") &&
          actionRequired === (parsedMeta.actionRequired || "No Action Required") &&
          JSON.stringify(pollData || null) === JSON.stringify(editingPost.poll_data || null) &&
          codeSnippet === (editingPost.code_snippet || "");
      } else {
        isUnchanged = title === "" &&
          description === "" &&
          content === "" &&
          targetAudience.length === 0 &&
          category === "Announcement" &&
          actionRequired === "No Action Required" &&
          pollData === null &&
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
          [draftId]: { title, description, content, targetAudience, category, actionRequired, pollData, imageUrl, codeSnippet, isActive }
        }));
      }
    }
  }, [isEditorOpen, editingPostId, editingPost, title, description, content, targetAudience, category, actionRequired, pollData, imageUrl, codeSnippet, isActive]);

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
    const defaultTypeLabel = asset.type === 'mod' ? 'Artifact' : asset.type === 'blueprint' ? 'Blueprint' : asset.type === 'chameleon' ? 'Theme' : 'Lexicon';
    const translatedType = t(typeKey, defaultTypeLabel) !== typeKey ? t(typeKey, defaultTypeLabel) : defaultTypeLabel;

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
      setCategory(draft?.category ?? (post.category || "Announcement"));
      setActionRequired(draft?.actionRequired ?? (parsedMeta.actionRequired || "No Action Required"));
      setPollData(draft?.pollData !== undefined ? draft.pollData : (post.poll_data || null));
      setCodeSnippet(draft?.codeSnippet ?? (post.code_snippet || ""));
      setShowCodeInput(!!(draft?.codeSnippet ?? post.code_snippet));
      setIsActive(draft?.isActive ?? (post.is_active !== false));

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
      setCategory(draft?.category ?? "Announcement");
      setActionRequired(draft?.actionRequired ?? "No Action Required");
      setPollData(draft?.pollData ?? null);

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
    setConfirmDelete(null);
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
    setActionRequired("No Action Required");
    setPollData(null);
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

    if (pollData && (!pollData.question.trim() || pollData.options.filter(o => o.label.trim()).length < 2)) {
      alert(t("poll_err_incomplete", "Please enter a poll question and at least 2 options, or remove the poll before posting."));
      return;
    }

    setIsSubmitting(true);
    let finalCategory = category;
    const sanitizedPoll = pollData && pollData.question.trim() && pollData.options.filter(o => o.label.trim()).length >= 2
      ? {
          ...pollData,
          question: pollData.question.trim(),
          options: pollData.options.filter(o => o.label.trim()).map(o => ({ ...o, label: o.label.trim() }))
        }
      : null;

    let payload: any = {
      title: title.trim(),
      description: description.trim() || null,
      message: finalContent.trim(),
      category: finalCategory,
      target_audience: "Public",
      action_required: actionRequired.trim() || "No Action Required",
      poll_data: sanitizedPoll,
      code_snippet: codeSnippet.trim() || null,
      is_pinned: false,
      is_active: isActive
    };
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
        if (!res.error) await logArchitectAction("Updated Dispatch", targetTable, data.title, undefined, "Keepers Core", true, computeAuditDiff(editingPost, data));
      } else {
        if (!res.error && res.data && res.data.length > 0) {
          newPostId = res.data[0].id;
          await logArchitectAction("Created Dispatch", targetTable, data.title, undefined, "Keepers Core", true, computeAuditDiff(null, data));
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
          if (followers && followers.length > 0) {
            let teamName = "Sanctuary Foundry";

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
      useStore.getState().pushStatus(editingPostId ? t("update_transmission", "Update {Dispatch}") : t("post_success", "{Dispatch} published successfully."), 'success');
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

    if (!error && postToDelete) await logArchitectAction("Deleted Dispatch", targetTable, postToDelete.title || id, undefined, "Keepers Core", true, computeAuditDiff(postToDelete, null));
    fetchPostsAndAssets();
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      const searchMatch = p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.message || p.content)?.toLowerCase().includes(searchTerm.toLowerCase());
      const audienceMatch = filterAudience === "All" || (p.target_audience && p.target_audience.includes(filterAudience));
      const categoryMatch = filterCategory === "All" || p.category === filterCategory;
      const statusMatch = filterStatus === "overview" || filterStatus === "All" || 
        (filterStatus === "Urgent" ? isPostPinned(p) :
         (filterStatus === "Active" ? p.is_active !== false && !isPostPinned(p) :
          (filterStatus === "Inactive" ? p.is_active === false : true)));
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
        layout="vertical"
      />
    );
  };

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: posts.length.toString(),
    },
    {
      id: "ReleasePosts",
      label: t("release_notes_keepers_tab", "Release Posts"),
      icon: t("icon_new_releases", "new_releases"),
      number: "2",
      colorClass: "text-[var(--accent)]",
    },
    {
      id: "Urgent",
      label: t("urgent", "Urgent"),
      icon: t("icon_notification_important", "notification_important"),
      number: posts.filter(p => isPostPinned(p)).length.toString(),
      colorClass: "text-[var(--danger)]"
    },
    {
      id: "Active",
      label: t("status_active", "Active"),
      icon: t("icon_newspaper", "newspaper"),
      number: posts.filter(p => p.is_active !== false && !isPostPinned(p)).length.toString(),
    },
    {
      id: "Inactive",
      label: t("tab_inactive", "Inactive"),
      icon: t("icon_hide_source", "hide_source"),
      number: posts.filter(p => p.is_active === false).length.toString(),
    }
  ];

  const renderLanding = () => {
    const urgentPosts = posts.filter(p => isPostPinned(p));
    const activePosts = posts.filter(p => p.is_active !== false && !isPostPinned(p));
    const inactivePosts = posts.filter(p => p.is_active === false);

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          className="xl:col-span-2"
          icon={t("icon_new_releases", "new_releases")}
          iconColorClass="text-[var(--accent)]"
          title={t("release_notes_keepers_section_title", "Current Build Release Posts (Public & Dev)")}
          gridClassName="flex flex-col w-full"
        >
          <ReleaseNotesShowcase isKeepers={true} />
        </HubOverviewSection>

        {urgentPosts.length > 0 && (
          <HubOverviewSection
            className="xl:col-span-2"
            icon={t("icon_notification_important", "notification_important")}
            iconColorClass="text-[var(--danger)]"
            title={t("urgent_news", "Urgent News")}
            isEmpty={urgentPosts.length === 0}
            emptyIcon={t("icon_done_all", "done_all")}
            emptyTitle={t("no_transmissions", "No {Dispatches} Found")}
          >
            {urgentPosts.slice(0, 4).map(renderPostCard)}
          </HubOverviewSection>
        )}

        <HubOverviewSection
          icon={t("icon_newspaper", "newspaper")}
          iconColorClass="text-[var(--accent)]"
          title={t("recent_active_news", "Recent Active News")}
          isEmpty={activePosts.length === 0}
          emptyIcon={t("icon_newspaper", "newspaper")}
          emptyTitle={t("no_transmissions", "No {Dispatches} Found")}
        >
          {activePosts.slice(0, 4).map(renderPostCard)}
        </HubOverviewSection>

        <HubOverviewSection
          icon={t("icon_hide_source", "hide_source")}
          iconColorClass="text-[var(--subtext)]"
          title={t("recent_inactive_news", "Recent Inactive News")}
          isEmpty={inactivePosts.length === 0}
          emptyIcon={t("icon_newspaper", "newspaper")}
          emptyTitle={t("no_transmissions", "No {Dispatches} Found")}
        >
          {inactivePosts.slice(0, 4).map(renderPostCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const contentBlock = (
    <ElevatedHubLayout
      headerTitle={t("web_news", "Web News")}
      headerSubtitle={t("web_news_subtitle", "Manage website announcements and blog posts")}
      headerIcon={t("icon_newspaper", "newspaper")}
      headerIconColorClass="theme-text-accent"
      hideHeader={isSidePanel}
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("mason_search_placeholder", "Search {dispatches}...")}
      hideSearch={filterStatus === 'overview' || filterStatus === 'ReleasePosts'}
      tabs={tabs}

      activeTab={filterStatus === 'overview' ? 'overview' : filterStatus}
      onTabChange={(id) => setFilterStatus(id as any)}
      primaryPopover={
        filterStatus !== 'overview' && filterStatus !== 'ReleasePosts' ? {
          icon: t("icon_tune", "tune"),
          label: t("filters", "Filters"),
          content: (
            <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category", "Category")}</span>
                <CustomDropdown
                  flat={true}
                  variant="pill"
                  disableTint={true}
                  value={filterCategory}
                  onChange={(v: string[]) => setFilterCategory(v[0])}
                  options={[
                    { id: "All", label: t("all_classes", "All Categories") },
                    { id: "Announcement", label: t("cat_announcement", "Announcement") },
                    { id: "Blog", label: t("cat_blog", "Blog") },
                    { id: "Press", label: t("cat_press", "Press") },
                    { id: "Update", label: t("category_update", "Update") },
                    { id: "Maintenance", label: t("cat_maintenance", "Maintenance") }
                  ]}
                />
              </div>
            </div>
          )
        } : undefined
      }
      actions={
        filterStatus !== 'overview' && filterStatus !== 'ReleasePosts' ? [
          {
            id: "post",
            icon: t("icon_cell_tower", "cell_tower"),
            label: wayfinderDrafts['new'] ? t("action_unsaved_draft", "Resume Draft") : t("post_broadcast", "New {Dispatch}"),
            onClick: () => openEditor()
          }
        ] : undefined
      }
    >
      {filterStatus === 'overview' ? renderLanding() : filterStatus === 'ReleasePosts' ? (
        <div className="w-full py-2">
          <ReleaseNotesShowcase isKeepers={true} />
        </div>
      ) : (
          <div className="flex flex-col gap-4">
            {filteredPosts.length === 0 ? (
              <EmptyState icon={t("icon_cell_tower", "cell_tower")} title={t("no_transmissions", "No {Dispatches} Found")} className="col-span-full py-16" />
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
            icon={t("icon_newspaper", "newspaper")}
            iconColorClass="text-[var(--accent)]"
            widthClass="w-[90vw] md:w-[800px]"
            title={editingPostId ? t("update_transmission", "Update {Dispatch}") : t("post_broadcast", "New {Dispatch}")}
            subtitle={editingPostId ? t("editing_record", "Editing Record") : t("composing_broadcast", "Composing Broadcast")}
            headerActions={
              <PanelHeaderGroup>
                {editingPostId && (
                  <>
                    {confirmDelete === editingPostId ? (
                      <PanelHeaderButton
                        onClick={() => { handleDelete(editingPostId); setConfirmDelete(null); closeEditor(); }}
                        tooltip={t("btn_confirm_delete", "Confirm {Delete}")}
                        icon={t("icon_delete_forever", "delete_forever")}
                        variant="danger"
                        className="animate-pulse"
                      />
                    ) : (
                      <PanelHeaderButton
                        onClick={() => setConfirmDelete(editingPostId)}
                        tooltip={t("purge", "Delete Post")}
                        icon={t("icon_delete", "delete")}
                        variant="danger"
                      />
                    )}
                    <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-2" />
                  </>
                )}
                <PanelHeaderButton
                  onClick={() => setIsActive(!isActive)}
                  tooltip={isActive ? t("active", "Active") : t("filter_inactive", "Inactive")}
                  icon={isActive ? t("icon_sensors", "sensors") : t("icon_sensors_off", "sensors_off")}
                  variant={isActive ? "success" : "default"}
                  isActive={isActive}
                />
                <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-2" />
                {Boolean((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) && (
                  <PanelHeaderButton
                    onClick={handleDiscardChanges}
                    disabled={isSubmitting}
                    tooltip={confirmDiscard ? t("ui_confirm_discard", "Confirm Discard") : t("ui_btn_discard_edits", "Discard Edits")}
                    icon={confirmDiscard ? t("icon_warning", "warning") : t("icon_close", "close")}
                    variant="danger"
                    className={confirmDiscard ? "animate-pulse" : ""}
                  />
                )}
                <PanelHeaderButton
                  onClick={handleSubmit}
                  disabled={isSubmitting || !title || !content}
                  tooltip={isSubmitting ? t("btn_saving", "Saving...") : (editingPostId ? t("update_transmission", "Update {Dispatch}") : t("btn_post", "Publish News Post"))}
                  icon={isSubmitting ? t("icon_sync", "sync") : t("icon_send", "send")}
                  variant={((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) ? "warning" : "accent"}
                  className={isSubmitting ? "animate-pulse" : ""}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <SidePanelHeroCard
                icon={t("icon_newspaper", "newspaper")}
                overline={t("web_news", "Web News")}
                title={editingPostId ? t("update_transmission", "Update {Dispatch}") : t("post_broadcast", "New {Dispatch}")}
                description={editingPostId ? t("editing_record", "Editing existing public website announcement or blog post.") : t("composing_broadcast", "Composing new public website announcement or blog post.")}
                badge={isActive ? t("status_active", "Published") : t("tab_inactive", "Draft")}
                variant={isActive ? "accent" : "warning"}
              >
                <div className="grid grid-cols-2 gap-3 w-full">
                  <StatBox
                    label={t("category", "Category")}
                    value={category || t("cat_announcement", "Announcement")}
                    icon={t("icon_category", "category")}
                  />
                  <StatBox
                    label={t("dispatch_meta_action", "Action Required")}
                    value={actionRequired || t("dispatch_action_none", "No Action Required")}
                    icon={t("icon_fact_check", "fact_check")}
                  />
                </div>
              </SidePanelHeroCard>

              <SidePanelTitleInput
                label={t("post_title", "Post Title")}
                value={title}
                onChange={setTitle}
                placeholder={t("post_title", "Title")}
              />

              <UniversalGroup title={t("dispatch_telemetry_preview", "Dispatch Telemetry & Metadata")} icon={t("icon_tune", "tune")}>
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex justify-between items-center ml-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">{t("post_description", "Short Summary")}</label>
                    <span className={`text-[9px] font-black ${description.length >= 250 ? 'text-[var(--warning)]' : 'text-[var(--subtext)] opacity-60'}`}>{description.length} / 250</span>
                  </div>
                  <input maxLength={250} value={description} onChange={e => setDescription(e.target.value)} placeholder={t("post_description_ph", "Brief summary shown on cards...")} className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <div className="flex flex-col gap-2 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("category", "Category")}</label>
                    <div className="h-14">
                      <CustomDropdown disableTint={true}
                        searchable={true}
                        allowCustom={true}
                        value={category}
                        onChange={(v: string[]) => setCategory(v[0])}
                        options={[
                          { id: "Announcement", label: t("cat_announcement", "Announcement") },
                          { id: "Blog", label: t("cat_blog", "Blog") },
                          { id: "Press", label: t("cat_press", "Press") },
                          { id: "Update", label: t("category_update", "Update") },
                          { id: "Maintenance", label: t("cat_maintenance", "Maintenance") }
                        ]}
                        placeholder={t("auto_select_category", "Select category...")}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("dispatch_meta_action", "Action Required")}</label>
                    <div className="h-14">
                      <CustomDropdown
                        disableTint={true}
                        searchable={true}
                        allowCustom={true}
                        value={actionRequired}
                        onChange={(v: string[]) => setActionRequired(v[0] || "No Action Required")}
                        options={[
                          { id: "No Action Required", label: t("dispatch_action_none", "No Action Required") },
                          { id: "Review Before Updating", label: t("dispatch_action_review", "Review Before Updating") },
                          { id: "Update Recommended", label: t("dispatch_action_update_rec", "Update Recommended") },
                          { id: "Immediate Action Required", label: t("dispatch_action_immediate", "Immediate Action Required") }
                        ]}
                        placeholder={t("dispatch_meta_action", "Action Required")}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 w-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("dispatch_telemetry_preview", "Dispatch Telemetry Header Preview")}</label>
                  <DispatchMetadataHeader
                    post={{ category, target_audience: "Public", action_required: actionRequired }}
                    categoryOverride={category}
                    audienceOverride={["Public"]}
                    actionRequiredOverride={actionRequired}
                  />
                </div>

                <div className="flex flex-col gap-2 w-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("header_image_placeholder", "Header Image URL")}</label>
                  <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder={t("header_image_placeholder", "Header Image URL")} className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all" />
                </div>
              </UniversalGroup>

              <UniversalGroup title={t("post_content", "{Dispatch} Body...")} icon={t("icon_edit_document", "edit_document")}>
                <div className="flex flex-col flex-1 min-h-[400px] w-full">
                  <div className="flex flex-col flex-1 glass-surface !overflow-visible bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl border focus-within:border-[var(--accent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all">
                    <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
                      <div className="relative flex flex-col items-center pointer-events-auto w-fit">
                        <div className="glass-panel portal-glass-fix backdrop-blur-[var(--glassBlur)] flex flex-wrap items-center gap-1 p-1.5 !rounded-[1.25rem] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[0_14px_34px_rgba(0,0,0,0.45)]">
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bold') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_bold", "format_bold")}</span></button><HoverTooltip title={t("editor_tt_bold", "Bold")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('italic') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_italic", "format_italic")}</span></button><HoverTooltip title={t("editor_tt_italic", "Italic")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h1", "format_h1")}</span></button><HoverTooltip title={t("editor_tt_h1", "Heading 1")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h2", "format_h2")}</span></button><HoverTooltip title={t("editor_tt_h2", "Heading 2")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bulletList') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_bulleted", "format_list_bulleted")}</span></button><HoverTooltip title={t("editor_tt_bullets", "Bullet List")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('orderedList') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_numbered", "format_list_numbered")}</span></button><HoverTooltip title={t("editor_tt_numbers", "Numbered List")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => setShowImageInput(!showImageInput)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showImageInput ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_image", "image")}</span></button><HoverTooltip title={t("editor_tt_image", "Insert Image")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('codeBlock') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_code", "code")}</span></button><HoverTooltip title={t("editor_tt_code", "Code Block")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"><span className="material-symbols-outlined !text-[18px]">{t("icon_horizontal_rule", "horizontal_rule")}</span></button><HoverTooltip title={t("editor_tt_hr", "Horizontal Line")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                          <div className="relative group/btn flex"><button type="button" onClick={() => setShowIconPicker(!showIconPicker)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showIconPicker ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_sentiment_satisfied", "sentiment_satisfied")}</span></button><HoverTooltip title={t("editor_tt_icon", "Insert Icon")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
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
                          placeholder={t("image_url_placeholder", "Enter image URL...")}
                          className="flex-1 glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
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
                          {t("ui_btn_insert", "Insert")}
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
                          placeholder={t("code_snippet_placeholder", "Paste code snippet...")}
                          className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-xs font-mono placeholder-[var(--subtext)] focus:outline-none focus:theme-border-accent h-48 resize-none custom-scrollbar transition-all"
                          spellCheck={false}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between p-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-b-2xl shrink-0">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowCodeInput(!showCodeInput)} className={`px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest flex items-center gap-1.5 ${showCodeInput ? 'theme-bg-accent/20 theme-text-accent' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_data_object", "data_object")}</span> {showCodeInput ? t("hide_code", "Hide Code") : t("masonhub_add_code", "Add Code")}
                        </button>
                        <button type="button" onClick={() => setIsAssetPanelOpen(true)} className="px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_link", "link")}</span> {t("link_asset", "Link Asset")}
                        </button>
                      </div>
                      <div className="text-[9px] font-black tracking-widest capitalize opacity-40 flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("icon_markdown", "markdown")}</span> {t("icon_markdown", "markdown")}</div>
                    </div>
                  </div>
                </div>
              </UniversalGroup>

              <DispatchPollBuilder pollData={pollData} onChange={setPollData} />
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
