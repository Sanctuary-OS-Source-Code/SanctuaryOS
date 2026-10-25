import React from "react";
import { useLexicon } from "./LexiconContext";
import { stripMarkdown, renderTextWithIcons, HoverTooltip } from "./shared";
import { useStore } from "./store";
import { UniversalCard } from "./components/universal/UniversalCard";
import { extractDispatchMetadata } from "./components/universal/DispatchPollAndMeta";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function MasonPostCard({ post, index, onPostClick, onToggleLike, isFeatured, isCompact, layout, actions, hasUnsavedEdits }: any) {
  const { t } = useLexicon();

  const parsePostContent = (p: any) => {
    let content = p.content || p.message || '';
    let description = p.description || '';
    let imageUrl = p.image_url || '';
    let parsedAudience = p.target_audience || '';
    const imgMatch = content.match(/\[IMG:(.*?)\]/);
    if (imgMatch && imgMatch[1]) {
      imageUrl = imgMatch[1];
      content = content.replace(/\[IMG:.*?\]\s*/, '').trim();
    }
    if (p.mason_id === 'system' || p.category) {
      const meta = extractDispatchMetadata(p, content);
      content = meta.cleanContent;
      if (!parsedAudience && meta.audience) {
        parsedAudience = meta.audience;
      }
    }
    return { content, description, imageUrl, parsedAudience };
  };

  const { content, description, imageUrl, parsedAudience } = parsePostContent(post);
  const isNew = new Date(post.created_at).getTime() > Date.now() - 86400000;
  const hashtags = (content.match(/#[a-zA-Z0-9_]+/g) || []).slice(0, 3);

  const masonCommentDrafts = useStore(state => state.masonCommentDrafts);
  const hasUnsavedReply = !!masonCommentDrafts[post.id];
  const hasUnsaved = Boolean(hasUnsavedEdits || hasUnsavedReply);
  const isPinned = post.is_pinned === true || post.is_pinned === 'true';
  const hasPoll = Boolean(post.poll_data?.question);
  const isAlert = Boolean(post.category?.toLowerCase().includes('alert'));
  const showImage = !!imageUrl;

  const authorName = post.mason_id === 'system'
    ? (post.masons?.name || t("author_sanctuary_team", "Sanctuary Foundry"))
    : (post.masons?.name || t("unknown_architect", "Unknown Architect"));

  const topOverlayMeta = (() => {
    if (post.mason_id === 'system' && isPinned) {
      return {
        key: 'urgent',
        node: (
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">{t("icon_emergency", "emergency")}</span>
            <span>{t("category_urgent", "Urgent")}</span>
          </div>
        ),
      };
    }
    if (post.mason_id === 'system' && isAlert) {
      return {
        key: 'alert',
        node: (
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">{t("icon_warning", "warning")}</span>
            <span>{t("category_alert", "Alert")}</span>
          </div>
        ),
      };
    }
    if (isPinned) {
      return {
        key: 'pinned',
        node: (
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_keep", "keep")}</span>
            <span>{t("pinned", "Pinned")}</span>
          </div>
        ),
      };
    }
    if (hasPoll) {
      return {
        key: 'poll',
        node: (
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_poll", "poll")}</span>
            <span>{t("poll_badge_active", "Poll")}</span>
          </div>
        ),
      };
    }
    if (hasUnsaved) {
      return {
        key: 'unsaved',
        node: (
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_edit_note", "edit_note")}</span>
            <span>{t("unsaved", "Unsaved")}</span>
          </div>
        ),
      };
    }
    if (isNew) {
      return {
        key: 'new',
        node: (
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_new_releases", "new_releases")}</span>
            <span>{t("badge_new", "NEW")}</span>
          </div>
        ),
      };
    }
    if (post.is_active === false) {
      return {
        key: 'inactive',
        node: (
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">{t("icon_portable_wifi_off", "portable_wifi_off")}</span>
            <span>{t("tab_inactive", "Inactive")}</span>
          </div>
        ),
      };
    }
    return {
      key: 'active',
      node: (
        <div className={VAULT_CHIP_CLASS}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">{t("icon_cell_tower", "cell_tower")}</span>
          <span>{post.mason_id === 'system' ? t("dispatch", "Dispatch") : t("active", "Active")}</span>
        </div>
      ),
    };
  })();

  const badgeNodes = [
    post.category ? (
      <span key="category" className={VAULT_CHIP_CLASS}>
        <span className={`material-symbols-outlined !text-[12px] ${isAlert ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
          {isAlert ? t("icon_warning", "warning") : t("icon_category", "category")}
        </span>
        <span>{post.category}</span>
      </span>
    ) : null,
    (post.target_audience || parsedAudience) ? (() => {
      const rawAudiences = String(post.target_audience || parsedAudience || "")
        .split(",")
        .map((s) => {
          const trimmed = s.trim();
          return trimmed.toLowerCase() === "senior architects"
            ? t("role_oversight", "Oversight")
            : trimmed;
        })
        .filter(Boolean);
      const lowerSet = new Set(rawAudiences.map((a) => a.toLowerCase()));
      const hasAllRoles =
        lowerSet.has("citizens") &&
        lowerSet.has("masons") &&
        (lowerSet.has("oversight") || lowerSet.has("senior architects")) &&
        lowerSet.has("wayfinders");
      const isGlobalAudience =
        rawAudiences.length === 0 ||
        hasAllRoles ||
        rawAudiences.some((a) =>
          /^(all(\s+communities|\s+citizens|\s+roles|\s+users)?|global|public|everyone)$/i.test(a)
        );
      return (
        <span key="audience" className={`${VAULT_CHIP_CLASS} relative group/aud`}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
            {isGlobalAudience ? t("icon_public", "public") : t("icon_groups", "groups")}
          </span>
          <span>
            {isGlobalAudience
              ? t("audience_global", "Global")
              : t("audience_targeted", "Targeted Audience")}
          </span>
          {!isGlobalAudience && rawAudiences.length > 0 && (
            <HoverTooltip
              title={t("wf_target_audience", "Target Audience")}
              subtitle={rawAudiences.join(" • ")}
              icon={t("icon_groups", "groups")}
              delay={120}
            />
          )}
        </span>
      );
    })() : null,
    isPinned && topOverlayMeta.key !== 'pinned' && topOverlayMeta.key !== 'urgent' ? (
      <span key="pinned" className={VAULT_CHIP_CLASS}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_keep", "keep")}</span>
        <span>{t("pinned", "Pinned")}</span>
      </span>
    ) : null,
    hasPoll && topOverlayMeta.key !== 'poll' ? (
      <span key="poll" className={VAULT_CHIP_CLASS}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_poll", "poll")}</span>
        <span>{t("poll_badge_active", "Poll")}</span>
      </span>
    ) : null,
    hasUnsaved && topOverlayMeta.key !== 'unsaved' ? (
      <span key="unsaved" className={VAULT_CHIP_CLASS}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">{t("icon_edit_note", "edit_note")}</span>
        <span>{t("unsaved", "Unsaved")}</span>
      </span>
    ) : null,
    ...hashtags.map((tag: string) => (
      <span key={tag} className={VAULT_CHIP_CLASS}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">{t("icon_tag", "tag")}</span>
        <span className="text-[var(--subtext)]">{tag.replace(/^#/, "")}</span>
      </span>
    )),
  ].filter(Boolean);

  const footer = (
    <div className="flex items-center justify-between flex-wrap gap-y-3 w-full">
      <div className="flex items-center gap-4 text-[10px] font-mono font-bold text-[var(--subtext)] opacity-50 group-hover:opacity-100 transition-opacity">
        <span className="relative group/tooltip flex items-center gap-1.5 hover:text-[var(--text)] cursor-pointer">
          <span className="material-symbols-outlined !text-[16px]">{t("icon_visibility", "visibility")}</span> {(post.views?.[0]?.count || 0).toLocaleString()}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl text-[10px] font-black capitalize tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 pointer-events-none backdrop-blur-xl z-[100]">
            {t("ui.views", "Views")}
          </div>
        </span>
        <span className="relative group/tooltip flex items-center gap-1.5 hover:text-[var(--text)] cursor-pointer" onClick={(e) => onToggleLike && onToggleLike(e, post)}>
          <span className="material-symbols-outlined !text-[16px]">{t("icon_favorite", "favorite")}</span> {(post.likes?.[0]?.count || 0).toLocaleString()}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl text-[10px] font-black capitalize tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 pointer-events-none backdrop-blur-xl z-[100]">
            {t("ui_likes", "Likes")}
          </div>
        </span>
        <span className="relative group/tooltip flex items-center gap-1.5 hover:text-[var(--text)] cursor-pointer">
          <span className="material-symbols-outlined !text-[16px]">{t("icon_chat", "chat")}</span> {(post.comments?.[0]?.count || 0).toLocaleString()}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-[var(--sidebar)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl text-[10px] font-black capitalize tracking-widest text-[var(--text)] whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 pointer-events-none backdrop-blur-xl z-[100]">
            {t("ui.replies", "Replies")}
          </div>
        </span>
      </div>
      <span className="text-[9px] font-bold text-[var(--subtext)] opacity-50 font-mono tracking-widest">{new Date(post.created_at).toLocaleDateString()}</span>
    </div>
  );

  const imageOverlay = (
    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
      {topOverlayMeta.node}
    </div>
  );

  return (
    <UniversalCard
      layout={layout || (isCompact ? "vertical-compact" : "vertical")}
      title={post.title}
      subtitle={`${t("by_author", "BY")} ${authorName}`}
      image={showImage ? imageUrl : undefined}
      icon={!showImage ? t("icon_cell_tower", "cell_tower") : undefined}
      statusColor={isAlert ? 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[0_0_20px_rgba(239,68,68,0.1)]' : undefined}
      badges={badgeNodes.length > 0 ? <div className="flex flex-wrap gap-1.5">{badgeNodes}</div> : undefined}
      footer={footer}
      actions={actions}
      imageOverlay={imageOverlay}
      onClick={() => onPostClick(post)}
      className={isFeatured ? 'lg:col-span-2' : ''}
      style={{ animationFillMode: "both", animationDelay: `${(index % 10) * 100}ms` }}
    >
      <div className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
        {renderTextWithIcons(stripMarkdown(description || content))}
      </div>
    </UniversalCard>
  );
}
