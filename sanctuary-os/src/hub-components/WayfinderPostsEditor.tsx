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
import { SidePanel, standardButtonClass, standardAccentGlassButtonClass, CustomDropdown, HoverTooltip, EmptyState, extractPostImage, stripMarkdown, HubTabs, FilterTabs, FilterTabButton } from "../shared";
import MarkdownRenderer from "../MarkdownRenderer";
import IconPicker from "../IconPicker";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import { logArchitectAction } from "../lib/audit";

export function WayfinderPostsEditor({ authorId, authorProfileId, handleOpenWayfinderProfile, isOversight, isSidePanel, isOpen, onClose }: { authorId: string, authorProfileId: string, handleOpenWayfinderProfile?: (authorId: string, postId?: string) => void, isOversight?: boolean, isSidePanel?: boolean, isOpen?: boolean, onClose?: () => void }) {
  if (isSidePanel && !isOpen) return null;
  const isPostPinned = (p: any) => p?.is_pinned === true || p?.is_pinned === "true";
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState<string[]>(["All"]);
  const [category, setCategory] = useState("Update");
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

  const [assets, setAssets] = useState<any[]>([]);
  const [masonName, setWayfinderName] = useState<string>("");
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [filterAudience, setFilterAudience] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Active");

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

        isUnchanged =
          title === editingPost.title &&
          content === rawContent &&
          targetAudience.join(',') === (editingPost.target_audience || "All") &&
          category === (editingPost.category || "Update") &&
          imageUrl === parsedImage &&
          description === (editingPost.description || "") &&
          codeSnippet === (editingPost.code_snippet || "") &&
          isPinned === isPostPinned(editingPost);
      } else {
        title === "" &&
          description === "" &&
          content === "" &&
          (targetAudience.length === 1 && targetAudience[0] === "All") &&
          category === "Update" &&
          imageUrl === "" &&
          codeSnippet === "" &&
          isPinned === false &&
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
          [draftId]: { title, description, content, targetAudience, category, imageUrl, codeSnippet, isPinned, isActive }
        }));
      }
    }
  }, [isEditorOpen, editingPostId, editingPost, title, description, content, targetAudience, category, imageUrl, codeSnippet, isPinned, isActive]);

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
        class: 'w-full flex-1 px-6 py-6 text-[var(--text)] text-sm font-sans focus:outline-none custom-scrollbar min-h-[350px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-[var(--accent)] [&_img]:rounded-xl [&_img]:max-w-full [&_code]:bg-white/10 [&_code]:px-1 [&_code]:rounded [&_hr]:border-white/10 [&_hr]:my-8',
      },
    },
  });

  const fetchPostsAndAssets = async () => {
    const { data } = await supabase.from('system_broadcasts').select('*').order('created_at', { ascending: false });
    if (data) setPosts(data);

    if (authorId) {
      if (authorId === 'system') {
        setWayfinderName("SYSTEM");
      } else {
        const { data: profileData } = await supabase.from('profiles').select('username').eq('id', authorId).single();
        if (profileData?.username) setWayfinderName(profileData.username);
      }
    }

    const { data: modsData } = await supabase.from('mods').select('id, name');
    const { data: marketAssetsData } = await supabase.from('nexus_assets').select('id, name, asset_type');
    const { data: blueprintsData } = await supabase.from('blueprints').select('id, name');

    let combinedAssets: any[] = [];
    if (modsData) combinedAssets.push(...modsData.map(m => ({ id: m.id, name: m.name, type: 'mod' })));
    if (blueprintsData) combinedAssets.push(...blueprintsData.map(b => ({ id: b.id, name: b.name, type: 'blueprint' })));
    if (marketAssetsData) combinedAssets.push(...marketAssetsData.map(a => ({ id: a.id, name: a.name, type: a.asset_type })));
    setAssets(combinedAssets.sort((a, b) => a.name.localeCompare(b.name)));
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
    const translatedView = t("ui_btn_view");

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
    setAssetSearchQuery("");
  };

  const filteredAssets = useMemo(() => {
    if (!isAssetPanelOpen) return [];
    return assets.filter(a => a.name.toLowerCase().includes(assetSearchQuery.toLowerCase()));
  }, [assets, assetSearchQuery, isAssetPanelOpen]);

  const openEditor = (post?: any) => {
    setViewMode('edit');
    const draftId = post ? post.id : 'new';
    const draft = useStore.getState().wayfinderDrafts[draftId];

    if (post) {
      setEditingPostId(post.id);
      setEditingPost(post);
      let rawContent = post.message || post.content || '';
      let parsedImage = extractPostImage(post) || "";
      if (rawContent.startsWith('[IMG:')) {
        const endIdx = rawContent.indexOf(']');
        if (endIdx !== -1) {
          rawContent = rawContent.substring(endIdx + 1).trim();
        }
      }

      setTitle(draft?.title ?? post.title);
      setDescription(draft?.description ?? (post.description || ""));
      setTargetAudience(draft?.targetAudience ?? (post.target_audience ? post.target_audience.split(',') : ["All"]));
      setCategory(draft?.category ?? (post.category || "Update"));
      setCodeSnippet(draft?.codeSnippet ?? (post.code_snippet || ""));
      setShowCodeInput(!!(draft?.codeSnippet ?? post.code_snippet));
      setIsPinned(draft?.isPinned ?? isPostPinned(post));
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
      setTargetAudience(draft?.targetAudience ?? ["All"]);
      setCategory(draft?.category ?? "Update");

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
      setTargetAudience(["All"]);
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
    let payload: any = { title: title.trim(), description: description.trim() || null, message: finalContent.trim(), category: category, target_audience: targetAudience.join(','), code_snippet: codeSnippet.trim() || null, is_pinned: isPinned ? "true" : "false", is_active: isActive };
    if (imageUrl.trim()) payload.message = `[IMG:${imageUrl.trim()}]\n\n` + payload.message;

    let error = null;
    let newPostId: string | null = null;
    const performSave = async (data: any) => {
      if (editingPostId) {
        const res = await supabase.from('system_broadcasts').update(data).eq('id', editingPostId).select();
        if (!res.error) await logArchitectAction("Updated Dispatch", "system_broadcasts", data.title, undefined, "Wayfinder Operations");
        return { error: res.error, data: res.data };
      } else {
        const res = await supabase.from('system_broadcasts').insert([data]).select();
        if (!res.error && res.data && res.data.length > 0) {
          newPostId = res.data[0].id;
          await logArchitectAction("Created Dispatch", "system_broadcasts", data.title, undefined, "Wayfinder Operations");
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
            await supabase.from('notifications').insert(notifications);
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
    const { error } = await supabase.from('system_broadcasts').delete().eq('id', id);
    if (!error && postToDelete) await logArchitectAction("Deleted Dispatch", "system_broadcasts", postToDelete.title || id, undefined, "Wayfinder Operations");
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

  const postCards = useMemo(() => {
    const draftSet = new Set(draftKeysStr.split(','));
    return filteredPosts.map(post => {
      const hasUnsavedEdits = draftSet.has(post.id);
      return (
        <div key={post.id} className={`theme-glass-panel p-5 rounded-[var(--radius)] relative group flex flex-col gap-4 transition-all duration-500 hover:-translate-y-1 shadow-lg backdrop-blur-3xl overflow-hidden ${hasUnsavedEdits ? '!border-amber-500/30 text-amber-500 !bg-amber-500/10 hover:!bg-amber-500/20 hover:!border-amber-500/50 shadow-[0_8px_32px_rgba(245,158,11,0.15)]' : isPostPinned(post) ? '!border-[var(--danger)]/30 !bg-[var(--danger)]/5 shadow-[0_10px_30px_rgba(var(--danger-rgb),0.1)]' : 'border border-white/5 hover:border-white/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]'}`}>
          <div className={`absolute -top-32 -right-32 w-64 h-64 blur-[80px] rounded-full pointer-events-none transition-opacity duration-700 z-0 ${isPostPinned(post) ? 'bg-[var(--danger)] opacity-20' : 'bg-[var(--text)] opacity-0 group-hover:opacity-[0.03]'}`} />
          {extractPostImage(post) && (
            <div className="-mx-5 -mt-5 rounded-t-3xl overflow-hidden h-36 bg-black/40 relative border-b border-white/5 shrink-0 z-10">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none" />
              <img src={extractPostImage(post)} alt={t("auto_cover")} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
            </div>
          )}
          <div className="flex flex-col gap-1 pr-4 z-10">
            <div className="flex items-center gap-2 mb-1">
              {isPostPinned(post) && (
                <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/30 backdrop-blur-md">
                  <span className="material-symbols-outlined !text-[10px]">{t("icon_warning_amber")}</span>
                  {t("urgent_alert") || "URGENT"}
                </span>
              )}
              <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{new Date(post.created_at).toLocaleDateString()}</span>
            </div>
            <h4 className="text-lg font-black text-[var(--text)] uppercase tracking-tighter line-clamp-1">{post.title}</h4>
          </div>
          {hasUnsavedEdits && (
            <div className="absolute top-6 right-6 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[var(--warning)] bg-[var(--warning)]/20 border border-[var(--warning)]/40 px-3 py-1.5 rounded-full shadow-lg z-20 pointer-events-none backdrop-blur-xl">
              <span className="material-symbols-outlined !text-[12px]">{t("icon_edit_note")}</span>
              {t("ph_unsaved_changes") || "UNSAVED EDITS"}
            </div>
          )}
          <div className="flex-1 relative z-10 -mx-1">
            <p className="text-[11px] font-mono text-[var(--subtext)] opacity-70 leading-relaxed whitespace-pre-wrap break-words line-clamp-5">
              {post.description ? post.description : (stripMarkdown(post.message || post.content || '').length > 300 ? stripMarkdown(post.message || post.content || '').substring(0, 300) + '...' : stripMarkdown(post.message || post.content || ''))}
            </p>
          </div>
          <div className={`mt-auto pt-4 border-t border-white/5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 relative z-20 ${confirmDelete === post.id ? 'justify-center w-full' : 'justify-end'}`}>
            {confirmDelete === post.id ? (
              <>
                <span className="text-[10px] font-black text-[var(--danger)] uppercase tracking-widest self-center animate-pulse flex items-center gap-1.5 opacity-80 mr-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_warning_amber")}</span> {t("btn_confirm")}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--text)] opacity-60 hover:opacity-100 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_close")}</span> {t("shared_cancel")}</button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(post.id); setConfirmDelete(null); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_delete_forever")}</span> {t("purge")}</button>
              </>
            ) : (
              <>
                <button onClick={(e) => { e.stopPropagation(); setPreviewPost(post); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_visibility")}</span> {t("ui_btn_view")}</button>
                <button onClick={(e) => { e.stopPropagation(); openEditor(post); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] hover:shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_20%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_edit")}</span> {t("emote_edit")}</button>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(post.id); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_20%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("icon_delete")}</span> {t("purge")}</button>
              </>
            )}
          </div>
        </div>
      );
    });
  }, [filteredPosts, draftKeysStr, confirmDelete, t]);

  const contentBlock = (
    <div className="h-full flex flex-col w-full relative">
      <div className="flex items-center gap-4 px-6 py-6 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_1%,transparent)]">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_satellite_alt")}</span>
          </div>
          <span className="truncate">{isOversight ? t("oversight_posts_editor") : t("wf_title_dispatct")}</span>
        </h2>
        <div className="relative flex-1 max-w-4xl ml-auto flex gap-4 items-center justify-end">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t("mason_search_placeholder")}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
              </button>
            )}
          </div>
          <div className="w-max min-w-[180px] max-w-xs">
            <CustomDropdown
              value={filterCategory}
              onChange={(v: string[]) => setFilterCategory(v[0])}
              options={[
                { id: "All", label: t("all_classes") || "All Categories" },
                ...(isOversight ? [
                  { id: "Game Issue", label: t("category_game_issue") },
                  { id: "Mod Issue", label: t("category_mod_issue") },
                  { id: "Game Version Alert", label: t("category_game_version_alert") },
                  { id: "Malware Alert", label: t("category_malware_alert") },
                  { id: "Artifact Alert", label: t("category_artifact_alert") }
                ] : [
                  { id: "Update", label: t("comms_btn_update") || "Update" },
                  { id: "Info", label: t("category_info") || "Info" },
                  { id: "Event", label: t("category_event") || "Event" },
                  { id: "Alert", label: t("category_alert") || "Alert" },
                  { id: "Game Version Alert", label: t("category_game_version_alert") },
                  { id: "Malware Alert", label: t("category_malware_alert") },
                  { id: "Artifact Alert", label: t("category_artifact_alert") }
                ])
              ]}
              placeholder={t("filter_category")}
            />
          </div>
          <FilterTabs className="h-12 z-40">
            <FilterTabButton
              id="Active"
              label={t("masonhub_status_active")}
              activeTab={filterStatus}
              setTab={setFilterStatus}
            />
            <FilterTabButton
              id="Inactive"
              label={t("status_inactive")}
              activeTab={filterStatus}
              setTab={setFilterStatus}
            />
          </FilterTabs>
          <button
            onClick={() => openEditor()}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group relative"
          >
            {wayfinderDrafts['new'] && (
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-[var(--warning)] border-2 border-[var(--bg)] shadow-md animate-pulse"></span>
            )}
            <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("icon_cell_tower")}</span> {t("post_broadcast")}
          </button>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-10 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
          {postCards}
        </div>
        {filteredPosts.length === 0 && (
          <EmptyState icon={t("icon_cell_tower") || "cell_tower"} title={t("no_transmissions")} className="col-span-full py-16" />
        )}
      </div>
    </div>
  );

  const wrappedContent = isSidePanel ? (
    <SidePanel isOpen={isOpen!} onClose={onClose!} title={t("wf_title_dispatct")} subtitle={isOversight ? t("oversight_posts_editor") : t("system_broadcasts")} icon="satellite_alt" iconColorClass="text-[var(--accent)] border-[var(--accent)]/30" widthClass="w-[90vw] max-w-[1200px]">
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
            footer={
              <div className="flex justify-center items-center gap-4 w-full">
                {((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) ? (
                  <button onClick={handleDiscardChanges} disabled={isSubmitting} className={standardButtonClass + (confirmDiscard ? " !border-[var(--danger)] !text-[var(--danger)] !bg-[var(--danger)]/20 shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_40%,transparent)]" : " !border-[var(--danger)]/30 !text-[var(--danger)] hover:!border-[var(--danger)]/60 hover:!bg-[var(--danger)]/10")}>
                    {confirmDiscard ? (t("ui_confirm_discard") || "Confirm Discard") : (t("ui_btn_discard_edits") || "DISCARD EDITS")}
                  </button>
                ) : (
                  <button onClick={closeEditor} disabled={isSubmitting} className={standardButtonClass}>{t("shared_cancel")}</button>
                )}
                <div className="relative group/btn flex">
                  <button onClick={handleSubmit} disabled={isSubmitting || !title || !content} className={((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) ? standardAccentGlassButtonClass.replace('bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]', 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--accent)_30%,transparent)]', 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)]').replace('text-[var(--accent)]', 'text-[var(--warning)]').replace('hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]', 'hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]') : standardAccentGlassButtonClass}>
                    {isSubmitting ? t("btn_saving") : (editingPostId ? t("update_transmission") : t("btn_post"))}
                  </button>
                  {((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) && (
                    <HoverTooltip title={t("ph_unsaved_changes") || "UNSAVED EDITS"} variant="warning" className="group-hover/btn:flex z-[100]" />
                  )}
                </div>
              </div>
            }
          >
            <div className="flex flex-col gap-6">

              <div className="flex border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] mb-4 pb-4">
                <div className="w-96 shrink-0">
                  <HubTabs 
                    tabs={[{id: 'edit', label: t("editor")}, {id: 'preview', label: t("preview")}]} 
                    activeTab={viewMode} 
                    setTab={setViewMode} 
                  />
                </div>

                <div className="ml-auto pr-4 flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="hidden" />
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shadow-inner backdrop-blur-md ${isActive ? 'bg-[var(--success)]/20 border-[var(--success)]/50 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-black/40'}`}>
                      {isActive && <span className="material-symbols-outlined !text-[14px] text-[var(--success)]">{t("icon_check")}</span>}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1"><span className="material-symbols-outlined !text-[16px]">{t("icon_satellite_alt")}</span> {isActive ? t("masonhub_status_active") : t("status_inactive")}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
                    <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="hidden" />
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shadow-inner backdrop-blur-md ${isPinned ? 'bg-[var(--danger)]/20 border-[var(--danger)]/50 shadow-[0_0_10px_rgba(var(--danger-rgb),0.3)]' : 'border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-black/40'}`}>
                      {isPinned && <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">{t("icon_warning_amber")}</span>}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${isPinned ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}><span className="material-symbols-outlined !text-[16px]">{t("icon_warning_amber")}</span> {t("urgent_alert") || "URGENT"}</span>
                  </label>
                </div>
              </div>

              {viewMode === 'edit' ? (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("post_title")}</label>
                    <input required value={title} onChange={e => setTitle(e.target.value)} placeholder={t("post_title")} className="theme-glass-inner bg-black/40 rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all w-full" />
                  </div>

                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex justify-between items-center ml-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("post_description")}</label>
                      <span className={`text-[9px] font-black ${description.length >= 250 ? 'text-[var(--warning)]' : 'text-[var(--subtext)] opacity-60'}`}>{description.length} / 250</span>
                    </div>
                    <input maxLength={250} value={description} onChange={e => setDescription(e.target.value)} placeholder={t("post_description_ph") || "Short summary or description (optional)"} className="theme-glass-inner bg-black/40 rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all w-full" />
                  </div>

                  <div className="flex gap-4 w-full">
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("wf_target_audience")}</label>
                      <div className="h-14">
                        <CustomDropdown disableTint={true}
                          multiSelect={true}
                          selectedValues={targetAudience}
                          onChange={setTargetAudience}
                          options={[
                            { id: "All", label: "All Elevated" },
                            { id: "Citizens", label: "Citizens" },
                            { id: "Masons", label: "Masons" },
                            { id: "Architects", label: "Architects" },
                            { id: "Oversight", label: "Oversight" },
                            ...(!isOversight ? [{ id: "Wayfinders", label: "Wayfinders" }] : [])
                          ]}
                          placeholder={t("auto_select_audience")}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("category")}</label>
                      <div className="h-14">
                        <CustomDropdown disableTint={true}
                          value={category}
                          onChange={(v: string[]) => setCategory(v[0])}
                          options={
                            isOversight ? [
                              { id: "Game Issue", label: t("category_game_issue") },
                              { id: "Mod Issue", label: t("category_mod_issue") },
                              { id: "Game Version Alert", label: t("category_game_version_alert") },
                              { id: "Malware Alert", label: t("category_malware_alert") },
                              { id: "Artifact Alert", label: t("category_artifact_alert") }
                            ] : [
                              { id: "Update", label: "Update" },
                              { id: "Info", label: "Info" },
                              { id: "Event", label: "Event" },
                              { id: "Alert", label: "Alert" },
                              { id: "Game Version Alert", label: t("category_game_version_alert") },
                              { id: "Malware Alert", label: t("category_malware_alert") },
                              { id: "Artifact Alert", label: t("category_artifact_alert") }
                            ]
                          }
                          placeholder={t("auto_select_category")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("header_image_placeholder")}</label>
                    <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder={t("header_image_placeholder")} className="theme-glass-inner bg-black/40 rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all" />
                  </div>

                  <div className="flex flex-col gap-2 flex-1 min-h-[400px]">
                    <div className="flex items-center justify-between ml-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("post_content")}</label>
                    </div>
                    <div className="flex flex-col flex-1 theme-glass-inner bg-black/40 rounded-2xl border focus-within:border-[var(--accent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all">
                      <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
                        <div className="relative flex flex-col items-center">
                          <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-[1.25rem] shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-2xl pointer-events-auto bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]">
                            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bold') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_bold")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('italic') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_italic")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h1")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h2")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bulletList') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_bulleted")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('orderedList') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_numbered")}</span></button>
                            <button type="button" onClick={() => setShowImageInput(!showImageInput)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showImageInput ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_image")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('codeBlock') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_code")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"><span className="material-symbols-outlined !text-[18px]">{t("icon_horizontal_rule")}</span></button>
                            <button type="button" onClick={() => setShowIconPicker(!showIconPicker)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showIconPicker ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">sentiment_satisfied</span></button>
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
                        <div className="border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-3 bg-white/5 shadow-inner animate-in slide-in-from-top-2 duration-300 flex items-center gap-3 relative z-10 backdrop-blur-xl">
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
                            className="flex-1 theme-glass-inner rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] transition-all shadow-inner"
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
                            className="px-6 py-2 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[var(--accent)]/50 text-[var(--accent)] rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] hover:-translate-y-0.5 transition-all hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                          >
                            {t("ui_btn_insert")}
                          </button>
                        </div>
                      )}

                      <div className="w-full flex-1 relative min-h-[350px]">
                        <EditorContent editor={editor} className="h-full w-full custom-scrollbar" />
                      </div>

                      {showCodeInput && (
                        <div className="border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3 bg-black/40 shadow-inner animate-in slide-in-from-bottom-2 duration-300">
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
                          <button type="button" onClick={() => setShowCodeInput(!showCodeInput)} className={`px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest flex items-center gap-1.5 ${showCodeInput ? 'theme-bg-accent/20 theme-text-accent' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>
                            <span className="material-symbols-outlined !text-[14px]">{t("icon_data_object")}</span> {showCodeInput ? (t("hide_code")) : (t("masonhub_add_code"))}
                          </button>
                          <button type="button" onClick={() => setIsAssetPanelOpen(true)} className="px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 flex items-center gap-1.5">
                            <span className="material-symbols-outlined !text-[14px]">{t("icon_link")}</span> {t("link_asset")}
                          </button>
                        </div>
                        <div className="text-[9px] font-black tracking-widest uppercase opacity-40 flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("icon_markdown")}</span> {t("icon_markdown")}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6 mt-4">
                  <h3 className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-2">{t("live_preview")}</h3>

                  {imageUrl && (
                    <div className="w-full h-48 sm:h-64 relative shrink-0 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-black/40 rounded-[var(--radius)] overflow-hidden shadow-lg -mb-8">
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--background)] z-10 opacity-90" />
                      <img src={imageUrl} className="w-full h-full object-cover object-center relative z-0 opacity-80 mix-blend-screen" alt={t("auto_post_cover_preview")} />
                    </div>
                  )}

                  <div className={`relative z-20 ${imageUrl ? 'p-6 -mx-6 rounded-[var(--radius)] border border-white/10 bg-[var(--background)]/40 backdrop-blur-2xl shadow-2xl mt-4 mb-2' : 'mb-6'}`}>
                    <h1 className="text-3xl font-black text-[var(--text)] uppercase tracking-tight">{title || (t("untitled"))}</h1>
                  </div>

                  <div className="markdown-body p-6 theme-glass-inner rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shadow-inner relative z-20">
                    {content ? <MarkdownRenderer content={content} onAssetClick={(type: string, id: string) => setActiveAsset({ type, id })} /> : <p className="text-[var(--subtext)] opacity-50 italic">{t("no_content_preview")}</p>}
                  </div>
                </div>
              )}
            </div>
          </SidePanel>
        </>
      )}

      <SidePanel
        isOpen={isAssetPanelOpen}
        onClose={() => setIsAssetPanelOpen(false)}
        title={t("link_asset")}
        icon="link"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      >
        <div className="flex flex-col gap-6">
          <div className="animate-in slide-in-from-top-2">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
              <input
                value={assetSearchQuery}
                onChange={(e) => setAssetSearchQuery(e.target.value)}
                placeholder={t("search_assets")}
                className="w-full theme-glass-panel rounded-2xl pl-10 pr-5 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 shadow-inner"
                autoFocus
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {isAssetPanelOpen && (
              <>
                {filteredAssets.length === 0 && <EmptyState icon={t("ui_icon_image_not_supported") || "image_not_supported"} title={t("no_assets")} className="col-span-full py-16" />}
                {filteredAssets.slice(0, 100).map(asset => (
                  <button key={`${asset.type}-${asset.id}`} type="button" onClick={() => handleLinkAsset(asset)} className="text-left px-5 py-4 rounded-2xl theme-glass-inner hover:theme-border-accent hover:-translate-y-0.5 transition-all flex items-center gap-4 group">
                    <span className="material-symbols-outlined opacity-70 text-xl shrink-0 group-hover:scale-110 transition-transform">{asset.type === 'mod' ? (t("icon_extension")) : asset.type === 'blueprint' ? (t("icon_architecture")) : asset.type === 'lexicon' ? (t("icon_translate")) : (t("icon_palette"))}</span>
                    <span className="text-sm font-black text-[var(--text)] uppercase tracking-tight truncate w-full group-hover:theme-text-accent transition-colors">{asset.name}</span>
                  </button>
                ))}
                {filteredAssets.length > 100 && (
                  <div className="text-center text-[var(--subtext)] text-xs py-4 opacity-50 font-black uppercase tracking-widest">
                    {t("search_to_see_more_results") || `+ ${filteredAssets.length - 100} MORE ASSETS`}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </SidePanel>

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

