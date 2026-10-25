import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, supabaseAuth } from '../supabase';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { IconPlugin } from '../IconPlugin';
import {
  SidePanel,
  CustomDropdown,
  HoverTooltip,
  EmptyState,
  extractPostImage,
  PanelHeaderGroup,
  PanelHeaderButton,
  LinkAssetSidePanel,
  DashboardStatTile,
  ActionButton,
} from "../shared";
import {
  ElevatedHubLayout,
  SidePanelTitleInput,
} from "../components/layouts/ElevatedHubLayout";
import MasonPostCard from "../MasonPostCard";
import IconPicker from "../IconPicker";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import { logArchitectAction } from "../lib/audit";
import {
  extractDispatchMetadata,
  DispatchMetadataHeader,
  DispatchPollBuilder,
  DispatchPollData,
} from "../components/universal/DispatchPollAndMeta";
import {
  CANONICAL_DIRECTIVES,
  DirectiveSlug,
  syncDirectivesBidirectional,
  saveDirectiveBothWays,
  pushCodebaseDirectivesToKeepersCore,
  pullKeepersCoreDirectivesToCodebase,
} from "../utils/directivesSync";
import {
  DirectiveBuilderSchema,
  DirectiveBuilderCard,
  DirectiveBuilderSubCard,
  extractDirectiveBuilderSchema,
  stripDirectiveBuilderComment,
  embedDirectiveBuilderSchema,
  compileDirectiveSchemaToMarkdown,
  getDefaultDirectiveBuilderSchema,
} from "../utils/directivesBuilderSchema";

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

