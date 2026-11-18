import { useStore } from "../../store";
import {
  extractPostImage,
  stripMarkdown,
  ActionButton,
  VAULT_CHIP_CLASS,
} from "../../shared";
import { UniversalCard } from "../../components/universal/UniversalCard";
import { openSanctuaryContextMenu } from "../../shared-components/ContextMenu";
import { LegalDocCategory, DirectiveSlug } from "../../utils/directivesSync";
import { isDesktop } from "../../utils/envUtils";
import { extractDirectiveBuilderSchema, getDefaultDirectiveBuilderSchema } from "../../utils/directivesBuilderSchema";
import { CATEGORY_TO_SLUG, SLUG_ICON_MAP } from "./directivesEditorConstants";

export function useDirectivesCardRenderers({
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
}: any) {
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

    const docKey = getDocKey("directive", slug);
    const scopedKey = getScopedDraftKey(docKey);
    const draftEntry = (wayfinderDrafts[scopedKey] ||
      wayfinderDrafts[post.id]) as any;
    const hasUnsavedEdits = Boolean(
      draftEntry &&
        !isStaleCanonicalDraft(scopedKey, draftEntry) &&
        draftEntry.isDirty &&
        draftEntry.userModified
    );
    const hasUnpublishedSync = Boolean(post.has_unpublished_changes);
    const hasLocalMdChanges = Boolean(
      (isDesktop() || import.meta.env.DEV) && post.has_local_md_changes
    );
    const peerList = presence.peersByDocKey[docKey] || [];
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
        className="h-full"
        onClick={() => openEditor(post, 0, "directive")}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("edit", "Edit"),
              icon: t("icon_edit", "edit"),
              onClick: () => openEditor(post, 0, "directive"),
            },
            ...(hasUnpublishedSync
              ? [
                  {
                    label: t("btn_publish", "Publish"),
                    icon: t("icon_publish", "publish"),
                    onClick: () => handlePublishDirectiveCard(post, e),
                  },
                ]
              : []),
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(effectiveSchema.title || post.title || ""),
            },
          ]);
        }}
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
            ) : hasUnpublishedSync ? (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_pending_actions", "pending_actions")}
                </span>
                <span>
                  {t("dir_status_staged_sync", "Synced • Unpushed")}
                </span>
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
            {hasUnpublishedSync && (
              <span className={`${VAULT_CHIP_CLASS} !border-[var(--warning)]/40 !text-[var(--warning)]`}>
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_pending_actions", "pending_actions")}
                </span>
                <span>
                  {t("dir_status_staged_sync", "Synced • Unpushed")}
                </span>
              </span>
            )}
            {hasLocalMdChanges && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_description", "description")}
                </span>
                <span>
                  {t("keeper_badge_local_md_ahead", "Local .md Modified")}
                </span>
              </span>
            )}
            {peerList.map((peer: any) => (
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
        }
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-wider truncate">
              {`${totalTabs} ${t("dir_builder_tabs_lbl", "Tabs")} • ${totalCards} ${t("dir_builder_cards_lbl", "Cards")}`}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {hasUnpublishedSync && (
                <button
                  type="button"
                  onClick={(e) => handlePublishDirectiveCard(post, e)}
                  disabled={isSubmitting || isSyncing}
                  className="px-2 py-0.5 rounded-md border border-[var(--warning)]/40 bg-transparent text-[9px] font-black uppercase tracking-wider text-[var(--warning)] hover:border-[var(--warning)] transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined !text-[11px]">
                    {t("icon_publish", "publish")}
                  </span>
                  <span>{t("btn_publish", "Publish")}</span>
                </button>
              )}
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1 shrink-0">
                {t("edit", "Edit")}
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 min-h-[2.5rem]">
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
    const isLive = post.is_active !== false;
    const docKey = getDocKey("news", undefined, post.id);
    const scopedKey = getScopedDraftKey(docKey);
    const hasUnsavedEdits = Boolean(
      (wayfinderDrafts[scopedKey] as any)?.isDirty ||
        (wayfinderDrafts[post.id] as any)?.isDirty
    );
    const peerList = presence.peersByDocKey[docKey] || [];

    return (
      <UniversalCard
        key={`news-${post.id}`}
        layout="vertical"
        className="h-full"
        onClick={() => openEditor(post, 0, "news")}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("edit", "Edit"),
              icon: t("icon_edit", "edit"),
              onClick: () => openEditor(post, 0, "news"),
            },
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(post.title || ""),
            },
          ]);
        }}
        image={extractedImage || undefined}
        icon={t("icon_newspaper", "newspaper")}
        bannerTopLabel={`${t("by_author", "By")} ${t("author_sanctuary_team", "Sanctuary Foundry")}`}
        bannerTopRightLabel={dateStr}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
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
          </div>
        }
        title={post.title}
        subtitle={`${t("by_author", "BY")} ${t("author_sanctuary_team", "Sanctuary Foundry")}`}
        badges={
          <>
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_category", "category")}
              </span>
              <span>{post.category || t("cat_announcement", "Announcement")}</span>
            </span>
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_public", "public")}
              </span>
              <span>{t("audience_global", "Global")}</span>
            </span>
            {hasUnsavedEdits && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_edit", "edit")}
                </span>
                <span>{t("action_unsaved_draft", "Draft")}</span>
              </span>
            )}
            {peerList.map((peer: any) => (
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
        <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 min-h-[2.5rem]">
          {post.description || cleanSnippet}
        </p>
      </UniversalCard>
    );
  };

  // Unified Vault-Standard Legal Document Card
  const renderLegalCard = (def: (typeof legalDefinitions)[0]) => {
    const legalCat = def.id as LegalDocCategory;
    const doc = legalDocsMap[legalCat];
    const lastUpdated =
      doc?.updated_at || doc?.created_at
        ? new Date(doc.updated_at || doc.created_at).toLocaleDateString()
        : t("never", "Default");
    const docKey = getDocKey("legal", legalCat);
    const scopedKey = getScopedDraftKey(docKey);
    const hasUnsavedEdits = Boolean((wayfinderDrafts[scopedKey] as any)?.isDirty);
    const hasUnpublishedSync = Boolean(doc?.has_unpublished_changes);
    const hasLocalMdChanges = Boolean(
      (isDesktop() || import.meta.env.DEV) && doc?.has_local_md_changes
    );
    const peerList = presence.peersByDocKey[docKey] || [];

    return (
      <UniversalCard
        key={`legal-${def.id}`}
        layout="vertical"
        className="h-full"
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
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("edit", "Edit"),
              icon: t("icon_edit", "edit"),
              onClick: () =>
                openEditor(
                  doc || {
                    id: `legal_${def.id}`,
                    category: def.id,
                    title: def.label,
                    message: "",
                  },
                  0,
                  "legal"
                ),
            },
            ...(hasUnpublishedSync
              ? [
                  {
                    label: t("btn_publish", "Publish"),
                    icon: t("icon_publish", "publish"),
                    onClick: () => handlePublishLegalCard(legalCat, doc, e),
                  },
                ]
              : []),
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(doc?.title || def.label || ""),
            },
          ]);
        }}
        icon={def.icon}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            {hasUnsavedEdits ? (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_edit", "edit")}
                </span>
                <span>{t("action_unsaved_draft", "Draft")}</span>
              </span>
            ) : hasUnpublishedSync ? (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_pending_actions", "pending_actions")}
                </span>
                <span>
                  {t("dir_status_staged_sync", "Synced • Unpushed")}
                </span>
              </span>
            ) : (
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
            )}
          </div>
        }
        title={doc?.title || def.label}
        subtitle={`${t("by_author", "BY")} ${t("author_sanctuary_team", "Sanctuary Foundry")}`}
        badges={
          <>
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {def.icon}
              </span>
              <span>{def.shortBadge}</span>
            </span>
            {hasUnpublishedSync && (
              <span className={`${VAULT_CHIP_CLASS} !border-[var(--warning)]/40 !text-[var(--warning)]`}>
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_pending_actions", "pending_actions")}
                </span>
                <span>
                  {t("dir_status_staged_sync", "Synced • Unpushed")}
                </span>
              </span>
            )}
            {hasLocalMdChanges && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_description", "description")}
                </span>
                <span>
                  {t("keeper_badge_local_md_ahead", "Local .md Modified")}
                </span>
              </span>
            )}
            {peerList.map((peer: any) => (
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
        }
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-wider truncate">
              {`${t("updated_date", "Updated")}: ${lastUpdated}`}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {hasUnpublishedSync && (
                <ActionButton
                  variant="warning"
                  className="!px-2 !py-0.5 !text-[9px]"
                  icon={t("icon_rocket_launch", "rocket_launch")}
                  onClick={(e) => handlePublishLegalCard(legalCat, doc, e)}
                  disabled={isSubmitting || isSyncing}
                >
                  {t("btn_publish", "Publish")}
                </ActionButton>
              )}
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1 shrink-0">
                {t("edit", "Edit")}
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_arrow_forward", "arrow_forward")}
                </span>
              </span>
            </div>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 min-h-[2.5rem]">
          {def.desc}
        </p>
      </UniversalCard>
    );
  };

  return {
    renderCanonicalDirectiveCard,
    renderNewsCard,
    renderLegalCard,
  };
}
