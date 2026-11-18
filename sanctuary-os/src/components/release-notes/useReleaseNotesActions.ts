import React from "react";
import { useStore } from "../../store";
import { supabaseAuth } from "../../supabase";
import { getSafeEditorMarkdown } from "../../shared-components/stringUtils";
import {
  writeLocalDirectiveFile,
  markLocalDocSyncedHash,
  LocalDocSlug,
} from "../../utils/directivesSync";
import { isDesktop } from "../../utils/envUtils";
import {
  PUBLIC_CHANGELOG_BROADCAST_CATEGORY,
  DEV_CHANGELOG_BROADCAST_CATEGORY,
  KeepersReleasePostRecord,
} from "./releaseMarkdownParser";
import {
  parseSeedCommunityBlog,
  formatReleasePostToMarkdownFile,
  serializeReleasePostMessage,
  deserializeReleasePostRow,
} from "./releasePostSerializers";
import { ReleaseDocSlotKey } from "./releaseNotesShowcaseTypes";

export function useReleaseNotesActions({
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
}: any) {
  const handleImportLocalReleaseMd = () => {
    const slotKey: ReleaseDocSlotKey = `${editorChannel}:${editorDocType}` as ReleaseDocSlotKey;
    const localInfo = localMdBySlot[slotKey];
    if (!localInfo?.localContent || !localInfo.localContent.trim()) return;

    if (editorDocType === "changelog") {
      const nextBody = localInfo.localContent.trim();
      setDraftBody(nextBody);
      setEditorSyncSeq((n: any) => n + 1);
    } else {
      const parsed = parseSeedCommunityBlog(localInfo.localContent);
      if (parsed.mainTitle) setDraftTitle(parsed.mainTitle);
      if (parsed.summary) setDraftSummary(parsed.summary);
      if (parsed.version) setDraftVersion(parsed.version);
      if (parsed.releaseDate) setDraftReleaseDate(parsed.releaseDate);
      if (parsed.platform) setDraftPlatform(parsed.platform);
      const nextBody = (parsed.cleanBody || localInfo.localContent).trim();
      setDraftBody(nextBody);
      setEditorSyncSeq((n: any) => n + 1);
    }
    setIsDirty(true);
    useStore
      .getState()
      .pushStatus(
        t(
          "keeper_toast_imported_md",
          "Imported local .md into your draft — review and Save or Publish when ready."
        ),
        "info"
      );
  };

  const handleLoadLatestReleaseFromHub = async () => {
    const draftKey = getScopedReleaseDraftKey(editorChannel, editorDocType);
    setWayfinderDrafts((prev: any) => {
      if (!prev[draftKey]) return prev;
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
    setConflictServerInfo(null);
    setIsDirty(false);
    await loadPostsAndReleases(false, "hub_only");
    setTimeout(() => {
      populateDraftForChannel(editorChannel, editorDocType);
    }, 50);
    useStore
      .getState()
      .pushStatus(
        t(
          "keeper_toast_loaded_latest_hub",
          "Loaded latest version from Keepers Core."
        ),
        "info"
      );
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

    const activeEditor = tiptapEditorRef.current;
    if (activeEditor) {
      activeEditor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text,
          marks: [{ type: "link", attrs: { href: linkStr } }],
        })
        .insertContent(" ")
        .run();
    }
    setIsAssetPanelOpen(false);
  };

  const handlePublishChannel = async (
    channel: "stable" | "dev",
    e?: React.MouseEvent,
    overridePost?: KeepersReleasePostRecord,
    overrideCl?: string
  ) => {
    if (e) e.stopPropagation();
    setIsPublishing(true);
    try {
      const isDev = channel === "dev";
      const targetPost = overridePost || (isDev ? workingDevPost : workingPublicPost);
      const targetCl = overrideCl ?? (isDev ? workingDevChangelog : workingStableChangelog);
      const postCat = isDev ? "ReleasePost_Dev" : "ReleasePost_Public";
      const clCat = isDev
        ? DEV_CHANGELOG_BROADCAST_CATEGORY
        : PUBLIC_CHANGELOG_BROADCAST_CATEGORY;
      const nowIso = new Date().toISOString();

      const serializedPostMsg = serializeReleasePostMessage(targetPost);

      // 1. Publish Release Post row (reading current revision first)
      const { data: existingPostRow } = await supabaseAuth
        .from("keeper_system_broadcasts")
        .select("id, revision")
        .eq("category", postCat)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let postId = existingPostRow?.id || targetPost.id;
      let nextPostRev = Number(existingPostRow?.revision || 1) + 1;

      if (postId) {
        const { data: pubData } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .update({
            title: targetPost.title,
            description: targetPost.summary || null,
            message: serializedPostMsg,
            published_title: targetPost.title,
            published_description: targetPost.summary || null,
            published_message: serializedPostMsg,
            published_at: nowIso,
            updated_at: nowIso,
            updated_by: resolvedKeeperName,
            revision: nextPostRev,
          })
          .eq("id", postId)
          .select("id, revision");
        if (pubData?.[0]?.revision) nextPostRev = Number(pubData[0].revision);
      } else {
        nextPostRev = 1;
        const { data } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .insert({
            title: targetPost.title,
            description: targetPost.summary || null,
            category: postCat,
            target_audience: isDev ? "Dev" : "Public",
            message: serializedPostMsg,
            published_title: targetPost.title,
            published_description: targetPost.summary || null,
            published_message: serializedPostMsg,
            published_at: nowIso,
            updated_at: nowIso,
            updated_by: resolvedKeeperName,
            revision: 1,
            is_active: false,
            is_pinned: "false",
          })
          .select("id");
        if (data?.[0]?.id) postId = data[0].id;
      }

      // 2. Publish Changelog row
      const { data: existingClRow } = await supabaseAuth
        .from("keeper_system_broadcasts")
        .select("id, revision")
        .eq("category", clCat)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let clId = existingClRow?.id || (isDev ? devChangelogRowId : stableChangelogRowId);
      let nextClRev = Number(existingClRow?.revision || 1) + 1;

      if (clId) {
        const { data: clUpd } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .update({
            message: targetCl,
            published_message: targetCl,
            published_at: nowIso,
            updated_at: nowIso,
            updated_by: resolvedKeeperName,
            revision: nextClRev,
          })
          .eq("id", clId)
          .select("id, revision");
        if (clUpd?.[0]?.revision) nextClRev = Number(clUpd[0].revision);
      } else {
        nextClRev = 1;
        const { data } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .insert({
            title: isDev ? "Full Change Log (Dev)" : "Full Change Log (Stable)",
            description: isDev
              ? "Current Dev Build technical changelog"
              : "Running changelog across dev builds since last stable release",
            category: clCat,
            target_audience: isDev ? "Dev" : "Public",
            message: targetCl,
            published_title: isDev ? "Full Change Log (Dev)" : "Full Change Log (Stable)",
            published_message: targetCl,
            published_at: nowIso,
            updated_at: nowIso,
            updated_by: resolvedKeeperName,
            revision: 1,
            is_active: false,
            is_pinned: "false",
          })
          .select("id");
        if (data?.[0]?.id) clId = data[0].id;
      }

      // 3. Downstream Local .md Fallback Write + Content-Hash Mark ONLY ON PUBLISH
      if (isDesktop() || import.meta.env.DEV) {
        const postSlug: LocalDocSlug = isDev ? "release_notes_dev" : "release_notes_public";
        const clSlug: LocalDocSlug = isDev ? "changelog_dev" : "changelog_running";
        const postMd = formatReleasePostToMarkdownFile(targetPost);
        const clMd = `${targetCl.trim()}\n`;
        await Promise.all([
          writeLocalDirectiveFile(postSlug, postMd),
          writeLocalDirectiveFile(clSlug, clMd),
        ]);
        markLocalDocSyncedHash(postSlug, postMd);
        markLocalDocSyncedHash(clSlug, clMd);

        setLocalMdBySlot((prev: any) => ({
          ...prev,
          [`${channel}:post`]: {
            ...prev[`${channel}:post`],
            hasLocalChanges: false,
            localContent: postMd,
          },
          [`${channel}:changelog`]: {
            ...prev[`${channel}:changelog`],
            hasLocalChanges: false,
            localContent: clMd,
          },
        }));
      }

      setRevisionsBySlot((prev: any) => ({
        ...prev,
        [`${channel}:post`]: {
          revision: nextPostRev,
          updatedBy: resolvedKeeperName,
          updatedAt: nowIso,
        },
        [`${channel}:changelog`]: {
          revision: nextClRev,
          updatedBy: resolvedKeeperName,
          updatedAt: nowIso,
        },
      }));

      const nextPubPublished = isDev ? publishedPublicPost : { ...targetPost, id: postId };
      const nextDevPublished = isDev ? { ...targetPost, id: postId } : publishedDevPost;
      const nextStableClPublished = isDev ? publishedStableChangelog : targetCl;
      const nextDevClPublished = isDev ? targetCl : publishedDevChangelog;

      if (isDev) {
        setPublishedDevPost(nextDevPublished);
        setPublishedDevChangelog(nextDevClPublished);
        setDevChangelogRowId(clId);
      } else {
        setPublishedPublicPost(nextPubPublished);
        setPublishedStableChangelog(nextStableClPublished);
        setStableChangelogRowId(clId);
      }

      persistReleaseStateCache({
        workingPublicPost,
        publishedPublicPost: nextPubPublished,
        workingDevPost,
        publishedDevPost: nextDevPublished,
        workingStableChangelog,
        publishedStableChangelog: nextStableClPublished,
        workingDevChangelog,
        publishedDevChangelog: nextDevClPublished,
      });

      activePresence.broadcastDocSaved({
        docKey: getReleaseDocKey(channel, "post"),
        revision: nextPostRev,
        updatedBy: resolvedKeeperName,
        updatedAt: nowIso,
        published: true,
      });
      activePresence.broadcastDocSaved({
        docKey: getReleaseDocKey(channel, "changelog"),
        revision: nextClRev,
        updatedBy: resolvedKeeperName,
        updatedAt: nowIso,
        published: true,
      });

      window.dispatchEvent(
        new CustomEvent("keepers_release_posts_updated", {
          detail: { syncDirection: "hub_only" },
        })
      );
      useStore
        .getState()
        .pushStatus(
          t(
            "dir_toast_published_live",
            "Published live to {Citizens} and synced with local .md file!"
          ),
          "success"
        );
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveKeepersPost = async (
    publishLive = false,
    forceOverwrite = false
  ) => {
    pendingPublishRef.current = publishLive;
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
    let finalBody = draftBody;
    const activeEditor = tiptapEditorRef.current;
    if (activeEditor && !activeEditor.isDestroyed && editorMode === "wysiwyg") {
      finalBody = getSafeEditorMarkdown(activeEditor) || draftBody;
      setDraftBody(finalBody);
    }
    if (!finalBody.trim()) return;
    if (editorDocType === "post" && !draftTitle.trim()) return;

    setIsSaving(true);
    try {
      const isDev = editorChannel === "dev";
      const nowIso = new Date().toISOString();

      if (editorDocType === "changelog") {
        const clCat = isDev
          ? DEV_CHANGELOG_BROADCAST_CATEGORY
          : PUBLIC_CHANGELOG_BROADCAST_CATEGORY;
        const trimmedCl = finalBody.trim();

        const { data: currentClRow, error: clFetchErr } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .select("*")
          .eq("category", clCat)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (clFetchErr) {
          useStore
            .getState()
            .pushStatus(`Failed to check Changelog revision: ${clFetchErr.message}`, "error");
          return;
        }

        if (
          currentClRow &&
          !forceOverwrite &&
          baseRevision &&
          Number(currentClRow.revision || 1) !== baseRevision
        ) {
          setConflictServerInfo({
            baseRevision,
            serverRevision: Number(currentClRow.revision || 1),
            updatedBy: currentClRow.updated_by || "Keepers Core",
            updatedAt: currentClRow.updated_at || currentClRow.created_at,
            serverTitle: currentClRow.title,
            serverMarkdown: String(currentClRow.message || ""),
            localMarkdown: trimmedCl,
            isSaveBlocked: true,
          });
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

        const currentRev = Number(currentClRow?.revision || 1);
        const nextRev = currentClRow ? currentRev + 1 : 1;
        let clId = currentClRow?.id || (isDev ? devChangelogRowId : stableChangelogRowId);

        const clPayload: any = {
          title: isDev ? "Full Change Log (Dev)" : "Full Change Log (Stable)",
          description: isDev
            ? "Current Dev Build technical changelog"
            : "Running changelog across dev builds since last stable release",
          category: clCat,
          target_audience: isDev ? "Dev" : "Public",
          message: trimmedCl,
          updated_at: nowIso,
          updated_by: resolvedKeeperName,
          revision: nextRev,
          is_active: false,
          is_pinned: "false",
        };
        if (publishLive) {
          clPayload.published_title = clPayload.title;
          clPayload.published_description = clPayload.description;
          clPayload.published_message = trimmedCl;
          clPayload.published_at = nowIso;
        }

        if (clId && currentClRow) {
          let query = supabaseAuth
            .from("keeper_system_broadcasts")
            .update(clPayload)
            .eq("id", clId);
          if (!forceOverwrite) {
            query = query.eq("revision", currentRev);
          }
          const { data: updRows, error: updErr } = await query.select("*");
          if (updErr) {
            useStore
              .getState()
              .pushStatus(`Failed to save Changelog: ${updErr.message}`, "error");
            return;
          }
          if (!forceOverwrite && (!updRows || updRows.length === 0)) {
            const { data: latestRace } = await supabaseAuth
              .from("keeper_system_broadcasts")
              .select("*")
              .eq("id", clId)
              .maybeSingle();
            setConflictServerInfo({
              baseRevision,
              serverRevision: Number(latestRace?.revision || currentRev + 1),
              updatedBy: latestRace?.updated_by || "Keepers Core",
              updatedAt: latestRace?.updated_at || nowIso,
              serverTitle: latestRace?.title,
              serverMarkdown: String(latestRace?.message || ""),
              localMarkdown: trimmedCl,
              isSaveBlocked: true,
            });
            return;
          }
        } else {
          if (!publishLive) {
            clPayload.published_title = clPayload.title;
            clPayload.published_description = clPayload.description;
            clPayload.published_message = isDev
              ? publishedDevChangelog
              : publishedStableChangelog;
            clPayload.published_at = nowIso;
          }
          const { data, error: insErr } = await supabaseAuth
            .from("keeper_system_broadcasts")
            .insert(clPayload)
            .select("id");
          if (insErr) {
            useStore
              .getState()
              .pushStatus(`Failed to save Changelog: ${insErr.message}`, "error");
            return;
          }
          if (data?.[0]?.id) clId = data[0].id;
        }

        if (isDev) {
          setWorkingDevChangelog(trimmedCl);
          setDevChangelogRowId(clId);
          if (publishLive) setPublishedDevChangelog(trimmedCl);
        } else {
          setWorkingStableChangelog(trimmedCl);
          setStableChangelogRowId(clId);
          if (publishLive) setPublishedStableChangelog(trimmedCl);
        }

        const draftKey = getScopedReleaseDraftKey(editorChannel, "changelog");
        setWayfinderDrafts((prev: any) => {
          if (!prev[draftKey]) return prev;
          const next = { ...prev };
          delete next[draftKey];
          return next;
        });
        setConflictServerInfo(null);
        setIsDirty(false);
        setBaseRevision(nextRev);
        setRevisionsBySlot((prev: any) => ({
          ...prev,
          [`${editorChannel}:changelog`]: {
            revision: nextRev,
            updatedBy: resolvedKeeperName,
            updatedAt: nowIso,
          },
        }));

        if (publishLive) {
          await handlePublishChannel(editorChannel, undefined, undefined, trimmedCl);
        } else {
          persistReleaseStateCache({
            workingPublicPost,
            publishedPublicPost,
            workingDevPost,
            publishedDevPost,
            workingStableChangelog: isDev ? workingStableChangelog : trimmedCl,
            publishedStableChangelog,
            workingDevChangelog: isDev ? trimmedCl : workingDevChangelog,
            publishedDevChangelog,
          });
          activePresence.broadcastDocSaved({
            docKey: getReleaseDocKey(editorChannel, "changelog"),
            revision: nextRev,
            updatedBy: resolvedKeeperName,
            updatedAt: nowIso,
            published: false,
          });
          window.dispatchEvent(
            new CustomEvent("keepers_release_posts_updated", {
              detail: { syncDirection: "hub_only" },
            })
          );
          useStore
            .getState()
            .pushStatus(
              t(
                "dir_toast_staged_hub",
                "Saved shared draft to Keepers Core! Click Publish when ready to push live & sync .md."
              ),
              "success"
            );
        }
        setIsEditorOpen(false);
        return;
      }

      // Post mode: Save Shared Draft to Hub DB, and write local .md ONLY if Publish Live
      const targetCategory = isDev ? "ReleasePost_Dev" : "ReleasePost_Public";
      const sanitizedPoll =
        draftPollData &&
        draftPollData.question.trim() &&
        draftPollData.options.filter((o: any) => o.label.trim()).length >= 2
          ? {
              ...draftPollData,
              question: draftPollData.question.trim(),
              options: draftPollData.options
                .filter((o: any) => o.label.trim())
                .map((o: any) => ({ ...o, label: o.label.trim() })),
            }
          : null;

      const { data: currentPostRow, error: postFetchErr } = await supabaseAuth
        .from("keeper_system_broadcasts")
        .select("*")
        .eq("category", targetCategory)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (postFetchErr) {
        useStore
          .getState()
          .pushStatus(`Failed to check Release Post revision: ${postFetchErr.message}`, "error");
        return;
      }

      const existingId = currentPostRow?.id || (isDev ? workingDevPost.id : workingPublicPost.id);
      const nextRecord: KeepersReleasePostRecord = {
        id: existingId || null,
        title: draftTitle.trim(),
        summary: draftSummary.trim(),
        version: draftVersion.trim().replace(/^v/i, ""),
        releaseDate: draftReleaseDate.trim(),
        platform:
          draftPlatform.trim() ||
          t("release_notes_meta_platform_default", "Windows & macOS"),
        imageUrl: draftImageUrl.trim(),
        codeSnippet: draftCodeSnippet.trim(),
        pollData: sanitizedPoll,
        body: finalBody.trim(),
      };

      if (
        currentPostRow &&
        !forceOverwrite &&
        baseRevision &&
        Number(currentPostRow.revision || 1) !== baseRevision
      ) {
        const serverPost = deserializeReleasePostRow(
          currentPostRow,
          isDev ? defaultDevPost : defaultPublicPost,
          false
        );
        setConflictServerInfo({
          baseRevision,
          serverRevision: Number(currentPostRow.revision || 1),
          updatedBy: currentPostRow.updated_by || "Keepers Core",
          updatedAt: currentPostRow.updated_at || currentPostRow.created_at,
          serverTitle: currentPostRow.title,
          serverMarkdown: formatReleasePostToMarkdownFile(serverPost),
          localMarkdown: formatReleasePostToMarkdownFile(nextRecord),
          isSaveBlocked: true,
        });
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

      const serializedMessage = serializeReleasePostMessage(nextRecord);
      const currentRev = Number(currentPostRow?.revision || 1);
      const nextRev = currentPostRow ? currentRev + 1 : 1;

      const payload: any = {
        title: nextRecord.title,
        description: nextRecord.summary || null,
        category: targetCategory,
        target_audience: isDev ? "Dev" : "Public",
        message: serializedMessage,
        code_snippet: nextRecord.codeSnippet || null,
        poll_data: sanitizedPoll,
        updated_at: nowIso,
        updated_by: resolvedKeeperName,
        revision: nextRev,
        is_active: false,
        is_pinned: "false",
      };

      if (publishLive) {
        payload.published_title = nextRecord.title;
        payload.published_description = nextRecord.summary || null;
        payload.published_message = serializedMessage;
        payload.published_at = nowIso;
      }

      let savedId = existingId;
      let saveError: any = null;

      if (savedId && currentPostRow) {
        let query = supabaseAuth
          .from("keeper_system_broadcasts")
          .update(payload)
          .eq("id", savedId);
        if (!forceOverwrite) {
          query = query.eq("revision", currentRev);
        }
        const { data: updRows, error } = await query.select("*");
        saveError = error;
        if (!saveError && !forceOverwrite && (!updRows || updRows.length === 0)) {
          const { data: latestRace } = await supabaseAuth
            .from("keeper_system_broadcasts")
            .select("*")
            .eq("id", savedId)
            .maybeSingle();
          const serverPost = deserializeReleasePostRow(
            latestRace,
            isDev ? defaultDevPost : defaultPublicPost,
            false
          );
          setConflictServerInfo({
            baseRevision,
            serverRevision: Number(latestRace?.revision || currentRev + 1),
            updatedBy: latestRace?.updated_by || "Keepers Core",
            updatedAt: latestRace?.updated_at || nowIso,
            serverTitle: latestRace?.title,
            serverMarkdown: formatReleasePostToMarkdownFile(serverPost),
            localMarkdown: formatReleasePostToMarkdownFile(nextRecord),
            isSaveBlocked: true,
          });
          return;
        }
      } else {
        if (!publishLive) {
          const prevPub = isDev ? publishedDevPost : publishedPublicPost;
          payload.published_title = prevPub.title;
          payload.published_description = prevPub.summary || null;
          payload.published_message = serializeReleasePostMessage(prevPub);
          payload.published_at = nowIso;
        }
        const { data, error } = await supabaseAuth
          .from("keeper_system_broadcasts")
          .insert(payload)
          .select("id");
        saveError = error;
        if (data && data[0]?.id) {
          savedId = data[0].id;
        }
      }

      if (saveError) {
        useStore
          .getState()
          .pushStatus(`Failed to save Release Post: ${saveError.message}`, "error");
        return;
      }

      nextRecord.id = savedId || null;

      const nextWorkingPublic = isDev ? workingPublicPost : nextRecord;
      const nextWorkingDev = isDev ? nextRecord : workingDevPost;

      if (isDev) {
        setWorkingDevPost(nextRecord);
      } else {
        setWorkingPublicPost(nextRecord);
      }

      const draftKey = getScopedReleaseDraftKey(editorChannel, "post");
      setWayfinderDrafts((prev: any) => {
        if (!prev[draftKey]) return prev;
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });
      setConflictServerInfo(null);
      setIsDirty(false);
      setBaseRevision(nextRev);
      setRevisionsBySlot((prev: any) => ({
        ...prev,
        [`${editorChannel}:post`]: {
          revision: nextRev,
          updatedBy: resolvedKeeperName,
          updatedAt: nowIso,
        },
      }));

      if (publishLive) {
        await handlePublishChannel(editorChannel, undefined, nextRecord);
      } else {
        persistReleaseStateCache({
          workingPublicPost: nextWorkingPublic,
          publishedPublicPost,
          workingDevPost: nextWorkingDev,
          publishedDevPost,
          workingStableChangelog,
          publishedStableChangelog,
          workingDevChangelog,
          publishedDevChangelog,
        });
        activePresence.broadcastDocSaved({
          docKey: getReleaseDocKey(editorChannel, "post"),
          revision: nextRev,
          updatedBy: resolvedKeeperName,
          updatedAt: nowIso,
          published: false,
        });
        window.dispatchEvent(
          new CustomEvent("keepers_release_posts_updated", {
            detail: { syncDirection: "hub_only" },
          })
        );
        useStore
          .getState()
          .pushStatus(
            t(
              "dir_toast_staged_hub",
              "Saved shared draft to Keepers Core! Click Publish when ready to push live & sync .md."
            ),
            "success"
          );
      }
      setIsEditorOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshGitHubChangelog = async () => {
    setIsSyncing(true);
    try {
      await loadPostsAndReleases(true);
      useStore
        .getState()
        .pushStatus(
          t("release_notes_synced_toast", "Synced latest Release Notes & Changelog!"),
          "success"
        );
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    handleImportLocalReleaseMd,
    handleLoadLatestReleaseFromHub,
    handleLinkAsset,
    handlePublishChannel,
    handleSaveKeepersPost,
    handleRefreshGitHubChangelog,
  };
}
