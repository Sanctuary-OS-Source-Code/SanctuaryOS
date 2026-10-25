import React, { useState, useEffect, useRef } from 'react';
import { supabaseAuth } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Link from '@tiptap/extension-link';
import {
  SidePanel, ActionButton, PanelHeaderGroup, PanelHeaderButton, HoverTooltip,
  SidePanelHeroCard, SidePanelTitleInput, UniversalGroup, StatBox
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import { logArchitectAction } from "../lib/audit";

interface LegalDoc {
  id: string;
  category: string;
  title: string;
  message: string;
  created_at: string;
}

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

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
    if (category === "EULA") return t("doc_eula", "End User License Agreement");
    if (category === "Privacy") return t("doc_privacy", "Privacy Policy");
    if (category === "Terms") return t("doc_terms", "Terms of Service");
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
      useStore.getState().pushStatus(t("legal_doc_updated", "Legal Document Updated"), 'success');
      await logArchitectAction("Updated Legal Doc", "keeper_system_broadcasts", title, undefined, "Keepers Core", true, {
        title: { to: title },
        category: { to: `Legal_${activeTab}` },
      });
      fetchDocuments();
      closeEditor();
    } else {
      useStore.getState().pushStatus(`Failed to save: ${error.message}`, 'error');
    }
    setIsSaving(false);
  };

  const docDefinitions = [
    { id: 'EULA', label: t("doc_eula", "EULA"), icon: t("icon_gavel", "gavel"), desc: t("desc_eula", "The legal contract between the platform and the end {citizen}.") },
    { id: 'Privacy', label: t("doc_privacy", "Privacy Policy"), icon: t("icon_policy", "policy"), desc: t("desc_privacy", "Outlines how user data is collected, processed, and stored.") },
    { id: 'Terms', label: t("doc_terms", "Terms of Service"), icon: t("icon_description", "description"), desc: t("desc_terms", "The rules and regulations users must agree to in order to use the service.") }
  ];

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: docDefinitions.length.toString(),
    }
  ];

  const [activeTab, setActiveTab] = useState<"overview">("overview");

  const renderDocCard = (def: typeof docDefinitions[0]) => {
    const doc = docs[def.id];
    const lastUpdated = doc ? new Date(doc.created_at).toLocaleDateString() : t("never", "Never");
    return (
      <UniversalCard
        key={def.id}
        layout="vertical"
        title={doc?.title || def.label}
        subtitle={`${t("by_author", "BY")} ${t("author_sanctuary_team", "Sanctuary Foundry")}`}
        icon={def.icon}
        isActive={!!doc}
        onClick={() => openEditor(def.id)}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <span
              className={`${VAULT_CHIP_CLASS} ${
                doc
                  ? "!border-[color-mix(in_srgb,var(--success)_40%,transparent)] !text-[var(--success)]"
                  : "!border-[color-mix(in_srgb,var(--warning)_40%,transparent)] !text-[var(--warning)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[12px]">
                {doc ? t("icon_check_circle", "check_circle") : t("icon_pending", "pending")}
              </span>
              <span>{doc ? t("status_active", "Published") : t("pending", "Draft")}</span>
            </span>
          </div>
        }
        badges={
          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {def.icon}
            </span>
            <span>{def.label}</span>
          </span>
        }
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-wider truncate">
              {`${t("updated_date", "Last Updated")}: ${lastUpdated}`}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1 shrink-0">
              {t("edit", "Edit")}
              <span className="material-symbols-outlined !text-[12px]">
                {t("icon_arrow_forward", "arrow_forward")}
              </span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
          {def.desc}
        </p>
      </UniversalCard>
    );
  };

  const renderLanding = () => {
    const pendingDocs = docDefinitions.filter(def => !docs[def.id]);
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_gavel", "gavel")}
          iconColorClass="text-[var(--accent)]"
          title={t("hub_legal_docs", "Legal Documents")}
          isEmpty={docDefinitions.length === 0}
          emptyIcon={t("icon_gavel", "gavel")}
          emptyTitle={t("no_legal_docs", "No Legal Documents")}
        >
          {docDefinitions.slice(0, 4).map(renderDocCard)}
        </HubOverviewSection>

        <HubOverviewSection
          icon={t("icon_warning", "warning")}
          iconColorClass="text-[var(--warning)]"
          title={t("pending_legal_docs", "Unconfigured / Draft Policies")}
          isEmpty={pendingDocs.length === 0}
          emptyIcon={t("icon_check_circle", "check_circle")}
          emptyTitle={t("no_issues", "All policies published")}
        >
          {pendingDocs.slice(0, 4).map(renderDocCard)}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const activeDoc = activeCategory ? docs[activeCategory] : null;
  const activeDef = docDefinitions.find(d => d.id === activeCategory);

  return (
    <ElevatedHubLayout
      headerTitle={t("hub_legal_docs", "Legal Documents")}
      headerSubtitle={t("hub_legal_docs_subtitle", "Manage system-wide agreements and policies")}
      headerIcon={t("icon_gavel", "gavel")}
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
        icon={t("icon_gavel", "gavel")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] max-w-[900px]"
        title={`${t("editing_doc", "Editing")} ${activeCategory || ""}`}
        subtitle={t("markdown_supported", "Markdown is supported")}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={isSaving ? t("btn_saving", "Saving...") : t("save", "Save Changes")}
              onClick={handleSave}
              disabled={isSaving || !content.trim()}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <SidePanelHeroCard
            icon={activeDef?.icon || t("icon_gavel", "gavel")}
            overline={t("hub_legal_docs", "Legal Documents")}
            title={`${t("editing_doc", "Editing")} ${activeDef?.label || activeCategory || ""}`}
            description={activeDef?.desc || t("markdown_supported", "Manage system-wide agreements and policies. Markdown formatting is supported.")}
            badge={activeDoc ? t("status_active", "Published") : t("pending", "Draft")}
            variant={activeDoc ? "success" : "warning"}
          >
            <div className="grid grid-cols-2 gap-3 w-full">
              <StatBox
                label={t("category", "Policy Category")}
                value={activeCategory || "EULA"}
                icon={activeDef?.icon || t("icon_gavel", "gavel")}
              />
              <StatBox
                label={t("updated_date", "Last Updated")}
                value={activeDoc ? new Date(activeDoc.created_at).toLocaleDateString() : t("never", "Never")}
                icon={t("icon_schedule", "schedule")}
              />
            </div>
          </SidePanelHeroCard>

          <SidePanelTitleInput
            label={t("post_title", "Document Title")}
            value={docTitle}
            onChange={setDocTitle}
            placeholder={t("post_title", "Document Title")}
          />

          <UniversalGroup title={t("post_content", "{Dispatch} Body...")} icon={t("icon_edit_document", "edit_document")}>
            <div className="flex-1 glass-surface !overflow-visible rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col relative min-h-[450px] w-full">
              <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
                <div className="relative flex flex-col items-center pointer-events-auto w-fit">
                  <div className="glass-panel portal-glass-fix backdrop-blur-[var(--glassBlur)] flex flex-wrap items-center gap-1 p-1.5 !rounded-[1.25rem] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[0_14px_34px_rgba(0,0,0,0.45)]">
                    <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bold') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_bold", "format_bold")}</span></button><HoverTooltip title={t("editor_tt_bold", "Bold")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                    <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('italic') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_italic", "format_italic")}</span></button><HoverTooltip title={t("editor_tt_italic", "Italic")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                    <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h1", "format_h1")}</span></button><HoverTooltip title={t("editor_tt_h1", "Heading 1")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                    <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_h2", "format_h2")}</span></button><HoverTooltip title={t("editor_tt_h2", "Heading 2")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                    <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('bulletList') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_bulleted", "format_list_bulleted")}</span></button><HoverTooltip title={t("editor_tt_bullets", "Bullet List")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                    <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${editor?.isActive('orderedList') ? 'bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner' : 'text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}><span className="material-symbols-outlined !text-[18px]">{t("icon_format_list_numbered", "format_list_numbered")}</span></button><HoverTooltip title={t("editor_tt_numbers", "Numbered List")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                    <div className="relative group/btn flex"><button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"><span className="material-symbols-outlined !text-[18px]">{t("icon_horizontal_rule", "horizontal_rule")}</span></button><HoverTooltip title={t("editor_tt_hr", "Horizontal Line")} variant="info" className="group-hover/btn:flex z-[100]" /></div>
                  </div>
                </div>
              </div>
              <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}
