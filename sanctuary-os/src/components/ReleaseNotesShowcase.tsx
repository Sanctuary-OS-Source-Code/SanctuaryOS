import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabaseAuth } from "../supabase";
import { SidePanel, PanelHeaderGroup, DashboardStatTile, SidePanelFilterBar, EmptyState } from "../shared-components/layout";
import { PanelHeaderButton, ActionButton } from "../shared-components/buttons";
import { handleOpenUrl } from "../shared-components/misc";
import { openSanctuaryContextMenu } from "../shared-components/ContextMenu";
import { SidePanelHeroCard } from "./layouts/ElevatedHubLayout";
import { UniversalCard } from "./universal/UniversalCard";
import { UniversalGroup, StatBox } from "./universal/UniversalLayout";
import { DispatchPollData, DispatchPollViewer } from "./universal/DispatchPollAndMeta";
import { getKeepersPipelineConfig, getSupporterState, DEFAULT_KEEPERS_PIPELINE_CONFIG, KeepersPipelineConfig } from "../utils/supporterManager";
import packageJson from "../../package.json";
import bundledCommunityBlog from "../../../Release Notes (Community Blog).md?raw";
import bundledDevBlog from "../../../Release Notes (Dev).md?raw";
import bundledNerdChangelog from "../../../changelog.md?raw";
import bundledRunningChangelog from "../../../changelog (running).md?raw";
import {
  readAllLocalDocSnapshots,
  syncPublishedToLocalFallbackIfSafe,
  LocalDocSlug,
} from "../utils/directivesSync";
import { isDesktop } from "../utils/envUtils";
import { useKeeperDocPresence, KeeperDocSavedBroadcast } from "../utils/useKeeperDocPresence";
import type { KeeperDocConflictInfo } from "./universal/KeeperDocConflictBar";
import { VAULT_CHIP_CLASS } from "../shared-components/constants";
import {
  LEGACY_BLOG_BROADCAST_TITLE,
  PUBLIC_CHANGELOG_BROADCAST_CATEGORY,
  DEV_CHANGELOG_BROADCAST_CATEGORY,
  PUBLIC_ARCHIVE_BROADCAST_CATEGORY,
  DEV_ARCHIVE_BROADCAST_CATEGORY,
  GITHUB_RELEASES_WEB_URL,
  GITHUB_WEB_DEV_RELEASE_URL,
  KeepersReleasePostRecord,
  KeepersReleaseArchiveEntry,
  cleanPostBodyForViewer,
} from "./release-notes/releaseMarkdownParser";
import {
  parseSeedCommunityBlog,
  isBundledVersionNewer,
  formatReleasePostToMarkdownFile,
  parseLatestChangelogBlock,
  parseAllChangelogBlocks,
  normalizeReleaseVersionKey,
  extractChangelogForVersion,
  serializeReleasePostMessage,
  deserializeReleasePostRow,
  deserializeChangelogRow,
  areReleasePostsEquivalent,
  areChangelogsEquivalent,
} from "./release-notes/releasePostSerializers";
import { StructuredReleaseNotesView } from "./release-notes/ReleaseMarkdownViewer";
export * from "./release-notes/releaseMarkdownParser";
export * from "./release-notes/releasePostSerializers";
export * from "./release-notes/ReleaseMarkdownViewer";

