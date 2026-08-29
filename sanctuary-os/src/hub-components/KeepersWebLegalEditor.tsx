import React, { useState, useEffect, useRef } from 'react';
import { supabaseAuth } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Link from '@tiptap/extension-link';
import { SidePanel, ScreenUtilityBar, ActionButton, PanelHeaderGroup, PanelHeaderButton, HoverTooltip } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { logArchitectAction } from "../lib/audit";

interface LegalDoc {
  id: string;
  category: string;
  title: string;
  message: string;
  created_at: string;
}

export default function KeepersWebLegalEditor() {
  const { t } = useLexicon();
  const [docs, setDocs] = useState<Record<string, LegalDoc | null>>({
    'EULA': null,
    'Privacy': null,
    'Terms': null
  });
  const [isLoading, setIsLoading] = useState(true);

  // Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const updateTimeoutRef = useRef<any>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Link.configure({ openOnClick: false }),
    ],
    content: "",
    onUpdate: ({ editor }) => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        setContent((editor.storage as any).markdown.getMarkdown());
      }, 300);
    },
    editorProps: {
      attributes: {
        class: 'w-full flex-1 px-6 py-6 text-[var(--text)] text-sm font-sans focus:outline-none custom-scrollbar min-h-[400px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-[var(--accent)] [&_hr]:border-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_hr]:my-8',
      },
    },
  });

  const fetchDocuments = async () => {
    setIsLoading(true);
    const { data } = await supabaseAuth
      .from('keeper_system_broadcasts')
      .select('*')
      .in('category', ['EULA', 'Privacy', 'Terms'])
      .order('created_at', { ascending: false });

    if (data) {
      const latestDocs: Record<string, LegalDoc> = {};
      // Since it's ordered by created_at descending, the first one we see for a category is the latest
      data.forEach((doc: any) => {
        if (!latestDocs[doc.category]) {
          latestDocs[doc.category] = doc;
        }
      });
      setDocs(prev => ({ ...prev, ...latestDocs }));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const openEditor = (category: string) => {
    setActiveCategory(category);
    const existingDoc = docs[category];
    const text = existingDoc ? existingDoc.message : "";
    setContent(text);
    if (editor) {
      editor.commands.setContent(text);
    }
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setActiveCategory(null);
    setContent("");
    if (editor) editor.commands.setContent("");
  };

  const handleSave = async () => {
    if (!activeCategory || !content.trim()) return;
    setIsSaving(true);
    
    let title = activeCategory;
    if (activeCategory === "EULA") title = "End User License Agreement";
    if (activeCategory === "Privacy") title = "Privacy Policy";
    if (activeCategory === "Terms") title = "Terms of Service";

    const existingDoc = docs[activeCategory];
    const payload: any = {
      title,
      message: content.trim(),
      category: activeCategory,
      target_audience: 'Public',
      is_active: true
    };

    if (existingDoc) {
      payload.id = existingDoc.id;
    }

    const { data, error } = await supabaseAuth
      .from('keeper_system_broadcasts')
      .upsert(payload)
      .select();

    if (!error) {
      useStore.getState().pushStatus("Legal Document Updated", 'success');
      await logArchitectAction("Updated Legal Doc", "keeper_system_broadcasts", title, undefined, "Keepers Core");
      fetchDocuments();
      closeEditor();
    } else {
      useStore.getState().pushStatus(`Failed to save: ${error.message}`, 'error');
    }
    setIsSaving(false);
  };

  const docDefinitions = [
    { id: 'EULA', label: 'EULA', icon: 'gavel', desc: t("desc_eula") || 'The legal contract between Sanctuary OS and the end user.' },
    { id: 'Privacy', label: 'Privacy Policy', icon: 'policy', desc: t("desc_privacy") || 'Outlines how user data is collected, processed, and stored.' },
    { id: 'Terms', label: 'Terms of Service', icon: 'description', desc: t("desc_terms") || 'The rules and regulations users must agree to in order to use the service.' }
  ];

  return (
    <div className="h-full flex flex-col w-full relative">
      <ScreenUtilityBar
        search={""}
        onSearchChange={() => {}}
        searchPlaceholder={t("search_legal_docs") || "Legal documents are fixed categories..."}
        className="!mb-0 !border-0 !pb-0"
      />

      <div className="p-8 flex flex-col gap-10 pb-32 overflow-y-auto custom-scrollbar flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {docDefinitions.map(def => {
            const doc = docs[def.id];
            const lastUpdated = doc ? new Date(doc.created_at).toLocaleDateString() : 'Never';
            return (
              <UniversalCard
                key={def.id}
                title={def.label}
                subtitle={`Last Updated: ${lastUpdated}`}
                icon={def.icon}
                isActive={!!doc}
                onClick={() => openEditor(def.id)}
              >
                  <div className="text-sm opacity-70 leading-relaxed mt-2">
                    {def.desc}
                  </div>
              </UniversalCard>
            );
          })}
        </div>
      </div>

      <SidePanel
        isOpen={isEditorOpen}
        onClose={closeEditor}
        icon="gavel"
        widthClass="w-[90vw] max-w-[900px]"
        title={`${t("editing_doc") || "Editing"} ${activeCategory}`}
        subtitle={t("markdown_supported") || "Markdown is supported"}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="save"
              label={isSaving ? (t("btn_saving") || "Saving...") : (t("btn_save_changes") || "Save Changes")}
              onClick={handleSave}
              disabled={isSaving || !content.trim()}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="h-full flex flex-col p-6 overflow-hidden">
          <div className="flex-1 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] overflow-hidden flex flex-col relative">
            <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
              <div className="relative flex flex-col items-center pointer-events-auto w-fit">
                <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-[1.25rem] shadow-xl backdrop-blur-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]" style={{ backgroundColor: 'color-mix(in srgb, color-mix(in srgb, var(--text) 5%, var(--bg)) 85%, transparent)' }}>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bold') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_bold") || "format_bold"}</span></button><HoverTooltip title={t("editor_tt_bold") || "Bold"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('italic') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_italic") || "format_italic"}</span></button><HoverTooltip title={t("editor_tt_italic") || "Italic"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h1") || "format_h1"}</span></button><HoverTooltip title={t("editor_tt_h1") || "Heading 1"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h2") || "format_h2"}</span></button><HoverTooltip title={t("editor_tt_h2") || "Heading 2"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bulletList') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_bulleted") || "format_list_bulleted"}</span></button><HoverTooltip title={t("editor_tt_bullets") || "Bullet List"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('orderedList') ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_numbered") || "format_list_numbered"}</span></button><HoverTooltip title={t("editor_tt_numbers") || "Numbered List"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"><span className="material-symbols-outlined !text-[18px]">{t("icon_horizontal_rule") || "horizontal_rule"}</span></button><HoverTooltip title={t("editor_tt_hr") || "Horizontal Line"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                </div>
              </div>
            </div>
            <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
