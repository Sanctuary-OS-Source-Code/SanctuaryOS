import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { IconPlugin } from "../IconPlugin";
import {
  SidePanel,
  CustomDropdown,
  HoverTooltip,
  EmptyState,
  extractPostImage,
  stripMarkdown,
  PanelHeaderGroup,
  PanelHeaderButton,
  LinkAssetSidePanel,
  DashboardStatTile,
  ActionButton,
  UniversalGroup,
} from "../shared";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
} from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import IconPicker from "../IconPicker";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import {
  ReleaseNotesShowcase,
  renderCleanInlineText,
  LegalDocVersionInfoBlock,
} from "../components/ReleaseNotesShowcase";
import {
  UnifiedPostBodyEditor,
  PostAttachmentsManager,
  PostEditorModeTiles,
} from "../components/universal/UnifiedPostEditor";
import { logArchitectAction } from "../lib/audit";
import {
  extractDispatchMetadata,
  DispatchPollData,
} from "../components/universal/DispatchPollAndMeta";
import {
  CANONICAL_DIRECTIVES,
  CANONICAL_LEGAL_DOCS,
  LEGAL_DOC_CATEGORIES,
  LegalDocCategory,
  DirectiveSlug,
  syncDirectivesBidirectional,
  syncLegalAndCovenantsBidirectional,
  saveDirectiveBothWays,
  saveLegalDocBothWays,
  pushCodebaseDirectivesToKeepersCore,
  pullKeepersCoreDirectivesToCodebase,
  readLocalDirectiveSnapshots,
} from "../utils/directivesSync";
import {
  CURRENT_DIRECTIVE_SCHEMA_VERSION,
  DirectiveBuilderSchema,
  DirectiveBuilderCard,
  DirectiveBuilderSubCard,
  extractDirectiveBuilderSchema,
  parseMarkdownToDirectiveSchema,
  stripDirectiveBuilderComment,
  embedDirectiveBuilderSchema,
  compileDirectiveSchemaToMarkdown,
  getDefaultDirectiveBuilderSchema,
} from "../utils/directivesBuilderSchema";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

const CATEGORY_TO_SLUG: Record<string, DirectiveSlug> = {
  "Citizen Guide": "citizen_guide",
  "Forking Guide": "forking_guide",
  "Phase Roadmap": "phase_roadmap",
  "Master Architecture": "master_architecture",
  "Master Protocol List": "master_protocols",
};

const SLUG_ICON_MAP: Record<DirectiveSlug, { key: string; fallback: string }> = {
  citizen_guide: { key: "icon_school", fallback: "school" },
  phase_roadmap: { key: "icon_timeline", fallback: "timeline" },
  forking_guide: { key: "icon_call_split", fallback: "call_split" },
  master_architecture: { key: "icon_architecture", fallback: "architecture" },
  master_protocols: { key: "icon_verified_user", fallback: "verified_user" },
};

const NEWS_CATEGORIES = [
  "Announcement",
  "Blog",
  "Press",
  "Update",
  "Maintenance",
];

const LEGAL_CATEGORIES: string[] = [...LEGAL_DOC_CATEGORIES];

type EditorRecordKind = "directive" | "news" | "legal";
type EditorViewMode = "visual" | "wysiwyg" | "markdown";

