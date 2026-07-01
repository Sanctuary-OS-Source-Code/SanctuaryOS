import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import { IconPlugin } from './IconPlugin';
import { standardAccentGlassButtonClass, standardButtonClass, SidePanel, CustomDropdown, extractPostImage, stripMarkdown } from './shared';
import MarkdownRenderer from "./MarkdownRenderer";
import IconPicker from "./IconPicker";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import MasonPostViewer from "./MasonPostViewer";

export function WayfinderPostsEditor({ authorId, authorProfileId, handleOpenWayfinderProfile }: { authorId: string, authorProfileId: string, handleOpenWayfinderProfile?: (authorId: string, postId?: string) => void }) {
  const { t } = useLexicon();
  const [posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [targetAudience, setTargetAudience] = useState("All");
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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
          targetAudience === (editingPost.target_audience || "All") &&
          category === (editingPost.category || "Update") &&
          imageUrl === parsedImage &&
          codeSnippet === (editingPost.code_snippet || "") &&
          isPinned === !!editingPost.is_pinned;
      } else {
        isUnchanged = 
          title === "" &&
          content === "" &&
          targetAudience === "All" &&
          category === "Update" &&
          imageUrl === "" &&
          codeSnippet === "" &&
          isPinned === false;
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
          [draftId]: { title, content, targetAudience, category, imageUrl, codeSnippet, isPinned }
        }));
      }
    }
  }, [isEditorOpen, editingPostId, editingPost, title, content, targetAudience, category, imageUrl, codeSnippet, isPinned]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      IconPlugin,
      Image
    ],
    content: content,
    onUpdate: ({ editor }) => {
      setContent((editor.storage as any).markdown.getMarkdown());
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
    
    const { data: profileData } = await supabase.from('profiles').select('username').eq('id', authorId).single();
    if (profileData?.username) setWayfinderName(profileData.username);
    const mName = profileData?.username || '';
    
    const { data: modsData } = await supabase.from('mods').select('id, name').eq('mason_id', authorId);
    const { data: marketAssetsData } = await supabase.from('marketplace_assets').select('id, name, asset_type').eq('author', mName);
    const { data: blueprintsData } = await supabase.from('blueprints').select('id, name').eq('mason_id', authorId);
    
    let combinedAssets: any[] = [];
    if (modsData) combinedAssets.push(...modsData.map(m => ({ id: m.id, name: m.name, type: 'mod' })));
    if (blueprintsData) combinedAssets.push(...blueprintsData.map(b => ({ id: b.id, name: b.name, type: 'blueprint' })));
    if (marketAssetsData) combinedAssets.push(...marketAssetsData.map(a => ({ id: a.id, name: a.name, type: a.asset_type })));
    setAssets(combinedAssets);
  };

  useEffect(() => { fetchPostsAndAssets(); },[]);

  const handleInsertText = (prefix: string, suffix: string = "") => {
    // Legacy fallback, most buttons use editor.chain() now
    if (editor) {
      editor.chain().focus().insertContent(prefix + suffix).run();
    }
  };

  const handleLinkAsset = (asset: any) => {
    const linkStr = `asset://${asset.type}/${asset.id}`;
    
    // Safely fallback if key isn't in lexicon yet
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

  const filteredAssets = assets.filter(a => a.name.toLowerCase().includes(assetSearchQuery.toLowerCase()));

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
      setTargetAudience(draft?.targetAudience ?? (post.target_audience || "All"));
      setCategory(draft?.category ?? (post.category || "Update"));
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
      setTargetAudience(draft?.targetAudience ?? "All");
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
    }
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    // Reset to defaults or selected post
    if (editingPostId) {
       const post = posts.find(p => p.id === editingPostId);
       if (post) {
         setTitle(post.title);
         setContent(post.content);
         setTargetAudience(post.target_audience || 'All');
         setCategory(post.category || 'Update');
       }
    } else {
       setTitle("");
       setContent("");
       setTargetAudience("All");
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
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    let payload: any = { title: title.trim(), message: content.trim(), category: category, target_audience: targetAudience };
    if (imageUrl.trim()) payload.message = `[IMG:${imageUrl.trim()}]\n\n` + payload.message;

    let error = null;
    let newPostId: string | null = null;
    const performSave = async (data: any) => {
      if (editingPostId) {
        const res = await supabase.from('system_broadcasts').update(data).eq('id', editingPostId).select();
        return { error: res.error, data: res.data };
      } else {
        const res = await supabase.from('system_broadcasts').insert([data]).select();
        if (!res.error && res.data && res.data.length > 0) newPostId = res.data[0].id;
        return { error: res.error, data: res.data };
      }
    };
    
    let resObj = await performSave(payload);
    error = resObj.error;

    if (!error) {
      if (!editingPostId && newPostId) {
        // Notify followers
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
          const { data: followers } = await supabase.from('profiles').select("id");
          if (followers && followers.length > 0) {
            const notifications = followers.map(f => ({
              user_id: f.id,
              actor_id: authUser.user!.id,
              type: 'new_post',
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
      useStore.getState().pushStatus(editingPostId ? "Transmission Updated!" : t("mason_post_success"), 'success');
    } else {
      useStore.getState().pushStatus(`Transmission Failed: ${error.message}`, 'error');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('system_broadcasts').delete().eq('id', id);
    fetchPostsAndAssets();
  };
  
  const filteredPosts = posts.filter(p => 
    p.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.message || p.content)?.toLowerCase().includes(searchTerm.toLowerCase())
  );



  return (
    <>
      <div className="flex items-center gap-4 px-6 py-6 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_1%,transparent)]">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_satellite_alt")}</span>
          </div>
          <span className="truncate">{t("wf_title_dispatct")}</span>
        </h2>
        <div className="relative flex-1 max-w-xl ml-auto flex gap-4 items-center justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search")}</span>
            <input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder={t("mason_search_transmissions")} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("ui_icon_close")}</span>
              </button>
            )}
          </div>
          <button 
            onClick={() => openEditor()} 
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group relative"
          >
            {wayfinderDrafts['new'] && (
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-[var(--warning)] border-2 border-[var(--bg)] shadow-md animate-pulse"></span>
            )}
            <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("ui_icon_cell_tower")}</span> {t("mason_post_broadcast")}
          </button>
        </div>     
      </div>

      <div className="p-8 flex flex-col gap-10 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
           {filteredPosts.map(post => {
             const hasUnsavedEdits = !!wayfinderDrafts[post.id];
             return (
             <div key={post.id} className={`theme-glass-panel p-5 rounded-3xl relative group flex flex-col gap-4 transition-all duration-500 hover:-translate-y-1 shadow-lg backdrop-blur-3xl overflow-hidden ${hasUnsavedEdits ? '!border-amber-500/30 text-amber-500 !bg-amber-500/10 hover:!bg-amber-500/20 hover:!border-amber-500/50 shadow-[0_8px_32px_rgba(245,158,11,0.15)]' : post.is_pinned ? '!border-[var(--accent)]/30 !bg-[var(--accent)]/5 shadow-[0_10px_30px_rgba(var(--accent-rgb),0.1)]' : 'border border-white/5 hover:border-white/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]'}`}>
                <div className={`absolute -top-32 -right-32 w-64 h-64 blur-[80px] rounded-full pointer-events-none transition-opacity duration-700 z-0 ${post.is_pinned ? 'bg-[var(--accent)] opacity-20' : 'bg-[var(--text)] opacity-0 group-hover:opacity-[0.03]'}`} />
                {extractPostImage(post) && (
                  <div className="-mx-5 -mt-5 rounded-t-3xl overflow-hidden h-36 bg-black/40 relative border-b border-white/5 shrink-0 z-10">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none" />
                    <img src={extractPostImage(post)} alt={t("auto_cover")} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                  </div>
                )}
                <div className="flex flex-col gap-1 pr-4 z-10">
                  <div className="flex items-center gap-2 mb-1">
                    {post.is_pinned && (
                      <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 backdrop-blur-md">
                        <span className="material-symbols-outlined !text-[10px]">{t("ui_icon_push_pin")}</span>
                        {t("masonhub_pinned")}
                      </span>
                    )}
                    <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                  <h4 className="text-lg font-black text-[var(--text)] uppercase tracking-tighter line-clamp-1">{post.title}</h4>
                </div>
                {hasUnsavedEdits && (
                  <div className="absolute top-6 right-6 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[var(--warning)] bg-[var(--warning)]/20 border border-[var(--warning)]/40 px-3 py-1.5 rounded-full shadow-lg z-20 pointer-events-none backdrop-blur-xl">
                     <span className="material-symbols-outlined !text-[12px]">{t("ui_icon_edit_note")}</span>
                     {t("ph_unsaved_changes") || "UNSAVED EDITS"}
                  </div>
                )}
                <div className="flex-1 relative z-10 -mx-1">
                  <p className="text-[11px] font-mono text-[var(--subtext)] opacity-70 leading-relaxed whitespace-pre-wrap break-words line-clamp-5">
                    {stripMarkdown(post.message || post.content || '').length > 300 ? stripMarkdown(post.message || post.content || '').substring(0, 300) + '...' : stripMarkdown(post.message || post.content || '')}
                  </p>
                </div>
                <div className={`mt-auto pt-4 border-t border-white/5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 relative z-20 ${confirmDelete === post.id ? 'justify-center w-full' : 'justify-end'}`}>
                  {confirmDelete === post.id ? (
                    <>
                      <span className="text-[10px] font-black text-[var(--danger)] uppercase tracking-widest self-center animate-pulse flex items-center gap-1.5 opacity-80 mr-2">
                        <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_warning")}</span> {t("auto_confirm")}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--text)] opacity-60 hover:opacity-100 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("ui_icon_close")}</span> {t("ui_btn_cancel")}</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(post.id); setConfirmDelete(null); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("ui_icon_delete_forever")}</span> {t("ui_btn_delete")}</button>
                    </>
                  ) : (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setPreviewPost(post); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("ui_icon_visibility")}</span> {t("masonhub_btn_view_post")}</button>
                      <button onClick={(e) => { e.stopPropagation(); openEditor(post); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] hover:shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_20%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("ui_icon_edit")}</span> {t("ui_btn_edit")}</button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(post.id); }} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_20%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] transition-all duration-300 flex items-center gap-1.5 group/btn"><span className="material-symbols-outlined !text-[14px]">{t("ui_icon_delete")}</span> {t("ui_btn_delete")}</button>
                    </>
                  )}
                </div>
             </div>
           )})}
          {filteredPosts.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center opacity-30 mt-20">
              <span className="text-[10px] font-black text-[var(--text)] uppercase tracking-[0.2em] text-center px-8 leading-relaxed">
                {t("masonhub_no_transmissions")}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Slide-out Panel for Editing */}
      {isEditorOpen && (
        <>
          <SidePanel
            isOpen={isEditorOpen}
            onClose={closeEditor}
            icon="cell_tower"
            widthClass="w-[800px]"
            title={editingPostId ? (t("masonhub_update_transmission")) : (t("mason_new_transmission"))}
            subtitle={editingPostId ? (t("masonhub_editing_record")) : (t("masonhub_composing_broadcast"))}
            footer={
              <div className="flex justify-center items-center gap-4 w-full">
                {((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) ? (
                   <button onClick={handleDiscardChanges} disabled={isSubmitting} className={standardButtonClass + (confirmDiscard ? " !border-[var(--danger)] !text-[var(--danger)] !bg-[var(--danger)]/20 shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_40%,transparent)]" : " !border-[var(--danger)]/30 !text-[var(--danger)] hover:!border-[var(--danger)]/60 hover:!bg-[var(--danger)]/10")}>
                     {confirmDiscard ? (t("ui_confirm_discard") || "Confirm Discard") : (t("ui_btn_discard_edits") || "DISCARD EDITS")}
                   </button>
                ) : (
                   <button onClick={closeEditor} disabled={isSubmitting} className={standardButtonClass}>{t("ui_btn_cancel")}</button>
                )}
                <div className="relative group/btn flex">
                  <button onClick={handleSubmit} disabled={isSubmitting || !title || !content} className={((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) ? standardAccentGlassButtonClass.replace('bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]', 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]').replace('border-[color-mix(in_srgb,var(--accent)_30%,transparent)]', 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)]').replace('text-[var(--accent)]', 'text-[var(--warning)]').replace('hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]', 'hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]') : standardAccentGlassButtonClass}>
                    {isSubmitting ? t("mason_saving") : (editingPostId ? t("masonhub_update_transmission") : t("mason_btn_post"))}
                  </button>
                  {((editingPostId || 'new') && wayfinderDrafts[editingPostId || 'new']) && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[var(--warning)] whitespace-nowrap bg-[var(--bg)]/90 px-3 py-1.5 rounded-full border border-[var(--warning)]/40 opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg backdrop-blur-xl">
                      <span className="material-symbols-outlined !text-[12px]">{t("auto_warning")}</span>
                      {t("ph_unsaved_changes") || "UNSAVED EDITS"}
                    </div>
                  )}
                </div>
              </div>
            }
          >
            <div className="flex flex-col gap-6">
              
              <div className="flex border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] mb-2 p-1 bg-black/40 rounded-2xl theme-glass-inner">
                <button onClick={() => setViewMode('edit')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'edit' ? 'bg-[var(--accent)]/20 border border-[var(--accent)]/50 text-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] backdrop-blur-md' : 'bg-transparent border border-transparent text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:bg-white/5 hover:opacity-100 backdrop-blur-md'}`}>
                  {t("masonhub_editor")}
                </button>
                <button onClick={() => setViewMode('preview')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'preview' ? 'bg-[var(--accent)]/20 border border-[var(--accent)]/50 text-[var(--accent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] backdrop-blur-md' : 'bg-transparent border border-transparent text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:bg-white/5 hover:opacity-100 backdrop-blur-md'}`}>
                  {t("masonhub_preview")}
                </button>
                
                <label className="ml-4 pr-4 flex items-center gap-2 cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
                  <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="hidden" />
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shadow-inner ${isPinned ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[color-mix(in_srgb,var(--text)_20%,transparent)] bg-black/40'}`}>
                    {isPinned && <span className="material-symbols-outlined !text-[14px] text-[var(--bg)]">{t("ui_icon_check")}</span>}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1"><span className="material-symbols-outlined !text-[16px]">{t("ui_icon_push_pin")}</span> {t("masonhub_pin_transmission")}</span>
                </label>
              </div>

              {viewMode === 'edit' ? (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex gap-4 w-full">
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_post_title")}</label>
                      <input required value={title} onChange={e => setTitle(e.target.value)} placeholder={t("mason_post_title")} className="theme-glass-inner bg-black/40 rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all w-full" />
                    </div>
                    
                    <div className="flex flex-col gap-2 w-1/4">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("wf_target_audience")}</label>
                      <div className="h-14">
                        <CustomDropdown disableTint={true}
                          value={targetAudience}
                          onChange={(v: string[]) => setTargetAudience(v[0])}
                          options={[
                            { id: "All", label: "All Elevated" },
                            { id: "Masons", label: "Masons Only" },
                            { id: "Architects", label: "Architects Only" },
                            { id: "Senior Architects", label: "Oversight Only" },
                            { id: "Wayfinders", label: "Wayfinders Only" },
                          ]}
                          placeholder={t("auto_select_audience")}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 w-1/4">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_category")}</label>
                      <div className="h-14">
                        <CustomDropdown disableTint={true}
                          value={category}
                          onChange={(v: string[]) => setCategory(v[0])}
                          options={[
                            { id: "Update", label: "Update" },
                            { id: "Info", label: "Info" },
                            { id: "Alert", label: "Alert" },
                            { id: "Event", label: "Event" }
                          ]}
                          placeholder={t("auto_select_category")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("masonhub_header_image_placeholder")}</label>
                    <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder={t("masonhub_header_image_placeholder")} className="theme-glass-inner bg-black/40 rounded-xl px-5 h-14 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all" />
                  </div>
                  
                  <div className="flex flex-col gap-2 flex-1 min-h-[400px]">
                    <div className="flex items-center justify-between ml-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("mason_post_content")}</label>
                    </div>
                    <div className="flex flex-col flex-1 theme-glass-inner bg-black/40 rounded-2xl border focus-within:border-[var(--accent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all">
                      <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
                        <div className="relative flex flex-col items-center">
                          <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-[1.25rem] shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] backdrop-blur-2xl pointer-events-auto bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]">
                            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bold') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("auto_format_bold")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('italic') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("auto_format_italic")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("auto_format_h1")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("auto_format_h2")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bulletList') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("auto_format_list_bulleted")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('orderedList') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("auto_format_list_numbered")}</span></button>
                            <button type="button" onClick={() => setShowImageInput(!showImageInput)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${showImageInput ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("auto_image")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('codeBlock') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("auto_code")}</span></button>
                            <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"><span className="material-symbols-outlined !text-[18px]">{t("auto_horizontal_rule")}</span></button>
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
                            placeholder={t("masonhub_image_url_placeholder")} 
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
                            placeholder={t("masonhub_code_snippet_placeholder")}
                            className="w-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-xl text-[var(--text)] p-4 text-xs font-mono placeholder-[var(--subtext)] outline-none h-48 custom-scrollbar focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] focus:border-[var(--accent)]"
                            spellCheck={false}
                          />
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between p-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-b-2xl shrink-0">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setShowCodeInput(!showCodeInput)} className={`px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest flex items-center gap-1.5 ${showCodeInput ? 'theme-bg-accent/20 theme-text-accent' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>
                            <span className="material-symbols-outlined !text-[14px]">{t("auto_data_object")}</span> {showCodeInput ? (t("masonhub_hide_code")) : (t("masonhub_add_code"))}
                          </button>
                          <button type="button" onClick={() => setIsAssetPanelOpen(true)} className="px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 flex items-center gap-1.5">
                            <span className="material-symbols-outlined !text-[14px]">{t("auto_link")}</span> {t("masonhub_link_asset")}
                          </button>
                        </div>
                        <div className="text-[9px] font-black tracking-widest uppercase opacity-40 flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("auto_markdown")}</span> {t("auto_markdown")}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6 mt-4">
                  <h3 className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-2">{t("masonhub_live_preview")}</h3>
                  
                  {imageUrl && (
                    <div className="w-full rounded-2xl overflow-hidden shadow-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-black/20 shrink-0">
                       <img src={imageUrl} className="w-full h-auto object-contain max-h-[400px]" alt={t("auto_post_cover_preview")} />
                    </div>
                  )}

                  <h1 className="text-3xl font-black text-[var(--text)] uppercase tracking-tight">{title || (t("masonhub_untitled"))}</h1>
                  
                  <div className="markdown-body p-6 theme-glass-inner rounded-3xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shadow-inner">
                     {content ? <MarkdownRenderer content={content} onAssetClick={(type: string, id: string) => setActiveAsset({type, id})} /> : <p className="text-[var(--subtext)] opacity-50 italic">{t("masonhub_no_content_preview")}</p>}
                  </div>
                </div>
              )}
            </div>
          </SidePanel>
        </>
      )}

      {/* Asset Linking Sub-Panel */}
      <SidePanel
        isOpen={isAssetPanelOpen}
        onClose={() => setIsAssetPanelOpen(false)}
        title={t("masonhub_link_asset")}
        icon="link"
        backdropZ="z-[50000]"
        panelZ="z-[50001]"
      >
        <div className="flex flex-col gap-6">
          <div className="animate-in slide-in-from-top-2">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search")}</span>
              <input 
                value={assetSearchQuery} 
                onChange={(e) => setAssetSearchQuery(e.target.value)} 
                placeholder={t("masonhub_search_assets")} 
                className="w-full theme-glass-panel rounded-2xl pl-10 pr-5 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 shadow-inner"
                autoFocus
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {filteredAssets.length === 0 && <span className="text-center text-[10px] font-black uppercase tracking-widest opacity-50 p-4">{t("masonhub_no_assets")}</span>}
            {filteredAssets.map(asset => (
              <button key={`${asset.type}-${asset.id}`} type="button" onClick={() => handleLinkAsset(asset)} className="text-left px-5 py-4 rounded-2xl theme-glass-inner hover:theme-border-accent hover:-translate-y-0.5 transition-all flex items-center gap-4 group">
                <span className="material-symbols-outlined opacity-70 text-xl shrink-0 group-hover:scale-110 transition-transform">{asset.type === 'mod' ? (t("ui_icon_extension")) : asset.type === 'blueprint' ? (t("ui_icon_architecture")) : asset.type === 'lexicon' ? (t("ui_icon_translate")) : (t("ui_icon_palette"))}</span>
                <span className="text-sm font-black text-[var(--text)] uppercase tracking-tight truncate w-full group-hover:theme-text-accent transition-colors">{asset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </SidePanel>

      {/* View Post Overlay */}
      {previewPost && (
        <MasonPostViewer 
          post={{ ...previewPost, content: previewPost.message || previewPost.content || '' }} 
          onClose={() => setPreviewPost(null)} 
          userId={authorId}
          onOpenMasonProfile={handleOpenWayfinderProfile}
          onAssetClick={(type: string, id: string) => setActiveAsset({type, id})}
        />
      )}
      
      {activeAsset && <AssetPreviewSidebar assetType={activeAsset.type} assetId={activeAsset.id} onClose={() => setActiveAsset(null)} />}
    </>
  );
}