import { PostEditorMode, ReleaseDocSlotKey, RELEASE_SLOT_LOCAL_META } from "./release-notes/releaseNotesShowcaseTypes";
import { useReleaseNotesActions } from "./release-notes/useReleaseNotesActions";
const LazyReleaseNotesEditorDrawer = React.lazy(() => import("./release-notes/ReleaseNotesEditorDrawer"));
export function ReleaseNotesShowcase({
  isKeepers = false,
  versionLabel,
  presence: externalPresence,
  keeperName,
}: {
  isKeepers?: boolean;
  versionLabel?: string;
  presence?: ReturnType<typeof useKeeperDocPresence>;
  keeperName?: string;
}) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const wayfinderDrafts = useStore((state) => state.wayfinderDrafts);
  const setWayfinderDrafts = useStore((state) => state.setWayfinderDrafts);
  const currentUserId = session?.user?.id || "anon";
  const resolvedKeeperName =
    keeperName ||
    (session?.user?.user_metadata as any)?.username ||
    session?.user?.email?.split("@")[0] ||
    "Keepers Core";
  const osRole = useStore((state: any) => state.osRole);
  const userRole = useStore((state: any) => state.userRole);
  const [isDevSupporter, setIsDevSupporter] = useState(false);

  const isStaff = useMemo(() => {
    const r1 = String(osRole || "").toLowerCase();
    const r2 = String(userRole || "").toLowerCase();
    return (
      ["keeper", "wayfinder", "architect", "admin"].includes(r1) ||
      ["keeper", "wayfinder", "architect", "admin"].includes(r2)
    );
  }, [osRole, userRole]);

  useEffect(() => {
    let active = true;
    const checkSupporter = async () => {
      const uid = session?.user?.id;
      if (!uid || uid === "local_citizen") {
        if (active) setIsDevSupporter(false);
        return;
      }
      const sup = await getSupporterState("web", uid);
      const until = sup?.dev_build?.dev_build_until || 0;
      if (active) {
        setIsDevSupporter(until > Math.floor(Date.now() / 1000));
      }
    };
    checkSupporter();
    const onUpdate = () => checkSupporter();
    window.addEventListener("sanctuary-supporter-updated", onUpdate);
    return () => {
      active = false;
      window.removeEventListener("sanctuary-supporter-updated", onUpdate);
    };
  }, [session?.user?.id]);

  const canSeeDevBuildCard =
    isKeepers || (Boolean(session?.user?.id) && (isDevSupporter || isStaff));

  const seedPublicBlog = useMemo(() => parseSeedCommunityBlog(bundledCommunityBlog), []);
  const seedDevBlog = useMemo(() => parseSeedCommunityBlog(bundledDevBlog), []);
  const seedChangelog = useMemo(() => parseLatestChangelogBlock(bundledNerdChangelog), []);

  const [pipelineConfig, setPipelineConfig] = useState<KeepersPipelineConfig>(
    DEFAULT_KEEPERS_PIPELINE_CONFIG
  );

  const defaultStableVersion = (
    versionLabel ||
    seedPublicBlog.version ||
    pipelineConfig.stable_version ||
    packageJson.version.split("-")[0] ||
    packageJson.version ||
    "0.6.0"
  )
    .replace(/^v/i, "")
    .trim();

  const defaultDevVersion = (
    seedDevBlog.version ||
    pipelineConfig.dev_build_version ||
    seedChangelog.version ||
    packageJson.version ||
    `${defaultStableVersion}-Dev.1`
  )
    .replace(/^v/i, "")
    .trim();

  const defaultStableDate =
    seedPublicBlog.releaseDate ||
    (pipelineConfig.stable_published_at
      ? new Date(pipelineConfig.stable_published_at).toLocaleDateString()
      : seedChangelog.date || new Date().toLocaleDateString());

  const defaultDevDate =
    seedDevBlog.releaseDate ||
    (pipelineConfig.dev_published_at
      ? new Date(pipelineConfig.dev_published_at).toLocaleDateString()
      : seedChangelog.date || new Date().toLocaleDateString());

  const defaultPublicPost = useMemo<Omit<KeepersReleasePostRecord, "id">>(
    () => ({
      title: seedPublicBlog.mainTitle,
      summary:
        seedPublicBlog.summary ||
        t(
          "release_notes_section_subtitle",
          "What's new in the latest Sanctuary OS build — written for humans, backed by the full technical changelog."
        ),
      version: defaultStableVersion,
      releaseDate: defaultStableDate,
      platform:
        seedPublicBlog.platform ||
        t("release_notes_meta_platform_default", "Windows & macOS"),
      imageUrl: "",
      codeSnippet: "",
      pollData: null,
      body: seedPublicBlog.cleanBody,
    }),
    [seedPublicBlog, defaultStableVersion, defaultStableDate, t]
  );

  const defaultDevPost = useMemo<Omit<KeepersReleasePostRecord, "id">>(
    () => ({
      title:
        seedDevBlog.mainTitle ||
        `${t("release_notes_dev_card_title", "Sanctuary OS — Dev Build")}`,
      summary:
        seedDevBlog.summary ||
        (seedChangelog.heading
          ? `${seedChangelog.heading} — ${t(
              "release_notes_dev_card_desc",
              "Latest daily preview features, heuristic refinements, and architectural updates ahead of the next Stable release."
            )}`
          : t(
              "release_notes_dev_card_desc",
              "Latest daily preview features, heuristic refinements, and architectural updates ahead of the next Stable release."
            )),
      version: defaultDevVersion,
      releaseDate: defaultDevDate,
      platform:
        seedDevBlog.platform ||
        t("release_notes_meta_platform_default", "Windows & macOS"),
      imageUrl: "",
      codeSnippet: "",
      pollData: null,
      body: seedDevBlog.cleanBody || seedChangelog.markdown,
    }),
    [seedDevBlog, seedChangelog, defaultDevVersion, defaultDevDate, t]
  );

  // Working (Synced .md + DB) vs. Published (User-Facing) States
  const [workingPublicPost, setWorkingPublicPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultPublicPost,
  });
  const [publishedPublicPost, setPublishedPublicPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultPublicPost,
  });
  const [workingDevPost, setWorkingDevPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultDevPost,
  });
  const [publishedDevPost, setPublishedDevPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultDevPost,
  });

  const [workingStableChangelog, setWorkingStableChangelog] = useState<string>(
    bundledRunningChangelog || bundledNerdChangelog
  );
  const [publishedStableChangelog, setPublishedStableChangelog] = useState<string>(
    bundledRunningChangelog || bundledNerdChangelog
  );
  const [workingDevChangelog, setWorkingDevChangelog] = useState<string>(
    bundledNerdChangelog || seedChangelog.markdown
  );
  const [publishedDevChangelog, setPublishedDevChangelog] = useState<string>(
    bundledNerdChangelog || seedChangelog.markdown
  );
  const [stableChangelogRowId, setStableChangelogRowId] = useState<string | null>(null);
  const [devChangelogRowId, setDevChangelogRowId] = useState<string | null>(null);
  const [dbArchivedPublicPosts, setDbArchivedPublicPosts] = useState<KeepersReleasePostRecord[]>([]);
  const [dbArchivedDevPosts, setDbArchivedDevPosts] = useState<KeepersReleasePostRecord[]>([]);

  // User-facing vs. Keepers Core effective records
  const publicPost = isKeepers ? workingPublicPost : publishedPublicPost;
  const devPost = isKeepers ? workingDevPost : publishedDevPost;

  const hasUnpublishedPublicPost = useMemo(
    () => !areReleasePostsEquivalent(workingPublicPost, publishedPublicPost),
    [workingPublicPost, publishedPublicPost]
  );
  const hasUnpublishedPublicChangelog = useMemo(
    () => !areChangelogsEquivalent(workingStableChangelog, publishedStableChangelog),
    [workingStableChangelog, publishedStableChangelog]
  );
  const hasUnpublishedPublic = hasUnpublishedPublicPost || hasUnpublishedPublicChangelog;

  const hasUnpublishedDevPost = useMemo(
    () => !areReleasePostsEquivalent(workingDevPost, publishedDevPost),
    [workingDevPost, publishedDevPost]
  );
  const hasUnpublishedDevChangelog = useMemo(
    () => !areChangelogsEquivalent(workingDevChangelog, publishedDevChangelog),
    [workingDevChangelog, publishedDevChangelog]
  );
  const hasUnpublishedDev = hasUnpublishedDevPost || hasUnpublishedDevChangelog;

  const [activeChannel, setActiveChannel] = useState<"stable" | "dev" | null>(null);
  const [activeView, setActiveView] = useState<"post" | "changelog" | "archive">("post");
  const [selectedArchiveEntry, setSelectedArchiveEntry] = useState<KeepersReleaseArchiveEntry | null>(null);

  // Keepers Core Dispatch / Comm-Link Post & Changelog Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<PostEditorMode>("visual");
  const [editorChannel, setEditorChannel] = useState<"stable" | "dev">("stable");
  const [editorDocType, setEditorDocType] = useState<"post" | "changelog">("post");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftVersion, setDraftVersion] = useState("");
  const [draftReleaseDate, setDraftReleaseDate] = useState("");
  const [draftPlatform, setDraftPlatform] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftCodeSnippet, setDraftCodeSnippet] = useState("");
  const [draftPollData, setDraftPollData] = useState<DispatchPollData | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [revisionsBySlot, setRevisionsBySlot] = useState<
    Record<
      ReleaseDocSlotKey,
      { revision: number; updatedBy: string; updatedAt: string }
    >
  >({
    "stable:post": { revision: 1, updatedBy: "Keepers Core", updatedAt: "" },
    "dev:post": { revision: 1, updatedBy: "Keepers Core", updatedAt: "" },
    "stable:changelog": {
      revision: 1,
      updatedBy: "Keepers Core",
      updatedAt: "",
    },
    "dev:changelog": { revision: 1, updatedBy: "Keepers Core", updatedAt: "" },
  });

  const [localMdBySlot, setLocalMdBySlot] = useState<
    Record<
      ReleaseDocSlotKey,
      {
        slug: LocalDocSlug;
        fileName: string;
        hasLocalChanges: boolean;
        localContent: string;
      }
    >
  >({
    "stable:post": {
      ...RELEASE_SLOT_LOCAL_META["stable:post"],
      hasLocalChanges: false,
      localContent: "",
    },
    "dev:post": {
      ...RELEASE_SLOT_LOCAL_META["dev:post"],
      hasLocalChanges: false,
      localContent: "",
    },
    "stable:changelog": {
      ...RELEASE_SLOT_LOCAL_META["stable:changelog"],
      hasLocalChanges: false,
      localContent: "",
    },
    "dev:changelog": {
      ...RELEASE_SLOT_LOCAL_META["dev:changelog"],
      hasLocalChanges: false,
      localContent: "",
    },
  });

  const [baseRevision, setBaseRevision] = useState<number>(1);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [conflictServerInfo, setConflictServerInfo] =
    useState<KeeperDocConflictInfo | null>(null);
  const pendingPublishRef = useRef<boolean>(false);
  const isDirtyRef = useRef(isDirty);
  const isEditorOpenRef = useRef(isEditorOpen);
  const baseRevisionRef = useRef(baseRevision);
  const activeSlotRef = useRef<ReleaseDocSlotKey>(
    `${editorChannel}:${editorDocType}`
  );
  isDirtyRef.current = isDirty;
  isEditorOpenRef.current = isEditorOpen;
  baseRevisionRef.current = baseRevision;
  activeSlotRef.current = `${editorChannel}:${editorDocType}`;

  const getReleaseDocKey = (
    ch: "stable" | "dev",
    docType: "post" | "changelog"
  ): string => `release:${ch}:${docType}`;

  const getScopedReleaseDraftKey = (
    ch: "stable" | "dev",
    docType: "post" | "changelog"
  ): string => `${currentUserId}::release:${ch}:${docType}`;

  const updateTimeoutRef = useRef<any>(null);
  const tiptapEditorRef = useRef<any>(null);
  const [editorSyncSeq, setEditorSyncSeq] = useState(0);

  const persistReleaseStateCache = useCallback(
    (stateObj: {
      workingPublicPost: KeepersReleasePostRecord;
      publishedPublicPost: KeepersReleasePostRecord;
      workingDevPost: KeepersReleasePostRecord;
      publishedDevPost: KeepersReleasePostRecord;
      workingStableChangelog: string;
      publishedStableChangelog: string;
      workingDevChangelog: string;
      publishedDevChangelog: string;
    }) => {
      try {
        localStorage.setItem(
          "sanctuary_keepers_release_posts_v5",
          JSON.stringify(stateObj)
        );
        // Keep v4 in sync with published posts for legacy readers
        localStorage.setItem(
          "sanctuary_keepers_release_posts_v4",
          JSON.stringify({
            publicPost: stateObj.publishedPublicPost,
            devPost: stateObj.publishedDevPost,
            publishedStableChangelog: stateObj.publishedStableChangelog,
            publishedDevChangelog: stateObj.publishedDevChangelog,
          })
        );
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const handleRemoteReleaseSavedRef = useRef<
    ((event: KeeperDocSavedBroadcast) => Promise<void>) | null
  >(null);

  const fallbackPresence = useKeeperDocPresence({
    enabled: isKeepers && !externalPresence,
    userId: currentUserId,
    username: resolvedKeeperName,
    onRemoteDocSaved: (ev) => {
      void handleRemoteReleaseSavedRef.current?.(ev);
    },
  });
  const activePresence = externalPresence || fallbackPresence;

  const wasReleaseEditorOpenRef = useRef(false);
  useEffect(() => {
    if (!isKeepers) return;
    if (isEditorOpen) {
      wasReleaseEditorOpenRef.current = true;
      activePresence.trackEditingDoc(
        getReleaseDocKey(editorChannel, editorDocType),
        editorDocType === "changelog"
          ? editorChannel === "dev"
            ? t("release_notes_dev_cl_title", "Dev Changelog")
            : t("release_notes_stable_cl_title", "Stable Changelog")
          : draftTitle ||
            (editorChannel === "dev"
              ? defaultDevPost.title
              : defaultPublicPost.title),
        isDirty
      );
    } else if (wasReleaseEditorOpenRef.current) {
      wasReleaseEditorOpenRef.current = false;
      activePresence.trackEditingDoc(null);
    }
  }, [
    isKeepers,
    isEditorOpen,
    editorChannel,
    editorDocType,
    draftTitle,
    isDirty,
    activePresence.trackEditingDoc,
    defaultDevPost.title,
    defaultPublicPost.title,
    t,
  ]);

  useEffect(() => {
    if (!isKeepers || !isEditorOpen) return;
    const draftKey = getScopedReleaseDraftKey(editorChannel, editorDocType);
    const timer = setTimeout(() => {
      if (!isDirty) {
        setWayfinderDrafts((prev) => {
          if (!prev[draftKey]) return prev;
          const next = { ...prev };
          delete next[draftKey];
          return next;
        });
        return;
      }

      setWayfinderDrafts((prev) => ({
        ...prev,
        [draftKey]: {
          _draftVersion: 5,
          baseRevision,
          isDirty: true,
          draftTitle,
          draftSummary,
          draftVersion,
          draftReleaseDate,
          draftPlatform,
          draftImageUrl,
          draftCodeSnippet,
          draftPollData,
          draftBody,
          savedAt: new Date().toISOString(),
        },
      }));
    }, 500);
    return () => clearTimeout(timer);
  }, [
    isKeepers,
    isEditorOpen,
    editorChannel,
    editorDocType,
    currentUserId,
    isDirty,
    baseRevision,
    draftTitle,
    draftSummary,
    draftVersion,
    draftReleaseDate,
    draftPlatform,
    draftImageUrl,
    draftCodeSnippet,
    draftPollData,
    draftBody,
    setWayfinderDrafts,
  ]);

  const loadPostsAndReleases = useCallback(
    async (
      forceRefreshGitHub = false,
      syncDirection:
        | "hub_only"
        | "hub_to_local"
        | "auto"
        | "local_to_hub" = "hub_only"
    ) => {
      try {
        const cachedRawV5 = localStorage.getItem(
          "sanctuary_keepers_release_posts_v5"
        );
        if (cachedRawV5) {
          const parsedCache = JSON.parse(cachedRawV5);
          if (parsedCache?.workingPublicPost)
            setWorkingPublicPost(parsedCache.workingPublicPost);
          if (parsedCache?.publishedPublicPost)
            setPublishedPublicPost(parsedCache.publishedPublicPost);
          if (parsedCache?.workingDevPost)
            setWorkingDevPost(parsedCache.workingDevPost);
          if (parsedCache?.publishedDevPost)
            setPublishedDevPost(parsedCache.publishedDevPost);
          if (parsedCache?.workingStableChangelog)
            setWorkingStableChangelog(parsedCache.workingStableChangelog);
          if (parsedCache?.publishedStableChangelog)
            setPublishedStableChangelog(parsedCache.publishedStableChangelog);
          if (parsedCache?.workingDevChangelog)
            setWorkingDevChangelog(parsedCache.workingDevChangelog);
          if (parsedCache?.publishedDevChangelog)
            setPublishedDevChangelog(parsedCache.publishedDevChangelog);
        }
      } catch {
        // ignore cache parse error
      }

      try {
        const [broadcastRes, cfg, localSnapshots] = await Promise.all([
          supabaseAuth
            .from("keeper_system_broadcasts")
            .select(
              "id, title, description, message, published_title, published_description, published_message, published_at, updated_at, updated_by, revision, category, target_audience, code_snippet, poll_data, created_at"
            )
            .in("category", [
              "ReleasePost_Public",
              "ReleasePost_Dev",
              "ReleaseNotesBlog",
              PUBLIC_CHANGELOG_BROADCAST_CATEGORY,
              DEV_CHANGELOG_BROADCAST_CATEGORY,
              PUBLIC_ARCHIVE_BROADCAST_CATEGORY,
              DEV_ARCHIVE_BROADCAST_CATEGORY,
            ])
            .order("updated_at", { ascending: false }),
          getKeepersPipelineConfig(forceRefreshGitHub),
          readAllLocalDocSnapshots(),
        ]);

        if (cfg) {
          setPipelineConfig(cfg);
        }

        if (!broadcastRes.error && Array.isArray(broadcastRes.data)) {
          const rows = broadcastRes.data;
          const publicRow =
            rows.find((r: any) => r.category === "ReleasePost_Public") ||
            rows.find(
              (r: any) =>
                r.category === "ReleaseNotesBlog" ||
                r.title === LEGACY_BLOG_BROADCAST_TITLE
            );
          const devRow = rows.find((r: any) => r.category === "ReleasePost_Dev");
          const publicChangelogRow = rows.find(
            (r: any) => r.category === PUBLIC_CHANGELOG_BROADCAST_CATEGORY
          );
          const devChangelogRow = rows.find(
            (r: any) => r.category === DEV_CHANGELOG_BROADCAST_CATEGORY
          );
          const pubArchiveRows = rows.filter(
            (r: any) => r.category === PUBLIC_ARCHIVE_BROADCAST_CATEGORY
          );
          const devArchiveRows = rows.filter(
            (r: any) => r.category === DEV_ARCHIVE_BROADCAST_CATEGORY
          );
          setDbArchivedPublicPosts(
            pubArchiveRows.map((r: any) =>
              deserializeReleasePostRow(r, defaultPublicPost, true)
            )
          );
          setDbArchivedDevPosts(
            devArchiveRows.map((r: any) =>
              deserializeReleasePostRow(r, defaultDevPost, true)
            )
          );

          const resolvedPubPublished = deserializeReleasePostRow(
            publicRow,
            defaultPublicPost,
            true
          );
          const resolvedPubWorking = deserializeReleasePostRow(
            publicRow,
            defaultPublicPost,
            false
          );

          const resolvedDevPublished = deserializeReleasePostRow(
            devRow,
            defaultDevPost,
            true
          );
          const resolvedDevWorking = deserializeReleasePostRow(
            devRow,
            defaultDevPost,
            false
          );

          const baseStableClFallback =
            bundledRunningChangelog || bundledNerdChangelog;
          const baseDevClFallback =
            bundledNerdChangelog || seedChangelog.markdown;

          const resolvedStableClPublished = deserializeChangelogRow(
            publicChangelogRow,
            baseStableClFallback,
            true
          );
          const resolvedStableClWorking = deserializeChangelogRow(
            publicChangelogRow,
            baseStableClFallback,
            false
          );

          const resolvedDevClPublished = deserializeChangelogRow(
            devChangelogRow,
            baseDevClFallback,
            true
          );
          const resolvedDevClWorking = deserializeChangelogRow(
            devChangelogRow,
            baseDevClFallback,
            false
          );

          let nextPubRowId = publicRow?.id || null;
          let nextDevRowId = devRow?.id || null;
          let nextPubClRowId = publicChangelogRow?.id || null;
          let nextDevClRowId = devChangelogRow?.id || null;

          // First-time seed ONLY when a singleton broadcast row is absent in DB
          if (isKeepers || isStaff) {
            const nowIso = new Date().toISOString();
            if (!nextPubRowId) {
              const serialized = serializeReleasePostMessage(resolvedPubWorking);
              const { data } = await supabaseAuth
                .from("keeper_system_broadcasts")
                .insert({
                  title: resolvedPubWorking.title,
                  description: resolvedPubWorking.summary || null,
                  category: "ReleasePost_Public",
                  target_audience: "Public",
                  message: serialized,
                  published_title: resolvedPubPublished.title,
                  published_description: resolvedPubPublished.summary || null,
                  published_message: serializeReleasePostMessage(
                    resolvedPubPublished
                  ),
                  published_at: nowIso,
                  updated_at: nowIso,
                  updated_by: resolvedKeeperName,
                  revision: 1,
                  is_active: false,
                  is_pinned: "false",
                })
                .select("id");
              if (data?.[0]?.id) {
                nextPubRowId = data[0].id;
                resolvedPubWorking.id = nextPubRowId;
              }
            }
            if (!nextDevRowId) {
              const serialized = serializeReleasePostMessage(resolvedDevWorking);
              const { data } = await supabaseAuth
                .from("keeper_system_broadcasts")
                .insert({
                  title: resolvedDevWorking.title,
                  description: resolvedDevWorking.summary || null,
                  category: "ReleasePost_Dev",
                  target_audience: "Dev",
                  message: serialized,
                  published_title: resolvedDevPublished.title,
                  published_description: resolvedDevPublished.summary || null,
                  published_message: serializeReleasePostMessage(
                    resolvedDevPublished
                  ),
                  published_at: nowIso,
                  updated_at: nowIso,
                  updated_by: resolvedKeeperName,
                  revision: 1,
                  is_active: false,
                  is_pinned: "false",
                })
                .select("id");
              if (data?.[0]?.id) {
                nextDevRowId = data[0].id;
                resolvedDevWorking.id = nextDevRowId;
              }
            }
            if (!nextPubClRowId) {
              const { data } = await supabaseAuth
                .from("keeper_system_broadcasts")
                .insert({
                  title: "Full Change Log (Stable)",
                  description:
                    "Running changelog across dev builds since last stable release",
                  category: PUBLIC_CHANGELOG_BROADCAST_CATEGORY,
                  target_audience: "Public",
                  message: resolvedStableClWorking,
                  published_title: "Full Change Log (Stable)",
                  published_description:
                    "Running changelog across dev builds since last stable release",
                  published_message: resolvedStableClPublished,
                  published_at: nowIso,
                  updated_at: nowIso,
                  updated_by: resolvedKeeperName,
                  revision: 1,
                  is_active: false,
                  is_pinned: "false",
                })
                .select("id");
              if (data?.[0]?.id) {
                nextPubClRowId = data[0].id;
              }
            }
            if (!nextDevClRowId) {
              const { data } = await supabaseAuth
                .from("keeper_system_broadcasts")
                .insert({
                  title: "Full Change Log (Dev)",
                  description: "Current Dev Build technical changelog",
                  category: DEV_CHANGELOG_BROADCAST_CATEGORY,
                  target_audience: "Dev",
                  message: resolvedDevClWorking,
                  published_title: "Full Change Log (Dev)",
                  published_description: "Current Dev Build technical changelog",
                  published_message: resolvedDevClPublished,
                  published_at: nowIso,
                  updated_at: nowIso,
                  updated_by: resolvedKeeperName,
                  revision: 1,
                  is_active: false,
                  is_pinned: "false",
                })
                .select("id");
              if (data?.[0]?.id) {
                nextDevClRowId = data[0].id;
              }
            }
          }

          const nextRevisions: Record<
            ReleaseDocSlotKey,
            { revision: number; updatedBy: string; updatedAt: string }
          > = {
            "stable:post": {
              revision: Number(publicRow?.revision || 1),
              updatedBy: publicRow?.updated_by || "Keepers Core",
              updatedAt: publicRow?.updated_at || publicRow?.created_at || "",
            },
            "dev:post": {
              revision: Number(devRow?.revision || 1),
              updatedBy: devRow?.updated_by || "Keepers Core",
              updatedAt: devRow?.updated_at || devRow?.created_at || "",
            },
            "stable:changelog": {
              revision: Number(publicChangelogRow?.revision || 1),
              updatedBy: publicChangelogRow?.updated_by || "Keepers Core",
              updatedAt:
                publicChangelogRow?.updated_at ||
                publicChangelogRow?.created_at ||
                "",
            },
            "dev:changelog": {
              revision: Number(devChangelogRow?.revision || 1),
              updatedBy: devChangelogRow?.updated_by || "Keepers Core",
              updatedAt:
                devChangelogRow?.updated_at ||
                devChangelogRow?.created_at ||
                "",
            },
          };
          setRevisionsBySlot(nextRevisions);

          // Published-Only Content-Hash Safe Local .md Fallback Sync
          if (isDesktop() || import.meta.env.DEV) {
            const forceOverwriteLocal = syncDirection === "hub_to_local";
            const [pubLocalRes, devLocalRes, clStableRes, clDevRes] =
              await Promise.all([
                syncPublishedToLocalFallbackIfSafe({
                  slug: "release_notes_public",
                  publishedContent: formatReleasePostToMarkdownFile(
                    resolvedPubPublished
                  ),
                  bundledBaseline: bundledCommunityBlog,
                  localSnapshot: localSnapshots.release_notes_public,
                  forceOverwriteLocal,
                }),
                syncPublishedToLocalFallbackIfSafe({
                  slug: "release_notes_dev",
                  publishedContent: formatReleasePostToMarkdownFile(
                    resolvedDevPublished
                  ),
                  bundledBaseline: bundledDevBlog,
                  localSnapshot: localSnapshots.release_notes_dev,
                  forceOverwriteLocal,
                }),
                syncPublishedToLocalFallbackIfSafe({
                  slug: "changelog_running",
                  publishedContent: resolvedStableClPublished,
                  bundledBaseline: bundledRunningChangelog,
                  localSnapshot: localSnapshots.changelog_running,
                  forceOverwriteLocal,
                }),
                syncPublishedToLocalFallbackIfSafe({
                  slug: "changelog_dev",
                  publishedContent: resolvedDevClPublished,
                  bundledBaseline: bundledNerdChangelog,
                  localSnapshot: localSnapshots.changelog_dev,
                  forceOverwriteLocal,
                }),
              ]);

            setLocalMdBySlot({
              "stable:post": {
                ...RELEASE_SLOT_LOCAL_META["stable:post"],
                hasLocalChanges: pubLocalRes.localState === "local_ahead",
                localContent: pubLocalRes.localContent,
              },
              "dev:post": {
                ...RELEASE_SLOT_LOCAL_META["dev:post"],
                hasLocalChanges: devLocalRes.localState === "local_ahead",
                localContent: devLocalRes.localContent,
              },
              "stable:changelog": {
                ...RELEASE_SLOT_LOCAL_META["stable:changelog"],
                hasLocalChanges: clStableRes.localState === "local_ahead",
                localContent: clStableRes.localContent,
              },
              "dev:changelog": {
                ...RELEASE_SLOT_LOCAL_META["dev:changelog"],
                hasLocalChanges: clDevRes.localState === "local_ahead",
                localContent: clDevRes.localContent,
              },
            });
          }

          setStableChangelogRowId(nextPubClRowId);
          setDevChangelogRowId(nextDevClRowId);

          setWorkingPublicPost(resolvedPubWorking);
          setPublishedPublicPost(resolvedPubPublished);
          setWorkingDevPost(resolvedDevWorking);
          setPublishedDevPost(resolvedDevPublished);

          setWorkingStableChangelog(resolvedStableClWorking);
          setPublishedStableChangelog(resolvedStableClPublished);
          setWorkingDevChangelog(resolvedDevClWorking);
          setPublishedDevChangelog(resolvedDevClPublished);

          persistReleaseStateCache({
            workingPublicPost: resolvedPubWorking,
            publishedPublicPost: resolvedPubPublished,
            workingDevPost: resolvedDevWorking,
            publishedDevPost: resolvedDevPublished,
            workingStableChangelog: resolvedStableClWorking,
            publishedStableChangelog: resolvedStableClPublished,
            workingDevChangelog: resolvedDevClWorking,
            publishedDevChangelog: resolvedDevClPublished,
          });
        }
      } catch {
        // Keep current / cached state if offline
      }
    },
    [
      defaultPublicPost,
      defaultDevPost,
      seedChangelog.markdown,
      isKeepers,
      isStaff,
      resolvedKeeperName,
      persistReleaseStateCache,
    ]
  );

  handleRemoteReleaseSavedRef.current = async (
    event: KeeperDocSavedBroadcast
  ) => {
    if (!event.docKey.startsWith("release:")) return;
    await loadPostsAndReleases(false, "hub_only");

    if (!isKeepers || !isEditorOpenRef.current) return;
    const [, evChannel, evDocType] = event.docKey.split(":");
    const activeKey = getReleaseDocKey(editorChannel, editorDocType);
    if (event.docKey !== activeKey) return;

    const isDev = evChannel === "dev";
    const category =
      evDocType === "changelog"
        ? isDev
          ? DEV_CHANGELOG_BROADCAST_CATEGORY
          : PUBLIC_CHANGELOG_BROADCAST_CATEGORY
        : isDev
        ? "ReleasePost_Dev"
        : "ReleasePost_Public";

    const { data: latestRow } = await supabaseAuth
      .from("keeper_system_broadcasts")
      .select("*")
      .eq("category", category)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latestRow) return;

    const latestRev = Number(latestRow.revision || event.revision || 1);
    if (!isDirtyRef.current) {
      if (evDocType === "changelog") {
        const latestCl = deserializeChangelogRow(
          latestRow,
          isDev ? bundledNerdChangelog : bundledRunningChangelog,
          false
        );
        setDraftBody(latestCl);
        setEditorSyncSeq((n) => n + 1);
      } else {
        const latestPost = deserializeReleasePostRow(
          latestRow,
          isDev ? defaultDevPost : defaultPublicPost,
          false
        );
        setDraftTitle(latestPost.title);
        setDraftSummary(latestPost.summary);
        setDraftVersion(latestPost.version);
        setDraftReleaseDate(latestPost.releaseDate);
        setDraftPlatform(latestPost.platform);
        setDraftImageUrl(latestPost.imageUrl || "");
        setDraftCodeSnippet(latestPost.codeSnippet || "");
        setShowCodeInput(Boolean(latestPost.codeSnippet));
        setDraftPollData(latestPost.pollData || null);
        setDraftBody(latestPost.body);
        setEditorSyncSeq((n) => n + 1);
      }
      setBaseRevision(latestRev);
      setConflictServerInfo(null);
      useStore
        .getState()
        .pushStatus(
          t(
            "keeper_toast_reloaded_upstream",
            "Reloaded latest update from @{0} (v{1})."
          )
            .replace("{0}", event.updatedBy || "Keeper")
            .replace("{1}", String(latestRev)),
          "info"
        );
    } else {
      const serverMd =
        evDocType === "changelog"
          ? deserializeChangelogRow(
              latestRow,
              isDev ? bundledNerdChangelog : bundledRunningChangelog,
              false
            )
          : formatReleasePostToMarkdownFile(
              deserializeReleasePostRow(
                latestRow,
                isDev ? defaultDevPost : defaultPublicPost,
                false
              )
            );
      setConflictServerInfo({
        baseRevision: baseRevisionRef.current,
        serverRevision: latestRev,
        updatedBy: latestRow.updated_by || event.updatedBy || "Keepers Core",
        updatedAt: latestRow.updated_at || event.updatedAt,
        serverTitle: latestRow.title,
        serverMarkdown: serverMd,
        localMarkdown: draftBody,
        isSaveBlocked: false,
      });
    }
  };

  useEffect(() => {
    loadPostsAndReleases(false, "hub_only");
    const onUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const dir = detail?.syncDirection === "hub_to_local" ? "hub_to_local" : "hub_only";
      loadPostsAndReleases(false, dir);
    };
    const onRemoteSaved = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail as KeeperDocSavedBroadcast | undefined;
      if (detail) void handleRemoteReleaseSavedRef.current?.(detail);
    };
    const onTourReleasePanel = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      if (detail.open) {
        setActiveChannel(detail.channel === "dev" ? "dev" : "stable");
        setActiveView(detail.view === "changelog" ? "changelog" : "post");
      } else {
        setActiveChannel(null);
      }
    };
    window.addEventListener("keepers_release_posts_updated", onUpdated);
    window.addEventListener("keepers_remote_doc_saved", onRemoteSaved);
    window.addEventListener("sanctuary-tour-release-notes-panel", onTourReleasePanel);
    return () => {
      window.removeEventListener("keepers_release_posts_updated", onUpdated);
      window.removeEventListener("keepers_remote_doc_saved", onRemoteSaved);
      window.removeEventListener("sanctuary-tour-release-notes-panel", onTourReleasePanel);
    };
  }, [loadPostsAndReleases]);

  const populateDraftForChannel = useCallback(
    (channel: "stable" | "dev", docType: "post" | "changelog" = editorDocType) => {
      const target = channel === "dev" ? workingDevPost : workingPublicPost;
      const targetChangelog =
        channel === "dev" ? workingDevChangelog : workingStableChangelog;
      const slotKey: ReleaseDocSlotKey = `${channel}:${docType}`;
      const scopedDraftKey = getScopedReleaseDraftKey(channel, docType);
      const savedDraft = useStore.getState().wayfinderDrafts[
        scopedDraftKey
      ] as any;
      const hasDraft = Boolean(savedDraft?.isDirty && Number(savedDraft?._draftVersion || 0) >= 5);
      const serverRevInfo = revisionsBySlot[slotKey] || {
        revision: 1,
        updatedBy: "Keepers Core",
        updatedAt: "",
      };

      setEditorChannel(channel);
      setEditorDocType(docType);
      setBaseRevision(Number(hasDraft && savedDraft.baseRevision ? savedDraft.baseRevision : serverRevInfo.revision));
      setIsDirty(hasDraft);

      if (
        hasDraft &&
        savedDraft.baseRevision &&
        serverRevInfo.revision > Number(savedDraft.baseRevision)
      ) {
        setConflictServerInfo({
          baseRevision: Number(savedDraft.baseRevision),
          serverRevision: serverRevInfo.revision,
          updatedBy: serverRevInfo.updatedBy,
          updatedAt: serverRevInfo.updatedAt,
          serverTitle: target.title,
          serverMarkdown:
            docType === "changelog"
              ? targetChangelog
              : formatReleasePostToMarkdownFile(target),
          localMarkdown: String(savedDraft.draftBody || ""),
          isSaveBlocked: false,
        });
      } else {
        setConflictServerInfo(null);
      }

      setDraftTitle(hasDraft ? savedDraft.draftTitle ?? target.title : target.title);
      setDraftSummary(hasDraft ? savedDraft.draftSummary ?? target.summary : target.summary);
      setDraftVersion(
        hasDraft
          ? savedDraft.draftVersion ?? target.version
          : target.version || (channel === "dev" ? defaultDevVersion : defaultStableVersion)
      );
      setDraftReleaseDate(
        hasDraft
          ? savedDraft.draftReleaseDate ?? target.releaseDate
          : target.releaseDate || (channel === "dev" ? defaultDevDate : defaultStableDate)
      );
      setDraftPlatform(
        hasDraft
          ? savedDraft.draftPlatform ?? target.platform
          : target.platform || t("release_notes_meta_platform_default", "Windows & macOS")
      );
      setDraftImageUrl(hasDraft ? savedDraft.draftImageUrl ?? (target.imageUrl || "") : target.imageUrl || "");
      setDraftCodeSnippet(
        hasDraft ? savedDraft.draftCodeSnippet ?? (target.codeSnippet || "") : target.codeSnippet || ""
      );
      setShowCodeInput(
        Boolean(hasDraft ? savedDraft.draftCodeSnippet ?? target.codeSnippet : target.codeSnippet)
      );
      setDraftPollData(
        hasDraft
          ? savedDraft.draftPollData !== undefined
            ? savedDraft.draftPollData
            : target.pollData || null
          : target.pollData || null
      );
      const nextBody = hasDraft
        ? savedDraft.draftBody ?? (docType === "changelog" ? targetChangelog : target.body)
        : docType === "changelog"
        ? targetChangelog
        : target.body;
      setDraftBody(nextBody);
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      setEditorSyncSeq((n) => n + 1);
    },
    [
      editorDocType,
      workingDevPost,
      workingPublicPost,
      workingDevChangelog,
      workingStableChangelog,
      defaultDevVersion,
      defaultStableVersion,
      defaultDevDate,
      defaultStableDate,
      revisionsBySlot,
      currentUserId,
      t,
    ]
  );

  const openKeepersEditor = (
    channel: "stable" | "dev",
    docType: "post" | "changelog" = "post"
  ) => {
    populateDraftForChannel(channel, docType);
    setIsEditorOpen(true);
  };

  const {
    handleImportLocalReleaseMd,
    handleLoadLatestReleaseFromHub,
    handleLinkAsset,
    handlePublishChannel,
    handleSaveKeepersPost,
    handleRefreshGitHubChangelog,
    handleStartNewVersionDraft,
    handleDeleteArchiveEntry,
  } = useReleaseNotesActions({
    t,
    setWayfinderDrafts,
    resolvedKeeperName,
    defaultPublicPost,
    defaultDevPost,
    workingPublicPost,
    setWorkingPublicPost,
    publishedPublicPost,
    setPublishedPublicPost,
    workingDevPost,
    setWorkingDevPost,
    publishedDevPost,
    setPublishedDevPost,
    workingStableChangelog,
    setWorkingStableChangelog,
    publishedStableChangelog,
    setPublishedStableChangelog,
    workingDevChangelog,
    setWorkingDevChangelog,
    publishedDevChangelog,
    setPublishedDevChangelog,
    stableChangelogRowId,
    setStableChangelogRowId,
    devChangelogRowId,
    setDevChangelogRowId,
    setIsEditorOpen,
    editorMode,
    editorChannel,
    editorDocType,
    setDraftTitle,
    draftTitle,
    setDraftSummary,
    draftSummary,
    setDraftVersion,
    draftVersion,
    setDraftReleaseDate,
    draftReleaseDate,
    setDraftPlatform,
    draftPlatform,
    draftImageUrl,
    draftCodeSnippet,
    draftPollData,
    setDraftBody,
    draftBody,
    setIsAssetPanelOpen,
    setIsSaving,
    setIsPublishing,
    setIsSyncing,
    setRevisionsBySlot,
    localMdBySlot,
    setLocalMdBySlot,
    baseRevision,
    setBaseRevision,
    setIsDirty,
    setConflictServerInfo,
    pendingPublishRef,
    getReleaseDocKey,
    getScopedReleaseDraftKey,
    updateTimeoutRef,
    tiptapEditorRef,
    setEditorSyncSeq,
    persistReleaseStateCache,
    activePresence,
    loadPostsAndReleases,
    populateDraftForChannel,
  });

  const formatCompactReleaseDate = (raw: string): string => {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "";
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
    return trimmed;
  };

  // Resolved display values for Public & Dev channels
  const stableVersion = (publicPost.version || defaultStableVersion).replace(/^v/i, "").trim();
  const devVersion = (devPost.version || defaultDevVersion).replace(/^v/i, "").trim();

  const stableDateDisplay = formatCompactReleaseDate(publicPost.releaseDate || defaultStableDate);
  const devDateDisplay = formatCompactReleaseDate(devPost.releaseDate || defaultDevDate);

  const stablePlatformDisplay =
    publicPost.platform || t("release_notes_meta_platform_default", "Windows & macOS");
  const devPlatformDisplay =
    devPost.platform || t("release_notes_meta_platform_default", "Windows & macOS");

  // Full Change Logs:
  // - Keepers view (isKeepers=true) displays working (synced .md + DB) changelog
  // - User view (isKeepers=false) displays published changelog ONLY
  const stableGitHubChangelog = isKeepers
    ? workingStableChangelog
    : publishedStableChangelog;
  const devGitHubChangelog = isKeepers
    ? workingDevChangelog
    : publishedDevChangelog;

  const activeArchiveEntries = useMemo<KeepersReleaseArchiveEntry[]>(() => {
    const channel: "stable" | "dev" = activeChannel === "dev" ? "dev" : "stable";
    const dbPosts = channel === "dev" ? dbArchivedDevPosts : dbArchivedPublicPosts;
    const byVer = new Map<string, KeepersReleaseArchiveEntry>();

    for (const p of dbPosts) {
      const cleanVer = String(p.version || "").replace(/^v/i, "").trim();
      const key = normalizeReleaseVersionKey(cleanVer);
      if (!key) continue;
      byVer.set(key, {
        key,
        dbRowId: p.id || null,
        channel,
        version: cleanVer,
        releaseDate: p.releaseDate || "",
        title: p.title || `Sanctuary OS v${cleanVer}`,
        summary: p.summary || "",
        platform: p.platform || t("release_notes_meta_platform_default", "Windows & macOS"),
        imageUrl: p.imageUrl || "",
        codeSnippet: p.codeSnippet || "",
        postBody: cleanPostBodyForViewer(p.body || ""),
        changelogMarkdown: p.archivedChangelog || "",
        publishedAt: p.publishedAt || "",
      });
    }

    const mdSources =
      channel === "dev"
        ? [devGitHubChangelog, bundledRunningChangelog]
        : [stableGitHubChangelog];
    for (const src of mdSources) {
      if (!src || !src.trim()) continue;
      for (const blk of parseAllChangelogBlocks(src)) {
        const cleanVer = String(blk.version || "").replace(/^v/i, "").trim();
        const key = normalizeReleaseVersionKey(cleanVer);
        if (!key) continue;
        const existing = byVer.get(key);
        if (existing) {
          if (!existing.changelogMarkdown && blk.markdown) {
            existing.changelogMarkdown = blk.markdown;
          }
          if (!existing.releaseDate && blk.date) {
            existing.releaseDate = blk.date;
          }
        } else {
          byVer.set(key, {
            key,
            dbRowId: null,
            channel,
            version: cleanVer,
            releaseDate: blk.date || "",
            title: blk.heading || `Sanctuary OS v${cleanVer}`,
            summary: blk.heading || t("release_notes_archive_cl_only_summary", "Archived build changelog entry."),
            platform: t("release_notes_meta_platform_default", "Windows & macOS"),
            imageUrl: "",
            codeSnippet: "",
            postBody: "",
            changelogMarkdown: blk.markdown || "",
            publishedAt: "",
          });
        }
      }
    }

    const activeCurVer = (
      channel === "dev" ? devPost.version || defaultDevVersion : publicPost.version || defaultStableVersion
    )
      .replace(/^v/i, "")
      .trim();
    const activeCurKey = normalizeReleaseVersionKey(activeCurVer);
    if (activeCurKey) {
      const srcPost = channel === "dev" ? devPost : publicPost;
      const srcCl = extractChangelogForVersion(
        channel === "dev" ? devGitHubChangelog : stableGitHubChangelog,
        activeCurVer
      );
      const existing = byVer.get(activeCurKey);
      if (existing) {
        if (srcPost.title) existing.title = srcPost.title;
        if (srcPost.summary) existing.summary = srcPost.summary;
        if (srcPost.releaseDate) existing.releaseDate = srcPost.releaseDate;
        if (srcPost.platform) existing.platform = srcPost.platform;
        if (srcPost.imageUrl && !existing.imageUrl) existing.imageUrl = srcPost.imageUrl;
        if (srcPost.codeSnippet && !existing.codeSnippet) existing.codeSnippet = srcPost.codeSnippet;
        if (!existing.postBody && srcPost.body) {
          existing.postBody = cleanPostBodyForViewer(srcPost.body);
        }
        if (!existing.changelogMarkdown && srcCl) {
          existing.changelogMarkdown = srcCl;
        }
      } else if (srcPost.body || srcCl) {
        byVer.set(activeCurKey, {
          key: activeCurKey,
          dbRowId: null,
          channel,
          version: activeCurVer,
          releaseDate: srcPost.releaseDate || "",
          title: srcPost.title || `Sanctuary OS v${activeCurVer}`,
          summary: srcPost.summary || "",
          platform: srcPost.platform || t("release_notes_meta_platform_default", "Windows & macOS"),
          imageUrl: srcPost.imageUrl || "",
          codeSnippet: srcPost.codeSnippet || "",
          postBody: cleanPostBodyForViewer(srcPost.body || ""),
          changelogMarkdown: srcCl || "",
          publishedAt: srcPost.publishedAt || "",
        });
      }
    }

    return Array.from(byVer.values()).sort((a, b) => {
      if (isBundledVersionNewer(a.version, b.version)) return -1;
      if (isBundledVersionNewer(b.version, a.version)) return 1;
      return 0;
    });
  }, [
    activeChannel,
    dbArchivedDevPosts,
    dbArchivedPublicPosts,
    devGitHubChangelog,
    stableGitHubChangelog,
    devPost,
    publicPost,
    defaultDevVersion,
    defaultStableVersion,
    t,
  ]);

  const openReleasePanel = (channel: "stable" | "dev") => {
    setActiveChannel(channel);
    setSelectedArchiveEntry(null);
    setActiveView("post");
  };

  const handleRestoreArchiveToDraft = (entry: KeepersReleaseArchiveEntry) => {
    setEditorChannel(entry.channel);
    setEditorDocType("post");
    setDraftTitle(entry.title);
    setDraftSummary(entry.summary);
    setDraftVersion(entry.version);
    setDraftReleaseDate(entry.releaseDate);
    setDraftPlatform(entry.platform);
    setDraftImageUrl(entry.imageUrl || "");
    setDraftCodeSnippet(entry.codeSnippet || "");
    setShowCodeInput(Boolean(entry.codeSnippet));
    setDraftPollData(null);
    setDraftBody(entry.postBody || entry.changelogMarkdown);
    setIsDirty(true);
    setEditorSyncSeq((n) => n + 1);
    setIsEditorOpen(true);
  };

  const buildCommSubtitle = (channelBadge: string, versionStr: string) => (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-md glass-surface border border-[color-mix(in_srgb,var(--text)_20%,transparent)] backdrop-blur-md shrink-0">
        <span className="material-symbols-outlined !text-[12px] text-[var(--text)] drop-shadow-md">
          {t("icon_memory", "memory")}
        </span>
      </div>
      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 whitespace-nowrap shrink-0">
        {t("author_sanctuary_team", "Sanctuary Foundry")}
      </span>
      <span className="text-[10px] font-black opacity-30 text-[var(--text)]">&bull;</span>
      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] truncate">
        {channelBadge}
      </span>
      <span className="text-[10px] font-mono font-bold tracking-widest text-[var(--accent)] hidden">
        v{versionStr}
      </span>
    </div>
  );

  const isDevActive = activeChannel === "dev";
  const activePostRecord = isDevActive ? devPost : publicPost;
  const activeChannelHasUnpublished = isDevActive ? hasUnpublishedDev : hasUnpublishedPublic;
  const activeVersion = isDevActive ? devVersion : stableVersion;
  const activeDateStr = isDevActive ? devDateDisplay : stableDateDisplay;
  const activePlatformStr = isDevActive ? devPlatformDisplay : stablePlatformDisplay;
  const activeChannelBadge = isDevActive
    ? t("release_notes_dev_channel_badge", "Dev Build")
    : t("release_notes_stable_channel_badge", "Stable Release");

  const activeTitle =
    activeView === "changelog"
      ? t("release_notes_github_changelog_title", "Full Change Log")
      : activePostRecord.title;

  const activeGroupTitle =
    activeView === "changelog"
      ? t("release_notes_full_changelog_heading", "Full Change Log")
      : t("release_notes_post_overview_heading", "Release Overview");

  const activeMarkdownContent =
    activeView === "changelog"
      ? isDevActive
        ? devGitHubChangelog
        : stableGitHubChangelog
      : cleanPostBodyForViewer(activePostRecord.body);

  const activeGitHubUrl = isDevActive
    ? pipelineConfig.dev_release_url || GITHUB_WEB_DEV_RELEASE_URL
    : pipelineConfig.stable_release_url || GITHUB_RELEASES_WEB_URL;

  const renderReleaseInfoPanel = (
    dateVal: string,
    versionVal: string,
    isDevChan: boolean,
    platformVal: string
  ) => {
    const compactDate = formatCompactReleaseDate(dateVal);
    return (
      <div className="grid grid-cols-2 gap-3 w-full">
        <StatBox
          className="w-full"
          icon={t("icon_calendar_today", "calendar_today")}
          iconColorClass="text-[var(--accent)]"
          label={t("release_notes_meta_release_date", "Release Date")}
          value={compactDate}
          tooltipSubtitle={dateVal || compactDate}
        />
        <StatBox
          className="w-full"
          icon={t("icon_tag", "tag")}
          iconColorClass="text-[var(--accent)]"
          label={t("release_notes_meta_version", "Version Number")}
          value={`v${versionVal.replace(/^v/i, "")}`}
          tooltipSubtitle={`v${versionVal.replace(/^v/i, "")}`}
        />
        <StatBox
          className="w-full"
          icon={isDevChan ? t("icon_bolt", "bolt") : t("icon_verified", "verified")}
          iconColorClass={isDevChan ? "text-[var(--warning)]" : "text-[var(--success)]"}
          label={t("release_notes_meta_channel", "Channel")}
          value={
            isDevChan
              ? t("release_notes_meta_channel_dev", "Dev")
              : t("release_notes_meta_channel_public", "Public")
          }
          tooltipSubtitle={
            isDevChan
              ? t("release_notes_dev_channel_badge", "Dev Build")
              : t("release_notes_stable_channel_badge", "Stable Release")
          }
        />
        <StatBox
          className="w-full"
          icon={t("icon_devices", "devices")}
          iconColorClass="text-[var(--accent)]"
          label={t("release_notes_meta_platform", "Platform")}
          value={platformVal}
          tooltipSubtitle={platformVal}
        />
      </div>
    );
  };

  const renderKeepersChannelChips = (ch: "stable" | "dev") => {
    const postKey = getReleaseDocKey(ch, "post");
    const clKey = getReleaseDocKey(ch, "changelog");
    const rawPeers = [
      ...(activePresence.peersByDocKey[postKey] || []),
      ...(activePresence.peersByDocKey[clKey] || []),
    ];
    const dedupPeers: typeof rawPeers = [];
    const seenSids = new Set<string>();
    for (const p of rawPeers) {
      if (!seenSids.has(p.sessionId)) {
        seenSids.add(p.sessionId);
        dedupPeers.push(p);
      }
    }
    const hasScopedDraft = Boolean(
      (wayfinderDrafts[getScopedReleaseDraftKey(ch, "post")] as any)?.isDirty ||
        (wayfinderDrafts[getScopedReleaseDraftKey(ch, "changelog")] as any)?.isDirty
    );
    const hasLocalChanges =
      (isDesktop() || import.meta.env.DEV) &&
      (localMdBySlot[`${ch}:post`]?.hasLocalChanges ||
        localMdBySlot[`${ch}:changelog`]?.hasLocalChanges);

    return (
      <>
        {hasScopedDraft && (
          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
              {t("icon_edit", "edit")}
            </span>
            <span>{t("action_unsaved_draft", "Draft")}</span>
          </span>
        )}
        {hasLocalChanges && (
          <span className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
              {t("icon_description", "description")}
            </span>
            <span>{t("keeper_badge_local_md_ahead", "Local .md Modified")}</span>
          </span>
        )}
        {dedupPeers.map((peer) => (
          <span key={peer.sessionId} className={VAULT_CHIP_CLASS}>
            <span
              className={`material-symbols-outlined !text-[12px] ${
                peer.hasUnsavedChanges
                  ? "text-[var(--warning)]"
                  : "text-[var(--accent)]"
              }`}
            >
              {peer.hasUnsavedChanges
                ? t("icon_edit_note", "edit_note")
                : t("icon_visibility", "visibility")}
            </span>
            <span>@{peer.username}</span>
          </span>
        ))}
      </>
    );
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* 2-Card Grid: Compact Keepers cards when isKeepers=true, or full Landing cards */}
      {isKeepers ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {/* Card 1: Public / Stable Release */}
          <div
            onClick={() => openReleasePanel("stable")}
            className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.35))] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col justify-between gap-3 group"
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] group-hover:scale-110 transition-transform duration-300">
                    {t("icon_verified", "verified")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {hasUnpublishedPublic && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_pending_actions", "pending_actions")}
                      </span>
                      <span>
                        {t("dir_status_staged_sync", "Synced • Unpushed")}
                      </span>
                    </span>
                  )}
                  {renderKeepersChannelChips("stable")}
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_verified", "verified")}
                    </span>
                    {t("release_notes_meta_channel_public", "Public")} &bull; v{stableVersion}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--accent)]">
                  {t("release_notes_stable_channel_badge", "Stable Release")}
                </span>
                <h4 className="text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors duration-300 tracking-tight leading-snug line-clamp-1">
                  {publicPost.title}
                </h4>
              </div>
              <p className="text-[11px] font-normal text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
                {publicPost.summary}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_calendar_today", "calendar_today")}
                </span>
                {stableDateDisplay}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {hasUnpublishedPublic && (
                  <button
                    type="button"
                    onClick={(e) => handlePublishChannel("stable", e)}
                    disabled={isPublishing || isSaving || isSyncing}
                    className="px-2.5 py-1 rounded-lg glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_publish", "publish")}
                    </span>
                    <span>{t("btn_publish", "Publish")}</span>
                  </button>
                )}
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-80 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  {t("release_notes_read_notes_cta", "Read Release Notes")}
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_arrow_forward", "arrow_forward")}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Dev Build */}
          <div
            onClick={() => openReleasePanel("dev")}
            className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.35))] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col justify-between gap-3 group"
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--success)] group-hover:scale-110 transition-transform duration-300">
                    {t("icon_bolt", "bolt")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {hasUnpublishedDev && (
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_pending_actions", "pending_actions")}
                      </span>
                      <span>
                        {t("dir_status_staged_sync", "Synced • Unpushed")}
                      </span>
                    </span>
                  )}
                  {renderKeepersChannelChips("dev")}
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                      {t("icon_bolt", "bolt")}
                    </span>
                    {t("release_notes_meta_channel_dev", "Dev")} &bull; v{devVersion}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--success)]">
                  {t("release_notes_dev_channel_badge", "Dev Build")}
                </span>
                <h4 className="text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors duration-300 tracking-tight leading-snug line-clamp-1">
                  {devPost.title}
                </h4>
              </div>
              <p className="text-[11px] font-normal text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
                {devPost.summary}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_calendar_today", "calendar_today")}
                </span>
                {devDateDisplay}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {hasUnpublishedDev && (
                  <button
                    type="button"
                    onClick={(e) => handlePublishChannel("dev", e)}
                    disabled={isPublishing || isSaving || isSyncing}
                    className="px-2.5 py-1 rounded-lg glass-surface sa-glass-pill-hover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                      {t("icon_publish", "publish")}
                    </span>
                    <span>{t("btn_publish", "Publish")}</span>
                  </button>
                )}
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-80 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  {t("release_notes_read_dev_cta", "Read Dev Build Notes")}
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_arrow_forward", "arrow_forward")}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            canSeeDevBuildCard ? "md:grid-cols-2" : "md:grid-cols-1 max-w-2xl"
          } gap-6 w-full`}
        >
          {/* Card 1: Public / Stable Release */}
          <UniversalCard
            layout="vertical"
            icon={t("icon_new_releases", "new_releases")}
            title={publicPost.title}
            subtitle={buildCommSubtitle(
              t("release_notes_stable_channel_badge", "Stable Release"),
              stableVersion
            )}
            bannerTopLabel={`${t("release_notes_stable_channel_badge", "Stable Release")} • v${stableVersion}`}
            bannerBottomLabel={`${t("author_sanctuary_team", "Sanctuary Foundry")} • ${stablePlatformDisplay}`}
            onClick={() => openReleasePanel("stable")}
            className="w-full h-full"
            imageOverlay={
              <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_verified", "verified")}
                  </span>
                  {t("release_notes_meta_channel_public", "Public")} &bull; v{stableVersion}
                </span>
              </div>
            }
            footer={
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[12px]">
                    {t("icon_calendar_today", "calendar_today")}
                  </span>
                  {stableDateDisplay}
                </span>
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  {t("release_notes_read_notes_cta", "Read Release Notes")}{" "}
                  <span className="material-symbols-outlined !text-sm">
                    {t("icon_arrow_forward", "arrow_forward")}
                  </span>
                </span>
              </div>
            }
          >
            <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
              {publicPost.summary}
            </p>
          </UniversalCard>

          {/* Card 2: Dev Build (Supporters & Authenticated Staff Only) */}
          {canSeeDevBuildCard && (
            <UniversalCard
              layout="vertical"
              icon={t("icon_bolt", "bolt")}
              title={devPost.title}
              subtitle={buildCommSubtitle(
                t("release_notes_dev_channel_badge", "Dev Build"),
                devVersion
              )}
              bannerTopLabel={`${t("release_notes_dev_channel_badge", "Dev Build")} • v${devVersion}`}
              bannerBottomLabel={`${t("author_sanctuary_team", "Sanctuary Foundry")} • ${devPlatformDisplay}`}
              onClick={() => openReleasePanel("dev")}
              className="w-full h-full"
              imageOverlay={
                <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-30">
                  <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                      {t("icon_bolt", "bolt")}
                    </span>
                    {t("release_notes_meta_channel_dev", "Dev")} &bull; v{devVersion}
                  </span>
                </div>
              }
              footer={
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_calendar_today", "calendar_today")}
                    </span>
                    {devDateDisplay}
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                    {t("release_notes_read_dev_cta", "Read Dev Build Notes")}{" "}
                    <span className="material-symbols-outlined !text-sm">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                </div>
              }
            >
              <p className="text-xs text-[var(--subtext)] leading-relaxed font-medium opacity-85 line-clamp-3 mt-1">
                {devPost.summary}
              </p>
            </UniversalCard>
          )}
        </div>
      )}

      {/* Comm-Link Style SidePanel with StatTiles (View -> Post / Changelog / On GitHub) */}
      <SidePanel
        isOpen={activeChannel !== null}
        onClose={() => setActiveChannel(null)}
        title={t("release_notes_blog_panel_title", "Community Release Notes")}
        subtitle={`${activeChannelBadge} v${activeVersion}`}
        icon={isDevActive ? t("icon_bolt", "bolt") : t("icon_forum", "forum")}
        widthClass="w-[55vw] max-w-5xl"
        panelZ="z-[50001]"
        backdropZ="z-[50000]"
        panelClass="!border-l-[color-mix(in_srgb,var(--text)_15%,transparent)]"
        headerActions={
          isKeepers ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                onClick={() => handlePublishChannel(isDevActive ? "dev" : "stable")}
                disabled={isPublishing || isSaving || isSyncing}
                tooltip={t("dir_btn_publish_live", "Update / Publish to {Citizens}")}
                icon={isPublishing ? t("icon_sync", "sync") : t("icon_publish", "publish")}
                variant={activeChannelHasUnpublished ? "accent" : undefined}
              />
              <PanelHeaderButton
                onClick={() =>
                  openKeepersEditor(
                    isDevActive ? "dev" : "stable",
                    activeView === "changelog" ? "changelog" : "post"
                  )
                }
                tooltip={t("release_notes_edit_post_btn", "Edit Release Post")}
                icon={t("icon_edit", "edit")}
                variant="accent"
              />
              <PanelHeaderButton
                onClick={handleRefreshGitHubChangelog}
                disabled={isSyncing}
                tooltip={t("release_notes_sync_github_btn", "Sync from Repo / GitHub")}
                icon={t("icon_sync", "sync")}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-6 pb-12 w-full">
          {/* StatTile Filter Grid inside SidePanel */}
          <SidePanelFilterBar className="grid-cols-2 sm:grid-cols-4 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_menu_book", "menu_book")}
              label={t("btn_view", "View")}
              number={t("btn_post", "Post")}
              colorClass="text-[var(--accent)]"
              isActive={activeView === "post"}
              onClick={() => {
                setSelectedArchiveEntry(null);
                setActiveView("post");
              }}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_terminal", "terminal")}
              label={t("btn_view", "View")}
              number={t("release_notes_tile_changelog", "Changelog")}
              colorClass="text-[var(--accent)]"
              isActive={activeView === "changelog"}
              onClick={() => {
                setSelectedArchiveEntry(null);
                setActiveView("changelog");
              }}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_inventory_2", "inventory_2")}
              label={t("btn_view", "View")}
              number={`${t("release_notes_tile_archives", "Archives")} (${activeArchiveEntries.length})`}
              colorClass="text-[var(--accent)]"
              isActive={activeView === "archive"}
              onClick={() => {
                setSelectedArchiveEntry(null);
                setActiveView("archive");
              }}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_open_in_new", "open_in_new")}
              label={t("btn_view", "View")}
              number={t("release_notes_tile_on_github", "On GitHub")}
              colorClass="text-[var(--text)]"
              isActive={false}
              onClick={() => handleOpenUrl(activeGitHubUrl)}
            />
          </SidePanelFilterBar>

          {activeView === "archive" ? (
            selectedArchiveEntry ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_arrow_back", "arrow_back")}
                    label={t("release_notes_back_to_archives", "Back to Archives")}
                    onClick={() => setSelectedArchiveEntry(null)}
                  />
                  {isKeepers && (
                    <ActionButton
                      variant="accent"
                      icon={t("icon_edit", "edit")}
                      label={t("release_notes_restore_to_draft", "Load into Draft Editor")}
                      onClick={() => handleRestoreArchiveToDraft(selectedArchiveEntry)}
                    />
                  )}
                </div>

                <SidePanelHeroCard
                  title={selectedArchiveEntry.title}
                  subtitle={t("release_notes_archived_subtitle", "Archived Release Record")}
                  label={`${activeChannelBadge} v${selectedArchiveEntry.version}`}
                  icon={t("icon_inventory_2", "inventory_2")}
                  variant="accent"
                >
                  <div className="flex flex-col gap-4 w-full">
                    {selectedArchiveEntry.imageUrl && (
                      <div className="w-full h-52 sm:h-64 rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                        <img
                          src={selectedArchiveEntry.imageUrl}
                          alt={selectedArchiveEntry.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    {renderReleaseInfoPanel(
                      selectedArchiveEntry.releaseDate || activeDateStr,
                      selectedArchiveEntry.version,
                      isDevActive,
                      selectedArchiveEntry.platform
                    )}
                  </div>
                </SidePanelHeroCard>

                {selectedArchiveEntry.postBody && (
                  <UniversalGroup
                    title={t("release_notes_post_overview_heading", "Release Overview")}
                    icon={t("icon_menu_book", "menu_book")}
                  >
                    <StructuredReleaseNotesView content={selectedArchiveEntry.postBody} />
                  </UniversalGroup>
                )}

                {selectedArchiveEntry.changelogMarkdown && (
                  <UniversalGroup
                    title={t("release_notes_full_changelog_heading", "Full Change Log")}
                    icon={t("icon_terminal", "terminal")}
                  >
                    <StructuredReleaseNotesView content={selectedArchiveEntry.changelogMarkdown} />
                  </UniversalGroup>
                )}
              </>
            ) : (
              <UniversalGroup
                title={`${t("release_notes_archives_heading", "Release & Changelog Archives")} (${activeArchiveEntries.length})`}
                icon={t("icon_inventory_2", "inventory_2")}
              >
                {activeArchiveEntries.length === 0 ? (
                  <EmptyState
                    icon={t("icon_inventory_2", "inventory_2")}
                    title={t("release_notes_archives_empty_title", "No Archived Builds Yet")}
                    subtitle={t(
                      "release_notes_archives_empty_sub",
                      "Previous release posts and changelogs are preserved automatically whenever you publish a new version."
                    )}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    {activeArchiveEntries.map((entry) => {
                      const isCurrentVer =
                        entry.key === normalizeReleaseVersionKey(activeVersion);
                      return (
                        <UniversalCard
                          key={`${entry.channel}-${entry.key}`}
                          layout="vertical"
                          headerStyle="inline"
                          icon={
                            entry.channel === "dev"
                              ? t("icon_bolt", "bolt")
                              : t("icon_verified", "verified")
                          }
                          title={entry.title}
                          subtitle={`v${entry.version}${entry.releaseDate ? ` • ${formatCompactReleaseDate(entry.releaseDate)}` : ""}`}
                          onClick={() => setSelectedArchiveEntry(entry)}
                          onContextMenu={
                            isKeepers
                              ? (e) => {
                                  openSanctuaryContextMenu(e, [
                                    {
                                      label: t(
                                        "release_notes_restore_to_draft",
                                        "Load into Draft Editor"
                                      ),
                                      icon: t("icon_edit", "edit"),
                                      onClick: () => handleRestoreArchiveToDraft(entry),
                                    },
                                    ...(entry.dbRowId
                                      ? [
                                          {
                                            label: t("btn_delete", "{Delete}"),
                                            icon: t("icon_delete", "delete"),
                                            variant: "danger" as const,
                                            onClick: () => handleDeleteArchiveEntry(entry),
                                          },
                                        ]
                                      : []),
                                  ]);
                                }
                              : undefined
                          }
                          badges={
                            <>
                              <span className={VAULT_CHIP_CLASS}>
                                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                  {t("icon_tag", "tag")}
                                </span>
                                <span>v{entry.version}</span>
                              </span>
                              {isCurrentVer && (
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                    {t("icon_check_circle", "check_circle")}
                                  </span>
                                  <span>{t("current", "Current")}</span>
                                </span>
                              )}
                              {entry.postBody && (
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                    {t("icon_menu_book", "menu_book")}
                                  </span>
                                  <span>{t("btn_post", "Post")}</span>
                                </span>
                              )}
                              {entry.changelogMarkdown && (
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                    {t("icon_terminal", "terminal")}
                                  </span>
                                  <span>{t("release_notes_tile_changelog", "Changelog")}</span>
                                </span>
                              )}
                            </>
                          }
                          footer={
                            <div className="flex items-center justify-between w-full">
                              <span className="text-[10px] font-mono text-[var(--subtext)] opacity-75">
                                {entry.releaseDate
                                  ? formatCompactReleaseDate(entry.releaseDate)
                                  : `v${entry.version}`}
                              </span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] flex items-center gap-1">
                                {t("btn_inspect_manifest", "Inspect")} &rarr;
                              </span>
                            </div>
                          }
                        >
                          {entry.summary && (
                            <p className="text-[11px] text-[var(--subtext)] opacity-85 line-clamp-2 leading-relaxed mt-1">
                              {entry.summary}
                            </p>
                          )}
                        </UniversalCard>
                      );
                    })}
                  </div>
                )}
              </UniversalGroup>
            )
          ) : (
            <>
              <SidePanelHeroCard
                title={activeTitle}
                subtitle={t("release_notes_author_subtitle", "Official Release Dispatch")}
                label={`${activeChannelBadge} v${activeVersion}`}
                icon={isDevActive ? t("icon_bolt", "bolt") : t("icon_forum", "forum")}
                variant="accent"
                badges={[
                  ...(isKeepers && activeChannelHasUnpublished
                    ? [
                        {
                          icon: t("icon_pending_actions", "pending_actions"),
                          label: t("dir_status_staged_sync", "Synced • Unpushed"),
                          colorClass:
                            "text-[var(--warning)] border-[color-mix(in_srgb,var(--text)_12%,transparent)]",
                        },
                      ]
                    : []),
                  {
                    icon: t("icon_verified", "verified"),
                    label: t("author_sanctuary_team", "Sanctuary Foundry"),
                    colorClass:
                      "text-[var(--text)] border-[color-mix(in_srgb,var(--text)_12%,transparent)]",
                  },
                ]}
              >
                <div className="flex flex-col gap-4 w-full">
                  {activeView === "post" && activePostRecord.imageUrl && (
                    <div className="w-full h-52 sm:h-64 rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                      <img
                        src={activePostRecord.imageUrl}
                        alt={activeTitle}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {renderReleaseInfoPanel(
                    activeDateStr,
                    activeVersion,
                    isDevActive,
                    activePlatformStr
                  )}
                </div>
              </SidePanelHeroCard>

              <UniversalGroup
                title={activeGroupTitle}
                icon={
                  activeView === "changelog"
                    ? t("icon_terminal", "terminal")
                    : t("icon_menu_book", "menu_book")
                }
              >
                <div className="flex-1 flex flex-col gap-6 min-w-0">
                  <StructuredReleaseNotesView content={activeMarkdownContent} />

                  {activeView === "post" && activePostRecord.codeSnippet && (
                    <pre className="w-full glass-surface rounded-2xl p-5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] overflow-x-auto custom-scrollbar">
                      <code>{activePostRecord.codeSnippet}</code>
                    </pre>
                  )}

                  {activeView === "post" && activePostRecord.pollData && (
                    <DispatchPollViewer
                      post={{
                        id: activePostRecord.id || `release-post-${activeChannel}`,
                        poll_data: activePostRecord.pollData,
                        _sourceTable: "keeper_system_broadcasts",
                      }}
                      userId={session?.user?.id || null}
                    />
                  )}
                </div>
              </UniversalGroup>
            </>
          )}
        </div>
      </SidePanel>

      {/* SidePanel: Reuse the Dispatch / Comm-Link Post Editor lazily only when Keeper editor opens */}
      {isKeepers && isEditorOpen && (
        <React.Suspense fallback={null}>
          <LazyReleaseNotesEditorDrawer
            isEditorOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            editorMode={editorMode}
            setEditorMode={setEditorMode}
            editorChannel={editorChannel}
            editorDocType={editorDocType}
            populateDraftForChannel={populateDraftForChannel}
            draftTitle={draftTitle}
            setDraftTitle={setDraftTitle}
            draftSummary={draftSummary}
            setDraftSummary={setDraftSummary}
            draftVersion={draftVersion}
            setDraftVersion={setDraftVersion}
            draftReleaseDate={draftReleaseDate}
            setDraftReleaseDate={setDraftReleaseDate}
            draftPlatform={draftPlatform}
            setDraftPlatform={setDraftPlatform}
            draftImageUrl={draftImageUrl}
            setDraftImageUrl={setDraftImageUrl}
            draftCodeSnippet={draftCodeSnippet}
            setDraftCodeSnippet={setDraftCodeSnippet}
            draftPollData={draftPollData}
            setDraftPollData={setDraftPollData}
            draftBody={draftBody}
            setDraftBody={setDraftBody}
            showCodeInput={showCodeInput}
            setShowCodeInput={setShowCodeInput}
            isAssetPanelOpen={isAssetPanelOpen}
            setIsAssetPanelOpen={setIsAssetPanelOpen}
            isSaving={isSaving}
            isPublishing={isPublishing}
            isDirty={isDirty}
            setIsDirty={setIsDirty}
            editorSyncSeq={editorSyncSeq}
            tiptapEditorRef={tiptapEditorRef}
            updateTimeoutRef={updateTimeoutRef}
            localMdBySlot={localMdBySlot}
            peerEditors={
              activePresence.peersByDocKey[
                getReleaseDocKey(editorChannel, editorDocType)
              ] || []
            }
            conflictServerInfo={conflictServerInfo}
            setConflictServerInfo={setConflictServerInfo}
            pendingPublishRef={pendingPublishRef}
            handleImportLocalReleaseMd={handleImportLocalReleaseMd}
            handleSaveKeepersPost={handleSaveKeepersPost}
            handleLoadLatestReleaseFromHub={handleLoadLatestReleaseFromHub}
            handleStartNewVersionDraft={handleStartNewVersionDraft}
            handleLinkAsset={handleLinkAsset}
          />
        </React.Suspense>
      )}
    </div>
  );
}

