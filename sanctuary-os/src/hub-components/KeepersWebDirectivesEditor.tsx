import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Image from "@tiptap/extension-image";
import { IconPlugin } from "../utils/IconPlugin";
import {
  CustomDropdown,
  EmptyState,
  extractPostImage,
  getSafeEditorMarkdown,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
} from "../components/layouts/ElevatedHubLayout";
import { LiquidGlassAlertCard } from "../components/BlueprintPatchReadiness";
import { ReleaseNotesShowcase } from "../components/ReleaseNotesShowcase";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";
import {
  extractDispatchMetadata,
  DispatchPollData,
} from "../components/universal/DispatchPollAndMeta";
import {
  CANONICAL_DIRECTIVES,
  CANONICAL_LEGAL_DOCS,
  DIRECTIVE_ORDER,
  LEGAL_DOC_CATEGORIES,
  LegalDocCategory,
  DirectiveSlug,
  syncDirectivesBidirectional,
  syncLegalAndCovenantsBidirectional,
  saveDirectiveWithConcurrency,
  saveLegalDocWithConcurrency,
  pullKeepersCoreDirectivesToCodebase,
  hashNormalizedDoc,
} from "../utils/directivesSync";
import {
  useKeeperDocPresence,
  KeeperDocSavedBroadcast,
} from "../utils/useKeeperDocPresence";
import {
  CURRENT_DIRECTIVE_SCHEMA_VERSION,
  DirectiveBuilderSchema,
  extractDirectiveBuilderSchema,
  parseMarkdownToDirectiveSchema,
  stripDirectiveBuilderComment,
  embedDirectiveBuilderSchema,
  compileDirectiveSchemaToMarkdown,
  getDefaultDirectiveBuilderSchema,
} from "../utils/directivesBuilderSchema";

import {
  CATEGORY_TO_SLUG,
  NEWS_CATEGORIES,
  LEGAL_CATEGORIES,
  EditorRecordKind,
  EditorViewMode,
} from "./directives-editor/directivesEditorConstants";
import { useDirectivesBuilderActions } from "./directives-editor/useDirectivesBuilderActions";
import { useDirectivesCardRenderers } from "./directives-editor/DirectivesHubCards";
import { DirectivesEditorSidePanel } from "./directives-editor/DirectivesEditorSidePanel";

let cachedDirectiveCards: any[] | null = null;
let cachedNewsPosts: any[] | null = null;
let cachedLegalDocsMap: Record<string, any> | null = null;

function buildInitialCanonicalDirectiveCards(
  t: (key: string, fallback: string) => string
): any[] {
  const nowIso = new Date().toISOString();
  return DIRECTIVE_ORDER.map((slug) => {
    const def = CANONICAL_DIRECTIVES[slug];
    const extracted = extractDirectiveBuilderSchema(def.bundledContent, slug, t);
    return {
      id: slug,
      slug,
      record_kind: "directive" as EditorRecordKind,
      is_canonical_directive: true,
      file_name: def.file_path,
      version_tag: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: extracted?.title || def.title,
      description: extracted?.summary || def.summary,
      content: def.bundledContent,
      message: def.bundledContent,
      published_content: def.bundledContent,
      published_title: extracted?.title || def.title,
      published_summary: extracted?.summary || def.summary,
      published_at: nowIso,
      has_unpublished_changes: false,
      has_local_md_changes: false,
      revision: 1,
      updated_by: "Keepers Core",
      category: def.category,
      target_audience: "Public",
      action_required: "No Action Required",
      is_active: extracted?.isActive !== false,
      is_pinned: false,
      created_at: nowIso,
      updated_at: nowIso,
      mason_id: "system",
      masons: {
        name: "Sanctuary Foundry",
      },
    };
  });
}