export default function KeepersWebDirectivesEditor({
  isSidePanel = false,
  initialTab,
}: {
  isSidePanel?: boolean;
  initialTab?: "overview" | "news" | "directives" | "legal";
} = {}) {
  const session = useStore((state) => state.session);
  const currentUserId = session?.user?.id;
  const { t } = useLexicon();

  const [directivePosts, setDirectivePosts] = useState<any[]>([]);
  const [newsPosts, setNewsPosts] = useState<any[]>([]);
  const [legalDocsMap, setLegalDocsMap] = useState<Record<string, any>>({
    EULA: null,
    Privacy: null,
    Terms: null,
    PartnersAgreement: null,
    ComplianceProtocol: null,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState<string[]>(["Public"]);
  const [category, setCategory] = useState("Citizen Guide");
  const [actionRequired, setActionRequired] = useState("No Action Required");
  const [pollData, setPollData] = useState<DispatchPollData | null>(null);
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [editingRecordKind, setEditingRecordKind] =
    useState<EditorRecordKind>("directive");
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [codeSnippet, setCodeSnippet] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [, setShowImageInput] = useState(false);
  const [, setShowIconPicker] = useState(false);
  const [, setWayfinderName] = useState<string>("");
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [activeAsset, setActiveAsset] = useState<{
    type: string;
    id: string;
  } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [filterCategory, setFilterCategory] = useState("All");
  const [activeViewTab, setActiveViewTab] = useState<
    "overview" | "news" | "directives" | "legal"
  >(initialTab || "overview");

  useEffect(() => {
    if (initialTab) {
      setActiveViewTab(initialTab);
    }
  }, [initialTab]);

  // 3-Mode Editor State: "visual" (Card Builder) | "wysiwyg" (TipTap Rich Text) | "markdown" (Raw .md Textarea)
  const [editorMode, setEditorMode] = useState<EditorViewMode>("visual");
  const [builderSchema, setBuilderSchema] =
    useState<DirectiveBuilderSchema | null>(null);
  const [activeBuilderTabIdx, setActiveBuilderTabIdx] = useState<number>(0);
  const [selectedBuilderCardIdx, setSelectedBuilderCardIdx] =
    useState<number>(0);
  const [editingSubCardIdx, setEditingSubCardIdx] = useState<number | null>(
    null
  );
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [iconPickerTarget, setIconPickerTarget] = useState<
    | { type: "card"; tabIdx: number; cardIdx: number }
    | { type: "subcard"; tabIdx: number; cardIdx: number; subIdx: number }
    | null
  >(null);

  const wayfinderDrafts = useStore((state) => state.wayfinderDrafts);
  const setWayfinderDrafts = useStore((state) => state.setWayfinderDrafts);

  const isStaleCanonicalDraft = (key: string, draftObj: any): boolean => {
    if (!CANONICAL_DIRECTIVES[key as DirectiveSlug]) return false;
    if (!draftObj?.isDirty || !draftObj?.userModified) return true;
    const schemaVer = Number(draftObj?.builderSchema?._schemaVersion || 0);
    if (schemaVer < CURRENT_DIRECTIVE_SCHEMA_VERSION) return true;
    if (
      key === "phase_roadmap" &&
      ((draftObj?.builderSchema?.tabs?.length || 0) !== 1 ||
        (draftObj?.builderSchema?.tabs?.[0]?.cards?.[0]?.subCards?.length || 0) < 14)
    ) {
      return true;
    }
    const serialized = JSON.stringify(draftObj?.builderSchema || "");
    if (
      serialized.includes("[sd_") ||
      serialized.includes("Phase 12 → Phase 1") ||
      (key === "phase_roadmap" &&
        !serialized.includes("External Mod Manager Migration"))
    ) {
      return true;
    }
    return false;
  };

  // Clean up any stale or auto-triggered canonical drafts
  useEffect(() => {
    setWayfinderDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (isStaleCanonicalDraft(k, next[k])) {
          delete next[k];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const activeCanonicalSlug: DirectiveSlug | null = useMemo(() => {
    if (editingRecordKind !== "directive") return null;
    if (
      editingPost?.slug &&
      Boolean(CANONICAL_DIRECTIVES[editingPost.slug as DirectiveSlug])
    ) {
      return editingPost.slug as DirectiveSlug;
    }
    return CATEGORY_TO_SLUG[category] || null;
  }, [editingPost, category, editingRecordKind]);

  const activeCanonicalMeta = useMemo(() => {
    if (!activeCanonicalSlug) return null;
    return CANONICAL_DIRECTIVES[activeCanonicalSlug] || null;
  }, [activeCanonicalSlug]);

  useEffect(() => {
    if (!isEditorOpen) return;
    const draftId = editingPostId || "new";

    if (!isDirty) {
      setWayfinderDrafts((prev) => {
        if (!prev[draftId]) return prev;
        const next = { ...prev };
        delete next[draftId];
        return next;
      });
      return;
    }

    setWayfinderDrafts((prev) => ({
      ...prev,
      [draftId]: {
        title,
        description,
        content,
        targetAudience,
        category,
        actionRequired,
        pollData,
        imageUrl,
        codeSnippet,
        isActive,
        builderSchema,
        isDirty: true,
        userModified: true,
      },
    }));
  }, [
    isEditorOpen,
    isDirty,
    editingPostId,
    title,
    description,
    content,
    targetAudience,
    category,
    actionRequired,
    pollData,
    imageUrl,
    codeSnippet,
    isActive,
    builderSchema,
  ]);

  const updateTimeoutRef = useRef<any>(null);
  const suppressEditorUpdateRef = useRef<boolean>(false);

  const editor = useEditor({
    extensions: [StarterKit, Markdown, IconPlugin, Image, Link],
    content: content,
    onUpdate: ({ editor }) => {
      if (suppressEditorUpdateRef.current) return;
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        if (suppressEditorUpdateRef.current) return;
        const md = stripDirectiveBuilderComment(
          (editor.storage as any).markdown.getMarkdown()
        );
        setContent(md);
        setIsDirty(true);
      }, 350);
    },
    editorProps: {
      attributes: {
        class:
          "w-full flex-1 px-6 py-6 text-[var(--text)] text-sm font-sans focus:outline-none custom-scrollbar min-h-[380px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-[var(--accent)] [&_img]:rounded-xl [&_img]:max-w-full [&_code]:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_code]:px-1 [&_code]:rounded [&_hr]:border-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_hr]:my-8",
      },
    },
  });

  const setEditorContentSilently = (nextMarkdown: string) => {
    if (!editor) return;
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    suppressEditorUpdateRef.current = true;
    editor.commands.setContent(nextMarkdown, { emitUpdate: false });
    setTimeout(() => {
      suppressEditorUpdateRef.current = false;
    }, 450);
  };

  const switchEditorMode = (nextMode: EditorViewMode) => {
    if (nextMode === editorMode) return;

    if (editorMode === "visual" && builderSchema) {
      const syncedSchema: DirectiveBuilderSchema = {
        ...builderSchema,
        title: title.trim() || builderSchema.title,
        summary: description.trim() || builderSchema.summary,
      };
      const compiled = compileDirectiveSchemaToMarkdown(syncedSchema);
      setContent(compiled);
      setEditorContentSilently(compiled);
    } else if (editorMode === "wysiwyg" && editor) {
      const md = stripDirectiveBuilderComment(
        (editor.storage as any).markdown.getMarkdown()
      );
      setContent(md);
      if (nextMode === "visual" && activeCanonicalSlug) {
        const parsed = parseMarkdownToDirectiveSchema(md, activeCanonicalSlug, t);
        if (parsed) {
          setBuilderSchema({
            ...parsed,
            title: title.trim() || parsed.title,
            summary: description.trim() || parsed.summary,
            isActive,
          });
        }
      }
    } else if (editorMode === "markdown") {
      if (editor && nextMode === "wysiwyg") {
        setEditorContentSilently(stripDirectiveBuilderComment(content));
      } else if (nextMode === "visual" && activeCanonicalSlug) {
        const parsed = parseMarkdownToDirectiveSchema(
          stripDirectiveBuilderComment(content),
          activeCanonicalSlug,
          t
        );
        if (parsed) {
          setBuilderSchema({
            ...parsed,
            title: title.trim() || parsed.title,
            summary: description.trim() || parsed.summary,
            isActive,
          });
        }
      }
    }

    setEditorMode(nextMode);
  };

  const clearCanonicalDirectiveDrafts = () => {
    setWayfinderDrafts((prev) => {
      const next = { ...prev };
      Object.keys(CANONICAL_DIRECTIVES).forEach((slug) => {
        delete next[slug];
      });
      return next;
    });
  };

  const fetchPostsAndAssets = async (refreshOpenDirective = false) => {
    setIsSyncing(true);
    try {
      // 1. Canonical Directives + Directive Broadcasts
      const syncedList = await syncDirectivesBidirectional({
        canWriteHub: true,
      });

      const canonicalCards = syncedList.map((rec) => {
        const extracted = extractDirectiveBuilderSchema(
          rec.content,
          rec.slug,
          t
        );
        return {
          id: rec.slug,
          slug: rec.slug,
          record_kind: "directive" as EditorRecordKind,
          is_canonical_directive: true,
          file_name: rec.file_path,
          version_tag: rec.version,
          title: extracted?.title || rec.title,
          description: extracted?.summary || rec.summary,
          content: rec.content,
          message: rec.content,
          category: rec.category,
          target_audience: "Public",
          action_required: "No Action Required",
          is_active: extracted?.isActive !== false,
          is_pinned: false,
          created_at: rec.updated_at || new Date().toISOString(),
          updated_at: rec.updated_at || new Date().toISOString(),
          mason_id: "system",
          masons: {
            name: "Sanctuary Foundry",
          },
        };
      });

      setDirectivePosts(canonicalCards);

      if (refreshOpenDirective && isEditorOpen && activeCanonicalSlug) {
        const updatedCard = canonicalCards.find(
          (c) => c.slug === activeCanonicalSlug
        );
        if (updatedCard) {
          const freshSchema =
            extractDirectiveBuilderSchema(
              updatedCard.content,
              activeCanonicalSlug,
              t
            ) || getDefaultDirectiveBuilderSchema(activeCanonicalSlug, t);
          const cleanMd = stripDirectiveBuilderComment(updatedCard.content);
          setIsDirty(false);
          setEditingPost(updatedCard);
          setTitle(updatedCard.title || freshSchema.title);
          setDescription(updatedCard.description || freshSchema.summary);
          setContent(cleanMd);
          setEditorContentSilently(cleanMd);
          setBuilderSchema({
            ...freshSchema,
            title: updatedCard.title || freshSchema.title,
            summary: updatedCard.description || freshSchema.summary,
            isActive: updatedCard.is_active !== false,
          });
        }
      }

      // 2. Website News Posts (Announcement, Blog, Press, Update, Maintenance)
      const { data: newsData } = await supabaseAuth
        .from("system_broadcasts")
        .select("*")
        .in("category", NEWS_CATEGORIES)
        .ilike("target_audience", "%Public%")
        .order("created_at", { ascending: false });

      if (newsData) {
        setNewsPosts(
          newsData.map((post: any) => ({
            ...post,
            record_kind: "news" as EditorRecordKind,
            mason_id: post.mason_id || "system",
            masons: {
              ...post.masons,
              name: "Sanctuary Foundry",
            },
          }))
        );
      }

      // 3. Legal & Sovereign Covenant Documents (EULA, Privacy, Terms, PartnersAgreement, ComplianceProtocol)
      const syncedLegalMap = await syncLegalAndCovenantsBidirectional({
        canWriteHub: true,
      });
      const latestLegal: Record<string, any> = {
        EULA: null,
        Privacy: null,
        Terms: null,
        PartnersAgreement: null,
        ComplianceProtocol: null,
      };
      for (const legalCat of LEGAL_DOC_CATEGORIES) {
        const rec = syncedLegalMap[legalCat];
        if (rec) {
          latestLegal[legalCat] = {
            id: rec.id,
            title: rec.title,
            message: rec.content,
            category: rec.category,
            file_name: rec.file_path,
            created_at: rec.updated_at,
            updated_at: rec.updated_at,
            is_active: true,
            record_kind: "legal" as EditorRecordKind,
          };
        }
      }
      setLegalDocsMap(latestLegal);

      if (currentUserId) {
        if (currentUserId === "system") {
          setWayfinderName("SYSTEM");
        } else {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", currentUserId)
            .maybeSingle();
          if (profileData?.username) setWayfinderName(profileData.username);
        }
      }
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchPostsAndAssets(!isDirty);
    const onRefresh = () => {
      if (!isDirty) {
        fetchPostsAndAssets(true);
      }
    };
    window.addEventListener("sanctuary_directives_updated", onRefresh);
    window.addEventListener("focus", onRefresh);
    return () => {
      window.removeEventListener("sanctuary_directives_updated", onRefresh);
      window.removeEventListener("focus", onRefresh);
    };
  }, [CURRENT_DIRECTIVE_SCHEMA_VERSION]);

  useEffect(() => {
    if (
      isEditorOpen &&
      activeCanonicalSlug === "phase_roadmap" &&
      builderSchema &&
      ((builderSchema.tabs?.length || 0) !== 1 ||
        (builderSchema.tabs?.[0]?.cards?.[0]?.subCards?.length || 0) < 14)
    ) {
      const freshSchema = getDefaultDirectiveBuilderSchema("phase_roadmap", t);
      setBuilderSchema(freshSchema);
      setActiveBuilderTabIdx(0);
    }
  }, [isEditorOpen, activeCanonicalSlug, builderSchema, CURRENT_DIRECTIVE_SCHEMA_VERSION]);

  const handleTwoWaySync = async () => {
    setIsSyncing(true);
    try {
      clearCanonicalDirectiveDrafts();
      await fetchPostsAndAssets(true);
      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_sync_toast_synced",
            "Directives & Covenants synchronized between Keepers Core & Codebase (.md)!"
          ),
          "success"
        );
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePushCodebaseToHub = async () => {
    setIsSyncing(true);
    try {
      clearCanonicalDirectiveDrafts();
      await pushCodebaseDirectivesToKeepersCore(
        currentUserId || "Keepers Core"
      );
      await fetchPostsAndAssets(true);
      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_sync_toast_pushed",
            "Pushed all 10 local .md files to Keepers Core!"
          ),
          "success"
        );
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullHubToCodebase = async () => {
    setIsSyncing(true);
    try {
      clearCanonicalDirectiveDrafts();
      await pullKeepersCoreDirectivesToCodebase();
      await fetchPostsAndAssets(true);
      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_sync_toast_pulled",
            "Pulled all 10 directives & covenants from Keepers Core to local .md files!"
          ),
          "success"
        );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLinkAsset = (asset: any) => {
    const linkStr = `asset://${asset.type}/${asset.id}`;
    const typeKey = `masonhub_asset_type_${asset.type}`;
    const defaultTypeLabel =
      asset.type === "mod"
        ? "Artifact"
        : asset.type === "blueprint"
        ? "Blueprint"
        : asset.type === "chameleon"
        ? "Theme"
        : "Lexicon";
    const translatedType =
      t(typeKey, defaultTypeLabel) !== typeKey
        ? t(typeKey, defaultTypeLabel)
        : defaultTypeLabel;
    const text = `${translatedType}: ${asset.name}`;

    if (editor) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: text,
          marks: [{ type: "link", attrs: { href: linkStr } }],
        })
        .insertContent(" ")
        .run();
    }

    setIsAssetPanelOpen(false);
  };

  const legalDefinitions = useMemo(
    () => [
      {
        id: "EULA",
        label: t("doc_eula", "End User License Agreement"),
        shortBadge: t("doc_eula", "EULA"),
        icon: t("icon_gavel", "gavel"),
        desc: t("desc_eula", "The legal contract between the platform and the end {citizen}."),
      },
      {
        id: "Privacy",
        label: t("doc_privacy", "Privacy Policy"),
        shortBadge: t("doc_privacy", "Privacy"),
        icon: t("icon_policy", "policy"),
        desc: t(
          "desc_privacy",
          "Outlines how user data is collected, processed, and stored."
        ),
      },
      {
        id: "Terms",
        label: t("doc_terms", "Terms of Service"),
        shortBadge: t("doc_terms", "Terms"),
        icon: t("icon_description", "description"),
        desc: t(
          "desc_terms",
          "The rules and regulations users must agree to in order to use the service."
        ),
      },
      {
        id: "PartnersAgreement",
        label: t("spoke_card_partners_title", "Partner Spoke Agreement"),
        shortBadge: t("spoke_badge_covenant", "Covenant"),
        icon: t("icon_handshake", "handshake"),
        desc: t(
          "spoke_card_partners_desc",
          "Bilateral sovereignty charter, 0%-cut non-custodial donations, readiness verification, and unilateral Cut the Cord rights."
        ),
      },
      {
        id: "ComplianceProtocol",
        label: t("spoke_card_compliance_title", "Safety & Compliance Protocol"),
        shortBadge: t("spoke_badge_zero_malware", "21+17 AV"),
        icon: t("icon_verified_user", "verified_user"),
        desc: t(
          "spoke_card_compliance_desc",
          "Universal 21+17 heuristic malware matrix, Zero-PII telemetry guarantees, and age-gating rules."
        ),
      },
    ],
    [t]
  );

  // Open Editor for Directives, News Posts, or Legal Documents
  const openEditor = (
    post?: any,
    initialTabIdx = 0,
    forcedKind?: EditorRecordKind
  ) => {
    setConfirmDelete(null);
    setIconPickerTarget(null);
    setEditingSubCardIdx(null);

    const recordKind: EditorRecordKind =
      forcedKind ||
      post?.record_kind ||
      (post?.is_canonical_directive || CATEGORY_TO_SLUG[post?.category]
        ? "directive"
        : LEGAL_CATEGORIES.includes(post?.category)
        ? "legal"
        : "news");

    setEditingRecordKind(recordKind);

    const draftId = post ? post.id : `new_${recordKind}`;
    const rawDraft = useStore.getState().wayfinderDrafts[draftId] as any;
    const isStale = isStaleCanonicalDraft(draftId, rawDraft);
    if (isStale && rawDraft) {
      setWayfinderDrafts((prev) => {
        const next = { ...prev };
        delete next[draftId];
        return next;
      });
    }
    const draft = !isStale && rawDraft?.isDirty ? rawDraft : undefined;
    setIsDirty(Boolean(draft?.isDirty));

    if (recordKind === "legal") {
      const legalCategory = post?.category || "EULA";
      const existingDoc = legalDocsMap[legalCategory] || post;
      const defaultDef =
        legalDefinitions.find((d) => d.id === legalCategory) ||
        legalDefinitions[0];
      const nextTitle =
        draft?.title ?? existingDoc?.title ?? defaultDef.label;
      const nextContent = stripDirectiveBuilderComment(
        draft?.content ?? existingDoc?.message ?? ""
      );

      setEditingPostId(existingDoc?.id || null);
      setEditingPost(existingDoc || { category: legalCategory });
      setTitle(nextTitle);
      setDescription(defaultDef.desc);
      setCategory(legalCategory);
      setTargetAudience(["Public"]);
      setActionRequired("No Action Required");
      setPollData(null);
      setImageUrl("");
      setCodeSnippet("");
      setShowCodeInput(false);
      setIsActive(true);
      setBuilderSchema(null);
      setContent(nextContent);
      setEditorContentSilently(nextContent);
      setEditorMode("wysiwyg");
      setIsEditorOpen(true);
      return;
    }

    if (post) {
      setEditingPostId(post.id);
      setEditingPost(post);
      let rawContent = post.message || post.content || "";
      const parsedImage = extractPostImage(post) || "";

      if (parsedImage) {
        rawContent = rawContent.replace(
          new RegExp(
            `\\[IMG:${parsedImage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*`
          ),
          ""
        );
        rawContent = rawContent.replace(
          new RegExp(
            `!\\[.*?\\]\\(${parsedImage.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}\\)\\s*`
          ),
          ""
        );
        rawContent = rawContent.replace(
          new RegExp(
            `<img[^>]+src=["']${parsedImage.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}["'][^>]*>\\s*`,
            "i"
          ),
          ""
        );
      }
      rawContent = rawContent.replace(/\[IMG:.*?\]\s*/, "").trim();
      const parsedMeta = extractDispatchMetadata(post, rawContent);

      const nextTitle = draft?.title ?? post.title;
      const nextDesc = draft?.description ?? (post.description || "");
      const nextCat =
        draft?.category ??
        (post.category ||
          (recordKind === "news" ? "Announcement" : "Citizen Guide"));
      const slug: DirectiveSlug | null =
        recordKind === "directive"
          ? (post.slug && CANONICAL_DIRECTIVES[post.slug as DirectiveSlug]
              ? (post.slug as DirectiveSlug)
              : null) ||
            CATEGORY_TO_SLUG[nextCat] ||
            null
          : null;

      setTitle(nextTitle);
      setDescription(nextDesc);
      setTargetAudience(
        draft?.targetAudience ??
          (post.target_audience ? post.target_audience.split(",") : ["Public"])
      );
      setCategory(nextCat);
      setActionRequired(
        draft?.actionRequired ??
          (parsedMeta.actionRequired || "No Action Required")
      );
      setPollData(
        draft?.pollData !== undefined ? draft.pollData : post.poll_data || null
      );
      setCodeSnippet(draft?.codeSnippet ?? (post.code_snippet || ""));
      setShowCodeInput(!!(draft?.codeSnippet ?? post.code_snippet));
      setIsActive(draft?.isActive ?? post.is_active !== false);

      const cleanMarkdown = stripDirectiveBuilderComment(
        draft?.content ?? parsedMeta.cleanContent
      );
      setContent(cleanMarkdown);
      setEditorContentSilently(cleanMarkdown);
      setImageUrl(draft?.imageUrl ?? parsedImage);

      if (slug) {
        const extractedSchema =
          draft?.builderSchema ||
          extractDirectiveBuilderSchema(
            post.content || post.message,
            slug,
            t
          ) ||
          getDefaultDirectiveBuilderSchema(slug, t);
        const resolvedActive =
          draft?.isActive !== undefined
            ? draft.isActive
            : extractedSchema.isActive !== undefined
            ? extractedSchema.isActive
            : post.is_active !== false;
        const resolvedTitle =
          draft?.title ?? (extractedSchema.title || nextTitle);
        const resolvedSummary =
          draft?.description ?? (extractedSchema.summary || nextDesc);
        setTitle(resolvedTitle);
        setDescription(resolvedSummary);
        setIsActive(resolvedActive);
        setBuilderSchema({
          ...extractedSchema,
          title: resolvedTitle,
          summary: resolvedSummary,
          isActive: resolvedActive,
        });
        setEditorMode("visual");
        setActiveBuilderTabIdx(
          Math.min(
            initialTabIdx,
            Math.max(0, (extractedSchema.tabs?.length || 1) - 1)
          )
        );
        setSelectedBuilderCardIdx(0);
      } else {
        setBuilderSchema(null);
        setEditorMode("wysiwyg");
      }
    } else {
      // Creating a new News post
      setEditingRecordKind("news");
      setEditingPostId(null);
      setEditingPost(null);
      setTitle(draft?.title ?? "");
      setDescription(draft?.description ?? "");
      setTargetAudience(draft?.targetAudience ?? ["Public"]);
      setCategory(draft?.category ?? "Announcement");
      setActionRequired(draft?.actionRequired ?? "No Action Required");
      setPollData(draft?.pollData ?? null);
      const nextContent = draft?.content ?? "";
      setContent(nextContent);
      setEditorContentSilently(nextContent);
      setImageUrl(draft?.imageUrl ?? "");
      setCodeSnippet(draft?.codeSnippet ?? "");
      setShowCodeInput(!!draft?.codeSnippet);
      setIsActive(draft?.isActive ?? true);
      setBuilderSchema(null);
      setEditorMode("wysiwyg");
    }
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setConfirmDelete(null);
    setIconPickerTarget(null);
    setEditingSubCardIdx(null);
    setTimeout(() => {
      setEditingPostId(null);
      setEditingPost(null);
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
    const draftId = editingPostId || "new";
    setIsDirty(false);
    setWayfinderDrafts((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
    setConfirmDiscard(false);
    closeEditor();
  };

  const handleResetBuilderToDefault = async () => {
    if (!activeCanonicalSlug) return;
    setWayfinderDrafts((prev) => {
      const next = { ...prev };
      delete next[activeCanonicalSlug];
      return next;
    });
    const localSnaps = await readLocalDirectiveSnapshots();
    const rawSource =
      localSnaps[activeCanonicalSlug]?.content ||
      CANONICAL_DIRECTIVES[activeCanonicalSlug]?.bundledContent ||
      editingPost?.content ||
      editingPost?.message ||
      "";
    const freshSchema =
      parseMarkdownToDirectiveSchema(rawSource, activeCanonicalSlug, t) ||
      getDefaultDirectiveBuilderSchema(activeCanonicalSlug, t);
    setBuilderSchema(freshSchema);
    setTitle(freshSchema.title);
    setDescription(freshSchema.summary);
    const cleanMd =
      stripDirectiveBuilderComment(rawSource) ||
      compileDirectiveSchemaToMarkdown(freshSchema);
    setContent(cleanMd);
    setEditorContentSilently(cleanMd);
    setActiveBuilderTabIdx(0);
    setSelectedBuilderCardIdx(0);
    setEditingSubCardIdx(null);
    setIsDirty(false);

    const meta = CANONICAL_DIRECTIVES[activeCanonicalSlug];
    await saveDirectiveBothWays({
      slug: activeCanonicalSlug,
      title: freshSchema.title,
      summary: freshSchema.summary || meta?.summary || "",
      category: meta?.category || category,
      content: cleanMd,
      updated_by: currentUserId || "Keepers Core",
    });
    await fetchPostsAndAssets(true);
    window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));

    useStore
      .getState()
      .pushStatus(
        t("dir_builder_toast_reset", "Reset directive to default Sanctuary Foundry {blueprint}."),
        "info"
      );
  };

  const updateBuilderCard = (
    tabIdx: number,
    cardIdx: number,
    patch: Partial<DirectiveBuilderCard>
  ) => {
    setIsDirty(true);
    setBuilderSchema((prev) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab, tIdx) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card, cIdx) =>
          cIdx === cardIdx ? { ...card, ...patch } : card
        );
        return { ...tab, cards: nextCards };
      });
      return { ...prev, tabs: nextTabs };
    });
  };

  const handleAddCardToTab = (tabIdx: number) => {
    if (!builderSchema) return;
    const currentTab = builderSchema.tabs[tabIdx];
    if (!currentTab) return;
    setIsDirty(true);
    const nextNum = currentTab.cards.length + 1;
    const newCard: DirectiveBuilderCard = {
      id: `card_${Date.now()}`,
      icon: t("icon_layers", "layers"),
      overline: `${t("dir_builder_field_overline", "Overline")} ${nextNum}`,
      badge: `${nextNum}. ${t("dir_builder_add_card", "Add Card")}`,
      title: `${t("dir_builder_field_title", "Card Title")} ${nextNum}`,
      footerMeta: t(
        "dir_builder_section_cards_lbl",
        "Interactive Section Cards"
      ),
      desc: t(
        "dir_builder_field_desc",
        "Full Description (Shows in Drawer)"
      ),
      status: "active",
      subCards: [
        {
          id: `sub_${Date.now()}_1`,
          icon: t("icon_check_circle", "check_circle"),
          title: t("dir_builder_subcard_title_ph", "Info block title..."),
          desc: t("dir_builder_subcard_desc_ph", "Concise description..."),
        },
      ],
    };

    setBuilderSchema((prev) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab, i) =>
        i === tabIdx ? { ...tab, cards: [...tab.cards, newCard] } : tab
      );
      return { ...prev, tabs: nextTabs };
    });
    setSelectedBuilderCardIdx(currentTab.cards.length);
    setEditingSubCardIdx(null);
  };

  const handleMoveCard = (
    tabIdx: number,
    cardIdx: number,
    direction: -1 | 1
  ) => {
    if (!builderSchema) return;
    const currentTab = builderSchema.tabs[tabIdx];
    if (!currentTab) return;
    const targetIdx = cardIdx + direction;
    if (targetIdx < 0 || targetIdx >= currentTab.cards.length) return;
    setIsDirty(true);

    setBuilderSchema((prev) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab, i) => {
        if (i !== tabIdx) return tab;
        const copy = [...tab.cards];
        const [moved] = copy.splice(cardIdx, 1);
        copy.splice(targetIdx, 0, moved);
        return { ...tab, cards: copy };
      });
      return { ...prev, tabs: nextTabs };
    });
    setSelectedBuilderCardIdx(targetIdx);
  };

  const handleDeleteCard = (tabIdx: number, cardIdx: number) => {
    if (!builderSchema) return;
    const currentTab = builderSchema.tabs[tabIdx];
    if (!currentTab || currentTab.cards.length <= 1) return;
    setIsDirty(true);

    setBuilderSchema((prev) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab, i) => {
        if (i !== tabIdx) return tab;
        return {
          ...tab,
          cards: tab.cards.filter((_, idx) => idx !== cardIdx),
        };
      });
      return { ...prev, tabs: nextTabs };
    });
    setSelectedBuilderCardIdx(Math.max(0, cardIdx - 1));
    setEditingSubCardIdx(null);
  };

  const handleAddSubCard = (tabIdx: number, cardIdx: number) => {
    setIsDirty(true);
    const currentCount =
      builderSchema?.tabs?.[tabIdx]?.cards?.[cardIdx]?.subCards?.length || 0;
    const newSub: DirectiveBuilderSubCard = {
      id: `sub_${Date.now()}`,
      icon: t("icon_check_circle", "check_circle"),
      title: t("dir_builder_subcard_title_ph", "Info block title..."),
      desc: t("dir_builder_subcard_desc_ph", "Concise description..."),
      pending: false,
    };
    setBuilderSchema((prev) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab, tIdx) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card, cIdx) =>
          cIdx === cardIdx
            ? { ...card, subCards: [...(card.subCards || []), newSub] }
            : card
        );
        return { ...tab, cards: nextCards };
      });
      return { ...prev, tabs: nextTabs };
    });
    setEditingSubCardIdx(currentCount);
  };

  const updateSubCard = (
    tabIdx: number,
    cardIdx: number,
    subIdx: number,
    patch: Partial<DirectiveBuilderSubCard>
  ) => {
    setIsDirty(true);
    setBuilderSchema((prev) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab, tIdx) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card, cIdx) => {
          if (cIdx !== cardIdx) return card;
          const nextSubs = (card.subCards || []).map((sub, sIdx) =>
            sIdx === subIdx ? { ...sub, ...patch } : sub
          );
          return { ...card, subCards: nextSubs };
        });
        return { ...tab, cards: nextCards };
      });
      return { ...prev, tabs: nextTabs };
    });
  };

  const handleMoveSubCard = (
    tabIdx: number,
    cardIdx: number,
    subIdx: number,
    direction: -1 | 1
  ) => {
    setIsDirty(true);
    setBuilderSchema((prev) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab, tIdx) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card, cIdx) => {
          if (cIdx !== cardIdx) return card;
          const subs = [...(card.subCards || [])];
          const targetIdx = subIdx + direction;
          if (targetIdx < 0 || targetIdx >= subs.length) return card;
          const [moved] = subs.splice(subIdx, 1);
          subs.splice(targetIdx, 0, moved);
          return { ...card, subCards: subs };
        });
        return { ...tab, cards: nextCards };
      });
      return { ...prev, tabs: nextTabs };
    });
  };

  const handleDeleteSubCard = (
    tabIdx: number,
    cardIdx: number,
    subIdx: number
  ) => {
    setIsDirty(true);
    setBuilderSchema((prev) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab, tIdx) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card, cIdx) => {
          if (cIdx !== cardIdx) return card;
          return {
            ...card,
            subCards: (card.subCards || []).filter(
              (_, sIdx) => sIdx !== subIdx
            ),
          };
        });
        return { ...tab, cards: nextCards };
      });
      return { ...prev, tabs: nextTabs };
    });
    setEditingSubCardIdx(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    let finalMarkdownBody = stripDirectiveBuilderComment(content);
    if (editor && editorMode === "wysiwyg") {
      finalMarkdownBody = stripDirectiveBuilderComment(
        (editor.storage as any).markdown.getMarkdown()
      );
      setContent(finalMarkdownBody);
    }

    // 1. Saving a Legal or Sovereign Covenant Document (Both Ways: Hub DB + Local .md)
    if (editingRecordKind === "legal") {
      if (!finalMarkdownBody.trim()) return;
      setIsSubmitting(true);
      const legalCat = (LEGAL_DOC_CATEGORIES.includes(
        category as LegalDocCategory
      )
        ? category
        : "EULA") as LegalDocCategory;
      const legalTitle = title.trim() || CANONICAL_LEGAL_DOCS[legalCat].title;
      const existingDoc = legalDocsMap[legalCat];

      const saveRes = await saveLegalDocBothWays({
        category: legalCat,
        title: legalTitle,
        content: finalMarkdownBody.trim(),
        id:
          existingDoc?.id && !String(existingDoc.id).startsWith("legal_")
            ? existingDoc.id
            : undefined,
      });

      if (!saveRes.error) {
        await logArchitectAction(
          "Synced Legal & Covenant Doc (Hub + .md)",
          "keeper_system_broadcasts",
          `${legalTitle} (${CANONICAL_LEGAL_DOCS[legalCat].file_path})`,
          undefined,
          "Keepers Core",
          true,
          {
            title: { to: legalTitle },
            category: { to: legalCat },
            is_active: { to: true },
          }
        );
        window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
        closeEditor();
        await fetchPostsAndAssets();
        useStore
          .getState()
          .pushStatus(
            t(
              "dir_sync_toast_saved",
              "Saved to Keepers Core & local .md file!"
            ),
            "success"
          );
      } else {
        useStore
          .getState()
          .pushStatus(`Failed to save: ${saveRes.error.message}`, "error");
      }
      setIsSubmitting(false);
      return;
    }

    // 2. Saving a Canonical System Directive
    const canonicalSlug: DirectiveSlug | null =
      editingRecordKind === "directive"
        ? (editingPost?.is_canonical_directive && editingPost?.slug) ||
          CATEGORY_TO_SLUG[category] ||
          null
        : null;

    if (canonicalSlug && builderSchema) {
      const baseSchema =
        editorMode !== "visual" && finalMarkdownBody.trim()
          ? parseMarkdownToDirectiveSchema(
              finalMarkdownBody,
              canonicalSlug,
              t
            ) || builderSchema
          : builderSchema;
      const syncedSchema: DirectiveBuilderSchema = {
        ...baseSchema,
        slug: canonicalSlug,
        title: title.trim() || baseSchema.title,
        summary: description.trim() || baseSchema.summary,
        isActive,
      };
      if (editorMode === "visual" || !finalMarkdownBody.trim()) {
        finalMarkdownBody = compileDirectiveSchemaToMarkdown(syncedSchema);
        setContent(finalMarkdownBody);
        setEditorContentSilently(finalMarkdownBody);
      }
      const payloadContent = embedDirectiveBuilderSchema(
        finalMarkdownBody,
        syncedSchema
      );

      setIsSubmitting(true);
      const meta = CANONICAL_DIRECTIVES[canonicalSlug];
      const saveRes = await saveDirectiveBothWays({
        slug: canonicalSlug,
        title: syncedSchema.title,
        summary: syncedSchema.summary || meta?.summary || "",
        category: category,
        content: payloadContent,
        updated_by: currentUserId || "Keepers Core",
      });

      await logArchitectAction(
        "Synced System Directive (Visual Builder + .md)",
        "system_directives",
        `${syncedSchema.title} (${meta?.file_path || canonicalSlug})`,
        undefined,
        "Keepers Core",
        true,
        {
          slug: { to: canonicalSlug },
          title: { to: syncedSchema.title },
          tabs_count: { to: syncedSchema.tabs?.length || 0 },
          is_live: { to: isActive },
        }
      );

      useStore.getState().setWayfinderDrafts((prev) => {
        const next = { ...prev };
        delete next[editingPostId || "new"];
        return next;
      });

      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      closeEditor();
      await fetchPostsAndAssets();
      useStore
        .getState()
        .pushStatus(
          !saveRes.error
            ? t(
                "dir_sync_toast_saved",
                "Saved to Keepers Core & local .md file!"
              )
            : t("update_transmission", "Update {Dispatch}"),
          "success"
        );
      setIsSubmitting(false);
      return;
    }

    // 3. Saving a News Post
    if (!title.trim() || !finalMarkdownBody.trim()) return;

    if (
      pollData &&
      (!pollData.question.trim() ||
        pollData.options.filter((o) => o.label.trim()).length < 2)
    ) {
      alert(
        t(
          "poll_err_incomplete",
          "Please enter a poll question and at least 2 options, or remove the poll before posting."
        )
      );
      return;
    }

    setIsSubmitting(true);
    const sanitizedPoll =
      pollData &&
      pollData.question.trim() &&
      pollData.options.filter((o) => o.label.trim()).length >= 2
        ? {
            ...pollData,
            question: pollData.question.trim(),
            options: pollData.options
              .filter((o) => o.label.trim())
              .map((o) => ({ ...o, label: o.label.trim() })),
          }
        : null;

    const payload: any = {
      title: title.trim(),
      description: description.trim() || null,
      message: finalMarkdownBody.trim(),
      category: NEWS_CATEGORIES.includes(category) ? category : "Announcement",
      target_audience: "Public",
      action_required: actionRequired.trim() || "No Action Required",
      poll_data: sanitizedPoll,
      code_snippet: codeSnippet.trim() || null,
      is_pinned: false,
      is_active: isActive,
    };
    if (imageUrl.trim()) {
      payload.message = `[IMG:${imageUrl.trim()}]\n\n` + payload.message;
    }

    const targetTable = "system_broadcasts";
    const payloadWithId = editingPostId
      ? { id: editingPostId, ...payload }
      : payload;
    const res = await supabaseAuth
      .from(targetTable)
      .upsert(payloadWithId)
      .select();

    if (!res.error) {
      await logArchitectAction(
        editingPostId ? "Updated News Broadcast" : "Created News Broadcast",
        targetTable,
        payload.title,
        undefined,
        "Keepers Core",
        true,
        {
          title: { from: editingPost?.title, to: payload.title },
          category: { from: editingPost?.category, to: payload.category },
          is_active: { from: editingPost?.is_active, to: payload.is_active },
        }
      );
      useStore.getState().setWayfinderDrafts((prev) => {
        const next = { ...prev };
        delete next[editingPostId || "new"];
        return next;
      });
      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      closeEditor();
      await fetchPostsAndAssets();
      useStore
        .getState()
        .pushStatus(
          editingPostId
            ? t("update_transmission", "Update {Dispatch}")
            : t("post_success", "{Dispatch} published successfully."),
          "success"
        );
    } else {
      useStore
        .getState()
        .pushStatus(`Transmission Failed: ${res.error.message}`, "error");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const postToDelete = newsPosts.find((p) => p.id === id);
    if (!postToDelete) return;
    const targetTable = "system_broadcasts";
    const res = await supabaseAuth.from(targetTable).delete().eq("id", id);
    if (!res.error) {
      await logArchitectAction(
        "Deleted News Broadcast",
        targetTable,
        postToDelete.title || id,
        undefined,
        "Keepers Core",
        true,
        {
          title: { from: postToDelete.title, to: null },
          category: { from: postToDelete.category, to: null },
        }
      );
    }
    fetchPostsAndAssets();
  };

  // Filtered lists per tab
  const filteredDirectives = useMemo(() => {
    return directivePosts.filter((p) => {
      const searchMatch =
        !searchTerm.trim() ||
        p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.message || p.content)
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (p.file_name || "")?.toLowerCase().includes(searchTerm.toLowerCase());
      const categoryMatch =
        filterCategory === "All" || p.category === filterCategory;
      return searchMatch && categoryMatch;
    });
  }, [directivePosts, searchTerm, filterCategory]);

  const filteredNews = useMemo(() => {
    return newsPosts.filter((p) => {
      const searchMatch =
        !searchTerm.trim() ||
        p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.message || p.content)
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase());
      const categoryMatch =
        filterCategory === "All" || p.category === filterCategory;
      return searchMatch && categoryMatch;
    });
  }, [newsPosts, searchTerm, filterCategory]);

  const filteredLegalDefs = useMemo(() => {
    return legalDefinitions.filter((def) => {
      const doc = legalDocsMap[def.id];
      const searchMatch =
        !searchTerm.trim() ||
        def.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        def.desc.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc?.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc?.message || "").toLowerCase().includes(searchTerm.toLowerCase());
      return searchMatch;
    });
  }, [legalDefinitions, legalDocsMap, searchTerm]);

  // Unified Vault-Standard Canonical Directive Card
  const renderCanonicalDirectiveCard = (post: any) => {
    const slug = (post.slug ||
      CATEGORY_TO_SLUG[post.category] ||
      "citizen_guide") as DirectiveSlug;
    const iconMeta = SLUG_ICON_MAP[slug] || SLUG_ICON_MAP.citizen_guide;
    const effectiveSchema =
      extractDirectiveBuilderSchema(post.content || post.message, slug, t) ||
      getDefaultDirectiveBuilderSchema(slug, t);

    const totalTabs = effectiveSchema.tabs.length;
    const totalCards = effectiveSchema.tabs.reduce(
      (acc, tab) => acc + (tab.cards?.length || 0),
      0
    );

    const hasUnsavedEdits = Boolean(
      (wayfinderDrafts[post.id] as any)?.isDirty
    );
    const isLive =
      effectiveSchema.isActive !== undefined
        ? effectiveSchema.isActive !== false
        : post.is_active !== false;
    const showCommLinkImages = useStore.getState().showCommLinkImages;
    const extractedImage = showCommLinkImages !== false ? extractPostImage(post) : undefined;

    return (
      <UniversalCard
        key={`dir-${post.id}`}
        layout="vertical"
        onClick={() => openEditor(post, 0, "directive")}
        image={extractedImage || undefined}
        icon={t(iconMeta.key, iconMeta.fallback)}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            {hasUnsavedEdits ? (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_edit", "edit")}
                </span>
                <span>{t("action_unsaved_draft", "Draft")}</span>
              </span>
            ) : (
              <span className={VAULT_CHIP_CLASS}>
                <span
                  className={`material-symbols-outlined !text-[12px] ${
                    isLive ? "text-[var(--success)]" : "text-[var(--subtext)]"
                  }`}
                >
                  {isLive
                    ? t("icon_cell_tower", "cell_tower")
                    : t("icon_portable_wifi_off", "portable_wifi_off")}
                </span>
                <span>
                  {isLive
                    ? t("status_live", "Live")
                    : t("status_not_live", "Not Live")}
                </span>
              </span>
            )}
          </div>
        }
        title={effectiveSchema.title || post.title}
        subtitle={`${t("by_author", "BY")} ${t("author_sanctuary_team", "Sanctuary Foundry")}`}
        badges={
          <>
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t(iconMeta.key, iconMeta.fallback)}
              </span>
              <span>{post.category}</span>
            </span>
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isLive ? "text-[var(--success)]" : "text-[var(--subtext)]"
                }`}
              >
                {isLive
                  ? t("icon_cell_tower", "cell_tower")
                  : t("icon_portable_wifi_off", "portable_wifi_off")}
              </span>
              <span>
                {isLive
                  ? t("status_live", "Live")
                  : t("status_not_live", "Not Live")}
              </span>
            </span>
          </>
        }
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-wider truncate">
              {`${totalTabs} ${t("dir_builder_tabs_lbl", "Tabs")} • ${totalCards} ${t("dir_builder_cards_lbl", "Cards")}`}
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
          {post.description || effectiveSchema.summary}
        </p>
      </UniversalCard>
    );
  };

  // Unified Vault-Standard News Post Card
  const renderNewsCard = (post: any) => {
    const cleanSnippet = stripMarkdown(post.message || post.content || "")
      .replace(/\[IMG:.*?\]/g, "")
      .trim();
    const dateStr = post.created_at
      ? new Date(post.created_at).toLocaleDateString()
      : "";
    const showCommLinkImages = useStore.getState().showCommLinkImages;
    const extractedImage = showCommLinkImages !== false ? extractPostImage(post) : undefined;

    return (
      <UniversalCard
        key={`news-${post.id}`}
        layout="vertical"
        onClick={() => openEditor(post, 0, "news")}
        image={extractedImage || undefined}
        icon={t("icon_newspaper", "newspaper")}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_campaign", "campaign")}
              </span>
              <span>{post.category || t("cat_announcement", "Announcement")}</span>
            </span>
          </div>
        }
        title={post.title}
        subtitle={`${t("by_author", "BY")} ${t("author_sanctuary_team", "Sanctuary Foundry")}`}
        badges={
          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_newspaper", "newspaper")}
            </span>
            <span>{t("landing_news_short", "News")}</span>
          </span>
        }
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-wider">
              {dateStr}
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
          {post.description || cleanSnippet}
        </p>
      </UniversalCard>
    );
  };

  // Unified Vault-Standard Legal Document Card
  const renderLegalCard = (def: (typeof legalDefinitions)[0]) => {
    const doc = legalDocsMap[def.id];
    const lastUpdated = doc?.created_at
      ? new Date(doc.created_at).toLocaleDateString()
      : t("never", "Default");

    return (
      <UniversalCard
        key={`legal-${def.id}`}
        layout="vertical"
        onClick={() =>
          openEditor(
            doc || {
              id: `legal_${def.id}`,
              category: def.id,
              title: def.label,
              message: "",
            },
            0,
            "legal"
          )
        }
        icon={def.icon}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  doc ? "text-[var(--success)]" : "text-[var(--subtext)]"
                }`}
              >
                {doc
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_gavel", "gavel")}
              </span>
              <span>{doc ? t("status_active", "Published") : def.shortBadge}</span>
            </span>
          </div>
        }
        title={doc?.title || def.label}
        subtitle={`${t("by_author", "BY")} ${t("author_sanctuary_team", "Sanctuary Foundry")}`}
        badges={
          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {def.icon}
            </span>
            <span>{def.shortBadge}</span>
          </span>
        }
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-wider truncate">
              {`${t("updated_date", "Updated")}: ${lastUpdated}`}
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

  // Top 4 StatTiles requested by the user:
  // 1. Overview (Recent Edits / Recently Added)
  // 2. News (News Posts)
  // 3. Directives (Directives)
  // 4. Legal (Legal Stuff)
  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: t("web_landing_stat_overview", "Recent Edits"),
    },
    {
      id: "news",
      label: t("landing_news_short", "News"),
      icon: t("icon_newspaper", "newspaper"),
      number: t("web_landing_stat_news", "{0} News Posts").replace(
        "{0}",
        String(newsPosts.length)
      ),
    },
    {
      id: "directives",
      label: t("web_landing_tab_directives", "Directives"),
      icon: t("icon_folder_special", "folder_special"),
      number: t("web_landing_stat_directives", "{0} Directives").replace(
        "{0}",
        String(directivePosts.length)
      ),
    },
    {
      id: "legal",
      label: t("web_landing_tab_legal", "Legal"),
      icon: t("icon_gavel", "gavel"),
      number: t("web_landing_stat_legal", "{0} Legal Stuff").replace(
        "{0}",
        String(legalDefinitions.length)
      ),
    },
  ];

  const activeBuilderTab =
    builderSchema?.tabs?.[activeBuilderTabIdx] || builderSchema?.tabs?.[0];
  const safeSelectedCardIdx = Math.min(
    selectedBuilderCardIdx,
    Math.max(0, (activeBuilderTab?.cards?.length || 1) - 1)
  );
  const activeBuilderCard =
    activeBuilderTab?.cards?.[safeSelectedCardIdx] ||
    activeBuilderTab?.cards?.[0];

  const contentBlock = (
    <ElevatedHubLayout
      headerTitle={t("keepers_tab_web_landing", "Web Landing")}
      headerSubtitle={t(
        "keepers_web_landing_subtitle",
        "Manage Landing Page News, System Directives & Legal Documents"
      )}
      headerIcon={t("icon_public", "public")}
      headerIconColorClass="theme-text-accent"
      hideHeader={isSidePanel}
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("mason_search_placeholder", "Search {dispatches}...")}
      tabs={tabs}
      activeTab={activeViewTab}
      onTabChange={(id) => {
        setActiveViewTab(id as any);
        setFilterCategory("All");
      }}
      primaryPopover={
        activeViewTab === "directives" || activeViewTab === "news"
          ? {
              icon: t("icon_tune", "tune"),
              label: t("filters", "Filters"),
              content: (
                <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("category", "Category")}
                    </span>
                    <CustomDropdown
                      flat={true}
                      variant="pill"
                      disableTint={true}
                      value={filterCategory}
                      onChange={(v: string[]) => setFilterCategory(v[0])}
                      options={
                        activeViewTab === "news"
                          ? [
                              {
                                id: "All",
                                label: t("all_classes", "All Categories"),
                              },
                              ...NEWS_CATEGORIES.map((c) => ({
                                id: c,
                                label: c,
                              })),
                            ]
                          : [
                              {
                                id: "All",
                                label: t("all_classes", "All Categories"),
                              },
                              {
                                id: "Citizen Guide",
                                label: t("cat_citizen_guide", "{Citizen} Guide"),
                              },
                              {
                                id: "Forking Guide",
                                label: t("sd_card_fork_title", "Forking Guide"),
                              },
                              {
                                id: "Phase Roadmap",
                                label: t("cat_phase_roadmap", "Phase Roadmap"),
                              },
                              {
                                id: "Master Architecture",
                                label: t(
                                  "cat_master_architecture",
                                  "Master Architecture"
                                ),
                              },
                              {
                                id: "Master Protocol List",
                                label: t(
                                  "cat_master_protocol",
                                  "Master Protocol List"
                                ),
                              },
                            ]
                      }
                    />
                  </div>
                </div>
              ),
            }
          : undefined
      }
      actions={[
        {
          id: "new_news_post",
          icon: t("icon_add", "add"),
          label: t("post_broadcast", "New {Dispatch}"),
          onClick: () => openEditor(undefined, 0, "news"),
        },
        {
          id: "sync_both",
          icon: t("icon_sync", "sync"),
          label: t("dir_sync_btn_both", "Two-Way Sync"),
          onClick: handleTwoWaySync,
        },
        {
          id: "push_md",
          icon: t("icon_cloud_done", "cloud_done"),
          label: t("dir_sync_btn_push", "Push .md → Hub"),
          onClick: handlePushCodebaseToHub,
        },
        {
          id: "pull_hub",
          icon: t("icon_system_update_alt", "system_update_alt"),
          label: t("dir_sync_btn_pull", "Pull Hub → .md"),
          onClick: handlePullHubToCodebase,
        },
      ]}
    >
      {activeViewTab === "overview" && (
        <HubOverviewLanding>
          {/* Full-Width Top Section: Update Post System (Public Stable Release & Daily Dev Build) */}
          <HubOverviewSection
            className="xl:col-span-2"
            icon={t("icon_new_releases", "new_releases")}
            iconColorClass="text-[var(--accent)]"
            title={t(
              "release_notes_keepers_section_title",
              "Current Build Release Posts (Public & Dev)"
            )}
            gridClassName="flex flex-col w-full"
          >
            <ReleaseNotesShowcase isKeepers={true} />
          </HubOverviewSection>

          {/* Column 1 (2x2): Recent Edits */}
          <HubOverviewSection
            icon={t("icon_edit_note", "edit_note")}
            iconColorClass="text-[var(--accent)]"
            title={t("web_landing_sec_recent_edits", "Recent Edits")}
            headerAction={
              <ActionButton
                variant="glass"
                icon={t("icon_folder_special", "folder_special")}
                onClick={() => setActiveViewTab("directives")}
                className="!px-3 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("web_landing_tab_directives", "Directives")}
              </ActionButton>
            }
            gridClassName="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {[
              ...filteredDirectives.slice(0, 2).map(renderCanonicalDirectiveCard),
              ...filteredLegalDefs.slice(0, 2).map(renderLegalCard),
            ].slice(0, 4)}
          </HubOverviewSection>

          {/* Column 2 (2x2): Recently Added */}
          <HubOverviewSection
            icon={t("icon_newspaper", "newspaper")}
            iconColorClass="text-[var(--accent)]"
            title={t("web_landing_sec_recent_added", "Recently Added")}
            headerAction={
              <ActionButton
                variant="glass"
                icon={t("icon_newspaper", "newspaper")}
                onClick={() => setActiveViewTab("news")}
                className="!px-3 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("landing_news_short", "News")}
              </ActionButton>
            }
            gridClassName="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {(filteredNews.length > 0
              ? [
                  ...filteredNews.slice(0, 2).map(renderNewsCard),
                  ...filteredDirectives
                    .slice(2, 4)
                    .map(renderCanonicalDirectiveCard),
                ]
              : filteredDirectives.slice(0, 4).map(renderCanonicalDirectiveCard)
            ).slice(0, 4)}
          </HubOverviewSection>
        </HubOverviewLanding>
      )}

      {activeViewTab === "news" && (
        <div className="flex flex-col gap-8">
          <HubOverviewSection
            icon={t("icon_new_releases", "new_releases")}
            iconColorClass="text-[var(--accent)]"
            title={t(
              "release_notes_keepers_section_title",
              "Current Build Release Posts (Public & Dev)"
            )}
            gridClassName="flex flex-col w-full"
          >
            <ReleaseNotesShowcase isKeepers={true} />
          </HubOverviewSection>

          <HubOverviewSection
            icon={t("icon_newspaper", "newspaper")}
            iconColorClass="text-[var(--accent)]"
            title={t("sidebar_sanctuary_news", "Sanctuary Foundry News")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {filteredNews.length === 0 ? (
              <EmptyState
                icon={t("icon_newspaper", "newspaper")}
                title={t("no_transmissions", "No {Dispatches} Found")}
                className="col-span-full py-16"
              />
            ) : (
              filteredNews.map(renderNewsCard)
            )}
          </HubOverviewSection>
        </div>
      )}

      {activeViewTab === "directives" && (
        <div className="flex flex-col gap-5">
          {filteredDirectives.length === 0 ? (
            <EmptyState
              icon={t("icon_folder_special", "folder_special")}
              title={t("no_transmissions", "No {Dispatches} Found")}
              className="col-span-full py-16"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredDirectives.map(renderCanonicalDirectiveCard)}
            </div>
          )}
        </div>
      )}

      {activeViewTab === "legal" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredLegalDefs.map(renderLegalCard)}
        </div>
      )}
    </ElevatedHubLayout>
  );

  return (
    <>
      {contentBlock}

      {isEditorOpen && (
        <SidePanel
          isOpen={isEditorOpen}
          onClose={closeEditor}
          icon={
            editingRecordKind === "legal"
              ? t("icon_gavel", "gavel")
              : editingRecordKind === "news"
              ? t("icon_newspaper", "newspaper")
              : t("icon_dashboard", "dashboard")
          }
          widthClass="w-[92vw] md:w-[920px]"
          title={
            title ||
            (editingPostId
              ? t("update_transmission", "Update {Dispatch}")
              : t("post_broadcast", "New {Dispatch}"))
          }
          subtitle={
            activeCanonicalMeta
              ? activeCanonicalMeta.file_path
              : editingRecordKind === "legal"
              ? category
              : editingPostId
              ? t("editing_record", "Editing Record")
              : t("composing_broadcast", "Composing Broadcast")
          }
          headerActions={
            <PanelHeaderGroup>
              {activeCanonicalMeta && (
                <>
                  <PanelHeaderButton
                    onClick={handleResetBuilderToDefault}
                    tooltip={t("dir_builder_btn_reset", "Reset to Default")}
                    icon={t("icon_restart_alt", "restart_alt")}
                  />
                  <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1.5" />
                </>
              )}

              {editingPostId && editingRecordKind === "news" && (
                <>
                  {confirmDelete === editingPostId ? (
                    <PanelHeaderButton
                      onClick={() => {
                        handleDelete(editingPostId);
                        setConfirmDelete(null);
                        closeEditor();
                      }}
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
                  <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1.5" />
                </>
              )}

              {isDirty && (
                <PanelHeaderButton
                  onClick={handleDiscardChanges}
                  disabled={isSubmitting}
                  tooltip={
                    confirmDiscard
                      ? t("ui_confirm_discard", "Click again to discard")
                      : t("ui_btn_discard_edits", "Discard Changes")
                  }
                  icon={
                    confirmDiscard
                      ? t("icon_warning", "warning")
                      : t("icon_undo", "undo")
                  }
                  variant="danger"
                  className={confirmDiscard ? "animate-pulse" : ""}
                />
              )}
              <PanelHeaderButton
                icon={
                  isActive
                    ? t("icon_cell_tower", "cell_tower")
                    : t("icon_portable_wifi_off", "portable_wifi_off")
                }
                variant={isActive ? "success" : "default"}
                tooltip={
                  isActive
                    ? t("status_live", "Live")
                    : t("status_not_live", "Not Live")
                }
                onClick={() => {
                  const nextActive = !isActive;
                  setIsActive(nextActive);
                  setBuilderSchema((prev) =>
                    prev ? { ...prev, isActive: nextActive } : prev
                  );
                  setIsDirty(true);
                }}
              />
              <PanelHeaderButton
                onClick={() => handleSubmit()}
                disabled={isSubmitting || isSyncing || !title}
                tooltip={
                  isSubmitting
                    ? t("btn_saving", "Saving...")
                    : t("save", "Save Changes")
                }
                icon={
                  isSubmitting
                    ? t("icon_sync", "sync")
                    : t("icon_send", "send")
                }
                variant={isDirty ? "warning" : "accent"}
                className={isSubmitting ? "animate-pulse" : ""}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-5 pb-8">
            {activeCanonicalMeta && (
              <PostEditorModeTiles
                mode={editorMode}
                onModeChange={(m) => switchEditorMode(m)}
              />
            )}

            {/* =================================================================
                MODE A: 100% FULL-WIDTH SINGLE-COLUMN STACKED VISUAL BUILDER
               ================================================================= */}
            {editorMode === "visual" &&
              builderSchema &&
              activeBuilderTab &&
              activeBuilderCard && (
                <div className="flex flex-col gap-4 animate-in fade-in duration-200 w-full">
                  {/* 1. 1x3 Directive Tab Selector */}
                  {builderSchema.tabs.length > 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 w-full">
                      {builderSchema.tabs.map((tab, tIdx) => (
                        <DashboardStatTile
                          key={tab.id}
                          variant="filter"
                          icon={tab.icon || t("icon_layers", "layers")}
                          label={`${tab.label} • ${tab.cards.length}`}
                          number={tab.value}
                          colorClass="text-[var(--accent)]"
                          isActive={activeBuilderTabIdx === tIdx}
                          onClick={() => {
                            setActiveBuilderTabIdx(tIdx);
                            setSelectedBuilderCardIdx(0);
                            setEditingSubCardIdx(null);
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* 2. Top Action Bar + Liquid Glass Add Card Button */}
                  <div className="glass-panel p-3 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-2.5">
                    <div className="px-2.5 py-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                        {t("icon_dashboard", "dashboard")}
                      </span>
                      <span>
                        {t("dir_builder_cards_list_heading", "Cards in Tab")} (
                        {activeBuilderTab.cards.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddCardToTab(activeBuilderTabIdx)}
                      className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                        {t("icon_add_box", "add_box")}
                      </span>
                      <span>{t("dir_builder_add_card", "Add Card")}</span>
                    </button>
                  </div>

                  {/* 3. 100% Full-Width Single-Column Card Stack */}
                  <div className="flex flex-col gap-3.5 w-full">
                    {activeBuilderTab.cards.map((card, cardIdx) => {
                      const isSelected = safeSelectedCardIdx === cardIdx;

                      if (!isSelected) {
                        /* UNSELECTED CARD: Full-Width Compact 1-Line Row (Dimmed at opacity-50) */
                        return (
                          <div
                            key={card.id || cardIdx}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedBuilderCardIdx(cardIdx);
                              setEditingSubCardIdx(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedBuilderCardIdx(cardIdx);
                                setEditingSubCardIdx(null);
                              }
                            }}
                            className="glass-panel rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 border transition-all duration-200 cursor-pointer opacity-50 hover:opacity-85 border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] w-full"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-[18px]">
                                  {card.icon || t("icon_layers", "layers")}
                                </span>
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--accent)] truncate">
                                  {card.overline || `#${cardIdx + 1}`}
                                </span>
                                <span className="text-sm font-black text-[var(--text)] truncate">
                                  {renderCleanInlineText(card.title)}
                                </span>
                              </div>
                            </div>

                            <div
                              className="flex items-center gap-1.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {card.badge && (
                                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider mr-1">
                                  {card.badge}
                                </span>
                              )}
                              <ActionButton
                                variant="glass"
                                icon={t("icon_arrow_upward", "arrow_upward")}
                                iconOnly={true}
                                disabled={cardIdx === 0}
                                onClick={() =>
                                  handleMoveCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    -1
                                  )
                                }
                                className="!w-8 !h-8 !rounded-xl"
                              />
                              <ActionButton
                                variant="glass"
                                icon={t(
                                  "icon_arrow_downward",
                                  "arrow_downward"
                                )}
                                iconOnly={true}
                                disabled={
                                  cardIdx >= activeBuilderTab.cards.length - 1
                                }
                                onClick={() =>
                                  handleMoveCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    1
                                  )
                                }
                                className="!w-8 !h-8 !rounded-xl"
                              />
                              <ActionButton
                                variant="glass"
                                icon={t("icon_expand_more", "expand_more")}
                                iconOnly={true}
                                onClick={() => {
                                  setSelectedBuilderCardIdx(cardIdx);
                                  setEditingSubCardIdx(null);
                                }}
                                className="!w-8 !h-8 !rounded-xl"
                              />
                            </div>
                          </div>
                        );
                      }

                      /* SELECTED CARD: Expands In-Place Across 100% of SidePanel Width */
                      return (
                        <div
                          key={card.id || cardIdx}
                          className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] w-full animate-in fade-in duration-150"
                        >
                          {/* Expanded Card Top Header Bar */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                              {t(
                                "dir_builder_editing_card",
                                "Editing Card {0} of {1}"
                              )
                                .replace("{0}", String(cardIdx + 1))
                                .replace(
                                  "{1}",
                                  String(activeBuilderTab.cards.length)
                                )}
                            </span>

                            <div className="flex items-center gap-1.5">
                              <ActionButton
                                variant="glass"
                                icon={t("icon_arrow_upward", "arrow_upward")}
                                iconOnly={true}
                                disabled={cardIdx === 0}
                                onClick={() =>
                                  handleMoveCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    -1
                                  )
                                }
                                className="!w-8 !h-8 !rounded-xl"
                              />
                              <ActionButton
                                variant="glass"
                                icon={t(
                                  "icon_arrow_downward",
                                  "arrow_downward"
                                )}
                                iconOnly={true}
                                disabled={
                                  cardIdx >= activeBuilderTab.cards.length - 1
                                }
                                onClick={() =>
                                  handleMoveCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    1
                                  )
                                }
                                className="!w-8 !h-8 !rounded-xl"
                              />
                              {activeBuilderTab.cards.length > 1 && (
                                <ActionButton
                                  variant="danger"
                                  icon={t("icon_delete", "delete")}
                                  onClick={() =>
                                    handleDeleteCard(
                                      activeBuilderTabIdx,
                                      cardIdx
                                    )
                                  }
                                  className="!px-3 !py-1.5 !text-[10px] !rounded-xl"
                                >
                                  {t("dir_builder_delete_card", "Remove Card")}
                                </ActionButton>
                              )}
                            </div>
                          </div>

                          {/* Row 1: Icon Picker + Full-Width Card Title */}
                          <div className="flex items-end gap-3 w-full">
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setIconPickerTarget(
                                    iconPickerTarget?.type === "card" &&
                                      iconPickerTarget.cardIdx === cardIdx
                                      ? null
                                      : {
                                          type: "card",
                                          tabIdx: activeBuilderTabIdx,
                                          cardIdx,
                                        }
                                  )
                                }
                                className="h-10 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                                  {card.icon || t("icon_layers", "layers")}
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-wider">
                                  {t("visual_editor_icon_btn", "Icon")}
                                </span>
                                <span className="material-symbols-outlined !text-[14px] opacity-70">
                                  {t("icon_expand_more", "expand_more")}
                                </span>
                                <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                              </button>
                              {iconPickerTarget?.type === "card" &&
                                iconPickerTarget.tabIdx ===
                                  activeBuilderTabIdx &&
                                iconPickerTarget.cardIdx === cardIdx && (
                                  <div className="absolute left-0 top-12 z-[200]">
                                    <IconPicker
                                      onSelect={(icon) => {
                                        updateBuilderCard(
                                          activeBuilderTabIdx,
                                          cardIdx,
                                          { icon }
                                        );
                                        setIconPickerTarget(null);
                                      }}
                                      onClose={() => setIconPickerTarget(null)}
                                    />
                                  </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                {t("dir_builder_field_title", "Card Title")}
                              </label>
                              <input
                                value={card.title}
                                onChange={(e) =>
                                  updateBuilderCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    { title: e.target.value }
                                  )
                                }
                                className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                              />
                            </div>
                          </div>

                          {/* Row 2: Overline & Top-Right Status Badge (2 Columns Across Full Width) */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                {t(
                                  "dir_builder_field_overline",
                                  "Overline / Stage / Phase Label"
                                )}
                              </label>
                              <input
                                value={card.overline}
                                onChange={(e) =>
                                  updateBuilderCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    { overline: e.target.value }
                                  )
                                }
                                className="w-full glass-surface rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                {t(
                                  "dir_builder_field_badge",
                                  "Top-Right Status Badge"
                                )}
                              </label>
                              <input
                                value={card.badge}
                                onChange={(e) =>
                                  updateBuilderCard(
                                    activeBuilderTabIdx,
                                    cardIdx,
                                    { badge: e.target.value }
                                  )
                                }
                                className="w-full glass-surface rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                              />
                            </div>
                          </div>

                          {/* Row 3: Full-Width Card Description */}
                          <div className="flex flex-col gap-1 w-full">
                            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                              {t(
                                "dir_builder_field_desc",
                                "Full Description (Shows in Drawer)"
                              )}
                            </label>
                            <textarea
                              rows={3}
                              value={card.desc}
                              onChange={(e) =>
                                updateBuilderCard(
                                  activeBuilderTabIdx,
                                  cardIdx,
                                  { desc: e.target.value }
                                )
                              }
                              className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-normal text-[var(--text)] leading-relaxed focus:outline-none focus:theme-border-accent resize-y custom-scrollbar"
                            />
                          </div>

                          {/* Row 4: Inline Drawer Info Blocks / Milestones */}
                          <div className="pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 w-full">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                                  {t("icon_dashboard", "dashboard")}
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                                  {t(
                                    "dir_builder_subcards_heading",
                                    "Expanded Drawer Info Blocks / Milestones"
                                  )}{" "}
                                  ({(card.subCards || []).length})
                                </span>
                              </div>

                              <ActionButton
                                variant="accent"
                                icon={t("icon_add", "add")}
                                onClick={() =>
                                  handleAddSubCard(activeBuilderTabIdx, cardIdx)
                                }
                                className="!px-3 !py-1.5 !text-[10px] !rounded-xl"
                              >
                                {t(
                                  "dir_builder_add_subcard",
                                  "Add Drawer Item"
                                )}
                              </ActionButton>
                            </div>

                            {(card.subCards || []).length > 0 && (
                              <div className="flex flex-col gap-2.5 w-full">
                                {(card.subCards || []).map((sub, subIdx) => {
                                  const isSubExpanded =
                                    editingSubCardIdx === subIdx;

                                  if (!isSubExpanded) {
                                    /* UNSELECTED DRAWER INFO BLOCK: Full-Width Compact Row */
                                    return (
                                      <div
                                        key={sub.id || subIdx}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() =>
                                          setEditingSubCardIdx(subIdx)
                                        }
                                        onKeyDown={(e) => {
                                          if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                          ) {
                                            e.preventDefault();
                                            setEditingSubCardIdx(subIdx);
                                          }
                                        }}
                                        className="glass-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] opacity-65 hover:opacity-100 cursor-pointer transition-all w-full"
                                      >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                                            {sub.icon ||
                                              t(
                                                "icon_check_circle",
                                                "check_circle"
                                              )}
                                          </span>
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-xs font-bold text-[var(--text)] truncate">
                                              {renderCleanInlineText(sub.title)}
                                            </span>
                                            <span className="text-[11px] text-[color-mix(in_srgb,var(--text)_78%,transparent)] truncate">
                                              {renderCleanInlineText(sub.desc)}
                                            </span>
                                          </div>
                                        </div>

                                        <div
                                          className="flex items-center gap-1.5 shrink-0"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {activeCanonicalSlug ===
                                            "phase_roadmap" && (
                                            <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider mr-1 flex items-center gap-1.5">
                                              <span
                                                className={`material-symbols-outlined !text-[12px] ${
                                                  sub.pending
                                                    ? "text-[var(--accent)]"
                                                    : "text-[var(--success)]"
                                                }`}
                                              >
                                                {sub.pending
                                                  ? t("icon_rocket_launch", "rocket_launch")
                                                  : t("icon_check_circle", "check_circle")}
                                              </span>
                                              {sub.pending
                                                ? t(
                                                    "dir_builder_status_wip",
                                                    "In Progress"
                                                  )
                                                : t(
                                                    "status_completed",
                                                    "Completed"
                                                  )}
                                            </span>
                                          )}
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_arrow_upward",
                                              "arrow_upward"
                                            )}
                                            iconOnly={true}
                                            disabled={subIdx === 0}
                                            onClick={() =>
                                              handleMoveSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                -1
                                              )
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_arrow_downward",
                                              "arrow_downward"
                                            )}
                                            iconOnly={true}
                                            disabled={
                                              subIdx >=
                                              (card.subCards || []).length - 1
                                            }
                                            onClick={() =>
                                              handleMoveSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                1
                                              )
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_expand_more",
                                              "expand_more"
                                            )}
                                            iconOnly={true}
                                            onClick={() =>
                                              setEditingSubCardIdx(subIdx)
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                        </div>
                                      </div>
                                    );
                                  }

                                  /* SELECTED DRAWER INFO BLOCK: Expands In-Place at 100% Width */
                                  return (
                                    <div
                                      key={sub.id || subIdx}
                                      className="glass-surface rounded-xl p-4 flex flex-col gap-3.5 border !border-[color-mix(in_srgb,var(--text)_26%,transparent)] opacity-100 w-full animate-in fade-in duration-150"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--accent)]">
                                          {t(
                                            "dir_builder_editing_subcard",
                                            "Editing Drawer Item {0} of {1}"
                                          )
                                            .replace("{0}", String(subIdx + 1))
                                            .replace(
                                              "{1}",
                                              String(
                                                (card.subCards || []).length
                                              )
                                            )}
                                        </span>

                                        <div className="flex items-center gap-1.5">
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_arrow_upward",
                                              "arrow_upward"
                                            )}
                                            iconOnly={true}
                                            disabled={subIdx === 0}
                                            onClick={() =>
                                              handleMoveSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                -1
                                              )
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                          <ActionButton
                                            variant="glass"
                                            icon={t(
                                              "icon_arrow_downward",
                                              "arrow_downward"
                                            )}
                                            iconOnly={true}
                                            disabled={
                                              subIdx >=
                                              (card.subCards || []).length - 1
                                            }
                                            onClick={() =>
                                              handleMoveSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                1
                                              )
                                            }
                                            className="!w-7 !h-7 !rounded-lg"
                                          />
                                          <ActionButton
                                            variant="danger"
                                            icon={t("icon_delete", "delete")}
                                            onClick={() =>
                                              handleDeleteSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx
                                              )
                                            }
                                            className="!px-2.5 !py-1 !text-[9px] !rounded-lg"
                                          >
                                            {t("purge", "Delete")}
                                          </ActionButton>
                                          <ActionButton
                                            variant="accent"
                                            icon={t(
                                              "icon_expand_less",
                                              "expand_less"
                                            )}
                                            onClick={() =>
                                              setEditingSubCardIdx(null)
                                            }
                                            className="!px-2.5 !py-1 !text-[9px] !rounded-lg"
                                          >
                                            {t(
                                              "dir_builder_done_btn",
                                              "Done"
                                            )}
                                          </ActionButton>
                                        </div>
                                      </div>

                                      {/* Icon + Item Title */}
                                      <div className="flex items-end gap-3 w-full">
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setIconPickerTarget(
                                                iconPickerTarget?.type ===
                                                  "subcard" &&
                                                  iconPickerTarget.subIdx ===
                                                    subIdx
                                                  ? null
                                                  : {
                                                      type: "subcard",
                                                      tabIdx:
                                                        activeBuilderTabIdx,
                                                      cardIdx,
                                                      subIdx,
                                                    }
                                              )
                                            }
                                            className="h-10 px-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
                                          >
                                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                                              {sub.icon ||
                                                t(
                                                  "icon_check_circle",
                                                  "check_circle"
                                                )}
                                            </span>
                                            <span className="text-[10px] font-black uppercase tracking-wider">
                                              {t("visual_editor_icon_btn", "Icon")}
                                            </span>
                                            <span className="material-symbols-outlined !text-[14px] opacity-70">
                                              {t("icon_expand_more", "expand_more")}
                                            </span>
                                            <HoverTooltip title={t("visual_editor_pick_icon", "Pick Icon")} />
                                          </button>
                                          {iconPickerTarget?.type ===
                                            "subcard" &&
                                            iconPickerTarget.tabIdx ===
                                              activeBuilderTabIdx &&
                                            iconPickerTarget.cardIdx ===
                                              cardIdx &&
                                            iconPickerTarget.subIdx ===
                                              subIdx && (
                                              <div className="absolute left-0 top-12 z-[200]">
                                                <IconPicker
                                                  onSelect={(icon) => {
                                                    updateSubCard(
                                                      activeBuilderTabIdx,
                                                      cardIdx,
                                                      subIdx,
                                                      { icon }
                                                    );
                                                    setIconPickerTarget(null);
                                                  }}
                                                  onClose={() =>
                                                    setIconPickerTarget(null)
                                                  }
                                                />
                                              </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                            {t(
                                              "dir_builder_field_title",
                                              "Title"
                                            )}
                                          </label>
                                          <input
                                            value={sub.title}
                                            onChange={(e) =>
                                              updateSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                { title: e.target.value }
                                              )
                                            }
                                            placeholder={t(
                                              "dir_builder_subcard_title_ph",
                                              "Info block title..."
                                            )}
                                            className="w-full glass-surface rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                                          />
                                        </div>

                                        {activeCanonicalSlug ===
                                          "phase_roadmap" && (
                                          <ActionButton
                                            variant={
                                              sub.pending ? "accent" : "success"
                                            }
                                            icon={
                                              sub.pending
                                                ? t(
                                                    "icon_rocket_launch",
                                                    "rocket_launch"
                                                  )
                                                : t(
                                                    "icon_check_circle",
                                                    "check_circle"
                                                  )
                                            }
                                            onClick={() =>
                                              updateSubCard(
                                                activeBuilderTabIdx,
                                                cardIdx,
                                                subIdx,
                                                { pending: !sub.pending }
                                              )
                                            }
                                            className="!px-3 !py-2 !text-[10px] !rounded-xl shrink-0"
                                          >
                                            {sub.pending
                                              ? t(
                                                  "dir_builder_status_wip",
                                                  "In Progress"
                                                )
                                              : t(
                                                  "status_completed",
                                                  "Completed"
                                                )}
                                          </ActionButton>
                                        )}
                                      </div>

                                      {/* Full-Width Item Description */}
                                      <div className="flex flex-col gap-1 w-full">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                          {t(
                                            "dir_builder_field_desc",
                                            "Description"
                                          )}
                                        </label>
                                        <textarea
                                          rows={3}
                                          value={sub.desc}
                                          onChange={(e) =>
                                            updateSubCard(
                                              activeBuilderTabIdx,
                                              cardIdx,
                                              subIdx,
                                              { desc: e.target.value }
                                            )
                                          }
                                          placeholder={t(
                                            "dir_builder_subcard_desc_ph",
                                            "Concise description..."
                                          )}
                                          className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-normal text-[var(--text)] leading-relaxed focus:outline-none focus:theme-border-accent resize-y custom-scrollbar"
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 4. Bottom Action Bar + Liquid Glass Add Card Button */}
                  <div className="glass-panel p-3 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-wrap items-center justify-between gap-2.5">
                    <div className="px-2.5 py-1 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                        {t("icon_dashboard", "dashboard")}
                      </span>
                      <span>
                        {t("dir_builder_cards_list_heading", "Cards in Tab")} (
                        {activeBuilderTab.cards.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddCardToTab(activeBuilderTabIdx)}
                      className="h-8 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                        {t("icon_add_box", "add_box")}
                      </span>
                      <span>{t("dir_builder_add_card", "Add Card")}</span>
                    </button>
                  </div>
                </div>
              )}

            {/* =================================================================
                SHARED METADATA + UNIFIED 3-MODE EDITOR FOR NEWS / LEGAL
               ================================================================= */}
            {!activeCanonicalMeta && (
              <div className="flex flex-col gap-5 w-full">
                <UniversalGroup
                  title={t("metadata", "Metadata")}
                  icon={t("icon_tune", "tune")}
                >
                  <div className="flex flex-col gap-4 w-full">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                        {t("dir_builder_field_title", "Title")}
                      </label>
                      <input
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder={t("post_title_placeholder", "Enter title...")}
                        className="w-full glass-surface rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                      />
                    </div>

                    {editingRecordKind === "legal" && (
                      <LegalDocVersionInfoBlock />
                    )}

                    {editingRecordKind === "news" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                        <div className="flex flex-col gap-1.5 flex-1">
                          <label className="text-[9px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                            {t("category", "Category")}
                          </label>
                          <div className="h-12">
                            <CustomDropdown
                              disableTint={true}
                              searchable={false}
                              value={category}
                              onChange={(v: string[]) => {
                                setCategory(v[0]);
                                setIsDirty(true);
                              }}
                              options={NEWS_CATEGORIES.map((c) => ({
                                id: c,
                                label: c,
                              }))}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                          <label className="text-[9px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest">
                            {t("dispatch_meta_action", "Action Required")}
                          </label>
                          <div className="h-12">
                            <CustomDropdown
                              disableTint={true}
                              searchable={false}
                              value={actionRequired}
                              onChange={(v: string[]) => {
                                setActionRequired(v[0] || "No Action Required");
                                setIsDirty(true);
                              }}
                              options={[
                                {
                                  id: "No Action Required",
                                  label: t(
                                    "dispatch_action_none",
                                    "No Action Required"
                                  ),
                                },
                                {
                                  id: "Review Before Updating",
                                  label: t(
                                    "dispatch_action_review",
                                    "Review Before Updating"
                                  ),
                                },
                                {
                                  id: "Update Recommended",
                                  label: t(
                                    "dispatch_action_update_rec",
                                    "Update Recommended"
                                  ),
                                },
                                {
                                  id: "Immediate Action Required",
                                  label: t(
                                    "dispatch_action_immediate",
                                    "Immediate Action Required"
                                  ),
                                },
                              ]}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </UniversalGroup>

                <UnifiedPostBodyEditor
                  mode={editorMode}
                  onModeChange={(m) => switchEditorMode(m)}
                  content={content}
                  onContentChange={(nextMd) => {
                    setContent(nextMd);
                    setIsDirty(true);
                  }}
                  editor={editor}
                  placeholder={t(
                    "keepers_web_directives_body_ph",
                    "Write or add section boxes to preview how your post will look when published..."
                  )}
                />

                {editingRecordKind === "news" && (
                  <PostAttachmentsManager
                    content={content}
                    onContentChange={(nextMd) => {
                      setContent(nextMd);
                      setIsDirty(true);
                    }}
                    editor={editor}
                    onOpenAssetLinker={() => setIsAssetPanelOpen(true)}
                    imageUrl={imageUrl}
                    onImageUrlChange={(val) => {
                      setImageUrl(val);
                      setIsDirty(true);
                    }}
                    showCodeInput={showCodeInput}
                    onToggleCodeInput={setShowCodeInput}
                    codeSnippet={codeSnippet}
                    onCodeSnippetChange={(val) => {
                      setCodeSnippet(val);
                      setIsDirty(true);
                    }}
                    pollData={pollData}
                    onPollDataChange={(val) => {
                      setPollData(val);
                      setIsDirty(true);
                    }}
                  />
                )}
              </div>
            )}

            {/* =================================================================
                MODE B & C FOR CANONICAL DIRECTIVES (WHEN NOT IN VISUAL BUILDER)
               ================================================================= */}
            {activeCanonicalMeta && editorMode !== "visual" && (
              <UnifiedPostBodyEditor
                mode={editorMode}
                onModeChange={(m) => switchEditorMode(m)}
                content={content}
                onContentChange={(nextMd) => {
                  setContent(nextMd);
                  setIsDirty(true);
                }}
                editor={editor}
                hideModeTiles={true}
              />
            )}
          </div>
        </SidePanel>
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
          post={{
            ...previewPost,
            content: previewPost.message || previewPost.content || "",
          }}
          onClose={() => setPreviewPost(null)}
          userId={session?.user?.id || ""}
          onOpenMasonProfile={undefined}
          onAssetClick={(type: string, id: string) =>
            setActiveAsset({ type, id })
          }
        />
      )}

      {activeAsset && (
        <AssetPreviewSidebar
          assetType={activeAsset.type}
          assetId={activeAsset.id}
          onClose={() => setActiveAsset(null)}
        />
      )}
    </>
  );
}
