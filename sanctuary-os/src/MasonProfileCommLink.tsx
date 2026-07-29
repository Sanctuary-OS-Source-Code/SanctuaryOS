import MasonPostCard from './MasonPostCard';

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
        <div className="text-[10px] text-[var(--subtext)] opacity-60 font-bold uppercase tracking-widest text-center mt-10">{t("no_posts")}</div>
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
