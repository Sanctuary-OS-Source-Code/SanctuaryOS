import React, { useState, useEffect } from "react";
import { SidePanel, SidePanelHeroCard, UniversalGroup, EmptyState } from "../shared";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";

export default function MasonFollowingSidePanel({ 
  isOpen, 
  onClose,
  userId,
  onOpenMasonProfile
}: { 
  isOpen: boolean; 
  onClose: () => void;
  userId: string | null;
  onOpenMasonProfile: (masonId: string) => void;
}) {
  const { t } = useLexicon();
  const [loading, setLoading] = useState(false);
  const [masons, setMasons] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && userId) {
      const fetchFollowing = async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from('mason_followers')
          .select('mason_id, masons(*)')
          .eq('user_id', userId);
        
        if (error) {
          console.error("Failed to fetch followed masons:", error);
        } else if (data) {
          const fetchedMasons = data.map(d => d.masons).filter(Boolean);
          setMasons(fetchedMasons);
        }
        setLoading(false);
      };
      fetchFollowing();
    } else {
      setMasons([]);
    }
  }, [isOpen, userId]);

  return (
    <SidePanel 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t("feed_stat_network", "Your Network")}
      subtitle={t("network_subtitle", "Masons you are following")}
      icon={t("icon_group", "group")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_group", "group")}
          overline={t("feed_stat_network", "Your Network")}
          title={t("network_subtitle", "Masons you are following")}
          description={t("recent_transmissions_sub", "Direct access to creators and comm-link channels in your network.")}
          badge={`${masons.length}`}
          badgeIcon={t("icon_groups", "groups")}
          variant="accent"
        />

        <UniversalGroup
          title={t("feed_stat_network", "Followed Creators")}
          icon={t("icon_groups", "groups")}
        >
          {loading ? (
            <div className="glass-surface rounded-xl px-4 py-10 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center gap-2 opacity-70">
              <span className="material-symbols-outlined animate-spin !text-[18px] text-[var(--accent)]">
                {t("icon_sync", "sync")}
              </span>
              <span className="text-xs font-black uppercase tracking-widest text-[var(--subtext)]">
                {t("loading", "Loading...")}
              </span>
            </div>
          ) : masons.length === 0 ? (
            <EmptyState
              icon={t("icon_groups", "groups")}
              title={t("no_masons_followed", "You aren't following anyone yet.")}
              subtitle={t("comm_link_quiet", "Your comm-links are quiet.")}
              minHeightClass="min-h-[200px]"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {masons.map((mason) => (
                <div 
                  key={mason.id} 
                  onClick={() => {
                    onClose();
                    onOpenMasonProfile(mason.id);
                  }}
                  className="flex items-center gap-3.5 px-4 py-3 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] cursor-pointer transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-transparent shrink-0 overflow-hidden border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center text-[var(--accent)]">
                    {mason.avatar_url ? (
                      <img src={mason.avatar_url} alt={mason.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined !text-[20px]">
                        {t("icon_person", "person")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
                      {mason.name || mason.username || t("status_unknown", "Unknown")}
                    </span>
                    {mason.tagline && (
                      <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 truncate">
                        {mason.tagline}
                      </span>
                    )}
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_chevron_right", "chevron_right")}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
