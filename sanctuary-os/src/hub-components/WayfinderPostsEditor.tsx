import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import { IconPlugin } from '../IconPlugin';
import {
  SidePanel, CustomDropdown, EmptyState,
  extractPostImage, PanelHeaderGroup, PanelHeaderButton, LinkAssetSidePanel,
  SidePanelHeroCard, UniversalGroup
} from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import MasonPostCard from "../MasonPostCard";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";
import { extractDispatchMetadata, DispatchPollData } from "../components/universal/DispatchPollAndMeta";
import { PostEditorMode, UnifiedPostBodyEditor, PostAttachmentsManager } from "../components/universal/UnifiedPostEditor";

export function WayfinderPostsEditor({ authorId, authorProfileId, handleOpenWayfinderProfile, isOversight, isKeepers, isSidePanel, isOpen, onClose }: { authorId: string, authorProfileId: string, handleOpenWayfinderProfile?: (authorId: string, postId?: string) => void, isOversight?: boolean, isKeepers?: boolean, isSidePanel?: boolean, isOpen?: boolean, onClose?: () => void }) {
  if (isSidePanel && !isOpen) return null;
  const isPostPinned = (p: any) => p?.is_pinned === true || p?.is_pinned === "true";
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState<string[]>(["All"]);
  const [communityOptions, setCommunityOptions] = useState<string[]>([]);
  const [category, setCategory] = useState("Update");
  const [actionRequired, setActionRequired] = useState("No Action Required");
  const [pollData, setPollData] = useState<DispatchPollData | null>(null);
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [codeSnippet, setCodeSnippet] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [, setShowImageInput] = useState(false);
  const [, setShowIconPicker] = useState(false);
  const [, setWayfinderName] = useState<string>("");
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<PostEditorMode>("wysiwyg");
  const [searchTerm, setSearchTerm] = useState("");

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"Dispatch" | "Alert">("Dispatch");
  const [isUrgent, setIsUrgent] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [filterAudience] = useState("All");
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
          actionRequired === (parsedMeta.actionRequired || "No Action Required") &&
          JSON.stringify(pollData || null) === JSON.stringify(editingPost.poll_data || null) &&
          codeSnippet === (editingPost.code_snippet || "") &&
          deliveryMethod === (editingPost.category?.includes("Alert") || isPostPinned(editingPost) ? "Alert" : "Dispatch") &&
          isUrgent === isPostPinned(editingPost);
      } else {
        isUnchanged = title === "" &&
          description === "" &&
          content === "" &&
          targetAudience.length === 0 &&
          category === "Update" &&
          actionRequired === "No Action Required" &&
          pollData === null &&
          imageUrl === "" &&
          codeSnippet === "" &&
          deliveryMethod === "Dispatch" &&
          isUrgent === false &&
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
          [draftId]: { title, description, content, targetAudience, category, actionRequired, pollData, imageUrl, codeSnippet, deliveryMethod, isUrgent, isActive }
        }));
      }
    }
  }, [isEditorOpen, editingPostId, editingPost, title, description, content, targetAudience, category, actionRequired, pollData, imageUrl, codeSnippet, deliveryMethod, isUrgent, isActive]);

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
    const targetTable = isKeepers ? 'keeper_system_broadcasts' : 'system_broadcasts';
    const { data } = await supabase.from(targetTable).select('*').order('created_at', { ascending: false });
    if (data) {
      const activeSchema = useStore.getState().activeGameSchema;

      const hydratedData = data.map((post: any) => {
        let teamName = "Sanctuary OS";
        if (!isKeepers) {
          teamName = isOversight ? (activeSchema ? `${activeSchema.name} Oversight` : "Oversight") : (activeSchema ? `${activeSchema.name} Wayfinders` : "Wayfinders");
        }
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

    if (authorId) {
      if (authorId === 'system') {
        setWayfinderName("SYSTEM");
      } else {
        const { data: profileData } = await supabase.from('profiles').select('username').eq('id', authorId).maybeSingle();
        if (profileData?.username) setWayfinderName(profileData.username);
      }
    }

    if (isKeepers) {
      const { data: gamesData } = await supabase.from('sanctuary_games').select('name').not('is_active', 'eq', false);
      if (gamesData) {
        setCommunityOptions(gamesData.map(g => `${g.name} Wayfinders`));
      }
    }
  };

  useEffect(() => { fetchPostsAndAssets(); }, []);
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
    const draftId = post ? post.id : 'new';
    const draft = useStore.getState().wayfinderDrafts[draftId];
    setConfirmDelete(null);

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
      setActionRequired(draft?.actionRequired ?? (parsedMeta.actionRequired || "No Action Required"));
      setPollData(draft?.pollData !== undefined ? draft.pollData : (post.poll_data || null));
      setCodeSnippet(draft?.codeSnippet ?? (post.code_snippet || ""));
      setShowCodeInput(!!(draft?.codeSnippet ?? post.code_snippet));
      setDeliveryMethod(draft?.deliveryMethod ?? (post?.category?.includes("Alert") || isPostPinned(post) ? "Alert" : "Dispatch"));
      setIsUrgent(draft?.isUrgent ?? isPostPinned(post));
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
      setCategory(draft?.category ?? "Update");
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
      setDeliveryMethod(draft?.deliveryMethod ?? "Dispatch");
      setIsUrgent(draft?.isUrgent ?? false);
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
    }, 300);
    setActionRequired("No Action Required");
    setPollData(null);
    setImageUrl("");
    setCodeSnippet("");
    setShowCodeInput(false);
    setShowImageInput(false);
    setShowIconPicker(false);
    setDeliveryMethod("Dispatch");
    setIsUrgent(false);
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
    if (editor && editorMode === "wysiwyg") {
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
    if (deliveryMethod === "Alert" && !isOversight && !category.toLowerCase().includes("alert")) finalCategory = "Alert";
    let isPinned = deliveryMethod === "Alert" && isUrgent;
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
      target_audience: targetAudience.join(','),
      action_required: actionRequired.trim() || "No Action Required",
      poll_data: sanitizedPoll,
      code_snippet: codeSnippet.trim() || null,
      is_pinned: isPinned,
      is_active: isActive
    };
    if (imageUrl.trim()) payload.message = `[IMG:${imageUrl.trim()}]\n\n` + payload.message;

    let error = null;
    let newPostId: string | null = null;
    const targetTable = isKeepers ? 'keeper_system_broadcasts' : 'system_broadcasts';
    const performSave = async (data: any) => {
      let res;
      if (!isKeepers) {
        const payloadWithId = editingPostId ? { id: editingPostId, ...data } : data;
        res = await supabase.rpc('secure_upsert_cloud_file', {
          p_target: targetTable,
          p_payload: payloadWithId,
          p_token: useStore.getState().session?.access_token || ''
        });
      } else {
        if (editingPostId) {
          res = await supabase.from(targetTable).update(data).eq('id', editingPostId).select();
        } else {
          res = await supabase.from(targetTable).insert([data]).select();
        }
      }

      if (!res.error && (!res.data || res.data.length === 0) && editingPostId) {
        res.error = { message: "Permission denied or post not found. Check your roles." } as any;
      }

      if (editingPostId) {
        if (!res.error) await logArchitectAction("Updated Dispatch", targetTable, data.title, undefined, isKeepers ? "Keepers Core" : "Wayfinder Operations", Boolean(isKeepers), computeAuditDiff(editingPost, data));
      } else {
        if (!res.error && res.data && res.data.length > 0) {
          newPostId = res.data[0].id;
          await logArchitectAction("Created Dispatch", targetTable, data.title, undefined, isKeepers ? "Keepers Core" : "Wayfinder Operations", Boolean(isKeepers), computeAuditDiff(null, data));
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
            const activeSchema = useStore.getState().activeGameSchema;
            let teamName = "Sanctuary Foundry";
            if (!isKeepers) {
              teamName = isOversight ? (activeSchema ? `${activeSchema.display_name || activeSchema.name} Oversight Team` : "Oversight Team") : (activeSchema ? `${activeSchema.display_name || activeSchema.name} Team` : "Wayfinder Team");
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
                supabase.rpc('secure_upsert_cloud_file', {
                  p_target: 'notifications',
                  p_payload: notif,
                  p_token: useStore.getState().session?.access_token || ''
                }).then(res => {
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
    const targetTable = isKeepers ? 'keeper_system_broadcasts' : 'system_broadcasts';
    const postToDelete = posts.find(p => p.id === id);

    let error;
    if (!isKeepers) {
      const res = await supabase.rpc('secure_delete_cloud_file', {
        p_target: targetTable,
        p_id: id,
        p_token: useStore.getState().session?.access_token || ''
      });
      error = res.error;
    } else {
      const res = await supabase.from(targetTable).delete().eq('id', id);
      error = res.error;
    }

    if (!error && postToDelete) await logArchitectAction("Deleted Dispatch", targetTable, postToDelete.title || id, undefined, isKeepers ? "Keepers Core" : "Wayfinder Operations", Boolean(isKeepers), computeAuditDiff(postToDelete, null));
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
      <MasonPostCard
        key={post.id}
        layout="vertical"
        post={post}
        index={0}
        onPostClick={() => openEditor(post)}
        onToggleLike={() => { }}
        hasUnsavedEdits={hasUnsavedEdits}
      />
    );
  };

  const postCards = useMemo(() => {
    return filteredPosts.map(renderPostCard);
  }, [filteredPosts, draftKeysStr, t]);

  const renderLanding = () => {
    const activePosts = posts.filter(p => p.is_active !== false);
    const inactivePosts = posts.filter(p => p.is_active === false);
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_check_circle", "check_circle")}
          iconColorClass="text-[var(--success)]"
          title={t("status_active", "Active Dispatches")}
          isEmpty={activePosts.length === 0}
          emptyIcon={t("icon_cell_tower", "cell_tower")}
          emptyTitle={t("no_transmissions", "No {Dispatches} Found")}
        >
          {activePosts.slice(0, 4).map(renderPostCard)}
        </HubOverviewSection>
        <HubOverviewSection
          icon={t("icon_cancel", "cancel")}
          iconColorClass="text-[var(--warning)]"
          title={t("tab_inactive", "Inactive Dispatches")}
          isEmpty={inactivePosts.length === 0}
          emptyIcon={t("icon_cell_tower", "cell_tower")}
          emptyTitle={t("no_transmissions", "No {Dispatches} Found")}
        >
          {inactivePosts.slice(0, 4).map(renderPostCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const contentBlock = (
    <ElevatedHubLayout
      hideHeader={isSidePanel}
      headerTitle={t("wf_tab_dispatch", "Dispatches")}
      headerSubtitle={t("system_broadcasts", "Manage broadcasts")}
      headerIcon={t("icon_satellite_alt", "satellite_alt")}
      headerIconColorClass="theme-text-accent"
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("mason_search_placeholder", "Search {dispatches}...")}
      hideSearch={filterStatus === 'overview'}
      tabs={[
        { id: "overview", label: t("overview", "Overview"), icon: t("icon_dashboard", "dashboard"), number: posts.length.toString() },
        { id: "Active", label: t("status_active", "Active"), icon: t("icon_check_circle", "check_circle"), number: posts.filter(p => p.is_active !== false).length.toString() },
        { id: "Inactive", label: t("tab_inactive", "Inactive"), icon: t("icon_cancel", "cancel"), number: posts.filter(p => p.is_active === false).length.toString() }
      ]}
      activeTab={filterStatus}
      onTabChange={setFilterStatus as any}
      primaryPopover={
        filterStatus !== 'overview' ? {
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
                    ...(isOversight ? [
                      { id: "Game Issue", label: t("category_game_issue", "Game Issue") },
                      { id: "Mod Issue", label: t("category_mod_issue", "{Mod} Issue") },
                      { id: "Game Version Alert", label: t("category_game_version_alert", "Game Version Alert") },
                      { id: "Malware Alert", label: t("category_malware_alert", "Malware Alert") },
                      { id: "Artifact Alert", label: t("category_artifact_alert", "{Mod} Alert") }
                    ] : [
                      { id: "Update", label: t("category_update", "Update") },
                      { id: "Information", label: t("category_info", "Information") },
                      { id: "Event", label: t("category_event", "Event") },
                      { id: "Alert", label: t("category_alert", "Alert") },
                      { id: "Game Version Alert", label: t("category_game_version_alert", "Game Version Alert") },
                      { id: "Malware Alert", label: t("category_malware_alert", "Malware Alert") },
                      { id: "Artifact Alert", label: t("category_artifact_alert", "{Mod} Alert") }
                    ])
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
            icon: t("icon_cell_tower", "cell_tower"),
            label: wayfinderDrafts['new'] ? t("action_unsaved_draft", "Resume Draft") : t("post_broadcast", "New {Dispatch}"),
            onClick: () => openEditor()
          }
        ] : undefined
      }
    >
      {filterStatus === 'overview' ? renderLanding() : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
            {postCards}
          </div>
          {filteredPosts.length === 0 && (
            <EmptyState icon={t("icon_cell_tower", "cell_tower")} title={t("no_transmissions", "No {Dispatches} Found")} className="py-16" />
          )}
        </>
      )}
    </ElevatedHubLayout>
  );

  const wrappedContent = isSidePanel ? (
    <SidePanel
      isOpen={isOpen!}
      onClose={onClose!}
      title={t("wf_tab_dispatch", "Dispatches")}
      subtitle={t("system_broadcasts", "System Broadcasts")}
      icon={t("icon_satellite_alt", "satellite_alt")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] max-w-[1200px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_satellite_alt", "satellite_alt")}
          overline={t("wf_tab_dispatch", "Dispatches")}
          title={t("system_broadcasts", "System Broadcasts")}
          description={t("dispatch_hub_desc", "Manage and broadcast system dispatches, version alerts, and community notices.")}
          variant="accent"
        />
        {contentBlock}
      </div>
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
            icon={t("icon_cell_tower", "cell_tower")}
            iconColorClass="text-[var(--accent)]"
            widthClass="w-[90vw] md:w-[800px]"
            title={editingPostId ? t("update_transmission", "Update {Dispatch}") : t("post_broadcast", "New {Dispatch}")}
            subtitle={editingPostId ? t("editing_record", "Editing Record") : t("composing_broadcast", "Composing Broadcast")}
            headerActions={
              <PanelHeaderGroup>
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
                    icon={confirmDiscard ? t("icon_warning", "warning") : t("icon_undo", "undo")}
                    variant="danger"
                    className={confirmDiscard ? "animate-pulse" : ""}
                  />
                )}
                {editingPostId && (
                  confirmDelete === editingPostId ? (
                    <PanelHeaderButton
                      onClick={(e: any) => { e.stopPropagation(); handleDelete(editingPostId); setConfirmDelete(null); closeEditor(); }}
                      disabled={isSubmitting}
                      tooltip={t("confirm", "Confirm")}
                      icon={t("icon_delete_forever", "delete_forever")}
                      variant="danger"
                      className="animate-pulse"
                    />
                  ) : (
                    <PanelHeaderButton
                      onClick={(e: any) => { e.stopPropagation(); setConfirmDelete(editingPostId); }}
                      disabled={isSubmitting}
                      tooltip={t("purge", "Purge")}
                      icon={t("icon_delete", "delete")}
                      variant="danger"
                    />
                  )
                )}
                <PanelHeaderButton
                  onClick={handleSubmit}
                  disabled={isSubmitting || !title || !content}
                  tooltip={isSubmitting ? t("btn_saving", "Saving...") : (editingPostId ? t("update_transmission", "Update {Dispatch}") : t("btn_post", "Post Broadcast"))}
                  icon={isSubmitting ? t("icon_sync", "sync") : t("icon_send", "send")}
                  variant={((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) ? "warning" : "accent"}
                  className={isSubmitting ? "animate-pulse" : ""}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-4 mt-1 relative z-10 w-full pb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <UniversalGroup title={t("metadata", "Metadata")} icon={t("icon_tune", "tune")}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("post_title", "Post Title")}</label>
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("post_title", "Post Title")} className="w-full h-11 glass-surface rounded-xl px-4 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all" />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="flex justify-between items-center mx-1">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("post_description", "Short Summary")}</label>
                      <span className={`text-[9px] font-black ${description.length >= 250 ? 'text-[var(--warning)]' : 'text-[var(--subtext)] opacity-60'}`}>{description.length}/250</span>
                    </div>
                    <input maxLength={250} value={description} onChange={e => setDescription(e.target.value)} placeholder={t("post_description_ph", "Brief summary shown on cards...")} className="w-full h-11 glass-surface rounded-xl px-4 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("trans_type", "Transmission Type")}</label>
                    <div className="h-11">
                      <CustomDropdown
                        disableTint={true}
                        searchable={false}
                        value={deliveryMethod === "Dispatch" ? "Dispatch" : (isUrgent ? "UrgentAlert" : "Alert")}
                        onChange={(v: string[]) => {
                          const mode = v[0];
                          if (mode === "Dispatch") {
                            setDeliveryMethod("Dispatch");
                            setIsUrgent(false);
                            if (["Alert", "Game Version Alert", "Malware Alert", "Artifact Alert"].includes(category)) setCategory(isOversight ? "Game Issue" : "Update");
                          } else if (mode === "UrgentAlert") {
                            setDeliveryMethod("Alert");
                            setIsUrgent(true);
                            if (["Update", "Info", "Information", "Event", "Game Issue", "Mod Issue"].includes(category)) setCategory(isOversight ? "Game Version Alert" : "Alert");
                          } else {
                            setDeliveryMethod("Alert");
                            setIsUrgent(false);
                            if (["Update", "Info", "Information", "Event", "Game Issue", "Mod Issue"].includes(category)) setCategory(isOversight ? "Game Version Alert" : "Alert");
                          }
                        }}
                        options={[
                          { id: "Dispatch", label: t("dispatch", "Dispatch") },
                          { id: "Alert", label: t("standard_alert", "Standard Alert") },
                          { id: "UrgentAlert", label: t("urgent_alert", "Urgent Alert") }
                        ]}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("category", "Category")}</label>
                    <div className="h-11">
                      <CustomDropdown disableTint={true}
                        searchable={true}
                        allowCustom={true}
                        value={category}
                        onChange={(v: string[]) => setCategory(v[0])}
                        options={
                          isOversight ? (
                            deliveryMethod === "Alert" ? [
                              { id: "Game Version Alert", label: t("category_game_version_alert", "Game Version Alert") },
                              { id: "Malware Alert", label: t("category_malware_alert", "Malware Alert") },
                              { id: "Artifact Alert", label: t("category_artifact_alert", "{Mod} Alert") }
                            ] : [
                              { id: "Game Issue", label: t("category_game_issue", "Game Issue") },
                              { id: "Mod Issue", label: t("category_mod_issue", "{Mod} Issue") }
                            ]
                          ) : (
                            deliveryMethod === "Alert" ? [
                              { id: "Alert", label: t("category_alert", "Alert") },
                              { id: "Game Version Alert", label: t("category_game_version_alert", "Game Version Alert") },
                              { id: "Malware Alert", label: t("category_malware_alert", "Malware Alert") },
                              { id: "Artifact Alert", label: t("category_artifact_alert", "{Mod} Alert") }
                            ] : [
                              { id: "Update", label: t("category_update", "Update") },
                              { id: "Information", label: t("category_info", "Information") },
                              { id: "Event", label: t("category_event", "Event") },
                            ]
                          )
                        }
                        placeholder={t("auto_select_category", "Select category...")}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("wf_target_audience", "Target Audience")}</label>
                    <div className="h-11">
                      <CustomDropdown disableTint={true}
                        multiSelect={true}
                        searchable={true}
                        value={targetAudience}
                        onChange={setTargetAudience}
                        options={
                          isKeepers
                            ? communityOptions.map(name => ({ id: name, label: name }))
                            : [
                              { id: "All", label: t("audience_global", "Global") },
                              { id: "Citizens", label: t("role_citizens", "{Citizens}") },
                              { id: "Masons", label: t("role_masons", "{Masons}") },
                              { id: "Architects", label: t("role_architects", "Architects") },
                              { id: "Oversight", label: t("role_oversight", "Oversight") },
                              ...(!isOversight ? [{ id: "Wayfinders", label: t("role_wayfinders", "Wayfinders") }] : [])
                            ]
                        }
                        placeholder={t("auto_select_audience", "Select audience...")}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("action_required", "Action Required")}</label>
                    <div className="h-11">
                      <CustomDropdown disableTint={true}
                        searchable={true}
                        allowCustom={true}
                        value={actionRequired}
                        onChange={(v: string[]) => setActionRequired(v[0] || "No Action Required")}
                        options={[
                          { id: "No Action Required", label: t("dispatch_action_none", "No Action Required") },
                          { id: "Review Required", label: t("dispatch_action_review", "Review Required") },
                          { id: "Review Prior to Updating", label: t("dispatch_action_review_prior", "Review Prior to Updating") },
                          { id: "Update Required", label: t("dispatch_action_update", "Update Required") },
                          { id: "Global Alerts - Elevated Malware Risk", label: t("dispatch_action_elevated_malware", "Global Alerts - Elevated Malware Risk") },
                          { id: "Clarify with Oversight & Architect Teams", label: t("dispatch_action_clarify", "Clarify with Oversight & Architect Teams") }
                        ]}
                        placeholder={t("dispatch_ph_action_required", "Select or type action required...")}
                      />
                    </div>
                  </div>
                </div>
              </UniversalGroup>

              <UnifiedPostBodyEditor
                mode={editorMode}
                onModeChange={setEditorMode}
                content={content}
                onContentChange={setContent}
                editor={editor}
                placeholder={t("post_content", "{Dispatch} Body...")}
              />

              <PostAttachmentsManager
                content={content}
                onContentChange={setContent}
                editor={editor}
                onOpenAssetLinker={() => setIsAssetPanelOpen(true)}
                imageUrl={imageUrl}
                onImageUrlChange={setImageUrl}
                showCodeInput={showCodeInput}
                onToggleCodeInput={setShowCodeInput}
                codeSnippet={codeSnippet}
                onCodeSnippetChange={setCodeSnippet}
                pollData={pollData}
                onPollDataChange={setPollData}
              />
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
