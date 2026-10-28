import MasonPostCard from './MasonPostCard';
import { EmptyState } from './shared';

export default function MasonProfileCommLink({ posts, modSearch, handlePostClick, handleToggleLike, t }: any) {
  const filteredPosts = posts.filter((p: any) => {
    if (!modSearch) return true;
    const q = modSearch.toLowerCase();
    return (
      (p.title || "").toLowerCase().includes(q) ||
      (p.content || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      {filteredPosts.length === 0 ? (
        <EmptyState icon={t("icon_satellite_alt", "satellite_alt")} title={t("no_posts", "No Transmissions Found")} minHeightClass="min-h-[300px]" />
      ) : (
        <div className="columns-1 lg:columns-2 xl:columns-3 gap-6 space-y-6">
          {filteredPosts.map((p: any, index: number) => (
            <div key={p.id} className="break-inside-avoid">
              <MasonPostCard
                post={p}
                index={index}
                onPostClick={handlePostClick}
                onToggleLike={handleToggleLike}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