function buildInitialCanonicalLegalDocsMap(): Record<string, any> {
  const map: Record<string, any> = {
    EULA: null,
    Privacy: null,
    Terms: null,
    PartnersAgreement: null,
    ComplianceProtocol: null,
  };
  const nowIso = new Date().toISOString();
  for (const legalCat of LEGAL_DOC_CATEGORIES) {
    const canonicalLegal = CANONICAL_LEGAL_DOCS[legalCat];
    if (canonicalLegal) {
      map[legalCat] = {
        id: `legal_${legalCat.toLowerCase()}`,
        title: canonicalLegal.title,
        message: canonicalLegal.bundledContent,
        content: canonicalLegal.bundledContent,
        published_title: canonicalLegal.title,
        published_content: canonicalLegal.bundledContent,
        published_at: nowIso,
        has_unpublished_changes: false,
        has_local_md_changes: false,
        revision: 1,
        updated_by: "Keepers Core",
        category: legalCat,
        file_name: canonicalLegal.file_path,
        created_at: nowIso,
        updated_at: nowIso,
        is_active: true,
        record_kind: "legal" as EditorRecordKind,
      };
    }
  }
  return map;
}

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

  const [directivePosts, setDirectivePosts] = useState<any[]>(
    () => cachedDirectiveCards || buildInitialCanonicalDirectiveCards(t)
  );
  const [newsPosts, setNewsPosts] = useState<any[]>(() => cachedNewsPosts || []);
  const [legalDocsMap, setLegalDocsMap] = useState<Record<string, any>>(
    () => cachedLegalDocsMap || buildInitialCanonicalLegalDocsMap()
  );

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
  const [wayfinderName, setWayfinderName] = useState<string>(
    () =>
      (session?.user?.user_metadata as any)?.username ||
      session?.user?.email?.split("@")[0] ||
      "Keeper"
  );
  const [baseRevision, setBaseRevision] = useState<number>(1);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string>("");
  const [baseContentHash, setBaseContentHash] = useState<string>("");
  const [conflictServerRow, setConflictServerRow] = useState<any | null>(null);
  const [isConflictSaveBlocked, setIsConflictSaveBlocked] = useState<boolean>(false);
  const pendingPublishIntentRef = useRef<boolean>(false);
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
  const [isVisualBuilderModified, setIsVisualBuilderModified] =
    useState<boolean>(false);
  const [iconPickerTarget, setIconPickerTarget] = useState<
    | { type: "card"; tabIdx: number; cardIdx: number }
    | { type: "subcard"; tabIdx: number; cardIdx: number; subIdx: number }
    | null
  >(null);

  const wayfinderDrafts = useStore((state) => state.wayfinderDrafts);
  const setWayfinderDrafts = useStore((state) => state.setWayfinderDrafts);

  const getDocKey = (
    kind: EditorRecordKind,
    slugOrCat?: string | null,
    postId?: string | null
  ): string => {
    if (kind === "directive") {
      return `directive:${slugOrCat || "citizen_guide"}`;
    }
    if (kind === "legal") {
      return `legal:${slugOrCat || "EULA"}`;
    }
    return `news:${postId || "new"}`;
  };

  const getScopedDraftKey = (docKey: string): string =>
    `${currentUserId || "anon"}::${docKey}`;

  const isStaleCanonicalDraft = (key: string, draftObj: any): boolean => {
    if (key.includes("::release:")) return false;
    const rawKey = key.includes("::directive:")
      ? key.split("::directive:")[1]
      : key.includes("::")
        ? key.split("::")[1]
        : key;

    if (!CANONICAL_DIRECTIVES[rawKey as DirectiveSlug]) {
      if (!draftObj?.isDirty) return true;
      if (!String(draftObj?.content || "").trim() && !draftObj?.builderSchema) {
        return true;
      }
      return Number(draftObj?._draftVersion || 0) < 4;
    }
    if (!draftObj?.isDirty || !draftObj?.userModified) return true;
    const schemaVer = Number(draftObj?.builderSchema?._schemaVersion || 0);
    if (schemaVer < CURRENT_DIRECTIVE_SCHEMA_VERSION) return true;
    if (
      rawKey === "phase_roadmap" &&
      ((draftObj?.builderSchema?.tabs?.length || 0) !== 1 ||
        (draftObj?.builderSchema?.tabs?.[0]?.cards?.[0]?.subCards?.length || 0) < 14)
    ) {
      return true;
    }
    const serialized = JSON.stringify(draftObj?.builderSchema || "");
    if (
      serialized.includes("[sd_") ||
      serialized.includes("Phase 12 → Phase 1") ||
      (rawKey === "phase_roadmap" &&
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

  const activeDocKey = useMemo(() => {
    if (editingRecordKind === "directive") {
      return getDocKey(
        "directive",
        activeCanonicalSlug || editingPost?.slug || CATEGORY_TO_SLUG[category]
      );
    }
    if (editingRecordKind === "legal") {
      return getDocKey("legal", category || editingPost?.category || "EULA");
    }
    return getDocKey("news", undefined, editingPostId);
  }, [editingRecordKind, activeCanonicalSlug, editingPost, category, editingPostId]);

  const isEditorOpenRef = useRef(isEditorOpen);
  const activeDocKeyRef = useRef(activeDocKey);
  const isDirtyRef = useRef(isDirty);
  const baseRevisionRef = useRef(baseRevision);
  isEditorOpenRef.current = isEditorOpen;
  activeDocKeyRef.current = activeDocKey;
  isDirtyRef.current = isDirty;
  baseRevisionRef.current = baseRevision;

  const fetchPostsRef = useRef<((refreshOpen?: boolean) => Promise<void>) | null>(
    null
  );
  const applyServerSnapshotRef = useRef<((serverRow: any, kind: EditorRecordKind) => void) | null>(
    null
  );

  const presence = useKeeperDocPresence({
    enabled: true,
    userId: currentUserId,
    username: wayfinderName,
    onRemoteDocSaved: async (event: KeeperDocSavedBroadcast) => {
      if (event.docKey.startsWith("release:")) {
        window.dispatchEvent(
          new CustomEvent("keepers_remote_doc_saved", { detail: event })
        );
        return;
      }

      if (!isEditorOpenRef.current || activeDocKeyRef.current !== event.docKey) {
        void fetchPostsRef.current?.(false);
        return;
      }

      void fetchPostsRef.current?.(false);

      if (event.docKey.startsWith("directive:")) {
        const slug = event.docKey.replace("directive:", "") as DirectiveSlug;
        const { data: latestRow } = await supabaseAuth
          .from("system_directives")
          .select("*")
          .eq("slug", slug)
          .maybeSingle();
        if (!latestRow) return;
        if (!isDirtyRef.current) {
          applyServerSnapshotRef.current?.(latestRow, "directive");
          useStore
            .getState()
            .pushStatus(
              t(
                "keeper_toast_reloaded_upstream",
                "Reloaded latest update from @{0} (v{1})."
              )
                .replace("{0}", event.updatedBy || "Keeper")
                .replace("{1}", String(latestRow.revision || event.revision)),
              "info"
            );
        } else {
          setConflictServerRow(latestRow);
          setIsConflictSaveBlocked(false);
        }
      } else if (event.docKey.startsWith("legal:")) {
        const legalCat = event.docKey.replace("legal:", "") as LegalDocCategory;
        const { data: latestRow } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .select("*")
          .eq("category", legalCat)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!latestRow) return;
        if (!isDirtyRef.current) {
          applyServerSnapshotRef.current?.(latestRow, "legal");
          useStore
            .getState()
            .pushStatus(
              t(
                "keeper_toast_reloaded_upstream",
                "Reloaded latest update from @{0} (v{1})."
              )
                .replace("{0}", event.updatedBy || "Keeper")
                .replace("{1}", String(latestRow.revision || event.revision)),
              "info"
            );
        } else {
          setConflictServerRow(latestRow);
          setIsConflictSaveBlocked(false);
        }
      }
    },
  });

  const wasEditorOpenRef = useRef(false);
  useEffect(() => {
    if (isEditorOpen) {
      wasEditorOpenRef.current = true;
      presence.trackEditingDoc(activeDocKey, title, isDirty);
    } else if (wasEditorOpenRef.current) {
      wasEditorOpenRef.current = false;
      presence.trackEditingDoc(null);
    }
  }, [isEditorOpen, activeDocKey, title, isDirty, presence.trackEditingDoc]);

  useEffect(() => {
    if (!isEditorOpen) return;
    const draftId = getScopedDraftKey(activeDocKey);

    const timer = setTimeout(() => {
      if (!isDirty) {
        setWayfinderDrafts((prev) => {
          const legacyId = editingPostId || "new";
          if (!prev[draftId] && !prev[legacyId]) return prev;
          const next = { ...prev };
          delete next[draftId];
          delete next[legacyId];
          return next;
        });
        return;
      }

      setWayfinderDrafts((prev) => ({
        ...prev,
        [draftId]: {
          _draftVersion: 5,
          baseRevision,
          baseUpdatedAt,
          baseContentHash,
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
    }, 350);

    return () => clearTimeout(timer);
  }, [
    isEditorOpen,
    isDirty,
    activeDocKey,
    currentUserId,
    editingPostId,
    baseRevision,
    baseUpdatedAt,
    baseContentHash,
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
    extensions: [StarterKit, Markdown, IconPlugin, Image],
    content: content,
    onUpdate: ({ editor: ed }) => {
      if (!ed || ed.isDestroyed || suppressEditorUpdateRef.current) return;
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        if (suppressEditorUpdateRef.current || !ed || ed.isDestroyed || !(ed.storage as any)?.markdown) return;
        const md = stripDirectiveBuilderComment(
          getSafeEditorMarkdown(ed)
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
      if (isVisualBuilderModified || !content.trim()) {
        const syncedSchema: DirectiveBuilderSchema = {
          ...builderSchema,
          title: title.trim() || builderSchema.title,
          summary: description.trim() || builderSchema.summary,
        };
        const compiled = compileDirectiveSchemaToMarkdown(syncedSchema);
        setContent(compiled);
        setEditorContentSilently(compiled);
      } else {
        setEditorContentSilently(stripDirectiveBuilderComment(content));
      }
    } else if (editorMode === "wysiwyg" && editor && !editor.isDestroyed) {
      const md = stripDirectiveBuilderComment(
        getSafeEditorMarkdown(editor) || content
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

  const applyServerSnapshotToEditor = (serverRow: any, kind: EditorRecordKind) => {
    if (!serverRow) return;
    if (kind === "directive") {
      const slug = (serverRow.slug || activeCanonicalSlug || "citizen_guide") as DirectiveSlug;
      const rawBody = serverRow.content || CANONICAL_DIRECTIVES[slug]?.bundledContent || "";
      const freshSchema =
        extractDirectiveBuilderSchema(rawBody, slug, t) ||
        getDefaultDirectiveBuilderSchema(slug, t);
      const cleanMd = stripDirectiveBuilderComment(rawBody);
      const nextRev = Number(serverRow.revision || 1);
      setEditingPost((prev: any) => ({
        ...(prev || {}),
        ...serverRow,
        content: rawBody,
        message: rawBody,
        revision: nextRev,
      }));
      setBaseRevision(nextRev);
      setBaseUpdatedAt(serverRow.updated_at || "");
      setBaseContentHash(hashNormalizedDoc(rawBody));
      setTitle(serverRow.title || freshSchema.title);
      setDescription(serverRow.summary || serverRow.description || freshSchema.summary);
      setIsActive(freshSchema.isActive !== false);
      setContent(cleanMd);
      setEditorContentSilently(cleanMd);
      setBuilderSchema({
        ...freshSchema,
        title: serverRow.title || freshSchema.title,
        summary: serverRow.summary || serverRow.description || freshSchema.summary,
        isActive: freshSchema.isActive !== false,
      });
      setIsVisualBuilderModified(false);
      setIsDirty(false);
      setConflictServerRow(null);
      setIsConflictSaveBlocked(false);
    } else if (kind === "legal") {
      const legalCat = (serverRow.category || category || "EULA") as LegalDocCategory;
      const canonicalLegal = CANONICAL_LEGAL_DOCS[legalCat];
      const rawBody =
        serverRow.message ||
        serverRow.content ||
        canonicalLegal?.bundledContent ||
        "";
      const cleanMd = stripDirectiveBuilderComment(rawBody);
      const nextRev = Number(serverRow.revision || 1);
      setEditingPost((prev: any) => ({
        ...(prev || {}),
        ...serverRow,
        message: rawBody,
        content: rawBody,
        revision: nextRev,
      }));
      setBaseRevision(nextRev);
      setBaseUpdatedAt(serverRow.updated_at || serverRow.created_at || "");
      setBaseContentHash(hashNormalizedDoc(rawBody));
      setTitle(serverRow.title || canonicalLegal?.title || legalCat);
      setContent(cleanMd);
      setEditorContentSilently(cleanMd);
      setIsDirty(false);
      setConflictServerRow(null);
      setIsConflictSaveBlocked(false);
    }
  };
  applyServerSnapshotRef.current = applyServerSnapshotToEditor;

  const fetchPostsAndAssets = async (refreshOpenDoc = false) => {
    setIsSyncing(true);
    try {
      const [dirResult, newsResult, legalResult] = await Promise.allSettled([
        syncDirectivesBidirectional({
          canWriteHub: true,
        }),
        supabaseAuth
          .from("system_broadcasts")
          .select("*")
          .in("category", NEWS_CATEGORIES)
          .ilike("target_audience", "%Public%")
          .order("created_at", { ascending: false }),
        syncLegalAndCovenantsBidirectional({
          canWriteHub: true,
        }),
      ]);

      let canonicalCards = directivePosts;
      if (dirResult.status === "fulfilled" && Array.isArray(dirResult.value)) {
        canonicalCards = dirResult.value.map((rec) => {
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
            published_content: rec.published_content || rec.content,
            published_title: rec.published_title || rec.title,
            published_summary: rec.published_summary || rec.summary,
            published_at: rec.published_at || rec.updated_at,
            has_unpublished_changes: Boolean(rec.has_unpublished_changes),
            has_local_md_changes: Boolean(rec.has_local_md_changes),
            local_md_content: rec.local_md_content,
            revision: Number(rec.revision || 1),
            updated_by: rec.updated_by || "Keepers Core",
            category: rec.category,
            target_audience: "Public",
            action_required: "No Action Required",
            is_active: extracted?.isActive !== false,
            is_pinned: false,
            created_at: rec.updated_at || new Date().toISOString(),
            updated_at: rec.updated_at || new Date().toISOString(),
            mason_id: "system",
            masons: {
              name: rec.updated_by || "Sanctuary Foundry",
            },
          };
        });
        cachedDirectiveCards = canonicalCards;
        setDirectivePosts(canonicalCards);
      }

      if (newsResult.status === "fulfilled" && Array.isArray(newsResult.value?.data)) {
        const mappedNews = newsResult.value.data.map((post: any) => ({
          ...post,
          record_kind: "news" as EditorRecordKind,
          mason_id: post.mason_id || "system",
          masons: {
            ...post.masons,
            name: "Sanctuary Foundry",
          },
        }));
        cachedNewsPosts = mappedNews;
        setNewsPosts(mappedNews);
      }

      let latestLegal = legalDocsMap;
      if (legalResult.status === "fulfilled" && legalResult.value) {
        const syncedLegalMap = legalResult.value;
        latestLegal = {
          EULA: null,
          Privacy: null,
          Terms: null,
          PartnersAgreement: null,
          ComplianceProtocol: null,
        };
        for (const legalCat of LEGAL_DOC_CATEGORIES) {
          const rec = syncedLegalMap[legalCat];
          const canonicalLegal = CANONICAL_LEGAL_DOCS[legalCat];
          if (rec || canonicalLegal) {
            const resolvedBody =
              rec?.message ||
              rec?.content ||
              canonicalLegal?.bundledContent ||
              "";
            const resolvedDate =
              rec?.updated_at ||
              rec?.created_at ||
              new Date().toISOString();
            latestLegal[legalCat] = {
              id: rec?.id || `legal_${legalCat.toLowerCase()}`,
              title: rec?.title || canonicalLegal?.title || legalCat,
              message: resolvedBody,
              content: resolvedBody,
              published_title: rec?.published_title || rec?.title || canonicalLegal?.title,
              published_content: rec?.published_content || resolvedBody,
              published_at: rec?.published_at || resolvedDate,
              has_unpublished_changes: Boolean(rec?.has_unpublished_changes),
              has_local_md_changes: Boolean(rec?.has_local_md_changes),
              local_md_content: rec?.local_md_content,
              revision: Number(rec?.revision || 1),
              updated_by: rec?.updated_by || "Keepers Core",
              category: legalCat,
              file_name: rec?.file_path || canonicalLegal?.file_path,
              created_at: resolvedDate,
              updated_at: resolvedDate,
              is_active: rec?.is_active !== false,
              record_kind: "legal" as EditorRecordKind,
            };
          }
        }
        cachedLegalDocsMap = latestLegal;
        setLegalDocsMap(latestLegal);
      }

      // Update currently open editor cleanly if not dirty, or surface upstream conflict if dirty
      if (isEditorOpenRef.current) {
        if (editingRecordKind === "directive" && activeCanonicalSlug) {
          const updatedCard = canonicalCards.find(
            (c) => c.slug === activeCanonicalSlug
          );
          if (updatedCard) {
            if (refreshOpenDoc && !isDirtyRef.current) {
              applyServerSnapshotToEditor(updatedCard, "directive");
            } else if (
              isDirtyRef.current &&
              Number(updatedCard.revision || 1) > baseRevisionRef.current
            ) {
              setConflictServerRow(updatedCard);
              setIsConflictSaveBlocked(false);
            }
          }
        } else if (editingRecordKind === "legal" && category) {
          const updatedLegal = latestLegal[category];
          if (updatedLegal) {
            if (refreshOpenDoc && !isDirtyRef.current) {
              applyServerSnapshotToEditor(updatedLegal, "legal");
            } else if (
              isDirtyRef.current &&
              Number(updatedLegal.revision || 1) > baseRevisionRef.current
            ) {
              setConflictServerRow(updatedLegal);
              setIsConflictSaveBlocked(false);
            }
          }
        }
      }

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
  fetchPostsRef.current = fetchPostsAndAssets;

  useEffect(() => {
    fetchPostsAndAssets(!isDirtyRef.current);
    const onRefresh = () => {
      void fetchPostsRef.current?.(!isDirtyRef.current);
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

  const handleRefreshFromHub = async () => {
    setIsSyncing(true);
    try {
      await fetchPostsAndAssets(!isDirtyRef.current);
      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      window.dispatchEvent(
        new CustomEvent("keepers_release_posts_updated", {
          detail: { syncDirection: "hub_only" },
        })
      );
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_sync_toast_refreshed_hub",
            "Refreshed working & published state from Keepers Core!"
          ),
          "success"
        );
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullPublishedToCodebase = async () => {
    setIsSyncing(true);
    try {
      await pullKeepersCoreDirectivesToCodebase();
      await fetchPostsAndAssets(!isDirtyRef.current);
      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      window.dispatchEvent(
        new CustomEvent("keepers_release_posts_updated", {
          detail: { syncDirection: "hub_to_local" },
        })
      );
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_sync_toast_pulled",
            "Synced all published directives, covenants, and release notes to local .md fallback files!"
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
        shortBadge: t("spoke_badge_zero_malware", "Core + Spoke AV"),
        icon: t("icon_verified_user", "verified_user"),
        desc: t(
          "spoke_card_compliance_desc",
          "Bytecode Hound Core + Spoke heuristic malware matrix, Zero-PII telemetry guarantees, and age-gating rules."
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
    setConflictServerRow(null);
    setIsConflictSaveBlocked(false);

    const recordKind: EditorRecordKind =
      forcedKind ||
      post?.record_kind ||
      (post?.is_canonical_directive || CATEGORY_TO_SLUG[post?.category]
        ? "directive"
        : LEGAL_CATEGORIES.includes(post?.category)
          ? "legal"
          : "news");

    setEditingRecordKind(recordKind);

    const resolvedDirectiveSlug: DirectiveSlug | null =
      recordKind === "directive"
        ? (post?.slug && CANONICAL_DIRECTIVES[post.slug as DirectiveSlug]
          ? (post.slug as DirectiveSlug)
          : CATEGORY_TO_SLUG[post?.category]) || "citizen_guide"
        : null;

    const docKey =
      recordKind === "legal"
        ? getDocKey("legal", post?.category || "EULA")
        : recordKind === "directive"
          ? getDocKey("directive", resolvedDirectiveSlug)
          : getDocKey("news", undefined, post?.id || "new");

    const scopedDraftId = getScopedDraftKey(docKey);
    const legacyDraftId = post ? post.id : `new_${recordKind}`;
    const draftsState = useStore.getState().wayfinderDrafts;
    const rawDraft = (draftsState[scopedDraftId] ??
      draftsState[legacyDraftId]) as any;
    const isStale = isStaleCanonicalDraft(scopedDraftId, rawDraft);
    if (isStale && rawDraft) {
      setWayfinderDrafts((prev) => {
        const next = { ...prev };
        delete next[scopedDraftId];
        delete next[legacyDraftId];
        return next;
      });
    }
    const draft = !isStale && rawDraft?.isDirty ? rawDraft : undefined;
    setIsDirty(Boolean(draft?.isDirty));
    setIsVisualBuilderModified(false);

    if (recordKind === "legal") {
      const legalCategory = (post?.category || "EULA") as LegalDocCategory;
      const existingDoc = legalDocsMap[legalCategory] || post;
      const canonicalLegal = CANONICAL_LEGAL_DOCS[legalCategory];
      const defaultDef =
        legalDefinitions.find((d) => d.id === legalCategory) ||
        legalDefinitions[0];
      const serverRev = Number(existingDoc?.revision || 1);
      const serverUpdated =
        existingDoc?.updated_at || existingDoc?.created_at || "";
      const rawServerBody =
        existingDoc?.message ||
        existingDoc?.content ||
        canonicalLegal?.bundledContent ||
        "";

      setBaseRevision(Number(draft?.baseRevision || serverRev));
      setBaseUpdatedAt(String(draft?.baseUpdatedAt || serverUpdated));
      setBaseContentHash(
        String(draft?.baseContentHash || hashNormalizedDoc(rawServerBody))
      );
      if (
        draft?.isDirty &&
        draft?.baseRevision &&
        serverRev > Number(draft.baseRevision) &&
        existingDoc
      ) {
        setConflictServerRow(existingDoc);
      }

      const nextTitle =
        (draft?.title && draft.title.trim()) ||
        existingDoc?.title ||
        canonicalLegal?.title ||
        defaultDef.label;
      const rawLegalBody =
        (draft?.content && draft.content.trim()) ||
        existingDoc?.message ||
        existingDoc?.content ||
        canonicalLegal?.bundledContent ||
        "";
      const nextContent = stripDirectiveBuilderComment(rawLegalBody);

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
      const serverRev = Number(post.revision || 1);
      const serverUpdated = post.updated_at || post.created_at || "";
      const rawServerBody = post.content || post.message || "";

      setBaseRevision(Number(draft?.baseRevision || serverRev));
      setBaseUpdatedAt(String(draft?.baseUpdatedAt || serverUpdated));
      setBaseContentHash(
        String(draft?.baseContentHash || hashNormalizedDoc(rawServerBody))
      );
      if (
        draft?.isDirty &&
        draft?.baseRevision &&
        serverRev > Number(draft.baseRevision)
      ) {
        setConflictServerRow(post);
      }

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
      setBaseRevision(1);
      setBaseUpdatedAt("");
      setBaseContentHash("");
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
    setConflictServerRow(null);
    setIsConflictSaveBlocked(false);
    pendingPublishIntentRef.current = false;
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


  const handleSubmit = async (
    e?: React.FormEvent,
    publishLive = false,
    forceOverwrite = false
  ) => {
    if (e) e.preventDefault();
    pendingPublishIntentRef.current = publishLive;

    let finalMarkdownBody = stripDirectiveBuilderComment(content);
    if (editor && !editor.isDestroyed && editorMode === "wysiwyg") {
      finalMarkdownBody = stripDirectiveBuilderComment(
        getSafeEditorMarkdown(editor) || content
      );
      setContent(finalMarkdownBody);
    }

    // 1. Saving a Legal or Sovereign Covenant Document (Shared Hub Draft or Live Publish)
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
      const docKey = getDocKey("legal", legalCat);
      const scopedDraftId = getScopedDraftKey(docKey);

      const saveRes = await saveLegalDocWithConcurrency({
        id:
          existingDoc?.id && !String(existingDoc.id).startsWith("legal_")
            ? existingDoc.id
            : undefined,
        category: legalCat,
        title: legalTitle,
        content: finalMarkdownBody.trim(),
        updated_by: wayfinderName,
        publishLive,
        expectedRevision: baseRevision,
        forceOverwrite,
      });

      if (saveRes.conflict && saveRes.serverRow) {
        setConflictServerRow(saveRes.serverRow);
        setIsConflictSaveBlocked(true);
        setIsSubmitting(false);
        useStore
          .getState()
          .pushStatus(
            t(
              "keeper_conflict_blocked_title",
              "Save paused — newer revision detected on Keepers Core"
            ),
            "warning"
          );
        return;
      }

      if (saveRes.ok && !saveRes.error) {
        const nextRev = Number(saveRes.row?.revision || baseRevision + 1);
        setConflictServerRow(null);
        setIsConflictSaveBlocked(false);
        useStore.getState().setWayfinderDrafts((prev) => {
          const next = { ...prev };
          delete next[scopedDraftId];
          if (editingPostId) delete next[editingPostId];
          return next;
        });

        await logArchitectAction(
          publishLive
            ? "Published Legal & Covenant Doc Live (Hub + .md)"
            : "Saved Shared Legal Draft (Hub DB)",
          "keeper_system_broadcasts",
          `${legalTitle} (${CANONICAL_LEGAL_DOCS[legalCat].file_path})`,
          undefined,
          "Keepers Core",
          true,
          {
            title: { to: legalTitle },
            category: { to: legalCat },
            published_live: { to: publishLive },
            is_active: { to: true },
          }
        );
        presence.broadcastDocSaved({
          docKey,
          revision: nextRev,
          updatedBy: wayfinderName,
          updatedAt: saveRes.row?.updated_at || new Date().toISOString(),
          published: publishLive,
        });
        window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
        closeEditor();
        await fetchPostsAndAssets();
        useStore
          .getState()
          .pushStatus(
            publishLive
              ? t(
                "dir_toast_published_live",
                "Published live to {Citizens} and synced with local .md file!"
              )
              : t(
                "dir_toast_staged_hub",
                "Saved shared draft to Keepers Core! Click Publish when ready to push live & sync .md."
              ),
            "success"
          );
      } else {
        useStore
          .getState()
          .pushStatus(
            `Failed to save: ${saveRes.error?.message || "Unknown error"}`,
            "error"
          );
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
      if ((editorMode === "visual" && isVisualBuilderModified) || !finalMarkdownBody.trim()) {
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
      const docKey = getDocKey("directive", canonicalSlug);
      const scopedDraftId = getScopedDraftKey(docKey);
      const saveRes = await saveDirectiveWithConcurrency({
        slug: canonicalSlug,
        title: syncedSchema.title,
        summary: syncedSchema.summary || meta?.summary || "",
        category: category,
        content: payloadContent,
        updated_by: wayfinderName,
        publishLive,
        expectedRevision: baseRevision,
        forceOverwrite,
      });

      if (saveRes.conflict && saveRes.serverRow) {
        setConflictServerRow(saveRes.serverRow);
        setIsConflictSaveBlocked(true);
        setIsSubmitting(false);
        useStore
          .getState()
          .pushStatus(
            t(
              "keeper_conflict_blocked_title",
              "Save paused — newer revision detected on Keepers Core"
            ),
            "warning"
          );
        return;
      }

      if (saveRes.ok && !saveRes.error) {
        const nextRev = Number(saveRes.row?.revision || baseRevision + 1);
        setConflictServerRow(null);
        setIsConflictSaveBlocked(false);

        await logArchitectAction(
          publishLive
            ? "Published System Directive Live (User Side + .md + DB)"
            : "Saved Shared Directive Draft (Hub DB)",
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
            published_live: { to: publishLive },
          }
        );

        useStore.getState().setWayfinderDrafts((prev) => {
          const next = { ...prev };
          delete next[scopedDraftId];
          delete next[canonicalSlug];
          delete next[editingPostId || "new"];
          return next;
        });

        presence.broadcastDocSaved({
          docKey,
          revision: nextRev,
          updatedBy: wayfinderName,
          updatedAt: saveRes.row?.updated_at || new Date().toISOString(),
          published: publishLive,
        });
        window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
        closeEditor();
        await fetchPostsAndAssets();
        useStore
          .getState()
          .pushStatus(
            publishLive
              ? t(
                "dir_toast_published_live",
                "Published live to {Citizens} and synced with local .md file!"
              )
              : t(
                "dir_toast_staged_hub",
                "Saved shared draft to Keepers Core! Click Publish when ready to push live & sync .md."
              ),
            "success"
          );
      } else {
        useStore
          .getState()
          .pushStatus(
            `Failed to save: ${saveRes.error?.message || "Unknown error"}`,
            "error"
          );
      }
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
        computeAuditDiff(editingPostId ? editingPost : null, payload)
      );
      useStore.getState().setWayfinderDrafts((prev) => {
        const next = { ...prev };
        delete next[getScopedDraftKey(activeDocKey)];
        delete next[editingPostId || "new"];
        delete next["new_news"];
        return next;
      });
      presence.broadcastDocSaved({
        docKey: getDocKey(
          "news",
          undefined,
          editingPostId || res.data?.[0]?.id || "new"
        ),
        revision: 1,
        updatedBy: wayfinderName,
        updatedAt: new Date().toISOString(),
        published: isActive,
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

  const {
    handleDiscardChanges,
    handleImportLocalMdToDraft,
    handleLoadLatestFromHub,
    handleOverwriteHubWithMine,
    handleResetBuilderToDefault,
    updateBuilderCard,
    handleAddCardToTab,
    handleMoveCard,
    handleDeleteCard,
    handleAddSubCard,
    updateSubCard,
    handleMoveSubCard,
    handleDeleteSubCard,
    handlePublishDirectiveCard,
    handlePublishLegalCard,
    handleDelete,
  } = useDirectivesBuilderActions({
    t,
    newsPosts,
    setTitle,
    setDescription,
    category,
    setContent,
    setIsSubmitting,
    editingPostId,
    editingPost,
    editingRecordKind,
    wayfinderName,
    baseRevision,
    setBaseRevision,
    setBaseUpdatedAt,
    setBaseContentHash,
    setConflictServerRow,
    conflictServerRow,
    setIsConflictSaveBlocked,
    pendingPublishIntentRef,
    confirmDiscard,
    setConfirmDiscard,
    setBuilderSchema,
    builderSchema,
    activeBuilderTabIdx,
    setActiveBuilderTabIdx,
    setSelectedBuilderCardIdx,
    setEditingSubCardIdx,
    setIsDirty,
    setIsVisualBuilderModified,
    setWayfinderDrafts,
    getDocKey,
    getScopedDraftKey,
    activeCanonicalSlug,
    activeDocKey,
    presence,
    setEditorContentSilently,
    applyServerSnapshotToEditor,
    fetchPostsAndAssets,
    openEditor,
    closeEditor,
    handleSubmit,
  });

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
  const {
    renderCanonicalDirectiveCard,
    renderNewsCard,
    renderLegalCard,
  } = useDirectivesCardRenderers({
    t,
    legalDocsMap,
    isSubmitting,
    isSyncing,
    wayfinderDrafts,
    getDocKey,
    getScopedDraftKey,
    isStaleCanonicalDraft,
    presence,
    legalDefinitions,
    openEditor,
    handlePublishDirectiveCard,
    handlePublishLegalCard,
  });

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
      hideActiveTabHeading={activeViewTab === "news"}
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
          id: "refresh_hub",
          icon: t("icon_sync", "sync"),
          label: t("dir_sync_btn_refresh_hub", "Refresh from Hub"),
          onClick: handleRefreshFromHub,
        },
        {
          id: "pull_published_md",
          icon: t("icon_system_update_alt", "system_update_alt"),
          label: t("dir_sync_btn_pull_published", "Pull Published → .md"),
          onClick: handlePullPublishedToCodebase,
        },
      ]}
    >
      {activeViewTab === "overview" && (
        <HubOverviewLanding>
          {/* Full-Width Top Section: Update Post System (Public Stable Release & Dev Build) */}
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
            <ReleaseNotesShowcase
              isKeepers={true}
              presence={presence}
              keeperName={wayfinderName}
            />
          </HubOverviewSection>

          {/* Column 1 (2x2): Recent Edits */}
          <HubOverviewSection
            icon={t("icon_edit_note", "edit_note")}
            iconColorClass="text-[var(--accent)]"
            title={t("web_landing_sec_recent_edits", "Recent Edits")}
            headerAction={
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_arrow_forward", "arrow_forward")}
                  tooltip={t("web_landing_tab_directives", "Directives")}
                  onClick={() => setActiveViewTab("directives")}
                />
              </PanelHeaderGroup>
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
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t("icon_arrow_forward", "arrow_forward")}
                  tooltip={t("landing_news_short", "News")}
                  onClick={() => setActiveViewTab("news")}
                />
              </PanelHeaderGroup>
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
            <ReleaseNotesShowcase
              isKeepers={true}
              presence={presence}
              keeperName={wayfinderName}
            />
          </HubOverviewSection>

          <HubOverviewSection
            icon={t("icon_newspaper", "newspaper")}
            iconColorClass="text-[var(--accent)]"
            title={t("sidebar_sanctuary_news", "Sanctuary Foundry News")}
            gridClassName="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {!searchTerm.trim() && filterCategory === "All" && (
              <LiquidGlassAlertCard
                isAlertCard={false}
                icon={t("icon_add_circle", "add_circle")}
                accentVar="var(--accent)"
                iconColorClass="text-[var(--accent)]"
                badgeIcon={t("icon_newspaper", "newspaper")}
                badgeLabel={t("landing_news_short", "News")}
                overline={t("sidebar_sanctuary_news", "Sanctuary Foundry News")}
                title={t("post_broadcast", "New {Dispatch}")}
                description={t(
                  "dispatch_hub_desc",
                  "Broadcast system updates, alerts, and telemetry across the network."
                )}
                actionLabel={t("post_broadcast", "New {Dispatch}")}
                actionIcon={t("icon_add", "add")}
                actionVariant="glass"
                onAction={() => openEditor(undefined, 0, "news")}
                onClick={() => openEditor(undefined, 0, "news")}
              />
            )}
            {filteredNews.length === 0 && (Boolean(searchTerm.trim()) || filterCategory !== "All") ? (
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

      <DirectivesEditorSidePanel
        session={session}
        t={t}
        title={title}
        setTitle={setTitle}
        category={category}
        setCategory={setCategory}
        actionRequired={actionRequired}
        setActionRequired={setActionRequired}
        pollData={pollData}
        setPollData={setPollData}
        content={content}
        setContent={setContent}
        imageUrl={imageUrl}
        setImageUrl={setImageUrl}
        isSubmitting={isSubmitting}
        isSyncing={isSyncing}
        editingPostId={editingPostId}
        editingPost={editingPost}
        editingRecordKind={editingRecordKind}
        previewPost={previewPost}
        setPreviewPost={setPreviewPost}
        codeSnippet={codeSnippet}
        setCodeSnippet={setCodeSnippet}
        showCodeInput={showCodeInput}
        setShowCodeInput={setShowCodeInput}
        conflictServerRow={conflictServerRow}
        setConflictServerRow={setConflictServerRow}
        isConflictSaveBlocked={isConflictSaveBlocked}
        setIsConflictSaveBlocked={setIsConflictSaveBlocked}
        setIsAssetPanelOpen={setIsAssetPanelOpen}
        isAssetPanelOpen={isAssetPanelOpen}
        setActiveAsset={setActiveAsset}
        activeAsset={activeAsset}
        isEditorOpen={isEditorOpen}
        confirmDiscard={confirmDiscard}
        isActive={isActive}
        setIsActive={setIsActive}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        editorMode={editorMode}
        setBuilderSchema={setBuilderSchema}
        builderSchema={builderSchema}
        activeBuilderTabIdx={activeBuilderTabIdx}
        setActiveBuilderTabIdx={setActiveBuilderTabIdx}
        setSelectedBuilderCardIdx={setSelectedBuilderCardIdx}
        setEditingSubCardIdx={setEditingSubCardIdx}
        editingSubCardIdx={editingSubCardIdx}
        isDirty={isDirty}
        setIsDirty={setIsDirty}
        setIconPickerTarget={setIconPickerTarget}
        iconPickerTarget={iconPickerTarget}
        baseRevision={baseRevision}
        activeCanonicalSlug={activeCanonicalSlug}
        activeCanonicalMeta={activeCanonicalMeta}
        activeDocKey={activeDocKey}
        presence={presence}
        editor={editor}
        switchEditorMode={switchEditorMode}
        handleLinkAsset={handleLinkAsset}
        closeEditor={closeEditor}
        handleDiscardChanges={handleDiscardChanges}
        handleImportLocalMdToDraft={handleImportLocalMdToDraft}
        handleLoadLatestFromHub={handleLoadLatestFromHub}
        handleOverwriteHubWithMine={handleOverwriteHubWithMine}
        handleResetBuilderToDefault={handleResetBuilderToDefault}
        updateBuilderCard={updateBuilderCard}
        handleAddCardToTab={handleAddCardToTab}
        handleMoveCard={handleMoveCard}
        handleDeleteCard={handleDeleteCard}
        handleAddSubCard={handleAddSubCard}
        updateSubCard={updateSubCard}
        handleMoveSubCard={handleMoveSubCard}
        handleDeleteSubCard={handleDeleteSubCard}
        handleSubmit={handleSubmit}
        handleDelete={handleDelete}
        activeBuilderTab={activeBuilderTab}
        safeSelectedCardIdx={safeSelectedCardIdx}
        activeBuilderCard={activeBuilderCard}
      />
    </>
  );
}
