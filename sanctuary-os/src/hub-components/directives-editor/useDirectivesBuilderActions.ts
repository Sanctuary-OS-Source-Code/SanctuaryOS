import React from "react";
import { supabaseAuth } from "../../supabase";
import { useStore } from "../../store";
import { logArchitectAction } from "../../lib/audit";
import {
  CANONICAL_DIRECTIVES,
  CANONICAL_LEGAL_DOCS,
  LegalDocCategory,
  DirectiveSlug,
  saveDirectiveWithConcurrency,
  publishDirectiveToUsers,
  publishLegalDocToUsers,
  readAllLocalDocSnapshots,
  hashNormalizedDoc,
} from "../../utils/directivesSync";
import {
  DirectiveBuilderCard,
  DirectiveBuilderSubCard,
  extractDirectiveBuilderSchema,
  parseMarkdownToDirectiveSchema,
  stripDirectiveBuilderComment,
  embedDirectiveBuilderSchema,
  compileDirectiveSchemaToMarkdown,
  getDefaultDirectiveBuilderSchema,
} from "../../utils/directivesBuilderSchema";
import { CATEGORY_TO_SLUG } from "./directivesEditorConstants";

export function useDirectivesBuilderActions({
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
}: any) {
  const handleDiscardChanges = () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      setTimeout(() => setConfirmDiscard(false), 3000);
      return;
    }
    const scopedDraftId = getScopedDraftKey(activeDocKey);
    const legacyDraftId = editingPostId || `new_${editingRecordKind}`;
    setIsDirty(false);
    setConflictServerRow(null);
    setIsConflictSaveBlocked(false);
    setWayfinderDrafts((prev: any) => {
      const next = { ...prev };
      delete next[scopedDraftId];
      delete next[activeDocKey];
      delete next[legacyDraftId];
      if (editingPostId) delete next[editingPostId];
      delete next["new"];
      delete next[`new_${editingRecordKind}`];
      return next;
    });
    setConfirmDiscard(false);
    if (editingPost) {
      openEditor(editingPost, activeBuilderTabIdx, editingRecordKind);
    } else {
      closeEditor();
    }
  };

  const handleImportLocalMdToDraft = () => {
    const localRaw = editingPost?.local_md_content;
    if (!localRaw || !String(localRaw).trim()) return;
    const cleanMd = stripDirectiveBuilderComment(String(localRaw));
    setContent(cleanMd);
    setEditorContentSilently(cleanMd);

    if (editingRecordKind === "directive" && activeCanonicalSlug) {
      const parsedSchema =
        extractDirectiveBuilderSchema(
          String(localRaw),
          activeCanonicalSlug,
          t
        ) || parseMarkdownToDirectiveSchema(cleanMd, activeCanonicalSlug, t);
      if (parsedSchema) {
        setBuilderSchema({
          ...parsedSchema,
          isActive: parsedSchema.isActive !== false,
        });
        if (parsedSchema.title) setTitle(parsedSchema.title);
        if (parsedSchema.summary) setDescription(parsedSchema.summary);
        setIsVisualBuilderModified(false);
      }
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

  const handleLoadLatestFromHub = () => {
    if (!conflictServerRow) return;
    const scopedDraftId = getScopedDraftKey(activeDocKey);
    setWayfinderDrafts((prev: any) => {
      const next = { ...prev };
      delete next[scopedDraftId];
      if (editingPostId) delete next[editingPostId];
      return next;
    });
    applyServerSnapshotToEditor(conflictServerRow, editingRecordKind);
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

  const handleOverwriteHubWithMine = async () => {
    await handleSubmit(undefined, pendingPublishIntentRef.current, true);
  };

  const handleResetBuilderToDefault = async () => {
    if (!activeCanonicalSlug) return;
    const docKey = getDocKey("directive", activeCanonicalSlug);
    const scopedDraftId = getScopedDraftKey(docKey);
    setWayfinderDrafts((prev: any) => {
      const next = { ...prev };
      delete next[scopedDraftId];
      delete next[activeCanonicalSlug];
      return next;
    });
    const localSnaps = await readAllLocalDocSnapshots();
    const rawSource =
      localSnaps[activeCanonicalSlug]?.content ||
      (CANONICAL_DIRECTIVES as any)[activeCanonicalSlug]?.bundledContent ||
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
    setConflictServerRow(null);
    setIsConflictSaveBlocked(false);

    const meta = (CANONICAL_DIRECTIVES as any)[activeCanonicalSlug];
    const saveRes = await saveDirectiveWithConcurrency({
      slug: activeCanonicalSlug,
      title: freshSchema.title,
      summary: freshSchema.summary || meta?.summary || "",
      category: meta?.category || category,
      content: embedDirectiveBuilderSchema(cleanMd, freshSchema),
      updated_by: wayfinderName,
      publishLive: false,
      forceOverwrite: true,
    });
    if (saveRes.ok) {
      const nextRev = Number(saveRes.row?.revision || baseRevision + 1);
      setBaseRevision(nextRev);
      setBaseUpdatedAt(saveRes.row?.updated_at || new Date().toISOString());
      setBaseContentHash(hashNormalizedDoc(saveRes.row?.content || cleanMd));
      presence.broadcastDocSaved({
        docKey,
        revision: nextRev,
        updatedBy: wayfinderName,
        updatedAt: saveRes.row?.updated_at || new Date().toISOString(),
        published: false,
      });
    }
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
    setIsVisualBuilderModified(true);
    setBuilderSchema((prev: any) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab: any, tIdx: any) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card: any, cIdx: any) =>
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
    setIsVisualBuilderModified(true);
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

    setBuilderSchema((prev: any) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab: any, i: any) =>
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
    setIsVisualBuilderModified(true);

    setBuilderSchema((prev: any) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab: any, i: any) => {
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
    setIsVisualBuilderModified(true);

    setBuilderSchema((prev: any) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab: any, i: any) => {
        if (i !== tabIdx) return tab;
        return {
          ...tab,
          cards: tab.cards.filter((_: any, idx: any) => idx !== cardIdx),
        };
      });
      return { ...prev, tabs: nextTabs };
    });
    setSelectedBuilderCardIdx(Math.max(0, cardIdx - 1));
    setEditingSubCardIdx(null);
  };

  const handleAddSubCard = (tabIdx: number, cardIdx: number) => {
    setIsDirty(true);
    setIsVisualBuilderModified(true);
    const currentCount =
      builderSchema?.tabs?.[tabIdx]?.cards?.[cardIdx]?.subCards?.length || 0;
    const isRoadmap = activeCanonicalSlug === "phase_roadmap";
    const newSub: DirectiveBuilderSubCard = {
      id: `sub_${Date.now()}`,
      icon: isRoadmap
        ? t("icon_rocket_launch", "rocket_launch")
        : t("icon_check_circle", "check_circle"),
      title: t("dir_builder_subcard_title_ph", "Info block title..."),
      desc: t("dir_builder_subcard_desc_ph", "Concise description..."),
      pending: isRoadmap ? true : false,
      roadmapStatus: isRoadmap ? "in_progress" : undefined,
    };
    setBuilderSchema((prev: any) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab: any, tIdx: any) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card: any, cIdx: any) =>
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
    setIsVisualBuilderModified(true);
    setBuilderSchema((prev: any) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab: any, tIdx: any) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card: any, cIdx: any) => {
          if (cIdx !== cardIdx) return card;
          const nextSubs = (card.subCards || []).map((sub: any, sIdx: any) =>
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
    setIsVisualBuilderModified(true);
    setBuilderSchema((prev: any) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab: any, tIdx: any) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card: any, cIdx: any) => {
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
    setIsVisualBuilderModified(true);
    setBuilderSchema((prev: any) => {
      if (!prev) return prev;
      const nextTabs = prev.tabs.map((tab: any, tIdx: any) => {
        if (tIdx !== tabIdx) return tab;
        const nextCards = tab.cards.map((card: any, cIdx: any) => {
          if (cIdx !== cardIdx) return card;
          return {
            ...card,
            subCards: (card.subCards || []).filter(
              (_: any, sIdx: any) => sIdx !== subIdx
            ),
          };
        });
        return { ...tab, cards: nextCards };
      });
      return { ...prev, tabs: nextTabs };
    });
    setEditingSubCardIdx(null);
  };

  const handlePublishDirectiveCard = async (
    post: any,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    const slug = (post.slug ||
      CATEGORY_TO_SLUG[post.category] ||
      "phase_roadmap") as DirectiveSlug;
    setIsSubmitting(true);
    try {
      const pubRes = await publishDirectiveToUsers(slug, wayfinderName, {
        expectedRevision: post.revision ? Number(post.revision) : undefined,
      });
      if (pubRes.conflict) {
        useStore
          .getState()
          .pushStatus(
            t(
              "keeper_toast_conflict_open_editor",
              "Another Keeper saved a newer revision — open the editor to review before publishing."
            ),
            "warning"
          );
        await fetchPostsAndAssets(false);
        openEditor(pubRes.serverRow || post, 0, "directive");
        return;
      }
      if (pubRes.ok && !pubRes.error) {
        const meta = CANONICAL_DIRECTIVES[slug];
        const nextRev = Number(pubRes.row?.revision || post.revision || 1);
        await logArchitectAction(
          "Published System Directive Live (User Side)",
          "system_directives",
          `${post.title} (${meta?.file_path || slug})`,
          undefined,
          "Keepers Core",
          true,
          {
            slug: { to: slug },
            title: { to: post.title },
            published_live: { to: true },
          }
        );
        presence.broadcastDocSaved({
          docKey: getDocKey("directive", slug),
          revision: nextRev,
          updatedBy: wayfinderName,
          updatedAt: pubRes.row?.updated_at || new Date().toISOString(),
          published: true,
        });
        window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
        await fetchPostsAndAssets(true);
        useStore
          .getState()
          .pushStatus(
            t(
              "dir_toast_published_live",
              "Published live to {Citizens} and synced with local .md file!"
            ),
            "success"
          );
      } else {
        useStore
          .getState()
          .pushStatus(
            `Failed to publish: ${pubRes.error?.message || "Unknown error"}`,
            "error"
          );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishLegalCard = async (
    legalCat: LegalDocCategory,
    doc: any,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setIsSubmitting(true);
    try {
      const pubRes = await publishLegalDocToUsers(legalCat, wayfinderName, {
        expectedRevision: doc?.revision ? Number(doc.revision) : undefined,
      });
      if (pubRes.conflict) {
        useStore
          .getState()
          .pushStatus(
            t(
              "keeper_toast_conflict_open_editor",
              "Another Keeper saved a newer revision — open the editor to review before publishing."
            ),
            "warning"
          );
        await fetchPostsAndAssets(false);
        openEditor(pubRes.serverRow || doc || { category: legalCat }, 0, "legal");
        return;
      }
      if (pubRes.ok && !pubRes.error) {
        const meta = CANONICAL_LEGAL_DOCS[legalCat];
        const nextRev = Number(pubRes.row?.revision || doc?.revision || 1);
        await logArchitectAction(
          "Published Legal & Covenant Doc Live (User Side)",
          "keeper_system_broadcasts",
          `${doc?.title || meta?.title || legalCat} (${meta?.file_path || legalCat})`,
          undefined,
          "Keepers Core",
          true,
          {
            category: { to: legalCat },
            title: { to: doc?.title || meta?.title },
            published_live: { to: true },
          }
        );
        presence.broadcastDocSaved({
          docKey: getDocKey("legal", legalCat),
          revision: nextRev,
          updatedBy: wayfinderName,
          updatedAt: pubRes.row?.updated_at || new Date().toISOString(),
          published: true,
        });
        window.dispatchEvent(new CustomEvent("sanctuary_directives_updated"));
        await fetchPostsAndAssets(true);
        useStore
          .getState()
          .pushStatus(
            t(
              "dir_toast_published_live",
              "Published live to {Citizens} and synced with local .md file!"
            ),
            "success"
          );
      } else {
        useStore
          .getState()
          .pushStatus(
            `Failed to publish: ${pubRes.error?.message || "Unknown error"}`,
            "error"
          );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const postToDelete = newsPosts.find((p: any) => p.id === id);
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

  return {
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
  };
}
