import React from "react";
import { SidePanel } from "../shared";
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
        title={t("feed_stat_replies") || "Recent Posts"}
        subtitle={t("recent_transmissions_sub") || "COMM-LINK DISPATCHES"}
        icon={t("icon_dynamic_feed") || "dynamic_feed"}
        widthClass="w-[1000px]"
    >
        <div className="flex flex-col gap-6 w-full pb-8">
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                {posts.length === 0 ? (
                    <div className="flex flex-col justify-center items-center h-64 theme-glass-panel rounded-[var(--radius)] border border-white/5 shadow-xl group col-span-2">
                        <span className="text-6xl mb-4 grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12">{t("icon_mail")}</span>
                        <span className="text-sm font-black text-[var(--subtext)] uppercase tracking-widest text-center px-8 leading-relaxed">
                            {t("no_posts") || "No posts found."}
                        </span>
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-50 uppercase tracking-widest mt-2">
                            {t("comm_link_quiet") || "Awaiting signals."}
                        </span>
                    </div>
                ) : (
                    posts.map((post, index) => (
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
                    ))
                )}
            </div>
        </div>
    </SidePanel>
  );
}