export default function KeepersWebDirectivesEditor({
  isSidePanel = false,
}: any = {}) {
  const session = useStore((state) => state.session);
  const currentUserId = session?.user?.id;
  const { t } = useLexicon();

  const [posts, setPosts] = useState<any[]>([]);
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
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [codeSnippet, setCodeSnippet] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [inlineImageUrl, setInlineImageUrl] = useState("");

  const [, setWayfinderName] = useState<string>("");
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [activeAsset, setActiveAsset] = useState<{ type: string; id: string } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [filterCategory, setFilterCategory] = useState("All");
  const [activeViewTab, setActiveViewTab] = useState<string>("all");

  // Visual Card & Drawer Builder State
  const [editorMode, setEditorMode] = useState<"visual" | "markdown">("visual");
  const [builderSchema, setBuilderSchema] = useState<DirectiveBuilderSchema | null>(null);
  const [activeBuilderTabIdx, setActiveBuilderTabIdx] = useState<number>(0);
  const [selectedBuilderCardIdx, setSelectedBuilderCardIdx] = useState<number>(0);
  const [editingSubCardIdx, setEditingSubCardIdx] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [iconPickerTarget, setIconPickerTarget] = useState<
    | { type: "card"; tabIdx: number; cardIdx: number }
    | { type: "subcard"; tabIdx: number; cardIdx: number; subIdx: number }
    | null
  >(null);

  const wayfinderDrafts = useStore((state) => state.wayfinderDrafts);
  const setWayfinderDrafts = useStore((state) => state.setWayfinderDrafts);

  // Clean up any stale auto-generated canonical drafts that were created without user edits
  useEffect(() => {
    setWayfinderDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (
          CANONICAL_DIRECTIVES[k as DirectiveSlug] &&
          !(next[k] as any)?.isDirty
        ) {
          delete next[k];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const activeCanonicalSlug: DirectiveSlug | null = useMemo(() => {
    if (
      editingPost?.slug &&
      Boolean(CANONICAL_DIRECTIVES[editingPost.slug as DirectiveSlug])
    ) {
      return editingPost.slug as DirectiveSlug;
    }
    return CATEGORY_TO_SLUG[category] || null;
  }, [editingPost, category]);

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

  const editor = useEditor({
    extensions: [StarterKit, Markdown, IconPlugin, Image, Link],
    content: content,
    onUpdate: ({ editor }) => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(() => {
        setContent((editor.storage as any).markdown.getMarkdown());
      }, 400);
    },
    editorProps: {
      attributes: {
        class:
          "w-full flex-1 px-6 py-6 text-[var(--text)] text-sm font-sans focus:outline-none custom-scrollbar min-h-[350px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-[var(--accent)] [&_img]:rounded-xl [&_img]:max-w-full [&_code]:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_code]:px-1 [&_code]:rounded [&_hr]:border-[color-mix(in_srgb,var(--text)_10%,transparent)] [&_hr]:my-8",
      },
    },
  });

  const fetchPostsAndAssets = async () => {
    setIsSyncing(true);
    try {
      const syncedList = await syncDirectivesBidirectional({
        canWriteHub: true,
      });

      const canonicalCards = syncedList.map((rec) => ({
        id: rec.slug,
        slug: rec.slug,
        is_canonical_directive: true,
        file_name: rec.file_path,
        version_tag: rec.version,
        title: rec.title,
        description: rec.summary,
        content: rec.content,
        message: rec.content,
        category: rec.category,
        target_audience: "Public",
        action_required: "No Action Required",
        is_active: true,
        is_pinned: false,
        created_at: rec.updated_at || new Date().toISOString(),
        updated_at: rec.updated_at || new Date().toISOString(),
        mason_id: "system",
        masons: {
          name: "Sanctuary Foundry",
        },
      }));

      const { data: broadcastData } = await supabaseAuth
        .from("system_broadcasts")
        .select("*")
        .in("category", [
          "Citizen Guide",
          "Forking Guide",
          "Master Architecture",
          "Master Protocol List",
          "Phase Roadmap",
        ])
        .ilike("target_audience", "%Public%")
        .order("created_at", { ascending: false });

      const canonicalTitles = new Set([
        "official citizen guide",
        "phase 12 - agnostic future",
        "master architecture & feature document",
        "master protocol list",
        ...canonicalCards.map((c: any) => (c.title || "").trim().toLowerCase()),
      ]);

      const extraBroadcasts = (broadcastData || [])
        .filter(
          (post: any) =>
            !canonicalTitles.has((post.title || "").trim().toLowerCase())
        )
        .map((post: any) => ({
          ...post,
          mason_id: post.mason_id || "system",
          masons: {
            ...post.masons,
            name: "Sanctuary Foundry",
          },
        }));

      setPosts([...canonicalCards, ...extraBroadcasts]);

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
    fetchPostsAndAssets();
  }, []);

  const handleTwoWaySync = async () => {
    setIsSyncing(true);
    try {
      await fetchPostsAndAssets();
      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_sync_toast_synced",
            "Directives synchronized between Keepers Core & Codebase (.md)!"
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
      await pushCodebaseDirectivesToKeepersCore(
        currentUserId || "Keepers Core"
      );
      await fetchPostsAndAssets();
      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_sync_toast_pushed",
            "Pushed all 5 local .md files to Keepers Core!"
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
      await pullKeepersCoreDirectivesToCodebase();
      await fetchPostsAndAssets();
      window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_sync_toast_pulled",
            "Pulled all 5 directives from Keepers Core to local .md files!"
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
    const translatedType =
      t(typeKey) !== typeKey
        ? t(typeKey)
        : asset.type === "mod"
        ? "Artifact"
        : asset.type === "blueprint"
        ? "Blueprint"
        : asset.type === "chameleon"
        ? "Theme"
        : "Lexicon";
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

  const openEditor = (post?: any, initialTabIdx = 0) => {
    setConfirmDelete(null);
    setIconPickerTarget(null);
    setEditingSubCardIdx(null);
    const draftId = post ? post.id : "new";
    const rawDraft = useStore.getState().wayfinderDrafts[draftId] as any;
    const draft = rawDraft?.isDirty ? rawDraft : undefined;
    setIsDirty(Boolean(draft?.isDirty));

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
      const nextCat = draft?.category ?? (post.category || "Citizen Guide");
      const slug: DirectiveSlug | null =
        (post.slug && CANONICAL_DIRECTIVES[post.slug as DirectiveSlug]
          ? (post.slug as DirectiveSlug)
          : null) ||
        CATEGORY_TO_SLUG[nextCat] ||
        null;

      setTitle(nextTitle);
      setDescription(nextDesc);
      setTargetAudience(
        draft?.targetAudience ??
          (post.target_audience ? post.target_audience.split(",") : ["All"])
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
      if (editor) {
        editor.commands.setContent(cleanMarkdown);
      }
      setImageUrl(draft?.imageUrl ?? parsedImage);

      if (slug) {
        const extractedSchema =
          draft?.builderSchema ||
          extractDirectiveBuilderSchema(parsedMeta.cleanContent) ||
          getDefaultDirectiveBuilderSchema(slug, t);
        setBuilderSchema({
          ...extractedSchema,
          title: nextTitle || extractedSchema.title,
          summary: nextDesc || extractedSchema.summary,
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
        setEditorMode("markdown");
      }
    } else {
      const defaultCat = draft?.category ?? "Citizen Guide";
      const defaultSlug = CATEGORY_TO_SLUG[defaultCat] || "citizen_guide";
      const defaultSchema =
        draft?.builderSchema ||
        getDefaultDirectiveBuilderSchema(defaultSlug, t);

      setEditingPostId(null);
      setEditingPost(null);
      setTitle(draft?.title ?? defaultSchema.title);
      setDescription(draft?.description ?? defaultSchema.summary);
      setTargetAudience(draft?.targetAudience ?? ["Public"]);
      setCategory(defaultCat);
      setActionRequired(draft?.actionRequired ?? "No Action Required");
      setPollData(draft?.pollData ?? null);

      const contentToSet =
        draft?.content ?? compileDirectiveSchemaToMarkdown(defaultSchema);
      setContent(contentToSet);
      if (editor) {
        editor.commands.setContent(contentToSet);
      }
      setImageUrl(draft?.imageUrl ?? "");
      setCodeSnippet(draft?.codeSnippet ?? "");
      setShowCodeInput(!!draft?.codeSnippet);
      setIsActive(draft?.isActive ?? true);
      setBuilderSchema(defaultSchema);
      setEditorMode("visual");
      setActiveBuilderTabIdx(0);
      setSelectedBuilderCardIdx(0);
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

  // Visual Builder Helpers
  const handleCompileSchemaToMarkdown = () => {
    if (!builderSchema) return;
    const syncedSchema: DirectiveBuilderSchema = {
      ...builderSchema,
      title: title.trim() || builderSchema.title,
      summary: description.trim() || builderSchema.summary,
    };
    const compiled = compileDirectiveSchemaToMarkdown(syncedSchema);
    setContent(compiled);
    if (editor) {
      editor.commands.setContent(compiled);
    }
    setIsDirty(true);
    useStore
      .getState()
      .pushStatus(
        t(
          "dir_builder_toast_compiled",
          "Compiled Visual Builder cards into Markdown (.md)!"
        ),
        "success"
      );
  };

  const handleResetBuilderToDefault = () => {
    if (!activeCanonicalSlug) return;
    const freshSchema = getDefaultDirectiveBuilderSchema(
      activeCanonicalSlug,
      t
    );
    setBuilderSchema(freshSchema);
    setTitle(freshSchema.title);
    setDescription(freshSchema.summary);
    const compiled = compileDirectiveSchemaToMarkdown(freshSchema);
    setContent(compiled);
    if (editor) {
      editor.commands.setContent(compiled);
    }
    setActiveBuilderTabIdx(0);
    setSelectedBuilderCardIdx(0);
    setEditingSubCardIdx(null);
    setIsDirty(true);
    useStore
      .getState()
      .pushStatus(
        t(
          "dir_builder_toast_reset",
          "Reset directive to default Sanctuary Foundry blueprint."
        ),
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
      footerMeta: t("dir_builder_section_cards_lbl", "Interactive Section Cards"),
      desc: t(
        "dir_builder_field_desc",
        "Full Description (Clamped on Card, Full Text Inside Drawer)"
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
            subCards: (card.subCards || []).filter((_, sIdx) => sIdx !== subIdx),
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
    if (editor && editorMode === "markdown") {
      finalMarkdownBody = stripDirectiveBuilderComment(
        (editor.storage as any).markdown.getMarkdown()
      );
      setContent(finalMarkdownBody);
    }

    const canonicalSlug: DirectiveSlug | null =
      (editingPost?.is_canonical_directive && editingPost?.slug) ||
      CATEGORY_TO_SLUG[category] ||
      null;

    if (canonicalSlug && builderSchema) {
      const syncedSchema: DirectiveBuilderSchema = {
        ...builderSchema,
        slug: canonicalSlug,
        title: title.trim() || builderSchema.title,
        summary: description.trim() || builderSchema.summary,
      };
      // If saving from Visual Builder mode, keep the Markdown body synchronized with the builder cards unless the user explicitly customized raw markdown
      if (editorMode === "visual" || !finalMarkdownBody.trim()) {
        finalMarkdownBody = compileDirectiveSchemaToMarkdown(syncedSchema);
        setContent(finalMarkdownBody);
        if (editor) {
          editor.commands.setContent(finalMarkdownBody);
        }
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
        "Keepers Core"
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
            : t("update_transmission", "Directive Updated!"),
          "success"
        );
      setIsSubmitting(false);
      return;
    }

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
      category: category,
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
        editingPostId ? "Updated Dispatch" : "Created Dispatch",
        targetTable,
        payload.title,
        undefined,
        "Keepers Core"
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
            ? t("update_transmission", "Transmission Updated!")
            : t("post_success", "Posted!"),
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
    const postToDelete = posts.find((p) => p.id === id);
    if (postToDelete?.is_canonical_directive) {
      return;
    }
    const targetTable = "system_broadcasts";
    const res = await supabaseAuth.from(targetTable).delete().eq("id", id);
    if (!res.error && postToDelete) {
      await logArchitectAction(
        "Deleted Dispatch",
        targetTable,
        postToDelete.title || id,
        undefined,
        "Keepers Core"
      );
    }
    fetchPostsAndAssets();
  };

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      const searchMatch =
        !searchTerm.trim() ||
        p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.message || p.content)
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (p.file_name || "")?.toLowerCase().includes(searchTerm.toLowerCase());

      const categoryMatch =
        filterCategory === "All" || p.category === filterCategory;

      const viewTabMatch =
        activeViewTab === "all"
          ? true
          : activeViewTab === "citizen_guide"
          ? p.slug === "citizen_guide" || p.category === "Citizen Guide"
          : activeViewTab === "phase_roadmap"
          ? p.slug === "phase_roadmap" || p.category === "Phase Roadmap"
          : activeViewTab === "fork_arch"
          ? p.slug === "forking_guide" ||
            p.slug === "master_architecture" ||
            p.category === "Forking Guide" ||
            p.category === "Master Architecture"
          : activeViewTab === "master_protocols"
          ? p.slug === "master_protocols" ||
            p.category === "Master Protocol List"
          : true;

      return searchMatch && categoryMatch && viewTabMatch;
    });
  }, [posts, searchTerm, filterCategory, activeViewTab]);

  const draftKeysStr = useMemo(
    () => Object.keys(wayfinderDrafts).sort().join(","),
    [wayfinderDrafts]
  );

  // Render a clean 3-Tier System Directive Card matching WorkspaceSidePanel / TimeCapsule cards
  const renderCanonicalDirectiveCard = (post: any) => {
    const slug = (post.slug ||
      CATEGORY_TO_SLUG[post.category] ||
      "citizen_guide") as DirectiveSlug;
    const iconMeta = SLUG_ICON_MAP[slug] || SLUG_ICON_MAP.citizen_guide;
    const effectiveSchema =
      extractDirectiveBuilderSchema(post.content || post.message) ||
      getDefaultDirectiveBuilderSchema(slug, t);

    const totalTabs = effectiveSchema.tabs.length;
    const totalCards = effectiveSchema.tabs.reduce(
      (acc, tab) => acc + (tab.cards?.length || 0),
      0
    );
    const totalSubCards = effectiveSchema.tabs.reduce(
      (acc, tab) =>
        acc +
        (tab.cards || []).reduce(
          (sAcc, c) => sAcc + (c.subCards?.length || 0),
          0
        ),
      0
    );

    const hasUnsavedEdits = Boolean(
      (wayfinderDrafts[post.id] as any)?.isDirty
    );

    return (
      <div
        key={post.id}
        role="button"
        tabIndex={0}
        onClick={() => openEditor(post, 0)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEditor(post, 0);
          }
        }}
        className="glass-panel rounded-2xl p-5 flex flex-col justify-between gap-4 cursor-pointer group transition-all duration-300 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] hover:-translate-y-0.5 text-left"
      >
        <div className="flex flex-col gap-3.5">
          {/* Top Row: Icon Box on Left + Linked .md File Pill on Right */}
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 rounded-xl border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0 transition-colors group-hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]">
              <span className="material-symbols-outlined !text-[22px]">
                {t(iconMeta.key, iconMeta.fallback)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {hasUnsavedEdits && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)] text-[10px] font-black uppercase tracking-wider">
                  <span className="material-symbols-outlined !text-[12px]">
                    {t("icon_edit", "edit")}
                  </span>
                  {t("action_unsaved_draft", "Unsaved Draft")}
                </span>
              )}
              {post.file_name && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] text-[10px] font-mono font-bold">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_markdown", "markdown")}
                  </span>
                  {post.file_name}
                </span>
              )}
            </div>
          </div>

          {/* Middle Tier: Category Overline, Bold Title, 2-Line Description */}
          <div className="flex flex-col gap-1 mt-0.5">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
              {post.category}
            </span>
            <h3 className="text-base sm:text-lg font-black tracking-tight text-[var(--text)] leading-snug m-0">
              {post.title}
            </h3>
            <p className="text-xs font-normal text-[var(--subtext)] opacity-85 leading-relaxed m-0 line-clamp-2">
              {post.description || effectiveSchema.summary}
            </p>
          </div>
        </div>

        {/* Bottom Footer: Clean Count + Open Builder Action */}
        <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-3">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-75 truncate">
            {t(
              "dir_builder_cards_count",
              "{0} Tabs • {1} Cards • {2} Drawer Blocks"
            )
              .replace("{0}", String(totalTabs))
              .replace("{1}", String(totalCards))
              .replace("{2}", String(totalSubCards))}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-[var(--accent)] group-hover:translate-x-0.5 transition-transform shrink-0">
            {t("dir_builder_open_cta", "Open Visual Builder")}
            <span className="material-symbols-outlined !text-[15px]">
              {t("icon_navigate_next", "navigate_next")}
            </span>
          </span>
        </div>
      </div>
    );
  };

  const renderPostCard = (post: any) => {
    if (post.is_canonical_directive || Boolean(CATEGORY_TO_SLUG[post.category])) {
      return renderCanonicalDirectiveCard(post);
    }
    const draftSet = new Set(draftKeysStr.split(","));
    const hasUnsavedEdits = draftSet.has(post.id);
    return (
      <MasonPostCard
        key={post.id}
        post={post}
        index={0}
        onPostClick={() => openEditor(post)}
        onToggleLike={() => {}}
        hasUnsavedEdits={hasUnsavedEdits}
      />
    );
  };

  const tabs = [
    {
      id: "all",
      label: t("dir_builder_tab_all", "All Directives"),
      icon: t("icon_dashboard", "dashboard"),
      number: posts.length.toString(),
    },
    {
      id: "citizen_guide",
      label: t("dir_builder_tab_guide", "Citizen Guide"),
      icon: t("icon_school", "school"),
      number: t("dir_cg_t1_lbl", "7 STAGES"),
    },
    {
      id: "phase_roadmap",
      label: t("dir_builder_tab_roadmap", "Phase Roadmap"),
      icon: t("icon_timeline", "timeline"),
      number: t("dir_rm_t1_lbl", "12 PHASES"),
    },
    {
      id: "fork_arch",
      label: t("dir_builder_tab_fork_arch", "Forking & Stack"),
      icon: t("icon_architecture", "architecture"),
      number: t("dir_fk_t2_lbl", "FORK MODES"),
    },
    {
      id: "master_protocols",
      label: t("dir_builder_tab_protocols", "Master Protocols"),
      icon: t("icon_verified_user", "verified_user"),
      number: t("dir_pr_t3_lbl", "32 RULES"),
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
  const activeEditingSubCard =
    editingSubCardIdx !== null && activeBuilderCard?.subCards
      ? activeBuilderCard.subCards[editingSubCardIdx] || null
      : null;

  const contentBlock = (
    <ElevatedHubLayout
      headerTitle={t("web_directives", "System Directives")}
      headerSubtitle={t(
        "web_directives_subtitle",
        "Visual Card & Drawer Builder • Bidirectional Sync: Keepers Core ⇄ Codebase (.md)"
      )}
      headerIcon={t("icon_gavel", "gavel")}
      headerIconColorClass="theme-text-accent"
      hideHeader={isSidePanel}
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t(
        "mason_search_placeholder",
        "Search directives, cards, or .md files..."
      )}
      tabs={tabs}
      activeTab={activeViewTab}
      onTabChange={(id) => setActiveViewTab(id)}
      primaryPopover={{
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
                options={[
                  { id: "All", label: t("all_classes", "All Categories") },
                  {
                    id: "Citizen Guide",
                    label: t("cat_citizen_guide", "Citizen Guide"),
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
                    label: t("cat_master_architecture", "Master Architecture"),
                  },
                  {
                    id: "Master Protocol List",
                    label: t("cat_master_protocol", "Master Protocol List"),
                  },
                ]}
              />
            </div>
          </div>
        ),
      }}
      actions={[
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
      <div className="flex flex-col gap-6">
        {filteredPosts.length === 0 ? (
          <EmptyState
            icon={t("icon_cell_tower", "cell_tower")}
            title={t("no_transmissions", "No Directives Found")}
            className="col-span-full py-16"
          />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {filteredPosts.map(renderPostCard)}
          </div>
        )}
      </div>
    </ElevatedHubLayout>
  );

  return (
    <>
      {contentBlock}

      {isEditorOpen && (
        <SidePanel
          isOpen={isEditorOpen}
          onClose={closeEditor}
          icon={t("icon_dashboard", "dashboard")}
          widthClass="w-[92vw] md:w-[920px]"
          title={
            title ||
            (editingPostId
              ? t("update_transmission", "Update System Directive")
              : t("post_broadcast", "Compose System Directive"))
          }
          subtitle={
            activeCanonicalMeta
              ? activeCanonicalMeta.file_path
              : editingPostId
              ? t("editing_record", "Editing Record")
              : t("composing_broadcast", "Composing Directive")
          }
          headerActions={
            <PanelHeaderGroup>
              {builderSchema && (
                <>
                  <PanelHeaderButton
                    onClick={() =>
                      setEditorMode((prev) =>
                        prev === "visual" ? "markdown" : "visual"
                      )
                    }
                    tooltip={
                      editorMode === "visual"
                        ? t("dir_builder_mode_md_val", "Markdown Source")
                        : t("dir_builder_mode_visual_val", "Visual Card Builder")
                    }
                    icon={
                      editorMode === "visual"
                        ? t("icon_markdown", "markdown")
                        : t("icon_dashboard", "dashboard")
                    }
                  />
                  {activeCanonicalMeta && (
                    <PanelHeaderButton
                      onClick={handleResetBuilderToDefault}
                      tooltip={t("dir_builder_btn_reset", "Reset to Default")}
                      icon={t("icon_restart_alt", "restart_alt")}
                    />
                  )}
                  <div className="w-[1px] h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-1.5" />
                </>
              )}
              {editingPostId && !editingPost?.is_canonical_directive && (
                <>
                  {confirmDelete === editingPostId ? (
                    <PanelHeaderButton
                      onClick={() => {
                        handleDelete(editingPostId);
                        setConfirmDelete(null);
                        closeEditor();
                      }}
                      tooltip={t(
                        "btn_confirm_delete",
                        "Click again to permanently delete"
                      )}
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
                      : t("icon_close", "close")
                  }
                  variant="danger"
                  className={confirmDiscard ? "animate-pulse" : ""}
                />
              )}
              <PanelHeaderButton
                onClick={() => handleSubmit()}
                disabled={isSubmitting || isSyncing || !title}
                tooltip={
                  isSubmitting
                    ? t("btn_saving", "Saving...")
                    : t(
                        "dir_sync_toast_saved",
                        "Save to Keepers Core & local .md file"
                      )
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
            {/* =================================================================
                MODE A: STEP-BY-STEP MASTER-DETAIL VISUAL BUILDER
               ================================================================= */}
            {editorMode === "visual" &&
              builderSchema &&
              activeBuilderTab &&
              activeBuilderCard && (
                <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                  {/* 1. 1x3 Directive Tab Selector */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
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

                  {/* 2. Master-Detail Split View (Left: Simple Card List | Right: Focused Single-Card or Single-Item Editor) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                    {/* LEFT COLUMN (5 Cols): Clean List of Cards in Active Tab */}
                    <div className="md:col-span-5 glass-panel rounded-2xl p-4 flex flex-col gap-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("dir_builder_cards_list_heading", "Cards in Tab")} (
                          {activeBuilderTab.cards.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddCardToTab(activeBuilderTabIdx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[10px] font-black uppercase tracking-wider transition-colors"
                        >
                          <span className="material-symbols-outlined !text-[13px]">
                            {t("icon_add", "add")}
                          </span>
                          {t("dir_builder_add_card", "Add Card")}
                        </button>
                      </div>

                      <div className="flex flex-col gap-2">
                        {activeBuilderTab.cards.map((card, cardIdx) => {
                          const isSelected = safeSelectedCardIdx === cardIdx;
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
                              className={`rounded-xl px-3 py-2.5 flex items-center justify-between gap-2.5 border text-left transition-all cursor-pointer ${
                                isSelected
                                  ? "glass-surface opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)]"
                                  : "bg-transparent opacity-55 hover:opacity-90 border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)]"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div
                                  className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
                                      : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)]"
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[16px]">
                                    {card.icon || t("icon_layers", "layers")}
                                  </span>
                                </div>
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-[9px] font-black uppercase tracking-wider text-[var(--accent)] truncate">
                                    {card.overline || `#${cardIdx + 1}`}
                                  </span>
                                  <span className="text-xs font-bold text-[var(--text)] truncate">
                                    {card.title}
                                  </span>
                                </div>
                              </div>

                              {isSelected && (
                                <div
                                  className="flex items-center gap-1 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    disabled={cardIdx === 0}
                                    onClick={() =>
                                      handleMoveCard(
                                        activeBuilderTabIdx,
                                        cardIdx,
                                        -1
                                      )
                                    }
                                    title={t(
                                      "dir_builder_move_up",
                                      "Move Earlier"
                                    )}
                                    className="w-6 h-6 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center"
                                  >
                                    <span className="material-symbols-outlined !text-[13px]">
                                      {t("icon_arrow_upward", "arrow_upward")}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      cardIdx >=
                                      activeBuilderTab.cards.length - 1
                                    }
                                    onClick={() =>
                                      handleMoveCard(
                                        activeBuilderTabIdx,
                                        cardIdx,
                                        1
                                      )
                                    }
                                    title={t(
                                      "dir_builder_move_down",
                                      "Move Later"
                                    )}
                                    className="w-6 h-6 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center"
                                  >
                                    <span className="material-symbols-outlined !text-[13px]">
                                      {t(
                                        "icon_arrow_downward",
                                        "arrow_downward"
                                      )}
                                    </span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* RIGHT COLUMN (7 Cols): Focused Single-Card Editor OR Focused Single-Drawer-Item Editor */}
                    <div className="md:col-span-7 flex flex-col gap-4">
                      {activeEditingSubCard === null ? (
                        /* =====================================================
                           VIEW 1: FOCUSED SINGLE-CARD EDITOR + COMPACT DRAWER ITEM LIST
                           ===================================================== */
                        <>
                          {/* Card Header & Description Form */}
                          <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_14%,transparent)]">
                            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                                {t(
                                  "dir_builder_editing_card",
                                  "Editing Card {0} of {1}"
                                )
                                  .replace(
                                    "{0}",
                                    String(safeSelectedCardIdx + 1)
                                  )
                                  .replace(
                                    "{1}",
                                    String(activeBuilderTab.cards.length)
                                  )}
                              </span>
                              {activeBuilderTab.cards.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteCard(
                                      activeBuilderTabIdx,
                                      safeSelectedCardIdx
                                    )
                                  }
                                  title={t(
                                    "dir_builder_delete_card",
                                    "Remove Card"
                                  )}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[10px] font-black uppercase tracking-wider transition-colors"
                                >
                                  <span className="material-symbols-outlined !text-[13px]">
                                    {t("icon_delete", "delete")}
                                  </span>
                                  {t("dir_builder_delete_card", "Remove Card")}
                                </button>
                              )}
                            </div>

                            {/* Icon + Card Title Row */}
                            <div className="flex items-end gap-3">
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIconPickerTarget(
                                      iconPickerTarget?.type === "card" &&
                                        iconPickerTarget.cardIdx ===
                                          safeSelectedCardIdx
                                        ? null
                                        : {
                                            type: "card",
                                            tabIdx: activeBuilderTabIdx,
                                            cardIdx: safeSelectedCardIdx,
                                          }
                                    )
                                  }
                                  title={t(
                                    "dir_builder_pick_icon",
                                    "Change Icon"
                                  )}
                                  className="w-10 h-10 rounded-xl border bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0"
                                >
                                  <span className="material-symbols-outlined !text-[20px]">
                                    {activeBuilderCard.icon ||
                                      t("icon_layers", "layers")}
                                  </span>
                                </button>
                                {iconPickerTarget?.type === "card" &&
                                  iconPickerTarget.tabIdx ===
                                    activeBuilderTabIdx &&
                                  iconPickerTarget.cardIdx ===
                                    safeSelectedCardIdx && (
                                    <div className="absolute left-0 top-12 z-[200]">
                                      <IconPicker
                                        onSelect={(icon) => {
                                          updateBuilderCard(
                                            activeBuilderTabIdx,
                                            safeSelectedCardIdx,
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
                                  {t("dir_builder_field_title", "Card Title")}
                                </label>
                                <input
                                  value={activeBuilderCard.title}
                                  onChange={(e) =>
                                    updateBuilderCard(
                                      activeBuilderTabIdx,
                                      safeSelectedCardIdx,
                                      { title: e.target.value }
                                    )
                                  }
                                  className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                                />
                              </div>
                            </div>

                            {/* Overline & Corner Badge (2 Columns) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                  {t(
                                    "dir_builder_field_overline",
                                    "Overline / Stage / Phase Label"
                                  )}
                                </label>
                                <input
                                  value={activeBuilderCard.overline}
                                  onChange={(e) =>
                                    updateBuilderCard(
                                      activeBuilderTabIdx,
                                      safeSelectedCardIdx,
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
                                  value={activeBuilderCard.badge}
                                  onChange={(e) =>
                                    updateBuilderCard(
                                      activeBuilderTabIdx,
                                      safeSelectedCardIdx,
                                      { badge: e.target.value }
                                    )
                                  }
                                  className="w-full glass-surface rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                                />
                              </div>
                            </div>

                            {/* Card Description */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                {t(
                                  "dir_builder_field_desc",
                                  "Full Description (Shows in Drawer)"
                                )}
                              </label>
                              <textarea
                                rows={3}
                                value={activeBuilderCard.desc}
                                onChange={(e) =>
                                  updateBuilderCard(
                                    activeBuilderTabIdx,
                                    safeSelectedCardIdx,
                                    { desc: e.target.value }
                                  )
                                }
                                className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-normal text-[var(--text)] leading-relaxed focus:outline-none focus:theme-border-accent resize-y custom-scrollbar"
                              />
                            </div>
                          </div>

                          {/* Drawer Info Blocks / Milestones Compact Clickable List */}
                          <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3.5 border border-[color-mix(in_srgb,var(--text)_14%,transparent)]">
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
                                  ({(activeBuilderCard.subCards || []).length})
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleAddSubCard(
                                    activeBuilderTabIdx,
                                    safeSelectedCardIdx
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[10px] font-black uppercase tracking-wider transition-colors"
                              >
                                <span className="material-symbols-outlined !text-[13px]">
                                  {t("icon_add", "add")}
                                </span>
                                {t(
                                  "dir_builder_add_subcard",
                                  "Add Drawer Item"
                                )}
                              </button>
                            </div>

                            {(activeBuilderCard.subCards || []).length > 0 && (
                              <div className="flex flex-col gap-2">
                                {(activeBuilderCard.subCards || []).map(
                                  (sub, subIdx) => (
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
                                      className="glass-surface rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] cursor-pointer group transition-all"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                                          {sub.icon ||
                                            t(
                                              "icon_check_circle",
                                              "check_circle"
                                            )}
                                        </span>
                                        <div className="flex flex-col min-w-0 flex-1">
                                          <span className="text-xs font-bold text-[var(--text)] truncate">
                                            {sub.title}
                                          </span>
                                          <span className="text-[11px] text-[var(--subtext)] opacity-80 truncate">
                                            {sub.desc}
                                          </span>
                                        </div>
                                      </div>

                                      <div
                                        className="flex items-center gap-1 shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {activeCanonicalSlug ===
                                          "phase_roadmap" && (
                                          <span
                                            className={`px-2 py-0.5 rounded-md border bg-transparent text-[9px] font-black uppercase tracking-wider mr-1 ${
                                              sub.pending
                                                ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
                                                : "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                                            }`}
                                          >
                                            {sub.pending
                                              ? t(
                                                  "dir_builder_status_wip",
                                                  "In Progress"
                                                )
                                              : t(
                                                  "dir_builder_status_done",
                                                  "Completed"
                                                )}
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          disabled={subIdx === 0}
                                          onClick={() =>
                                            handleMoveSubCard(
                                              activeBuilderTabIdx,
                                              safeSelectedCardIdx,
                                              subIdx,
                                              -1
                                            )
                                          }
                                          className="w-6 h-6 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center"
                                        >
                                          <span className="material-symbols-outlined !text-[13px]">
                                            {t(
                                              "icon_arrow_upward",
                                              "arrow_upward"
                                            )}
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          disabled={
                                            subIdx >=
                                            (activeBuilderCard.subCards || [])
                                              .length -
                                              1
                                          }
                                          onClick={() =>
                                            handleMoveSubCard(
                                              activeBuilderTabIdx,
                                              safeSelectedCardIdx,
                                              subIdx,
                                              1
                                            )
                                          }
                                          className="w-6 h-6 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] disabled:opacity-30 flex items-center justify-center"
                                        >
                                          <span className="material-symbols-outlined !text-[13px]">
                                            {t(
                                              "icon_arrow_downward",
                                              "arrow_downward"
                                            )}
                                          </span>
                                        </button>
                                        <span className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--accent)]">
                                          <span className="material-symbols-outlined !text-[15px]">
                                            {t("icon_edit", "edit")}
                                          </span>
                                        </span>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        /* =====================================================
                           VIEW 2: FOCUSED SINGLE DRAWER ITEM EDITOR
                           ===================================================== */
                        editingSubCardIdx !== null && (
                          <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-[color-mix(in_srgb,var(--text)_18%,transparent)] animate-in fade-in duration-150">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                              <button
                                type="button"
                                onClick={() => setEditingSubCardIdx(null)}
                                className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[var(--accent)] hover:opacity-80"
                              >
                                <span className="material-symbols-outlined !text-[16px]">
                                  {t("icon_navigate_before", "navigate_before")}
                                </span>
                                {t("dir_builder_back_to_card", "Back to Card")}
                              </button>

                              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)]">
                                {t(
                                  "dir_builder_editing_subcard",
                                  "Editing Drawer Item {0} of {1}"
                                )
                                  .replace(
                                    "{0}",
                                    String(editingSubCardIdx + 1)
                                  )
                                  .replace(
                                    "{1}",
                                    String(
                                      (activeBuilderCard.subCards || []).length
                                    )
                                  )}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteSubCard(
                                    activeBuilderTabIdx,
                                    safeSelectedCardIdx,
                                    editingSubCardIdx
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[10px] font-black uppercase tracking-wider"
                              >
                                <span className="material-symbols-outlined !text-[13px]">
                                  {t("icon_delete", "delete")}
                                </span>
                                {t("purge", "Delete")}
                              </button>
                            </div>

                            {/* Icon + Item Title */}
                            <div className="flex items-end gap-3">
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIconPickerTarget(
                                      iconPickerTarget?.type === "subcard" &&
                                        iconPickerTarget.subIdx ===
                                          editingSubCardIdx
                                        ? null
                                        : {
                                            type: "subcard",
                                            tabIdx: activeBuilderTabIdx,
                                            cardIdx: safeSelectedCardIdx,
                                            subIdx: editingSubCardIdx,
                                          }
                                    )
                                  }
                                  title={t(
                                    "dir_builder_pick_icon",
                                    "Change Icon"
                                  )}
                                  className="w-10 h-10 rounded-xl border bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] flex items-center justify-center shrink-0"
                                >
                                  <span className="material-symbols-outlined !text-[20px]">
                                    {activeEditingSubCard.icon ||
                                      t("icon_check_circle", "check_circle")}
                                  </span>
                                </button>
                                {iconPickerTarget?.type === "subcard" &&
                                  iconPickerTarget.tabIdx ===
                                    activeBuilderTabIdx &&
                                  iconPickerTarget.cardIdx ===
                                    safeSelectedCardIdx &&
                                  iconPickerTarget.subIdx ===
                                    editingSubCardIdx && (
                                    <div className="absolute left-0 top-12 z-[200]">
                                      <IconPicker
                                        onSelect={(icon) => {
                                          updateSubCard(
                                            activeBuilderTabIdx,
                                            safeSelectedCardIdx,
                                            editingSubCardIdx,
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
                                  {t("dir_builder_field_title", "Title")}
                                </label>
                                <input
                                  value={activeEditingSubCard.title}
                                  onChange={(e) =>
                                    updateSubCard(
                                      activeBuilderTabIdx,
                                      safeSelectedCardIdx,
                                      editingSubCardIdx,
                                      { title: e.target.value }
                                    )
                                  }
                                  placeholder={t(
                                    "dir_builder_subcard_title_ph",
                                    "Info block title..."
                                  )}
                                  className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent"
                                />
                              </div>

                              {activeCanonicalSlug === "phase_roadmap" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSubCard(
                                      activeBuilderTabIdx,
                                      safeSelectedCardIdx,
                                      editingSubCardIdx,
                                      { pending: !activeEditingSubCard.pending }
                                    )
                                  }
                                  className={`h-10 px-3 rounded-xl border bg-transparent text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 ${
                                    activeEditingSubCard.pending
                                      ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
                                      : "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[14px]">
                                    {activeEditingSubCard.pending
                                      ? t(
                                          "icon_rocket_launch",
                                          "rocket_launch"
                                        )
                                      : t("icon_check_circle", "check_circle")}
                                  </span>
                                  {activeEditingSubCard.pending
                                    ? t("dir_builder_status_wip", "In Progress")
                                    : t("dir_builder_status_done", "Completed")}
                                </button>
                              )}
                            </div>

                            {/* Full-Width Item Description */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                                {t("dir_builder_field_desc", "Description")}
                              </label>
                              <textarea
                                rows={4}
                                value={activeEditingSubCard.desc}
                                onChange={(e) =>
                                  updateSubCard(
                                    activeBuilderTabIdx,
                                    safeSelectedCardIdx,
                                    editingSubCardIdx,
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

                            {/* Prev / Next Drawer Item + Done Button */}
                            <div className="flex items-center justify-between gap-3 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                              <div className="flex items-center gap-2">
                                <ActionButton
                                  variant="glass"
                                  icon={t(
                                    "icon_navigate_before",
                                    "navigate_before"
                                  )}
                                  disabled={editingSubCardIdx <= 0}
                                  onClick={() =>
                                    setEditingSubCardIdx((prev) =>
                                      Math.max(0, (prev ?? 0) - 1)
                                    )
                                  }
                                >
                                  {t("sd_guide_prev_stage", "Previous")}
                                </ActionButton>
                                <ActionButton
                                  variant="glass"
                                  icon={t(
                                    "icon_navigate_next",
                                    "navigate_next"
                                  )}
                                  disabled={
                                    editingSubCardIdx >=
                                    (activeBuilderCard.subCards || []).length -
                                      1
                                  }
                                  onClick={() =>
                                    setEditingSubCardIdx((prev) =>
                                      Math.min(
                                        (activeBuilderCard.subCards || [])
                                          .length - 1,
                                        (prev ?? 0) + 1
                                      )
                                    )
                                  }
                                >
                                  {t("sd_guide_next_stage", "Next")}
                                </ActionButton>
                              </div>

                              <ActionButton
                                variant="accent"
                                icon={t("icon_check_circle", "check_circle")}
                                onClick={() => setEditingSubCardIdx(null)}
                              >
                                {t("dir_builder_done_btn", "Done Editing Item")}
                              </ActionButton>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* =================================================================
                MODE B: RAW MARKDOWN SOURCE (.MD) EDITOR
               ================================================================= */}
            {(editorMode === "markdown" || !builderSchema) && (
              <div className="flex flex-col gap-6 animate-in fade-in duration-200">
                {!activeCanonicalMeta && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                      <div className="flex flex-col gap-2 flex-1">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                          {t("category", "Directive Category")}
                        </label>
                        <div className="h-14">
                          <CustomDropdown
                            disableTint={true}
                            searchable={true}
                            allowCustom={true}
                            value={category}
                            onChange={(v: string[]) => setCategory(v[0])}
                            options={[
                              {
                                id: "Citizen Guide",
                                label: t("cat_citizen_guide", "Citizen Guide"),
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
                            ]}
                            placeholder={t(
                              "auto_select_category",
                              "Select Category"
                            )}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 flex-1">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                          {t("dispatch_meta_action", "Action Required")}
                        </label>
                        <div className="h-14">
                          <CustomDropdown
                            disableTint={true}
                            searchable={true}
                            allowCustom={true}
                            value={actionRequired}
                            onChange={(v: string[]) =>
                              setActionRequired(v[0] || "No Action Required")
                            }
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
                            placeholder={t(
                              "dispatch_meta_action",
                              "Action Required"
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                        {t(
                          "dispatch_telemetry_preview",
                          "Dispatch Telemetry Header Preview"
                        )}
                      </label>
                      <DispatchMetadataHeader
                        post={{
                          category,
                          target_audience: "Public",
                          action_required: actionRequired,
                        }}
                        categoryOverride={category}
                        audienceOverride={["Public"]}
                        actionRequiredOverride={actionRequired}
                      />
                    </div>
                  </>
                )}

                <div className="flex flex-col gap-2 flex-1 min-h-[400px]">
                  <div className="flex items-center justify-between ml-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">
                      {t("post_content", "Markdown Content")}
                    </label>
                  </div>
                  <div className="flex flex-col flex-1 glass-surface !overflow-visible bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl border focus-within:border-[var(--accent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner transition-all">
                    <div className="shrink-0 sticky top-0 z-50 flex flex-col items-center p-3 bg-transparent pointer-events-none">
                      <div className="relative flex flex-col items-center pointer-events-auto w-fit">
                        <div className="glass-panel portal-glass-fix backdrop-blur-[var(--glassBlur)] flex flex-wrap items-center gap-1 p-1.5 !rounded-[1.25rem] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[0_14px_34px_rgba(0,0,0,0.45)]">
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() =>
                                editor?.chain().focus().toggleBold().run()
                              }
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                editor?.isActive("bold")
                                  ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                  : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t("icon_format_bold", "format_bold")}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_bold", "Bold")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() =>
                                editor?.chain().focus().toggleItalic().run()
                              }
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                editor?.isActive("italic")
                                  ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                  : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t("icon_format_italic", "format_italic")}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_italic", "Italic")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() =>
                                editor
                                  ?.chain()
                                  .focus()
                                  .toggleHeading({ level: 1 })
                                  .run()
                              }
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                editor?.isActive("heading", { level: 1 })
                                  ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                  : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t("icon_format_h1", "format_h1")}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_h1", "Heading 1")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() =>
                                editor
                                  ?.chain()
                                  .focus()
                                  .toggleHeading({ level: 2 })
                                  .run()
                              }
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                editor?.isActive("heading", { level: 2 })
                                  ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                  : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t("icon_format_h2", "format_h2")}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_h2", "Heading 2")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() =>
                                editor?.chain().focus().toggleBulletList().run()
                              }
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                editor?.isActive("bulletList")
                                  ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                  : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t(
                                  "icon_format_list_bulleted",
                                  "format_list_bulleted"
                                )}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_bullets", "Bullet List")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() =>
                                editor
                                  ?.chain()
                                  .focus()
                                  .toggleOrderedList()
                                  .run()
                              }
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                editor?.isActive("orderedList")
                                  ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                  : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t(
                                  "icon_format_list_numbered",
                                  "format_list_numbered"
                                )}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_numbers", "Numbered List")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() => setShowImageInput(!showImageInput)}
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                showImageInput
                                  ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                  : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t("icon_image", "image")}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_image", "Insert Image")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() =>
                                editor?.chain().focus().toggleCodeBlock().run()
                              }
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                editor?.isActive("codeBlock")
                                  ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                  : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t("icon_code", "code")}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_code", "Code Block")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() =>
                                editor
                                  ?.chain()
                                  .focus()
                                  .setHorizontalRule()
                                  .run()
                              }
                              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t("icon_horizontal_rule", "horizontal_rule")}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_hr", "Divider")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                          <div className="relative group/btn flex">
                            <button
                              type="button"
                              onClick={() => setShowIconPicker(!showIconPicker)}
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                showIconPicker
                                  ? "bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--accent)] shadow-inner"
                                  : "text-[var(--text)] opacity-85 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[18px]">
                                {t(
                                  "icon_sentiment_satisfied",
                                  "sentiment_satisfied"
                                )}
                              </span>
                            </button>
                            <HoverTooltip
                              title={t("editor_tt_icon", "Insert Icon")}
                              variant="info"
                              className="group-hover/btn:flex z-[100]"
                            />
                          </div>
                        </div>
                        {showIconPicker && (
                          <IconPicker
                            onSelect={(icon) => {
                              editor
                                ?.chain()
                                .focus()
                                .insertContent(`[ICON:${icon}] `)
                                .run();
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
                          onChange={(e) => setInlineImageUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && inlineImageUrl) {
                              e.preventDefault();
                              editor
                                ?.chain()
                                .focus()
                                .setImage({ src: inlineImageUrl })
                                .run();
                              setInlineImageUrl("");
                              setShowImageInput(false);
                            }
                          }}
                          placeholder={t("image_url_placeholder", "Image URL...")}
                          className="flex-1 glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (inlineImageUrl) {
                              editor
                                ?.chain()
                                .focus()
                                .setImage({ src: inlineImageUrl })
                                .run();
                              setInlineImageUrl("");
                              setShowImageInput(false);
                            }
                          }}
                          className="px-6 py-2 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] rounded-xl font-black text-[10px] capitalize tracking-widest"
                        >
                          {t("ui_btn_insert", "Insert")}
                        </button>
                      </div>
                    )}

                    <div className="w-full flex-1 relative min-h-[350px]">
                      <EditorContent
                        editor={editor}
                        className="h-full w-full custom-scrollbar"
                      />
                    </div>

                    {showCodeInput && (
                      <div className="border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner animate-in slide-in-from-bottom-2 duration-300">
                        <textarea
                          value={codeSnippet}
                          onChange={(e) => setCodeSnippet(e.target.value)}
                          placeholder={t(
                            "code_snippet_placeholder",
                            "Code snippet..."
                          )}
                          className="w-full glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-xs font-mono placeholder-[var(--subtext)] focus:outline-none focus:theme-border-accent h-48 resize-none custom-scrollbar transition-all"
                          spellCheck={false}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between p-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-b-2xl shrink-0">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCodeInput(!showCodeInput)}
                          className={`px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest flex items-center gap-1.5 ${
                            showCodeInput
                              ? "theme-bg-accent/20 theme-text-accent"
                              : "text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_data_object", "data_object")}
                          </span>{" "}
                          {showCodeInput
                            ? t("hide_code", "Hide Code")
                            : t("masonhub_add_code", "Add Code")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAssetPanelOpen(true)}
                          className="px-3 py-1.5 rounded-lg transition-all text-[10px] font-bold tracking-widest text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_link", "link")}
                          </span>{" "}
                          {t("link_asset", "Link Asset")}
                        </button>
                      </div>
                      <div className="text-[9px] font-black tracking-widest capitalize opacity-40 flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_markdown", "markdown")}
                        </span>{" "}
                        {t("icon_markdown", "Markdown")}
                      </div>
                    </div>
                  </div>
                </div>

                {!activeCanonicalMeta && (
                  <DispatchPollBuilder
                    pollData={pollData}
                    onChange={setPollData}
                  />
                )}
              </div>
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
