import React, { useState, useEffect, useMemo, useRef } from "react";
import IconPicker from "./IconPicker";
import MarkdownRenderer from "./MarkdownRenderer";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  SidePanel, CustomDropdown, ModSearchDropdown, EmptyState, HoverTooltip, CustomDatePicker, ActionButton, LinkAssetSidePanel,
  DashboardStatTile, ViewHeader, CustomComplianceDropdown,
  HubTabButton, HubTabs,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass, PanelHeaderGroup, PanelHeaderButton,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  SidePanelHeroCard, SidePanelTitleInput, SidePanelPillToggle, UniversalGroup, StatBox
} from "./shared";
import { ElevatedHubLayout } from "./components/layouts/ElevatedHubLayout";
import { ArtifactCard, VaultCard } from "./Cards";
import { UniversalCard } from "./components/universal/UniversalCard";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";

import MasonPostCard from "./MasonPostCard";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import { PostEditorMode, UnifiedPostBodyEditor, PostAttachmentsManager } from "./components/universal/UnifiedPostEditor";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import { IconPlugin } from './IconPlugin';


export function MasonPostsEditor({ masonId, masonProfileId, handleOpenMasonProfile }: { masonId: string, masonProfileId: string, handleOpenMasonProfile?: (masonId: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [codeSnippet, setCodeSnippet] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [inlineImageUrl, setInlineImageUrl] = useState("");

  const [masonName, setMasonName] = useState<string>("");
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<PostEditorMode>("wysiwyg");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const [isPinned, setIsPinned] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const masonHubDrafts = useStore(state => state.masonHubDrafts);
  const setMasonHubDrafts = useStore(state => state.setMasonHubDrafts);

  useEffect(() => {
    if (isEditorOpen) {
      const draftId = editingPostId || 'new';

      let isUnchanged = false;
      if (editingPost) {
        let rawContent = editingPost.content || '';
        let parsedImage = extractPostImage(editingPost) || "";
        if (rawContent.startsWith('[IMG:')) {
          const endIdx = rawContent.indexOf(']');
          if (endIdx !== -1) {
            rawContent = rawContent.substring(endIdx + 1).trim();
          }
        }

        isUnchanged =
          title === editingPost.title &&
          description === (editingPost.description || "") &&
          content === rawContent &&
          imageUrl === parsedImage &&
          codeSnippet === (editingPost.code_snippet || "") &&
          isPinned === !!editingPost.is_pinned &&
          isActive === (editingPost.is_active !== false);
      } else {
        isUnchanged =
          title === "" &&
          description === "" &&
          content === "" &&
          imageUrl === "" &&
          codeSnippet === "" &&
          isPinned === false &&
          isActive === true;
      }

      if (isUnchanged) {
        setMasonHubDrafts(prev => {
          if (!prev[draftId]) return prev;
          const next = { ...prev };
          delete next[draftId];
          return next;
        });
      } else {
        setMasonHubDrafts(prev => ({
          ...prev,
          [draftId]: { title, description, content, imageUrl, codeSnippet, isPinned, isActive }
        }));
      }
    }
  }, [isEditorOpen, editingPostId, editingPost, title, description, content, imageUrl, codeSnippet, isPinned, isActive]);

  useEffect(() => {
    if (masonHubDrafts && Object.keys(masonHubDrafts).length > 0) {
      Object.keys(masonHubDrafts).forEach(id => {
        if (!masonHubDrafts[id].content && !masonHubDrafts[id].title) {
          setMasonHubDrafts(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      });
    }
  }, [isEditorOpen]);

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
    const { data } = await supabase.from('mason_posts').select('*, masons(*)').eq('mason_id', masonId).order('created_at', { ascending: false });
    if (data) setPosts(data);

    const { data: masonData } = await supabase.from('masons').select("name").eq('id', masonId).single();
    if (masonData?.name) setMasonName(masonData.name);
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
    const defaultTypeLabel = asset.type === 'mod' ? 'Artifact' : asset.type === 'blueprint' ? 'Blueprint' : asset.type === 'chameleon' ? 'Theme' : asset.type === 'workbench_template' ? 'Template' : 'Lexicon';
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
    const draft = useStore.getState().masonHubDrafts[draftId];

    if (post) {
      setEditingPostId(post.id);
      setEditingPost(post);
      let rawContent = post.content || '';
      let parsedImage = extractPostImage(post) || "";

      if (parsedImage) {
        rawContent = rawContent.replace(new RegExp(`\\[IMG:${parsedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*`), '');
        rawContent = rawContent.replace(new RegExp(`!\\[.*?\\]\\(${parsedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*`), '');
        rawContent = rawContent.replace(new RegExp(`<img[^>]+src=["']${parsedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*`, 'i'), '');
      }
      rawContent = rawContent.replace(/\[IMG:.*?\]\s*/, '').trim();

      setTitle(draft?.title ?? post.title);
      setDescription(draft?.description ?? (post.description || ""));
      setCodeSnippet(draft?.codeSnippet ?? (post.code_snippet || ""));
      setShowCodeInput(!!(draft?.codeSnippet ?? post.code_snippet));
      setIsPinned(draft?.isPinned ?? !!post.is_pinned);
      setIsActive(draft?.isActive ?? (post.is_active !== false));

      const contentToSet = draft?.content ?? rawContent;
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
      const contentToSet = draft?.content ?? "";
      setContent(contentToSet);
      if (editor) {
        editor.commands.setContent(contentToSet);
      }
      setImageUrl(draft?.imageUrl ?? "");
      setCodeSnippet(draft?.codeSnippet ?? "");
      setShowCodeInput(!!draft?.codeSnippet);
      setIsPinned(draft?.isPinned ?? false);
      setIsActive(draft?.isActive ?? true);
    }
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingPostId(null);
    setEditingPost(null);
    setTitle("");
    setDescription("");
    setContent("");
    if (editor) {
      editor.commands.setContent("");
    }
    setImageUrl("");
    setCodeSnippet("");
    setShowCodeInput(false);
    setShowImageInput(false);
    setShowIconPicker(false);
    setIsPinned(false);
    setIsActive(true);
  };

  const handleDiscardChanges = () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      setTimeout(() => setConfirmDiscard(false), 3000);
      return;
    }
    const draftId = editingPostId || 'new';
    setMasonHubDrafts(prev => {
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

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', user.id).single();
      if (profile?.is_comm_banned) {
        useStore.getState().pushStatus(`Communications Ban: ${profile.comm_blacklist_reason || 'You are banned from comm-link.'}`, "error");
        return;
      }
    }

    if (isPinned) {
      const existingPinned = posts.find(p => p.is_pinned && p.id !== editingPostId);
      if (existingPinned) {
        if (!window.confirm(t("confirm_pin_replace", "Another {dispatch} is already pinned. Are you sure you want to replace it?"))) {
          return;
        }
        await supabase.rpc('secure_upsert_cloud_file', {
          p_target: 'mason_posts',
          p_payload: { id: existingPinned.id, is_pinned: false },
          p_token: useStore.getState().session?.access_token || ''
        });
      }
    }

    setIsSubmitting(true);
    let payload: any = {
      mason_id: masonId,
      title: title.trim(),
      description: description.trim() || null,
      content: finalContent.trim(),
      code_snippet: codeSnippet.trim() || null,
      is_pinned: isPinned,
      is_active: isActive
    };
    if (imageUrl.trim()) payload.image_url = imageUrl.trim();

    let error = null;
    let newPostId: string | null = null;
    const performSave = async (data: any) => {
      const payloadWithId = editingPostId ? { id: editingPostId, ...data } : data;
      const res = await supabase.rpc('secure_upsert_cloud_file', {
        p_target: 'mason_posts',
        p_payload: payloadWithId,
        p_token: useStore.getState().session?.access_token || ''
      });
      if (!res.error && res.data && res.data.length > 0 && !editingPostId) {
        newPostId = res.data[0].id;
      }
      return { error: res.error, data: res.data };
    };

    let resObj = await performSave(payload);
    error = resObj.error;

    if (error && (error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST205' || (error.message && error.message.includes('image_url')))) {
      if (imageUrl.trim()) payload.content = `[IMG:${imageUrl.trim()}]\n\n` + payload.content;
      delete payload.image_url;
      resObj = await performSave(payload);
      error = resObj.error;
    }

    if (!error) {
      if (!editingPostId && newPostId) {
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
          const { data: followers } = await supabase.from('mason_followers').select('user_id').eq('mason_id', masonId);
          if (followers && followers.length > 0) {
            const notifications = followers.map(f => ({
              id: crypto.randomUUID(),
              user_id: f.user_id,
              actor_id: authUser.user!.id,
              type: 'new_post',
              reference_id: newPostId,
              message: `${masonName || 'A Mason you follow'} has broadcast a new Transmission.`
            }));

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

      useStore.getState().setMasonHubDrafts(prev => {
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
    await supabase.rpc('secure_delete_cloud_file', {
      p_target: 'mason_posts',
      p_id: id,
      p_token: useStore.getState().session?.access_token || ''
    });
    fetchPostsAndAssets();
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      if (activeTab === "pinned" && !p.is_pinned) return false;
      if (activeTab === "active" && p.is_active === false) return false;
      if (activeTab === "inactive" && p.is_active !== false) return false;
      return p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             p.content?.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [posts, searchTerm, activeTab]);
  const draftKeysStr = useMemo(() => Object.keys(masonHubDrafts).sort().join(','), [masonHubDrafts]);

  const postCards = useMemo(() => {
    const draftSet = new Set(draftKeysStr.split(','));
    return filteredPosts.map((post, index) => {
      const isDraft = draftSet.has(post.id);

      return (
        <MasonPostCard layout="vertical"
          key={post.id}
          post={post}
          index={index}
          onPostClick={openEditor}
          onToggleLike={() => { }}
          hasUnsavedEdits={isDraft}
        />
      );
    });
  }, [filteredPosts, draftKeysStr, confirmDelete, t, setPreviewPost]);

  const renderLanding = () => {
    const recentPosts = posts.slice(0, 4);
    const draftSet = new Set(draftKeysStr.split(','));

    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--accent)]">{t("icon_history", "history")}</span>
            <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("title_recent_posts", "Recent {Dispatches}")}</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
          </div>
          {recentPosts.length === 0 ? (
            <div className="py-8 text-center text-[var(--subtext)] opacity-50 font-black tracking-widest text-xs">{t("no_transmissions", "No {Dispatches} Found")}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
              {recentPosts.map((post, index) => (
                <div key={post.id} className="w-full">
                  <MasonPostCard layout="vertical"
                    post={post}
                    index={index}
                    onPostClick={openEditor}
                    onToggleLike={() => { }}
                    hasUnsavedEdits={draftSet.has(post.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--accent)]">{t("icon_forum", "forum")}</span>
            <h3 className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("title_recent_replies", "Recent Replies")}</h3>
            <div className="flex-1 h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"></div>
          </div>
          <div className="py-8 text-center text-[var(--subtext)] opacity-50 font-black tracking-widest text-xs">{t("no_replies", "No recent replies")}</div>
        </div>
      </div>
    );
  };

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard")
    },
    {
      id: "active",
      label: t("tab_active", "Active"),
      icon: t("icon_check_circle", "check_circle"),
      number: posts.filter(p => p.is_active !== false).length.toString()
    },
    {
      id: "inactive",
      label: t("tab_inactive", "Inactive"),
      icon: t("icon_cancel", "cancel"),
      number: posts.filter(p => p.is_active === false).length.toString()
    }
  ];

  return (
    <ElevatedHubLayout
      headerTitle={t("mason_hub_title", "{Mason} Workshop")}
      headerBreadcrumb={t("tab_posts", "{Dispatches}")}
      headerIcon={t("icon_edit_document", "edit_document")}
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("mason_search_placeholder", "Search {dispatches}...")}
      hideSearch={activeTab === 'overview'}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as string)}
      actions={
        activeTab !== 'overview' ? [
          {
            id: "post",
            icon: t("icon_cell_tower", "cell_tower"),
            label: t("post_broadcast", "New {Dispatch}"),
            onClick: () => openEditor()
          }
        ] : undefined
      }
    >
      <div className="w-full flex flex-col gap-10 pb-32">
        {activeTab === 'overview' ? (
          renderLanding()
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
            {postCards}
            {filteredPosts.length === 0 && (
              <EmptyState icon={t("icon_cell_tower", "cell_tower")} title={t("no_transmissions", "No {Dispatches} Found")} className="col-span-full py-16" />
            )}
          </div>
        )}
      </div>

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
                {Boolean((editingPostId || 'new') && masonHubDrafts[editingPostId || 'new']) && (
                  <PanelHeaderButton
                    onClick={handleDiscardChanges}
                    disabled={isSubmitting}
                    tooltip={confirmDiscard ? t("ui_confirm_discard", "Confirm Discard") : t("ui_btn_discard_edits", "Discard Edits")}
                    icon={confirmDiscard ? t("icon_warning", "warning") : t("icon_delete", "delete")}
                    variant="danger"
                    className={confirmDiscard ? "animate-pulse" : ""}
                  />
                )}
                <PanelHeaderButton
                  onClick={() => setIsPinned(!isPinned)}
                  disabled={isSubmitting}
                  tooltip={t("pin_transmission", "Pin {Dispatch}")}
                  icon={t("icon_push_pin", "push_pin")}
                  isActive={isPinned}
                />
                <PanelHeaderButton
                  onClick={() => setIsActive(!isActive)}
                  disabled={isSubmitting}
                  tooltip={isActive ? t("mark_inactive", "Mark Inactive") : t("mark_active", "Mark Active")}
                  icon={isActive ? t("icon_visibility", "visibility") : t("icon_visibility_off", "visibility_off")}
                  isActive={!isActive}
                  variant={isActive ? "default" : "warning"}
                />
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
                  onClick={closeEditor}
                  disabled={isSubmitting}
                  tooltip={t("local_save", "Save Draft Locally")}
                  icon={t("icon_save", "save")}
                />
                <PanelHeaderButton
                  onClick={handleSubmit}
                  disabled={isSubmitting || !title || !content}
                  tooltip={isSubmitting ? t("btn_saving", "Saving...") : (editingPostId ? t("update_transmission", "Update {Dispatch}") : t("btn_post", "Post Broadcast"))}
                  icon={isSubmitting ? t("icon_sync", "sync") : t("icon_send", "send")}
                  variant={((editingPostId || 'new') && masonHubDrafts[editingPostId || 'new']) ? "warning" : "accent"}
                  className={isSubmitting ? "animate-pulse" : ""}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-4 mt-1 relative z-10 w-full pb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <UniversalGroup title={t("metadata", "Transmission Metadata")} icon={t("icon_tune", "tune")}>
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
                  <SidePanelPillToggle
                    label={t("pin_transmission", "Pin {Dispatch}")}
                    icon={t("icon_push_pin", "push_pin")}
                    checked={isPinned}
                    onChange={setIsPinned}
                    variant="accent"
                  />
                  <SidePanelPillToggle
                    label={t("status_active", "Active Transmission")}
                    icon={t("icon_visibility", "visibility")}
                    checked={isActive}
                    onChange={setIsActive}
                    variant="success"
                  />
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
          post={previewPost}
          onClose={() => setPreviewPost(null)}
          onOpenMasonProfile={handleOpenMasonProfile}
          userId={masonProfileId}
          onAssetClick={(type, id) => setActiveAsset({ type, id })}
        />
      )}

      {activeAsset && <AssetPreviewSidebar assetType={activeAsset.type} assetId={activeAsset.id} onClose={() => setActiveAsset(null)} />}
    </ElevatedHubLayout>
  );
}
