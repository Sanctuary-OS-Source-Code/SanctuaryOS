import React, { useState, useEffect, useRef } from 'react';
import { supabaseAuth } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Link from '@tiptap/extension-link';
import { SidePanel, ActionButton, PanelHeaderGroup, PanelHeaderButton, HoverTooltip } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from "../components/layouts/ElevatedHubLayout";
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
  const [docTitle, setDocTitle] = useState("");
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

  const getDefaultTitle = (category: string) => {
    if (category === "EULA") return "End User License Agreement";
    if (category === "Privacy") return "Privacy Policy";
    if (category === "Terms") return "Terms of Service";
    return category;
  };

  const openEditor = (category: string) => {
    setActiveCategory(category);
    const existingDoc = docs[category];
    setDocTitle(existingDoc?.title || getDefaultTitle(category));
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
    setDocTitle("");
    setContent("");
    if (editor) editor.commands.setContent("");
  };

  const handleSave = async () => {
    if (!activeCategory || !content.trim()) return;
    setIsSaving(true);
    
    const title = docTitle.trim() || getDefaultTitle(activeCategory);

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

    const { error } = await supabaseAuth
      .from('keeper_system_broadcasts')
      .upsert(payload)
      .select();

    if (!error) {
      useStore.getState().pushStatus(t("legal_doc_updated") || "Legal Document Updated", 'success');
      await logArchitectAction("Updated Legal Doc", "keeper_system_broadcasts", title, undefined, "Keepers Core");
      fetchDocuments();
      closeEditor();
    } else {
      useStore.getState().pushStatus(`Failed to save: ${error.message}`, 'error');
    }
    setIsSaving(false);
  };

  const docDefinitions = [
    { id: 'EULA', label: t("doc_eula") || 'EULA', icon: 'gavel', desc: t("desc_eula") || 'The legal contract between Sanctuary OS and the end user.' },
    { id: 'Privacy', label: t("doc_privacy") || 'Privacy Policy', icon: 'policy', desc: t("desc_privacy") || 'Outlines how user data is collected, processed, and stored.' },
    { id: 'Terms', label: t("doc_terms") || 'Terms of Service', icon: 'description', desc: t("desc_terms") || 'The rules and regulations users must agree to in order to use the service.' }
  ];

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: docDefinitions.length.toString(),
    }
  ];

  const [activeTab, setActiveTab] = useState<"overview">("overview");

  const renderDocCard = (def: typeof docDefinitions[0]) => {
    const doc = docs[def.id];
    const lastUpdated = doc ? new Date(doc.created_at).toLocaleDateString() : (t("never") || 'Never');
    return (
      <UniversalCard
        key={def.id}
        title={doc?.title || def.label}
        subtitle={`${t("last_updated") || "Last Updated"}: ${lastUpdated}`}
        icon={def.icon}
        isActive={!!doc}
        onClick={() => openEditor(def.id)}
        badges={[
          <span
            key="status"
            className={`px-3 py-1 rounded-lg text-[9px] font-black tracking-widest capitalize border ${
              doc
                ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_20%,transparent)]'
                : 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]'
            }`}
          >
            {doc ? (t("status_active") || "Published") : (t("status_tag_pending") || "Draft")}
          </span>
        ]}
      >
        <div className="text-sm opacity-70 leading-relaxed mt-2">
          {def.desc}
        </div>
      </UniversalCard>
    );
  };

  const renderLanding = () => {
    const pendingDocs = docDefinitions.filter(def => !docs[def.id]);
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon="gavel"
          iconColorClass="text-[var(--accent)]"
          title={t("legal_documents") || "Legal Documents"}
          isEmpty={docDefinitions.length === 0}
          emptyIcon="gavel"
          emptyTitle={t("no_legal_docs") || "No Legal Documents"}
        >
          {docDefinitions.slice(0, 4).map(renderDocCard)}
        </HubOverviewSection>

        <HubOverviewSection
          icon="warning"
          iconColorClass="text-[var(--warning)]"
          title={t("pending_legal_docs") || "Unconfigured / Draft Policies"}
          isEmpty={pendingDocs.length === 0}
          emptyIcon="check_circle"
          emptyTitle={t("no_issues") || "All policies published"}
        >
          {pendingDocs.slice(0, 4).map(renderDocCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("hub_legal_docs") || "Legal Documents"}
      headerSubtitle={t("hub_legal_docs_subtitle") || "Manage system-wide agreements and policies"}
      headerIcon="gavel"
      headerIconColorClass="text-[var(--accent)]"
      hideSearch={activeTab === 'overview'}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
    >
      {activeTab === 'overview' && renderLanding()}

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
              tooltip={isSaving ? (t("btn_saving") || "Saving...") : (t("btn_save_changes") || "Save Changes")}
              onClick={handleSave}
              disabled={isSaving || !content.trim()}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="h-full flex flex-col gap-6 overflow-hidden">
          <SidePanelTitleInput
            value={docTitle}
            onChange={setDocTitle}
            placeholder={t("post_title") || "Document Title"}
          />

          <div className="flex-1 glass-surface !overflow-visible rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col relative">
            <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
              <div className="relative flex flex-col items-center pointer-events-auto w-fit">
                <div className="glass-panel portal-glass-fix backdrop-blur-[var(--glassBlur)] flex flex-wrap items-center gap-1 p-1.5 !rounded-[1.25rem] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[0_14px_34px_rgba(0,0,0,0.45)]">
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bold') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_bold") || "format_bold"}</span></button><HoverTooltip title={t("editor_tt_bold") || "Bold"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('italic') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_italic") || "format_italic"}</span></button><HoverTooltip title={t("editor_tt_italic") || "Italic"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h1") || "format_h1"}</span></button><HoverTooltip title={t("editor_tt_h1") || "Heading 1"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h2") || "format_h2"}</span></button><HoverTooltip title={t("editor_tt_h2") || "Heading 2"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bulletList') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_bulleted") || "format_list_bulleted"}</span></button><HoverTooltip title={t("editor_tt_bullets") || "Bullet List"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('orderedList') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_numbered") || "format_list_numbered"}</span></button><HoverTooltip title={t("editor_tt_numbers") || "Numbered List"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"><span className="material-symbols-outlined !text-[18px]">{t("icon_horizontal_rule") || "horizontal_rule"}</span></button><HoverTooltip title={t("editor_tt_hr") || "Horizontal Line"} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                </div>
              </div>
            </div>
            <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
          </div>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}

