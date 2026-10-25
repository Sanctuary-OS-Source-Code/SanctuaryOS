import React from "react";
import { SidePanel, SidePanelHeroCard, UniversalGroup, EmptyState } from "../shared";
import { useLexicon } from "../LexiconContext";
import MasonPostCard from "../MasonPostCard";

export default function MasonRecentPostsSidePanel({ 
  isOpen, 
  onClose, 
  posts,
  onPostClick,
  onToggleLike,
  onOpenMasonProfile
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  posts: any[];
  onPostClick: (post: any) => void;
  onToggleLike: (post: any, e: React.MouseEvent) => void;
  onOpenMasonProfile: (masonId: string) => void;
}) {
  const { t } = useLexicon();

  return (
    <SidePanel 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t("feed_stat_replies", "Recent Transmissions")}
      subtitle={t("recent_transmissions_sub", "Latest comm-link posts across your network")}
      icon={t("icon_dynamic_feed", "dynamic_feed")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_dynamic_feed", "dynamic_feed")}
          overline={t("feed_stat_replies", "Recent Transmissions")}
          title={t("recent_transmissions_sub", "Latest Comm-Link Dispatches")}
          description={t("comm_link_quiet", "Browse the latest broadcasts and updates from followed creators.")}
          badge={`${posts.length}`}
          badgeIcon={t("icon_mail", "mail")}
          variant="accent"
        />

        <UniversalGroup
          title={t("feed_stat_replies", "Transmissions Feed")}
          icon={t("icon_dynamic_feed", "dynamic_feed")}
        >
          {posts.length === 0 ? (
            <EmptyState
              icon={t("icon_mail", "mail")}
              title={t("no_posts", "No Transmissions Found")}
              subtitle={t("comm_link_quiet", "Your comm-links are quiet.")}
              minHeightClass="min-h-[200px]"
            />
          ) : (
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
              {posts.map((post, index) => (
                <MasonPostCard
                  key={post.id}
                  post={post}
                  index={index}
                  onPostClick={onPostClick}
                  onToggleLike={onToggleLike}
                  onOpenMasonProfile={onOpenMasonProfile}
                  isFeatured={false}
                  isCompact={false}
                />
              ))}
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
