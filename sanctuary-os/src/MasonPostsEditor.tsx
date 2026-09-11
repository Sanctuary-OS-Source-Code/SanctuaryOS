import { SearchBar } from "./shared";
import React, { useState, useEffect, useMemo, useRef } from "react";
import IconPicker from "./IconPicker";
import MarkdownRenderer from "./MarkdownRenderer";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { SidePanel, CustomDropdown, ModSearchDropdown, EmptyState, HoverTooltip, CustomDatePicker, ActionButton, FilterPopover, LinkAssetSidePanel } from "./shared";
import { ElevatedHubLayout } from "./components/layouts/ElevatedHubLayout";
import {
  DashboardStatTile, ViewHeader, CustomComplianceDropdown,
  HubTabButton, HubTabs,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass, PanelHeaderGroup, PanelHeaderButton,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "./shared";
import { ArtifactCard, VaultCard } from "./Cards";
import { UniversalCard } from "./components/universal/UniversalCard";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";

import MasonPostCard from "./MasonPostCard";
import MasonPostViewer from "./side-panels/MasonPostViewer";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const [isPinned, setIsPinned] = useState(false);
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
          isPinned === !!editingPost.is_pinned;
      } else {
        isUnchanged =
          title === "" &&
          description === "" &&
          content === "" &&
          imageUrl === "" &&
          codeSnippet === "" &&
          isPinned === false;
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
          [draftId]: { title, description, content, imageUrl, codeSnippet, isPinned }
        }));
      }
    }
  }, [isEditorOpen, editingPostId, editingPost, title, description, content, imageUrl, codeSnippet, isPinned]);

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
    const mName = masonData?.name || '';


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
    const translatedType = t(typeKey) !== typeKey ? t(typeKey) : (asset.type === 'mod' ? 'Artifact' : asset.type === 'blueprint' ? 'Blueprint' : asset.type === 'chameleon' ? 'Theme' : asset.type === 'workbench_template' ? 'Template' : 'Lexicon');
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
    if (editor) {
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
        if (!window.confirm(t("confirm_pin_replace"))) {
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
      useStore.getState().pushStatus(editingPostId ? "Transmission Updated!" : t("post_success"), 'success');
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

  const tabs = [
    {
      id: "all",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: posts.length
    },
    {
      id: "pinned",
      label: t("tab_pinned") || "Pinned",
      icon: "push_pin",
      number: posts.filter(p => p.is_pinned).length
    }
  ];

  return (
    <ElevatedHubLayout
      headerTitle={t("mason_hub_title")}
      headerBreadcrumb={t("tab_posts") || "Posts"}
      headerIcon="edit_document"
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("mason_search_placeholder")}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as string)}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="md:hidden">
            <FilterPopover icon="more_vert" label={t("hub_actions") || "Actions"}>
              <div className="flex flex-col gap-4">
                <ActionButton
                  onClick={() => openEditor()}
                  icon={t("icon_cell_tower") || "cell_tower"}
                  label={t("post_broadcast")}
                  className="w-full h-10 px-6 font-black capitalize tracking-widest text-[10px] !w-auto"
                />
              </div>
            </FilterPopover>
          </div>
          <ActionButton
            onClick={() => openEditor()}
            className="hidden md:flex shrink-0 h-10 w-10 px-0"
            icon={t("icon_cell_tower") || "cell_tower"}
            iconOnly={true}
            label={t("post_broadcast")}
          />
        </div>
      }
    >
      <div className="w-full flex flex-col gap-10 pb-32">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
          {postCards}
          {filteredPosts.length === 0 && (
            <EmptyState icon={t("icon_cell_tower")} title={t("no_transmissions")} className="col-span-full py-16" />
          )}
        </div>
      </div>

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
                {((editingPostId || 'new') && masonHubDrafts[editingPostId || 'new']) ? (
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
                  onClick={() => setIsPinned(!isPinned)}
                  disabled={isSubmitting}
                  tooltip={t("pin_transmission")}
                  icon="push_pin"
                  isActive={isPinned}
                />
                {editingPostId && (
                  confirmDelete === editingPostId ? (
                    <PanelHeaderButton
                      onClick={(e: any) => { e.stopPropagation(); handleDelete(editingPostId); setConfirmDelete(null); closeEditor(); }}
                      disabled={isSubmitting}
                      tooltip={t("btn_confirm")}
                      icon="delete_forever"
                      variant="danger"
                      className="animate-pulse"
                    />
                  ) : (
                    <PanelHeaderButton
                      onClick={(e: any) => { e.stopPropagation(); setConfirmDelete(editingPostId); }}
                      disabled={isSubmitting}
                      tooltip={t("purge")}
                      icon="delete"
                      variant="danger"
                    />
                  )
                )}
                <PanelHeaderButton
                  onClick={closeEditor}
                  disabled={isSubmitting}
                  tooltip={t("local_save")}
                  icon="save"
                />
                <PanelHeaderButton
                  onClick={handleSubmit}
                  disabled={isSubmitting || !title || !content}
                  tooltip={isSubmitting ? t("btn_saving") : (editingPostId ? t("update_transmission") : t("btn_post"))}
                  icon={isSubmitting ? "sync" : "send"}
                  variant={((editingPostId || 'new') && masonHubDrafts[editingPostId || 'new']) ? "warning" : "accent"}
                  className={isSubmitting ? "animate-pulse" : ""}
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col gap-6">

              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("post_title")}</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("post_title")} className="glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all" />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-start items-center ml-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">{t("post_description")}</label>
                    <span className={`text-[9px] font-black ${description.length >= 250 ? 'text-[var(--warning)]' : 'text-[var(--subtext)] opacity-60'}`}>{description.length} / 250</span>
                  </div>
                  <input maxLength={250} value={description} onChange={e => setDescription(e.target.value)} placeholder={t("post_description_ph")} className="glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("header_image_placeholder")}</label>
                  <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder={t("header_image_placeholder")} className="glass-surface bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all" />
                </div>

                <div className="flex flex-col gap-2 flex-1 min-h-[400px]">
                  <div className="flex items-center justify-start ml-2">
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

                    <div className="flex items-center justify-start p-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-b-2xl shrink-0">
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
